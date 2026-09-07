import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { RequireActiveUserGuard } from '../auth/guards/require-active-user.guard.js';
import type { RequestUser } from '../auth/guards/require-active-user.guard.js';
import { StockSalesService } from './stock-sales.service.js';
import { CreateStockSaleDto } from './dto/create-stock-sale.dto.js';
import { UpdateStockSaleDto } from './dto/update-stock-sale.dto.js';

/** H1 (spec 031). Mismo guard que `/stocks`. */
@Controller('stock-sales')
@UseGuards(AuthGuard, RequireActiveUserGuard)
export class StockSalesController {
  constructor(private readonly stockSales: StockSalesService) {}

  @Get()
  list(@Req() req: Request & { user: RequestUser }) {
    return this.stockSales.list(req.user.id);
  }

  @Post()
  create(@Body() dto: CreateStockSaleDto, @Req() req: Request & { user: RequestUser }) {
    return this.stockSales.create(req.user.id, dto);
  }

  @Patch(':id')
  update(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateStockSaleDto, @Req() req: Request & { user: RequestUser }) {
    return this.stockSales.update(req.user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: Request & { user: RequestUser }): Promise<void> {
    await this.stockSales.remove(req.user.id, id);
  }
}
