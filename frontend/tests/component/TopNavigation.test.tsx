/**
 * The top bar (branch `feat/top-navigation-layout`): sections in a row, the unbuilt ones under
 * "Más", settings and sign-out with the account controls.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/session/sign-out', () => ({ signOutAction: vi.fn() }));
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  usePathname: () => '/clientes',
}));

import { Header } from '@/shell/Header';
import { NAVIGATION_ITEMS } from '@/shell/navigation-items';
import type { ActiveMembership } from '@/session/types';

const SA: ActiveMembership = { tenantId: 'tenant-a', tenantName: 'Despacho Alfa, S.C.', archetype: 'SA' };
const BM: ActiveMembership = { ...SA, archetype: 'BM' };

function renderHeader(membership: ActiveMembership = SA): void {
  render(
    <Header
      activeMembership={membership}
      memberships={[membership]}
      onSwitchTenant={vi.fn()}
      items={NAVIGATION_ITEMS}
      onOpenNavigation={vi.fn()}
    />,
  );
}

describe('top navigation bar', () => {
  it('draws the built sections as links in the row, and marks the current one', () => {
    renderHeader();
    const nav = screen.getByTestId('shell-nav');
    expect(within(nav).getByRole('link', { name: 'Expedientes' })).toHaveAttribute('href', '/expedientes');
    expect(within(nav).getByRole('link', { name: 'Clientes' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: 'Expedientes' })).not.toHaveAttribute('aria-current');
  });

  it('does not offer an unbuilt section as a link — it sits under "Más", inert', async () => {
    renderHeader();
    expect(screen.queryByRole('link', { name: 'Conectores Judiciales' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /más/i }));

    const unbuilt = screen.getByTestId('nav-item-conectores');
    expect(unbuilt).toHaveAttribute('data-unavailable', 'true');
    expect(unbuilt.tagName).toBe('SPAN');
  });

  it('draws Configuración beside the account controls for an archetype that holds it', () => {
    renderHeader(SA);
    expect(screen.getByRole('link', { name: 'Configuración' })).toHaveAttribute('href', '/configuracion');
  });

  it('draws no link for a section the archetype does not hold', () => {
    renderHeader(BM);
    expect(screen.queryByRole('link', { name: 'Configuración' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Expedientes' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Clientes' })).toBeInTheDocument();
  });

  it('names the role beside the firm, in Spanish', () => {
    renderHeader();
    expect(screen.getByTestId('active-tenant-name')).toHaveTextContent('Despacho Alfa, S.C.');
    expect(screen.getByText('Administrador')).toBeInTheDocument();
  });

  it('keeps sign-out a form submit, so it works before hydration', () => {
    renderHeader();
    const control = screen.getByRole('button', { name: /cerrar sesión/i });
    expect(control).toBeEnabled();
    expect(control).toHaveAttribute('type', 'submit');
    expect(control.closest('form')).not.toBeNull();
  });

  it('offers the menu button that opens the drawer on narrow screens', () => {
    renderHeader();
    expect(screen.getByRole('button', { name: /abrir navegación/i })).toBeInTheDocument();
  });
});
