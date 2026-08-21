import { ValidationFailed } from '../../common/http/errors';
import type { Archetype } from '../../common/tenant/principal';

const MEMBERSHIP_ARCHETYPES: readonly Archetype[] = [
  'SA',
  'MP',
  'AA',
  'PL',
  'CM',
  'BM',
  'CC',
  'IC',
  'CB',
  'EL',
];

export function normaliseEmail(raw: unknown): string {
  if (typeof raw !== 'string') throw new ValidationFailed('An email is required.');
  const value = raw.trim();
  if (value.length === 0 || !value.includes('@')) {
    throw new ValidationFailed('A valid email is required.');
  }
  return value;
}

export function normaliseArchetype(raw: unknown): Archetype {
  if (typeof raw !== 'string' || !MEMBERSHIP_ARCHETYPES.includes(raw as Archetype)) {
    throw new ValidationFailed(`The target archetype must be one of: ${MEMBERSHIP_ARCHETYPES.join(', ')}.`);
  }
  return raw as Archetype;
}
