import { useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { exportAccountArchive } from '../api/users';
import { confirmDataImport, previewDataImport, DATA_TABLE_LABELS } from '../api/data-import';
import type { DataImportSummary } from '../api/data-import';
import { disconnectDrive, driveConnectUrl, exportToDrive, getDriveConnectionStatus } from '../api/google-drive';
import { disableScheduledExport, getScheduledExport, saveScheduledExport } from '../api/scheduled-exports';
import type { ScheduleDestination, ScheduleFrequency, ScheduledExportConfig } from '../api/scheduled-exports';
import { ApiError } from '../api/client';

/**
 * Spec 032 (H1-H3): punto de acceso único para exportar todos los datos
 * (H1 — mismo `exportAccountData()`/`GET /users/me/export` que antes vivía
 * en `ProfilePage`, ahora con todo el patrimonio incluido) e importarlos
 * de vuelta en modo fusión/aditivo (H2 — selecciona fichero → vista previa
 * automática → confirmar, mismo patrón de dos pasos que `ImportPage`).
 * H4 añade el envío a Google Drive como opción extra de exportación, sin
 * quitar la descarga local. H5 añade poder programar que H1/H4 se repitan
 * solas, con periodicidad/hora/destino elegidos por el usuario.
 */

// Spec 032 H5, plan.md §11.9: mismo índice que `Date.getDay()` (0 = domingo), que es lo que espera `dayOfWeek` en el backend.
const WEEKDAY_LABELS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MONTH_DAYS = Array.from({ length: 28 }, (_, i) => i + 1);

// Spec 032 H4, plan.md §9.5: `error` que puede llegar en `GET
// /auth/drive/callback → /backup?driveConnected=0&error=...`.
const DRIVE_CONNECT_ERROR_MESSAGES: Record<string, string> = {
  access_denied: 'Has cancelado la conexión con Google Drive.',
  state: 'La conexión con Google Drive ha caducado. Inténtalo de nuevo.',
  no_refresh_token: 'Google no ha concedido el permiso necesario. Vuelve a intentarlo.',
};

export function BackupPage() {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // Exportar (H1).
  const [exportError, setExportError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  // Google Drive (H4).
  const [isDriveConnected, setIsDriveConnected] = useState<boolean | null>(null);
  const [driveStatusError, setDriveStatusError] = useState<string | null>(null);
  const [driveConnectNotice, setDriveConnectNotice] = useState<string | null>(null);
  const [isExportingToDrive, setIsExportingToDrive] = useState(false);
  const [driveExportError, setDriveExportError] = useState<string | null>(null);
  const [driveExportLink, setDriveExportLink] = useState<string | null>(null);
  const [isDisconnectingDrive, setIsDisconnectingDrive] = useState(false);
  const [driveDisconnectError, setDriveDisconnectError] = useState<string | null>(null);

  // Exportación programada (H5).
  const [scheduledExport, setScheduledExport] = useState<ScheduledExportConfig | null>(null);
  const [scheduleLoadError, setScheduleLoadError] = useState<string | null>(null);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleFrequency, setScheduleFrequency] = useState<ScheduleFrequency>('DAILY');
  const [scheduleDayOfWeek, setScheduleDayOfWeek] = useState(1);
  const [scheduleDayOfMonth, setScheduleDayOfMonth] = useState(1);
  const [scheduleTimeOfDay, setScheduleTimeOfDay] = useState('03:00');
  const [scheduleDestination, setScheduleDestination] = useState<ScheduleDestination>('LOCAL');
  const [scheduleLocalSubfolder, setScheduleLocalSubfolder] = useState('');
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);
  const [saveScheduleError, setSaveScheduleError] = useState<string | null>(null);
  const [isDisablingSchedule, setIsDisablingSchedule] = useState(false);

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
      // Spec 048: el `.zip` (datos y documentos) lo genera el backend; aquí
      // solo se descarga.
      const blob = await exportAccountArchive();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `economia-app-datos-${new Date().toISOString().slice(0, 10)}.zip`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err instanceof ApiError ? err.message : 'No se han podido exportar tus datos.');
    } finally {
      setIsExporting(false);
    }
  }

  async function loadDriveStatus() {
    setDriveStatusError(null);
    try {
      const { connected } = await getDriveConnectionStatus();
      setIsDriveConnected(connected);
    } catch (err) {
      // Igual que el resto de guards "no configurado" de Google en esta app
      // (503 sin credenciales): se trata como "Drive no disponible", sin
      // romper el resto de la página de copia de seguridad.
      setIsDriveConnected(false);
      setDriveStatusError(err instanceof ApiError ? err.message : 'No se ha podido comprobar la conexión con Google Drive.');
    }
  }

  useEffect(() => {
    if (!isAuthenticated) return;
    void loadDriveStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  // Retorno de `GET /auth/drive/callback` (plan.md §9.5): lee el resultado de
  // la query string una sola vez y la limpia, para que refrescar la página
  // no vuelva a mostrar el aviso.
  useEffect(() => {
    const driveConnected = searchParams.get('driveConnected');
    if (driveConnected === null) return;

    if (driveConnected === '1') {
      setDriveConnectNotice('Google Drive conectado correctamente.');
      void loadDriveStatus();
    } else {
      const errorCode = searchParams.get('error');
      setDriveConnectNotice(
        (errorCode && DRIVE_CONNECT_ERROR_MESSAGES[errorCode]) ?? 'No se ha podido conectar Google Drive.',
      );
    }

    setSearchParams((params) => {
      params.delete('driveConnected');
      params.delete('error');
      return params;
    }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function handleConnectDrive() {
    window.location.href = driveConnectUrl();
  }

  async function loadScheduledExport() {
    setScheduleLoadError(null);
    try {
      const config = await getScheduledExport();
      setScheduledExport(config);
      if (config) {
        setScheduleEnabled(config.enabled);
        setScheduleFrequency(config.frequency);
        setScheduleDayOfWeek(config.dayOfWeek ?? 1);
        setScheduleDayOfMonth(config.dayOfMonth ?? 1);
        setScheduleTimeOfDay(config.timeOfDay);
        setScheduleDestination(config.destination);
        setScheduleLocalSubfolder(config.localSubfolder ?? '');
      }
    } catch (err) {
      setScheduleLoadError(err instanceof ApiError ? err.message : 'No se ha podido cargar la exportación programada.');
    }
  }

  useEffect(() => {
    if (!isAuthenticated) return;
    void loadScheduledExport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  async function handleSaveSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveScheduleError(null);
    setIsSavingSchedule(true);
    try {
      const saved = await saveScheduledExport({
        enabled: scheduleEnabled,
        frequency: scheduleFrequency,
        timeOfDay: scheduleTimeOfDay,
        destination: scheduleDestination,
        ...(scheduleFrequency === 'WEEKLY' ? { dayOfWeek: scheduleDayOfWeek } : {}),
        ...(scheduleFrequency === 'MONTHLY' ? { dayOfMonth: scheduleDayOfMonth } : {}),
        ...(scheduleDestination === 'LOCAL' && scheduleLocalSubfolder ? { localSubfolder: scheduleLocalSubfolder } : {}),
      });
      setScheduledExport(saved);
    } catch (err) {
      setSaveScheduleError(err instanceof ApiError ? err.message : 'No se ha podido guardar la exportación programada.');
    } finally {
      setIsSavingSchedule(false);
    }
  }

  /** H5 criterio 4: desactiva sin perder la configuración ya introducida en el formulario. */
  async function handleDisableSchedule() {
    setSaveScheduleError(null);
    setIsDisablingSchedule(true);
    try {
      await disableScheduledExport();
      setScheduleEnabled(false);
      setScheduledExport((prev) => (prev ? { ...prev, enabled: false } : prev));
    } catch (err) {
      setSaveScheduleError(err instanceof ApiError ? err.message : 'No se ha podido desactivar la exportación programada.');
    } finally {
      setIsDisablingSchedule(false);
    }
  }

  async function handleExportToDrive() {
    setDriveExportError(null);
    setDriveExportLink(null);
    setIsExportingToDrive(true);
    try {
      const result = await exportToDrive();
      setDriveExportLink(result.webViewLink);
    } catch (err) {
      setDriveExportError(err instanceof ApiError ? err.message : 'No se ha podido guardar el fichero en Google Drive.');
    } finally {
      setIsExportingToDrive(false);
    }
  }

  async function handleDisconnectDrive() {
    if (!window.confirm('¿Desconectar Google Drive? Los ficheros ya guardados allí no se borran.')) return;
    setDriveDisconnectError(null);
    setIsDisconnectingDrive(true);
    try {
      await disconnectDrive();
      setIsDriveConnected(false);
      setDriveExportLink(null);
    } catch (err) {
      setDriveDisconnectError(err instanceof ApiError ? err.message : 'No se ha podido desconectar Google Drive.');
    } finally {
      setIsDisconnectingDrive(false);
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
      <p>Exporta todos tus datos a un único fichero .zip, o importa uno exportado antes para recuperar datos en tu cuenta.</p>

      <section>
        <h2>Exportar todos tus datos</h2>
        <div className="card elev-sm">
          <p className="card-body">
            Descarga un fichero con absolutamente todo: categorías, movimientos, patrimonio (cuentas bancarias,
            acciones, fondos, cripto, vehículos, plan de pensiones, efectivo, con todo su historial), objetivos y
            presupuestos, tickets y facturas (con sus fotos y PDF) y listas de la compra.
          </p>
          {exportError && <p role="alert">{exportError}</p>}
          <div>
            <button type="button" className="btn btn-secondary" disabled={isExporting} onClick={() => void handleExport()}>
              {isExporting ? 'Exportando…' : 'Exportar mis datos'}
            </button>
          </div>
        </div>

        <div className="card elev-sm">
          <h3>Google Drive</h3>
          {driveConnectNotice && <p role="status">{driveConnectNotice}</p>}
          {driveStatusError && <p role="alert">{driveStatusError}</p>}

          {isDriveConnected === null && !driveStatusError && <p>Comprobando la conexión con Google Drive…</p>}

          {isDriveConnected === false && (
            <>
              <p className="card-body">Conecta tu Google Drive para guardar ahí una copia cada vez que exportes.</p>
              <button type="button" className="btn btn-secondary" onClick={handleConnectDrive}>
                Conectar Google Drive
              </button>
            </>
          )}

          {isDriveConnected === true && (
            <>
              <p className="card-body">
                Guarda el mismo fichero de exportación en la carpeta "Economía App" de tu Google Drive.
              </p>
              {driveExportError && <p role="alert">{driveExportError}</p>}
              {driveExportLink && (
                <p role="status">
                  Guardado en Google Drive.{' '}
                  <a href={driveExportLink} target="_blank" rel="noreferrer">
                    Ver fichero
                  </a>
                </p>
              )}
              {driveDisconnectError && <p role="alert">{driveDisconnectError}</p>}
              <div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={isExportingToDrive}
                  onClick={() => void handleExportToDrive()}
                >
                  {isExportingToDrive ? 'Guardando…' : 'Guardar en Google Drive'}
                </button>{' '}
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={isDisconnectingDrive}
                  onClick={() => void handleDisconnectDrive()}
                >
                  {isDisconnectingDrive ? 'Desconectando…' : 'Desconectar'}
                </button>
              </div>
            </>
          )}
        </div>
      </section>

      <section>
        <h2>Exportación programada</h2>
        <div className="card elev-sm">
          <p className="card-body">
            Programa que la exportación completa (mismo contenido que "Exportar todos tus datos") se guarde sola,
            con la periodicidad, hora y destino que elijas.
          </p>

          {scheduleLoadError && <p role="alert">{scheduleLoadError}</p>}

          <form onSubmit={(e) => void handleSaveSchedule(e)}>
            <div className="field">
              <label htmlFor="schedule-enabled">
                <input
                  id="schedule-enabled"
                  type="checkbox"
                  checked={scheduleEnabled}
                  onChange={(e) => setScheduleEnabled(e.target.checked)}
                />{' '}
                Activada
              </label>
            </div>

            <div className="field">
              <label htmlFor="schedule-frequency">Periodicidad</label>
              <select
                id="schedule-frequency"
                className="input"
                value={scheduleFrequency}
                onChange={(e) => setScheduleFrequency(e.target.value as ScheduleFrequency)}
              >
                <option value="DAILY">Diaria</option>
                <option value="WEEKLY">Semanal</option>
                <option value="MONTHLY">Mensual</option>
              </select>
            </div>

            {scheduleFrequency === 'WEEKLY' && (
              <div className="field">
                <label htmlFor="schedule-day-of-week">Día de la semana</label>
                <select
                  id="schedule-day-of-week"
                  className="input"
                  value={scheduleDayOfWeek}
                  onChange={(e) => setScheduleDayOfWeek(Number(e.target.value))}
                >
                  {WEEKDAY_LABELS.map((label, index) => (
                    <option key={label} value={index}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {scheduleFrequency === 'MONTHLY' && (
              <div className="field">
                <label htmlFor="schedule-day-of-month">Día del mes</label>
                <select
                  id="schedule-day-of-month"
                  className="input"
                  value={scheduleDayOfMonth}
                  onChange={(e) => setScheduleDayOfMonth(Number(e.target.value))}
                >
                  {MONTH_DAYS.map((day) => (
                    <option key={day} value={day}>
                      {day}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="field">
              <label htmlFor="schedule-time">Hora</label>
              <input
                id="schedule-time"
                type="time"
                className="input"
                value={scheduleTimeOfDay}
                onChange={(e) => setScheduleTimeOfDay(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="schedule-destination">Destino</label>
              <select
                id="schedule-destination"
                className="input"
                value={scheduleDestination}
                onChange={(e) => setScheduleDestination(e.target.value as ScheduleDestination)}
              >
                <option value="LOCAL">Carpeta en el servidor</option>
                <option value="DRIVE" disabled={!isDriveConnected}>
                  Google Drive{!isDriveConnected ? ' (conecta Drive primero)' : ''}
                </option>
              </select>
            </div>

            {scheduleDestination === 'LOCAL' && (
              <div className="field">
                <label htmlFor="schedule-subfolder">Subcarpeta (opcional)</label>
                <input
                  id="schedule-subfolder"
                  className="input"
                  value={scheduleLocalSubfolder}
                  onChange={(e) => setScheduleLocalSubfolder(e.target.value)}
                />
              </div>
            )}

            {saveScheduleError && <p role="alert">{saveScheduleError}</p>}

            <div>
              <button type="submit" className="btn btn-primary" disabled={isSavingSchedule}>
                {isSavingSchedule ? 'Guardando…' : 'Guardar'}
              </button>{' '}
              {scheduledExport?.enabled && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={isDisablingSchedule}
                  onClick={() => void handleDisableSchedule()}
                >
                  {isDisablingSchedule ? 'Desactivando…' : 'Desactivar'}
                </button>
              )}
            </div>
          </form>

          {scheduledExport && (
            <p role={scheduledExport.lastRunError ? 'alert' : 'status'}>
              Última ejecución:{' '}
              {scheduledExport.lastRunAt
                ? `${formatDateTime(scheduledExport.lastRunAt)} — ${scheduledExport.lastRunError ?? 'correcta'}`
                : 'todavía no se ha ejecutado.'}
            </p>
          )}
        </div>
      </section>

      <section>
        <h2>Importar datos</h2>
        <p>
          Sube un fichero exportado antes (de tu propia cuenta) para añadir sus datos a los que ya tienes. Nunca
          borra ni sobrescribe nada: si algo del fichero ya existe, se omite.
        </p>

        <div id="import-dropzone">
          <label htmlFor="backup-import-file">Fichero .zip o .json</label>
          <input id="backup-import-file" type="file" accept=".zip,.json" className="input" onChange={handleFileChange} />
          <p className="card-meta">Las copias antiguas en .json se siguen pudiendo importar; solo el .zip trae los documentos de los tickets.</p>
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

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('es-ES');
}

function DataImportSummaryTable({ summary }: { summary: DataImportSummary }) {
  const rows = Object.entries(summary).filter(([, tableSummary]) => tableSummary.total > 0);
  if (rows.length === 0) {
    return <p>El fichero no trae ningún dato.</p>;
  }
  const hasOmitted = rows.some(([, tableSummary]) => (tableSummary.omitted ?? 0) > 0);
  return (
    <>
      <table className="table">
        <caption className="sr-only">Resumen de la importación</caption>
        <thead>
          <tr>
            <th scope="col">Tipo de dato</th>
            <th scope="col">Nuevos</th>
            <th scope="col">Ya existentes</th>
            {hasOmitted && <th scope="col">Omitidos</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map(([key, tableSummary]) => (
            <tr key={key}>
              <td>{DATA_TABLE_LABELS[key] ?? key}</td>
              <td>{tableSummary.toImport}</td>
              <td>{tableSummary.alreadyExisting}</td>
              {hasOmitted && <td>{tableSummary.omitted ?? 0}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      {hasOmitted && (
        <p className="card-meta">
          Se omiten las filas que apuntan a datos que no son de tu cuenta ni vienen en el fichero (por ejemplo, una compra
          de un fondo que no existe). Los documentos omitidos no vienen en el fichero (por ejemplo, una copia .json) o su
          contenido no coincide con el que se exportó; sus tickets se importan igualmente, sin documento.
        </p>
      )}
    </>
  );
}
