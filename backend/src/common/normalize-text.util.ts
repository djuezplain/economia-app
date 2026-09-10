/**
 * Normaliza texto libre para comparar sin distinguir mayúsculas/minúsculas,
 * tildes ni espacios sobrantes al principio o al final. Extraída de
 * `import/import.parsing.ts` (spec 003, `normalizeCategoryName`) a un sitio
 * compartido porque spec 033 (`stock-import/`) necesita exactamente la
 * misma normalización para emparejar nombres de acciones — sin este
 * extract, ambos módulos tendrían la misma función de 4 líneas duplicada.
 */
export function normalizeText(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, ''); // quita diacríticos (tildes)
}
