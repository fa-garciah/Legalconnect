/**
 * T030 — US2. FR-008.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Header } from '@/shell/Header';
import type { ActiveMembership } from '@/session/types';

const ACTIVE: ActiveMembership = { tenantId: 'tenant-a', tenantName: 'Despacho Alfa, S.C.', archetype: 'SA' };

describe('Header', () => {
  it('names the active tenant whenever a tenant context is active', () => {
    render(<Header activeMembership={ACTIVE} memberships={[ACTIVE]} onSwitchTenant={vi.fn()} />);
    expect(screen.getByText('Despacho Alfa, S.C.')).toBeInTheDocument();
  });

  it('renders no switch control when the identity holds exactly one membership', () => {
    render(<Header activeMembership={ACTIVE} memberships={[ACTIVE]} onSwitchTenant={vi.fn()} />);
    expect(screen.queryByTestId('tenant-switcher')).not.toBeInTheDocument();
  });

  it('renders a switch control when the identity holds more than one membership', () => {
    const second: ActiveMembership = { tenantId: 'tenant-b', tenantName: 'Bufete Beta, S.C.', archetype: 'MP' };
    render(<Header activeMembership={ACTIVE} memberships={[ACTIVE, second]} onSwitchTenant={vi.fn()} />);
    expect(screen.getByTestId('tenant-switcher')).toBeInTheDocument();
  });
});
