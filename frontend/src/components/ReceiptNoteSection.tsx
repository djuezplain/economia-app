import { useState } from 'react';
import { updateReceiptDetails } from '../api/groceries';
import type { ReceiptDetail } from '../api/groceries';
import { ApiError } from '../api/client';

export const MAX_NOTE_LENGTH = 2000;

/** Spec 051 H4: nota libre del ticket (número de serie, para qué fue la compra…). */
export function ReceiptNoteSection({ receiptId, note, onChanged }: { receiptId: string; note: string | null; onChanged: (detail: ReceiptDetail) => void }) {
  const [text, setText] = useState(note ?? '');
  // La última nota guardada (empieza con la del ticket).
  const [savedNote, setSavedNote] = useState(note ?? '');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const isDirty = text.trim() !== savedNote;

  async function handleSave() {
    setError(null);
    setSaved(false);
    setIsSaving(true);
    try {
      const detail = await updateReceiptDetails(receiptId, { note: text.trim() === '' ? null : text });
      setText(detail.note ?? '');
      setSavedNote(detail.note ?? '');
      onChanged(detail);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se ha podido guardar la nota.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section aria-label="Nota">
      <h2>Nota</h2>
      <div className="card">
        <label htmlFor="receipt-note" className="sr-only">
          Nota del ticket
        </label>
        <textarea
          id="receipt-note"
          className="input receipt-note"
          rows={3}
          maxLength={MAX_NOTE_LENGTH}
          placeholder="Número de serie, para qué fue la compra…"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setSaved(false);
          }}
        />
        <div className="occurrence-actions">
          <button type="button" className="btn btn-secondary" disabled={isSaving || !isDirty} onClick={() => void handleSave()}>
            {isSaving ? 'Guardando…' : 'Guardar nota'}
          </button>
          {saved && !isDirty && (
            <span role="status" className="card-meta">
              Guardada.
            </span>
          )}
        </div>
        {error && <p role="alert">{error}</p>}
      </div>
    </section>
  );
}
