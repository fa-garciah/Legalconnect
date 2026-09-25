/**
 * 023 — grid or list. FR-011, Decision 8.
 *
 * Two buttons rather than a toggle group, so each carries its own accessible name in Spanish
 * and the current mode is expressed with `aria-pressed` — which a `<Tabs>` would have made a
 * navigation, and this is not navigation.
 */
'use client';

import { LayoutGrid, List } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ViewMode } from '@/documents/view-mode';

export interface ViewModeToggleProps {
  readonly mode: ViewMode;
  readonly onChange: (mode: ViewMode) => void;
}

export function ViewModeToggle({ mode, onChange }: ViewModeToggleProps): React.JSX.Element {
  return (
    <div className="flex items-center gap-1">
      <Button
        variant={mode === 'grid' ? 'secondary' : 'ghost'}
        size="sm"
        aria-pressed={mode === 'grid'}
        aria-label="Ver como cuadrícula"
        onClick={() => onChange('grid')}
      >
        <LayoutGrid aria-hidden className="h-4 w-4" />
      </Button>
      <Button
        variant={mode === 'list' ? 'secondary' : 'ghost'}
        size="sm"
        aria-pressed={mode === 'list'}
        aria-label="Ver como lista"
        onClick={() => onChange('list')}
      >
        <List aria-hidden className="h-4 w-4" />
      </Button>
    </div>
  );
}
