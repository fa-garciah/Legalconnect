/**
 * The loading splash: announced once, with the product's mark and name, and used both as the
 * App Router's page-level `loading.tsx` and (at region size) inside `LoadingState`.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrandSplash } from '@/feedback/BrandSplash';
import { LoadingState } from '@/feedback/LoadingState';
import Loading from '@/app/loading';

describe('BrandSplash', () => {
  it('is a single status region that says it is loading, with the mark and the wordmark', () => {
    render(<BrandSplash />);
    const splash = screen.getByTestId('brand-splash');
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(splash).toHaveTextContent('Cargando…');
    expect(splash).toHaveTextContent('LegalConnect MX');
    expect(screen.getByTestId('brand-mark')).toHaveAttribute('aria-hidden');
  });

  it('waits before fading in, so a page that arrives at once never flashes it', () => {
    render(<BrandSplash />);
    expect(screen.getByTestId('brand-splash').className).toContain('animate-splash-in');
  });

  it('is what the App Router shows while a page loads', () => {
    render(<Loading />);
    expect(screen.getByTestId('brand-splash')).toBeInTheDocument();
  });
});

describe('LoadingState', () => {
  it('shows the mark in place of a generic spinner and keeps its status role and text', () => {
    render(<LoadingState />);
    const state = screen.getByTestId('loading-state');
    expect(state).toHaveAttribute('role', 'status');
    expect(state).toHaveTextContent('Cargando…');
    expect(screen.getByTestId('brand-mark')).toBeInTheDocument();
  });
});
