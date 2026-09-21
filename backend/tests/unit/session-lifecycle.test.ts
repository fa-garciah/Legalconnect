/**
 * T009 — `roleClassFor()` and `SESSION_LIMITS`. research.md D3.
 *
 * No DB, no NestJS — a pure function, the same style capability.ts already
 * established, unit-testable standalone.
 */
import { describe, expect, it } from 'vitest';
import {
  roleClassFor,
  SESSION_LIMITS,
  type RoleClass,
} from '../../src/common/auth/session-lifecycle';
import type { archetype } from '../../src/common/db/schema';

type Archetype = (typeof archetype.enumValues)[number];

const INTERNAL: readonly Archetype[] = ['MP', 'AA', 'PL', 'CM', 'BM'];
const PORTAL: readonly Archetype[] = ['CC', 'IC', 'CB', 'EL'];

describe('roleClassFor() (research.md D3)', () => {
  it.each(INTERNAL)('%s maps to internal', (archetype) => {
    expect(roleClassFor(archetype)).toBe('internal');
  });

  it('SA maps to sa', () => {
    expect(roleClassFor('SA')).toBe('sa');
  });

  it.each(PORTAL)('%s maps to portal', (archetype) => {
    expect(roleClassFor(archetype)).toBe('portal');
  });

  it('null (no active tenant context) maps to sa — the tightest default', () => {
    expect(roleClassFor(null)).toBe('sa');
  });
});

describe('SESSION_LIMITS (constitution § Sessions, cited not derived)', () => {
  it('holds exactly the six numbers the constitution states', () => {
    const expected: Record<RoleClass, { idleMinutes: number; absoluteMinutes: number }> = {
      internal: { idleMinutes: 8 * 60, absoluteMinutes: 12 * 60 },
      sa: { idleMinutes: 30, absoluteMinutes: 8 * 60 },
      portal: { idleMinutes: 2 * 60, absoluteMinutes: 24 * 60 },
    };
    expect(SESSION_LIMITS).toEqual(expected);
  });

  it('has exactly three role classes, no more, no fewer', () => {
    expect(Object.keys(SESSION_LIMITS).sort()).toEqual(['internal', 'portal', 'sa']);
  });
});
