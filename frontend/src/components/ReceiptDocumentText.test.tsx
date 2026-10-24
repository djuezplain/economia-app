import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReceiptDocumentText } from './ReceiptDocumentText';
import * as groceriesApi from '../api/groceries';
import type { ReceiptDocumentInfo } from '../api/groceries';
import { ApiError } from '../api/client';

const DOC: ReceiptDocumentInfo = { id: 'd1', mimeType: 'image/jpeg', sizeBytes: 1000, pageCount: null, originalFilename: 't.jpg', hasText: false, textReadAt: null };

describe('ReceiptDocumentText (spec 051 H3)', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('con texto: lo pide al abrir el desplegable, una sola vez', async () => {
    const get = vi.spyOn(groceriesApi, 'getReceiptDocumentText').mockResolvedValue({ text: 'LAVADORA BOSCH', readAt: '2026-10-24T10:00:00Z' });
    render(<ReceiptDocumentText receiptId="r1" document={{ ...DOC, hasText: true, textReadAt: '2026-10-24T10:00:00Z' }} onRead={vi.fn()} />);
    expect(get).not.toHaveBeenCalled();

    await userEvent.click(screen.getByText('Texto del documento'));
    expect(await screen.findByText('LAVADORA BOSCH')).toBeInTheDocument();
    await userEvent.click(screen.getByText('Texto del documento'));
    await userEvent.click(screen.getByText('Texto del documento'));
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('sin texto y nunca leído: "Leer el texto del documento" lo lee, lo muestra y avisa al padre', async () => {
    const read = vi.spyOn(groceriesApi, 'readReceiptDocumentText').mockResolvedValue({ text: 'FACTURA', readAt: '2026-10-24T10:00:00Z' });
    const onRead = vi.fn();
    render(<ReceiptDocumentText receiptId="r1" document={DOC} onRead={onRead} />);
    expect(screen.getByText(/no aparece en el buscador/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Leer el texto del documento' }));
    expect(read).toHaveBeenCalledWith('r1');
    expect(onRead).toHaveBeenCalledWith({ ...DOC, hasText: true, textReadAt: '2026-10-24T10:00:00Z' });
  });

  it('leído sin texto: lo dice y ofrece volver a leerlo', () => {
    render(<ReceiptDocumentText receiptId="r1" document={{ ...DOC, textReadAt: '2026-10-24T10:00:00Z' }} onRead={vi.fn()} />);
    expect(screen.getByText('No se ha encontrado texto en este documento.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Volver a leer el texto' })).toBeInTheDocument();
  });

  it('si la lectura falla, muestra el motivo', async () => {
    vi.spyOn(groceriesApi, 'readReceiptDocumentText').mockRejectedValue(new ApiError(503, 'El reconocimiento de tickets no está configurado.'));
    render(<ReceiptDocumentText receiptId="r1" document={DOC} onRead={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Leer el texto del documento' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('no está configurado');
  });
});
