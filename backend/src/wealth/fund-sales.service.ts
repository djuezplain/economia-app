import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { desc, eq, inArray } from 'drizzle-orm';
import { DB } from '../db/db.module.js';
import type { Database } from '../db/db.module.js';
import { fundPurchases, fundSales, funds } from '../db/schema/index.js';
import { FundsService } from './funds.service.js';
import { totalShares } from './wealth.calculations.js';
import type { CreateFundSaleDto } from './dto/create-fund-sale.dto.js';
import type { UpdateFundSaleDto } from './dto/update-fund-sale.dto.js';

export type FundSale = typeof fundSales.$inferSelect;

/**
 * H1 (spec 044), mismo patrón que `StockSalesService` (spec 031).
 * `fundSales` no lleva `userId` propio (esquema normalizado) — el
 * aislamiento por usuario pasa siempre por `FundsService.findOwnOrThrow()`
 * (reutilizado, no duplicado).
 */
@Injectable()
export class FundSalesService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly fundsService: FundsService,
  ) {}

  /** De la más reciente a la más antigua — mismo criterio que `FundPurchasesService.list()`. */
  async list(userId: string): Promise<FundSale[]> {
    const ownFunds = await this.db.query.funds.findMany({ where: eq(funds.userId, userId), columns: { id: true } });
    if (ownFunds.length === 0) return [];

    return this.db.query.fundSales.findMany({
      where: inArray(
        fundSales.fundId,
        ownFunds.map((f) => f.id),
      ),
      orderBy: [desc(fundSales.date), desc(fundSales.createdAt)],
    });
  }

  /** H1 criterio 5: 404 si `fundId` no es un fondo propio. H1 criterio 2: 400 si no quedan
   *  suficientes participaciones en cartera (plan.md §2 — resta de totales, sin FIFO). */
  async create(userId: string, dto: CreateFundSaleDto): Promise<FundSale> {
    await this.fundsService.findOwnOrThrow(userId, dto.fundId);
    await this.assertEnoughSharesHeld(dto.fundId, dto.shareCount);

    const [sale] = await this.db
      .insert(fundSales)
      .values({ fundId: dto.fundId, shareCount: dto.shareCount, salePrice: dto.salePrice, date: dto.date })
      .returning();
    return sale;
  }

  async update(userId: string, id: string, dto: UpdateFundSaleDto): Promise<FundSale> {
    const existing = await this.findOwnOrThrow(userId, id);
    if (dto.shareCount !== undefined) {
      await this.assertEnoughSharesHeld(existing.fundId, dto.shareCount, id);
    }

    const [updated] = await this.db
      .update(fundSales)
      .set({
        ...(dto.shareCount !== undefined && { shareCount: dto.shareCount }),
        ...(dto.salePrice !== undefined && { salePrice: dto.salePrice }),
        ...(dto.date !== undefined && { date: dto.date }),
        updatedAt: new Date(),
      })
      .where(eq(fundSales.id, id))
      .returning();
    return updated;
  }

  /** H1 criterio 4: eliminar una venta nunca deja "menos cartera" — ninguna comprobación de
   *  cantidad hace falta aquí, a diferencia de `create()`/`update()`. */
  async remove(userId: string, id: string): Promise<void> {
    await this.findOwnOrThrow(userId, id);
    await this.db.delete(fundSales).where(eq(fundSales.id, id));
  }

  /**
   * plan.md §2: cartera = total comprado − total ya vendido (excluyendo, al editar, la propia
   * venta que se está editando). Reutilizada también por `FundPurchasesService` al editar/eliminar
   * una compra, para comprobarlo desde el otro lado.
   */
  private async assertEnoughSharesHeld(fundId: string, shareCountBeingSold: string, excludeSaleId?: string): Promise<void> {
    const [purchasesOfFund, salesOfFund] = await Promise.all([
      this.db.query.fundPurchases.findMany({ where: eq(fundPurchases.fundId, fundId) }),
      this.db.query.fundSales.findMany({ where: eq(fundSales.fundId, fundId) }),
    ]);
    const otherSales = salesOfFund.filter((s) => s.id !== excludeSaleId);
    const held = new Decimal(totalShares(purchasesOfFund)).minus(totalShares(otherSales));
    if (new Decimal(shareCountBeingSold).greaterThan(held)) {
      throw new BadRequestException(`No puedes vender ${shareCountBeingSold} participaciones: solo quedan ${held.toFixed(8)} en cartera.`);
    }
  }

  private async findOwnOrThrow(userId: string, id: string): Promise<FundSale> {
    const sale = await this.db.query.fundSales.findFirst({ where: eq(fundSales.id, id) });
    if (!sale) {
      throw new NotFoundException('Venta no encontrada.');
    }
    await this.fundsService.findOwnOrThrow(userId, sale.fundId);
    return sale;
  }
}
