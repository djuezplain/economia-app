import { Link } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';

export function HomePage() {
  const { user, isAuthenticated, isLoading, logout } = useAuth();

  return (
    <main>
      <h1>App de Gestión de Economía Personal</h1>
      <p>En construcción — feature 001: autenticación.</p>

      {isLoading && <p>Comprobando tu sesión…</p>}

      {!isLoading && isAuthenticated && (
        <>
          {user?.status === 'PENDING_VERIFICATION' && (
            // H2 (spec 001), criterio 3: no bloquea el acceso (se puede
            // iniciar sesión igualmente), pero avisa de forma persistente —
            // esta app todavía no tiene datos económicos que bloquear
            // (specs 002+), así que el "no puedes crear ni ver datos
            // económicos" del criterio no tiene todavía dónde aplicarse en
            // la UI; el guard del backend (RequireActiveUserGuard) ya está
            // listo para cuando existan esas rutas.
            <p role="alert">
              Todavía no has verificado tu email. <Link to="/resend-verification">Reenviar el enlace</Link>
            </p>
          )}
          <p>
            {user ? `Sesión iniciada como ${user.name}.` : 'Sesión iniciada.'}{' '}
            <Link to="/profile">Tu perfil</Link> · <Link to="/sessions">Dispositivos y sesiones</Link> ·{' '}
            <button type="button" onClick={() => void logout()}>
              Cerrar sesión
            </button>
          </p>
        </>
      )}

      {!isLoading && !isAuthenticated && (
        <p>
          <Link to="/register">Crear cuenta</Link> · <Link to="/login">Iniciar sesión</Link>
        </p>
      )}
    </main>
  );
}
