import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { RequireActiveUserGuard } from '../auth/guards/require-active-user.guard.js';
import type { RequestUser } from '../auth/guards/require-active-user.guard.js';
import { StockValuationsService } from './stock-valuations.service.js';
import { CreateStockValuationDto } from './dto/create-stock-valuation.dto.js';
import { UpdateStockValuationDto } from './dto/update-stock-valuation.dto.js';

/** H3 (spec 020). Mismo guard que `/stocks`. */
@Controller('stock-valuations')
@UseGuards(AuthGuard, RequireActiveUserGuard)
export class StockValuationsController {
  constructor(private readonly stockValuations: StockValuationsService) {}

  @Get()
  list(@Req() req: Request & { user: RequestUser }) {
    return this.stockValuations.list(req.user.id);
  }

  @Post()
  create(@Body() dto: CreateStockValuationDto, @Req() req: Request & { user: RequestUser }) {
    return this.stockValuations.create(req.user.id, dto);
  }

  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateStockValuationDto,
    @Req() req: Request & { user: RequestUser },
  ) {
    return this.stockValuations.update(req.user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: Request & { user: RequestUser }): Promise<void> {
    await this.stockValuations.remove(req.user.id, id);
  }
}
