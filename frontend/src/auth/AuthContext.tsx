import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { login as apiLogin, logout as apiLogout, refresh as apiRefresh } from '../api/auth';
import type { AuthUser } from '../api/auth';
import { registerRefreshHandler, registerTokenGetter } from '../api/client';
import { getAccessToken, setAccessToken } from './token-store';
import { AuthContext } from './auth-context';
import type { AuthContextValue } from './auth-context';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

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

  const value = useMemo<AuthContextValue>(
    () => ({ user, isAuthenticated, isLoading, login, logout }),
    [user, isAuthenticated, isLoading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
