import { useEffect, useRef, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';

/**
 * Aterrizaje de `GET /auth/google/callback` (H3): el backend redirige aquí
 * con el access token en la query string (no puede devolver JSON porque esta
 * navegación la hace el navegador de forma completa, no la SPA vía fetch).
 * En cuanto se lee el token se guarda en memoria y se navega a "/",
 * reemplazando esta entrada del historial para no dejar el token visible en
 * la barra de direcciones más tiempo del necesario.
 */
export function OAuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const { setSessionToken } = useAuth();
  const [status, setStatus] = useState<'processing' | 'done' | 'error'>('processing');
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const accessToken = searchParams.get('accessToken');
    if (!accessToken) {
      setStatus('error');
      return;
    }
    setSessionToken(accessToken);
    setStatus('done');
  }, [searchParams, setSessionToken]);

  if (status === 'error') {
    return (
      <main>
        <h1>No se ha podido iniciar sesión con Google</h1>
        <p role="alert">Vuelve a intentarlo desde la página de inicio de sesión.</p>
      </main>
    );
  }

  if (status === 'done') {
    return <Navigate to="/" replace />;
  }

  return (
    <main>
      <p>Iniciando sesión…</p>
    </main>
  );
}
