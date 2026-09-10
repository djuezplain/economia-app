import { parse } from 'csv-parse/sync';
import { Decimal } from 'decimal.js';
import { parseDate } from '../import/import.parsing.js';
import { normalizeText } from '../common/normalize-text.util.js';

/**
 * Spec 033, plan.md §4-§5: funciones puras de lectura y parseo del CSV de
 * Investing.com ("Resumen de posiciones") — sin acceso a base de datos
 * (constitution §2). El emparejamiento contra las acciones *ya existentes*
 * del usuario (H3) queda deliberadamente fuera de aquí, en
 * `stock-import.matching.ts` — mismo criterio que separó `import.parsing.ts`
 * de `ImportService` en spec 003.
 */

const SUMMARY_SECTION_TITLE = 'Resumen de posiciones';
const OPEN_SECTION_TITLE = 'Posiciones abiertas';
const CLOSED_SECTION_TITLE = 'Posiciones cerradas';

export class InvalidStockCsvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidStockCsvError';
  }
}

export interface OpenSummaryRow {
  nombre: string;
  precioActual: Decimal;
}

export interface OpenLotRow {
  nombre: string;
  fechaApertura: string; // ISO (aaaa-mm-dd)
  cantidad: Decimal;
  precioEntrada: Decimal;
}

export interface ClosedLotRow {
  nombre: string;
  fechaApertura: string; // ISO
  cantidad: Decimal;
  precioEntrada: Decimal;
  fechaCierre: string; // ISO
  precioCierre: Decimal;
}

export interface ParsedStockCsv {
  summary: OpenSummaryRow[];
  openLots: OpenLotRow[];
  closedLots: ClosedLotRow[];
}

/**
 * plan.md §4: localiza las 3 secciones por su título, no por número de fila
 * fijo — más robusto frente a un fichero con más o menos posiciones que el
 * verificado. Lanza `InvalidStockCsvError` si falta cualquier sección o
 * columna requerida (H1 criterio 3).
 */
export function parseStockCsv(buffer: Buffer): ParsedStockCsv {
  const rows = parseCsvRows(buffer);

  const summarySection = findSection(rows, SUMMARY_SECTION_TITLE, ['Nombre', 'Precio actual']);
  const openSection = findSection(rows, OPEN_SECTION_TITLE, ['Nombre', 'Fecha apertura', 'Cantidad', 'Precio entrada']);
  const closedSection = findSection(rows, CLOSED_SECTION_TITLE, [
    'Nombre',
    'F. apertura',
    'Cantidad',
    'Precio entrada',
    'Fecha cierre',
    'Precio cierre',
  ]);

  const summary: OpenSummaryRow[] = summarySection.dataRows.map((row) => ({
    nombre: cell(row, summarySection.colIndex, 'Nombre'),
    precioActual: parseSpanishAmount(cell(row, summarySection.colIndex, 'Precio actual'), 'Precio actual'),
  }));

  const openLots: OpenLotRow[] = openSection.dataRows.map((row) => ({
    nombre: cell(row, openSection.colIndex, 'Nombre'),
    fechaApertura: parseRequiredDate(cell(row, openSection.colIndex, 'Fecha apertura'), 'Fecha apertura'),
    cantidad: parseShareCount(cell(row, openSection.colIndex, 'Cantidad')),
    precioEntrada: parseSpanishAmount(cell(row, openSection.colIndex, 'Precio entrada'), 'Precio entrada'),
  }));

  const closedLots: ClosedLotRow[] = closedSection.dataRows.map((row) => ({
    nombre: cell(row, closedSection.colIndex, 'Nombre'),
    fechaApertura: parseRequiredDate(cell(row, closedSection.colIndex, 'F. apertura'), 'F. apertura'),
    cantidad: parseShareCount(cell(row, closedSection.colIndex, 'Cantidad')),
    precioEntrada: parseSpanishAmount(cell(row, closedSection.colIndex, 'Precio entrada'), 'Precio entrada'),
    fechaCierre: parseRequiredDate(cell(row, closedSection.colIndex, 'Fecha cierre'), 'Fecha cierre'),
    precioCierre: parseSpanishAmount(cell(row, closedSection.colIndex, 'Precio cierre'), 'Precio cierre'),
  }));

  return { summary, openLots, closedLots };
}

function parseCsvRows(buffer: Buffer): string[][] {
  try {
    return parse(buffer.toString('utf-8'), { skip_empty_lines: false, relax_column_count: true }) as string[][];
  } catch {
    throw new InvalidStockCsvError('El fichero no es un CSV válido.');
  }
}

/** Una fila "vacía" del CSV llega como `['']` (una única celda vacía), no como `[]` — verificado con `csv-parse`. */
function isBlankRow(row: string[]): boolean {
  return row.every((c) => c.trim() === '');
}

