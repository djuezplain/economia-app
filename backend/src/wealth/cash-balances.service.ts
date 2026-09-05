import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { desc, eq, inArray } from 'drizzle-orm';
import { DB } from '../db/db.module.js';
import type { Database } from '../db/db.module.js';
import { cashBalances, cashHoldings } from '../db/schema/index.js';
import { CashHoldingsService } from './cash-holdings.service.js';
import type { CreateCashBalanceDto } from './dto/create-cash-balance.dto.js';
import type { UpdateCashBalanceDto } from './dto/update-cash-balance.dto.js';

export type CashBalance = typeof cashBalances.$inferSelect;

/**
 * H2 (spec 025). `cashBalances` no lleva `userId` propio (esquema
 * normalizado) — el aislamiento por usuario pasa siempre por
 * `CashHoldingsService.findOwnOrThrow()` (reutilizado, no duplicado) contra
 * la ubicación a la que pertenece cada entrada.
 */
@Injectable()
export class CashBalancesService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly cashHoldingsService: CashHoldingsService,
  ) {}

  /** H2 criterio 4: de la más reciente a la más antigua, de todas las ubicaciones del usuario a la vez. */
  async list(userId: string): Promise<CashBalance[]> {
    const ownHoldings = await this.db.query.cashHoldings.findMany({
      where: eq(cashHoldings.userId, userId),
      columns: { id: true },
    });
    if (ownHoldings.length === 0) return [];

    return this.db.query.cashBalances.findMany({
      where: inArray(
        cashBalances.cashHoldingId,
        ownHoldings.map((h) => h.id),
      ),
      orderBy: [desc(cashBalances.date), desc(cashBalances.createdAt)],
    });
  }

  /** H2 criterio 6: 404 si `cashHoldingId` no es una ubicación propia — nunca se crea un importe sobre una ubicación ajena. */
  async create(userId: string, dto: CreateCashBalanceDto): Promise<CashBalance> {
    await this.cashHoldingsService.findOwnOrThrow(userId, dto.cashHoldingId);

    const [balance] = await this.db
      .insert(cashBalances)
      .values({ cashHoldingId: dto.cashHoldingId, amount: dto.amount, date: dto.date })
      .returning();
    return balance;
  }

  async update(userId: string, id: string, dto: UpdateCashBalanceDto): Promise<CashBalance> {
    await this.findOwnOrThrow(userId, id);

    const [updated] = await this.db
      .update(cashBalances)
      .set({
        ...(dto.amount !== undefined && { amount: dto.amount }),
        ...(dto.date !== undefined && { date: dto.date }),
        updatedAt: new Date(),
      })
      .where(eq(cashBalances.id, id))
      .returning();
    return updated;
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.findOwnOrThrow(userId, id);
    await this.db.delete(cashBalances).where(eq(cashBalances.id, id));
  }

  private async findOwnOrThrow(userId: string, id: string): Promise<CashBalance> {
    const balance = await this.db.query.cashBalances.findFirst({ where: eq(cashBalances.id, id) });
    if (!balance) {
      throw new NotFoundException('Entrada de efectivo no encontrada.');
    }
    // 404 (no 403) si la ubicación a la que pertenece no es del usuario — mismo criterio de no revelar existencia.
    await this.cashHoldingsService.findOwnOrThrow(userId, balance.cashHoldingId);
    return balance;
  }
}
