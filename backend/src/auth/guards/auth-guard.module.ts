import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthGuard } from './auth.guard.js';
import { ACCESS_TOKEN_TTL } from '../session-cookie.js';

/**
 * Extraído de `AuthModule` en spec 002 (T1.3, ver `constitution.md`):
 * `AuthModule` necesita `CategoriesService` (para sembrar categorías al
 * registrarse) y `CategoriesModule` necesita `AuthGuard` (para proteger sus
 * propias rutas) — si `CategoriesModule` importara `AuthModule` directamente
 * para conseguir el guard, se cerraría un ciclo real entre ambos módulos
 * (Nest lo rechaza en arranque: "Nest cannot create the CategoriesModule
 * instance... A circular dependency between modules").
 *
 * En vez de resolverlo con `forwardRef()` (funciona, pero es un parche sobre
 * el síntoma), se extrae la pieza que ambos módulos necesitan de verdad —
 * el guard y su `JwtModule` — a un módulo propio y más pequeño que ninguno
 * de los dos depende del otro. `AuthModule` sigue exportando `AuthGuard`
 * (re-exportando este módulo) para no romper a nadie que ya lo use
 * importando `AuthModule` (p. ej. `UsersModule`).
 */
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        signOptions: { expiresIn: ACCESS_TOKEN_TTL },
      }),
    }),
  ],
  providers: [AuthGuard],
  exports: [AuthGuard, JwtModule],
})
export class AuthGuardModule {}
