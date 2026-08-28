import { describe, expect, it } from 'vitest';
import { Workbook } from 'exceljs';
import {
  InvalidWorkbookError,
  mapPaymentMethod,
  normalizeCategoryName,
  parseAmount,
  parseDate,
  parseExcelWorkbook,
  parseText,
  validateExpenseRow,
  validateIncomeRow,
} from './import.parsing.js';
import type { RawExpenseRow, RawIncomeRow } from './import.parsing.js';

/**
 * Spec 003, plan.md §9: **nunca** se usa el fichero real de Diego aquí.
 * Todos los workbooks de este fichero se construyen sintéticamente con
 * `exceljs`, reproduciendo el mismo layout de columnas y los mismos casos
 * límite ya identificados y verificados contra el fichero real
 * (`plan.md` §4, §7), pero con filas inventadas.
 */

// Mismas columnas que plan.md §4 (1-based, como las usa `exceljs`).
const INCOME_COLS = { fecha: 7, tipo: 8, concepto: 9, valor: 10 };
const EXPENSE_COLS = { fecha: 8, tipo: 9, subtipo: 10, concepto: 11, tienda: 12, valor: 13 };

interface IncomeRowInput {
  fecha?: unknown;
  tipo?: unknown;
  concepto?: unknown;
  valor?: unknown;
}

interface ExpenseRowInput {
  fecha?: unknown;
  tipo?: unknown;
  subtipo?: unknown;
  concepto?: unknown;
  tienda?: unknown;
  valor?: unknown;
}

