/**
 * 014 T026 (US3, Decision 1: read-only). Roles are fixed by the product; a firm decides who holds
 * each role, not what a role may do (004 Decision 4). So nothing on this tab is interactive, and
 * it says why.
 */
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { PermissionsMatrixView } from '@/app/configuracion/components/PermissionsMatrixView';

describe('PermissionsMatrixView', () => {
  it('has no interactive control at all', () => {
    const { container } = render(<PermissionsMatrixView />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(screen.queryAllByRole('switch')).toHaveLength(0);
    expect(container.querySelectorAll('input, select, textarea')).toHaveLength(0);
  });

  it('explains that roles are fixed by the product', () => {
    render(<PermissionsMatrixView />);
    expect(screen.getByRole('note')).toHaveTextContent(/los roles los define legalconnect/i);
  });

  it('names roles in Spanish as column headers', () => {
    render(<PermissionsMatrixView />);
    const table = screen.getAllByRole('table')[0]!;
    for (const label of ['Administrador', 'Socio', 'Abogado asociado', 'Pasante', 'Gestor de casos', 'Administración']) {
      expect(within(table).getByRole('columnheader', { name: label })).toBeInTheDocument();
    }
  });

  it('states each cell in words, not only with an icon', () => {
    render(<PermissionsMatrixView />);
    const table = screen.getAllByRole('table')[0]!;
    expect(within(table).getAllByText(/^(permitido|no permitido)$/i).length).toBeGreaterThan(0);
  });
});
