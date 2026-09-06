import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { desc, eq, inArray } from 'drizzle-orm';
import { DB } from '../db/db.module.js';
import type { Database } from '../db/db.module.js';
import { stockDividends, stocks } from '../db/schema/index.js';
import { StocksService } from './stocks.service.js';
import type { CreateStockDividendDto } from './dto/create-stock-dividend.dto.js';
import type { UpdateStockDividendDto } from './dto/update-stock-dividend.dto.js';

export type StockDividend = typeof stockDividends.$inferSelect;

/**
 * H1 (spec 029). `stockDividends` no lleva `userId` propio (esquema
 * normalizado) — el aislamiento por usuario pasa siempre por
 * `StocksService.findOwnOrThrow()` (reutilizado, no duplicado) — mismo
 * patrón que `StockPurchasesService`/`StockValuationsService`.
 */
@Injectable()
export class StockDividendsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly stocksService: StocksService,
  ) {}

  /** De la más reciente a la más antigua — mismo criterio que `StockPurchasesService.list()`. */
  async list(userId: string): Promise<StockDividend[]> {
    const ownStocks = await this.db.query.stocks.findMany({ where: eq(stocks.userId, userId), columns: { id: true } });
    if (ownStocks.length === 0) return [];

    return this.db.query.stockDividends.findMany({
      where: inArray(
        stockDividends.stockId,
        ownStocks.map((s) => s.id),
      ),
      orderBy: [desc(stockDividends.date), desc(stockDividends.createdAt)],
    });
  }

  /** H1 criterio 6: 404 si `stockId` no es una acción propia. */
  async create(userId: string, dto: CreateStockDividendDto): Promise<StockDividend> {
    await this.stocksService.findOwnOrThrow(userId, dto.stockId);

    const [dividend] = await this.db
      .insert(stockDividends)
      .values({
        stockId: dto.stockId,
        netAmount: dto.netAmount,
        date: dto.date,
        ...(dto.retentionPercent !== undefined && { retentionPercent: dto.retentionPercent }),
      })
      .returning();
    return dividend;
  }

  async update(userId: string, id: string, dto: UpdateStockDividendDto): Promise<StockDividend> {
    await this.findOwnOrThrow(userId, id);

    const [updated] = await this.db
      .update(stockDividends)
      .set({
        ...(dto.netAmount !== undefined && { netAmount: dto.netAmount }),
        ...(dto.retentionPercent !== undefined && { retentionPercent: dto.retentionPercent }),
        ...(dto.date !== undefined && { date: dto.date }),
        updatedAt: new Date(),
      })
      .where(eq(stockDividends.id, id))
      .returning();
    return updated;
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.findOwnOrThrow(userId, id);
    await this.db.delete(stockDividends).where(eq(stockDividends.id, id));
  }

  private async findOwnOrThrow(userId: string, id: string): Promise<StockDividend> {
    const dividend = await this.db.query.stockDividends.findFirst({ where: eq(stockDividends.id, id) });
    if (!dividend) {
      throw new NotFoundException('Dividendo no encontrado.');
    }
    await this.stocksService.findOwnOrThrow(userId, dividend.stockId);
    return dividend;
  }
}
