import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { RequireActiveUserGuard } from '../auth/guards/require-active-user.guard.js';
import type { RequestUser } from '../auth/guards/require-active-user.guard.js';
import { SavingsGoalsService } from './savings-goals.service.js';
import { CreateSavingsGoalDto } from './dto/create-savings-goal.dto.js';
import { UpdateSavingsGoalDto } from './dto/update-savings-goal.dto.js';

/** H1 (spec 004). Mismo guard que `/categories` y `/transactions`. */
@Controller('savings-goals')
@UseGuards(AuthGuard, RequireActiveUserGuard)
export class SavingsGoalsController {
  constructor(private readonly savingsGoals: SavingsGoalsService) {}

  @Get()
  list(@Req() req: Request & { user: RequestUser }) {
    return this.savingsGoals.list(req.user.id);
  }

  @Post()
  create(@Body() dto: CreateSavingsGoalDto, @Req() req: Request & { user: RequestUser }) {
    return this.savingsGoals.create(req.user.id, dto);
  }

  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateSavingsGoalDto,
    @Req() req: Request & { user: RequestUser },
  ) {
    return this.savingsGoals.update(req.user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: Request & { user: RequestUser }): Promise<void> {
    await this.savingsGoals.remove(req.user.id, id);
  }
}
