import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useConnectivity } from './useConnectivity';
import { resetForTests } from '../offline/connectivity';

function Probe() {
  const online = useConnectivity();
  return <p>{online ? 'online' : 'offline'}</p>;
}

describe('useConnectivity (T6.1)', () => {
  it('refleja el estado inicial de connectivity', () => {
    resetForTests(true);
    render(<Probe />);
    expect(screen.getByText('online')).toBeInTheDocument();
  });

  it('se actualiza cuando el estado de conectividad cambia', () => {
    resetForTests(true);
    render(<Probe />);
    expect(screen.getByText('online')).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });

    expect(screen.getByText('offline')).toBeInTheDocument();
  });
});
