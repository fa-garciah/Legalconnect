/**
 * Role names must not be mistakable for one another. "Administración" (BM, billing) and
 * "Administrador" (SA, full administration) differed by two letters, and a real invitation went
 * out with the wrong one: the person expected to administer the firm and saw only Clientes.
 */
import { describe, expect, it } from 'vitest';
import { ARCHETYPE_LABEL } from '@/shell/archetype-labels';

describe('archetype labels', () => {
  it('names BM for what it does: billing and collections', () => {
    expect(ARCHETYPE_LABEL.BM).toBe('Facturación y cobranza');
  });

  it('keeps SA as the only "Administr…" role', () => {
    const admin = Object.entries(ARCHETYPE_LABEL).filter(([, label]) => /^administr/i.test(label));
    expect(admin).toEqual([['SA', 'Administrador']]);
  });

  it('gives every role a distinct name', () => {
    const labels = Object.values(ARCHETYPE_LABEL);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