async function buildWorkbookBuffer(options: {
  sheetNames?: { income?: string; expense?: string };
  incomeRows?: IncomeRowInput[];
  expenseRows?: ExpenseRowInput[];
}): Promise<Buffer> {
  const workbook = new Workbook();
  const incomeSheetName = options.sheetNames?.income ?? 'Ingresos';
  const expenseSheetName = options.sheetNames?.expense ?? 'Gastos';

  const incomeSheet = workbook.addWorksheet(incomeSheetName);
  incomeSheet.getRow(1).values = ['A', 'B', 'C', 'D', 'E', 'F', 'Fecha', 'Tipo', 'Concepto', 'Valor', 'Mes'];
  (options.incomeRows ?? []).forEach((row, i) => {
    const excelRow = incomeSheet.getRow(i + 2);
    if (row.fecha !== undefined) excelRow.getCell(INCOME_COLS.fecha).value = row.fecha as never;
    if (row.tipo !== undefined) excelRow.getCell(INCOME_COLS.tipo).value = row.tipo as never;
    if (row.concepto !== undefined) excelRow.getCell(INCOME_COLS.concepto).value = row.concepto as never;
    if (row.valor !== undefined) excelRow.getCell(INCOME_COLS.valor).value = row.valor as never;
  });

  const expenseSheet = workbook.addWorksheet(expenseSheetName);
  expenseSheet.getRow(1).values = [
    'A', 'B', 'C', 'D', 'E', 'F', 'G',
    'Fecha', 'Tipo', 'Subtipo', 'Concepto', 'Tienda/Empresa', 'Valor', 'Mes',
  ];
  (options.expenseRows ?? []).forEach((row, i) => {
    const excelRow = expenseSheet.getRow(i + 2);
    if (row.fecha !== undefined) excelRow.getCell(EXPENSE_COLS.fecha).value = row.fecha as never;
    if (row.tipo !== undefined) excelRow.getCell(EXPENSE_COLS.tipo).value = row.tipo as never;
    if (row.subtipo !== undefined) excelRow.getCell(EXPENSE_COLS.subtipo).value = row.subtipo as never;
    if (row.concepto !== undefined) excelRow.getCell(EXPENSE_COLS.concepto).value = row.concepto as never;
    if (row.tienda !== undefined) excelRow.getCell(EXPENSE_COLS.tienda).value = row.tienda as never;
    if (row.valor !== undefined) excelRow.getCell(EXPENSE_COLS.valor).value = row.valor as never;
  });

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

function incomeRow(overrides: Partial<RawIncomeRow> = {}): RawIncomeRow {
  return { rowNumber: 2, fecha: new Date('2026-03-10'), tipo: 'Nomina', concepto: 'Sueldo', valor: 1500, ...overrides };
}

function expenseRow(overrides: Partial<RawExpenseRow> = {}): RawExpenseRow {
  return {
    rowNumber: 2,
    fecha: new Date('2026-03-10'),
    tipo: 'Tarjeta',
    subtipo: 'Comida',
    concepto: 'Supermercado',
    tienda: 'Mercadona',
    valor: 45.5,
    ...overrides,
  };
}

describe('import.parsing', () => {
  describe('parseExcelWorkbook', () => {
    it('lanza InvalidWorkbookError si falta la hoja "Ingresos"', async () => {
      const buffer = await buildWorkbookBuffer({ sheetNames: { income: 'Otra cosa' } });
      await expect(parseExcelWorkbook(buffer)).rejects.toThrow(InvalidWorkbookError);
      await expect(parseExcelWorkbook(buffer)).rejects.toThrow(/Ingresos/);
    });

    it('lanza InvalidWorkbookError si falta la hoja "Gastos"', async () => {
      const buffer = await buildWorkbookBuffer({ sheetNames: { expense: 'Otra cosa' } });
      await expect(parseExcelWorkbook(buffer)).rejects.toThrow(/Gastos/);
    });

    it('extrae las filas de datos de ambas hojas con sus valores', async () => {
      const buffer = await buildWorkbookBuffer({
        incomeRows: [{ fecha: new Date('2026-01-15'), tipo: 'Nomina', concepto: 'Sueldo enero', valor: 2000 }],
        expenseRows: [
          {
            fecha: new Date('2026-01-16'),
            tipo: 'Tarjeta',
            subtipo: 'Comida',
            concepto: 'Cena',
            tienda: 'Restaurante X',
            valor: 32.4,
          },
        ],
      });
      const parsed = await parseExcelWorkbook(buffer);

      expect(parsed.incomeRows).toHaveLength(1);
      expect(parsed.incomeRows[0]).toMatchObject({ rowNumber: 2, tipo: 'Nomina', concepto: 'Sueldo enero', valor: 2000 });

      expect(parsed.expenseRows).toHaveLength(1);
      expect(parsed.expenseRows[0]).toMatchObject({
        rowNumber: 2,
        tipo: 'Tarjeta',
        subtipo: 'Comida',
        concepto: 'Cena',
        tienda: 'Restaurante X',
        valor: 32.4,
      });
    });

    it('salta en silencio una fila totalmente vacía (plan.md §4)', async () => {
      const buffer = await buildWorkbookBuffer({
        incomeRows: [
          {}, // fila 2: totalmente vacía
          { fecha: new Date('2026-02-01'), tipo: 'Otros', concepto: 'Varios', valor: 10 }, // fila 3
        ],
      });
      const parsed = await parseExcelWorkbook(buffer);
      expect(parsed.incomeRows).toHaveLength(1);
      expect(parsed.incomeRows[0].rowNumber).toBe(3);
    });

    it('NO salta una fila con algún dato pero la fecha vacía (no es "totalmente vacía")', async () => {
      const buffer = await buildWorkbookBuffer({
        incomeRows: [{ tipo: 'Otros', concepto: 'Varios', valor: 10 }], // sin fecha
      });
      const parsed = await parseExcelWorkbook(buffer);
      expect(parsed.incomeRows).toHaveLength(1); // se mantiene para que validateIncomeRow la descarte con motivo
    });

    it('acepta una celda de importe guardada como texto ("0.89")', async () => {
      const buffer = await buildWorkbookBuffer({
        expenseRows: [{ fecha: new Date('2026-04-01'), tipo: 'Tarjeta', subtipo: 'Comida', concepto: 'Café', valor: '0.89' }],
      });
      const parsed = await parseExcelWorkbook(buffer);
      const result = validateExpenseRow(parsed.expenseRows[0]);
      expect(result.valid).toBe(true);
      if (result.valid) expect(result.row.amount).toBe('0.89');
    });
  });

  describe('parseAmount', () => {
    it('acepta un número de celda', () => {
      expect(parseAmount(45.5)?.toFixed(2)).toBe('45.50');
    });

    it('acepta texto que representa un número (fichero real: celdas de "Valor" en texto)', () => {
      expect(parseAmount('0.89')?.toFixed(2)).toBe('0.89');
    });

    it('devuelve null para texto no numérico, vacío, null o undefined', () => {
      expect(parseAmount('abc')).toBeNull();
      expect(parseAmount('')).toBeNull();
      expect(parseAmount('   ')).toBeNull();
      expect(parseAmount(null)).toBeNull();
      expect(parseAmount(undefined)).toBeNull();
    });

    it('no descarta un importe negativo o cero aquí — es responsabilidad de quien valida la fila', () => {
      expect(parseAmount(0)?.toFixed(2)).toBe('0.00');
      expect(parseAmount(-5)?.toFixed(2)).toBe('-5.00');
    });
  });

  describe('parseDate', () => {
    it('acepta una celda ya tipada como fecha por Excel', () => {
      expect(parseDate(new Date(Date.UTC(2026, 7, 31)))).toBe('2026-08-31');
    });

    it('acepta texto dd/mm/yyyy', () => {
      expect(parseDate('31/08/2026')).toBe('2026-08-31');
    });

    it('acepta texto ya en formato YYYY-MM-DD', () => {
      expect(parseDate('2026-08-31')).toBe('2026-08-31');
    });

    it('devuelve null para vacío, null, undefined o texto no interpretable', () => {
      expect(parseDate('')).toBeNull();
      expect(parseDate(null)).toBeNull();
      expect(parseDate(undefined)).toBeNull();
      expect(parseDate('no es una fecha')).toBeNull();
    });
  });

  describe('parseText', () => {
    it('recorta espacios', () => {
      expect(parseText('  Comida  ')).toBe('Comida');
    });

    it('devuelve null si queda vacío tras recortar, o si es null/undefined', () => {
      expect(parseText('   ')).toBeNull();
      expect(parseText(null)).toBeNull();
      expect(parseText(undefined)).toBeNull();
    });
  });

  describe('normalizeCategoryName', () => {
    it('normaliza mayúsculas/minúsculas, tildes y espacios sobrantes al mismo resultado', () => {
      expect(normalizeCategoryName('Comida')).toBe(normalizeCategoryName('Comida '));
      expect(normalizeCategoryName('Lotería')).toBe(normalizeCategoryName('loteria'));
    });

    it('resuelve "Acciones" al alias "acciones (venta)" (plan.md §5)', () => {
      expect(normalizeCategoryName('Acciones')).toBe('acciones (venta)');
    });

    it('un valor sin alias ni coincidencia se normaliza tal cual, sin corregir ortografía', () => {
      expect(normalizeCategoryName('Peluqueria')).toBe('peluqueria');
    });
  });

  describe('mapPaymentMethod', () => {
    it.each([
      ['Tarjeta', 'CARD'],
      ['Recibo', 'DIRECT_DEBIT'],
      ['Recibos', 'DIRECT_DEBIT'],
      ['Efectivo', 'CASH'],
      ['Transferencia', 'TRANSFER'],
      ['  tarjeta  ', 'CARD'],
    ])('mapea "%s" a %s', (raw, expected) => {
      expect(mapPaymentMethod(raw)).toBe(expected);
    });

    it('devuelve null para un valor fuera del catálogo cerrado', () => {
      expect(mapPaymentMethod('Bizum')).toBeNull();
    });
  });

  describe('validateIncomeRow', () => {
    it('valida una fila correcta', () => {
      const result = validateIncomeRow(incomeRow());
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.row).toEqual({
          date: '2026-03-10',
          categoryName: 'nomina',
          rawCategoryName: 'Nomina',
          concept: 'Sueldo',
          amount: '1500.00',
        });
      }
    });

    it('resuelve el alias de "Acciones" de principio a fin', () => {
      const result = validateIncomeRow(incomeRow({ tipo: 'Acciones' }));
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.row.categoryName).toBe('acciones (venta)');
        expect(result.row.rawCategoryName).toBe('Acciones'); // se conserva tal cual para si hay que crear categoría
      }
    });

    it('importe 0 invalida la fila (encontrado en el fichero real)', () => {
      const result = validateIncomeRow(incomeRow({ rowNumber: 102, valor: 0 }));
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.invalid.reason).toBe('Fila 102: el importe (0.00) no es positivo.');
    });

    it('importe negativo invalida la fila', () => {
      const result = validateIncomeRow(incomeRow({ valor: -10 }));
      expect(result.valid).toBe(false);
    });

    it('varios campos vacíos a la vez se listan juntos en un único motivo', () => {
      const result = validateIncomeRow(incomeRow({ rowNumber: 50, tipo: null, concepto: undefined, valor: null }));
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.invalid.reason).toBe('Fila 50: faltan categoría, concepto y importe.');
    });

    it('un único campo vacío usa el singular "falta"', () => {
      const result = validateIncomeRow(incomeRow({ rowNumber: 7, fecha: null }));
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.invalid.reason).toBe('Fila 7: falta fecha.');
    });
  });

  describe('validateExpenseRow', () => {
    it('valida una fila correcta, con comercio', () => {
      const result = validateExpenseRow(expenseRow());
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.row).toEqual({
          date: '2026-03-10',
          paymentMethod: 'CARD',
          categoryName: 'comida',
          rawCategoryName: 'Comida',
          concept: 'Supermercado',
          merchant: 'Mercadona',
          amount: '45.50',
        });
      }
    });

    it('el comercio es opcional — vacío no invalida la fila (plan.md §4)', () => {
      const result = validateExpenseRow(expenseRow({ tienda: null }));
      expect(result.valid).toBe(true);
      if (result.valid) expect(result.row.merchant).toBeNull();
    });

    it('tipo de pago, categoría y concepto vacíos a la vez (con importe presente) → inválida (encontrado en el fichero real)', () => {
      const result = validateExpenseRow(expenseRow({ rowNumber: 464, tipo: null, subtipo: null, concepto: null }));
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.invalid.reason).toBe('Fila 464: faltan tipo de pago, categoría y concepto.');
    });

    it('concepto vacío con el resto de campos presentes → inválida (encontrado en el fichero real)', () => {
      const result = validateExpenseRow(expenseRow({ rowNumber: 88, concepto: '   ' }));
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.invalid.reason).toBe('Fila 88: falta concepto.');
    });

    it('tipo de pago fuera del catálogo cerrado → inválida, sin crear nada nuevo (H2 criterio 3)', () => {
      const result = validateExpenseRow(expenseRow({ rowNumber: 12, tipo: 'Bizum' }));
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.invalid.reason).toBe(
          'Fila 12: el tipo de pago "Bizum" no está entre los admitidos (Tarjeta, Recibo, Efectivo, Transferencia).',
        );
      }
    });

    it('la categoría de gasto se normaliza igual que en ingresos (espacios sobrantes)', () => {
      const result = validateExpenseRow(expenseRow({ subtipo: 'Comida ' }));
      expect(result.valid).toBe(true);
      if (result.valid) expect(result.row.categoryName).toBe('comida');
    });

    it('un valor de categoría sin coincidencia se conserva tal cual (recortado), sin corregir ortografía', () => {
      const result = validateExpenseRow(expenseRow({ subtipo: '  Peluqueria  ' }));
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.row.rawCategoryName).toBe('Peluqueria');
        expect(result.row.categoryName).toBe('peluqueria');
      }
    });

    it('importe 0 o negativo invalida la fila', () => {
      expect(validateExpenseRow(expenseRow({ valor: 0 })).valid).toBe(false);
      expect(validateExpenseRow(expenseRow({ valor: -1 })).valid).toBe(false);
    });
  });
});
