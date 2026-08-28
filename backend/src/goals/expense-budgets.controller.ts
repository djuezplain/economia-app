import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { RequireActiveUserGuard } from '../auth/guards/require-active-user.guard.js';
import type { RequestUser } from '../auth/guards/require-active-user.guard.js';
import { ExpenseBudgetsService } from './expense-budgets.service.js';
import { CreateExpenseBudgetDto } from './dto/create-expense-budget.dto.js';
import { UpdateExpenseBudgetDto } from './dto/update-expense-budget.dto.js';

/** H2 (spec 004). Mismo guard que `/categories` y `/transactions`. */
@Controller('expense-budgets')
@UseGuards(AuthGuard, RequireActiveUserGuard)
export class ExpenseBudgetsController {
  constructor(private readonly expenseBudgets: ExpenseBudgetsService) {}

  @Get()
  list(@Req() req: Request & { user: RequestUser }) {
    return this.expenseBudgets.list(req.user.id);
  }

  @Post()
  create(@Body() dto: CreateExpenseBudgetDto, @Req() req: Request & { user: RequestUser }) {
    return this.expenseBudgets.create(req.user.id, dto);
  }

  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateExpenseBudgetDto,
    @Req() req: Request & { user: RequestUser },
  ) {
    return this.expenseBudgets.update(req.user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: Request & { user: RequestUser }): Promise<void> {
    await this.expenseBudgets.remove(req.user.id, id);
  }
}
