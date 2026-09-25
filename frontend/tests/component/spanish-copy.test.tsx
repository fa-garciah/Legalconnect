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

/**
 * A crude but effective English-word detector: flags common English function words.
 *
 * `close` added by 014: shadcn's dialog shipped a visually hidden "Close" on its dismiss button,
 * which every dialog in the product read aloud to screen-reader users and no list here caught.
 */
const ENGLISH_TELLS = /\b(the|and|is|are|to|for|of|please|loading|error|empty|retry|close)\b/i;

/**
 * The rendered words, one text node at a time, joined by spaces.
 *
 * NOT `textContent`: that concatenates adjacent nodes with nothing between them, so a hidden
 * "Close" after a title read as "invitaciónClose" and `\b` never matched it. Found in 014 when a
 * deliberately-reintroduced English label passed every assertion in this file.
 */
function renderedWords(container: HTMLElement): string {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const words: string[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) words.push(node.nodeValue ?? '');
  return words.join(' ');
}

function assertOnlySpanish(container: HTMLElement): void {
  const text = renderedWords(container);
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
const WIRE_VOCABULARY = /\b(organization|person|active|inactive|client|status|name|save|cancel|edit|search)\b/i;

function assertNoWireVocabulary(container: HTMLElement): void {
  const text = renderedWords(container);
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
  /\b(lead|support|active|retired|closed|open|case|venue|matter|status|file number)\b/i;

function assertNoCaseWireVocabulary(container: HTMLElement): void {
  const text = renderedWords(container);
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

/*
 * 014/T028 — `/configuracion`.
 *
 * The wire vocabulary here is the matrix's: archetype CODES (`SA`, `MP`…) and the states
 * `pending`, `revoked`, `retired`, `active`. A firm administrator reads "Administrador", "Socio",
 * "Retirado". The codes are checked case-sensitively, so "S.A." in a firm name does not trip it.
 */
import { InviteUserDialog } from '@/app/configuracion/components/InviteUserDialog';
import { InvitationLinkModal } from '@/app/configuracion/components/InvitationLinkModal';
import { PendingInvitationsTable } from '@/app/configuracion/components/PendingInvitationsTable';
import { UserListTable } from '@/app/configuracion/components/UserListTable';
import { StepUpDialog } from '@/app/configuracion/components/StepUpDialog';
import { PositionCatalogTable } from '@/app/configuracion/components/PositionCatalogTable';
import { PermissionsMatrixView } from '@/app/configuracion/components/PermissionsMatrixView';
import { RolesTab } from '@/app/configuracion/components/RolesTab';
import { screen as adminScreen } from '@testing-library/react';

const ARCHETYPE_CODES = /\b(SA|MP|AA|PL|CM|BM|PO)\b/;
const ADMIN_WIRE_WORDS = /\b(pending|revoked|retired|active|invitation|membership|archetype|position)\b/i;

function assertNoAdminWireVocabulary(container: HTMLElement): void {
  const text = renderedWords(container);
  expect(text, `an archetype code reached the screen: "${text}"`).not.toMatch(ARCHETYPE_CODES);
  expect(text, `the wire's own vocabulary reached the screen: "${text}"`).not.toMatch(ADMIN_WIRE_WORDS);
}

function answer(table: Record<string, unknown>) {
  vi.stubGlobal('fetch', (url: string) => {
    const path = String(url).replace(/^\/api\/lc/, '').split('?')[0]!;
    return Promise.resolve(
      new Response(JSON.stringify(table[path] ?? { items: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  });
}

describe('administration copy is Spanish-only (014/T028)', () => {
  const MEMBERS = {
    items: [
      { membershipId: 'm1', email: 'ana@despachoalfa.mx', archetype: 'SA', positionName: null },
      { membershipId: 'm2', email: 'lucia@despachoalfa.mx', archetype: 'AA', positionName: 'Asociado Senior' },
    ],
  };
  const INVITATIONS = {
    items: [
      {
        id: 'i1',
        targetArchetype: 'PL',
        status: 'pending',
        issuedAt: '2026-09-23T18:00:00Z',
        expiresAt: '2026-09-30T18:00:00Z',
        invitedEmail: 'nuevo@despachoalfa.mx',
      },
    ],
  };
  const POSITIONS = {
    items: [
      { id: 'p1', name: 'Asociado Senior', status: 'active' },
      { id: 'p2', name: 'Pasante de verano', status: 'retired' },
    ],
  };

  it('InviteUserDialog', () => {
    withQueryClient(<InviteUserDialog open issuerArchetype="SA" onClose={() => {}} onIssued={() => {}} />);
    assertOnlySpanish(document.body);
    assertNoAdminWireVocabulary(document.body);
  });

  it('InvitationLinkModal', () => {
    render(
      <InvitationLinkModal
        invitation={{
          id: 'i1',
          targetArchetype: 'AA',
          status: 'pending',
          issuedAt: '2026-09-23T18:00:00Z',
          expiresAt: '2026-09-30T18:00:00Z',
          invitationLink: '/aceptar/abc',
        }}
        onClose={() => {}}
      />,
    );
    assertOnlySpanish(document.body);
    assertNoAdminWireVocabulary(document.body);
  });

  it('StepUpDialog', () => {
    render(<StepUpDialog open capability="invitation.issue" onVerified={() => {}} onCancel={() => {}} />);
    assertOnlySpanish(document.body);
    assertNoAdminWireVocabulary(document.body);
  });

  it('UserListTable', async () => {
    answer({ '/tenant/members': MEMBERS });
    const { container } = withQueryClient(<UserListTable archetype="SA" />);
    await adminScreen.findByText('lucia@despachoalfa.mx');
    assertOnlySpanish(container);
    assertNoAdminWireVocabulary(container);
    vi.unstubAllGlobals();
  });

  it('PendingInvitationsTable', async () => {
    answer({ '/tenant/invitations': INVITATIONS });
    const { container } = withQueryClient(<PendingInvitationsTable archetype="SA" />);
    await adminScreen.findByText('nuevo@despachoalfa.mx');
    assertOnlySpanish(container);
    assertNoAdminWireVocabulary(container);
    vi.unstubAllGlobals();
  });

  it('PositionCatalogTable', async () => {
    answer({ '/tenant/directory/positions': POSITIONS });
    const { container } = withQueryClient(<PositionCatalogTable archetype="SA" />);
    await adminScreen.findByText('Pasante de verano');
    assertOnlySpanish(container);
    assertNoAdminWireVocabulary(container);
    vi.unstubAllGlobals();
  });

  it('RolesTab', async () => {
    answer({ '/tenant/members': MEMBERS, '/tenant/directory/positions': POSITIONS });
    const { container } = withQueryClient(<RolesTab archetype="SA" />);
    await adminScreen.findByText('lucia@despachoalfa.mx');
    assertOnlySpanish(container);
    assertNoAdminWireVocabulary(container);
    vi.unstubAllGlobals();
  });

  it('PermissionsMatrixView', () => {
    const { container } = render(<PermissionsMatrixView />);
    assertOnlySpanish(container);
    assertNoAdminWireVocabulary(container);
  });
});

/*
 * 021/T028 — the documents screens.
 *
 * The wire's vocabulary here: `withdrawn`, `active`, `retired`, the `renderAs` values
 * (`unsupported`, `converted-pdf`), and — the one that had shipped — the default category's
 * English name, `Unclassified`, which every firm saw before 021's Decision 5.
 */
import { UploadDialog } from '@/app/expedientes/[caseId]/documentos/UploadDialog';
import { DocumentsView } from '@/app/expedientes/[caseId]/documentos/DocumentsView';
import { WithdrawnList } from '@/app/expedientes/[caseId]/documentos/WithdrawnList';
import { DocumentCategoriesTab } from '@/app/configuracion/components/DocumentCategoriesTab';
import { FirmDocuments } from '@/app/documentos/FirmDocuments';
import { UploadFromFirmDialog } from '@/app/documentos/UploadFromFirmDialog';

const DOCUMENT_WIRE_WORDS = /\b(withdrawn|active|retired|unclassified|unsupported|converted|pending|document|category)\b/i;

function assertNoDocumentWireVocabulary(container: HTMLElement): void {
  const text = renderedWords(container);
  expect(text, `the wire's own vocabulary reached the screen: "${text}"`).not.toMatch(DOCUMENT_WIRE_WORDS);
}

describe('document copy is Spanish-only (021/T028)', () => {
  const DOC = {
    id: 'd1', caseId: 'k1', categoryId: 'c2', categoryName: 'Unclassified', categoryStatus: 'retired',
    originalFilename: 'contrato.pdf', mimeType: 'application/pdf', sizeBytes: 482913,
    uploadedByMembershipId: 'm1', uploadedAt: '2026-09-20T17:00:00Z', status: 'active', withdrawnAt: null,
  };
  const CATEGORIES = { items: [{ id: 'c1', name: 'Contrato', status: 'active' }, { id: 'c2', name: 'Unclassified', status: 'retired' }] };
  const CASE = { id: 'k1', fileNumber: 'EXP-1', client: { id: 'cl', legalName: 'Grupo Torres', status: 'active' }, status: { id: 's', name: 'En proceso', isClosing: false, catalogStatus: 'active' }, matterType: null, venue: null, openedOn: '2026-09-01', closedOn: null, team: [] };

  it('UploadDialog', async () => {
    answer({ '/tenant/document-categories': CATEGORIES });
    withQueryClient(<UploadDialog open caseId="k1" onClose={() => {}} onUploaded={() => {}} />);
    await adminScreen.findByRole('option', { name: 'Contrato' });
    assertOnlySpanish(document.body);
    assertNoDocumentWireVocabulary(document.body);
    vi.unstubAllGlobals();
  });

  it('DocumentsView — list, tabs and empty preview', async () => {
    answer({ '/tenant/cases/k1': CASE, '/tenant/cases/k1/documents': { items: [DOC] } });
    const { container } = withQueryClient(<DocumentsView caseId="k1" archetype="MP" />);
    await adminScreen.findByText('contrato.pdf');
    assertOnlySpanish(container);
    assertNoDocumentWireVocabulary(container);
    vi.unstubAllGlobals();
  });

  it('WithdrawnList', async () => {
    answer({ '/tenant/cases/k1/documents/withdrawn': { items: [{ ...DOC, status: 'withdrawn', withdrawnAt: '2026-09-21T00:00:00Z' }] } });
    const { container } = withQueryClient(<WithdrawnList caseId="k1" />);
    await adminScreen.findByText('contrato.pdf');
    assertOnlySpanish(container);
    assertNoDocumentWireVocabulary(container);
    vi.unstubAllGlobals();
  });

  it('DocumentCategoriesTab', async () => {
    answer({ '/tenant/document-categories': CATEGORIES });
    const { container } = withQueryClient(<DocumentCategoriesTab archetype="MP" />);
    await adminScreen.findByText('Contrato');
    assertOnlySpanish(container);
    assertNoDocumentWireVocabulary(container);
    vi.unstubAllGlobals();
  });

  /*
   * 023/T025 — the firm-wide screen. This suite imports each component explicitly rather than
   * scanning the filesystem, so a new screen is covered only by being added here. The
   * firm-wide list also introduces one string the per-case list never had — the count
   * ("N documentos") — and one field, the matter's file number, which must not arrive as
   * "file number".
   */
  const FIRM_DOC = {
    ...DOC,
    caseId: 'k1',
    caseFileNumber: 'EXP-2026-2001',
    categoryName: 'Contrato',
    categoryStatus: 'active',
  };

  it('FirmDocuments — the firm-wide list, its count and its filters', async () => {
    answer({
      '/tenant/documents': { items: [FIRM_DOC], nextCursor: null, total: 1 },
      '/tenant/document-categories': CATEGORIES,
      '/tenant/cases': { items: [{ id: 'k1', fileNumber: 'EXP-2026-2001', client: { id: 'cl', legalName: 'Grupo Torres', status: 'active' } }], nextCursor: null },
    });
    const { container } = withQueryClient(<FirmDocuments archetype="MP" />);
    await adminScreen.findByText('contrato.pdf');
    assertOnlySpanish(container);
    assertNoDocumentWireVocabulary(container);
    vi.unstubAllGlobals();
  });

  it('UploadFromFirmDialog — the matter step', async () => {
    answer({ '/tenant/document-categories': CATEGORIES });
    withQueryClient(
      <UploadFromFirmDialog
        open
        cases={[{ id: 'k1', fileNumber: 'EXP-2026-2001' }]}
        onClose={() => {}}
        onUploaded={() => {}}
      />,
    );
    await adminScreen.findByLabelText('Expediente');
    assertOnlySpanish(document.body);
    assertNoDocumentWireVocabulary(document.body);
    vi.unstubAllGlobals();
  });
});

/*
 * 013/T016 — the calendar. Its wire vocabulary is the event types and statuses: `hearing`,
 * `deadline`, `meeting`, `other`, `scheduled`, `cancelled`. A firm reads "Audiencia",
 * "Vencimiento", "Reunión", "Cancelado".
 */
import { CalendarView } from '@/app/calendario/CalendarView';
import { EventDialog } from '@/app/calendario/EventDialog';

const CALENDAR_WIRE_WORDS = /\b(hearing|deadline|meeting|scheduled|cancelled|all.?day|reminder)\b/i;

function assertNoCalendarWireVocabulary(container: HTMLElement): void {
  const text = renderedWords(container);
  expect(text, `the wire's own vocabulary reached the screen: "${text}"`).not.toMatch(CALENDAR_WIRE_WORDS);
}

describe('calendar copy is Spanish-only (013/T016)', () => {
  const EVENT = {
    id: 'ev1', type: 'hearing', title: 'Audiencia de pruebas', description: null, location: 'Juzgado 4',
    allDay: false, startsAt: '2026-09-23T16:00:00.000Z', endsAt: null, startsOn: null, endsOn: null,
    case: { id: 'k1', fileNumber: 'EXP-1' }, remindMinutesBefore: 60, status: 'cancelled',
    cancelledAt: '2026-09-22T00:00:00Z', createdByMembershipId: 'm', createdAt: 'x',
  };
  const DEADLINE = { ...EVENT, id: 'ev2', type: 'deadline', title: 'Vence plazo', allDay: true, startsAt: null, startsOn: '2026-09-23', status: 'scheduled', cancelledAt: null };

  it('CalendarView — grid, day list and reminders', async () => {
    answer({ '/tenant/calendar/events': { items: [EVENT, DEADLINE] }, '/tenant/calendar/reminders': { items: [DEADLINE] } });
    const { container } = withQueryClient(<CalendarView archetype="MP" today="2026-09-23" />);
    await adminScreen.findAllByText('Vence plazo');
    assertOnlySpanish(container);
    assertNoCalendarWireVocabulary(container);
    vi.unstubAllGlobals();
  });

  it('EventDialog', async () => {
    answer({ '/tenant/cases': { items: [], nextCursor: null } });
    withQueryClient(<EventDialog open mode="create" date="2026-09-23" onClose={() => {}} onSaved={() => {}} />);
    await adminScreen.findByLabelText(/^título/i);
    assertOnlySpanish(document.body);
    assertNoCalendarWireVocabulary(document.body);
    vi.unstubAllGlobals();
  });
});
