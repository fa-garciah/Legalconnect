/**
 * T075 — RFC validation and normalisation.
 *
 * 12 characters for a moral person (3 letters + 6 digits + 3 homoclave), 13 for a
 * physical one (4 letters). Rejecting 13 would exclude the sole practitioner, who is a
 * real customer shape for this product, not an edge case.
 *
 * Normalised to uppercase BEFORE the uniqueness check. Without that, one legal entity
 * could hold two tenant rows differing only in case, and FR-007's guarantee would be
 * true of the string rather than of the firm.
 */
import { ValidationFailed } from '../../common/http/errors';

const RFC_SHAPE = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;

export function normaliseRfc(raw: unknown): string {
  if (typeof raw !== 'string') throw new ValidationFailed('An RFC is required.');
  const value = raw.trim().toUpperCase();
  if (!RFC_SHAPE.test(value)) {
    throw new ValidationFailed(
      'The RFC must be 12 characters for a moral person or 13 for a physical one, ' +
        'with six digits and a three-character homoclave.',
    );
  }
  return value;
}

export function normaliseName(raw: unknown): string {
  if (typeof raw !== 'string') throw new ValidationFailed('A name is required.');
  const value = raw.trim();
  if (value.length === 0) throw new ValidationFailed('A name is required.');
  if (value.length > 300) throw new ValidationFailed('The name is too long.');
  return value;
}

export const PLAN_CODES = ['esencial', 'profesional', 'premium'] as const;
export type PlanCode = (typeof PLAN_CODES)[number];

export function normalisePlanCode(raw: unknown): PlanCode {
  if (typeof raw !== 'string' || !PLAN_CODES.includes(raw as PlanCode)) {
    throw new ValidationFailed(`The plan must be one of: ${PLAN_CODES.join(', ')}.`);
  }
  return raw as PlanCode;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assertUuid(raw: string, what: string): string {
  if (!UUID.test(raw)) throw new ValidationFailed(`The ${what} is not a valid identifier.`);
  return raw;
}
