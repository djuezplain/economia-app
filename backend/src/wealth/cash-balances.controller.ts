import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { RequireActiveUserGuard } from '../auth/guards/require-active-user.guard.js';
import type { RequestUser } from '../auth/guards/require-active-user.guard.js';
import { CashBalancesService } from './cash-balances.service.js';
import { CreateCashBalanceDto } from './dto/create-cash-balance.dto.js';
import { UpdateCashBalanceDto } from './dto/update-cash-balance.dto.js';

/** H2 (spec 025). Mismo guard que `/cash-holdings`. */
@Controller('cash-balances')
@UseGuards(AuthGuard, RequireActiveUserGuard)
export class CashBalancesController {
  constructor(private readonly cashBalances: CashBalancesService) {}

  @Get()
  list(@Req() req: Request & { user: RequestUser }) {
    return this.cashBalances.list(req.user.id);
  }

  @Post()
  create(@Body() dto: CreateCashBalanceDto, @Req() req: Request & { user: RequestUser }) {
    return this.cashBalances.create(req.user.id, dto);
  }

  @Patch(':id')
  update(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateCashBalanceDto, @Req() req: Request & { user: RequestUser }) {
    return this.cashBalances.update(req.user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: Request & { user: RequestUser }): Promise<void> {
    await this.cashBalances.remove(req.user.id, id);
  }
}
