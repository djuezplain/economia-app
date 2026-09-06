import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JWT, gaxios } from 'google-auth-library';
import {
  EXPENSE_COLS,
  EXPENSE_SHEET_NAME,
  INCOME_COLS,
  INCOME_SHEET_NAME,
  InvalidWorkbookError,
  isExpenseRowBlank,
  isIncomeRowBlank,
} from './import.parsing.js';
import type { CellPrimitive, ParsedWorkbook, RawExpenseRow, RawIncomeRow } from './import.parsing.js';

const SHEETS_API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
const READONLY_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';
// Margen de filas a pedir (plan.md §3) — generoso para el volumen real de
// movimientos de un usuario, sin tener que paginar.
const MAX_DATA_ROWS = 2000;

/** H1 criterio 2 / H2 criterio 5 (spec 026): hoja no compartida, ID inexistente, o cualquier otro fallo de lectura contra la API de Google. */
export class GoogleSheetAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GoogleSheetAccessError';
  }
}

interface SpreadsheetMetadata {
  sheets?: { properties?: { title?: string } }[];
}

type SheetCellValue = string | number | boolean;

interface BatchGetValuesResponse {
  valueRanges?: { values?: SheetCellValue[][] }[];
}

/**
 * plan.md §2-§3: acceso de solo lectura a la Google Sheet de un usuario vía
 * una cuenta de servicio compartida por todos los usuarios (no OAuth por
 * usuario) — el usuario solo tiene que compartir su hoja con el email de
 * esta cuenta. `fetchWorkbook` produce un `ParsedWorkbook` con la misma
 * forma exacta que `parseExcelWorkbook` (import.parsing.ts), reutilizando
 * sus mismas constantes de columnas/pestañas para que toda la validación y
 * detección de duplicados (specs 003, 012) se aplique sin cambios.
 */
@Injectable()
export class GoogleSheetsService {
  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return this.serviceAccountEmail() !== '' && this.serviceAccountPrivateKey() !== '';
  }

  serviceAccountEmail(): string {
    return this.config.get<string>('GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL') ?? '';
  }

  /** H1 criterio 2: URL completa (`.../spreadsheets/d/<ID>/edit...`) o ID pelado — `null` si no reconoce el formato. Función pura, no llama a Google. */
  extractSpreadsheetId(input: string): string | null {
    const trimmed = input.trim();
    if (trimmed === '') return null;
    const urlMatch = /\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/.exec(trimmed);
    if (urlMatch) return urlMatch[1];
    if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) return trimmed;
    return null;
  }

  async fetchWorkbook(spreadsheetId: string): Promise<ParsedWorkbook> {
    const client = this.buildClient();

    const metadata = await this.request<SpreadsheetMetadata>(
      client,
      `${SHEETS_API_BASE}/${spreadsheetId}?fields=sheets.properties.title`,
    );
    const titles = new Set((metadata.sheets ?? []).map((s) => s.properties?.title).filter((t): t is string => !!t));
    if (!titles.has(INCOME_SHEET_NAME)) throw new InvalidWorkbookError(INCOME_SHEET_NAME);
    if (!titles.has(EXPENSE_SHEET_NAME)) throw new InvalidWorkbookError(EXPENSE_SHEET_NAME);

    // Rango desde la fila 2 (la 1 es cabecera, igual que `parseExcelWorkbook`)
    // hasta las mismas columnas que ya usa el Excel (plan.md §3: G-J en
    // Ingresos, H-M en Gastos).
    const incomeRange = `${INCOME_SHEET_NAME}!A2:J${MAX_DATA_ROWS + 1}`;
    const expenseRange = `${EXPENSE_SHEET_NAME}!A2:M${MAX_DATA_ROWS + 1}`;
    // `UNFORMATTED_VALUE` (no el valor "mostrado" de la celda): una fecha
    // llega como el número de serie interno de Sheets, no como el texto
    // formateado — se convierte a `Date` en `dateCellAt`. Es deliberado:
    // dos celdas de fecha con el mismo valor pero formato de visualización
    // distinto (p. ej. "1/1/2026" vs "1/1/26", visto en una hoja real de
    // Diego) darían un texto distinto con `FORMATTED_VALUE`, y esas
    // variantes de 2 cifras no las reconoce `parseDate` (import.parsing.ts)
    // — se perdían como "falta fecha". El número de serie es el mismo
    // siempre, independientemente del formato que tenga la celda.
    const params = new URLSearchParams({ valueRenderOption: 'UNFORMATTED_VALUE' });
    params.append('ranges', incomeRange);
    params.append('ranges', expenseRange);

    const batch = await this.request<BatchGetValuesResponse>(
      client,
      `${SHEETS_API_BASE}/${spreadsheetId}/values:batchGet?${params.toString()}`,
    );
    const [incomeValues, expenseValues] = batch.valueRanges ?? [];

    return {
      incomeRows: toIncomeRows(incomeValues?.values ?? []),
      expenseRows: toExpenseRows(expenseValues?.values ?? []),
    };
  }

  private serviceAccountPrivateKey(): string {
    // La clave PEM se guarda en `.env` con los saltos de línea escapados.
    return (this.config.get<string>('GOOGLE_SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY') ?? '').replace(/\\n/g, '\n');
  }

  private buildClient(): JWT {
    return new JWT({
      email: this.serviceAccountEmail(),
      key: this.serviceAccountPrivateKey(),
      scopes: [READONLY_SCOPE],
    });
  }

  private async request<T>(client: JWT, url: string): Promise<T> {
    try {
      const res = await client.request<T>({ url });
      return res.data;
    } catch (err) {
      if (err instanceof gaxios.GaxiosError) {
        const status = err.status ?? err.response?.status;
        if (status === 403 || status === 404) {
          throw new GoogleSheetAccessError(
            'No se puede acceder a esta Google Sheet. Comprueba que el ID o la URL son correctos y que la has compartido con el email de la cuenta de servicio, con permiso de Lector.',
          );
        }
      }
      throw new GoogleSheetAccessError('No se ha podido leer la Google Sheet en este momento. Inténtalo de nuevo más tarde.');
    }
  }
}

