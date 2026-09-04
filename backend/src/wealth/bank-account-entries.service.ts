import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { DB } from '../db/db.module.js';
import type { Database } from '../db/db.module.js';
import { bankAccountEntries } from '../db/schema/index.js';
import type { CreateBankAccountEntryDto } from './dto/create-bank-account-entry.dto.js';
import type { UpdateBankAccountEntryDto } from './dto/update-bank-account-entry.dto.js';

export type BankAccountEntry = typeof bankAccountEntries.$inferSelect;

/**
 * H2 (spec 018). Igual que `SavingsGoalsService`: ningún método acepta una
 * consulta sin `userId` explícito (aislamiento por usuario, constitution
 * §2). Sin regla de "una entrada por cuenta" — H2 criterio 2 pide
 * explícitamente admitir varias entradas del mismo banco/cuenta.
 */
@Injectable()
export class BankAccountEntriesService {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** H2 criterio 4: de la más reciente a la más antigua por fecha. */
  async list(userId: string): Promise<BankAccountEntry[]> {
    return this.db.query.bankAccountEntries.findMany({
      where: eq(bankAccountEntries.userId, userId),
      orderBy: [desc(bankAccountEntries.date), desc(bankAccountEntries.createdAt)],
    });
  }

  async create(userId: string, dto: CreateBankAccountEntryDto): Promise<BankAccountEntry> {
    const [entry] = await this.db
      .insert(bankAccountEntries)
      .values({ userId, bank: dto.bank, accountNumber: dto.accountNumber, euros: dto.euros, date: dto.date })
      .returning();
    return entry;
  }

  async update(userId: string, id: string, dto: UpdateBankAccountEntryDto): Promise<BankAccountEntry> {
    await this.findOwnOrThrow(userId, id);

    const [updated] = await this.db
      .update(bankAccountEntries)
      .set({
        ...(dto.bank !== undefined && { bank: dto.bank }),
        ...(dto.accountNumber !== undefined && { accountNumber: dto.accountNumber }),
        ...(dto.euros !== undefined && { euros: dto.euros }),
        ...(dto.date !== undefined && { date: dto.date }),
        updatedAt: new Date(),
      })
      .where(eq(bankAccountEntries.id, id))
      .returning();
    return updated;
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.findOwnOrThrow(userId, id);
    await this.db.delete(bankAccountEntries).where(eq(bankAccountEntries.id, id));
  }

  private async findOwnOrThrow(userId: string, id: string): Promise<BankAccountEntry> {
    const entry = await this.db.query.bankAccountEntries.findFirst({
      where: and(eq(bankAccountEntries.id, id), eq(bankAccountEntries.userId, userId)),
    });
    if (!entry) {
      throw new NotFoundException('Entrada de cuenta bancaria no encontrada.');
    }
    return entry;
  }
}
