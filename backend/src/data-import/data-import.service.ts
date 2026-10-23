import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { ZipFormatError, ZipReader } from './zip-reader.js';
import { archivePathFor } from '../receipt-import/document-type.js';
import { and, eq, getTableColumns, inArray } from 'drizzle-orm';
import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core';
import { isUUID } from 'class-validator';
import { DB } from '../db/db.module.js';
import type { Database } from '../db/db.module.js';
import {
  bankAccountBalances,
  bankAccounts,
  cashBalances,
  cashHoldings,
  categories,
  cryptoPurchases,
  cryptoValuations,
  cryptos,
  expenseBudgets,
  fundDividends,
  fundPurchases,
  fundSales,
  fundValuations,
  funds,
  pensionPlanContributions,
  pensionPlanValuations,
  pensionPlans,
  recurringOccurrenceResolutions,
  recurringReconciliationDismissals,
  recurringTransactions,
  products,
  receiptDocuments,
  receiptLines,
  receipts,
  savingsGoals,
  shoppingListItems,
  shoppingLists,
  supermarkets,
  stockDividends,
  stockPurchases,
  stockSales,
  stockValuations,
  stocks,
  transactions,
  vehicleValuations,
  vehicles,
} from '../db/schema/index.js';
import { ECONOMIC_DATA_TABLE_ORDER, EXPORT_FORMAT_VERSION, OPTIONAL_ECONOMIC_DATA_KEYS } from '../data-export/account-export.types.js';
import type { AccountExportFile, EconomicData } from '../data-export/account-export.types.js';
import type { DataImportSummary, TableImportSummary } from './data-import.types.js';

/** Spec 050: tablas raíz (con `userId` propio) a las que apuntan las filas hijas de otras tablas. */
type RefTarget = 'categories' | 'bankAccounts' | 'stocks' | 'funds' | 'cryptos' | 'vehicles' | 'pensionPlans' | 'cashHoldings';

/**
 * Spec 050, plan.md §1: una referencia de una fila a otra tabla. Si no es
 * utilizable (ni del usuario ni importada en esta misma operación), la fila
 * se omite (`omit`) o se importa con esa columna a `null` (`nullify`).
 */
interface TableRef {
  column: string;
  target: RefTarget;
  onInvalid: 'omit' | 'nullify';
}

interface TableEntry {
  table: PgTable & { id: AnyPgColumn };
  /** Solo en tablas raíz (con `userId` propio) — plan.md §3.3: el valor del fichero se ignora siempre, se fuerza al del usuario autenticado. */
  hasUserId?: boolean;
  /** Spec 050: referencias a comprobar antes de importar una fila nueva. */
  refs?: TableRef[];
}

/**
 * Spec 050, plan.md §2.1: los `id` que se van a importar en esta operación,
 * por tabla. Se va llenando al recorrer las tablas en orden de dependencias,
 * sin depender de haber escrito nada, así que la vista previa y la
 * confirmación cuentan lo mismo. Una fila del fichero que se omite nunca
 * entra aquí, así que tampoco puede servir de padre a otra.
 */
class ImportContext {
  private readonly imported = new Map<keyof EconomicData, Set<string>>();

  add(key: keyof EconomicData, ids: Iterable<string>): void {
    const set = this.imported.get(key) ?? new Set<string>();
    for (const id of ids) set.add(id);
    this.imported.set(key, set);
  }

  has(key: keyof EconomicData, id: string): boolean {
    return this.imported.get(key)?.has(id) ?? false;
  }
}

const omitIfNotOwned = (column: string, target: RefTarget): TableRef => ({ column, target, onInvalid: 'omit' });

/** Plan.md §3.2 — mismo orden que `ECONOMIC_DATA_TABLE_ORDER`; aquí solo se asocia cada clave con su tabla real. */
/** Tablas con su propia fusión (comprobación de propiedad de las filas a las que apuntan), fuera de `TABLES`. */
type CustomMergeKey =
  | 'recurringOccurrenceResolutions'
  | 'recurringReconciliationDismissals'
  | 'receipts'
  | 'receiptLines'
  | 'receiptDocuments'
  | 'shoppingListItems';

