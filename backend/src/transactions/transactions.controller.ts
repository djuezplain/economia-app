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
import { TransactionsService } from './transactions.service.js';
import { CreateTransactionDto } from './dto/create-transaction.dto.js';
import { UpdateTransactionDto } from './dto/update-transaction.dto.js';
import { ListTransactionsQueryDto } from './dto/list-transactions-query.dto.js';

/** H1/H2 (spec 002). Mismo guard que `/categories` (T1.2). */
@Controller('transactions')
@UseGuards(AuthGuard, RequireActiveUserGuard)
export class TransactionsController {
  constructor(private readonly transactions: TransactionsService) {}

  @Post()
  create(@Body() dto: CreateTransactionDto, @Req() req: Request & { user: RequestUser }) {
    return this.transactions.create(req.user.id, dto);
  }

  @Get()
  list(@Query() query: ListTransactionsQueryDto, @Req() req: Request & { user: RequestUser }) {
    return this.transactions.list(req.user.id, query);
  }

  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateTransactionDto,
    @Req() req: Request & { user: RequestUser },
  ) {
    return this.transactions.update(req.user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: Request & { user: RequestUser },
  ): Promise<void> {
    await this.transactions.remove(req.user.id, id);
  }
}
