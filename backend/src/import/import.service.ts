import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DB } from '../db/db.module.js';
import type { Database } from '../db/db.module.js';
import { categories, transactions } from '../db/schema/index.js';
import type { Category } from '../categories/categories.service.js';
import type { Transaction } from '../transactions/transactions.service.js';
import {
  InvalidWorkbookError,
  normalizeCategoryName,
  normalizedCategoryMap,
  parseExcelWorkbook,
  validateExpenseRow,
  validateIncomeRow,
} from './import.parsing.js';
import type { InvalidRow, ParsedWorkbook, ValidatedExpenseRow, ValidatedIncomeRow } from './import.parsing.js';

export interface ImportSideSummary {
  validCount: number;
  invalid: InvalidRow[];
  /** Spec 012 (detección de duplicados): subconjunto de las válidas que ya existen como movimiento — `validCount` no cambia de significado, sigue contando todas las válidas. */
  duplicates: InvalidRow[];
  /** Subconjunto de las válidas que coinciden con un movimiento ya guardado en todo salvo el importe — al confirmar se actualiza el importe de ese movimiento en vez de insertar uno nuevo. */
  updated: InvalidRow[];
}

export interface ImportPreviewResult {
  income: ImportSideSummary;
  expense: ImportSideSummary;
  /** Nombres (tal cual en el Excel, recortados) de las categorías que se crearían al confirmar. */
  newCategories: string[];
}

export interface ImportConfirmResult {
  income: { importedCount: number; invalid: InvalidRow[]; skippedDuplicateCount: number; updatedAmountCount: number };
  expense: { importedCount: number; invalid: InvalidRow[]; skippedDuplicateCount: number; updatedAmountCount: number };
  categoriesCreated: string[];
}

type MovementType = Category['type'];

/** Fila válida que coincide con un movimiento ya guardado salvo el importe — se actualiza en vez de insertarse. */
interface AmountUpdate {
  rowNumber: number;
  transactionId: string;
  previousAmount: string;
  newAmount: string;
}

interface ClassifiedRows {
  validIncome: ValidatedIncomeRow[];
  invalidIncome: InvalidRow[];
  validExpense: ValidatedExpenseRow[];
  invalidExpense: InvalidRow[];
  /** clave `${type}:${categoryName normalizado}` → nombre tal cual del Excel, para las categorías que faltan. */
  missingCategories: Map<string, string>;
  /** Spec 012, plan.md §3: subconjunto de `validIncome`/`validExpense` que ya existe como movimiento (mismo `InvalidRow` que las filas inválidas, con `reason` explicando el motivo). */
  duplicateIncome: InvalidRow[];
  duplicateExpense: InvalidRow[];
  /** Filas que coinciden con un movimiento existente en todo salvo el importe: se actualiza ese movimiento, no se inserta uno nuevo ni se cuenta como duplicado. */
  amountUpdateIncome: AmountUpdate[];
  amountUpdateExpense: AmountUpdate[];
}

/**
 * H1/H2 (spec 003). `preview` y `confirm` reutilizan exactamente la misma
 * clasificación (`classify`) — plan.md §3: "repite el mismo parseo y
 * validación que preview... reutilizando exactamente las mismas
 * funciones, no una copia". La diferencia entre ambos es únicamente que
 * `confirm` escribe en la base de datos dentro de una transacción y
 * `preview` no escribe nada.
 *
 * Igual que `DashboardService` (spec 002): consulta `categories`/
 * `transactions` directamente en vez de a través de `CategoriesService`/
 * `TransactionsService`, porque necesita crear categorías en bloque dentro
 * de una única transacción y ninguno de esos dos servicios expone esa
 * operación (fueron diseñados para una categoría/movimiento a la vez desde
 * la UI, no para una importación masiva).
 */
@Injectable()
export class ImportService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async preview(userId: string, buffer: Buffer): Promise<ImportPreviewResult> {
    const workbook = await this.parseOrThrow(buffer);
    const existingCategories = await this.db.query.categories.findMany({ where: eq(categories.userId, userId) });
    const existingTransactions = await this.db.query.transactions.findMany({ where: eq(transactions.userId, userId) });
    const classified = this.classify(workbook, existingCategories, existingTransactions);

