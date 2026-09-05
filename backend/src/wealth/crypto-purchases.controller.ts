import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { RequireActiveUserGuard } from '../auth/guards/require-active-user.guard.js';
import type { RequestUser } from '../auth/guards/require-active-user.guard.js';
import { CryptoPurchasesService } from './crypto-purchases.service.js';
import { CreateCryptoPurchaseDto } from './dto/create-crypto-purchase.dto.js';
import { UpdateCryptoPurchaseDto } from './dto/update-crypto-purchase.dto.js';

/** H2 (spec 022). Mismo guard que `/cryptos`. */
@Controller('crypto-purchases')
@UseGuards(AuthGuard, RequireActiveUserGuard)
export class CryptoPurchasesController {
  constructor(private readonly cryptoPurchases: CryptoPurchasesService) {}

  @Get()
  list(@Req() req: Request & { user: RequestUser }) {
    return this.cryptoPurchases.list(req.user.id);
  }

  @Post()
  create(@Body() dto: CreateCryptoPurchaseDto, @Req() req: Request & { user: RequestUser }) {
    return this.cryptoPurchases.create(req.user.id, dto);
  }

  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateCryptoPurchaseDto,
    @Req() req: Request & { user: RequestUser },
  ) {
    return this.cryptoPurchases.update(req.user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: Request & { user: RequestUser }): Promise<void> {
    await this.cryptoPurchases.remove(req.user.id, id);
  }
}
