import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { RequireActiveUserGuard } from '../auth/guards/require-active-user.guard.js';
import type { RequestUser } from '../auth/guards/require-active-user.guard.js';
import { StocksService } from './stocks.service.js';
import { CreateStockDto } from './dto/create-stock.dto.js';
import { UpdateStockDto } from './dto/update-stock.dto.js';

/** H1 (spec 020). Mismo guard que `/bank-accounts`. */
@Controller('stocks')
@UseGuards(AuthGuard, RequireActiveUserGuard)
export class StocksController {
  constructor(private readonly stocks: StocksService) {}

  @Get()
  list(@Req() req: Request & { user: RequestUser }) {
    return this.stocks.list(req.user.id);
  }

  @Post()
  create(@Body() dto: CreateStockDto, @Req() req: Request & { user: RequestUser }) {
    return this.stocks.create(req.user.id, dto);
  }

  @Patch(':id')
  update(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateStockDto, @Req() req: Request & { user: RequestUser }) {
    return this.stocks.update(req.user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: Request & { user: RequestUser }): Promise<void> {
    await this.stocks.remove(req.user.id, id);
  }
}
