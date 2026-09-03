import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { RequireActiveUserGuard } from '../auth/guards/require-active-user.guard.js';
import type { RequestUser } from '../auth/guards/require-active-user.guard.js';
import { DashboardService } from './dashboard.service.js';
import { DashboardComparisonQueryDto } from './dto/dashboard-comparison-query.dto.js';
import { DashboardMonthQueryDto } from './dto/dashboard-month-query.dto.js';
import { DashboardSeasonalQueryDto } from './dto/dashboard-seasonal-query.dto.js';
import { DashboardYearQueryDto } from './dto/dashboard-year-query.dto.js';

/** H4/H5 (spec 002). Mismo guard que `/categories` y `/transactions`. */
@Controller('dashboard')
@UseGuards(AuthGuard, RequireActiveUserGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('month')
  month(@Query() query: DashboardMonthQueryDto, @Req() req: Request & { user: RequestUser }) {
    return this.dashboard.month(req.user.id, query.month);
  }

  @Get('year')
  year(@Query() query: DashboardYearQueryDto, @Req() req: Request & { user: RequestUser }) {
    return this.dashboard.year(req.user.id, query.year);
  }

  @Get('comparison')
  comparison(@Query() query: DashboardComparisonQueryDto, @Req() req: Request & { user: RequestUser }) {
    return this.dashboard.comparison(req.user.id, query.period, query.type);
  }

  @Get('seasonal')
  seasonal(@Query() query: DashboardSeasonalQueryDto, @Req() req: Request & { user: RequestUser }) {
    return this.dashboard.seasonal(req.user.id, query.type, query.scope, query.year);
  }
}
