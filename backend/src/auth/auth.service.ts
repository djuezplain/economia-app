import { BadRequestException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, isNull } from 'drizzle-orm';
import * as argon2 from 'argon2';
import { DB } from '../db/db.module.js';
import type { Database } from '../db/db.module.js';
import { emailTokens, oauthAccounts, users } from '../db/schema/index.js';
import { MailService } from '../mail/mail.service.js';
import { alreadyRegisteredEmail, passwordResetEmail, verificationEmail } from '../mail/templates.js';
import { generateOpaqueToken, hashOpaqueToken } from '../common/tokens.util.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { SessionsService } from './sessions.service.js';
import type { DeviceInfo } from './sessions.service.js';
import type { GoogleProfile } from './google/google.strategy.js';
import { AuditLogService } from '../audit/audit-log.service.js';
import { CategoriesService } from '../categories/categories.service.js';

const VERIFY_EMAIL_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_PASSWORD_TTL_MS = 60 * 60 * 1000; // H5 (spec 001), criterio 1: 1 hora

// H4 (spec 001), criterio 3: 5 intentos fallidos *consecutivos* en 15 minutos.
const LOGIN_LOCK_THRESHOLD = 5;
const LOGIN_LOCK_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LOCK_DURATION_MS = 15 * 60 * 1000;

const INVALID_CREDENTIALS_MESSAGE = 'Email o contraseña incorrectos.';
// Deliberadamente distinto del mensaje anterior: informa del bloqueo sin decir
// "tu contraseña es incorrecta" ni "esta cuenta existe" explícitamente. Ver
// constitution.md §3 para la nota sobre el trade-off de no-enumeración que
// esto implica (una cuenta que no existe nunca puede llegar a este mensaje).
const LOCKED_ACCOUNT_MESSAGE =
  'Demasiados intentos fallidos. Esta cuenta está bloqueada temporalmente; inténtalo de nuevo en unos minutos.';

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; name: string; status: string };
}

type UserRow = typeof users.$inferSelect;

