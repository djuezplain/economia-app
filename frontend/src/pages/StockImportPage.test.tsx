import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StockImportPage } from './StockImportPage';
import { AuthProvider } from '../auth/AuthContext';
import * as authApi from '../api/auth';
import * as usersApi from '../api/users';
import * as stockImportApi from '../api/stock-import';
import type { StockImportSummary } from '../api/stock-import';
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

function buildCsvFile(name = 'cartera.csv'): File {
  return new File(['contenido de prueba'], name, { type: 'text/csv' });
}

const SUMMARY_TRES_ESTADOS: StockImportSummary = {
  stocks: [
    {
      name: 'BBVA',
      status: 'new',
      custodyBank: '-',
      purchases: { total: 1, toImport: 1, alreadyExisting: 0 },
      sales: { total: 0, toImport: 0, alreadyExisting: 0 },
      valuations: { total: 0, toImport: 0, alreadyExisting: 0 },
    },
    {
      name: 'Repsol',
      status: 'existing',
      custodyBank: 'MyInvestor',
      purchases: { total: 1, toImport: 1, alreadyExisting: 0 },
      sales: { total: 0, toImport: 0, alreadyExisting: 0 },
      valuations: { total: 1, toImport: 1, alreadyExisting: 0 },
    },
    {
      name: 'Santander',
      status: 'ambiguous',
      custodyBank: null,
      purchases: { total: 1, toImport: 0, alreadyExisting: 0 },
      sales: { total: 0, toImport: 0, alreadyExisting: 0 },
      valuations: { total: 0, toImport: 0, alreadyExisting: 0 },
    },
  ],
  totals: { newStocks: 1, existingStocks: 1, ambiguousStocks: 1 },
};

describe('StockImportPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    vi.spyOn(usersApi, 'getProfile').mockResolvedValue(PROFILE);
  });

  function renderPage() {
    return render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/patrimonio/acciones/importar']}>
          <StockImportPage />
        </MemoryRouter>
      </AuthProvider>,
    );
  }

  it('sin sesión activa, pide iniciar sesión y no llama a la API', async () => {
    vi.spyOn(authApi, 'refresh').mockRejectedValue(new ApiError(401, 'No hay sesión.'));
    const previewSpy = vi.spyOn(stockImportApi, 'previewStockImport');

    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('Tienes que iniciar sesión');
    expect(previewSpy).not.toHaveBeenCalled();
  });

  it('sin fichero seleccionado, el botón "Validar" está deshabilitado y no llama a la API', async () => {
    const previewSpy = vi.spyOn(stockImportApi, 'previewStockImport');

    renderPage();

    expect(await screen.findByRole('button', { name: 'Validar' })).toBeDisabled();
    expect(previewSpy).not.toHaveBeenCalled();
  });

  it('al seleccionar un fichero y validar, muestra los 3 estados de fila (nueva/existente/ambigua)', async () => {
    const previewSpy = vi.spyOn(stockImportApi, 'previewStockImport').mockResolvedValue(SUMMARY_TRES_ESTADOS);
    const confirmSpy = vi.spyOn(stockImportApi, 'confirmStockImport');
    const file = buildCsvFile();

    renderPage();
    await userEvent.upload(await screen.findByLabelText('Fichero .csv'), file);
    await userEvent.click(screen.getByRole('button', { name: 'Validar' }));

    expect(await screen.findByRole('heading', { name: '2. Vista previa' })).toBeInTheDocument();
    const table = screen.getByRole('table');
    expect(within(table).getByRole('row', { name: /BBVA/ })).toHaveTextContent('Nueva');
    expect(within(table).getByRole('row', { name: /Repsol/ })).toHaveTextContent('Ya existe');
    expect(within(table).getByRole('row', { name: /Repsol/ })).toHaveTextContent('MyInvestor');
    expect(within(table).getByRole('row', { name: /Santander/ })).toHaveTextContent('Ambigua');

    expect(previewSpy).toHaveBeenCalledWith(file);
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('confirmar reenvía el mismo fichero y muestra el resultado final', async () => {
    vi.spyOn(stockImportApi, 'previewStockImport').mockResolvedValue(SUMMARY_TRES_ESTADOS);
    const confirmSpy = vi.spyOn(stockImportApi, 'confirmStockImport').mockResolvedValue(SUMMARY_TRES_ESTADOS);
    const file = buildCsvFile();

    renderPage();
    await userEvent.upload(await screen.findByLabelText('Fichero .csv'), file);
    await userEvent.click(screen.getByRole('button', { name: 'Validar' }));
    await screen.findByRole('heading', { name: '2. Vista previa' });

    await userEvent.click(screen.getByRole('button', { name: 'Confirmar importación' }));

    expect(await screen.findByRole('heading', { name: 'Importación completada' })).toBeInTheDocument();
    expect(confirmSpy).toHaveBeenCalledWith(file);
  });

  it('un fichero inválido (400) muestra el motivo del backend, sin ofrecer confirmar', async () => {
    vi.spyOn(stockImportApi, 'previewStockImport').mockRejectedValue(new ApiError(400, 'El fichero no tiene una sección "Resumen de posiciones".'));

    renderPage();
    await userEvent.upload(await screen.findByLabelText('Fichero .csv'), buildCsvFile());
    await userEvent.click(screen.getByRole('button', { name: 'Validar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Resumen de posiciones');
    expect(screen.queryByRole('button', { name: 'Confirmar importación' })).not.toBeInTheDocument();
  });

  it('si falla la confirmación, muestra el error sin perder la vista previa', async () => {
    vi.spyOn(stockImportApi, 'previewStockImport').mockResolvedValue(SUMMARY_TRES_ESTADOS);
    vi.spyOn(stockImportApi, 'confirmStockImport').mockRejectedValue(new ApiError(500, 'Error de servidor.'));

    renderPage();
    await userEvent.upload(await screen.findByLabelText('Fichero .csv'), buildCsvFile());
    await userEvent.click(screen.getByRole('button', { name: 'Validar' }));
    await screen.findByRole('heading', { name: '2. Vista previa' });

    await userEvent.click(screen.getByRole('button', { name: 'Confirmar importación' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Error de servidor.');
    expect(screen.getByRole('heading', { name: '2. Vista previa' })).toBeInTheDocument();
  });

  it('elegir un fichero nuevo descarta la vista previa anterior', async () => {
    vi.spyOn(stockImportApi, 'previewStockImport').mockResolvedValue(SUMMARY_TRES_ESTADOS);

    renderPage();
    await userEvent.upload(await screen.findByLabelText('Fichero .csv'), buildCsvFile());
    await userEvent.click(screen.getByRole('button', { name: 'Validar' }));
    await screen.findByRole('heading', { name: '2. Vista previa' });

    await userEvent.upload(screen.getByLabelText('Fichero .csv'), buildCsvFile('otro.csv'));

    expect(screen.queryByRole('heading', { name: '2. Vista previa' })).not.toBeInTheDocument();
  });
});
