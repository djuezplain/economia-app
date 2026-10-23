import { BadRequestException, Inject, Injectable } from '@nestjs/common';
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
  fundValuations,
  funds,
  pensionPlanContributions,
  pensionPlanValuations,
  pensionPlans,
  recurringOccurrenceResolutions,
  recurringReconciliationDismissals,
  recurringTransactions,
  savingsGoals,
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

interface TableEntry {
  table: PgTable & { id: AnyPgColumn };
  /** Solo en tablas raíz (con `userId` propio) — plan.md §3.3: el valor del fichero se ignora siempre, se fuerza al del usuario autenticado. */
  hasUserId?: boolean;
}

/** Plan.md §3.2 — mismo orden que `ECONOMIC_DATA_TABLE_ORDER`; aquí solo se asocia cada clave con su tabla real. */
const TABLES: Record<Exclude<keyof EconomicData, 'recurringOccurrenceResolutions' | 'recurringReconciliationDismissals'>, TableEntry> = {
  categories: { table: categories, hasUserId: true },
  transactions: { table: transactions, hasUserId: true },
  savingsGoals: { table: savingsGoals, hasUserId: true },
  expenseBudgets: { table: expenseBudgets, hasUserId: true },
  bankAccounts: { table: bankAccounts, hasUserId: true },
  bankAccountBalances: { table: bankAccountBalances },
  stocks: { table: stocks, hasUserId: true },
  stockPurchases: { table: stockPurchases },
  stockSales: { table: stockSales },
  stockValuations: { table: stockValuations },
  stockDividends: { table: stockDividends },
  funds: { table: funds, hasUserId: true },
  fundPurchases: { table: fundPurchases },
  fundValuations: { table: fundValuations },
  fundDividends: { table: fundDividends },
  cryptos: { table: cryptos, hasUserId: true },
  cryptoPurchases: { table: cryptoPurchases },
  cryptoValuations: { table: cryptoValuations },
  vehicles: { table: vehicles, hasUserId: true },
  vehicleValuations: { table: vehicleValuations },
  pensionPlans: { table: pensionPlans, hasUserId: true },
  pensionPlanContributions: { table: pensionPlanContributions },
  pensionPlanValuations: { table: pensionPlanValuations },
  cashHoldings: { table: cashHoldings, hasUserId: true },
  cashBalances: { table: cashBalances },
  recurringTransactions: { table: recurringTransactions, hasUserId: true },
};

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

