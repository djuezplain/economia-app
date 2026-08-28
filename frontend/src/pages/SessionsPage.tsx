import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { listSessions, revokeSession } from '../api/sessions';
import type { SessionSummary } from '../api/sessions';
import { ApiError } from '../api/client';

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

export function SessionsPage() {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();

  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await listSessions();
        if (!cancelled) setSessions(list);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof ApiError ? err.message : 'No se han podido cargar las sesiones.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  async function handleRevoke(id: string) {
    setRevokeError(null);
    setRevokingId(id);
    try {
      await revokeSession(id);
      // H6 criterio 2: al cerrar una sesión, desaparece de la lista sin
      // necesidad de volver a pedirla al servidor.
      setSessions((current) => (current ? current.filter((s) => s.id !== id) : current));
    } catch (err) {
      // Puede pasar si dos pestañas cierran la misma sesión casi a la vez
      // (404: ya no existe) — se recarga la lista para reflejar el estado real.
      setRevokeError(err instanceof ApiError ? err.message : 'No se ha podido cerrar esa sesión.');
      try {
        setSessions(await listSessions());
      } catch {
        // si tampoco se puede recargar, se deja la lista como estaba
      }
    } finally {
      setRevokingId(null);
    }
  }

  if (isAuthLoading) {
    return (
      <main>
        <p>Comprobando tu sesión…</p>
      </main>
    );
  }

  if (!isAuthenticated) {
    return (
      <main>
        <h1>Dispositivos y sesiones</h1>
        <p role="alert">Tienes que iniciar sesión para ver esto.</p>
        <p>
          <Link to="/login">Iniciar sesión</Link>
        </p>
      </main>
    );
  }

  return (
    <main>
      <h1>Dispositivos y sesiones</h1>
      <p>
        Estas son las sesiones activas de tu cuenta. Si no reconoces alguna, ciérrala: dejará de servir para acceder
        con ella de inmediato.
      </p>

      {loadError && <p role="alert">{loadError}</p>}
      {revokeError && <p role="alert">{revokeError}</p>}

      {sessions === null && !loadError && <p>Cargando sesiones…</p>}

      {sessions !== null && sessions.length === 0 && <p>No tienes ninguna sesión activa.</p>}

      {sessions !== null && sessions.length > 0 && (
        <ul>
          {sessions.map((session) => (
            <li key={session.id}>
              <span>{session.userAgent ?? 'Dispositivo desconocido'}</span>
              {session.ipAddress && <span> · {session.ipAddress}</span>}
              <span> · última actividad: {formatDateTime(session.lastUsedAt)}</span>
              {' · '}
              <button type="button" disabled={revokingId === session.id} onClick={() => void handleRevoke(session.id)}>
                {revokingId === session.id ? 'Cerrando…' : 'Cerrar sesión'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