@Injectable()
export class AuthService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    private readonly sessions: SessionsService,
    private readonly auditLog: AuditLogService,
    private readonly categories: CategoriesService,
  ) {}

  /**
   * H1 (spec 001). No revela en la respuesta si el email ya existía (criterio 2):
   * siempre se responde igual; la diferencia solo la ve el dueño del email, por
   * correo. Si el DTO no cumple la política de contraseña, el ValidationPipe
   * global ya lo ha rechazado antes de llegar aquí (criterio 3).
   */
  async register(dto: RegisterDto): Promise<{ message: string }> {
    const existing = await this.db.query.users.findFirst({
      where: eq(users.email, dto.email),
    });

    if (existing) {
      await this.mail.send(
        alreadyRegisteredEmail({
          to: existing.email,
          name: existing.name,
          forgotPasswordUrl: `${this.frontendUrl}/forgot-password`,
        }),
      );
      return this.genericResponse();
    }

    const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });

    const [user] = await this.db
      .insert(users)
      .values({ email: dto.email, passwordHash, name: dto.name })
      .returning();

    await this.sendVerificationEmail(user.id, user.email, user.name);

    // H3 (spec 002), criterio 1: categorías iniciales listas desde el
    // primer momento, sin que el usuario tenga que crearlas.
    await this.categories.seedDefaults(user.id);

    return this.genericResponse();
  }

  /**
   * H2 (spec 001). Aquí sí se distingue el motivo del error (inválido / caducado /
   * ya usado): no hay riesgo de enumeración de cuentas, porque el token es un
   * secreto de alta entropía que solo conoce quien recibió el email original.
   */
  async verifyEmail(tokenPlaintext: string): Promise<{ message: string }> {
    const tokenHash = hashOpaqueToken(tokenPlaintext);

    const token = await this.db.query.emailTokens.findFirst({
      where: and(eq(emailTokens.tokenHash, tokenHash), eq(emailTokens.type, 'VERIFY_EMAIL')),
    });

    if (!token) {
      throw new BadRequestException('Enlace de verificación inválido.');
    }
    if (token.usedAt) {
      throw new BadRequestException('Este enlace ya se ha utilizado.');
    }
    if (token.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Este enlace ha caducado. Solicita uno nuevo.');
    }

    await this.db.transaction(async (tx) => {
      await tx.update(users).set({ status: 'ACTIVE', updatedAt: new Date() }).where(eq(users.id, token.userId));
      await tx.update(emailTokens).set({ usedAt: new Date() }).where(eq(emailTokens.id, token.id));
    });

    return { message: 'Cuenta verificada correctamente.' };
  }

  /**
   * H2 (spec 001). Mismo principio de no-enumeración que en `register`: la
   * respuesta es siempre igual, exista o no la cuenta, o esté ya verificada.
   */
  async resendVerification(email: string): Promise<{ message: string }> {
    const user = await this.db.query.users.findFirst({ where: eq(users.email, email) });

    if (user && user.status === 'PENDING_VERIFICATION') {
      // Invalida los tokens de verificación anteriores sin usar: solo el último enlace enviado es válido.
      await this.db
        .update(emailTokens)
        .set({ usedAt: new Date() })
        .where(
          and(
            eq(emailTokens.userId, user.id),
            eq(emailTokens.type, 'VERIFY_EMAIL'),
            isNull(emailTokens.usedAt),
          ),
        );

      await this.sendVerificationEmail(user.id, user.email, user.name);
    }

    return { message: 'Si la cuenta existe y no está verificada, te hemos enviado un nuevo enlace.' };
  }

  /**
   * H4 (spec 001). No revela si el email existe (criterio 2): credenciales
   * incorrectas y email inexistente devuelven exactamente el mismo mensaje.
   * La única excepción deliberada es el mensaje de bloqueo tras 5 fallos
   * (criterio 3, ver constante `LOCKED_ACCOUNT_MESSAGE` y su nota).
   */
  async login(dto: LoginDto, device: DeviceInfo): Promise<LoginResult> {
    const user = await this.db.query.users.findFirst({ where: eq(users.email, dto.email) });

    if (!user || !user.passwordHash) {
      // Sin usuario, o cuenta creada solo vía Google (sin contraseña): se hace
      // un hash de relleno para no filtrar por tiempo de respuesta cuál de
      // los dos casos es.
      await argon2.hash('contraseña-de-relleno-tiempo-constante', { type: argon2.argon2id });
      // userId null a propósito: si el usuario no existe no hay id que
      // registrar, y hacerlo distinto según el caso reintroduciría por otra
      // vía la fuga de "existe / no existe" que el resto del método evita.
      await this.auditLog.record('login_failed', { ipAddress: device.ipAddress });
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      await this.auditLog.record('login_failed', { userId: user.id, ipAddress: device.ipAddress });
      throw new UnauthorizedException(LOCKED_ACCOUNT_MESSAGE);
    }

    const validPassword = await argon2.verify(user.passwordHash, dto.password);
    if (!validPassword) {
      await this.registerFailedLogin(user);
      await this.auditLog.record('login_failed', { userId: user.id, ipAddress: device.ipAddress });
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    if (user.failedLoginCount > 0 || user.lockedUntil) {
      await this.db
        .update(users)
        .set({ failedLoginCount: 0, lockedUntil: null, lastFailedLoginAt: null, updatedAt: new Date() })
        .where(eq(users.id, user.id));
    }

    await this.auditLog.record('login_success', { userId: user.id, ipAddress: device.ipAddress });

    const tokens = await this.sessions.issueForUser(user.id, device);
    return {
      ...tokens,
      user: { id: user.id, email: user.email, name: user.name, status: user.status },
    };
  }

  private async registerFailedLogin(user: UserRow): Promise<void> {
    const now = Date.now();
    const windowExpired = user.lastFailedLoginAt
      ? now - user.lastFailedLoginAt.getTime() > LOGIN_LOCK_WINDOW_MS
      : false;
    const newCount = (windowExpired ? 0 : user.failedLoginCount) + 1;

    if (newCount >= LOGIN_LOCK_THRESHOLD) {
      await this.db
        .update(users)
        .set({
          failedLoginCount: 0,
          lockedUntil: new Date(now + LOGIN_LOCK_DURATION_MS),
          lastFailedLoginAt: new Date(now),
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));
      return;
    }

    await this.db
      .update(users)
      .set({ failedLoginCount: newCount, lastFailedLoginAt: new Date(now), updatedAt: new Date() })
      .where(eq(users.id, user.id));
  }

  /**
   * H3 (spec 001), plan §5 pasos 5-8. Tres casos:
   * 1. Ya existe un `OAuthAccount(google, sub)` → es un login de vuelta, se usa ese usuario.
   * 2. No existe el vínculo, pero sí un `User` con ese email (se registró por
   *    contraseña) → se vincula la cuenta de Google a ese usuario existente,
   *    sin duplicarlo (criterio 2).
   * 3. No existe ni el vínculo ni el usuario → se crea un `User` nuevo, ya
   *    `ACTIVE` (Google ya ha verificado el email, a diferencia del registro
   *    por contraseña) y sin `passwordHash`.
   */
  async loginWithGoogleProfile(profile: GoogleProfile, device: DeviceInfo): Promise<LoginResult> {
    const existingLink = await this.db.query.oauthAccounts.findFirst({
      where: and(eq(oauthAccounts.provider, 'google'), eq(oauthAccounts.providerUserId, profile.googleId)),
    });

    let user: UserRow;

    if (existingLink) {
      const linkedUser = await this.db.query.users.findFirst({ where: eq(users.id, existingLink.userId) });
      if (!linkedUser) {
        throw new UnauthorizedException('La cuenta asociada a este login de Google ya no existe.');
      }
      user = linkedUser;
    } else {
      const existingUser = await this.db.query.users.findFirst({ where: eq(users.email, profile.email) });

      if (existingUser) {
        await this.db.insert(oauthAccounts).values({
          userId: existingUser.id,
          provider: 'google',
          providerUserId: profile.googleId,
        });
        user = existingUser;
      } else {
        const [createdUser] = await this.db
          .insert(users)
          .values({
            email: profile.email,
            passwordHash: null,
            name: profile.name,
            status: 'ACTIVE',
          })
          .returning();
        await this.db.insert(oauthAccounts).values({
          userId: createdUser.id,
          provider: 'google',
          providerUserId: profile.googleId,
        });
        user = createdUser;
      }
    }

    if (user.failedLoginCount > 0 || user.lockedUntil) {
      // Un login por Google correcto es una prueba de identidad tan válida
      // como una contraseña correcta: limpia cualquier bloqueo previo por
      // intentos fallidos de contraseña sobre esta misma cuenta.
      await this.db
        .update(users)
        .set({ failedLoginCount: 0, lockedUntil: null, lastFailedLoginAt: null, updatedAt: new Date() })
        .where(eq(users.id, user.id));
    }

    await this.auditLog.record('login_success', { userId: user.id, ipAddress: device.ipAddress });

    const tokens = await this.sessions.issueForUser(user.id, device);
    return {
      ...tokens,
      user: { id: user.id, email: user.email, name: user.name, status: user.status },
    };
  }

  /**
   * H5 (spec 001), criterio 1. Mismo principio de no-enumeración que registro
   * y reenvío de verificación: la respuesta es siempre igual, exista o no la
   * cuenta con ese email.
   */
  async forgotPassword(email: string): Promise<{ message: string }> {
    const user = await this.db.query.users.findFirst({ where: eq(users.email, email) });

    if (user) {
      // Invalida cualquier enlace de restablecimiento anterior sin usar: solo el último enviado es válido.
      await this.db
        .update(emailTokens)
        .set({ usedAt: new Date() })
        .where(
          and(eq(emailTokens.userId, user.id), eq(emailTokens.type, 'RESET_PASSWORD'), isNull(emailTokens.usedAt)),
        );

      const { plaintext, hash } = generateOpaqueToken();
      await this.db.insert(emailTokens).values({
        userId: user.id,
        tokenHash: hash,
        type: 'RESET_PASSWORD',
        expiresAt: new Date(Date.now() + RESET_PASSWORD_TTL_MS),
      });

      await this.mail.send(
        passwordResetEmail({
          to: user.email,
          name: user.name,
          resetUrl: `${this.frontendUrl}/reset-password?token=${plaintext}`,
        }),
      );
    }

    return this.genericResponse();
  }

  /**
   * H5 (spec 001), criterio 2. A diferencia de `forgotPassword`, aquí sí se
   * distingue el motivo del error: el token es un secreto de alta entropía
   * que solo conoce quien recibió el email, así que no hay riesgo de
   * enumeración de cuentas al ser específico (mismo principio que
   * `verifyEmail`). El `userId` sobre el que se actúa sale siempre del propio
   * token, nunca del cliente — un token de un usuario no puede usarse para
   * tocar la cuenta de otro, por construcción.
   */
  async resetPassword(tokenPlaintext: string, newPassword: string, ipAddress?: string): Promise<{ message: string }> {
    const tokenHash = hashOpaqueToken(tokenPlaintext);

    const token = await this.db.query.emailTokens.findFirst({
      where: and(eq(emailTokens.tokenHash, tokenHash), eq(emailTokens.type, 'RESET_PASSWORD')),
    });

    if (!token) {
      throw new BadRequestException('Enlace de restablecimiento inválido.');
    }
    if (token.usedAt) {
      throw new BadRequestException('Este enlace ya se ha utilizado.');
    }
    if (token.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Este enlace ha caducado. Solicita uno nuevo.');
    }

    const passwordHash = await argon2.hash(newPassword, { type: argon2.argon2id });

    await this.db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({
          passwordHash,
          // Un restablecimiento correcto es una prueba de identidad tan
          // válida como una contraseña acertada: limpia cualquier bloqueo
          // previo por intentos fallidos sobre esta misma cuenta.
          failedLoginCount: 0,
          lockedUntil: null,
          lastFailedLoginAt: null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, token.userId));
      await tx.update(emailTokens).set({ usedAt: new Date() }).where(eq(emailTokens.id, token.id));
    });

    // H5 criterio 2: tras el reset, todas las sesiones activas anteriores se cierran.
    await this.sessions.revokeAllForUser(token.userId, 'PASSWORD_RESET');

    await this.auditLog.record('password_reset', { userId: token.userId, ipAddress });

    return { message: 'Contraseña restablecida correctamente.' };
  }

  private async sendVerificationEmail(userId: string, email: string, name: string): Promise<void> {
    const { plaintext, hash } = generateOpaqueToken();

    await this.db.insert(emailTokens).values({
      userId,
      tokenHash: hash,
      type: 'VERIFY_EMAIL',
      expiresAt: new Date(Date.now() + VERIFY_EMAIL_TTL_MS),
    });

    await this.mail.send(
      verificationEmail({
        to: email,
        name,
        verifyUrl: `${this.frontendUrl}/verify-email?token=${plaintext}`,
      }),
    );
  }

  private get frontendUrl(): string {
    return this.config.getOrThrow<string>('FRONTEND_URL');
  }

  private genericResponse(): { message: string } {
    // Mismo mensaje exista o no la cuenta: evita que la respuesta filtre existencia.
    return { message: 'Si los datos son correctos, revisa tu correo para continuar.' };
  }
}
