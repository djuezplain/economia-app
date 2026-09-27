import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { and, desc, eq, inArray, ne } from 'drizzle-orm';
import { DB } from '../db/db.module.js';
import type { Database } from '../db/db.module.js';
import { fundPurchases, fundSales, funds } from '../db/schema/index.js';
import { FundsService } from './funds.service.js';
import { totalShares } from './wealth.calculations.js';
import type { CreateFundPurchaseDto } from './dto/create-fund-purchase.dto.js';
import type { UpdateFundPurchaseDto } from './dto/update-fund-purchase.dto.js';

export type FundPurchase = typeof fundPurchases.$inferSelect;

/**
 * H2 (spec 021). `fundPurchases` no lleva `userId` propio (esquema
 * normalizado) — el aislamiento por usuario pasa siempre por
 * `FundsService.findOwnOrThrow()` (reutilizado, no duplicado) — mismo
 * patrón que `StockPurchasesService` (spec 020).
 */
@Injectable()
export class FundPurchasesService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly fundsService: FundsService,
  ) {}

  /** De la más reciente a la más antigua — mismo criterio que `FundValuationsService.list()`. */
  async list(userId: string): Promise<FundPurchase[]> {
    const ownFunds = await this.db.query.funds.findMany({ where: eq(funds.userId, userId), columns: { id: true } });
    if (ownFunds.length === 0) return [];

    return this.db.query.fundPurchases.findMany({
      where: inArray(
        fundPurchases.fundId,
        ownFunds.map((f) => f.id),
      ),
      orderBy: [desc(fundPurchases.date), desc(fundPurchases.createdAt)],
    });
  }

  /** H2 criterio 6: 404 si `fundId` no es un fondo propio. */
  async create(userId: string, dto: CreateFundPurchaseDto): Promise<FundPurchase> {
    await this.fundsService.findOwnOrThrow(userId, dto.fundId);

    const [purchase] = await this.db
      .insert(fundPurchases)
      .values({ fundId: dto.fundId, shareCount: dto.shareCount, purchasePrice: dto.purchasePrice, date: dto.date })
      .returning();
    return purchase;
  }

  async update(userId: string, id: string, dto: UpdateFundPurchaseDto): Promise<FundPurchase> {
    const existing = await this.findOwnOrThrow(userId, id);
    if (dto.shareCount !== undefined) {
      await this.assertSalesStillCovered(existing.fundId, id, dto.shareCount);
    }

    const [updated] = await this.db
      .update(fundPurchases)
      .set({
        ...(dto.shareCount !== undefined && { shareCount: dto.shareCount }),
        ...(dto.purchasePrice !== undefined && { purchasePrice: dto.purchasePrice }),
        ...(dto.date !== undefined && { date: dto.date }),
        updatedAt: new Date(),
      })
      .where(eq(fundPurchases.id, id))
      .returning();
    return updated;
  }

  async remove(userId: string, id: string): Promise<void> {
    const existing = await this.findOwnOrThrow(userId, id);
    await this.assertSalesStillCovered(existing.fundId, id, '0');
    await this.db.delete(fundPurchases).where(eq(fundPurchases.id, id));
  }

  /**
   * H1 criterio 4 (spec 044): editar (bajando la cantidad) o eliminar una compra no puede dejar
   * una venta ya registrada sin participaciones suficientes que cubrirla. `newShareCount` es la
   * cantidad que tendría ESTA compra tras el cambio ('0' al eliminarla, equivalente a no contarla).
   * Salta la comprobación entera si el `fundId` no tiene ninguna venta (plan.md §2, caso común sin
   * coste extra). Mismo criterio que `StockPurchasesService.assertSalesStillCovered` (spec 031).
   */
  private async assertSalesStillCovered(fundId: string, purchaseId: string, newShareCount: string): Promise<void> {
    const salesOfFund = await this.db.query.fundSales.findMany({ where: eq(fundSales.fundId, fundId) });
    if (salesOfFund.length === 0) return;

    const otherPurchases = await this.db.query.fundPurchases.findMany({
      where: and(eq(fundPurchases.fundId, fundId), ne(fundPurchases.id, purchaseId)),
    });
    const purchasedAfterChange = new Decimal(totalShares(otherPurchases)).plus(newShareCount);
    const sold = new Decimal(totalShares(salesOfFund));
    if (sold.greaterThan(purchasedAfterChange)) {
      throw new BadRequestException(
        `No se puede aplicar este cambio: dejaría ${sold.toFixed(8)} participaciones vendidas sin cubrir (solo quedarían ${purchasedAfterChange.toFixed(8)} compradas).`,
      );
    }
  }

  private async findOwnOrThrow(userId: string, id: string): Promise<FundPurchase> {
    const purchase = await this.db.query.fundPurchases.findFirst({ where: eq(fundPurchases.id, id) });
    if (!purchase) {
      throw new NotFoundException('Compra no encontrada.');
    }
    await this.fundsService.findOwnOrThrow(userId, purchase.fundId);
    return purchase;
  }
}
