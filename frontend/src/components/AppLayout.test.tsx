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

  it('con sesión muestra la marca "Ledger", plegado o no (H4, spec 008)', async () => {
    mockLoggedIn();
    const user = userEvent.setup();
    renderLayout();

    await screen.findByRole('link', { name: 'Inicio' });
    expect(screen.getByText('Ledger')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Ocultar menú' }));

    expect(screen.getByText('Ledger')).toBeInTheDocument();
  });

  it('con sesión muestra los 8 enlaces y el botón de cerrar sesión, cada uno con su punto de color (H5, spec 008)', async () => {
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
      const link = screen.getByRole('link', { name });
      expect(link).toBeInTheDocument();
      expect(link.querySelector('.dot')).toBeInTheDocument();
    }
    expect(nav).toBeInTheDocument();
    const logoutButton = screen.getByRole('button', { name: 'Cerrar sesión' });
    expect(logoutButton).toBeInTheDocument();
    expect(logoutButton.querySelector('.dot')).toBeInTheDocument();
  });

  it('marca como activo solo el enlace de la ruta actual, incluido "Inicio" solo en la home', async () => {
    mockLoggedIn();
    renderLayout('/categories');

    await screen.findByText('Contenido de categorías');
    expect(screen.getByRole('link', { name: 'Categorías' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Inicio' })).not.toHaveAttribute('aria-current');
  });

  it('el botón de plegar oculta el texto de los enlaces y del botón de cerrar sesión, que siguen siendo accesibles por su punto de color (H5 criterio 2, spec 008), y se puede desplegar de nuevo', async () => {
    mockLoggedIn();
    const user = userEvent.setup();
    renderLayout();

    const inicioLink = await screen.findByRole('link', { name: 'Inicio' });
    // Antes de plegar: sin `aria-label` (el nombre accesible viene del
    // texto visible) y sin la clase `sr-only` en el texto.
    expect(inicioLink).not.toHaveAttribute('aria-label');
    expect(inicioLink.querySelector('span:not(.dot)')).not.toHaveClass('sr-only');

    await user.click(screen.getByRole('button', { name: 'Ocultar menú' }));

    // Plegado: el enlace sigue siendo accesible por el mismo nombre (ahora
    // vía `aria-label`), pero su texto visible queda oculto (`sr-only`) —
    // ya no desaparece del todo, a diferencia del comportamiento anterior
    // de spec 005.
    const collapsedInicioLink = screen.getByRole('link', { name: 'Inicio' });
    expect(collapsedInicioLink.querySelector('span:not(.dot)')).toHaveClass('sr-only');
    expect(collapsedInicioLink.querySelector('.dot')).toBeInTheDocument();

    const logoutButton = screen.getByRole('button', { name: 'Cerrar sesión' });
    expect(logoutButton.querySelector('span:not(.dot)')).toHaveClass('sr-only');
    expect(logoutButton.querySelector('.dot')).toBeInTheDocument();

    const toggle = screen.getByRole('button', { name: 'Mostrar menú' });
    await user.click(toggle);

    const expandedInicioLink = await screen.findByRole('link', { name: 'Inicio' });
    expect(expandedInicioLink).not.toHaveAttribute('aria-label');
    expect(expandedInicioLink.querySelector('span:not(.dot)')).not.toHaveClass('sr-only');
  });

  it('conserva el estado plegado al navegar entre rutas hijas (AppLayout no se desmonta)', async () => {
    mockLoggedIn();
    const user = userEvent.setup();
    renderLayout();

    await screen.findByRole('link', { name: 'Inicio' });
    await user.click(screen.getByRole('button', { name: 'Ocultar menú' }));
    expect(screen.getByRole('button', { name: 'Mostrar menú' })).toBeInTheDocument();

    // Navega con un enlace ajeno al menú lateral — si `AppLayout` se
    // desmontara al cambiar de ruta, volvería a su estado por defecto
    // (desplegado, con el texto de "Categorías" visible de nuevo).
    await user.click(screen.getByRole('link', { name: 'Ir a categorías (test)' }));

    expect(await screen.findByText('Contenido de categorías')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mostrar menú' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Categorías' }).querySelector('span:not(.dot)')).toHaveClass('sr-only');
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
