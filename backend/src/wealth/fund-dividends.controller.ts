import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { RequireActiveUserGuard } from '../auth/guards/require-active-user.guard.js';
import type { RequestUser } from '../auth/guards/require-active-user.guard.js';
import { FundDividendsService } from './fund-dividends.service.js';
import { CreateFundDividendDto } from './dto/create-fund-dividend.dto.js';
import { UpdateFundDividendDto } from './dto/update-fund-dividend.dto.js';

/** H1 (spec 029). Mismo guard que `/funds`. */
@Controller('fund-dividends')
@UseGuards(AuthGuard, RequireActiveUserGuard)
export class FundDividendsController {
  constructor(private readonly fundDividends: FundDividendsService) {}

  @Get()
  list(@Req() req: Request & { user: RequestUser }) {
    return this.fundDividends.list(req.user.id);
  }

  @Post()
  create(@Body() dto: CreateFundDividendDto, @Req() req: Request & { user: RequestUser }) {
    return this.fundDividends.create(req.user.id, dto);
  }

  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateFundDividendDto,
    @Req() req: Request & { user: RequestUser },
  ) {
    return this.fundDividends.update(req.user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: Request & { user: RequestUser }): Promise<void> {
    await this.fundDividends.remove(req.user.id, id);
  }
}
