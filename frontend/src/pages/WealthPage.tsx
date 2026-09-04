import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { useConnectivity } from '../hooks/useConnectivity';
import {
  createBankAccountEntry,
  deleteBankAccountEntry,
  listBankAccountEntries,
  updateBankAccountEntry,
} from '../api/bank-account-entries';
import type { BankAccountEntry, BankAccountEntryInput } from '../api/bank-account-entries';
import { createStockEntry, deleteStockEntry, listStockEntries, updateStockEntry } from '../api/stock-entries';
import type { StockEntry, StockEntryInput } from '../api/stock-entries';
import { ApiError } from '../api/client';
import { formatCurrency } from './home-shared';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const EMPTY_BANK_FORM: BankAccountEntryInput = { bank: '', accountNumber: '', euros: '', date: todayIso() };
const EMPTY_STOCK_FORM: StockEntryInput = { custodyBank: '', stock: '', shareCount: '', purchasePrice: '', currentValuation: '' };

function bankFormFromEntry(entry: BankAccountEntry): BankAccountEntryInput {
  return { bank: entry.bank, accountNumber: entry.accountNumber, euros: entry.euros, date: entry.date };
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

/** Las 5 categorías de spec.md §2 sin funcionalidad todavía (H1 criterio 3). */
const PLACEHOLDER_SECTIONS = [
  { icon: '💹', label: 'Fondos Inversión' },
  { icon: '₿', label: 'Cripto' },
  { icon: '🚗', label: 'Vehículos' },
  { icon: '👴', label: 'Fondo Pensiones' },
  { icon: '💵', label: 'Efectivo' },
];

/**
 * Spec 018 (Resumen Patrimonio). 7 secciones plegables (H1 criterio 1/2,
 * mismo patrón `<details className="dashboard-section">` que el Dashboard,
 * spec 016/017 — la clase ya es genérica, no exclusiva de esa página): las
 * 2 primeras con CRUD completo (lista + alta + edición in-line + borrado,
 * mismo patrón que "Presupuestos de gasto" en `GoalsPage.tsx`), las otras 5
 * con un aviso de "Próximamente." (H1 criterio 3).
 */
export function WealthPage() {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const isOnline = useConnectivity();

  const [bankEntries, setBankEntries] = useState<BankAccountEntry[] | null>(null);
  const [bankLoadError, setBankLoadError] = useState<string | null>(null);
  const [newBankForm, setNewBankForm] = useState<BankAccountEntryInput>(EMPTY_BANK_FORM);
  const [createBankError, setCreateBankError] = useState<string | null>(null);
  const [isCreatingBank, setIsCreatingBank] = useState(false);
  const [editingBankId, setEditingBankId] = useState<string | null>(null);
  const [editingBankForm, setEditingBankForm] = useState<BankAccountEntryInput>(EMPTY_BANK_FORM);
  const [editBankError, setEditBankError] = useState<string | null>(null);
  const [isSavingBank, setIsSavingBank] = useState(false);
  const [pendingDeleteBankId, setPendingDeleteBankId] = useState<string | null>(null);
  const [bankActionError, setBankActionError] = useState<string | null>(null);

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

  async function reloadBankEntries() {
    setBankEntries(await listBankAccountEntries());
  }

  async function reloadStockEntries() {
    setStockEntries(await listStockEntries());
  }

  useEffect(() => {
    if (!isAuthenticated || !isOnline) return;
    let cancelled = false;
    (async () => {
      try {
        await reloadBankEntries();
      } catch (err) {
        if (!cancelled) setBankLoadError(err instanceof ApiError ? err.message : 'No se han podido cargar las cuentas bancarias.');
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

  async function handleCreateBank(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateBankError(null);
    setIsCreatingBank(true);
    try {
      await createBankAccountEntry(newBankForm);
      setNewBankForm({ ...EMPTY_BANK_FORM, date: todayIso() });
      await reloadBankEntries();
    } catch (err) {
      setCreateBankError(err instanceof ApiError ? err.message : 'No se ha podido crear la entrada.');
    } finally {
      setIsCreatingBank(false);
    }
  }

  function startEditBank(entry: BankAccountEntry) {
    setEditBankError(null);
    setEditingBankId(entry.id);
    setEditingBankForm(bankFormFromEntry(entry));
  }

  async function handleEditBank(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingBankId) return;
    setEditBankError(null);
    setIsSavingBank(true);
    try {
      await updateBankAccountEntry(editingBankId, editingBankForm);
      setEditingBankId(null);
      await reloadBankEntries();
    } catch (err) {
      setEditBankError(err instanceof ApiError ? err.message : 'No se ha podido guardar la entrada.');
    } finally {
      setIsSavingBank(false);
    }
  }

  async function handleDeleteBank(id: string) {
    setBankActionError(null);
    setPendingDeleteBankId(id);
    try {
      await deleteBankAccountEntry(id);
      await reloadBankEntries();
    } catch (err) {
      setBankActionError(err instanceof ApiError ? err.message : 'No se ha podido eliminar la entrada.');
    } finally {
      setPendingDeleteBankId(null);
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

        {bankLoadError && <p role="alert">{bankLoadError}</p>}
        {bankActionError && <p role="alert">{bankActionError}</p>}

        {bankEntries && bankEntries.length === 0 && <p>Todavía no tienes ninguna entrada de cuentas bancarias.</p>}

        {bankEntries && bankEntries.length > 0 && (
          <ul id="wealth-bank-account-list" aria-label="Tus entradas de cuentas bancarias">
            {bankEntries.map((entry) => {
              const isEditing = editingBankId === entry.id;

              if (isEditing) {
                return (
                  <li className="card elev-sm" key={entry.id}>
                    <form onSubmit={handleEditBank} aria-label={`Editar entrada: ${entry.bank}`} noValidate>
                      <div className="field">
                        <label htmlFor={`bank-${entry.id}-bank`}>Banco</label>
                        <input
                          id={`bank-${entry.id}-bank`}
                          className="input"
                          value={editingBankForm.bank}
                          onChange={(e) => setEditingBankForm({ ...editingBankForm, bank: e.target.value })}
                          required
                        />
                      </div>
                      <div className="field">
                        <label htmlFor={`bank-${entry.id}-accountNumber`}>Número de Cuenta</label>
                        <input
                          id={`bank-${entry.id}-accountNumber`}
                          className="input"
                          value={editingBankForm.accountNumber}
                          onChange={(e) => setEditingBankForm({ ...editingBankForm, accountNumber: e.target.value })}
                          required
                        />
                      </div>
                      <div className="field">
                        <label htmlFor={`bank-${entry.id}-euros`}>Euros</label>
                        <input
                          id={`bank-${entry.id}-euros`}
                          className="input"
                          inputMode="decimal"
                          value={editingBankForm.euros}
                          onChange={(e) => setEditingBankForm({ ...editingBankForm, euros: e.target.value })}
                          required
                        />
                      </div>
                      <div className="field">
                        <label htmlFor={`bank-${entry.id}-date`}>Fecha</label>
                        <input
                          id={`bank-${entry.id}-date`}
                          type="date"
                          className="input"
                          value={editingBankForm.date}
                          onChange={(e) => setEditingBankForm({ ...editingBankForm, date: e.target.value })}
                          required
                        />
                      </div>
                      {editBankError && <p role="alert">{editBankError}</p>}
                      <button type="submit" className="btn btn-primary" disabled={isSavingBank}>
                        {isSavingBank ? 'Guardando…' : 'Guardar'}
                      </button>{' '}
                      <button type="button" className="btn btn-secondary" disabled={isSavingBank} onClick={() => setEditingBankId(null)}>
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
                      {entry.bank} · {entry.accountNumber}
                    </span>
                    <span className="card-amount">{formatCurrency(entry.euros)}</span>
                  </div>
                  <p className="card-meta">Fecha: {entry.date}</p>
                  <div>
                    <button type="button" className="btn btn-secondary" onClick={() => startEditBank(entry)}>
                      Editar
                    </button>{' '}
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={pendingDeleteBankId === entry.id}
                      onClick={() => void handleDeleteBank(entry.id)}
                    >
                      {pendingDeleteBankId === entry.id ? 'Eliminando…' : 'Eliminar'}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <h3>Añadir entrada</h3>
        <form onSubmit={handleCreateBank} aria-label="Añadir entrada de cuenta bancaria" noValidate>
          <div className="field">
            <label htmlFor="new-bank-bank">Banco</label>
            <input
              id="new-bank-bank"
              className="input"
              value={newBankForm.bank}
              onChange={(e) => setNewBankForm({ ...newBankForm, bank: e.target.value })}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="new-bank-accountNumber">Número de Cuenta</label>
            <input
              id="new-bank-accountNumber"
              className="input"
              value={newBankForm.accountNumber}
              onChange={(e) => setNewBankForm({ ...newBankForm, accountNumber: e.target.value })}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="new-bank-euros">Euros</label>
            <input
              id="new-bank-euros"
              className="input"
              inputMode="decimal"
              placeholder="p. ej. 1500.00 o -50.00"
              value={newBankForm.euros}
              onChange={(e) => setNewBankForm({ ...newBankForm, euros: e.target.value })}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="new-bank-date">Fecha</label>
            <input
              id="new-bank-date"
              type="date"
              className="input"
              value={newBankForm.date}
              onChange={(e) => setNewBankForm({ ...newBankForm, date: e.target.value })}
              required
            />
          </div>
          {createBankError && <p role="alert">{createBankError}</p>}
          <button type="submit" className="btn btn-primary" disabled={isCreatingBank}>
            {isCreatingBank ? 'Creando…' : 'Añadir entrada'}
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
