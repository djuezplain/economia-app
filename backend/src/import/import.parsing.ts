import { Decimal } from 'decimal.js';
import { Workbook } from 'exceljs';
import type { Worksheet } from 'exceljs';
import type { PaymentMethod } from '../db/schema/transactions.schema.js';

/**
 * Spec 003, plan.md §4-§6: funciones puras de lectura, mapeo y validación
 * del Excel "2026" — sin acceso a base de datos (constitution §2). El
 * emparejamiento contra las categorías *ya existentes* del usuario (H2
 * criterio 1) queda deliberadamente fuera de aquí: una función pura no
 * puede consultar la base de datos, así que solo produce `categoryName`
 * (clave normalizada, lista para comparar) y `rawCategoryName` (tal cual
 * en el Excel, recortada); el grupo 2 (`ImportService`) decide, con las
 * categorías reales del usuario delante, si reutiliza una existente o crea
 * una nueva con `rawCategoryName`.
 */

const INCOME_SHEET_NAME = 'Ingresos';
const EXPENSE_SHEET_NAME = 'Gastos';

// Columnas verificadas contra el fichero real (plan.md §4) — 1-based, como
// las usa `exceljs` (`row.getCell(n)`), no letras de columna.
const INCOME_COLS = { fecha: 7, tipo: 8, concepto: 9, valor: 10 } as const; // G, H, I, J
const EXPENSE_COLS = {
  fecha: 8,
  tipo: 9,
  subtipo: 10,
  concepto: 11,
  tienda: 12,
  valor: 13,
} as const; // H, I, J, K, L, M

const CATEGORY_ALIASES: Record<string, string> = {
  // plan.md §5: normalizar (minúsculas, sin tildes, sin espacios sobrantes)
  // no basta para "Acciones" — la categoría semilla se llama "Acciones
  // (venta)". Único alias necesario contra el fichero real de Diego.
  acciones: 'acciones (venta)',
};

const PAYMENT_METHOD_MAP: Record<string, PaymentMethod> = {
  // plan.md §5: catálogo cerrado — cualquier valor fuera de aquí invalida
  // la fila (H2 criterio 3), no crea nada nuevo.
  tarjeta: 'CARD',
  recibo: 'DIRECT_DEBIT',
  recibos: 'DIRECT_DEBIT',
  efectivo: 'CASH',
  transferencia: 'TRANSFER',
};

export class InvalidWorkbookError extends Error {
  constructor(missingSheet: string) {
    super(`El fichero no tiene una hoja llamada "${missingSheet}".`);
    this.name = 'InvalidWorkbookError';
  }
}

/** Valor de celda ya "desenvuelto" (fórmulas, texto enriquecido, etc. resueltos a su valor plano). */
export type CellPrimitive = string | number | boolean | Date | null | undefined;

export interface RawIncomeRow {
  rowNumber: number;
  fecha: CellPrimitive;
  tipo: CellPrimitive;
  concepto: CellPrimitive;
  valor: CellPrimitive;
}

export interface RawExpenseRow {
  rowNumber: number;
  fecha: CellPrimitive;
  tipo: CellPrimitive;
  subtipo: CellPrimitive;
  concepto: CellPrimitive;
  tienda: CellPrimitive;
  valor: CellPrimitive;
}

export interface ParsedWorkbook {
  incomeRows: RawIncomeRow[];
  expenseRows: RawExpenseRow[];
}

/**
 * Lee el workbook y extrae las filas "de datos" de ambas hojas (cabecera
 * en la fila 1, datos desde la fila 2). Una hoja con un nombre distinto de
 * los esperados lanza `InvalidWorkbookError` (plan.md §7: "400 claro, no
 * un error genérico de parseo") — es la única función de este fichero que
 * lanza, porque "falta una hoja" no es una fila inválida, es un fichero
 * que no tiene la forma esperada.
 */
