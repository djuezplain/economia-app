import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReceiptThumbnail } from './ReceiptThumbnail';
import * as groceriesApi from '../api/groceries';
import type { ReceiptDocumentInfo } from '../api/groceries';

const PHOTO: ReceiptDocumentInfo = { id: 'd1', mimeType: 'image/jpeg', sizeBytes: 1000, pageCount: null, originalFilename: 't.jpg', hasText: false, textReadAt: null };

describe('ReceiptThumbnail (spec 051 H6 criterio 4)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    URL.createObjectURL = vi.fn(() => 'blob:miniatura');
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('sin IntersectionObserver, pide la miniatura enseguida (con el id del documento) y libera la URL al desmontar', async () => {
    const get = vi.spyOn(groceriesApi, 'getReceiptThumbnail').mockResolvedValue(new Blob(['x']));
    const { unmount } = render(<ReceiptThumbnail receiptId="r1" document={PHOTO} label="Ticket de Mercadona" />);
    expect(await screen.findByRole('img', { name: 'Ticket de Mercadona' })).toHaveAttribute('src', 'blob:miniatura');
    expect(get).toHaveBeenCalledWith('r1', 'd1');
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:miniatura');
  });

  it('con IntersectionObserver, no la pide hasta que la tarjeta entra en pantalla', async () => {
    let notify: (entries: { isIntersecting: boolean }[]) => void = () => {};
    const disconnect = vi.fn();
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
          notify = callback;
        }
        observe() {}
        disconnect = disconnect;
      },
    );
    const get = vi.spyOn(groceriesApi, 'getReceiptThumbnail').mockResolvedValue(new Blob(['x']));
    render(<ReceiptThumbnail receiptId="r1" document={PHOTO} label="Ticket" />);
    expect(get).not.toHaveBeenCalled();

    act(() => notify([{ isIntersecting: true }]));
    expect(await screen.findByRole('img')).toBeInTheDocument();
    expect(get).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalled();
  });

  it('PDF o ticket sin documento: un icono, sin pedir nada; si la miniatura falla, también un icono', async () => {
    const get = vi.spyOn(groceriesApi, 'getReceiptThumbnail').mockRejectedValue(new Error('404'));
    const { rerender } = render(<ReceiptThumbnail receiptId="r1" document={{ ...PHOTO, mimeType: 'application/pdf' }} label="Ticket" />);
    expect(screen.getByLabelText('PDF')).toBeInTheDocument();
    rerender(<ReceiptThumbnail receiptId="r1" document={null} label="Ticket" />);
    expect(screen.getByLabelText('Sin documento')).toBeInTheDocument();
    expect(get).not.toHaveBeenCalled();

    rerender(<ReceiptThumbnail receiptId="r2" document={PHOTO} label="Ticket" />);
    expect(await screen.findByLabelText('Foto')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
