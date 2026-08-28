import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppLayout } from './AppLayout';
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

describe('AppLayout', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Mismo motivo que en HomePage.test.tsx: sin esto, AuthProvider
    // intentaría un refresco silencioso real contra la red al montar.
    vi.spyOn(authApi, 'refresh').mockRejectedValue(new ApiError(401, 'No hay sesión.'));
  });

  function renderLayout(initialEntry = '/') {
    return render(
      <AuthProvider>
        <MemoryRouter initialEntries={[initialEntry]}>
          <Routes>
            <Route element={<AppLayout />}>
              <Route
                path="/"
                element={
                  <>
                    <h1>Contenido de inicio</h1>
                    {/* Navegación ajena al menú lateral, para poder probar
                        que `AppLayout` no se desmonta al cambiar de ruta
                        aunque el clic no venga de sus propios enlaces. */}
                    <Link to="/categories">Ir a categorías (test)</Link>
                  </>
                }
              />
              <Route path="/categories" element={<h1>Contenido de categorías</h1>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );
  }

  function mockLoggedIn() {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    vi.spyOn(usersApi, 'getProfile').mockResolvedValue(PROFILE);
  }

  it('sin sesión no muestra el menú lateral', async () => {
    renderLayout();

    expect(await screen.findByText('Contenido de inicio')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Navegación principal' })).not.toBeInTheDocument();
  });

  it('mientras se comprueba la sesión, no muestra el menú lateral (evita parpadeo, H1 criterio 4)', () => {
    // Con sesión real pendiente de confirmar (el refresco silencioso de
    // AuthProvider todavía no se ha resuelto): `isLoading` sigue siendo
    // `true` justo tras montar, aunque acabará habiendo sesión — el menú no
    // debe aparecer y desaparecer de golpe (`showSidebar` exige
    // `!isLoading`, no solo `isAuthenticated`).
    mockLoggedIn();
    renderLayout();

    expect(screen.queryByRole('navigation', { name: 'Navegación principal' })).not.toBeInTheDocument();
  });

  it('con sesión muestra los 8 enlaces y el botón de cerrar sesión', async () => {
    mockLoggedIn();
    renderLayout();

    const nav = await screen.findByRole('navigation', { name: 'Navegación principal' });
    for (const name of [
      'Inicio',
      'Categorías',
      'Ingresos y gastos',
      'Dashboard',
      'Importar Excel',
      'Objetivos y presupuestos',
      'Tu perfil',
      'Dispositivos y sesiones',
    ]) {
      expect(screen.getByRole('link', { name })).toBeInTheDocument();
    }
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument();
  });

  it('marca como activo solo el enlace de la ruta actual, incluido "Inicio" solo en la home', async () => {
    mockLoggedIn();
    renderLayout('/categories');

    await screen.findByText('Contenido de categorías');
    expect(screen.getByRole('link', { name: 'Categorías' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Inicio' })).not.toHaveAttribute('aria-current');
  });

  it('el botón de plegar oculta los enlaces y el de cerrar sesión, y se puede desplegar de nuevo', async () => {
    mockLoggedIn();
    const user = userEvent.setup();
    renderLayout();

    await screen.findByRole('link', { name: 'Inicio' });
    await user.click(screen.getByRole('button', { name: 'Ocultar menú' }));

    expect(screen.queryByRole('link', { name: 'Inicio' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cerrar sesión' })).not.toBeInTheDocument();

    const toggle = screen.getByRole('button', { name: 'Mostrar menú' });
    await user.click(toggle);

    expect(await screen.findByRole('link', { name: 'Inicio' })).toBeInTheDocument();
  });

  it('conserva el estado plegado al navegar entre rutas hijas (AppLayout no se desmonta)', async () => {
    mockLoggedIn();
    const user = userEvent.setup();
    renderLayout();

    await screen.findByRole('link', { name: 'Inicio' });
    await user.click(screen.getByRole('button', { name: 'Ocultar menú' }));
    expect(screen.getByRole('button', { name: 'Mostrar menú' })).toBeInTheDocument();

    // Navega con un enlace ajeno al menú lateral (que está oculto mientras
    // el menú está plegado) — si `AppLayout` se desmontara al cambiar de
    // ruta, volvería a su estado por defecto (desplegado).
    await user.click(screen.getByRole('link', { name: 'Ir a categorías (test)' }));

    expect(await screen.findByText('Contenido de categorías')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mostrar menú' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Categorías' })).not.toBeInTheDocument();
  });

  it('pulsar "Cerrar sesión" llama a logout', async () => {
    mockLoggedIn();
    vi.spyOn(authApi, 'logout').mockResolvedValue({ message: 'Sesión cerrada.' });
    const user = userEvent.setup();
    renderLayout();

    await user.click(await screen.findByRole('button', { name: 'Cerrar sesión' }));

    await waitFor(() => expect(authApi.logout).toHaveBeenCalled());
  });
});
