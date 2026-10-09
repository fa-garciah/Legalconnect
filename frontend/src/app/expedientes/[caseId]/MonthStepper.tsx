/**
 * 008. One Mexico City month at a time (Decision 7), shared by `/notas` and `/actividad`: the month's
 * name as the list's heading, with a step back and a step forward.
 */
'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { monthLabel, shiftMonthKey } from '@/notes/month';

export function MonthStepper({
  month,
  onChange,
  headingId,
}: {
  readonly month: string;
  readonly onChange: (month: string) => void;
  readonly headingId: string;
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-2">
      <Button variant="outline" size="sm" onClick={() => onChange(shiftMonthKey(month, -1))} aria-label="Mes anterior">
        <ChevronLeft aria-hidden className="h-4 w-4" />
      </Button>
      <h2 id={headingId} className="font-display text-heading font-semibold">
        {monthLabel(month)}
      </h2>
      <Button variant="outline" size="sm" onClick={() => onChange(shiftMonthKey(month, 1))} aria-label="Mes siguiente">
        <ChevronRight aria-hidden className="h-4 w-4" />
      </Button>
    </div>
  );
}
