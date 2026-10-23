import { useState } from 'react';
import { dismissCandidate, reconcileOccurrence, resolveDuplicate, undoReconciliation } from '../api/recurring-transactions';
import type { PossibleDuplicate, ReconciliationOverview, ReconciliationSuggestion } from '../api/recurring-transactions';
import type { Transaction } from '../api/transactions';
import { ApiError } from '../api/client';
import { formatCurrency, formatDate } from '../pages/home-shared';

/** Una línea compacta de un movimiento: fecha · concepto · comercio — importe. */
function MovementSummary({ movement }: { movement: Transaction }) {
  return (
    <span>
      {[formatDate(movement.date), movement.concept, movement.merchant].filter(Boolean).join(' · ')} —{' '}
      <strong>{formatCurrency(movement.amount)}</strong>
    </span>
  );
}

/**
 * Spec 049 H3. Secciones de conciliación de `RecurringPage`:
 * - "Por conciliar": sugerencias (criterio 3) y posibles duplicados
 *   (criterios 8 y 9). Solo se muestra si hay algo.
 * - "Conciliados recientemente" (criterio 5), plegada, con "Deshacer"
 *   (criterio 7).
 * Nada se borra sin una confirmación explícita en pantalla.
 */
export function ReconciliationPanel({ overview, onChanged }: { overview: ReconciliationOverview; onChanged: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  async function run(key: string, action: () => Promise<unknown>, fallback: string) {
    setError(null);
    setBusyKey(key);
    try {
      await action();
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : fallback);
    } finally {
      setBusyKey(null);
    }
  }

  const { suggestions, possibleDuplicates, recentlyReconciled } = overview;
  const hasPending = suggestions.length > 0 || possibleDuplicates.length > 0;

  return (
    <>
      {error && <p role="alert">{error}</p>}

      {hasPending && (
        <section aria-label="Por conciliar">
          <h2>Por conciliar</h2>
          <p className="card-meta">
            Movimientos que parecen corresponder a un recibo recurrente. Elige el que corresponda para no contar el mismo gasto dos veces.
          </p>
          <ul className="reconcile-list">
            {suggestions.map((s) => (
              <SuggestionItem key={`s|${s.occurrence.recurringId}|${s.occurrence.date}`} suggestion={s} busyKey={busyKey} run={run} />
            ))}
            {possibleDuplicates.map((d) => (
              <DuplicateItem key={`d|${d.recurringId}|${d.date}`} duplicate={d} busyKey={busyKey} run={run} />
            ))}
          </ul>
        </section>
      )}

      {recentlyReconciled.length > 0 && (
        <section aria-label="Conciliados recientemente">
          <details>
            <summary>
              <h2 className="details-heading">Conciliados recientemente ({recentlyReconciled.length})</h2>
            </summary>
            <ul className="reconcile-list">
              {recentlyReconciled.map((r) => {
                const key = `r|${r.recurringId}|${r.date}`;
                return (
                  <li className="card" key={key}>
                    <strong>{r.concept}</strong> <span className="card-meta">del {formatDate(r.date)}</span>{' '}
                    <span className="tag tag-neutral">{r.reconciledAutomatically ? 'automática' : 'manual'}</span>
                    <p className="card-meta">
                      {r.transaction ? <MovementSummary movement={r.transaction} /> : 'El movimiento enlazado se borró.'}
                    </p>
                    <button
                      type="button"
                      className="btn"
                      disabled={busyKey === key}
                      aria-label={`Deshacer la conciliación de ${r.concept} del ${formatDate(r.date)}`}
                      onClick={() => run(key, () => undoReconciliation(r.recurringId, r.date), 'No se ha podido deshacer la conciliación.')}
                    >
                      Deshacer
                    </button>
                  </li>
                );
              })}
            </ul>
          </details>
        </section>
      )}
    </>
  );
}

type Run = (key: string, action: () => Promise<unknown>, fallback: string) => Promise<void>;

function SuggestionItem({ suggestion, busyKey, run }: { suggestion: ReconciliationSuggestion; busyKey: string | null; run: Run }) {
  const { occurrence, candidates } = suggestion;
  const key = `s|${occurrence.recurringId}|${occurrence.date}`;
  const isBusy = busyKey === key;
  const label = `${occurrence.concept} del ${formatDate(occurrence.date)}`;

  return (
    <li className="card" aria-label={`Sugerencia para ${label}`}>
      <strong>{occurrence.concept}</strong> <span className="card-meta">previsto el {formatDate(occurrence.date)}</span>{' '}
      <span className={occurrence.variableAmount ? 'amount-estimated' : undefined}>
        {occurrence.variableAmount ? '≈ ' : ''}
        {formatCurrency(occurrence.expectedAmount)}
      </span>
      <p className="card-meta">{candidates.length === 1 ? 'Posible cargo:' : 'Posibles cargos:'}</p>
      <ul className="reconcile-candidates">
        {candidates.map((c) => (
          <li key={c.id}>
            <MovementSummary movement={c} />{' '}
            <button
              type="button"
              className="btn btn-primary"
              disabled={isBusy}
              aria-label={`Conciliar ${label} con ${c.concept} del ${formatDate(c.date)}`}
              onClick={() =>
                run(key, () => reconcileOccurrence(occurrence.recurringId, occurrence.date, c.id), 'No se ha podido conciliar.')
              }
            >
              Es este
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="btn"
        disabled={isBusy}
        onClick={() =>
          run(
            key,
            () => Promise.all(candidates.map((c) => dismissCandidate(occurrence.recurringId, occurrence.date, c.id))),
            'No se ha podido descartar la sugerencia.',
          )
        }
      >
        {candidates.length === 1 ? 'No es este' : 'Ninguno de estos'}
      </button>
    </li>
  );
}

function DuplicateItem({ duplicate, busyKey, run }: { duplicate: PossibleDuplicate; busyKey: string | null; run: Run }) {
  const key = `d|${duplicate.recurringId}|${duplicate.date}`;
  const isBusy = busyKey === key;
  const created = duplicate.createdTransaction;

  return (
    <li className="card" aria-label={`Posible duplicado de ${duplicate.concept} del ${formatDate(duplicate.date)}`}>
      <strong>Posible duplicado:</strong> {duplicate.concept} <span className="card-meta">del {formatDate(duplicate.date)}</span>
      <p className="card-meta">
        Creado al confirmar: <MovementSummary movement={created} />
      </p>
      <ul className="reconcile-candidates">
        {duplicate.candidates.map((c) => (
          <li key={c.id}>
            <span className="card-meta">Parece el mismo cargo:</span> <MovementSummary movement={c} />{' '}
            <button
              type="button"
              className="btn btn-primary"
              disabled={isBusy}
              onClick={() => {
                const message =
                  `Se borrará el movimiento creado al confirmar (${created.concept}, ${formatDate(created.date)}, ` +
                  `${formatCurrency(created.amount)}) y el recibo quedará enlazado a "${c.concept}". ¿Continuar?`;
                if (window.confirm(message)) {
                  void run(
                    key,
                    () => resolveDuplicate(duplicate.recurringId, duplicate.date, c.id),
                    'No se ha podido resolver el duplicado.',
                  );
                }
              }}
            >
              Quedarme con el importado
            </button>{' '}
            <button
              type="button"
              className="btn"
              disabled={isBusy}
              onClick={() =>
                run(key, () => dismissCandidate(duplicate.recurringId, duplicate.date, c.id), 'No se ha podido descartar.')
              }
            >
              No es un duplicado
            </button>
          </li>
        ))}
      </ul>
    </li>
  );
}
