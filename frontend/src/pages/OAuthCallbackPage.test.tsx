import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OAuthCallbackPage } from './OAuthCallbackPage';
import { AuthProvider } from '../auth/AuthContext';
import * as authApi from '../api/auth';
import { ApiError } from '../api/client';

describe('OAuthCallbackPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // AuthProvider intenta un refresco silencioso al montar; se simula "sin
    // sesión previa" para aislar el comportamiento propio de esta página.
    vi.spyOn(authApi, 'refresh').mockRejectedValue(new ApiError(401, 'No hay sesión.'));
  });

  function renderAt(path: string) {
    return render(
      <AuthProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/oauth-callback" element={<OAuthCallbackPage />} />
            <Route path="/" element={<div>Página de inicio</div>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );
  }

  it('con un accessToken válido en la URL, guarda la sesión y navega a la página de inicio', async () => {
    renderAt('/oauth-callback?accessToken=token-de-google-de-prueba');

    expect(await screen.findByText('Página de inicio')).toBeInTheDocument();
  });

  it('sin accessToken en la URL, muestra un error y no navega', async () => {
    renderAt('/oauth-callback');

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText('Página de inicio')).not.toBeInTheDocument();
  });
});
