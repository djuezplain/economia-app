import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { RequireActiveUserGuard } from '../auth/guards/require-active-user.guard.js';
import type { RequestUser } from '../auth/guards/require-active-user.guard.js';
import { CashHoldingsService } from './cash-holdings.service.js';
import { CreateCashHoldingDto } from './dto/create-cash-holding.dto.js';
import { UpdateCashHoldingDto } from './dto/update-cash-holding.dto.js';

/** H1 (spec 025). Mismo guard que `/bank-accounts`. */
@Controller('cash-holdings')
@UseGuards(AuthGuard, RequireActiveUserGuard)
export class CashHoldingsController {
  constructor(private readonly cashHoldings: CashHoldingsService) {}

  @Get()
  list(@Req() req: Request & { user: RequestUser }) {
    return this.cashHoldings.list(req.user.id);
  }

  @Post()
  create(@Body() dto: CreateCashHoldingDto, @Req() req: Request & { user: RequestUser }) {
    return this.cashHoldings.create(req.user.id, dto);
  }

  @Patch(':id')
  update(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateCashHoldingDto, @Req() req: Request & { user: RequestUser }) {
    return this.cashHoldings.update(req.user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: Request & { user: RequestUser }): Promise<void> {
    await this.cashHoldings.remove(req.user.id, id);
  }
}
