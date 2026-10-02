import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useAuth } from '../auth/auth-context';
import { useConnectivity } from '../hooks/useConnectivity';
import { listStocks } from '../api/stocks';
import { createStockPurchase, deleteStockPurchase, listStockPurchases, updateStockPurchase } from '../api/stock-purchases';
import type { UpdateStockPurchaseInput } from '../api/stock-purchases';
import { createStockSale, deleteStockSale, listStockSales, updateStockSale } from '../api/stock-sales';
import type { UpdateStockSaleInput } from '../api/stock-sales';
import { createStockValuation, deleteStockValuation, listStockValuations, updateStockValuation } from '../api/stock-valuations';
import type { UpdateStockValuationInput } from '../api/stock-valuations';
import { createStockDividend, deleteStockDividend, listStockDividends, updateStockDividend } from '../api/stock-dividends';
import type { UpdateStockDividendInput } from '../api/stock-dividends';
import type { Stock } from '../api/stocks';
import type { StockPurchase } from '../api/stock-purchases';
import type { StockSale } from '../api/stock-sales';
import type { StockValuation } from '../api/stock-valuations';
import type { StockDividend } from '../api/stock-dividends';
import { ApiError } from '../api/client';
import { CHART_AXIS_PROPS, CHART_GRID_PROPS, CHART_LINE_PROPS, CHART_TOOLTIP_PROPS } from '../components/chart-theme';
import { formatCurrency } from './home-shared';
import { stocksTotal } from './stock-shared';
import { stockDetailStats, stockOperationsTimeline, stockRealizedGainLossByYear } from './stock-detail.calculations';
import type { StockOperation } from './stock-detail.calculations';


