import { Body, Controller, Delete, Get, HttpCode, Put, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { RequireActiveUserGuard } from '../auth/guards/require-active-user.guard.js';
import type { RequestUser } from '../auth/guards/require-active-user.guard.js';
import { ScheduledExportsService } from './scheduled-exports.service.js';
import { SaveScheduledExportDto } from './dto/save-scheduled-export.dto.js';

/** Spec 032 H5, plan.md §11.6. Mismo guard que el resto de rutas de datos económicos. */
@Controller('scheduled-exports')
@UseGuards(AuthGuard, RequireActiveUserGuard)
export class ScheduledExportsController {
  constructor(private readonly scheduledExportsService: ScheduledExportsService) {}

  /**
   * `@Res()` en vez de simplemente devolver el valor: Nest trata un
   * controller que resuelve a `null`/`undefined` como "sin cuerpo" y manda
   * la respuesta vacía (`Content-Length: 0`, sin `Content-Type`) en vez de
   * serializar `null` a JSON — encontrado al verificar esta ruta en el
   * navegador real, `fetch(...).json()` fallaba con `SyntaxError` (cuerpo
   * vacío no es JSON válido) aunque el status fuera 200. `res.json(row)` de
   * Express sí serializa `null` de verdad (cuerpo `"null"`,
   * `Content-Type: application/json`), que es lo que pide plan.md §11.6.
   */
  @Get()
  async get(@Req() req: Request & { user: RequestUser }, @Res() res: Response): Promise<void> {
    const row = await this.scheduledExportsService.get(req.user.id);
    res.json(row);
  }

  @Put()
  save(@Body() dto: SaveScheduledExportDto, @Req() req: Request & { user: RequestUser }) {
    return this.scheduledExportsService.save(req.user.id, dto);
  }

  @Delete()
  @HttpCode(204)
  async disable(@Req() req: Request & { user: RequestUser }): Promise<void> {
    await this.scheduledExportsService.disable(req.user.id);
  }
}
