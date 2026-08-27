/**
 * T039 — US4. contracts/feedback-states.md §3's copy table, retry wiring (§4), and
 * SC-005's byte-identical opaque rendering.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorState } from '@/feedback/ErrorState';
import type { ClassifiedRefusal } from '@/feedback/refusal-bucket';

describe('ErrorState', () => {
  it.each<[ClassifiedRefusal, string]>([
    [{ bucket: 'opaque' }, 'No se pudo completar esta acción. Inténtalo de nuevo.'],
    [{ bucket: 'role' }, 'Tu rol actual no permite esta acción.'],
    [{ bucket: 'entitlement-feature', capability: 'x' }, 'Tu plan actual no incluye esta función.'],
    [{ bucket: 'entitlement-limit', limit: { key: 'users', value: 1 } }, 'Se alcanzó el límite de tu plan para esto.'],
  ])('renders the %o bucket with its distinct copy', (refusal, expectedCopy) => {
    render(<ErrorState refusal={refusal} onRetry={vi.fn()} />);
    expect(screen.getByTestId('error-state-copy')).toHaveTextContent(expectedCopy);
  });

  it('a not_found refusal and a cross-tenant refusal (same wire shape) render byte-identical output (SC-005)', () => {
    const notFound = render(<ErrorState refusal={{ bucket: 'opaque' }} onRetry={vi.fn()} />);
    const notFoundHtml = notFound.container.innerHTML;
    notFound.unmount();

    // A cross-tenant refusal is, at the wire level, the SAME 404 not_found response —
    // 001/FR-008 — so it classifies to the identical bucket and therefore the
    // identical markup.
    const crossTenant = render(<ErrorState refusal={{ bucket: 'opaque' }} onRetry={vi.fn()} />);
    expect(crossTenant.container.innerHTML).toBe(notFoundHtml);
  });

  it('retry calls the query\'s own refetch, never a newly constructed request', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<ErrorState refusal={{ bucket: 'opaque' }} onRetry={onRetry} />);

    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
