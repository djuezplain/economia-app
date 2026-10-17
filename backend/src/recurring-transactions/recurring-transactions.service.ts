import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, gte, lte } from 'drizzle-orm';
import { DB } from '../db/db.module.js';
import type { Database } from '../db/db.module.js';
import { recurringOccurrenceResolutions, recurringTransactions, transactions } from '../db/schema/index.js';
import { TransactionsService } from '../transactions/transactions.service.js';
import type { Transaction } from '../transactions/transactions.service.js';
import { occurrencesBetween } from './recurring.calculations.js';
import type { CreateRecurringTransactionDto } from './dto/create-recurring-transaction.dto.js';
import type { UpdateRecurringTransactionDto } from './dto/update-recurring-transaction.dto.js';

export type RecurringTransaction = typeof recurringTransactions.$inferSelect;

/** Estado de una ocurrencia calculada (spec 047, H2/H3). */
export type OccurrenceStatus = 'PENDING' | 'OVERDUE' | 'CONFIRMED' | 'SKIPPED';

export interface Occurrence {
  recurringId: string;
  date: string;
  status: OccurrenceStatus;
  transactionId: string | null;
  type: RecurringTransaction['type'];
  categoryId: string;
  subcategoryId: string | null;
  concept: string;
  merchant: string | null;
  amount: string;
  paymentMethod: RecurringTransaction['paymentMethod'];
}

/** Rango máximo de `GET /occurrences` (plan.md §2). */
const MAX_RANGE_DAYS = 366;
const DAY_MS = 24 * 60 * 60 * 1000;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS;
}

/**
 * Spec 047. Igual que `TransactionsService`: ningún método acepta una
 * consulta sin `userId` explícito (aislamiento por usuario, constitution §2).
 */
