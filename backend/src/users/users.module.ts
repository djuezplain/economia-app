import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { SessionsController } from './sessions.controller.js';
import { ProfileController } from './profile.controller.js';
import { UsersService } from './users.service.js';

/**
 * Módulo para las rutas `/users/me/*` (plan.md §2): sesiones (grupo 6) y
 * perfil (grupo 7) aquí; export/borrado de cuenta se añadirán a este mismo
 * módulo en el grupo 8, en vez de crear un módulo nuevo por grupo.
 */
@Module({
  imports: [AuthModule],
  controllers: [SessionsController, ProfileController],
  providers: [UsersService],
})
export class UsersModule {}
