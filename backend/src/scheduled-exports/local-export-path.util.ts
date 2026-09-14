/**
 * Spec 032 H5, plan.md §11.2. Defensa en profundidad para el destino
 * "carpeta en el servidor": el directorio real siempre queda namespaced por
 * `userId` (un UUID generado por la propia app, nunca por el usuario), así
 * que esta función no es la única barrera contra escapar de esa carpeta —
 * pero tampoco se confía en que `localSubfolder` (texto libre que el
 * usuario sí controla) llegue ya limpio. Quita cualquier cosa que no sea
 * letra/dígito/espacio/guion/guion bajo/barra, cualquier `..` y las barras
 * iniciales o repetidas.
 */
export function sanitizeSubfolder(input: string | null | undefined): string {
  if (!input) return '';
  return input
    .replace(/[^a-zA-Z0-9\- _/]/g, '')
    .replace(/\.\./g, '')
    .replace(/\/+/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
}
