/**
 * T029 — US2. FR-009, FR-010, SC-008.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TenantSwitcher } from '@/shell/TenantSwitcher';
import type { ActiveMembership } from '@/session/types';

const TWO: readonly ActiveMembership[] = [
  { tenantId: 'tenant-a', tenantName: 'Despacho Alfa, S.C.', archetype: 'SA' },
  { tenantId: 'tenant-b', tenantName: 'Bufete Beta, S.C.', archetype: 'MP' },
];

const ONE: readonly ActiveMembership[] = [TWO[0]!];

describe('TenantSwitcher', () => {
  it('with 2 live memberships, renders a control listing both tenant names', () => {
    render(<TenantSwitcher memberships={TWO} activeTenantId="tenant-a" onSwitch={vi.fn()} />);
    expect(screen.getByTestId('tenant-switcher')).toBeInTheDocument();
    expect(screen.getByText('Despacho Alfa, S.C.')).toBeInTheDocument();
    expect(screen.getByText('Bufete Beta, S.C.')).toBeInTheDocument();
  });

  it('with exactly 1 live membership, renders no switch control (FR-010, SC-008)', () => {
    render(<TenantSwitcher memberships={ONE} activeTenantId="tenant-a" onSwitch={vi.fn()} />);
    expect(screen.queryByTestId('tenant-switcher')).not.toBeInTheDocument();
  });

  it('selecting a tenant calls onSwitch with that tenant id', async () => {
    const user = userEvent.setup();
    const onSwitch = vi.fn();
    render(<TenantSwitcher memberships={TWO} activeTenantId="tenant-a" onSwitch={onSwitch} />);

    await user.selectOptions(screen.getByTestId('tenant-switcher'), 'tenant-b');

    expect(onSwitch).toHaveBeenCalledWith('tenant-b');
  });
});
