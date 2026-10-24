import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listReceiptTags, setReceiptTags } from '../api/receipt-tags';
import type { ReceiptTag } from '../api/receipt-tags';
import { ApiError } from '../api/client';
import { TagPicker } from './TagPicker';
import type { TagPickerValue } from './tag-picker.types';

/**
 * Spec 051 H1 criterio 1: sección "Etiquetas" del detalle de un ticket.
 * Cada cambio se guarda al momento (`PUT /receipts/:id/tags`); las nuevas
 * se crean en el servidor y vuelven ya como etiquetas existentes.
 */
export function ReceiptTagsSection({
  receiptId,
  tags,
  onChanged,
}: {
  receiptId: string;
  tags: ReceiptTag[];
  onChanged: (tags: ReceiptTag[]) => void;
}) {
  const [available, setAvailable] = useState<ReceiptTag[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    listReceiptTags()
      .then(setAvailable)
      .catch(() => setAvailable([]));
  }, []);

  async function handleChange(value: TagPickerValue) {
    setError(null);
    setIsSaving(true);
    try {
      const saved = await setReceiptTags(receiptId, { tagIds: value.existing.map((t) => t.id), newTags: value.newNames });
      onChanged(saved);
      if (value.newNames.length > 0) setAvailable(await listReceiptTags());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se han podido guardar las etiquetas.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section aria-label="Etiquetas">
      <h2>Etiquetas</h2>
      <div className="card">
        <TagPicker available={available} value={{ existing: tags, newNames: [] }} onChange={(value) => void handleChange(value)} disabled={isSaving} />
        {error && <p role="alert">{error}</p>}
        <p className="card-meta">
          <Link to="/tickets/etiquetas">Gestionar etiquetas</Link>
        </p>
      </div>
    </section>
  );
}
