import { Controller, Get, Param, ParseUUIDPipe, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { RequireActiveUserGuard } from '../auth/guards/require-active-user.guard.js';
import type { RequestUser } from '../auth/guards/require-active-user.guard.js';
import { ReceiptsService } from './receipts.service.js';

/** Spec 034, plan.md §3 (H5). */
@Controller('receipts')
@UseGuards(AuthGuard, RequireActiveUserGuard)
export class ReceiptsController {
  constructor(private readonly receiptsService: ReceiptsService) {}

  @Get()
  list(@Req() req: Request & { user: RequestUser }) {
    return this.receiptsService.list(req.user.id);
  }

  @Get(':id')
  getById(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: Request & { user: RequestUser }) {
    return this.receiptsService.getById(req.user.id, id);
  }
}
