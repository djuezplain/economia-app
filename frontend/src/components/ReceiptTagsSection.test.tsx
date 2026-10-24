import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReceiptTagsSection } from './ReceiptTagsSection';
import * as tagsApi from '../api/receipt-tags';
import { ApiError } from '../api/client';

const GARANTIA = { id: 't1', name: 'Garantía', color: 'blue' as const };

describe('ReceiptTagsSection (spec 051 H1 criterio 1)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(tagsApi, 'listReceiptTags').mockResolvedValue([{ ...GARANTIA, receiptCount: 3 }]);
  });

  function renderSection(onChanged = vi.fn()) {
    render(
      <MemoryRouter>
        <ReceiptTagsSection receiptId="r1" tags={[GARANTIA]} onChanged={onChanged} />
      </MemoryRouter>,
    );
    return onChanged;
  }

  it('añadir una etiqueta nueva la guarda al momento con las que ya tenía', async () => {
    const saved = [GARANTIA, { id: 't9', name: 'Hogar', color: null }];
    const setSpy = vi.spyOn(tagsApi, 'setReceiptTags').mockResolvedValue(saved);
    const onChanged = renderSection();

    await userEvent.type(screen.getByLabelText('Añadir una etiqueta'), 'Hogar{Enter}');

    expect(setSpy).toHaveBeenCalledWith('r1', { tagIds: ['t1'], newTags: ['Hogar'] });
    expect(onChanged).toHaveBeenCalledWith(saved);
  });

  it('quitar una etiqueta guarda sin ella', async () => {
    const setSpy = vi.spyOn(tagsApi, 'setReceiptTags').mockResolvedValue([]);
    renderSection();
    await userEvent.click(screen.getByRole('button', { name: 'Quitar la etiqueta Garantía' }));
    expect(setSpy).toHaveBeenCalledWith('r1', { tagIds: [], newTags: [] });
  });

  it('si falla, muestra el error', async () => {
    vi.spyOn(tagsApi, 'setReceiptTags').mockRejectedValue(new ApiError(400, 'Un ticket puede tener como mucho 20 etiquetas.'));
    renderSection();
    await userEvent.type(screen.getByLabelText('Añadir una etiqueta'), 'Otra{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('como mucho 20 etiquetas');
  });

  it('enlaza a la pantalla de etiquetas', () => {
    renderSection();
    expect(screen.getByRole('link', { name: 'Gestionar etiquetas' })).toHaveAttribute('href', '/tickets/etiquetas');
  });
});
