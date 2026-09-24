/**
 * 021 T014. How a document's size and category read to a Mexican firm.
 */
import { describe, expect, it } from 'vitest';
import { categoryLabel, formatBytes } from '@/documents/format';

describe('formatBytes', () => {
  it.each([
    [0, '0 B'],
    [512, '512 B'],
    [482_913, '472 KB'],
    [1_258_291, '1.2 MB'],
    [26_214_400, '25 MB'],
  ])('%d bytes → %s', (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });
});

describe('categoryLabel', () => {
  it('shows the default category as "Sin clasificar" whatever it is stored as', () => {
    expect(categoryLabel('Unclassified')).toBe('Sin clasificar');
    expect(categoryLabel(' unclassified ')).toBe('Sin clasificar');
    expect(categoryLabel('Sin clasificar')).toBe('Sin clasificar');
  });

  it('shows every other category exactly as the firm named it', () => {
    expect(categoryLabel('Contrato')).toBe('Contrato');
  });
});
