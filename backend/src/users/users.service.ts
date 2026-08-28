import { BadRequestException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import * as argon2 from 'argon2';
import { DB } from '../db/db.module.js';
import type { Database } from '../db/db.module.js';
import { users } from '../db/schema/index.js';
import { SessionsService } from '../auth/sessions.service.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  currency: string;
  locale: string;
  status: string;
  createdAt: Date;
}

type UserRow = typeof users.$inferSelect;

/**
 * H7 (spec 001). Igual que `SessionsService` (grupo 6), toda operación aquí
 * recibe `userId` explícito y opera solo sobre esa fila — nunca hay un
 * "buscar por id" sin `userId` (constitution §2, aislamiento no negociable).
 * En la práctica el `userId` siempre sale de `request.user.id` (rellenado por
 * `AuthGuard` a partir del JWT), nunca del cliente, así que no hace falta un
 * test de aislamiento cruzado dedicado como en sesiones: no existe una ruta
 * que acepte el id de *otro* usuario.
 */
@Injectable()
export class UsersService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly sessions: SessionsService,
  ) {}

  async getProfile(userId: string): Promise<UserProfile> {
    const user = await this.findOrThrow(userId);
    return this.toProfile(user);
  }

  /** H7, criterio 1. PATCH parcial: solo se tocan los campos presentes en el DTO. */
  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<UserProfile> {
    const updates: Partial<UserRow> = { updatedAt: new Date() };
    if (dto.name !== undefined) updates.name = dto.name;
    if (dto.currency !== undefined) updates.currency = dto.currency;
    if (dto.locale !== undefined) updates.locale = dto.locale;

    const [updated] = await this.db.update(users).set(updates).where(eq(users.id, userId)).returning();
    if (!updated) {
      throw new UnauthorizedException('El usuario ya no existe.');
    }
    return this.toProfile(updated);
  }

  /**
   * H7, criterio 2. Si la cuenta no tiene `passwordHash` (se creó solo vía
   * Google, grupo 4), no hay "contraseña actual" que confirmar — se rechaza
   * con un mensaje claro en vez de comparar contra `null` (que además
   * rompería `argon2.verify`).
   *
   * Igual que en `resetPassword` (H5, grupo 5): un cambio de contraseña
   * correcto revoca todas las sesiones activas, incluida la que hizo la
   * petición (no hay forma de identificar "esta sesión" desde el access
   * token — ver la nota en `SessionsService.listActiveForUser`). El access
   * token en curso sigue siendo válido hasta que caduque (máx. 15 min), pero
   * ya no podrá refrescarse: el mismo trade-off, ya aceptado y documentado,
   * que el reset de contraseña. tasks.md T7.1 lo marca como "(opcional)";
   * aquí se hace por consistencia con H5 y porque es el comportamiento más
   * seguro por defecto.
   */
  async changePassword(userId: string, dto: ChangePasswordDto): Promise<{ message: string }> {
    const user = await this.findOrThrow(userId);

    if (!user.passwordHash) {
      throw new BadRequestException(
        'Esta cuenta inicia sesión solo con Google y no tiene contraseña que cambiar.',
      );
    }

    const validPassword = await argon2.verify(user.passwordHash, dto.currentPassword);
    if (!validPassword) {
      throw new UnauthorizedException('La contraseña actual no es correcta.');
    }

    const passwordHash = await argon2.hash(dto.newPassword, { type: argon2.argon2id });
    await this.db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, userId));

    await this.sessions.revokeAllForUser(userId, 'PASSWORD_CHANGED');

    return { message: 'Contraseña actualizada correctamente.' };
  }

  private async findOrThrow(userId: string): Promise<UserRow> {
    const user = await this.db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user) {
      // No debería pasar: AuthGuard ya comprueba que el usuario existe en
      // cada petición. Defensa en profundidad, no un caso esperado.
      throw new UnauthorizedException('El usuario ya no existe.');
    }
    return user;
  }

  private toProfile(user: UserRow): UserProfile {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      currency: user.currency,
      locale: user.locale,
      status: user.status,
      createdAt: user.createdAt,
    };
  }
}
