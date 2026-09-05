import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { RequireActiveUserGuard } from '../auth/guards/require-active-user.guard.js';
import type { RequestUser } from '../auth/guards/require-active-user.guard.js';
import { FundsService } from './funds.service.js';
import { CreateFundDto } from './dto/create-fund.dto.js';
import { UpdateFundDto } from './dto/update-fund.dto.js';

/** H1 (spec 021). Mismo guard que `/stocks`. */
@Controller('funds')
@UseGuards(AuthGuard, RequireActiveUserGuard)
export class FundsController {
  constructor(private readonly funds: FundsService) {}

  @Get()
  list(@Req() req: Request & { user: RequestUser }) {
    return this.funds.list(req.user.id);
  }

  @Post()
  create(@Body() dto: CreateFundDto, @Req() req: Request & { user: RequestUser }) {
    return this.funds.create(req.user.id, dto);
  }

  @Patch(':id')
  update(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateFundDto, @Req() req: Request & { user: RequestUser }) {
    return this.funds.update(req.user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: Request & { user: RequestUser }): Promise<void> {
    await this.funds.remove(req.user.id, id);
  }
}
