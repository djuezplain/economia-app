import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { useConnectivity } from '../hooks/useConnectivity';
import { deleteReceipt, getReceipt, listSupermarkets, searchProducts, updateReceipt } from '../api/groceries';
import type { Product, ReceiptDetail, Supermarket } from '../api/groceries';
import type { ConfirmReceiptLine, ConfirmReceiptPayload } from '../api/receipt-import';
import { ApiError } from '../api/client';
import { ReceiptFieldsEditor } from '../components/ReceiptFieldsEditor';
import { ReceiptDocumentSection } from '../components/ReceiptDocumentSection';
import { NEW_OPTION_VALUE, newLineKey } from '../components/receipt-line.types';
import type { EditableLine } from '../components/receipt-line.types';

function toEditableLines(receipt: ReceiptDetail): EditableLine[] {
  return receipt.lines.map((line) => ({
    key: newLineKey(),
    description: line.description,
    quantity: line.quantity,
    unit: line.unit as EditableLine['unit'],
    pricePerUnit: line.pricePerUnit,
    amount: line.amount,
    productId: line.productId,
    productName: line.productName,
  }));
}

/**
 * Spec 034 (H5 criterio 2), plan.md §11 + spec 035 (H1-H3), plan.md §5:
 * gana edición (reutiliza `ReceiptFieldsEditor`, el mismo editor de
 * `ReceiptImportPage`) y borrado con confirmación en dos pasos.
 */
export function ReceiptDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const isOnline = useConnectivity();

  const [receipt, setReceipt] = useState<ReceiptDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [supermarkets, setSupermarkets] = useState<Supermarket[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  const [isEditing, setIsEditing] = useState(false);
  const [supermarketId, setSupermarketId] = useState('');
  const [supermarketName, setSupermarketName] = useState('');
  const [date, setDate] = useState('');
  const [printedTotal, setPrintedTotal] = useState('');
  const [lines, setLines] = useState<EditableLine[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || !id) return;
    getReceipt(id)
      .then(setReceipt)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'No se ha podido cargar el ticket.'));
  }, [isAuthenticated, id]);

  useEffect(() => {
    if (!isAuthenticated) return;
    void listSupermarkets().then(setSupermarkets);
    void searchProducts().then(setProducts);
  }, [isAuthenticated]);

  function startEditing() {
    if (!receipt) return;
    setSupermarketId(receipt.supermarketId);
    setSupermarketName(receipt.supermarketName);
    setDate(receipt.date);
    setPrintedTotal(receipt.printedTotal ?? '');
    setLines(toEditableLines(receipt));
    setSaveError(null);
    setIsEditing(true);
  }

  function cancelEditing() {
    setIsEditing(false);
    setSaveError(null);
  }

  function updateLine(key: string, patch: Partial<EditableLine>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function removeLine(key: string) {
    setLines((current) => current.filter((line) => line.key !== key));
  }

  function addLine() {
    setLines((current) => [
      ...current,
      { key: newLineKey(), description: '', quantity: '1', unit: 'unidad', pricePerUnit: '', amount: '', productId: NEW_OPTION_VALUE, productName: '' },
    ]);
  }

  async function handleSave() {
    if (!id) return;
    setSaveError(null);
    setIsSaving(true);
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
      const updated = await updateReceipt(id, payload);
      setReceipt(updated);
      setIsEditing(false);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'No se han podido guardar los cambios.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleConfirmDelete() {
    if (!id) return;
    setDeleteError(null);
    setIsDeleting(true);
    try {
      await deleteReceipt(id);
      navigate('/tickets');
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : 'No se ha podido borrar el ticket.');
      setIsDeleting(false);
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

      {receipt && !isEditing && (
        <>
          <h1>
            {receipt.supermarketName} — {receipt.date}
          </h1>
          <p>Total impreso: {receipt.printedTotal ? `${receipt.printedTotal} €` : 'No se pudo leer'}</p>

          <p>
            <button type="button" className="btn btn-secondary" onClick={startEditing}>
              Editar
            </button>{' '}
            <button type="button" className="btn btn-ghost" onClick={() => setConfirmDelete(true)}>
              Borrar ticket
            </button>
          </p>

          {confirmDelete && (
            <p role="alert">
              ¿Seguro que quieres borrar este ticket? No se puede deshacer.{' '}
              <button type="button" className="btn btn-ghost" disabled={isDeleting} onClick={() => void handleConfirmDelete()}>
                {isDeleting ? 'Borrando…' : 'Sí, borrar'}
              </button>{' '}
              <button type="button" className="btn btn-ghost" disabled={isDeleting} onClick={() => setConfirmDelete(false)}>
                Cancelar
              </button>
            </p>
          )}
          {deleteError && <p role="alert">{deleteError}</p>}

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
                  {/* Líneas a peso (kg): el precio por unidad de báscula es poco fiable/legible en el ticket, así que se muestra el importe (el dato real cobrado) en su lugar — el historial del producto (ProductDetailPage) sigue usando el precio por unidad, sin cambios. */}
                  <td>{line.unit === 'kg' ? line.amount : line.pricePerUnit} €</td>
                  <td>{line.amount} €</td>
                </tr>
              ))}
            </tbody>
          </table>

          <ReceiptDocumentSection
            receiptId={receipt.id}
            document={receipt.document}
            onChanged={(document) => setReceipt((current) => (current ? { ...current, document } : current))}
          />
        </>
      )}

      {receipt && isEditing && (
        <>
          <h1>Editar ticket</h1>

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
          />

          {saveError && <p role="alert">{saveError}</p>}

          <button type="button" className="btn btn-primary" disabled={isSaving || lines.length === 0} onClick={() => void handleSave()}>
            {isSaving ? 'Guardando…' : 'Guardar cambios'}
          </button>{' '}
          <button type="button" className="btn btn-ghost" disabled={isSaving} onClick={cancelEditing}>
            Cancelar
          </button>
        </>
      )}
    </main>
  );
}
