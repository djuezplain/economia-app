/**
 * Códigos de error de PostgreSQL relevantes para convertir un error del
 * driver `pg` en una respuesta HTTP con sentido, en vez de dejar que
 * `nest` lo trate como un 500 genérico.
 *
 * https://www.postgresql.org/docs/current/errcodes-appendix.html
 */
const FOREIGN_KEY_VIOLATION = '23503';
const UNIQUE_VIOLATION = '23505';

/**
 * spec 002, plan.md §1/§6: las FKs de `transactions` hacia `categories` usan
 * `ON DELETE RESTRICT` a propósito — borrar una categoría en uso debe fallar
 * de forma explícita (409), no arrastrar ni huérfanar movimientos. Este
 * helper detecta ese caso concreto para que `CategoriesService.remove`
 * pueda traducirlo a un `ConflictException` en vez de dejar que se propague
 * como un error 500 sin contexto.
 */
export function isForeignKeyViolation(err: unknown): boolean {
  return getPgErrorCode(err) === FOREIGN_KEY_VIOLATION;
}

/**
 * Spec 011 (modo offline), plan.md §2: cuando el cliente manda un `id`
 * propio al crear un movimiento (para poder generarlo sin conexión), un
 * reintento del mismo `POST` (p. ej. porque la respuesta del primero se
 * perdió) choca con la PK ya insertada. Este helper detecta esa colisión
 * para que `TransactionsService.create` la trate como una creación
 * idempotente en vez de un 500 genérico.
 */
export function isUniqueViolation(err: unknown): boolean {
  return getPgErrorCode(err) === UNIQUE_VIOLATION;
}

/**
 * Drizzle envuelve el error real del driver `pg` en un `DrizzleQueryError`
 * propio (con el error original de `pg` en `.cause`) en vez de dejarlo subir
 * tal cual — así que el código de error de Postgres (`err.code`) puede venir
 * en el propio error o anidado en `.cause`, según la versión/capa que lo
 * lance. Se comprueban ambos niveles para no depender de ese detalle interno.
 */
function getPgErrorCode(err: unknown): string | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  const direct = (err as { code?: unknown }).code;
  if (typeof direct === 'string') return direct;
  const cause = (err as { cause?: unknown }).cause;
  if (typeof cause === 'object' && cause !== null) {
    const nested = (cause as { code?: unknown }).code;
    if (typeof nested === 'string') return nested;
  }
  return undefined;
}
