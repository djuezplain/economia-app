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
import * as stockDividendsApi from '../api/stock-dividends';
import * as fundsApi from '../api/funds';
import * as fundPurchasesApi from '../api/fund-purchases';
import * as fundValuationsApi from '../api/fund-valuations';
import * as fundDividendsApi from '../api/fund-dividends';
import * as cryptosApi from '../api/cryptos';
import * as cryptoPurchasesApi from '../api/crypto-purchases';
import * as cryptoValuationsApi from '../api/crypto-valuations';
import * as vehiclesApi from '../api/vehicles';
import * as vehicleValuationsApi from '../api/vehicle-valuations';
import * as pensionPlansApi from '../api/pension-plans';
import * as pensionPlanContributionsApi from '../api/pension-plan-contributions';
import * as pensionPlanValuationsApi from '../api/pension-plan-valuations';
import * as cashHoldingsApi from '../api/cash-holdings';
import * as cashBalancesApi from '../api/cash-balances';
import type { BankAccount } from '../api/bank-accounts';
import type { BankAccountBalance } from '../api/bank-account-balances';
import type { Stock } from '../api/stocks';
import type { StockPurchase } from '../api/stock-purchases';
import type { StockValuation } from '../api/stock-valuations';
import type { StockDividend } from '../api/stock-dividends';
import type { Fund } from '../api/funds';
import type { FundPurchase } from '../api/fund-purchases';
import type { FundValuation } from '../api/fund-valuations';
import type { FundDividend } from '../api/fund-dividends';
import type { Crypto } from '../api/cryptos';
import type { CryptoPurchase } from '../api/crypto-purchases';
import type { CryptoValuation } from '../api/crypto-valuations';
import type { Vehicle } from '../api/vehicles';
import type { VehicleValuation } from '../api/vehicle-valuations';
import type { PensionPlan } from '../api/pension-plans';
import type { PensionPlanContribution } from '../api/pension-plan-contributions';
import type { PensionPlanValuation } from '../api/pension-plan-valuations';
import type { CashHolding } from '../api/cash-holdings';
import type { CashBalance } from '../api/cash-balances';
import { ApiError } from '../api/client';
import { resetForTests } from '../offline/connectivity';

const BANK_ACCOUNT: BankAccount = {
  id: 'account-1',
  userId: 'user-1',
  bank: 'BBVA',
  accountNumber: 'ES1234',
  alias: null,
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
  date: '2026-09-04',
  createdAt: '2026-09-04T00:00:00.000Z',
  updatedAt: '2026-09-04T00:00:00.000Z',
};

const STOCK_VALUATION: StockValuation = {
  id: 'valuation-1',
  stockId: 'stock-1',
  pricePerShare: '35.00',
  date: '2026-09-04',
  createdAt: '2026-09-04T00:00:00.000Z',
  updatedAt: '2026-09-04T00:00:00.000Z',
};

const STOCK_DIVIDEND: StockDividend = {
  id: 'stock-dividend-1',
  stockId: 'stock-1',
  netAmount: '81.00',
  retentionPercent: '19.00',
  date: '2026-09-04',
  createdAt: '2026-09-04T00:00:00.000Z',
  updatedAt: '2026-09-04T00:00:00.000Z',
};

const FUND: Fund = {
  id: 'fund-1',
  userId: 'user-1',
  custodyBank: 'MyInvestor',
  fund: 'Vanguard Global Stock Index',
  createdAt: '2026-09-04T00:00:00.000Z',
  updatedAt: '2026-09-04T00:00:00.000Z',
};

const FUND_PURCHASE: FundPurchase = {
  id: 'fund-purchase-1',
  fundId: 'fund-1',
  shareCount: '10.0000',
  purchasePrice: '30.00',
  date: '2026-09-04',
  createdAt: '2026-09-04T00:00:00.000Z',
  updatedAt: '2026-09-04T00:00:00.000Z',
};

const FUND_VALUATION: FundValuation = {
  id: 'fund-valuation-1',
  fundId: 'fund-1',
  pricePerShare: '20.00',
  date: '2026-09-04',
  createdAt: '2026-09-04T00:00:00.000Z',
  updatedAt: '2026-09-04T00:00:00.000Z',
};

const FUND_DIVIDEND: FundDividend = {
  id: 'fund-dividend-1',
  fundId: 'fund-1',
  netAmount: '40.50',
  retentionPercent: '19.00',
  date: '2026-09-04',
  createdAt: '2026-09-04T00:00:00.000Z',
  updatedAt: '2026-09-04T00:00:00.000Z',
};

const CRYPTO: Crypto = {
  id: 'crypto-1',
  userId: 'user-1',
  exchange: 'Binance',
  crypto: 'Bitcoin',
  createdAt: '2026-09-04T00:00:00.000Z',
  updatedAt: '2026-09-04T00:00:00.000Z',
};

const CRYPTO_PURCHASE: CryptoPurchase = {
  id: 'crypto-purchase-1',
  cryptoId: 'crypto-1',
  quantity: '0.10000000',
  purchasePrice: '30000.00',
  date: '2026-09-04',
  createdAt: '2026-09-04T00:00:00.000Z',
  updatedAt: '2026-09-04T00:00:00.000Z',
};

const CRYPTO_VALUATION: CryptoValuation = {
  id: 'crypto-valuation-1',
  cryptoId: 'crypto-1',
  pricePerUnit: '35000.00000000',
  date: '2026-09-04',
  createdAt: '2026-09-04T00:00:00.000Z',
  updatedAt: '2026-09-04T00:00:00.000Z',
};

const VEHICLE: Vehicle = {
  id: 'vehicle-1',
  userId: 'user-1',
  brandModel: 'Toyota Corolla',
  plate: '1234ABC',
  purchasePrice: '20000.00',
  purchaseDate: '2026-09-04',
  createdAt: '2026-09-04T00:00:00.000Z',
  updatedAt: '2026-09-04T00:00:00.000Z',
};

const VEHICLE_VALUATION: VehicleValuation = {
  id: 'vehicle-valuation-1',
  vehicleId: 'vehicle-1',
  value: '15000.00',
  date: '2026-09-04',
  createdAt: '2026-09-04T00:00:00.000Z',
  updatedAt: '2026-09-04T00:00:00.000Z',
};

const PENSION_PLAN: PensionPlan = {
  id: 'pension-plan-1',
  userId: 'user-1',
  managingEntity: 'Caixabank',
  plan: 'Plan Futuro Sostenible',
  createdAt: '2026-09-04T00:00:00.000Z',
  updatedAt: '2026-09-04T00:00:00.000Z',
};

const PENSION_PLAN_CONTRIBUTION: PensionPlanContribution = {
  id: 'pension-plan-contribution-1',
  pensionPlanId: 'pension-plan-1',
  amount: '1800.00',
  date: '2026-09-04',
  createdAt: '2026-09-04T00:00:00.000Z',
  updatedAt: '2026-09-04T00:00:00.000Z',
};

const PENSION_PLAN_VALUATION: PensionPlanValuation = {
  id: 'pension-plan-valuation-1',
  pensionPlanId: 'pension-plan-1',
  value: '1950.00',
  date: '2026-09-04',
  createdAt: '2026-09-04T00:00:00.000Z',
  updatedAt: '2026-09-04T00:00:00.000Z',
};

const CASH_HOLDING: CashHolding = {
  id: 'cash-holding-1',
  userId: 'user-1',
  location: 'Cartera',
  createdAt: '2026-09-04T00:00:00.000Z',
  updatedAt: '2026-09-04T00:00:00.000Z',
};