const TABLES: Record<Exclude<keyof EconomicData, CustomMergeKey>, TableEntry> = {
  // Spec 050, plan.md §1: cada tabla declara a qué apunta.
  categories: { table: categories, hasUserId: true, refs: [omitIfNotOwned('parentId', 'categories')] },
  transactions: {
    table: transactions,
    hasUserId: true,
    refs: [omitIfNotOwned('categoryId', 'categories'), { column: 'subcategoryId', target: 'categories', onInvalid: 'nullify' }],
  },
  savingsGoals: { table: savingsGoals, hasUserId: true },
  expenseBudgets: { table: expenseBudgets, hasUserId: true, refs: [omitIfNotOwned('categoryId', 'categories')] },
  bankAccounts: { table: bankAccounts, hasUserId: true },
  bankAccountBalances: { table: bankAccountBalances, refs: [omitIfNotOwned('bankAccountId', 'bankAccounts')] },
  stocks: { table: stocks, hasUserId: true },
  stockPurchases: { table: stockPurchases, refs: [omitIfNotOwned('stockId', 'stocks')] },
  stockSales: { table: stockSales, refs: [omitIfNotOwned('stockId', 'stocks')] },
  stockValuations: { table: stockValuations, refs: [omitIfNotOwned('stockId', 'stocks')] },
  stockDividends: { table: stockDividends, refs: [omitIfNotOwned('stockId', 'stocks')] },
  funds: { table: funds, hasUserId: true },
  fundPurchases: { table: fundPurchases, refs: [omitIfNotOwned('fundId', 'funds')] },
  fundSales: { table: fundSales, refs: [omitIfNotOwned('fundId', 'funds')] },
  fundValuations: { table: fundValuations, refs: [omitIfNotOwned('fundId', 'funds')] },
  fundDividends: { table: fundDividends, refs: [omitIfNotOwned('fundId', 'funds')] },
  cryptos: { table: cryptos, hasUserId: true },
  cryptoPurchases: { table: cryptoPurchases, refs: [omitIfNotOwned('cryptoId', 'cryptos')] },
  cryptoValuations: { table: cryptoValuations, refs: [omitIfNotOwned('cryptoId', 'cryptos')] },
  vehicles: { table: vehicles, hasUserId: true },
  vehicleValuations: { table: vehicleValuations, refs: [omitIfNotOwned('vehicleId', 'vehicles')] },
  pensionPlans: { table: pensionPlans, hasUserId: true },
  pensionPlanContributions: { table: pensionPlanContributions, refs: [omitIfNotOwned('pensionPlanId', 'pensionPlans')] },
  pensionPlanValuations: { table: pensionPlanValuations, refs: [omitIfNotOwned('pensionPlanId', 'pensionPlans')] },
  cashHoldings: { table: cashHoldings, hasUserId: true },
  cashBalances: { table: cashBalances, refs: [omitIfNotOwned('cashHoldingId', 'cashHoldings')] },
  recurringTransactions: {
    table: recurringTransactions,
    hasUserId: true,
    refs: [omitIfNotOwned('categoryId', 'categories'), { column: 'subcategoryId', target: 'categories', onInvalid: 'nullify' }],
  },
  // Spec 048: catálogos y listas, tablas raíz con `userId` propio.
  supermarkets: { table: supermarkets, hasUserId: true },
  products: { table: products, hasUserId: true },
  shoppingLists: { table: shoppingLists, hasUserId: true },
};

/**
 * Spec 050: tablas con `userId` propio a las que puede apuntar una fila del
 * fichero — las de `TableRef` y las que usan las fusiones propias de las
 * specs 047, 048 y 049.
 */
type OwnedKey = RefTarget | 'transactions' | 'recurringTransactions' | 'supermarkets' | 'products' | 'shoppingLists' | 'receipts';
type OwnedTable = PgTable & { id: AnyPgColumn; userId: AnyPgColumn };
const OWNED_TABLES: Record<OwnedKey, OwnedTable> = {
  categories,
  bankAccounts,
  stocks,
  funds,
  cryptos,
  vehicles,
  pensionPlans,
  cashHoldings,
  transactions,
  recurringTransactions,
  supermarkets,
  products,
  shoppingLists,
  receipts,
} as unknown as Record<OwnedKey, OwnedTable>;

/** `db.transaction(async (tx) => ...)` sin anotar el tipo del callback (mismo criterio que `ImportService.importWorkbook`) infiere el tipo de `tx` — se reutiliza aquí para poder compartir la misma lógica entre `preview` (solo lectura, sin transacción) y `confirm`. */
type Executor = Database | Parameters<Parameters<Database['transaction']>[0]>[0];

type Row = Record<string, unknown>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Spec 047: las resoluciones no tienen `id` propio, su clave es (`recurringId`, `occurrenceDate`). */
function isValidResolutionRow(row: unknown): row is Row {
  return (
    isPlainObject(row) &&
    typeof row.recurringId === 'string' &&
    isUUID(row.recurringId) &&
    typeof row.occurrenceDate === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(row.occurrenceDate) &&
    // Spec 049: un estado desconocido acabaría en un error de Postgres al insertar.
    ['CONFIRMED', 'SKIPPED', 'RECONCILED'].includes(row.status as string) &&
    (row.reconciledAutomatically === undefined || typeof row.reconciledAutomatically === 'boolean')
  );
}

