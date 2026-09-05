import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { desc, eq, inArray } from 'drizzle-orm';
import { DB } from '../db/db.module.js';
import type { Database } from '../db/db.module.js';
import { vehicleValuations, vehicles } from '../db/schema/index.js';
import { VehiclesService } from './vehicles.service.js';
import type { CreateVehicleValuationDto } from './dto/create-vehicle-valuation.dto.js';
import type { UpdateVehicleValuationDto } from './dto/update-vehicle-valuation.dto.js';

export type VehicleValuation = typeof vehicleValuations.$inferSelect;

/**
 * H2 (spec 023). `vehicleValuations` no lleva `userId` propio (esquema
 * normalizado, plan.md §1) — el aislamiento por usuario pasa siempre por
 * `VehiclesService.findOwnOrThrow()` (reutilizado, no duplicado) contra el
 * vehículo al que pertenece cada entrada.
 */
@Injectable()
export class VehicleValuationsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly vehiclesService: VehiclesService,
  ) {}

  /** H2 criterio 4: de la más reciente a la más antigua, de todos los vehículos del usuario a la vez. */
  async list(userId: string): Promise<VehicleValuation[]> {
    const userVehicles = await this.db.query.vehicles.findMany({
      where: eq(vehicles.userId, userId),
      columns: { id: true },
    });
    if (userVehicles.length === 0) return [];

    return this.db.query.vehicleValuations.findMany({
      where: inArray(
        vehicleValuations.vehicleId,
        userVehicles.map((v) => v.id),
      ),
      orderBy: [desc(vehicleValuations.date), desc(vehicleValuations.createdAt)],
    });
  }

  /** H2 criterio 6: 404 si `vehicleId` no es un vehículo propio — nunca se crea una valoración sobre un vehículo ajeno. */
  async create(userId: string, dto: CreateVehicleValuationDto): Promise<VehicleValuation> {
    await this.vehiclesService.findOwnOrThrow(userId, dto.vehicleId);

    const [valuation] = await this.db
      .insert(vehicleValuations)
      .values({ vehicleId: dto.vehicleId, value: dto.value, date: dto.date })
      .returning();
    return valuation;
  }

  async update(userId: string, id: string, dto: UpdateVehicleValuationDto): Promise<VehicleValuation> {
    await this.findOwnOrThrow(userId, id);

    const [updated] = await this.db
      .update(vehicleValuations)
      .set({
        ...(dto.value !== undefined && { value: dto.value }),
        ...(dto.date !== undefined && { date: dto.date }),
        updatedAt: new Date(),
      })
      .where(eq(vehicleValuations.id, id))
      .returning();
    return updated;
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.findOwnOrThrow(userId, id);
    await this.db.delete(vehicleValuations).where(eq(vehicleValuations.id, id));
  }

  private async findOwnOrThrow(userId: string, id: string): Promise<VehicleValuation> {
    const valuation = await this.db.query.vehicleValuations.findFirst({ where: eq(vehicleValuations.id, id) });
    if (!valuation) {
      throw new NotFoundException('Entrada de valoración no encontrada.');
    }
    // 404 (no 403) si el vehículo al que pertenece no es del usuario — mismo criterio de no revelar existencia.
    await this.vehiclesService.findOwnOrThrow(userId, valuation.vehicleId);
    return valuation;
  }
}
