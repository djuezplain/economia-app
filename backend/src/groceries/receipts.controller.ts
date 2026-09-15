import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Put, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { RequireActiveUserGuard } from '../auth/guards/require-active-user.guard.js';
import type { RequestUser } from '../auth/guards/require-active-user.guard.js';
import { ConfirmReceiptDto } from '../receipt-import/dto/confirm-receipt.dto.js';
import { ListReceiptsQueryDto } from './dto/list-receipts-query.dto.js';
import { ReceiptsService } from './receipts.service.js';

/**
 * Spec 034, plan.md §3 (H5, lectura) + spec 035, plan.md §1 (H1-H3,
 * escritura) — CRUD completo del recurso `/receipts` en un mismo
 * controller, mismo criterio que `StocksController` (spec 020): a
 * diferencia de la importación (`receipt-import`, un flujo de varios
 * pasos), editar/borrar un ticket ya guardado es CRUD simple sobre un
 * recurso ya identificado.
 */
@Controller('receipts')
@UseGuards(AuthGuard, RequireActiveUserGuard)
export class ReceiptsController {
  constructor(private readonly receiptsService: ReceiptsService) {}

  @Get()
  list(@Query() query: ListReceiptsQueryDto, @Req() req: Request & { user: RequestUser }) {
    return this.receiptsService.list(req.user.id, query);
  }

  @Get(':id')
  getById(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: Request & { user: RequestUser }) {
    return this.receiptsService.getById(req.user.id, id);
  }

  @Put(':id')
  update(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: ConfirmReceiptDto, @Req() req: Request & { user: RequestUser }) {
    return this.receiptsService.update(req.user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: Request & { user: RequestUser }): Promise<void> {
    await this.receiptsService.remove(req.user.id, id);
  }
}
