import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { RequireActiveUserGuard } from '../auth/guards/require-active-user.guard.js';
import type { RequestUser } from '../auth/guards/require-active-user.guard.js';
import { StockDividendsService } from './stock-dividends.service.js';
import { CreateStockDividendDto } from './dto/create-stock-dividend.dto.js';
import { UpdateStockDividendDto } from './dto/update-stock-dividend.dto.js';

/** H1 (spec 029). Mismo guard que `/stocks`. */
@Controller('stock-dividends')
@UseGuards(AuthGuard, RequireActiveUserGuard)
export class StockDividendsController {
  constructor(private readonly stockDividends: StockDividendsService) {}

  @Get()
  list(@Req() req: Request & { user: RequestUser }) {
    return this.stockDividends.list(req.user.id);
  }

  @Post()
  create(@Body() dto: CreateStockDividendDto, @Req() req: Request & { user: RequestUser }) {
    return this.stockDividends.create(req.user.id, dto);
  }

  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateStockDividendDto,
    @Req() req: Request & { user: RequestUser },
  ) {
    return this.stockDividends.update(req.user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: Request & { user: RequestUser }): Promise<void> {
    await this.stockDividends.remove(req.user.id, id);
  }
}
