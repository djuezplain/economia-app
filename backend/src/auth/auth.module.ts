import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { MailModule } from '../mail/mail.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { CategoriesModule } from '../categories/categories.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { SessionsService } from './sessions.service.js';
import { AuthGuardModule } from './guards/auth-guard.module.js';
import { GoogleStrategy } from './google/google.strategy.js';
import { GoogleConfiguredGuard } from './google/google-configured.guard.js';

@Module({
  imports: [
    MailModule,
    AuditModule,
    // CategoriesModule (spec 002, T1.3): AuthService.register siembra las
    // categorías por defecto del usuario nuevo (H3 criterio 1). Ver
    // `AuthGuardModule` para por qué `AuthGuard`/`JwtModule` viven en su
    // propio módulo en vez de aquí — si no, este import cerraría un ciclo
    // con `CategoriesModule` (que también necesita `AuthGuard`).
    CategoriesModule,
    PassportModule,
    AuthGuardModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, SessionsService, GoogleStrategy, GoogleConfiguredGuard],
  // SessionsService se exporta porque la reutilizan "mis sesiones" (grupo 6)
  // y el resto de rutas protegidas de `/users/me/*`. `AuthGuardModule` se
  // re-exporta (no solo `AuthGuard`) para que cualquier módulo que importe
  // `AuthModule` (p. ej. `UsersModule`) siga teniendo `AuthGuard` y su
  // `JwtModule` resolubles, exactamente igual que antes de esta extracción
  // — Nest permite re-exportar un módulo importado tal cual.
  exports: [SessionsService, AuthGuardModule],
})
export class AuthModule {}
