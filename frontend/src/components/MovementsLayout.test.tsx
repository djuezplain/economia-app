import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { MovementsLayout } from './MovementsLayout';

function renderLayout(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/movements" element={<MovementsLayout />}>
          <Route index element={<h1>Listado de movimientos</h1>} />
          <Route path="summary" element={<h1>Resumen</h1>} />
          <Route path="register" element={<h1>Formulario de alta</h1>} />
          <Route path="register/:id" element={<h1>Formulario de edición</h1>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('MovementsLayout', () => {
  it('muestra las 3 pestañas en cualquier sub-página (H2 criterio 2)', () => {
    renderLayout('/movements/summary');

    const nav = screen.getByRole('navigation', { name: 'Ingresos y gastos' });
    expect(screen.getByRole('link', { name: 'Movimientos' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Resumen' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Registrar' })).toBeInTheDocument();
    expect(nav).toBeInTheDocument();
  });

  it('en /movements, "Movimientos" está activo y los demás no', () => {
    renderLayout('/movements');

    expect(screen.getByText('Listado de movimientos')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Movimientos' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Resumen' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'Registrar' })).not.toHaveAttribute('aria-current');
  });

  it('en /movements/summary, "Resumen" está activo', () => {
    renderLayout('/movements/summary');

    expect(screen.getByRole('link', { name: 'Resumen' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Movimientos' })).not.toHaveAttribute('aria-current');
  });

  it('en /movements/register, "Registrar" está activo y "Movimientos" no (gracias a "end")', () => {
    renderLayout('/movements/register');

    expect(screen.getByRole('link', { name: 'Registrar' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Movimientos' })).not.toHaveAttribute('aria-current');
  });

  it('en /movements/register/:id (modo edición), "Registrar" sigue activo', () => {
    renderLayout('/movements/register/tx-1');

    expect(screen.getByText('Formulario de edición')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Registrar' })).toHaveAttribute('aria-current', 'page');
  });

  it('desde el modo edición, pulsar "Movimientos" en la sub-navegación vuelve al listado (H3 criterio 2)', async () => {
    const user = userEvent.setup();
    renderLayout('/movements/register/tx-1');
    await screen.findByText('Formulario de edición');

    await user.click(screen.getByRole('link', { name: 'Movimientos' }));

    expect(await screen.findByText('Listado de movimientos')).toBeInTheDocument();
  });
});
