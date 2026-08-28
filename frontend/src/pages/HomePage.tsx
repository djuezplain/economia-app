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
        <p>
          {user ? `Sesión iniciada como ${user.name}.` : 'Sesión iniciada.'}{' '}
          <Link to="/sessions">Dispositivos y sesiones</Link> ·{' '}
          <button type="button" onClick={() => void logout()}>
            Cerrar sesión
          </button>
        </p>
      )}

      {!isLoading && !isAuthenticated && (
        <p>
          <Link to="/register">Crear cuenta</Link> · <Link to="/login">Iniciar sesión</Link>
        </p>
      )}
    </main>
  );
}
