import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ImportPage } from './ImportPage';
import { AuthProvider } from '../auth/AuthContext';
import * as authApi from '../api/auth';
import * as usersApi from '../api/users';
import * as importApi from '../api/import';
import type { ImportConfirmResult, ImportPreviewResult } from '../api/import';
import * as googleSheetsImportApi from '../api/google-sheets-import';
import type { GoogleSheetsImportConfig } from '../api/google-sheets-import';
import { ApiError } from '../api/client';
import { resetForTests } from '../offline/connectivity';

const GOOGLE_SHEET_CONFIG_SIN_HOJA: GoogleSheetsImportConfig = {
  serviceAccountEmail: 'import@economia-app.iam.gserviceaccount.com',
  spreadsheetId: null,
  autoImportEnabled: false,
  lastRun: null,
};

const GOOGLE_SHEET_CONFIG_CON_HOJA: GoogleSheetsImportConfig = {
  serviceAccountEmail: 'import@economia-app.iam.gserviceaccount.com',
  spreadsheetId: 'hoja-abc123',
  autoImportEnabled: false,
  lastRun: null,
};

const PREVIEW_RESULT: ImportPreviewResult = {
  income: {
    validCount: 2,
    invalid: [{ rowNumber: 50, reason: 'Fila 50: faltan categoría, concepto y importe.' }],
    duplicates: [],
    updated: [],
  },
  expense: { validCount: 1, invalid: [], duplicates: [], updated: [] },
  newCategories: ['Bancos', 'Peluqueria'],
};

const PREVIEW_RESULT_SIN_PROBLEMAS: ImportPreviewResult = {
  income: { validCount: 3, invalid: [], duplicates: [], updated: [] },
  expense: { validCount: 5, invalid: [], duplicates: [], updated: [] },
  newCategories: [],
};

const PREVIEW_RESULT_CON_DUPLICADOS: ImportPreviewResult = {
  income: {
    validCount: 3,
    invalid: [],
    duplicates: [{ rowNumber: 4, reason: 'Fila 4: ya existe un movimiento igual en tu histórico.' }],
    updated: [],
  },
  expense: { validCount: 2, invalid: [], duplicates: [], updated: [] },
  newCategories: [],
};

const CONFIRM_RESULT: ImportConfirmResult = {
  income: {
    importedCount: 2,
    invalid: [{ rowNumber: 50, reason: 'Fila 50: faltan categoría, concepto y importe.' }],
    skippedDuplicateCount: 0,
    updatedAmountCount: 0,
  },
  expense: { importedCount: 1, invalid: [], skippedDuplicateCount: 0, updatedAmountCount: 0 },
  categoriesCreated: ['Bancos', 'Peluqueria'],
};

const CONFIRM_RESULT_CON_DUPLICADOS: ImportConfirmResult = {
  income: { importedCount: 2, invalid: [], skippedDuplicateCount: 1, updatedAmountCount: 0 },
  expense: { importedCount: 2, invalid: [], skippedDuplicateCount: 0, updatedAmountCount: 0 },
  categoriesCreated: [],
};

