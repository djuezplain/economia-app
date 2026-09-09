import { Controller, Get, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Request, Response } from 'express';
import { SessionsService } from '../auth/sessions.service.js';
import { REFRESH_COOKIE_NAME } from '../auth/session-cookie.js';
import { GoogleDriveConfiguredGuard } from './google-drive-configured.guard.js';
import { GoogleDriveService } from './google-drive.service.js';
import { DRIVE_CONNECT_STATE_TTL } from './google-drive.constants.js';

interface DriveStatePayload {
  sub: string;
}

/**
 * Spec 032 H4, plan.md §9.5. Las dos rutas que visita el navegador con una
 * navegación completa (no un `fetch` de la SPA), así que ninguna de las dos
 * usa `AuthGuard` (no hay header `Authorization` en una navegación) — ver
 * el razonamiento completo en el plan. Montadas bajo `/auth/drive/...` a
 * propósito: la cookie de refresh token (`REFRESH_COOKIE_NAME`) tiene
 * `path: '/auth'`, así que el navegador la adjunta sola aquí sin tocar su
 * alcance.
 */
@Controller('auth/drive')
@UseGuards(GoogleDriveConfiguredGuard)
export class GoogleDriveOAuthController {
  constructor(
    private readonly googleDrive: GoogleDriveService,
    private readonly sessions: SessionsService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  @Get('connect')
  async connect(@Req() req: Request, @Res() res: Response) {
    const refreshToken = (req.cookies as Record<string, string | undefined> | undefined)?.[REFRESH_COOKIE_NAME];
    if (!refreshToken) {
      res.redirect(this.frontendUrl('/login'));
      return;
    }

    let userId: string;
    try {
      ({ userId } = await this.sessions.verifyActive(refreshToken));
    } catch {
      res.redirect(this.frontendUrl('/login'));
      return;
    }

    const state = await this.jwt.signAsync({ sub: userId } satisfies DriveStatePayload, {
      expiresIn: DRIVE_CONNECT_STATE_TTL,
    });
    res.redirect(this.googleDrive.buildAuthUrl(state));
  }

  @Get('callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ) {
    // El usuario ha cancelado el consentimiento en la pantalla de Google.
    if (error || !code || !state) {
      res.redirect(this.frontendUrl('/backup', { driveConnected: '0', error: 'access_denied' }));
      return;
    }

    let userId: string;
    try {
      const payload = await this.jwt.verifyAsync<DriveStatePayload>(state);
      userId = payload.sub;
    } catch {
      res.redirect(this.frontendUrl('/backup', { driveConnected: '0', error: 'state' }));
      return;
    }

    const result = await this.googleDrive.saveConnectionFromCode(userId, code);
    if (!result.ok) {
      res.redirect(this.frontendUrl('/backup', { driveConnected: '0', error: result.reason }));
      return;
    }
    res.redirect(this.frontendUrl('/backup', { driveConnected: '1' }));
  }

  private frontendUrl(path: string, params?: Record<string, string>): string {
    const url = new URL(path, this.config.getOrThrow<string>('FRONTEND_URL'));
    for (const [key, value] of Object.entries(params ?? {})) {
      url.searchParams.set(key, value);
    }
    return url.toString();
  }
}
