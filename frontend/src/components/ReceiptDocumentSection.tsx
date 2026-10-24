import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { deleteReceiptDocument, getReceiptDocument, uploadReceiptDocument } from '../api/groceries';
import type { ReceiptDocumentInfo } from '../api/groceries';
import { ApiError } from '../api/client';
import { ACCEPTED_DOCUMENTS, prepareUpload } from '../pages/receipt-upload';
import { ReceiptDocumentText } from './ReceiptDocumentText';

function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function describeDocument(document: Pick<ReceiptDocumentInfo, 'mimeType' | 'sizeBytes' | 'pageCount'>): string {
  if (document.mimeType === 'application/pdf') {
    const pages = document.pageCount === null ? '' : `, ${document.pageCount} ${document.pageCount === 1 ? 'página' : 'páginas'}`;
    return `PDF${pages} · ${formatSize(document.sizeBytes)}`;
  }
  return `Foto · ${formatSize(document.sizeBytes)}`;
}

/**
 * Spec 048 H1 criterios 2 y 3. Sección "Documento" del detalle de un ticket:
 * ver (imagen en línea o PDF en otra pestaña), descargar, sustituir, quitar
 * (con confirmación) o adjuntar uno si no tiene. El binario se pide con
 * `fetch` autenticado (`getReceiptDocument`) y se muestra con una URL de
 * objeto: un `<img src>` directo no llevaría el token.
 */
export function ReceiptDocumentSection({
  receiptId,
  document,
  onChanged,
}: {
  receiptId: string;
  document: ReceiptDocumentInfo | null;
  onChanged: (document: ReceiptDocumentInfo | null) => void;
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Spec 051 H3 criterio 4: el documento se guardó, pero sin texto.
  const [ocrWarning, setOcrWarning] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const isPdf = document?.mimeType === 'application/pdf';

  useEffect(() => {
    if (!document) return;
    let cancelled = false;
    let url: string | null = null;
    (async () => {
      try {
        const blob = await getReceiptDocument(receiptId);
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setObjectUrl(url);
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'No se ha podido cargar el documento.');
      }
    })();
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
      setObjectUrl(null);
    };
  }, [receiptId, document]);

  function download() {
    if (!objectUrl || !document) return;
    const link = window.document.createElement('a');
    link.href = objectUrl;
    link.download = document.originalFilename;
    link.click();
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0];
    event.target.value = '';
    if (!picked) return;
    setError(null);
    const { file, error: sizeProblem } = await prepareUpload(picked);
    if (sizeProblem) {
      setError(sizeProblem);
      return;
    }
    setIsBusy(true);
    setOcrWarning(null);
    try {
      const { ocrWarning: warning, ...stored } = await uploadReceiptDocument(receiptId, file);
      setOcrWarning(warning ?? null);
      onChanged(stored);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se ha podido guardar el documento.');
    } finally {
      setIsBusy(false);
    }
  }

  async function handleRemove() {
    if (!window.confirm('¿Quitar el documento de este ticket? No se puede deshacer.')) return;
    setError(null);
    setIsBusy(true);
    try {
      await deleteReceiptDocument(receiptId);
      onChanged(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se ha podido quitar el documento.');
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <section aria-label="Documento">
      <h2>Documento</h2>
      <div className="card">
        {document ? (
          <>
            <p className="card-meta">
              {document.originalFilename} · {describeDocument(document)}
            </p>
            {!isPdf && objectUrl && <img className="receipt-document-image" src={objectUrl} alt={`Documento del ticket: ${document.originalFilename}`} />}
            <div className="occurrence-actions">
              {isPdf && (
                <button type="button" className="btn" disabled={!objectUrl} onClick={() => objectUrl && window.open(objectUrl, '_blank', 'noopener')}>
                  Abrir PDF
                </button>
              )}
              <button type="button" className="btn" disabled={!objectUrl} onClick={download}>
                Descargar
              </button>
              <button type="button" className="btn" disabled={isBusy} onClick={() => fileInput.current?.click()}>
                Sustituir
              </button>
              <button type="button" className="btn" disabled={isBusy} onClick={() => void handleRemove()}>
                Quitar
              </button>
            </div>
            <ReceiptDocumentText key={document.id} receiptId={receiptId} document={document} onRead={onChanged} />
          </>
        ) : (
          <>
            <p className="card-meta">Este ticket no tiene la foto ni el PDF original.</p>
            <div>
              <button type="button" className="btn btn-primary" disabled={isBusy} onClick={() => fileInput.current?.click()}>
                Adjuntar documento
              </button>
            </div>
          </>
        )}
        <input
          ref={fileInput}
          type="file"
          accept={ACCEPTED_DOCUMENTS}
          hidden
          aria-label="Elegir documento"
          onChange={(e) => void handleFile(e)}
        />
        {isBusy && <p role="status">Guardando…</p>}
        {ocrWarning && <p className="card-meta" role="note">{ocrWarning}</p>}
        {error && <p role="alert">{error}</p>}
      </div>
    </section>
  );
}
