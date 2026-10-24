import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { TagPicker } from './TagPicker';
import type { TagPickerValue } from './tag-picker.types';
import type { ReceiptTag } from '../api/receipt-tags';

const AVAILABLE: ReceiptTag[] = [
  { id: 't1', name: 'Garantía', color: 'blue' },
  { id: 't2', name: 'Trabajo', color: null },
  { id: 't3', name: 'Regalo', color: 'red' },
];

function Harness({ initial = { existing: [], newNames: [] } }: { initial?: TagPickerValue }) {
  const [value, setValue] = useState<TagPickerValue>(initial);
  return (
    <>
      <TagPicker available={AVAILABLE} value={value} onChange={setValue} />
      <output data-testid="value">{JSON.stringify({ existing: value.existing.map((t) => t.id), newNames: value.newNames })}</output>
    </>
  );
}

const current = () => JSON.parse(screen.getByTestId('value').textContent!);
const input = () => screen.getByLabelText('Añadir una etiqueta');

describe('TagPicker (spec 051 H1)', () => {
  it('sugiere las etiquetas que no están elegidas y filtra por lo escrito, sin tildes', async () => {
    render(<Harness initial={{ existing: [AVAILABLE[1]], newNames: [] }} />);
    expect(screen.getByRole('button', { name: 'Añadir la etiqueta Garantía' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Añadir la etiqueta Trabajo' })).not.toBeInTheDocument();

    await userEvent.type(input(), 'garan');
    expect(screen.getByRole('button', { name: 'Añadir la etiqueta Garantía' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Añadir la etiqueta Regalo' })).not.toBeInTheDocument();
  });

  it('Intro con el nombre de una existente (sin tildes ni mayúsculas) la elige; uno nuevo se añade como nueva', async () => {
    render(<Harness />);
    await userEvent.type(input(), 'GARANTIA{Enter}');
    await userEvent.type(input(), 'Hogar{Enter}');
    expect(current()).toEqual({ existing: ['t1'], newNames: ['Hogar'] });
    expect(input()).toHaveValue('');
    expect(within(screen.getByRole('list', { name: 'Etiquetas elegidas' })).getByText('(nueva)')).toBeInTheDocument();
  });

  it('no duplica una etiqueta ya elegida, ni nueva ni existente', async () => {
    render(<Harness />);
    await userEvent.type(input(), 'Hogar{Enter}');
    await userEvent.type(input(), 'hógar{Enter}');
    await userEvent.click(screen.getByRole('button', { name: 'Añadir la etiqueta Regalo' }));
    await userEvent.type(input(), 'regalo{Enter}');
    expect(current()).toEqual({ existing: ['t3'], newNames: ['Hogar'] });
  });

  it('el botón × quita una etiqueta elegida', async () => {
    render(<Harness initial={{ existing: [AVAILABLE[0]], newNames: ['Hogar'] }} />);
    await userEvent.click(screen.getByRole('button', { name: 'Quitar la etiqueta Garantía' }));
    await userEvent.click(screen.getByRole('button', { name: 'Quitar la etiqueta Hogar' }));
    expect(current()).toEqual({ existing: [], newNames: [] });
  });
});
