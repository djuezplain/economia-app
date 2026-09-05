import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, ne } from 'drizzle-orm';
import { DB } from '../db/db.module.js';
import type { Database } from '../db/db.module.js';
import { bankAccounts } from '../db/schema/index.js';
import type { CreateBankAccountDto } from './dto/create-bank-account.dto.js';
import type { UpdateBankAccountDto } from './dto/update-bank-account.dto.js';

export type BankAccount = typeof bankAccounts.$inferSelect;

/**
 * H1 (spec 019). Igual que `SavingsGoalsService`: ningún método acepta una
 * consulta sin `userId` explícito, y la regla de negocio "una cuenta no se
 * puede duplicar" se comprueba aquí (409), no con una constraint SQL.
 */
@Injectable()
export class BankAccountsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(userId: string): Promise<BankAccount[]> {
    return this.db.query.bankAccounts.findMany({ where: eq(bankAccounts.userId, userId) });
  }

  /** H1 criterio 2: 409 si ya existe una cuenta con el mismo banco + número de cuenta. */
  async create(userId: string, dto: CreateBankAccountDto): Promise<BankAccount> {
    await this.assertNotDuplicate(userId, dto.bank, dto.accountNumber);

    const [account] = await this.db
      .insert(bankAccounts)
      .values({ userId, bank: dto.bank, accountNumber: dto.accountNumber, alias: normalizeAlias(dto.alias) })
      .returning();
    return account;
  }

  /** H1 criterio 3: editable, repitiendo la comprobación de unicidad si cambia banco/número (plan.md §3). */
  async update(userId: string, id: string, dto: UpdateBankAccountDto): Promise<BankAccount> {
    const existing = await this.findOwnOrThrow(userId, id);

    if (dto.bank !== undefined || dto.accountNumber !== undefined) {
      await this.assertNotDuplicate(userId, dto.bank ?? existing.bank, dto.accountNumber ?? existing.accountNumber, id);
    }

    const [updated] = await this.db
      .update(bankAccounts)
      .set({
        ...(dto.bank !== undefined && { bank: dto.bank }),
        ...(dto.accountNumber !== undefined && { accountNumber: dto.accountNumber }),
        ...(dto.alias !== undefined && { alias: normalizeAlias(dto.alias) }),
        updatedAt: new Date(),
      })
      .where(eq(bankAccounts.id, id))
      .returning();
    return updated;
  }

  /** H1 criterio 4: el historial de saldos se borra en cascada (ON DELETE CASCADE), no hace falta borrarlo a mano aquí. */
  async remove(userId: string, id: string): Promise<void> {
    await this.findOwnOrThrow(userId, id);
    await this.db.delete(bankAccounts).where(eq(bankAccounts.id, id));
  }

  async findOwnOrThrow(userId: string, id: string): Promise<BankAccount> {
    const account = await this.db.query.bankAccounts.findFirst({
      where: and(eq(bankAccounts.id, id), eq(bankAccounts.userId, userId)),
    });
    if (!account) {
      throw new NotFoundException('Cuenta bancaria no encontrada.');
    }
    return account;
  }

  private async assertNotDuplicate(userId: string, bank: string, accountNumber: string, excludeId?: string): Promise<void> {
    const existing = await this.db.query.bankAccounts.findFirst({
      where: and(
        eq(bankAccounts.userId, userId),
        eq(bankAccounts.bank, bank),
        eq(bankAccounts.accountNumber, accountNumber),
        ...(excludeId ? [ne(bankAccounts.id, excludeId)] : []),
      ),
    });
    if (existing) {
      throw new ConflictException('Ya tienes registrada esa cuenta (mismo banco y número de cuenta). Añade el saldo dentro de ella.');
    }
  }
}

/** H1 criterio 2 (spec 021): una cadena vacía o solo espacios es "sin alias", no un alias vacío. */
function normalizeAlias(alias: string | undefined): string | null {
  const trimmed = alias?.trim();
  return trimmed ? trimmed : null;
}