    return {
      income: {
        validCount: classified.validIncome.length,
        invalid: classified.invalidIncome,
        duplicates: classified.duplicateIncome,
        updated: classified.amountUpdateIncome.map(toUpdatedInvalidRow),
      },
      expense: {
        validCount: classified.validExpense.length,
        invalid: classified.invalidExpense,
        duplicates: classified.duplicateExpense,
        updated: classified.amountUpdateExpense.map(toUpdatedInvalidRow),
      },
      newCategories: Array.from(classified.missingCategories.values()),
    };
  }

  async confirm(userId: string, buffer: Buffer): Promise<ImportConfirmResult> {
    const workbook = await this.parseOrThrow(buffer);
    return this.importWorkbook(userId, workbook);
  }

  /**
   * Spec 026, plan.md §4: tramo común a partir de un `ParsedWorkbook` ya
   * obtenido, extraído de `confirm()` sin cambiar su comportamiento —
   * reutilizado también por la importación desde Google Sheets
   * (`GoogleSheetsImportService`), que produce el `ParsedWorkbook` a partir
   * de la API de Sheets en vez de un fichero `.xlsx`.
   */
  async importWorkbook(userId: string, workbook: ParsedWorkbook): Promise<ImportConfirmResult> {
    return this.db.transaction(async (tx) => {
      const existingCategories = await tx.query.categories.findMany({ where: eq(categories.userId, userId) });
      const existingTransactions = await tx.query.transactions.findMany({ where: eq(transactions.userId, userId) });
      const classified = this.classify(workbook, existingCategories, existingTransactions);

      // Índice `${type}:${categoryName normalizado}` → id de categoría,
      // arrancando con las que ya existen...
      const categoryIdByKey = new Map<string, string>();
      for (const category of existingCategories) {
        categoryIdByKey.set(categoryKey(category.type, normalizeCategoryName(category.name)), category.id);
      }
      // ...y creando, una sola vez cada una, las que faltan (plan.md §3) —
      // `classify` ya las deduplicó por `categoryName` normalizado, así que
      // aunque varias filas del fichero usen el mismo valor nuevo, aquí solo
      // se inserta una fila en `categories` por cada una.
      for (const [key, rawName] of classified.missingCategories) {
        const type = typeFromCategoryKey(key);
        const [created] = await tx
          .insert(categories)
          .values({ userId, type, name: rawName, isDefault: false })
          .returning();
        categoryIdByKey.set(key, created.id);
      }

      // Spec 012, plan.md §4: las filas detectadas como duplicado (mismo
      // `rowNumber` que `classify` ya identificó) no se insertan. Las
      // detectadas como "mismo movimiento salvo el importe" tampoco se
      // insertan — se actualiza el movimiento existente más abajo.
      const duplicateIncomeRowNumbers = new Set(classified.duplicateIncome.map((d) => d.rowNumber));
      const duplicateExpenseRowNumbers = new Set(classified.duplicateExpense.map((d) => d.rowNumber));
      const amountUpdateIncomeRowNumbers = new Set(classified.amountUpdateIncome.map((u) => u.rowNumber));
      const amountUpdateExpenseRowNumbers = new Set(classified.amountUpdateExpense.map((u) => u.rowNumber));

      for (const update of classified.amountUpdateIncome) {
        await tx.update(transactions).set({ amount: update.newAmount, updatedAt: new Date() }).where(eq(transactions.id, update.transactionId));
      }
      for (const update of classified.amountUpdateExpense) {
        await tx.update(transactions).set({ amount: update.newAmount, updatedAt: new Date() }).where(eq(transactions.id, update.transactionId));
      }

      const incomeValues = classified.validIncome
        .filter((row) => !duplicateIncomeRowNumbers.has(row.rowNumber) && !amountUpdateIncomeRowNumbers.has(row.rowNumber))
        .map((row) => ({
          userId,
          type: 'INCOME' as const,
          date: row.date,
          categoryId: mustGetCategoryId(categoryIdByKey, 'INCOME', row.categoryName),
          concept: row.concept,
          amount: row.amount,
        }));
      const expenseValues = classified.validExpense
        .filter((row) => !duplicateExpenseRowNumbers.has(row.rowNumber) && !amountUpdateExpenseRowNumbers.has(row.rowNumber))
        .map((row) => ({
          userId,
          type: 'EXPENSE' as const,
          date: row.date,
          categoryId: mustGetCategoryId(categoryIdByKey, 'EXPENSE', row.categoryName),
          concept: row.concept,
          merchant: row.merchant,
          amount: row.amount,
          paymentMethod: row.paymentMethod,
        }));

      if (incomeValues.length > 0) await tx.insert(transactions).values(incomeValues);
      if (expenseValues.length > 0) await tx.insert(transactions).values(expenseValues);

      return {
        income: {
          importedCount: incomeValues.length,
          invalid: classified.invalidIncome,
          skippedDuplicateCount: classified.duplicateIncome.length,
          updatedAmountCount: classified.amountUpdateIncome.length,
        },
        expense: {
          importedCount: expenseValues.length,
          invalid: classified.invalidExpense,
          skippedDuplicateCount: classified.duplicateExpense.length,
          updatedAmountCount: classified.amountUpdateExpense.length,
        },
        categoriesCreated: Array.from(classified.missingCategories.values()),
      };
    });
  }

  /** plan.md §7: hoja sin el nombre esperado (u otro fichero que `exceljs` no pueda leer) → 400 claro. */
  private async parseOrThrow(buffer: Buffer): Promise<ParsedWorkbook> {
    try {
      return await parseExcelWorkbook(buffer);
    } catch (err) {
      if (err instanceof InvalidWorkbookError) {
        throw new BadRequestException(err.message);
      }
      throw new BadRequestException('El fichero no se ha podido leer como un .xlsx válido.');
    }
  }

  private classify(
    workbook: ParsedWorkbook,
    existingCategories: Category[],
    existingTransactions: Transaction[],
  ): ClassifiedRows {
    const incomeCategoryMap = normalizedCategoryMap(existingCategories.filter((c) => c.type === 'INCOME'));
    const expenseCategoryMap = normalizedCategoryMap(existingCategories.filter((c) => c.type === 'EXPENSE'));

    const validIncome: ValidatedIncomeRow[] = [];
    const invalidIncome: InvalidRow[] = [];
    for (const raw of workbook.incomeRows) {
      const result = validateIncomeRow(raw);
      if (result.valid) validIncome.push(result.row);
      else invalidIncome.push(result.invalid);
    }

    const validExpense: ValidatedExpenseRow[] = [];
    const invalidExpense: InvalidRow[] = [];
    for (const raw of workbook.expenseRows) {
      const result = validateExpenseRow(raw);
      if (result.valid) validExpense.push(result.row);
      else invalidExpense.push(result.invalid);
    }

    // plan.md §7: un valor de categoría sin coincidencia se crea una única
    // vez aunque aparezca en varias filas — `Map` deduplica por clave.
    const missingCategories = new Map<string, string>();
    for (const row of validIncome) {
      if (!incomeCategoryMap.has(row.categoryName)) {
        missingCategories.set(categoryKey('INCOME', row.categoryName), row.rawCategoryName);
      }
    }
    for (const row of validExpense) {
      if (!expenseCategoryMap.has(row.categoryName)) {
        missingCategories.set(categoryKey('EXPENSE', row.categoryName), row.rawCategoryName);
      }
    }

    // Spec 012, plan.md §3: coincidencia exacta contra todo el histórico
    // del usuario — tipo + fecha + categoría ya resuelta + concepto +
    // importe (+ comercio/forma de pago en gastos). El `categoryId` es el
    // resuelto (mismo mapa de arriba), no el nombre de texto del Excel: así
    // sigue detectando la reimportación aunque la categoría se haya
    // renombrado desde entonces.
    const existingKeys = new Set(existingTransactions.map((t) => transactionKey(t)));
    // Mismo criterio de coincidencia que `existingKeys`, pero sin el importe
    // — permite detectar "es el mismo movimiento, solo cambió el importe"
    // (p. ej. una hoja de Google Sheets donde Diego corrige a mano un valor
    // ya importado antes) en vez de tratarlo como uno nuevo. Si hubiera más
    // de un movimiento existente con la misma clave sin importe (no debería,
    // sería ya de por sí una colisión rara), gana el último — caso límite no
    // crítico, ninguna fila del Excel/Sheet puede distinguir entre ellos.
    const existingByMatchKey = new Map(existingTransactions.map((t) => [matchKeyWithoutAmount(t), t] as const));

    const duplicateIncome: InvalidRow[] = [];
    const amountUpdateIncome: AmountUpdate[] = [];
    for (const row of validIncome) {
      const categoryId = incomeCategoryMap.get(row.categoryName)?.id;
      // Categoría nueva (todavía no existe) → ningún movimiento previo
      // puede referenciarla, así que nunca es duplicado ni actualización.
      if (!categoryId) continue;
      const fields = { type: 'INCOME' as const, date: row.date, categoryId, concept: row.concept, merchant: null, paymentMethod: null };
      if (existingKeys.has(transactionKey({ ...fields, amount: row.amount }))) {
        duplicateIncome.push({ rowNumber: row.rowNumber, reason: `Fila ${row.rowNumber}: ya existe un movimiento igual en tu histórico.` });
        continue;
      }
      const existing = existingByMatchKey.get(matchKeyWithoutAmount(fields));
      if (existing) {
        amountUpdateIncome.push({ rowNumber: row.rowNumber, transactionId: existing.id, previousAmount: existing.amount, newAmount: row.amount });
      }
    }

    const duplicateExpense: InvalidRow[] = [];
    const amountUpdateExpense: AmountUpdate[] = [];
    for (const row of validExpense) {
      const categoryId = expenseCategoryMap.get(row.categoryName)?.id;
      if (!categoryId) continue;
      const fields = {
        type: 'EXPENSE' as const,
        date: row.date,
        categoryId,
        concept: row.concept,
        merchant: row.merchant,
        paymentMethod: row.paymentMethod,
      };
      if (existingKeys.has(transactionKey({ ...fields, amount: row.amount }))) {
        duplicateExpense.push({ rowNumber: row.rowNumber, reason: `Fila ${row.rowNumber}: ya existe un movimiento igual en tu histórico.` });
        continue;
      }
      const existing = existingByMatchKey.get(matchKeyWithoutAmount(fields));
      if (existing) {
        amountUpdateExpense.push({ rowNumber: row.rowNumber, transactionId: existing.id, previousAmount: existing.amount, newAmount: row.amount });
      }
    }

    return {
      validIncome,
      invalidIncome,
      validExpense,
      invalidExpense,
      missingCategories,
      duplicateIncome,
      duplicateExpense,
      amountUpdateIncome,
      amountUpdateExpense,
    };
  }
}

