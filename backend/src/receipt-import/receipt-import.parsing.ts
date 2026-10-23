import { Decimal } from 'decimal.js';
import { normalizeText } from '../common/normalize-text.util.js';

/**
 * Spec 034, plan.md §5-§6: funciones puras sobre el texto ya extraído por
 * OCR (`ReceiptOcrService`, fuera de este fichero a propósito — igual
 * criterio que separó `stock-import.parsing.ts` de la invocación real del
 * CSV) — sin acceso a base de datos ni al binario de Tesseract. El parseo
 * es heurístico, no determinista como el de un CSV (spec 033): una línea
 * que no encaja en ninguna regla se descarta en silencio en vez de
 * lanzar error (H1 criterio 4, H2 es la revisión manual que compensa esto).
 */

const HEADER_LINE_REGEX = /descripci/i;
const TOTAL_LINE_REGEX = /total/i;
// Spec 048 (H2 criterio 1): además de `dd/mm/aaaa`, separadores `-` y `.`
// (el mismo en las dos posiciones), años de 2 cifras y la fecha escrita
// con el nombre del mes, habituales en facturas.
const NUMERIC_DATE_REGEX = /(?<!\d)(\d{1,2})([/.-])(\d{1,2})\2(\d{4}|\d{2})(?!\d)/g;
const NAMED_MONTH_DATE_REGEX =
  /(?<!\d)(\d{1,2})\s+(?:de\s+)?(ene(?:ro)?|feb(?:rero)?|mar(?:zo)?|abr(?:il)?|may(?:o)?|jun(?:io)?|jul(?:io)?|ago(?:sto)?|sept?(?:iembre)?|oct(?:ubre)?|nov(?:iembre)?|dic(?:iembre)?)\.?\s+(?:de\s+|del\s+)?(\d{4})(?!\d)/g;
const MONTH_BY_PREFIX: Record<string, number> = {
  ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, oct: 10, nov: 11, dic: 12,
};
// Spec 048: líneas con "total" que no son el total a pagar (facturas). Una
// línea con IVA sí cuenta si es "IVA incluido".
const SUBTOTAL_LINE_REGEX = /sub\s*-?\s*total|base\s+imponible/i;
const VAT_LINE_REGEX = /\biva\b|i\.v\.a/i;
const VAT_INCLUDED_REGEX = /incl/i;
// Un "token de dinero" en el texto OCR: dígitos, separador decimal (coma o
// punto — la fuente térmica hace que Tesseract confunda ambos a veces), 2 o
// 3 decimales (los precios por kg del ticket real llevan a veces 3).
const MONEY_TOKEN_REGEX = /\d+[.,]\d{2,3}/g;
const WEIGHT_LINE_REGEX = /^\s*(\d+[.,]\d{1,3})\s*[Kk][Gg]\.?\s+(\d+[.,]\d{2,3})\s*€?\s*\/?\s*[Kk][Gg]\.?\s+(\d+[.,]\d{2,3})\s*$/;
const LEADING_QUANTITY_REGEX = /^\s*(\d+)\s+(.*)$/;

export type ReceiptUnit = 'unidad' | 'kg';

export interface ParsedReceiptLine {
  description: string;
  quantity: Decimal;
  unit: ReceiptUnit;
  pricePerUnit: Decimal;
  amount: Decimal;
}

function parseOcrDecimal(raw: string): Decimal {
  return new Decimal(raw.replace(',', '.'));
}

/**
 * plan.md §5: localiza la cabecera ("Descripción...") y la línea de TOTAL
 * para acotar qué líneas son candidatas a línea de producto — sin esto,
 * líneas posteriores como "TARJETA BANCARIA 39,27" se leerían como un
 * producto más. Si no se encuentra la cabecera, se empieza desde el
 * principio; si no se encuentra el TOTAL, se llega hasta el final (peor
 * caso: alguna línea de ruido de después se descarta igualmente porque no
 * encaja en ninguna regla de línea, regla 5).
 */
