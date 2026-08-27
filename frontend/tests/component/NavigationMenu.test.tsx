/**
 * T022 — US1. FR-002 to FR-004, SC-001, SC-002.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NavigationMenu } from '@/shell/NavigationMenu';
import type { NavigationItem } from '@/shell/navigation-items';
import type { Archetype } from '@/session/types';

const ITEMS: readonly NavigationItem[] = [
  { id: 'everyone', label: 'Para todos', href: '/everyone' },
  { id: 'sa-only', label: 'Solo SA', href: '/sa-only', requiredArchetypes: ['SA'] },
];

const ARCHETYPES_HOLDING_SA_ITEM: readonly Archetype[] = ['SA'];
const ARCHETYPES_NOT_HOLDING_SA_ITEM: readonly Archetype[] = ['MP', 'AA', 'CC', 'EL'];

describe('NavigationMenu', () => {
  it('renders an item with no requiredArchetypes for every archetype tested (SC-002)', () => {
    for (const archetype of [...ARCHETYPES_HOLDING_SA_ITEM, ...ARCHETYPES_NOT_HOLDING_SA_ITEM]) {
      const { unmount } = render(<NavigationMenu items={ITEMS} archetype={archetype} />);
      expect(screen.getByText('Para todos')).toBeInTheDocument();
      unmount();
    }
  });

  it('does not render an archetype-gated item for an archetype that does not hold it (SC-001)', () => {
    for (const archetype of ARCHETYPES_NOT_HOLDING_SA_ITEM) {
      const { unmount } = render(<NavigationMenu items={ITEMS} archetype={archetype} />);
      expect(screen.queryByText('Solo SA')).not.toBeInTheDocument();
      unmount();
    }
  });

  it('renders an archetype-gated item for an archetype that holds it', () => {
    render(<NavigationMenu items={ITEMS} archetype="SA" />);
    expect(screen.getByText('Solo SA')).toBeInTheDocument();
  });
});
