import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, ne } from 'drizzle-orm';
import { DB } from '../db/db.module.js';
import type { Database } from '../db/db.module.js';
import { cryptos } from '../db/schema/index.js';
import type { CreateCryptoDto } from './dto/create-crypto.dto.js';
import type { UpdateCryptoDto } from './dto/update-crypto.dto.js';

export type Crypto = typeof cryptos.$inferSelect;

/**
 * H1 (spec 022). Igual que `StocksService` (spec 020): ningún método acepta
 * una consulta sin `userId` explícito, y "misma posición dos veces" se
 * comprueba aquí (409), no con una constraint SQL.
 */
@Injectable()
export class CryptosService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(userId: string): Promise<Crypto[]> {
    return this.db.query.cryptos.findMany({ where: eq(cryptos.userId, userId) });
  }

  /** H1 criterio 2: 409 si ya existe una posición con el mismo exchange/wallet + criptomoneda. */
  async create(userId: string, dto: CreateCryptoDto): Promise<Crypto> {
    await this.assertNotDuplicate(userId, dto.exchange, dto.crypto);

    const [crypto] = await this.db.insert(cryptos).values({ userId, exchange: dto.exchange, crypto: dto.crypto }).returning();
    return crypto;
  }

  /** H1 criterio 3: editable, repitiendo la comprobación de unicidad si cambia exchange/wallet o criptomoneda. */
  async update(userId: string, id: string, dto: UpdateCryptoDto): Promise<Crypto> {
    const existing = await this.findOwnOrThrow(userId, id);

    if (dto.exchange !== undefined || dto.crypto !== undefined) {
      await this.assertNotDuplicate(userId, dto.exchange ?? existing.exchange, dto.crypto ?? existing.crypto, id);
    }

    const [updated] = await this.db
      .update(cryptos)
      .set({
        ...(dto.exchange !== undefined && { exchange: dto.exchange }),
        ...(dto.crypto !== undefined && { crypto: dto.crypto }),
        updatedAt: new Date(),
      })
      .where(eq(cryptos.id, id))
      .returning();
    return updated;
  }

  /** H1 criterio 4: los historiales de compras y valoraciones se borran en cascada (ON DELETE CASCADE). */
  async remove(userId: string, id: string): Promise<void> {
    await this.findOwnOrThrow(userId, id);
    await this.db.delete(cryptos).where(eq(cryptos.id, id));
  }

  async findOwnOrThrow(userId: string, id: string): Promise<Crypto> {
    const crypto = await this.db.query.cryptos.findFirst({ where: and(eq(cryptos.id, id), eq(cryptos.userId, userId)) });
    if (!crypto) {
      throw new NotFoundException('Criptomoneda no encontrada.');
    }
    return crypto;
  }

  private async assertNotDuplicate(userId: string, exchange: string, crypto: string, excludeId?: string): Promise<void> {
    const existing = await this.db.query.cryptos.findFirst({
      where: and(
        eq(cryptos.userId, userId),
        eq(cryptos.exchange, exchange),
        eq(cryptos.crypto, crypto),
        ...(excludeId ? [ne(cryptos.id, excludeId)] : []),
      ),
    });
    if (existing) {
      throw new ConflictException(
        'Ya tienes registrada esa criptomoneda (mismo exchange/wallet y criptomoneda). Añade la compra o valoración dentro de ella.',
      );
    }
  }
}
