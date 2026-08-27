import { Link } from 'react-router-dom';

export function HomePage() {
  return (
    <main>
      <h1>App de Gestión de Economía Personal</h1>
      <p>En construcción — feature 001: autenticación.</p>
      <p>
        <Link to="/register">Crear cuenta</Link>
      </p>
    </main>
  );
}
