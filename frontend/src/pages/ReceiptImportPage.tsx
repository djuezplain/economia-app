import { useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { useConnectivity } from '../hooks/useConnectivity';
import { confirmReceiptImport, previewReceiptImport } from '../api/receipt-import';
import type { ConfirmReceiptLine, ConfirmReceiptPayload, ReceiptPreview, ReceiptUnit } from '../api/receipt-import';
import { listSupermarkets, searchProducts } from '../api/groceries';
import type { Product, Supermarket } from '../api/groceries';
import { ApiError } from '../api/client';

const NEW_OPTION_VALUE = '';

interface EditableLine {
  key: string;
  description: string;
  quantity: string;
  unit: ReceiptUnit;
  pricePerUnit: string;
  amount: string;
  productId: string;
  productName: string;
}

let nextLineKey = 0;
function newLineKey(): string {
  nextLineKey += 1;
  return `line-${nextLineKey}`;
}

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

function sumAmounts(lines: EditableLine[]): number {
  return lines.reduce((sum, line) => sum + (Number(line.amount) || 0), 0);
}

/**
 * Spec 034 (H1-H5), plan.md §11: subir foto → vista previa editable
 * (obligatoria, H2 — ninguna línea se guarda sin que Diego la vea) →
 * confirmar. A diferencia de `StockImportPage`, `confirm` no reenvía el
 * fichero (plan.md §7): construye el JSON ya corregido a partir del estado
 * editable.
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

  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmedReceiptId, setConfirmedReceiptId] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    void listSupermarkets().then(setSupermarkets);
    void searchProducts().then(setProducts);
  }, [isAuthenticated]);

  function resetPreviewState() {
    setLines(null);
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
      const result = await previewReceiptImport(selectedFile);
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
      const payload: ConfirmReceiptPayload = {
        supermarket: supermarketId ? { id: supermarketId } : { name: supermarketName },
        date,
        printedTotal: printedTotal || undefined,
        lines: lines.map(
          (line): ConfirmReceiptLine => ({
            description: line.description,
            quantity: line.quantity,
            unit: line.unit,
            pricePerUnit: line.pricePerUnit,
            amount: line.amount,
            product: line.productId ? { id: line.productId } : { name: line.productName },
          }),
        ),
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

  const linesTotal = lines ? sumAmounts(lines) : 0;
  const printedTotalNumber = printedTotal ? Number(printedTotal) : null;
  const totalsMismatch = lines !== null && printedTotalNumber !== null && Math.abs(linesTotal - printedTotalNumber) > 0.01;

  return (
    <main>
      <h1>Importar ticket</h1>
      <p>
        Sube la foto de un ticket de supermercado para reconocer sus productos y precios automáticamente. Antes de
        guardar nada podrás revisar y corregir cada línea — el reconocimiento automático puede fallar, especialmente
        en los nombres de producto y en el total impreso.
      </p>

      <section>
        <h2>1. Subir imagen</h2>
        <form onSubmit={(e) => void handlePreview(e)}>
          <label htmlFor="receipt-import-file">Foto del ticket</label>
          <input
            id="receipt-import-file"
            type="file"
            accept="image/*"
            capture="environment"
            className="input"
            onChange={handleFileChange}
          />

          {previewError && <p role="alert">{previewError}</p>}

          <button type="submit" className="btn btn-primary" disabled={!selectedFile || isPreviewing}>
            {isPreviewing ? 'Reconociendo…' : 'Reconocer'}
          </button>
        </form>
      </section>

      {lines && confirmedReceiptId === null && (
        <section>
          <h2>2. Revisar y corregir</h2>

          <div className="field">
            <label htmlFor="receipt-supermarket">Supermercado</label>
            <select
              id="receipt-supermarket"
              className="input"
              value={supermarketId}
              onChange={(e) => setSupermarketId(e.target.value)}
            >
              <option value={NEW_OPTION_VALUE}>+ Nuevo supermercado</option>
              {supermarkets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            {!supermarketId && (
              <input
                type="text"
                className="input"
                aria-label="Nombre del nuevo supermercado"
                value={supermarketName}
                onChange={(e) => setSupermarketName(e.target.value)}
              />
            )}
          </div>

          <div className="field">
            <label htmlFor="receipt-date">Fecha</label>
            <input id="receipt-date" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          <div className="field">
            <label htmlFor="receipt-printed-total">Total impreso en el ticket</label>
            <input
              id="receipt-printed-total"
              type="text"
              className="input"
              value={printedTotal}
              onChange={(e) => setPrintedTotal(e.target.value)}
            />
          </div>

          <table className="table">
            <caption>Líneas del ticket</caption>
            <thead>
              <tr>
                <th scope="col">Descripción</th>
                <th scope="col">Cantidad</th>
                <th scope="col">Unidad</th>
                <th scope="col">Precio/unidad</th>
                <th scope="col">Importe</th>
                <th scope="col">Producto</th>
                <th scope="col">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.key}>
                  <td>
                    <input
                      type="text"
                      className="input"
                      aria-label="Descripción"
                      value={line.description}
                      onChange={(e) => updateLine(line.key, { description: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      className="input"
                      aria-label="Cantidad"
                      value={line.quantity}
                      onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                    />
                  </td>
                  <td>
                    <select
                      className="input"
                      aria-label="Unidad"
                      value={line.unit}
                      onChange={(e) => updateLine(line.key, { unit: e.target.value as ReceiptUnit })}
                    >
                      <option value="unidad">unidad</option>
                      <option value="kg">kg</option>
                    </select>
                  </td>
                  <td>
                    <input
                      type="text"
                      className="input"
                      aria-label="Precio por unidad"
                      value={line.pricePerUnit}
                      onChange={(e) => updateLine(line.key, { pricePerUnit: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      className="input"
                      aria-label="Importe"
                      value={line.amount}
                      onChange={(e) => updateLine(line.key, { amount: e.target.value })}
                    />
                  </td>
                  <td>
                    <select
                      className="input"
                      aria-label="Producto"
                      value={line.productId}
                      onChange={(e) => updateLine(line.key, { productId: e.target.value })}
                    >
                      <option value={NEW_OPTION_VALUE}>+ Nuevo: {line.productName}</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    {!line.productId && (
                      <input
                        type="text"
                        className="input"
                        aria-label="Nombre del nuevo producto"
                        value={line.productName}
                        onChange={(e) => updateLine(line.key, { productName: e.target.value })}
                      />
                    )}
                  </td>
                  <td>
                    <button type="button" className="btn btn-ghost" onClick={() => removeLine(line.key)}>
                      Eliminar línea
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <button type="button" className="btn btn-secondary" onClick={addLine}>
            Añadir línea
          </button>

          <p>
            Suma de las líneas: {linesTotal.toFixed(2)} €{printedTotal && <> · Total impreso: {printedTotal} €</>}
          </p>
          {totalsMismatch && (
            <p role="alert">La suma de las líneas no coincide con el total impreso — revisa antes de confirmar.</p>
          )}

          {confirmError && <p role="alert">{confirmError}</p>}

          <button type="button" className="btn btn-primary" disabled={isConfirming || lines.length === 0} onClick={() => void handleConfirm()}>
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
