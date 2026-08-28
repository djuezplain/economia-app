import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DB } from '../db/db.module.js';
import type { Database } from '../db/db.module.js';
import { categories, transactions } from '../db/schema/index.js';
import type { Category } from '../categories/categories.service.js';
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
}

export interface ImportPreviewResult {
  income: ImportSideSummary;
  expense: ImportSideSummary;
  /** Nombres (tal cual en el Excel, recortados) de las categorías que se crearían al confirmar. */
  newCategories: string[];
}

export interface ImportConfirmResult {
  income: { importedCount: number; invalid: InvalidRow[] };
  expense: { importedCount: number; invalid: InvalidRow[] };
  categoriesCreated: string[];
}

type MovementType = Category['type'];

interface ClassifiedRows {
  validIncome: ValidatedIncomeRow[];
  invalidIncome: InvalidRow[];
  validExpense: ValidatedExpenseRow[];
  invalidExpense: InvalidRow[];
  /** clave `${type}:${categoryName normalizado}` → nombre tal cual del Excel, para las categorías que faltan. */
  missingCategories: Map<string, string>;
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
    const classified = this.classify(workbook, existingCategories);

    return {
      income: { validCount: classified.validIncome.length, invalid: classified.invalidIncome },
      expense: { validCount: classified.validExpense.length, invalid: classified.invalidExpense },
      newCategories: Array.from(classified.missingCategories.values()),
    };
  }

  async confirm(userId: string, buffer: Buffer): Promise<ImportConfirmResult> {
    const workbook = await this.parseOrThrow(buffer);

    return this.db.transaction(async (tx) => {
      const existingCategories = await tx.query.categories.findMany({ where: eq(categories.userId, userId) });
      const classified = this.classify(workbook, existingCategories);

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

      const incomeValues = classified.validIncome.map((row) => ({
        userId,
        type: 'INCOME' as const,
        date: row.date,
        categoryId: mustGetCategoryId(categoryIdByKey, 'INCOME', row.categoryName),
        concept: row.concept,
        amount: row.amount,
      }));
      const expenseValues = classified.validExpense.map((row) => ({
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
        income: { importedCount: incomeValues.length, invalid: classified.invalidIncome },
        expense: { importedCount: expenseValues.length, invalid: classified.invalidExpense },
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

  private classify(workbook: ParsedWorkbook, existingCategories: Category[]): ClassifiedRows {
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

    return { validIncome, invalidIncome, validExpense, invalidExpense, missingCategories };
  }
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