const CASH_BALANCE: CashBalance = {
  id: 'cash-balance-1',
  cashHoldingId: 'cash-holding-1',
  amount: '200.00',
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

  it('muestra las 7 categorías, todas implementadas (sin "Próximamente.")', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    vi.spyOn(bankAccountsApi, 'listBankAccounts').mockResolvedValue([]);
    vi.spyOn(bankAccountBalancesApi, 'listBankAccountBalances').mockResolvedValue([]);
    vi.spyOn(stocksApi, 'listStocks').mockResolvedValue([]);
    vi.spyOn(stockPurchasesApi, 'listStockPurchases').mockResolvedValue([]);
    vi.spyOn(stockValuationsApi, 'listStockValuations').mockResolvedValue([]);
    vi.spyOn(stockDividendsApi, 'listStockDividends').mockResolvedValue([]);
    vi.spyOn(fundsApi, 'listFunds').mockResolvedValue([]);
    vi.spyOn(fundPurchasesApi, 'listFundPurchases').mockResolvedValue([]);
    vi.spyOn(fundValuationsApi, 'listFundValuations').mockResolvedValue([]);
    vi.spyOn(fundDividendsApi, 'listFundDividends').mockResolvedValue([]);
    vi.spyOn(cryptosApi, 'listCryptos').mockResolvedValue([]);
    vi.spyOn(cryptoPurchasesApi, 'listCryptoPurchases').mockResolvedValue([]);
    vi.spyOn(cryptoValuationsApi, 'listCryptoValuations').mockResolvedValue([]);
    vi.spyOn(vehiclesApi, 'listVehicles').mockResolvedValue([]);
    vi.spyOn(vehicleValuationsApi, 'listVehicleValuations').mockResolvedValue([]);
    vi.spyOn(pensionPlansApi, 'listPensionPlans').mockResolvedValue([]);
    vi.spyOn(pensionPlanContributionsApi, 'listPensionPlanContributions').mockResolvedValue([]);
    vi.spyOn(pensionPlanValuationsApi, 'listPensionPlanValuations').mockResolvedValue([]);
    vi.spyOn(cashHoldingsApi, 'listCashHoldings').mockResolvedValue([]);
    vi.spyOn(cashBalancesApi, 'listCashBalances').mockResolvedValue([]);

    renderPage();

    expect(await screen.findByRole('heading', { name: /Cuentas Bancarias/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Acciones/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Fondos Inversión/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Cripto/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Vehículos/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Fondo Pensiones/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Efectivo/ })).toBeInTheDocument();
    expect(screen.queryAllByText('Próximamente.')).toHaveLength(0);
  });

  describe('Total (sumatorio de las 7 categorías)', () => {
    it('suma el último saldo de cada cuenta bancaria, el valor actual de cada acción, fondo, posición de cripto, vehículo, plan de pensiones y ubicación de efectivo', async () => {
      vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
      vi.spyOn(bankAccountsApi, 'listBankAccounts').mockResolvedValue([BANK_ACCOUNT]);
      vi.spyOn(bankAccountBalancesApi, 'listBankAccountBalances').mockResolvedValue([BANK_BALANCE]);
      vi.spyOn(stocksApi, 'listStocks').mockResolvedValue([STOCK]);
      vi.spyOn(stockPurchasesApi, 'listStockPurchases').mockResolvedValue([STOCK_PURCHASE]);
      vi.spyOn(stockValuationsApi, 'listStockValuations').mockResolvedValue([STOCK_VALUATION]);
      vi.spyOn(stockDividendsApi, 'listStockDividends').mockResolvedValue([]);
      vi.spyOn(fundsApi, 'listFunds').mockResolvedValue([FUND]);
      vi.spyOn(fundPurchasesApi, 'listFundPurchases').mockResolvedValue([FUND_PURCHASE]);
      vi.spyOn(fundValuationsApi, 'listFundValuations').mockResolvedValue([FUND_VALUATION]);
      vi.spyOn(fundDividendsApi, 'listFundDividends').mockResolvedValue([]);
      vi.spyOn(cryptosApi, 'listCryptos').mockResolvedValue([CRYPTO]);
      vi.spyOn(cryptoPurchasesApi, 'listCryptoPurchases').mockResolvedValue([CRYPTO_PURCHASE]);
      vi.spyOn(cryptoValuationsApi, 'listCryptoValuations').mockResolvedValue([CRYPTO_VALUATION]);
      vi.spyOn(vehiclesApi, 'listVehicles').mockResolvedValue([VEHICLE]);
      vi.spyOn(vehicleValuationsApi, 'listVehicleValuations').mockResolvedValue([VEHICLE_VALUATION]);
      vi.spyOn(pensionPlansApi, 'listPensionPlans').mockResolvedValue([PENSION_PLAN]);
      vi.spyOn(pensionPlanContributionsApi, 'listPensionPlanContributions').mockResolvedValue([PENSION_PLAN_CONTRIBUTION]);
      vi.spyOn(pensionPlanValuationsApi, 'listPensionPlanValuations').mockResolvedValue([PENSION_PLAN_VALUATION]);
      vi.spyOn(cashHoldingsApi, 'listCashHoldings').mockResolvedValue([CASH_HOLDING]);
      vi.spyOn(cashBalancesApi, 'listCashBalances').mockResolvedValue([CASH_BALANCE]);

      renderPage();

      // Cuentas Bancarias: 1500,00 € (BANK_BALANCE). Acciones: 350,00 € (10 × 35,00 €, STOCK_VALUATION).
      // Fondos Inversión: 200,00 € (10 × 20,00 €, FUND_VALUATION). Cripto: 3500,00 € (0.1 × 35000,00 €, CRYPTO_VALUATION).
      // Vehículos: 15000,00 € (VEHICLE_VALUATION). Fondo Pensiones: 1950,00 € (PENSION_PLAN_VALUATION).
      // Efectivo: 200,00 € (CASH_BALANCE). Total: 22700,00 €.
      // Acotado a la tarjeta "Total" (id="wealth-total-summary"): el mismo importe puede repetirse
      // en la tabla de "Evolución del patrimonio" (spec 027) si la última semana mostrada es hoy.
      await waitFor(() => expect(document.getElementById('wealth-total-summary')).toBeInTheDocument());
      const totalCard = within(document.getElementById('wealth-total-summary')!);
      expect(totalCard.getByText('22.700,00 €')).toBeInTheDocument();
      expect(
        totalCard.getByText(
          'Cuentas Bancarias: 1500,00 € · Acciones: 350,00 € · Fondos Inversión: 200,00 € · Cripto: 3500,00 € · Vehículos: 15.000,00 € · Fondo Pensiones: 1950,00 € · Efectivo: 200,00 €',
        ),
      ).toBeInTheDocument();
    });

    it('sin ninguna cuenta, acción, fondo, posición de cripto, vehículo, plan de pensiones ni efectivo, el total es 0,00 €', async () => {
      vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
      vi.spyOn(bankAccountsApi, 'listBankAccounts').mockResolvedValue([]);
      vi.spyOn(bankAccountBalancesApi, 'listBankAccountBalances').mockResolvedValue([]);
      vi.spyOn(stocksApi, 'listStocks').mockResolvedValue([]);
      vi.spyOn(stockPurchasesApi, 'listStockPurchases').mockResolvedValue([]);
      vi.spyOn(stockValuationsApi, 'listStockValuations').mockResolvedValue([]);
      vi.spyOn(stockDividendsApi, 'listStockDividends').mockResolvedValue([]);
      vi.spyOn(fundsApi, 'listFunds').mockResolvedValue([]);
      vi.spyOn(fundPurchasesApi, 'listFundPurchases').mockResolvedValue([]);
      vi.spyOn(fundValuationsApi, 'listFundValuations').mockResolvedValue([]);
      vi.spyOn(fundDividendsApi, 'listFundDividends').mockResolvedValue([]);
      vi.spyOn(cryptosApi, 'listCryptos').mockResolvedValue([]);
      vi.spyOn(cryptoPurchasesApi, 'listCryptoPurchases').mockResolvedValue([]);
      vi.spyOn(cryptoValuationsApi, 'listCryptoValuations').mockResolvedValue([]);
      vi.spyOn(vehiclesApi, 'listVehicles').mockResolvedValue([]);
      vi.spyOn(vehicleValuationsApi, 'listVehicleValuations').mockResolvedValue([]);
      vi.spyOn(pensionPlansApi, 'listPensionPlans').mockResolvedValue([]);
      vi.spyOn(pensionPlanContributionsApi, 'listPensionPlanContributions').mockResolvedValue([]);
      vi.spyOn(pensionPlanValuationsApi, 'listPensionPlanValuations').mockResolvedValue([]);
      vi.spyOn(cashHoldingsApi, 'listCashHoldings').mockResolvedValue([]);
      vi.spyOn(cashBalancesApi, 'listCashBalances').mockResolvedValue([]);

      renderPage();

      // Acotado a la tarjeta "Total": desde spec 029 la tarjeta "💰 Dividendos cobrados" también
      // muestra "0,00 €" sin dividendos, así que `findByText` sin acotar encontraría dos coincidencias.
      await waitFor(() => expect(document.getElementById('wealth-total-summary')).toBeInTheDocument());
      expect(within(document.getElementById('wealth-total-summary')!).getByText('0,00 €')).toBeInTheDocument();
    });

    it('una cuenta sin saldo, una acción/fondo/posición de cripto/vehículo/plan de pensiones/ubicación de efectivo sin valoración cuentan como 0 en el total', async () => {
      vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
      vi.spyOn(bankAccountsApi, 'listBankAccounts').mockResolvedValue([BANK_ACCOUNT]);
      vi.spyOn(bankAccountBalancesApi, 'listBankAccountBalances').mockResolvedValue([]);
      vi.spyOn(stocksApi, 'listStocks').mockResolvedValue([STOCK]);
      vi.spyOn(stockPurchasesApi, 'listStockPurchases').mockResolvedValue([STOCK_PURCHASE]);
      vi.spyOn(stockValuationsApi, 'listStockValuations').mockResolvedValue([]);
      vi.spyOn(stockDividendsApi, 'listStockDividends').mockResolvedValue([]);
      vi.spyOn(fundsApi, 'listFunds').mockResolvedValue([FUND]);
      vi.spyOn(fundPurchasesApi, 'listFundPurchases').mockResolvedValue([FUND_PURCHASE]);
      vi.spyOn(fundValuationsApi, 'listFundValuations').mockResolvedValue([]);
      vi.spyOn(fundDividendsApi, 'listFundDividends').mockResolvedValue([]);
      vi.spyOn(cryptosApi, 'listCryptos').mockResolvedValue([CRYPTO]);
      vi.spyOn(cryptoPurchasesApi, 'listCryptoPurchases').mockResolvedValue([CRYPTO_PURCHASE]);
      vi.spyOn(cryptoValuationsApi, 'listCryptoValuations').mockResolvedValue([]);
      vi.spyOn(vehiclesApi, 'listVehicles').mockResolvedValue([VEHICLE]);
      vi.spyOn(vehicleValuationsApi, 'listVehicleValuations').mockResolvedValue([]);
      vi.spyOn(pensionPlansApi, 'listPensionPlans').mockResolvedValue([PENSION_PLAN]);
      vi.spyOn(pensionPlanContributionsApi, 'listPensionPlanContributions').mockResolvedValue([PENSION_PLAN_CONTRIBUTION]);
      vi.spyOn(pensionPlanValuationsApi, 'listPensionPlanValuations').mockResolvedValue([]);
      vi.spyOn(cashHoldingsApi, 'listCashHoldings').mockResolvedValue([CASH_HOLDING]);
      vi.spyOn(cashBalancesApi, 'listCashBalances').mockResolvedValue([]);

      renderPage();

      expect(
        await screen.findByText(
          'Cuentas Bancarias: 0,00 € · Acciones: 0,00 € · Fondos Inversión: 0,00 € · Cripto: 0,00 € · Vehículos: 0,00 € · Fondo Pensiones: 0,00 € · Efectivo: 0,00 €',
        ),
      ).toBeInTheDocument();
    });
  });

  describe('Cuentas Bancarias (spec 019)', () => {
    function mockOtherApis() {
      vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
      vi.spyOn(stocksApi, 'listStocks').mockResolvedValue([]);
      vi.spyOn(stockPurchasesApi, 'listStockPurchases').mockResolvedValue([]);
      vi.spyOn(stockValuationsApi, 'listStockValuations').mockResolvedValue([]);
      vi.spyOn(stockDividendsApi, 'listStockDividends').mockResolvedValue([]);
      vi.spyOn(fundsApi, 'listFunds').mockResolvedValue([]);
      vi.spyOn(fundPurchasesApi, 'listFundPurchases').mockResolvedValue([]);
      vi.spyOn(fundValuationsApi, 'listFundValuations').mockResolvedValue([]);
      vi.spyOn(fundDividendsApi, 'listFundDividends').mockResolvedValue([]);
      vi.spyOn(cryptosApi, 'listCryptos').mockResolvedValue([]);
      vi.spyOn(cryptoPurchasesApi, 'listCryptoPurchases').mockResolvedValue([]);
      vi.spyOn(cryptoValuationsApi, 'listCryptoValuations').mockResolvedValue([]);
      vi.spyOn(vehiclesApi, 'listVehicles').mockResolvedValue([]);
      vi.spyOn(vehicleValuationsApi, 'listVehicleValuations').mockResolvedValue([]);
      vi.spyOn(pensionPlansApi, 'listPensionPlans').mockResolvedValue([]);
      vi.spyOn(pensionPlanContributionsApi, 'listPensionPlanContributions').mockResolvedValue([]);
      vi.spyOn(pensionPlanValuationsApi, 'listPensionPlanValuations').mockResolvedValue([]);
      vi.spyOn(cashHoldingsApi, 'listCashHoldings').mockResolvedValue([]);
      vi.spyOn(cashBalancesApi, 'listCashBalances').mockResolvedValue([]);
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

      await waitFor(() => expect(createSpy).toHaveBeenCalledWith({ bank: 'BBVA', accountNumber: 'ES1234', alias: '' }));
      await waitFor(() => expect(listSpy).toHaveBeenCalledTimes(2));
    });

    it('crea una cuenta con alias', async () => {
      mockOtherApis();
      vi.spyOn(bankAccountsApi, 'listBankAccounts').mockResolvedValue([]);
      vi.spyOn(bankAccountBalancesApi, 'listBankAccountBalances').mockResolvedValue([]);
      const createSpy = vi.spyOn(bankAccountsApi, 'createBankAccount').mockResolvedValue({ ...BANK_ACCOUNT, alias: 'Nómina' });

      renderPage();
      const form = await screen.findByRole('form', { name: 'Añadir cuenta bancaria' });

      await userEvent.type(within(form).getByLabelText('Banco'), 'BBVA');
      await userEvent.type(within(form).getByLabelText('Número de Cuenta'), 'ES1234');
      await userEvent.type(within(form).getByLabelText('Alias'), 'Nómina');
      await userEvent.click(within(form).getByRole('button', { name: 'Añadir cuenta' }));

      await waitFor(() =>
        expect(createSpy).toHaveBeenCalledWith({ bank: 'BBVA', accountNumber: 'ES1234', alias: 'Nómina' }),
      );
    });

    it('muestra el alias en la lista cuando la cuenta lo tiene', async () => {
      mockOtherApis();
      vi.spyOn(bankAccountsApi, 'listBankAccounts').mockResolvedValue([{ ...BANK_ACCOUNT, alias: 'Nómina' }]);
      vi.spyOn(bankAccountBalancesApi, 'listBankAccountBalances').mockResolvedValue([]);

      renderPage();
      const list = await screen.findByRole('list', { name: 'Tus cuentas bancarias' });

      expect(within(list).getByText('Nómina')).toBeInTheDocument();
      expect(within(list).getByText('BBVA · ES1234')).toBeInTheDocument();
    });

    it('edita una cuenta existente', async () => {
      mockOtherApis();
      vi.spyOn(bankAccountsApi, 'listBankAccounts').mockResolvedValue([BANK_ACCOUNT]);
      vi.spyOn(bankAccountBalancesApi, 'listBankAccountBalances').mockResolvedValue([]);
      const updateSpy = vi.spyOn(bankAccountsApi, 'updateBankAccount').mockResolvedValue(BANK_ACCOUNT);

      renderPage();
      await screen.findByRole('list', { name: 'Tus cuentas bancarias' });

      await userEvent.click(screen.getByRole('button', { name: 'Editar cuenta: BBVA · ES1234' }));
      const editForm = screen.getByRole('form', { name: 'Editar cuenta: BBVA · ES1234' });
      const bankInput = within(editForm).getByLabelText('Banco');
      await userEvent.clear(bankInput);
      await userEvent.type(bankInput, 'Santander');
      await userEvent.click(within(editForm).getByRole('button', { name: 'Guardar' }));

      await waitFor(() =>
        expect(updateSpy).toHaveBeenCalledWith(BANK_ACCOUNT.id, { bank: 'Santander', accountNumber: 'ES1234', alias: '' }),
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
      const form = await screen.findByRole('form', { name: 'Añadir saldo: BBVA · ES1234' });

      expect(within(form).getByLabelText('Fecha')).toHaveValue(todayIso());
    });

    it('añade un saldo a una cuenta existente', async () => {
      mockOtherApis();
      vi.spyOn(bankAccountsApi, 'listBankAccounts').mockResolvedValue([BANK_ACCOUNT]);
      const listBalancesSpy = vi.spyOn(bankAccountBalancesApi, 'listBankAccountBalances').mockResolvedValue([]);
      const createSpy = vi.spyOn(bankAccountBalancesApi, 'createBankAccountBalance').mockResolvedValue(BANK_BALANCE);

      renderPage();
      const form = await screen.findByRole('form', { name: 'Añadir saldo: BBVA · ES1234' });

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
      vi.spyOn(fundsApi, 'listFunds').mockResolvedValue([]);
      vi.spyOn(fundPurchasesApi, 'listFundPurchases').mockResolvedValue([]);
      vi.spyOn(fundValuationsApi, 'listFundValuations').mockResolvedValue([]);
      vi.spyOn(fundDividendsApi, 'listFundDividends').mockResolvedValue([]);
      vi.spyOn(cryptosApi, 'listCryptos').mockResolvedValue([]);
      vi.spyOn(cryptoPurchasesApi, 'listCryptoPurchases').mockResolvedValue([]);
      vi.spyOn(cryptoValuationsApi, 'listCryptoValuations').mockResolvedValue([]);
      vi.spyOn(vehiclesApi, 'listVehicles').mockResolvedValue([]);
      vi.spyOn(vehicleValuationsApi, 'listVehicleValuations').mockResolvedValue([]);
      vi.spyOn(pensionPlansApi, 'listPensionPlans').mockResolvedValue([]);
      vi.spyOn(pensionPlanContributionsApi, 'listPensionPlanContributions').mockResolvedValue([]);
      vi.spyOn(pensionPlanValuationsApi, 'listPensionPlanValuations').mockResolvedValue([]);
      vi.spyOn(cashHoldingsApi, 'listCashHoldings').mockResolvedValue([]);
      vi.spyOn(cashBalancesApi, 'listCashBalances').mockResolvedValue([]);
    }

    it('sin ninguna acción, muestra el aviso de "todavía no tienes nada"', async () => {
      mockOtherApis();
      vi.spyOn(stocksApi, 'listStocks').mockResolvedValue([]);
      vi.spyOn(stockPurchasesApi, 'listStockPurchases').mockResolvedValue([]);
      vi.spyOn(stockValuationsApi, 'listStockValuations').mockResolvedValue([]);
      vi.spyOn(stockDividendsApi, 'listStockDividends').mockResolvedValue([]);

      renderPage();

      expect(await screen.findByText('Todavía no tienes ninguna acción.')).toBeInTheDocument();
    });

    it('lista una acción existente, con sus totales y el valor actual calculado (precio por acción × nº de acciones)', async () => {
      mockOtherApis();
      vi.spyOn(stocksApi, 'listStocks').mockResolvedValue([STOCK]);
      vi.spyOn(stockPurchasesApi, 'listStockPurchases').mockResolvedValue([STOCK_PURCHASE]);
      vi.spyOn(stockValuationsApi, 'listStockValuations').mockResolvedValue([STOCK_VALUATION]);
      vi.spyOn(stockDividendsApi, 'listStockDividends').mockResolvedValue([]);

      renderPage();

      const list = await screen.findByRole('list', { name: 'Tus acciones' });
      expect(within(list).getByText(/Inditex · BBVA/)).toBeInTheDocument();
      // 10.0000 acciones × 35,00 €/acción (STOCK_VALUATION) = 350,00 €.
      expect(within(list).getByText('350,00 €')).toBeInTheDocument();
      expect(within(list).getByText(/10.00000000 acciones · Coste total/)).toHaveTextContent('Precio actual: 35,00 €/acción · Última fecha: 2026-09-04');
      // Coste total 300,00 € (10 × 30,00 €), valor actual 350,00 € → +16.67% de ganancia, en verde.
      const gainLossEl = within(list).getByText('+16.67%');
      expect(gainLossEl).toHaveStyle({ color: 'var(--status-green)' });

      const purchaseHistory = within(list).getByRole('list', { name: 'Historial de compras de Inditex · BBVA' });
      expect(within(purchaseHistory).getByText(/10.0000 acciones @/)).toBeInTheDocument();

      const valuationHistory = within(list).getByRole('list', { name: 'Historial de valoraciones de Inditex · BBVA' });
      expect(within(valuationHistory).getByText('2026-09-04')).toBeInTheDocument();
      expect(within(valuationHistory).getByText('35,00 €/acción')).toBeInTheDocument();
    });

    it('con pérdidas, el % se muestra en rojo', async () => {
      mockOtherApis();
      vi.spyOn(stocksApi, 'listStocks').mockResolvedValue([STOCK]);
      vi.spyOn(stockPurchasesApi, 'listStockPurchases').mockResolvedValue([STOCK_PURCHASE]);
      vi.spyOn(stockValuationsApi, 'listStockValuations').mockResolvedValue([{ ...STOCK_VALUATION, pricePerShare: '24.00' }]);
      vi.spyOn(stockDividendsApi, 'listStockDividends').mockResolvedValue([]);

      renderPage();

      const list = await screen.findByRole('list', { name: 'Tus acciones' });
      // Coste total 300,00 € (10 × 30,00 €), valor actual 240,00 € (10 × 24,00 €) → -20.00%, en rojo.
      const gainLossEl = within(list).getByText('-20.00%');
      expect(gainLossEl).toHaveStyle({ color: 'var(--status-red)' });
    });

    it('sin ninguna compra, no muestra % de ganancia/pérdida aunque haya valoración', async () => {
      mockOtherApis();
      vi.spyOn(stocksApi, 'listStocks').mockResolvedValue([STOCK]);
      vi.spyOn(stockPurchasesApi, 'listStockPurchases').mockResolvedValue([]);
      vi.spyOn(stockValuationsApi, 'listStockValuations').mockResolvedValue([STOCK_VALUATION]);
      vi.spyOn(stockDividendsApi, 'listStockDividends').mockResolvedValue([]);

      renderPage();

      const list = await screen.findByRole('list', { name: 'Tus acciones' });
      await within(list).findByText(/Inditex · BBVA/);
      expect(within(list).queryByText(/%$/)).not.toBeInTheDocument();
    });

    it('una acción sin ninguna valoración muestra "Sin valoración"', async () => {
      mockOtherApis();
      vi.spyOn(stocksApi, 'listStocks').mockResolvedValue([STOCK]);
      vi.spyOn(stockPurchasesApi, 'listStockPurchases').mockResolvedValue([]);
      vi.spyOn(stockValuationsApi, 'listStockValuations').mockResolvedValue([]);
      vi.spyOn(stockDividendsApi, 'listStockDividends').mockResolvedValue([]);

      renderPage();

      const list = await screen.findByRole('list', { name: 'Tus acciones' });
      expect(within(list).getByText('Sin valoración')).toBeInTheDocument();
      expect(within(list).getByText('Todavía no hay ninguna compra registrada en esta acción.')).toBeInTheDocument();
      expect(within(list).getByText('Todavía no hay ninguna valoración registrada en esta acción.')).toBeInTheDocument();
    });

    it('el formulario de alta trae la fecha de hoy por defecto y calcula el valor de compra', async () => {
      mockOtherApis();
      vi.spyOn(stocksApi, 'listStocks').mockResolvedValue([]);
      vi.spyOn(stockPurchasesApi, 'listStockPurchases').mockResolvedValue([]);
      vi.spyOn(stockValuationsApi, 'listStockValuations').mockResolvedValue([]);
      vi.spyOn(stockDividendsApi, 'listStockDividends').mockResolvedValue([]);

      renderPage();
      const form = await screen.findByRole('form', { name: 'Añadir acción' });

      expect(within(form).getByLabelText('Fecha de compra')).toHaveValue(todayIso());

      await userEvent.type(within(form).getByLabelText('Número acciones'), '4');
      await userEvent.type(within(form).getByLabelText('Precio compra'), '10.50');

      expect(within(form).getByText(/Valor compra:/)).toHaveTextContent('42,00');
    });

    it('crea una acción y su primera compra desde el formulario de alta, en un solo paso', async () => {
      mockOtherApis();
      const listStocksSpy = vi.spyOn(stocksApi, 'listStocks').mockResolvedValue([]);
      const listPurchasesSpy = vi.spyOn(stockPurchasesApi, 'listStockPurchases').mockResolvedValue([]);
      vi.spyOn(stockValuationsApi, 'listStockValuations').mockResolvedValue([]);
      vi.spyOn(stockDividendsApi, 'listStockDividends').mockResolvedValue([]);
      const createStockSpy = vi.spyOn(stocksApi, 'createStock').mockResolvedValue(STOCK);
      const createPurchaseSpy = vi.spyOn(stockPurchasesApi, 'createStockPurchase').mockResolvedValue(STOCK_PURCHASE);

      renderPage();
      const form = await screen.findByRole('form', { name: 'Añadir acción' });

      await userEvent.type(within(form).getByLabelText('Banco Custodia'), 'BBVA');
      await userEvent.type(within(form).getByLabelText('Acción'), 'Inditex');
      await userEvent.type(within(form).getByLabelText('Número acciones'), '10');
      await userEvent.type(within(form).getByLabelText('Precio compra'), '30.00');
      await userEvent.click(within(form).getByRole('button', { name: 'Añadir acción' }));

      await waitFor(() => expect(createStockSpy).toHaveBeenCalledWith({ custodyBank: 'BBVA', stock: 'Inditex' }));
      await waitFor(() =>
        expect(createPurchaseSpy).toHaveBeenCalledWith({
          stockId: STOCK.id,
          shareCount: '10',
          purchasePrice: '30.00',
          date: todayIso(),
        }),
      );
      await waitFor(() => expect(listStocksSpy).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(listPurchasesSpy).toHaveBeenCalledTimes(2));
    });

    it('edita una acción existente', async () => {
      mockOtherApis();
      vi.spyOn(stocksApi, 'listStocks').mockResolvedValue([STOCK]);
      vi.spyOn(stockPurchasesApi, 'listStockPurchases').mockResolvedValue([]);
      vi.spyOn(stockValuationsApi, 'listStockValuations').mockResolvedValue([]);
      vi.spyOn(stockDividendsApi, 'listStockDividends').mockResolvedValue([]);
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
      vi.spyOn(stockDividendsApi, 'listStockDividends').mockResolvedValue([]);
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
      vi.spyOn(stockDividendsApi, 'listStockDividends').mockResolvedValue([]);

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
      vi.spyOn(stockDividendsApi, 'listStockDividends').mockResolvedValue([]);
      const createSpy = vi.spyOn(stockPurchasesApi, 'createStockPurchase').mockResolvedValue(STOCK_PURCHASE);

      renderPage();
      const form = await screen.findByRole('form', { name: 'Añadir compra: Inditex' });

      await userEvent.type(within(form).getByLabelText('Número acciones'), '10');
      await userEvent.type(within(form).getByLabelText('Precio compra'), '30.00');
      await userEvent.click(within(form).getByRole('button', { name: 'Añadir compra' }));

      await waitFor(() =>
        expect(createSpy).toHaveBeenCalledWith({ stockId: STOCK.id, shareCount: '10', purchasePrice: '30.00', date: todayIso() }),
      );
      await waitFor(() => expect(listPurchasesSpy).toHaveBeenCalledTimes(2));
    });

    it('admite hasta 8 decimales en número de acciones y precio de compra (revisión)', async () => {
      mockOtherApis();
      vi.spyOn(stocksApi, 'listStocks').mockResolvedValue([STOCK]);
      vi.spyOn(stockPurchasesApi, 'listStockPurchases').mockResolvedValue([]);
      vi.spyOn(stockValuationsApi, 'listStockValuations').mockResolvedValue([]);
      vi.spyOn(stockDividendsApi, 'listStockDividends').mockResolvedValue([]);
      const createSpy = vi.spyOn(stockPurchasesApi, 'createStockPurchase').mockResolvedValue(STOCK_PURCHASE);

      renderPage();
      const form = await screen.findByRole('form', { name: 'Añadir compra: Inditex' });

      await userEvent.type(within(form).getByLabelText('Número acciones'), '0.12345678');
      await userEvent.type(within(form).getByLabelText('Precio compra'), '28123.87654321');
      await userEvent.click(within(form).getByRole('button', { name: 'Añadir compra' }));

      await waitFor(() =>
        expect(createSpy).toHaveBeenCalledWith({
          stockId: STOCK.id,
          shareCount: '0.12345678',
          purchasePrice: '28123.87654321',
          date: todayIso(),
        }),
      );
    });

    it('edita una compra del historial', async () => {
      mockOtherApis();
      vi.spyOn(stocksApi, 'listStocks').mockResolvedValue([STOCK]);
      vi.spyOn(stockPurchasesApi, 'listStockPurchases').mockResolvedValue([STOCK_PURCHASE]);
      vi.spyOn(stockValuationsApi, 'listStockValuations').mockResolvedValue([]);
      vi.spyOn(stockDividendsApi, 'listStockDividends').mockResolvedValue([]);
      const updateSpy = vi.spyOn(stockPurchasesApi, 'updateStockPurchase').mockResolvedValue(STOCK_PURCHASE);

      renderPage();
      await screen.findByRole('list', { name: 'Tus acciones' });

      const purchaseLabel = 'Editar compra de Inditex: 2026-09-04 · 10.0000 acciones a 30.00€';
      await userEvent.click(screen.getByRole('button', { name: purchaseLabel }));
      const editForm = screen.getByRole('form', { name: purchaseLabel });
      const shareCountInput = within(editForm).getByLabelText('Número acciones');
      await userEvent.clear(shareCountInput);
      await userEvent.type(shareCountInput, '15');
      await userEvent.click(within(editForm).getByRole('button', { name: 'Guardar' }));

      await waitFor(() =>
        expect(updateSpy).toHaveBeenCalledWith(STOCK_PURCHASE.id, { shareCount: '15', purchasePrice: '30.00', date: '2026-09-04' }),
      );
    });

    it('elimina una compra del historial, sin borrar la acción', async () => {
      mockOtherApis();
      vi.spyOn(stocksApi, 'listStocks').mockResolvedValue([STOCK]);
      vi.spyOn(stockPurchasesApi, 'listStockPurchases').mockResolvedValue([STOCK_PURCHASE]);
      vi.spyOn(stockValuationsApi, 'listStockValuations').mockResolvedValue([]);
      vi.spyOn(stockDividendsApi, 'listStockDividends').mockResolvedValue([]);
      const deletePurchaseSpy = vi.spyOn(stockPurchasesApi, 'deleteStockPurchase').mockResolvedValue(undefined);
      const deleteStockSpy = vi.spyOn(stocksApi, 'deleteStock');

      renderPage();
      await screen.findByRole('list', { name: 'Tus acciones' });

      await userEvent.click(screen.getByRole('button', { name: 'Eliminar compra de Inditex: 2026-09-04 · 10.0000 acciones a 30.00€' }));

      await waitFor(() => expect(deletePurchaseSpy).toHaveBeenCalledWith(STOCK_PURCHASE.id));
      expect(deleteStockSpy).not.toHaveBeenCalled();
    });

    it('el formulario de valoración de una acción trae la fecha de hoy por defecto', async () => {
      mockOtherApis();
      vi.spyOn(stocksApi, 'listStocks').mockResolvedValue([STOCK]);
      vi.spyOn(stockPurchasesApi, 'listStockPurchases').mockResolvedValue([]);
      vi.spyOn(stockValuationsApi, 'listStockValuations').mockResolvedValue([]);
      vi.spyOn(stockDividendsApi, 'listStockDividends').mockResolvedValue([]);

      renderPage();
      const form = await screen.findByRole('form', { name: 'Añadir valoración: Inditex' });

      expect(within(form).getByLabelText('Fecha')).toHaveValue(todayIso());
    });

    it('añade una valoración a una acción existente', async () => {
      mockOtherApis();
      vi.spyOn(stocksApi, 'listStocks').mockResolvedValue([STOCK]);
      vi.spyOn(stockPurchasesApi, 'listStockPurchases').mockResolvedValue([]);
      const listValuationsSpy = vi.spyOn(stockValuationsApi, 'listStockValuations').mockResolvedValue([]);
      vi.spyOn(stockDividendsApi, 'listStockDividends').mockResolvedValue([]);
      const createSpy = vi.spyOn(stockValuationsApi, 'createStockValuation').mockResolvedValue(STOCK_VALUATION);

      renderPage();
      const form = await screen.findByRole('form', { name: 'Añadir valoración: Inditex' });

      await userEvent.type(within(form).getByLabelText('Precio por acción actual'), '35.00');
      await userEvent.click(within(form).getByRole('button', { name: 'Añadir valoración' }));

      await waitFor(() =>
        expect(createSpy).toHaveBeenCalledWith({ stockId: STOCK.id, pricePerShare: '35.00', date: todayIso() }),
      );
      await waitFor(() => expect(listValuationsSpy).toHaveBeenCalledTimes(2));
    });

    it('el formulario de valoración calcula el valor total (precio por acción × nº de acciones ya compradas)', async () => {
      mockOtherApis();
      vi.spyOn(stocksApi, 'listStocks').mockResolvedValue([STOCK]);
      vi.spyOn(stockPurchasesApi, 'listStockPurchases').mockResolvedValue([STOCK_PURCHASE]);
      vi.spyOn(stockValuationsApi, 'listStockValuations').mockResolvedValue([]);
      vi.spyOn(stockDividendsApi, 'listStockDividends').mockResolvedValue([]);

      renderPage();
      const form = await screen.findByRole('form', { name: 'Añadir valoración: Inditex' });

      await userEvent.type(within(form).getByLabelText('Precio por acción actual'), '35.00');

      // 10 acciones (STOCK_PURCHASE) × 35.00 = 350,00 €.
      expect(within(form).getByText(/Valor total:/)).toHaveTextContent('350,00');
    });

    it('edita una valoración del historial', async () => {
      mockOtherApis();
      vi.spyOn(stocksApi, 'listStocks').mockResolvedValue([STOCK]);
      vi.spyOn(stockPurchasesApi, 'listStockPurchases').mockResolvedValue([]);
      vi.spyOn(stockValuationsApi, 'listStockValuations').mockResolvedValue([STOCK_VALUATION]);
      vi.spyOn(stockDividendsApi, 'listStockDividends').mockResolvedValue([]);
      const updateSpy = vi.spyOn(stockValuationsApi, 'updateStockValuation').mockResolvedValue(STOCK_VALUATION);

      renderPage();
      await screen.findByRole('list', { name: 'Tus acciones' });

      await userEvent.click(screen.getByRole('button', { name: 'Editar valoración de Inditex del 2026-09-04' }));
      const editForm = screen.getByRole('form', { name: 'Editar valoración de Inditex del 2026-09-04' });
      const valuationInput = within(editForm).getByLabelText('Precio por acción actual');
      await userEvent.clear(valuationInput);
      await userEvent.type(valuationInput, '40.00');
      await userEvent.click(within(editForm).getByRole('button', { name: 'Guardar' }));

      await waitFor(() =>
        expect(updateSpy).toHaveBeenCalledWith(STOCK_VALUATION.id, { pricePerShare: '40.00', date: '2026-09-04' }),
      );
    });

    it('elimina una valoración del historial, sin borrar la acción', async () => {
      mockOtherApis();
      vi.spyOn(stocksApi, 'listStocks').mockResolvedValue([STOCK]);
      vi.spyOn(stockPurchasesApi, 'listStockPurchases').mockResolvedValue([]);
      vi.spyOn(stockValuationsApi, 'listStockValuations').mockResolvedValue([STOCK_VALUATION]);
      vi.spyOn(stockDividendsApi, 'listStockDividends').mockResolvedValue([]);
      const deleteValuationSpy = vi.spyOn(stockValuationsApi, 'deleteStockValuation').mockResolvedValue(undefined);
      const deleteStockSpy = vi.spyOn(stocksApi, 'deleteStock');

      renderPage();
      await screen.findByRole('list', { name: 'Tus acciones' });

      await userEvent.click(screen.getByRole('button', { name: 'Eliminar valoración de Inditex del 2026-09-04' }));

      await waitFor(() => expect(deleteValuationSpy).toHaveBeenCalledWith(STOCK_VALUATION.id));
      expect(deleteStockSpy).not.toHaveBeenCalled();
    });
  });

  describe('Fondos Inversión (spec 021)', () => {
    function mockOtherApis() {
      vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
      vi.spyOn(bankAccountsApi, 'listBankAccounts').mockResolvedValue([]);
      vi.spyOn(bankAccountBalancesApi, 'listBankAccountBalances').mockResolvedValue([]);
      vi.spyOn(stocksApi, 'listStocks').mockResolvedValue([]);
      vi.spyOn(stockPurchasesApi, 'listStockPurchases').mockResolvedValue([]);
      vi.spyOn(stockValuationsApi, 'listStockValuations').mockResolvedValue([]);
      vi.spyOn(stockDividendsApi, 'listStockDividends').mockResolvedValue([]);
      vi.spyOn(cryptosApi, 'listCryptos').mockResolvedValue([]);
      vi.spyOn(cryptoPurchasesApi, 'listCryptoPurchases').mockResolvedValue([]);
      vi.spyOn(cryptoValuationsApi, 'listCryptoValuations').mockResolvedValue([]);
      vi.spyOn(vehiclesApi, 'listVehicles').mockResolvedValue([]);
      vi.spyOn(vehicleValuationsApi, 'listVehicleValuations').mockResolvedValue([]);
      vi.spyOn(pensionPlansApi, 'listPensionPlans').mockResolvedValue([]);
      vi.spyOn(pensionPlanContributionsApi, 'listPensionPlanContributions').mockResolvedValue([]);
      vi.spyOn(pensionPlanValuationsApi, 'listPensionPlanValuations').mockResolvedValue([]);
      vi.spyOn(cashHoldingsApi, 'listCashHoldings').mockResolvedValue([]);
      vi.spyOn(cashBalancesApi, 'listCashBalances').mockResolvedValue([]);
    }

    it('sin ningún fondo, muestra el aviso de "todavía no tienes nada"', async () => {
      mockOtherApis();
      vi.spyOn(fundsApi, 'listFunds').mockResolvedValue([]);
      vi.spyOn(fundPurchasesApi, 'listFundPurchases').mockResolvedValue([]);
      vi.spyOn(fundValuationsApi, 'listFundValuations').mockResolvedValue([]);
      vi.spyOn(fundDividendsApi, 'listFundDividends').mockResolvedValue([]);

      renderPage();

      expect(await screen.findByText('Todavía no tienes ningún fondo de inversión.')).toBeInTheDocument();
    });

    it('lista un fondo existente, con sus totales y el valor actual calculado (precio por participación × nº de participaciones)', async () => {
      mockOtherApis();
      vi.spyOn(fundsApi, 'listFunds').mockResolvedValue([FUND]);
      vi.spyOn(fundPurchasesApi, 'listFundPurchases').mockResolvedValue([FUND_PURCHASE]);
      vi.spyOn(fundValuationsApi, 'listFundValuations').mockResolvedValue([FUND_VALUATION]);
      vi.spyOn(fundDividendsApi, 'listFundDividends').mockResolvedValue([]);

      renderPage();

      const list = await screen.findByRole('list', { name: 'Tus fondos de inversión' });
      expect(within(list).getByText(/Vanguard Global Stock Index · MyInvestor/)).toBeInTheDocument();
      // 10.0000 participaciones × 20,00 €/participación (FUND_VALUATION) = 200,00 €.
      expect(within(list).getByText('200,00 €')).toBeInTheDocument();
      expect(within(list).getByText(/10.00000000 participaciones · Coste total/)).toHaveTextContent(
        'Precio actual: 20,00 €/participación · Última fecha: 2026-09-04',
      );
      // Coste total 300,00 € (10 × 30,00 €), valor actual 200,00 € → -33.33% de pérdida, en rojo.
      const gainLossEl = within(list).getByText('-33.33%');
      expect(gainLossEl).toHaveStyle({ color: 'var(--status-red)' });

      const purchaseHistory = within(list).getByRole('list', { name: 'Historial de compras de Vanguard Global Stock Index · MyInvestor' });
      expect(within(purchaseHistory).getByText(/10.0000 participaciones @/)).toBeInTheDocument();

      const valuationHistory = within(list).getByRole('list', {
        name: 'Historial de valoraciones de Vanguard Global Stock Index · MyInvestor',
      });
      expect(within(valuationHistory).getByText('2026-09-04')).toBeInTheDocument();
      expect(within(valuationHistory).getByText('20,00 €/participación')).toBeInTheDocument();
    });

    it('con ganancias, el % se muestra en verde', async () => {
      mockOtherApis();
      vi.spyOn(fundsApi, 'listFunds').mockResolvedValue([FUND]);
      vi.spyOn(fundPurchasesApi, 'listFundPurchases').mockResolvedValue([FUND_PURCHASE]);
      vi.spyOn(fundValuationsApi, 'listFundValuations').mockResolvedValue([{ ...FUND_VALUATION, pricePerShare: '36.00' }]);
      vi.spyOn(fundDividendsApi, 'listFundDividends').mockResolvedValue([]);

      renderPage();

      const list = await screen.findByRole('list', { name: 'Tus fondos de inversión' });
      // Coste total 300,00 € (10 × 30,00 €), valor actual 360,00 € (10 × 36,00 €) → +20.00%, en verde.
      const gainLossEl = within(list).getByText('+20.00%');
      expect(gainLossEl).toHaveStyle({ color: 'var(--status-green)' });
    });

    it('sin ninguna compra, no muestra % de ganancia/pérdida aunque haya valoración', async () => {
      mockOtherApis();
      vi.spyOn(fundsApi, 'listFunds').mockResolvedValue([FUND]);
      vi.spyOn(fundPurchasesApi, 'listFundPurchases').mockResolvedValue([]);
      vi.spyOn(fundValuationsApi, 'listFundValuations').mockResolvedValue([FUND_VALUATION]);
      vi.spyOn(fundDividendsApi, 'listFundDividends').mockResolvedValue([]);

      renderPage();

      const list = await screen.findByRole('list', { name: 'Tus fondos de inversión' });
      await within(list).findByText(/Vanguard Global Stock Index · MyInvestor/);
      expect(within(list).queryByText(/%$/)).not.toBeInTheDocument();
    });

    it('un fondo sin ninguna valoración muestra "Sin valoración"', async () => {
      mockOtherApis();
      vi.spyOn(fundsApi, 'listFunds').mockResolvedValue([FUND]);
      vi.spyOn(fundPurchasesApi, 'listFundPurchases').mockResolvedValue([]);
      vi.spyOn(fundValuationsApi, 'listFundValuations').mockResolvedValue([]);
      vi.spyOn(fundDividendsApi, 'listFundDividends').mockResolvedValue([]);

      renderPage();

      const list = await screen.findByRole('list', { name: 'Tus fondos de inversión' });
      expect(within(list).getByText('Sin valoración')).toBeInTheDocument();
      expect(within(list).getByText('Todavía no hay ninguna compra registrada en este fondo.')).toBeInTheDocument();
      expect(within(list).getByText('Todavía no hay ninguna valoración registrada en este fondo.')).toBeInTheDocument();
    });

    it('el formulario de alta trae la fecha de hoy por defecto y calcula el valor de compra', async () => {
      mockOtherApis();
      vi.spyOn(fundsApi, 'listFunds').mockResolvedValue([]);
      vi.spyOn(fundPurchasesApi, 'listFundPurchases').mockResolvedValue([]);
      vi.spyOn(fundValuationsApi, 'listFundValuations').mockResolvedValue([]);
      vi.spyOn(fundDividendsApi, 'listFundDividends').mockResolvedValue([]);

      renderPage();
      const form = await screen.findByRole('form', { name: 'Añadir fondo' });

      expect(within(form).getByLabelText('Fecha de compra')).toHaveValue(todayIso());

      await userEvent.type(within(form).getByLabelText('Número de participaciones'), '4');
      await userEvent.type(within(form).getByLabelText('Precio compra'), '10.50');

      expect(within(form).getByText(/Valor compra:/)).toHaveTextContent('42,00');
    });

    it('crea un fondo y su primera compra desde el formulario de alta, en un solo paso', async () => {
      mockOtherApis();
      const listFundsSpy = vi.spyOn(fundsApi, 'listFunds').mockResolvedValue([]);
      const listPurchasesSpy = vi.spyOn(fundPurchasesApi, 'listFundPurchases').mockResolvedValue([]);
      vi.spyOn(fundValuationsApi, 'listFundValuations').mockResolvedValue([]);
      vi.spyOn(fundDividendsApi, 'listFundDividends').mockResolvedValue([]);
      const createFundSpy = vi.spyOn(fundsApi, 'createFund').mockResolvedValue(FUND);
      const createPurchaseSpy = vi.spyOn(fundPurchasesApi, 'createFundPurchase').mockResolvedValue(FUND_PURCHASE);

      renderPage();
      const form = await screen.findByRole('form', { name: 'Añadir fondo' });

      await userEvent.type(within(form).getByLabelText('Banco Custodia'), 'MyInvestor');
      await userEvent.type(within(form).getByLabelText('Fondo'), 'Vanguard Global Stock Index');
      await userEvent.type(within(form).getByLabelText('Número de participaciones'), '10');
      await userEvent.type(within(form).getByLabelText('Precio compra'), '30.00');
      await userEvent.click(within(form).getByRole('button', { name: 'Añadir fondo' }));

      await waitFor(() =>
        expect(createFundSpy).toHaveBeenCalledWith({ custodyBank: 'MyInvestor', fund: 'Vanguard Global Stock Index' }),
      );
      await waitFor(() =>
        expect(createPurchaseSpy).toHaveBeenCalledWith({
          fundId: FUND.id,
          shareCount: '10',
          purchasePrice: '30.00',
          date: todayIso(),
        }),
      );
      await waitFor(() => expect(listFundsSpy).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(listPurchasesSpy).toHaveBeenCalledTimes(2));
    });

    it('edita un fondo existente', async () => {
      mockOtherApis();
      vi.spyOn(fundsApi, 'listFunds').mockResolvedValue([FUND]);
      vi.spyOn(fundPurchasesApi, 'listFundPurchases').mockResolvedValue([]);
      vi.spyOn(fundValuationsApi, 'listFundValuations').mockResolvedValue([]);
      vi.spyOn(fundDividendsApi, 'listFundDividends').mockResolvedValue([]);
      const updateSpy = vi.spyOn(fundsApi, 'updateFund').mockResolvedValue(FUND);

      renderPage();
      await screen.findByRole('list', { name: 'Tus fondos de inversión' });

      await userEvent.click(screen.getByRole('button', { name: 'Editar fondo: Vanguard Global Stock Index · MyInvestor' }));
      const editForm = screen.getByRole('form', { name: 'Editar fondo: Vanguard Global Stock Index' });
      const fundInput = within(editForm).getByLabelText('Fondo');
      await userEvent.clear(fundInput);
      await userEvent.type(fundInput, 'MSCI World');
      await userEvent.click(within(editForm).getByRole('button', { name: 'Guardar' }));

      await waitFor(() => expect(updateSpy).toHaveBeenCalledWith(FUND.id, { custodyBank: 'MyInvestor', fund: 'MSCI World' }));
    });

    it('elimina un fondo, junto con su historial', async () => {
      mockOtherApis();
      vi.spyOn(fundsApi, 'listFunds').mockResolvedValue([FUND]);
      vi.spyOn(fundPurchasesApi, 'listFundPurchases').mockResolvedValue([FUND_PURCHASE]);
      vi.spyOn(fundValuationsApi, 'listFundValuations').mockResolvedValue([FUND_VALUATION]);
      vi.spyOn(fundDividendsApi, 'listFundDividends').mockResolvedValue([]);
      const deleteSpy = vi.spyOn(fundsApi, 'deleteFund').mockResolvedValue(undefined);

      renderPage();
      await screen.findByRole('list', { name: 'Tus fondos de inversión' });

      await userEvent.click(screen.getByRole('button', { name: 'Eliminar fondo: Vanguard Global Stock Index · MyInvestor' }));

      await waitFor(() => expect(deleteSpy).toHaveBeenCalledWith(FUND.id));
    });

    it('el formulario de compra de un fondo calcula el valor de compra al escribir precio y número de participaciones', async () => {
      mockOtherApis();
      vi.spyOn(fundsApi, 'listFunds').mockResolvedValue([FUND]);
      vi.spyOn(fundPurchasesApi, 'listFundPurchases').mockResolvedValue([]);
      vi.spyOn(fundValuationsApi, 'listFundValuations').mockResolvedValue([]);
      vi.spyOn(fundDividendsApi, 'listFundDividends').mockResolvedValue([]);

      renderPage();
      const form = await screen.findByRole('form', { name: 'Añadir compra: Vanguard Global Stock Index' });

      await userEvent.type(within(form).getByLabelText('Número de participaciones'), '4');
      await userEvent.type(within(form).getByLabelText('Precio compra'), '10.50');

      expect(within(form).getByText(/Valor compra:/)).toHaveTextContent('42,00');
    });

    it('añade una compra a un fondo existente', async () => {
      mockOtherApis();
      vi.spyOn(fundsApi, 'listFunds').mockResolvedValue([FUND]);
      const listPurchasesSpy = vi.spyOn(fundPurchasesApi, 'listFundPurchases').mockResolvedValue([]);
      vi.spyOn(fundValuationsApi, 'listFundValuations').mockResolvedValue([]);
      vi.spyOn(fundDividendsApi, 'listFundDividends').mockResolvedValue([]);
      const createSpy = vi.spyOn(fundPurchasesApi, 'createFundPurchase').mockResolvedValue(FUND_PURCHASE);

      renderPage();
      const form = await screen.findByRole('form', { name: 'Añadir compra: Vanguard Global Stock Index' });

      await userEvent.type(within(form).getByLabelText('Número de participaciones'), '10');
      await userEvent.type(within(form).getByLabelText('Precio compra'), '30.00');
      await userEvent.click(within(form).getByRole('button', { name: 'Añadir compra' }));

      await waitFor(() =>
        expect(createSpy).toHaveBeenCalledWith({ fundId: FUND.id, shareCount: '10', purchasePrice: '30.00', date: todayIso() }),
      );
      await waitFor(() => expect(listPurchasesSpy).toHaveBeenCalledTimes(2));
    });

    it('admite hasta 8 decimales en número de participaciones y precio de compra', async () => {
      mockOtherApis();
      vi.spyOn(fundsApi, 'listFunds').mockResolvedValue([FUND]);
      vi.spyOn(fundPurchasesApi, 'listFundPurchases').mockResolvedValue([]);
      vi.spyOn(fundValuationsApi, 'listFundValuations').mockResolvedValue([]);
      vi.spyOn(fundDividendsApi, 'listFundDividends').mockResolvedValue([]);
      const createSpy = vi.spyOn(fundPurchasesApi, 'createFundPurchase').mockResolvedValue(FUND_PURCHASE);

      renderPage();
      const form = await screen.findByRole('form', { name: 'Añadir compra: Vanguard Global Stock Index' });

      await userEvent.type(within(form).getByLabelText('Número de participaciones'), '0.12345678');
      await userEvent.type(within(form).getByLabelText('Precio compra'), '28123.87654321');
      await userEvent.click(within(form).getByRole('button', { name: 'Añadir compra' }));

      await waitFor(() =>
        expect(createSpy).toHaveBeenCalledWith({
          fundId: FUND.id,
          shareCount: '0.12345678',
          purchasePrice: '28123.87654321',
          date: todayIso(),
        }),
      );
    });

    it('edita una compra del historial', async () => {
      mockOtherApis();
      vi.spyOn(fundsApi, 'listFunds').mockResolvedValue([FUND]);
      vi.spyOn(fundPurchasesApi, 'listFundPurchases').mockResolvedValue([FUND_PURCHASE]);
      vi.spyOn(fundValuationsApi, 'listFundValuations').mockResolvedValue([]);
      vi.spyOn(fundDividendsApi, 'listFundDividends').mockResolvedValue([]);
      const updateSpy = vi.spyOn(fundPurchasesApi, 'updateFundPurchase').mockResolvedValue(FUND_PURCHASE);

      renderPage();
      await screen.findByRole('list', { name: 'Tus fondos de inversión' });

      const purchaseLabel = 'Editar compra de Vanguard Global Stock Index: 2026-09-04 · 10.0000 participaciones a 30.00€';
      await userEvent.click(screen.getByRole('button', { name: purchaseLabel }));
      const editForm = screen.getByRole('form', { name: purchaseLabel });
      const shareCountInput = within(editForm).getByLabelText('Número de participaciones');
      await userEvent.clear(shareCountInput);
      await userEvent.type(shareCountInput, '15');
      await userEvent.click(within(editForm).getByRole('button', { name: 'Guardar' }));

      await waitFor(() =>
        expect(updateSpy).toHaveBeenCalledWith(FUND_PURCHASE.id, { shareCount: '15', purchasePrice: '30.00', date: '2026-09-04' }),
      );
    });

    it('elimina una compra del historial, sin borrar el fondo', async () => {
      mockOtherApis();
      vi.spyOn(fundsApi, 'listFunds').mockResolvedValue([FUND]);
      vi.spyOn(fundPurchasesApi, 'listFundPurchases').mockResolvedValue([FUND_PURCHASE]);
      vi.spyOn(fundValuationsApi, 'listFundValuations').mockResolvedValue([]);
      vi.spyOn(fundDividendsApi, 'listFundDividends').mockResolvedValue([]);
      const deletePurchaseSpy = vi.spyOn(fundPurchasesApi, 'deleteFundPurchase').mockResolvedValue(undefined);
      const deleteFundSpy = vi.spyOn(fundsApi, 'deleteFund');

      renderPage();
      await screen.findByRole('list', { name: 'Tus fondos de inversión' });

      await userEvent.click(
        screen.getByRole('button', { name: 'Eliminar compra de Vanguard Global Stock Index: 2026-09-04 · 10.0000 participaciones a 30.00€' }),
      );

      await waitFor(() => expect(deletePurchaseSpy).toHaveBeenCalledWith(FUND_PURCHASE.id));
      expect(deleteFundSpy).not.toHaveBeenCalled();
    });

    it('el formulario de valoración de un fondo trae la fecha de hoy por defecto', async () => {
      mockOtherApis();
      vi.spyOn(fundsApi, 'listFunds').mockResolvedValue([FUND]);
      vi.spyOn(fundPurchasesApi, 'listFundPurchases').mockResolvedValue([]);
      vi.spyOn(fundValuationsApi, 'listFundValuations').mockResolvedValue([]);
      vi.spyOn(fundDividendsApi, 'listFundDividends').mockResolvedValue([]);

      renderPage();
      const form = await screen.findByRole('form', { name: 'Añadir valoración: Vanguard Global Stock Index' });

      expect(within(form).getByLabelText('Fecha')).toHaveValue(todayIso());
    });

    it('añade una valoración a un fondo existente', async () => {
      mockOtherApis();
      vi.spyOn(fundsApi, 'listFunds').mockResolvedValue([FUND]);
      vi.spyOn(fundPurchasesApi, 'listFundPurchases').mockResolvedValue([]);
      const listValuationsSpy = vi.spyOn(fundValuationsApi, 'listFundValuations').mockResolvedValue([]);
      vi.spyOn(fundDividendsApi, 'listFundDividends').mockResolvedValue([]);
      const createSpy = vi.spyOn(fundValuationsApi, 'createFundValuation').mockResolvedValue(FUND_VALUATION);

      renderPage();
      const form = await screen.findByRole('form', { name: 'Añadir valoración: Vanguard Global Stock Index' });

      await userEvent.type(within(form).getByLabelText('Precio por participación actual'), '20.00');
      await userEvent.click(within(form).getByRole('button', { name: 'Añadir valoración' }));

      await waitFor(() => expect(createSpy).toHaveBeenCalledWith({ fundId: FUND.id, pricePerShare: '20.00', date: todayIso() }));
      await waitFor(() => expect(listValuationsSpy).toHaveBeenCalledTimes(2));
    });

    it('el formulario de valoración calcula el valor total (precio por participación × nº de participaciones ya compradas)', async () => {
      mockOtherApis();
      vi.spyOn(fundsApi, 'listFunds').mockResolvedValue([FUND]);
      vi.spyOn(fundPurchasesApi, 'listFundPurchases').mockResolvedValue([FUND_PURCHASE]);
      vi.spyOn(fundValuationsApi, 'listFundValuations').mockResolvedValue([]);
      vi.spyOn(fundDividendsApi, 'listFundDividends').mockResolvedValue([]);

      renderPage();
      const form = await screen.findByRole('form', { name: 'Añadir valoración: Vanguard Global Stock Index' });

      await userEvent.type(within(form).getByLabelText('Precio por participación actual'), '20.00');

      // 10 participaciones (FUND_PURCHASE) × 20.00 = 200,00 €.
      expect(within(form).getByText(/Valor total:/)).toHaveTextContent('200,00');
    });

    it('edita una valoración del historial', async () => {
      mockOtherApis();
      vi.spyOn(fundsApi, 'listFunds').mockResolvedValue([FUND]);
      vi.spyOn(fundPurchasesApi, 'listFundPurchases').mockResolvedValue([]);
      vi.spyOn(fundValuationsApi, 'listFundValuations').mockResolvedValue([FUND_VALUATION]);
      vi.spyOn(fundDividendsApi, 'listFundDividends').mockResolvedValue([]);
      const updateSpy = vi.spyOn(fundValuationsApi, 'updateFundValuation').mockResolvedValue(FUND_VALUATION);

      renderPage();
      await screen.findByRole('list', { name: 'Tus fondos de inversión' });

      await userEvent.click(screen.getByRole('button', { name: 'Editar valoración de Vanguard Global Stock Index del 2026-09-04' }));
      const editForm = screen.getByRole('form', { name: 'Editar valoración de Vanguard Global Stock Index del 2026-09-04' });
      const valuationInput = within(editForm).getByLabelText('Precio por participación actual');
      await userEvent.clear(valuationInput);
      await userEvent.type(valuationInput, '25.00');
      await userEvent.click(within(editForm).getByRole('button', { name: 'Guardar' }));

      await waitFor(() => expect(updateSpy).toHaveBeenCalledWith(FUND_VALUATION.id, { pricePerShare: '25.00', date: '2026-09-04' }));
    });

    it('elimina una valoración del historial, sin borrar el fondo', async () => {
      mockOtherApis();
      vi.spyOn(fundsApi, 'listFunds').mockResolvedValue([FUND]);
      vi.spyOn(fundPurchasesApi, 'listFundPurchases').mockResolvedValue([]);
      vi.spyOn(fundValuationsApi, 'listFundValuations').mockResolvedValue([FUND_VALUATION]);
      vi.spyOn(fundDividendsApi, 'listFundDividends').mockResolvedValue([]);
      const deleteValuationSpy = vi.spyOn(fundValuationsApi, 'deleteFundValuation').mockResolvedValue(undefined);
      const deleteFundSpy = vi.spyOn(fundsApi, 'deleteFund');

      renderPage();
      await screen.findByRole('list', { name: 'Tus fondos de inversión' });

      await userEvent.click(screen.getByRole('button', { name: 'Eliminar valoración de Vanguard Global Stock Index del 2026-09-04' }));

      await waitFor(() => expect(deleteValuationSpy).toHaveBeenCalledWith(FUND_VALUATION.id));
      expect(deleteFundSpy).not.toHaveBeenCalled();
    });
  });

  describe('Dividendos (spec 029)', () => {
    function mockOtherApis() {
      vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
      vi.spyOn(bankAccountsApi, 'listBankAccounts').mockResolvedValue([]);
      vi.spyOn(bankAccountBalancesApi, 'listBankAccountBalances').mockResolvedValue([]);
      vi.spyOn(cryptosApi, 'listCryptos').mockResolvedValue([]);
      vi.spyOn(cryptoPurchasesApi, 'listCryptoPurchases').mockResolvedValue([]);
      vi.spyOn(cryptoValuationsApi, 'listCryptoValuations').mockResolvedValue([]);
      vi.spyOn(vehiclesApi, 'listVehicles').mockResolvedValue([]);
      vi.spyOn(vehicleValuationsApi, 'listVehicleValuations').mockResolvedValue([]);
      vi.spyOn(pensionPlansApi, 'listPensionPlans').mockResolvedValue([]);
      vi.spyOn(pensionPlanContributionsApi, 'listPensionPlanContributions').mockResolvedValue([]);
      vi.spyOn(pensionPlanValuationsApi, 'listPensionPlanValuations').mockResolvedValue([]);
      vi.spyOn(cashHoldingsApi, 'listCashHoldings').mockResolvedValue([]);
      vi.spyOn(cashBalancesApi, 'listCashBalances').mockResolvedValue([]);
    }

    it('una acción sin ningún dividendo muestra "Sin dividendos"', async () => {
      mockOtherApis();
      vi.spyOn(stocksApi, 'listStocks').mockResolvedValue([STOCK]);
      vi.spyOn(stockPurchasesApi, 'listStockPurchases').mockResolvedValue([STOCK_PURCHASE]);
      vi.spyOn(stockValuationsApi, 'listStockValuations').mockResolvedValue([]);
      vi.spyOn(stockDividendsApi, 'listStockDividends').mockResolvedValue([]);
      vi.spyOn(fundsApi, 'listFunds').mockResolvedValue([]);
      vi.spyOn(fundPurchasesApi, 'listFundPurchases').mockResolvedValue([]);
      vi.spyOn(fundValuationsApi, 'listFundValuations').mockResolvedValue([]);
      vi.spyOn(fundDividendsApi, 'listFundDividends').mockResolvedValue([]);

      renderPage();

      const list = await screen.findByRole('list', { name: 'Tus acciones' });
      expect(within(list).getByText(/Dividendos cobrados: Sin dividendos/)).toBeInTheDocument();
    });

    it('una acción con dividendos muestra el total neto cobrado y el historial con neto, bruto y % de retención', async () => {
      mockOtherApis();
      vi.spyOn(stocksApi, 'listStocks').mockResolvedValue([STOCK]);
      vi.spyOn(stockPurchasesApi, 'listStockPurchases').mockResolvedValue([STOCK_PURCHASE]);
      vi.spyOn(stockValuationsApi, 'listStockValuations').mockResolvedValue([]);
      vi.spyOn(stockDividendsApi, 'listStockDividends').mockResolvedValue([STOCK_DIVIDEND]);
      vi.spyOn(fundsApi, 'listFunds').mockResolvedValue([]);
      vi.spyOn(fundPurchasesApi, 'listFundPurchases').mockResolvedValue([]);
      vi.spyOn(fundValuationsApi, 'listFundValuations').mockResolvedValue([]);
      vi.spyOn(fundDividendsApi, 'listFundDividends').mockResolvedValue([]);

      renderPage();

      const list = await screen.findByRole('list', { name: 'Tus acciones' });
      expect(within(list).getByText(/Dividendos cobrados: 81,00 €/)).toBeInTheDocument();

      const history = within(list).getByRole('list', { name: 'Historial de dividendos de Inditex · BBVA' });
      expect(within(history).getByText('2026-09-04')).toBeInTheDocument();
      // STOCK_DIVIDEND: neto 81,00 €, retención 19% → bruto = 81 / (1 - 0.19) = 100,00 €.
      expect(within(history).getByText(/Neto: 81,00 € · Bruto: 100,00 €/)).toHaveTextContent('19.00% retención');
    });

    it('el formulario de alta trae 19% de retención y la fecha de hoy por defecto, y calcula el importe bruto', async () => {
      mockOtherApis();
      vi.spyOn(stocksApi, 'listStocks').mockResolvedValue([STOCK]);
      vi.spyOn(stockPurchasesApi, 'listStockPurchases').mockResolvedValue([]);
      vi.spyOn(stockValuationsApi, 'listStockValuations').mockResolvedValue([]);
      vi.spyOn(stockDividendsApi, 'listStockDividends').mockResolvedValue([]);
      vi.spyOn(fundsApi, 'listFunds').mockResolvedValue([]);
      vi.spyOn(fundPurchasesApi, 'listFundPurchases').mockResolvedValue([]);
      vi.spyOn(fundValuationsApi, 'listFundValuations').mockResolvedValue([]);
      vi.spyOn(fundDividendsApi, 'listFundDividends').mockResolvedValue([]);

      renderPage();
      const form = await screen.findByRole('form', { name: 'Añadir dividendo: Inditex' });

      expect(within(form).getByLabelText('% Retención')).toHaveValue('19');
      expect(within(form).getByLabelText('Fecha')).toHaveValue(todayIso());

      await userEvent.type(within(form).getByLabelText('Importe neto'), '81');

      expect(within(form).getByText(/Importe bruto:/)).toHaveTextContent('100,00');
    });

    it('añade un dividendo a una acción existente', async () => {
      mockOtherApis();
      vi.spyOn(stocksApi, 'listStocks').mockResolvedValue([STOCK]);
      vi.spyOn(stockPurchasesApi, 'listStockPurchases').mockResolvedValue([]);
      vi.spyOn(stockValuationsApi, 'listStockValuations').mockResolvedValue([]);
      const listDividendsSpy = vi.spyOn(stockDividendsApi, 'listStockDividends').mockResolvedValue([]);
      vi.spyOn(fundsApi, 'listFunds').mockResolvedValue([]);
      vi.spyOn(fundPurchasesApi, 'listFundPurchases').mockResolvedValue([]);
      vi.spyOn(fundValuationsApi, 'listFundValuations').mockResolvedValue([]);
      vi.spyOn(fundDividendsApi, 'listFundDividends').mockResolvedValue([]);
      const createSpy = vi.spyOn(stockDividendsApi, 'createStockDividend').mockResolvedValue(STOCK_DIVIDEND);

      renderPage();
      const form = await screen.findByRole('form', { name: 'Añadir dividendo: Inditex' });

      await userEvent.type(within(form).getByLabelText('Importe neto'), '81');
      await userEvent.click(within(form).getByRole('button', { name: 'Añadir dividendo' }));

      await waitFor(() =>
        expect(createSpy).toHaveBeenCalledWith({ stockId: STOCK.id, netAmount: '81', retentionPercent: '19', date: todayIso() }),
      );
      await waitFor(() => expect(listDividendsSpy).toHaveBeenCalledTimes(2));
    });

    it('edita un dividendo del historial', async () => {
      mockOtherApis();
      vi.spyOn(stocksApi, 'listStocks').mockResolvedValue([STOCK]);
      vi.spyOn(stockPurchasesApi, 'listStockPurchases').mockResolvedValue([]);
      vi.spyOn(stockValuationsApi, 'listStockValuations').mockResolvedValue([]);
      vi.spyOn(stockDividendsApi, 'listStockDividends').mockResolvedValue([STOCK_DIVIDEND]);
      vi.spyOn(fundsApi, 'listFunds').mockResolvedValue([]);
      vi.spyOn(fundPurchasesApi, 'listFundPurchases').mockResolvedValue([]);
      vi.spyOn(fundValuationsApi, 'listFundValuations').mockResolvedValue([]);
      vi.spyOn(fundDividendsApi, 'listFundDividends').mockResolvedValue([]);
      const updateSpy = vi.spyOn(stockDividendsApi, 'updateStockDividend').mockResolvedValue(STOCK_DIVIDEND);

      renderPage();
      await screen.findByRole('list', { name: 'Tus acciones' });

      const dividendLabel = 'Editar dividendo de Inditex: 2026-09-04 · 81.00€ netos';
      await userEvent.click(screen.getByRole('button', { name: dividendLabel }));
      const editForm = screen.getByRole('form', { name: dividendLabel });
      const netAmountInput = within(editForm).getByLabelText('Importe neto');
      await userEvent.clear(netAmountInput);
      await userEvent.type(netAmountInput, '90');
      await userEvent.click(within(editForm).getByRole('button', { name: 'Guardar' }));

      await waitFor(() =>
        expect(updateSpy).toHaveBeenCalledWith(STOCK_DIVIDEND.id, { netAmount: '90', retentionPercent: '19.00', date: '2026-09-04' }),
      );
    });

    it('elimina un dividendo del historial, sin borrar la acción', async () => {
      mockOtherApis();
      vi.spyOn(stocksApi, 'listStocks').mockResolvedValue([STOCK]);
      vi.spyOn(stockPurchasesApi, 'listStockPurchases').mockResolvedValue([]);
      vi.spyOn(stockValuationsApi, 'listStockValuations').mockResolvedValue([]);
      vi.spyOn(stockDividendsApi, 'listStockDividends').mockResolvedValue([STOCK_DIVIDEND]);
      vi.spyOn(fundsApi, 'listFunds').mockResolvedValue([]);
      vi.spyOn(fundPurchasesApi, 'listFundPurchases').mockResolvedValue([]);
      vi.spyOn(fundValuationsApi, 'listFundValuations').mockResolvedValue([]);
      vi.spyOn(fundDividendsApi, 'listFundDividends').mockResolvedValue([]);
      const deleteDividendSpy = vi.spyOn(stockDividendsApi, 'deleteStockDividend').mockResolvedValue(undefined);
      const deleteStockSpy = vi.spyOn(stocksApi, 'deleteStock');

      renderPage();
      await screen.findByRole('list', { name: 'Tus acciones' });

      await userEvent.click(screen.getByRole('button', { name: 'Eliminar dividendo de Inditex: 2026-09-04 · 81.00€ netos' }));

      await waitFor(() => expect(deleteDividendSpy).toHaveBeenCalledWith(STOCK_DIVIDEND.id));
      expect(deleteStockSpy).not.toHaveBeenCalled();
    });

    it('un fondo con dividendos muestra el total neto cobrado', async () => {
      mockOtherApis();
      vi.spyOn(stocksApi, 'listStocks').mockResolvedValue([]);
      vi.spyOn(stockPurchasesApi, 'listStockPurchases').mockResolvedValue([]);
      vi.spyOn(stockValuationsApi, 'listStockValuations').mockResolvedValue([]);
      vi.spyOn(stockDividendsApi, 'listStockDividends').mockResolvedValue([]);
      vi.spyOn(fundsApi, 'listFunds').mockResolvedValue([FUND]);
      vi.spyOn(fundPurchasesApi, 'listFundPurchases').mockResolvedValue([FUND_PURCHASE]);
      vi.spyOn(fundValuationsApi, 'listFundValuations').mockResolvedValue([]);
      vi.spyOn(fundDividendsApi, 'listFundDividends').mockResolvedValue([FUND_DIVIDEND]);

      renderPage();

      const list = await screen.findByRole('list', { name: 'Tus fondos de inversión' });
      expect(within(list).getByText(/Dividendos cobrados: 40,50 €/)).toBeInTheDocument();
    });

    it('añade un dividendo a un fondo existente', async () => {
      mockOtherApis();
      vi.spyOn(stocksApi, 'listStocks').mockResolvedValue([]);
      vi.spyOn(stockPurchasesApi, 'listStockPurchases').mockResolvedValue([]);
      vi.spyOn(stockValuationsApi, 'listStockValuations').mockResolvedValue([]);
      vi.spyOn(stockDividendsApi, 'listStockDividends').mockResolvedValue([]);
      vi.spyOn(fundsApi, 'listFunds').mockResolvedValue([FUND]);
      vi.spyOn(fundPurchasesApi, 'listFundPurchases').mockResolvedValue([]);
      vi.spyOn(fundValuationsApi, 'listFundValuations').mockResolvedValue([]);
      const listFundDividendsSpy = vi.spyOn(fundDividendsApi, 'listFundDividends').mockResolvedValue([]);
      const createSpy = vi.spyOn(fundDividendsApi, 'createFundDividend').mockResolvedValue(FUND_DIVIDEND);

      renderPage();
      const form = await screen.findByRole('form', { name: 'Añadir dividendo: Vanguard Global Stock Index' });

      await userEvent.type(within(form).getByLabelText('Importe neto'), '40.50');
      await userEvent.click(within(form).getByRole('button', { name: 'Añadir dividendo' }));

      await waitFor(() =>
        expect(createSpy).toHaveBeenCalledWith({ fundId: FUND.id, netAmount: '40.50', retentionPercent: '19', date: todayIso() }),
      );
      await waitFor(() => expect(listFundDividendsSpy).toHaveBeenCalledTimes(2));
    });

    it('H3: la tarjeta "💰 Dividendos cobrados" suma acciones y fondos, desglosados, sin sumarse a la tarjeta "Total"', async () => {
      mockOtherApis();
      vi.spyOn(stocksApi, 'listStocks').mockResolvedValue([STOCK]);
      vi.spyOn(stockPurchasesApi, 'listStockPurchases').mockResolvedValue([STOCK_PURCHASE]);
      vi.spyOn(stockValuationsApi, 'listStockValuations').mockResolvedValue([]); // sin valoración: la acción no aporta nada a "Total"
      vi.spyOn(stockDividendsApi, 'listStockDividends').mockResolvedValue([STOCK_DIVIDEND]); // 81,00 €
      vi.spyOn(fundsApi, 'listFunds').mockResolvedValue([FUND]);
      vi.spyOn(fundPurchasesApi, 'listFundPurchases').mockResolvedValue([FUND_PURCHASE]);
      vi.spyOn(fundValuationsApi, 'listFundValuations').mockResolvedValue([]); // sin valoración: el fondo tampoco aporta a "Total"
      vi.spyOn(fundDividendsApi, 'listFundDividends').mockResolvedValue([FUND_DIVIDEND]); // 40,50 €

      renderPage();

      await waitFor(() => expect(document.getElementById('wealth-dividends-summary')).toBeInTheDocument());
      const dividendsCard = within(document.getElementById('wealth-dividends-summary')!);
      // 81,00 € + 40,50 € = 121,50 €.
      expect(dividendsCard.getByText('121,50 €')).toBeInTheDocument();
      expect(dividendsCard.getByText('Acciones: 81,00 € · Fondos Inversión: 40,50 €')).toBeInTheDocument();

      // La tarjeta "Total" de patrimonio (Acciones/Fondos sin valoración cuentan 0) no incluye los 121,50 € de dividendos.
      await waitFor(() => expect(document.getElementById('wealth-total-summary')).toBeInTheDocument());
      const totalCard = within(document.getElementById('wealth-total-summary')!);
      expect(totalCard.getByText('0,00 €')).toBeInTheDocument();
    });
  });

  describe('Rentabilidad con y sin dividendos (spec 030)', () => {
    function mockOtherApis() {
      vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
      vi.spyOn(bankAccountsApi, 'listBankAccounts').mockResolvedValue([]);
      vi.spyOn(bankAccountBalancesApi, 'listBankAccountBalances').mockResolvedValue([]);
      vi.spyOn(cryptosApi, 'listCryptos').mockResolvedValue([]);
      vi.spyOn(cryptoPurchasesApi, 'listCryptoPurchases').mockResolvedValue([]);
      vi.spyOn(cryptoValuationsApi, 'listCryptoValuations').mockResolvedValue([]);
      vi.spyOn(vehiclesApi, 'listVehicles').mockResolvedValue([]);
      vi.spyOn(vehicleValuationsApi, 'listVehicleValuations').mockResolvedValue([]);
      vi.spyOn(pensionPlansApi, 'listPensionPlans').mockResolvedValue([]);
      vi.spyOn(pensionPlanContributionsApi, 'listPensionPlanContributions').mockResolvedValue([]);
      vi.spyOn(pensionPlanValuationsApi, 'listPensionPlanValuations').mockResolvedValue([]);
      vi.spyOn(cashHoldingsApi, 'listCashHoldings').mockResolvedValue([]);
      vi.spyOn(cashBalancesApi, 'listCashBalances').mockResolvedValue([]);
    }

    describe('H1 — título de una acción o fondo', () => {
      it('una acción con dividendos muestra las tres rentabilidades: sin dividendos, con dividendos netos y con dividendos brutos', async () => {
        mockOtherApis();
        vi.spyOn(stocksApi, 'listStocks').mockResolvedValue([STOCK]);
        vi.spyOn(stockPurchasesApi, 'listStockPurchases').mockResolvedValue([STOCK_PURCHASE]);
        vi.spyOn(stockValuationsApi, 'listStockValuations').mockResolvedValue([STOCK_VALUATION]);
        vi.spyOn(stockDividendsApi, 'listStockDividends').mockResolvedValue([STOCK_DIVIDEND]);
        vi.spyOn(fundsApi, 'listFunds').mockResolvedValue([]);
        vi.spyOn(fundPurchasesApi, 'listFundPurchases').mockResolvedValue([]);
        vi.spyOn(fundValuationsApi, 'listFundValuations').mockResolvedValue([]);
        vi.spyOn(fundDividendsApi, 'listFundDividends').mockResolvedValue([]);

        renderPage();

        const list = await screen.findByRole('list', { name: 'Tus acciones' });
        // Coste 300,00 € (10 × 30,00 €), valor actual 350,00 € (10 × 35,00 €), dividendo 81,00 € netos / 100,00 € brutos.
        // Sin dividendos: (350−300)/300×100 = +16.67 %. Con netos: (350+81−300)/300×100 = +43.67 %.
        // Con brutos: (350+100−300)/300×100 = +50.00 %.
        expect(within(list).getByText('+16.67%')).toBeInTheDocument();
        expect(within(list).getByText(/neto \+43\.67%/)).toBeInTheDocument();
        expect(within(list).getByText(/bruto \+50\.00%/)).toBeInTheDocument();
      });

      it('una acción sin ningún dividendo solo muestra la rentabilidad sin dividendos', async () => {
        mockOtherApis();
        vi.spyOn(stocksApi, 'listStocks').mockResolvedValue([STOCK]);
        vi.spyOn(stockPurchasesApi, 'listStockPurchases').mockResolvedValue([STOCK_PURCHASE]);
        vi.spyOn(stockValuationsApi, 'listStockValuations').mockResolvedValue([STOCK_VALUATION]);
        vi.spyOn(stockDividendsApi, 'listStockDividends').mockResolvedValue([]);
        vi.spyOn(fundsApi, 'listFunds').mockResolvedValue([]);
        vi.spyOn(fundPurchasesApi, 'listFundPurchases').mockResolvedValue([]);
        vi.spyOn(fundValuationsApi, 'listFundValuations').mockResolvedValue([]);
        vi.spyOn(fundDividendsApi, 'listFundDividends').mockResolvedValue([]);

        renderPage();

        const list = await screen.findByRole('list', { name: 'Tus acciones' });
        expect(within(list).getByText('+16.67%')).toBeInTheDocument();
        // Acotado a "· neto"/"· bruto" (no solo "neto"/"bruto"): el formulario "Añadir dividendo"
        // de la misma tarjeta tiene un campo con la etiqueta "Importe neto".
        expect(within(list).queryByText(/· neto/)).not.toBeInTheDocument();
        expect(within(list).queryByText(/· bruto/)).not.toBeInTheDocument();
      });

      it('un fondo con dividendos muestra las tres rentabilidades, cada una con su propio signo', async () => {
        mockOtherApis();
        vi.spyOn(stocksApi, 'listStocks').mockResolvedValue([]);
        vi.spyOn(stockPurchasesApi, 'listStockPurchases').mockResolvedValue([]);
        vi.spyOn(stockValuationsApi, 'listStockValuations').mockResolvedValue([]);
        vi.spyOn(stockDividendsApi, 'listStockDividends').mockResolvedValue([]);
        vi.spyOn(fundsApi, 'listFunds').mockResolvedValue([FUND]);
        vi.spyOn(fundPurchasesApi, 'listFundPurchases').mockResolvedValue([FUND_PURCHASE]);
        vi.spyOn(fundValuationsApi, 'listFundValuations').mockResolvedValue([FUND_VALUATION]);
        // Dividendo grande y sin retención, a propósito, para que la rentabilidad "con dividendos"
        // cruce a positivo aunque la de precio ("sin dividendos") sea negativa — H1 criterio 6.
        vi.spyOn(fundDividendsApi, 'listFundDividends').mockResolvedValue([
          { ...FUND_DIVIDEND, netAmount: '150.00', retentionPercent: '0.00' },
        ]);

        renderPage();

        const list = await screen.findByRole('list', { name: 'Tus fondos de inversión' });
        // Coste 300,00 €, valor actual 200,00 € → sin dividendos: (200−300)/300×100 = -33.33 % (rojo).
        // Con 150,00 € de dividendo (neto = bruto, 0% retención): (200+150−300)/300×100 = +16.67 % (verde), en ambas variantes.
        const gainLossEl = within(list).getByText('-33.33%');
        expect(gainLossEl).toHaveStyle({ color: 'var(--status-red)' });
        const gainLossNetEl = within(list).getByText(/neto \+16\.67%/);
        expect(gainLossNetEl).toHaveStyle({ color: 'var(--status-green)' });
        const gainLossGrossEl = within(list).getByText(/bruto \+16\.67%/);
        expect(gainLossGrossEl).toHaveStyle({ color: 'var(--status-green)' });
      });
    });

    describe('H2 — "Rentabilidad por categoría" (spec 028 H5)', () => {
      function mockAllApisFull() {
        vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
        vi.spyOn(bankAccountsApi, 'listBankAccounts').mockResolvedValue([BANK_ACCOUNT]);
        vi.spyOn(bankAccountBalancesApi, 'listBankAccountBalances').mockResolvedValue([BANK_BALANCE]);
        vi.spyOn(stocksApi, 'listStocks').mockResolvedValue([STOCK]);
        vi.spyOn(stockPurchasesApi, 'listStockPurchases').mockResolvedValue([STOCK_PURCHASE]);
        vi.spyOn(stockValuationsApi, 'listStockValuations').mockResolvedValue([STOCK_VALUATION]);
        vi.spyOn(stockDividendsApi, 'listStockDividends').mockResolvedValue([STOCK_DIVIDEND]);
        vi.spyOn(fundsApi, 'listFunds').mockResolvedValue([FUND]);
        vi.spyOn(fundPurchasesApi, 'listFundPurchases').mockResolvedValue([FUND_PURCHASE]);
        vi.spyOn(fundValuationsApi, 'listFundValuations').mockResolvedValue([FUND_VALUATION]);
        vi.spyOn(fundDividendsApi, 'listFundDividends').mockResolvedValue([FUND_DIVIDEND]);
        vi.spyOn(cryptosApi, 'listCryptos').mockResolvedValue([CRYPTO]);
        vi.spyOn(cryptoPurchasesApi, 'listCryptoPurchases').mockResolvedValue([CRYPTO_PURCHASE]);
        vi.spyOn(cryptoValuationsApi, 'listCryptoValuations').mockResolvedValue([CRYPTO_VALUATION]);
        vi.spyOn(vehiclesApi, 'listVehicles').mockResolvedValue([VEHICLE]);
        vi.spyOn(vehicleValuationsApi, 'listVehicleValuations').mockResolvedValue([VEHICLE_VALUATION]);
        vi.spyOn(pensionPlansApi, 'listPensionPlans').mockResolvedValue([PENSION_PLAN]);
        vi.spyOn(pensionPlanContributionsApi, 'listPensionPlanContributions').mockResolvedValue([PENSION_PLAN_CONTRIBUTION]);
        vi.spyOn(pensionPlanValuationsApi, 'listPensionPlanValuations').mockResolvedValue([PENSION_PLAN_VALUATION]);
        vi.spyOn(cashHoldingsApi, 'listCashHoldings').mockResolvedValue([CASH_HOLDING]);
        vi.spyOn(cashBalancesApi, 'listCashBalances').mockResolvedValue([CASH_BALANCE]);
      }

      it('añade filas de "Acciones" y "Fondos Inversión" con dividendos netos/brutos cuando hay dividendos cobrados', async () => {
        mockAllApisFull();

        renderPage();

        const table = await screen.findByRole('table', { name: 'Rentabilidad por categoría (tabla)' });
        // Acciones: sin dividendos +16.7 % (ya existente); con netos (350+81−300)/300×100 = +43.7 %;
        // con brutos (350+100−300)/300×100 = +50.0 %.
        expect(within(table).getByText('Acciones').closest('tr')).toBeInTheDocument();
        expect(within(table).getByText('Acciones (con dividendos netos)').closest('tr')).toHaveTextContent('+43.7 %');
        expect(within(table).getByText('Acciones (con dividendos brutos)').closest('tr')).toHaveTextContent('+50.0 %');
        // Fondos Inversión: sin dividendos (200−300)/300×100 = -33.3 %; con netos (200+40.50−300)/300×100 = -19.8 %;
        // con brutos (200+50−300)/300×100 = -16.7 %.
        expect(within(table).getByText('Fondos Inversión (con dividendos netos)').closest('tr')).toHaveTextContent('-19.8 %');
        expect(within(table).getByText('Fondos Inversión (con dividendos brutos)').closest('tr')).toHaveTextContent('-16.7 %');
      });

      it('sin ningún dividendo cobrado, Acciones y Fondos Inversión no añaden filas extra', async () => {
        mockAllApisFull();
        vi.spyOn(stockDividendsApi, 'listStockDividends').mockResolvedValue([]);
        vi.spyOn(fundDividendsApi, 'listFundDividends').mockResolvedValue([]);

        renderPage();

        const table = await screen.findByRole('table', { name: 'Rentabilidad por categoría (tabla)' });
        expect(within(table).queryByText(/con dividendos/)).not.toBeInTheDocument();
      });
    });
  });

  describe('Cripto (spec 022)', () => {
    function mockOtherApis() {
      vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
      vi.spyOn(bankAccountsApi, 'listBankAccounts').mockResolvedValue([]);
      vi.spyOn(bankAccountBalancesApi, 'listBankAccountBalances').mockResolvedValue([]);
      vi.spyOn(stocksApi, 'listStocks').mockResolvedValue([]);
      vi.spyOn(stockPurchasesApi, 'listStockPurchases').mockResolvedValue([]);
      vi.spyOn(stockValuationsApi, 'listStockValuations').mockResolvedValue([]);
      vi.spyOn(stockDividendsApi, 'listStockDividends').mockResolvedValue([]);
      vi.spyOn(fundsApi, 'listFunds').mockResolvedValue([]);
      vi.spyOn(fundPurchasesApi, 'listFundPurchases').mockResolvedValue([]);
      vi.spyOn(fundValuationsApi, 'listFundValuations').mockResolvedValue([]);
      vi.spyOn(fundDividendsApi, 'listFundDividends').mockResolvedValue([]);
    }

    it('sin ninguna posición, muestra el aviso de "todavía no tienes nada"', async () => {
      mockOtherApis();
      vi.spyOn(cryptosApi, 'listCryptos').mockResolvedValue([]);
      vi.spyOn(cryptoPurchasesApi, 'listCryptoPurchases').mockResolvedValue([]);
      vi.spyOn(cryptoValuationsApi, 'listCryptoValuations').mockResolvedValue([]);
      vi.spyOn(vehiclesApi, 'listVehicles').mockResolvedValue([]);
      vi.spyOn(vehicleValuationsApi, 'listVehicleValuations').mockResolvedValue([]);
      vi.spyOn(pensionPlansApi, 'listPensionPlans').mockResolvedValue([]);
      vi.spyOn(pensionPlanContributionsApi, 'listPensionPlanContributions').mockResolvedValue([]);
      vi.spyOn(pensionPlanValuationsApi, 'listPensionPlanValuations').mockResolvedValue([]);
      vi.spyOn(cashHoldingsApi, 'listCashHoldings').mockResolvedValue([]);
      vi.spyOn(cashBalancesApi, 'listCashBalances').mockResolvedValue([]);

      renderPage();

      expect(await screen.findByText('Todavía no tienes ninguna posición de cripto.')).toBeInTheDocument();
    });

    it('lista una posición existente, con sus totales y el valor actual calculado (precio por unidad × cantidad)', async () => {
      mockOtherApis();
      vi.spyOn(cryptosApi, 'listCryptos').mockResolvedValue([CRYPTO]);
      vi.spyOn(cryptoPurchasesApi, 'listCryptoPurchases').mockResolvedValue([CRYPTO_PURCHASE]);
      vi.spyOn(cryptoValuationsApi, 'listCryptoValuations').mockResolvedValue([CRYPTO_VALUATION]);
      vi.spyOn(vehiclesApi, 'listVehicles').mockResolvedValue([]);
      vi.spyOn(vehicleValuationsApi, 'listVehicleValuations').mockResolvedValue([]);
      vi.spyOn(pensionPlansApi, 'listPensionPlans').mockResolvedValue([]);
      vi.spyOn(pensionPlanContributionsApi, 'listPensionPlanContributions').mockResolvedValue([]);
      vi.spyOn(pensionPlanValuationsApi, 'listPensionPlanValuations').mockResolvedValue([]);
      vi.spyOn(cashHoldingsApi, 'listCashHoldings').mockResolvedValue([]);
      vi.spyOn(cashBalancesApi, 'listCashBalances').mockResolvedValue([]);

      renderPage();

      const list = await screen.findByRole('list', { name: 'Tus posiciones de cripto' });
      expect(within(list).getByText(/Bitcoin · Binance/)).toBeInTheDocument();
      // 0.1 unidades × 35000,00 €/unidad (CRYPTO_VALUATION) = 3500,00 €.
      expect(within(list).getByText('3500,00 €')).toBeInTheDocument();
      expect(within(list).getByText(/0.10000000 unidades · Coste total/)).toHaveTextContent(
        'Precio actual: 35.000,00 €/unidad · Última fecha: 2026-09-04',
      );
      // Coste total 3000,00 € (0.1 × 30000,00 €), valor actual 3500,00 € → +16.67% de ganancia, en verde.
      const gainLossEl = within(list).getByText('+16.67%');
      expect(gainLossEl).toHaveStyle({ color: 'var(--status-green)' });

      const purchaseHistory = within(list).getByRole('list', { name: 'Historial de compras de Bitcoin · Binance' });
      expect(within(purchaseHistory).getByText(/0.10000000 unidades @/)).toBeInTheDocument();

      const valuationHistory = within(list).getByRole('list', { name: 'Historial de valoraciones de Bitcoin · Binance' });
      expect(within(valuationHistory).getByText('2026-09-04')).toBeInTheDocument();
      expect(within(valuationHistory).getByText('35.000,00 €/unidad')).toBeInTheDocument();
    });

    it('con pérdidas, el % se muestra en rojo', async () => {
      mockOtherApis();
      vi.spyOn(cryptosApi, 'listCryptos').mockResolvedValue([CRYPTO]);
      vi.spyOn(cryptoPurchasesApi, 'listCryptoPurchases').mockResolvedValue([CRYPTO_PURCHASE]);
      vi.spyOn(cryptoValuationsApi, 'listCryptoValuations').mockResolvedValue([{ ...CRYPTO_VALUATION, pricePerUnit: '24000.00000000' }]);
      vi.spyOn(vehiclesApi, 'listVehicles').mockResolvedValue([]);
      vi.spyOn(vehicleValuationsApi, 'listVehicleValuations').mockResolvedValue([]);
      vi.spyOn(pensionPlansApi, 'listPensionPlans').mockResolvedValue([]);
      vi.spyOn(pensionPlanContributionsApi, 'listPensionPlanContributions').mockResolvedValue([]);
      vi.spyOn(pensionPlanValuationsApi, 'listPensionPlanValuations').mockResolvedValue([]);
      vi.spyOn(cashHoldingsApi, 'listCashHoldings').mockResolvedValue([]);
      vi.spyOn(cashBalancesApi, 'listCashBalances').mockResolvedValue([]);

      renderPage();

      const list = await screen.findByRole('list', { name: 'Tus posiciones de cripto' });
      // Coste total 3000,00 € (0.1 × 30000,00 €), valor actual 2400,00 € (0.1 × 24000,00 €) → -20.00%, en rojo.
      const gainLossEl = within(list).getByText('-20.00%');
      expect(gainLossEl).toHaveStyle({ color: 'var(--status-red)' });
    });

    it('sin ninguna compra, no muestra % de ganancia/pérdida aunque haya valoración', async () => {
      mockOtherApis();
      vi.spyOn(cryptosApi, 'listCryptos').mockResolvedValue([CRYPTO]);
      vi.spyOn(cryptoPurchasesApi, 'listCryptoPurchases').mockResolvedValue([]);
      vi.spyOn(cryptoValuationsApi, 'listCryptoValuations').mockResolvedValue([CRYPTO_VALUATION]);
      vi.spyOn(vehiclesApi, 'listVehicles').mockResolvedValue([]);
      vi.spyOn(vehicleValuationsApi, 'listVehicleValuations').mockResolvedValue([]);
      vi.spyOn(pensionPlansApi, 'listPensionPlans').mockResolvedValue([]);
      vi.spyOn(pensionPlanContributionsApi, 'listPensionPlanContributions').mockResolvedValue([]);
      vi.spyOn(pensionPlanValuationsApi, 'listPensionPlanValuations').mockResolvedValue([]);
      vi.spyOn(cashHoldingsApi, 'listCashHoldings').mockResolvedValue([]);
      vi.spyOn(cashBalancesApi, 'listCashBalances').mockResolvedValue([]);

      renderPage();

      const list = await screen.findByRole('list', { name: 'Tus posiciones de cripto' });
      await within(list).findByText(/Bitcoin · Binance/);
      expect(within(list).queryByText(/%$/)).not.toBeInTheDocument();
    });

    it('una posición sin ninguna valoración muestra "Sin valoración"', async () => {
      mockOtherApis();
      vi.spyOn(cryptosApi, 'listCryptos').mockResolvedValue([CRYPTO]);
      vi.spyOn(cryptoPurchasesApi, 'listCryptoPurchases').mockResolvedValue([]);
      vi.spyOn(cryptoValuationsApi, 'listCryptoValuations').mockResolvedValue([]);
      vi.spyOn(vehiclesApi, 'listVehicles').mockResolvedValue([]);
      vi.spyOn(vehicleValuationsApi, 'listVehicleValuations').mockResolvedValue([]);
      vi.spyOn(pensionPlansApi, 'listPensionPlans').mockResolvedValue([]);
      vi.spyOn(pensionPlanContributionsApi, 'listPensionPlanContributions').mockResolvedValue([]);
      vi.spyOn(pensionPlanValuationsApi, 'listPensionPlanValuations').mockResolvedValue([]);
      vi.spyOn(cashHoldingsApi, 'listCashHoldings').mockResolvedValue([]);
      vi.spyOn(cashBalancesApi, 'listCashBalances').mockResolvedValue([]);

      renderPage();

      const list = await screen.findByRole('list', { name: 'Tus posiciones de cripto' });
      expect(within(list).getByText('Sin valoración')).toBeInTheDocument();
      expect(within(list).getByText('Todavía no hay ninguna compra registrada en esta posición.')).toBeInTheDocument();
      expect(within(list).getByText('Todavía no hay ninguna valoración registrada en esta posición.')).toBeInTheDocument();
    });

    it('el formulario de alta trae la fecha de hoy por defecto y calcula el valor de compra', async () => {
      mockOtherApis();
      vi.spyOn(cryptosApi, 'listCryptos').mockResolvedValue([]);
      vi.spyOn(cryptoPurchasesApi, 'listCryptoPurchases').mockResolvedValue([]);
      vi.spyOn(cryptoValuationsApi, 'listCryptoValuations').mockResolvedValue([]);
      vi.spyOn(vehiclesApi, 'listVehicles').mockResolvedValue([]);
      vi.spyOn(vehicleValuationsApi, 'listVehicleValuations').mockResolvedValue([]);
      vi.spyOn(pensionPlansApi, 'listPensionPlans').mockResolvedValue([]);
      vi.spyOn(pensionPlanContributionsApi, 'listPensionPlanContributions').mockResolvedValue([]);
      vi.spyOn(pensionPlanValuationsApi, 'listPensionPlanValuations').mockResolvedValue([]);
      vi.spyOn(cashHoldingsApi, 'listCashHoldings').mockResolvedValue([]);
      vi.spyOn(cashBalancesApi, 'listCashBalances').mockResolvedValue([]);

      renderPage();
      const form = await screen.findByRole('form', { name: 'Añadir posición de cripto' });

      expect(within(form).getByLabelText('Fecha de compra')).toHaveValue(todayIso());

      await userEvent.type(within(form).getByLabelText('Cantidad'), '4');
      await userEvent.type(within(form).getByLabelText('Precio compra'), '10.50');

      expect(within(form).getByText(/Valor compra:/)).toHaveTextContent('42,00');
    });

    it('crea una posición y su primera compra desde el formulario de alta, en un solo paso', async () => {
      mockOtherApis();
      const listCryptosSpy = vi.spyOn(cryptosApi, 'listCryptos').mockResolvedValue([]);
      const listPurchasesSpy = vi.spyOn(cryptoPurchasesApi, 'listCryptoPurchases').mockResolvedValue([]);
      vi.spyOn(cryptoValuationsApi, 'listCryptoValuations').mockResolvedValue([]);
      vi.spyOn(vehiclesApi, 'listVehicles').mockResolvedValue([]);
      vi.spyOn(vehicleValuationsApi, 'listVehicleValuations').mockResolvedValue([]);
      vi.spyOn(pensionPlansApi, 'listPensionPlans').mockResolvedValue([]);
      vi.spyOn(pensionPlanContributionsApi, 'listPensionPlanContributions').mockResolvedValue([]);
      vi.spyOn(pensionPlanValuationsApi, 'listPensionPlanValuations').mockResolvedValue([]);
      vi.spyOn(cashHoldingsApi, 'listCashHoldings').mockResolvedValue([]);
      vi.spyOn(cashBalancesApi, 'listCashBalances').mockResolvedValue([]);
      const createCryptoSpy = vi.spyOn(cryptosApi, 'createCrypto').mockResolvedValue(CRYPTO);
      const createPurchaseSpy = vi.spyOn(cryptoPurchasesApi, 'createCryptoPurchase').mockResolvedValue(CRYPTO_PURCHASE);

      renderPage();
      const form = await screen.findByRole('form', { name: 'Añadir posición de cripto' });

      await userEvent.type(within(form).getByLabelText('Exchange/Wallet'), 'Binance');
      await userEvent.type(within(form).getByLabelText('Criptomoneda'), 'Bitcoin');
      await userEvent.type(within(form).getByLabelText('Cantidad'), '0.1');
      await userEvent.type(within(form).getByLabelText('Precio compra'), '30000.00');
      await userEvent.click(within(form).getByRole('button', { name: 'Añadir posición' }));

      await waitFor(() => expect(createCryptoSpy).toHaveBeenCalledWith({ exchange: 'Binance', crypto: 'Bitcoin' }));
      await waitFor(() =>
        expect(createPurchaseSpy).toHaveBeenCalledWith({
          cryptoId: CRYPTO.id,
          quantity: '0.1',
          purchasePrice: '30000.00',
          date: todayIso(),
        }),
      );
      await waitFor(() => expect(listCryptosSpy).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(listPurchasesSpy).toHaveBeenCalledTimes(2));
    });

    it('edita una posición existente', async () => {
      mockOtherApis();
      vi.spyOn(cryptosApi, 'listCryptos').mockResolvedValue([CRYPTO]);
      vi.spyOn(cryptoPurchasesApi, 'listCryptoPurchases').mockResolvedValue([]);
      vi.spyOn(cryptoValuationsApi, 'listCryptoValuations').mockResolvedValue([]);
      vi.spyOn(vehiclesApi, 'listVehicles').mockResolvedValue([]);
      vi.spyOn(vehicleValuationsApi, 'listVehicleValuations').mockResolvedValue([]);
      vi.spyOn(pensionPlansApi, 'listPensionPlans').mockResolvedValue([]);
      vi.spyOn(pensionPlanContributionsApi, 'listPensionPlanContributions').mockResolvedValue([]);
      vi.spyOn(pensionPlanValuationsApi, 'listPensionPlanValuations').mockResolvedValue([]);
      vi.spyOn(cashHoldingsApi, 'listCashHoldings').mockResolvedValue([]);
      vi.spyOn(cashBalancesApi, 'listCashBalances').mockResolvedValue([]);
      const updateSpy = vi.spyOn(cryptosApi, 'updateCrypto').mockResolvedValue(CRYPTO);

      renderPage();
      await screen.findByRole('list', { name: 'Tus posiciones de cripto' });

      await userEvent.click(screen.getByRole('button', { name: 'Editar posición: Bitcoin · Binance' }));
      const editForm = screen.getByRole('form', { name: 'Editar posición: Bitcoin' });
      const cryptoInput = within(editForm).getByLabelText('Criptomoneda');
      await userEvent.clear(cryptoInput);
      await userEvent.type(cryptoInput, 'Ethereum');
      await userEvent.click(within(editForm).getByRole('button', { name: 'Guardar' }));

      await waitFor(() => expect(updateSpy).toHaveBeenCalledWith(CRYPTO.id, { exchange: 'Binance', crypto: 'Ethereum' }));
    });

    it('elimina una posición, junto con su historial', async () => {
      mockOtherApis();
      vi.spyOn(cryptosApi, 'listCryptos').mockResolvedValue([CRYPTO]);
      vi.spyOn(cryptoPurchasesApi, 'listCryptoPurchases').mockResolvedValue([CRYPTO_PURCHASE]);
      vi.spyOn(cryptoValuationsApi, 'listCryptoValuations').mockResolvedValue([CRYPTO_VALUATION]);
      vi.spyOn(vehiclesApi, 'listVehicles').mockResolvedValue([]);
      vi.spyOn(vehicleValuationsApi, 'listVehicleValuations').mockResolvedValue([]);
      vi.spyOn(pensionPlansApi, 'listPensionPlans').mockResolvedValue([]);
      vi.spyOn(pensionPlanContributionsApi, 'listPensionPlanContributions').mockResolvedValue([]);
      vi.spyOn(pensionPlanValuationsApi, 'listPensionPlanValuations').mockResolvedValue([]);
      vi.spyOn(cashHoldingsApi, 'listCashHoldings').mockResolvedValue([]);
      vi.spyOn(cashBalancesApi, 'listCashBalances').mockResolvedValue([]);
      const deleteSpy = vi.spyOn(cryptosApi, 'deleteCrypto').mockResolvedValue(undefined);

      renderPage();
      await screen.findByRole('list', { name: 'Tus posiciones de cripto' });

      await userEvent.click(screen.getByRole('button', { name: 'Eliminar posición: Bitcoin · Binance' }));

      await waitFor(() => expect(deleteSpy).toHaveBeenCalledWith(CRYPTO.id));
    });

    it('añade una compra a una posición existente', async () => {
      mockOtherApis();
      vi.spyOn(cryptosApi, 'listCryptos').mockResolvedValue([CRYPTO]);
      const listPurchasesSpy = vi.spyOn(cryptoPurchasesApi, 'listCryptoPurchases').mockResolvedValue([]);
      vi.spyOn(cryptoValuationsApi, 'listCryptoValuations').mockResolvedValue([]);
      vi.spyOn(vehiclesApi, 'listVehicles').mockResolvedValue([]);
      vi.spyOn(vehicleValuationsApi, 'listVehicleValuations').mockResolvedValue([]);
      vi.spyOn(pensionPlansApi, 'listPensionPlans').mockResolvedValue([]);
      vi.spyOn(pensionPlanContributionsApi, 'listPensionPlanContributions').mockResolvedValue([]);
      vi.spyOn(pensionPlanValuationsApi, 'listPensionPlanValuations').mockResolvedValue([]);
      vi.spyOn(cashHoldingsApi, 'listCashHoldings').mockResolvedValue([]);
      vi.spyOn(cashBalancesApi, 'listCashBalances').mockResolvedValue([]);
      const createSpy = vi.spyOn(cryptoPurchasesApi, 'createCryptoPurchase').mockResolvedValue(CRYPTO_PURCHASE);

      renderPage();
      const form = await screen.findByRole('form', { name: 'Añadir compra: Bitcoin' });

      await userEvent.type(within(form).getByLabelText('Cantidad'), '0.1');
      await userEvent.type(within(form).getByLabelText('Precio compra'), '30000.00');
      await userEvent.click(within(form).getByRole('button', { name: 'Añadir compra' }));

      await waitFor(() =>
        expect(createSpy).toHaveBeenCalledWith({ cryptoId: CRYPTO.id, quantity: '0.1', purchasePrice: '30000.00', date: todayIso() }),
      );
      await waitFor(() => expect(listPurchasesSpy).toHaveBeenCalledTimes(2));
    });

    it('admite hasta 8 decimales en cantidad y precio de compra', async () => {
      mockOtherApis();
      vi.spyOn(cryptosApi, 'listCryptos').mockResolvedValue([CRYPTO]);
      vi.spyOn(cryptoPurchasesApi, 'listCryptoPurchases').mockResolvedValue([]);
      vi.spyOn(cryptoValuationsApi, 'listCryptoValuations').mockResolvedValue([]);
      vi.spyOn(vehiclesApi, 'listVehicles').mockResolvedValue([]);
      vi.spyOn(vehicleValuationsApi, 'listVehicleValuations').mockResolvedValue([]);
      vi.spyOn(pensionPlansApi, 'listPensionPlans').mockResolvedValue([]);
      vi.spyOn(pensionPlanContributionsApi, 'listPensionPlanContributions').mockResolvedValue([]);
      vi.spyOn(pensionPlanValuationsApi, 'listPensionPlanValuations').mockResolvedValue([]);
      vi.spyOn(cashHoldingsApi, 'listCashHoldings').mockResolvedValue([]);
      vi.spyOn(cashBalancesApi, 'listCashBalances').mockResolvedValue([]);
      const createSpy = vi.spyOn(cryptoPurchasesApi, 'createCryptoPurchase').mockResolvedValue(CRYPTO_PURCHASE);

      renderPage();
      const form = await screen.findByRole('form', { name: 'Añadir compra: Bitcoin' });

      await userEvent.type(within(form).getByLabelText('Cantidad'), '0.00000001');
      await userEvent.type(within(form).getByLabelText('Precio compra'), '0.00003821');
      await userEvent.click(within(form).getByRole('button', { name: 'Añadir compra' }));

      await waitFor(() =>
        expect(createSpy).toHaveBeenCalledWith({
          cryptoId: CRYPTO.id,
          quantity: '0.00000001',
          purchasePrice: '0.00003821',
          date: todayIso(),
        }),
      );
    });

    it('edita una compra del historial', async () => {
      mockOtherApis();
      vi.spyOn(cryptosApi, 'listCryptos').mockResolvedValue([CRYPTO]);
      vi.spyOn(cryptoPurchasesApi, 'listCryptoPurchases').mockResolvedValue([CRYPTO_PURCHASE]);
      vi.spyOn(cryptoValuationsApi, 'listCryptoValuations').mockResolvedValue([]);
      vi.spyOn(vehiclesApi, 'listVehicles').mockResolvedValue([]);
      vi.spyOn(vehicleValuationsApi, 'listVehicleValuations').mockResolvedValue([]);
      vi.spyOn(pensionPlansApi, 'listPensionPlans').mockResolvedValue([]);
      vi.spyOn(pensionPlanContributionsApi, 'listPensionPlanContributions').mockResolvedValue([]);
      vi.spyOn(pensionPlanValuationsApi, 'listPensionPlanValuations').mockResolvedValue([]);
      vi.spyOn(cashHoldingsApi, 'listCashHoldings').mockResolvedValue([]);
      vi.spyOn(cashBalancesApi, 'listCashBalances').mockResolvedValue([]);
      const updateSpy = vi.spyOn(cryptoPurchasesApi, 'updateCryptoPurchase').mockResolvedValue(CRYPTO_PURCHASE);

      renderPage();
      await screen.findByRole('list', { name: 'Tus posiciones de cripto' });

      const purchaseLabel = 'Editar compra de Bitcoin: 2026-09-04 · 0.10000000 unidades a 30000.00€';
      await userEvent.click(screen.getByRole('button', { name: purchaseLabel }));
      const editForm = screen.getByRole('form', { name: purchaseLabel });
      const quantityInput = within(editForm).getByLabelText('Cantidad');
      await userEvent.clear(quantityInput);
      await userEvent.type(quantityInput, '0.15');
      await userEvent.click(within(editForm).getByRole('button', { name: 'Guardar' }));

      await waitFor(() =>
        expect(updateSpy).toHaveBeenCalledWith(CRYPTO_PURCHASE.id, { quantity: '0.15', purchasePrice: '30000.00', date: '2026-09-04' }),
      );
    });

    it('elimina una compra del historial, sin borrar la posición', async () => {
      mockOtherApis();
      vi.spyOn(cryptosApi, 'listCryptos').mockResolvedValue([CRYPTO]);
      vi.spyOn(cryptoPurchasesApi, 'listCryptoPurchases').mockResolvedValue([CRYPTO_PURCHASE]);
      vi.spyOn(cryptoValuationsApi, 'listCryptoValuations').mockResolvedValue([]);
      vi.spyOn(vehiclesApi, 'listVehicles').mockResolvedValue([]);
      vi.spyOn(vehicleValuationsApi, 'listVehicleValuations').mockResolvedValue([]);
      vi.spyOn(pensionPlansApi, 'listPensionPlans').mockResolvedValue([]);
      vi.spyOn(pensionPlanContributionsApi, 'listPensionPlanContributions').mockResolvedValue([]);
      vi.spyOn(pensionPlanValuationsApi, 'listPensionPlanValuations').mockResolvedValue([]);
      vi.spyOn(cashHoldingsApi, 'listCashHoldings').mockResolvedValue([]);
      vi.spyOn(cashBalancesApi, 'listCashBalances').mockResolvedValue([]);
      const deletePurchaseSpy = vi.spyOn(cryptoPurchasesApi, 'deleteCryptoPurchase').mockResolvedValue(undefined);
      const deleteCryptoSpy = vi.spyOn(cryptosApi, 'deleteCrypto');

      renderPage();
      await screen.findByRole('list', { name: 'Tus posiciones de cripto' });

      await userEvent.click(
        screen.getByRole('button', { name: 'Eliminar compra de Bitcoin: 2026-09-04 · 0.10000000 unidades a 30000.00€' }),
      );

      await waitFor(() => expect(deletePurchaseSpy).toHaveBeenCalledWith(CRYPTO_PURCHASE.id));
      expect(deleteCryptoSpy).not.toHaveBeenCalled();
    });

    it('añade una valoración a una posición existente', async () => {
      mockOtherApis();
      vi.spyOn(cryptosApi, 'listCryptos').mockResolvedValue([CRYPTO]);
      vi.spyOn(cryptoPurchasesApi, 'listCryptoPurchases').mockResolvedValue([]);
      const listValuationsSpy = vi.spyOn(cryptoValuationsApi, 'listCryptoValuations').mockResolvedValue([]);
      vi.spyOn(vehiclesApi, 'listVehicles').mockResolvedValue([]);
      vi.spyOn(vehicleValuationsApi, 'listVehicleValuations').mockResolvedValue([]);
      vi.spyOn(pensionPlansApi, 'listPensionPlans').mockResolvedValue([]);
      vi.spyOn(pensionPlanContributionsApi, 'listPensionPlanContributions').mockResolvedValue([]);
      vi.spyOn(pensionPlanValuationsApi, 'listPensionPlanValuations').mockResolvedValue([]);
      vi.spyOn(cashHoldingsApi, 'listCashHoldings').mockResolvedValue([]);
      vi.spyOn(cashBalancesApi, 'listCashBalances').mockResolvedValue([]);
      const createSpy = vi.spyOn(cryptoValuationsApi, 'createCryptoValuation').mockResolvedValue(CRYPTO_VALUATION);

      renderPage();
      const form = await screen.findByRole('form', { name: 'Añadir valoración: Bitcoin' });

      await userEvent.type(within(form).getByLabelText('Precio por unidad actual'), '35000.00');
      await userEvent.click(within(form).getByRole('button', { name: 'Añadir valoración' }));

      await waitFor(() =>
        expect(createSpy).toHaveBeenCalledWith({ cryptoId: CRYPTO.id, pricePerUnit: '35000.00', date: todayIso() }),
      );
      await waitFor(() => expect(listValuationsSpy).toHaveBeenCalledTimes(2));
    });

    it('admite hasta 8 decimales en el precio por unidad (altcoins muy baratas)', async () => {
      mockOtherApis();
      vi.spyOn(cryptosApi, 'listCryptos').mockResolvedValue([CRYPTO]);
      vi.spyOn(cryptoPurchasesApi, 'listCryptoPurchases').mockResolvedValue([]);
      vi.spyOn(cryptoValuationsApi, 'listCryptoValuations').mockResolvedValue([]);
      vi.spyOn(vehiclesApi, 'listVehicles').mockResolvedValue([]);
      vi.spyOn(vehicleValuationsApi, 'listVehicleValuations').mockResolvedValue([]);
      vi.spyOn(pensionPlansApi, 'listPensionPlans').mockResolvedValue([]);
      vi.spyOn(pensionPlanContributionsApi, 'listPensionPlanContributions').mockResolvedValue([]);
      vi.spyOn(pensionPlanValuationsApi, 'listPensionPlanValuations').mockResolvedValue([]);
      vi.spyOn(cashHoldingsApi, 'listCashHoldings').mockResolvedValue([]);
      vi.spyOn(cashBalancesApi, 'listCashBalances').mockResolvedValue([]);
      const createSpy = vi.spyOn(cryptoValuationsApi, 'createCryptoValuation').mockResolvedValue(CRYPTO_VALUATION);

      renderPage();
      const form = await screen.findByRole('form', { name: 'Añadir valoración: Bitcoin' });

      await userEvent.type(within(form).getByLabelText('Precio por unidad actual'), '0.00003821');
      await userEvent.click(within(form).getByRole('button', { name: 'Añadir valoración' }));

      await waitFor(() =>
        expect(createSpy).toHaveBeenCalledWith({ cryptoId: CRYPTO.id, pricePerUnit: '0.00003821', date: todayIso() }),
      );
    });

    it('edita una valoración del historial', async () => {
      mockOtherApis();
      vi.spyOn(cryptosApi, 'listCryptos').mockResolvedValue([CRYPTO]);
      vi.spyOn(cryptoPurchasesApi, 'listCryptoPurchases').mockResolvedValue([]);
      vi.spyOn(cryptoValuationsApi, 'listCryptoValuations').mockResolvedValue([CRYPTO_VALUATION]);
      vi.spyOn(vehiclesApi, 'listVehicles').mockResolvedValue([]);
      vi.spyOn(vehicleValuationsApi, 'listVehicleValuations').mockResolvedValue([]);
      vi.spyOn(pensionPlansApi, 'listPensionPlans').mockResolvedValue([]);
      vi.spyOn(pensionPlanContributionsApi, 'listPensionPlanContributions').mockResolvedValue([]);
      vi.spyOn(pensionPlanValuationsApi, 'listPensionPlanValuations').mockResolvedValue([]);
      vi.spyOn(cashHoldingsApi, 'listCashHoldings').mockResolvedValue([]);
      vi.spyOn(cashBalancesApi, 'listCashBalances').mockResolvedValue([]);
      const updateSpy = vi.spyOn(cryptoValuationsApi, 'updateCryptoValuation').mockResolvedValue(CRYPTO_VALUATION);

      renderPage();
      await screen.findByRole('list', { name: 'Tus posiciones de cripto' });

      await userEvent.click(screen.getByRole('button', { name: 'Editar valoración de Bitcoin del 2026-09-04' }));
      const editForm = screen.getByRole('form', { name: 'Editar valoración de Bitcoin del 2026-09-04' });
      const valuationInput = within(editForm).getByLabelText('Precio por unidad actual');
      await userEvent.clear(valuationInput);
      await userEvent.type(valuationInput, '40000.00');
      await userEvent.click(within(editForm).getByRole('button', { name: 'Guardar' }));

      await waitFor(() =>
        expect(updateSpy).toHaveBeenCalledWith(CRYPTO_VALUATION.id, { pricePerUnit: '40000.00', date: '2026-09-04' }),
      );
    });

    it('elimina una valoración del historial, sin borrar la posición', async () => {
      mockOtherApis();
      vi.spyOn(cryptosApi, 'listCryptos').mockResolvedValue([CRYPTO]);
      vi.spyOn(cryptoPurchasesApi, 'listCryptoPurchases').mockResolvedValue([]);
      vi.spyOn(cryptoValuationsApi, 'listCryptoValuations').mockResolvedValue([CRYPTO_VALUATION]);
      vi.spyOn(vehiclesApi, 'listVehicles').mockResolvedValue([]);
      vi.spyOn(vehicleValuationsApi, 'listVehicleValuations').mockResolvedValue([]);
      vi.spyOn(pensionPlansApi, 'listPensionPlans').mockResolvedValue([]);
      vi.spyOn(pensionPlanContributionsApi, 'listPensionPlanContributions').mockResolvedValue([]);
      vi.spyOn(pensionPlanValuationsApi, 'listPensionPlanValuations').mockResolvedValue([]);
      vi.spyOn(cashHoldingsApi, 'listCashHoldings').mockResolvedValue([]);
      vi.spyOn(cashBalancesApi, 'listCashBalances').mockResolvedValue([]);
      const deleteValuationSpy = vi.spyOn(cryptoValuationsApi, 'deleteCryptoValuation').mockResolvedValue(undefined);
      const deleteCryptoSpy = vi.spyOn(cryptosApi, 'deleteCrypto');

      renderPage();
      await screen.findByRole('list', { name: 'Tus posiciones de cripto' });

      await userEvent.click(screen.getByRole('button', { name: 'Eliminar valoración de Bitcoin del 2026-09-04' }));

      await waitFor(() => expect(deleteValuationSpy).toHaveBeenCalledWith(CRYPTO_VALUATION.id));
      expect(deleteCryptoSpy).not.toHaveBeenCalled();
    });
  });

  describe('Vehículos (spec 023)', () => {
    function mockOtherApis() {
      vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
      vi.spyOn(bankAccountsApi, 'listBankAccounts').mockResolvedValue([]);
      vi.spyOn(bankAccountBalancesApi, 'listBankAccountBalances').mockResolvedValue([]);
      vi.spyOn(stocksApi, 'listStocks').mockResolvedValue([]);
      vi.spyOn(stockPurchasesApi, 'listStockPurchases').mockResolvedValue([]);
      vi.spyOn(stockValuationsApi, 'listStockValuations').mockResolvedValue([]);
      vi.spyOn(stockDividendsApi, 'listStockDividends').mockResolvedValue([]);
      vi.spyOn(fundsApi, 'listFunds').mockResolvedValue([]);
      vi.spyOn(fundPurchasesApi, 'listFundPurchases').mockResolvedValue([]);
      vi.spyOn(fundValuationsApi, 'listFundValuations').mockResolvedValue([]);
      vi.spyOn(fundDividendsApi, 'listFundDividends').mockResolvedValue([]);
      vi.spyOn(cryptosApi, 'listCryptos').mockResolvedValue([]);
      vi.spyOn(cryptoPurchasesApi, 'listCryptoPurchases').mockResolvedValue([]);
      vi.spyOn(cryptoValuationsApi, 'listCryptoValuations').mockResolvedValue([]);
    }

    it('sin ningún vehículo, muestra el aviso de "todavía no tienes nada"', async () => {
      mockOtherApis();
      vi.spyOn(vehiclesApi, 'listVehicles').mockResolvedValue([]);
      vi.spyOn(vehicleValuationsApi, 'listVehicleValuations').mockResolvedValue([]);
      vi.spyOn(pensionPlansApi, 'listPensionPlans').mockResolvedValue([]);
      vi.spyOn(pensionPlanContributionsApi, 'listPensionPlanContributions').mockResolvedValue([]);
      vi.spyOn(pensionPlanValuationsApi, 'listPensionPlanValuations').mockResolvedValue([]);
      vi.spyOn(cashHoldingsApi, 'listCashHoldings').mockResolvedValue([]);
      vi.spyOn(cashBalancesApi, 'listCashBalances').mockResolvedValue([]);

      renderPage();

      expect(await screen.findByText('Todavía no tienes ningún vehículo.')).toBeInTheDocument();
    });

    it('lista un vehículo existente, con su valor actual y el % de ganancia o pérdida sobre el precio de compra', async () => {
      mockOtherApis();
      vi.spyOn(vehiclesApi, 'listVehicles').mockResolvedValue([VEHICLE]);
      vi.spyOn(vehicleValuationsApi, 'listVehicleValuations').mockResolvedValue([VEHICLE_VALUATION]);
      vi.spyOn(pensionPlansApi, 'listPensionPlans').mockResolvedValue([]);
      vi.spyOn(pensionPlanContributionsApi, 'listPensionPlanContributions').mockResolvedValue([]);
      vi.spyOn(pensionPlanValuationsApi, 'listPensionPlanValuations').mockResolvedValue([]);
      vi.spyOn(cashHoldingsApi, 'listCashHoldings').mockResolvedValue([]);
      vi.spyOn(cashBalancesApi, 'listCashBalances').mockResolvedValue([]);

      renderPage();

      const list = await screen.findByRole('list', { name: 'Tus vehículos' });
      expect(within(list).getByText(/Toyota Corolla · 1234ABC/)).toBeInTheDocument();
      // Aparece dos veces: en la tarjeta (valor actual) y en el historial (la propia entrada).
      expect(within(list).getAllByText('15.000,00 €')).toHaveLength(2);
      // (15000 - 20000) / 20000 × 100 = -25,00 %.
      expect(within(list).getByText('-25.00%')).toBeInTheDocument();

      const history = within(list).getByRole('list', { name: 'Historial de Toyota Corolla · 1234ABC' });
      expect(within(history).getByText('2026-09-04')).toBeInTheDocument();
    });

    it('un vehículo sin ninguna valoración muestra "Sin valoración" y sin % de ganancia o pérdida', async () => {
      mockOtherApis();
      vi.spyOn(vehiclesApi, 'listVehicles').mockResolvedValue([VEHICLE]);
      vi.spyOn(vehicleValuationsApi, 'listVehicleValuations').mockResolvedValue([]);
      vi.spyOn(pensionPlansApi, 'listPensionPlans').mockResolvedValue([]);
      vi.spyOn(pensionPlanContributionsApi, 'listPensionPlanContributions').mockResolvedValue([]);
      vi.spyOn(pensionPlanValuationsApi, 'listPensionPlanValuations').mockResolvedValue([]);
      vi.spyOn(cashHoldingsApi, 'listCashHoldings').mockResolvedValue([]);
      vi.spyOn(cashBalancesApi, 'listCashBalances').mockResolvedValue([]);

      renderPage();

      const list = await screen.findByRole('list', { name: 'Tus vehículos' });
      expect(within(list).getByText('Sin valoración')).toBeInTheDocument();
      expect(within(list).getByText('Todavía no hay ninguna valoración registrada de este vehículo.')).toBeInTheDocument();
      expect(within(list).queryByText(/%/)).not.toBeInTheDocument();
    });

    it('crea un vehículo desde el formulario de alta', async () => {
      mockOtherApis();
      const listSpy = vi.spyOn(vehiclesApi, 'listVehicles').mockResolvedValue([]);
      vi.spyOn(vehicleValuationsApi, 'listVehicleValuations').mockResolvedValue([]);
      vi.spyOn(pensionPlansApi, 'listPensionPlans').mockResolvedValue([]);
      vi.spyOn(pensionPlanContributionsApi, 'listPensionPlanContributions').mockResolvedValue([]);
      vi.spyOn(pensionPlanValuationsApi, 'listPensionPlanValuations').mockResolvedValue([]);
      vi.spyOn(cashHoldingsApi, 'listCashHoldings').mockResolvedValue([]);
      vi.spyOn(cashBalancesApi, 'listCashBalances').mockResolvedValue([]);
      const createSpy = vi.spyOn(vehiclesApi, 'createVehicle').mockResolvedValue(VEHICLE);

      renderPage();
      const form = await screen.findByRole('form', { name: 'Añadir vehículo' });

      await userEvent.type(within(form).getByLabelText('Marca/Modelo'), 'Toyota Corolla');
      await userEvent.type(within(form).getByLabelText('Matrícula'), '1234ABC');
      await userEvent.type(within(form).getByLabelText('Precio de compra'), '20000.00');
      await userEvent.click(within(form).getByRole('button', { name: 'Añadir vehículo' }));

      await waitFor(() =>
        expect(createSpy).toHaveBeenCalledWith({
          brandModel: 'Toyota Corolla',
          plate: '1234ABC',
          purchasePrice: '20000.00',
          purchaseDate: todayIso(),
        }),
      );
      await waitFor(() => expect(listSpy).toHaveBeenCalledTimes(2));
    });

    it('no puede crear dos veces el mismo vehículo (409)', async () => {
      mockOtherApis();
      vi.spyOn(vehiclesApi, 'listVehicles').mockResolvedValue([]);
      vi.spyOn(vehicleValuationsApi, 'listVehicleValuations').mockResolvedValue([]);
      vi.spyOn(pensionPlansApi, 'listPensionPlans').mockResolvedValue([]);
      vi.spyOn(pensionPlanContributionsApi, 'listPensionPlanContributions').mockResolvedValue([]);
      vi.spyOn(pensionPlanValuationsApi, 'listPensionPlanValuations').mockResolvedValue([]);
      vi.spyOn(cashHoldingsApi, 'listCashHoldings').mockResolvedValue([]);
      vi.spyOn(cashBalancesApi, 'listCashBalances').mockResolvedValue([]);
      vi.spyOn(vehiclesApi, 'createVehicle').mockRejectedValue(
        new ApiError(409, 'Ya tienes registrado ese vehículo (misma marca/modelo y matrícula). Añade la valoración dentro de él.'),
      );

      renderPage();
      const form = await screen.findByRole('form', { name: 'Añadir vehículo' });

      await userEvent.type(within(form).getByLabelText('Marca/Modelo'), 'Toyota Corolla');
      await userEvent.type(within(form).getByLabelText('Matrícula'), '1234ABC');
      await userEvent.type(within(form).getByLabelText('Precio de compra'), '20000.00');
      await userEvent.click(within(form).getByRole('button', { name: 'Añadir vehículo' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('Ya tienes registrado ese vehículo');
    });

    it('edita un vehículo existente', async () => {
      mockOtherApis();
      vi.spyOn(vehiclesApi, 'listVehicles').mockResolvedValue([VEHICLE]);
      vi.spyOn(vehicleValuationsApi, 'listVehicleValuations').mockResolvedValue([]);
      vi.spyOn(pensionPlansApi, 'listPensionPlans').mockResolvedValue([]);
      vi.spyOn(pensionPlanContributionsApi, 'listPensionPlanContributions').mockResolvedValue([]);
      vi.spyOn(pensionPlanValuationsApi, 'listPensionPlanValuations').mockResolvedValue([]);
      vi.spyOn(cashHoldingsApi, 'listCashHoldings').mockResolvedValue([]);
      vi.spyOn(cashBalancesApi, 'listCashBalances').mockResolvedValue([]);
      const updateSpy = vi.spyOn(vehiclesApi, 'updateVehicle').mockResolvedValue(VEHICLE);

      renderPage();
      await screen.findByRole('list', { name: 'Tus vehículos' });

      await userEvent.click(screen.getByRole('button', { name: 'Editar vehículo: Toyota Corolla · 1234ABC' }));
      const editForm = screen.getByRole('form', { name: 'Editar vehículo: Toyota Corolla · 1234ABC' });
      const plateInput = within(editForm).getByLabelText('Matrícula');
      await userEvent.clear(plateInput);
      await userEvent.type(plateInput, '5678XYZ');
      await userEvent.click(within(editForm).getByRole('button', { name: 'Guardar' }));

      await waitFor(() =>
        expect(updateSpy).toHaveBeenCalledWith(VEHICLE.id, {
          brandModel: 'Toyota Corolla',
          plate: '5678XYZ',
          purchasePrice: '20000.00',
          purchaseDate: '2026-09-04',
        }),
      );
    });

    it('elimina un vehículo', async () => {
      mockOtherApis();
      vi.spyOn(vehiclesApi, 'listVehicles').mockResolvedValue([VEHICLE]);
      vi.spyOn(vehicleValuationsApi, 'listVehicleValuations').mockResolvedValue([]);
      vi.spyOn(pensionPlansApi, 'listPensionPlans').mockResolvedValue([]);
      vi.spyOn(pensionPlanContributionsApi, 'listPensionPlanContributions').mockResolvedValue([]);
      vi.spyOn(pensionPlanValuationsApi, 'listPensionPlanValuations').mockResolvedValue([]);
      vi.spyOn(cashHoldingsApi, 'listCashHoldings').mockResolvedValue([]);
      vi.spyOn(cashBalancesApi, 'listCashBalances').mockResolvedValue([]);
      const deleteSpy = vi.spyOn(vehiclesApi, 'deleteVehicle').mockResolvedValue(undefined);

      renderPage();
      await screen.findByRole('list', { name: 'Tus vehículos' });

      await userEvent.click(screen.getByRole('button', { name: 'Eliminar vehículo: Toyota Corolla · 1234ABC' }));

      await waitFor(() => expect(deleteSpy).toHaveBeenCalledWith(VEHICLE.id));
    });

    it('el formulario de valoración de un vehículo trae la fecha de hoy por defecto', async () => {
      mockOtherApis();
      vi.spyOn(vehiclesApi, 'listVehicles').mockResolvedValue([VEHICLE]);
      vi.spyOn(vehicleValuationsApi, 'listVehicleValuations').mockResolvedValue([]);
      vi.spyOn(pensionPlansApi, 'listPensionPlans').mockResolvedValue([]);
      vi.spyOn(pensionPlanContributionsApi, 'listPensionPlanContributions').mockResolvedValue([]);
      vi.spyOn(pensionPlanValuationsApi, 'listPensionPlanValuations').mockResolvedValue([]);
      vi.spyOn(cashHoldingsApi, 'listCashHoldings').mockResolvedValue([]);
      vi.spyOn(cashBalancesApi, 'listCashBalances').mockResolvedValue([]);

      renderPage();
      const form = await screen.findByRole('form', { name: 'Añadir valoración: Toyota Corolla · 1234ABC' });

      expect(within(form).getByLabelText('Fecha')).toHaveValue(todayIso());
    });

    it('añade una valoración a un vehículo existente', async () => {
      mockOtherApis();
      vi.spyOn(vehiclesApi, 'listVehicles').mockResolvedValue([VEHICLE]);
      const listValuationsSpy = vi.spyOn(vehicleValuationsApi, 'listVehicleValuations').mockResolvedValue([]);
      vi.spyOn(pensionPlansApi, 'listPensionPlans').mockResolvedValue([]);
      vi.spyOn(pensionPlanContributionsApi, 'listPensionPlanContributions').mockResolvedValue([]);
      vi.spyOn(pensionPlanValuationsApi, 'listPensionPlanValuations').mockResolvedValue([]);
      vi.spyOn(cashHoldingsApi, 'listCashHoldings').mockResolvedValue([]);
      vi.spyOn(cashBalancesApi, 'listCashBalances').mockResolvedValue([]);
      const createSpy = vi.spyOn(vehicleValuationsApi, 'createVehicleValuation').mockResolvedValue(VEHICLE_VALUATION);

      renderPage();
      const form = await screen.findByRole('form', { name: 'Añadir valoración: Toyota Corolla · 1234ABC' });

      await userEvent.type(within(form).getByLabelText('Valor actual'), '15000.00');
      await userEvent.click(within(form).getByRole('button', { name: 'Añadir valoración' }));

      await waitFor(() =>
        expect(createSpy).toHaveBeenCalledWith({ vehicleId: VEHICLE.id, value: '15000.00', date: todayIso() }),
      );
      await waitFor(() => expect(listValuationsSpy).toHaveBeenCalledTimes(2));
    });

    it('edita una valoración del historial', async () => {
      mockOtherApis();
      vi.spyOn(vehiclesApi, 'listVehicles').mockResolvedValue([VEHICLE]);
      vi.spyOn(vehicleValuationsApi, 'listVehicleValuations').mockResolvedValue([VEHICLE_VALUATION]);
      vi.spyOn(pensionPlansApi, 'listPensionPlans').mockResolvedValue([]);
      vi.spyOn(pensionPlanContributionsApi, 'listPensionPlanContributions').mockResolvedValue([]);
      vi.spyOn(pensionPlanValuationsApi, 'listPensionPlanValuations').mockResolvedValue([]);
      vi.spyOn(cashHoldingsApi, 'listCashHoldings').mockResolvedValue([]);
      vi.spyOn(cashBalancesApi, 'listCashBalances').mockResolvedValue([]);
      const updateSpy = vi.spyOn(vehicleValuationsApi, 'updateVehicleValuation').mockResolvedValue(VEHICLE_VALUATION);

      renderPage();
      await screen.findByRole('list', { name: 'Tus vehículos' });

      await userEvent.click(screen.getByRole('button', { name: 'Editar valoración del 2026-09-04' }));
      const editForm = screen.getByRole('form', { name: 'Editar valoración del 2026-09-04' });
      const valueInput = within(editForm).getByLabelText('Valor actual');
      await userEvent.clear(valueInput);
      await userEvent.type(valueInput, '14000.00');
      await userEvent.click(within(editForm).getByRole('button', { name: 'Guardar' }));

      await waitFor(() =>
        expect(updateSpy).toHaveBeenCalledWith(VEHICLE_VALUATION.id, { value: '14000.00', date: '2026-09-04' }),
      );
    });

    it('elimina una valoración del historial, sin borrar el vehículo', async () => {
      mockOtherApis();
      vi.spyOn(vehiclesApi, 'listVehicles').mockResolvedValue([VEHICLE]);
      vi.spyOn(vehicleValuationsApi, 'listVehicleValuations').mockResolvedValue([VEHICLE_VALUATION]);
      vi.spyOn(pensionPlansApi, 'listPensionPlans').mockResolvedValue([]);
      vi.spyOn(pensionPlanContributionsApi, 'listPensionPlanContributions').mockResolvedValue([]);
      vi.spyOn(pensionPlanValuationsApi, 'listPensionPlanValuations').mockResolvedValue([]);
      vi.spyOn(cashHoldingsApi, 'listCashHoldings').mockResolvedValue([]);
      vi.spyOn(cashBalancesApi, 'listCashBalances').mockResolvedValue([]);
      const deleteValuationSpy = vi.spyOn(vehicleValuationsApi, 'deleteVehicleValuation').mockResolvedValue(undefined);
      const deleteVehicleSpy = vi.spyOn(vehiclesApi, 'deleteVehicle');

      renderPage();
      await screen.findByRole('list', { name: 'Tus vehículos' });

      await userEvent.click(screen.getByRole('button', { name: 'Eliminar valoración del 2026-09-04' }));

      await waitFor(() => expect(deleteValuationSpy).toHaveBeenCalledWith(VEHICLE_VALUATION.id));
      expect(deleteVehicleSpy).not.toHaveBeenCalled();
    });
  });

  describe('Fondo Pensiones (spec 024)', () => {
    function mockOtherApis() {
      vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
      vi.spyOn(bankAccountsApi, 'listBankAccounts').mockResolvedValue([]);
      vi.spyOn(bankAccountBalancesApi, 'listBankAccountBalances').mockResolvedValue([]);
      vi.spyOn(stocksApi, 'listStocks').mockResolvedValue([]);
      vi.spyOn(stockPurchasesApi, 'listStockPurchases').mockResolvedValue([]);
      vi.spyOn(stockValuationsApi, 'listStockValuations').mockResolvedValue([]);
      vi.spyOn(stockDividendsApi, 'listStockDividends').mockResolvedValue([]);
      vi.spyOn(fundsApi, 'listFunds').mockResolvedValue([]);
      vi.spyOn(fundPurchasesApi, 'listFundPurchases').mockResolvedValue([]);
      vi.spyOn(fundValuationsApi, 'listFundValuations').mockResolvedValue([]);
      vi.spyOn(fundDividendsApi, 'listFundDividends').mockResolvedValue([]);
      vi.spyOn(cryptosApi, 'listCryptos').mockResolvedValue([]);
      vi.spyOn(cryptoPurchasesApi, 'listCryptoPurchases').mockResolvedValue([]);
      vi.spyOn(cryptoValuationsApi, 'listCryptoValuations').mockResolvedValue([]);
      vi.spyOn(vehiclesApi, 'listVehicles').mockResolvedValue([]);
      vi.spyOn(vehicleValuationsApi, 'listVehicleValuations').mockResolvedValue([]);
    }

    it('sin ningún plan, muestra el aviso de "todavía no tienes nada"', async () => {
      mockOtherApis();
      vi.spyOn(pensionPlansApi, 'listPensionPlans').mockResolvedValue([]);
      vi.spyOn(pensionPlanContributionsApi, 'listPensionPlanContributions').mockResolvedValue([]);
      vi.spyOn(pensionPlanValuationsApi, 'listPensionPlanValuations').mockResolvedValue([]);
      vi.spyOn(cashHoldingsApi, 'listCashHoldings').mockResolvedValue([]);
      vi.spyOn(cashBalancesApi, 'listCashBalances').mockResolvedValue([]);

      renderPage();

      expect(await screen.findByText('Todavía no tienes ningún plan de pensiones.')).toBeInTheDocument();
    });

    it('lista un plan existente, con el total aportado y el % de ganancia o pérdida', async () => {
      mockOtherApis();
      vi.spyOn(pensionPlansApi, 'listPensionPlans').mockResolvedValue([PENSION_PLAN]);
      vi.spyOn(pensionPlanContributionsApi, 'listPensionPlanContributions').mockResolvedValue([PENSION_PLAN_CONTRIBUTION]);
      vi.spyOn(pensionPlanValuationsApi, 'listPensionPlanValuations').mockResolvedValue([PENSION_PLAN_VALUATION]);
      vi.spyOn(cashHoldingsApi, 'listCashHoldings').mockResolvedValue([]);
      vi.spyOn(cashBalancesApi, 'listCashBalances').mockResolvedValue([]);

      renderPage();

      const list = await screen.findByRole('list', { name: 'Tus planes de pensiones' });
      expect(within(list).getByText(/Plan Futuro Sostenible · Caixabank/)).toBeInTheDocument();
      // Aparece dos veces: en la tarjeta (valor actual) y en el historial de valoraciones (la propia entrada).
      expect(within(list).getAllByText('1950,00 €')).toHaveLength(2);
      expect(within(list).getByText(/Total aportado:/)).toHaveTextContent('Total aportado: 1800,00 €');
      // (1950 - 1800) / 1800 × 100 = +8,33%.
      const gainLossEl = within(list).getByText('+8.33%');
      expect(gainLossEl).toHaveStyle({ color: 'var(--status-green)' });

      const contributionHistory = within(list).getByRole('list', { name: 'Historial de aportaciones de Plan Futuro Sostenible · Caixabank' });
      expect(within(contributionHistory).getByText('2026-09-04')).toBeInTheDocument();

      const valuationHistory = within(list).getByRole('list', { name: 'Historial de valoraciones de Plan Futuro Sostenible · Caixabank' });
      expect(within(valuationHistory).getByText('1950,00 €')).toBeInTheDocument();
    });

    it('con pérdidas, el % se muestra en rojo', async () => {
      mockOtherApis();
      vi.spyOn(pensionPlansApi, 'listPensionPlans').mockResolvedValue([PENSION_PLAN]);
      vi.spyOn(pensionPlanContributionsApi, 'listPensionPlanContributions').mockResolvedValue([PENSION_PLAN_CONTRIBUTION]);
      vi.spyOn(pensionPlanValuationsApi, 'listPensionPlanValuations').mockResolvedValue([{ ...PENSION_PLAN_VALUATION, value: '1400.00' }]);
      vi.spyOn(cashHoldingsApi, 'listCashHoldings').mockResolvedValue([]);
      vi.spyOn(cashBalancesApi, 'listCashBalances').mockResolvedValue([]);

      renderPage();

      const list = await screen.findByRole('list', { name: 'Tus planes de pensiones' });
      // (1400 - 1800) / 1800 × 100 = -22,22%.
      const gainLossEl = within(list).getByText('-22.22%');
      expect(gainLossEl).toHaveStyle({ color: 'var(--status-red)' });
    });

    it('sin ninguna aportación, no muestra % de ganancia/pérdida aunque haya valoración', async () => {
      mockOtherApis();
      vi.spyOn(pensionPlansApi, 'listPensionPlans').mockResolvedValue([PENSION_PLAN]);
      vi.spyOn(pensionPlanContributionsApi, 'listPensionPlanContributions').mockResolvedValue([]);
      vi.spyOn(pensionPlanValuationsApi, 'listPensionPlanValuations').mockResolvedValue([PENSION_PLAN_VALUATION]);
      vi.spyOn(cashHoldingsApi, 'listCashHoldings').mockResolvedValue([]);
      vi.spyOn(cashBalancesApi, 'listCashBalances').mockResolvedValue([]);

      renderPage();

      const list = await screen.findByRole('list', { name: 'Tus planes de pensiones' });
      await within(list).findByText(/Plan Futuro Sostenible · Caixabank/);
      expect(within(list).queryByText(/%$/)).not.toBeInTheDocument();
    });

    it('un plan sin ninguna valoración muestra "Sin valoración"', async () => {
      mockOtherApis();
      vi.spyOn(pensionPlansApi, 'listPensionPlans').mockResolvedValue([PENSION_PLAN]);
      vi.spyOn(pensionPlanContributionsApi, 'listPensionPlanContributions').mockResolvedValue([]);
      vi.spyOn(pensionPlanValuationsApi, 'listPensionPlanValuations').mockResolvedValue([]);
      vi.spyOn(cashHoldingsApi, 'listCashHoldings').mockResolvedValue([]);
      vi.spyOn(cashBalancesApi, 'listCashBalances').mockResolvedValue([]);

      renderPage();

      const list = await screen.findByRole('list', { name: 'Tus planes de pensiones' });
      expect(within(list).getByText('Sin valoración')).toBeInTheDocument();
      expect(within(list).getByText('Todavía no hay ninguna aportación registrada en este plan.')).toBeInTheDocument();
      expect(within(list).getByText('Todavía no hay ninguna valoración registrada en este plan.')).toBeInTheDocument();
    });

    it('el formulario de alta trae la fecha de hoy por defecto', async () => {
      mockOtherApis();
      vi.spyOn(pensionPlansApi, 'listPensionPlans').mockResolvedValue([]);
      vi.spyOn(pensionPlanContributionsApi, 'listPensionPlanContributions').mockResolvedValue([]);
      vi.spyOn(pensionPlanValuationsApi, 'listPensionPlanValuations').mockResolvedValue([]);
      vi.spyOn(cashHoldingsApi, 'listCashHoldings').mockResolvedValue([]);
      vi.spyOn(cashBalancesApi, 'listCashBalances').mockResolvedValue([]);

      renderPage();
      const form = await screen.findByRole('form', { name: 'Añadir plan de pensiones' });

      expect(within(form).getByLabelText('Fecha de aportación')).toHaveValue(todayIso());
    });

    it('crea un plan y su primera aportación desde el formulario de alta, en un solo paso', async () => {
      mockOtherApis();
      const listPlansSpy = vi.spyOn(pensionPlansApi, 'listPensionPlans').mockResolvedValue([]);
      const listContributionsSpy = vi.spyOn(pensionPlanContributionsApi, 'listPensionPlanContributions').mockResolvedValue([]);
      vi.spyOn(pensionPlanValuationsApi, 'listPensionPlanValuations').mockResolvedValue([]);
      vi.spyOn(cashHoldingsApi, 'listCashHoldings').mockResolvedValue([]);
      vi.spyOn(cashBalancesApi, 'listCashBalances').mockResolvedValue([]);
      const createPlanSpy = vi.spyOn(pensionPlansApi, 'createPensionPlan').mockResolvedValue(PENSION_PLAN);
      const createContributionSpy = vi
        .spyOn(pensionPlanContributionsApi, 'createPensionPlanContribution')
        .mockResolvedValue(PENSION_PLAN_CONTRIBUTION);

      renderPage();
      const form = await screen.findByRole('form', { name: 'Añadir plan de pensiones' });

      await userEvent.type(within(form).getByLabelText('Entidad Gestora'), 'Caixabank');
      await userEvent.type(within(form).getByLabelText('Plan'), 'Plan Futuro Sostenible');
      await userEvent.type(within(form).getByLabelText('Importe'), '1800.00');
      await userEvent.click(within(form).getByRole('button', { name: 'Añadir plan' }));

      await waitFor(() =>
        expect(createPlanSpy).toHaveBeenCalledWith({ managingEntity: 'Caixabank', plan: 'Plan Futuro Sostenible' }),
      );
      await waitFor(() =>
        expect(createContributionSpy).toHaveBeenCalledWith({
          pensionPlanId: PENSION_PLAN.id,
          amount: '1800.00',
          date: todayIso(),
        }),
      );
      await waitFor(() => expect(listPlansSpy).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(listContributionsSpy).toHaveBeenCalledTimes(2));
    });

    it('no puede crear dos veces el mismo plan (409)', async () => {
      mockOtherApis();
      vi.spyOn(pensionPlansApi, 'listPensionPlans').mockResolvedValue([]);
      vi.spyOn(pensionPlanContributionsApi, 'listPensionPlanContributions').mockResolvedValue([]);
      vi.spyOn(pensionPlanValuationsApi, 'listPensionPlanValuations').mockResolvedValue([]);
      vi.spyOn(cashHoldingsApi, 'listCashHoldings').mockResolvedValue([]);
      vi.spyOn(cashBalancesApi, 'listCashBalances').mockResolvedValue([]);
      vi.spyOn(pensionPlansApi, 'createPensionPlan').mockRejectedValue(
        new ApiError(409, 'Ya tienes registrado ese plan de pensiones (misma entidad gestora y plan). Añade la aportación o valoración dentro de él.'),
      );

      renderPage();
      const form = await screen.findByRole('form', { name: 'Añadir plan de pensiones' });

      await userEvent.type(within(form).getByLabelText('Entidad Gestora'), 'Caixabank');
      await userEvent.type(within(form).getByLabelText('Plan'), 'Plan Futuro Sostenible');
      await userEvent.type(within(form).getByLabelText('Importe'), '1800.00');
      await userEvent.click(within(form).getByRole('button', { name: 'Añadir plan' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('Ya tienes registrado ese plan de pensiones');
    });

    it('edita un plan existente', async () => {
      mockOtherApis();
      vi.spyOn(pensionPlansApi, 'listPensionPlans').mockResolvedValue([PENSION_PLAN]);
      vi.spyOn(pensionPlanContributionsApi, 'listPensionPlanContributions').mockResolvedValue([]);
      vi.spyOn(pensionPlanValuationsApi, 'listPensionPlanValuations').mockResolvedValue([]);
      vi.spyOn(cashHoldingsApi, 'listCashHoldings').mockResolvedValue([]);
      vi.spyOn(cashBalancesApi, 'listCashBalances').mockResolvedValue([]);
      const updateSpy = vi.spyOn(pensionPlansApi, 'updatePensionPlan').mockResolvedValue(PENSION_PLAN);

      renderPage();
      await screen.findByRole('list', { name: 'Tus planes de pensiones' });

      await userEvent.click(screen.getByRole('button', { name: 'Editar plan: Plan Futuro Sostenible · Caixabank' }));
      const editForm = screen.getByRole('form', { name: 'Editar plan: Plan Futuro Sostenible · Caixabank' });
      const planInput = within(editForm).getByLabelText('Plan');
      await userEvent.clear(planInput);
      await userEvent.type(planInput, 'Plan Crecimiento');
      await userEvent.click(within(editForm).getByRole('button', { name: 'Guardar' }));

      await waitFor(() => expect(updateSpy).toHaveBeenCalledWith(PENSION_PLAN.id, { managingEntity: 'Caixabank', plan: 'Plan Crecimiento' }));
    });

    it('elimina un plan, junto con su historial', async () => {
      mockOtherApis();
      vi.spyOn(pensionPlansApi, 'listPensionPlans').mockResolvedValue([PENSION_PLAN]);
      vi.spyOn(pensionPlanContributionsApi, 'listPensionPlanContributions').mockResolvedValue([PENSION_PLAN_CONTRIBUTION]);
      vi.spyOn(pensionPlanValuationsApi, 'listPensionPlanValuations').mockResolvedValue([PENSION_PLAN_VALUATION]);
      vi.spyOn(cashHoldingsApi, 'listCashHoldings').mockResolvedValue([]);
      vi.spyOn(cashBalancesApi, 'listCashBalances').mockResolvedValue([]);
      const deleteSpy = vi.spyOn(pensionPlansApi, 'deletePensionPlan').mockResolvedValue(undefined);

      renderPage();
      await screen.findByRole('list', { name: 'Tus planes de pensiones' });

      await userEvent.click(screen.getByRole('button', { name: 'Eliminar plan: Plan Futuro Sostenible · Caixabank' }));

      await waitFor(() => expect(deleteSpy).toHaveBeenCalledWith(PENSION_PLAN.id));
    });

    it('añade una aportación a un plan existente', async () => {
      mockOtherApis();
      vi.spyOn(pensionPlansApi, 'listPensionPlans').mockResolvedValue([PENSION_PLAN]);
      const listContributionsSpy = vi.spyOn(pensionPlanContributionsApi, 'listPensionPlanContributions').mockResolvedValue([]);
      vi.spyOn(pensionPlanValuationsApi, 'listPensionPlanValuations').mockResolvedValue([]);
      vi.spyOn(cashHoldingsApi, 'listCashHoldings').mockResolvedValue([]);
      vi.spyOn(cashBalancesApi, 'listCashBalances').mockResolvedValue([]);
      const createSpy = vi
        .spyOn(pensionPlanContributionsApi, 'createPensionPlanContribution')
        .mockResolvedValue(PENSION_PLAN_CONTRIBUTION);

      renderPage();
      const form = await screen.findByRole('form', { name: 'Añadir aportación: Plan Futuro Sostenible · Caixabank' });

      await userEvent.type(within(form).getByLabelText('Importe'), '1800.00');
      await userEvent.click(within(form).getByRole('button', { name: 'Añadir aportación' }));

      await waitFor(() =>
        expect(createSpy).toHaveBeenCalledWith({ pensionPlanId: PENSION_PLAN.id, amount: '1800.00', date: todayIso() }),
      );
      await waitFor(() => expect(listContributionsSpy).toHaveBeenCalledTimes(2));
    });

    it('edita una aportación del historial', async () => {
      mockOtherApis();
      vi.spyOn(pensionPlansApi, 'listPensionPlans').mockResolvedValue([PENSION_PLAN]);
      vi.spyOn(pensionPlanContributionsApi, 'listPensionPlanContributions').mockResolvedValue([PENSION_PLAN_CONTRIBUTION]);
      vi.spyOn(pensionPlanValuationsApi, 'listPensionPlanValuations').mockResolvedValue([]);
      vi.spyOn(cashHoldingsApi, 'listCashHoldings').mockResolvedValue([]);
      vi.spyOn(cashBalancesApi, 'listCashBalances').mockResolvedValue([]);
      const updateSpy = vi
        .spyOn(pensionPlanContributionsApi, 'updatePensionPlanContribution')
        .mockResolvedValue(PENSION_PLAN_CONTRIBUTION);

      renderPage();
      await screen.findByRole('list', { name: 'Tus planes de pensiones' });

      const contributionLabel = 'Editar aportación de Plan Futuro Sostenible · Caixabank: 2026-09-04 · 1800.00€';
      await userEvent.click(screen.getByRole('button', { name: contributionLabel }));
      const editForm = screen.getByRole('form', { name: contributionLabel });
      const amountInput = within(editForm).getByLabelText('Importe');
      await userEvent.clear(amountInput);
      await userEvent.type(amountInput, '2000.00');
      await userEvent.click(within(editForm).getByRole('button', { name: 'Guardar' }));

      await waitFor(() =>
        expect(updateSpy).toHaveBeenCalledWith(PENSION_PLAN_CONTRIBUTION.id, { amount: '2000.00', date: '2026-09-04' }),
      );
    });

    it('elimina una aportación del historial, sin borrar el plan', async () => {
      mockOtherApis();
      vi.spyOn(pensionPlansApi, 'listPensionPlans').mockResolvedValue([PENSION_PLAN]);
      vi.spyOn(pensionPlanContributionsApi, 'listPensionPlanContributions').mockResolvedValue([PENSION_PLAN_CONTRIBUTION]);
      vi.spyOn(pensionPlanValuationsApi, 'listPensionPlanValuations').mockResolvedValue([]);
      vi.spyOn(cashHoldingsApi, 'listCashHoldings').mockResolvedValue([]);
      vi.spyOn(cashBalancesApi, 'listCashBalances').mockResolvedValue([]);
      const deleteContributionSpy = vi
        .spyOn(pensionPlanContributionsApi, 'deletePensionPlanContribution')
        .mockResolvedValue(undefined);
      const deletePlanSpy = vi.spyOn(pensionPlansApi, 'deletePensionPlan');

      renderPage();
      await screen.findByRole('list', { name: 'Tus planes de pensiones' });

      await userEvent.click(
        screen.getByRole('button', { name: 'Eliminar aportación de Plan Futuro Sostenible · Caixabank: 2026-09-04 · 1800.00€' }),
      );

      await waitFor(() => expect(deleteContributionSpy).toHaveBeenCalledWith(PENSION_PLAN_CONTRIBUTION.id));
      expect(deletePlanSpy).not.toHaveBeenCalled();
    });

    it('añade una valoración a un plan existente', async () => {
      mockOtherApis();
      vi.spyOn(pensionPlansApi, 'listPensionPlans').mockResolvedValue([PENSION_PLAN]);
      vi.spyOn(pensionPlanContributionsApi, 'listPensionPlanContributions').mockResolvedValue([]);
      const listValuationsSpy = vi.spyOn(pensionPlanValuationsApi, 'listPensionPlanValuations').mockResolvedValue([]);
      vi.spyOn(cashHoldingsApi, 'listCashHoldings').mockResolvedValue([]);
      vi.spyOn(cashBalancesApi, 'listCashBalances').mockResolvedValue([]);
      const createSpy = vi
        .spyOn(pensionPlanValuationsApi, 'createPensionPlanValuation')
        .mockResolvedValue(PENSION_PLAN_VALUATION);

      renderPage();
      const form = await screen.findByRole('form', { name: 'Añadir valoración: Plan Futuro Sostenible · Caixabank' });

      await userEvent.type(within(form).getByLabelText('Valor total actual'), '1950.00');
      await userEvent.click(within(form).getByRole('button', { name: 'Añadir valoración' }));

      await waitFor(() =>
        expect(createSpy).toHaveBeenCalledWith({ pensionPlanId: PENSION_PLAN.id, value: '1950.00', date: todayIso() }),
      );
      await waitFor(() => expect(listValuationsSpy).toHaveBeenCalledTimes(2));
    });

    it('edita una valoración del historial', async () => {
      mockOtherApis();
      vi.spyOn(pensionPlansApi, 'listPensionPlans').mockResolvedValue([PENSION_PLAN]);
      vi.spyOn(pensionPlanContributionsApi, 'listPensionPlanContributions').mockResolvedValue([]);
      vi.spyOn(pensionPlanValuationsApi, 'listPensionPlanValuations').mockResolvedValue([PENSION_PLAN_VALUATION]);
      vi.spyOn(cashHoldingsApi, 'listCashHoldings').mockResolvedValue([]);
      vi.spyOn(cashBalancesApi, 'listCashBalances').mockResolvedValue([]);
      const updateSpy = vi.spyOn(pensionPlanValuationsApi, 'updatePensionPlanValuation').mockResolvedValue(PENSION_PLAN_VALUATION);

      renderPage();
      await screen.findByRole('list', { name: 'Tus planes de pensiones' });

      const valuationLabel = 'Editar valoración de Plan Futuro Sostenible · Caixabank del 2026-09-04';
      await userEvent.click(screen.getByRole('button', { name: valuationLabel }));
      const editForm = screen.getByRole('form', { name: valuationLabel });
      const valueInput = within(editForm).getByLabelText('Valor total actual');
      await userEvent.clear(valueInput);
      await userEvent.type(valueInput, '2000.00');
      await userEvent.click(within(editForm).getByRole('button', { name: 'Guardar' }));

      await waitFor(() =>
        expect(updateSpy).toHaveBeenCalledWith(PENSION_PLAN_VALUATION.id, { value: '2000.00', date: '2026-09-04' }),
      );
    });

    it('elimina una valoración del historial, sin borrar el plan', async () => {
      mockOtherApis();
      vi.spyOn(pensionPlansApi, 'listPensionPlans').mockResolvedValue([PENSION_PLAN]);
      vi.spyOn(pensionPlanContributionsApi, 'listPensionPlanContributions').mockResolvedValue([]);
      vi.spyOn(pensionPlanValuationsApi, 'listPensionPlanValuations').mockResolvedValue([PENSION_PLAN_VALUATION]);
      vi.spyOn(cashHoldingsApi, 'listCashHoldings').mockResolvedValue([]);
      vi.spyOn(cashBalancesApi, 'listCashBalances').mockResolvedValue([]);
      const deleteValuationSpy = vi.spyOn(pensionPlanValuationsApi, 'deletePensionPlanValuation').mockResolvedValue(undefined);
      const deletePlanSpy = vi.spyOn(pensionPlansApi, 'deletePensionPlan');

      renderPage();
      await screen.findByRole('list', { name: 'Tus planes de pensiones' });

      await userEvent.click(
        screen.getByRole('button', { name: 'Eliminar valoración de Plan Futuro Sostenible · Caixabank del 2026-09-04' }),
      );

      await waitFor(() => expect(deleteValuationSpy).toHaveBeenCalledWith(PENSION_PLAN_VALUATION.id));
      expect(deletePlanSpy).not.toHaveBeenCalled();
    });
  });

  describe('Efectivo (spec 025)', () => {
    function mockOtherApis() {
      vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
      vi.spyOn(bankAccountsApi, 'listBankAccounts').mockResolvedValue([]);
      vi.spyOn(bankAccountBalancesApi, 'listBankAccountBalances').mockResolvedValue([]);
      vi.spyOn(stocksApi, 'listStocks').mockResolvedValue([]);
      vi.spyOn(stockPurchasesApi, 'listStockPurchases').mockResolvedValue([]);
      vi.spyOn(stockValuationsApi, 'listStockValuations').mockResolvedValue([]);
      vi.spyOn(stockDividendsApi, 'listStockDividends').mockResolvedValue([]);
      vi.spyOn(fundsApi, 'listFunds').mockResolvedValue([]);
      vi.spyOn(fundPurchasesApi, 'listFundPurchases').mockResolvedValue([]);
      vi.spyOn(fundValuationsApi, 'listFundValuations').mockResolvedValue([]);
      vi.spyOn(fundDividendsApi, 'listFundDividends').mockResolvedValue([]);
      vi.spyOn(cryptosApi, 'listCryptos').mockResolvedValue([]);
      vi.spyOn(cryptoPurchasesApi, 'listCryptoPurchases').mockResolvedValue([]);
      vi.spyOn(cryptoValuationsApi, 'listCryptoValuations').mockResolvedValue([]);
      vi.spyOn(vehiclesApi, 'listVehicles').mockResolvedValue([]);
      vi.spyOn(vehicleValuationsApi, 'listVehicleValuations').mockResolvedValue([]);
      vi.spyOn(pensionPlansApi, 'listPensionPlans').mockResolvedValue([]);
      vi.spyOn(pensionPlanContributionsApi, 'listPensionPlanContributions').mockResolvedValue([]);
      vi.spyOn(pensionPlanValuationsApi, 'listPensionPlanValuations').mockResolvedValue([]);
    }

    it('sin ninguna ubicación, muestra el aviso de "todavía no tienes nada"', async () => {
      mockOtherApis();
      vi.spyOn(cashHoldingsApi, 'listCashHoldings').mockResolvedValue([]);
      vi.spyOn(cashBalancesApi, 'listCashBalances').mockResolvedValue([]);

      renderPage();

      expect(await screen.findByText('Todavía no tienes ninguna ubicación de efectivo.')).toBeInTheDocument();
    });

    it('lista una ubicación existente, con su importe más reciente', async () => {
      mockOtherApis();
      vi.spyOn(cashHoldingsApi, 'listCashHoldings').mockResolvedValue([CASH_HOLDING]);
      vi.spyOn(cashBalancesApi, 'listCashBalances').mockResolvedValue([CASH_BALANCE]);

      renderPage();

      const list = await screen.findByRole('list', { name: 'Tus ubicaciones de efectivo' });
      expect(within(list).getByText('Cartera')).toBeInTheDocument();
      // Aparece dos veces: en la tarjeta (importe actual) y en el historial (la propia entrada).
      expect(within(list).getAllByText('200,00 €')).toHaveLength(2);
      expect(within(list).getByText('Última fecha: 2026-09-04')).toBeInTheDocument();

      const history = within(list).getByRole('list', { name: 'Historial de Cartera' });
      expect(within(history).getByText('2026-09-04')).toBeInTheDocument();
    });

    it('una ubicación sin ningún importe muestra "Sin importe"', async () => {
      mockOtherApis();
      vi.spyOn(cashHoldingsApi, 'listCashHoldings').mockResolvedValue([CASH_HOLDING]);
      vi.spyOn(cashBalancesApi, 'listCashBalances').mockResolvedValue([]);

      renderPage();

      const list = await screen.findByRole('list', { name: 'Tus ubicaciones de efectivo' });
      expect(within(list).getByText('Sin importe')).toBeInTheDocument();
      expect(within(list).getByText('Todavía no hay ningún importe registrado en esta ubicación.')).toBeInTheDocument();
    });

    it('crea una ubicación desde el formulario de alta', async () => {
      mockOtherApis();
      const listSpy = vi.spyOn(cashHoldingsApi, 'listCashHoldings').mockResolvedValue([]);
      vi.spyOn(cashBalancesApi, 'listCashBalances').mockResolvedValue([]);
      const createSpy = vi.spyOn(cashHoldingsApi, 'createCashHolding').mockResolvedValue(CASH_HOLDING);

      renderPage();
      const form = await screen.findByRole('form', { name: 'Añadir ubicación de efectivo' });

      await userEvent.type(within(form).getByLabelText('Ubicación'), 'Cartera');
      await userEvent.click(within(form).getByRole('button', { name: 'Añadir ubicación' }));

      await waitFor(() => expect(createSpy).toHaveBeenCalledWith({ location: 'Cartera' }));
      await waitFor(() => expect(listSpy).toHaveBeenCalledTimes(2));
    });

    it('no puede crear dos veces la misma ubicación (409)', async () => {
      mockOtherApis();
      vi.spyOn(cashHoldingsApi, 'listCashHoldings').mockResolvedValue([]);
      vi.spyOn(cashBalancesApi, 'listCashBalances').mockResolvedValue([]);
      vi.spyOn(cashHoldingsApi, 'createCashHolding').mockRejectedValue(
        new ApiError(409, 'Ya tienes registrada esa ubicación de efectivo. Añade el importe dentro de ella.'),
      );

      renderPage();
      const form = await screen.findByRole('form', { name: 'Añadir ubicación de efectivo' });

      await userEvent.type(within(form).getByLabelText('Ubicación'), 'Cartera');
      await userEvent.click(within(form).getByRole('button', { name: 'Añadir ubicación' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('Ya tienes registrada esa ubicación de efectivo');
    });

    it('edita una ubicación existente', async () => {
      mockOtherApis();
      vi.spyOn(cashHoldingsApi, 'listCashHoldings').mockResolvedValue([CASH_HOLDING]);
      vi.spyOn(cashBalancesApi, 'listCashBalances').mockResolvedValue([]);
      const updateSpy = vi.spyOn(cashHoldingsApi, 'updateCashHolding').mockResolvedValue(CASH_HOLDING);

      renderPage();
      await screen.findByRole('list', { name: 'Tus ubicaciones de efectivo' });

      await userEvent.click(screen.getByRole('button', { name: 'Editar ubicación: Cartera' }));
      const editForm = screen.getByRole('form', { name: 'Editar ubicación: Cartera' });
      const locationInput = within(editForm).getByLabelText('Ubicación');
      await userEvent.clear(locationInput);
      await userEvent.type(locationInput, 'Caja fuerte');
      await userEvent.click(within(editForm).getByRole('button', { name: 'Guardar' }));

      await waitFor(() => expect(updateSpy).toHaveBeenCalledWith(CASH_HOLDING.id, { location: 'Caja fuerte' }));
    });

    it('elimina una ubicación', async () => {
      mockOtherApis();
      vi.spyOn(cashHoldingsApi, 'listCashHoldings').mockResolvedValue([CASH_HOLDING]);
      vi.spyOn(cashBalancesApi, 'listCashBalances').mockResolvedValue([]);
      const deleteSpy = vi.spyOn(cashHoldingsApi, 'deleteCashHolding').mockResolvedValue(undefined);

      renderPage();
      await screen.findByRole('list', { name: 'Tus ubicaciones de efectivo' });

      await userEvent.click(screen.getByRole('button', { name: 'Eliminar ubicación: Cartera' }));

      await waitFor(() => expect(deleteSpy).toHaveBeenCalledWith(CASH_HOLDING.id));
    });

    it('el formulario de importe de una ubicación trae la fecha de hoy por defecto', async () => {
      mockOtherApis();
      vi.spyOn(cashHoldingsApi, 'listCashHoldings').mockResolvedValue([CASH_HOLDING]);
      vi.spyOn(cashBalancesApi, 'listCashBalances').mockResolvedValue([]);

      renderPage();
      const form = await screen.findByRole('form', { name: 'Añadir importe: Cartera' });

      expect(within(form).getByLabelText('Fecha')).toHaveValue(todayIso());
    });

    it('añade un importe a una ubicación existente', async () => {
      mockOtherApis();
      vi.spyOn(cashHoldingsApi, 'listCashHoldings').mockResolvedValue([CASH_HOLDING]);
      const listBalancesSpy = vi.spyOn(cashBalancesApi, 'listCashBalances').mockResolvedValue([]);
      const createSpy = vi.spyOn(cashBalancesApi, 'createCashBalance').mockResolvedValue(CASH_BALANCE);

      renderPage();
      const form = await screen.findByRole('form', { name: 'Añadir importe: Cartera' });

      await userEvent.type(within(form).getByLabelText('Importe'), '200.00');
      await userEvent.click(within(form).getByRole('button', { name: 'Añadir importe' }));

      await waitFor(() => expect(createSpy).toHaveBeenCalledWith({ cashHoldingId: CASH_HOLDING.id, amount: '200.00', date: todayIso() }));
      await waitFor(() => expect(listBalancesSpy).toHaveBeenCalledTimes(2));
    });

    it('edita una entrada de importe del historial', async () => {
      mockOtherApis();
      vi.spyOn(cashHoldingsApi, 'listCashHoldings').mockResolvedValue([CASH_HOLDING]);
      vi.spyOn(cashBalancesApi, 'listCashBalances').mockResolvedValue([CASH_BALANCE]);
      const updateSpy = vi.spyOn(cashBalancesApi, 'updateCashBalance').mockResolvedValue(CASH_BALANCE);

      renderPage();
      await screen.findByRole('list', { name: 'Tus ubicaciones de efectivo' });

      await userEvent.click(screen.getByRole('button', { name: 'Editar importe del 2026-09-04' }));
      const editForm = screen.getByRole('form', { name: 'Editar importe del 2026-09-04' });
      const amountInput = within(editForm).getByLabelText('Importe');
      await userEvent.clear(amountInput);
      await userEvent.type(amountInput, '250.00');
      await userEvent.click(within(editForm).getByRole('button', { name: 'Guardar' }));

      await waitFor(() => expect(updateSpy).toHaveBeenCalledWith(CASH_BALANCE.id, { amount: '250.00', date: '2026-09-04' }));
    });

    it('elimina una entrada de importe del historial, sin borrar la ubicación', async () => {
      mockOtherApis();
      vi.spyOn(cashHoldingsApi, 'listCashHoldings').mockResolvedValue([CASH_HOLDING]);
      vi.spyOn(cashBalancesApi, 'listCashBalances').mockResolvedValue([CASH_BALANCE]);
      const deleteBalanceSpy = vi.spyOn(cashBalancesApi, 'deleteCashBalance').mockResolvedValue(undefined);
      const deleteHoldingSpy = vi.spyOn(cashHoldingsApi, 'deleteCashHolding');

      renderPage();
      await screen.findByRole('list', { name: 'Tus ubicaciones de efectivo' });

      await userEvent.click(screen.getByRole('button', { name: 'Eliminar importe del 2026-09-04' }));

      await waitFor(() => expect(deleteBalanceSpy).toHaveBeenCalledWith(CASH_BALANCE.id));
      expect(deleteHoldingSpy).not.toHaveBeenCalled();
    });
  });

  describe('Evolución del patrimonio (spec 027)', () => {
    function mockAllApisEmpty() {
      vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
      vi.spyOn(bankAccountsApi, 'listBankAccounts').mockResolvedValue([]);
      vi.spyOn(bankAccountBalancesApi, 'listBankAccountBalances').mockResolvedValue([]);
      vi.spyOn(stocksApi, 'listStocks').mockResolvedValue([]);
      vi.spyOn(stockPurchasesApi, 'listStockPurchases').mockResolvedValue([]);
      vi.spyOn(stockValuationsApi, 'listStockValuations').mockResolvedValue([]);
      vi.spyOn(stockDividendsApi, 'listStockDividends').mockResolvedValue([]);
      vi.spyOn(fundsApi, 'listFunds').mockResolvedValue([]);
      vi.spyOn(fundPurchasesApi, 'listFundPurchases').mockResolvedValue([]);
      vi.spyOn(fundValuationsApi, 'listFundValuations').mockResolvedValue([]);
      vi.spyOn(fundDividendsApi, 'listFundDividends').mockResolvedValue([]);
      vi.spyOn(cryptosApi, 'listCryptos').mockResolvedValue([]);
      vi.spyOn(cryptoPurchasesApi, 'listCryptoPurchases').mockResolvedValue([]);
      vi.spyOn(cryptoValuationsApi, 'listCryptoValuations').mockResolvedValue([]);
      vi.spyOn(vehiclesApi, 'listVehicles').mockResolvedValue([]);
      vi.spyOn(vehicleValuationsApi, 'listVehicleValuations').mockResolvedValue([]);
      vi.spyOn(pensionPlansApi, 'listPensionPlans').mockResolvedValue([]);
      vi.spyOn(pensionPlanContributionsApi, 'listPensionPlanContributions').mockResolvedValue([]);
      vi.spyOn(pensionPlanValuationsApi, 'listPensionPlanValuations').mockResolvedValue([]);
      vi.spyOn(cashHoldingsApi, 'listCashHoldings').mockResolvedValue([]);
      vi.spyOn(cashBalancesApi, 'listCashBalances').mockResolvedValue([]);
    }

    it('rango por defecto "Últimos 12 meses" y pinta la serie con los datos disponibles', async () => {
      mockAllApisEmpty();
      vi.spyOn(bankAccountsApi, 'listBankAccounts').mockResolvedValue([BANK_ACCOUNT]);
      vi.spyOn(bankAccountBalancesApi, 'listBankAccountBalances').mockResolvedValue([BANK_BALANCE]);

      renderPage();

      const select = await screen.findByLabelText('Periodo');
      expect(select).toHaveValue('last12Months');
      expect(await screen.findByRole('table', { name: 'Evolución del patrimonio (tabla)' })).toBeInTheDocument();
      expect(screen.queryByText('No hay datos de patrimonio en este periodo.')).not.toBeInTheDocument();
    });

    it('sin ningún dato en ninguna categoría, muestra el estado vacío en vez de un gráfico en blanco', async () => {
      mockAllApisEmpty();

      renderPage();

      await screen.findByLabelText('Periodo');
      expect(screen.getByText('No hay datos de patrimonio en este periodo.')).toBeInTheDocument();
      expect(screen.queryByRole('table', { name: 'Evolución del patrimonio (tabla)' })).not.toBeInTheDocument();
    });

    it('cambiar a "Todo el histórico" recalcula el gráfico con los datos disponibles', async () => {
      mockAllApisEmpty();
      vi.spyOn(bankAccountsApi, 'listBankAccounts').mockResolvedValue([BANK_ACCOUNT]);
      vi.spyOn(bankAccountBalancesApi, 'listBankAccountBalances').mockResolvedValue([BANK_BALANCE]);

      renderPage();
      const select = await screen.findByLabelText('Periodo');

      await userEvent.selectOptions(select, 'allTime');
      expect(await screen.findByRole('table', { name: 'Evolución del patrimonio (tabla)' })).toBeInTheDocument();
    });

    it('rango personalizado: elegir un modo "custom" muestra los selectores de fecha', async () => {
      mockAllApisEmpty();
      vi.spyOn(bankAccountsApi, 'listBankAccounts').mockResolvedValue([BANK_ACCOUNT]);
      vi.spyOn(bankAccountBalancesApi, 'listBankAccountBalances').mockResolvedValue([BANK_BALANCE]);

      renderPage();
      const select = await screen.findByLabelText('Periodo');
      await userEvent.selectOptions(select, 'custom');

      expect(await screen.findByLabelText('Desde')).toBeInTheDocument();
      expect(screen.getByLabelText('Hasta')).toBeInTheDocument();
    });

    it('rango personalizado inválido (fin anterior a inicio) muestra un aviso y no rompe el render', async () => {
      mockAllApisEmpty();
      vi.spyOn(bankAccountsApi, 'listBankAccounts').mockResolvedValue([BANK_ACCOUNT]);
      vi.spyOn(bankAccountBalancesApi, 'listBankAccountBalances').mockResolvedValue([BANK_BALANCE]);

      renderPage();
      const select = await screen.findByLabelText('Periodo');
      await userEvent.selectOptions(select, 'custom');

      const startInput = await screen.findByLabelText('Desde');
      const endInput = screen.getByLabelText('Hasta');
      await userEvent.clear(endInput);
      await userEvent.type(endInput, '2020-01-01');
      await userEvent.clear(startInput);
      await userEvent.type(startInput, '2026-01-01');

      expect(
        await screen.findByText('La fecha de fin no puede ser anterior a la de inicio, ni posterior a hoy.'),
      ).toBeInTheDocument();
    });

    it('sin sesión activa, no se pinta ninguna parte de esta sección', async () => {
      vi.spyOn(authApi, 'refresh').mockRejectedValue(new ApiError(401, 'No hay sesión.'));

      renderPage();

      await screen.findByRole('alert');
      expect(screen.queryByLabelText('Periodo')).not.toBeInTheDocument();
    });
  });

  describe('Composición, liquidez y rentabilidad (spec 028)', () => {
    function mockAllApisEmpty() {
      vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
      vi.spyOn(bankAccountsApi, 'listBankAccounts').mockResolvedValue([]);
      vi.spyOn(bankAccountBalancesApi, 'listBankAccountBalances').mockResolvedValue([]);
      vi.spyOn(stocksApi, 'listStocks').mockResolvedValue([]);
      vi.spyOn(stockPurchasesApi, 'listStockPurchases').mockResolvedValue([]);
      vi.spyOn(stockValuationsApi, 'listStockValuations').mockResolvedValue([]);
      vi.spyOn(stockDividendsApi, 'listStockDividends').mockResolvedValue([]);
      vi.spyOn(fundsApi, 'listFunds').mockResolvedValue([]);
      vi.spyOn(fundPurchasesApi, 'listFundPurchases').mockResolvedValue([]);
      vi.spyOn(fundValuationsApi, 'listFundValuations').mockResolvedValue([]);
      vi.spyOn(fundDividendsApi, 'listFundDividends').mockResolvedValue([]);
      vi.spyOn(cryptosApi, 'listCryptos').mockResolvedValue([]);
      vi.spyOn(cryptoPurchasesApi, 'listCryptoPurchases').mockResolvedValue([]);
      vi.spyOn(cryptoValuationsApi, 'listCryptoValuations').mockResolvedValue([]);
      vi.spyOn(vehiclesApi, 'listVehicles').mockResolvedValue([]);
      vi.spyOn(vehicleValuationsApi, 'listVehicleValuations').mockResolvedValue([]);
      vi.spyOn(pensionPlansApi, 'listPensionPlans').mockResolvedValue([]);
      vi.spyOn(pensionPlanContributionsApi, 'listPensionPlanContributions').mockResolvedValue([]);
      vi.spyOn(pensionPlanValuationsApi, 'listPensionPlanValuations').mockResolvedValue([]);
      vi.spyOn(cashHoldingsApi, 'listCashHoldings').mockResolvedValue([]);
      vi.spyOn(cashBalancesApi, 'listCashBalances').mockResolvedValue([]);
    }

    function mockAllApisFull() {
      mockAllApisEmpty();
      vi.spyOn(bankAccountsApi, 'listBankAccounts').mockResolvedValue([BANK_ACCOUNT]);
      vi.spyOn(bankAccountBalancesApi, 'listBankAccountBalances').mockResolvedValue([BANK_BALANCE]);
      vi.spyOn(stocksApi, 'listStocks').mockResolvedValue([STOCK]);
      vi.spyOn(stockPurchasesApi, 'listStockPurchases').mockResolvedValue([STOCK_PURCHASE]);
      vi.spyOn(stockValuationsApi, 'listStockValuations').mockResolvedValue([STOCK_VALUATION]);
      vi.spyOn(stockDividendsApi, 'listStockDividends').mockResolvedValue([]);
      vi.spyOn(fundsApi, 'listFunds').mockResolvedValue([FUND]);
      vi.spyOn(fundPurchasesApi, 'listFundPurchases').mockResolvedValue([FUND_PURCHASE]);
      vi.spyOn(fundValuationsApi, 'listFundValuations').mockResolvedValue([FUND_VALUATION]);
      vi.spyOn(fundDividendsApi, 'listFundDividends').mockResolvedValue([]);
      vi.spyOn(cryptosApi, 'listCryptos').mockResolvedValue([CRYPTO]);
      vi.spyOn(cryptoPurchasesApi, 'listCryptoPurchases').mockResolvedValue([CRYPTO_PURCHASE]);
      vi.spyOn(cryptoValuationsApi, 'listCryptoValuations').mockResolvedValue([CRYPTO_VALUATION]);
      vi.spyOn(vehiclesApi, 'listVehicles').mockResolvedValue([VEHICLE]);
      vi.spyOn(vehicleValuationsApi, 'listVehicleValuations').mockResolvedValue([VEHICLE_VALUATION]);
      vi.spyOn(pensionPlansApi, 'listPensionPlans').mockResolvedValue([PENSION_PLAN]);
      vi.spyOn(pensionPlanContributionsApi, 'listPensionPlanContributions').mockResolvedValue([PENSION_PLAN_CONTRIBUTION]);
      vi.spyOn(pensionPlanValuationsApi, 'listPensionPlanValuations').mockResolvedValue([PENSION_PLAN_VALUATION]);
      vi.spyOn(cashHoldingsApi, 'listCashHoldings').mockResolvedValue([CASH_HOLDING]);
      vi.spyOn(cashBalancesApi, 'listCashBalances').mockResolvedValue([CASH_BALANCE]);
    }

    describe('Evolución del patrimonio — vistas "Por categoría" y "Liquidez" (H1/H2)', () => {
      it('vista "Por categoría" muestra la tabla de composición semanal y oculta la de "Total"', async () => {
        mockAllApisEmpty();
        vi.spyOn(bankAccountsApi, 'listBankAccounts').mockResolvedValue([BANK_ACCOUNT]);
        vi.spyOn(bankAccountBalancesApi, 'listBankAccountBalances').mockResolvedValue([BANK_BALANCE]);

        renderPage();
        const viewSelect = await screen.findByLabelText('Vista');
        await userEvent.selectOptions(viewSelect, 'byCategory');

        expect(await screen.findByRole('table', { name: 'Composición del patrimonio por semana (tabla)' })).toBeInTheDocument();
        expect(screen.queryByRole('table', { name: 'Evolución del patrimonio (tabla)' })).not.toBeInTheDocument();
      });

      it('una categoría sin ninguna entrada en el rango no aparece en la vista "Por categoría"', async () => {
        mockAllApisEmpty();
        vi.spyOn(bankAccountsApi, 'listBankAccounts').mockResolvedValue([BANK_ACCOUNT]);
        vi.spyOn(bankAccountBalancesApi, 'listBankAccountBalances').mockResolvedValue([BANK_BALANCE]);

        renderPage();
        const viewSelect = await screen.findByLabelText('Vista');
        await userEvent.selectOptions(viewSelect, 'byCategory');

        const table = await screen.findByRole('table', { name: 'Composición del patrimonio por semana (tabla)' });
        expect(within(table).getByText('Cuentas Bancarias')).toBeInTheDocument();
        expect(within(table).queryByText('Efectivo')).not.toBeInTheDocument();
      });

      it('vista "Liquidez" calcula el % de cuentas bancarias + efectivo sobre el total', async () => {
        mockAllApisEmpty();
        vi.spyOn(bankAccountsApi, 'listBankAccounts').mockResolvedValue([BANK_ACCOUNT]);
        vi.spyOn(bankAccountBalancesApi, 'listBankAccountBalances').mockResolvedValue([BANK_BALANCE]);
        vi.spyOn(vehiclesApi, 'listVehicles').mockResolvedValue([VEHICLE]);
        vi.spyOn(vehicleValuationsApi, 'listVehicleValuations').mockResolvedValue([VEHICLE_VALUATION]);

        renderPage();
        const viewSelect = await screen.findByLabelText('Vista');
        await userEvent.selectOptions(viewSelect, 'liquidity');

        // Líquido: 1500 (BANK_BALANCE). Total: 1500 + 15000 (VEHICLE_VALUATION) = 16500. Ratio: 9,1%.
        const table = await screen.findByRole('table', { name: 'Liquidez del patrimonio por semana (tabla)' });
        expect(within(table).getByText('9.1 %')).toBeInTheDocument();
      });
    });

    describe('Composición actual (H3)', () => {
      it('muestra las 7 categorías con su importe y % del total', async () => {
        mockAllApisFull();

        renderPage();

        const table = await screen.findByRole('table', { name: 'Composición actual (tabla)' });
        const rows = within(table).getAllByRole('row');
        expect(rows.length).toBe(8); // cabecera + 7 categorías
        expect(within(table).getByText('Vehículos')).toBeInTheDocument();
        // Vehículos: 15.000,00 € de un total de 22.700,00 € → 66.1 %.
        expect(within(table).getByText('66.1 %')).toBeInTheDocument();
      });

      it('una categoría con subtotal 0 no aparece en la composición actual', async () => {
        mockAllApisFull();
        vi.spyOn(cashHoldingsApi, 'listCashHoldings').mockResolvedValue([]);
        vi.spyOn(cashBalancesApi, 'listCashBalances').mockResolvedValue([]);

        renderPage();

        const table = await screen.findByRole('table', { name: 'Composición actual (tabla)' });
        expect(within(table).queryByText('Efectivo')).not.toBeInTheDocument();
      });
    });

    describe('Aportado vs. valor actual (H4)', () => {
      it('compara aportado y valor actual de Acciones/Fondos/Cripto/Fondo Pensiones, con el total agregado', async () => {
        mockAllApisFull();

        renderPage();

        const table = await screen.findByRole('table', { name: 'Aportado vs. valor actual (tabla)' });
        // Acciones: aportado 300,00 € (10 × 30,00 €), valor actual 350,00 € (10 × 35,00 €).
        const stocksRow = within(table).getByText('Acciones').closest('tr')!;
        expect(within(stocksRow).getByText('300,00 €')).toBeInTheDocument();
        expect(within(stocksRow).getByText('350,00 €')).toBeInTheDocument();
        // Total aportado: 300 + 300 + 3000 + 1800 = 5400,00 €. Total valor actual: 350 + 200 + 3500 + 1950 = 6000,00 €.
        const totalRow = within(table).getByText('Total').closest('tr')!;
        expect(within(totalRow).getByText('5400,00 €')).toBeInTheDocument();
        expect(within(totalRow).getByText('6000,00 €')).toBeInTheDocument();
      });

      it('una categoría sin ninguna posición no aparece', async () => {
        mockAllApisEmpty();
        vi.spyOn(stocksApi, 'listStocks').mockResolvedValue([STOCK]);
        vi.spyOn(stockPurchasesApi, 'listStockPurchases').mockResolvedValue([STOCK_PURCHASE]);
        vi.spyOn(stockValuationsApi, 'listStockValuations').mockResolvedValue([STOCK_VALUATION]);
        vi.spyOn(stockDividendsApi, 'listStockDividends').mockResolvedValue([]);

        renderPage();

        const table = await screen.findByRole('table', { name: 'Aportado vs. valor actual (tabla)' });
        expect(within(table).getByText('Acciones')).toBeInTheDocument();
        expect(within(table).queryByText('Cripto')).not.toBeInTheDocument();
        expect(within(table).queryByText('Fondo Pensiones')).not.toBeInTheDocument();
      });
    });

    describe('Rentabilidad por categoría (H5)', () => {
      it('calcula el % de ganancia/pérdida de las 5 categorías con coste conocido', async () => {
        mockAllApisFull();

        renderPage();

        const table = await screen.findByRole('table', { name: 'Rentabilidad por categoría (tabla)' });
        // Vehículos: (15.000 − 20.000) / 20.000 × 100 = -25.0 %.
        const vehiclesRow = within(table).getByText('Vehículos').closest('tr')!;
        expect(within(vehiclesRow).getByText('-25.0 %')).toBeInTheDocument();
        // Acciones: (350 − 300) / 300 × 100 = +16.7 %.
        const stocksRow = within(table).getByText('Acciones').closest('tr')!;
        expect(within(stocksRow).getByText('+16.7 %')).toBeInTheDocument();
      });

      it('Cuentas Bancarias y Efectivo no aparecen (sin coste de compra)', async () => {
        mockAllApisFull();

        renderPage();

        const table = await screen.findByRole('table', { name: 'Rentabilidad por categoría (tabla)' });
        expect(within(table).queryByText('Cuentas Bancarias')).not.toBeInTheDocument();
        expect(within(table).queryByText('Efectivo')).not.toBeInTheDocument();
      });

      it('una categoría sin ninguna posición no aparece', async () => {
        mockAllApisEmpty();

        renderPage();
        await screen.findByLabelText('Periodo');

        expect(screen.queryByRole('table', { name: 'Rentabilidad por categoría (tabla)' })).not.toBeInTheDocument();
      });
    });
  });
});
