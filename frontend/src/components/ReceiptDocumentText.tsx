import { useState } from 'react';
import { getReceiptDocumentText, readReceiptDocumentText } from '../api/groceries';
import type { ReceiptDocumentInfo } from '../api/groceries';
import { ApiError } from '../api/client';

/**
 * Spec 051 H3 criterios 3 y 5. Con texto: un desplegable que lo pide al
 * abrirlo (no viene en el detalle para no inflarlo). Sin texto: el botón
 * "Leer el texto del documento", a petición, porque cada lectura es una
 * llamada de pago a Google Cloud Vision.
 */
export function ReceiptDocumentText({
  receiptId,
  document,
  onRead,
}: {
  receiptId: string;
  document: ReceiptDocumentInfo;
  onRead: (document: ReceiptDocumentInfo) => void;
}) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function load() {
    if (text !== null || isLoading) return;
    setError(null);
    setIsLoading(true);
    try {
      setText((await getReceiptDocumentText(receiptId)).text ?? '');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se ha podido cargar el texto.');
    } finally {
      setIsLoading(false);
    }
  }

  async function read() {
    setError(null);
    setIsLoading(true);
    try {
      const result = await readReceiptDocumentText(receiptId);
      setText(result.text ?? '');
      onRead({ ...document, hasText: (result.text ?? '') !== '', textReadAt: result.readAt });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se ha podido leer el texto del documento.');
    } finally {
      setIsLoading(false);
    }
  }

  if (document.hasText) {
    return (
      <details className="receipt-document-text" onToggle={(e) => (e.currentTarget.open ? void load() : undefined)}>
        <summary>Texto del documento</summary>
        {isLoading && <p role="status">Cargando…</p>}
        {text !== null && <pre>{text}</pre>}
        {error && <p role="alert">{error}</p>}
      </details>
    );
  }

  return (
    <div className="receipt-document-text">
      <p className="card-meta">
        {document.textReadAt === null
          ? 'Todavía no se ha leído el texto de este documento, así que no aparece en el buscador.'
          : 'No se ha encontrado texto en este documento.'}
      </p>
      <button type="button" className="btn btn-secondary" disabled={isLoading} onClick={() => void read()}>
        {isLoading ? 'Leyendo…' : document.textReadAt === null ? 'Leer el texto del documento' : 'Volver a leer el texto'}
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
