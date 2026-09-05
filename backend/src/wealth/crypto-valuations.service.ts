import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { desc, eq, inArray } from 'drizzle-orm';
import { DB } from '../db/db.module.js';
import type { Database } from '../db/db.module.js';
import { cryptoValuations, cryptos } from '../db/schema/index.js';
import { CryptosService } from './cryptos.service.js';
import type { CreateCryptoValuationDto } from './dto/create-crypto-valuation.dto.js';
import type { UpdateCryptoValuationDto } from './dto/update-crypto-valuation.dto.js';

export type CryptoValuation = typeof cryptoValuations.$inferSelect;

/**
 * H3 (spec 022). Mismo patrón que `CryptoPurchasesService`: sin `userId`
 * propio, aislamiento vía `CryptosService.findOwnOrThrow()`.
 */
@Injectable()
export class CryptoValuationsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly cryptosService: CryptosService,
  ) {}

  /** H3 criterio 4: de la más reciente a la más antigua, de todas las posiciones del usuario a la vez. */
  async list(userId: string): Promise<CryptoValuation[]> {
    const ownCryptos = await this.db.query.cryptos.findMany({ where: eq(cryptos.userId, userId), columns: { id: true } });
    if (ownCryptos.length === 0) return [];

    return this.db.query.cryptoValuations.findMany({
      where: inArray(
        cryptoValuations.cryptoId,
        ownCryptos.map((c) => c.id),
      ),
      orderBy: [desc(cryptoValuations.date), desc(cryptoValuations.createdAt)],
    });
  }

  /** H3 criterio 6: 404 si `cryptoId` no es una posición propia. */
  async create(userId: string, dto: CreateCryptoValuationDto): Promise<CryptoValuation> {
    await this.cryptosService.findOwnOrThrow(userId, dto.cryptoId);

    const [valuation] = await this.db
      .insert(cryptoValuations)
      .values({ cryptoId: dto.cryptoId, pricePerUnit: dto.pricePerUnit, date: dto.date })
      .returning();
    return valuation;
  }

  async update(userId: string, id: string, dto: UpdateCryptoValuationDto): Promise<CryptoValuation> {
    await this.findOwnOrThrow(userId, id);

    const [updated] = await this.db
      .update(cryptoValuations)
      .set({
        ...(dto.pricePerUnit !== undefined && { pricePerUnit: dto.pricePerUnit }),
        ...(dto.date !== undefined && { date: dto.date }),
        updatedAt: new Date(),
      })
      .where(eq(cryptoValuations.id, id))
      .returning();
    return updated;
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.findOwnOrThrow(userId, id);
    await this.db.delete(cryptoValuations).where(eq(cryptoValuations.id, id));
  }

  private async findOwnOrThrow(userId: string, id: string): Promise<CryptoValuation> {
    const valuation = await this.db.query.cryptoValuations.findFirst({ where: eq(cryptoValuations.id, id) });
    if (!valuation) {
      throw new NotFoundException('Valoración no encontrada.');
    }
    await this.cryptosService.findOwnOrThrow(userId, valuation.cryptoId);
    return valuation;
  }
}
