import { CanActivate, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Spec 032 H4, plan.md §9.4. Mismo patrón que `GoogleConfiguredGuard`
 * (`auth/google/`), aplicado a las 5 rutas de Drive (§9.6): sin
 * `GOOGLE_CLIENT_ID`/`SECRET` (compartidas con el login, `auth/google/`) o
 * sin `DRIVE_TOKEN_ENCRYPTION_KEY` configurada, cualquier intento fallaría
 * de forma confusa contra Google o al cifrar/descifrar el refresh token
 * (`secret-encryption.util.ts`) — se corta aquí antes, con un mensaje claro.
 */
@Injectable()
export class GoogleDriveConfiguredGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(): boolean {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.config.get<string>('GOOGLE_CLIENT_SECRET');
    const encryptionKey = this.config.get<string>('DRIVE_TOKEN_ENCRYPTION_KEY');

    if (!clientId || !clientSecret || !encryptionKey) {
      throw new ServiceUnavailableException('La exportación a Google Drive no está configurada en este entorno todavía.');
    }
    return true;
  }
}
