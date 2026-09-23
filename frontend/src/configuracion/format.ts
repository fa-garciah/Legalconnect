/**
 * Dates on `/configuracion`, as a Mexican reader writes them ("23 sept 2026"), in the firm's
 * own time zone rather than the browser's, so an invitation issued at 7 p.m. in Mexico City
 * does not read as tomorrow for someone travelling.
 */
const DATE = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'America/Mexico_City',
});

export function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : DATE.format(date).replace(/\./g, '');
}
