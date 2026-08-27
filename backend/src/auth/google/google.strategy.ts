import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { Strategy } from 'passport-google-oauth20';
import type { Profile, StrategyOptions, VerifyCallback } from 'passport-google-oauth20';

export interface GoogleProfile {
  googleId: string;
  email: string;
  name: string;
}

/**
 * Se registra siempre, incluso sin `GOOGLE_CLIENT_ID`/`SECRET` configurados
 * (constitution.md — el proyecto sigue funcionando en local sin credenciales
 * de Google todavía): passport-oauth2 exige un `clientID` no vacío en el
 * constructor o lanza un `TypeError` que tumbaría el arranque de Nest para
 * cualquiera que no tenga Google configurado. `GoogleConfiguredGuard` es
 * quien de verdad bloquea el uso de las rutas de Google mientras no haya
 * credenciales reales.
 */
@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(config: ConfigService) {
    const options: StrategyOptions = {
      clientID: config.get<string>('GOOGLE_CLIENT_ID') || 'not-configured',
      clientSecret: config.get<string>('GOOGLE_CLIENT_SECRET') || 'not-configured',
      callbackURL: config.getOrThrow<string>('GOOGLE_CALLBACK_URL'),
      scope: ['email', 'profile'],
    };
    super(options);
  }

  validate(_accessToken: string, _refreshToken: string, profile: Profile, done: VerifyCallback): void {
    const email = profile.emails?.[0]?.value;
    if (!email) {
      done(new Error('Google no ha devuelto un email verificable para esta cuenta.'));
      return;
    }

    const googleProfile: GoogleProfile = {
      googleId: profile.id,
      email,
      name: profile.displayName || email,
    };
    done(null, googleProfile);
  }
}
