import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import { DB } from '../db/db.module.js';
import type { Database } from '../db/db.module.js';
import { sessions } from '../db/schema/index.js';
import { generateOpaqueToken, hashOpaqueToken } from '../common/tokens.util.js';
import { REFRESH_TOKEN_TTL_MS } from './session-cookie.js';
import { AuditLogService } from '../audit/audit-log.service.js';

export interface DeviceInfo {
  userAgent?: string;
  ipAddress?: string;
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
}

export interface SessionSummary {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
}

/**
 * Motivo por el que una sesión quedó revocada. Distinguirlo importa: solo
 * `ROTATED` (un refresh token sustituido por uno más nuevo) es señal de robo
 * si se reutiliza — el resto son cierres de sesión legítimos iniciados por el
 * propio usuario o por el sistema, y reutilizar ese token después (p. ej. una
 * pestaña que aún no se ha enterado del logout hecho en otra) no debe
 * desencadenar la respuesta de "revocar todo lo demás". Ver `rotate()`.
 */
export type SessionRevokedReason =
  | 'ROTATED'
  | 'LOGOUT'
  | 'USER_REVOKED'
  | 'PASSWORD_RESET'
  | 'PASSWORD_CHANGED'
  | 'REUSE_DETECTED';

/**
 * Toda la gestión de `sessions` (creación, rotación, revocación) vive aquí,
 * no en AuthService, porque la reutilizarán el login (grupo 3), Google OAuth
 * (grupo 4) y "mis sesiones" (grupo 6) — y porque es el punto donde se
 * cumple la regla de aislamiento de la constitution: nunca se opera sobre
 * una sesión sin comprobar también su `userId`.
 */