function findProductLinesRange(lines: string[]): { start: number; end: number } {
  const headerIndex = lines.findIndex((line) => HEADER_LINE_REGEX.test(line));
  const start = headerIndex === -1 ? 0 : headerIndex + 1;
  const totalIndex = lines.findIndex((line, index) => index >= start && TOTAL_LINE_REGEX.test(line));
  const end = totalIndex === -1 ? lines.length : totalIndex;
  return { start, end };
}

/**
 * plan.md §5 regla 1: una línea de peso real ocupa dos líneas físicas —
 * "1 BANANA" seguida de "0,600 kg 1,55 €/kg 1,05". Se detecta mirando si la
 * *siguiente* línea encaja en `WEIGHT_LINE_REGEX`.
 */
function tryParseWeightPair(descriptionLine: string, weightLine: string): ParsedReceiptLine | null {
  const match = WEIGHT_LINE_REGEX.exec(weightLine);
  if (!match) return null;
  const [, quantityKg, pricePerKg, amount] = match;
  const leading = LEADING_QUANTITY_REGEX.exec(descriptionLine);
  const description = (leading ? leading[2] : descriptionLine).trim();
  if (description === '') return null;
  return {
    description,
    quantity: parseOcrDecimal(quantityKg),
    unit: 'kg',
    pricePerUnit: parseOcrDecimal(pricePerKg),
    amount: parseOcrDecimal(amount),
  };
}

/**
 * plan.md §5 reglas 2-4: línea simple con uno o dos importes al final.
 * `null` si la línea no trae ningún token de dinero (regla 5 — se descarta,
 * no es un error).
 */
function tryParseSingleLine(line: string): ParsedReceiptLine | null {
  const leading = LEADING_QUANTITY_REGEX.exec(line);
  const quantity = leading ? new Decimal(leading[1]) : new Decimal(1);
  const rest = leading ? leading[2] : line;

  const moneyTokens = rest.match(MONEY_TOKEN_REGEX);
  if (!moneyTokens || moneyTokens.length === 0) return null;

  // La descripción es todo lo que precede al *primer* token de dinero — con
  // dos importes (regla 2), ambos son datos numéricos, ninguno es parte del
  // nombre del producto.
  const lastToken = moneyTokens[moneyTokens.length - 1];
  const description = rest.slice(0, rest.indexOf(moneyTokens[0])).trim();
  if (description === '') return null;

  if (moneyTokens.length >= 2) {
    // Regla 2: dos importes (precio/unidad + importe) — p. ej.
    // "2 NACHOS 0,90 1,80". El penúltimo token es el precio por unidad, el
    // último el importe total de la línea (pueden no ser los dos primeros
    // tokens si la descripción tuviera un número, caso no visto en la
    // práctica pero cubierto tomando siempre los dos últimos).
    const unitToken = moneyTokens[moneyTokens.length - 2];
    return {
      description,
      quantity,
      unit: 'unidad',
      pricePerUnit: parseOcrDecimal(unitToken),
      amount: parseOcrDecimal(lastToken),
    };
  }

  // Regla 3: un solo importe — precio/unidad derivado (amount / quantity).
  const amount = parseOcrDecimal(lastToken);
  return {
    description,
    quantity,
    unit: 'unidad',
    pricePerUnit: amount.dividedBy(quantity),
    amount,
  };
}

/**
 * plan.md §5: parsea el texto OCR completo del ticket a líneas
 * estructuradas. Best-effort — nunca lanza por una línea irreconocible,
 * simplemente no aparece en el resultado (H1 criterio 4).
 */
export function extractProductLines(ocrText: string): ParsedReceiptLine[] {
  const lines = ocrText.split('\n').map((line) => line.trim());
  const { start, end } = findProductLinesRange(lines);
  const result: ParsedReceiptLine[] = [];

  for (let i = start; i < end; i++) {
    const line = lines[i];
    if (line === '') continue;

    if (i + 1 < end) {
      const weightMatch = tryParseWeightPair(line, lines[i + 1]);
      if (weightMatch) {
        result.push(weightMatch);
        i++; // consume también la línea de peso
        continue;
      }
    }

    const single = tryParseSingleLine(line);
    if (single) result.push(single);
    // si no encaja en ninguna regla, se descarta en silencio (regla 5)
  }

  return result;
}

