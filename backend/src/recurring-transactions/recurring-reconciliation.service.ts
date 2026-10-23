import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, gte, inArray, isNull, lte } from 'drizzle-orm';
import { DB } from '../db/db.module.js';
import type { Database } from '../db/db.module.js';
import {
  recurringOccurrenceResolutions,
  recurringReconciliationDismissals,
  recurringTransactions,
  transactions,
} from '../db/schema/index.js';
import type { Transaction } from '../transactions/transactions.service.js';
import { occurrencesBetween } from './recurring.calculations.js';
import { daysApart, dismissalKey, isCandidate, matchOccurrences, RECONCILIATION_WINDOW_DAYS } from './recurring.reconciliation.js';
import type { ExpectedOccurrence, MovementLike } from './recurring.reconciliation.js';
import { loadExpectedAmounts } from './recurring-estimates.query.js';
import type { Executor } from './recurring-estimates.query.js';
import { RecurringTransactionsService } from './recurring-transactions.service.js';
import type { RecurringTransaction } from './recurring-transactions.service.js';

/** Ocurrencia sin resolver, con lo que la UI necesita para mostrarla. */
export interface OpenOccurrence extends ExpectedOccurrence {
  status: 'PENDING' | 'OVERDUE';
  concept: string;
  merchant: string | null;
}

export interface ReconciliationSuggestion {
  occurrence: OpenOccurrence;
  candidates: Transaction[];
}

export interface PossibleDuplicate {
  recurringId: string;
  date: string;
  concept: string;
  /** Movimiento que creó la app al confirmar la ocurrencia. */
  createdTransaction: Transaction;
  /** Movimientos (normalmente importados) que parecen el mismo cargo. */
  candidates: Transaction[];
}

export interface RecentReconciliation {
  recurringId: string;
  date: string;
  concept: string;
  reconciledAutomatically: boolean;
  reconciledAt: Date;
  /** `null` si el movimiento se borró después. */
  transaction: Transaction | null;
}

export interface ReconciliationOverview {
  suggestions: ReconciliationSuggestion[];
  possibleDuplicates: PossibleDuplicate[];
  recentlyReconciled: RecentReconciliation[];
}

/** Hacia atrás desde hoy en las sugerencias (plan.md §3.2). */
const SUGGESTIONS_LOOKBACK_DAYS = 90;
/** "Conciliados recientemente" (H3 criterio 5). */
const RECENT_DAYS = 30;
/** Ventana del buscador "Vincular a un movimiento existente" (H3 criterio 6). */
const MANUAL_SEARCH_DAYS = 15;
const DAY_MS = 24 * 60 * 60 * 1000;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function shiftDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

function toMovementLike(t: Transaction): MovementLike {
  return { id: t.id, type: t.type, categoryId: t.categoryId, date: t.date, amount: t.amount };
}

/**
 * Spec 049 H3. Conciliar = resolver una ocurrencia enlazándola a un
 * movimiento que ya existe, en vez de crear uno. Toda la lógica de "qué
 * casa con qué" vive en las funciones puras de `recurring.reconciliation.ts`;
 * aquí solo se cargan los datos (siempre filtrados por `userId`,
 * constitution §2) y se escriben las resoluciones.
 *
 * La PK (`recurring_id`, `occurrence_date`) y el índice único sobre
 * `transaction_id` de `recurring_occurrence_resolutions` son la red de
 * seguridad frente a carreras: cada escritura usa `ON CONFLICT DO NOTHING`
 * y, si no inserta nada, alguien se adelantó.
 */
