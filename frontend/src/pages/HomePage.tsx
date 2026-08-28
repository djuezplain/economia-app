import { Link } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';

export function HomePage() {
  const { user, isAuthenticated, isLoading, logout } = useAuth();

  return (
    <main>
      <h1>App de Gestión de Economía Personal</h1>
      <p>En construcción — spec 002: ingresos, gastos y dashboard mensual.</p>

      {isLoading && <p>Comprobando tu sesión…</p>}

      {!isLoading && isAuthenticated && (
        <>
          {user?.status === 'PENDING_VERIFICATION' && (
            // H2 (spec 001), criterio 3: no bloquea el acceso (se puede
            // iniciar sesión igualmente), pero avisa de forma persistente.
            // Desde spec 002 grupo 1 ya hay una ruta real de datos
            // económicos (categorías) protegida por `RequireActiveUserGuard`
            // — este aviso deja de ser solo informativo.
            <p role="alert">
              Todavía no has verificado tu email. <Link to="/resend-verification">Reenviar el enlace</Link>
            </p>
          )}
          <p>
            {user ? `Sesión iniciada como ${user.name}.` : 'Sesión iniciada.'}{' '}
            <Link to="/profile">Tu perfil</Link> · <Link to="/sessions">Dispositivos y sesiones</Link> ·{' '}
            <Link to="/categories">Categorías</Link> ·{' '}
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
