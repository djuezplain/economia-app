import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReceiptDocumentSection, describeDocument } from './ReceiptDocumentSection';
import * as groceriesApi from '../api/groceries';
import type { ReceiptDocumentInfo } from '../api/groceries';
import { ApiError } from '../api/client';

const PHOTO: ReceiptDocumentInfo = { id: 'd1', mimeType: 'image/jpeg', sizeBytes: 600_000, pageCount: null, originalFilename: 'ticket.jpg', hasText: false, textReadAt: null };
const PDF: ReceiptDocumentInfo = { id: 'd2', mimeType: 'application/pdf', sizeBytes: 120_000, pageCount: 1, originalFilename: 'factura.pdf', hasText: false, textReadAt: null };

// Spec 048 H1 criterios 2 y 3.
describe('ReceiptDocumentSection', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // jsdom no implementa URL.createObjectURL.
    URL.createObjectURL = vi.fn(() => 'blob:documento');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(groceriesApi, 'getReceiptDocument').mockResolvedValue(new Blob(['x'], { type: 'image/jpeg' }));
  });
  afterEach(() => vi.restoreAllMocks());

  function renderSection(document: ReceiptDocumentInfo | null, onChanged = vi.fn()) {
    render(<ReceiptDocumentSection receiptId="r1" document={document} onChanged={onChanged} />);
    return onChanged;
  }

  it('describeDocument da el tipo, las páginas y el tamaño', () => {
    expect(describeDocument(PHOTO)).toBe('Foto · 586 KB');
    expect(describeDocument(PDF)).toBe('PDF, 1 página · 117 KB');
    expect(describeDocument({ ...PDF, pageCount: null, sizeBytes: 3 * 1024 * 1024 })).toBe('PDF · 3,0 MB');
  });

  it('una foto se muestra en línea, pedida con autenticación', async () => {
    renderSection(PHOTO);
    expect(await screen.findByRole('img', { name: 'Documento del ticket: ticket.jpg' })).toHaveAttribute('src', 'blob:documento');
    expect(groceriesApi.getReceiptDocument).toHaveBeenCalledWith('r1');
    expect(screen.queryByRole('button', { name: 'Abrir PDF' })).not.toBeInTheDocument();
  });

  it('un PDF no se pinta como imagen: se abre en otra pestaña', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    renderSection(PDF);
    const button = await screen.findByRole('button', { name: 'Abrir PDF' });
    await vi.waitFor(() => expect(button).toBeEnabled());
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    await userEvent.click(button);
    expect(open).toHaveBeenCalledWith('blob:documento', '_blank', 'noopener');
  });

  it('sin documento ofrece adjuntarlo y no pide nada al servidor', async () => {
    const upload = vi.spyOn(groceriesApi, 'uploadReceiptDocument').mockResolvedValue(PHOTO);
    const onChanged = renderSection(null);
    expect(screen.getByText('Este ticket no tiene la foto ni el PDF original.')).toBeInTheDocument();
    expect(groceriesApi.getReceiptDocument).not.toHaveBeenCalled();

    await userEvent.upload(screen.getByLabelText('Elegir documento'), new File(['%PDF-1.7'], 'f.pdf', { type: 'application/pdf' }));
    expect(upload).toHaveBeenCalledWith('r1', expect.any(File));
    expect(onChanged).toHaveBeenCalledWith(PHOTO);
  });

  it('si no se pudo leer el texto al adjuntar, lo avisa sin pasar el aviso al ticket (spec 051 H3 criterio 4)', async () => {
    const warning = 'El documento se ha guardado, pero no se ha podido leer su texto. Puedes volver a intentarlo más tarde.';
    vi.spyOn(groceriesApi, 'uploadReceiptDocument').mockResolvedValue({ ...PHOTO, ocrWarning: warning });
    const onChanged = renderSection(null);

    await userEvent.upload(screen.getByLabelText('Elegir documento'), new File(['%PDF-1.7'], 'f.pdf', { type: 'application/pdf' }));
    expect(await screen.findByRole('note')).toHaveTextContent(warning);
    expect(onChanged).toHaveBeenCalledWith(PHOTO);
  });

  it('sustituir sube el nuevo documento', async () => {
    const upload = vi.spyOn(groceriesApi, 'uploadReceiptDocument').mockResolvedValue(PDF);
    const onChanged = renderSection(PHOTO);
    await userEvent.upload(screen.getByLabelText('Elegir documento'), new File(['%PDF-1.7'], 'f.pdf', { type: 'application/pdf' }));
    expect(upload).toHaveBeenCalled();
    expect(onChanged).toHaveBeenCalledWith(PDF);
  });

  it('quitar pide confirmación; si se cancela no llama a la API', async () => {
    const remove = vi.spyOn(groceriesApi, 'deleteReceiptDocument').mockResolvedValue(undefined);
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    const onChanged = renderSection(PHOTO);

    await userEvent.click(screen.getByRole('button', { name: 'Quitar' }));
    expect(remove).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Quitar' }));
    expect(remove).toHaveBeenCalledWith('r1');
    expect(onChanged).toHaveBeenCalledWith(null);
  });

  it('un documento de más de 10 MB se avisa sin subir; un error del servidor se muestra', async () => {
    const upload = vi.spyOn(groceriesApi, 'uploadReceiptDocument').mockRejectedValue(new ApiError(400, 'Solo se admiten fotos (JPEG, PNG, WEBP o HEIC) o documentos PDF.'));
    renderSection(null);

    await userEvent.upload(screen.getByLabelText('Elegir documento'), new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'f.pdf', { type: 'application/pdf' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('más de 10 MB');
    expect(upload).not.toHaveBeenCalled();

    await userEvent.upload(screen.getByLabelText('Elegir documento'), new File(['%PDF'], 'f.pdf', { type: 'application/pdf' }));
    expect(await screen.findByText('Solo se admiten fotos (JPEG, PNG, WEBP o HEIC) o documentos PDF.')).toBeInTheDocument();
  });
});
