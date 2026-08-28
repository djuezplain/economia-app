import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { RequireActiveUserGuard } from '../auth/guards/require-active-user.guard.js';
import type { RequestUser } from '../auth/guards/require-active-user.guard.js';
import { DashboardMonthQueryDto } from '../dashboard/dto/dashboard-month-query.dto.js';
import { DashboardYearQueryDto } from '../dashboard/dto/dashboard-year-query.dto.js';
import { GoalsProgressService } from './goals-progress.service.js';

/**
 * H3/H4 (spec 004). Mismo guard que `/dashboard`. Reutiliza los DTOs de
 * query de `DashboardController` (`month`/`year`, mismo formato y mismo
 * criterio de "sin parámetro, el periodo en curso") en vez de duplicarlos.
 */
@Controller('goals-progress')
@UseGuards(AuthGuard, RequireActiveUserGuard)
export class GoalsProgressController {
  constructor(private readonly goalsProgress: GoalsProgressService) {}

  @Get('month')
  month(@Query() query: DashboardMonthQueryDto, @Req() req: Request & { user: RequestUser }) {
    return this.goalsProgress.month(req.user.id, query.month);
  }

  @Get('year')
  year(@Query() query: DashboardYearQueryDto, @Req() req: Request & { user: RequestUser }) {
    return this.goalsProgress.year(req.user.id, query.year);
  }
}
