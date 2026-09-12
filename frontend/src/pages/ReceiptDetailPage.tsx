import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { useConnectivity } from '../hooks/useConnectivity';
import { getReceipt } from '../api/groceries';
import type { ReceiptDetail } from '../api/groceries';
import { ApiError } from '../api/client';

/** Spec 034 (H5 criterio 2), plan.md §11. */
export function ReceiptDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const isOnline = useConnectivity();

  const [receipt, setReceipt] = useState<ReceiptDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !id) return;
    getReceipt(id)
      .then(setReceipt)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'No se ha podido cargar el ticket.'));
  }, [isAuthenticated, id]);

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
        <h1>Ticket</h1>
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
        <h1>Ticket</h1>
        <p role="status">Esta página requiere conexión a internet.</p>
      </main>
    );
  }

  return (
    <main>
      <p>
        <Link to="/tickets">Volver al historial</Link>
      </p>

      {error && <p role="alert">{error}</p>}

      {receipt && (
        <>
          <h1>
            {receipt.supermarketName} — {receipt.date}
          </h1>
          <p>Total impreso: {receipt.printedTotal ? `${receipt.printedTotal} €` : 'No se pudo leer'}</p>

          <table className="table">
            <caption>Líneas del ticket</caption>
            <thead>
              <tr>
                <th scope="col">Producto</th>
                <th scope="col">Descripción en el ticket</th>
                <th scope="col">Cantidad</th>
                <th scope="col">Unidad</th>
                <th scope="col">Precio/unidad</th>
                <th scope="col">Importe</th>
              </tr>
            </thead>
            <tbody>
              {receipt.lines.map((line) => (
                <tr key={line.id}>
                  <td>{line.productName}</td>
                  <td>{line.description}</td>
                  <td>{line.quantity}</td>
                  <td>{line.unit}</td>
                  <td>{line.pricePerUnit} €</td>
                  <td>{line.amount} €</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </main>
  );
}