@Injectable()
export class SessionsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly jwt: JwtService,
    private readonly auditLog: AuditLogService,
  ) {}

  async issueForUser(userId: string, device: DeviceInfo): Promise<IssuedTokens> {
    const { plaintext, hash } = generateOpaqueToken();

    await this.db.insert(sessions).values({
      userId,
      refreshTokenHash: hash,
      userAgent: device.userAgent,
      ipAddress: device.ipAddress,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    });

    const accessToken = await this.jwt.signAsync({ sub: userId });
    return { accessToken, refreshToken: plaintext };
  }

  /**
   * Rota el refresh token (plan.md §4/§7). Si el token presentado ya estaba
   * revocado, la respuesta depende de POR QUÉ lo estaba (grupo 6 — antes de
   * distinguir el motivo, esto tenía un bug real: cerrar sesión en un
   * dispositivo, o revocar una sesión concreta desde "mis sesiones", dejaba
   * ese refresh token marcado como revocado; la primera vez que alguien
   * volvía a intentar refrescar con él, se interpretaba como robo y se
   * revocaban TODAS las demás sesiones del usuario — cerrando de golpe
   * dispositivos que no tenían nada que ver. Ver constitution.md):
   * - `ROTATED` (ya fue sustituido por un token más nuevo en una rotación
   *   anterior): sí es señal real de robo — se revocan todas las sesiones.
   * - Cualquier otro motivo (logout, revocación manual, reset de
   *   contraseña): esta sesión concreta ya había terminado de forma
   *   legítima; se rechaza la petición sin tocar el resto de sesiones.
   */
  async rotate(refreshTokenPlaintext: string, device: DeviceInfo): Promise<IssuedTokens> {
    const hash = hashOpaqueToken(refreshTokenPlaintext);
    const session = await this.db.query.sessions.findFirst({ where: eq(sessions.refreshTokenHash, hash) });

    if (!session) {
      throw new UnauthorizedException('Sesión inválida.');
    }
    if (session.revokedAt) {
      if (session.revokedReason === 'ROTATED') {
        await this.revokeAllForUser(session.userId, 'REUSE_DETECTED');
      }
      throw new UnauthorizedException('Sesión inválida. Vuelve a iniciar sesión.');
    }
    if (session.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('La sesión ha caducado. Vuelve a iniciar sesión.');
    }

    await this.db
      .update(sessions)
      .set({ revokedAt: new Date(), revokedReason: 'ROTATED' })
      .where(eq(sessions.id, session.id));
    return this.issueForUser(session.userId, device);
  }

  /** Revoca una sesión concreta, solo si pertenece al usuario indicado (aislamiento). Usado por logout. */
  async revokeByRefreshToken(refreshTokenPlaintext: string, userId: string): Promise<void> {
    const hash = hashOpaqueToken(refreshTokenPlaintext);
    await this.db
      .update(sessions)
      .set({ revokedAt: new Date(), revokedReason: 'LOGOUT' })
      .where(and(eq(sessions.refreshTokenHash, hash), eq(sessions.userId, userId)));
  }

  /**
   * Igual que arriba, pero por id de sesión (lo usa "mis sesiones", grupo 6,
   * H6). Es el único cierre de sesión que se registra en `audit_logs`
   * (grupo 9, T9.1, acción `session_revoked`): un cierre explícito de "este
   * dispositivo" es la señal con valor real para una futura auditoría —
   * a diferencia del logout normal (`revokeByRefreshToken`) o de una
   * rotación rutinaria (`rotate`), que son ciclo de vida esperado, no
   * eventos de seguridad.
   */
  async revokeById(sessionId: string, userId: string): Promise<boolean> {
    const result = await this.db
      .update(sessions)
      .set({ revokedAt: new Date(), revokedReason: 'USER_REVOKED' })
      .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)))
      .returning({ id: sessions.id });

    const revoked = result.length > 0;
    if (revoked) {
      await this.auditLog.record('session_revoked', { userId });
    }
    return revoked;
  }

  /**
   * Revoca todas las sesiones de un usuario. Requiere el motivo explícito:
   * lo usa tanto la detección de robo (`rotate()`, con `REUSE_DETECTED`) como
   * el reset de contraseña (`AuthService.resetPassword`, con
   * `PASSWORD_RESET`) y el cambio de contraseña autenticado
   * (`UsersService.changePassword`, con `PASSWORD_CHANGED`) — casos con
   * implicaciones muy distintas para quien audite `audit_logs`.
   *
   * Solo `REUSE_DETECTED` (robo real detectado, ver `rotate()`) se registra
   * aquí como `session_revoked` (grupo 9, T9.1): las revocaciones masivas por
   * `PASSWORD_RESET`/`PASSWORD_CHANGED` ya quedan cubiertas por sus propios
   * eventos de auditoría (`password_reset`/`password_changed`, registrados
   * en el servicio que las dispara) — registrar además una fila de
   * `session_revoked` por cada sesión cerrada sería ruido redundante, no
   * información nueva.
   */
  async revokeAllForUser(userId: string, reason: SessionRevokedReason): Promise<void> {
    await this.db.update(sessions).set({ revokedAt: new Date(), revokedReason: reason }).where(eq(sessions.userId, userId));

    if (reason === 'REUSE_DETECTED') {
      await this.auditLog.record('session_revoked', { userId });
    }
  }

  /**
   * H6 (spec 001), criterio 2. Nunca se expone `refreshTokenHash` — no hay
   * ningún motivo para que el cliente lo vea, ni siquiera hasheado.
   *
   * Nota sobre `lastUsedAt`: no se actualiza en cada petición autenticada
   * (el access token no lleva el id de sesión, no hay forma barata de saber
   * a qué `Session` pertenece una petición dada sin añadir esa información al
   * JWT — mejora anotada para un futuro incremento). En su lugar, cada
   * rotación de refresh token (cada ~15 min de uso activo, vía `rotate()`)
   * sustituye la fila por una nueva con `createdAt`/`lastUsedAt` frescos —
   * así que, para una sesión activa, esta columna sí refleja con precisión
   * razonable "la última vez que este dispositivo confirmó estar vivo".
   *
   * Nota: esta lista no marca cuál es "la sesión actual". Hacerlo bien
   * requeriría poder identificar, desde una petición autenticada, a qué
   * `Session` pertenece — y hoy el access token (JWT) no lleva el id de
   * sesión. Se consideró usar la cookie de refresh para inferirlo, pero esa
   * cookie tiene `path: '/auth'` (a propósito, para minimizar superficie
   * CSRF — ver `session-cookie.ts`) y por tanto nunca llega a
   * `/users/me/sessions`; añadir esa marca de forma fiable implicaría meter
   * el id de sesión en el JWT, cambio que se deja anotado como mejora futura
   * en vez de hacerse a medias aquí.
   */
  async listActiveForUser(userId: string): Promise<SessionSummary[]> {
    const rows = await this.db
      .select()
      .from(sessions)
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())))
      .orderBy(desc(sessions.lastUsedAt));

    return rows.map((row) => ({
      id: row.id,
      userAgent: row.userAgent,
      ipAddress: row.ipAddress,
      createdAt: row.createdAt,
      lastUsedAt: row.lastUsedAt,
      expiresAt: row.expiresAt,
    }));
  }
}
