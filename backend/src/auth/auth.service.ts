import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, isNull } from 'drizzle-orm';
import * as argon2 from 'argon2';
import { DB } from '../db/db.module.js';
import type { Database } from '../db/db.module.js';
import { emailTokens, users } from '../db/schema/index.js';
import { MailService } from '../mail/mail.service.js';
import { alreadyRegisteredEmail, verificationEmail } from '../mail/templates.js';
import { generateOpaqueToken, hashOpaqueToken } from '../common/tokens.util.js';
import { RegisterDto } from './dto/register.dto.js';

const VERIFY_EMAIL_TTL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly mail: MailService,
    private readonly config: ConfigService,
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
