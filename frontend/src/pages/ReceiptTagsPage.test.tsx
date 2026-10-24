import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReceiptTagsPage } from './ReceiptTagsPage';
import { AuthProvider } from '../auth/AuthContext';
import * as authApi from '../api/auth';
import * as usersApi from '../api/users';
import * as tagsApi from '../api/receipt-tags';
import { ApiError } from '../api/client';

const PROFILE: usersApi.UserProfile = {
  id: 'user-1',
  email: 'diego@example.com',
  name: 'Diego',
  currency: 'EUR',
  locale: 'es',
  status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00.000Z',
  hasPassword: true, recurringReminderEmails: true, warrantyReminderEmails: true,
};

const TAGS: tagsApi.ReceiptTagWithCount[] = [
  { id: 't1', name: 'Garantía', color: 'blue', receiptCount: 3 },
  { id: 't2', name: 'Trabajo', color: null, receiptCount: 0 },
];

describe('ReceiptTagsPage (spec 051 H1 criterio 3)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    vi.spyOn(usersApi, 'getProfile').mockResolvedValue(PROFILE);
    vi.spyOn(tagsApi, 'listReceiptTags').mockResolvedValue(TAGS);
  });

  function renderPage() {
    return render(
      <AuthProvider>
        <MemoryRouter>
          <ReceiptTagsPage />
        </MemoryRouter>
      </AuthProvider>,
    );
  }

  const tagItem = async (name: string) => (await screen.findAllByRole('listitem')).find((li) => within(li).queryByText(name))!;

  it('lista las etiquetas con el número de tickets de cada una', async () => {
    renderPage();
    expect(await tagItem('Garantía')).toHaveTextContent('3 tickets');
    expect(await tagItem('Trabajo')).toHaveTextContent('Sin tickets');
  });

  it('crea una etiqueta con color y recarga la lista', async () => {
    const createSpy = vi.spyOn(tagsApi, 'createReceiptTag').mockResolvedValue({ id: 't3', name: 'Hogar', color: 'green' });
    renderPage();
    await userEvent.type(await screen.findByLabelText('Nombre'), 'Hogar');
    await userEvent.selectOptions(screen.getByLabelText('Color'), 'Verde');
    await userEvent.click(screen.getByRole('button', { name: 'Crear etiqueta' }));
    expect(createSpy).toHaveBeenCalledWith('Hogar', 'green');
    expect(tagsApi.listReceiptTags).toHaveBeenCalledTimes(2);
  });

  it('un nombre repetido muestra el error del servidor', async () => {
    vi.spyOn(tagsApi, 'createReceiptTag').mockRejectedValue(new ApiError(409, 'Ya tienes una etiqueta con ese nombre.'));
    renderPage();
    await userEvent.type(await screen.findByLabelText('Nombre'), 'garantia');
    await userEvent.click(screen.getByRole('button', { name: 'Crear etiqueta' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Ya tienes una etiqueta con ese nombre.');
  });

  it('renombra y cambia el color', async () => {
    const updateSpy = vi
      .spyOn(tagsApi, 'updateReceiptTag')
      .mockResolvedValueOnce({ id: 't2', name: 'Oficina', color: null })
      .mockResolvedValueOnce({ id: 't2', name: 'Oficina', color: 'teal' });
    renderPage();
    const item = await tagItem('Trabajo');
    await userEvent.click(within(item).getByRole('button', { name: 'Renombrar' }));
    const field = within(item).getByLabelText('Nuevo nombre');
    await userEvent.clear(field);
    await userEvent.type(field, 'Oficina');
    await userEvent.click(within(item).getByRole('button', { name: 'Guardar' }));
    expect(updateSpy).toHaveBeenCalledWith('t2', { name: 'Oficina' });
    expect(await screen.findByText('Oficina')).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Color de Oficina'), 'Turquesa');
    expect(updateSpy).toHaveBeenLastCalledWith('t2', { color: 'teal' });
  });

  it('borrar pide confirmación, explica que los tickets no se borran y la quita de la lista', async () => {
    const deleteSpy = vi.spyOn(tagsApi, 'deleteReceiptTag').mockResolvedValue(undefined);
    renderPage();
    const item = await tagItem('Garantía');
    await userEvent.click(within(item).getByRole('button', { name: 'Borrar' }));
    expect(within(item).getByRole('alert')).toHaveTextContent('Se quitará de 3 tickets; los tickets no se borran.');
    await userEvent.click(within(item).getByRole('button', { name: 'Sí, borrar' }));
    expect(deleteSpy).toHaveBeenCalledWith('t1');
    expect(screen.queryByText('Garantía')).not.toBeInTheDocument();
  });
});
