import { useState } from 'react';
import { updateReceiptDetails } from '../api/groceries';
import type { ReceiptDetail } from '../api/groceries';
import { ApiError } from '../api/client';
import { localToday, warrantyLabel, warrantyShortcut, warrantyStatus } from '../pages/receipt-warranty';

/**
 * Spec 051 H5 criterio 1: fecha de fin de garantía, con atajos de 2 y 3
 * años desde la fecha del ticket. Los atajos y la fecha elegida se guardan
 * al momento.
 */
export function ReceiptWarrantySection({
  receiptId,
  receiptDate,
  warrantyUntil,
  onChanged,
}: {
  receiptId: string;
  receiptDate: string;
  warrantyUntil: string | null;
  onChanged: (detail: ReceiptDetail) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const today = localToday();
  const status = warrantyStatus(warrantyUntil, today);

  async function save(value: string | null) {
    setError(null);
    setIsSaving(true);
    try {
      onChanged(await updateReceiptDetails(receiptId, { warrantyUntil: value }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se ha podido guardar la garantía.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section aria-label="Garantía">
      <h2>Garantía</h2>
      <div className="card">
        {warrantyUntil ? (
          <p className={`warranty-status warranty-${status}`}>🛡️ {warrantyLabel(warrantyUntil, today)}</p>
        ) : (
          <p className="card-meta">Sin fecha de garantía. Te avisaremos por email 30 días antes de que caduque.</p>
        )}
        <div className="warranty-controls">
          <div className="field">
            <label htmlFor="receipt-warranty">Fin de la garantía</label>
            <input
              id="receipt-warranty"
              className="input"
              type="date"
              value={warrantyUntil ?? ''}
              disabled={isSaving}
              onChange={(e) => {
                if (e.target.value) void save(e.target.value);
              }}
            />
          </div>
          <button type="button" className="btn btn-secondary" disabled={isSaving} onClick={() => void save(warrantyShortcut(receiptDate, 2))}>
            +2 años
          </button>
          <button type="button" className="btn btn-secondary" disabled={isSaving} onClick={() => void save(warrantyShortcut(receiptDate, 3))}>
            +3 años
          </button>
          {warrantyUntil && (
            <button type="button" className="btn btn-ghost" disabled={isSaving} onClick={() => void save(null)}>
              Quitar
            </button>
          )}
        </div>
        {error && <p role="alert">{error}</p>}
      </div>
    </section>
  );
}
