import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReceiptImportPage } from './ReceiptImportPage';
import { AuthProvider } from '../auth/AuthContext';
import * as authApi from '../api/auth';
import * as usersApi from '../api/users';
import * as receiptImportApi from '../api/receipt-import';
import type { ReceiptPreview } from '../api/receipt-import';
import * as groceriesApi from '../api/groceries';
import * as tagsApi from '../api/receipt-tags';
import { ApiError } from '../api/client';

const PROFILE: usersApi.UserProfile = {
  id: 'user-1',
  email: 'diego@example.com',
  name: 'Diego',
  currency: 'EUR',
  locale: 'es',
  status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00.000Z',
  hasPassword: true, recurringReminderEmails: true,
};

function buildImageFile(name = 'ticket.jpg'): File {
  return new File(['contenido de prueba'], name, { type: 'image/jpeg' });
}

/** "Descripción" y "Nombre del nuevo producto" pueden compartir el mismo valor (H4 criterio 1: se sugiere el mismo texto) — se busca por el label exacto de la columna de descripción, no por valor. */
function getDescriptionInput(value: string): HTMLElement {
  return screen.getAllByLabelText('Descripción').find((el) => (el as HTMLInputElement).value === value)!;
}

const PREVIEW_DOS_LINEAS: ReceiptPreview = {
  document: { id: 'doc-1', mimeType: 'image/jpeg', sizeBytes: 600000, pageCount: null },
  supermarket: { matchedId: null, suggestedName: 'MERCADONA, S.A.' },
  date: '2026-04-01',
  printedTotal: '3.10',
  linesTotal: '3.10',
  lines: [
    {
      description: 'CHOCOLATE CLASSIC',
      quantity: '1',
      unit: 'unidad',
      pricePerUnit: '1.300',
      amount: '1.30',
      product: { matchedId: null, suggestedName: 'CHOCOLATE CLASSIC' },
    },
    {
      description: 'NACHOS',
      quantity: '2',
      unit: 'unidad',
      pricePerUnit: '0.900',
      amount: '1.80',
      product: { matchedId: null, suggestedName: 'NACHOS' },
    },
  ],
  warnings: [],
};