interface Section {
  colIndex: (name: string) => number;
  dataRows: string[][];
}

/**
 * Busca la fila de una sola celda con el título exacto, localiza su
 * cabecera (la siguiente fila no vacía) y recoge las filas de datos hasta
 * la primera fila vacía (plan.md §4) — las filas de totales que vienen
 * después de cada sección nunca se llegan a leer.
 */
function findSection(rows: string[][], title: string, requiredColumns: string[]): Section {
  const titleIdx = rows.findIndex((row) => row.length === 1 && row[0].trim() === title);
  if (titleIdx === -1) {
    throw new InvalidStockCsvError(`El fichero no tiene una sección "${title}".`);
  }

  let headerIdx = titleIdx + 1;
  while (headerIdx < rows.length && isBlankRow(rows[headerIdx])) headerIdx++;
  const header = rows[headerIdx];
  if (!header) {
    throw new InvalidStockCsvError(`La sección "${title}" no tiene cabecera.`);
  }

  const missing = requiredColumns.filter((c) => !header.includes(c));
  if (missing.length > 0) {
    throw new InvalidStockCsvError(`La sección "${title}" no tiene las columnas esperadas: ${missing.join(', ')}.`);
  }

  const dataRows: string[][] = [];
  let i = headerIdx + 1;
  while (i < rows.length && !isBlankRow(rows[i])) {
    dataRows.push(rows[i]);
    i++;
  }

  return { colIndex: (name: string) => header.indexOf(name), dataRows };
}

function cell(row: string[], colIndex: (name: string) => number, name: string): string {
  return (row[colIndex(name)] ?? '').trim();
}

/**
 * plan.md §5: `Cantidad` usa punto decimal sin separador de miles (p. ej.
 * `1420.00000000`) — a diferencia de las columnas de precio (§ siguiente).
 * Confundir ambos formatos rompe justo las cantidades de más de 3 dígitos
 * enteros (IAG, Telefónica, Repsol en el fichero real).
 */
function parseShareCount(raw: string): Decimal {
  if (!/^\d+(\.\d+)?$/.test(raw)) {
    throw new InvalidStockCsvError(`"Cantidad" con formato inesperado: "${raw}".`);
  }
  return new Decimal(raw);
}

/**
 * plan.md §5: columnas de precio en formato español — punto de miles, coma
 * decimal (p. ej. `1.014,200` = 1014,200). Se quitan los puntos antes de
 * sustituir la coma por punto (no al revés, o `1.014,200` perdería el
 * separador de miles antes de poder distinguirlo del decimal).
 */
function parseSpanishAmount(raw: string, fieldName: string): Decimal {
  const normalized = raw.replace(/\./g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    throw new InvalidStockCsvError(`"${fieldName}" con formato inesperado: "${raw}".`);
  }
  return new Decimal(normalized);
}

function parseRequiredDate(raw: string, fieldName: string): string {
  const parsed = parseDate(raw);
  if (!parsed) {
    throw new InvalidStockCsvError(`"${fieldName}" con formato inesperado: "${raw}".`);
  }
  return parsed;
}

// --- Emparejamiento con acciones ya existentes (plan.md §6, H3) ----------

export type StockMatchStatus = 'new' | 'existing' | 'ambiguous';

export interface ExistingStockRef {
  id: string;
  custodyBank: string;
  stock: string;
}

export interface StockMatch {
  /** Columna "Nombre" del CSV, tal cual (H3 criterio 3: se usa literal para crear una acción nueva). */
  nombre: string;
  status: StockMatchStatus;
  /** Solo presente si `status === 'existing'` (H3 criterio 1). */
  existingStock?: { id: string; custodyBank: string };
}

/**
 * Empareja cada nombre distinto del CSV con las acciones ya existentes del
 * usuario, comparando por nombre normalizado (H3 criterio 1) e ignorando el
 * banco custodia en la comparación. 0 coincidencias → `new`; 1 → `existing`
 * (se reutiliza su `id`/`custodyBank`); ≥2 → `ambiguous`, ninguna se elige
 * automáticamente (H3 criterio 2).
 */
export function matchStockNames(csvNames: string[], existingStocks: ExistingStockRef[]): StockMatch[] {
  const distinctNames = Array.from(new Set(csvNames));
  return distinctNames.map((nombre) => {
    const normalized = normalizeText(nombre);
    const matches = existingStocks.filter((s) => normalizeText(s.stock) === normalized);
    if (matches.length === 0) return { nombre, status: 'new' };
    if (matches.length === 1) return { nombre, status: 'existing', existingStock: { id: matches[0].id, custodyBank: matches[0].custodyBank } };
    return { nombre, status: 'ambiguous' };
  });
}
