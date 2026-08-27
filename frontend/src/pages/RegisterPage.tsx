import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { GOOGLE_LOGIN_URL, register } from '../api/auth';
import { ApiError } from '../api/client';
import { isStrongPassword, PASSWORD_POLICY_MESSAGE } from '../validators/password';

export function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    // Validación en cliente (spec 001, H1 criterio 3): el servidor la repite
    // igualmente, esto es solo para dar feedback inmediato al usuario.
    if (!isStrongPassword(password)) {
      setPasswordError(PASSWORD_POLICY_MESSAGE);
      return;
    }
    setPasswordError(null);

    setIsSubmitting(true);
    try {
      await register({ email, password, name });
      setSubmitted(true);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'No se ha podido completar el registro.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <main>
        <h1>Revisa tu correo</h1>
        <p>
          Si los datos son correctos, te hemos enviado un email para confirmar tu cuenta. El
          enlace caduca en 24 horas.
        </p>
        <p>
          ¿No te ha llegado? <Link to="/resend-verification">Reenviar enlace</Link>.
        </p>
      </main>
    );
  }

  return (
    <main>
      <h1>Crear cuenta</h1>
      <form onSubmit={handleSubmit} noValidate>
        <div>
          <label htmlFor="name">Nombre</label>
          <input
            id="name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

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
            onChange={(e) => {
              setPassword(e.target.value);
              if (passwordError) setPasswordError(null);
            }}
            aria-describedby="password-help"
          />
          <p id="password-help">{PASSWORD_POLICY_MESSAGE}</p>
          {passwordError && <p role="alert">{passwordError}</p>}
        </div>

        {formError && <p role="alert">{formError}</p>}

        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Creando cuenta…' : 'Crear cuenta'}
        </button>
      </form>

      {/* Enlace normal, no un manejador de JS: es una navegación completa del
          navegador hacia el backend, que a su vez redirige a Google (H3).
          Con Google, la cuenta se crea (o se vincula a una existente) sin
          pasar por este formulario ni por la verificación de email. */}
      <p>
        <a href={GOOGLE_LOGIN_URL}>Continuar con Google</a>
      </p>
    </main>
  );
}
