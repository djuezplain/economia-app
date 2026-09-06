export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

interface RequestOptions extends RequestInit {
  /** Evita el reintento automático tras un 401 — lo usan login/refresh para no reintentarse a sí mismos. */
  skipAuthRetry?: boolean;
}

let getToken: () => string | null = () => null;
let refreshHandler: (() => Promise<string | null>) | null = null;

/**
 * `AuthProvider` (src/auth/AuthContext.tsx) registra aquí cómo leer el access
 * token actual y cómo refrescarlo. Se hace así, en vez de importar el
 * contexto de React directamente en este módulo, para no crear una
 * dependencia circular cliente-http ⇄ contexto-de-auth (el contexto usa
 * `api` para llamar a login/refresh/logout).
 */
export function registerTokenGetter(getter: () => string | null): void {
  getToken = getter;
}

export function registerRefreshHandler(handler: () => Promise<string | null>): void {
  refreshHandler = handler;
}

async function request<T>(path: string, init: RequestOptions = {}): Promise<T> {
  const { skipAuthRetry, ...fetchInit } = init;
  const token = getToken();

  // spec 003 (T3.1, importación de Excel): si el cuerpo es un `FormData`
  // (subida de fichero, `api.postForm`), no se fuerza `Content-Type:
  // application/json` — el navegador debe poner su propio
  // `multipart/form-data; boundary=...`, que no se puede escribir a mano.
  const isFormData = fetchInit.body instanceof FormData;

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...fetchInit,
    credentials: 'include', // necesario para la cookie httpOnly del refresh token
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...fetchInit.headers,
    },
  });

  // Refresco automático transparente (tasks.md T3.5): si el access token en
  // memoria ha caducado, se intenta renovarlo una vez vía la cookie de
  // refresh y se repite la petición original con el token nuevo.
  if (res.status === 401 && !skipAuthRetry && refreshHandler) {
    const newToken = await refreshHandler();
    if (newToken) {
      return request<T>(path, { ...init, skipAuthRetry: true });
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new ApiError(res.status, body.message ?? 'Error de red');
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string, init?: RequestOptions) => request<T>(path, init),
  post: <T>(path: string, body?: unknown, init?: RequestOptions) =>
    request<T>(path, { ...init, method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown, init?: RequestOptions) =>
    request<T>(path, { ...init, method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown, init?: RequestOptions) =>
    request<T>(path, { ...init, method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string, body?: unknown, init?: RequestOptions) =>
    request<T>(path, { ...init, method: 'DELETE', body: body ? JSON.stringify(body) : undefined }),
  /** spec 003 (T3.1): sube un fichero (`multipart/form-data`), sin serializar el cuerpo a JSON. */
  postForm: <T>(path: string, formData: FormData, init?: RequestOptions) =>
    request<T>(path, { ...init, method: 'POST', body: formData }),
};