@Injectable()
export class RecurringTransactionsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly transactionsService: TransactionsService,
  ) {}

  list(userId: string): Promise<RecurringTransaction[]> {
    return this.db.query.recurringTransactions.findMany({
      where: eq(recurringTransactions.userId, userId),
      orderBy: (t, { asc }) => [asc(t.concept), asc(t.createdAt)],
    });
  }

  async create(userId: string, dto: CreateRecurringTransactionDto): Promise<RecurringTransaction> {
    this.transactionsService.assertExpenseOnlyFields(dto.type, dto);
    await this.transactionsService.validateCategoryAssignment(userId, dto.type, dto.categoryId, dto.subcategoryId);
    this.assertDateRange(dto.startDate, dto.endDate ?? null);

    const [created] = await this.db
      .insert(recurringTransactions)
      .values({
        userId,
        type: dto.type,
        categoryId: dto.categoryId,
        subcategoryId: dto.subcategoryId ?? null,
        concept: dto.concept,
        merchant: dto.merchant ?? null,
        amount: dto.amount,
        paymentMethod: dto.paymentMethod ?? null,
        frequency: dto.frequency,
        startDate: dto.startDate,
        endDate: dto.endDate ?? null,
      })
      .returning();
    return created;
  }

  async update(userId: string, id: string, dto: UpdateRecurringTransactionDto): Promise<RecurringTransaction> {
    const existing = await this.findOwnOrThrow(userId, id);
    this.transactionsService.assertExpenseOnlyFields(existing.type, dto);

    if (dto.categoryId || dto.subcategoryId !== undefined) {
      await this.transactionsService.validateCategoryAssignment(
        userId,
        existing.type,
        dto.categoryId ?? existing.categoryId,
        dto.subcategoryId !== undefined ? dto.subcategoryId : (existing.subcategoryId ?? undefined),
      );
    }
    this.assertDateRange(
      dto.startDate ?? existing.startDate,
      dto.endDate !== undefined ? dto.endDate : existing.endDate,
    );

    // Solo toca la plantilla: los movimientos ya confirmados son copias
    // independientes (spec 047, "la plantilla solo afecta a los futuros").
    const [updated] = await this.db
      .update(recurringTransactions)
      .set({
        ...(dto.categoryId !== undefined && { categoryId: dto.categoryId }),
        ...(dto.subcategoryId !== undefined && { subcategoryId: dto.subcategoryId }),
        ...(dto.concept !== undefined && { concept: dto.concept }),
        ...(dto.merchant !== undefined && { merchant: dto.merchant }),
        ...(dto.amount !== undefined && { amount: dto.amount }),
        ...(dto.paymentMethod !== undefined && { paymentMethod: dto.paymentMethod }),
        ...(dto.frequency !== undefined && { frequency: dto.frequency }),
        ...(dto.startDate !== undefined && { startDate: dto.startDate }),
        ...(dto.endDate !== undefined && { endDate: dto.endDate }),
        ...(dto.active !== undefined && { active: dto.active }),
        updatedAt: new Date(),
      })
      .where(eq(recurringTransactions.id, id))
      .returning();
    return updated;
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.findOwnOrThrow(userId, id);
    // Las resoluciones caen en cascada; los movimientos confirmados no se tocan.
    await this.db.delete(recurringTransactions).where(eq(recurringTransactions.id, id));
  }

  /** Spec 047, H2: ocurrencias calculadas de las plantillas activas, con su estado. */
  async occurrences(userId: string, from: string, to: string): Promise<Occurrence[]> {
    if (from > to) throw new BadRequestException('El rango de fechas no es válido: "from" es posterior a "to".');
    if (daysBetween(from, to) > MAX_RANGE_DAYS - 1) {
      throw new BadRequestException(`El rango no puede superar ${MAX_RANGE_DAYS} días.`);
    }

    const templates = await this.db.query.recurringTransactions.findMany({
      where: and(eq(recurringTransactions.userId, userId), eq(recurringTransactions.active, true)),
    });
    if (templates.length === 0) return [];

    const resolutions = await this.db
      .select({
        recurringId: recurringOccurrenceResolutions.recurringId,
        occurrenceDate: recurringOccurrenceResolutions.occurrenceDate,
        status: recurringOccurrenceResolutions.status,
        transactionId: recurringOccurrenceResolutions.transactionId,
      })
      .from(recurringOccurrenceResolutions)
      .innerJoin(recurringTransactions, eq(recurringTransactions.id, recurringOccurrenceResolutions.recurringId))
      .where(
        and(
          eq(recurringTransactions.userId, userId),
          gte(recurringOccurrenceResolutions.occurrenceDate, from),
          lte(recurringOccurrenceResolutions.occurrenceDate, to),
        ),
      );
    const resolutionByKey = new Map(resolutions.map((r) => [`${r.recurringId}|${r.occurrenceDate}`, r]));

    const today = todayIso();
    const result: Occurrence[] = [];
    for (const t of templates) {
      for (const date of occurrencesBetween(t, from, to)) {
        const resolution = resolutionByKey.get(`${t.id}|${date}`);
        result.push({
          recurringId: t.id,
          date,
          status: resolution?.status ?? (date < today ? 'OVERDUE' : 'PENDING'),
          transactionId: resolution?.transactionId ?? null,
          type: t.type,
          categoryId: t.categoryId,
          subcategoryId: t.subcategoryId,
          concept: t.concept,
          merchant: t.merchant,
          amount: t.amount,
          paymentMethod: t.paymentMethod,
        });
      }
    }
    return result.sort((a, b) => a.date.localeCompare(b.date) || a.concept.localeCompare(b.concept));
  }

  /**
   * Spec 047, H3. Idempotente: la PK (`recurring_id`, `occurrence_date`) de la
   * resolución se reserva primero, dentro de la misma transacción de BD que
   * el movimiento; una segunda confirmación (o una carrera entre dos) no
   * inserta nada y devuelve el movimiento ya creado.
   */
  async confirm(userId: string, id: string, date: string, amount?: string): Promise<Transaction> {
    const template = await this.findOwnOrThrow(userId, id);
    this.assertIsOccurrence(template, date);

    const created = await this.db.transaction(async (tx) => {
      const [reserved] = await tx
        .insert(recurringOccurrenceResolutions)
        .values({ recurringId: id, occurrenceDate: date, status: 'CONFIRMED' })
        .onConflictDoNothing()
        .returning();
      if (!reserved) return null;

      const [transaction] = await tx
        .insert(transactions)
        .values({
          userId,
          type: template.type,
          date,
          categoryId: template.categoryId,
          subcategoryId: template.subcategoryId,
          concept: template.concept,
          merchant: template.merchant,
          amount: amount ?? template.amount,
          paymentMethod: template.paymentMethod,
        })
        .returning();
      await tx
        .update(recurringOccurrenceResolutions)
        .set({ transactionId: transaction.id })
        .where(
          and(eq(recurringOccurrenceResolutions.recurringId, id), eq(recurringOccurrenceResolutions.occurrenceDate, date)),
        );
      return transaction;
    });
    if (created) return created;

    const existing = await this.findResolution(id, date);
    if (existing?.status === 'CONFIRMED' && existing.transactionId) {
      const transaction = await this.db.query.transactions.findFirst({
        where: and(eq(transactions.id, existing.transactionId), eq(transactions.userId, userId)),
      });
      if (transaction) return transaction;
    }
    throw new ConflictException('Esta ocurrencia ya estaba resuelta.');
  }

  /** Spec 047, H3: marca la ocurrencia como no ocurrida, sin crear nada. Repetirlo es inocuo. */
  async skip(userId: string, id: string, date: string): Promise<void> {
    const template = await this.findOwnOrThrow(userId, id);
    this.assertIsOccurrence(template, date);

    await this.db
      .insert(recurringOccurrenceResolutions)
      .values({ recurringId: id, occurrenceDate: date, status: 'SKIPPED' })
      .onConflictDoNothing();

    const existing = await this.findResolution(id, date);
    if (existing?.status === 'CONFIRMED') {
      throw new ConflictException('Esta ocurrencia ya estaba confirmada.');
    }
  }

  private findResolution(recurringId: string, date: string) {
    return this.db.query.recurringOccurrenceResolutions.findFirst({
      where: and(
        eq(recurringOccurrenceResolutions.recurringId, recurringId),
        eq(recurringOccurrenceResolutions.occurrenceDate, date),
      ),
    });
  }

  private assertIsOccurrence(template: RecurringTransaction, date: string): void {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || occurrencesBetween(template, date, date).length !== 1) {
      throw new BadRequestException('Esa fecha no es una ocurrencia de este movimiento recurrente.');
    }
  }

  private assertDateRange(startDate: string, endDate: string | null): void {
    if (endDate !== null && endDate < startDate) {
      throw new BadRequestException('La fecha de fin no puede ser anterior a la de inicio.');
    }
  }

  private async findOwnOrThrow(userId: string, id: string): Promise<RecurringTransaction> {
    const template = await this.db.query.recurringTransactions.findFirst({
      where: and(eq(recurringTransactions.id, id), eq(recurringTransactions.userId, userId)),
    });
    if (!template) throw new NotFoundException('Movimiento recurrente no encontrado.');
    return template;
  }
}
