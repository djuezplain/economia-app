import { Controller, Delete, Get, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { RequireActiveUserGuard } from '../auth/guards/require-active-user.guard.js';
import type { RequestUser } from '../auth/guards/require-active-user.guard.js';
import { GoogleDriveConfiguredGuard } from './google-drive-configured.guard.js';
import { GoogleDriveService } from './google-drive.service.js';

/**
 * Spec 032 H4, plan.md §9.6. A diferencia de `GoogleDriveOAuthController`,
 * estas rutas las dispara siempre un `fetch` normal de la SPA ya
 * autenticada (Bearer) — mismo guard que el resto de rutas de datos
 * económicos (`AuthGuard` + `RequireActiveUserGuard`, igual que
 * `DataImportController`).
 */
@Controller('drive')
@UseGuards(AuthGuard, RequireActiveUserGuard, GoogleDriveConfiguredGuard)
export class GoogleDriveController {
  constructor(private readonly googleDrive: GoogleDriveService) {}

  @Get('connection')
  async getConnection(@Req() req: Request & { user: RequestUser }): Promise<{ connected: boolean }> {
    const connected = await this.googleDrive.isConnected(req.user.id);
    return { connected };
  }

  @Delete('connection')
  @HttpCode(HttpStatus.NO_CONTENT)
  async disconnect(@Req() req: Request & { user: RequestUser }): Promise<void> {
    await this.googleDrive.disconnect(req.user.id);
  }

  @Post('export')
  async export(@Req() req: Request & { user: RequestUser }): Promise<{ fileId: string; webViewLink: string }> {
    return this.googleDrive.exportToDrive(req.user.id);
  }
}