/** Spec 049: descarte de conciliación — PK compuesta, sin `id` propio. */
function isValidDismissalRow(row: unknown): row is Row {
  return (
    isPlainObject(row) &&
    typeof row.recurringId === 'string' &&
    isUUID(row.recurringId) &&
    typeof row.occurrenceDate === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(row.occurrenceDate) &&
    typeof row.transactionId === 'string' &&
    isUUID(row.transactionId)
  );
}

/**
 * Spec 048: metadatos de un documento. `file` tiene que ser exactamente la
 * ruta que le corresponde por su id y tipo, así que un fichero manipulado no
 * puede hacer que se lea otra entrada del `.zip`.
 */
function isValidDocumentRow(row: unknown): row is Row {
  return (
    isValidRow(row) &&
    typeof row.receiptId === 'string' &&
    isUUID(row.receiptId) &&
    typeof row.mimeType === 'string' &&
    STORED_DOCUMENT_TYPES.includes(row.mimeType) &&
    Number.isInteger(row.sizeBytes) &&
    (row.sizeBytes as number) > 0 &&
    typeof row.sha256 === 'string' &&
    /^[0-9a-f]{64}$/.test(row.sha256) &&
    typeof row.originalFilename === 'string' &&
    row.file === archivePathFor(row.id as string, row.mimeType)
  );
}

const STORED_DOCUMENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

const ROW_VALIDATORS: Partial<Record<keyof EconomicData, (row: unknown) => row is Row>> = {
  recurringOccurrenceResolutions: isValidResolutionRow,
  recurringReconciliationDismissals: isValidDismissalRow,
  receiptDocuments: isValidDocumentRow,
};

/** Spec 048 T6.3: límites de la importación. */
export const MAX_JSON_IMPORT_BYTES = 10 * 1024 * 1024;
export const MAX_ZIP_IMPORT_BYTES = 500 * 1024 * 1024;
const MAX_DATA_ENTRY_BYTES = 200 * 1024 * 1024;
const MAX_DOCUMENT_ENTRY_BYTES = 50 * 1024 * 1024;

/** El fichero subido, ya guardado en disco temporal por `multer`. */
export interface UploadedImportFile {
  path: string;
  originalname: string;
}

function isValidRow(row: unknown): row is Row {
  return isPlainObject(row) && typeof row.id === 'string' && isUUID(row.id);
}

/**
 * `JSON.parse` deja `createdAt`/`updatedAt` como texto ISO (así es como
 * `JSON.stringify` serializó el `Date` original al exportar) — pero
 * Drizzle exige un `Date` de verdad para una columna `timestamp`
 * (`PgTimestamp.mapToDriverValue` llama a `.toISOString()` sobre el valor).
 * Se detectan genéricamente las columnas `timestamp` de cada tabla (mismo
 * criterio "sin reglas especiales por tabla" del resto de `mergeTable`) y
 * se convierte el campo correspondiente antes de insertar.
 */
function coerceTimestamps(table: PgTable, row: Row): Row {
  const timestampColumns = Object.entries(getTableColumns(table)).filter(([, column]) => column.columnType === 'PgTimestamp');
  if (timestampColumns.length === 0) return row;
  const coerced = { ...row };
  for (const [key] of timestampColumns) {
    if (typeof coerced[key] === 'string') {
      coerced[key] = new Date(coerced[key]);
    }
  }
  return coerced;
}

/**
 * Spec 032 (H2). Import aditivo/fusión de un fichero generado por
 * `UsersService.exportData()` (spec 032, plan.md §2) — nunca borra ni
 * sobrescribe nada, solo añade lo que falta (por id).
 */
@Injectable()
export class DataImportService {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** H2 criterio 4: no escribe nada — solo cuenta qué se importaría. */
  async preview(userId: string, upload: UploadedImportFile): Promise<DataImportSummary> {
    return this.withSource(upload, (file, zip) => this.computeSummary(this.db, file, userId, false, zip));
  }

