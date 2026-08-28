import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HomePage } from './HomePage';
import { AuthProvider } from '../auth/AuthContext';
import * as authApi from '../api/auth';
import * as usersApi from '../api/users';
import { ApiError } from '../api/client';

const PROFILE: usersApi.UserProfile = {
  id: 'user-1',
  email: 'ana@example.com',
  name: 'Ana',
  currency: 'EUR',
  locale: 'es',
  status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00.000Z',
  hasPassword: true,
};

describe('HomePage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Sin esto, AuthProvider intentaría un refresco silencioso real contra
    // la red al montar (tasks.md T3.5); aquí se simula "sin sesión previa".
    vi.spyOn(authApi, 'refresh').mockRejectedValue(new ApiError(401, 'No hay sesión.'));
  });

  function renderHome() {
    return render(
      <AuthProvider>
        <MemoryRouter>
          <HomePage />
        </MemoryRouter>
      </AuthProvider>,
    );
  }

  it('muestra el título de la aplicación y enlaces a crear cuenta e iniciar sesión sin sesión activa', async () => {
    renderHome();

    expect(screen.getByText('App de Gestión de Economía Personal')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Crear cuenta' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Iniciar sesión' })).toBeInTheDocument();
  });

  it('con sesión activa muestra el nombre del usuario y un botón de cerrar sesión', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    vi.spyOn(usersApi, 'getProfile').mockResolvedValue(PROFILE);

    renderHome();

    expect(await screen.findByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Iniciar sesión' })).not.toBeInTheDocument();
    // Coincidencia por regex, no por string exacto: el <p> intercala el
    // saludo con los <Link>/<button> y los separadores " · ", así que el
    // texto propio del nodo (lo único que compara `getByText` por defecto)
    // nunca es exactamente "Sesión iniciada como Ana." aunque lo parezca en
    // el volcado del DOM (mismo patrón que ya se usa en SessionsPage.test.tsx).
    expect(await screen.findByText(/Sesión iniciada como Ana\./)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('con la cuenta sin verificar, muestra un aviso persistente para reenviar el enlace (H2 criterio 3)', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    vi.spyOn(usersApi, 'getProfile').mockResolvedValue({ ...PROFILE, status: 'PENDING_VERIFICATION' });

    renderHome();

    expect(await screen.findByRole('alert')).toHaveTextContent(/no has verificado tu email/i);
    expect(screen.getByRole('link', { name: 'Reenviar el enlace' })).toBeInTheDocument();
  });
});
