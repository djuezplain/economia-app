import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { MailModule } from '../mail/mail.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { SessionsService } from './sessions.service.js';
import { AuthGuard } from './guards/auth.guard.js';
import { GoogleStrategy } from './google/google.strategy.js';
import { GoogleConfiguredGuard } from './google/google-configured.guard.js';
import { ACCESS_TOKEN_TTL } from './session-cookie.js';

@Module({
  imports: [
    MailModule,
    PassportModule,
    // No se registra como `global: true`: el access token de esta app es de
    // uso interno de auth (AuthGuard); si otro módulo necesitara firmar/verificar
    // JWT en el futuro, se decide explícitamente entonces.
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        signOptions: { expiresIn: ACCESS_TOKEN_TTL },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, SessionsService, AuthGuard, GoogleStrategy, GoogleConfiguredGuard],
  // SessionsService y AuthGuard se exportan porque los reutilizarán "mis
  // sesiones" (grupo 6) y cualquier módulo con rutas protegidas (perfil,
  // grupo 7; exportar/eliminar cuenta, grupo 8).
  exports: [SessionsService, AuthGuard],
})
export class AuthModule {}
