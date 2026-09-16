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
import * as receiptImportApi from '../api/receipt-import';
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
    vi.spyOn(groceriesApi, 'listSupermarkets').mockResolvedValue([{ id: 's1', name: 'Mercadona' }]);
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

  describe('Crear producto (spec 041, H1)', () => {
    it('crea un producto solo con el nombre, sin precio', async () => {
      vi.spyOn(groceriesApi, 'searchProducts').mockResolvedValue(PRODUCTS);
      vi.spyOn(groceriesApi, 'createProduct').mockResolvedValue({ id: 'p3', name: 'Arroz' });
      const confirmSpy = vi.spyOn(receiptImportApi, 'confirmReceiptImport');

      renderPage();
      await screen.findByRole('link', { name: 'Chocolate Classic' });

      await userEvent.type(screen.getByLabelText('Nombre'), 'Arroz');
      await userEvent.click(screen.getByRole('button', { name: 'Crear producto' }));

      expect(groceriesApi.createProduct).toHaveBeenCalledWith('Arroz');
      expect(confirmSpy).not.toHaveBeenCalled();
      expect(await screen.findByRole('link', { name: 'Arroz' })).toHaveAttribute('href', '/tickets/productos/p3');
    });

    it('crea un producto con precio inicial completo, como ticket sintético', async () => {
      vi.spyOn(groceriesApi, 'searchProducts').mockResolvedValue(PRODUCTS);
      vi.spyOn(groceriesApi, 'createProduct').mockResolvedValue({ id: 'p3', name: 'Arroz' });
      vi.spyOn(receiptImportApi, 'confirmReceiptImport').mockResolvedValue({ receiptId: 'r1' });

      renderPage();
      await screen.findByRole('link', { name: 'Chocolate Classic' });

      await userEvent.type(screen.getByLabelText('Nombre'), 'Arroz');
      await userEvent.selectOptions(screen.getByLabelText('Supermercado'), 's1');
      await userEvent.type(screen.getByLabelText('Fecha'), '2026-01-15');
      await userEvent.selectOptions(screen.getByLabelText('Unidad'), 'kg');
      await userEvent.type(screen.getByLabelText('Precio por unidad'), '2.50');
      await userEvent.click(screen.getByRole('button', { name: 'Crear producto' }));

      await screen.findByRole('link', { name: 'Arroz' });
      expect(receiptImportApi.confirmReceiptImport).toHaveBeenCalledWith({
        supermarket: { id: 's1' },
        date: '2026-01-15',
        lines: [{ description: 'Arroz', quantity: '1', unit: 'kg', pricePerUnit: '2.5', amount: '2.5', product: { id: 'p3' } }],
      });
    });

    it('nombre duplicado muestra el aviso y no llama a confirmReceiptImport', async () => {
      vi.spyOn(groceriesApi, 'searchProducts').mockResolvedValue(PRODUCTS);
      vi.spyOn(groceriesApi, 'createProduct').mockRejectedValue(new ApiError(409, 'Ya tienes un producto con ese nombre.'));
      const confirmSpy = vi.spyOn(receiptImportApi, 'confirmReceiptImport');

      renderPage();
      await screen.findByRole('link', { name: 'Chocolate Classic' });

      await userEvent.type(screen.getByLabelText('Nombre'), 'Leche');
      await userEvent.click(screen.getByRole('button', { name: 'Crear producto' }));

      expect(await screen.findByText('Ya tienes un producto con ese nombre.')).toBeInTheDocument();
      expect(confirmSpy).not.toHaveBeenCalled();
    });

    it('si falla el precio inicial, el producto igualmente queda creado y se avisa por separado', async () => {
      vi.spyOn(groceriesApi, 'searchProducts').mockResolvedValue(PRODUCTS);
      vi.spyOn(groceriesApi, 'createProduct').mockResolvedValue({ id: 'p3', name: 'Arroz' });
      vi.spyOn(receiptImportApi, 'confirmReceiptImport').mockRejectedValue(new ApiError(400, 'Datos de precio inválidos.'));

      renderPage();
      await screen.findByRole('link', { name: 'Chocolate Classic' });

      await userEvent.type(screen.getByLabelText('Nombre'), 'Arroz');
      await userEvent.selectOptions(screen.getByLabelText('Supermercado'), 's1');
      await userEvent.type(screen.getByLabelText('Fecha'), '2026-01-15');
      await userEvent.type(screen.getByLabelText('Precio por unidad'), '2.50');
      await userEvent.click(screen.getByRole('button', { name: 'Crear producto' }));

      expect(await screen.findByRole('link', { name: 'Arroz' })).toBeInTheDocument();
      expect(await screen.findByText(/se ha creado, pero no se ha podido guardar el precio inicial/)).toBeInTheDocument();
    });

    it('precio a medio rellenar bloquea el envío con un aviso, sin crear el producto', async () => {
      vi.spyOn(groceriesApi, 'searchProducts').mockResolvedValue(PRODUCTS);
      const createSpy = vi.spyOn(groceriesApi, 'createProduct');

      renderPage();
      await screen.findByRole('link', { name: 'Chocolate Classic' });

      await userEvent.type(screen.getByLabelText('Nombre'), 'Arroz');
      await userEvent.type(screen.getByLabelText('Fecha'), '2026-01-15');
      await userEvent.click(screen.getByRole('button', { name: 'Crear producto' }));

      expect(
        await screen.findByText('Para añadir un precio inicial, completa el supermercado, la fecha y el precio — o déjalos los tres vacíos.'),
      ).toBeInTheDocument();
      expect(createSpy).not.toHaveBeenCalled();
    });
  });

  describe('Precio más bajo reciente (spec 042, H1)', () => {
    it('muestra el precio y el supermercado cuando hay datos', async () => {
      vi.spyOn(groceriesApi, 'searchProducts').mockResolvedValue([
        { id: 'p1', name: 'Chocolate Classic', lowestRecentPrice: { pricePerUnit: '1.100', unit: 'unidad', supermarketId: 's1', supermarketName: 'Mercadona' } },
      ]);

      renderPage();

      expect(await screen.findByText('1.100 € (Mercadona)')).toBeInTheDocument();
    });

    it('sin datos de precio, muestra "—"', async () => {
      vi.spyOn(groceriesApi, 'searchProducts').mockResolvedValue([{ id: 'p1', name: 'Chocolate Classic', lowestRecentPrice: null }]);

      renderPage();

      await screen.findByRole('link', { name: 'Chocolate Classic' });
      expect(screen.getByText('—')).toBeInTheDocument();
    });
  });
});
