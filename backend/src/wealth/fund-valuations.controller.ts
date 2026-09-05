import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { RequireActiveUserGuard } from '../auth/guards/require-active-user.guard.js';
import type { RequestUser } from '../auth/guards/require-active-user.guard.js';
import { FundValuationsService } from './fund-valuations.service.js';
import { CreateFundValuationDto } from './dto/create-fund-valuation.dto.js';
import { UpdateFundValuationDto } from './dto/update-fund-valuation.dto.js';

/** H3 (spec 021). Mismo guard que `/funds`. */
@Controller('fund-valuations')
@UseGuards(AuthGuard, RequireActiveUserGuard)
export class FundValuationsController {
  constructor(private readonly fundValuations: FundValuationsService) {}

  @Get()
  list(@Req() req: Request & { user: RequestUser }) {
    return this.fundValuations.list(req.user.id);
  }

  @Post()
  create(@Body() dto: CreateFundValuationDto, @Req() req: Request & { user: RequestUser }) {
    return this.fundValuations.create(req.user.id, dto);
  }

  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateFundValuationDto,
    @Req() req: Request & { user: RequestUser },
  ) {
    return this.fundValuations.update(req.user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: Request & { user: RequestUser }): Promise<void> {
    await this.fundValuations.remove(req.user.id, id);
  }
}
