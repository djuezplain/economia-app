import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WealthPage } from './WealthPage';
import { AuthProvider } from '../auth/AuthContext';
import * as authApi from '../api/auth';
import * as usersApi from '../api/users';
import * as bankAccountsApi from '../api/bank-accounts';
import * as bankAccountBalancesApi from '../api/bank-account-balances';
import * as stocksApi from '../api/stocks';
import * as stockPurchasesApi from '../api/stock-purchases';
import * as stockValuationsApi from '../api/stock-valuations';
import type { BankAccount } from '../api/bank-accounts';
import type { BankAccountBalance } from '../api/bank-account-balances';
import type { Stock } from '../api/stocks';
import type { StockPurchase } from '../api/stock-purchases';
import type { StockValuation } from '../api/stock-valuations';
import { ApiError } from '../api/client';
import { resetForTests } from '../offline/connectivity';

const BANK_ACCOUNT: BankAccount = {
  id: 'account-1',
  userId: 'user-1',
  bank: 'BBVA',
  accountNumber: 'ES1234',
  createdAt: '2026-09-04T00:00:00.000Z',
  updatedAt: '2026-09-04T00:00:00.000Z',
};

const BANK_BALANCE: BankAccountBalance = {
  id: 'balance-1',
  bankAccountId: 'account-1',
  euros: '1500.00',
  date: '2026-09-04',
  createdAt: '2026-09-04T00:00:00.000Z',
  updatedAt: '2026-09-04T00:00:00.000Z',
};

const STOCK: Stock = {
  id: 'stock-1',
  userId: 'user-1',
  custodyBank: 'BBVA',
  stock: 'Inditex',
  createdAt: '2026-09-04T00:00:00.000Z',
  updatedAt: '2026-09-04T00:00:00.000Z',
};

const STOCK_PURCHASE: StockPurchase = {
  id: 'purchase-1',
  stockId: 'stock-1',
  shareCount: '10.0000',
  purchasePrice: '30.00',
  createdAt: '2026-09-04T00:00:00.000Z',
  updatedAt: '2026-09-04T00:00:00.000Z',
};

