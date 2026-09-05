import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { RequireActiveUserGuard } from '../auth/guards/require-active-user.guard.js';
import type { RequestUser } from '../auth/guards/require-active-user.guard.js';
import { PensionPlansService } from './pension-plans.service.js';
import { CreatePensionPlanDto } from './dto/create-pension-plan.dto.js';
import { UpdatePensionPlanDto } from './dto/update-pension-plan.dto.js';

/** H1 (spec 024). Mismo guard que `/cryptos`. */
@Controller('pension-plans')
@UseGuards(AuthGuard, RequireActiveUserGuard)
export class PensionPlansController {
  constructor(private readonly pensionPlans: PensionPlansService) {}

  @Get()
  list(@Req() req: Request & { user: RequestUser }) {
    return this.pensionPlans.list(req.user.id);
  }

  @Post()
  create(@Body() dto: CreatePensionPlanDto, @Req() req: Request & { user: RequestUser }) {
    return this.pensionPlans.create(req.user.id, dto);
  }

  @Patch(':id')
  update(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdatePensionPlanDto, @Req() req: Request & { user: RequestUser }) {
    return this.pensionPlans.update(req.user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: Request & { user: RequestUser }): Promise<void> {
    await this.pensionPlans.remove(req.user.id, id);
  }
}
