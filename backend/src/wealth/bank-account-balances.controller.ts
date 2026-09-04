import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { RequireActiveUserGuard } from '../auth/guards/require-active-user.guard.js';
import type { RequestUser } from '../auth/guards/require-active-user.guard.js';
import { BankAccountBalancesService } from './bank-account-balances.service.js';
import { CreateBankAccountBalanceDto } from './dto/create-bank-account-balance.dto.js';
import { UpdateBankAccountBalanceDto } from './dto/update-bank-account-balance.dto.js';

/** H2 (spec 019). Mismo guard que `/bank-accounts`. */
@Controller('bank-account-balances')
@UseGuards(AuthGuard, RequireActiveUserGuard)
export class BankAccountBalancesController {
  constructor(private readonly bankAccountBalances: BankAccountBalancesService) {}

  @Get()
  list(@Req() req: Request & { user: RequestUser }) {
    return this.bankAccountBalances.list(req.user.id);
  }

  @Post()
  create(@Body() dto: CreateBankAccountBalanceDto, @Req() req: Request & { user: RequestUser }) {
    return this.bankAccountBalances.create(req.user.id, dto);
  }

  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateBankAccountBalanceDto,
    @Req() req: Request & { user: RequestUser },
  ) {
    return this.bankAccountBalances.update(req.user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: Request & { user: RequestUser }): Promise<void> {
    await this.bankAccountBalances.remove(req.user.id, id);
  }
}
