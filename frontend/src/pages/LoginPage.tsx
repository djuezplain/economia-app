import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { ApiError } from '../api/client';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setIsSubmitting(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      // H4 criterio 2: el backend ya responde con un mensaje genérico que no
      // filtra si el email existe o si la cuenta está bloqueada — aquí solo
      // se muestra tal cual.
      setFormError(err instanceof ApiError ? err.message : 'No se ha podido iniciar sesión.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main>
      <h1>Iniciar sesión</h1>
      <form onSubmit={handleSubmit} noValidate>
        <div>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="password">Contraseña</label>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {formError && <p role="alert">{formError}</p>}

        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Iniciando sesión…' : 'Iniciar sesión'}
        </button>
      </form>
      <p>
        ¿No tienes cuenta? <Link to="/register">Crear cuenta</Link>
      </p>
    </main>
  );
}
