import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { desc, eq, inArray } from 'drizzle-orm';
import { DB } from '../db/db.module.js';
import type { Database } from '../db/db.module.js';
import { bankAccountBalances, bankAccounts } from '../db/schema/index.js';
import { BankAccountsService } from './bank-accounts.service.js';
import type { CreateBankAccountBalanceDto } from './dto/create-bank-account-balance.dto.js';
import type { UpdateBankAccountBalanceDto } from './dto/update-bank-account-balance.dto.js';

export type BankAccountBalance = typeof bankAccountBalances.$inferSelect;

/**
 * H2 (spec 019). `bankAccountBalances` no lleva `userId` propio (esquema
 * normalizado, plan.md §1) — el aislamiento por usuario pasa siempre por
 * `BankAccountsService.findOwnOrThrow()` (reutilizado, no duplicado) contra
 * la cuenta a la que pertenece cada entrada.
 */
@Injectable()
export class BankAccountBalancesService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly bankAccountsService: BankAccountsService,
  ) {}

  /** H2 criterio 4: de la más reciente a la más antigua, de todas las cuentas del usuario a la vez. */
  async list(userId: string): Promise<BankAccountBalance[]> {
    const accounts = await this.db.query.bankAccounts.findMany({
      where: eq(bankAccounts.userId, userId),
      columns: { id: true },
    });
    if (accounts.length === 0) return [];

    return this.db.query.bankAccountBalances.findMany({
      where: inArray(
        bankAccountBalances.bankAccountId,
        accounts.map((a) => a.id),
      ),
      orderBy: [desc(bankAccountBalances.date), desc(bankAccountBalances.createdAt)],
    });
  }

  /** H2 criterio 6: 404 si `bankAccountId` no es una cuenta propia — nunca se crea un saldo sobre una cuenta ajena. */
  async create(userId: string, dto: CreateBankAccountBalanceDto): Promise<BankAccountBalance> {
    await this.bankAccountsService.findOwnOrThrow(userId, dto.bankAccountId);

    const [balance] = await this.db
      .insert(bankAccountBalances)
      .values({ bankAccountId: dto.bankAccountId, euros: dto.euros, date: dto.date })
      .returning();
    return balance;
  }

  async update(userId: string, id: string, dto: UpdateBankAccountBalanceDto): Promise<BankAccountBalance> {
    await this.findOwnOrThrow(userId, id);

    const [updated] = await this.db
      .update(bankAccountBalances)
      .set({
        ...(dto.euros !== undefined && { euros: dto.euros }),
        ...(dto.date !== undefined && { date: dto.date }),
        updatedAt: new Date(),
      })
      .where(eq(bankAccountBalances.id, id))
      .returning();
    return updated;
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.findOwnOrThrow(userId, id);
    await this.db.delete(bankAccountBalances).where(eq(bankAccountBalances.id, id));
  }

  private async findOwnOrThrow(userId: string, id: string): Promise<BankAccountBalance> {
    const balance = await this.db.query.bankAccountBalances.findFirst({ where: eq(bankAccountBalances.id, id) });
    if (!balance) {
      throw new NotFoundException('Entrada de saldo no encontrada.');
    }
    // 404 (no 403) si la cuenta a la que pertenece no es del usuario — mismo criterio de no revelar existencia.
    await this.bankAccountsService.findOwnOrThrow(userId, balance.bankAccountId);
    return balance;
  }
}
