import { useEffect, useRef, useState } from 'react';
import { confirmOccurrence, listReconciliationCandidates, reconcileOccurrence, skipOccurrence } from '../api/recurring-transactions';
import type { Transaction } from '../api/transactions';
import type { Occurrence } from '../api/recurring-transactions';
import type { Category } from '../api/categories';
import { ApiError } from '../api/client';
import { categoryIcon, categoryName, PAYMENT_METHOD_LABELS } from '../pages/movements-shared';
import { formatCurrency, formatDate } from '../pages/home-shared';

/**
 * Spec 047 (H3/H4). Una ocurrencia prevista (pendiente o vencida) con sus
 * acciones: Confirmar (crea el movimiento real, con el importe ajustable) y
 * Omitir. Lo usan `RecurringPage` y el detalle del día de `CalendarPage`.
 *
 * Spec 049 H2: si el importe es una estimación, se muestra con "≈" y
 * confirmar es un paso en dos tiempos — el primer clic pone el foco en el
 * importe y pide revisarlo; solo el segundo confirma, enviando siempre el
 * importe (el backend lo exige en plantillas variables).
 *
 * Spec 049 H3 criterio 6: "Vincular a un movimiento existente" resuelve la
 * ocurrencia enlazándola a un movimiento que ya existe, sin crear otro.
 */
export function OccurrenceRow({
  occurrence,
  categories,
  showDate = false,
  onResolved,
}: {
  occurrence: Occurrence;
  categories: Category[] | null;
  showDate?: boolean;
  onResolved: () => void;
}) {
  const [amount, setAmount] = useState(occurrence.amount);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isReviewing, setIsReviewing] = useState(false);
  const [linkCandidates, setLinkCandidates] = useState<Transaction[] | null>(null);
  const amountInput = useRef<HTMLInputElement>(null);
  const isIncome = occurrence.type === 'INCOME';
  const isEstimated = occurrence.estimated;

  useEffect(() => {
    if (isReviewing) amountInput.current?.focus();
  }, [isReviewing]);

  function handleConfirm() {
    if (isEstimated && !isReviewing) {
      setIsReviewing(true);
      return;
    }
    void run(
      () =>
        confirmOccurrence(
          occurrence.recurringId,
          occurrence.date,
          isEstimated || amount !== occurrence.amount ? amount : undefined,
        ),
      'No se ha podido confirmar el movimiento.',
    );
  }

  async function run(action: () => Promise<unknown>, fallback: string) {
    setError(null);
    setIsBusy(true);
    try {
      await action();
      onResolved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : fallback);
    } finally {
      setIsBusy(false);
    }
  }

  async function openLinking() {
    setError(null);
    setIsBusy(true);
    try {
      setLinkCandidates(await listReconciliationCandidates(occurrence.recurringId, occurrence.date));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se han podido cargar los movimientos cercanos.');
    } finally {
      setIsBusy(false);
    }
  }

  const meta = [
    categoryName(categories, occurrence.categoryId),
    occurrence.merchant,
    occurrence.paymentMethod ? PAYMENT_METHOD_LABELS[occurrence.paymentMethod] : null,
  ].filter((part): part is string => Boolean(part));

  return (
    <li className={`card cal-item cal-item-planned ${isIncome ? 'cal-item-income' : 'cal-item-expense'}`}>
      <div className="card-row">
        <div>
          <span className={`category-icon${isIncome ? ' category-icon-accent' : ''}`} aria-hidden="true">
            {categoryIcon(categories, occurrence.categoryId)}
          </span>{' '}
          <strong>{occurrence.concept}</strong>{' '}
          {occurrence.status === 'OVERDUE' ? (
            <span className="tag tag-accent">vencido</span>
          ) : (
            <span className="tag tag-neutral">previsto</span>
          )}
          <p className="card-meta">{[showDate ? formatDate(occurrence.date) : null, ...meta].filter(Boolean).join(' · ')}</p>
        </div>
        <div
          className={`card-amount ${isIncome ? 'cal-income' : 'cal-expense'}${isEstimated ? ' amount-estimated' : ''}`}
          title={isEstimated ? 'Importe estimado a partir de los últimos recibos' : undefined}
        >
          {isEstimated && <span aria-label="aproximadamente">≈ </span>}
          {isIncome ? '+' : '−'}
          {formatCurrency(occurrence.amount)}
        </div>
      </div>
      <div className="occurrence-actions">
        <label>
          <span className="card-meta">Importe real</span>
          <input
            ref={amountInput}
            type="text"
            inputMode="decimal"
            className="input"
            aria-label={`Importe real de ${occurrence.concept}`}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="btn btn-primary"
          disabled={isBusy}
          onClick={handleConfirm}
        >
          {isReviewing ? 'Confirmar importe' : 'Confirmar'}
        </button>
        <button
          type="button"
          className="btn"
          disabled={isBusy}
          onClick={() => run(() => skipOccurrence(occurrence.recurringId, occurrence.date), 'No se ha podido omitir el movimiento.')}
        >
          Omitir
        </button>
        {linkCandidates === null && (
          <button type="button" className="btn" disabled={isBusy} onClick={() => void openLinking()}>
            Vincular a un movimiento existente
          </button>
        )}
      </div>
      {linkCandidates !== null && (
        <div className="occurrence-link" aria-label={`Movimientos para vincular con ${occurrence.concept}`} role="group">
          {linkCandidates.length === 0 ? (
            <p className="card-meta">No hay movimientos cercanos sin enlazar.</p>
          ) : (
            <ul className="reconcile-candidates">
              {linkCandidates.map((c) => (
                <li key={c.id}>
                  <span>
                    {[formatDate(c.date), c.concept, c.merchant].filter(Boolean).join(' · ')} — <strong>{formatCurrency(c.amount)}</strong>
                  </span>{' '}
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={isBusy}
                    aria-label={`Vincular con ${c.concept} del ${formatDate(c.date)}`}
                    onClick={() =>
                      run(() => reconcileOccurrence(occurrence.recurringId, occurrence.date, c.id), 'No se ha podido vincular el movimiento.')
                    }
                  >
                    Vincular
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="btn" disabled={isBusy} onClick={() => setLinkCandidates(null)}>
            Cancelar
          </button>
        </div>
      )}
      {isReviewing && (
        <p className="card-meta" role="status">
          El importe es una estimación: revisa el importe real del recibo antes de confirmar.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
    </li>
  );
}
