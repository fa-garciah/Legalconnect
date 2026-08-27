/**
 * T050 — SC-010. Every string literal rendered by the shell's own components is
 * checked for accidental English copy — a fixed brand-token allow-list plus a small
 * English-function-word detector catches a fallback more reliably than eyeballing.
 */
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Header } from '@/shell/Header';
import { NavigationMenu } from '@/shell/NavigationMenu';
import { LoadingState } from '@/feedback/LoadingState';
import { ErrorState } from '@/feedback/ErrorState';
import { EmptyState } from '@/feedback/EmptyState';
import type { ActiveMembership } from '@/session/types';
import type { NavigationItem } from '@/shell/navigation-items';
import type { ClassifiedRefusal } from '@/feedback/refusal-bucket';

const ACTIVE: ActiveMembership = { tenantId: 'tenant-a', tenantName: 'Despacho Alfa, S.C.', archetype: 'SA' };
const ITEMS: readonly NavigationItem[] = [{ id: 'a', label: 'Módulo A', href: '/a' }];

const ALLOWED_BRAND_TOKENS = ['LegalConnect', 'MX', 'S.C.'];

/** A crude but effective English-word detector: flags common English function words. */
const ENGLISH_TELLS = /\b(the|and|is|are|to|for|of|please|loading|error|empty|retry)\b/i;

function assertOnlySpanish(container: HTMLElement): void {
  const text = container.textContent ?? '';
  const stripped = ALLOWED_BRAND_TOKENS.reduce((acc, token) => acc.split(token).join(''), text);
  expect(stripped, `unexpected English copy: "${text}"`).not.toMatch(ENGLISH_TELLS);
}

describe('shell copy is Spanish-only (SC-010)', () => {
  it('Header', () => {
    const { container } = render(
      <Header activeMembership={ACTIVE} memberships={[ACTIVE]} onSwitchTenant={() => {}} />,
    );
    assertOnlySpanish(container);
  });

  it('NavigationMenu', () => {
    const { container } = render(<NavigationMenu items={ITEMS} archetype="SA" />);
    assertOnlySpanish(container);
  });

  it('LoadingState', () => {
    const { container } = render(<LoadingState />);
    assertOnlySpanish(container);
  });

  it('ErrorState — every bucket', () => {
    const buckets: readonly ClassifiedRefusal[] = [
      { bucket: 'opaque' },
      { bucket: 'role' },
      { bucket: 'entitlement-feature' },
      { bucket: 'entitlement-limit' },
    ];
    for (const refusal of buckets) {
      const { container, unmount } = render(<ErrorState refusal={refusal} onRetry={() => {}} />);
      assertOnlySpanish(container);
      unmount();
    }
  });

  it('EmptyState', () => {
    const { container } = render(<EmptyState guidance="Crea tu primer caso para comenzar." />);
    assertOnlySpanish(container);
  });
});