describe('ReceiptImportPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    vi.spyOn(usersApi, 'getProfile').mockResolvedValue(PROFILE);
    vi.spyOn(groceriesApi, 'listSupermarkets').mockResolvedValue([]);
    vi.spyOn(groceriesApi, 'searchProducts').mockResolvedValue([]);
  });

  function renderPage() {
    return render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/tickets/importar']}>
          <ReceiptImportPage />
        </MemoryRouter>
      </AuthProvider>,
    );
  }

  it('sin fichero seleccionado, el botón "Reconocer" está deshabilitado y no llama a la API', async () => {
    const previewSpy = vi.spyOn(receiptImportApi, 'previewReceiptImport');

    renderPage();

    expect(await screen.findByRole('button', { name: 'Reconocer' })).toBeDisabled();
    expect(previewSpy).not.toHaveBeenCalled();
  });

  it('al subir una imagen y reconocer, muestra la vista previa editable con las líneas reconocidas', async () => {
    vi.spyOn(receiptImportApi, 'previewReceiptImport').mockResolvedValue(PREVIEW_DOS_LINEAS);

    renderPage();
    await userEvent.upload(await screen.findByLabelText('Foto o PDF del ticket'), buildImageFile());
    await userEvent.click(screen.getByRole('button', { name: 'Reconocer' }));

    expect(await screen.findByRole('heading', { name: '2. Revisar y corregir' })).toBeInTheDocument();
    expect(screen.getAllByLabelText('Descripción')).toHaveLength(2);
    expect(getDescriptionInput('CHOCOLATE CLASSIC')).toBeInTheDocument();
    expect(getDescriptionInput('NACHOS')).toBeInTheDocument();
  });

  it('editar un campo de una línea se refleja en el DTO enviado a confirmar', async () => {
    vi.spyOn(receiptImportApi, 'previewReceiptImport').mockResolvedValue(PREVIEW_DOS_LINEAS);
    const confirmSpy = vi.spyOn(receiptImportApi, 'confirmReceiptImport').mockResolvedValue({ receiptId: 'receipt-1' });

    renderPage();
    await userEvent.upload(await screen.findByLabelText('Foto o PDF del ticket'), buildImageFile());
    await userEvent.click(screen.getByRole('button', { name: 'Reconocer' }));
    await screen.findByRole('heading', { name: '2. Revisar y corregir' });

    const chocolateDescription = getDescriptionInput('CHOCOLATE CLASSIC');
    await userEvent.clear(chocolateDescription);
    await userEvent.type(chocolateDescription, 'Chocolate Classic corregido');

    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect(confirmSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        lines: expect.arrayContaining([expect.objectContaining({ description: 'Chocolate Classic corregido' })]),
      }),
    );
  });

  it('las etiquetas elegidas al revisar se envían al confirmar (spec 051 H1 criterio 5)', async () => {
    vi.spyOn(tagsApi, 'listReceiptTags').mockResolvedValue([{ id: 't1', name: 'Garantía', color: 'blue', receiptCount: 2 }]);
    vi.spyOn(receiptImportApi, 'previewReceiptImport').mockResolvedValue(PREVIEW_DOS_LINEAS);
    const confirmSpy = vi.spyOn(receiptImportApi, 'confirmReceiptImport').mockResolvedValue({ receiptId: 'receipt-1' });

    renderPage();
    await userEvent.upload(await screen.findByLabelText('Foto o PDF del ticket'), buildImageFile());
    await userEvent.click(screen.getByRole('button', { name: 'Reconocer' }));
    await screen.findByRole('heading', { name: '2. Revisar y corregir' });

    await userEvent.click(screen.getByRole('button', { name: 'Añadir la etiqueta Garantía' }));
    await userEvent.type(screen.getByLabelText('Añadir una etiqueta'), 'Hogar{Enter}');
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect(confirmSpy).toHaveBeenCalledWith(expect.objectContaining({ tags: { tagIds: ['t1'], newTags: ['Hogar'] } }));
  });

  it('borrar una línea la quita de lo que se envía al confirmar', async () => {
    vi.spyOn(receiptImportApi, 'previewReceiptImport').mockResolvedValue(PREVIEW_DOS_LINEAS);
    const confirmSpy = vi.spyOn(receiptImportApi, 'confirmReceiptImport').mockResolvedValue({ receiptId: 'receipt-1' });

    renderPage();
    await userEvent.upload(await screen.findByLabelText('Foto o PDF del ticket'), buildImageFile());
    await userEvent.click(screen.getByRole('button', { name: 'Reconocer' }));
    await screen.findByRole('heading', { name: '2. Revisar y corregir' });

    const nachosRow = getDescriptionInput('NACHOS').closest('tr')!;
    await userEvent.click(within(nachosRow).getByRole('button', { name: 'Eliminar línea' }));

    expect(screen.queryAllByLabelText('Descripción').some((el) => (el as HTMLInputElement).value === 'NACHOS')).toBe(false);

    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(confirmSpy).toHaveBeenCalledWith(expect.objectContaining({ lines: expect.arrayContaining([expect.not.objectContaining({ description: 'NACHOS' })]) }));
    const sentLines = confirmSpy.mock.calls[0][0].lines;
    expect(sentLines).toHaveLength(1);
  });

  it('añadir una línea nueva vacía y rellenarla se incluye al confirmar', async () => {
    vi.spyOn(receiptImportApi, 'previewReceiptImport').mockResolvedValue(PREVIEW_DOS_LINEAS);
    const confirmSpy = vi.spyOn(receiptImportApi, 'confirmReceiptImport').mockResolvedValue({ receiptId: 'receipt-1' });

    renderPage();
    await userEvent.upload(await screen.findByLabelText('Foto o PDF del ticket'), buildImageFile());
    await userEvent.click(screen.getByRole('button', { name: 'Reconocer' }));
    await screen.findByRole('heading', { name: '2. Revisar y corregir' });

    await userEvent.click(screen.getByRole('button', { name: 'Añadir línea' }));
    expect(screen.getAllByLabelText('Descripción')).toHaveLength(3);

    const newRowDescription = screen.getAllByLabelText('Descripción')[2];
    await userEvent.type(newRowDescription, 'Agua');

    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    const sentLines = confirmSpy.mock.calls[0][0].lines;
    expect(sentLines).toHaveLength(3);
    expect(sentLines[2].description).toBe('Agua');
  });

  it('muestra un aviso si la suma de las líneas no coincide con el total impreso, sin bloquear confirmar', async () => {
    vi.spyOn(receiptImportApi, 'previewReceiptImport').mockResolvedValue({ ...PREVIEW_DOS_LINEAS, printedTotal: '99.99' });
    vi.spyOn(receiptImportApi, 'confirmReceiptImport').mockResolvedValue({ receiptId: 'receipt-1' });

    renderPage();
    await userEvent.upload(await screen.findByLabelText('Foto o PDF del ticket'), buildImageFile());
    await userEvent.click(screen.getByRole('button', { name: 'Reconocer' }));
    await screen.findByRole('heading', { name: '2. Revisar y corregir' });

    expect(await screen.findByRole('alert')).toHaveTextContent('no coincide');
    expect(screen.getByRole('button', { name: 'Confirmar' })).not.toBeDisabled();
  });

  it('sin desajuste de totales, no muestra ningún aviso', async () => {
    vi.spyOn(receiptImportApi, 'previewReceiptImport').mockResolvedValue(PREVIEW_DOS_LINEAS);

    renderPage();
    await userEvent.upload(await screen.findByLabelText('Foto o PDF del ticket'), buildImageFile());
    await userEvent.click(screen.getByRole('button', { name: 'Reconocer' }));
    await screen.findByRole('heading', { name: '2. Revisar y corregir' });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('confirmar con éxito muestra el enlace al ticket guardado', async () => {
    vi.spyOn(receiptImportApi, 'previewReceiptImport').mockResolvedValue(PREVIEW_DOS_LINEAS);
    vi.spyOn(receiptImportApi, 'confirmReceiptImport').mockResolvedValue({ receiptId: 'receipt-1' });

    renderPage();
    await userEvent.upload(await screen.findByLabelText('Foto o PDF del ticket'), buildImageFile());
    await userEvent.click(screen.getByRole('button', { name: 'Reconocer' }));
    await screen.findByRole('heading', { name: '2. Revisar y corregir' });
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect(await screen.findByRole('link', { name: 'Ver el ticket guardado' })).toHaveAttribute('href', '/tickets/receipt-1');
  });

  it('permite elegir un supermercado y un producto ya existentes en vez de crear nuevos (H3/H4)', async () => {
    vi.spyOn(groceriesApi, 'listSupermarkets').mockResolvedValue([{ id: 'super-1', name: 'Carrefour' }]);
    vi.spyOn(groceriesApi, 'searchProducts').mockResolvedValue([{ id: 'prod-1', name: 'Chocolate Classic' }]);
    vi.spyOn(receiptImportApi, 'previewReceiptImport').mockResolvedValue(PREVIEW_DOS_LINEAS);
    const confirmSpy = vi.spyOn(receiptImportApi, 'confirmReceiptImport').mockResolvedValue({ receiptId: 'receipt-1' });

    renderPage();
    await userEvent.upload(await screen.findByLabelText('Foto o PDF del ticket'), buildImageFile());
    await userEvent.click(screen.getByRole('button', { name: 'Reconocer' }));
    await screen.findByRole('heading', { name: '2. Revisar y corregir' });

    await userEvent.selectOptions(screen.getByLabelText('Comercio'), 'Carrefour');
    const chocolateRow = getDescriptionInput('CHOCOLATE CLASSIC').closest('tr')!;
    await userEvent.selectOptions(within(chocolateRow).getByLabelText('Producto'), 'Chocolate Classic');

    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect(confirmSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        supermarket: { id: 'super-1' },
        lines: expect.arrayContaining([expect.objectContaining({ description: 'CHOCOLATE CLASSIC', product: { id: 'prod-1' } })]),
      }),
    );
  });

  it('un error al reconocer la imagen se muestra sin ofrecer confirmar', async () => {
    vi.spyOn(receiptImportApi, 'previewReceiptImport').mockRejectedValue(new ApiError(400, 'Solo se admiten imágenes JPEG o PNG.'));

    renderPage();
    await userEvent.upload(await screen.findByLabelText('Foto o PDF del ticket'), buildImageFile());
    await userEvent.click(screen.getByRole('button', { name: 'Reconocer' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('JPEG o PNG');
    expect(screen.queryByRole('button', { name: 'Confirmar' })).not.toBeInTheDocument();
  });

  describe('documento original (spec 048 H1)', () => {
    it('muestra que el documento se guardará con el ticket y manda su id al confirmar', async () => {
      vi.spyOn(receiptImportApi, 'previewReceiptImport').mockResolvedValue(PREVIEW_DOS_LINEAS);
      const confirmSpy = vi.spyOn(receiptImportApi, 'confirmReceiptImport').mockResolvedValue({ receiptId: 'receipt-1' });

      renderPage();
      await userEvent.upload(await screen.findByLabelText('Foto o PDF del ticket'), buildImageFile());
      await userEvent.click(screen.getByRole('button', { name: 'Reconocer' }));

      expect(await screen.findByText(/Se guardará con el ticket: Foto · 586 KB/)).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
      expect(confirmSpy).toHaveBeenCalledWith(expect.objectContaining({ documentId: 'doc-1' }));
    });

    it('describe un PDF con su número de páginas', async () => {
      vi.spyOn(receiptImportApi, 'previewReceiptImport').mockResolvedValue({
        ...PREVIEW_DOS_LINEAS,
        document: { id: 'doc-2', mimeType: 'application/pdf', sizeBytes: 2 * 1024 * 1024, pageCount: 3 },
      });

      renderPage();
      await userEvent.upload(await screen.findByLabelText('Foto o PDF del ticket'), new File(['%PDF-1.7'], 'factura.pdf', { type: 'application/pdf' }));
      await userEvent.click(screen.getByRole('button', { name: 'Reconocer' }));

      expect(await screen.findByText(/PDF, 3 páginas · 2,0 MB/)).toBeInTheDocument();
    });

    it('un documento de más de 10 MB se avisa sin subir nada', async () => {
      const previewSpy = vi.spyOn(receiptImportApi, 'previewReceiptImport');

      renderPage();
      const huge = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'factura.pdf', { type: 'application/pdf' });
      await userEvent.upload(await screen.findByLabelText('Foto o PDF del ticket'), huge);
      await userEvent.click(screen.getByRole('button', { name: 'Reconocer' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('El documento ocupa más de 10 MB');
      expect(previewSpy).not.toHaveBeenCalled();
    });
  });

  describe('cualquier comercio (spec 048 H2)', () => {
    async function reachPreview() {
      renderPage();
      await userEvent.upload(await screen.findByLabelText('Foto o PDF del ticket'), buildImageFile());
      await userEvent.click(screen.getByRole('button', { name: 'Reconocer' }));
      await screen.findByRole('heading', { name: '2. Revisar y corregir' });
    }

    it('"Guardar sin desglose" quita las líneas y exige el total; se guarda sin líneas', async () => {
      vi.spyOn(receiptImportApi, 'previewReceiptImport').mockResolvedValue({ ...PREVIEW_DOS_LINEAS, printedTotal: null });
      const confirmSpy = vi.spyOn(receiptImportApi, 'confirmReceiptImport').mockResolvedValue({ receiptId: 'receipt-1' });
      await reachPreview();

      await userEvent.click(screen.getByRole('button', { name: 'Guardar sin desglose' }));
      expect(screen.queryAllByLabelText('Descripción')).toHaveLength(0);
      expect(screen.getByText('Sin desglose: se guardará solo con la fecha, el comercio y el total.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Confirmar' })).toBeDisabled();

      await userEvent.type(screen.getByLabelText('Total (obligatorio sin desglose)'), '64.20');
      await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
      expect(confirmSpy).toHaveBeenCalledWith(expect.objectContaining({ lines: [], printedTotal: '64.20' }));
    });

    it('una línea con "— Sin producto —" se envía con product: null', async () => {
      vi.spyOn(receiptImportApi, 'previewReceiptImport').mockResolvedValue(PREVIEW_DOS_LINEAS);
      const confirmSpy = vi.spyOn(receiptImportApi, 'confirmReceiptImport').mockResolvedValue({ receiptId: 'receipt-1' });
      await reachPreview();

      const [firstProduct] = screen.getAllByLabelText('Producto');
      await userEvent.selectOptions(firstProduct, '— Sin producto —');
      expect(screen.getAllByLabelText('Nombre del nuevo producto')).toHaveLength(1);
      await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

      const sent = confirmSpy.mock.calls[0][0].lines;
      expect(sent[0]).toMatchObject({ description: 'CHOCOLATE CLASSIC', product: null });
      expect(sent[1]).toMatchObject({ description: 'NACHOS', product: { name: 'NACHOS' } });
    });

    it('habla de comercio, no de supermercado', async () => {
      vi.spyOn(receiptImportApi, 'previewReceiptImport').mockResolvedValue(PREVIEW_DOS_LINEAS);
      await reachPreview();
      expect(screen.getByLabelText('Comercio')).toBeInTheDocument();
      expect(screen.getByRole('option', { name: '+ Nuevo comercio' })).toBeInTheDocument();
    });
  });
});
