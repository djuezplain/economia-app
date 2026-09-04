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
import { createStockEntry, deleteStockEntry, listStockEntries, updateStockEntry } from '../api/stock-entries';
import type { StockEntry, StockEntryInput } from '../api/stock-entries';
import { ApiError } from '../api/client';
import { formatCurrency } from './home-shared';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const EMPTY_ACCOUNT_FORM: BankAccountInput = { bank: '', accountNumber: '' };
const EMPTY_BALANCE_FORM: UpdateBankAccountBalanceInput = { euros: '', date: todayIso() };
const EMPTY_STOCK_FORM: StockEntryInput = { custodyBank: '', stock: '', shareCount: '', purchasePrice: '', currentValuation: '' };

function accountFormFromEntity(account: BankAccount): BankAccountInput {
  return { bank: account.bank, accountNumber: account.accountNumber };
}

function balanceFormFromEntity(balance: BankAccountBalance): UpdateBankAccountBalanceInput {
  return { euros: balance.euros, date: balance.date };
}

function stockFormFromEntry(entry: StockEntry): StockEntryInput {
  return {
    custodyBank: entry.custodyBank,
    stock: entry.stock,
    shareCount: entry.shareCount,
    purchasePrice: entry.purchasePrice,
    currentValuation: entry.currentValuation,
  };
}

