import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HomePage } from './HomePage';
import { AuthProvider } from '../auth/AuthContext';
import * as authApi from '../api/auth';
import { ApiError } from '../api/client';

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

    renderHome();

    expect(await screen.findByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Iniciar sesión' })).not.toBeInTheDocument();
  });
});
