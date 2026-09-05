import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { RequireActiveUserGuard } from '../auth/guards/require-active-user.guard.js';
import type { RequestUser } from '../auth/guards/require-active-user.guard.js';
import { PensionPlanContributionsService } from './pension-plan-contributions.service.js';
import { CreatePensionPlanContributionDto } from './dto/create-pension-plan-contribution.dto.js';
import { UpdatePensionPlanContributionDto } from './dto/update-pension-plan-contribution.dto.js';

/** H2 (spec 024). Mismo guard que `/pension-plans`. */
@Controller('pension-plan-contributions')
@UseGuards(AuthGuard, RequireActiveUserGuard)
export class PensionPlanContributionsController {
  constructor(private readonly pensionPlanContributions: PensionPlanContributionsService) {}

  @Get()
  list(@Req() req: Request & { user: RequestUser }) {
    return this.pensionPlanContributions.list(req.user.id);
  }

  @Post()
  create(@Body() dto: CreatePensionPlanContributionDto, @Req() req: Request & { user: RequestUser }) {
    return this.pensionPlanContributions.create(req.user.id, dto);
  }

  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdatePensionPlanContributionDto,
    @Req() req: Request & { user: RequestUser },
  ) {
    return this.pensionPlanContributions.update(req.user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: Request & { user: RequestUser }): Promise<void> {
    await this.pensionPlanContributions.remove(req.user.id, id);
  }
}
