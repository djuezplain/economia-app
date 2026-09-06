import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Patch, Post, Put, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { RequireActiveUserGuard } from '../auth/guards/require-active-user.guard.js';
import type { RequestUser } from '../auth/guards/require-active-user.guard.js';
import { SaveGoogleSheetConfigDto } from './dto/save-google-sheet-config.dto.js';
import { SetAutoImportDto } from './dto/set-auto-import.dto.js';
import { GoogleSheetsConfiguredGuard } from './google-sheets-configured.guard.js';
import { GoogleSheetsImportService } from './google-sheets-import.service.js';

/** H1-H3 (spec 026). Mismo guard que `/import/excel` más `GoogleSheetsConfiguredGuard` (503 sin credenciales de servicio). */
@Controller('import/google-sheet')
@UseGuards(AuthGuard, RequireActiveUserGuard, GoogleSheetsConfiguredGuard)
export class GoogleSheetsImportController {
  constructor(private readonly googleSheetsImport: GoogleSheetsImportService) {}

  @Get('config')
  getConfig(@Req() req: Request & { user: RequestUser }) {
    return this.googleSheetsImport.getConfig(req.user.id);
  }

  @Put('config')
  saveConfig(@Body() dto: SaveGoogleSheetConfigDto, @Req() req: Request & { user: RequestUser }) {
    return this.googleSheetsImport.saveConfig(req.user.id, dto.spreadsheetId);
  }

  @Delete('config')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeConfig(@Req() req: Request & { user: RequestUser }): Promise<void> {
    await this.googleSheetsImport.removeConfig(req.user.id);
  }

  @Patch('config/auto-import')
  setAutoImport(@Body() dto: SetAutoImportDto, @Req() req: Request & { user: RequestUser }) {
    return this.googleSheetsImport.setAutoImport(req.user.id, dto.enabled);
  }

  @Post('run')
  runNow(@Req() req: Request & { user: RequestUser }) {
    return this.googleSheetsImport.runNow(req.user.id);
  }
}
