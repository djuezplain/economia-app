import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { verifyEmail } from '../api/auth';
import { ApiError } from '../api/client';

type Status = 'loading' | 'success' | 'error';

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState<Status>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('Falta el token de verificación en el enlace.');
      return;
    }

    let cancelled = false;
    verifyEmail(token)
      .then((res) => {
        if (cancelled) return;
        setStatus('success');
        setMessage(res.message);
      })
      .catch((err) => {
        if (cancelled) return;
        setStatus('error');
        setMessage(err instanceof ApiError ? err.message : 'No se ha podido verificar la cuenta.');
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  if (status === 'loading') {
    return (
      <main>
        <h1>Verificando tu cuenta…</h1>
      </main>
    );
  }

  if (status === 'success') {
    return (
      <main>
        <h1>Cuenta verificada</h1>
        <p>{message}</p>
        <p>
          <Link to="/">Ir al inicio</Link>
        </p>
      </main>
    );
  }

  return (
    <main>
      <h1>No se ha podido verificar</h1>
      <p role="alert">{message}</p>
      <p>
        ¿El enlace ha caducado o ya lo usaste?{' '}
        <Link to="/resend-verification">Pide uno nuevo</Link>.
      </p>
    </main>
  );
}
