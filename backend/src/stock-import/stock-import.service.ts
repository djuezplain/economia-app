import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { eq } from 'drizzle-orm';
import { DB } from '../db/db.module.js';
import type { Database } from '../db/db.module.js';
import { stocks, stockPurchases, stockSales, stockValuations } from '../db/schema/index.js';
import { InvalidStockCsvError, matchStockNames, parseStockCsv } from './stock-import.parsing.js';
import type { ExistingStockRef, ParsedStockCsv } from './stock-import.parsing.js';
import type { StockImportOptionsDto } from './dto/stock-import-options.dto.js';
import type { StockImportRowSummary, StockImportSummary } from './stock-import.types.js';

type Executor = Database | Parameters<Parameters<Database['transaction']>[0]>[0];

interface AmountRow {
  date: string;
  shareCount: Decimal;
  price: Decimal;
}

interface DedupeResult {
  toImport: AmountRow[];
  alreadyExisting: number;
}

/**
 * Spec 033 (H1-H6). Import aditivo de un CSV de Investing.com — nunca borra
 * ni sobrescribe nada, solo añade acciones/compras/ventas/valoraciones que
 * falten (plan.md §6-§8, §15). Mismo patrón `preview`/`confirm` que
 * `DataImportService` (spec 032): la misma función calcula el resumen,
 * escribiendo o no según el flag `write`.
 */
@Injectable()
export class StockImportService {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** H1: no escribe nada — solo calcula qué se importaría. */
  async preview(userId: string, buffer: Buffer, options: StockImportOptionsDto): Promise<StockImportSummary> {
    this.assertAtLeastOneSelected(options);
    const csv = this.parseFile(buffer);
    return this.computeSummary(this.db, userId, csv, options, false);
  }

  /** H1-H6: todo dentro de una única transacción — mismo criterio "todo o nada" que spec 003/032. */
  async confirm(userId: string, buffer: Buffer, options: StockImportOptionsDto): Promise<StockImportSummary> {
    this.assertAtLeastOneSelected(options);
    const csv = this.parseFile(buffer);
    try {
      return await this.db.transaction((tx) => this.computeSummary(tx, userId, csv, options, true));
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      const cause = err instanceof Error && err.cause instanceof Error ? err.cause : err;
      const message = cause instanceof Error ? cause.message : String(cause);
      throw new BadRequestException(`No se ha podido importar el fichero: ${message}`);
    }
  }

  /** H6 criterio 4: red de seguridad del lado servidor — la pantalla ya bloquea este caso sin llamar a la API. */
  private assertAtLeastOneSelected(options: StockImportOptionsDto): void {
    if (!options.includePurchases && !options.includeSales && !options.includeValuations) {
      throw new BadRequestException('Selecciona al menos un historial a importar (compras, ventas o valoraciones).');
    }
  }

  private parseFile(buffer: Buffer): ParsedStockCsv {
    try {
      return parseStockCsv(buffer);
    } catch (err) {
      if (err instanceof InvalidStockCsvError) throw new BadRequestException(err.message);
      throw err;
    }
  }

