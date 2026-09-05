import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { RequireActiveUserGuard } from '../auth/guards/require-active-user.guard.js';
import type { RequestUser } from '../auth/guards/require-active-user.guard.js';
import { VehicleValuationsService } from './vehicle-valuations.service.js';
import { CreateVehicleValuationDto } from './dto/create-vehicle-valuation.dto.js';
import { UpdateVehicleValuationDto } from './dto/update-vehicle-valuation.dto.js';

/** H2 (spec 023). Mismo guard que `/vehicles`. */
@Controller('vehicle-valuations')
@UseGuards(AuthGuard, RequireActiveUserGuard)
export class VehicleValuationsController {
  constructor(private readonly vehicleValuations: VehicleValuationsService) {}

  @Get()
  list(@Req() req: Request & { user: RequestUser }) {
    return this.vehicleValuations.list(req.user.id);
  }

  @Post()
  create(@Body() dto: CreateVehicleValuationDto, @Req() req: Request & { user: RequestUser }) {
    return this.vehicleValuations.create(req.user.id, dto);
  }

  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateVehicleValuationDto,
    @Req() req: Request & { user: RequestUser },
  ) {
    return this.vehicleValuations.update(req.user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: Request & { user: RequestUser }): Promise<void> {
    await this.vehicleValuations.remove(req.user.id, id);
  }
}
