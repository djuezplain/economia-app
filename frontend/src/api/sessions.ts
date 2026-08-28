import { api } from './client';

// H6 (spec 001). Espejo de `SessionSummary` en el backend
// (`src/auth/sessions.service.ts`) — nunca incluye el hash del refresh token,
// y no hay campo `isCurrent`: ver la nota en el backend sobre por qué no se
// puede marcar de forma fiable la sesión "actual" sin meter el id de sesión
// en el JWT (mejora futura anotada, no implementada en este grupo).
export interface SessionSummary {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
}

export function listSessions(): Promise<SessionSummary[]> {
  return api.get<SessionSummary[]>('/users/me/sessions');
}

export function revokeSession(id: string): Promise<void> {
  return api.delete<void>(`/users/me/sessions/${id}`);
}