const STOCK_VALUATION: StockValuation = {
  id: 'valuation-1',
  stockId: 'stock-1',
  valuation: '35.00',
  date: '2026-09-04',
  createdAt: '2026-09-04T00:00:00.000Z',
  updatedAt: '2026-09-04T00:00:00.000Z',
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

describe('WealthPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetForTests(true);
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
          <WealthPage />
        </MemoryRouter>
      </AuthProvider>,
    );
  }

  it('sin sesión activa, pide iniciar sesión y no llama a ninguna API de patrimonio', async () => {
    vi.spyOn(authApi, 'refresh').mockRejectedValue(new ApiError(401, 'No hay sesión.'));
    const listAccountsSpy = vi.spyOn(bankAccountsApi, 'listBankAccounts');
    const listBalancesSpy = vi.spyOn(bankAccountBalancesApi, 'listBankAccountBalances');
    const listStocksSpy = vi.spyOn(stocksApi, 'listStocks');

    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('Tienes que iniciar sesión');
    expect(listAccountsSpy).not.toHaveBeenCalled();
    expect(listBalancesSpy).not.toHaveBeenCalled();
    expect(listStocksSpy).not.toHaveBeenCalled();
  });

  it('sin conexión, avisa de que la página requiere conexión sin llamar a la API', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    const listAccountsSpy = vi.spyOn(bankAccountsApi, 'listBankAccounts');
    resetForTests(false);

    renderPage();

    expect(await screen.findByText('Esta página requiere conexión a internet.')).toBeInTheDocument();
    expect(listAccountsSpy).not.toHaveBeenCalled();
  });

  it('muestra las 7 categorías, con "Próximamente." en las 5 sin implementar', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    vi.spyOn(bankAccountsApi, 'listBankAccounts').mockResolvedValue([]);
    vi.spyOn(bankAccountBalancesApi, 'listBankAccountBalances').mockResolvedValue([]);
    vi.spyOn(stocksApi, 'listStocks').mockResolvedValue([]);
    vi.spyOn(stockPurchasesApi, 'listStockPurchases').mockResolvedValue([]);
    vi.spyOn(stockValuationsApi, 'listStockValuations').mockResolvedValue([]);

    renderPage();

    expect(await screen.findByText(/Cuentas Bancarias/)).toBeInTheDocument();
    expect(screen.getByText(/Acciones/)).toBeInTheDocument();
    expect(screen.getByText(/Fondos Inversión/)).toBeInTheDocument();
    expect(screen.getByText(/Cripto/)).toBeInTheDocument();
    expect(screen.getByText(/Vehículos/)).toBeInTheDocument();
    expect(screen.getByText(/Fondo Pensiones/)).toBeInTheDocument();
    expect(screen.getByText(/Efectivo/)).toBeInTheDocument();
    expect(screen.getAllByText('Próximamente.')).toHaveLength(5);
  });

  describe('Cuentas Bancarias (spec 019)', () => {
    function mockOtherApis() {
      vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
      vi.spyOn(stocksApi, 'listStocks').mockResolvedValue([]);
      vi.spyOn(stockPurchasesApi, 'listStockPurchases').mockResolvedValue([]);
      vi.spyOn(stockValuationsApi, 'listStockValuations').mockResolvedValue([]);
    }

    it('sin ninguna cuenta, muestra el aviso de "todavía no tienes nada"', async () => {
      mockOtherApis();
      vi.spyOn(bankAccountsApi, 'listBankAccounts').mockResolvedValue([]);
      vi.spyOn(bankAccountBalancesApi, 'listBankAccountBalances').mockResolvedValue([]);

      renderPage();

      expect(await screen.findByText('Todavía no tienes ninguna cuenta bancaria.')).toBeInTheDocument();
    });

    it('lista una cuenta existente, con su saldo más reciente', async () => {
      mockOtherApis();
      vi.spyOn(bankAccountsApi, 'listBankAccounts').mockResolvedValue([BANK_ACCOUNT]);
      vi.spyOn(bankAccountBalancesApi, 'listBankAccountBalances').mockResolvedValue([BANK_BALANCE]);

      renderPage();

      const list = await screen.findByRole('list', { name: 'Tus cuentas bancarias' });
      expect(within(list).getByText('BBVA · ES1234')).toBeInTheDocument();
      expect(within(list).getByText('Última fecha: 2026-09-04')).toBeInTheDocument();

      const history = within(list).getByRole('list', { name: 'Historial de BBVA · ES1234' });
      expect(within(history).getByText('2026-09-04')).toBeInTheDocument();
    });

    it('una cuenta sin ningún saldo muestra "Sin saldo"', async () => {
      mockOtherApis();
      vi.spyOn(bankAccountsApi, 'listBankAccounts').mockResolvedValue([BANK_ACCOUNT]);
      vi.spyOn(bankAccountBalancesApi, 'listBankAccountBalances').mockResolvedValue([]);

      renderPage();

      const list = await screen.findByRole('list', { name: 'Tus cuentas bancarias' });
      expect(within(list).getByText('Sin saldo')).toBeInTheDocument();
      expect(within(list).getByText('Todavía no hay ningún saldo registrado en esta cuenta.')).toBeInTheDocument();
    });

    it('crea una cuenta desde el formulario de alta', async () => {
      mockOtherApis();
      const listSpy = vi.spyOn(bankAccountsApi, 'listBankAccounts').mockResolvedValue([]);
      vi.spyOn(bankAccountBalancesApi, 'listBankAccountBalances').mockResolvedValue([]);
      const createSpy = vi.spyOn(bankAccountsApi, 'createBankAccount').mockResolvedValue(BANK_ACCOUNT);

      renderPage();
      const form = await screen.findByRole('form', { name: 'Añadir cuenta bancaria' });

      await userEvent.type(within(form).getByLabelText('Banco'), 'BBVA');
      await userEvent.type(within(form).getByLabelText('Número de Cuenta'), 'ES1234');
      await userEvent.click(within(form).getByRole('button', { name: 'Añadir cuenta' }));

      await waitFor(() => expect(createSpy).toHaveBeenCalledWith({ bank: 'BBVA', accountNumber: 'ES1234' }));
      await waitFor(() => expect(listSpy).toHaveBeenCalledTimes(2));
    });

    it('edita una cuenta existente', async () => {
      mockOtherApis();
      vi.spyOn(bankAccountsApi, 'listBankAccounts').mockResolvedValue([BANK_ACCOUNT]);
      vi.spyOn(bankAccountBalancesApi, 'listBankAccountBalances').mockResolvedValue([]);
      const updateSpy = vi.spyOn(bankAccountsApi, 'updateBankAccount').mockResolvedValue(BANK_ACCOUNT);

      renderPage();
      await screen.findByRole('list', { name: 'Tus cuentas bancarias' });

      await userEvent.click(screen.getByRole('button', { name: 'Editar cuenta: BBVA · ES1234' }));
      const editForm = screen.getByRole('form', { name: 'Editar cuenta: BBVA' });
      const bankInput = within(editForm).getByLabelText('Banco');
      await userEvent.clear(bankInput);
      await userEvent.type(bankInput, 'Santander');
      await userEvent.click(within(editForm).getByRole('button', { name: 'Guardar' }));

      await waitFor(() =>
        expect(updateSpy).toHaveBeenCalledWith(BANK_ACCOUNT.id, { bank: 'Santander', accountNumber: 'ES1234' }),
      );
    });

    it('elimina una cuenta', async () => {
      mockOtherApis();
      vi.spyOn(bankAccountsApi, 'listBankAccounts').mockResolvedValue([BANK_ACCOUNT]);
      vi.spyOn(bankAccountBalancesApi, 'listBankAccountBalances').mockResolvedValue([]);
      const deleteSpy = vi.spyOn(bankAccountsApi, 'deleteBankAccount').mockResolvedValue(undefined);

      renderPage();
      await screen.findByRole('list', { name: 'Tus cuentas bancarias' });

      await userEvent.click(screen.getByRole('button', { name: 'Eliminar cuenta: BBVA · ES1234' }));

      await waitFor(() => expect(deleteSpy).toHaveBeenCalledWith(BANK_ACCOUNT.id));
    });

    it('el formulario de saldo de una cuenta trae la fecha de hoy por defecto', async () => {
      mockOtherApis();
      vi.spyOn(bankAccountsApi, 'listBankAccounts').mockResolvedValue([BANK_ACCOUNT]);
      vi.spyOn(bankAccountBalancesApi, 'listBankAccountBalances').mockResolvedValue([]);

      renderPage();
      const form = await screen.findByRole('form', { name: 'Añadir saldo: BBVA' });

      expect(within(form).getByLabelText('Fecha')).toHaveValue(todayIso());
    });

    it('añade un saldo a una cuenta existente', async () => {
      mockOtherApis();
      vi.spyOn(bankAccountsApi, 'listBankAccounts').mockResolvedValue([BANK_ACCOUNT]);
      const listBalancesSpy = vi.spyOn(bankAccountBalancesApi, 'listBankAccountBalances').mockResolvedValue([]);
      const createSpy = vi.spyOn(bankAccountBalancesApi, 'createBankAccountBalance').mockResolvedValue(BANK_BALANCE);

      renderPage();
      const form = await screen.findByRole('form', { name: 'Añadir saldo: BBVA' });

      await userEvent.type(within(form).getByLabelText('Euros'), '-50.25');
      await userEvent.click(within(form).getByRole('button', { name: 'Añadir saldo' }));

      await waitFor(() =>
        expect(createSpy).toHaveBeenCalledWith({ bankAccountId: BANK_ACCOUNT.id, euros: '-50.25', date: todayIso() }),
      );
      await waitFor(() => expect(listBalancesSpy).toHaveBeenCalledTimes(2));
    });

    it('edita una entrada de saldo del historial', async () => {
      mockOtherApis();
      vi.spyOn(bankAccountsApi, 'listBankAccounts').mockResolvedValue([BANK_ACCOUNT]);
      vi.spyOn(bankAccountBalancesApi, 'listBankAccountBalances').mockResolvedValue([BANK_BALANCE]);
      const updateSpy = vi.spyOn(bankAccountBalancesApi, 'updateBankAccountBalance').mockResolvedValue(BANK_BALANCE);

      renderPage();
      await screen.findByRole('list', { name: 'Tus cuentas bancarias' });

      await userEvent.click(screen.getByRole('button', { name: 'Editar saldo del 2026-09-04' }));
      const editForm = screen.getByRole('form', { name: 'Editar saldo del 2026-09-04' });
      const eurosInput = within(editForm).getByLabelText('Euros');
      await userEvent.clear(eurosInput);
      await userEvent.type(eurosInput, '2000.00');
      await userEvent.click(within(editForm).getByRole('button', { name: 'Guardar' }));

      await waitFor(() =>
        expect(updateSpy).toHaveBeenCalledWith(BANK_BALANCE.id, { euros: '2000.00', date: '2026-09-04' }),
      );
    });

    it('elimina una entrada de saldo del historial, sin borrar la cuenta', async () => {
      mockOtherApis();
      vi.spyOn(bankAccountsApi, 'listBankAccounts').mockResolvedValue([BANK_ACCOUNT]);
      vi.spyOn(bankAccountBalancesApi, 'listBankAccountBalances').mockResolvedValue([BANK_BALANCE]);
      const deleteBalanceSpy = vi.spyOn(bankAccountBalancesApi, 'deleteBankAccountBalance').mockResolvedValue(undefined);
      const deleteAccountSpy = vi.spyOn(bankAccountsApi, 'deleteBankAccount');

      renderPage();
      await screen.findByRole('list', { name: 'Tus cuentas bancarias' });

      await userEvent.click(screen.getByRole('button', { name: 'Eliminar saldo del 2026-09-04' }));

      await waitFor(() => expect(deleteBalanceSpy).toHaveBeenCalledWith(BANK_BALANCE.id));
      expect(deleteAccountSpy).not.toHaveBeenCalled();
    });
  });

  describe('Acciones (spec 020)', () => {
    function mockOtherApis() {
      vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
      vi.spyOn(bankAccountsApi, 'listBankAccounts').mockResolvedValue([]);
      vi.spyOn(bankAccountBalancesApi, 'listBankAccountBalances').mockResolvedValue([]);
    }

    it('sin ninguna acción, muestra el aviso de "todavía no tienes nada"', async () => {
      mockOtherApis();
      vi.spyOn(stocksApi, 'listStocks').mockResolvedValue([]);
      vi.spyOn(stockPurchasesApi, 'listStockPurchases').mockResolvedValue([]);
      vi.spyOn(stockValuationsApi, 'listStockValuations').mockResolvedValue([]);

      renderPage();

      expect(await screen.findByText('Todavía no tienes ninguna acción.')).toBeInTheDocument();
    });

    it('lista una acción existente, con sus totales y su valoración más reciente', async () => {
      mockOtherApis();
      vi.spyOn(stocksApi, 'listStocks').mockResolvedValue([STOCK]);
      vi.spyOn(stockPurchasesApi, 'listStockPurchases').mockResolvedValue([STOCK_PURCHASE]);
      vi.spyOn(stockValuationsApi, 'listStockValuations').mockResolvedValue([STOCK_VALUATION]);

      renderPage();

      const list = await screen.findByRole('list', { name: 'Tus acciones' });
      expect(within(list).getByText('Inditex · BBVA')).toBeInTheDocument();
      expect(within(list).getByText(/10.0000 acciones · Coste total/)).toHaveTextContent('Última fecha: 2026-09-04');

      const purchaseHistory = within(list).getByRole('list', { name: 'Historial de compras de Inditex · BBVA' });
      expect(within(purchaseHistory).getByText(/10.0000 acciones @/)).toBeInTheDocument();

      const valuationHistory = within(list).getByRole('list', { name: 'Historial de valoraciones de Inditex · BBVA' });
      expect(within(valuationHistory).getByText('2026-09-04')).toBeInTheDocument();
    });

    it('una acción sin ninguna valoración muestra "Sin valoración"', async () => {
      mockOtherApis();
      vi.spyOn(stocksApi, 'listStocks').mockResolvedValue([STOCK]);
      vi.spyOn(stockPurchasesApi, 'listStockPurchases').mockResolvedValue([]);
      vi.spyOn(stockValuationsApi, 'listStockValuations').mockResolvedValue([]);

      renderPage();

      const list = await screen.findByRole('list', { name: 'Tus acciones' });
      expect(within(list).getByText('Sin valoración')).toBeInTheDocument();
      expect(within(list).getByText('Todavía no hay ninguna compra registrada en esta acción.')).toBeInTheDocument();
      expect(within(list).getByText('Todavía no hay ninguna valoración registrada en esta acción.')).toBeInTheDocument();
    });

    it('crea una acción desde el formulario de alta', async () => {
      mockOtherApis();
      const listSpy = vi.spyOn(stocksApi, 'listStocks').mockResolvedValue([]);
      vi.spyOn(stockPurchasesApi, 'listStockPurchases').mockResolvedValue([]);
      vi.spyOn(stockValuationsApi, 'listStockValuations').mockResolvedValue([]);
      const createSpy = vi.spyOn(stocksApi, 'createStock').mockResolvedValue(STOCK);

      renderPage();
      const form = await screen.findByRole('form', { name: 'Añadir acción' });

      await userEvent.type(within(form).getByLabelText('Banco Custodia'), 'BBVA');
      await userEvent.type(within(form).getByLabelText('Acción'), 'Inditex');
      await userEvent.click(within(form).getByRole('button', { name: 'Añadir acción' }));

      await waitFor(() => expect(createSpy).toHaveBeenCalledWith({ custodyBank: 'BBVA', stock: 'Inditex' }));
      await waitFor(() => expect(listSpy).toHaveBeenCalledTimes(2));
    });

    it('edita una acción existente', async () => {
      mockOtherApis();
      vi.spyOn(stocksApi, 'listStocks').mockResolvedValue([STOCK]);
      vi.spyOn(stockPurchasesApi, 'listStockPurchases').mockResolvedValue([]);
      vi.spyOn(stockValuationsApi, 'listStockValuations').mockResolvedValue([]);
      const updateSpy = vi.spyOn(stocksApi, 'updateStock').mockResolvedValue(STOCK);

      renderPage();
      await screen.findByRole('list', { name: 'Tus acciones' });

      await userEvent.click(screen.getByRole('button', { name: 'Editar acción: Inditex · BBVA' }));
      const editForm = screen.getByRole('form', { name: 'Editar acción: Inditex' });
      const stockInput = within(editForm).getByLabelText('Acción');
      await userEvent.clear(stockInput);
      await userEvent.type(stockInput, 'Iberdrola');
      await userEvent.click(within(editForm).getByRole('button', { name: 'Guardar' }));

      await waitFor(() => expect(updateSpy).toHaveBeenCalledWith(STOCK.id, { custodyBank: 'BBVA', stock: 'Iberdrola' }));
    });

    it('elimina una acción, junto con su historial', async () => {
      mockOtherApis();
      vi.spyOn(stocksApi, 'listStocks').mockResolvedValue([STOCK]);
      vi.spyOn(stockPurchasesApi, 'listStockPurchases').mockResolvedValue([STOCK_PURCHASE]);
      vi.spyOn(stockValuationsApi, 'listStockValuations').mockResolvedValue([STOCK_VALUATION]);
      const deleteSpy = vi.spyOn(stocksApi, 'deleteStock').mockResolvedValue(undefined);

      renderPage();
      await screen.findByRole('list', { name: 'Tus acciones' });

      await userEvent.click(screen.getByRole('button', { name: 'Eliminar acción: Inditex · BBVA' }));

      await waitFor(() => expect(deleteSpy).toHaveBeenCalledWith(STOCK.id));
    });

    it('el formulario de compra de una acción calcula el valor de compra al escribir precio y número de acciones', async () => {
      mockOtherApis();
      vi.spyOn(stocksApi, 'listStocks').mockResolvedValue([STOCK]);
      vi.spyOn(stockPurchasesApi, 'listStockPurchases').mockResolvedValue([]);
      vi.spyOn(stockValuationsApi, 'listStockValuations').mockResolvedValue([]);

      renderPage();
      const form = await screen.findByRole('form', { name: 'Añadir compra: Inditex' });

      await userEvent.type(within(form).getByLabelText('Número acciones'), '4');
      await userEvent.type(within(form).getByLabelText('Precio compra'), '10.50');

      expect(within(form).getByText(/Valor compra:/)).toHaveTextContent('42,00');
    });

    it('añade una compra a una acción existente', async () => {
      mockOtherApis();
      vi.spyOn(stocksApi, 'listStocks').mockResolvedValue([STOCK]);
      const listPurchasesSpy = vi.spyOn(stockPurchasesApi, 'listStockPurchases').mockResolvedValue([]);
      vi.spyOn(stockValuationsApi, 'listStockValuations').mockResolvedValue([]);
      const createSpy = vi.spyOn(stockPurchasesApi, 'createStockPurchase').mockResolvedValue(STOCK_PURCHASE);

      renderPage();
      const form = await screen.findByRole('form', { name: 'Añadir compra: Inditex' });

      await userEvent.type(within(form).getByLabelText('Número acciones'), '10');
      await userEvent.type(within(form).getByLabelText('Precio compra'), '30.00');
      await userEvent.click(within(form).getByRole('button', { name: 'Añadir compra' }));

      await waitFor(() =>
        expect(createSpy).toHaveBeenCalledWith({ stockId: STOCK.id, shareCount: '10', purchasePrice: '30.00' }),
      );
      await waitFor(() => expect(listPurchasesSpy).toHaveBeenCalledTimes(2));
    });

    it('edita una compra del historial', async () => {
      mockOtherApis();
      vi.spyOn(stocksApi, 'listStocks').mockResolvedValue([STOCK]);
      vi.spyOn(stockPurchasesApi, 'listStockPurchases').mockResolvedValue([STOCK_PURCHASE]);
      vi.spyOn(stockValuationsApi, 'listStockValuations').mockResolvedValue([]);
      const updateSpy = vi.spyOn(stockPurchasesApi, 'updateStockPurchase').mockResolvedValue(STOCK_PURCHASE);

      renderPage();
      await screen.findByRole('list', { name: 'Tus acciones' });

      await userEvent.click(screen.getByRole('button', { name: 'Editar compra de Inditex: 10.0000 acciones a 30.00€' }));
      const editForm = screen.getByRole('form', { name: 'Editar compra de Inditex: 10.0000 acciones a 30.00€' });
      const shareCountInput = within(editForm).getByLabelText('Número acciones');
      await userEvent.clear(shareCountInput);
      await userEvent.type(shareCountInput, '15');
      await userEvent.click(within(editForm).getByRole('button', { name: 'Guardar' }));

      await waitFor(() =>
        expect(updateSpy).toHaveBeenCalledWith(STOCK_PURCHASE.id, { shareCount: '15', purchasePrice: '30.00' }),
      );
    });

    it('elimina una compra del historial, sin borrar la acción', async () => {
      mockOtherApis();
      vi.spyOn(stocksApi, 'listStocks').mockResolvedValue([STOCK]);
      vi.spyOn(stockPurchasesApi, 'listStockPurchases').mockResolvedValue([STOCK_PURCHASE]);
      vi.spyOn(stockValuationsApi, 'listStockValuations').mockResolvedValue([]);
      const deletePurchaseSpy = vi.spyOn(stockPurchasesApi, 'deleteStockPurchase').mockResolvedValue(undefined);
      const deleteStockSpy = vi.spyOn(stocksApi, 'deleteStock');

      renderPage();
      await screen.findByRole('list', { name: 'Tus acciones' });

      await userEvent.click(screen.getByRole('button', { name: 'Eliminar compra de Inditex: 10.0000 acciones a 30.00€' }));

      await waitFor(() => expect(deletePurchaseSpy).toHaveBeenCalledWith(STOCK_PURCHASE.id));
      expect(deleteStockSpy).not.toHaveBeenCalled();
    });

    it('el formulario de valoración de una acción trae la fecha de hoy por defecto', async () => {
      mockOtherApis();
      vi.spyOn(stocksApi, 'listStocks').mockResolvedValue([STOCK]);
      vi.spyOn(stockPurchasesApi, 'listStockPurchases').mockResolvedValue([]);
      vi.spyOn(stockValuationsApi, 'listStockValuations').mockResolvedValue([]);

      renderPage();
      const form = await screen.findByRole('form', { name: 'Añadir valoración: Inditex' });

      expect(within(form).getByLabelText('Fecha')).toHaveValue(todayIso());
    });

    it('añade una valoración a una acción existente', async () => {
      mockOtherApis();
      vi.spyOn(stocksApi, 'listStocks').mockResolvedValue([STOCK]);
      vi.spyOn(stockPurchasesApi, 'listStockPurchases').mockResolvedValue([]);
      const listValuationsSpy = vi.spyOn(stockValuationsApi, 'listStockValuations').mockResolvedValue([]);
      const createSpy = vi.spyOn(stockValuationsApi, 'createStockValuation').mockResolvedValue(STOCK_VALUATION);

      renderPage();
      const form = await screen.findByRole('form', { name: 'Añadir valoración: Inditex' });

      await userEvent.type(within(form).getByLabelText('Valoración actual'), '35.00');
      await userEvent.click(within(form).getByRole('button', { name: 'Añadir valoración' }));

      await waitFor(() =>
        expect(createSpy).toHaveBeenCalledWith({ stockId: STOCK.id, valuation: '35.00', date: todayIso() }),
      );
      await waitFor(() => expect(listValuationsSpy).toHaveBeenCalledTimes(2));
    });

    it('edita una valoración del historial', async () => {
      mockOtherApis();
      vi.spyOn(stocksApi, 'listStocks').mockResolvedValue([STOCK]);
      vi.spyOn(stockPurchasesApi, 'listStockPurchases').mockResolvedValue([]);
      vi.spyOn(stockValuationsApi, 'listStockValuations').mockResolvedValue([STOCK_VALUATION]);
      const updateSpy = vi.spyOn(stockValuationsApi, 'updateStockValuation').mockResolvedValue(STOCK_VALUATION);

      renderPage();
      await screen.findByRole('list', { name: 'Tus acciones' });

      await userEvent.click(screen.getByRole('button', { name: 'Editar valoración de Inditex del 2026-09-04' }));
      const editForm = screen.getByRole('form', { name: 'Editar valoración de Inditex del 2026-09-04' });
      const valuationInput = within(editForm).getByLabelText('Valoración actual');
      await userEvent.clear(valuationInput);
      await userEvent.type(valuationInput, '40.00');
      await userEvent.click(within(editForm).getByRole('button', { name: 'Guardar' }));

      await waitFor(() =>
        expect(updateSpy).toHaveBeenCalledWith(STOCK_VALUATION.id, { valuation: '40.00', date: '2026-09-04' }),
      );
    });

    it('elimina una valoración del historial, sin borrar la acción', async () => {
      mockOtherApis();
      vi.spyOn(stocksApi, 'listStocks').mockResolvedValue([STOCK]);
      vi.spyOn(stockPurchasesApi, 'listStockPurchases').mockResolvedValue([]);
      vi.spyOn(stockValuationsApi, 'listStockValuations').mockResolvedValue([STOCK_VALUATION]);
      const deleteValuationSpy = vi.spyOn(stockValuationsApi, 'deleteStockValuation').mockResolvedValue(undefined);
      const deleteStockSpy = vi.spyOn(stocksApi, 'deleteStock');

      renderPage();
      await screen.findByRole('list', { name: 'Tus acciones' });

      await userEvent.click(screen.getByRole('button', { name: 'Eliminar valoración de Inditex del 2026-09-04' }));

      await waitFor(() => expect(deleteValuationSpy).toHaveBeenCalledWith(STOCK_VALUATION.id));
      expect(deleteStockSpy).not.toHaveBeenCalled();
    });
  });
});
