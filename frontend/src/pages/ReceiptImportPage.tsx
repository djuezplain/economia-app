import { useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { useConnectivity } from '../hooks/useConnectivity';
import { confirmReceiptImport, previewReceiptImport } from '../api/receipt-import';
import type { ConfirmImportPayload, ReceiptPreview } from '../api/receipt-import';
import { listSupermarkets, searchProducts } from '../api/groceries';
import type { Product, Supermarket } from '../api/groceries';
import { ApiError } from '../api/client';
import { ReceiptFieldsEditor } from '../components/ReceiptFieldsEditor';
import { canSaveReceipt, NEW_OPTION_VALUE, newLineKey, toConfirmLines } from '../components/receipt-line.types';
import { describeDocument } from '../components/ReceiptDocumentSection';
import { ACCEPTED_DOCUMENTS, prepareUpload } from './receipt-upload';
import type { EditableLine } from '../components/receipt-line.types';

function toEditableLines(preview: ReceiptPreview): EditableLine[] {
  return preview.lines.map((line) => ({
    key: newLineKey(),
    description: line.description,
    quantity: line.quantity,
    unit: line.unit,
    pricePerUnit: line.pricePerUnit,
    amount: line.amount,
    productId: line.product.matchedId ?? NEW_OPTION_VALUE,
    productName: line.product.suggestedName,
  }));
}

/**
 * Spec 034 (H1-H5), plan.md §11: subir foto → vista previa editable
 * (obligatoria, H2 — ninguna línea se guarda sin que Diego la vea) →
 * confirmar. A diferencia de `StockImportPage`, `confirm` no reenvía el
 * fichero (plan.md §7): construye el JSON ya corregido a partir del estado
 * editable. El editor de campos/líneas en sí vive en `ReceiptFieldsEditor`
 * (spec 035, compartido con la edición de un ticket ya guardado).
 */
export function ReceiptImportPage() {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const isOnline = useConnectivity();

  const [supermarkets, setSupermarkets] = useState<Supermarket[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);

  const [supermarketId, setSupermarketId] = useState<string>(NEW_OPTION_VALUE);
  const [supermarketName, setSupermarketName] = useState('');
  const [date, setDate] = useState('');
  const [printedTotal, setPrintedTotal] = useState('');
  const [lines, setLines] = useState<EditableLine[] | null>(null);
  // Spec 048 H1: el documento ya guardado como pendiente en la vista previa,
  // y una URL local del fichero elegido para verlo junto a lo reconocido.
  const [document, setDocument] = useState<ReceiptPreview['document'] | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);

  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmedReceiptId, setConfirmedReceiptId] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    void listSupermarkets().then(setSupermarkets);
    void searchProducts().then(setProducts);
  }, [isAuthenticated]);

  useEffect(() => {
    if (!selectedFile || !selectedFile.type.startsWith('image/') || typeof URL.createObjectURL !== 'function') return;
    const url = URL.createObjectURL(selectedFile);
    setLocalPreviewUrl(url);
    return () => {
      URL.revokeObjectURL(url);
      setLocalPreviewUrl(null);
    };
  }, [selectedFile]);

  function resetPreviewState() {
    setLines(null);
    setDocument(null);
    setSupermarketId(NEW_OPTION_VALUE);
    setSupermarketName('');
    setDate('');
    setPrintedTotal('');
    setConfirmedReceiptId(null);
    setConfirmError(null);
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setSelectedFile(event.target.files?.[0] ?? null);
    setPreviewError(null);
    resetPreviewState();
  }

  async function handlePreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFile) return;
    setPreviewError(null);
    setIsPreviewing(true);
    try {
      // Spec 048 H1 criterio 8 / plan.md §4: se reduce la foto y se avisa
      // por tamaño antes de subir nada.
      const { file, error } = await prepareUpload(selectedFile);
      if (error) {
        setPreviewError(error);
        return;
      }
      const result = await previewReceiptImport(file);
      setDocument(result.document);
      setSupermarketId(result.supermarket.matchedId ?? NEW_OPTION_VALUE);
      setSupermarketName(result.supermarket.suggestedName ?? '');
      setDate(result.date ?? '');
      setPrintedTotal(result.printedTotal ?? '');
      setLines(toEditableLines(result));
    } catch (err) {
      setPreviewError(err instanceof ApiError ? err.message : 'No se ha podido reconocer la imagen.');
    } finally {
      setIsPreviewing(false);
    }
  }

  function updateLine(key: string, patch: Partial<EditableLine>) {
    setLines((current) => current?.map((line) => (line.key === key ? { ...line, ...patch } : line)) ?? current);
  }

  function removeLine(key: string) {
    setLines((current) => current?.filter((line) => line.key !== key) ?? current);
  }

  function addLine() {
    setLines((current) => [
      ...(current ?? []),
      { key: newLineKey(), description: '', quantity: '1', unit: 'unidad', pricePerUnit: '', amount: '', productId: NEW_OPTION_VALUE, productName: '' },
    ]);
  }

  async function handleConfirm() {
    if (!lines) return;
    setConfirmError(null);
    setIsConfirming(true);
    try {
      const payload: ConfirmImportPayload = {
        documentId: document?.id,
        supermarket: supermarketId ? { id: supermarketId } : { name: supermarketName },
        date,
        printedTotal: printedTotal || undefined,
        lines: toConfirmLines(lines),
      };
      const result = await confirmReceiptImport(payload);
      setConfirmedReceiptId(result.receiptId);
    } catch (err) {
      setConfirmError(err instanceof ApiError ? err.message : 'No se ha podido guardar el ticket.');
    } finally {
      setIsConfirming(false);
    }
  }

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
        <h1>Importar ticket</h1>
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
        <h1>Importar ticket</h1>
        <p role="status">Esta página requiere conexión a internet.</p>
      </main>
    );
  }

  return (
    <main>
      <h1>Importar ticket</h1>
      <p>
        Sube la foto o el PDF de un ticket o una factura, de cualquier comercio, para reconocer automáticamente la
        fecha, el comercio, el total y, si los hay, sus productos y precios. Antes de guardar nada podrás revisar y
        corregir cada dato — el reconocimiento automático puede fallar, especialmente en los nombres de producto y en
        el total impreso. Si no te interesa el desglose (una factura de la luz, por ejemplo), puedes guardarlo solo con
        el total. La foto o el PDF se guarda junto con el ticket.
      </p>

      <section>
        <h2>1. Subir imagen</h2>
        <form onSubmit={(e) => void handlePreview(e)}>
          <label htmlFor="receipt-import-file">Foto o PDF del ticket</label>
          {/* Sin `capture`: con ese atributo, algunos navegadores móviles
              (sobre todo iOS Safari) abren la cámara directamente en vez de
              ofrecer también la opción de elegir una foto ya existente de
              la galería — spec.md §3 ya preveía el selector de fichero
              estándar con ambas opciones, no una vista de cámara forzada. */}
          <input id="receipt-import-file" type="file" accept={ACCEPTED_DOCUMENTS} className="input" onChange={handleFileChange} />

          {previewError && <p role="alert">{previewError}</p>}

          <button type="submit" className="btn btn-primary" disabled={!selectedFile || isPreviewing}>
            {isPreviewing ? 'Reconociendo…' : 'Reconocer'}
          </button>
        </form>
      </section>

      {lines && confirmedReceiptId === null && (
        <section>
          <h2>2. Revisar y corregir</h2>

          {document && (
            <div className="card" aria-label="Documento subido">
              <p className="card-meta">
                Se guardará con el ticket: {describeDocument(document)}
              </p>
              {localPreviewUrl && <img className="receipt-document-image" src={localPreviewUrl} alt="Foto del ticket subida" />}
            </div>
          )}

          <ReceiptFieldsEditor
            supermarkets={supermarkets}
            products={products}
            supermarketId={supermarketId}
            onSupermarketIdChange={setSupermarketId}
            supermarketName={supermarketName}
            onSupermarketNameChange={setSupermarketName}
            date={date}
            onDateChange={setDate}
            printedTotal={printedTotal}
            onPrintedTotalChange={setPrintedTotal}
            lines={lines}
            onUpdateLine={updateLine}
            onRemoveLine={removeLine}
            onAddLine={addLine}
            onClearLines={() => setLines([])}
          />

          {confirmError && <p role="alert">{confirmError}</p>}

          <button type="button" className="btn btn-primary" disabled={isConfirming || !canSaveReceipt(lines, printedTotal)} onClick={() => void handleConfirm()}>
            {isConfirming ? 'Guardando…' : 'Confirmar'}
          </button>
        </section>
      )}

      {confirmedReceiptId !== null && (
        <section>
          <h2>Ticket guardado</h2>
          <p>
            <Link to={`/tickets/${confirmedReceiptId}`}>Ver el ticket guardado</Link> ·{' '}
            <Link to="/tickets">Ver historial de tickets</Link>
          </p>
        </section>
      )}
    </main>
  );
}
