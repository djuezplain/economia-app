import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ResetPasswordPage } from './ResetPasswordPage';
import * as authApi from '../api/auth';
import { ApiError } from '../api/client';

function renderWithToken(token: string | null) {
  const path = token ? `/reset-password?token=${token}` : '/reset-password';
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/reset-password" element={<ResetPasswordPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sin token en la URL, no muestra el formulario y ofrece pedir un enlace nuevo', async () => {
    const resetSpy = vi.spyOn(authApi, 'resetPassword');
    renderWithToken(null);

    expect(await screen.findByRole('alert')).toHaveTextContent('Falta el token');
    expect(screen.getByRole('link', { name: 'Solicitar un enlace nuevo' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Nueva contraseña')).not.toBeInTheDocument();
    expect(resetSpy).not.toHaveBeenCalled();
  });

  it('rechaza en cliente una contraseña débil sin llamar a la API', async () => {
    const resetSpy = vi.spyOn(authApi, 'resetPassword');
    renderWithToken('un-token-valido');

    await userEvent.type(screen.getByLabelText('Nueva contraseña'), '123');
    await userEvent.click(screen.getByRole('button', { name: /restablecer contraseña/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/al menos 10 caracteres/i);
    expect(resetSpy).not.toHaveBeenCalled();
  });

  it('con una contraseña válida, llama a la API con el token de la URL y muestra el éxito', async () => {
    const resetSpy = vi.spyOn(authApi, 'resetPassword').mockResolvedValue({ message: 'ok' });
    renderWithToken('un-token-valido');

    await userEvent.type(screen.getByLabelText('Nueva contraseña'), 'unaClaveNueva123');
    await userEvent.click(screen.getByRole('button', { name: /restablecer contraseña/i }));

    expect(await screen.findByText('Contraseña restablecida')).toBeInTheDocument();
    expect(resetSpy).toHaveBeenCalledWith({ token: 'un-token-valido', password: 'unaClaveNueva123' });
    expect(screen.getByRole('link', { name: 'Iniciar sesión' })).toBeInTheDocument();
  });

  it('si el token es inválido o ha caducado, muestra el error del backend y un enlace para pedir uno nuevo', async () => {
    vi.spyOn(authApi, 'resetPassword').mockRejectedValue(new ApiError(400, 'Este enlace ha caducado.'));
    renderWithToken('un-token-caducado');

    await userEvent.type(screen.getByLabelText('Nueva contraseña'), 'unaClaveNueva123');
    await userEvent.click(screen.getByRole('button', { name: /restablecer contraseña/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Este enlace ha caducado.');
    expect(screen.getByRole('link', { name: 'Pide uno nuevo' })).toBeInTheDocument();
  });
});
