import { useState } from 'react';
import type { FormEvent } from 'react';
import { forgotPassword } from '../api/auth';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      await forgotPassword(email);
    } catch {
      // Igual que en ResendVerificationPage: el backend responde siempre
      // igual (spec 001 H5 criterio 1) exista o no la cuenta, así que un
      // error de red real es indistinguible para el usuario de "no había
      // cuenta que recuperar" — se muestra el mismo mensaje en ambos casos.
    } finally {
      setIsSubmitting(false);
      setSubmitted(true);
    }
  }

  if (submitted) {
    return (
      <main>
        <h1>Revisa tu correo</h1>
        <p>
          Si la cuenta existe, te hemos enviado un enlace para restablecer tu contraseña. El
          enlace caduca en 1 hora.
        </p>
      </main>
    );
  }

  return (
    <main>
      <h1>¿Olvidaste tu contraseña?</h1>
      <p>Te enviaremos un enlace para restablecerla.</p>
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
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Enviando…' : 'Enviar enlace'}
        </button>
      </form>
    </main>
  );
}