const OPERATION_LABELS: Record<StockOperation['kind'], string> = {
  purchase: 'Compra',
  sale: 'Venta',
  dividend: 'Dividendo',
  valuation: 'Valoración',
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function signedPercent(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function gainLossColor(value: number): string {
  return value >= 0 ? 'var(--status-green)' : 'var(--status-red)';
}

/** Construye el CSV del historial de operaciones — mismas columnas para las 4 clases de fila
 *  (huecas cuando no aplican), entrecomillado simple (`""` para escapar comillas literales). */
function operationsToCsv(stock: Stock, timeline: StockOperation[]): string {
  const header = ['Fecha', 'Tipo', 'Cantidad', 'Precio', 'Importe', 'Ganancia/pérdida realizada'];
  const rows = timeline.map((op) => {
    switch (op.kind) {
      case 'purchase':
        return [op.date, OPERATION_LABELS.purchase, op.shareCount, op.price, op.amount, ''];
      case 'sale':
        return [op.date, OPERATION_LABELS.sale, op.shareCount, op.price, op.amount, op.realizedGainLoss];
      case 'dividend':
        return [op.date, OPERATION_LABELS.dividend, '', '', op.netAmount, ''];
      case 'valuation':
        return [op.date, OPERATION_LABELS.valuation, '', op.pricePerShare, '', ''];
    }
  });
  return [[`${stock.stock} · ${stock.custodyBank}`], header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
}

function downloadTextFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Spec 031 h (venta de acciones): página de detalle de una acción, abierta al hacer clic en su
 * nombre desde "Patrimonio" (H1). Resumen de operaciones, ganancia/pérdida y estadísticas de una
 * única posición, con su propia alta/edición/borrado de compras, ventas, valoraciones y
 * dividendos — no solo lectura: sustituye aquí a la tarjeta de `WealthPage.tsx`, que sigue
 * teniendo la suya propia para quien prefiera editar sin salir de "Patrimonio".
 */
export function StockDetailPage() {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const isOnline = useConnectivity();
  const { id } = useParams<{ id: string }>();

  const [stocks, setStocks] = useState<Stock[] | null>(null);
  const [purchases, setPurchases] = useState<StockPurchase[] | null>(null);
  const [sales, setSales] = useState<StockSale[] | null>(null);
  const [valuations, setValuations] = useState<StockValuation[] | null>(null);
  const [dividends, setDividends] = useState<StockDividend[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !isOnline) return;
    let cancelled = false;
    (async () => {
      try {
        const [stockList, purchaseList, saleList, valuationList, dividendList] = await Promise.all([
          listStocks(),
          listStockPurchases(),
          listStockSales(),
          listStockValuations(),
          listStockDividends(),
        ]);
        if (cancelled) return;
        setStocks(stockList);
        setPurchases(purchaseList);
        setSales(saleList);
        setValuations(valuationList);
        setDividends(dividendList);
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof ApiError ? err.message : 'No se han podido cargar los datos de la acción.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isOnline]);

  async function reloadPurchases() {
    setPurchases(await listStockPurchases());
  }
  async function reloadSales() {
    setSales(await listStockSales());
  }
  async function reloadValuations() {
    setValuations(await listStockValuations());
  }
  async function reloadDividends() {
    setDividends(await listStockDividends());
  }

  const stock = stocks?.find((s) => s.id === id) ?? null;
  const stockPurchases = useMemo(() => (purchases ?? []).filter((p) => p.stockId === id), [purchases, id]);
  const stockSales = useMemo(() => (sales ?? []).filter((s) => s.stockId === id), [sales, id]);
  const stockValuations = useMemo(() => (valuations ?? []).filter((v) => v.stockId === id), [valuations, id]);
  const stockDividends = useMemo(() => (dividends ?? []).filter((d) => d.stockId === id), [dividends, id]);

  const stats = useMemo(
    () => stockDetailStats(stockPurchases, stockSales, stockDividends, stockValuations, todayIso()),
    [stockPurchases, stockSales, stockDividends, stockValuations],
  );
  const timeline = useMemo(
    () => stockOperationsTimeline(stockPurchases, stockSales, stockDividends, stockValuations),
    [stockPurchases, stockSales, stockDividends, stockValuations],
  );
  const valuationChartData = useMemo(
    () => [...stockValuations].sort((a, b) => (a.date < b.date ? -1 : 1)).map((v) => ({ date: v.date, price: parseFloat(v.pricePerShare) })),
    [stockValuations],
  );
  // H3 (spec 031 h): peso de esta posición sobre el total de Acciones — mismo `stocksTotal` que
  // usa la tarjeta "Total" de Patrimonio, sobre TODAS las posiciones (no solo la filtrada de arriba).
  const portfolioWeightPercent = useMemo(() => {
    if (!stocks || stats.currentValue === null) return null;
    const total = parseFloat(stocksTotal(stocks, purchases ?? [], sales ?? [], valuations ?? []));
    if (total <= 0) return null;
    return (parseFloat(stats.currentValue) / total) * 100;
  }, [stocks, purchases, sales, valuations, stats.currentValue]);
  const fiscalYears = useMemo(() => stockRealizedGainLossByYear(stockPurchases, stockSales), [stockPurchases, stockSales]);

  // — Añadir operación —
  const [newPurchaseForm, setNewPurchaseForm] = useState<UpdateStockPurchaseInput>({ shareCount: '', purchasePrice: '', date: todayIso() });
  const [isCreatingPurchase, setIsCreatingPurchase] = useState(false);
  const [createPurchaseError, setCreatePurchaseError] = useState<string | null>(null);

  const [newSaleForm, setNewSaleForm] = useState<UpdateStockSaleInput>({ shareCount: '', salePrice: '', date: todayIso() });
  const [isCreatingSale, setIsCreatingSale] = useState(false);
  const [createSaleError, setCreateSaleError] = useState<string | null>(null);

  const [newValuationForm, setNewValuationForm] = useState<UpdateStockValuationInput>({ pricePerShare: '', date: todayIso() });
  const [isCreatingValuation, setIsCreatingValuation] = useState(false);
  const [createValuationError, setCreateValuationError] = useState<string | null>(null);

  const [newDividendForm, setNewDividendForm] = useState<UpdateStockDividendInput>({ netAmount: '', retentionPercent: '19', date: todayIso() });
  const [isCreatingDividend, setIsCreatingDividend] = useState(false);
  const [createDividendError, setCreateDividendError] = useState<string | null>(null);

  // — Editar operación (una fila de "Operaciones" a la vez) —
  const [editingOperation, setEditingOperation] = useState<{ kind: StockOperation['kind']; id: string } | null>(null);
  const [editPurchaseForm, setEditPurchaseForm] = useState<UpdateStockPurchaseInput>({});
  const [editSaleForm, setEditSaleForm] = useState<UpdateStockSaleInput>({});
  const [editValuationForm, setEditValuationForm] = useState<UpdateStockValuationInput>({});
  const [editDividendForm, setEditDividendForm] = useState<UpdateStockDividendInput>({});
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // — Eliminar operación —
  const [pendingDeleteOperationId, setPendingDeleteOperationId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleCreatePurchase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!stock) return;
    setCreatePurchaseError(null);
    setIsCreatingPurchase(true);
    try {
      await createStockPurchase({
        stockId: stock.id,
        shareCount: newPurchaseForm.shareCount ?? '',
        purchasePrice: newPurchaseForm.purchasePrice ?? '',
        date: newPurchaseForm.date ?? todayIso(),
      });
      setNewPurchaseForm({ shareCount: '', purchasePrice: '', date: todayIso() });
      await reloadPurchases();
    } catch (err) {
      setCreatePurchaseError(err instanceof ApiError ? err.message : 'No se ha podido añadir la compra.');
    } finally {
      setIsCreatingPurchase(false);
    }
  }

  async function handleCreateSale(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!stock) return;
    setCreateSaleError(null);
    setIsCreatingSale(true);
    try {
      await createStockSale({
        stockId: stock.id,
        shareCount: newSaleForm.shareCount ?? '',
        salePrice: newSaleForm.salePrice ?? '',
        date: newSaleForm.date ?? todayIso(),
      });
      setNewSaleForm({ shareCount: '', salePrice: '', date: todayIso() });
      await reloadSales();
    } catch (err) {
      setCreateSaleError(err instanceof ApiError ? err.message : 'No se ha podido añadir la venta.');
    } finally {
      setIsCreatingSale(false);
    }
  }

  async function handleCreateValuation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!stock) return;
    setCreateValuationError(null);
    setIsCreatingValuation(true);
    try {
      await createStockValuation({ stockId: stock.id, pricePerShare: newValuationForm.pricePerShare ?? '', date: newValuationForm.date ?? todayIso() });
      setNewValuationForm({ pricePerShare: '', date: todayIso() });
      await reloadValuations();
    } catch (err) {
      setCreateValuationError(err instanceof ApiError ? err.message : 'No se ha podido añadir la valoración.');
    } finally {
      setIsCreatingValuation(false);
    }
  }

  async function handleCreateDividend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!stock) return;
    setCreateDividendError(null);
    setIsCreatingDividend(true);
    try {
      await createStockDividend({
        stockId: stock.id,
        netAmount: newDividendForm.netAmount ?? '',
        retentionPercent: newDividendForm.retentionPercent ?? '19',
        date: newDividendForm.date ?? todayIso(),
      });
      setNewDividendForm({ netAmount: '', retentionPercent: '19', date: todayIso() });
      await reloadDividends();
    } catch (err) {
      setCreateDividendError(err instanceof ApiError ? err.message : 'No se ha podido añadir el dividendo.');
    } finally {
      setIsCreatingDividend(false);
    }
  }

  function startEditOperation(op: StockOperation) {
    setEditError(null);
    setEditingOperation({ kind: op.kind, id: op.id });
    if (op.kind === 'purchase') setEditPurchaseForm({ shareCount: op.shareCount, purchasePrice: op.price, date: op.date });
    else if (op.kind === 'sale') setEditSaleForm({ shareCount: op.shareCount, salePrice: op.price, date: op.date });
    else if (op.kind === 'valuation') setEditValuationForm({ pricePerShare: op.pricePerShare, date: op.date });
    else {
      const original = stockDividends.find((d) => d.id === op.id);
      setEditDividendForm({ netAmount: op.netAmount, retentionPercent: original?.retentionPercent ?? '19', date: op.date });
    }
  }

  function cancelEditOperation() {
    setEditingOperation(null);
    setEditError(null);
  }

  async function handleSaveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingOperation) return;
    setEditError(null);
    setIsSavingEdit(true);
    try {
      if (editingOperation.kind === 'purchase') {
        await updateStockPurchase(editingOperation.id, editPurchaseForm);
        await reloadPurchases();
      } else if (editingOperation.kind === 'sale') {
        await updateStockSale(editingOperation.id, editSaleForm);
        await reloadSales();
      } else if (editingOperation.kind === 'valuation') {
        await updateStockValuation(editingOperation.id, editValuationForm);
        await reloadValuations();
      } else {
        await updateStockDividend(editingOperation.id, editDividendForm);
        await reloadDividends();
      }
      setEditingOperation(null);
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : 'No se ha podido guardar el cambio.');
    } finally {
      setIsSavingEdit(false);
    }
  }

  async function handleDeleteOperation(op: StockOperation) {
    setDeleteError(null);
    setPendingDeleteOperationId(op.id);
    try {
      if (op.kind === 'purchase') {
        await deleteStockPurchase(op.id);
        await reloadPurchases();
      } else if (op.kind === 'sale') {
        await deleteStockSale(op.id);
        await reloadSales();
      } else if (op.kind === 'valuation') {
        await deleteStockValuation(op.id);
        await reloadValuations();
      } else {
        await deleteStockDividend(op.id);
        await reloadDividends();
      }
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : 'No se ha podido eliminar la operación.');
    } finally {
      setPendingDeleteOperationId(null);
    }
  }

  function handleExportCsv() {
    if (!stock) return;
    downloadTextFile(
      `operaciones-${stock.stock}-${stock.custodyBank}.csv`.replace(/\s+/g, '_'),
      operationsToCsv(stock, timeline),
      'text/csv;charset=utf-8;',
    );
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
        <h1>Detalle de acción</h1>
        <p role="alert">Tienes que iniciar sesión para ver esto.</p>
        <p>
          <Link to="/login">Iniciar sesión</Link>
        </p>
      </main>
    );
  }

  return (
    <main>
      <p className="no-print">
        <Link to="/patrimonio#wealth-acciones">← Volver a Patrimonio</Link>
      </p>

      {!isOnline && <p role="alert">Sin conexión: no se puede cargar el detalle de esta acción.</p>}
      {loadError && <p role="alert">{loadError}</p>}
      {isOnline && stocks && !stock && <p role="alert">No se ha encontrado esta acción.</p>}

      {stock && (
        <>
          <div className="wealth-item-header">
            <h1>
              {stock.stock} <small style={{ fontWeight: 400, opacity: 0.7 }}>· {stock.custodyBank}</small>
            </h1>
            <div className="no-print">
              <button type="button" className="btn btn-secondary" onClick={() => window.print()}>
                Imprimir resumen
              </button>{' '}
              <button type="button" className="btn btn-secondary" onClick={handleExportCsv} disabled={timeline.length === 0}>
                Exportar operaciones (CSV)
              </button>
            </div>
          </div>

          <div className="comparison-grid">
            <div className="card elev-sm">
              <p className="card-kicker">Valor actual</p>
              <p className="card-amount">{stats.currentValue !== null ? formatCurrency(stats.currentValue) : 'Sin valoración'}</p>
              <p className="card-meta">
                {stats.heldShares} acciones en cartera
                {portfolioWeightPercent !== null && ` · ${portfolioWeightPercent.toFixed(1)}% de tus Acciones`}
              </p>
            </div>

            <div className="card elev-sm">
              <p className="card-kicker">Coste en cartera</p>
              <p className="card-amount">{formatCurrency(stats.heldCost)}</p>
              {stats.averageHeldPurchasePrice && <p className="card-meta">Precio medio: {formatCurrency(stats.averageHeldPurchasePrice)}/acción</p>}
            </div>

            <div className="card elev-sm">
              <p className="card-kicker">Ganancia/pérdida no realizada</p>
              {stats.unrealizedGainLossAmount !== null && stats.unrealizedGainLossPercent !== null ? (
                <>
                  <p className="card-amount" style={{ color: gainLossColor(parseFloat(stats.unrealizedGainLossAmount)) }}>
                    {formatCurrency(stats.unrealizedGainLossAmount)}
                  </p>
                  <p className="card-meta" style={{ color: gainLossColor(stats.unrealizedGainLossPercent) }}>
                    {signedPercent(stats.unrealizedGainLossPercent)}
                  </p>
                </>
              ) : (
                <p className="card-amount">Sin valoración</p>
              )}
            </div>

            <div className="card elev-sm">
              <p className="card-kicker">Ganancia/pérdida realizada</p>
              <p className="card-amount" style={{ color: gainLossColor(parseFloat(stats.realizedGainLoss)) }}>
                {formatCurrency(stats.realizedGainLoss)}
              </p>
              <p className="card-meta">{stats.saleCount} venta(s)</p>
            </div>

            <div className="card elev-sm">
              <p className="card-kicker">Dividendos cobrados</p>
              <p className="card-amount">{formatCurrency(stats.dividendsNet)}</p>
              <p className="card-meta">
                Bruto: {formatCurrency(stats.dividendsGross)} · {stats.dividendCount} pago(s)
              </p>
            </div>

            <div className="card elev-sm">
              <p className="card-kicker">Rentabilidad total</p>
              {stats.totalReturnAmount !== null && stats.totalReturnPercent !== null ? (
                <>
                  <p className="card-amount" style={{ color: gainLossColor(parseFloat(stats.totalReturnAmount)) }}>
                    {formatCurrency(stats.totalReturnAmount)}
                  </p>
                  <p className="card-meta" style={{ color: gainLossColor(stats.totalReturnPercent) }}>
                    {signedPercent(stats.totalReturnPercent)} sobre {formatCurrency(stats.totalPurchasedCost)} invertidos
                  </p>
                </>
              ) : (
                <p className="card-amount">Sin compras todavía</p>
              )}
            </div>

            <div className="card elev-sm">
              <p className="card-kicker">Rentabilidad anualizada (TIR)</p>
              {stats.annualizedReturnPercent !== null ? (
                <p className="card-amount" style={{ color: gainLossColor(stats.annualizedReturnPercent) }}>
                  {signedPercent(stats.annualizedReturnPercent)}
                </p>
              ) : (
                <p className="card-amount">No disponible</p>
              )}
              <p className="card-meta">TIR de todos los flujos (compras, ventas, dividendos y valor actual)</p>
            </div>
          </div>

          <h2>Estadísticas</h2>
          <table className="table">
            <tbody>
              <tr>
                <td>Total histórico comprado</td>
                <td>
                  {stats.totalSharesPurchased} acciones · {formatCurrency(stats.totalPurchasedCost)}
                </td>
              </tr>
              <tr>
                <td>Total vendido</td>
                <td>{stats.totalSharesSold} acciones</td>
              </tr>
              <tr>
                <td>Precio actual por acción</td>
                <td>{stats.lastValuationPrice ? `${formatCurrency(stats.lastValuationPrice)} (${stats.lastValuationDate})` : 'Sin valoración'}</td>
              </tr>
              <tr>
                <td>Primera compra</td>
                <td>{stats.firstPurchaseDate ?? '—'}</td>
              </tr>
              <tr>
                <td>Última operación</td>
                <td>{stats.lastOperationDate ?? '—'}</td>
              </tr>
              <tr>
                <td>Nº de operaciones</td>
                <td>
                  {stats.purchaseCount} compra(s) · {stats.saleCount} venta(s) · {stats.dividendCount} dividendo(s) · {stats.valuationCount}{' '}
                  valoración(es)
                </td>
              </tr>
              {portfolioWeightPercent !== null && (
                <tr>
                  <td>Peso en tu cartera de Acciones</td>
                  <td>{portfolioWeightPercent.toFixed(2)}%</td>
                </tr>
              )}
            </tbody>
          </table>

          {fiscalYears.length > 0 && (
            <>
              <h2>Impacto fiscal por año</h2>
              <p>
                Ganancia/pérdida realizada que esta acción aporta a cada ejercicio. La base imponible real de cada año depende de{' '}
                <strong>todas</strong> tus posiciones (con compensación de pérdidas de años anteriores incluida) — para la simulación completa,
                ve a{' '}
                <Link to="/patrimonio#wealth-acciones-impuestos" className="no-print">
                  Cálculo de impuestos
                </Link>{' '}
                en Patrimonio.
              </p>
              <table className="table">
                <thead>
                  <tr>
                    <th>Año</th>
                    <th>Ganancia/pérdida realizada</th>
                  </tr>
                </thead>
                <tbody>
                  {fiscalYears.map((row) => (
                    <tr key={row.year}>
                      <td>{row.year}</td>
                      <td style={{ color: gainLossColor(parseFloat(row.amount)) }}>{formatCurrency(row.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {valuationChartData.length >= 2 && (
            <>
              <h2>Evolución del precio por acción</h2>
              <div style={{ width: '100%', height: 280 }}>
                <ResponsiveContainer>
                  <LineChart data={valuationChartData} margin={{ left: 8 }}>
                    <CartesianGrid {...CHART_GRID_PROPS} />
                    <XAxis dataKey="date" {...CHART_AXIS_PROPS} />
                    <YAxis tickFormatter={(value: number) => formatCurrency(value.toFixed(2))} {...CHART_AXIS_PROPS} />
                    <Tooltip {...CHART_TOOLTIP_PROPS} formatter={(value) => [formatCurrency(Number(value).toFixed(2)), 'Precio/acción']} />
                    <Line {...CHART_LINE_PROPS} dataKey="price" name="Precio/acción" stroke="var(--accent)" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          )}

          <h2>Operaciones ({timeline.length})</h2>
          {deleteError && <p role="alert">{deleteError}</p>}
          {timeline.length === 0 && <p>Todavía no hay ninguna operación registrada en esta acción.</p>}
          {timeline.length > 0 && (
            <table className="table" aria-label={`Historial de operaciones de ${stock.stock} · ${stock.custodyBank}`}>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Tipo</th>
                  <th>Detalle</th>
                  <th>Importe</th>
                  <th className="no-print">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {timeline.map((op) => {
                  const isEditingThisRow = editingOperation?.kind === op.kind && editingOperation.id === op.id;

                  if (isEditingThisRow) {
                    return (
                      <tr key={`${op.kind}-${op.id}`}>
                        <td colSpan={5}>
                          <form onSubmit={handleSaveEdit} aria-label={`Editar ${OPERATION_LABELS[op.kind]} del ${op.date}`} noValidate>
                            {editError && <p role="alert">{editError}</p>}
                            {op.kind === 'purchase' && (
                              <div className="card-row">
                                <div className="field">
                                  <label htmlFor="edit-op-shareCount">Número acciones</label>
                                  <input
                                    id="edit-op-shareCount"
                                    className="input"
                                    inputMode="decimal"
                                    value={editPurchaseForm.shareCount ?? ''}
                                    onChange={(e) => setEditPurchaseForm({ ...editPurchaseForm, shareCount: e.target.value })}
                                    required
                                  />
                                </div>
                                <div className="field">
                                  <label htmlFor="edit-op-purchasePrice">Precio compra</label>
                                  <input
                                    id="edit-op-purchasePrice"
                                    className="input"
                                    inputMode="decimal"
                                    value={editPurchaseForm.purchasePrice ?? ''}
                                    onChange={(e) => setEditPurchaseForm({ ...editPurchaseForm, purchasePrice: e.target.value })}
                                    required
                                  />
                                </div>
                                <div className="field">
                                  <label htmlFor="edit-op-date">Fecha</label>
                                  <input
                                    id="edit-op-date"
                                    className="input"
                                    type="date"
                                    value={editPurchaseForm.date ?? ''}
                                    onChange={(e) => setEditPurchaseForm({ ...editPurchaseForm, date: e.target.value })}
                                    required
                                  />
                                </div>
                              </div>
                            )}
                            {op.kind === 'sale' && (
                              <div className="card-row">
                                <div className="field">
                                  <label htmlFor="edit-op-shareCount">Número acciones</label>
                                  <input
                                    id="edit-op-shareCount"
                                    className="input"
                                    inputMode="decimal"
                                    value={editSaleForm.shareCount ?? ''}
                                    onChange={(e) => setEditSaleForm({ ...editSaleForm, shareCount: e.target.value })}
                                    required
                                  />
                                </div>
                                <div className="field">
                                  <label htmlFor="edit-op-salePrice">Precio venta</label>
                                  <input
                                    id="edit-op-salePrice"
                                    className="input"
                                    inputMode="decimal"
                                    value={editSaleForm.salePrice ?? ''}
                                    onChange={(e) => setEditSaleForm({ ...editSaleForm, salePrice: e.target.value })}
                                    required
                                  />
                                </div>
                                <div className="field">
                                  <label htmlFor="edit-op-date">Fecha</label>
                                  <input
                                    id="edit-op-date"
                                    className="input"
                                    type="date"
                                    value={editSaleForm.date ?? ''}
                                    onChange={(e) => setEditSaleForm({ ...editSaleForm, date: e.target.value })}
                                    required
                                  />
                                </div>
                              </div>
                            )}
                            {op.kind === 'valuation' && (
                              <div className="card-row">
                                <div className="field">
                                  <label htmlFor="edit-op-pricePerShare">Precio por acción</label>
                                  <input
                                    id="edit-op-pricePerShare"
                                    className="input"
                                    inputMode="decimal"
                                    value={editValuationForm.pricePerShare ?? ''}
                                    onChange={(e) => setEditValuationForm({ ...editValuationForm, pricePerShare: e.target.value })}
                                    required
                                  />
                                </div>
                                <div className="field">
                                  <label htmlFor="edit-op-date">Fecha</label>
                                  <input
                                    id="edit-op-date"
                                    className="input"
                                    type="date"
                                    value={editValuationForm.date ?? ''}
                                    onChange={(e) => setEditValuationForm({ ...editValuationForm, date: e.target.value })}
                                    required
                                  />
                                </div>
                              </div>
                            )}
                            {op.kind === 'dividend' && (
                              <div className="card-row">
                                <div className="field">
                                  <label htmlFor="edit-op-netAmount">Importe neto</label>
                                  <input
                                    id="edit-op-netAmount"
                                    className="input"
                                    inputMode="decimal"
                                    value={editDividendForm.netAmount ?? ''}
                                    onChange={(e) => setEditDividendForm({ ...editDividendForm, netAmount: e.target.value })}
                                    required
                                  />
                                </div>
                                <div className="field">
                                  <label htmlFor="edit-op-retentionPercent">% Retención</label>
                                  <input
                                    id="edit-op-retentionPercent"
                                    className="input"
                                    inputMode="decimal"
                                    value={editDividendForm.retentionPercent ?? ''}
                                    onChange={(e) => setEditDividendForm({ ...editDividendForm, retentionPercent: e.target.value })}
                                    required
                                  />
                                </div>
                                <div className="field">
                                  <label htmlFor="edit-op-date">Fecha</label>
                                  <input
                                    id="edit-op-date"
                                    className="input"
                                    type="date"
                                    value={editDividendForm.date ?? ''}
                                    onChange={(e) => setEditDividendForm({ ...editDividendForm, date: e.target.value })}
                                    required
                                  />
                                </div>
                              </div>
                            )}
                            <button type="submit" className="btn btn-primary" disabled={isSavingEdit}>
                              {isSavingEdit ? 'Guardando…' : 'Guardar'}
                            </button>{' '}
                            <button type="button" className="btn btn-ghost" onClick={cancelEditOperation}>
                              Cancelar
                            </button>
                          </form>
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr key={`${op.kind}-${op.id}`}>
                      <td>{op.date}</td>
                      <td>{OPERATION_LABELS[op.kind]}</td>
                      <td>
                        {op.kind === 'purchase' && `${op.shareCount} acciones a ${formatCurrency(op.price)}`}
                        {op.kind === 'sale' && (
                          <>
                            {op.shareCount} acciones a {formatCurrency(op.price)}
                            {' · '}
                            <span style={{ color: gainLossColor(parseFloat(op.realizedGainLoss)) }}>{formatCurrency(op.realizedGainLoss)}</span>
                          </>
                        )}
                        {op.kind === 'dividend' && `Bruto: ${formatCurrency(op.grossAmount)}`}
                        {op.kind === 'valuation' && `${formatCurrency(op.pricePerShare)}/acción`}
                      </td>
                      <td>
                        {op.kind === 'purchase' && formatCurrency(op.amount)}
                        {op.kind === 'sale' && formatCurrency(op.amount)}
                        {op.kind === 'dividend' && formatCurrency(op.netAmount)}
                        {op.kind === 'valuation' && '—'}
                      </td>
                      <td className="no-print">
                        <button
                          type="button"
                          className="btn btn-secondary"
                          aria-label={`Editar ${OPERATION_LABELS[op.kind]} del ${op.date}`}
                          onClick={() => startEditOperation(op)}
                        >
                          Editar
                        </button>{' '}
                        <button
                          type="button"
                          className="btn btn-ghost"
                          aria-label={`Eliminar ${OPERATION_LABELS[op.kind]} del ${op.date}`}
                          disabled={pendingDeleteOperationId === op.id}
                          onClick={() => void handleDeleteOperation(op)}
                        >
                          {pendingDeleteOperationId === op.id ? 'Eliminando…' : 'Eliminar'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          <details className="dashboard-section no-print">
            <summary>
              <h2>Añadir operación</h2>
            </summary>

            <h3>Compra</h3>
            <form onSubmit={handleCreatePurchase} aria-label={`Añadir compra: ${stock.stock}`} noValidate>
              {createPurchaseError && <p role="alert">{createPurchaseError}</p>}
              <div className="card-row">
                <div className="field">
                  <label htmlFor="new-purchase-shareCount">Número acciones</label>
                  <input
                    id="new-purchase-shareCount"
                    className="input"
                    inputMode="decimal"
                    value={newPurchaseForm.shareCount ?? ''}
                    onChange={(e) => setNewPurchaseForm({ ...newPurchaseForm, shareCount: e.target.value })}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="new-purchase-purchasePrice">Precio compra</label>
                  <input
                    id="new-purchase-purchasePrice"
                    className="input"
                    inputMode="decimal"
                    value={newPurchaseForm.purchasePrice ?? ''}
                    onChange={(e) => setNewPurchaseForm({ ...newPurchaseForm, purchasePrice: e.target.value })}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="new-purchase-date">Fecha de compra</label>
                  <input
                    id="new-purchase-date"
                    className="input"
                    type="date"
                    value={newPurchaseForm.date ?? ''}
                    onChange={(e) => setNewPurchaseForm({ ...newPurchaseForm, date: e.target.value })}
                    required
                  />
                </div>
              </div>
              <button type="submit" className="btn btn-primary" disabled={isCreatingPurchase}>
                {isCreatingPurchase ? 'Añadiendo…' : 'Añadir compra'}
              </button>
            </form>

            <h3>Venta</h3>
            <form onSubmit={handleCreateSale} aria-label={`Añadir venta: ${stock.stock}`} noValidate>
              {createSaleError && <p role="alert">{createSaleError}</p>}
              <div className="card-row">
                <div className="field">
                  <label htmlFor="new-sale-shareCount">Número acciones vendidas</label>
                  <input
                    id="new-sale-shareCount"
                    className="input"
                    inputMode="decimal"
                    value={newSaleForm.shareCount ?? ''}
                    onChange={(e) => setNewSaleForm({ ...newSaleForm, shareCount: e.target.value })}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="new-sale-salePrice">Precio de venta</label>
                  <input
                    id="new-sale-salePrice"
                    className="input"
                    inputMode="decimal"
                    value={newSaleForm.salePrice ?? ''}
                    onChange={(e) => setNewSaleForm({ ...newSaleForm, salePrice: e.target.value })}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="new-sale-date">Fecha de venta</label>
                  <input
                    id="new-sale-date"
                    className="input"
                    type="date"
                    value={newSaleForm.date ?? ''}
                    onChange={(e) => setNewSaleForm({ ...newSaleForm, date: e.target.value })}
                    required
                  />
                </div>
              </div>
              <button type="submit" className="btn btn-primary" disabled={isCreatingSale}>
                {isCreatingSale ? 'Añadiendo…' : 'Añadir venta'}
              </button>
            </form>

            <h3>Valoración</h3>
            <form onSubmit={handleCreateValuation} aria-label={`Añadir valoración: ${stock.stock}`} noValidate>
              {createValuationError && <p role="alert">{createValuationError}</p>}
              <div className="card-row">
                <div className="field">
                  <label htmlFor="new-valuation-pricePerShare">Precio por acción actual</label>
                  <input
                    id="new-valuation-pricePerShare"
                    className="input"
                    inputMode="decimal"
                    value={newValuationForm.pricePerShare ?? ''}
                    onChange={(e) => setNewValuationForm({ ...newValuationForm, pricePerShare: e.target.value })}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="new-valuation-date">Fecha</label>
                  <input
                    id="new-valuation-date"
                    className="input"
                    type="date"
                    value={newValuationForm.date ?? ''}
                    onChange={(e) => setNewValuationForm({ ...newValuationForm, date: e.target.value })}
                    required
                  />
                </div>
              </div>
              <button type="submit" className="btn btn-primary" disabled={isCreatingValuation}>
                {isCreatingValuation ? 'Añadiendo…' : 'Añadir valoración'}
              </button>
            </form>

            <h3>Dividendo</h3>
            <form onSubmit={handleCreateDividend} aria-label={`Añadir dividendo: ${stock.stock}`} noValidate>
              {createDividendError && <p role="alert">{createDividendError}</p>}
              <div className="card-row">
                <div className="field">
                  <label htmlFor="new-dividend-netAmount">Importe neto</label>
                  <input
                    id="new-dividend-netAmount"
                    className="input"
                    inputMode="decimal"
                    value={newDividendForm.netAmount ?? ''}
                    onChange={(e) => setNewDividendForm({ ...newDividendForm, netAmount: e.target.value })}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="new-dividend-retentionPercent">% Retención</label>
                  <input
                    id="new-dividend-retentionPercent"
                    className="input"
                    inputMode="decimal"
                    value={newDividendForm.retentionPercent ?? ''}
                    onChange={(e) => setNewDividendForm({ ...newDividendForm, retentionPercent: e.target.value })}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="new-dividend-date">Fecha</label>
                  <input
                    id="new-dividend-date"
                    className="input"
                    type="date"
                    value={newDividendForm.date ?? ''}
                    onChange={(e) => setNewDividendForm({ ...newDividendForm, date: e.target.value })}
                    required
                  />
                </div>
              </div>
              <button type="submit" className="btn btn-primary" disabled={isCreatingDividend}>
                {isCreatingDividend ? 'Añadiendo…' : 'Añadir dividendo'}
              </button>
            </form>
          </details>
        </>
      )}
    </main>
  );
}
