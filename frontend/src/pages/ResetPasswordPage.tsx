import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { resetPassword } from '../api/auth';
import { ApiError } from '../api/client';
import { isStrongPassword, PASSWORD_POLICY_MESSAGE } from '../validators/password';

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (!token) return; // no debería poder llegar aquí (ver comprobación de abajo)

    // Validación en cliente, igual que en el registro (spec 001 H1 criterio 3
    // reutilizado aquí): el servidor la repite igualmente.
    if (!isStrongPassword(password)) {
      setPasswordError(PASSWORD_POLICY_MESSAGE);
      return;
    }
    setPasswordError(null);

    setIsSubmitting(true);
    try {
      await resetPassword({ token, password });
      setSubmitted(true);
    } catch (err) {
      // H5: aquí sí se muestra el motivo real (enlace inválido / caducado /
      // ya usado) — no hay riesgo de enumeración porque el token es un
      // secreto de alta entropía, no un dato adivinable.
      setFormError(err instanceof ApiError ? err.message : 'No se ha podido restablecer la contraseña.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!token) {
    return (
      <main>
        <h1>Enlace incompleto</h1>
        <p role="alert">Falta el token de restablecimiento en el enlace.</p>
        <p>
          <Link to="/forgot-password">Solicitar un enlace nuevo</Link>
        </p>
      </main>
    );
  }

  if (submitted) {
    return (
      <main>
        <h1>Contraseña restablecida</h1>
        <p>Ya puedes iniciar sesión con tu nueva contraseña.</p>
        <p>
          <Link to="/login">Iniciar sesión</Link>
        </p>
      </main>
    );
  }

  return (
    <main>
      <h1>Restablecer contraseña</h1>
      <form onSubmit={handleSubmit} noValidate>
        <div>
          <label htmlFor="password">Nueva contraseña</label>
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

        {formError && (
          <p role="alert">
            {formError}{' '}
            {/* Un enlace caducado o ya usado no se arregla reintentando el mismo formulario. */}
            <Link to="/forgot-password">Pide uno nuevo</Link>.
          </p>
        )}

        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Restableciendo…' : 'Restablecer contraseña'}
        </button>
      </form>
    </main>
  );
}
