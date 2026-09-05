import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { RequireActiveUserGuard } from '../auth/guards/require-active-user.guard.js';
import type { RequestUser } from '../auth/guards/require-active-user.guard.js';
import { FundPurchasesService } from './fund-purchases.service.js';
import { CreateFundPurchaseDto } from './dto/create-fund-purchase.dto.js';
import { UpdateFundPurchaseDto } from './dto/update-fund-purchase.dto.js';

/** H2 (spec 021). Mismo guard que `/funds`. */
@Controller('fund-purchases')
@UseGuards(AuthGuard, RequireActiveUserGuard)
export class FundPurchasesController {
  constructor(private readonly fundPurchases: FundPurchasesService) {}

  @Get()
  list(@Req() req: Request & { user: RequestUser }) {
    return this.fundPurchases.list(req.user.id);
  }

  @Post()
  create(@Body() dto: CreateFundPurchaseDto, @Req() req: Request & { user: RequestUser }) {
    return this.fundPurchases.create(req.user.id, dto);
  }

  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateFundPurchaseDto,
    @Req() req: Request & { user: RequestUser },
  ) {
    return this.fundPurchases.update(req.user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: Request & { user: RequestUser }): Promise<void> {
    await this.fundPurchases.remove(req.user.id, id);
  }
}
