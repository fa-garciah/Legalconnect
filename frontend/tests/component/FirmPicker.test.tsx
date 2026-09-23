/**
 * The firm-selection screen. `016a`/FR-007's directive, given an actual screen.
 *
 * Shown only to somebody who belongs to more than one firm and has not chosen one (or whose
 * remembered choice is no longer valid). A single-firm identity never sees it — it enters
 * directly. The screen offers no way to JOIN a firm: membership comes from an invitation
 * a firm issues, and a join control would need to list firms the person does not belong
 * to, which is a cross-tenant disclosure.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

vi.mock('@/session/sign-out', () => ({ signOutAction: vi.fn() }));

import { FirmPicker } from '@/shell/FirmPicker';

const A = { tenantId: 'tenant-a', tenantName: 'Despacho Alfa, S.C.', archetype: 'MP' } as const;
const B = { tenantId: 'tenant-b', tenantName: 'Bufete Beta, S.C.', archetype: 'AA' } as const;

describe('FirmPicker', () => {
  it('lists every firm by name', () => {
    render(<FirmPicker memberships={[A, B]} onChoose={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Despacho Alfa, S\.C\./ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Bufete Beta, S\.C\./ })).toBeInTheDocument();
  });

  it('shows the role held in each firm, in Spanish', () => {
    render(<FirmPicker memberships={[A, B]} onChoose={vi.fn()} />);
    expect(screen.getByText('Socio')).toBeInTheDocument();
    expect(screen.getByText('Abogado asociado')).toBeInTheDocument();
  });

  it('enters the firm that is chosen', () => {
    const onChoose = vi.fn();
    render(<FirmPicker memberships={[A, B]} onChoose={onChoose} />);
    fireEvent.click(screen.getByRole('button', { name: /Bufete Beta, S\.C\./ }));
    expect(onChoose).toHaveBeenCalledWith('tenant-b');
  });

  it('always offers a way out', () => {
    render(<FirmPicker memberships={[A, B]} onChoose={vi.fn()} />);
    expect(screen.getByRole('button', { name: /cerrar sesión/i })).toBeInTheDocument();
  });

  it('offers no way to join a firm — membership comes only from an invitation', () => {
    render(<FirmPicker memberships={[A, B]} onChoose={vi.fn()} />);
    expect(screen.queryByText(/unirte|solicitar acceso|buscar firma/i)).not.toBeInTheDocument();
  });
});
