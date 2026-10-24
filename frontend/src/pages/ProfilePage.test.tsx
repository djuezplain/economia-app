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
  hasPassword: true, recurringReminderEmails: true, warrantyReminderEmails: true,
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

  // Spec 032 (H1/H3): exportar/importar se mudan a `/backup` — aquí solo
  // queda un enlace, ya no el botón ni la llamada directa a la API.
  it('Mi cuenta enlaza a Copia de seguridad en vez de exportar directamente', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    vi.spyOn(usersApi, 'getProfile').mockResolvedValue(PROFILE);

    renderPage();
    await screen.findByLabelText('Nombre');

    expect(screen.getByRole('link', { name: 'Ir a Copia de seguridad' })).toHaveAttribute('href', '/backup');
    expect(screen.queryByRole('button', { name: 'Exportar mis datos' })).not.toBeInTheDocument();
  });

  describe('Mi cuenta — eliminar cuenta (H8 criterio 2)', () => {
    it('el panel de confirmación empieza cerrado y avisa de que es irreversible al abrirlo', async () => {
      vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
      vi.spyOn(usersApi, 'getProfile').mockResolvedValue(PROFILE);

      renderPage();
      await screen.findByLabelText('Nombre');

      expect(screen.queryByLabelText(/Repite tu contraseña/)).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: 'Eliminar cuenta' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(/inmediata e irreversible/i);
      expect(screen.getByLabelText(/Repite tu contraseña/)).toBeInTheDocument();
    });

    it('cancelar cierra el panel sin llamar a la API', async () => {
      vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
      vi.spyOn(usersApi, 'getProfile').mockResolvedValue(PROFILE);
      const deleteSpy = vi.spyOn(usersApi, 'deleteAccount');

      renderPage();
      await screen.findByLabelText('Nombre');

      await userEvent.click(screen.getByRole('button', { name: 'Eliminar cuenta' }));
      await screen.findByLabelText(/Repite tu contraseña/);
      await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

      expect(screen.queryByLabelText(/Repite tu contraseña/)).not.toBeInTheDocument();
      expect(deleteSpy).not.toHaveBeenCalled();
    });

    it('con la contraseña correcta, elimina la cuenta, cierra la sesión y muestra el aviso final', async () => {
      vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
      vi.spyOn(authApi, 'logout').mockResolvedValue({ message: 'Sesión cerrada.' });
      vi.spyOn(usersApi, 'getProfile').mockResolvedValue(PROFILE);
      const deleteSpy = vi.spyOn(usersApi, 'deleteAccount').mockResolvedValue(undefined);

      renderPage();
      await screen.findByLabelText('Nombre');

      await userEvent.click(screen.getByRole('button', { name: 'Eliminar cuenta' }));
      await userEvent.type(await screen.findByLabelText(/Repite tu contraseña/), 'Contraseña-Segura-123');
      await userEvent.click(screen.getByRole('button', { name: 'Eliminar cuenta definitivamente' }));

      expect(await screen.findByText('Cuenta eliminada')).toBeInTheDocument();
      expect(deleteSpy).toHaveBeenCalledWith({ password: 'Contraseña-Segura-123' });
      await waitFor(() => expect(authApi.logout).toHaveBeenCalled());
    });

    it('si el backend rechaza la eliminación, muestra el error y no navega', async () => {
      vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
      const logoutSpy = vi.spyOn(authApi, 'logout');
      vi.spyOn(usersApi, 'getProfile').mockResolvedValue(PROFILE);
      vi.spyOn(usersApi, 'deleteAccount').mockRejectedValue(new ApiError(401, 'La contraseña no es correcta.'));

      renderPage();
      await screen.findByLabelText('Nombre');

      await userEvent.click(screen.getByRole('button', { name: 'Eliminar cuenta' }));
      await userEvent.type(await screen.findByLabelText(/Repite tu contraseña/), 'ClaveIncorrecta123');
      await userEvent.click(screen.getByRole('button', { name: 'Eliminar cuenta definitivamente' }));

      expect(await screen.findByText('La contraseña no es correcta.')).toBeInTheDocument();
      expect(screen.queryByText('Cuenta eliminada')).not.toBeInTheDocument();
      expect(logoutSpy).not.toHaveBeenCalled();
    });

    it('en una cuenta sin contraseña (solo Google), pide el email de confirmación en vez de la contraseña', async () => {
      vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
      vi.spyOn(authApi, 'logout').mockResolvedValue({ message: 'Sesión cerrada.' });
      vi.spyOn(usersApi, 'getProfile').mockResolvedValue({ ...PROFILE, hasPassword: false, recurringReminderEmails: true, warrantyReminderEmails: true });
      const deleteSpy = vi.spyOn(usersApi, 'deleteAccount').mockResolvedValue(undefined);

      renderPage();
      await screen.findByLabelText('Nombre');

      await userEvent.click(screen.getByRole('button', { name: 'Eliminar cuenta' }));

      expect(screen.queryByLabelText(/Repite tu contraseña/)).not.toBeInTheDocument();
      const emailField = await screen.findByLabelText(/escribe tu email/i);
      await userEvent.type(emailField, 'diego@example.com');
      await userEvent.click(screen.getByRole('button', { name: 'Eliminar cuenta definitivamente' }));

      expect(await screen.findByText('Cuenta eliminada')).toBeInTheDocument();
      expect(deleteSpy).toHaveBeenCalledWith({ confirmEmail: 'diego@example.com' });
    });
  });

  describe('avisos de recibos (spec 049 H1 criterio 6)', () => {
    it('muestra el interruptor con el valor del perfil y lo guarda al cambiarlo', async () => {
      vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
      vi.spyOn(usersApi, 'getProfile').mockResolvedValue(PROFILE);
      const update = vi.spyOn(usersApi, 'updateProfile').mockResolvedValue({ ...PROFILE, recurringReminderEmails: false, warrantyReminderEmails: true });

      renderPage();
      const toggle = await screen.findByLabelText('Avisos de recibos por email');
      expect(toggle).toBeChecked();

      await userEvent.click(toggle);
      expect(update).toHaveBeenCalledWith({ recurringReminderEmails: false });
      await waitFor(() => expect(toggle).not.toBeChecked());
    });

    it('si falla al guardar, muestra el error y el interruptor no cambia', async () => {
      vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
      vi.spyOn(usersApi, 'getProfile').mockResolvedValue(PROFILE);
      vi.spyOn(usersApi, 'updateProfile').mockRejectedValue(new ApiError(500, 'Error de prueba.'));

      renderPage();
      const toggle = await screen.findByLabelText('Avisos de recibos por email');
      await userEvent.click(toggle);
      expect(await screen.findByRole('alert')).toHaveTextContent('Error de prueba.');
      expect(toggle).toBeChecked();
    });
  });

  describe('avisos de garantía (spec 051 H5 criterio 4)', () => {
    it('muestra el interruptor con el valor del perfil y lo guarda al cambiarlo', async () => {
      vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
      vi.spyOn(usersApi, 'getProfile').mockResolvedValue(PROFILE);
      const update = vi.spyOn(usersApi, 'updateProfile').mockResolvedValue({ ...PROFILE, warrantyReminderEmails: false });

      renderPage();
      const toggle = await screen.findByLabelText('Avisos de garantía por email');
      expect(toggle).toBeChecked();

      await userEvent.click(toggle);
      expect(update).toHaveBeenCalledWith({ warrantyReminderEmails: false });
      await waitFor(() => expect(toggle).not.toBeChecked());
      expect(screen.getByLabelText('Avisos de recibos por email')).toBeChecked();
    });
  });
});
