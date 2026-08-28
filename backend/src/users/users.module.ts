import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { MailModule } from '../mail/mail.module.js';
import { SessionsController } from './sessions.controller.js';
import { ProfileController } from './profile.controller.js';
import { UsersService } from './users.service.js';

/**
 * Módulo para las rutas `/users/me/*` (plan.md §2): sesiones (grupo 6),
 * perfil, export y borrado de cuenta (grupo 7 y 8) — todo en el mismo
 * módulo en vez de uno nuevo por grupo.
 *
 * `MailModule` se importa aquí directamente (no basta con `AuthModule`):
 * `UsersService` necesita `MailService` para el aviso de cuenta eliminada
 * (grupo 8), y `AuthModule` no lo reexporta — es el mismo tipo de gotcha de
 * DI que el de `JwtModule` en `auth.module.ts`, resuelto aquí igual: la
 * dependencia se importa donde se necesita, en vez de encadenar reexports.
 */
@Module({
  imports: [AuthModule, MailModule],
  controllers: [SessionsController, ProfileController],
  providers: [UsersService],
})
export class UsersModule {}
