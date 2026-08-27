import { CanActivate, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Se ejecuta antes que `AuthGuard('google')` en `/auth/google` y
 * `/auth/google/callback`. Sin esto, un entorno sin `GOOGLE_CLIENT_ID`/
 * `SECRET` configurados (el actual, ver constitution.md) intentaría redirigir
 * a Google con el valor de relleno `"not-configured"` de `GoogleStrategy`,
 * y el fallo llegaría de forma confusa (un error de Google, no nuestro).
 * Aquí se corta antes, con un mensaje claro.
 */
@Injectable()
export class GoogleConfiguredGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(): boolean {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.config.get<string>('GOOGLE_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      throw new ServiceUnavailableException('El login con Google no está configurado en este entorno todavía.');
    }
    return true;
  }
}
