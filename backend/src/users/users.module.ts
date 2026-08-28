import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { SessionsController } from './sessions.controller.js';

/**
 * Módulo para las rutas `/users/me/*` (plan.md §2): sesiones aquí (grupo 6),
 * perfil y export/borrado de cuenta se añadirán a este mismo módulo en los
 * grupos 7 y 8, en vez de crear un módulo nuevo por grupo.
 */
@Module({
  imports: [AuthModule],
  controllers: [SessionsController],
})
export class UsersModule {}