  /**
   * H2 criterio 5/7: todo dentro de una única transacción — si algo falla a
   * mitad, no queda nada importado. `parseFile` (§3.1) ya descarta los
   * problemas de forma más comunes; cualquier otro (p. ej. una columna
   * `NOT NULL` sin valor, un tipo de dato imposible) lo detecta el propio
   * `INSERT` — se traduce a un 400 explícito en vez de dejar que se escape
   * como 500, sin perder la garantía de "nada importado" (la transacción ya
   * se revierte igual, esto solo cambia el código de estado devuelto).
   */
  async confirm(userId: string, upload: UploadedImportFile): Promise<DataImportSummary> {
    try {
      return await this.withSource(upload, (file, zip) => this.db.transaction((tx) => this.computeSummary(tx, file, userId, true, zip)));
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      if (err instanceof ZipFormatError) throw new BadRequestException(err.message);
      // `err.cause` (si lo hay, p. ej. `DrizzleQueryError`) es el error real
      // de Postgres ("null value in column... violates not-null
      // constraint") — más útil para el usuario que el mensaje de Drizzle,
      // que incluye la consulta SQL completa con sus parámetros (no se
      // quiere reenviar eso al cliente).
      const cause = err instanceof Error && err.cause instanceof Error ? err.cause : err;
      const message = cause instanceof Error ? cause.message : String(cause);
      throw new BadRequestException(`No se ha podido importar el fichero: ${message}`);
    }
  }

  /**
   * H2 criterio 1/6. Valida solo la forma mínima necesaria para procesar el
   * fichero con seguridad (plan.md §5.1, decisión 1): versión de formato,
   * claves de `economicData` exactas, e `id` con forma de UUID en cada
   * fila. Cualquier otro problema de datos lo detecta el propio `INSERT`
   * (tipo de columna, `NOT NULL`) más adelante, abortando todo el import
   * igual (§3.4) — no hace falta un DTO por tabla para llegar al mismo
   * resultado (fichero rechazado, nada importado).
   */
  private parseFile(buffer: Buffer): AccountExportFile {
    let parsed: unknown;
    try {
      parsed = JSON.parse(buffer.toString('utf-8'));
    } catch {
      throw new BadRequestException('El fichero no es un JSON válido.');
    }

    if (!isPlainObject(parsed) || parsed.formatVersion !== EXPORT_FORMAT_VERSION) {
      throw new BadRequestException('Este fichero no es compatible con la versión actual de la exportación.');
    }

    if (!isPlainObject(parsed.economicData)) {
      throw new BadRequestException('El fichero no tiene el formato esperado.');
    }
    const economicData = parsed.economicData;
    const expectedKeys = ECONOMIC_DATA_TABLE_ORDER as string[];
    const requiredKeys = ECONOMIC_DATA_TABLE_ORDER.filter((key) => !OPTIONAL_ECONOMIC_DATA_KEYS.includes(key));
    const actualKeys = Object.keys(economicData);
    if (actualKeys.some((key) => !expectedKeys.includes(key)) || requiredKeys.some((key) => !actualKeys.includes(key))) {
      throw new BadRequestException('El fichero no tiene el formato esperado.');
    }

    for (const key of ECONOMIC_DATA_TABLE_ORDER) {
      // Spec 047: una copia anterior no trae las claves opcionales — se tratan como vacías.
      if (economicData[key] === undefined && OPTIONAL_ECONOMIC_DATA_KEYS.includes(key)) {
        economicData[key] = [];
        continue;
      }
      const rows = economicData[key];
      const isValid = ROW_VALIDATORS[key] ?? isValidRow;
      if (!Array.isArray(rows) || !rows.every(isValid)) {
        throw new BadRequestException(`El fichero no tiene el formato esperado (${key}).`);
      }
    }

    return parsed as unknown as AccountExportFile;
  }

