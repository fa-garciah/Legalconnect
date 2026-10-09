/**
 * 008 — months as the API reads them: `YYYY-MM`, Mexico City (Decision 7). Named zone, never an
 * offset, and never the browser's own zone.
 */
const ZONE = 'America/Mexico_City';

export function mexicoMonth(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit' }).format(now).slice(0, 7);
}

export function shiftMonthKey(month: string, by: number): string {
  const [year, index] = month.split('-').map(Number) as [number, number];
  const total = year * 12 + (index - 1) + by;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

/** "Octubre de 2026". Formatted at noon UTC of the 15th, which is that month in every zone. */
export function monthLabel(month: string): string {
  const label = new Intl.DateTimeFormat('es-MX', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(
    new Date(`${month}-15T12:00:00Z`),
  );
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** "8 oct, 11:00" in Mexico City — when a note was written or a change made. */
export function momentLabel(iso: string): string {
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: ZONE,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}
