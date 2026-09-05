import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { RequireActiveUserGuard } from '../auth/guards/require-active-user.guard.js';
import type { RequestUser } from '../auth/guards/require-active-user.guard.js';
import { VehiclesService } from './vehicles.service.js';
import { CreateVehicleDto } from './dto/create-vehicle.dto.js';
import { UpdateVehicleDto } from './dto/update-vehicle.dto.js';

/** H1 (spec 023). Mismo guard que `/bank-accounts`. */
@Controller('vehicles')
@UseGuards(AuthGuard, RequireActiveUserGuard)
export class VehiclesController {
  constructor(private readonly vehicles: VehiclesService) {}

  @Get()
  list(@Req() req: Request & { user: RequestUser }) {
    return this.vehicles.list(req.user.id);
  }

  @Post()
  create(@Body() dto: CreateVehicleDto, @Req() req: Request & { user: RequestUser }) {
    return this.vehicles.create(req.user.id, dto);
  }

  @Patch(':id')
  update(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateVehicleDto, @Req() req: Request & { user: RequestUser }) {
    return this.vehicles.update(req.user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: Request & { user: RequestUser }): Promise<void> {
    await this.vehicles.remove(req.user.id, id);
  }
}
