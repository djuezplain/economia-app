import { useEffect, useRef, useState } from 'react';
import { confirmOccurrence, skipOccurrence } from '../api/recurring-transactions';
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
      </div>
      {isReviewing && (
        <p className="card-meta" role="status">
          El importe es una estimación: revisa el importe real del recibo antes de confirmar.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
    </li>
  );
}
