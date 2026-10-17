import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { RequireActiveUserGuard } from '../auth/guards/require-active-user.guard.js';
import type { RequestUser } from '../auth/guards/require-active-user.guard.js';
import { RecurringTransactionsService } from './recurring-transactions.service.js';
import { CreateRecurringTransactionDto } from './dto/create-recurring-transaction.dto.js';
import { UpdateRecurringTransactionDto } from './dto/update-recurring-transaction.dto.js';
import { OccurrencesQueryDto } from './dto/occurrences-query.dto.js';
import { ConfirmOccurrenceDto } from './dto/confirm-occurrence.dto.js';

/** Spec 047. Mismo guard que `/transactions`. */
@Controller('recurring-transactions')
@UseGuards(AuthGuard, RequireActiveUserGuard)
export class RecurringTransactionsController {
  constructor(private readonly recurring: RecurringTransactionsService) {}

  @Get()
  list(@Req() req: Request & { user: RequestUser }) {
    return this.recurring.list(req.user.id);
  }

  // Antes de `:id` para que "occurrences" no se interprete como un id.
  @Get('occurrences')
  occurrences(@Req() req: Request & { user: RequestUser }, @Query() query: OccurrencesQueryDto) {
    return this.recurring.occurrences(req.user.id, query.from, query.to);
  }

  @Post()
  create(@Req() req: Request & { user: RequestUser }, @Body() dto: CreateRecurringTransactionDto) {
    return this.recurring.create(req.user.id, dto);
  }

  @Patch(':id')
  update(
    @Req() req: Request & { user: RequestUser },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRecurringTransactionDto,
  ) {
    return this.recurring.update(req.user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Req() req: Request & { user: RequestUser }, @Param('id', ParseUUIDPipe) id: string) {
    await this.recurring.remove(req.user.id, id);
  }

  @Post(':id/occurrences/:date/confirm')
  @HttpCode(HttpStatus.OK)
  confirm(
    @Req() req: Request & { user: RequestUser },
    @Param('id', ParseUUIDPipe) id: string,
    @Param('date') date: string,
    @Body() dto: ConfirmOccurrenceDto,
  ) {
    return this.recurring.confirm(req.user.id, id, date, dto.amount);
  }

  @Post(':id/occurrences/:date/skip')
  @HttpCode(HttpStatus.NO_CONTENT)
  async skip(
    @Req() req: Request & { user: RequestUser },
    @Param('id', ParseUUIDPipe) id: string,
    @Param('date') date: string,
  ) {
    await this.recurring.skip(req.user.id, id, date);
  }
}
