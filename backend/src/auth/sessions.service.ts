import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { and, eq } from 'drizzle-orm';
import { DB } from '../db/db.module.js';
import type { Database } from '../db/db.module.js';
import { sessions } from '../db/schema/index.js';
import { generateOpaqueToken, hashOpaqueToken } from '../common/tokens.util.js';
import { REFRESH_TOKEN_TTL_MS } from './session-cookie.js';

export interface DeviceInfo {
  userAgent?: string;
  ipAddress?: string;
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
}

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
   * Rota el refresh token (plan.md §4/§7): si el token presentado ya estaba
   * revocado (reutilización de un token viejo, señal de robo), se revocan
   * TODAS las sesiones del usuario y se rechaza — no solo esa sesión.
   */
  async rotate(refreshTokenPlaintext: string, device: DeviceInfo): Promise<IssuedTokens> {
    const hash = hashOpaqueToken(refreshTokenPlaintext);
    const session = await this.db.query.sessions.findFirst({ where: eq(sessions.refreshTokenHash, hash) });

    if (!session) {
      throw new UnauthorizedException('Sesión inválida.');
    }
    if (session.revokedAt) {
      await this.revokeAllForUser(session.userId);
      throw new UnauthorizedException('Sesión inválida. Vuelve a iniciar sesión.');
    }
    if (session.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('La sesión ha caducado. Vuelve a iniciar sesión.');
    }

    await this.db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, session.id));
    return this.issueForUser(session.userId, device);
  }

  /** Revoca una sesión concreta, solo si pertenece al usuario indicado (aislamiento). */
  async revokeByRefreshToken(refreshTokenPlaintext: string, userId: string): Promise<void> {
    const hash = hashOpaqueToken(refreshTokenPlaintext);
    await this.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.refreshTokenHash, hash), eq(sessions.userId, userId)));
  }

  /** Igual que arriba, pero por id de sesión (lo usará "mis sesiones", grupo 6). */
  async revokeById(sessionId: string, userId: string): Promise<boolean> {
    const result = await this.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)))
      .returning({ id: sessions.id });
    return result.length > 0;
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.userId, userId));
  }
}
