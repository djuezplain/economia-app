import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, registerRefreshHandler, registerTokenGetter } from './client';

// Spec 048 T3.5: `getBlob` descarga binarios con la misma autenticación y el
// mismo reintento tras un 401 que el resto de peticiones.
describe('api.getBlob', () => {
  let token: string | null;

  beforeEach(() => {
    token = 'viejo';
    registerTokenGetter(() => token);
    registerRefreshHandler(async () => {
      token = 'nuevo';
      return token;
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it('manda el token y devuelve el cuerpo como Blob', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(new Uint8Array([0xff, 0xd8, 0xff]), { status: 200, headers: { 'Content-Type': 'image/jpeg' } }));
    const blob = await api.getBlob('/receipts/r1/document');
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(new Uint8Array([0xff, 0xd8, 0xff]));
    expect(fetchSpy.mock.calls[0][1]?.headers).toMatchObject({ Authorization: 'Bearer viejo' });
  });

  it('tras un 401 refresca la sesión y repite la petición con el token nuevo', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: 'Caducado' }), { status: 401 }))
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    const blob = await api.getBlob('/receipts/r1/document');
    expect(blob.size).toBe(3);
    expect(fetchSpy.mock.calls[1][1]?.headers).toMatchObject({ Authorization: 'Bearer nuevo' });
  });

  it('un error lanza ApiError con el mensaje del servidor', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ message: 'Este ticket no tiene documento.' }), { status: 404 }));
    await expect(api.getBlob('/receipts/r1/document')).rejects.toMatchObject({ status: 404, message: 'Este ticket no tiene documento.' });
  });
});
