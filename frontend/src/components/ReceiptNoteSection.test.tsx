import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReceiptNoteSection } from './ReceiptNoteSection';
import * as groceriesApi from '../api/groceries';
import type { ReceiptDetail } from '../api/groceries';
import { ApiError } from '../api/client';

const detail = (note: string | null) => ({ id: 'r1', note, hasNote: note !== null }) as ReceiptDetail;

describe('ReceiptNoteSection (spec 051 H4)', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('guarda la nota escrita y avisa de que se ha guardado', async () => {
    const update = vi.spyOn(groceriesApi, 'updateReceiptDetails').mockResolvedValue(detail('Serie 1234'));
    const onChanged = vi.fn();
    render(<ReceiptNoteSection receiptId="r1" note={null} onChanged={onChanged} />);

    const button = screen.getByRole('button', { name: 'Guardar nota' });
    expect(button).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Nota del ticket'), 'Serie 1234');
    await userEvent.click(button);

    expect(update).toHaveBeenCalledWith('r1', { note: 'Serie 1234' });
    expect(onChanged).toHaveBeenCalledWith(detail('Serie 1234'));
    expect(await screen.findByRole('status')).toHaveTextContent('Guardada.');
  });

  it('borrar todo el texto quita la nota', async () => {
    const update = vi.spyOn(groceriesApi, 'updateReceiptDetails').mockResolvedValue(detail(null));
    render(<ReceiptNoteSection receiptId="r1" note="Vieja" onChanged={vi.fn()} />);
    await userEvent.clear(screen.getByLabelText('Nota del ticket'));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar nota' }));
    expect(update).toHaveBeenCalledWith('r1', { note: null });
  });

  it('muestra el error del servidor', async () => {
    vi.spyOn(groceriesApi, 'updateReceiptDetails').mockRejectedValue(new ApiError(400, 'La nota no puede tener más de 2000 caracteres.'));
    render(<ReceiptNoteSection receiptId="r1" note={null} onChanged={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('Nota del ticket'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar nota' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('2000 caracteres');
  });
});
