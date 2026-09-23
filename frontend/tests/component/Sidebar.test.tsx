/**
 * The rail's sign-out control. `005-session-lifecycle`, US1.
 *
 * `Sidebar` shipped this control DISABLED, with a comment saying authentication was
 * slice `003` and there was no session to end — and a note that rendering it
 * disabled rather than plausibly-wired was deliberate, because "a control that
 * appears to sign you out and does not is a security-shaped lie." `003` shipped the
 * session and `005` shipped the revocation route, so the control is now wired and
 * this file is what keeps it from quietly regressing to inert.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Sidebar, initialsOf } from '@/shell/Sidebar';
import type { ActiveMembership } from '@/session/types';
import type { NavigationItem } from '@/shell/navigation-items';

vi.mock('@/session/sign-out', () => ({ signOutAction: vi.fn() }));

const ACTIVE: ActiveMembership = {
  tenantId: 'tenant-a',
  tenantName: 'Despacho Alfa, S.C.',
  archetype: 'MP',
};
const ITEMS: readonly NavigationItem[] = [
  { id: 'clientes', label: 'Clientes', href: '/clientes' },
];

function renderSidebar(): void {
  render(<Sidebar items={ITEMS} activeMembership={ACTIVE} displayName="Ana Ruiz Mendoza" />);
}

describe('Sidebar sign-out', () => {
  it('offers a sign-out control', () => {
    renderSidebar();
    expect(screen.getByRole('button', { name: /cerrar sesión/i })).toBeInTheDocument();
  });

  it('the control is ENABLED — the placeholder it replaced was not', () => {
    renderSidebar();
    expect(screen.getByRole('button', { name: /cerrar sesión/i })).toBeEnabled();
  });

  it('submits rather than merely calling a handler, so it works before hydration', () => {
    renderSidebar();
    const control = screen.getByRole('button', { name: /cerrar sesión/i });
    expect(control).toHaveAttribute('type', 'submit');
    expect(control.closest('form')).not.toBeNull();
  });

  it('says nothing about the control being unavailable', () => {
    renderSidebar();
    expect(screen.queryByText(/no disponible/i)).not.toBeInTheDocument();
    expect(screen.queryByTitle(/disponible cuando/i)).not.toBeInTheDocument();
  });

  it('still names the person and their role beside it', () => {
    renderSidebar();
    expect(screen.getByText('Ana Ruiz Mendoza')).toBeInTheDocument();
    expect(screen.getByText('Socio')).toBeInTheDocument();
  });
});

describe('initialsOf', () => {
  it('takes the first and last words', () => {
    expect(initialsOf('Ana Ruiz Mendoza')).toBe('AM');
  });

  it('takes one letter when there is one word', () => {
    expect(initialsOf('Ana')).toBe('A');
  });

  it('degrades to a placeholder rather than an empty box', () => {
    expect(initialsOf('   ')).toBe('·');
  });
});
