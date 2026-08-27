import { createContext, useContext } from 'react';
import type { AuthUser } from '../api/auth';

export interface AuthContextValue {
  /** Perfil del usuario si se conoce (se rellena al hacer login explícito). */
  user: AuthUser | null;
  /**
   * Hay una sesión con access token válido en memoria. Puede ser `true` con
   * `user` a `null` justo tras el refresco silencioso al cargar la página,
   * porque `/auth/refresh` solo devuelve el token, no el perfil (eso llega
   * con `GET /users/me` en el grupo 7).
   */
  isAuthenticated: boolean;
  /** `true` mientras se intenta el refresco silencioso inicial al cargar la app. */
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

// En un fichero aparte (sin componentes) para que Fast Refresh no se queje:
// AuthContext.tsx debe exportar únicamente el componente `AuthProvider`.
export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth debe usarse dentro de <AuthProvider>.');
  }
  return ctx;
}
