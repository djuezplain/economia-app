import { Decimal } from 'decimal.js';

// Spec 049 (recibos recurrentes), H3 / plan.md §2. Funciones puras que
// deciden qué movimiento corresponde a qué ocurrencia prevista. Las usan
// tanto la conciliación automática al importar como las sugerencias que se
// calculan al consultar, para que ambos caminos apliquen exactamente el
// mismo criterio.

/**
 * Un movimiento casa con una ocurrencia si cae hasta estos días antes o
 * después de la fecha prevista. Cubre el desfase habitual de un cargo
 * domiciliado y queda muy por debajo de los 28+ días entre dos ocurrencias
 * mensuales: un cargo no puede encajar con dos meses de la misma plantilla.
 */
export const RECONCILIATION_WINDOW_DAYS = 5;

/** Desviación máxima (fracción de la estimación) en plantillas de importe variable. */
export const VARIABLE_AMOUNT_TOLERANCE = 0.4;

const DAY_MS = 24 * 60 * 60 * 1000;

export type MovementType = 'INCOME' | 'EXPENSE';

/** Ocurrencia prevista y sin resolver, con el importe que se espera. */
export interface ExpectedOccurrence {
  recurringId: string;
  /** 'YYYY-MM-DD' */
  date: string;
  type: MovementType;
  categoryId: string;
  /** Importe de la plantilla, o su estimación si es variable. */
  expectedAmount: string;
  variableAmount: boolean;
}

/** Lo mínimo de un movimiento que hace falta para emparejarlo. */
export interface MovementLike {
  id: string;
  type: MovementType;
  categoryId: string;
  /** 'YYYY-MM-DD' */
  date: string;
  amount: string;
}

export interface MatchResult<O extends ExpectedOccurrence, M extends MovementLike> {
  /** Parejas inequívocas: se pueden conciliar sin preguntar (H3 criterio 2). */
  automatic: Array<{ occurrence: O; movement: M }>;
  /** Ocurrencias con candidatos, pero sin una pareja inequívoca (H3 criterio 3). */
  ambiguous: Array<{ occurrence: O; candidates: M[] }>;
}

/** Clave de un descarte "este movimiento no corresponde a esta ocurrencia". */
export function dismissalKey(recurringId: string, occurrenceDate: string, transactionId: string): string {
  return `${recurringId}|${occurrenceDate}|${transactionId}`;
}

export function daysApart(a: string, b: string): number {
  return Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY_MS;
}

/**
 * H3 criterio 1. Concepto, comercio y subcategoría no cuentan a propósito:
 * son justo lo que difiere entre la plantilla y lo que trae la importación.
 */
export function isCandidate(occurrence: ExpectedOccurrence, movement: MovementLike): boolean {
  if (movement.type !== occurrence.type || movement.categoryId !== occurrence.categoryId) return false;
  if (daysApart(movement.date, occurrence.date) > RECONCILIATION_WINDOW_DAYS) return false;

  const expected = new Decimal(occurrence.expectedAmount);
  const actual = new Decimal(movement.amount);
  if (!occurrence.variableAmount) return actual.equals(expected);
  return actual.minus(expected).abs().lessThanOrEqualTo(expected.times(VARIABLE_AMOUNT_TOLERANCE));
}

/**
 * Empareja ocurrencias y movimientos. Una pareja es automática solo si la
 * ocurrencia tiene un único candidato y ese movimiento no es candidato de
 * ninguna otra ocurrencia; cualquier otra ocurrencia con candidatos queda
 * como ambigua, con sus candidatos ordenados por cercanía de importe y
 * luego de fecha.
 */
export function matchOccurrences<O extends ExpectedOccurrence, M extends MovementLike>(
  occurrences: O[],
  movements: M[],
  dismissed: Set<string>,
): MatchResult<O, M> {
  const candidatesByOccurrence = new Map<O, M[]>();
  const occurrenceCountByMovement = new Map<string, number>();

  for (const occurrence of occurrences) {
    const candidates = movements.filter(
      (movement) =>
        !dismissed.has(dismissalKey(occurrence.recurringId, occurrence.date, movement.id)) &&
        isCandidate(occurrence, movement),
    );
    if (candidates.length === 0) continue;
    candidatesByOccurrence.set(occurrence, candidates);
    for (const movement of candidates) {
      occurrenceCountByMovement.set(movement.id, (occurrenceCountByMovement.get(movement.id) ?? 0) + 1);
    }
  }

  const result: MatchResult<O, M> = { automatic: [], ambiguous: [] };
  for (const [occurrence, candidates] of candidatesByOccurrence) {
    if (candidates.length === 1 && occurrenceCountByMovement.get(candidates[0].id) === 1) {
      result.automatic.push({ occurrence, movement: candidates[0] });
    } else {
      result.ambiguous.push({ occurrence, candidates: sortByCloseness(occurrence, candidates) });
    }
  }
  return result;
}

function sortByCloseness<M extends MovementLike>(occurrence: ExpectedOccurrence, candidates: M[]): M[] {
  const expected = new Decimal(occurrence.expectedAmount);
  return [...candidates].sort((a, b) => {
    const byAmount = new Decimal(a.amount).minus(expected).abs().comparedTo(new Decimal(b.amount).minus(expected).abs());
    if (byAmount !== 0) return byAmount;
    const byDate = daysApart(a.date, occurrence.date) - daysApart(b.date, occurrence.date);
    if (byDate !== 0) return byDate;
    return a.id.localeCompare(b.id);
  });
}
