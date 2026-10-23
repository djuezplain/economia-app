import { describe, expect, it, vi } from 'vitest';
import { isCompressible, MAX_UPLOAD_BYTES, pickSmaller, prepareUpload, sizeError, targetDimensions } from './receipt-upload';

const file = (size: number, type = 'image/jpeg', name = 'ticket.jpg') => new File([new Uint8Array(size)], name, { type });

// Spec 048 H1 / plan.md §4.
describe('receipt-upload', () => {
  it('targetDimensions reduce el lado largo a 3000 px manteniendo la proporción', () => {
    expect(targetDimensions(3000, 4000)).toEqual({ width: 2250, height: 3000 });
    expect(targetDimensions(8000, 2000)).toEqual({ width: 3000, height: 750 });
    expect(targetDimensions(1200, 1600)).toEqual({ width: 1200, height: 1600 });
  });

  it('isCompressible: cualquier imagen (también un HEIC sin tipo declarado), nunca un PDF', () => {
    expect(isCompressible({ type: 'image/png', name: 'a.png' })).toBe(true);
    expect(isCompressible({ type: '', name: 'IMG_0001.HEIC' })).toBe(true);
    expect(isCompressible({ type: 'application/pdf', name: 'factura.pdf' })).toBe(false);
  });

  it('pickSmaller solo se queda la reducida si ocupa menos', () => {
    expect(pickSmaller({ size: 100 }, { size: 40 })).toEqual({ size: 40 });
    expect(pickSmaller({ size: 100 }, { size: 140 })).toEqual({ size: 100 });
    expect(pickSmaller({ size: 100 }, null)).toEqual({ size: 100 });
  });

  it('sizeError avisa por encima de 10 MB', () => {
    expect(sizeError(MAX_UPLOAD_BYTES)).toBeNull();
    expect(sizeError(MAX_UPLOAD_BYTES + 1)).toMatch(/más de 10 MB/);
  });

  describe('prepareUpload', () => {
    it('una foto grande que se reduce por debajo del límite se sube reducida, sin aviso', async () => {
      const big = file(MAX_UPLOAD_BYTES + 5);
      const small = file(600_000);
      const result = await prepareUpload(big, async () => small);
      expect(result).toEqual({ file: small, error: null });
    });

    it('si el navegador no puede abrirla, se sube el original', async () => {
      const heic = file(3_000_000, '', 'IMG_0001.HEIC');
      expect(await prepareUpload(heic, async () => null)).toEqual({ file: heic, error: null });
      expect(await prepareUpload(heic, async () => Promise.reject(new Error('sin soporte')))).toEqual({ file: heic, error: null });
    });

    it('un PDF no pasa por el compresor; si supera 10 MB, se avisa sin subir nada', async () => {
      const compress = vi.fn();
      const pdf = file(MAX_UPLOAD_BYTES + 1, 'application/pdf', 'factura.pdf');
      const result = await prepareUpload(pdf, compress);
      expect(compress).not.toHaveBeenCalled();
      expect(result.error).toMatch(/más de 10 MB/);
    });
  });
});
