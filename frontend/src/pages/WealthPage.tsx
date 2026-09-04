import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { useConnectivity } from '../hooks/useConnectivity';
import { createBankAccount, deleteBankAccount, listBankAccounts, updateBankAccount } from '../api/bank-accounts';
import type { BankAccount, BankAccountInput } from '../api/bank-accounts';
import {
  createBankAccountBalance,
  deleteBankAccountBalance,
  listBankAccountBalances,
  updateBankAccountBalance,
} from '../api/bank-account-balances';
import type { BankAccountBalance, UpdateBankAccountBalanceInput } from '../api/bank-account-balances';
import { createStock, deleteStock, listStocks, updateStock } from '../api/stocks';
import type { Stock, StockInput } from '../api/stocks';
import {
  createStockPurchase,
  deleteStockPurchase,
  listStockPurchases,
  updateStockPurchase,
} from '../api/stock-purchases';
import type { StockPurchase, UpdateStockPurchaseInput } from '../api/stock-purchases';
import {
  createStockValuation,
  deleteStockValuation,
  listStockValuations,
  updateStockValuation,
} from '../api/stock-valuations';
import type { StockValuation, UpdateStockValuationInput } from '../api/stock-valuations';
import { ApiError } from '../api/client';
import { formatCurrency } from './home-shared';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const EMPTY_ACCOUNT_FORM: BankAccountInput = { bank: '', accountNumber: '' };
const EMPTY_BALANCE_FORM: UpdateBankAccountBalanceInput = { euros: '', date: todayIso() };
const EMPTY_STOCK_FORM: StockInput = { custodyBank: '', stock: '' };
const EMPTY_PURCHASE_FORM: UpdateStockPurchaseInput = { shareCount: '', purchasePrice: '', date: todayIso() };
const EMPTY_VALUATION_FORM: UpdateStockValuationInput = { pricePerShare: '', date: todayIso() };

/** Formulario "Añadir acción" (nivel superior): crea la acción y su primera
 *  compra en un solo paso (spec 020, revisión §3.bis) — dos llamadas
 *  encadenadas (`createStock` + `createStockPurchase`), un solo formulario. */
type NewStockForm = StockInput & { shareCount: string; purchasePrice: string; date: string };

function emptyNewStockForm(): NewStockForm {
  return { custodyBank: '', stock: '', shareCount: '', purchasePrice: '', date: todayIso() };
}

function accountFormFromEntity(account: BankAccount): BankAccountInput {
  return { bank: account.bank, accountNumber: account.accountNumber };
}

function balanceFormFromEntity(balance: BankAccountBalance): UpdateBankAccountBalanceInput {
  return { euros: balance.euros, date: balance.date };
}

function stockFormFromEntity(stock: Stock): StockInput {
  return { custodyBank: stock.custodyBank, stock: stock.stock };
}

function purchaseFormFromEntity(purchase: StockPurchase): UpdateStockPurchaseInput {
  return { shareCount: purchase.shareCount, purchasePrice: purchase.purchasePrice, date: purchase.date };
}

function valuationFormFromEntity(valuation: StockValuation): UpdateStockValuationInput {
  return { pricePerShare: valuation.pricePerShare, date: valuation.date };
}

/** H2 criterio 3 (spec 020): calculado, nunca guardado — ver `wealth.calculations.ts` en el backend. */
function purchaseValue(purchasePrice: string, shareCount: string): string {
  const price = parseFloat(purchasePrice);
  const shares = parseFloat(shareCount);
  if (Number.isNaN(price) || Number.isNaN(shares)) return '';
  return (price * shares).toFixed(2);
}

/** H2 criterio 4 (spec 020): nº total de acciones de una posición, sumando todas sus compras — calculado, nunca guardado. */
function totalShares(purchases: StockPurchase[]): string {
  return purchases.reduce((sum, p) => sum + parseFloat(p.shareCount), 0).toFixed(4);
}

/** H2 criterio 4 (spec 020): coste total de una posición, sumando el valor de compra de todas sus compras. */
function totalCost(purchases: StockPurchase[]): string {
  return purchases.reduce((sum, p) => sum + parseFloat(purchaseValue(p.purchasePrice, p.shareCount) || '0'), 0).toFixed(2);
}

/** H3 criterio 1/3 (spec 020, revisión §3.ter): valor actual de la posición = precio por
 *  acción de la valoración más reciente × nº total de acciones — calculado, nunca guardado. */
function currentValue(pricePerShare: string, shareCount: string): string {
  const price = parseFloat(pricePerShare);
  const shares = parseFloat(shareCount);
  if (Number.isNaN(price) || Number.isNaN(shares)) return '';
  return (price * shares).toFixed(2);
}

/** Las 5 categorías de spec 018 §2 sin funcionalidad todavía (H1 criterio 3). */
const PLACEHOLDER_SECTIONS = [
  { icon: '💹', label: 'Fondos Inversión' },
  { icon: '₿', label: 'Cripto' },
  { icon: '🚗', label: 'Vehículos' },
  { icon: '👴', label: 'Fondo Pensiones' },
  { icon: '💵', label: 'Efectivo' },
];

/**
 * Spec 018 (Resumen Patrimonio) / spec 019 (cuentas bancarias únicas, con
 * historial de saldos) / spec 020 (acciones únicas, con historial de
 * compras y de valoraciones). 7 secciones plegables (H1 criterio 1/2 de
 * spec 018, mismo patrón `<details className="dashboard-section">` que el
 * Dashboard, spec 016/017): "Cuentas Bancarias" en dos niveles (cuenta →
 * historial de saldos anidado, spec 019), "Acciones" en tres niveles
 * (acción → historial de compras + historial de valoraciones anidados,
 * spec 020), las otras 5 con un aviso de "Próximamente.".
 */
