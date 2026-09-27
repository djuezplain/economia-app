import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { RequireActiveUserGuard } from '../auth/guards/require-active-user.guard.js';
import type { RequestUser } from '../auth/guards/require-active-user.guard.js';
import { FundSalesService } from './fund-sales.service.js';
import { CreateFundSaleDto } from './dto/create-fund-sale.dto.js';
import { UpdateFundSaleDto } from './dto/update-fund-sale.dto.js';

/** H1 (spec 044). Mismo guard que `/funds`. */
@Controller('fund-sales')
@UseGuards(AuthGuard, RequireActiveUserGuard)
export class FundSalesController {
  constructor(private readonly fundSales: FundSalesService) {}

  @Get()
  list(@Req() req: Request & { user: RequestUser }) {
    return this.fundSales.list(req.user.id);
  }

  @Post()
  create(@Body() dto: CreateFundSaleDto, @Req() req: Request & { user: RequestUser }) {
    return this.fundSales.create(req.user.id, dto);
  }

  @Patch(':id')
  update(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateFundSaleDto, @Req() req: Request & { user: RequestUser }) {
    return this.fundSales.update(req.user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: Request & { user: RequestUser }): Promise<void> {
    await this.fundSales.remove(req.user.id, id);
  }
}
