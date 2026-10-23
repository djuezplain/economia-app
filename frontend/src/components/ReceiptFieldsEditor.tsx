import type { ReceiptUnit } from '../api/receipt-import';
import type { Product, Supermarket } from '../api/groceries';
import { NEW_OPTION_VALUE, NO_PRODUCT_VALUE, sumAmounts } from './receipt-line.types';
import type { EditableLine } from './receipt-line.types';

interface ReceiptFieldsEditorProps {
  supermarkets: Supermarket[];
  products: Product[];
  supermarketId: string;
  onSupermarketIdChange: (id: string) => void;
  supermarketName: string;
  onSupermarketNameChange: (name: string) => void;
  date: string;
  onDateChange: (date: string) => void;
  printedTotal: string;
  onPrintedTotalChange: (value: string) => void;
  lines: EditableLine[];
  onUpdateLine: (key: string, patch: Partial<EditableLine>) => void;
  onRemoveLine: (key: string) => void;
  onAddLine: () => void;
  /** Spec 048 H2 criterio 2: quita todas las líneas (ticket o factura sin desglose). */
  onClearLines: () => void;
}

/**
 * Spec 035, plan.md §5: extraído de `ReceiptImportPage` (spec 034 H2) para
 * reutilizarlo tal cual en la edición de un ticket ya guardado — mismos
 * campos, mismo comportamiento, sin saber si el resultado va a
 * `POST /receipt-import/confirm` o a `PUT /receipts/:id`. Props
 * controladas: quien lo use es dueño del estado (`useState` en la página).
 */
export function ReceiptFieldsEditor({
  supermarkets,
  products,
  supermarketId,
  onSupermarketIdChange,
  supermarketName,
  onSupermarketNameChange,
  date,
  onDateChange,
  printedTotal,
  onPrintedTotalChange,
  lines,
  onUpdateLine,
  onRemoveLine,
  onAddLine,
  onClearLines,
}: ReceiptFieldsEditorProps) {
  const linesTotal = sumAmounts(lines);
  const printedTotalNumber = printedTotal ? Number(printedTotal) : null;
  const hasLines = lines.length > 0;
  const totalsMismatch = hasLines && printedTotalNumber !== null && Math.abs(linesTotal - printedTotalNumber) > 0.01;

  return (
    <>
      <div className="field">
        <label htmlFor="receipt-supermarket">Comercio</label>
        <select id="receipt-supermarket" className="input" value={supermarketId} onChange={(e) => onSupermarketIdChange(e.target.value)}>
          <option value={NEW_OPTION_VALUE}>+ Nuevo comercio</option>
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
            aria-label="Nombre del nuevo comercio"
            value={supermarketName}
            onChange={(e) => onSupermarketNameChange(e.target.value)}
          />
        )}
      </div>

      <div className="field">
        <label htmlFor="receipt-date">Fecha</label>
        <input id="receipt-date" type="date" className="input" value={date} onChange={(e) => onDateChange(e.target.value)} />
      </div>

      <div className="field">
        <label htmlFor="receipt-printed-total">{hasLines ? 'Total impreso en el ticket' : 'Total (obligatorio sin desglose)'}</label>
        <input
          id="receipt-printed-total"
          type="text"
          inputMode="decimal"
          className="input"
          value={printedTotal}
          onChange={(e) => onPrintedTotalChange(e.target.value)}
        />
      </div>

      {!hasLines && (
        <p className="card-meta" role="status">
          Sin desglose: se guardará solo con la fecha, el comercio y el total.
        </p>
      )}

      {hasLines && (
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
                  onChange={(e) => onUpdateLine(line.key, { description: e.target.value })}
                />
              </td>
              <td>
                <input
                  type="text"
                  className="input"
                  aria-label="Cantidad"
                  value={line.quantity}
                  onChange={(e) => onUpdateLine(line.key, { quantity: e.target.value })}
                />
              </td>
              <td>
                <select className="input" aria-label="Unidad" value={line.unit} onChange={(e) => onUpdateLine(line.key, { unit: e.target.value as ReceiptUnit })}>
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
                  onChange={(e) => onUpdateLine(line.key, { pricePerUnit: e.target.value })}
                />
              </td>
              <td>
                <input type="text" className="input" aria-label="Importe" value={line.amount} onChange={(e) => onUpdateLine(line.key, { amount: e.target.value })} />
              </td>
              <td>
                <select className="input" aria-label="Producto" value={line.productId} onChange={(e) => onUpdateLine(line.key, { productId: e.target.value })}>
                  <option value={NEW_OPTION_VALUE}>+ Nuevo: {line.productName}</option>
                  <option value={NO_PRODUCT_VALUE}>— Sin producto —</option>
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
                    onChange={(e) => onUpdateLine(line.key, { productName: e.target.value })}
                  />
                )}
              </td>
              <td>
                <button type="button" className="btn btn-ghost" onClick={() => onRemoveLine(line.key)}>
                  Eliminar línea
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      )}

      <p>
        <button type="button" className="btn btn-secondary" onClick={onAddLine}>
          Añadir línea
        </button>{' '}
        {hasLines && (
          <button type="button" className="btn btn-ghost" onClick={onClearLines}>
            Guardar sin desglose
          </button>
        )}
      </p>

      {hasLines && (
        <p>
          Suma de las líneas: {linesTotal.toFixed(2)} €{printedTotal && <> · Total impreso: {printedTotal} €</>}
        </p>
      )}
      {totalsMismatch && <p role="alert">La suma de las líneas no coincide con el total impreso — revisa antes de confirmar.</p>}
    </>
  );
}
