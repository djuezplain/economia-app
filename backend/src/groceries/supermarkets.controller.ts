import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { RequireActiveUserGuard } from '../auth/guards/require-active-user.guard.js';
import type { RequestUser } from '../auth/guards/require-active-user.guard.js';
import { SupermarketsService } from './supermarkets.service.js';

/** Spec 034, plan.md §3. */
@Controller('supermarkets')
@UseGuards(AuthGuard, RequireActiveUserGuard)
export class SupermarketsController {
  constructor(private readonly supermarketsService: SupermarketsService) {}

  @Get()
  list(@Req() req: Request & { user: RequestUser }) {
    return this.supermarketsService.list(req.user.id);
  }
}
