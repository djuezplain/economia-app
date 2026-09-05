import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, ne } from 'drizzle-orm';
import { DB } from '../db/db.module.js';
import type { Database } from '../db/db.module.js';
import { cashHoldings } from '../db/schema/index.js';
import type { CreateCashHoldingDto } from './dto/create-cash-holding.dto.js';
import type { UpdateCashHoldingDto } from './dto/update-cash-holding.dto.js';

export type CashHolding = typeof cashHoldings.$inferSelect;

/**
 * H1 (spec 025). Igual que `BankAccountsService`: ningún método acepta una
 * consulta sin `userId` explícito, y la regla de negocio "una ubicación no
 * se puede duplicar" se comprueba aquí (409), no con una constraint SQL.
 */
@Injectable()
export class CashHoldingsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(userId: string): Promise<CashHolding[]> {
    return this.db.query.cashHoldings.findMany({ where: eq(cashHoldings.userId, userId) });
  }

  /** H1 criterio 2: 409 si ya existe una ubicación con el mismo nombre. */
  async create(userId: string, dto: CreateCashHoldingDto): Promise<CashHolding> {
    await this.assertNotDuplicate(userId, dto.location);

    const [holding] = await this.db.insert(cashHoldings).values({ userId, location: dto.location }).returning();
    return holding;
  }

  /** H1 criterio 3: editable, repitiendo la comprobación de unicidad si cambia la ubicación. */
  async update(userId: string, id: string, dto: UpdateCashHoldingDto): Promise<CashHolding> {
    await this.findOwnOrThrow(userId, id);

    if (dto.location !== undefined) {
      await this.assertNotDuplicate(userId, dto.location, id);
    }

    const [updated] = await this.db
      .update(cashHoldings)
      .set({
        ...(dto.location !== undefined && { location: dto.location }),
        updatedAt: new Date(),
      })
      .where(eq(cashHoldings.id, id))
      .returning();
    return updated;
  }

  /** H1 criterio 4: el historial de importes se borra en cascada (ON DELETE CASCADE), no hace falta borrarlo a mano aquí. */
  async remove(userId: string, id: string): Promise<void> {
    await this.findOwnOrThrow(userId, id);
    await this.db.delete(cashHoldings).where(eq(cashHoldings.id, id));
  }

  async findOwnOrThrow(userId: string, id: string): Promise<CashHolding> {
    const holding = await this.db.query.cashHoldings.findFirst({
      where: and(eq(cashHoldings.id, id), eq(cashHoldings.userId, userId)),
    });
    if (!holding) {
      throw new NotFoundException('Ubicación de efectivo no encontrada.');
    }
    return holding;
  }

  private async assertNotDuplicate(userId: string, location: string, excludeId?: string): Promise<void> {
    const existing = await this.db.query.cashHoldings.findFirst({
      where: and(eq(cashHoldings.userId, userId), eq(cashHoldings.location, location), ...(excludeId ? [ne(cashHoldings.id, excludeId)] : [])),
    });
    if (existing) {
      throw new ConflictException('Ya tienes registrada esa ubicación de efectivo. Añade el importe dentro de ella.');
    }
  }
}
