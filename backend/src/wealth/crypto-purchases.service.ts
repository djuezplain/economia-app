import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { desc, eq, inArray } from 'drizzle-orm';
import { DB } from '../db/db.module.js';
import type { Database } from '../db/db.module.js';
import { cryptoPurchases, cryptos } from '../db/schema/index.js';
import { CryptosService } from './cryptos.service.js';
import type { CreateCryptoPurchaseDto } from './dto/create-crypto-purchase.dto.js';
import type { UpdateCryptoPurchaseDto } from './dto/update-crypto-purchase.dto.js';

export type CryptoPurchase = typeof cryptoPurchases.$inferSelect;

/**
 * H2 (spec 022). `cryptoPurchases` no lleva `userId` propio (esquema
 * normalizado) — el aislamiento por usuario pasa siempre por
 * `CryptosService.findOwnOrThrow()` (reutilizado, no duplicado) — mismo
 * patrón que `StockPurchasesService`.
 */
@Injectable()
export class CryptoPurchasesService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly cryptosService: CryptosService,
  ) {}

  /** De la más reciente a la más antigua — mismo criterio que `CryptoValuationsService.list()`. */
  async list(userId: string): Promise<CryptoPurchase[]> {
    const ownCryptos = await this.db.query.cryptos.findMany({ where: eq(cryptos.userId, userId), columns: { id: true } });
    if (ownCryptos.length === 0) return [];

    return this.db.query.cryptoPurchases.findMany({
      where: inArray(
        cryptoPurchases.cryptoId,
        ownCryptos.map((c) => c.id),
      ),
      orderBy: [desc(cryptoPurchases.date), desc(cryptoPurchases.createdAt)],
    });
  }

  /** H2 criterio 6: 404 si `cryptoId` no es una posición propia. */
  async create(userId: string, dto: CreateCryptoPurchaseDto): Promise<CryptoPurchase> {
    await this.cryptosService.findOwnOrThrow(userId, dto.cryptoId);

    const [purchase] = await this.db
      .insert(cryptoPurchases)
      .values({ cryptoId: dto.cryptoId, quantity: dto.quantity, purchasePrice: dto.purchasePrice, date: dto.date })
      .returning();
    return purchase;
  }

  async update(userId: string, id: string, dto: UpdateCryptoPurchaseDto): Promise<CryptoPurchase> {
    await this.findOwnOrThrow(userId, id);

    const [updated] = await this.db
      .update(cryptoPurchases)
      .set({
        ...(dto.quantity !== undefined && { quantity: dto.quantity }),
        ...(dto.purchasePrice !== undefined && { purchasePrice: dto.purchasePrice }),
        ...(dto.date !== undefined && { date: dto.date }),
        updatedAt: new Date(),
      })
      .where(eq(cryptoPurchases.id, id))
      .returning();
    return updated;
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.findOwnOrThrow(userId, id);
    await this.db.delete(cryptoPurchases).where(eq(cryptoPurchases.id, id));
  }

  private async findOwnOrThrow(userId: string, id: string): Promise<CryptoPurchase> {
    const purchase = await this.db.query.cryptoPurchases.findFirst({ where: eq(cryptoPurchases.id, id) });
    if (!purchase) {
      throw new NotFoundException('Compra no encontrada.');
    }
    await this.cryptosService.findOwnOrThrow(userId, purchase.cryptoId);
    return purchase;
  }
}
