/**
 * T023 — US1. FR-001, FR-006, FR-007.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Shell } from '@/shell/Shell';
import type { Principal } from '@/session/types';
import type { NavigationItem } from '@/shell/navigation-items';

function renderShell(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const PRINCIPAL: Principal = {
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
});
