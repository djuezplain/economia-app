import { and, eq, inArray, isNotNull, lte, sql } from 'drizzle-orm';
import type { Database } from '../db/db.module.js';
import { recurringOccurrenceResolutions, transactions } from '../db/schema/index.js';
import { ESTIMATE_SAMPLE_SIZE, estimateAmount } from './recurring.estimate.js';

/** Base de datos o transacción en curso (mismo criterio que `ImportService.importWorkbook`). */
export type Executor = Database | Parameters<Parameters<Database['transaction']>[0]>[0];

interface TemplateForEstimate {
  id: string;
  amount: string;
  variableAmount: boolean;
}

/**
 * Spec 049 H2 / plan.md §3.1: importe esperado de cada plantilla — el de la
 * propia plantilla si es fija, o `estimateAmount` sobre los importes reales
 * de sus últimas ocurrencias resueltas si es variable.
 *
 * Una sola consulta para todas las plantillas variables (`ROW_NUMBER()` por
 * plantilla), no una por plantilla. Se usa el importe **actual** del
 * movimiento enlazado: si después se corrige, la estimación lo recoge. Las
 * resoluciones cuyo movimiento se borró (`transaction_id` nulo) no cuentan.
 */
export async function loadExpectedAmounts(
  executor: Executor,
  userId: string,
  templates: TemplateForEstimate[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  for (const t of templates) result.set(t.id, t.amount);

  const variableIds = templates.filter((t) => t.variableAmount).map((t) => t.id);
  if (variableIds.length === 0) return result;

  const ranked = executor.$with('ranked').as(
    executor
      .select({
        recurringId: recurringOccurrenceResolutions.recurringId,
        transactionId: recurringOccurrenceResolutions.transactionId,
        rn: sql<number>`row_number() over (partition by ${recurringOccurrenceResolutions.recurringId} order by ${recurringOccurrenceResolutions.occurrenceDate} desc)`.as(
          'rn',
        ),
      })
      .from(recurringOccurrenceResolutions)
      .where(
        and(
          inArray(recurringOccurrenceResolutions.recurringId, variableIds),
          inArray(recurringOccurrenceResolutions.status, ['CONFIRMED', 'RECONCILED']),
          isNotNull(recurringOccurrenceResolutions.transactionId),
        ),
      ),
  );

  const rows = await executor
    .with(ranked)
    .select({ recurringId: ranked.recurringId, amount: transactions.amount })
    .from(ranked)
    .innerJoin(transactions, eq(transactions.id, ranked.transactionId))
    .where(and(eq(transactions.userId, userId), lte(ranked.rn, ESTIMATE_SAMPLE_SIZE)))
    .orderBy(ranked.recurringId, ranked.rn);

  const amountsById = new Map<string, string[]>();
  for (const row of rows) {
    const list = amountsById.get(row.recurringId) ?? [];
    list.push(row.amount);
    amountsById.set(row.recurringId, list);
  }
  for (const t of templates) {
    if (t.variableAmount) result.set(t.id, estimateAmount(t.amount, amountsById.get(t.id) ?? []));
  }
  return result;
}
