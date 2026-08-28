import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProgressBar } from './ProgressBar';

describe('ProgressBar', () => {
  it('expone los atributos ARIA de un progressbar accesible', () => {
    render(<ProgressBar percent={45} level="ok" direction="budget" label="Transporte: 45%" />);

    const bar = screen.getByRole('progressbar', { name: 'Transporte: 45%' });
    expect(bar).toHaveAttribute('aria-valuenow', '45');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
  });

  it('percent null se muestra vacía (aria-valuenow="0") sin lanzar', () => {
    render(<ProgressBar percent={null} level="ok" direction="budget" label="Sin datos" />);

    expect(screen.getByRole('progressbar', { name: 'Sin datos' })).toHaveAttribute('aria-valuenow', '0');
  });

  it('percent > 100 muestra la etiqueta de exceso y el relleno no supera el 100% de ancho', () => {
    const { container } = render(<ProgressBar percent={150} level="over" direction="budget" label="Superado" />);

    expect(screen.getByText('150%')).toBeInTheDocument();
    const fill = container.querySelector('.progress-bar-fill') as HTMLElement;
    expect(fill.style.width).toBe('100%');
  });

  it('percent <= 100 no muestra ninguna etiqueta de exceso', () => {
    const { container } = render(<ProgressBar percent={80} level="warning" direction="budget" label="80%" />);

    expect(container.querySelector('.progress-bar-overflow')).not.toBeInTheDocument();
  });

  it('mismo level "over": presupuesto en rojo, ahorro en verde (rampas opuestas, plan.md §1)', () => {
    const { container: budgetContainer } = render(<ProgressBar percent={120} level="over" direction="budget" label="Presupuesto" />);
    const { container: savingsContainer } = render(<ProgressBar percent={120} level="over" direction="savings" label="Ahorro" />);

    const budgetFill = budgetContainer.querySelector('.progress-bar-fill') as HTMLElement;
    const savingsFill = savingsContainer.querySelector('.progress-bar-fill') as HTMLElement;
    expect(budgetFill.style.background).toBe('var(--status-red)');
    expect(savingsFill.style.background).toBe('var(--status-green)');
  });
});
