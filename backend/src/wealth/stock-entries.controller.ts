import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { RequireActiveUserGuard } from '../auth/guards/require-active-user.guard.js';
import type { RequestUser } from '../auth/guards/require-active-user.guard.js';
import { StockEntriesService } from './stock-entries.service.js';
import { CreateStockEntryDto } from './dto/create-stock-entry.dto.js';
import { UpdateStockEntryDto } from './dto/update-stock-entry.dto.js';

/** H3 (spec 018). Mismo guard que `/bank-account-entries`. */
@Controller('stock-entries')
@UseGuards(AuthGuard, RequireActiveUserGuard)
export class StockEntriesController {
  constructor(private readonly stockEntries: StockEntriesService) {}

  @Get()
  list(@Req() req: Request & { user: RequestUser }) {
    return this.stockEntries.list(req.user.id);
  }

  @Post()
  create(@Body() dto: CreateStockEntryDto, @Req() req: Request & { user: RequestUser }) {
    return this.stockEntries.create(req.user.id, dto);
  }

  @Patch(':id')
  update(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateStockEntryDto, @Req() req: Request & { user: RequestUser }) {
    return this.stockEntries.update(req.user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: Request & { user: RequestUser }): Promise<void> {
    await this.stockEntries.remove(req.user.id, id);
  }
}
