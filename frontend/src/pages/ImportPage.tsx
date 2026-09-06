import { useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { useConnectivity } from '../hooks/useConnectivity';
import { confirmImport, previewImport } from '../api/import';
import type { ImportConfirmResult, ImportPreviewResult, InvalidImportRow } from '../api/import';
import {
  getGoogleSheetConfig,
  removeGoogleSheetConfig,
  runGoogleSheetImportNow,
  saveGoogleSheetConfig,
  setGoogleSheetAutoImport,
} from '../api/google-sheets-import';
import type { GoogleSheetsImportConfig } from '../api/google-sheets-import';
import { ApiError } from '../api/client';

/**
 * H1/H2 (spec 003), plan.md §8: seleccionar fichero → validar (vista
 * previa) → confirmar (mismo fichero, sin volver a pedirlo) → resultado
 * final con enlaces a `/movements` y `/dashboard`. Mismo criterio del
 * resto de la app: HTML semántico plano, sin CSS.
 */
export function ImportPage() {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const isOnline = useConnectivity();

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreviewResult | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);

  const [confirmResult, setConfirmResult] = useState<ImportConfirmResult | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  // H1-H3 (spec 026): configuración de la importación desde Google Sheets.
  const [googleSheetConfig, setGoogleSheetConfig] = useState<GoogleSheetsImportConfig | null>(null);
  const [googleSheetConfigError, setGoogleSheetConfigError] = useState<string | null>(null);
  const [googleSheetInput, setGoogleSheetInput] = useState('');
  const [saveGoogleSheetError, setSaveGoogleSheetError] = useState<string | null>(null);
  const [isSavingGoogleSheet, setIsSavingGoogleSheet] = useState(false);
  const [isRemovingGoogleSheet, setIsRemovingGoogleSheet] = useState(false);
  const [isTogglingAutoImport, setIsTogglingAutoImport] = useState(false);
  const [googleSheetRunResult, setGoogleSheetRunResult] = useState<ImportConfirmResult | null>(null);
  const [runGoogleSheetError, setRunGoogleSheetError] = useState<string | null>(null);
  const [isRunningGoogleSheetImport, setIsRunningGoogleSheetImport] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || !isOnline) return;
    let cancelled = false;
    (async () => {
      try {
        const config = await getGoogleSheetConfig();
        if (!cancelled) setGoogleSheetConfig(config);
      } catch (err) {
        if (!cancelled) {
          // Un 503 (sin credenciales de servicio en este entorno) no es un
          // error del usuario — se trata igual que "función no disponible",
          // sin bloquear el resto de la página de importación.
          setGoogleSheetConfigError(
            err instanceof ApiError ? err.message : 'No se ha podido cargar la configuración de Google Sheets.',
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isOnline]);

  async function handleSaveGoogleSheetConfig(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveGoogleSheetError(null);
    setIsSavingGoogleSheet(true);
    try {
      const config = await saveGoogleSheetConfig(googleSheetInput);
      setGoogleSheetConfig(config);
      setGoogleSheetInput('');
    } catch (err) {
      setSaveGoogleSheetError(err instanceof ApiError ? err.message : 'No se ha podido guardar la hoja.');
    } finally {
      setIsSavingGoogleSheet(false);
    }
  }

  async function handleRemoveGoogleSheetConfig() {
    setIsRemovingGoogleSheet(true);
    try {
      await removeGoogleSheetConfig();
      setGoogleSheetConfig((prev) => (prev ? { ...prev, spreadsheetId: null, autoImportEnabled: false, lastRun: null } : prev));
      setGoogleSheetRunResult(null);
      setRunGoogleSheetError(null);
    } catch (err) {
      setGoogleSheetConfigError(err instanceof ApiError ? err.message : 'No se ha podido quitar la hoja.');
    } finally {
      setIsRemovingGoogleSheet(false);
    }
  }

  async function handleToggleAutoImport(enabled: boolean) {
    setIsTogglingAutoImport(true);
    try {
      const config = await setGoogleSheetAutoImport(enabled);
      setGoogleSheetConfig(config);
    } catch (err) {
      setGoogleSheetConfigError(err instanceof ApiError ? err.message : 'No se ha podido cambiar la importación automática.');
    } finally {
      setIsTogglingAutoImport(false);
    }
  }

  async function handleRunGoogleSheetImport() {
    setRunGoogleSheetError(null);
    setIsRunningGoogleSheetImport(true);
    try {
      const result = await runGoogleSheetImportNow();
      setGoogleSheetRunResult(result);
      const config = await getGoogleSheetConfig();
      setGoogleSheetConfig(config);
    } catch (err) {
      setRunGoogleSheetError(err instanceof ApiError ? err.message : 'No se ha podido importar desde Google Sheets.');
    } finally {
      setIsRunningGoogleSheetImport(false);
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    // Un fichero nuevo invalida cualquier vista previa/resultado anterior —
    // hay que volver a validar antes de poder confirmar de nuevo.
    setSelectedFile(event.target.files?.[0] ?? null);
    setPreview(null);
    setPreviewError(null);
    setConfirmResult(null);
    setConfirmError(null);
  }

  async function handlePreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFile) return;
    setPreviewError(null);
    setIsPreviewing(true);
    try {
      const result = await previewImport(selectedFile);
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
      const result = await confirmImport(selectedFile);
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
        <h1>Importar desde Excel</h1>
        <p role="alert">Tienes que iniciar sesión para ver esto.</p>
        <p>
          <Link to="/login">Iniciar sesión</Link>
        </p>
      </main>
    );
  }

  // Spec 011 (modo offline), H6 criterio 1, spec.md §2: importar desde
  // Excel queda fuera de alcance de esta spec.
  if (!isOnline) {
    return (
      <main>
        <h1>Importar desde Excel</h1>
        <p role="status">Esta página requiere conexión a internet.</p>
      </main>
    );
  }

  return (
    <main>
      <h1>Importar desde Excel</h1>
      <p>
        Sube tu Excel "2026" para traspasar tus ingresos y gastos ya registrados. Antes de guardar nada, verás una
        vista previa de lo que se importaría — no se crea ni un movimiento ni una categoría hasta que confirmes.
      </p>

      <section>
        <h2>1. Seleccionar fichero</h2>
        {/* Spec 010 (rediseño editorial), plan.md §4.5. Borde discontinuo del
            handoff — solo aparece una vez en toda la app, así que va por
            `id` (convención del proyecto) en vez de una clase nueva; el
            propio formulario (label + input + botón) es el real, no se
            añade "arrastra tu archivo" porque no hay arrastrar-y-soltar
            implementado, solo el estilo del recuadro. */}
        <form id="import-dropzone" onSubmit={(e) => void handlePreview(e)}>
          <label htmlFor="import-file">Fichero .xlsx</label>
          <input id="import-file" type="file" accept=".xlsx" className="input" onChange={handleFileChange} />

          {previewError && <p role="alert">{previewError}</p>}

          <button type="submit" className="btn btn-primary" disabled={!selectedFile || isPreviewing}>
            {isPreviewing ? 'Validando…' : 'Validar'}
          </button>
        </form>
      </section>

      {preview && !confirmResult && (
        <section>
          <h2>2. Vista previa</h2>
          <ul>
            <li>
              Ingresos: {preview.income.validCount} válidos ({preview.income.validCount - preview.income.duplicates.length}{' '}
              nuevos, {preview.income.duplicates.length} ya registrados), {preview.income.invalid.length} con problemas.
            </li>
            <li>
              Gastos: {preview.expense.validCount} válidos ({preview.expense.validCount - preview.expense.duplicates.length}{' '}
              nuevos, {preview.expense.duplicates.length} ya registrados), {preview.expense.invalid.length} con problemas.
            </li>
          </ul>

          {preview.newCategories.length > 0 && (
            <div>
              <h3>Categorías nuevas que se crearían</h3>
              <ul>
                {preview.newCategories.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Spec 012 (detección de duplicados): estas filas ya no se
              importan al confirmar — se muestran para que Diego pueda
              revisarlas antes, con el mismo componente de tabla que las
              filas con problemas. */}
          <InvalidRowsTable title="Ingresos ya registrados" rows={preview.income.duplicates} />
          <InvalidRowsTable title="Gastos ya registrados" rows={preview.expense.duplicates} />

          <InvalidRowsTable title="Ingresos con problemas" rows={preview.income.invalid} />
          <InvalidRowsTable title="Gastos con problemas" rows={preview.expense.invalid} />

          <h3>Confirmar</h3>
          <p>Se importarán las filas válidas; las filas con problemas se descartarán (puedes corregirlas en el Excel y volver a subirlo).</p>

          {confirmError && <p role="alert">{confirmError}</p>}

          <button type="button" className="btn btn-primary" disabled={isConfirming} onClick={() => void handleConfirm()}>
            {isConfirming ? 'Importando…' : 'Confirmar importación'}
          </button>
        </section>
      )}

      {confirmResult && (
        <section>
          <h2>Importación completada</h2>
          <ImportResultSummary result={confirmResult} />
          <p>
            <Link to="/movements">Ver movimientos</Link> · <Link to="/dashboard">Ver dashboard</Link>
          </p>
        </section>
      )}

      <section>
        <h2>Importar desde Google Sheets</h2>
        <p>
          Configura tu Google Sheet una vez y trae desde ahí tus ingresos y gastos, con las mismas hojas y columnas
          que el Excel — a mano cuando quieras, o automáticamente cada 4 horas.
        </p>

        {googleSheetConfigError && <p role="alert">{googleSheetConfigError}</p>}

        {googleSheetConfig && !googleSheetConfig.spreadsheetId && (
          <form onSubmit={(e) => void handleSaveGoogleSheetConfig(e)} aria-label="Configurar Google Sheet" noValidate>
            <div className="field">
              <label htmlFor="google-sheet-input">URL o ID de tu Google Sheet</label>
              <input
                id="google-sheet-input"
                className="input"
                value={googleSheetInput}
                onChange={(e) => setGoogleSheetInput(e.target.value)}
                required
              />
            </div>
            <p>
              Antes de guardar, comparte tu hoja (permiso de Lector) con{' '}
              <strong>{googleSheetConfig.serviceAccountEmail}</strong>.
            </p>
            {saveGoogleSheetError && <p role="alert">{saveGoogleSheetError}</p>}
            <button type="submit" className="btn btn-primary" disabled={isSavingGoogleSheet}>
              {isSavingGoogleSheet ? 'Comprobando acceso…' : 'Guardar hoja'}
            </button>
          </form>
        )}

        {googleSheetConfig && googleSheetConfig.spreadsheetId && (
          <div>
            <p>
              Hoja configurada: <code>{googleSheetConfig.spreadsheetId}</code>
            </p>

            <div className="field">
              <label htmlFor="google-sheet-auto-import">
                <input
                  id="google-sheet-auto-import"
                  type="checkbox"
                  checked={googleSheetConfig.autoImportEnabled}
                  disabled={isTogglingAutoImport}
                  onChange={(e) => void handleToggleAutoImport(e.target.checked)}
                />{' '}
                Importar automáticamente cada 4 horas
              </label>
            </div>

            {runGoogleSheetError && <p role="alert">{runGoogleSheetError}</p>}

            <button
              type="button"
              className="btn btn-primary"
              disabled={isRunningGoogleSheetImport}
              onClick={() => void handleRunGoogleSheetImport()}
            >
              {isRunningGoogleSheetImport ? 'Importando…' : 'Importar ahora'}
            </button>{' '}
            <button type="button" className="btn btn-ghost" disabled={isRemovingGoogleSheet} onClick={() => void handleRemoveGoogleSheetConfig()}>
              {isRemovingGoogleSheet ? 'Quitando…' : 'Quitar hoja'}
            </button>

            {googleSheetRunResult && (
              <div>
                <h3>Resultado de la última importación</h3>
                <ImportResultSummary result={googleSheetRunResult} />
              </div>
            )}

            {!googleSheetRunResult && googleSheetConfig.lastRun && (
              <div>
                <h3>Última ejecución ({formatDateTime(googleSheetConfig.lastRun.at)})</h3>
                {googleSheetConfig.lastRun.error ? (
                  <p role="alert">{googleSheetConfig.lastRun.error}</p>
                ) : (
                  googleSheetConfig.lastRun.result && <ImportResultSummary result={googleSheetConfig.lastRun.result} />
                )}
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  );
}

function ImportResultSummary({ result }: { result: ImportConfirmResult }) {
  return (
    <>
      <ul>
        <li>
          Ingresos importados: {result.income.importedCount} (descartados: {result.income.invalid.length}, ya
          registrados: {result.income.skippedDuplicateCount})
        </li>
        <li>
          Gastos importados: {result.expense.importedCount} (descartados: {result.expense.invalid.length}, ya
          registrados: {result.expense.skippedDuplicateCount})
        </li>
      </ul>

      {result.categoriesCreated.length > 0 && <p>Categorías nuevas creadas: {result.categoriesCreated.join(', ')}.</p>}

      <InvalidRowsTable title="Ingresos descartados" rows={result.income.invalid} />
      <InvalidRowsTable title="Gastos descartados" rows={result.expense.invalid} />
    </>
  );
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('es-ES');
}

function InvalidRowsTable({ title, rows }: { title: string; rows: InvalidImportRow[] }) {
  if (rows.length === 0) return null;
  return (
    <table className="table">
      <caption>{title}</caption>
      <thead>
        <tr>
          <th scope="col">Fila</th>
          <th scope="col">Motivo</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.rowNumber}>
            <td>{row.rowNumber}</td>
            <td>{row.reason}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
