import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq } from 'drizzle-orm';
import * as argon2 from 'argon2';
import { DB } from '../db/db.module.js';
import type { Database } from '../db/db.module.js';
import { emailTokens, users } from '../db/schema/index.js';
import { MailService } from '../mail/mail.service.js';
import { alreadyRegisteredEmail, verificationEmail } from '../mail/templates.js';
import { generateOpaqueToken } from '../common/tokens.util.js';
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
