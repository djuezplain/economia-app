import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { RequireActiveUserGuard } from '../auth/guards/require-active-user.guard.js';
import type { RequestUser } from '../auth/guards/require-active-user.guard.js';
import { CryptosService } from './cryptos.service.js';
import { CreateCryptoDto } from './dto/create-crypto.dto.js';
import { UpdateCryptoDto } from './dto/update-crypto.dto.js';

/** H1 (spec 022). Mismo guard que `/stocks`. */
@Controller('cryptos')
@UseGuards(AuthGuard, RequireActiveUserGuard)
export class CryptosController {
  constructor(private readonly cryptos: CryptosService) {}

  @Get()
  list(@Req() req: Request & { user: RequestUser }) {
    return this.cryptos.list(req.user.id);
  }

  @Post()
  create(@Body() dto: CreateCryptoDto, @Req() req: Request & { user: RequestUser }) {
    return this.cryptos.create(req.user.id, dto);
  }

  @Patch(':id')
  update(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateCryptoDto, @Req() req: Request & { user: RequestUser }) {
    return this.cryptos.update(req.user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: Request & { user: RequestUser }): Promise<void> {
    await this.cryptos.remove(req.user.id, id);
  }
}
