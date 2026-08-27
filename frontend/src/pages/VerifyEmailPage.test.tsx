import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VerifyEmailPage } from './VerifyEmailPage';
import * as authApi from '../api/auth';
import { ApiError } from '../api/client';

function renderWithToken(token: string | null) {
  const path = token ? `/verify-email?token=${token}` : '/verify-email';
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/verify-email" element={<VerifyEmailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('VerifyEmailPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('muestra éxito cuando el token es válido', async () => {
    vi.spyOn(authApi, 'verifyEmail').mockResolvedValue({ message: 'Cuenta verificada correctamente.' });
    renderWithToken('un-token-valido');

    expect(await screen.findByText('Cuenta verificada')).toBeInTheDocument();
  });

  it('muestra el error del backend y un enlace para reenviar cuando el token no es válido', async () => {
    vi.spyOn(authApi, 'verifyEmail').mockRejectedValue(new ApiError(400, 'Este enlace ha caducado.'));
    renderWithToken('un-token-caducado');

    expect(await screen.findByRole('alert')).toHaveTextContent('Este enlace ha caducado.');
    expect(screen.getByRole('link', { name: 'Pide uno nuevo' })).toBeInTheDocument();
  });

  it('sin token en la URL, no llama a la API y muestra el error directamente', async () => {
    const verifySpy = vi.spyOn(authApi, 'verifyEmail');
    renderWithToken(null);

    expect(await screen.findByRole('alert')).toHaveTextContent('Falta el token');
    expect(verifySpy).not.toHaveBeenCalled();
  });
});
