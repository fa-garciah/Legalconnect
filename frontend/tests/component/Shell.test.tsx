/**
 * T023 — US1. FR-001, FR-006, FR-007.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/*
 * `Shell` now calls `router.refresh()` when the firm changes (see the tests at the end), so it
 * needs the App Router's hook. Mocked here as the auth suites already do, file by file.
 */
const refresh = vi.fn();
vi.mock('next/navigation', async (importOriginal) => ({
  // Partial: `NavigationMenu` still needs the real `usePathname`; only the router is faked.
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ refresh, push: vi.fn() }),
}));
vi.mock('@/session/sign-out', () => ({ signOutAction: vi.fn() }));

import { Shell } from '@/shell/Shell';
import type { Principal } from '@/session/types';
import type { NavigationItem } from '@/shell/navigation-items';

function renderShell(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const PRINCIPAL: Principal = {
  authenticated: true,
  identityId: 'identity-1',
  memberships: [{ tenantId: 'tenant-a', tenantName: 'Despacho Alfa, S.C.', archetype: 'SA' }],
};

const ITEMS: readonly NavigationItem[] = [
  { id: 'module-a', label: 'Módulo A', href: '/a' },
  { id: 'module-b', label: 'Módulo B', href: '/b' },
];

describe('Shell', () => {
  it('renders a header and a navigation menu on every screen', () => {
    renderShell(
      <Shell principal={PRINCIPAL} initialActiveTenant={{ status: 'active', tenantId: 'tenant-a' }} items={ITEMS}>
        <div data-testid="page-content">Contenido</div>
      </Shell>,
    );
    expect(screen.getByTestId('shell-header')).toBeInTheDocument();
    expect(screen.getByTestId('shell-nav')).toBeInTheDocument();
    expect(screen.getByTestId('page-content')).toBeInTheDocument();
  });

  it('selecting a visible item changes only the content region — header and menu stay mounted', async () => {
    const user = userEvent.setup();
    renderShell(
      <Shell principal={PRINCIPAL} initialActiveTenant={{ status: 'active', tenantId: 'tenant-a' }} items={ITEMS}>
        <div data-testid="page-content">Contenido inicial</div>
      </Shell>,
    );
    const header = screen.getByTestId('shell-header');
    const nav = screen.getByTestId('shell-nav');

    await user.click(screen.getByText('Módulo B'));

    // The header and nav DOM nodes are the SAME nodes — never unmounted/remounted.
    expect(screen.getByTestId('shell-header')).toBe(header);
    expect(screen.getByTestId('shell-nav')).toBe(nav);
  });

  it('with no active tenant context and MORE THAN ONE membership, zero navigation items render and a directive to establish one renders instead (FR-007)', () => {
    const twoMemberships = {
      ...PRINCIPAL,
      memberships: [
        ...PRINCIPAL.memberships,
        { tenantId: 'tenant-b', tenantName: 'Bufete Beta, S.C.', archetype: 'MP' as const },
      ],
    };
    renderShell(
      <Shell principal={twoMemberships} initialActiveTenant={{ status: 'none' }} items={ITEMS}>
        <div data-testid="page-content">No debería verse</div>
      </Shell>,
    );
    expect(screen.queryByTestId('shell-nav')).not.toBeInTheDocument();
    expect(screen.getByTestId('no-active-tenant')).toBeInTheDocument();
    expect(screen.queryByText('Módulo A')).not.toBeInTheDocument();
  });

  it('with no active tenant context and EXACTLY ONE membership, that tenant is auto-selected (data-model.md ActiveTenant transition)', () => {
    renderShell(
      <Shell principal={PRINCIPAL} initialActiveTenant={{ status: 'none' }} items={ITEMS}>
        <div data-testid="page-content">Contenido</div>
      </Shell>,
    );
    expect(screen.queryByTestId('no-active-tenant')).not.toBeInTheDocument();
    expect(screen.getByTestId('shell-header')).toBeInTheDocument();
    expect(screen.getByTestId('page-content')).toBeInTheDocument();
  });

  /*
   * Found in the browser on 2026-09-22. The page under the shell is a SERVER component that
   * resolves the caller's firm — and therefore their role — when it renders. Choosing a
   * firm, or switching firms in the header, changed the shell on the client and left the
   * page exactly as the server first drew it: EMPTY after the firm picker, and — worse —
   * drawn with the PREVIOUS firm's role after a switch, so a Socio in one firm and an
   * Asociado in another kept seeing Socio controls. The API still refused what they could
   * not do; the screen was simply wrong. A refresh re-renders the server components under
   * the new cookie.
   */
  it('choosing a firm on the picker re-renders the server-rendered page', async () => {
    refresh.mockClear();
    const twoMemberships = {
      ...PRINCIPAL,
      memberships: [
        ...PRINCIPAL.memberships,
        { tenantId: 'tenant-b', tenantName: 'Bufete Beta, S.C.', archetype: 'AA' as const },
      ],
    };
    renderShell(
      <Shell principal={twoMemberships} initialActiveTenant={{ status: 'none' }} items={ITEMS}>
        <div data-testid="page-content">Contenido</div>
      </Shell>,
    );

    await userEvent.click(screen.getByRole('button', { name: /Bufete Beta, S\.C\./ }));

    expect(refresh).toHaveBeenCalled();
    expect(screen.getByTestId('page-content')).toBeInTheDocument();
  });

  it('a stale remembered firm does not strand a single-firm identity', () => {
    renderShell(
      <Shell
        principal={PRINCIPAL}
        initialActiveTenant={{ status: 'active', tenantId: 'a-tenant-from-an-old-seed' }}
        items={ITEMS}
      >
        <div data-testid="page-content">Contenido</div>
      </Shell>,
    );

    expect(screen.queryByTestId('no-active-tenant')).not.toBeInTheDocument();
    expect(screen.getByTestId('page-content')).toBeInTheDocument();
  });
});
