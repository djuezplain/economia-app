import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Patch, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { pipeline } from 'node:stream/promises';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import type { RequestUser } from '../auth/guards/require-active-user.guard.js';
import { UsersService } from './users.service.js';
import { AccountArchiveService, archiveFilename } from './account-archive.service.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { DeleteAccountDto } from './dto/delete-account.dto.js';

/**
 * H7 (spec 001). Igual que `SessionsController` (grupo 6), se aplica solo
 * `AuthGuard`, no `RequireActiveUserGuard`: ver/editar el propio perfil y
 * cambiar la contraseña son funciones de gestión de cuenta, no operaciones
 * sobre datos económicos — deben seguir disponibles aunque el email todavía
 * no esté verificado (`RequireActiveUserGuard` está pensado para bloquear
 * datos económicos, no la cuenta en sí; ver su comentario en
 * `require-active-user.guard.ts`).
 */
@Controller('users/me')
@UseGuards(AuthGuard)
export class ProfileController {
  constructor(
    private readonly users: UsersService,
    private readonly archive: AccountArchiveService,
  ) {}

  @Get()
  getProfile(@Req() req: Request & { user: RequestUser }) {
    return this.users.getProfile(req.user.id);
  }

  @Patch()
  updateProfile(@Body() dto: UpdateProfileDto, @Req() req: Request & { user: RequestUser }) {
    return this.users.updateProfile(req.user.id, dto);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  changePassword(@Body() dto: ChangePasswordDto, @Req() req: Request & { user: RequestUser }) {
    return this.users.changePassword(req.user.id, dto);
  }

  @Get('export')
  exportData(@Req() req: Request & { user: RequestUser }) {
    return this.users.exportData(req.user.id);
  }

  /**
   * Spec 048 (plan.md §3.4): la copia de seguridad completa, en `.zip`, con
   * los documentos de los tickets. `GET /users/me/export` se mantiene como
   * exportación de solo datos.
   */
  @Get('export/archive')
  async exportArchive(@Req() req: Request & { user: RequestUser }, @Res() res: Response): Promise<void> {
    const { stream } = await this.archive.createArchive(req.user.id);
    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${archiveFilename()}"`,
      'Cache-Control': 'private, no-store',
    });
    await pipeline(stream, res);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAccount(@Body() dto: DeleteAccountDto, @Req() req: Request & { user: RequestUser }): Promise<void> {
    await this.users.deleteAccount(req.user.id, dto);
  }
}
