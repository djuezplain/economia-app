import { FormEvent, useState } from 'react';
import { resendVerification } from '../api/auth';

export function ResendVerificationPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      await resendVerification(email);
    } catch {
      // Se muestra el mismo mensaje haya ido bien o mal la llamada: el backend
      // ya responde siempre igual (spec 001 H2) para no filtrar si el email
      // existe o ya está verificado; un error de red real es indistinguible
      // para el usuario de "no había cuenta que verificar", y así se queda.
    } finally {
      setIsSubmitting(false);
      setSubmitted(true);
    }
  }

  if (submitted) {
    return (
      <main>
        <h1>Revisa tu correo</h1>
        <p>Si la cuenta existe y no está verificada, te hemos enviado un nuevo enlace.</p>
      </main>
    );
  }

  return (
    <main>
      <h1>Reenviar email de verificación</h1>
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
          {isSubmitting ? 'Enviando…' : 'Reenviar enlace'}
        </button>
      </form>
    </main>
  );
}
