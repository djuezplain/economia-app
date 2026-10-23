import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OAuthCallbackPage } from './OAuthCallbackPage';
import { AuthProvider } from '../auth/AuthContext';
import * as authApi from '../api/auth';
import * as usersApi from '../api/users';
import { ApiError } from '../api/client';

describe('OAuthCallbackPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // AuthProvider intenta un refresco silencioso al montar; se simula "sin
    // sesión previa" para aislar el comportamiento propio de esta página.
    vi.spyOn(authApi, 'refresh').mockRejectedValue(new ApiError(401, 'No hay sesión.'));
    // `setSessionToken` (lo que dispara esta página al recibir el token de
    // Google) pide el perfil de fondo (grupo 9: aviso de email pendiente,
    // H2 criterio 3) — se mockea para que no intente una llamada de red real.
    vi.spyOn(usersApi, 'getProfile').mockResolvedValue({
      id: 'user-1',
      email: 'google-user@example.com',
      name: 'Usuario de Google',
      currency: 'EUR',
      locale: 'es',
      status: 'ACTIVE',
      createdAt: '2026-01-01T00:00:00.000Z',
      hasPassword: false, recurringReminderEmails: true,
    });
  });

  function renderAt(path: string) {
    return render(
      <AuthProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/oauth-callback" element={<OAuthCallbackPage />} />
            <Route path="/" element={<div>Página de inicio</div>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );
  }

  it('con un accessToken válido en la URL, guarda la sesión y navega a la página de inicio', async () => {
    renderAt('/oauth-callback?accessToken=token-de-google-de-prueba');

    expect(await screen.findByText('Página de inicio')).toBeInTheDocument();
  });

  it('sin accessToken en la URL, muestra un error y no navega', async () => {
    renderAt('/oauth-callback');

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText('Página de inicio')).not.toBeInTheDocument();
  });
});