function toIncomeRows(values: SheetCellValue[][]): RawIncomeRow[] {
  const rows: RawIncomeRow[] = [];
  values.forEach((row, index) => {
    const raw: RawIncomeRow = {
      rowNumber: index + 2,
      fecha: dateCellAt(row, INCOME_COLS.fecha),
      tipo: cellAt(row, INCOME_COLS.tipo),
      concepto: cellAt(row, INCOME_COLS.concepto),
      valor: cellAt(row, INCOME_COLS.valor),
    };
    if (!isIncomeRowBlank(raw)) rows.push(raw);
  });
  return rows;
}

function toExpenseRows(values: SheetCellValue[][]): RawExpenseRow[] {
  const rows: RawExpenseRow[] = [];
  values.forEach((row, index) => {
    const raw: RawExpenseRow = {
      rowNumber: index + 2,
      fecha: dateCellAt(row, EXPENSE_COLS.fecha),
      tipo: cellAt(row, EXPENSE_COLS.tipo),
      subtipo: cellAt(row, EXPENSE_COLS.subtipo),
      concepto: cellAt(row, EXPENSE_COLS.concepto),
      tienda: cellAt(row, EXPENSE_COLS.tienda),
      valor: cellAt(row, EXPENSE_COLS.valor),
    };
    if (!isExpenseRowBlank(raw)) rows.push(raw);
  });
  return rows;
}

// La API de Sheets no rellena de vuelta las celdas vacías al final de una
// fila — un índice fuera del array (columna vacía en el margen derecho) es
// `undefined`, se trata igual que una celda vacía (`null`).
function cellAt(row: SheetCellValue[], col1Based: number): CellPrimitive {
  return row[col1Based - 1] ?? null;
}

// Epoch de Sheets/Excel ("sistema de fechas 1900"): el día de serie 0 es el
// 30 de diciembre de 1899 (no el 1 de enero — así arrastra el mismo desfase
// histórico de Excel, deliberado por compatibilidad). Con
// `UNFORMATTED_VALUE`, una celda de fecha llega como este número de serie
// (días desde ese epoch), no como el texto formateado — así el resultado no
// depende de si la celda se muestra como "1/1/2026" o "1/1/26".
const SHEETS_DATE_EPOCH_MS = Date.UTC(1899, 11, 30);
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function dateCellAt(row: SheetCellValue[], col1Based: number): CellPrimitive {
  const value = cellAt(row, col1Based);
  if (typeof value !== 'number') return value;
  return new Date(SHEETS_DATE_EPOCH_MS + Math.round(value) * MS_PER_DAY);
}
