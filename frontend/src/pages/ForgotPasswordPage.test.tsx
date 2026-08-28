import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ForgotPasswordPage } from './ForgotPasswordPage';
import * as authApi from '../api/auth';

describe('ForgotPasswordPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('envía la solicitud y muestra el mensaje genérico de éxito', async () => {
    const forgotSpy = vi.spyOn(authApi, 'forgotPassword').mockResolvedValue({ message: 'ok' });
    render(<ForgotPasswordPage />);

    await userEvent.type(screen.getByLabelText('Email'), 'ana@example.com');
    await userEvent.click(screen.getByRole('button', { name: /enviar enlace/i }));

    expect(await screen.findByText('Revisa tu correo')).toBeInTheDocument();
    expect(forgotSpy).toHaveBeenCalledWith('ana@example.com');
  });

  it('muestra el mismo mensaje genérico incluso si la llamada falla (H5 criterio 1: no revela nada)', async () => {
    vi.spyOn(authApi, 'forgotPassword').mockRejectedValue(new Error('network error'));
    render(<ForgotPasswordPage />);

    await userEvent.type(screen.getByLabelText('Email'), 'no-existe@example.com');
    await userEvent.click(screen.getByRole('button', { name: /enviar enlace/i }));

    expect(await screen.findByText('Revisa tu correo')).toBeInTheDocument();
  });
});