  private async computeSummary(
    executor: Executor,
    userId: string,
    csv: ParsedStockCsv,
    options: StockImportOptionsDto,
    write: boolean,
  ): Promise<StockImportSummary> {
    const existingStockRows = await executor.select().from(stocks).where(eq(stocks.userId, userId));
    const existingStocks: ExistingStockRef[] = existingStockRows.map((s) => ({ id: s.id, custodyBank: s.custodyBank, stock: s.stock }));

    const allNames = [...csv.openLots.map((o) => o.nombre), ...csv.closedLots.map((c) => c.nombre)];
    const matches = matchStockNames(allNames, existingStocks);

    const today = todayIsoDate();
    const rows: StockImportRowSummary[] = [];
    let newStocks = 0;
    let existingStocksCount = 0;
    let ambiguousStocks = 0;

    for (const match of matches) {
      const csvPurchases: AmountRow[] = [
        ...csv.openLots.filter((o) => o.nombre === match.nombre).map((o) => ({ date: o.fechaApertura, shareCount: o.cantidad, price: o.precioEntrada })),
        ...csv.closedLots
          .filter((c) => c.nombre === match.nombre)
          .map((c) => ({ date: c.fechaApertura, shareCount: c.cantidad, price: c.precioEntrada })),
      ];
      const csvSales: AmountRow[] = csv.closedLots
        .filter((c) => c.nombre === match.nombre)
        .map((c) => ({ date: c.fechaCierre, shareCount: c.cantidad, price: c.precioCierre }));
      const csvValuations: AmountRow[] = csv.summary
        .filter((s) => s.nombre === match.nombre)
        .map((s) => ({ date: today, shareCount: new Decimal(0), price: s.precioActual }));

      if (match.status === 'ambiguous') {
        ambiguousStocks++;
        rows.push({
          name: match.nombre,
          status: 'ambiguous',
          custodyBank: null,
          purchases: { total: csvPurchases.length, toImport: 0, alreadyExisting: 0 },
          sales: { total: csvSales.length, toImport: 0, alreadyExisting: 0 },
          valuations: { total: csvValuations.length, toImport: 0, alreadyExisting: 0 },
        });
        continue;
      }

      const hasExistingHistory = match.status === 'existing';
      let existingId: string | undefined;
      let custodyBank: string;
      if (hasExistingHistory) {
        existingId = match.existingStock!.id;
        custodyBank = match.existingStock!.custodyBank;
        existingStocksCount++;
      } else {
        custodyBank = '-';
        newStocks++;
      }

      // H6 criterio 3: un historial desmarcado no toca la base de datos en absoluto, ni siquiera para comprobar duplicados.
      const existingPurchaseKeys =
        hasExistingHistory && options.includePurchases ? await this.fetchPurchaseKeys(executor, existingId!) : new Set<string>();
      const existingSaleKeys = hasExistingHistory && options.includeSales ? await this.fetchSaleKeys(executor, existingId!) : new Set<string>();
      const existingValuationKeys =
        hasExistingHistory && options.includeValuations ? await this.fetchValuationKeys(executor, existingId!) : new Set<string>();

      // H6 criterio 2: `total` sigue siendo el nº real del CSV; un historial desmarcado siempre tiene `toImport: 0`.
      const purchaseResult: DedupeResult = options.includePurchases
        ? dedupeAgainstExisting(csvPurchases, existingPurchaseKeys, amountKey)
        : { toImport: [], alreadyExisting: 0 };
      const saleResult: DedupeResult = options.includeSales
        ? dedupeAgainstExisting(csvSales, existingSaleKeys, amountKey)
        : { toImport: [], alreadyExisting: 0 };
      const valuationResult: DedupeResult = options.includeValuations
        ? dedupeAgainstExisting(csvValuations, existingValuationKeys, (r) => r.date)
        : { toImport: [], alreadyExisting: 0 };

      const hasAnythingToImport = purchaseResult.toImport.length > 0 || saleResult.toImport.length > 0 || valuationResult.toImport.length > 0;

      // H6 criterio 6: una acción nueva que, tras la selección, no traería ninguna fila no se crea vacía.
      if (write && hasAnythingToImport) {
        let stockId: string;
        if (hasExistingHistory) {
          stockId = existingId!;
        } else {
          const [created] = await executor.insert(stocks).values({ userId, custodyBank, stock: match.nombre }).returning();
          stockId = created.id;
        }
        if (purchaseResult.toImport.length > 0) {
          await executor
            .insert(stockPurchases)
            .values(purchaseResult.toImport.map((p) => ({ stockId, shareCount: p.shareCount.toFixed(8), purchasePrice: p.price.toFixed(8), date: p.date })));
        }
        if (saleResult.toImport.length > 0) {
          await executor
            .insert(stockSales)
            .values(saleResult.toImport.map((s) => ({ stockId, shareCount: s.shareCount.toFixed(8), salePrice: s.price.toFixed(8), date: s.date })));
        }
        if (valuationResult.toImport.length > 0) {
          await executor.insert(stockValuations).values(valuationResult.toImport.map((v) => ({ stockId, pricePerShare: v.price.toFixed(2), date: v.date })));
        }
      }

      rows.push({
        name: match.nombre,
        status: match.status,
        custodyBank,
        purchases: { total: csvPurchases.length, toImport: purchaseResult.toImport.length, alreadyExisting: purchaseResult.alreadyExisting },
        sales: { total: csvSales.length, toImport: saleResult.toImport.length, alreadyExisting: saleResult.alreadyExisting },
        valuations: { total: csvValuations.length, toImport: valuationResult.toImport.length, alreadyExisting: valuationResult.alreadyExisting },
      });
    }

    return { stocks: rows, totals: { newStocks, existingStocks: existingStocksCount, ambiguousStocks } };
  }

  private async fetchPurchaseKeys(executor: Executor, stockId: string): Promise<Set<string>> {
    const rows = await executor.select().from(stockPurchases).where(eq(stockPurchases.stockId, stockId));
    return new Set(rows.map((r) => amountKey({ date: r.date, shareCount: new Decimal(r.shareCount), price: new Decimal(r.purchasePrice) })));
  }

  private async fetchSaleKeys(executor: Executor, stockId: string): Promise<Set<string>> {
    const rows = await executor.select().from(stockSales).where(eq(stockSales.stockId, stockId));
    return new Set(rows.map((r) => amountKey({ date: r.date, shareCount: new Decimal(r.shareCount), price: new Decimal(r.salePrice) })));
  }

  private async fetchValuationKeys(executor: Executor, stockId: string): Promise<Set<string>> {
    const rows = await executor.select().from(stockValuations).where(eq(stockValuations.stockId, stockId));
    return new Set(rows.map((r) => r.date));
  }
}

/**
 * plan.md §7: coincidencia exacta por fecha, nº de acciones y precio —
 * normalizado a 8 decimales antes de comparar para que un valor recién
 * parseado del CSV (`Decimal`, sin relleno) coincida con el mismo valor ya
 * guardado en Postgres (`numeric`, devuelto por Drizzle como texto con
 * ceros de relleno hasta la escala de la columna).
 */
function amountKey(row: AmountRow): string {
  return `${row.date}|${row.shareCount.toFixed(8)}|${row.price.toFixed(8)}`;
}

/**
 * plan.md §7 (última viñeta): deduplica tanto contra lo ya existente en
 * base de datos como dentro del propio fichero — si el CSV trajera dos
 * lotes idénticos, el segundo se cuenta como "ya existente" en vez de
 * insertarse dos veces.
 */
function dedupeAgainstExisting<T>(csvRows: T[], existingKeys: Set<string>, keyOf: (row: T) => string): { toImport: T[]; alreadyExisting: number } {
  const seen = new Set(existingKeys);
  const toImport: T[] = [];
  let alreadyExisting = 0;
  for (const row of csvRows) {
    const key = keyOf(row);
    if (seen.has(key)) {
      alreadyExisting++;
    } else {
      toImport.push(row);
      seen.add(key);
    }
  }
  return { toImport, alreadyExisting };
}

function todayIsoDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
