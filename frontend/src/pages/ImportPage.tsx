import { useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { useConnectivity } from '../hooks/useConnectivity';
import { confirmImport, previewImport } from '../api/import';
import type { ImportConfirmResult, ImportPreviewResult, InvalidImportRow } from '../api/import';
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
              Ingresos: {preview.income.validCount} válidos, {preview.income.invalid.length} con problemas.
            </li>
            <li>
              Gastos: {preview.expense.validCount} válidos, {preview.expense.invalid.length} con problemas.
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
          <ul>
            <li>
              Ingresos importados: {confirmResult.income.importedCount} (descartados: {confirmResult.income.invalid.length})
            </li>
            <li>
              Gastos importados: {confirmResult.expense.importedCount} (descartados: {confirmResult.expense.invalid.length})
            </li>
          </ul>

          {confirmResult.categoriesCreated.length > 0 && (
            <p>Categorías nuevas creadas: {confirmResult.categoriesCreated.join(', ')}.</p>
          )}

          <InvalidRowsTable title="Ingresos descartados" rows={confirmResult.income.invalid} />
          <InvalidRowsTable title="Gastos descartados" rows={confirmResult.expense.invalid} />

          <p>
            <Link to="/movements">Ver movimientos</Link> · <Link to="/dashboard">Ver dashboard</Link>
          </p>
        </section>
      )}
    </main>
  );
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