function buildXlsxFile(name = 'movimientos.xlsx'): File {
  return new File(['contenido de prueba'], name, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

describe('ImportPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(usersApi, 'getProfile').mockResolvedValue({
      id: 'user-1',
      email: 'ana@example.com',
      name: 'Ana',
      currency: 'EUR',
      locale: 'es',
      status: 'ACTIVE',
      createdAt: '2026-01-01T00:00:00.000Z',
      hasPassword: true, recurringReminderEmails: true,
    });
    vi.spyOn(googleSheetsImportApi, 'getGoogleSheetConfig').mockResolvedValue(GOOGLE_SHEET_CONFIG_SIN_HOJA);
  });

  function renderPage() {
    return render(
      <AuthProvider>
        <MemoryRouter>
          <ImportPage />
        </MemoryRouter>
      </AuthProvider>,
    );
  }

  it('sin sesión activa, pide iniciar sesión y no llama a ninguna API de importación', async () => {
    vi.spyOn(authApi, 'refresh').mockRejectedValue(new ApiError(401, 'No hay sesión.'));
    const previewSpy = vi.spyOn(importApi, 'previewImport');
    const confirmSpy = vi.spyOn(importApi, 'confirmImport');

    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('Tienes que iniciar sesión');
    expect(previewSpy).not.toHaveBeenCalled();
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('el botón "Validar" está deshabilitado hasta que se selecciona un fichero', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });

    renderPage();

    expect(await screen.findByRole('button', { name: 'Validar' })).toBeDisabled();
  });

  it('al validar, muestra el resumen, las categorías nuevas y las filas con problemas (H1 criterio 1: nada se guarda todavía)', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    const previewSpy = vi.spyOn(importApi, 'previewImport').mockResolvedValue(PREVIEW_RESULT);
    const confirmSpy = vi.spyOn(importApi, 'confirmImport');

    renderPage();
    const file = buildXlsxFile();
    const input = await screen.findByLabelText('Fichero .xlsx');
    await userEvent.upload(input, file);
    await userEvent.click(screen.getByRole('button', { name: 'Validar' }));

    expect(await screen.findByText('Ingresos: 2 válidos (2 nuevos, 0 ya registrados, 0 con importe distinto), 1 con problemas.')).toBeInTheDocument();
    expect(screen.getByText('Gastos: 1 válidos (1 nuevos, 0 ya registrados, 0 con importe distinto), 0 con problemas.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Categorías nuevas que se crearían' })).toBeInTheDocument();
    expect(screen.getByText('Bancos')).toBeInTheDocument();
    expect(screen.getByText('Peluqueria')).toBeInTheDocument();

    const table = screen.getByRole('table', { name: 'Ingresos con problemas' });
    const row = within(table).getAllByRole('row')[1];
    expect(within(row).getByText('50')).toBeInTheDocument();
    expect(within(row).getByText(/faltan categoría, concepto y importe/)).toBeInTheDocument();

    expect(previewSpy).toHaveBeenCalledWith(file);
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('sin categorías nuevas ni filas inválidas, no muestra esas secciones', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    vi.spyOn(importApi, 'previewImport').mockResolvedValue(PREVIEW_RESULT_SIN_PROBLEMAS);

    renderPage();
    await userEvent.upload(await screen.findByLabelText('Fichero .xlsx'), buildXlsxFile());
    await userEvent.click(screen.getByRole('button', { name: 'Validar' }));

    expect(await screen.findByText('Ingresos: 3 válidos (3 nuevos, 0 ya registrados, 0 con importe distinto), 0 con problemas.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Categorías nuevas que se crearían' })).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('un fichero sin las hojas esperadas (400) muestra el motivo del backend', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    vi.spyOn(importApi, 'previewImport').mockRejectedValue(
      new ApiError(400, 'El fichero no tiene una hoja llamada "Ingresos".'),
    );

    renderPage();
    await userEvent.upload(await screen.findByLabelText('Fichero .xlsx'), buildXlsxFile());
    await userEvent.click(screen.getByRole('button', { name: 'Validar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('El fichero no tiene una hoja llamada "Ingresos".');
  });

  it('tras validar, confirmar reutiliza el mismo fichero y muestra el resultado final con enlaces', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    vi.spyOn(importApi, 'previewImport').mockResolvedValue(PREVIEW_RESULT);
    const confirmSpy = vi.spyOn(importApi, 'confirmImport').mockResolvedValue(CONFIRM_RESULT);

    renderPage();
    const file = buildXlsxFile();
    await userEvent.upload(await screen.findByLabelText('Fichero .xlsx'), file);
    await userEvent.click(screen.getByRole('button', { name: 'Validar' }));
    await screen.findByRole('heading', { name: 'Confirmar' });

    await userEvent.click(screen.getByRole('button', { name: 'Confirmar importación' }));

    expect(confirmSpy).toHaveBeenCalledWith(file); // mismo fichero, no se ha vuelto a pedir
    expect(await screen.findByRole('heading', { name: 'Importación completada' })).toBeInTheDocument();
    expect(screen.getByText(/Ingresos importados: 2 \(descartados: 1, ya registrados: 0, importe actualizado: 0\)/)).toBeInTheDocument();
    expect(screen.getByText(/Gastos importados: 1 \(descartados: 0, ya registrados: 0, importe actualizado: 0\)/)).toBeInTheDocument();
    expect(screen.getByText(/Categorías nuevas creadas: Bancos, Peluqueria\./)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver movimientos' })).toHaveAttribute('href', '/movements');
    expect(screen.getByRole('link', { name: 'Ver dashboard' })).toHaveAttribute('href', '/dashboard');

    // La vista previa desaparece, sustituida por el resultado final.
    expect(screen.queryByRole('heading', { name: '2. Vista previa' })).not.toBeInTheDocument();
  });

  it('si confirmar falla, muestra el error y mantiene la vista previa (se puede reintentar)', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    vi.spyOn(importApi, 'previewImport').mockResolvedValue(PREVIEW_RESULT);
    vi.spyOn(importApi, 'confirmImport').mockRejectedValue(new ApiError(500, 'Error inesperado.'));

    renderPage();
    await userEvent.upload(await screen.findByLabelText('Fichero .xlsx'), buildXlsxFile());
    await userEvent.click(screen.getByRole('button', { name: 'Validar' }));
    await screen.findByRole('heading', { name: 'Confirmar' });
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar importación' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Error inesperado.');
    expect(screen.getByRole('button', { name: 'Confirmar importación' })).toBeInTheDocument();
  });

  it('seleccionar un fichero nuevo tras una vista previa la descarta (hay que volver a validar)', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    vi.spyOn(importApi, 'previewImport').mockResolvedValue(PREVIEW_RESULT);

    renderPage();
    await userEvent.upload(await screen.findByLabelText('Fichero .xlsx'), buildXlsxFile());
    await userEvent.click(screen.getByRole('button', { name: 'Validar' }));
    await screen.findByRole('heading', { name: 'Confirmar' });

    await userEvent.upload(screen.getByLabelText('Fichero .xlsx'), buildXlsxFile('otro.xlsx'));

    expect(screen.queryByRole('heading', { name: 'Confirmar' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Validar' })).not.toBeDisabled();
  });

  it('con filas ya registradas, la vista previa las muestra aparte y no cuenta como error (spec 012)', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    vi.spyOn(importApi, 'previewImport').mockResolvedValue(PREVIEW_RESULT_CON_DUPLICADOS);

    renderPage();
    await userEvent.upload(await screen.findByLabelText('Fichero .xlsx'), buildXlsxFile());
    await userEvent.click(screen.getByRole('button', { name: 'Validar' }));

    expect(await screen.findByText('Ingresos: 3 válidos (2 nuevos, 1 ya registrados, 0 con importe distinto), 0 con problemas.')).toBeInTheDocument();

    const table = screen.getByRole('table', { name: 'Ingresos ya registrados' });
    const row = within(table).getAllByRole('row')[1];
    expect(within(row).getByText('4')).toBeInTheDocument();
    expect(within(row).getByText(/ya existe un movimiento igual/)).toBeInTheDocument();

    // Sin duplicados de gasto, esa tabla no se muestra.
    expect(screen.queryByRole('table', { name: 'Gastos ya registrados' })).not.toBeInTheDocument();
  });

  it('el resultado de confirmar indica cuántas filas se saltaron por ya existir (spec 012)', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    vi.spyOn(importApi, 'previewImport').mockResolvedValue(PREVIEW_RESULT_CON_DUPLICADOS);
    vi.spyOn(importApi, 'confirmImport').mockResolvedValue(CONFIRM_RESULT_CON_DUPLICADOS);

    renderPage();
    await userEvent.upload(await screen.findByLabelText('Fichero .xlsx'), buildXlsxFile());
    await userEvent.click(screen.getByRole('button', { name: 'Validar' }));
    await screen.findByRole('heading', { name: 'Confirmar' });
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar importación' }));

    expect(await screen.findByText(/Ingresos importados: 2 \(descartados: 0, ya registrados: 1, importe actualizado: 0\)/)).toBeInTheDocument();
  });

  it('sin conexión (H6, spec 011), avisa de que la página requiere conexión', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    resetForTests(false);

    renderPage();

    expect(await screen.findByText('Esta página requiere conexión a internet.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Fichero .xlsx')).not.toBeInTheDocument();
  });

  describe('Importar desde Google Sheets (spec 026)', () => {
    it('sin hoja configurada, muestra el email de la cuenta de servicio y el formulario para guardarla', async () => {
      vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });

      renderPage();

      expect(await screen.findByText(GOOGLE_SHEET_CONFIG_SIN_HOJA.serviceAccountEmail)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Guardar hoja' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Importar ahora' })).not.toBeInTheDocument();
    });

    it('guardar una hoja válida la sustituye por el panel ya configurado', async () => {
      vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
      const saveSpy = vi.spyOn(googleSheetsImportApi, 'saveGoogleSheetConfig').mockResolvedValue(GOOGLE_SHEET_CONFIG_CON_HOJA);

      renderPage();
      await userEvent.type(await screen.findByLabelText('URL o ID de tu Google Sheet'), 'hoja-abc123');
      await userEvent.click(screen.getByRole('button', { name: 'Guardar hoja' }));

      expect(saveSpy).toHaveBeenCalledWith('hoja-abc123');
      expect(await screen.findByText('hoja-abc123')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Importar ahora' })).toBeInTheDocument();
    });

    it('guardar una hoja inaccesible muestra el error del backend y no cambia de panel', async () => {
      vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
      vi.spyOn(googleSheetsImportApi, 'saveGoogleSheetConfig').mockRejectedValue(
        new ApiError(400, 'No se puede acceder a esta Google Sheet.'),
      );

      renderPage();
      await userEvent.type(await screen.findByLabelText('URL o ID de tu Google Sheet'), 'hoja-sin-permiso');
      await userEvent.click(screen.getByRole('button', { name: 'Guardar hoja' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('No se puede acceder a esta Google Sheet.');
      expect(screen.getByRole('button', { name: 'Guardar hoja' })).toBeInTheDocument();
    });

    it('con una hoja configurada, "Importar ahora" muestra el resumen de la ejecución', async () => {
      vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
      vi.spyOn(googleSheetsImportApi, 'getGoogleSheetConfig').mockResolvedValue(GOOGLE_SHEET_CONFIG_CON_HOJA);
      const runSpy = vi.spyOn(googleSheetsImportApi, 'runGoogleSheetImportNow').mockResolvedValue(CONFIRM_RESULT);

      renderPage();
      await userEvent.click(await screen.findByRole('button', { name: 'Importar ahora' }));

      expect(runSpy).toHaveBeenCalled();
      expect(await screen.findByRole('heading', { name: 'Resultado de la última importación' })).toBeInTheDocument();
      expect(screen.getByText(/Ingresos importados: 2 \(descartados: 1, ya registrados: 0, importe actualizado: 0\)/)).toBeInTheDocument();
    });

    it('activa y desactiva la importación automática', async () => {
      vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
      vi.spyOn(googleSheetsImportApi, 'getGoogleSheetConfig').mockResolvedValue(GOOGLE_SHEET_CONFIG_CON_HOJA);
      const toggleSpy = vi
        .spyOn(googleSheetsImportApi, 'setGoogleSheetAutoImport')
        .mockResolvedValue({ ...GOOGLE_SHEET_CONFIG_CON_HOJA, autoImportEnabled: true });

      renderPage();
      const checkbox = await screen.findByLabelText('Importar automáticamente cada 4 horas');
      await userEvent.click(checkbox);

      expect(toggleSpy).toHaveBeenCalledWith(true);
      expect(await screen.findByLabelText('Importar automáticamente cada 4 horas')).toBeChecked();
    });

    it('quitar la hoja vuelve a mostrar el formulario de configuración', async () => {
      vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
      vi.spyOn(googleSheetsImportApi, 'getGoogleSheetConfig').mockResolvedValue(GOOGLE_SHEET_CONFIG_CON_HOJA);
      const removeSpy = vi.spyOn(googleSheetsImportApi, 'removeGoogleSheetConfig').mockResolvedValue(undefined);

      renderPage();
      await userEvent.click(await screen.findByRole('button', { name: 'Quitar hoja' }));

      expect(removeSpy).toHaveBeenCalled();
      expect(await screen.findByRole('button', { name: 'Guardar hoja' })).toBeInTheDocument();
    });
  });

  describe('recibos recurrentes conciliados (spec 049 T4.5)', () => {
    it('el resultado de importar un Excel indica cuántos recibos se conciliaron, con enlace a Recurrentes', async () => {
      vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
      vi.spyOn(importApi, 'previewImport').mockResolvedValue(PREVIEW_RESULT_CON_DUPLICADOS);
      vi.spyOn(importApi, 'confirmImport').mockResolvedValue({ ...CONFIRM_RESULT_CON_DUPLICADOS, reconciledCount: 2 });

      renderPage();
      await userEvent.upload(await screen.findByLabelText('Fichero .xlsx'), buildXlsxFile());
      await userEvent.click(screen.getByRole('button', { name: 'Validar' }));
      await screen.findByRole('heading', { name: 'Confirmar' });
      await userEvent.click(screen.getByRole('button', { name: 'Confirmar importación' }));

      expect(await screen.findByText(/2 recibos recurrentes conciliados con lo importado/)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'ver en Recurrentes' })).toHaveAttribute('href', '/recurring');
    });

    it('la última ejecución de Google Sheets muestra el recuento en singular', async () => {
      vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
      vi.spyOn(googleSheetsImportApi, 'getGoogleSheetConfig').mockResolvedValue({
        ...GOOGLE_SHEET_CONFIG_CON_HOJA,
        lastRun: { at: '2026-10-23T08:00:00.000Z', result: { ...CONFIRM_RESULT, reconciledCount: 1 }, error: null },
      });

      renderPage();
      expect(await screen.findByText(/1 recibo recurrente conciliado con lo importado/)).toBeInTheDocument();
    });

    it('sin conciliaciones, o con un resultado guardado antes de la spec 049 (sin el campo), no dice nada', async () => {
      vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
      vi.spyOn(googleSheetsImportApi, 'getGoogleSheetConfig').mockResolvedValue({
        ...GOOGLE_SHEET_CONFIG_CON_HOJA,
        lastRun: { at: '2026-10-23T08:00:00.000Z', result: CONFIRM_RESULT, error: null },
      });

      renderPage();
      expect(await screen.findByText(/Ingresos importados: 2/)).toBeInTheDocument();
      expect(screen.queryByText(/conciliad/)).not.toBeInTheDocument();
    });
  });
});
