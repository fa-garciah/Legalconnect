/**
 * T050 (016a) — SC-010. Every string literal rendered by the shell's own components is
 * checked for accidental English copy — a fixed brand-token allow-list plus a small
 * English-function-word detector catches a fallback more reliably than eyeballing.
 *
 * **Extended by 018/T047**, not duplicated. `018`'s client screens are the first business
 * screens in the product, and they are where English leaks in: the wire's vocabulary is
 * English (`organization`, `person`, `active`, `inactive`), the components came from an
 * English-language prototype, and a label that reads "Active" instead of "Activo" looks
 * entirely plausible in review. A second copy test beside this one would have drifted from
 * it within a slice, so this file grew instead.
 */
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Header } from '@/shell/Header';
import { NavigationMenu } from '@/shell/NavigationMenu';
import { LoadingState } from '@/feedback/LoadingState';
import { ErrorState } from '@/feedback/ErrorState';
import { EmptyState } from '@/feedback/EmptyState';
import type { ActiveMembership } from '@/session/types';
import type { NavigationItem } from '@/shell/navigation-items';
import type { ClassifiedRefusal } from '@/feedback/refusal-bucket';

vi.mock('@/session/principal', () => ({
  getPrincipal: vi.fn().mockResolvedValue({ identityId: 'identity-1', memberships: [] }),
}));
vi.mock('@/session/active-tenant', () => ({
  readActiveTenantClient: vi.fn().mockReturnValue({ status: 'active', tenantId: 'tenant-1' }),
}));

import { CaseFilters } from '@/app/expedientes/CaseFilters';
import { CaseRow } from '@/app/expedientes/CaseRow';
import { ClientFormDialog } from '@/app/clientes/ClientFormDialog';
import { WithdrawDialog } from '@/app/clientes/WithdrawDialog';
import { ClientFilters } from '@/app/clientes/ClientFilters';
import type { Client } from '@/clients/types';

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

/*
 * 018/T047 — the client screens.
 *
 * The wire's own vocabulary is English and it is one careless interpolation away from the
 * screen: `organization`, `person`, `active`, `inactive`. `inactive` is the sharpest of the
 * four, because the correct Spanish is not a translation of it — the domain's word is
 * *retirado*, "withdrawn", and a screen showing "Inactivo" would pass a naive check while
 * still using the wire's concept instead of the firm's.
 */
const WIRE_VOCABULARY = /(organization|person|active|inactive|client|status|name|save|cancel|edit|search)/i;

function assertNoWireVocabulary(container: HTMLElement): void {
  const text = container.textContent ?? '';
  expect(text, `the wire's own vocabulary reached the screen: "${text}"`).not.toMatch(WIRE_VOCABULARY);
}

function withQueryClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const CLIENT: Client = {
  id: 'c1',
  kind: 'organization',
  legalName: 'Grupo Torres, S.A. de C.V.',
  rfc: 'GTO120315AB1',
  status: 'active',
};

describe('client screen copy is Spanish-only (018/FR-023, SC-009)', () => {
  it('ClientFilters', () => {
    const { container } = withQueryClient(
      <ClientFilters q="" status="all" onQChange={() => {}} onStatusChange={() => {}} />,
    );
    assertOnlySpanish(container);
    assertNoWireVocabulary(container);
  });

  it('ClientFormDialog — create', () => {
    withQueryClient(<ClientFormDialog open mode="create" onClose={() => {}} onSaved={() => {}} />);
    // The dialog portals out of the container, so the assertion is made against the body.
    assertOnlySpanish(document.body);
    assertNoWireVocabulary(document.body);
  });

  it('ClientFormDialog — edit, where kind is rendered as text', () => {
    // The one place a wire value is turned into visible copy rather than being a form
    // value: `organization` has to reach the screen as "Organización".
    withQueryClient(
      <ClientFormDialog open mode="edit" client={CLIENT} onClose={() => {}} onSaved={() => {}} />,
    );
    assertOnlySpanish(document.body);
    assertNoWireVocabulary(document.body);
  });

  it('WithdrawDialog — the confirmation', () => {
    withQueryClient(
      <WithdrawDialog open action="withdraw" client={CLIENT} onClose={() => {}} onDone={() => {}} />,
    );
    assertOnlySpanish(document.body);
    assertNoWireVocabulary(document.body);
  });
});

/*
 * 019/T059 — the case screens.
 *
 * The wire's vocabulary for a matter is richer than the client's and correspondingly easier
 * to leak: `organization`, `active`, `retired`, and — the two most likely — `lead` and
 * `support`, the roles on a case team. A Mexican firm reads *responsable* and *apoyo*.
 */
const CASE_WIRE_VOCABULARY =
  /(lead|support|active|retired|closed|open|case|venue|matter|status|file number)/i;

function assertNoCaseWireVocabulary(container: HTMLElement): void {
  const text = container.textContent ?? '';
  expect(text, `the wire's own vocabulary reached the screen: "${text}"`).not.toMatch(
    CASE_WIRE_VOCABULARY,
  );
}

const CASE_ITEM = {
  id: 'c1',
  fileNumber: 'EXP-2026-0042',
  client: { id: 'cl1', legalName: 'Grupo Torres, S.A. de C.V.' },
  status: { id: 'st1', name: 'En Proceso' },
  matterType: { id: 'mt1', name: 'Mercantil' },
  venue: { id: 'v1', name: 'Juzgado 4° Civil CDMX' },
  venueCaseReference: '1234/2026',
  openedOn: '2026-03-04',
  closedOn: null,
};

describe('case screen copy is Spanish-only (019/FR-020, SC-008)', () => {
  it('CaseFilters', () => {
    const { container } = withQueryClient(
      <CaseFilters
        q=""
        matterTypeId="all"
        venueId="all"
        onQChange={() => {}}
        onMatterTypeChange={() => {}}
        onVenueChange={() => {}}
        matterTypes={[]}
        venues={[]}
      />,
    );
    assertOnlySpanish(container);
    assertNoCaseWireVocabulary(container);
  });

  it('CaseRow — an open matter', () => {
    const { container } = render(
      <table>
        <tbody>
          <CaseRow item={CASE_ITEM} closing="false" onOpen={() => {}} />
        </tbody>
      </table>,
    );
    assertOnlySpanish(container);
    assertNoCaseWireVocabulary(container);
  });

  it('CaseRow — a matter with nothing catalogued', () => {
    // The dash path. A row of absent values must still read as Spanish rather than as blanks.
    const { container } = render(
      <table>
        <tbody>
          <CaseRow item={{ ...CASE_ITEM, matterType: null, venue: null }} closing="true" />
        </tbody>
      </table>,
    );
    assertOnlySpanish(container);
    assertNoCaseWireVocabulary(container);
  });
});
