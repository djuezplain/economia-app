import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginPage } from './LoginPage';
import { AuthProvider } from '../auth/AuthContext';
import * as authApi from '../api/auth';
import { api, ApiError } from '../api/client';
import { enqueue, ensureUserScope, getQueue, putTransaction } from '../offline/db';
import { resetForTests } from '../offline/connectivity';

describe('LoginPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetForTests(true);
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

  it('tras iniciar sesión, reintenta los cambios pendientes bloqueados por sesión caducada (T5.3/H5 criterio 5, spec 011)', async () => {
    await ensureUserScope('1');
    await putTransaction({
      id: 'tx-1',
      userId: '1',
      type: 'EXPENSE',
      date: '2026-08-01',
      categoryId: 'cat-1',
      subcategoryId: null,
      concept: 'Café',
      merchant: null,
      amount: '3.50',
      paymentMethod: null,
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
      pending: true,
      pendingAction: 'CREATE',
    });
    await enqueue({
      entity: 'transaction',
      action: 'CREATE',
      transactionId: 'tx-1',
      payload: { id: 'tx-1', type: 'EXPENSE', date: '2026-08-01', categoryId: 'cat-1', concept: 'Café', amount: '3.50' },
      createdAt: '2026-08-01T00:00:00.000Z',
      status: 'failed',
      failureReason: 'La sesión ha caducado. Inicia sesión de nuevo para sincronizar este cambio.',
      failureKind: 'session_expired',
    });

    vi.spyOn(authApi, 'login').mockResolvedValue({
      accessToken: 'access-token-de-prueba',
      user: { id: '1', email: 'ana@example.com', name: 'Ana', status: 'ACTIVE' },
    });
    vi.spyOn(api, 'post').mockResolvedValue({
      id: 'tx-1',
      userId: '1',
      type: 'EXPENSE',
      date: '2026-08-01',
      categoryId: 'cat-1',
      subcategoryId: null,
      concept: 'Café',
      merchant: null,
      amount: '3.50',
      paymentMethod: null,
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    });

    renderPage();
    await fillAndSubmit('ana@example.com', 'Contraseña-Segura-123');
    await screen.findByText('Página de inicio');

    await waitFor(async () => expect(await getQueue()).toEqual([]));
  });

  it('sin conexión (T6.3, spec 011), avisa antes de intentar el envío, sin llamar a la API', async () => {
    resetForTests(false);
    const loginSpy = vi.spyOn(authApi, 'login');

    renderPage();
    await fillAndSubmit('ana@example.com', 'Contraseña-Segura-123');

    expect(await screen.findByRole('alert')).toHaveTextContent('No hay conexión. Vuelve a conectarte para iniciar sesión.');
    expect(loginSpy).not.toHaveBeenCalled();
  });
});
