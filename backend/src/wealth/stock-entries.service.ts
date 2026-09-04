import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { DB } from '../db/db.module.js';
import type { Database } from '../db/db.module.js';
import { stockEntries } from '../db/schema/index.js';
import type { CreateStockEntryDto } from './dto/create-stock-entry.dto.js';
import type { UpdateStockEntryDto } from './dto/update-stock-entry.dto.js';

export type StockEntry = typeof stockEntries.$inferSelect;

/**
 * H3 (spec 018). Igual que `BankAccountEntriesService`: sin regla de "una
 * entrada por acción" — H3 criterio 3 pide admitir varias compras de la
 * misma acción. `purchaseValue` no vive aquí — se calcula en el frontend
 * (y en `wealth.calculations.ts` si algún día un endpoint lo necesita),
 * nunca se guarda (plan.md §1).
 */
@Injectable()
export class StockEntriesService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(userId: string): Promise<StockEntry[]> {
    return this.db.query.stockEntries.findMany({
      where: eq(stockEntries.userId, userId),
      orderBy: [desc(stockEntries.createdAt)],
    });
  }

  async create(userId: string, dto: CreateStockEntryDto): Promise<StockEntry> {
    const [entry] = await this.db
      .insert(stockEntries)
      .values({
        userId,
        custodyBank: dto.custodyBank,
        stock: dto.stock,
        shareCount: dto.shareCount,
        purchasePrice: dto.purchasePrice,
        currentValuation: dto.currentValuation,
      })
      .returning();
    return entry;
  }

  async update(userId: string, id: string, dto: UpdateStockEntryDto): Promise<StockEntry> {
    await this.findOwnOrThrow(userId, id);

    const [updated] = await this.db
      .update(stockEntries)
      .set({
        ...(dto.custodyBank !== undefined && { custodyBank: dto.custodyBank }),
        ...(dto.stock !== undefined && { stock: dto.stock }),
        ...(dto.shareCount !== undefined && { shareCount: dto.shareCount }),
        ...(dto.purchasePrice !== undefined && { purchasePrice: dto.purchasePrice }),
        ...(dto.currentValuation !== undefined && { currentValuation: dto.currentValuation }),
        updatedAt: new Date(),
      })
      .where(eq(stockEntries.id, id))
      .returning();
    return updated;
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.findOwnOrThrow(userId, id);
    await this.db.delete(stockEntries).where(eq(stockEntries.id, id));
  }

  private async findOwnOrThrow(userId: string, id: string): Promise<StockEntry> {
    const entry = await this.db.query.stockEntries.findFirst({
      where: and(eq(stockEntries.id, id), eq(stockEntries.userId, userId)),
    });
    if (!entry) {
      throw new NotFoundException('Entrada de acciones no encontrada.');
    }
    return entry;
  }
}