/** H3 criterio 2 (spec 018): calculado, nunca guardado — ver `wealth.calculations.ts` en el backend. */
function purchaseValue(purchasePrice: string, shareCount: string): string {
  const price = parseFloat(purchasePrice);
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
 * historial de saldos). 7 secciones plegables (H1 criterio 1/2 de spec 018,
 * mismo patrón `<details className="dashboard-section">` que el Dashboard,
 * spec 016/017): "Cuentas Bancarias" en dos niveles (cuenta → historial de
 * saldos anidado, spec 019), "Acciones" igual que en spec 018 (sin cambios),
 * las otras 5 con un aviso de "Próximamente.".
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

  const [stockEntries, setStockEntries] = useState<StockEntry[] | null>(null);
  const [stockLoadError, setStockLoadError] = useState<string | null>(null);
  const [newStockForm, setNewStockForm] = useState<StockEntryInput>(EMPTY_STOCK_FORM);
  const [createStockError, setCreateStockError] = useState<string | null>(null);
  const [isCreatingStock, setIsCreatingStock] = useState(false);
  const [editingStockId, setEditingStockId] = useState<string | null>(null);
  const [editingStockForm, setEditingStockForm] = useState<StockEntryInput>(EMPTY_STOCK_FORM);
  const [editStockError, setEditStockError] = useState<string | null>(null);
  const [isSavingStock, setIsSavingStock] = useState(false);
  const [pendingDeleteStockId, setPendingDeleteStockId] = useState<string | null>(null);
  const [stockActionError, setStockActionError] = useState<string | null>(null);

  async function reloadAccounts() {
    setAccounts(await listBankAccounts());
  }

  async function reloadBalances() {
    setBalances(await listBankAccountBalances());
  }

  async function reloadStockEntries() {
    setStockEntries(await listStockEntries());
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
        await reloadStockEntries();
      } catch (err) {
        if (!cancelled) setStockLoadError(err instanceof ApiError ? err.message : 'No se han podido cargar las acciones.');
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
      await createStockEntry(newStockForm);
      setNewStockForm(EMPTY_STOCK_FORM);
      await reloadStockEntries();
    } catch (err) {
      setCreateStockError(err instanceof ApiError ? err.message : 'No se ha podido crear la entrada.');
    } finally {
      setIsCreatingStock(false);
    }
  }

  function startEditStock(entry: StockEntry) {
    setEditStockError(null);
    setEditingStockId(entry.id);
    setEditingStockForm(stockFormFromEntry(entry));
  }

  async function handleEditStock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingStockId) return;
    setEditStockError(null);
    setIsSavingStock(true);
    try {
      await updateStockEntry(editingStockId, editingStockForm);
      setEditingStockId(null);
      await reloadStockEntries();
    } catch (err) {
      setEditStockError(err instanceof ApiError ? err.message : 'No se ha podido guardar la entrada.');
    } finally {
      setIsSavingStock(false);
    }
  }

  async function handleDeleteStock(id: string) {
    setStockActionError(null);
    setPendingDeleteStockId(id);
    try {
      await deleteStockEntry(id);
      await reloadStockEntries();
    } catch (err) {
      setStockActionError(err instanceof ApiError ? err.message : 'No se ha podido eliminar la entrada.');
    } finally {
      setPendingDeleteStockId(null);
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

        {stockLoadError && <p role="alert">{stockLoadError}</p>}
        {stockActionError && <p role="alert">{stockActionError}</p>}

        {stockEntries && stockEntries.length === 0 && <p>Todavía no tienes ninguna entrada de acciones.</p>}

        {stockEntries && stockEntries.length > 0 && (
          <ul id="wealth-stock-list" aria-label="Tus entradas de acciones">
            {stockEntries.map((entry) => {
              const isEditing = editingStockId === entry.id;

              if (isEditing) {
                return (
                  <li className="card elev-sm" key={entry.id}>
                    <form onSubmit={handleEditStock} aria-label={`Editar entrada: ${entry.stock}`} noValidate>
                      <div className="field">
                        <label htmlFor={`stock-${entry.id}-custodyBank`}>Banco Custodia</label>
                        <input
                          id={`stock-${entry.id}-custodyBank`}
                          className="input"
                          value={editingStockForm.custodyBank}
                          onChange={(e) => setEditingStockForm({ ...editingStockForm, custodyBank: e.target.value })}
                          required
                        />
                      </div>
                      <div className="field">
                        <label htmlFor={`stock-${entry.id}-stock`}>Acción</label>
                        <input
                          id={`stock-${entry.id}-stock`}
                          className="input"
                          value={editingStockForm.stock}
                          onChange={(e) => setEditingStockForm({ ...editingStockForm, stock: e.target.value })}
                          required
                        />
                      </div>
                      <div className="field">
                        <label htmlFor={`stock-${entry.id}-shareCount`}>Número acciones</label>
                        <input
                          id={`stock-${entry.id}-shareCount`}
                          className="input"
                          inputMode="decimal"
                          value={editingStockForm.shareCount}
                          onChange={(e) => setEditingStockForm({ ...editingStockForm, shareCount: e.target.value })}
                          required
                        />
                      </div>
                      <div className="field">
                        <label htmlFor={`stock-${entry.id}-purchasePrice`}>Precio compra</label>
                        <input
                          id={`stock-${entry.id}-purchasePrice`}
                          className="input"
                          inputMode="decimal"
                          value={editingStockForm.purchasePrice}
                          onChange={(e) => setEditingStockForm({ ...editingStockForm, purchasePrice: e.target.value })}
                          required
                        />
                      </div>
                      <p className="card-meta">
                        Valor compra: {formatCurrency(purchaseValue(editingStockForm.purchasePrice, editingStockForm.shareCount) || '0.00')}
                      </p>
                      <div className="field">
                        <label htmlFor={`stock-${entry.id}-currentValuation`}>Valoración actual</label>
                        <input
                          id={`stock-${entry.id}-currentValuation`}
                          className="input"
                          inputMode="decimal"
                          value={editingStockForm.currentValuation}
                          onChange={(e) => setEditingStockForm({ ...editingStockForm, currentValuation: e.target.value })}
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
                <li className="card elev-sm" key={entry.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="card-title">
                      {entry.stock} · {entry.custodyBank}
                    </span>
                    <span className="card-amount">{formatCurrency(entry.currentValuation)}</span>
                  </div>
                  <p className="card-meta">
                    {entry.shareCount} acciones · Precio compra: {formatCurrency(entry.purchasePrice)} · Valor compra:{' '}
                    {formatCurrency(purchaseValue(entry.purchasePrice, entry.shareCount) || '0.00')}
                  </p>
                  <div>
                    <button type="button" className="btn btn-secondary" onClick={() => startEditStock(entry)}>
                      Editar
                    </button>{' '}
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={pendingDeleteStockId === entry.id}
                      onClick={() => void handleDeleteStock(entry.id)}
                    >
                      {pendingDeleteStockId === entry.id ? 'Eliminando…' : 'Eliminar'}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <h3>Añadir entrada</h3>
        <form onSubmit={handleCreateStock} aria-label="Añadir entrada de acciones" noValidate>
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
          <p className="card-meta">
            Valor compra: {formatCurrency(purchaseValue(newStockForm.purchasePrice, newStockForm.shareCount) || '0.00')}
          </p>
          <div className="field">
            <label htmlFor="new-stock-currentValuation">Valoración actual</label>
            <input
              id="new-stock-currentValuation"
              className="input"
              inputMode="decimal"
              value={newStockForm.currentValuation}
              onChange={(e) => setNewStockForm({ ...newStockForm, currentValuation: e.target.value })}
              required
            />
          </div>
          {createStockError && <p role="alert">{createStockError}</p>}
          <button type="submit" className="btn btn-primary" disabled={isCreatingStock}>
            {isCreatingStock ? 'Creando…' : 'Añadir entrada'}
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
