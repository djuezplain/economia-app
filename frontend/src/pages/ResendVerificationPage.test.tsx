import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ResendVerificationPage } from './ResendVerificationPage';
import * as authApi from '../api/auth';

describe('ResendVerificationPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('envía el email y muestra el mensaje genérico de éxito', async () => {
    const resendSpy = vi.spyOn(authApi, 'resendVerification').mockResolvedValue({ message: 'ok' });
    render(<ResendVerificationPage />);

    await userEvent.type(screen.getByLabelText('Email'), 'ana@example.com');
    await userEvent.click(screen.getByRole('button', { name: /reenviar enlace/i }));

    expect(await screen.findByText('Revisa tu correo')).toBeInTheDocument();
    expect(resendSpy).toHaveBeenCalledWith('ana@example.com');
  });

  it('muestra el mismo mensaje genérico incluso si la llamada falla (no revela nada del error)', async () => {
    vi.spyOn(authApi, 'resendVerification').mockRejectedValue(new Error('network error'));
    render(<ResendVerificationPage />);

    await userEvent.type(screen.getByLabelText('Email'), 'ana@example.com');
    await userEvent.click(screen.getByRole('button', { name: /reenviar enlace/i }));

    expect(await screen.findByText('Revisa tu correo')).toBeInTheDocument();
  });
});
