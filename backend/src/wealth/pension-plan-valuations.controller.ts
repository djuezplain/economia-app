import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { RequireActiveUserGuard } from '../auth/guards/require-active-user.guard.js';
import type { RequestUser } from '../auth/guards/require-active-user.guard.js';
import { PensionPlanValuationsService } from './pension-plan-valuations.service.js';
import { CreatePensionPlanValuationDto } from './dto/create-pension-plan-valuation.dto.js';
import { UpdatePensionPlanValuationDto } from './dto/update-pension-plan-valuation.dto.js';

/** H3 (spec 024). Mismo guard que `/pension-plans`. */
@Controller('pension-plan-valuations')
@UseGuards(AuthGuard, RequireActiveUserGuard)
export class PensionPlanValuationsController {
  constructor(private readonly pensionPlanValuations: PensionPlanValuationsService) {}

  @Get()
  list(@Req() req: Request & { user: RequestUser }) {
    return this.pensionPlanValuations.list(req.user.id);
  }

  @Post()
  create(@Body() dto: CreatePensionPlanValuationDto, @Req() req: Request & { user: RequestUser }) {
    return this.pensionPlanValuations.create(req.user.id, dto);
  }

  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdatePensionPlanValuationDto,
    @Req() req: Request & { user: RequestUser },
  ) {
    return this.pensionPlanValuations.update(req.user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: Request & { user: RequestUser }): Promise<void> {
    await this.pensionPlanValuations.remove(req.user.id, id);
  }
}