  /**
   * Spec 048 T6.3: abre el fichero subido — `.json` (copias anteriores) o
   * `.zip` (`datos.json` + documentos) — y se lo pasa a `run`. El lector del
   * `.zip` se cierra siempre; el temporal lo borra el controlador.
   */
  private async withSource<T>(upload: UploadedImportFile, run: (file: AccountExportFile, zip: ZipReader | null) => Promise<T>): Promise<T> {
    const name = upload.originalname.toLowerCase();
    if (name.endsWith('.json')) {
      if ((await stat(upload.path)).size > MAX_JSON_IMPORT_BYTES) {
        throw new BadRequestException('Un fichero .json no puede ocupar más de 10 MB.');
      }
      return run(this.parseFile(await readFile(upload.path)), null);
    }
    if (!name.endsWith('.zip')) throw new BadRequestException('Solo se admiten ficheros .zip o .json.');

    let zip: ZipReader;
    try {
      zip = await ZipReader.open(upload.path);
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : 'El fichero no es un .zip válido.');
    }
    try {
      if (!zip.has('datos.json')) throw new BadRequestException('El .zip no contiene "datos.json".');
      const data = await zip.read('datos.json', MAX_DATA_ENTRY_BYTES).catch((err: unknown) => {
        throw new BadRequestException(err instanceof Error ? err.message : 'No se ha podido leer "datos.json".');
      });
      return await run(this.parseFile(data), zip);
    } catch (err) {
      if (err instanceof ZipFormatError) throw new BadRequestException(err.message);
      throw err;
    } finally {
      zip.close();
    }
  }

  private async computeSummary(
    executor: Executor,
    file: AccountExportFile,
    userId: string,
    write: boolean,
    zip: ZipReader | null = null,
  ): Promise<DataImportSummary> {
    const summary = {} as DataImportSummary;
    const context = new ImportContext();
    for (const key of ECONOMIC_DATA_TABLE_ORDER) {
      const rows = file.economicData[key] as unknown as Row[];
      if (key === 'recurringOccurrenceResolutions') {
        summary[key] = await this.mergeResolutions(executor, file, userId, write, context);
        continue;
      }
      if (key === 'recurringReconciliationDismissals') {
        summary[key] = await this.mergeDismissals(executor, file, userId, write, context);
        continue;
      }
      if (key === 'receipts') {
        summary[key] = await this.mergeReceipts(executor, file, userId, write, context);
        continue;
      }
      if (key === 'receiptLines') {
        summary[key] = await this.mergeReceiptLines(executor, file, userId, write, context);
        continue;
      }
      if (key === 'receiptDocuments') {
        summary[key] = await this.mergeReceiptDocuments(executor, file, userId, write, zip, context);
        continue;
      }
      if (key === 'shoppingListItems') {
        summary[key] = await this.mergeShoppingListItems(executor, file, userId, write, context);
        continue;
      }
      summary[key] =
        key === 'categories'
          ? await this.mergeCategories(executor, rows, userId, write, context)
          : await this.mergeTable(executor, key, rows, userId, write, context);
    }
    return summary;
  }

  /**
   * Plan.md §3.2: `categories` se autorreferencia (`parentId`), máximo 2
   * niveles por diseño (spec 002) — se fusiona en dos pasadas, las raíz
   * (`parentId: null`) antes que las que tienen padre, para que su FK
   * siempre resuelva contra una fila ya presente (recién insertada en la
   * primera pasada, o ya existente de antes).
   */
  private async mergeCategories(executor: Executor, rows: Row[], userId: string, write: boolean, context: ImportContext): Promise<TableImportSummary> {
    const rootRows = rows.filter((row) => row.parentId == null);
    const childRows = rows.filter((row) => row.parentId != null);
    const rootSummary = await this.mergeTable(executor, 'categories', rootRows, userId, write, context);
    // Spec 050: las hijas ven a las raíz recién importadas en el `ImportContext`.
    const childSummary = await this.mergeTable(executor, 'categories', childRows, userId, write, context);
    return {
      total: rootSummary.total + childSummary.total,
      toImport: rootSummary.toImport + childSummary.toImport,
      alreadyExisting: rootSummary.alreadyExisting + childSummary.alreadyExisting,
      omitted: (rootSummary.omitted ?? 0) + (childSummary.omitted ?? 0),
    };
  }

  /**
   * Plan.md §3.3: se omite cualquier fila cuyo `id` ya exista (en cualquier
   * cuenta — es la clave primaria global de la tabla, ver la nota de
   * seguridad en `mergeTable`); el resto se inserta tal cual, forzando
   * `userId` al del usuario autenticado en las tablas raíz (`hasUserId`) —
   * nunca se confía en el `userId` que traiga el fichero (H2 criterio 6).
   */
  private async mergeTable(
    executor: Executor,
    key: keyof typeof TABLES,
    rows: Row[],
    userId: string,
    write: boolean,
    context: ImportContext,
  ): Promise<TableImportSummary> {
    const entry = TABLES[key];
    const empty: TableImportSummary = entry.refs ? { total: 0, toImport: 0, alreadyExisting: 0, omitted: 0 } : { total: 0, toImport: 0, alreadyExisting: 0 };
    if (rows.length === 0) return empty;

    const ids = rows.map((row) => row.id as string);
    const existing = await executor
      .select({ id: entry.table.id })
      .from(entry.table)
      .where(inArray(entry.table.id, ids));
    const existingIds = new Set(existing.map((row) => row.id as string));
    const newRows = rows.filter((row) => !existingIds.has(row.id as string));

    // Spec 050: una sola consulta por referencia declarada (no una por fila).
    const usable = new Map<string, (id: string) => boolean>();
    for (const ref of entry.refs ?? []) {
      usable.set(ref.column, await this.usableIds(executor, ref.target, newRows.map((row) => row[ref.column]), userId, context));
    }

    const toInsert: Row[] = [];
    for (const row of newRows) {
      let candidate: Row | null = entry.hasUserId ? { ...row, userId } : { ...row };
      for (const ref of entry.refs ?? []) {
        const value = candidate[ref.column];
        if (value == null || usable.get(ref.column)!(value as string)) continue;
        if (ref.onInvalid === 'omit') {
          candidate = null;
          break;
        }
        candidate[ref.column] = null;
      }
      if (candidate) toInsert.push(coerceTimestamps(entry.table, candidate));
    }

    if (write && toInsert.length > 0) {
      await executor.insert(entry.table).values(toInsert as never[]);
    }
    context.add(key, toInsert.map((row) => row.id as string));

    const summary: TableImportSummary = { total: rows.length, toImport: toInsert.length, alreadyExisting: existingIds.size };
    if (entry.refs) summary.omitted = newRows.length - toInsert.length;
    return summary;
  }

  /**
   * Spec 050, plan.md §2.1: cuáles de estos `id` ya existen en la base de
   * datos y son del usuario. Los destinos son siempre tablas raíz, con su
   * propio `userId`. Los valores que no son texto (fichero manipulado) se
   * ignoran: no pueden ser de nadie.
   */
  private async ownedIds(executor: Executor, target: OwnedKey, values: unknown[], userId: string): Promise<Set<string>> {
    const ids = [...new Set(values.filter((v): v is string => typeof v === 'string' && isUUID(v)))];
    if (ids.length === 0) return new Set();
    const table = OWNED_TABLES[target];
    const rows = await executor
      .select({ id: table.id })
      .from(table)
      .where(and(inArray(table.id, ids), eq(table.userId, userId)));
    return new Set(rows.map((row) => row.id as string));
  }

  /**
   * Spec 050, plan.md §0 decisión 3: un `id` es utilizable si ya es del
   * usuario en la base de datos o se va a importar en esta misma operación
   * (`ImportContext`). Sustituye al "viene en el fichero" de la spec 048, que
   * daba por buena una fila del fichero aunque se acabara omitiendo.
   */
  private async usableIds(
    executor: Executor,
    target: OwnedKey,
    values: unknown[],
    userId: string,
    context: ImportContext,
  ): Promise<(id: unknown) => boolean> {
    const owned = await this.ownedIds(executor, target, values, userId);
    return (id) => typeof id === 'string' && (owned.has(id) || context.has(target, id));
  }

  /**
   * Spec 047. Las resoluciones de ocurrencias recurrentes no tienen `id`
   * propio (PK compuesta), así que no pasan por `mergeTable`. Solo se
   * importan las que cuelgan de una plantilla del propio usuario (ya existente
   * o recién importada en este mismo fichero) — nunca de una plantilla ajena
   * cuyo `id` coincida —, y se conserva `transactionId` solo si apunta a un
   * movimiento propio; si no, queda en `null` (la ocurrencia sigue resuelta).
   */
  private async mergeResolutions(
    executor: Executor,
    file: AccountExportFile,
    userId: string,
    write: boolean,
    context: ImportContext,
  ): Promise<TableImportSummary> {
    const rows = file.economicData.recurringOccurrenceResolutions as unknown as Row[];
    if (rows.length === 0) return { total: 0, toImport: 0, alreadyExisting: 0 };

    const recurringIds = [...new Set(rows.map((row) => row.recurringId as string))];
    const templateOk = await this.usableIds(executor, 'recurringTransactions', recurringIds, userId, context);
    const transactionOk = await this.usableIds(executor, 'transactions', rows.map((row) => row.transactionId), userId, context);

    const existing = await executor
      .select({ recurringId: recurringOccurrenceResolutions.recurringId, occurrenceDate: recurringOccurrenceResolutions.occurrenceDate })
      .from(recurringOccurrenceResolutions)
      .where(inArray(recurringOccurrenceResolutions.recurringId, recurringIds));
    const existingKeys = new Set(existing.map((r) => `${r.recurringId}|${r.occurrenceDate}`));

    const candidates = rows.filter((row) => templateOk(row.recurringId));
    const toInsert = candidates
      .filter((row) => !existingKeys.has(`${row.recurringId}|${row.occurrenceDate}`))
      .map((row) =>
        coerceTimestamps(recurringOccurrenceResolutions, { ...row, transactionId: transactionOk(row.transactionId) ? row.transactionId : null }),
      );

    if (write && toInsert.length > 0) {
      await executor.insert(recurringOccurrenceResolutions).values(toInsert as never[]).onConflictDoNothing();
    }
    return { total: rows.length, toImport: toInsert.length, alreadyExisting: candidates.length - toInsert.length };
  }

  /**
   * Spec 049. Mismo criterio que `mergeResolutions`: solo descartes de una
   * plantilla del propio usuario (existente o importada en esta operación) y
   * de un movimiento propio (ídem). Un descarte sin su movimiento no tiene
   * sentido, así que en ese caso se omite.
   */
  private async mergeDismissals(
    executor: Executor,
    file: AccountExportFile,
    userId: string,
    write: boolean,
    context: ImportContext,
  ): Promise<TableImportSummary> {
    const rows = file.economicData.recurringReconciliationDismissals as unknown as Row[];
    if (rows.length === 0) return { total: 0, toImport: 0, alreadyExisting: 0 };

    const recurringIds = [...new Set(rows.map((row) => row.recurringId as string))];
    const templateOk = await this.usableIds(executor, 'recurringTransactions', recurringIds, userId, context);
    const transactionOk = await this.usableIds(executor, 'transactions', rows.map((row) => row.transactionId), userId, context);
    const existing = await executor
      .select({
        recurringId: recurringReconciliationDismissals.recurringId,
        occurrenceDate: recurringReconciliationDismissals.occurrenceDate,
        transactionId: recurringReconciliationDismissals.transactionId,
      })
      .from(recurringReconciliationDismissals)
      .where(inArray(recurringReconciliationDismissals.recurringId, recurringIds));
    const existingKeys = new Set(existing.map((r) => `${r.recurringId}|${r.occurrenceDate}|${r.transactionId}`));

    const candidates = rows.filter((row) => templateOk(row.recurringId) && transactionOk(row.transactionId));
    const toInsert = candidates
      .filter((row) => !existingKeys.has(`${row.recurringId}|${row.occurrenceDate}|${row.transactionId}`))
      .map((row) => coerceTimestamps(recurringReconciliationDismissals, row));

    if (write && toInsert.length > 0) {
      await executor.insert(recurringReconciliationDismissals).values(toInsert as never[]).onConflictDoNothing();
    }
    return { total: rows.length, toImport: toInsert.length, alreadyExisting: candidates.length - toInsert.length };
  }

  // --- Spec 048 (plan.md §3.4): tickets y listas de la compra ----------------
  // A diferencia de `mergeTable`, cada fila se importa solo si las filas a las
  // que apunta son del propio usuario (ya en la base de datos) o se importan
  // en esta misma operación (spec 050: `ImportContext`); nunca de otra cuenta.

  private async mergeReceipts(
    executor: Executor,
    file: AccountExportFile,
    userId: string,
    write: boolean,
    context: ImportContext,
  ): Promise<TableImportSummary> {
    const rows = file.economicData.receipts as unknown as Row[];
    if (rows.length === 0) return { total: 0, toImport: 0, alreadyExisting: 0 };

    const existing = await executor.select({ id: receipts.id }).from(receipts).where(inArray(receipts.id, rows.map((r) => r.id as string)));
    const existingIds = new Set(existing.map((r) => r.id));
    const supermarketOk = await this.usableIds(executor, 'supermarkets', rows.map((r) => r.supermarketId), userId, context);
    const transactionOk = await this.usableIds(executor, 'transactions', rows.map((r) => r.transactionId), userId, context);

    const toInsert = rows
      .filter((r) => !existingIds.has(r.id as string) && supermarketOk(r.supermarketId))
      .map((r) =>
        coerceTimestamps(receipts, {
          ...r,
          userId,
          // Un enlace a un movimiento ajeno o desconocido se pierde; el ticket sí se importa.
          transactionId: transactionOk(r.transactionId) ? r.transactionId : null,
        }),
      );
    if (write && toInsert.length > 0) await executor.insert(receipts).values(toInsert as never[]);
    context.add('receipts', toInsert.map((r) => r.id as string));
    return { total: rows.length, toImport: toInsert.length, alreadyExisting: existingIds.size };
  }

  private async mergeReceiptLines(
    executor: Executor,
    file: AccountExportFile,
    userId: string,
    write: boolean,
    context: ImportContext,
  ): Promise<TableImportSummary> {
    const rows = file.economicData.receiptLines as unknown as Row[];
    if (rows.length === 0) return { total: 0, toImport: 0, alreadyExisting: 0 };

    const existing = await executor.select({ id: receiptLines.id }).from(receiptLines).where(inArray(receiptLines.id, rows.map((r) => r.id as string)));
    const existingIds = new Set(existing.map((r) => r.id));
    const receiptOk = await this.usableIds(executor, 'receipts', rows.map((r) => r.receiptId), userId, context);
    const productOk = await this.usableIds(executor, 'products', rows.map((r) => r.productId), userId, context);

    const toInsert = rows
      .filter((r) => !existingIds.has(r.id as string))
      .filter((r) => receiptOk(r.receiptId))
      // Spec 048 H2: una línea sin producto es válida; con un producto ajeno, no.
      .filter((r) => r.productId === null || productOk(r.productId))
      .map((r) => coerceTimestamps(receiptLines, r));
    if (write && toInsert.length > 0) await executor.insert(receiptLines).values(toInsert as never[]);
    return { total: rows.length, toImport: toInsert.length, alreadyExisting: existingIds.size };
  }

  private async mergeShoppingListItems(
    executor: Executor,
    file: AccountExportFile,
    userId: string,
    write: boolean,
    context: ImportContext,
  ): Promise<TableImportSummary> {
    const rows = file.economicData.shoppingListItems as unknown as Row[];
    if (rows.length === 0) return { total: 0, toImport: 0, alreadyExisting: 0 };

    const existing = await executor
      .select({ id: shoppingListItems.id })
      .from(shoppingListItems)
      .where(inArray(shoppingListItems.id, rows.map((r) => r.id as string)));
    const existingIds = new Set(existing.map((r) => r.id));
    const listOk = await this.usableIds(executor, 'shoppingLists', rows.map((r) => r.shoppingListId), userId, context);
    const productOk = await this.usableIds(executor, 'products', rows.map((r) => r.productId), userId, context);

    const toInsert = rows
      .filter((r) => !existingIds.has(r.id as string))
      .filter((r) => listOk(r.shoppingListId) && productOk(r.productId))
      .map((r) => coerceTimestamps(shoppingListItems, r));
    if (write && toInsert.length > 0) await executor.insert(shoppingListItems).values(toInsert as never[]).onConflictDoNothing();
    return { total: rows.length, toImport: toInsert.length, alreadyExisting: existingIds.size };
  }

  /**
   * Spec 048 H1 criterio 6 / plan.md §3.4. Un documento se importa solo si
   * su ticket es propio o se importa en este mismo fichero, ese ticket no
   * tiene ya documento, su entrada viene en el `.zip` y su contenido mide y
   * resume (SHA-256) lo que dicen sus metadatos. Si no, se omite y se cuenta.
   * Se lee e inserta de uno en uno, para no tener todos en memoria.
   */
  private async mergeReceiptDocuments(
    executor: Executor,
    file: AccountExportFile,
    userId: string,
    write: boolean,
    zip: ZipReader | null,
    context: ImportContext,
  ): Promise<TableImportSummary> {
    const rows = file.economicData.receiptDocuments as unknown as Row[];
    if (rows.length === 0) return { total: 0, toImport: 0, alreadyExisting: 0, omitted: 0 };

    const existing = await executor
      .select({ id: receiptDocuments.id })
      .from(receiptDocuments)
      .where(inArray(receiptDocuments.id, rows.map((r) => r.id as string)));
    const existingIds = new Set(existing.map((r) => r.id));
    const receiptOk = await this.usableIds(executor, 'receipts', rows.map((r) => r.receiptId), userId, context);
    const withDocument = await executor
      .select({ receiptId: receiptDocuments.receiptId })
      .from(receiptDocuments)
      .where(inArray(receiptDocuments.receiptId, rows.map((r) => r.receiptId as string)));
    const receiptsWithDocument = new Set(withDocument.map((r) => r.receiptId));

    let toImport = 0;
    for (const row of rows) {
      const receiptId = row.receiptId as string;
      if (existingIds.has(row.id as string)) continue;
      if (!receiptOk(receiptId) || receiptsWithDocument.has(receiptId)) continue;
      const path = row.file as string;
      if (!zip || zip.size(path) !== row.sizeBytes) continue;

      const content = await zip.read(path, MAX_DOCUMENT_ENTRY_BYTES);
      if (createHash('sha256').update(content).digest('hex') !== row.sha256) continue;

      receiptsWithDocument.add(receiptId);
      toImport += 1;
      if (write) {
        await executor.insert(receiptDocuments).values({
          id: row.id as string,
          userId,
          receiptId,
          mimeType: row.mimeType as string,
          sizeBytes: content.length,
          sha256: row.sha256 as string,
          originalFilename: row.originalFilename as string,
          pageCount: typeof row.pageCount === 'number' ? row.pageCount : null,
          content,
          ...(typeof row.createdAt === 'string' && { createdAt: new Date(row.createdAt) }),
        });
      }
    }
    return { total: rows.length, toImport, alreadyExisting: existingIds.size, omitted: rows.length - toImport - existingIds.size };
  }
}