export async function parseExcelWorkbook(buffer: Buffer): Promise<ParsedWorkbook> {
  const workbook = new Workbook();
  // `exceljs` declara `load(buffer: Buffer, ...)` contra una versión de
  // `@types/node` anterior a que `Buffer` pasara a ser genérico
  // (`Buffer<ArrayBufferLike>`) — desajuste de tipos entre librerías, no un
  // problema real: en tiempo de ejecución es el mismo `Buffer` de Node.
  await workbook.xlsx.load(buffer as unknown as Parameters<Workbook['xlsx']['load']>[0]);

  const incomeSheet = workbook.getWorksheet(INCOME_SHEET_NAME);
  if (!incomeSheet) throw new InvalidWorkbookError(INCOME_SHEET_NAME);

  const expenseSheet = workbook.getWorksheet(EXPENSE_SHEET_NAME);
  if (!expenseSheet) throw new InvalidWorkbookError(EXPENSE_SHEET_NAME);

  return {
    incomeRows: extractIncomeRows(incomeSheet),
    expenseRows: extractExpenseRows(expenseSheet),
  };
}

function extractIncomeRows(sheet: Worksheet): RawIncomeRow[] {
  const rows: RawIncomeRow[] = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const raw: RawIncomeRow = {
      rowNumber: r,
      fecha: cellValue(row.getCell(INCOME_COLS.fecha)),
      tipo: cellValue(row.getCell(INCOME_COLS.tipo)),
      concepto: cellValue(row.getCell(INCOME_COLS.concepto)),
      valor: cellValue(row.getCell(INCOME_COLS.valor)),
    };
    if (!isIncomeRowBlank(raw)) rows.push(raw);
  }
  return rows;
}

function extractExpenseRows(sheet: Worksheet): RawExpenseRow[] {
  const rows: RawExpenseRow[] = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const raw: RawExpenseRow = {
      rowNumber: r,
      fecha: cellValue(row.getCell(EXPENSE_COLS.fecha)),
      tipo: cellValue(row.getCell(EXPENSE_COLS.tipo)),
      subtipo: cellValue(row.getCell(EXPENSE_COLS.subtipo)),
      concepto: cellValue(row.getCell(EXPENSE_COLS.concepto)),
      tienda: cellValue(row.getCell(EXPENSE_COLS.tienda)),
      valor: cellValue(row.getCell(EXPENSE_COLS.valor)),
    };
    if (!isExpenseRowBlank(raw)) rows.push(raw);
  }
  return rows;
}

// plan.md §4: "una fila totalmente vacía (todas las columnas usadas
// vacías) se salta en silencio" — deliberadamente sobre *todas* las
// columnas usadas, no solo Fecha: una fila con Fecha vacía pero algún otro
// dato relleno no es "solo espacio en blanco del Excel", es una fila
// incompleta real y debe pasar por `validateIncomeRow`/`validateExpenseRow`
// para descartarse con su motivo (plan.md §6), no saltarse en silencio.
function isIncomeRowBlank(raw: RawIncomeRow): boolean {
  return [raw.fecha, raw.tipo, raw.concepto, raw.valor].every(isBlankCell);
}

function isExpenseRowBlank(raw: RawExpenseRow): boolean {
  return [raw.fecha, raw.tipo, raw.subtipo, raw.concepto, raw.tienda, raw.valor].every(isBlankCell);
}

function isBlankCell(value: CellPrimitive): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  return false; // un número, booleano o fecha nunca es "en blanco"
}

/**
 * Desenvuelve un valor de celda de `exceljs` a un primitivo simple.
 * `cell.value` es una unión que incluye fórmulas (`{ formula, result }`) y
 * texto enriquecido (`{ richText }`) además de los valores planos — en el
 * fichero real las celdas relevantes son siempre texto/número/fecha
 * planos, pero esta función cubre el resto de la unión para no romperse
 * silenciosamente si una celda futura viene con formato distinto.
 */