const ROW_VALIDATORS: Partial<Record<keyof EconomicData, (row: unknown) => row is Row>> = {
  recurringOccurrenceResolutions: isValidResolutionRow,
  recurringReconciliationDismissals: isValidDismissalRow,
};

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
  async preview(userId: string, buffer: Buffer): Promise<DataImportSummary> {
    const file = this.parseFile(buffer);
    return this.computeSummary(this.db, file, userId, false);
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
  async confirm(userId: string, buffer: Buffer): Promise<DataImportSummary> {
    const file = this.parseFile(buffer);
    try {
      return await this.db.transaction((tx) => this.computeSummary(tx, file, userId, true));
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
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

  private async computeSummary(
    executor: Executor,
    file: AccountExportFile,
    userId: string,
    write: boolean,
  ): Promise<DataImportSummary> {
    const summary = {} as DataImportSummary;
    for (const key of ECONOMIC_DATA_TABLE_ORDER) {
      const rows = file.economicData[key] as unknown as Row[];
      if (key === 'recurringOccurrenceResolutions') {
        summary[key] = await this.mergeResolutions(executor, file, userId, write);
        continue;
      }
      if (key === 'recurringReconciliationDismissals') {
        summary[key] = await this.mergeDismissals(executor, file, userId, write);
        continue;
      }
      summary[key] =
        key === 'categories'
          ? await this.mergeCategories(executor, rows, userId, write)
          : await this.mergeTable(executor, TABLES[key], rows, userId, write);
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
  private async mergeCategories(executor: Executor, rows: Row[], userId: string, write: boolean): Promise<TableImportSummary> {
    const rootRows = rows.filter((row) => row.parentId == null);
    const childRows = rows.filter((row) => row.parentId != null);
    const rootSummary = await this.mergeTable(executor, TABLES.categories, rootRows, userId, write);
    const childSummary = await this.mergeTable(executor, TABLES.categories, childRows, userId, write);
    return {
      total: rootSummary.total + childSummary.total,
      toImport: rootSummary.toImport + childSummary.toImport,
      alreadyExisting: rootSummary.alreadyExisting + childSummary.alreadyExisting,
    };
  }

  /**
   * Plan.md §3.3: se omite cualquier fila cuyo `id` ya exista (en cualquier
   * cuenta — es la clave primaria global de la tabla, ver la nota de
   * seguridad en `mergeTable`); el resto se inserta tal cual, forzando
   * `userId` al del usuario autenticado en las tablas raíz (`hasUserId`) —
   * nunca se confía en el `userId` que traiga el fichero (H2 criterio 6).
   */
  private async mergeTable(executor: Executor, entry: TableEntry, rows: Row[], userId: string, write: boolean): Promise<TableImportSummary> {
    if (rows.length === 0) {
      return { total: 0, toImport: 0, alreadyExisting: 0 };
    }

    const ids = rows.map((row) => row.id as string);
    const existing = await executor
      .select({ id: entry.table.id })
      .from(entry.table)
      .where(inArray(entry.table.id, ids));
    const existingIds = new Set(existing.map((row) => row.id as string));

    const toInsert = rows
      .filter((row) => !existingIds.has(row.id as string))
      .map((row) => coerceTimestamps(entry.table, entry.hasUserId ? { ...row, userId } : row));

    if (write && toInsert.length > 0) {
      await executor.insert(entry.table).values(toInsert as never[]);
    }

    return { total: rows.length, toImport: toInsert.length, alreadyExisting: existingIds.size };
  }

  /**
   * Spec 047. Las resoluciones de ocurrencias recurrentes no tienen `id`
   * propio (PK compuesta), así que no pasan por `mergeTable`. Solo se
   * importan las que cuelgan de una plantilla del propio usuario (ya existente
   * o recién importada en este mismo fichero) — nunca de una plantilla ajena
   * cuyo `id` coincida —, y se conserva `transactionId` solo si apunta a un
   * movimiento propio; si no, queda en `null` (la ocurrencia sigue resuelta).
   */
  private async mergeResolutions(executor: Executor, file: AccountExportFile, userId: string, write: boolean): Promise<TableImportSummary> {
    const rows = file.economicData.recurringOccurrenceResolutions as unknown as Row[];
    if (rows.length === 0) return { total: 0, toImport: 0, alreadyExisting: 0 };

    const recurringIds = [...new Set(rows.map((row) => row.recurringId as string))];
    const templateRows = await executor
      .select({ id: recurringTransactions.id, userId: recurringTransactions.userId })
      .from(recurringTransactions)
      .where(inArray(recurringTransactions.id, recurringIds));
    const foreignTemplates = new Set(templateRows.filter((t) => t.userId !== userId).map((t) => t.id));
    const fileTemplateIds = new Set((file.economicData.recurringTransactions as unknown as Row[]).map((t) => t.id as string));
    const ownedOrImportable = (id: string) => !foreignTemplates.has(id) && (fileTemplateIds.has(id) || templateRows.some((t) => t.id === id));

    const existing = await executor
      .select({ recurringId: recurringOccurrenceResolutions.recurringId, occurrenceDate: recurringOccurrenceResolutions.occurrenceDate })
      .from(recurringOccurrenceResolutions)
      .where(inArray(recurringOccurrenceResolutions.recurringId, recurringIds));
    const existingKeys = new Set(existing.map((r) => `${r.recurringId}|${r.occurrenceDate}`));

    const transactionIds = rows.map((row) => row.transactionId).filter((id): id is string => typeof id === 'string');
    const ownTransactions = transactionIds.length
      ? await executor
          .select({ id: transactions.id })
          .from(transactions)
          .where(and(inArray(transactions.id, transactionIds), eq(transactions.userId, userId)))
      : [];
    const importedTransactionIds = new Set((file.economicData.transactions as unknown as Row[]).map((t) => t.id as string));
    const foreignTransactions = transactionIds.length
      ? await executor.select({ id: transactions.id, userId: transactions.userId }).from(transactions).where(inArray(transactions.id, transactionIds))
      : [];
    const foreignTransactionIds = new Set(foreignTransactions.filter((t) => t.userId !== userId).map((t) => t.id));
    const keepTransactionId = (id: unknown): string | null =>
      typeof id === 'string' &&
      !foreignTransactionIds.has(id) &&
      (ownTransactions.some((t) => t.id === id) || importedTransactionIds.has(id))
        ? id
        : null;

    const candidates = rows.filter((row) => ownedOrImportable(row.recurringId as string));
    const toInsert = candidates
      .filter((row) => !existingKeys.has(`${row.recurringId}|${row.occurrenceDate}`))
      .map((row) => coerceTimestamps(recurringOccurrenceResolutions, { ...row, transactionId: keepTransactionId(row.transactionId) }));

    if (write && toInsert.length > 0) {
      await executor.insert(recurringOccurrenceResolutions).values(toInsert as never[]).onConflictDoNothing();
    }
    return { total: rows.length, toImport: toInsert.length, alreadyExisting: candidates.length - toInsert.length };
  }

  /**
   * Spec 049. Mismo criterio que `mergeResolutions`: solo descartes de una
   * plantilla del propio usuario (existente o del mismo fichero) y de un
   * movimiento propio (existente o del mismo fichero). Un descarte sin su
   * movimiento no tiene sentido, así que en ese caso se omite.
   */
  private async mergeDismissals(executor: Executor, file: AccountExportFile, userId: string, write: boolean): Promise<TableImportSummary> {
    const rows = file.economicData.recurringReconciliationDismissals as unknown as Row[];
    if (rows.length === 0) return { total: 0, toImport: 0, alreadyExisting: 0 };

    const recurringIds = [...new Set(rows.map((row) => row.recurringId as string))];
    const transactionIds = [...new Set(rows.map((row) => row.transactionId as string))];
    const [templateRows, transactionRows, existing] = await Promise.all([
      executor
        .select({ id: recurringTransactions.id, userId: recurringTransactions.userId })
        .from(recurringTransactions)
        .where(inArray(recurringTransactions.id, recurringIds)),
      executor.select({ id: transactions.id, userId: transactions.userId }).from(transactions).where(inArray(transactions.id, transactionIds)),
      executor
        .select({
          recurringId: recurringReconciliationDismissals.recurringId,
          occurrenceDate: recurringReconciliationDismissals.occurrenceDate,
          transactionId: recurringReconciliationDismissals.transactionId,
        })
        .from(recurringReconciliationDismissals)
        .where(inArray(recurringReconciliationDismissals.recurringId, recurringIds)),
    ]);

    const fileTemplateIds = new Set((file.economicData.recurringTransactions as unknown as Row[]).map((t) => t.id as string));
    const fileTransactionIds = new Set((file.economicData.transactions as unknown as Row[]).map((t) => t.id as string));
    const isOwnedOrImportable = (id: string, dbRows: { id: string; userId: string }[], fileIds: Set<string>) => {
      const inDb = dbRows.find((r) => r.id === id);
      return inDb ? inDb.userId === userId : fileIds.has(id);
    };
    const existingKeys = new Set(existing.map((r) => `${r.recurringId}|${r.occurrenceDate}|${r.transactionId}`));

    const candidates = rows.filter(
      (row) =>
        isOwnedOrImportable(row.recurringId as string, templateRows, fileTemplateIds) &&
        isOwnedOrImportable(row.transactionId as string, transactionRows, fileTransactionIds),
    );
    const toInsert = candidates
      .filter((row) => !existingKeys.has(`${row.recurringId}|${row.occurrenceDate}|${row.transactionId}`))
      .map((row) => coerceTimestamps(recurringReconciliationDismissals, row));

    if (write && toInsert.length > 0) {
      await executor.insert(recurringReconciliationDismissals).values(toInsert as never[]).onConflictDoNothing();
    }
    return { total: rows.length, toImport: toInsert.length, alreadyExisting: candidates.length - toInsert.length };
  }
}
