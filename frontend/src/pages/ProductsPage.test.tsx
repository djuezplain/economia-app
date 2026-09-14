import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductsPage } from './ProductsPage';
import { AuthProvider } from '../auth/AuthContext';
import * as authApi from '../api/auth';
import * as usersApi from '../api/users';
import * as groceriesApi from '../api/groceries';
import type { Product } from '../api/groceries';
import { ApiError } from '../api/client';

const PROFILE: usersApi.UserProfile = {
  id: 'user-1',
  email: 'diego@example.com',
  name: 'Diego',
  currency: 'EUR',
  locale: 'es',
  status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00.000Z',
  hasPassword: true,
};

const PRODUCTS: Product[] = [
  { id: 'p1', name: 'Chocolate Classic' },
  { id: 'p2', name: 'Leche' },
];

describe('ProductsPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    vi.spyOn(usersApi, 'getProfile').mockResolvedValue(PROFILE);
  });

  function renderPage() {
    return render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/tickets/productos']}>
          <ProductsPage />
        </MemoryRouter>
      </AuthProvider>,
    );
  }

  it('lista todos los productos al cargar, cada uno con enlace a su detalle', async () => {
    vi.spyOn(groceriesApi, 'searchProducts').mockResolvedValue(PRODUCTS);

    renderPage();

    expect(await screen.findByRole('link', { name: 'Chocolate Classic' })).toHaveAttribute('href', '/tickets/productos/p1');
    expect(screen.getByRole('link', { name: 'Leche' })).toHaveAttribute('href', '/tickets/productos/p2');
  });

  it('buscar filtra la lista', async () => {
    const searchSpy = vi.spyOn(groceriesApi, 'searchProducts').mockResolvedValueOnce(PRODUCTS).mockResolvedValueOnce([PRODUCTS[0]]);

    renderPage();
    await screen.findByRole('link', { name: 'Chocolate Classic' });

    await userEvent.type(screen.getByLabelText('Buscar'), 'choco');
    await userEvent.click(screen.getByRole('button', { name: 'Buscar' }));

    expect(searchSpy).toHaveBeenLastCalledWith('choco');
    expect(await screen.findByRole('link', { name: 'Chocolate Classic' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Leche' })).not.toBeInTheDocument();
  });

  it('sin coincidencias muestra un mensaje claro', async () => {
    vi.spyOn(groceriesApi, 'searchProducts').mockResolvedValue([]);

    renderPage();

    expect(await screen.findByText('No se ha encontrado ningún producto con ese nombre.')).toBeInTheDocument();
  });

  describe('fusionar productos (spec 038, H1)', () => {
    it('marcar dos productos permite elegir cuál se mantiene y fusionarlos', async () => {
      vi.spyOn(groceriesApi, 'searchProducts').mockResolvedValueOnce(PRODUCTS).mockResolvedValueOnce([PRODUCTS[0]]);
      const mergeSpy = vi.spyOn(groceriesApi, 'mergeProducts').mockResolvedValue(PRODUCTS[0]);

      renderPage();
      await screen.findByRole('link', { name: 'Chocolate Classic' });

      for (const checkbox of screen.getAllByRole('checkbox')) await userEvent.click(checkbox);

      expect(await screen.findByRole('heading', { name: 'Fusionar 2 productos' })).toBeInTheDocument();
      await userEvent.click(screen.getByRole('radio', { name: 'Mantener «Chocolate Classic»' }));
      await userEvent.click(screen.getByRole('button', { name: 'Fusionar' }));

      expect(mergeSpy).toHaveBeenCalledWith('p1', ['p2']);
      expect(screen.queryByRole('heading', { name: /Fusionar/ })).not.toBeInTheDocument();
    });

    it('un solo producto marcado no muestra la opción de fusionar', async () => {
      vi.spyOn(groceriesApi, 'searchProducts').mockResolvedValue(PRODUCTS);

      renderPage();
      await screen.findByRole('link', { name: 'Chocolate Classic' });

      await userEvent.click(screen.getAllByRole('checkbox')[0]);

      expect(screen.queryByRole('heading', { name: /Fusionar/ })).not.toBeInTheDocument();
    });

    it('un error al fusionar se muestra sin perder la selección', async () => {
      vi.spyOn(groceriesApi, 'searchProducts').mockResolvedValue(PRODUCTS);
      vi.spyOn(groceriesApi, 'mergeProducts').mockRejectedValue(new ApiError(400, 'No hay ningún producto que fusionar.'));

      renderPage();
      await screen.findByRole('link', { name: 'Chocolate Classic' });

      for (const checkbox of screen.getAllByRole('checkbox')) await userEvent.click(checkbox);
      await userEvent.click(screen.getByRole('button', { name: 'Fusionar' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('No hay ningún producto que fusionar.');
      expect(screen.getByRole('heading', { name: 'Fusionar 2 productos' })).toBeInTheDocument();
    });
  });
});
