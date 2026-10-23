import { Decimal } from 'decimal.js';
import { normalizeText } from '../common/normalize-text.util.js';

// Spec 048 H3 / plan.md §2. Funciones puras: qué movimientos se sugieren para
// enlazar con un ticket y en qué orden. Nunca crean ni modifican nada.

/** Días antes de la fecha del ticket en los que puede caer el cargo. */
export const LINK_DAYS_BEFORE = 2;
/** Días después: el cargo con tarjeta suele llegar el mismo día o unos días más tarde. */
export const LINK_DAYS_AFTER = 5;
/** Un nombre recortado por el banco cuenta como el mismo si comparte al menos este prefijo. */
const MIN_PREFIX = 4;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Palabras que no distinguen un comercio de otro. */
const FILLER_WORDS = new Set([
  's', 'a', 'sa', 'sl', 'slu', 'sau', 'cb', 'sc', 'de', 'del', 'la', 'el', 'los', 'las', 'y', 'e',
  'supermercado', 'supermercados', 'hipermercado', 'tienda', 'compra', 'tarj', 'tarjeta', 'pago', 'recibo',
]);

function tokens(text: string | null): string[] {
  if (!text) return [];
  return normalizeText(text)
    .split(/[^a-z0-9ñ]+/)
    .filter((t) => t.length > 0 && !FILLER_WORDS.has(t) && !/^\d+$/.test(t));
}

function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= MIN_PREFIX && long.startsWith(short);
}

/**
 * Parecido 0..1 entre dos nombres de comercio: proporción de palabras del
 * nombre más corto que aparecen en el otro (coeficiente de solapamiento),
 * sin relleno ("S.A.", "SL", "supermercados"…) y aceptando un prefijo de 4+
 * letras para los nombres que el banco recorta ("MERCADON").
 */
export function merchantSimilarity(a: string | null, b: string | null): number {
  const left = [...new Set(tokens(a))];
  const right = [...new Set(tokens(b))];
  if (left.length === 0 || right.length === 0) return 0;
  const [shorter, longer] = left.length <= right.length ? [left, right] : [right, left];
  const shared = shorter.filter((t) => longer.some((u) => sameWord(t, u))).length;
  return shared / shorter.length;
}

export interface ReceiptForLink {
  /** 'YYYY-MM-DD' */
  date: string;
  printedTotal: string | null;
  /** Suma de las líneas, o `null` si el ticket no tiene líneas. */
  linesTotal: string | null;
  merchantName: string;
}

export interface LinkCandidate {
  id: string;
  type: 'INCOME' | 'EXPENSE';
  /** 'YYYY-MM-DD' */
  date: string;
  amount: string;
  merchant: string | null;
  concept: string;
}

function dayOffset(from: string, to: string): number {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS;
}

/**
 * H3 criterio 1: gastos cuyo importe es igual al total impreso **o** a la
 * suma de líneas (el banco cobra lo pagado, que puede no coincidir con la
 * suma de líneas si hay descuentos, ni con el total si el OCR lo leyó mal),
 * con fecha entre `LINK_DAYS_BEFORE` días antes y `LINK_DAYS_AFTER` después
 * de la del ticket. Orden: parecido del comercio (con el comercio o el
 * concepto del movimiento), luego cercanía de fecha.
 */
export function rankLinkCandidates<T extends LinkCandidate>(receipt: ReceiptForLink, movements: T[]): T[] {
  const amounts = [receipt.printedTotal, receipt.linesTotal].filter((a): a is string => a !== null).map((a) => new Decimal(a));
  if (amounts.length === 0) return [];

  const scored = movements
    .filter((m) => m.type === 'EXPENSE')
    .filter((m) => {
      const offset = dayOffset(receipt.date, m.date);
      return offset >= -LINK_DAYS_BEFORE && offset <= LINK_DAYS_AFTER;
    })
    .filter((m) => amounts.some((a) => a.equals(m.amount)))
    .map((m) => ({
      movement: m,
      similarity: Math.max(merchantSimilarity(receipt.merchantName, m.merchant), merchantSimilarity(receipt.merchantName, m.concept)),
      distance: Math.abs(dayOffset(receipt.date, m.date)),
    }));

  return scored
    .sort((a, b) => b.similarity - a.similarity || a.distance - b.distance || a.movement.id.localeCompare(b.movement.id))
    .map((s) => s.movement);
}
