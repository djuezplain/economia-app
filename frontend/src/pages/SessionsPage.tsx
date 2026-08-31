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
        // Spec 010 (rediseño editorial), plan.md §4.8: cada sesión pasa de
        // `<li>` suelto a `.card.card-row` (mismo patrón que Movimientos,
        // T5) — 2 <div> (datos del dispositivo / acción), que ya venían de
        // spec 009 §3.4 para apilarse en móvil, ahora sobre la nueva
        // estructura. Sin etiqueta "Esta sesión": `constitution.md` (T6.2,
        // spec 001) documenta que `isCurrent` no puede identificarse de
        // forma fiable en un navegador real (la cookie de refresh tiene
        // `path: '/auth'`) — sigue vigente (no hay `isCurrent` en
        // `api/sessions.ts` ni en el backend), así que el handoff no se
        // implementa en este punto para no inventar un dato que la app no
        // puede calcular.
        <ul id="sessions-list">
          {sessions.map((session) => (
            <li className="card card-row" key={session.id}>
              <div>
                <strong>{session.userAgent ?? 'Dispositivo desconocido'}</strong>
                <p className="card-meta">
                  {[session.ipAddress, `última actividad: ${formatDateTime(session.lastUsedAt)}`]
                    .filter((part): part is string => Boolean(part))
                    .map((part, i) => (
                      <span key={`${i}-${part}`}>
                        {i > 0 && ' · '}
                        {part}
                      </span>
                    ))}
                </p>
              </div>
              <div>
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={revokingId === session.id}
                  onClick={() => void handleRevoke(session.id)}
                >
                  {revokingId === session.id ? 'Cerrando…' : 'Cerrar sesión'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
