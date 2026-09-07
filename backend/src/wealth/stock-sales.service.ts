import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { desc, eq, inArray } from 'drizzle-orm';
import { DB } from '../db/db.module.js';
import type { Database } from '../db/db.module.js';
import { stockPurchases, stockSales, stocks } from '../db/schema/index.js';
import { StocksService } from './stocks.service.js';
import { totalShares } from './wealth.calculations.js';
import type { CreateStockSaleDto } from './dto/create-stock-sale.dto.js';
import type { UpdateStockSaleDto } from './dto/update-stock-sale.dto.js';

export type StockSale = typeof stockSales.$inferSelect;

/**
 * H1 (spec 031). `stockSales` no lleva `userId` propio (esquema
 * normalizado) — el aislamiento por usuario pasa siempre por
 * `StocksService.findOwnOrThrow()` (reutilizado, no duplicado) — mismo
 * patrón que `StockPurchasesService`/`StockDividendsService`.
 */
@Injectable()
export class StockSalesService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly stocksService: StocksService,
  ) {}

  /** De la más reciente a la más antigua — mismo criterio que `StockPurchasesService.list()`. */
  async list(userId: string): Promise<StockSale[]> {
    const ownStocks = await this.db.query.stocks.findMany({ where: eq(stocks.userId, userId), columns: { id: true } });
    if (ownStocks.length === 0) return [];

    return this.db.query.stockSales.findMany({
      where: inArray(
        stockSales.stockId,
        ownStocks.map((s) => s.id),
      ),
      orderBy: [desc(stockSales.date), desc(stockSales.createdAt)],
    });
  }

  /** H1 criterio 5: 404 si `stockId` no es una acción propia. H1 criterio 2: 400 si no quedan
   *  suficientes acciones en cartera (plan.md §2 — resta de totales, sin FIFO: la fecha de la
   *  venta no importa para esta comprobación). */
  async create(userId: string, dto: CreateStockSaleDto): Promise<StockSale> {
    await this.stocksService.findOwnOrThrow(userId, dto.stockId);
    await this.assertEnoughSharesHeld(dto.stockId, dto.shareCount);

    const [sale] = await this.db
      .insert(stockSales)
      .values({ stockId: dto.stockId, shareCount: dto.shareCount, salePrice: dto.salePrice, date: dto.date })
      .returning();
    return sale;
  }

  async update(userId: string, id: string, dto: UpdateStockSaleDto): Promise<StockSale> {
    const existing = await this.findOwnOrThrow(userId, id);
    if (dto.shareCount !== undefined) {
      await this.assertEnoughSharesHeld(existing.stockId, dto.shareCount, id);
    }

    const [updated] = await this.db
      .update(stockSales)
      .set({
        ...(dto.shareCount !== undefined && { shareCount: dto.shareCount }),
        ...(dto.salePrice !== undefined && { salePrice: dto.salePrice }),
        ...(dto.date !== undefined && { date: dto.date }),
        updatedAt: new Date(),
      })
      .where(eq(stockSales.id, id))
      .returning();
    return updated;
  }

  /** H1 criterio 4: eliminar una venta nunca deja "menos cartera" (solo puede aumentarla) —
   *  ninguna comprobación de cantidad hace falta aquí, a diferencia de `create()`/`update()`. */
  async remove(userId: string, id: string): Promise<void> {
    await this.findOwnOrThrow(userId, id);
    await this.db.delete(stockSales).where(eq(stockSales.id, id));
  }

  /**
   * plan.md §2: cartera = total comprado − total ya vendido (excluyendo, al editar, la propia
   * venta que se está editando). Reutilizada también por `StockPurchasesService` (T2.2) al
   * editar/eliminar una compra, para comprobarlo desde el otro lado.
   */
  private async assertEnoughSharesHeld(stockId: string, shareCountBeingSold: string, excludeSaleId?: string): Promise<void> {
    const [purchasesOfStock, salesOfStock] = await Promise.all([
      this.db.query.stockPurchases.findMany({ where: eq(stockPurchases.stockId, stockId) }),
      this.db.query.stockSales.findMany({ where: eq(stockSales.stockId, stockId) }),
    ]);
    const otherSales = salesOfStock.filter((s) => s.id !== excludeSaleId);
    const held = new Decimal(totalShares(purchasesOfStock)).minus(totalShares(otherSales));
    if (new Decimal(shareCountBeingSold).greaterThan(held)) {
      throw new BadRequestException(`No puedes vender ${shareCountBeingSold} acciones: solo quedan ${held.toFixed(8)} en cartera.`);
    }
  }

  private async findOwnOrThrow(userId: string, id: string): Promise<StockSale> {
    const sale = await this.db.query.stockSales.findFirst({ where: eq(stockSales.id, id) });
    if (!sale) {
      throw new NotFoundException('Venta no encontrada.');
    }
    await this.stocksService.findOwnOrThrow(userId, sale.stockId);
    return sale;
  }
}