export function WealthPage() {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const isOnline = useConnectivity();

  const [accounts, setAccounts] = useState<BankAccount[] | null>(null);
  const [accountsLoadError, setAccountsLoadError] = useState<string | null>(null);
  const [newAccountForm, setNewAccountForm] = useState<BankAccountInput>(EMPTY_ACCOUNT_FORM);
  const [createAccountError, setCreateAccountError] = useState<string | null>(null);
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [editingAccountForm, setEditingAccountForm] = useState<BankAccountInput>(EMPTY_ACCOUNT_FORM);
  const [editAccountError, setEditAccountError] = useState<string | null>(null);
  const [isSavingAccount, setIsSavingAccount] = useState(false);
  const [pendingDeleteAccountId, setPendingDeleteAccountId] = useState<string | null>(null);
  const [accountActionError, setAccountActionError] = useState<string | null>(null);

  const [balances, setBalances] = useState<BankAccountBalance[] | null>(null);
  const [balancesLoadError, setBalancesLoadError] = useState<string | null>(null);
  const [newBalanceForms, setNewBalanceForms] = useState<Record<string, UpdateBankAccountBalanceInput>>({});
  const [createBalanceError, setCreateBalanceError] = useState<string | null>(null);
  const [creatingBalanceForAccountId, setCreatingBalanceForAccountId] = useState<string | null>(null);
  const [editingBalanceId, setEditingBalanceId] = useState<string | null>(null);
  const [editingBalanceForm, setEditingBalanceForm] = useState<UpdateBankAccountBalanceInput>(EMPTY_BALANCE_FORM);
  const [editBalanceError, setEditBalanceError] = useState<string | null>(null);
  const [isSavingBalance, setIsSavingBalance] = useState(false);
  const [pendingDeleteBalanceId, setPendingDeleteBalanceId] = useState<string | null>(null);
  const [balanceActionError, setBalanceActionError] = useState<string | null>(null);

  const [stockList, setStockList] = useState<Stock[] | null>(null);
  const [stocksLoadError, setStocksLoadError] = useState<string | null>(null);
  const [newStockForm, setNewStockForm] = useState<NewStockForm>(emptyNewStockForm);
  const [createStockError, setCreateStockError] = useState<string | null>(null);
  const [isCreatingStock, setIsCreatingStock] = useState(false);
  const [editingStockId, setEditingStockId] = useState<string | null>(null);
  const [editingStockForm, setEditingStockForm] = useState<StockInput>(EMPTY_STOCK_FORM);
  const [editStockError, setEditStockError] = useState<string | null>(null);
  const [isSavingStock, setIsSavingStock] = useState(false);
  const [pendingDeleteStockId, setPendingDeleteStockId] = useState<string | null>(null);
  const [stockActionError, setStockActionError] = useState<string | null>(null);

  const [purchases, setPurchases] = useState<StockPurchase[] | null>(null);
  const [purchasesLoadError, setPurchasesLoadError] = useState<string | null>(null);
  const [newPurchaseForms, setNewPurchaseForms] = useState<Record<string, UpdateStockPurchaseInput>>({});
  const [createPurchaseError, setCreatePurchaseError] = useState<string | null>(null);
  const [creatingPurchaseForStockId, setCreatingPurchaseForStockId] = useState<string | null>(null);
  const [editingPurchaseId, setEditingPurchaseId] = useState<string | null>(null);
  const [editingPurchaseForm, setEditingPurchaseForm] = useState<UpdateStockPurchaseInput>(EMPTY_PURCHASE_FORM);
  const [editPurchaseError, setEditPurchaseError] = useState<string | null>(null);
  const [isSavingPurchase, setIsSavingPurchase] = useState(false);
  const [pendingDeletePurchaseId, setPendingDeletePurchaseId] = useState<string | null>(null);
  const [purchaseActionError, setPurchaseActionError] = useState<string | null>(null);

  const [valuations, setValuations] = useState<StockValuation[] | null>(null);
  const [valuationsLoadError, setValuationsLoadError] = useState<string | null>(null);
  const [newValuationForms, setNewValuationForms] = useState<Record<string, UpdateStockValuationInput>>({});
  const [createValuationError, setCreateValuationError] = useState<string | null>(null);
  const [creatingValuationForStockId, setCreatingValuationForStockId] = useState<string | null>(null);
  const [editingValuationId, setEditingValuationId] = useState<string | null>(null);
  const [editingValuationForm, setEditingValuationForm] = useState<UpdateStockValuationInput>(EMPTY_VALUATION_FORM);
  const [editValuationError, setEditValuationError] = useState<string | null>(null);
  const [isSavingValuation, setIsSavingValuation] = useState(false);
  const [pendingDeleteValuationId, setPendingDeleteValuationId] = useState<string | null>(null);
  const [valuationActionError, setValuationActionError] = useState<string | null>(null);

  async function reloadAccounts() {
    setAccounts(await listBankAccounts());
  }

  async function reloadBalances() {
    setBalances(await listBankAccountBalances());
  }

  async function reloadStocks() {
    setStockList(await listStocks());
  }

  async function reloadPurchases() {
    setPurchases(await listStockPurchases());
  }

  async function reloadValuations() {
    setValuations(await listStockValuations());
  }

  useEffect(() => {
    if (!isAuthenticated || !isOnline) return;
    let cancelled = false;
    (async () => {
      try {
        await reloadAccounts();
      } catch (err) {
        if (!cancelled) setAccountsLoadError(err instanceof ApiError ? err.message : 'No se han podido cargar las cuentas bancarias.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isOnline]);

  useEffect(() => {
    if (!isAuthenticated || !isOnline) return;
    let cancelled = false;
    (async () => {
      try {
        await reloadBalances();
      } catch (err) {
        if (!cancelled) setBalancesLoadError(err instanceof ApiError ? err.message : 'No se ha podido cargar el historial de saldos.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isOnline]);

  useEffect(() => {
    if (!isAuthenticated || !isOnline) return;
    let cancelled = false;
    (async () => {
      try {
        await reloadStocks();
      } catch (err) {
        if (!cancelled) setStocksLoadError(err instanceof ApiError ? err.message : 'No se han podido cargar las acciones.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isOnline]);

  useEffect(() => {
    if (!isAuthenticated || !isOnline) return;
    let cancelled = false;
    (async () => {
      try {
        await reloadPurchases();
      } catch (err) {
        if (!cancelled) setPurchasesLoadError(err instanceof ApiError ? err.message : 'No se ha podido cargar el historial de compras.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isOnline]);

  useEffect(() => {
    if (!isAuthenticated || !isOnline) return;
    let cancelled = false;
    (async () => {
      try {
        await reloadValuations();
      } catch (err) {
        if (!cancelled) setValuationsLoadError(err instanceof ApiError ? err.message : 'No se ha podido cargar el historial de valoraciones.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isOnline]);

  async function handleCreateAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateAccountError(null);
    setIsCreatingAccount(true);
    try {
      await createBankAccount(newAccountForm);
      setNewAccountForm(EMPTY_ACCOUNT_FORM);
      await reloadAccounts();
    } catch (err) {
      setCreateAccountError(err instanceof ApiError ? err.message : 'No se ha podido crear la cuenta.');
    } finally {
      setIsCreatingAccount(false);
    }
  }

  function startEditAccount(account: BankAccount) {
    setEditAccountError(null);
    setEditingAccountId(account.id);
    setEditingAccountForm(accountFormFromEntity(account));
  }

  async function handleEditAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingAccountId) return;
    setEditAccountError(null);
    setIsSavingAccount(true);
    try {
      await updateBankAccount(editingAccountId, editingAccountForm);
      setEditingAccountId(null);
      await reloadAccounts();
    } catch (err) {
      setEditAccountError(err instanceof ApiError ? err.message : 'No se ha podido guardar la cuenta.');
    } finally {
      setIsSavingAccount(false);
    }
  }

  async function handleDeleteAccount(id: string) {
    setAccountActionError(null);
    setPendingDeleteAccountId(id);
    try {
      await deleteBankAccount(id);
      await Promise.all([reloadAccounts(), reloadBalances()]);
    } catch (err) {
      setAccountActionError(err instanceof ApiError ? err.message : 'No se ha podido eliminar la cuenta.');
    } finally {
      setPendingDeleteAccountId(null);
    }
  }

  function getNewBalanceForm(accountId: string): UpdateBankAccountBalanceInput {
    return newBalanceForms[accountId] ?? { euros: '', date: todayIso() };
  }

  function setNewBalanceForm(accountId: string, form: UpdateBankAccountBalanceInput) {
    setNewBalanceForms((prev) => ({ ...prev, [accountId]: form }));
  }

  async function handleCreateBalance(accountId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateBalanceError(null);
    setCreatingBalanceForAccountId(accountId);
    try {
      const form = getNewBalanceForm(accountId);
      await createBankAccountBalance({ bankAccountId: accountId, euros: form.euros ?? '', date: form.date ?? todayIso() });
      setNewBalanceForm(accountId, { euros: '', date: todayIso() });
      await reloadBalances();
    } catch (err) {
      setCreateBalanceError(err instanceof ApiError ? err.message : 'No se ha podido añadir el saldo.');
    } finally {
      setCreatingBalanceForAccountId(null);
    }
  }

  function startEditBalance(balance: BankAccountBalance) {
    setEditBalanceError(null);
    setEditingBalanceId(balance.id);
    setEditingBalanceForm(balanceFormFromEntity(balance));
  }

  async function handleEditBalance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingBalanceId) return;
    setEditBalanceError(null);
    setIsSavingBalance(true);
    try {
      await updateBankAccountBalance(editingBalanceId, editingBalanceForm);
      setEditingBalanceId(null);
      await reloadBalances();
    } catch (err) {
      setEditBalanceError(err instanceof ApiError ? err.message : 'No se ha podido guardar el saldo.');
    } finally {
      setIsSavingBalance(false);
    }
  }

  async function handleDeleteBalance(id: string) {
    setBalanceActionError(null);
    setPendingDeleteBalanceId(id);
    try {
      await deleteBankAccountBalance(id);
      await reloadBalances();
    } catch (err) {
      setBalanceActionError(err instanceof ApiError ? err.message : 'No se ha podido eliminar el saldo.');
    } finally {
      setPendingDeleteBalanceId(null);
    }
  }

  async function handleCreateStock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateStockError(null);
    setIsCreatingStock(true);
    try {
      const stock = await createStock({ custodyBank: newStockForm.custodyBank, stock: newStockForm.stock });
      await createStockPurchase({
        stockId: stock.id,
        shareCount: newStockForm.shareCount,
        purchasePrice: newStockForm.purchasePrice,
        date: newStockForm.date,
      });
      setNewStockForm(emptyNewStockForm());
      await Promise.all([reloadStocks(), reloadPurchases()]);
    } catch (err) {
      setCreateStockError(err instanceof ApiError ? err.message : 'No se ha podido crear la acción.');
    } finally {
      setIsCreatingStock(false);
    }
  }

  function startEditStock(stock: Stock) {
    setEditStockError(null);
    setEditingStockId(stock.id);
    setEditingStockForm(stockFormFromEntity(stock));
  }

  async function handleEditStock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingStockId) return;
    setEditStockError(null);
    setIsSavingStock(true);
    try {
      await updateStock(editingStockId, editingStockForm);
      setEditingStockId(null);
      await reloadStocks();
    } catch (err) {
      setEditStockError(err instanceof ApiError ? err.message : 'No se ha podido guardar la acción.');
    } finally {
      setIsSavingStock(false);
    }
  }

  async function handleDeleteStock(id: string) {
    setStockActionError(null);
    setPendingDeleteStockId(id);
    try {
      await deleteStock(id);
      await Promise.all([reloadStocks(), reloadPurchases(), reloadValuations()]);
    } catch (err) {
      setStockActionError(err instanceof ApiError ? err.message : 'No se ha podido eliminar la acción.');
    } finally {
      setPendingDeleteStockId(null);
    }
  }

  function getNewPurchaseForm(stockId: string): UpdateStockPurchaseInput {
    return newPurchaseForms[stockId] ?? { shareCount: '', purchasePrice: '', date: todayIso() };
  }

  function setNewPurchaseForm(stockId: string, form: UpdateStockPurchaseInput) {
    setNewPurchaseForms((prev) => ({ ...prev, [stockId]: form }));
  }

  async function handleCreatePurchase(stockId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreatePurchaseError(null);
    setCreatingPurchaseForStockId(stockId);
    try {
      const form = getNewPurchaseForm(stockId);
      await createStockPurchase({
        stockId,
        shareCount: form.shareCount ?? '',
        purchasePrice: form.purchasePrice ?? '',
        date: form.date ?? todayIso(),
      });
      setNewPurchaseForm(stockId, { shareCount: '', purchasePrice: '', date: todayIso() });
      await reloadPurchases();
    } catch (err) {
      setCreatePurchaseError(err instanceof ApiError ? err.message : 'No se ha podido añadir la compra.');
    } finally {
      setCreatingPurchaseForStockId(null);
    }
  }

  function startEditPurchase(purchase: StockPurchase) {
    setEditPurchaseError(null);
    setEditingPurchaseId(purchase.id);
    setEditingPurchaseForm(purchaseFormFromEntity(purchase));
  }

  async function handleEditPurchase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingPurchaseId) return;
    setEditPurchaseError(null);
    setIsSavingPurchase(true);
    try {
      await updateStockPurchase(editingPurchaseId, editingPurchaseForm);
      setEditingPurchaseId(null);
      await reloadPurchases();
    } catch (err) {
      setEditPurchaseError(err instanceof ApiError ? err.message : 'No se ha podido guardar la compra.');
    } finally {
      setIsSavingPurchase(false);
    }
  }

  async function handleDeletePurchase(id: string) {
    setPurchaseActionError(null);
    setPendingDeletePurchaseId(id);
    try {
      await deleteStockPurchase(id);
      await reloadPurchases();
    } catch (err) {
      setPurchaseActionError(err instanceof ApiError ? err.message : 'No se ha podido eliminar la compra.');
    } finally {
      setPendingDeletePurchaseId(null);
    }
  }

  function getNewValuationForm(stockId: string): UpdateStockValuationInput {
    return newValuationForms[stockId] ?? { pricePerShare: '', date: todayIso() };
  }

  function setNewValuationForm(stockId: string, form: UpdateStockValuationInput) {
    setNewValuationForms((prev) => ({ ...prev, [stockId]: form }));
  }

  async function handleCreateValuation(stockId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateValuationError(null);
    setCreatingValuationForStockId(stockId);
    try {
      const form = getNewValuationForm(stockId);
      await createStockValuation({ stockId, pricePerShare: form.pricePerShare ?? '', date: form.date ?? todayIso() });
      setNewValuationForm(stockId, { pricePerShare: '', date: todayIso() });
      await reloadValuations();
    } catch (err) {
      setCreateValuationError(err instanceof ApiError ? err.message : 'No se ha podido añadir la valoración.');
    } finally {
      setCreatingValuationForStockId(null);
    }
  }

  function startEditValuation(valuation: StockValuation) {
    setEditValuationError(null);
    setEditingValuationId(valuation.id);
    setEditingValuationForm(valuationFormFromEntity(valuation));
  }

  async function handleEditValuation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingValuationId) return;
    setEditValuationError(null);
    setIsSavingValuation(true);
    try {
      await updateStockValuation(editingValuationId, editingValuationForm);
      setEditingValuationId(null);
      await reloadValuations();
    } catch (err) {
      setEditValuationError(err instanceof ApiError ? err.message : 'No se ha podido guardar la valoración.');
    } finally {
      setIsSavingValuation(false);
    }
  }

  async function handleDeleteValuation(id: string) {
    setValuationActionError(null);
    setPendingDeleteValuationId(id);
    try {
      await deleteStockValuation(id);
      await reloadValuations();
    } catch (err) {
      setValuationActionError(err instanceof ApiError ? err.message : 'No se ha podido eliminar la valoración.');
    } finally {
      setPendingDeleteValuationId(null);
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
        <h1>Resumen Patrimonio</h1>
        <p role="alert">Tienes que iniciar sesión para ver esto.</p>
        <p>
          <Link to="/login">Iniciar sesión</Link>
        </p>
      </main>
    );
  }

  // Spec 018, spec.md §2: modo offline fuera de alcance, mismo criterio que Dashboard y Objetivos y presupuestos.
  if (!isOnline) {
    return (
      <main>
        <h1>Resumen Patrimonio</h1>
        <p role="status">Esta página requiere conexión a internet.</p>
      </main>
    );
  }

  return (
    <main>
      <h1>Resumen Patrimonio</h1>

      <details className="dashboard-section">
        <summary>
          <h2>🏦 Cuentas Bancarias</h2>
        </summary>

        {accountsLoadError && <p role="alert">{accountsLoadError}</p>}
        {balancesLoadError && <p role="alert">{balancesLoadError}</p>}
        {accountActionError && <p role="alert">{accountActionError}</p>}
        {balanceActionError && <p role="alert">{balanceActionError}</p>}

        {accounts && accounts.length === 0 && <p>Todavía no tienes ninguna cuenta bancaria.</p>}

        {accounts && accounts.length > 0 && (
          <ul id="wealth-bank-account-list" aria-label="Tus cuentas bancarias">
            {accounts.map((account) => {
              const isEditingAccount = editingAccountId === account.id;
              const accountBalances = (balances ?? []).filter((b) => b.bankAccountId === account.id);
              const lastBalance = accountBalances[0] ?? null; // `balances` ya viene ordenado por fecha descendente
              const newBalanceForm = getNewBalanceForm(account.id);

              if (isEditingAccount) {
                return (
                  <li className="card elev-sm" key={account.id}>
                    <form onSubmit={handleEditAccount} aria-label={`Editar cuenta: ${account.bank}`} noValidate>
                      <div className="field">
                        <label htmlFor={`account-${account.id}-bank`}>Banco</label>
                        <input
                          id={`account-${account.id}-bank`}
                          className="input"
                          value={editingAccountForm.bank}
                          onChange={(e) => setEditingAccountForm({ ...editingAccountForm, bank: e.target.value })}
                          required
                        />
                      </div>
                      <div className="field">
                        <label htmlFor={`account-${account.id}-accountNumber`}>Número de Cuenta</label>
                        <input
                          id={`account-${account.id}-accountNumber`}
                          className="input"
                          value={editingAccountForm.accountNumber}
                          onChange={(e) => setEditingAccountForm({ ...editingAccountForm, accountNumber: e.target.value })}
                          required
                        />
                      </div>
                      {editAccountError && <p role="alert">{editAccountError}</p>}
                      <button type="submit" className="btn btn-primary" disabled={isSavingAccount}>
                        {isSavingAccount ? 'Guardando…' : 'Guardar'}
                      </button>{' '}
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={isSavingAccount}
                        onClick={() => setEditingAccountId(null)}
                      >
                        Cancelar
                      </button>
                    </form>
                  </li>
                );
              }

              return (
                <li className="card elev-sm" key={account.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="card-title">
                      {account.bank} · {account.accountNumber}
                    </span>
                    <span className="card-amount">{lastBalance ? formatCurrency(lastBalance.euros) : 'Sin saldo'}</span>
                  </div>
                  {lastBalance && <p className="card-meta">Última fecha: {lastBalance.date}</p>}
                  <div>
                    {/* Nombre accesible propio (spec 019): con el historial de saldos anidado, "Editar"/"Eliminar"
                        a secas se repite en dos niveles (la cuenta, y cada saldo dentro de su historial) — sin
                        distinguirlos, un lector de pantalla no podría saber cuál es cuál al tabular por la página. */}
                    <button
                      type="button"
                      className="btn btn-secondary"
                      aria-label={`Editar cuenta: ${account.bank} · ${account.accountNumber}`}
                      onClick={() => startEditAccount(account)}
                    >
                      Editar
                    </button>{' '}
                    <button
                      type="button"
                      className="btn btn-ghost"
                      aria-label={`Eliminar cuenta: ${account.bank} · ${account.accountNumber}`}
                      disabled={pendingDeleteAccountId === account.id}
                      onClick={() => void handleDeleteAccount(account.id)}
                    >
                      {pendingDeleteAccountId === account.id ? 'Eliminando…' : 'Eliminar'}
                    </button>
                  </div>

                  <details>
                    <summary>Historial ({accountBalances.length})</summary>

                    {accountBalances.length === 0 && <p>Todavía no hay ningún saldo registrado en esta cuenta.</p>}

                    {accountBalances.length > 0 && (
                      <ul aria-label={`Historial de ${account.bank} · ${account.accountNumber}`}>
                        {accountBalances.map((balance) => {
                          const isEditingBalance = editingBalanceId === balance.id;

                          if (isEditingBalance) {
                            return (
                              <li key={balance.id}>
                                <form onSubmit={handleEditBalance} aria-label={`Editar saldo del ${balance.date}`} noValidate>
                                  <div className="field">
                                    <label htmlFor={`balance-${balance.id}-euros`}>Euros</label>
                                    <input
                                      id={`balance-${balance.id}-euros`}
                                      className="input"
                                      inputMode="decimal"
                                      value={editingBalanceForm.euros}
                                      onChange={(e) => setEditingBalanceForm({ ...editingBalanceForm, euros: e.target.value })}
                                      required
                                    />
                                  </div>
                                  <div className="field">
                                    <label htmlFor={`balance-${balance.id}-date`}>Fecha</label>
                                    <input
                                      id={`balance-${balance.id}-date`}
                                      type="date"
                                      className="input"
                                      value={editingBalanceForm.date}
                                      onChange={(e) => setEditingBalanceForm({ ...editingBalanceForm, date: e.target.value })}
                                      required
                                    />
                                  </div>
                                  {editBalanceError && <p role="alert">{editBalanceError}</p>}
                                  <button type="submit" className="btn btn-primary" disabled={isSavingBalance}>
                                    {isSavingBalance ? 'Guardando…' : 'Guardar'}
                                  </button>{' '}
                                  <button
                                    type="button"
                                    className="btn btn-secondary"
                                    disabled={isSavingBalance}
                                    onClick={() => setEditingBalanceId(null)}
                                  >
                                    Cancelar
                                  </button>
                                </form>
                              </li>
                            );
                          }

                          return (
                            <li key={balance.id}>
                              <span>{balance.date}</span> <span>{formatCurrency(balance.euros)}</span>{' '}
                              <button
                                type="button"
                                className="btn btn-secondary"
                                aria-label={`Editar saldo del ${balance.date}`}
                                onClick={() => startEditBalance(balance)}
                              >
                                Editar
                              </button>{' '}
                              <button
                                type="button"
                                className="btn btn-ghost"
                                aria-label={`Eliminar saldo del ${balance.date}`}
                                disabled={pendingDeleteBalanceId === balance.id}
                                onClick={() => void handleDeleteBalance(balance.id)}
                              >
                                {pendingDeleteBalanceId === balance.id ? 'Eliminando…' : 'Eliminar'}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    <form
                      onSubmit={(e) => void handleCreateBalance(account.id, e)}
                      aria-label={`Añadir saldo: ${account.bank}`}
                      noValidate
                    >
                      <div className="field">
                        <label htmlFor={`new-balance-${account.id}-euros`}>Euros</label>
                        <input
                          id={`new-balance-${account.id}-euros`}
                          className="input"
                          inputMode="decimal"
                          placeholder="p. ej. 1500.00 o -50.00"
                          value={newBalanceForm.euros}
                          onChange={(e) => setNewBalanceForm(account.id, { ...newBalanceForm, euros: e.target.value })}
                          required
                        />
                      </div>
                      <div className="field">
                        <label htmlFor={`new-balance-${account.id}-date`}>Fecha</label>
                        <input
                          id={`new-balance-${account.id}-date`}
                          type="date"
                          className="input"
                          value={newBalanceForm.date}
                          onChange={(e) => setNewBalanceForm(account.id, { ...newBalanceForm, date: e.target.value })}
                          required
                        />
                      </div>
                      {createBalanceError && <p role="alert">{createBalanceError}</p>}
                      <button type="submit" className="btn btn-primary" disabled={creatingBalanceForAccountId === account.id}>
                        {creatingBalanceForAccountId === account.id ? 'Añadiendo…' : 'Añadir saldo'}
                      </button>
                    </form>
                  </details>
                </li>
              );
            })}
          </ul>
        )}

        <h3>Añadir cuenta</h3>
        <form onSubmit={handleCreateAccount} aria-label="Añadir cuenta bancaria" noValidate>
          <div className="field">
            <label htmlFor="new-account-bank">Banco</label>
            <input
              id="new-account-bank"
              className="input"
              value={newAccountForm.bank}
              onChange={(e) => setNewAccountForm({ ...newAccountForm, bank: e.target.value })}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="new-account-accountNumber">Número de Cuenta</label>
            <input
              id="new-account-accountNumber"
              className="input"
              value={newAccountForm.accountNumber}
              onChange={(e) => setNewAccountForm({ ...newAccountForm, accountNumber: e.target.value })}
              required
            />
          </div>
          {createAccountError && <p role="alert">{createAccountError}</p>}
          <button type="submit" className="btn btn-primary" disabled={isCreatingAccount}>
            {isCreatingAccount ? 'Creando…' : 'Añadir cuenta'}
          </button>
        </form>
      </details>

      <details className="dashboard-section">
        <summary>
          <h2>📈 Acciones</h2>
        </summary>

        {stocksLoadError && <p role="alert">{stocksLoadError}</p>}
        {purchasesLoadError && <p role="alert">{purchasesLoadError}</p>}
        {valuationsLoadError && <p role="alert">{valuationsLoadError}</p>}
        {stockActionError && <p role="alert">{stockActionError}</p>}
        {purchaseActionError && <p role="alert">{purchaseActionError}</p>}
        {valuationActionError && <p role="alert">{valuationActionError}</p>}

        {stockList && stockList.length === 0 && <p>Todavía no tienes ninguna acción.</p>}

        {stockList && stockList.length > 0 && (
          <ul id="wealth-stock-list" aria-label="Tus acciones">
            {stockList.map((stock) => {
              const isEditingStock = editingStockId === stock.id;
              const stockPurchases = (purchases ?? []).filter((p) => p.stockId === stock.id);
              const stockValuations = (valuations ?? []).filter((v) => v.stockId === stock.id);
              const lastValuation = stockValuations[0] ?? null; // `valuations` ya viene ordenado por fecha descendente
              const newPurchaseForm = getNewPurchaseForm(stock.id);
              const newValuationForm = getNewValuationForm(stock.id);

              if (isEditingStock) {
                return (
                  <li className="card elev-sm" key={stock.id}>
                    <form onSubmit={handleEditStock} aria-label={`Editar acción: ${stock.stock}`} noValidate>
                      <div className="field">
                        <label htmlFor={`stock-${stock.id}-custodyBank`}>Banco Custodia</label>
                        <input
                          id={`stock-${stock.id}-custodyBank`}
                          className="input"
                          value={editingStockForm.custodyBank}
                          onChange={(e) => setEditingStockForm({ ...editingStockForm, custodyBank: e.target.value })}
                          required
                        />
                      </div>
                      <div className="field">
                        <label htmlFor={`stock-${stock.id}-stock`}>Acción</label>
                        <input
                          id={`stock-${stock.id}-stock`}
                          className="input"
                          value={editingStockForm.stock}
                          onChange={(e) => setEditingStockForm({ ...editingStockForm, stock: e.target.value })}
                          required
                        />
                      </div>
                      {editStockError && <p role="alert">{editStockError}</p>}
                      <button type="submit" className="btn btn-primary" disabled={isSavingStock}>
                        {isSavingStock ? 'Guardando…' : 'Guardar'}
                      </button>{' '}
                      <button type="button" className="btn btn-secondary" disabled={isSavingStock} onClick={() => setEditingStockId(null)}>
                        Cancelar
                      </button>
                    </form>
                  </li>
                );
              }

              return (
                <li className="card elev-sm" key={stock.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="card-title">
                      {stock.stock} · {stock.custodyBank}
                    </span>
                    <span className="card-amount">
                      {lastValuation ? formatCurrency(currentValue(lastValuation.pricePerShare, totalShares(stockPurchases))) : 'Sin valoración'}
                    </span>
                  </div>
                  <p className="card-meta">
                    {totalShares(stockPurchases)} acciones · Coste total: {formatCurrency(totalCost(stockPurchases))}
                    {lastValuation && (
                      <>
                        {' '}
                        · Precio actual: {formatCurrency(lastValuation.pricePerShare)}/acción · Última fecha: {lastValuation.date}
                      </>
                    )}
                  </p>
                  <div>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      aria-label={`Editar acción: ${stock.stock} · ${stock.custodyBank}`}
                      onClick={() => startEditStock(stock)}
                    >
                      Editar
                    </button>{' '}
                    <button
                      type="button"
                      className="btn btn-ghost"
                      aria-label={`Eliminar acción: ${stock.stock} · ${stock.custodyBank}`}
                      disabled={pendingDeleteStockId === stock.id}
                      onClick={() => void handleDeleteStock(stock.id)}
                    >
                      {pendingDeleteStockId === stock.id ? 'Eliminando…' : 'Eliminar'}
                    </button>
                  </div>

                  <details>
                    <summary>Historial de compras ({stockPurchases.length})</summary>

                    {stockPurchases.length === 0 && <p>Todavía no hay ninguna compra registrada en esta acción.</p>}

                    {stockPurchases.length > 0 && (
                      <ul aria-label={`Historial de compras de ${stock.stock} · ${stock.custodyBank}`}>
                        {stockPurchases.map((purchase) => {
                          const isEditingPurchase = editingPurchaseId === purchase.id;
                          // Nombre accesible construido con los valores en crudo (sin `formatCurrency`): evita depender
                          // del formato de `Intl.NumberFormat` (incluye un espacio no separable) para identificar el elemento.
                          const purchaseLabel = `${purchase.date} · ${purchase.shareCount} acciones a ${purchase.purchasePrice}€`;

                          if (isEditingPurchase) {
                            return (
                              <li key={purchase.id}>
                                <form
                                  onSubmit={handleEditPurchase}
                                  aria-label={`Editar compra de ${stock.stock}: ${purchaseLabel}`}
                                  noValidate
                                >
                                  <div className="field">
                                    <label htmlFor={`purchase-${purchase.id}-shareCount`}>Número acciones</label>
                                    <input
                                      id={`purchase-${purchase.id}-shareCount`}
                                      className="input"
                                      inputMode="decimal"
                                      value={editingPurchaseForm.shareCount}
                                      onChange={(e) => setEditingPurchaseForm({ ...editingPurchaseForm, shareCount: e.target.value })}
                                      required
                                    />
                                  </div>
                                  <div className="field">
                                    <label htmlFor={`purchase-${purchase.id}-purchasePrice`}>Precio compra</label>
                                    <input
                                      id={`purchase-${purchase.id}-purchasePrice`}
                                      className="input"
                                      inputMode="decimal"
                                      value={editingPurchaseForm.purchasePrice}
                                      onChange={(e) => setEditingPurchaseForm({ ...editingPurchaseForm, purchasePrice: e.target.value })}
                                      required
                                    />
                                  </div>
                                  <div className="field">
                                    <label htmlFor={`purchase-${purchase.id}-date`}>Fecha de compra</label>
                                    <input
                                      id={`purchase-${purchase.id}-date`}
                                      type="date"
                                      className="input"
                                      value={editingPurchaseForm.date}
                                      onChange={(e) => setEditingPurchaseForm({ ...editingPurchaseForm, date: e.target.value })}
                                      required
                                    />
                                  </div>
                                  <p className="card-meta">
                                    Valor compra:{' '}
                                    {formatCurrency(
                                      purchaseValue(editingPurchaseForm.purchasePrice ?? '', editingPurchaseForm.shareCount ?? '') ||
                                        '0.00',
                                    )}
                                  </p>
                                  {editPurchaseError && <p role="alert">{editPurchaseError}</p>}
                                  <button type="submit" className="btn btn-primary" disabled={isSavingPurchase}>
                                    {isSavingPurchase ? 'Guardando…' : 'Guardar'}
                                  </button>{' '}
                                  <button
                                    type="button"
                                    className="btn btn-secondary"
                                    disabled={isSavingPurchase}
                                    onClick={() => setEditingPurchaseId(null)}
                                  >
                                    Cancelar
                                  </button>
                                </form>
                              </li>
                            );
                          }

                          return (
                            <li key={purchase.id}>
                              <span>{purchase.date}</span>{' '}
                              <span>
                                {purchase.shareCount} acciones @ {formatCurrency(purchase.purchasePrice)} ={' '}
                                {formatCurrency(purchaseValue(purchase.purchasePrice, purchase.shareCount))}
                              </span>{' '}
                              <button
                                type="button"
                                className="btn btn-secondary"
                                aria-label={`Editar compra de ${stock.stock}: ${purchaseLabel}`}
                                onClick={() => startEditPurchase(purchase)}
                              >
                                Editar
                              </button>{' '}
                              <button
                                type="button"
                                className="btn btn-ghost"
                                aria-label={`Eliminar compra de ${stock.stock}: ${purchaseLabel}`}
                                disabled={pendingDeletePurchaseId === purchase.id}
                                onClick={() => void handleDeletePurchase(purchase.id)}
                              >
                                {pendingDeletePurchaseId === purchase.id ? 'Eliminando…' : 'Eliminar'}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    <form
                      onSubmit={(e) => void handleCreatePurchase(stock.id, e)}
                      aria-label={`Añadir compra: ${stock.stock}`}
                      noValidate
                    >
                      <div className="field">
                        <label htmlFor={`new-purchase-${stock.id}-shareCount`}>Número acciones</label>
                        <input
                          id={`new-purchase-${stock.id}-shareCount`}
                          className="input"
                          inputMode="decimal"
                          value={newPurchaseForm.shareCount}
                          onChange={(e) => setNewPurchaseForm(stock.id, { ...newPurchaseForm, shareCount: e.target.value })}
                          required
                        />
                      </div>
                      <div className="field">
                        <label htmlFor={`new-purchase-${stock.id}-purchasePrice`}>Precio compra</label>
                        <input
                          id={`new-purchase-${stock.id}-purchasePrice`}
                          className="input"
                          inputMode="decimal"
                          value={newPurchaseForm.purchasePrice}
                          onChange={(e) => setNewPurchaseForm(stock.id, { ...newPurchaseForm, purchasePrice: e.target.value })}
                          required
                        />
                      </div>
                      <div className="field">
                        <label htmlFor={`new-purchase-${stock.id}-date`}>Fecha de compra</label>
                        <input
                          id={`new-purchase-${stock.id}-date`}
                          type="date"
                          className="input"
                          value={newPurchaseForm.date}
                          onChange={(e) => setNewPurchaseForm(stock.id, { ...newPurchaseForm, date: e.target.value })}
                          required
                        />
                      </div>
                      <p className="card-meta">
                        Valor compra:{' '}
                        {formatCurrency(purchaseValue(newPurchaseForm.purchasePrice ?? '', newPurchaseForm.shareCount ?? '') || '0.00')}
                      </p>
                      {createPurchaseError && <p role="alert">{createPurchaseError}</p>}
                      <button type="submit" className="btn btn-primary" disabled={creatingPurchaseForStockId === stock.id}>
                        {creatingPurchaseForStockId === stock.id ? 'Añadiendo…' : 'Añadir compra'}
                      </button>
                    </form>
                  </details>

                  <details>
                    <summary>Historial de valoraciones ({stockValuations.length})</summary>

                    {stockValuations.length === 0 && <p>Todavía no hay ninguna valoración registrada en esta acción.</p>}

                    {stockValuations.length > 0 && (
                      <ul aria-label={`Historial de valoraciones de ${stock.stock} · ${stock.custodyBank}`}>
                        {stockValuations.map((valuation) => {
                          const isEditingValuation = editingValuationId === valuation.id;

                          if (isEditingValuation) {
                            return (
                              <li key={valuation.id}>
                                <form
                                  onSubmit={handleEditValuation}
                                  aria-label={`Editar valoración de ${stock.stock} del ${valuation.date}`}
                                  noValidate
                                >
                                  <div className="field">
                                    <label htmlFor={`valuation-${valuation.id}-pricePerShare`}>Precio por acción actual</label>
                                    <input
                                      id={`valuation-${valuation.id}-pricePerShare`}
                                      className="input"
                                      inputMode="decimal"
                                      value={editingValuationForm.pricePerShare}
                                      onChange={(e) => setEditingValuationForm({ ...editingValuationForm, pricePerShare: e.target.value })}
                                      required
                                    />
                                  </div>
                                  <div className="field">
                                    <label htmlFor={`valuation-${valuation.id}-date`}>Fecha</label>
                                    <input
                                      id={`valuation-${valuation.id}-date`}
                                      type="date"
                                      className="input"
                                      value={editingValuationForm.date}
                                      onChange={(e) => setEditingValuationForm({ ...editingValuationForm, date: e.target.value })}
                                      required
                                    />
                                  </div>
                                  <p className="card-meta">
                                    Valor total:{' '}
                                    {formatCurrency(
                                      currentValue(editingValuationForm.pricePerShare ?? '', totalShares(stockPurchases)) || '0.00',
                                    )}
                                  </p>
                                  {editValuationError && <p role="alert">{editValuationError}</p>}
                                  <button type="submit" className="btn btn-primary" disabled={isSavingValuation}>
                                    {isSavingValuation ? 'Guardando…' : 'Guardar'}
                                  </button>{' '}
                                  <button
                                    type="button"
                                    className="btn btn-secondary"
                                    disabled={isSavingValuation}
                                    onClick={() => setEditingValuationId(null)}
                                  >
                                    Cancelar
                                  </button>
                                </form>
                              </li>
                            );
                          }

                          return (
                            <li key={valuation.id}>
                              <span>{valuation.date}</span> <span>{formatCurrency(valuation.pricePerShare)}/acción</span>{' '}
                              <button
                                type="button"
                                className="btn btn-secondary"
                                aria-label={`Editar valoración de ${stock.stock} del ${valuation.date}`}
                                onClick={() => startEditValuation(valuation)}
                              >
                                Editar
                              </button>{' '}
                              <button
                                type="button"
                                className="btn btn-ghost"
                                aria-label={`Eliminar valoración de ${stock.stock} del ${valuation.date}`}
                                disabled={pendingDeleteValuationId === valuation.id}
                                onClick={() => void handleDeleteValuation(valuation.id)}
                              >
                                {pendingDeleteValuationId === valuation.id ? 'Eliminando…' : 'Eliminar'}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    <form
                      onSubmit={(e) => void handleCreateValuation(stock.id, e)}
                      aria-label={`Añadir valoración: ${stock.stock}`}
                      noValidate
                    >
                      <div className="field">
                        <label htmlFor={`new-valuation-${stock.id}-pricePerShare`}>Precio por acción actual</label>
                        <input
                          id={`new-valuation-${stock.id}-pricePerShare`}
                          className="input"
                          inputMode="decimal"
                          value={newValuationForm.pricePerShare}
                          onChange={(e) => setNewValuationForm(stock.id, { ...newValuationForm, pricePerShare: e.target.value })}
                          required
                        />
                      </div>
                      <div className="field">
                        <label htmlFor={`new-valuation-${stock.id}-date`}>Fecha</label>
                        <input
                          id={`new-valuation-${stock.id}-date`}
                          type="date"
                          className="input"
                          value={newValuationForm.date}
                          onChange={(e) => setNewValuationForm(stock.id, { ...newValuationForm, date: e.target.value })}
                          required
                        />
                      </div>
                      <p className="card-meta">
                        Valor total:{' '}
                        {formatCurrency(currentValue(newValuationForm.pricePerShare ?? '', totalShares(stockPurchases)) || '0.00')}
                      </p>
                      {createValuationError && <p role="alert">{createValuationError}</p>}
                      <button type="submit" className="btn btn-primary" disabled={creatingValuationForStockId === stock.id}>
                        {creatingValuationForStockId === stock.id ? 'Añadiendo…' : 'Añadir valoración'}
                      </button>
                    </form>
                  </details>
                </li>
              );
            })}
          </ul>
        )}

        <h3>Añadir acción</h3>
        <form onSubmit={handleCreateStock} aria-label="Añadir acción" noValidate>
          <div className="field">
            <label htmlFor="new-stock-custodyBank">Banco Custodia</label>
            <input
              id="new-stock-custodyBank"
              className="input"
              value={newStockForm.custodyBank}
              onChange={(e) => setNewStockForm({ ...newStockForm, custodyBank: e.target.value })}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="new-stock-stock">Acción</label>
            <input
              id="new-stock-stock"
              className="input"
              value={newStockForm.stock}
              onChange={(e) => setNewStockForm({ ...newStockForm, stock: e.target.value })}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="new-stock-shareCount">Número acciones</label>
            <input
              id="new-stock-shareCount"
              className="input"
              inputMode="decimal"
              value={newStockForm.shareCount}
              onChange={(e) => setNewStockForm({ ...newStockForm, shareCount: e.target.value })}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="new-stock-purchasePrice">Precio compra</label>
            <input
              id="new-stock-purchasePrice"
              className="input"
              inputMode="decimal"
              value={newStockForm.purchasePrice}
              onChange={(e) => setNewStockForm({ ...newStockForm, purchasePrice: e.target.value })}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="new-stock-date">Fecha de compra</label>
            <input
              id="new-stock-date"
              type="date"
              className="input"
              value={newStockForm.date}
              onChange={(e) => setNewStockForm({ ...newStockForm, date: e.target.value })}
              required
            />
          </div>
          <p className="card-meta">
            Valor compra: {formatCurrency(purchaseValue(newStockForm.purchasePrice, newStockForm.shareCount) || '0.00')}
          </p>
          {createStockError && <p role="alert">{createStockError}</p>}
          <button type="submit" className="btn btn-primary" disabled={isCreatingStock}>
            {isCreatingStock ? 'Creando…' : 'Añadir acción'}
          </button>
        </form>
      </details>

      {PLACEHOLDER_SECTIONS.map((section) => (
        <details className="dashboard-section" key={section.label}>
          <summary>
            <h2>
              {section.icon} {section.label}
            </h2>
          </summary>
          <p>Próximamente.</p>
        </details>
      ))}
    </main>
  );
}
