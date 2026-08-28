import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfilePage } from './ProfilePage';
import { AuthProvider } from '../auth/AuthContext';
import * as authApi from '../api/auth';
import * as usersApi from '../api/users';
import { ApiError } from '../api/client';

const PROFILE: usersApi.UserProfile = {
  id: 'user-1',
  email: 'diego@example.com',
  name: 'Diego',
  currency: 'EUR',
  locale: 'es',
  status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('ProfilePage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  function renderPage() {
    return render(
      <AuthProvider>
        <MemoryRouter>
          <ProfilePage />
        </MemoryRouter>
      </AuthProvider>,
    );
  }

  it('sin sesión activa, pide iniciar sesión y no llama a la API de perfil', async () => {
    vi.spyOn(authApi, 'refresh').mockRejectedValue(new ApiError(401, 'No hay sesión.'));
    const getProfileSpy = vi.spyOn(usersApi, 'getProfile');

    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('Tienes que iniciar sesión');
    expect(getProfileSpy).not.toHaveBeenCalled();
  });

  it('con sesión activa, carga y muestra los datos del perfil en el formulario', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    vi.spyOn(usersApi, 'getProfile').mockResolvedValue(PROFILE);

    renderPage();

    expect(await screen.findByText('diego@example.com', { exact: false })).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre')).toHaveValue('Diego');
    expect(screen.getByLabelText('Moneda')).toHaveValue('EUR');
    expect(screen.getByLabelText('Idioma')).toHaveValue('es');
  });

  it('si falla la carga del perfil, muestra el error', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    vi.spyOn(usersApi, 'getProfile').mockRejectedValue(new ApiError(500, 'Error de servidor.'));

    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('Error de servidor.');
  });

  it('guardar cambios de perfil llama a la API con los valores del formulario', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    vi.spyOn(usersApi, 'getProfile').mockResolvedValue(PROFILE);
    const updateSpy = vi
      .spyOn(usersApi, 'updateProfile')
      .mockResolvedValue({ ...PROFILE, name: 'Diego J.', currency: 'USD' });

    renderPage();
    await screen.findByLabelText('Nombre');

    await userEvent.clear(screen.getByLabelText('Nombre'));
    await userEvent.type(screen.getByLabelText('Nombre'), 'Diego J.');
    await userEvent.selectOptions(screen.getByLabelText('Moneda'), 'USD');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(await screen.findByText('Cambios guardados.')).toBeInTheDocument();
    expect(updateSpy).toHaveBeenCalledWith({ name: 'Diego J.', currency: 'USD', locale: 'es' });
  });

  it('rechaza en cliente una contraseña nueva débil sin llamar a la API', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    vi.spyOn(usersApi, 'getProfile').mockResolvedValue(PROFILE);
    const changePasswordSpy = vi.spyOn(usersApi, 'changePassword');

    renderPage();
    await screen.findByLabelText('Nombre');

    await userEvent.type(screen.getByLabelText('Contraseña actual'), 'Contraseña-Segura-123');
    await userEvent.type(screen.getByLabelText('Contraseña nueva'), '123');
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/al menos 10 caracteres/i);
    expect(changePasswordSpy).not.toHaveBeenCalled();
  });

  it('con datos válidos, cambia la contraseña, cierra la sesión local y muestra el aviso de cierre', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    vi.spyOn(authApi, 'logout').mockResolvedValue({ message: 'Sesión cerrada.' });
    vi.spyOn(usersApi, 'getProfile').mockResolvedValue(PROFILE);
    const changePasswordSpy = vi
      .spyOn(usersApi, 'changePassword')
      .mockResolvedValue({ message: 'Contraseña actualizada correctamente.' });

    renderPage();
    await screen.findByLabelText('Nombre');

    await userEvent.type(screen.getByLabelText('Contraseña actual'), 'Contraseña-Segura-123');
    await userEvent.type(screen.getByLabelText('Contraseña nueva'), 'unaClaveNueva123');
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));

    expect(await screen.findByText('Contraseña actualizada')).toBeInTheDocument();
    expect(changePasswordSpy).toHaveBeenCalledWith({
      currentPassword: 'Contraseña-Segura-123',
      newPassword: 'unaClaveNueva123',
    });
    await waitFor(() => expect(authApi.logout).toHaveBeenCalled());
  });

  it('si el backend rechaza el cambio de contraseña, muestra el error y no cierra la sesión', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    const logoutSpy = vi.spyOn(authApi, 'logout');
    vi.spyOn(usersApi, 'getProfile').mockResolvedValue(PROFILE);
    vi.spyOn(usersApi, 'changePassword').mockRejectedValue(new ApiError(401, 'La contraseña actual no es correcta.'));

    renderPage();
    await screen.findByLabelText('Nombre');

    await userEvent.type(screen.getByLabelText('Contraseña actual'), 'ContraseñaIncorrecta123');
    await userEvent.type(screen.getByLabelText('Contraseña nueva'), 'unaClaveNueva123');
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('La contraseña actual no es correcta.');
    expect(logoutSpy).not.toHaveBeenCalled();
  });
});
