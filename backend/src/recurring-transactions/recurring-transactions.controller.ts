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
import { KeepTransactionDto, TransactionRefDto } from './dto/transaction-ref.dto.js';
import { RecurringReconciliationService } from './recurring-reconciliation.service.js';

/** Spec 047. Mismo guard que `/transactions`. */
@Controller('recurring-transactions')
@UseGuards(AuthGuard, RequireActiveUserGuard)
export class RecurringTransactionsController {
  constructor(
    private readonly recurring: RecurringTransactionsService,
    private readonly reconciliation: RecurringReconciliationService,
  ) {}

  @Get()
  list(@Req() req: Request & { user: RequestUser }) {
    return this.recurring.list(req.user.id);
  }

  // Antes de `:id` para que "occurrences" no se interprete como un id.
  @Get('occurrences')
  occurrences(@Req() req: Request & { user: RequestUser }, @Query() query: OccurrencesQueryDto) {
    return this.recurring.occurrences(req.user.id, query.from, query.to);
  }

  // Spec 049 H3 criterios 3, 5, 8 y 9. Ruta fija, antes de `:id`.
  @Get('reconciliation')
  reconciliationOverview(@Req() req: Request & { user: RequestUser }) {
    return this.reconciliation.overview(req.user.id);
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

  // --- Spec 049 H3: conciliación manual -----------------------------------

  @Get(':id/occurrences/:date/candidates')
  candidates(
    @Req() req: Request & { user: RequestUser },
    @Param('id', ParseUUIDPipe) id: string,
    @Param('date') date: string,
  ) {
    return this.reconciliation.candidatesFor(req.user.id, id, date);
  }

  @Post(':id/occurrences/:date/reconcile')
  @HttpCode(HttpStatus.NO_CONTENT)
  async reconcile(
    @Req() req: Request & { user: RequestUser },
    @Param('id', ParseUUIDPipe) id: string,
    @Param('date') date: string,
    @Body() dto: TransactionRefDto,
  ) {
    await this.reconciliation.reconcile(req.user.id, id, date, dto.transactionId);
  }

  @Delete(':id/occurrences/:date/reconciliation')
  @HttpCode(HttpStatus.NO_CONTENT)
  async undoReconciliation(
    @Req() req: Request & { user: RequestUser },
    @Param('id', ParseUUIDPipe) id: string,
    @Param('date') date: string,
  ) {
    await this.reconciliation.undoReconciliation(req.user.id, id, date);
  }

  @Post(':id/occurrences/:date/dismiss')
  @HttpCode(HttpStatus.NO_CONTENT)
  async dismiss(
    @Req() req: Request & { user: RequestUser },
    @Param('id', ParseUUIDPipe) id: string,
    @Param('date') date: string,
    @Body() dto: TransactionRefDto,
  ) {
    await this.reconciliation.dismiss(req.user.id, id, date, dto.transactionId);
  }

  @Post(':id/occurrences/:date/resolve-duplicate')
  @HttpCode(HttpStatus.NO_CONTENT)
  async resolveDuplicate(
    @Req() req: Request & { user: RequestUser },
    @Param('id', ParseUUIDPipe) id: string,
    @Param('date') date: string,
    @Body() dto: KeepTransactionDto,
  ) {
    await this.reconciliation.resolveDuplicate(req.user.id, id, date, dto.keepTransactionId);
  }
}
