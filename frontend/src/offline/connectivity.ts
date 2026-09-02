import { API_BASE_URL } from '../api/client';

/**
 * Spec 011 (modo offline), plan.md §6. `navigator.onLine` por sí solo da
 * falsos positivos (conectado a una red sin salida a internet, o al propio
 * backend caído) — se combina con una comprobación activa y ligera contra
 * `GET /health` (público, sin autenticación) para confirmar que el backend
 * responde de verdad.
 */

export type ConnectivityListener = (online: boolean) => void;

const HEALTH_CHECK_TIMEOUT_MS = 5000;

let online = typeof navigator === 'undefined' || navigator.onLine;
const listeners = new Set<ConnectivityListener>();

function setOnline(value: boolean): void {
  if (online === value) return;
  online = value;
  for (const listener of listeners) listener(online);
}

/** Estado conocido en este momento, sin disparar una comprobación nueva. */
export function isOnline(): boolean {
  return online;
}

export function subscribe(listener: ConnectivityListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Comprobación activa: si el navegador ya se sabe offline, no llega a
 * intentar la red. Si dice estar online, confirma contra `GET /health` con
 * un timeout corto — un backend caído o inalcanzable también cuenta como
 * "sin conexión" a efectos de esta app.
 */
export async function checkNow(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    setOnline(false);
    return false;
  }
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);
    try {
      const res = await fetch(`${API_BASE_URL}/health`, { signal: controller.signal });
      setOnline(res.ok);
      return res.ok;
    } finally {
      clearTimeout(timeoutId);
    }
  } catch {
    setOnline(false);
    return false;
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    void checkNow();
  });
  window.addEventListener('offline', () => setOnline(false));
}

/** Solo para tests: fuerza un estado conocido y quita todos los listeners (mismo patrón que `RateLimitGuard.resetForTests()` en el backend). Nunca se llama desde código de producción. */
export function resetForTests(value: boolean): void {
  online = value;
  listeners.clear();
}
