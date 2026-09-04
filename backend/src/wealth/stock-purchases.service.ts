import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { desc, eq, inArray } from 'drizzle-orm';
import { DB } from '../db/db.module.js';
import type { Database } from '../db/db.module.js';
import { stockPurchases, stocks } from '../db/schema/index.js';
import { StocksService } from './stocks.service.js';
import type { CreateStockPurchaseDto } from './dto/create-stock-purchase.dto.js';
import type { UpdateStockPurchaseDto } from './dto/update-stock-purchase.dto.js';

export type StockPurchase = typeof stockPurchases.$inferSelect;

/**
 * H2 (spec 020). `stockPurchases` no lleva `userId` propio (esquema
 * normalizado, plan.md §1) — el aislamiento por usuario pasa siempre por
 * `StocksService.findOwnOrThrow()` (reutilizado, no duplicado) — mismo
 * patrón que `BankAccountBalancesService` (spec 019).
 */
@Injectable()
export class StockPurchasesService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly stocksService: StocksService,
  ) {}

  /** De la más reciente a la más antigua — mismo criterio que `StockValuationsService.list()`. */
  async list(userId: string): Promise<StockPurchase[]> {
    const ownStocks = await this.db.query.stocks.findMany({ where: eq(stocks.userId, userId), columns: { id: true } });
    if (ownStocks.length === 0) return [];

    return this.db.query.stockPurchases.findMany({
      where: inArray(
        stockPurchases.stockId,
        ownStocks.map((s) => s.id),
      ),
      orderBy: [desc(stockPurchases.date), desc(stockPurchases.createdAt)],
    });
  }

  /** H2 criterio 6: 404 si `stockId` no es una acción propia. */
  async create(userId: string, dto: CreateStockPurchaseDto): Promise<StockPurchase> {
    await this.stocksService.findOwnOrThrow(userId, dto.stockId);

    const [purchase] = await this.db
      .insert(stockPurchases)
      .values({ stockId: dto.stockId, shareCount: dto.shareCount, purchasePrice: dto.purchasePrice, date: dto.date })
      .returning();
    return purchase;
  }

  async update(userId: string, id: string, dto: UpdateStockPurchaseDto): Promise<StockPurchase> {
    await this.findOwnOrThrow(userId, id);

    const [updated] = await this.db
      .update(stockPurchases)
      .set({
        ...(dto.shareCount !== undefined && { shareCount: dto.shareCount }),
        ...(dto.purchasePrice !== undefined && { purchasePrice: dto.purchasePrice }),
        ...(dto.date !== undefined && { date: dto.date }),
        updatedAt: new Date(),
      })
      .where(eq(stockPurchases.id, id))
      .returning();
    return updated;
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.findOwnOrThrow(userId, id);
    await this.db.delete(stockPurchases).where(eq(stockPurchases.id, id));
  }

  private async findOwnOrThrow(userId: string, id: string): Promise<StockPurchase> {
    const purchase = await this.db.query.stockPurchases.findFirst({ where: eq(stockPurchases.id, id) });
    if (!purchase) {
      throw new NotFoundException('Compra no encontrada.');
    }
    await this.stocksService.findOwnOrThrow(userId, purchase.stockId);
    return purchase;
  }
}
