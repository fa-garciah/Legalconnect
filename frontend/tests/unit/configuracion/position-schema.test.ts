/**
 * 014 T019 (US2). A new position's name, checked before it is sent.
 *
 * Mirrors `017`'s rules (`position.service.ts`): required, trimmed, at most 120 characters, and
 * unique among ACTIVE positions ignoring case. A retired name may be reused (017 research D6).
 */
import { describe, expect, it } from 'vitest';
import { positionNameSchema } from '@/configuracion/schema';

const catalog = [
  { id: 'p1', name: 'Asociado Senior', status: 'active' as const },
  { id: 'p2', name: 'Pasante de verano', status: 'retired' as const },
];

describe('position name schema', () => {
  it('requires a name', () => {
    expect(positionNameSchema(catalog).safeParse('   ').success).toBe(false);
  });

  it('trims it', () => {
    expect(positionNameSchema(catalog).safeParse('  Socio fundador ').data).toBe('Socio fundador');
  });

  it('refuses more than 120 characters', () => {
    expect(positionNameSchema(catalog).safeParse('x'.repeat(121)).success).toBe(false);
  });

  it('refuses a duplicate of an ACTIVE position, ignoring case', () => {
    const result = positionNameSchema(catalog).safeParse('asociado senior');
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/ya existe/i);
  });

  it('accepts the name of a RETIRED position', () => {
    expect(positionNameSchema(catalog).safeParse('Pasante de verano').success).toBe(true);
  });
});
