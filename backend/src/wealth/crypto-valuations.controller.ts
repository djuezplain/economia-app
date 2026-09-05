import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { RequireActiveUserGuard } from '../auth/guards/require-active-user.guard.js';
import type { RequestUser } from '../auth/guards/require-active-user.guard.js';
import { CryptoValuationsService } from './crypto-valuations.service.js';
import { CreateCryptoValuationDto } from './dto/create-crypto-valuation.dto.js';
import { UpdateCryptoValuationDto } from './dto/update-crypto-valuation.dto.js';

/** H3 (spec 022). Mismo guard que `/cryptos`. */
@Controller('crypto-valuations')
@UseGuards(AuthGuard, RequireActiveUserGuard)
export class CryptoValuationsController {
  constructor(private readonly cryptoValuations: CryptoValuationsService) {}

  @Get()
  list(@Req() req: Request & { user: RequestUser }) {
    return this.cryptoValuations.list(req.user.id);
  }

  @Post()
  create(@Body() dto: CreateCryptoValuationDto, @Req() req: Request & { user: RequestUser }) {
    return this.cryptoValuations.create(req.user.id, dto);
  }

  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateCryptoValuationDto,
    @Req() req: Request & { user: RequestUser },
  ) {
    return this.cryptoValuations.update(req.user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: Request & { user: RequestUser }): Promise<void> {
    await this.cryptoValuations.remove(req.user.id, id);
  }
}
