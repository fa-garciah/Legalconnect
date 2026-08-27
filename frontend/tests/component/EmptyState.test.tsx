/**
 * T044 — US5. FR-018: guidance renders when supplied; nothing is fabricated when it
 * isn't.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmptyState } from '@/feedback/EmptyState';

describe('EmptyState', () => {
  it('renders the supplied guidance text', () => {
    render(<EmptyState guidance="Crea tu primer caso para comenzar." />);
    expect(screen.getByTestId('empty-state-guidance')).toHaveTextContent('Crea tu primer caso para comenzar.');
  });

  it('renders no fabricated call-to-action when no guidance is supplied', () => {
    render(<EmptyState />);
    expect(screen.queryByTestId('empty-state-guidance')).not.toBeInTheDocument();
  });

  it('a filtered-view caller can pass guidance reflecting the filter, not an unqualified "no data" claim', () => {
    render(<EmptyState guidance="Ningún resultado coincide con el filtro aplicado." />);
    expect(screen.getByTestId('empty-state-guidance')).toHaveTextContent('filtro aplicado');
  });
});
