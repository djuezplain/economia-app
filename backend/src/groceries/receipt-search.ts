/**
 * Spec 051 plan.md §2: funciones puras del buscador de tickets. La búsqueda
 * en sí se hace en PostgreSQL con `immutable_unaccent(lower(...))`; estas
 * funciones preparan los términos con la misma normalización y sacan el
 * fragmento de texto donde coincide un resultado.
 */

const MAX_TERMS = 8;
const MIN_TERM_LENGTH = 2;

/** Minúsculas y sin tildes ni diéresis, como `immutable_unaccent(lower())` para el español. */
export function normalizeSearch(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/** Las palabras de la búsqueda, normalizadas, sin duplicados, de al menos 2 caracteres y como mucho 8. */
export function searchTerms(q: string): string[] {
  const terms = normalizeSearch(q)
    .split(/\s+/)
    .filter((term) => term.length >= MIN_TERM_LENGTH);
  return [...new Set(terms)].slice(0, MAX_TERMS);
}

/** Escapa los comodines de `LIKE` (con `\` como carácter de escape, el de PostgreSQL por defecto). */
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * El primer fragmento de `text` donde aparece alguno de los términos (ya
 * normalizados), con `radius` caracteres a cada lado y "…" si se recorta.
 * Se busca en la versión normalizada y se recorta el texto original, para
 * conservar sus tildes: cada carácter original se normaliza por separado y
 * se guarda a qué posición original corresponde cada carácter normalizado.
 */
export function findSnippet(text: string | null | undefined, terms: string[], radius = 40): string | null {
  if (!text || terms.length === 0) return null;
  const original = [...text.replace(/\s+/g, ' ')];

  let normalized = '';
  const originalIndex: number[] = [];
  original.forEach((char, index) => {
    const piece = normalizeSearch(char);
    normalized += piece;
    for (let i = 0; i < piece.length; i++) originalIndex.push(index);
  });

  let best: { start: number; end: number } | null = null;
  for (const term of terms) {
    const at = normalized.indexOf(term);
    if (at === -1) continue;
    const start = originalIndex[at];
    const end = originalIndex[at + term.length - 1] + 1;
    if (!best || start < best.start) best = { start, end };
  }
  if (!best) return null;

  const from = Math.max(0, best.start - radius);
  const to = Math.min(original.length, best.end + radius);
  const fragment = original.slice(from, to).join('').trim();
  return `${from > 0 ? '…' : ''}${fragment}${to < original.length ? '…' : ''}`;
}
