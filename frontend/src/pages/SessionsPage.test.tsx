import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionsPage } from './SessionsPage';
import { AuthProvider } from '../auth/AuthContext';
import * as authApi from '../api/auth';
import * as usersApi from '../api/users';
import * as sessionsApi from '../api/sessions';
import { ApiError } from '../api/client';

describe('SessionsPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // AuthProvider pide el perfil (GET /users/me) en cuanto sabe que hay
    // sesión (grupo 9: aviso persistente de email pendiente, H2 criterio 3);
    // esta página no usa ese perfil para nada, pero sin este mock por
    // defecto AuthProvider intentaría una llamada de red real en cada test
    // "con sesión activa".
    vi.spyOn(usersApi, 'getProfile').mockResolvedValue({
      id: 'user-1',
      email: 'ana@example.com',
      name: 'Ana',
      currency: 'EUR',
      locale: 'es',
      status: 'ACTIVE',
      createdAt: '2026-01-01T00:00:00.000Z',
      hasPassword: true, recurringReminderEmails: true, warrantyReminderEmails: true,
    });
  });

  function renderPage() {
    return render(
      <AuthProvider>
        <MemoryRouter>
          <SessionsPage />
        </MemoryRouter>
      </AuthProvider>,
    );
  }

  it('sin sesión activa, pide iniciar sesión y no llama a la API de sesiones', async () => {
    vi.spyOn(authApi, 'refresh').mockRejectedValue(new ApiError(401, 'No hay sesión.'));
    const listSpy = vi.spyOn(sessionsApi, 'listSessions');

    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('Tienes que iniciar sesión');
    expect(screen.getByRole('link', { name: 'Iniciar sesión' })).toBeInTheDocument();
    expect(listSpy).not.toHaveBeenCalled();
  });

  it('con sesión activa, lista los dispositivos con su última actividad', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    vi.spyOn(sessionsApi, 'listSessions').mockResolvedValue([
      {
        id: 'session-1',
        userAgent: 'Chrome en Windows',
        ipAddress: '203.0.113.5',
        createdAt: '2026-08-01T10:00:00.000Z',
        lastUsedAt: '2026-08-20T09:30:00.000Z',
        expiresAt: '2026-09-01T10:00:00.000Z',
      },
      {
        id: 'session-2',
        userAgent: null,
        ipAddress: null,
        createdAt: '2026-08-10T10:00:00.000Z',
        lastUsedAt: '2026-08-21T09:30:00.000Z',
        expiresAt: '2026-09-10T10:00:00.000Z',
      },
    ]);

    renderPage();

    expect(await screen.findByText(/Chrome en Windows/)).toBeInTheDocument();
    expect(screen.getByText(/Dispositivo desconocido/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /cerrar sesión/i })).toHaveLength(2);
  });

  it('sin sesiones activas, muestra un mensaje de lista vacía', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    vi.spyOn(sessionsApi, 'listSessions').mockResolvedValue([]);

    renderPage();

    expect(await screen.findByText('No tienes ninguna sesión activa.')).toBeInTheDocument();
  });

  it('al cerrar una sesión, llama a la API con su id y la quita de la lista', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    vi.spyOn(sessionsApi, 'listSessions').mockResolvedValue([
      {
        id: 'session-1',
        userAgent: 'Chrome en Windows',
        ipAddress: '203.0.113.5',
        createdAt: '2026-08-01T10:00:00.000Z',
        lastUsedAt: '2026-08-20T09:30:00.000Z',
        expiresAt: '2026-09-01T10:00:00.000Z',
      },
      {
        id: 'session-2',
        userAgent: 'Firefox en macOS',
        ipAddress: '203.0.113.9',
        createdAt: '2026-08-10T10:00:00.000Z',
        lastUsedAt: '2026-08-21T09:30:00.000Z',
        expiresAt: '2026-09-10T10:00:00.000Z',
      },
    ]);
    const revokeSpy = vi.spyOn(sessionsApi, 'revokeSession').mockResolvedValue(undefined);

    renderPage();

    await screen.findByText(/Chrome en Windows/);
    const [firstButton] = screen.getAllByRole('button', { name: /cerrar sesión/i });
    await userEvent.click(firstButton);

    await waitFor(() => expect(screen.queryByText(/Chrome en Windows/)).not.toBeInTheDocument());
    expect(revokeSpy).toHaveBeenCalledWith('session-1');
    expect(screen.getByText(/Firefox en macOS/)).toBeInTheDocument();
  });

  it('si falla el cierre de una sesión, muestra el error y recarga la lista', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    const listSpy = vi.spyOn(sessionsApi, 'listSessions').mockResolvedValue([
      {
        id: 'session-1',
        userAgent: 'Chrome en Windows',
        ipAddress: '203.0.113.5',
        createdAt: '2026-08-01T10:00:00.000Z',
        lastUsedAt: '2026-08-20T09:30:00.000Z',
        expiresAt: '2026-09-01T10:00:00.000Z',
      },
    ]);
    vi.spyOn(sessionsApi, 'revokeSession').mockRejectedValue(new ApiError(404, 'Sesión no encontrada.'));

    renderPage();

    await screen.findByText(/Chrome en Windows/);
    await userEvent.click(screen.getByRole('button', { name: /cerrar sesión/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Sesión no encontrada.');
    expect(listSpy).toHaveBeenCalledTimes(2); // carga inicial + recarga tras el fallo
  });
});
