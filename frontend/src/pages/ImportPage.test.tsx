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
import { ApiError } from '../api/client';

const PREVIEW_RESULT: ImportPreviewResult = {
  income: { validCount: 2, invalid: [{ rowNumber: 50, reason: 'Fila 50: faltan categoría, concepto y importe.' }] },
  expense: { validCount: 1, invalid: [] },
  newCategories: ['Bancos', 'Peluqueria'],
};

const PREVIEW_RESULT_SIN_PROBLEMAS: ImportPreviewResult = {
  income: { validCount: 3, invalid: [] },
  expense: { validCount: 5, invalid: [] },
  newCategories: [],
};

const CONFIRM_RESULT: ImportConfirmResult = {
  income: { importedCount: 2, invalid: [{ rowNumber: 50, reason: 'Fila 50: faltan categoría, concepto y importe.' }] },
  expense: { importedCount: 1, invalid: [] },
  categoriesCreated: ['Bancos', 'Peluqueria'],
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
      hasPassword: true,
    });
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

    expect(await screen.findByText('Ingresos: 2 válidos, 1 con problemas.')).toBeInTheDocument();
    expect(screen.getByText('Gastos: 1 válidos, 0 con problemas.')).toBeInTheDocument();
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

    expect(await screen.findByText('Ingresos: 3 válidos, 0 con problemas.')).toBeInTheDocument();
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
    expect(screen.getByText(/Ingresos importados: 2 \(descartados: 1\)/)).toBeInTheDocument();
    expect(screen.getByText(/Gastos importados: 1 \(descartados: 0\)/)).toBeInTheDocument();
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
});
