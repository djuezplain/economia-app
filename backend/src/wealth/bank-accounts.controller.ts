import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { RequireActiveUserGuard } from '../auth/guards/require-active-user.guard.js';
import type { RequestUser } from '../auth/guards/require-active-user.guard.js';
import { BankAccountsService } from './bank-accounts.service.js';
import { CreateBankAccountDto } from './dto/create-bank-account.dto.js';
import { UpdateBankAccountDto } from './dto/update-bank-account.dto.js';

/** H1 (spec 019). Mismo guard que `/savings-goals` y `/transactions`. */
@Controller('bank-accounts')
@UseGuards(AuthGuard, RequireActiveUserGuard)
export class BankAccountsController {
  constructor(private readonly bankAccounts: BankAccountsService) {}

  @Get()
  list(@Req() req: Request & { user: RequestUser }) {
    return this.bankAccounts.list(req.user.id);
  }

  @Post()
  create(@Body() dto: CreateBankAccountDto, @Req() req: Request & { user: RequestUser }) {
    return this.bankAccounts.create(req.user.id, dto);
  }

  @Patch(':id')
  update(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateBankAccountDto, @Req() req: Request & { user: RequestUser }) {
    return this.bankAccounts.update(req.user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: Request & { user: RequestUser }): Promise<void> {
    await this.bankAccounts.remove(req.user.id, id);
  }
}
