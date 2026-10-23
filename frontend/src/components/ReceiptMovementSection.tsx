import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { getLinkCandidates, linkReceiptTransaction, unlinkReceiptTransaction } from '../api/groceries';
import { getTransaction, listTransactions } from '../api/transactions';
import type { Transaction } from '../api/transactions';
import { ApiError } from '../api/client';
import { formatCurrency, formatDate } from '../pages/home-shared';

/** Ventana por defecto del buscador manual, alrededor de la fecha del ticket. */
const SEARCH_DAYS = 15;
const DAY_MS = 24 * 60 * 60 * 1000;

function shiftDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

function MovementLine({ movement }: { movement: Transaction }) {
  return (
    <span>
      {[formatDate(movement.date), movement.concept, movement.merchant].filter(Boolean).join(' · ')} —{' '}
      <strong>{formatCurrency(movement.amount)}</strong>
    </span>
  );
}

/**
 * Spec 048 H3. Sección "Movimiento" del detalle de un ticket: el gasto
 * enlazado (con enlace a su edición y "Quitar enlace"), o los candidatos
 * sugeridos y un buscador manual para elegir uno. Nunca se ofrece crear un
 * movimiento (H3 criterio 6, decisión de Diego): si no hay ninguno, el
 * ticket se queda sin enlazar.
 */
export function ReceiptMovementSection({
  receiptId,
  receiptDate,
  transactionId,
  onChanged,
}: {
  receiptId: string;
  receiptDate: string;
  transactionId: string | null;
  onChanged: (transactionId: string | null) => void;
}) {
  const [linked, setLinked] = useState<Transaction | null>(null);
  const [candidates, setCandidates] = useState<Transaction[] | null>(null);
  const [search, setSearch] = useState({ q: '', dateFrom: shiftDays(receiptDate, -SEARCH_DAYS), dateTo: shiftDays(receiptDate, SEARCH_DAYS) });
  const [results, setResults] = useState<Transaction[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      if (transactionId) {
        setLinked(await getTransaction(transactionId));
        setCandidates(null);
      } else {
        setLinked(null);
        setCandidates(await getLinkCandidates(receiptId));
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se ha podido cargar el movimiento.');
    }
  }, [receiptId, transactionId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial de datos remotos
    void load();
  }, [load]);

  async function run(action: () => Promise<unknown>, next: string | null, fallback: string) {
    setError(null);
    setIsBusy(true);
    try {
      await action();
      setResults(null);
      onChanged(next);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : fallback);
    } finally {
      setIsBusy(false);
    }
  }

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      const result = await listTransactions({ type: 'EXPENSE', q: search.q || undefined, dateFrom: search.dateFrom, dateTo: search.dateTo, limit: 20 });
      setResults(result.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se han podido buscar movimientos.');
    }
  }

  function linkButton(movement: Transaction) {
    if (movement.receiptId && movement.receiptId !== receiptId) {
      return <span className="tag tag-neutral">ya tiene otro ticket</span>;
    }
    return (
      <button
        type="button"
        className="btn btn-primary"
        disabled={isBusy}
        aria-label={`Enlazar con ${movement.concept} del ${formatDate(movement.date)}`}
        onClick={() => run(() => linkReceiptTransaction(receiptId, movement.id), movement.id, 'No se ha podido enlazar el movimiento.')}
      >
        Enlazar
      </button>
    );
  }

  return (
    <section aria-label="Movimiento">
      <h2>Movimiento</h2>
      <div className="card">
        {transactionId && linked && (
          <>
            <p>
              <MovementLine movement={linked} />
            </p>
            <div className="occurrence-actions">
              <Link to={`/movements/register/${linked.id}`}>Ver el movimiento</Link>
              <button
                type="button"
                className="btn"
                disabled={isBusy}
                onClick={() => run(() => unlinkReceiptTransaction(receiptId), null, 'No se ha podido quitar el enlace.')}
              >
                Quitar enlace
              </button>
            </div>
          </>
        )}

        {!transactionId && candidates && (
          <>
            {candidates.length > 0 ? (
              <>
                <p className="card-meta">{candidates.length === 1 ? 'Este gasto parece corresponder al ticket:' : 'Estos gastos pueden corresponder al ticket:'}</p>
                <ul className="reconcile-candidates">
                  {candidates.map((m) => (
                    <li key={m.id}>
                      <MovementLine movement={m} /> {linkButton(m)}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="card-meta">
                No hay ningún gasto con este importe cerca de esta fecha. Puedes buscarlo a mano o dejar el ticket sin enlazar.
              </p>
            )}

            <form className="receipt-movement-search" onSubmit={(e) => void handleSearch(e)} aria-label="Buscar un movimiento">
              <div className="field">
                <label htmlFor="receipt-movement-q">Concepto</label>
                <input id="receipt-movement-q" className="input" type="search" value={search.q} onChange={(e) => setSearch({ ...search, q: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="receipt-movement-from">Desde</label>
                <input id="receipt-movement-from" className="input" type="date" value={search.dateFrom} onChange={(e) => setSearch({ ...search, dateFrom: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="receipt-movement-to">Hasta</label>
                <input id="receipt-movement-to" className="input" type="date" value={search.dateTo} onChange={(e) => setSearch({ ...search, dateTo: e.target.value })} />
              </div>
              <button type="submit" className="btn">
                Buscar
              </button>
            </form>

            {results && results.length === 0 && <p className="card-meta">No hay gastos que coincidan con la búsqueda.</p>}
            {results && results.length > 0 && (
              <ul className="reconcile-candidates" aria-label="Resultados de la búsqueda">
                {results.map((m) => (
                  <li key={m.id}>
                    <MovementLine movement={m} /> {linkButton(m)}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {error && <p role="alert">{error}</p>}
      </div>
    </section>
  );
}
