/**
 * 021 T015. How a document's size and category read on screen.
 */

const UNIT = 1024;

/** "472 KB", "1.2 MB" — one decimal below 10, none above, as a file browser shows them. */
export function formatBytes(bytes: number): string {
  if (bytes < UNIT) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'] as const;
  let value = bytes / UNIT;
  let unit = 0;
  while (value >= UNIT && unit < units.length - 1) {
    value /= UNIT;
    unit += 1;
  }
  const shown = value < 10 ? Math.round(value * 10) / 10 : Math.round(value);
  return `${shown} ${units[unit]}`;
}

/**
 * 021 Decision 5. The default category is "Sin clasificar". Migration 0045 renamed the stored
 * "Unclassified", but a firm that had already created its own "Sin clasificar" kept both rows, so
 * the English name can still arrive — and must never be shown.
 */
export function categoryLabel(name: string): string {
  return name.trim().toLowerCase() === 'unclassified' ? 'Sin clasificar' : name;
}