function cellValue(cell: { value: unknown }): CellPrimitive {
  const v = cell.value;
  if (v === null || v === undefined) return v;
  if (v instanceof Date) return v;
  if (typeof v !== 'object') return v as CellPrimitive;
  if ('richText' in v) {
    return (v as { richText: Array<{ text: string }> }).richText.map((rt) => rt.text).join('');
  }
  if ('result' in v) {
    const result = (v as { result?: unknown }).result;
    if (result === null || result === undefined) return null;
    if (typeof result === 'object') return null; // fórmula con error (#DIV/0!, ...)
    return result as CellPrimitive;
  }
  if ('text' in v) return (v as { text: string }).text; // hipervínculo
  return null; // valor de error u otro caso no contemplado
}

// --- Normalización y mapeo (plan.md §5) ----------------------------------

function normalizeText(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, ''); // quita diacríticos (tildes)
}

/**
 * Clave normalizada para comparar contra las categorías ya existentes del
 * usuario (H2 criterio 1: sin distinguir mayúsculas/minúsculas, tildes ni
 * espacios sobrantes) — ya con el alias aplicado si corresponde (§5:
 * "Acciones" → "acciones (venta)"). Quien compare debe normalizar los
 * nombres de categoría existentes con esta misma función.
 */
export function normalizeCategoryName(raw: string): string {
  const normalized = normalizeText(raw);
  return CATEGORY_ALIASES[normalized] ?? normalized;
}

/** `null` si el valor no está en el catálogo cerrado de tipos de pago (plan.md §5). */
export function mapPaymentMethod(raw: string): PaymentMethod | null {
  return PAYMENT_METHOD_MAP[normalizeText(raw)] ?? null;
}

// --- Coerción de celdas (plan.md §4, §6) ----------------------------------

/**
 * Acepta un número de celda o un texto que representa un número (fichero
 * real: celdas de "Valor" guardadas como texto, p. ej. `"0.89"`).
 * `null` si está vacío o no se puede interpretar — no valida el signo
 * aquí, eso lo decide quien llama (plan.md §6: importe ≤ 0 es un motivo de
 * invalidez distinto de "importe vacío/no numérico").
 */
export function parseAmount(value: CellPrimitive): Decimal | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? new Decimal(value) : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return null;
    // admite coma decimal además de punto, por si acaso — el fichero real
    // solo trae punto (`"0.89"`), pero no cuesta nada cubrir el otro caso.
    const normalized = trimmed.includes(',') && !trimmed.includes('.') ? trimmed.replace(',', '.') : trimmed;
    if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;
    return new Decimal(normalized);
  }
  return null; // boolean, Date u otro tipo inesperado en la columna "Valor"
}

/**
 * Devuelve la fecha en formato `YYYY-MM-DD` (mismo formato que la columna
 * `date` de Postgres, spec 002 plan.md §1) o `null` si está vacía o no se
 * puede interpretar. Acepta tanto una celda ya tipada como fecha por Excel
 * (caso normal en el fichero real) como texto `dd/mm/yyyy` o `YYYY-MM-DD`.
 */
export function parseDate(value: CellPrimitive): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : toIsoDate(value);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
    if (match) {
      const [, day, month, year] = match;
      const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
      return Number.isNaN(date.getTime()) ? null : toIsoDate(date);
    }
    return null;
  }
  return null;
}

// `exceljs` devuelve las fechas de celda en UTC — se leen los componentes
// en UTC para no desplazar el día según la zona horaria del proceso.
function toIsoDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Texto recortado, o `null` si está vacío tras recortar (incluye "no informado"). */
export function parseText(value: CellPrimitive): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
}

// --- Validación de filas (plan.md §6) -------------------------------------

export interface ValidatedIncomeRow {
  date: string;
  categoryName: string;
  rawCategoryName: string;
  concept: string;
  amount: string;
}

