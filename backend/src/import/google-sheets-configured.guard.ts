import { CanActivate, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { GoogleSheetsService } from './google-sheets.service.js';

/**
 * Mismo criterio que `GoogleConfiguredGuard` (auth con Google, spec 001):
 * sin las credenciales de la cuenta de servicio configuradas, cortar antes
 * con un mensaje claro en vez de dejar que el fallo llegue de forma
 * confusa contra la API de Google.
 */
@Injectable()
export class GoogleSheetsConfiguredGuard implements CanActivate {
  constructor(private readonly googleSheetsService: GoogleSheetsService) {}

  canActivate(): boolean {
    if (!this.googleSheetsService.isConfigured()) {
      throw new ServiceUnavailableException('La importación desde Google Sheets no está configurada en este entorno todavía.');
    }
    return true;
  }
}
