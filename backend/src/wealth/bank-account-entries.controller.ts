import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { RequireActiveUserGuard } from '../auth/guards/require-active-user.guard.js';
import type { RequestUser } from '../auth/guards/require-active-user.guard.js';
import { BankAccountEntriesService } from './bank-account-entries.service.js';
import { CreateBankAccountEntryDto } from './dto/create-bank-account-entry.dto.js';
import { UpdateBankAccountEntryDto } from './dto/update-bank-account-entry.dto.js';

/** H2 (spec 018). Mismo guard que `/savings-goals` y `/transactions`. */
@Controller('bank-account-entries')
@UseGuards(AuthGuard, RequireActiveUserGuard)
export class BankAccountEntriesController {
  constructor(private readonly bankAccountEntries: BankAccountEntriesService) {}

  @Get()
  list(@Req() req: Request & { user: RequestUser }) {
    return this.bankAccountEntries.list(req.user.id);
  }

  @Post()
  create(@Body() dto: CreateBankAccountEntryDto, @Req() req: Request & { user: RequestUser }) {
    return this.bankAccountEntries.create(req.user.id, dto);
  }

  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateBankAccountEntryDto,
    @Req() req: Request & { user: RequestUser },
  ) {
    return this.bankAccountEntries.update(req.user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: Request & { user: RequestUser }): Promise<void> {
    await this.bankAccountEntries.remove(req.user.id, id);
  }
}
