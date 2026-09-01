import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { login as apiLogin, logout as apiLogout, refresh as apiRefresh } from '../api/auth';
import type { AuthUser } from '../api/auth';
import { getProfile } from '../api/users';
import { registerRefreshHandler, registerTokenGetter } from '../api/client';
import { getAccessToken, setAccessToken } from './token-store';
import { clearAll, ensureUserScope } from '../offline/db';
import { syncFullHistory } from '../offline/sync';
import { retrySessionExpiredEntries } from '../offline/queueProcessor';
import { AuthContext } from './auth-context';
import type { AuthContextValue } from './auth-context';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  /**
   * H2 (spec 001), criterio 3: para poder avisar de forma persistente cuando
   * la cuenta sigue `PENDING_VERIFICATION` (no solo justo después de un login
   * explícito, que es el único momento en el que antes se conocía `status`),
   * hace falta pedir el perfil (`GET /users/me`, grupo 7) en cuanto se sabe
   * que hay sesión — tanto al restaurarla en el arranque de la app como tras
   * el login por Google (`setSessionToken`, que solo recibe el access token,
   * no el perfil). "Fire and forget": si falla, `user` sencillamente se queda
   * `null` — no es motivo para invalidar una sesión por lo demás válida.
   */
  async function hydrateUser(): Promise<void> {
    try {
      const profile = await getProfile();
      setUser({ id: profile.id, email: profile.email, name: profile.name, status: profile.status });
      void syncUserCache(profile.id);
    } catch {
      // Ver comentario de arriba: se deja `user` como estaba (probablemente `null`).
    }
  }

  /**
   * Spec 011 (modo offline), plan.md §3-§4: en cuanto se sabe qué usuario
   * está autenticado, se garantiza que la caché local es la suya
   * (`ensureUserScope`, vacía cualquier resto de otro usuario) y se lanza
   * una hidratación completa del histórico. "Fire and forget", igual que
   * `hydrateUser`: sin conexión, `syncFullHistory` simplemente falla y no
   * actualiza nada — no bloquea el arranque de la app ni el login.
   *
   * H5 criterio 5 (`spec.md`): también reintenta los cambios pendientes
   * bloqueados por sesión caducada (T5.3) — cualquier camino por el que se
   * llega aquí implica que se acaba de establecer una sesión válida.
   */
  async function syncUserCache(userId: string): Promise<void> {
    try {
      await ensureUserScope(userId);
      await syncFullHistory();
    } catch {
      // Ver comentario de arriba: sin conexión (o sin IndexedDB disponible
      // en el navegador), simplemente no se actualiza la caché.
    }
    try {
      await retrySessionExpiredEntries();
    } catch {
      // Best-effort, igual que el resto de esta función.
    }
  }

  useEffect(() => {
    registerTokenGetter(getAccessToken);
    registerRefreshHandler(async () => {
      try {
        const { accessToken } = await apiRefresh();
        setAccessToken(accessToken);
        setIsAuthenticated(true);
        return accessToken;
      } catch {
        setAccessToken(null);
        setIsAuthenticated(false);
        setUser(null);
        return null;
      }
    });
  }, []);

  useEffect(() => {
    // Al cargar la app no queda access token en memoria (se pierde con el
    // reload a propósito), pero la cookie httpOnly del refresh token puede
    // seguir siendo válida: se intenta un refresco silencioso para restaurar
    // la sesión sin pedir credenciales de nuevo (tasks.md T3.5).
    let cancelled = false;
    (async () => {
      try {
        const { accessToken } = await apiRefresh();
        if (cancelled) return;
        setAccessToken(accessToken);
        setIsAuthenticated(true);
        void hydrateUser();
      } catch {
        if (!cancelled) {
          setAccessToken(null);
          setIsAuthenticated(false);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function login(email: string, password: string): Promise<void> {
    const res = await apiLogin({ email, password });
    setAccessToken(res.accessToken);
    setUser(res.user);
    setIsAuthenticated(true);
    void syncUserCache(res.user.id);
  }

  async function logout(): Promise<void> {
    try {
      await apiLogout();
    } finally {
      // El estado local se limpia siempre, incluso si la llamada de red falla
      // (p. ej. el access token ya había caducado): el objetivo de "logout"
      // desde el punto de vista del usuario es dejar de estar autenticado
      // en este cliente.
      setAccessToken(null);
      setUser(null);
      setIsAuthenticated(false);
      // Spec 011 (modo offline), plan.md §3: no deja datos económicos en
      // IndexedDB tras cerrar sesión en este dispositivo.
      void clearAll();
    }
  }

  function setSessionToken(accessToken: string): void {
    setAccessToken(accessToken);
    setIsAuthenticated(true);
    void hydrateUser();
  }

  const value = useMemo<AuthContextValue>(
    () => ({ user, isAuthenticated, isLoading, login, logout, setSessionToken }),
    [user, isAuthenticated, isLoading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
