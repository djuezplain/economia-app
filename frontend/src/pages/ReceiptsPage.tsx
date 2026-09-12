import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { useConnectivity } from '../hooks/useConnectivity';
import { listReceipts } from '../api/groceries';
import type { ReceiptSummary } from '../api/groceries';
import { ApiError } from '../api/client';

/** Spec 034 (H5 criterio 1), plan.md §11. */
export function ReceiptsPage() {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const isOnline = useConnectivity();

  const [receipts, setReceipts] = useState<ReceiptSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    listReceipts()
      .then(setReceipts)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'No se han podido cargar los tickets.'));
  }, [isAuthenticated]);

  if (isAuthLoading) {
    return (
      <main>
        <p>Comprobando tu sesión…</p>
      </main>
    );
  }

  if (!isAuthenticated) {
    return (
      <main>
        <h1>Tickets de supermercado</h1>
        <p role="alert">Tienes que iniciar sesión para ver esto.</p>
        <p>
          <Link to="/login">Iniciar sesión</Link>
        </p>
      </main>
    );
  }

  if (!isOnline) {
    return (
      <main>
        <h1>Tickets de supermercado</h1>
        <p role="status">Esta página requiere conexión a internet.</p>
      </main>
    );
  }

  return (
    <main>
      <h1>Tickets de supermercado</h1>
      <p>
        <Link to="/tickets/importar">Importar un ticket nuevo</Link>
      </p>

      {error && <p role="alert">{error}</p>}

      {receipts && receipts.length === 0 && <p>Todavía no has importado ningún ticket.</p>}

      {receipts && receipts.length > 0 && (
        <table className="table">
          <caption>Tickets importados</caption>
          <thead>
            <tr>
              <th scope="col">Fecha</th>
              <th scope="col">Supermercado</th>
              <th scope="col">Total</th>
            </tr>
          </thead>
          <tbody>
            {receipts.map((receipt) => (
              <tr key={receipt.id}>
                <td>
                  <Link to={`/tickets/${receipt.id}`}>{receipt.date}</Link>
                </td>
                <td>{receipt.supermarketName}</td>
                <td>{receipt.printedTotal ? `${receipt.printedTotal} €` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