export interface ValidatedExpenseRow {
  date: string;
  paymentMethod: PaymentMethod;
  categoryName: string;
  rawCategoryName: string;
  concept: string;
  merchant: string | null;
  amount: string;
}

export interface InvalidRow {
  rowNumber: number;
  reason: string;
}

export type IncomeRowResult = { valid: true; row: ValidatedIncomeRow } | { valid: false; invalid: InvalidRow };

export type ExpenseRowResult = { valid: true; row: ValidatedExpenseRow } | { valid: false; invalid: InvalidRow };

function missingFieldsReason(rowNumber: number, fields: string[]): string {
  const verb = fields.length === 1 ? 'falta' : 'faltan';
  return `Fila ${rowNumber}: ${verb} ${joinWithY(fields)}.`;
}

function joinWithY(items: string[]): string {
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
}

export function validateIncomeRow(raw: RawIncomeRow): IncomeRowResult {
  const date = parseDate(raw.fecha);
  const rawCategoryName = parseText(raw.tipo);
  const concept = parseText(raw.concepto);
  const amount = parseAmount(raw.valor);

  const missing: string[] = [];
  if (!date) missing.push('fecha');
  if (!rawCategoryName) missing.push('categoría');
  if (!concept) missing.push('concepto');
  if (amount === null) missing.push('importe');
  if (missing.length > 0) {
    return { valid: false, invalid: { rowNumber: raw.rowNumber, reason: missingFieldsReason(raw.rowNumber, missing) } };
  }

  if (amount!.lessThanOrEqualTo(0)) {
    return {
      valid: false,
      invalid: {
        rowNumber: raw.rowNumber,
        reason: `Fila ${raw.rowNumber}: el importe (${amount!.toFixed(2)}) no es positivo.`,
      },
    };
  }

  return {
    valid: true,
    row: {
      date: date!,
      categoryName: normalizeCategoryName(rawCategoryName!),
      rawCategoryName: rawCategoryName!,
      concept: concept!,
      amount: amount!.toFixed(2),
    },
  };
}

export function validateExpenseRow(raw: RawExpenseRow): ExpenseRowResult {
  const date = parseDate(raw.fecha);
  const rawPaymentMethod = parseText(raw.tipo);
  const rawCategoryName = parseText(raw.subtipo);
  const concept = parseText(raw.concepto);
  const merchant = parseText(raw.tienda); // opcional (plan.md §4): no cuenta como "faltante"
  const amount = parseAmount(raw.valor);

  const missing: string[] = [];
  if (!date) missing.push('fecha');
  if (!rawPaymentMethod) missing.push('tipo de pago');
  if (!rawCategoryName) missing.push('categoría');
  if (!concept) missing.push('concepto');
  if (amount === null) missing.push('importe');
  if (missing.length > 0) {
    return { valid: false, invalid: { rowNumber: raw.rowNumber, reason: missingFieldsReason(raw.rowNumber, missing) } };
  }

  const paymentMethod = mapPaymentMethod(rawPaymentMethod!);
  if (!paymentMethod) {
    return {
      valid: false,
      invalid: {
        rowNumber: raw.rowNumber,
        reason: `Fila ${raw.rowNumber}: el tipo de pago "${rawPaymentMethod}" no está entre los admitidos (Tarjeta, Recibo, Efectivo, Transferencia).`,
      },
    };
  }

  if (amount!.lessThanOrEqualTo(0)) {
    return {
      valid: false,
      invalid: {
        rowNumber: raw.rowNumber,
        reason: `Fila ${raw.rowNumber}: el importe (${amount!.toFixed(2)}) no es positivo.`,
      },
    };
  }

  return {
    valid: true,
    row: {
      date: date!,
      paymentMethod,
      categoryName: normalizeCategoryName(rawCategoryName!),
      rawCategoryName: rawCategoryName!,
      concept: concept!,
      merchant,
      amount: amount!.toFixed(2),
    },
  };
}
