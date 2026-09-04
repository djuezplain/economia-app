import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { RequireActiveUserGuard } from '../auth/guards/require-active-user.guard.js';
import type { RequestUser } from '../auth/guards/require-active-user.guard.js';
import { StockPurchasesService } from './stock-purchases.service.js';
import { CreateStockPurchaseDto } from './dto/create-stock-purchase.dto.js';
import { UpdateStockPurchaseDto } from './dto/update-stock-purchase.dto.js';

/** H2 (spec 020). Mismo guard que `/stocks`. */
@Controller('stock-purchases')
@UseGuards(AuthGuard, RequireActiveUserGuard)
export class StockPurchasesController {
  constructor(private readonly stockPurchases: StockPurchasesService) {}

  @Get()
  list(@Req() req: Request & { user: RequestUser }) {
    return this.stockPurchases.list(req.user.id);
  }

  @Post()
  create(@Body() dto: CreateStockPurchaseDto, @Req() req: Request & { user: RequestUser }) {
    return this.stockPurchases.create(req.user.id, dto);
  }

  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateStockPurchaseDto,
    @Req() req: Request & { user: RequestUser },
  ) {
    return this.stockPurchases.update(req.user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: Request & { user: RequestUser }): Promise<void> {
    await this.stockPurchases.remove(req.user.id, id);
  }
}
