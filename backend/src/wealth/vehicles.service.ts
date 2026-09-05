import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, ne } from 'drizzle-orm';
import { DB } from '../db/db.module.js';
import type { Database } from '../db/db.module.js';
import { vehicles } from '../db/schema/index.js';
import type { CreateVehicleDto } from './dto/create-vehicle.dto.js';
import type { UpdateVehicleDto } from './dto/update-vehicle.dto.js';

export type Vehicle = typeof vehicles.$inferSelect;

/**
 * H1 (spec 023). Igual que `BankAccountsService`: ningún método acepta una
 * consulta sin `userId` explícito, y la regla de negocio "un vehículo no se
 * puede duplicar" se comprueba aquí (409), no con una constraint SQL.
 */
@Injectable()
export class VehiclesService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(userId: string): Promise<Vehicle[]> {
    return this.db.query.vehicles.findMany({ where: eq(vehicles.userId, userId) });
  }

  /** H1 criterio 2: 409 si ya existe un vehículo con la misma marca/modelo + matrícula. */
  async create(userId: string, dto: CreateVehicleDto): Promise<Vehicle> {
    await this.assertNotDuplicate(userId, dto.brandModel, dto.plate);

    const [vehicle] = await this.db
      .insert(vehicles)
      .values({
        userId,
        brandModel: dto.brandModel,
        plate: dto.plate,
        purchasePrice: dto.purchasePrice,
        purchaseDate: dto.purchaseDate,
      })
      .returning();
    return vehicle;
  }

  /** H1 criterio 3: editable, repitiendo la comprobación de unicidad si cambia marca/modelo o matrícula. */
  async update(userId: string, id: string, dto: UpdateVehicleDto): Promise<Vehicle> {
    const existing = await this.findOwnOrThrow(userId, id);

    if (dto.brandModel !== undefined || dto.plate !== undefined) {
      await this.assertNotDuplicate(userId, dto.brandModel ?? existing.brandModel, dto.plate ?? existing.plate, id);
    }

    const [updated] = await this.db
      .update(vehicles)
      .set({
        ...(dto.brandModel !== undefined && { brandModel: dto.brandModel }),
        ...(dto.plate !== undefined && { plate: dto.plate }),
        ...(dto.purchasePrice !== undefined && { purchasePrice: dto.purchasePrice }),
        ...(dto.purchaseDate !== undefined && { purchaseDate: dto.purchaseDate }),
        updatedAt: new Date(),
      })
      .where(eq(vehicles.id, id))
      .returning();
    return updated;
  }

  /** H1 criterio 4: el historial de valoraciones se borra en cascada (ON DELETE CASCADE), no hace falta borrarlo a mano aquí. */
  async remove(userId: string, id: string): Promise<void> {
    await this.findOwnOrThrow(userId, id);
    await this.db.delete(vehicles).where(eq(vehicles.id, id));
  }

  async findOwnOrThrow(userId: string, id: string): Promise<Vehicle> {
    const vehicle = await this.db.query.vehicles.findFirst({
      where: and(eq(vehicles.id, id), eq(vehicles.userId, userId)),
    });
    if (!vehicle) {
      throw new NotFoundException('Vehículo no encontrado.');
    }
    return vehicle;
  }

  private async assertNotDuplicate(userId: string, brandModel: string, plate: string, excludeId?: string): Promise<void> {
    const existing = await this.db.query.vehicles.findFirst({
      where: and(
        eq(vehicles.userId, userId),
        eq(vehicles.brandModel, brandModel),
        eq(vehicles.plate, plate),
        ...(excludeId ? [ne(vehicles.id, excludeId)] : []),
      ),
    });
    if (existing) {
      throw new ConflictException('Ya tienes registrado ese vehículo (misma marca/modelo y matrícula). Añade la valoración dentro de él.');
    }
  }
}
