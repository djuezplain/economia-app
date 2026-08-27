import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HomePage } from './HomePage';

describe('HomePage', () => {
  it('muestra el título de la aplicación', () => {
    render(<HomePage />);
    expect(screen.getByText('App de Gestión de Economía Personal')).toBeInTheDocument();
  });
});
