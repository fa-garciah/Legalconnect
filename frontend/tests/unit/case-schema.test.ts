/**
 * T040 — 019/US3. The validation the browser performs, and the validation it refuses to.
 *
 * **Both halves matter.** The first group asserts data-model.md's five rules. The second
 * asserts what the schema must *accept* — and that group earns its keep, because every item
 * in it is something a careful developer would plausibly add and each addition would refuse
 * records `006` accepts.
 *
 * The sharpest is the file number. It is the **firm's own** reference, not a format the
 * product defines: one firm writes `EXP-2026-0042`, another writes `2026/42-CIV`, another
 * writes whatever their previous system produced. A browser that imposed a shape would
 * refuse matters the server takes, and would do it invisibly — nothing server-side can
 * observe a request that was never sent.
 */
import { describe, expect, it } from 'vitest';
import { caseFormSchema } from '@/cases/schema';

/** A form the schema should accept, so each case varies one field from a known-good base. */
const VALID = {
  clientId: '867448e9-2c71-417f-a61d-93e88946a495',
  fileNumber: 'EXP-2026-0042',
  caseStatusId: 'f5a7586a-d8e9-45a5-b1f1-c96828dedece',
  matterTypeId: '',
  venueId: '',
  venueCaseReference: '',
  openedOn: '',
};

function messageFor(values: unknown, field: string): string | null {
  const result = caseFormSchema.safeParse(values);
  if (result.success) return null;
  return result.error.issues.find((i) => i.path.join('.') === field)?.message ?? null;
}

function accepts(values: unknown): boolean {
  return caseFormSchema.safeParse(values).success;
}

describe('the rules the browser can decide on its own', () => {
  it('accepts a complete, ordinary form', () => {
    expect(accepts(VALID)).toBe(true);
  });

  it('requires a client', () => {
    expect(messageFor({ ...VALID, clientId: '' }, 'clientId')).toMatch(/Selecciona el cliente/i);
  });

  it('requires a file number', () => {
    expect(messageFor({ ...VALID, fileNumber: '' }, 'fileNumber')).toMatch(
      /Ingresa el número de expediente/i,
    );
  });

  it('treats a whitespace-only file number as absent', () => {
    // Otherwise three spaces passes here and is refused by 006 — the person learns about it
    // after a round trip, for something the browser plainly knew.
    expect(messageFor({ ...VALID, fileNumber: '    ' }, 'fileNumber')).toMatch(
      /Ingresa el número de expediente/i,
    );
  });

  it('caps the file number at 100 characters', () => {
    expect(accepts({ ...VALID, fileNumber: 'x'.repeat(100) })).toBe(true);
    expect(messageFor({ ...VALID, fileNumber: 'x'.repeat(101) }, 'fileNumber')).toMatch(
      /demasiado largo/i,
    );
  });

  it('requires an initial status', () => {
    expect(messageFor({ ...VALID, caseStatusId: '' }, 'caseStatusId')).toMatch(
      /Selecciona el estado inicial/i,
    );
  });

  it('accepts a real calendar date', () => {
    expect(accepts({ ...VALID, openedOn: '2026-03-04' })).toBe(true);
  });

  it('rejects a date that is not one', () => {
    expect(messageFor({ ...VALID, openedOn: '2026-13-45' }, 'openedOn')).toMatch(/fecha válida/i);
    expect(messageFor({ ...VALID, openedOn: 'ayer' }, 'openedOn')).toMatch(/fecha válida/i);
  });

  it('rejects 30 February, which is shaped like a date and is not one', () => {
    // A regex that only checks the shape lets this through, and 006 then refuses it.
    expect(messageFor({ ...VALID, openedOn: '2026-02-30' }, 'openedOn')).toMatch(/fecha válida/i);
  });

  it('accepts 29 February in a leap year', () => {
    expect(accepts({ ...VALID, openedOn: '2024-02-29' })).toBe(true);
  });
});

describe('what the schema deliberately accepts', () => {
  it('accepts any shape of file number', () => {
    /*
     * **The case that most invites a well-meaning bug.** The file number is the firm's own
     * reference, and every firm writes it differently. A browser stricter than the server
     * refuses matters `006` would take — invisibly, since nothing server-side can observe a
     * request that was never sent. If this ever fails, the fix is to remove the pattern.
     */
    for (const fileNumber of ['EXP-2026-0042', '2026/42-CIV', '42', 'A.B.C-99/xyz', 'ASUNTO 7']) {
      expect(accepts({ ...VALID, fileNumber }), fileNumber).toBe(true);
    }
  });

  it('accepts a matter with no type', () => {
    // Not every matter is typed, and `006` makes it optional.
    expect(accepts({ ...VALID, matterTypeId: '' })).toBe(true);
  });

  it('accepts a matter with no venue', () => {
    // A consultative matter is heard nowhere.
    expect(accepts({ ...VALID, venueId: '' })).toBe(true);
  });

  it('accepts a court reference with no venue, and a venue with no reference', () => {
    // Independent fields. Neither implies the other.
    expect(accepts({ ...VALID, venueId: '', venueCaseReference: '1234/2026' })).toBe(true);
    expect(accepts({ ...VALID, venueId: 'v-1', venueCaseReference: '' })).toBe(true);
  });

  it('accepts a blank opening date, letting 006 default it to today', () => {
    expect(accepts({ ...VALID, openedOn: '' })).toBe(true);
  });

  it('says nothing about whether the file number is already used', () => {
    // Only the server can know, and it refuses on the database's unique violation rather
    // than a prior check — a read-then-write passes a sequential test and still lets two
    // concurrent callers both succeed.
    expect(accepts(VALID)).toBe(true);
  });

  it('says nothing about whether the client is still available', () => {
    // A client can be withdrawn between the picker loading and the form saving.
    expect(accepts(VALID)).toBe(true);
  });

  it('has no field for a closing date, so no form can send one', () => {
    const result = caseFormSchema.safeParse({ ...VALID, closedOn: '2026-08-27' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).not.toHaveProperty('closedOn');
  });
});

describe('every message is Spanish and actionable', () => {
  it('tells the person what to do rather than naming the field that failed', () => {
    const messages = [
      messageFor({ ...VALID, clientId: '' }, 'clientId'),
      messageFor({ ...VALID, fileNumber: '' }, 'fileNumber'),
      messageFor({ ...VALID, caseStatusId: '' }, 'caseStatusId'),
      messageFor({ ...VALID, openedOn: 'ayer' }, 'openedOn'),
    ];

    for (const message of messages) {
      expect(message, 'a rule produced no message at all').not.toBeNull();
      // The wire's identifiers, in English, describing the validator's state rather than
      // the reader's next step.
      expect(message, `leaks a wire identifier: ${message}`).not.toMatch(
        /clientId|fileNumber|caseStatusId|openedOn|required|invalid|must be/i,
      );
    }
  });
});

describe('every problem is reported at once', () => {
  it('reports all three failing fields from one parse', () => {
    // A schema that stopped at the first failure would make the form show one problem per
    // attempt no matter how the form was configured.
    const result = caseFormSchema.safeParse({
      ...VALID,
      clientId: '',
      fileNumber: '',
      caseStatusId: '',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = new Set(result.error.issues.map((i) => i.path.join('.')));
      expect(fields).toEqual(new Set(['clientId', 'fileNumber', 'caseStatusId']));
    }
  });
});