function toUpdatedInvalidRow(update: AmountUpdate): InvalidRow {
  return {
    rowNumber: update.rowNumber,
    reason: `Fila ${update.rowNumber}: ya existe un movimiento igual salvo el importe — se actualizaría de ${update.previousAmount} a ${update.newAmount}.`,
  };
}

/** Spec 012, plan.md §3: clave de comparación exacta, misma forma para una fila validada (con `categoryId` ya resuelto) y para un movimiento ya guardado. */
function transactionKey(fields: {
  type: MovementType;
  date: string;
  categoryId: string;
  concept: string;
  amount: string;
  merchant: string | null;
  paymentMethod: string | null;
}): string {
  return `${matchKeyWithoutAmount(fields)}|${fields.amount}`;
}

/** Misma clave que `transactionKey` pero sin el importe — identifica "el mismo movimiento" para decidir si una fila que no es duplicado exacto debe actualizar el importe en su lugar. */
function matchKeyWithoutAmount(fields: {
  type: MovementType;
  date: string;
  categoryId: string;
  concept: string;
  merchant: string | null;
  paymentMethod: string | null;
}): string {
  return [fields.type, fields.date, fields.categoryId, fields.concept, fields.merchant ?? '', fields.paymentMethod ?? ''].join('|');
}

function categoryKey(type: MovementType, normalizedCategoryName: string): string {
  return `${type}:${normalizedCategoryName}`;
}

function typeFromCategoryKey(key: string): MovementType {
  return key.startsWith('INCOME:') ? 'INCOME' : 'EXPENSE';
}

function mustGetCategoryId(map: Map<string, string>, type: MovementType, categoryName: string): string {
  const id = map.get(categoryKey(type, categoryName));
  if (!id) {
    // No debería ocurrir: `classify` crea una entrada en `missingCategories`
    // para toda fila válida cuya categoría no exista, y `confirm` las crea
    // todas antes de llegar aquí. Si pasara, es un fallo real de este
    // servicio, no un dato de fila inválido — que falle explícito, no que
    // inserte un `categoryId` vacío.
    throw new Error(`Categoría "${categoryName}" (${type}) no resuelta al insertar movimientos importados.`);
  }
  return id;
}
