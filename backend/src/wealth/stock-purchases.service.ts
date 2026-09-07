import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { and, desc, eq, inArray, ne } from 'drizzle-orm';
import { DB } from '../db/db.module.js';
import type { Database } from '../db/db.module.js';
import { stockPurchases, stockSales, stocks } from '../db/schema/index.js';
import { StocksService } from './stocks.service.js';
import { totalShares } from './wealth.calculations.js';
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
    const existing = await this.findOwnOrThrow(userId, id);
    if (dto.shareCount !== undefined) {
      await this.assertSalesStillCovered(existing.stockId, id, dto.shareCount);
    }

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
    const existing = await this.findOwnOrThrow(userId, id);
    await this.assertSalesStillCovered(existing.stockId, id, '0');
    await this.db.delete(stockPurchases).where(eq(stockPurchases.id, id));
  }

  /**
   * H1 criterio 4 (spec 031): editar (bajando la cantidad) o eliminar una compra no puede dejar
   * una venta ya registrada sin acciones suficientes que cubrirla. `newShareCount` es la cantidad
   * que tendría ESTA compra tras el cambio ('0' al eliminarla, equivalente a no contarla).
   * Salta la comprobación entera si el `stockId` no tiene ninguna venta (plan.md §2, caso común
   * sin coste extra).
   */
  private async assertSalesStillCovered(stockId: string, purchaseId: string, newShareCount: string): Promise<void> {
    const salesOfStock = await this.db.query.stockSales.findMany({ where: eq(stockSales.stockId, stockId) });
    if (salesOfStock.length === 0) return;

    const otherPurchases = await this.db.query.stockPurchases.findMany({
      where: and(eq(stockPurchases.stockId, stockId), ne(stockPurchases.id, purchaseId)),
    });
    const purchasedAfterChange = new Decimal(totalShares(otherPurchases)).plus(newShareCount);
    const sold = new Decimal(totalShares(salesOfStock));
    if (sold.greaterThan(purchasedAfterChange)) {
      throw new BadRequestException(
        `No se puede aplicar este cambio: dejaría ${sold.toFixed(8)} acciones vendidas sin cubrir (solo quedarían ${purchasedAfterChange.toFixed(8)} compradas).`,
      );
    }
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
