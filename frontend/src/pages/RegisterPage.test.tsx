import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RegisterPage } from './RegisterPage';
import * as authApi from '../api/auth';
import { ApiError } from '../api/client';

describe('RegisterPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  async function fillForm(password: string) {
    await userEvent.type(screen.getByLabelText('Nombre'), 'Ana');
    await userEvent.type(screen.getByLabelText('Email'), 'ana@example.com');
    await userEvent.type(screen.getByLabelText('Contraseña'), password);
    await userEvent.click(screen.getByRole('button', { name: /crear cuenta/i }));
  }

  it('rechaza en cliente una contraseña débil sin llamar a la API (H1 criterio 3)', async () => {
    const registerSpy = vi.spyOn(authApi, 'register');
    render(<RegisterPage />);

    await fillForm('123');

    expect(await screen.findByRole('alert')).toHaveTextContent(/al menos 10 caracteres/i);
    expect(registerSpy).not.toHaveBeenCalled();
  });

  it('con una contraseña válida, llama a la API y muestra el mensaje de éxito', async () => {
    vi.spyOn(authApi, 'register').mockResolvedValue({ message: 'ok' });
    render(<RegisterPage />);

    await fillForm('unaClaveSegura123');

    expect(await screen.findByText('Revisa tu correo')).toBeInTheDocument();
  });

  it('si la API devuelve un error, lo muestra sin romper el formulario', async () => {
    vi.spyOn(authApi, 'register').mockRejectedValue(new ApiError(400, 'Datos inválidos'));
    render(<RegisterPage />);

    await fillForm('unaClaveSegura123');

    await waitFor(() => {
      expect(screen.getByText('Datos inválidos')).toBeInTheDocument();
    });
  });
});
