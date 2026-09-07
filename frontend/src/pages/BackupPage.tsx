import { useState } from 'react';
import type { ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { exportAccountData } from '../api/users';
import { confirmDataImport, previewDataImport, DATA_TABLE_LABELS } from '../api/data-import';
import type { DataImportSummary } from '../api/data-import';
import { ApiError } from '../api/client';

/**
 * Spec 032 (H1-H3): punto de acceso único para exportar todos los datos
 * (H1 — mismo `exportAccountData()`/`GET /users/me/export` que antes vivía
 * en `ProfilePage`, ahora con todo el patrimonio incluido) e importarlos
 * de vuelta en modo fusión/aditivo (H2 — selecciona fichero → vista previa
 * automática → confirmar, mismo patrón de dos pasos que `ImportPage`).
 */
export function BackupPage() {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();

  // Exportar (H1).
  const [exportError, setExportError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  // Importar (H2).
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<DataImportSummary | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [confirmResult, setConfirmResult] = useState<DataImportSummary | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  async function handleExport() {
    setExportError(null);
    setIsExporting(true);
    try {
      const data = await exportAccountData();
      // Mismo criterio que el export original de `ProfilePage` (H8, spec
      // 001): se genera en el cliente a partir de la respuesta, sin
      // endpoint aparte para "descargar como fichero".
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `economia-app-datos-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err instanceof ApiError ? err.message : 'No se han podido exportar tus datos.');
    } finally {
      setIsExporting(false);
    }
  }

  async function runPreview(file: File) {
    setPreviewError(null);
    setIsPreviewing(true);
    try {
      const result = await previewDataImport(file);
      setPreview(result);
    } catch (err) {
      setPreviewError(err instanceof ApiError ? err.message : 'No se ha podido validar el fichero.');
    } finally {
      setIsPreviewing(false);
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    // Un fichero nuevo invalida cualquier vista previa/resultado anterior —
    // mismo criterio que `ImportPage` (spec 003).
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);
    setPreview(null);
    setPreviewError(null);
    setConfirmResult(null);
    setConfirmError(null);
    if (file) void runPreview(file);
  }

  async function handleConfirm() {
    if (!selectedFile) return;
    setConfirmError(null);
    setIsConfirming(true);
    try {
      // Mismo fichero ya seleccionado, se vuelve a subir — no se confía en
      // que el backend recuerde la vista previa anterior (H2 criterio 4/5).
      const result = await confirmDataImport(selectedFile);
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
        <h1>Copia de seguridad</h1>
        <p role="alert">Tienes que iniciar sesión para ver esto.</p>
        <p>
          <Link to="/login">Iniciar sesión</Link>
        </p>
      </main>
    );
  }

  return (
    <main>
      <h1>Copia de seguridad</h1>
      <p>Exporta todos tus datos a un único fichero JSON, o importa uno exportado antes para recuperar datos en tu cuenta.</p>

      <section>
        <h2>Exportar todos tus datos</h2>
        <div className="card elev-sm">
          <p className="card-body">
            Descarga un fichero con absolutamente todo: categorías, movimientos, patrimonio (cuentas bancarias,
            acciones, fondos, cripto, vehículos, plan de pensiones, efectivo, con todo su historial) y objetivos y
            presupuestos.
          </p>
          {exportError && <p role="alert">{exportError}</p>}
          <div>
            <button type="button" className="btn btn-secondary" disabled={isExporting} onClick={() => void handleExport()}>
              {isExporting ? 'Exportando…' : 'Exportar mis datos'}
            </button>
          </div>
        </div>
      </section>

      <section>
        <h2>Importar datos</h2>
        <p>
          Sube un fichero exportado antes (de tu propia cuenta) para añadir sus datos a los que ya tienes. Nunca
          borra ni sobrescribe nada: si algo del fichero ya existe, se omite.
        </p>

        <div id="import-dropzone">
          <label htmlFor="backup-import-file">Fichero .json</label>
          <input id="backup-import-file" type="file" accept=".json" className="input" onChange={handleFileChange} />
        </div>

        {isPreviewing && <p role="status">Validando…</p>}
        {previewError && <p role="alert">{previewError}</p>}

        {preview && !confirmResult && (
          <div>
            <h3>Vista previa</h3>
            <p>Nada de esto se ha guardado todavía.</p>
            <DataImportSummaryTable summary={preview} />

            {confirmError && <p role="alert">{confirmError}</p>}
            <button type="button" className="btn btn-primary" disabled={isConfirming} onClick={() => void handleConfirm()}>
              {isConfirming ? 'Importando…' : 'Confirmar importación'}
            </button>
          </div>
        )}

        {confirmResult && (
          <div>
            <h3>Importación completada</h3>
            <DataImportSummaryTable summary={confirmResult} />
          </div>
        )}
      </section>
    </main>
  );
}

function DataImportSummaryTable({ summary }: { summary: DataImportSummary }) {
  const rows = Object.entries(summary).filter(([, tableSummary]) => tableSummary.total > 0);
  if (rows.length === 0) {
    return <p>El fichero no trae ningún dato.</p>;
  }
  return (
    <table className="table">
      <caption className="sr-only">Resumen de la importación</caption>
      <thead>
        <tr>
          <th scope="col">Tipo de dato</th>
          <th scope="col">Nuevos</th>
          <th scope="col">Ya existentes</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([key, tableSummary]) => (
          <tr key={key}>
            <td>{DATA_TABLE_LABELS[key] ?? key}</td>
            <td>{tableSummary.toImport}</td>
            <td>{tableSummary.alreadyExisting}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
