import { useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { useConnectivity } from '../hooks/useConnectivity';
import { confirmStockImport, previewStockImport } from '../api/stock-import';
import type { StockImportOptions, StockImportRowSummary, StockImportSummary } from '../api/stock-import';
import { ApiError } from '../api/client';

/**
 * Spec 033 (H1-H6), plan.md §10/§15.5: seleccionar fichero y qué
 * historiales traer → validar (vista previa) → confirmar (mismo fichero y
 * misma selección, sin volver a pedirlos) → resultado final con enlace a
 * `/patrimonio`. Mismo criterio del resto de la app: HTML semántico plano,
 * sin CSS.
 */
export function StockImportPage() {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const isOnline = useConnectivity();

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [options, setOptions] = useState<StockImportOptions>({ includePurchases: true, includeSales: true, includeValuations: true });
  const [preview, setPreview] = useState<StockImportSummary | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);

  const [confirmResult, setConfirmResult] = useState<StockImportSummary | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  // H6 criterio 4: al menos un historial marcado.
  const hasAnySelected = options.includePurchases || options.includeSales || options.includeValuations;

  function discardPreview() {
    // H6 criterio 5 / mismo criterio que cambiar de fichero: hay que volver a validar.
    setPreview(null);
    setPreviewError(null);
    setConfirmResult(null);
    setConfirmError(null);
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setSelectedFile(event.target.files?.[0] ?? null);
    discardPreview();
  }

  function handleOptionChange(key: keyof StockImportOptions) {
    return (event: ChangeEvent<HTMLInputElement>) => {
      setOptions((prev) => ({ ...prev, [key]: event.target.checked }));
      discardPreview();
    };
  }

  async function handlePreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFile || !hasAnySelected) return;
    setPreviewError(null);
    setIsPreviewing(true);
    try {
      const result = await previewStockImport(selectedFile, options);
      setPreview(result);
    } catch (err) {
      setPreviewError(err instanceof ApiError ? err.message : 'No se ha podido validar el fichero.');
    } finally {
      setIsPreviewing(false);
    }
  }

  async function handleConfirm() {
    if (!selectedFile) return;
    setConfirmError(null);
    setIsConfirming(true);
    try {
      const result = await confirmStockImport(selectedFile, options);
      setConfirmResult(result);
    } catch (err) {
      setConfirmError(err instanceof ApiError ? err.message : 'No se ha podido confirmar la importación.');
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
        <h1>Importar acciones desde CSV</h1>
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
        <h1>Importar acciones desde CSV</h1>
        <p role="status">Esta página requiere conexión a internet.</p>
      </main>
    );
  }

  return (
    <main>
      <h1>Importar acciones desde CSV</h1>
      <p>
        Sube el CSV de "Resumen de posiciones" exportado desde Investing.com para traer tus posiciones abiertas y
        cerradas a Acciones. Antes de guardar nada, verás una vista previa de lo que se importaría — no se crea ni
        una acción ni una compra hasta que confirmes.
      </p>

      <section>
        <h2>1. Seleccionar fichero</h2>
        <form onSubmit={(e) => void handlePreview(e)}>
          <label htmlFor="stock-import-file">Fichero .csv</label>
          <input id="stock-import-file" type="file" accept=".csv" className="input" onChange={handleFileChange} />

          <fieldset>
            <legend>Qué importar</legend>
            <label htmlFor="stock-import-purchases">
              <input
                id="stock-import-purchases"
                type="checkbox"
                checked={options.includePurchases}
                onChange={handleOptionChange('includePurchases')}
              />{' '}
              Compras
            </label>
            <label htmlFor="stock-import-sales">
              <input id="stock-import-sales" type="checkbox" checked={options.includeSales} onChange={handleOptionChange('includeSales')} />{' '}
              Ventas
            </label>
            <label htmlFor="stock-import-valuations">
              <input
                id="stock-import-valuations"
                type="checkbox"
                checked={options.includeValuations}
                onChange={handleOptionChange('includeValuations')}
              />{' '}
              Valoraciones
            </label>
            {!hasAnySelected && <p role="alert">Selecciona al menos un historial a importar.</p>}
          </fieldset>

          {previewError && <p role="alert">{previewError}</p>}

          <button type="submit" className="btn btn-primary" disabled={!selectedFile || !hasAnySelected || isPreviewing}>
            {isPreviewing ? 'Validando…' : 'Validar'}
          </button>
        </form>
      </section>

      {preview && !confirmResult && (
        <section>
          <h2>2. Vista previa</h2>
          <p>
            {preview.totals.newStocks} acciones nuevas · {preview.totals.existingStocks} ya existentes ·{' '}
            {preview.totals.ambiguousStocks} ambiguas (no se importan).
          </p>

          <StockImportTable rows={preview.stocks} />

          <h3>Confirmar</h3>
          <p>Se importarán las compras, ventas y valoraciones nuevas; las filas ambiguas no importan nada.</p>

          {confirmError && <p role="alert">{confirmError}</p>}

          <button type="button" className="btn btn-primary" disabled={isConfirming} onClick={() => void handleConfirm()}>
            {isConfirming ? 'Importando…' : 'Confirmar importación'}
          </button>
        </section>
      )}

      {confirmResult && (
        <section>
          <h2>Importación completada</h2>
          <p>
            {confirmResult.totals.newStocks} acciones nuevas creadas · {confirmResult.totals.existingStocks} acciones
            existentes ampliadas · {confirmResult.totals.ambiguousStocks} ambiguas sin importar.
          </p>
          <StockImportTable rows={confirmResult.stocks} />
          <p>
            <Link to="/patrimonio">Ver Resumen Patrimonio</Link>
          </p>
        </section>
      )}
    </main>
  );
}

const STATUS_LABELS: Record<StockImportRowSummary['status'], string> = {
  new: 'Nueva',
  existing: 'Ya existe',
  ambiguous: 'Ambigua (no se importa)',
};

function StockImportTable({ rows }: { rows: StockImportRowSummary[] }) {
  if (rows.length === 0) return <p>El fichero no trae ninguna acción.</p>;
  return (
    <table className="table">
      <caption>Acciones del fichero</caption>
      <thead>
        <tr>
          <th scope="col">Acción</th>
          <th scope="col">Estado</th>
          <th scope="col">Banco custodia</th>
          <th scope="col">Compras nuevas</th>
          <th scope="col">Ventas nuevas</th>
          <th scope="col">Valoraciones nuevas</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.name}>
            <td>{row.name}</td>
            <td>{STATUS_LABELS[row.status]}</td>
            <td>{row.custodyBank ?? '—'}</td>
            <td>
              {row.purchases.toImport} / {row.purchases.total} ({row.purchases.alreadyExisting} ya existían)
            </td>
            <td>
              {row.sales.toImport} / {row.sales.total} ({row.sales.alreadyExisting} ya existían)
            </td>
            <td>
              {row.valuations.toImport} / {row.valuations.total} ({row.valuations.alreadyExisting} ya existían)
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