function toIsoDate(day: number, month: number, year: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * plan.md §6: primera fecha válida del texto, convertida a ISO por posición
 * de carácter — mismo criterio que spec 033 plan.md §5 (no
 * `new Date(string)`, ambiguo entre `dd/mm` y `mm/dd` según locale). Spec
 * 048: más formatos (ver `NUMERIC_DATE_REGEX`/`NAMED_MONTH_DATE_REGEX`), y
 * una coincidencia que no es una fecha real (mes 13, 31 de abril…) se
 * descarta en vez de devolverse.
 */
export function detectDate(ocrText: string): string | null {
  const text = normalizeText(ocrText);
  const candidates: Array<{ index: number; iso: string | null }> = [];
  for (const match of text.matchAll(NUMERIC_DATE_REGEX)) {
    const [, day, , month, year] = match;
    const fullYear = year.length === 2 ? 2000 + Number(year) : Number(year);
    candidates.push({ index: match.index, iso: toIsoDate(Number(day), Number(month), fullYear) });
  }
  for (const match of text.matchAll(NAMED_MONTH_DATE_REGEX)) {
    const [, day, monthName, year] = match;
    candidates.push({ index: match.index, iso: toIsoDate(Number(day), MONTH_BY_PREFIX[monthName.slice(0, 3)], Number(year)) });
  }
  return candidates.sort((a, b) => a.index - b.index).find((c) => c.iso !== null)?.iso ?? null;
}

/**
 * plan.md §6: primera línea con "TOTAL" seguida de un importe. Puramente
 * informativo (spec.md §1: es la línea con más riesgo real de OCR) —
 * `null` si no se encuentra, nunca se inventa un valor.
 */
export function detectPrintedTotal(ocrText: string): string | null {
  const lines = ocrText.split('\n');
  for (const line of lines) {
    if (!TOTAL_LINE_REGEX.test(line)) continue;
    if (SUBTOTAL_LINE_REGEX.test(line)) continue;
    if (VAT_LINE_REGEX.test(line) && !VAT_INCLUDED_REGEX.test(line)) continue;
    const tokens = line.match(MONEY_TOKEN_REGEX);
    if (tokens && tokens.length > 0) {
      return parseOcrDecimal(tokens[tokens.length - 1]).toFixed(2);
    }
  }
  return null;
}

/**
 * plan.md §6: sugerencia de nombre de supermercado cuando no hay ninguna
 * coincidencia con uno ya existente (`matchByNormalizedName`) — la primera
 * línea no vacía del ticket, tal cual (en la prueba real de spec.md §1 era
 * literalmente "MERCADONA, S.A."). Diego la confirma o corrige en H3
 * criterio 3, nunca se usa a ciegas.
 */
export function guessSupermarketName(ocrText: string): string | null {
  const firstLine = ocrText
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line !== '');
  return firstLine ?? null;
}

// --- Emparejamiento con supermercados/productos ya existentes (plan.md §8) -

export interface NamedEntity {
  id: string;
  name: string;
}

export type NameMatch = { matchedId: string } | { suggestedName: string };

/**
 * plan.md §8: a diferencia de `matchStockNames` (spec 033), aquí el
 * catálogo solo tiene un campo (`name`) — no puede haber "ambiguo": o hay
 * una coincidencia exacta tras normalizar, o no hay ninguna y se sugiere
 * crear uno nuevo. Se reutiliza tanto para supermercados como para
 * productos (H3/H4 criterio 1).
 */
export function matchByNormalizedName(name: string, candidates: NamedEntity[]): NameMatch {
  const normalized = normalizeText(name);
  const match = candidates.find((candidate) => normalizeText(candidate.name) === normalized);
  return match ? { matchedId: match.id } : { suggestedName: name };
}
