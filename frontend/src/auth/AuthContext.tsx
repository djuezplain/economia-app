import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { login as apiLogin, logout as apiLogout, refresh as apiRefresh } from '../api/auth';
import type { AuthUser } from '../api/auth';
import { getProfile } from '../api/users';
import { registerRefreshHandler, registerTokenGetter } from '../api/client';
import { getAccessToken, setAccessToken } from './token-store';
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
    } catch {
      // Ver comentario de arriba: se deja `user` como estaba (probablemente `null`).
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
