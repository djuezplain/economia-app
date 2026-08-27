import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginPage } from './LoginPage';
import { AuthProvider } from '../auth/AuthContext';
import * as authApi from '../api/auth';
import { ApiError } from '../api/client';

describe('LoginPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // AuthProvider intenta un refresco silencioso al montar (tasks.md T3.5);
    // en estos tests se simula que no hay sesión previa, para aislar el
    // comportamiento del formulario de login en sí.
    vi.spyOn(authApi, 'refresh').mockRejectedValue(new ApiError(401, 'No hay sesión.'));
  });

  function renderPage() {
    return render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/login']}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<div>Página de inicio</div>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );
  }

  async function fillAndSubmit(email: string, password: string) {
    await userEvent.type(screen.getByLabelText('Email'), email);
    await userEvent.type(screen.getByLabelText('Contraseña'), password);
    await userEvent.click(screen.getByRole('button', { name: /iniciar sesión/i }));
  }

  it('con credenciales correctas inicia sesión y navega a la página de inicio', async () => {
    vi.spyOn(authApi, 'login').mockResolvedValue({
      accessToken: 'access-token-de-prueba',
      user: { id: '1', email: 'ana@example.com', name: 'Ana', status: 'ACTIVE' },
    });

    renderPage();
    await fillAndSubmit('ana@example.com', 'Contraseña-Segura-123');

    expect(await screen.findByText('Página de inicio')).toBeInTheDocument();
  });

  it('con credenciales incorrectas muestra el mensaje genérico del servidor y no navega', async () => {
    vi.spyOn(authApi, 'login').mockRejectedValue(new ApiError(401, 'Email o contraseña incorrectos.'));

    renderPage();
    await fillAndSubmit('ana@example.com', 'contraseña-mala');

    expect(await screen.findByRole('alert')).toHaveTextContent('Email o contraseña incorrectos.');
    expect(screen.queryByText('Página de inicio')).not.toBeInTheDocument();
  });

  it('mientras se envía el formulario deshabilita el botón', async () => {
    let resolveLogin!: (value: authApi.LoginResponse) => void;
    vi.spyOn(authApi, 'login').mockReturnValue(
      new Promise((resolve) => {
        resolveLogin = resolve;
      }),
    );

    renderPage();
    await fillAndSubmit('ana@example.com', 'Contraseña-Segura-123');

    expect(screen.getByRole('button', { name: /iniciando sesión/i })).toBeDisabled();

    resolveLogin({
      accessToken: 'access-token-de-prueba',
      user: { id: '1', email: 'ana@example.com', name: 'Ana', status: 'ACTIVE' },
    });

    await waitFor(() => {
      expect(screen.getByText('Página de inicio')).toBeInTheDocument();
    });
  });
});