@Injectable()
export class RecurringReconciliationService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly recurring: RecurringTransactionsService,
  ) {}

  /**
   * Plan.md §3.3: se llama dentro de la transacción de
   * `ImportService.importWorkbook`, tras insertar los movimientos.
   *
   * Los candidatos se buscan entre **todos** los movimientos sin enlazar de
   * la ventana (no solo los recién insertados), pero solo se concilian
   * parejas cuyo movimiento acaba de insertarse. Así, si ya existía un
   * movimiento registrado a mano para ese recibo, la ocurrencia queda
   * ambigua y se sugiere en vez de conciliarse sola; y un movimiento que ya
   * existía nunca se concilia en una importación posterior (que lo salta
   * como duplicado, spec 012), por lo que deshacer una conciliación no se
   * revierte en la siguiente importación automática.
   *
   * @returns Nº de ocurrencias conciliadas.
   */
  async reconcileImported(tx: Executor, userId: string, inserted: MovementLike[]): Promise<number> {
    if (inserted.length === 0) return 0;

    const dates = inserted.map((m) => m.date).sort();
    const from = shiftDays(dates[0], -RECONCILIATION_WINDOW_DAYS);
    const to = shiftDays(dates[dates.length - 1], RECONCILIATION_WINDOW_DAYS);

    const occurrences = await this.loadOpenOccurrences(tx, userId, from, to);
    if (occurrences.length === 0) return 0;

    const movements = await this.loadUnlinkedMovements(tx, userId, shiftDays(from, -RECONCILIATION_WINDOW_DAYS), shiftDays(to, RECONCILIATION_WINDOW_DAYS));
    const dismissed = await this.loadDismissals(tx, userId);
    const insertedIds = new Set(inserted.map((m) => m.id));

    const { automatic } = matchOccurrences(occurrences, movements.map(toMovementLike), dismissed);
    let reconciled = 0;
    for (const { occurrence, movement } of automatic) {
      if (!insertedIds.has(movement.id)) continue;
      const rows = await tx
        .insert(recurringOccurrenceResolutions)
        .values({
          recurringId: occurrence.recurringId,
          occurrenceDate: occurrence.date,
          status: 'RECONCILED',
          transactionId: movement.id,
          reconciledAutomatically: true,
        })
        .onConflictDoNothing()
        .returning({ recurringId: recurringOccurrenceResolutions.recurringId });
      reconciled += rows.length;
    }
    return reconciled;
  }

  /** H3 criterios 3, 5, 8 y 9: lo que muestra la sección "Por conciliar" de Recurrentes. */
  async overview(userId: string): Promise<ReconciliationOverview> {
    const [suggestions, possibleDuplicates, recentlyReconciled] = await Promise.all([
      this.suggestions(userId),
      this.possibleDuplicates(userId),
      this.recentlyReconciled(userId),
    ]);
    return { suggestions, possibleDuplicates, recentlyReconciled };
  }

  /** H3 criterio 6: movimientos para "Vincular a un movimiento existente". */
  async candidatesFor(userId: string, recurringId: string, date: string): Promise<Transaction[]> {
    const template = await this.recurring.findOwnOrThrow(userId, recurringId);
    this.recurring.assertIsOccurrence(template, date);

    const expected = (await loadExpectedAmounts(this.db, userId, [template])).get(template.id)!;
    const occurrence: ExpectedOccurrence = {
      recurringId,
      date,
      type: template.type,
      categoryId: template.categoryId,
      expectedAmount: expected,
      variableAmount: template.variableAmount,
    };
    const movements = (
      await this.loadUnlinkedMovements(this.db, userId, shiftDays(date, -MANUAL_SEARCH_DAYS), shiftDays(date, MANUAL_SEARCH_DAYS))
    ).filter((m) => m.type === template.type);

    return movements.sort((a, b) => {
      const byMatch = Number(isCandidate(occurrence, toMovementLike(b))) - Number(isCandidate(occurrence, toMovementLike(a)));
      if (byMatch !== 0) return byMatch;
      return daysApart(a.date, date) - daysApart(b.date, date) || a.id.localeCompare(b.id);
    });
  }

  /** H3 criterios 3 y 6: concilia a mano una ocurrencia con un movimiento elegido. */
  async reconcile(userId: string, recurringId: string, date: string, transactionId: string): Promise<void> {
    const template = await this.recurring.findOwnOrThrow(userId, recurringId);
    this.recurring.assertIsOccurrence(template, date);
    await this.findOwnTransactionOrThrow(this.db, userId, transactionId);

    const rows = await this.db
      .insert(recurringOccurrenceResolutions)
      .values({ recurringId, occurrenceDate: date, status: 'RECONCILED', transactionId, reconciledAutomatically: false })
      .onConflictDoNothing()
      .returning({ recurringId: recurringOccurrenceResolutions.recurringId });
    if (rows.length === 0) {
      throw new ConflictException('Esta ocurrencia ya está resuelta, o ese movimiento ya está enlazado a otra ocurrencia.');
    }
  }

  /** H3 criterio 7: devuelve la ocurrencia a pendiente sin tocar el movimiento. */
  async undoReconciliation(userId: string, recurringId: string, date: string): Promise<void> {
    await this.recurring.findOwnOrThrow(userId, recurringId);
    const deleted = await this.db
      .delete(recurringOccurrenceResolutions)
      .where(
        and(
          eq(recurringOccurrenceResolutions.recurringId, recurringId),
          eq(recurringOccurrenceResolutions.occurrenceDate, date),
          eq(recurringOccurrenceResolutions.status, 'RECONCILED'),
        ),
      )
      .returning({ recurringId: recurringOccurrenceResolutions.recurringId });
    if (deleted.length === 0) throw new ConflictException('Esta ocurrencia no está conciliada.');
  }

  /** H3 criterios 3 y 8: "este movimiento no corresponde a esta ocurrencia". Repetirlo es inocuo. */
  async dismiss(userId: string, recurringId: string, date: string, transactionId: string): Promise<void> {
    const template = await this.recurring.findOwnOrThrow(userId, recurringId);
    this.recurring.assertIsOccurrence(template, date);
    await this.findOwnTransactionOrThrow(this.db, userId, transactionId);
    await this.db
      .insert(recurringReconciliationDismissals)
      .values({ recurringId, occurrenceDate: date, transactionId })
      .onConflictDoNothing();
  }

  /**
   * H3 criterio 8: la ocurrencia estaba confirmada (la app creó un
   * movimiento) y `keepTransactionId` es el mismo cargo traído por la
   * importación. En una transacción: la ocurrencia pasa a conciliada con el
   * que se conserva y se borra el que creó la app.
   */
  async resolveDuplicate(userId: string, recurringId: string, date: string, keepTransactionId: string): Promise<void> {
    await this.recurring.findOwnOrThrow(userId, recurringId);

    await this.db.transaction(async (tx) => {
      const resolution = await tx.query.recurringOccurrenceResolutions.findFirst({
        where: and(
          eq(recurringOccurrenceResolutions.recurringId, recurringId),
          eq(recurringOccurrenceResolutions.occurrenceDate, date),
        ),
      });
      if (resolution?.status !== 'CONFIRMED' || !resolution.transactionId) {
        throw new ConflictException('Esta ocurrencia no está confirmada con un movimiento creado por la app.');
      }
      if (resolution.transactionId === keepTransactionId) {
        throw new BadRequestException('El movimiento a conservar es el mismo que se creó al confirmar.');
      }
      await this.findOwnTransactionOrThrow(tx, userId, keepTransactionId);
      const alreadyLinked = await tx.query.recurringOccurrenceResolutions.findFirst({
        where: eq(recurringOccurrenceResolutions.transactionId, keepTransactionId),
      });
      if (alreadyLinked) throw new ConflictException('Ese movimiento ya está enlazado a otra ocurrencia.');

      await tx
        .update(recurringOccurrenceResolutions)
        .set({ status: 'RECONCILED', transactionId: keepTransactionId, reconciledAutomatically: false })
        .where(
          and(eq(recurringOccurrenceResolutions.recurringId, recurringId), eq(recurringOccurrenceResolutions.occurrenceDate, date)),
        );
      await tx.delete(transactions).where(and(eq(transactions.id, resolution.transactionId), eq(transactions.userId, userId)));
    });
  }

  // --- consultas --------------------------------------------------------

  private async suggestions(userId: string): Promise<ReconciliationSuggestion[]> {
    const today = todayIso();
    const from = shiftDays(today, -SUGGESTIONS_LOOKBACK_DAYS);
    const to = shiftDays(today, RECONCILIATION_WINDOW_DAYS);

    const occurrences = await this.loadOpenOccurrences(this.db, userId, from, to);
    if (occurrences.length === 0) return [];
    const movements = await this.loadUnlinkedMovements(
      this.db,
      userId,
      shiftDays(from, -RECONCILIATION_WINDOW_DAYS),
      shiftDays(to, RECONCILIATION_WINDOW_DAYS),
    );
    const byId = new Map(movements.map((m) => [m.id, m]));
    const { automatic, ambiguous } = matchOccurrences(occurrences, movements.map(toMovementLike), await this.loadDismissals(this.db, userId));

    // Aquí también las parejas "inequívocas" son solo sugerencias: si no
    // llegaron por una importación (p. ej. registradas a mano), nunca se
    // concilian solas.
    return [
      ...automatic.map(({ occurrence, movement }) => ({ occurrence, candidates: [byId.get(movement.id)!] })),
      ...ambiguous.map(({ occurrence, candidates }) => ({ occurrence, candidates: candidates.map((c) => byId.get(c.id)!) })),
    ].sort((a, b) => a.occurrence.date.localeCompare(b.occurrence.date) || a.occurrence.concept.localeCompare(b.occurrence.concept));
  }

  /**
   * H3 criterios 8 y 9: ocurrencias confirmadas (todo el histórico) para las
   * que hay otro movimiento sin enlazar que parece el mismo cargo. Esta
   * misma lista es la "revisión única" de los duplicados que ya existan.
   */
  private async possibleDuplicates(userId: string): Promise<PossibleDuplicate[]> {
    const confirmed = await this.db
      .select({
        recurringId: recurringOccurrenceResolutions.recurringId,
        date: recurringOccurrenceResolutions.occurrenceDate,
        concept: recurringTransactions.concept,
        variableAmount: recurringTransactions.variableAmount,
        created: transactions,
      })
      .from(recurringOccurrenceResolutions)
      .innerJoin(recurringTransactions, eq(recurringTransactions.id, recurringOccurrenceResolutions.recurringId))
      .innerJoin(transactions, eq(transactions.id, recurringOccurrenceResolutions.transactionId))
      .where(and(eq(recurringTransactions.userId, userId), eq(recurringOccurrenceResolutions.status, 'CONFIRMED')));
    if (confirmed.length === 0) return [];

    const dates = confirmed.map((c) => c.date).sort();
    const movements = await this.loadUnlinkedMovements(
      this.db,
      userId,
      shiftDays(dates[0], -RECONCILIATION_WINDOW_DAYS),
      shiftDays(dates[dates.length - 1], RECONCILIATION_WINDOW_DAYS),
    );
    const dismissed = await this.loadDismissals(this.db, userId);

    const result: PossibleDuplicate[] = [];
    for (const c of confirmed) {
      // Mismo criterio que la conciliación, tomando como importe esperado el
      // real del movimiento creado al confirmar.
      const occurrence: ExpectedOccurrence = {
        recurringId: c.recurringId,
        date: c.date,
        type: c.created.type,
        categoryId: c.created.categoryId,
        expectedAmount: c.created.amount,
        variableAmount: c.variableAmount,
      };
      const candidates = movements.filter(
        (m) => !dismissed.has(dismissalKey(c.recurringId, c.date, m.id)) && isCandidate(occurrence, toMovementLike(m)),
      );
      if (candidates.length > 0) {
        result.push({ recurringId: c.recurringId, date: c.date, concept: c.concept, createdTransaction: c.created, candidates });
      }
    }
    return result.sort((a, b) => a.date.localeCompare(b.date) || a.concept.localeCompare(b.concept));
  }

  private async recentlyReconciled(userId: string): Promise<RecentReconciliation[]> {
    const since = new Date(Date.now() - RECENT_DAYS * DAY_MS);
    const rows = await this.db
      .select({
        recurringId: recurringOccurrenceResolutions.recurringId,
        date: recurringOccurrenceResolutions.occurrenceDate,
        concept: recurringTransactions.concept,
        reconciledAutomatically: recurringOccurrenceResolutions.reconciledAutomatically,
        reconciledAt: recurringOccurrenceResolutions.createdAt,
        transaction: transactions,
      })
      .from(recurringOccurrenceResolutions)
      .innerJoin(recurringTransactions, eq(recurringTransactions.id, recurringOccurrenceResolutions.recurringId))
      .leftJoin(transactions, eq(transactions.id, recurringOccurrenceResolutions.transactionId))
      .where(
        and(
          eq(recurringTransactions.userId, userId),
          eq(recurringOccurrenceResolutions.status, 'RECONCILED'),
          gte(recurringOccurrenceResolutions.createdAt, since),
        ),
      );
    return rows.sort((a, b) => b.reconciledAt.getTime() - a.reconciledAt.getTime());
  }

  /** Ocurrencias sin resolver de las plantillas activas en `[from, to]`, con su importe esperado. */
  private async loadOpenOccurrences(executor: Executor, userId: string, from: string, to: string): Promise<OpenOccurrence[]> {
    const templates: RecurringTransaction[] = await executor.query.recurringTransactions.findMany({
      where: and(eq(recurringTransactions.userId, userId), eq(recurringTransactions.active, true)),
    });
    if (templates.length === 0) return [];

    const resolved = await executor
      .select({ recurringId: recurringOccurrenceResolutions.recurringId, date: recurringOccurrenceResolutions.occurrenceDate })
      .from(recurringOccurrenceResolutions)
      .where(
        and(
          inArray(
            recurringOccurrenceResolutions.recurringId,
            templates.map((t) => t.id),
          ),
          gte(recurringOccurrenceResolutions.occurrenceDate, from),
          lte(recurringOccurrenceResolutions.occurrenceDate, to),
        ),
      );
    const resolvedKeys = new Set(resolved.map((r) => `${r.recurringId}|${r.date}`));
    const expectedAmounts = await loadExpectedAmounts(executor, userId, templates);
    const today = todayIso();

    const result: OpenOccurrence[] = [];
    for (const t of templates) {
      for (const date of occurrencesBetween(t, from, to)) {
        if (resolvedKeys.has(`${t.id}|${date}`)) continue;
        result.push({
          recurringId: t.id,
          date,
          status: date < today ? 'OVERDUE' : 'PENDING',
          type: t.type,
          categoryId: t.categoryId,
          expectedAmount: expectedAmounts.get(t.id)!,
          variableAmount: t.variableAmount,
          concept: t.concept,
          merchant: t.merchant,
        });
      }
    }
    return result;
  }

  /** Movimientos del usuario en `[from, to]` que no resuelven ninguna ocurrencia. */
  private async loadUnlinkedMovements(executor: Executor, userId: string, from: string, to: string): Promise<Transaction[]> {
    const rows = await executor
      .select({ transaction: transactions })
      .from(transactions)
      .leftJoin(recurringOccurrenceResolutions, eq(recurringOccurrenceResolutions.transactionId, transactions.id))
      .where(
        and(
          eq(transactions.userId, userId),
          gte(transactions.date, from),
          lte(transactions.date, to),
          isNull(recurringOccurrenceResolutions.recurringId),
        ),
      );
    return rows.map((r) => r.transaction);
  }

  private async loadDismissals(executor: Executor, userId: string): Promise<Set<string>> {
    const rows = await executor
      .select({
        recurringId: recurringReconciliationDismissals.recurringId,
        date: recurringReconciliationDismissals.occurrenceDate,
        transactionId: recurringReconciliationDismissals.transactionId,
      })
      .from(recurringReconciliationDismissals)
      .innerJoin(recurringTransactions, eq(recurringTransactions.id, recurringReconciliationDismissals.recurringId))
      .where(eq(recurringTransactions.userId, userId));
    return new Set(rows.map((r) => dismissalKey(r.recurringId, r.date, r.transactionId)));
  }

  private async findOwnTransactionOrThrow(executor: Executor, userId: string, id: string): Promise<Transaction> {
    const transaction = await executor.query.transactions.findFirst({
      where: and(eq(transactions.id, id), eq(transactions.userId, userId)),
    });
    if (!transaction) throw new NotFoundException('Movimiento no encontrado.');
    return transaction;
  }
}
