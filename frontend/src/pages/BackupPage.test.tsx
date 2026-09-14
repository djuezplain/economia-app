import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BackupPage } from './BackupPage';
import { AuthProvider } from '../auth/AuthContext';
import * as authApi from '../api/auth';
import * as usersApi from '../api/users';
import * as dataImportApi from '../api/data-import';
import type { DataImportSummary } from '../api/data-import';
import * as googleDriveApi from '../api/google-drive';
import * as scheduledExportsApi from '../api/scheduled-exports';
import type { ScheduledExportConfig } from '../api/scheduled-exports';
import { ApiError } from '../api/client';

const PROFILE: usersApi.UserProfile = {
  id: 'user-1',
  email: 'diego@example.com',
  name: 'Diego',
  currency: 'EUR',
  locale: 'es',
  status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00.000Z',
  hasPassword: true,
};

function emptySummary(): DataImportSummary {
  return {
    categories: { total: 0, toImport: 0, alreadyExisting: 0 },
    transactions: { total: 0, toImport: 0, alreadyExisting: 0 },
  };
}

function buildJsonFile(name = 'export.json'): File {
  return new File(['{}'], name, { type: 'application/json' });
}

describe('BackupPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    vi.spyOn(usersApi, 'getProfile').mockResolvedValue(PROFILE);
    // Por defecto, no conectado — cada test de Google Drive (H4) lo sustituye
    // según lo que necesite. Evita que el resto de tests (export/import) se
    // vean afectados por la comprobación de conexión que se hace al montar.
    vi.spyOn(googleDriveApi, 'getDriveConnectionStatus').mockResolvedValue({ connected: false });
    // Por defecto, sin configuración de exportación programada (H5) — cada
    // test de esa sección lo sustituye según lo que necesite; evita que el
    // resto de tests (export/import/Drive) se vean afectados.
    vi.spyOn(scheduledExportsApi, 'getScheduledExport').mockResolvedValue(null);
  });

  function renderPage(initialEntries: string[] = ['/backup']) {
    return render(
      <AuthProvider>
        <MemoryRouter initialEntries={initialEntries}>
          <BackupPage />
        </MemoryRouter>
      </AuthProvider>,
    );
  }

  it('sin sesión activa, pide iniciar sesión y no llama a ninguna API', async () => {
    vi.spyOn(authApi, 'refresh').mockRejectedValue(new ApiError(401, 'No hay sesión.'));
    const exportSpy = vi.spyOn(usersApi, 'exportAccountData');
    const previewSpy = vi.spyOn(dataImportApi, 'previewDataImport');

    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('Tienes que iniciar sesión');
    expect(exportSpy).not.toHaveBeenCalled();
    expect(previewSpy).not.toHaveBeenCalled();
  });

  describe('Exportar (H1)', () => {
    beforeEach(() => {
      // jsdom no implementa URL.createObjectURL/revokeObjectURL (son APIs de navegador para Blob).
      URL.createObjectURL = vi.fn(() => 'blob:mock-url');
      URL.revokeObjectURL = vi.fn();
    });

    it('exporta los datos de la cuenta al pulsar el botón', async () => {
      const exportSpy = vi
        .spyOn(usersApi, 'exportAccountData')
        .mockResolvedValue({ formatVersion: 1, exportedAt: '2026-01-01T00:00:00.000Z', profile: PROFILE, economicData: {} });

      renderPage();
      await screen.findByRole('heading', { name: 'Copia de seguridad' });

      await userEvent.click(screen.getByRole('button', { name: 'Exportar mis datos' }));

      await waitFor(() => expect(exportSpy).toHaveBeenCalled());
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('si falla la exportación, muestra el error', async () => {
      vi.spyOn(usersApi, 'exportAccountData').mockRejectedValue(new ApiError(500, 'Error de servidor.'));

      renderPage();
      await userEvent.click(await screen.findByRole('button', { name: 'Exportar mis datos' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('Error de servidor.');
    });
  });

  describe('Importar (H2)', () => {
    it('al seleccionar un fichero, valida automáticamente y muestra la vista previa sin confirmar todavía (H2 criterio 4)', async () => {
      const previewSpy = vi.spyOn(dataImportApi, 'previewDataImport').mockResolvedValue({
        ...emptySummary(),
        categories: { total: 3, toImport: 2, alreadyExisting: 1 },
      });
      const confirmSpy = vi.spyOn(dataImportApi, 'confirmDataImport');

      renderPage();
      await userEvent.upload(await screen.findByLabelText('Fichero .json'), buildJsonFile());

      expect(await screen.findByRole('heading', { name: 'Vista previa' })).toBeInTheDocument();
      const table = screen.getByRole('table');
      const row = within(table).getByRole('row', { name: /Categorías/ });
      expect(within(row).getByText('2')).toBeInTheDocument();
      expect(within(row).getByText('1')).toBeInTheDocument();

      expect(previewSpy).toHaveBeenCalledWith(expect.any(File));
      expect(confirmSpy).not.toHaveBeenCalled();
    });

    it('confirmar reenvía el mismo fichero y muestra el resultado final', async () => {
      vi.spyOn(dataImportApi, 'previewDataImport').mockResolvedValue({
        ...emptySummary(),
        categories: { total: 1, toImport: 1, alreadyExisting: 0 },
      });
      const confirmSpy = vi.spyOn(dataImportApi, 'confirmDataImport').mockResolvedValue({
        ...emptySummary(),
        categories: { total: 1, toImport: 1, alreadyExisting: 0 },
      });
      const file = buildJsonFile();

      renderPage();
      await userEvent.upload(await screen.findByLabelText('Fichero .json'), file);
      await screen.findByRole('heading', { name: 'Vista previa' });

      await userEvent.click(screen.getByRole('button', { name: 'Confirmar importación' }));

      expect(await screen.findByRole('heading', { name: 'Importación completada' })).toBeInTheDocument();
      expect(confirmSpy).toHaveBeenCalledWith(file);
    });

    it('un fichero con formato inválido (400) muestra el motivo del backend, sin ofrecer confirmar', async () => {
      vi.spyOn(dataImportApi, 'previewDataImport').mockRejectedValue(
        new ApiError(400, 'Este fichero no es compatible con la versión actual de la exportación.'),
      );

      renderPage();
      await userEvent.upload(await screen.findByLabelText('Fichero .json'), buildJsonFile());

      expect(await screen.findByRole('alert')).toHaveTextContent('no es compatible');
      expect(screen.queryByRole('button', { name: 'Confirmar importación' })).not.toBeInTheDocument();
    });

    it('si falla la confirmación, muestra el error sin perder la vista previa', async () => {
      vi.spyOn(dataImportApi, 'previewDataImport').mockResolvedValue({
        ...emptySummary(),
        categories: { total: 1, toImport: 1, alreadyExisting: 0 },
      });
      vi.spyOn(dataImportApi, 'confirmDataImport').mockRejectedValue(new ApiError(500, 'Error de servidor.'));

      renderPage();
      await userEvent.upload(await screen.findByLabelText('Fichero .json'), buildJsonFile());
      await screen.findByRole('heading', { name: 'Vista previa' });

      await userEvent.click(screen.getByRole('button', { name: 'Confirmar importación' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('Error de servidor.');
      expect(screen.getByRole('heading', { name: 'Vista previa' })).toBeInTheDocument();
    });
  });

  describe('Google Drive (H4)', () => {
    it('no conectado, muestra "Conectar Google Drive" y no ofrece exportar a Drive', async () => {
      renderPage();

      expect(await screen.findByRole('button', { name: 'Conectar Google Drive' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Guardar en Google Drive' })).not.toBeInTheDocument();
    });

    it('conectado, exporta a Drive y muestra el enlace al fichero', async () => {
      vi.spyOn(googleDriveApi, 'getDriveConnectionStatus').mockResolvedValue({ connected: true });
      const exportSpy = vi
        .spyOn(googleDriveApi, 'exportToDrive')
        .mockResolvedValue({ fileId: 'file-1', webViewLink: 'https://drive.google.com/file/d/file-1/view' });

      renderPage();
      await userEvent.click(await screen.findByRole('button', { name: 'Guardar en Google Drive' }));

      expect(exportSpy).toHaveBeenCalled();
      expect(await screen.findByRole('link', { name: 'Ver fichero' })).toHaveAttribute(
        'href',
        'https://drive.google.com/file/d/file-1/view',
      );
    });

    it('conectado, si falla el export a Drive muestra el error sin romper el resto de la página', async () => {
      vi.spyOn(googleDriveApi, 'getDriveConnectionStatus').mockResolvedValue({ connected: true });
      vi.spyOn(googleDriveApi, 'exportToDrive').mockRejectedValue(
        new ApiError(400, 'El acceso a Google Drive ha caducado o ha sido revocado. Desconecta y vuelve a conectar Google Drive.'),
      );

      renderPage();
      await userEvent.click(await screen.findByRole('button', { name: 'Guardar en Google Drive' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('ha caducado o ha sido revocado');
      // El resto de la página (export local) sigue disponible.
      expect(screen.getByRole('button', { name: 'Exportar mis datos' })).toBeInTheDocument();
    });

    it('conectado, desconectar vuelve a mostrar "Conectar Google Drive"', async () => {
      vi.spyOn(googleDriveApi, 'getDriveConnectionStatus').mockResolvedValue({ connected: true });
      const disconnectSpy = vi.spyOn(googleDriveApi, 'disconnectDrive').mockResolvedValue(undefined);
      vi.spyOn(window, 'confirm').mockReturnValue(true);

      renderPage();
      await userEvent.click(await screen.findByRole('button', { name: 'Desconectar' }));

      expect(disconnectSpy).toHaveBeenCalled();
      expect(await screen.findByRole('button', { name: 'Conectar Google Drive' })).toBeInTheDocument();
    });

    it('retorno de Google con éxito (?driveConnected=1), muestra el aviso de conexión', async () => {
      vi.spyOn(googleDriveApi, 'getDriveConnectionStatus').mockResolvedValue({ connected: true });

      renderPage(['/backup?driveConnected=1']);

      expect(await screen.findByText('Google Drive conectado correctamente.')).toBeInTheDocument();
    });

    it('retorno de Google cancelado (?driveConnected=0&error=access_denied), muestra el motivo', async () => {
      renderPage(['/backup?driveConnected=0&error=access_denied']);

      expect(await screen.findByText('Has cancelado la conexión con Google Drive.')).toBeInTheDocument();
    });
  });

  describe('Exportación programada (H5)', () => {
    const SAVED_CONFIG: ScheduledExportConfig = {
      id: 'sched-1',
      userId: 'user-1',
      enabled: true,
      frequency: 'WEEKLY',
      dayOfWeek: 1,
      dayOfMonth: null,
      timeOfDay: '03:30',
      destination: 'LOCAL',
      localSubfolder: 'mis backups',
      lastRunAt: '2026-01-02T03:30:00.000Z',
      lastRunError: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T03:30:00.000Z',
    };

    it('sin configuración previa, el formulario parte de los valores por defecto y sin botón de desactivar', async () => {
      renderPage();
      await screen.findByRole('heading', { name: 'Exportación programada' });

      expect(screen.getByLabelText('Activada')).not.toBeChecked();
      expect(screen.getByLabelText('Periodicidad')).toHaveValue('DAILY');
      expect(screen.queryByLabelText('Día de la semana')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Desactivar' })).not.toBeInTheDocument();
      expect(screen.queryByText(/Última ejecución/)).not.toBeInTheDocument();
    });

    it('con una configuración guardada, precarga el formulario y muestra la última ejecución', async () => {
      vi.spyOn(scheduledExportsApi, 'getScheduledExport').mockResolvedValue(SAVED_CONFIG);

      renderPage();
      await screen.findByRole('button', { name: 'Desactivar' }); // solo aparece una vez cargada la config.

      expect(screen.getByLabelText('Activada')).toBeChecked();
      expect(screen.getByLabelText('Periodicidad')).toHaveValue('WEEKLY');
      expect(screen.getByLabelText('Día de la semana')).toHaveValue('1');
      expect(screen.getByLabelText('Hora')).toHaveValue('03:30');
      expect(screen.getByLabelText('Subcarpeta (opcional)')).toHaveValue('mis backups');
      expect(screen.getByRole('button', { name: 'Desactivar' })).toBeInTheDocument();
      expect(screen.getByText(/Última ejecución/)).toHaveTextContent('correcta');
    });

    it('una última ejecución fallida se muestra como alerta con el motivo', async () => {
      vi.spyOn(scheduledExportsApi, 'getScheduledExport').mockResolvedValue({
        ...SAVED_CONFIG,
        lastRunError: 'No se ha podido guardar el fichero en Google Drive. Inténtalo de nuevo más tarde.',
      });

      renderPage();

      const status = await screen.findByText(/Última ejecución/);
      expect(status).toHaveAttribute('role', 'alert');
      expect(status).toHaveTextContent('No se ha podido guardar el fichero en Google Drive');
    });

    it('cambiar la periodicidad a Mensual muestra el selector de día del mes (1-28), no el de día de la semana', async () => {
      renderPage();
      await userEvent.selectOptions(await screen.findByLabelText('Periodicidad'), 'MONTHLY');

      expect(screen.getByLabelText('Día del mes')).toBeInTheDocument();
      expect(screen.queryByLabelText('Día de la semana')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Día del mes')).toHaveDisplayValue('1');
    });

    it('guardar una programación diaria envía solo los campos que aplican', async () => {
      const saveSpy = vi.spyOn(scheduledExportsApi, 'saveScheduledExport').mockResolvedValue({ ...SAVED_CONFIG, frequency: 'DAILY' });

      renderPage();
      await userEvent.click(await screen.findByLabelText('Activada'));
      await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));

      await waitFor(() =>
        expect(saveSpy).toHaveBeenCalledWith({
          enabled: true,
          frequency: 'DAILY',
          timeOfDay: '03:00',
          destination: 'LOCAL',
        }),
      );
    });

    it('guardar una programación semanal incluye dayOfWeek', async () => {
      const saveSpy = vi.spyOn(scheduledExportsApi, 'saveScheduledExport').mockResolvedValue(SAVED_CONFIG);

      renderPage();
      await userEvent.selectOptions(await screen.findByLabelText('Periodicidad'), 'WEEKLY');
      await userEvent.selectOptions(screen.getByLabelText('Día de la semana'), 'Miércoles');
      await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));

      await waitFor(() => expect(saveSpy).toHaveBeenCalledWith(expect.objectContaining({ frequency: 'WEEKLY', dayOfWeek: 3 })));
    });

    it('Google Drive aparece deshabilitado como destino si no está conectado', async () => {
      renderPage();
      await screen.findByRole('heading', { name: 'Exportación programada' });

      const driveOption = screen.getByRole('option', { name: /Google Drive/ }) as HTMLOptionElement;
      expect(driveOption.disabled).toBe(true);
    });

    it('si falla al guardar, muestra el error del backend (p. ej. Drive sin conectar)', async () => {
      vi.spyOn(scheduledExportsApi, 'saveScheduledExport').mockRejectedValue(
        new ApiError(400, 'Conecta Google Drive antes de programar una exportación a Drive.'),
      );

      renderPage();
      await userEvent.click(await screen.findByRole('button', { name: 'Guardar' }));

      expect(await screen.findByText('Conecta Google Drive antes de programar una exportación a Drive.')).toBeInTheDocument();
    });

    it('desactivar llama a la API y esconde el botón, sin perder el resto de la configuración', async () => {
      vi.spyOn(scheduledExportsApi, 'getScheduledExport').mockResolvedValue(SAVED_CONFIG);
      const disableSpy = vi.spyOn(scheduledExportsApi, 'disableScheduledExport').mockResolvedValue(undefined);

      renderPage();
      await userEvent.click(await screen.findByRole('button', { name: 'Desactivar' }));

      expect(disableSpy).toHaveBeenCalled();
      await waitFor(() => expect(screen.queryByRole('button', { name: 'Desactivar' })).not.toBeInTheDocument());
      expect(screen.getByLabelText('Activada')).not.toBeChecked();
      expect(screen.getByLabelText('Periodicidad')).toHaveValue('WEEKLY');
    });
  });
});
