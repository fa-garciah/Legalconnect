/**
 * T029 — 018/US2. The validation the browser performs, and the validation it refuses to.
 *
 * **Both halves matter equally.** The first group below asserts the four rules from
 * data-model.md. The second asserts four things the schema must *accept* — and that group
 * is the one that earns its keep, because every item in it is something a careful developer
 * would plausibly add.
 *
 * The sharpest is RFC format. Adding a pattern here looks like an improvement and is a
 * defect: `006` deliberately does not validate RFC format, because a client's RFC becomes
 * load-bearing only when invoicing ships, and refusing a half-collected one now blocks the
 * intake this slice exists to enable (research D4). A browser stricter than the server
 * refuses records the server would accept — and does it silently, since nothing on the
 * server side can observe a request that was never sent.
 *
 * The messages are asserted too, not just the pass/fail. FR-006 asks them to say what to
 * do rather than what failed, and "legalName is required" leaking to a Spanish-speaking
 * user is a real defect that a boolean assertion would never catch.
 */
import { describe, expect, it } from 'vitest';
import { clientFormSchema } from '@/clients/schema';

/** A form the schema should accept, so each case can vary one field from a known-good base. */
const VALID = { kind: 'person' as const, legalName: 'Juan Perez', rfc: '' };

/** The first message for `field`, or null when the schema raised nothing there. */
function messageFor(values: unknown, field: string): string | null {
  const result = clientFormSchema.safeParse(values);
  if (result.success) return null;
  const issue = result.error.issues.find((i) => i.path.join('.') === field);
  return issue?.message ?? null;
}

function accepts(values: unknown): boolean {
  return clientFormSchema.safeParse(values).success;
}

describe('the four rules the browser can decide on its own', () => {
  it('accepts a complete, ordinary form', () => {
    expect(accepts(VALID)).toBe(true);
  });

  it('requires a legal name', () => {
    expect(messageFor({ ...VALID, legalName: '' }, 'legalName')).toMatch(/Ingresa la razón social/i);
  });

  it('treats a whitespace-only legal name as absent', () => {
    // Otherwise a form of three spaces passes here and is refused by 006 — the person
    // learns about it after a round trip, for something the browser plainly knew.
    expect(messageFor({ ...VALID, legalName: '    ' }, 'legalName')).toMatch(/Ingresa la razón social/i);
  });

  it('caps the legal name at 250 characters', () => {
    expect(accepts({ ...VALID, legalName: 'x'.repeat(250) })).toBe(true);
    expect(messageFor({ ...VALID, legalName: 'x'.repeat(251) }, 'legalName')).toMatch(/demasiado larga/i);
  });

  it('requires kind to be one of the two 006 defines', () => {
    expect(accepts({ ...VALID, kind: 'organization' })).toBe(true);
    expect(messageFor({ ...VALID, kind: 'company' }, 'kind')).toMatch(/Selecciona el tipo/i);
  });

  it('caps the RFC at 13 characters after trimming', () => {
    expect(accepts({ ...VALID, rfc: 'GTO120315AB1' })).toBe(true);
    expect(accepts({ ...VALID, rfc: '  GTO120315AB1  ' })).toBe(true);
    expect(messageFor({ ...VALID, rfc: 'A'.repeat(14) }, 'rfc')).toMatch(/demasiado largo/i);
  });

  it('allows the RFC to be blank', () => {
    // 006/FR-002 makes it nullable; the empty string becomes null at the api boundary.
    expect(accepts({ ...VALID, rfc: '' })).toBe(true);
  });
});

describe('what the schema deliberately does not assert', () => {
  it('accepts an oddly-shaped RFC of a reasonable length', () => {
    // **The case that most invites a well-meaning bug.** This is not a real RFC and this
    // schema accepts it anyway, because 006 accepts it. Adding a format pattern here would
    // make the browser stricter than the server and would block intake of records a firm
    // has not finished collecting (research D4). If this test ever fails, the fix is to
    // remove the pattern, not to change this expectation.
    expect(accepts({ ...VALID, rfc: 'no-es-un-rfc' })).toBe(true);
    expect(accepts({ ...VALID, rfc: '123' })).toBe(true);
    expect(accepts({ ...VALID, rfc: 'aaaa000000aaa' })).toBe(true);
  });

  it('accepts a name that may already exist in the tenant', () => {
    // 006 permits duplicates within a tenant on purpose. Only the server can know, and it
    // has decided not to care.
    expect(accepts({ ...VALID, legalName: 'Juan Perez' })).toBe(true);
  });

  it('has no field for status, so no form can send one', () => {
    // Status moves only through the withdraw and restore routes (US3). A schema field for
    // it would invite a control that sends it.
    const result = clientFormSchema.safeParse({ ...VALID, status: 'inactive' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).not.toHaveProperty('status');
  });

  it('says nothing about whether the caller may do this', () => {
    // 004's question, and FR-015's point: hiding a control is not enforcement, and neither
    // is a schema. The same values are valid whoever is typing them.
    expect(accepts(VALID)).toBe(true);
  });
});

describe('every message is Spanish and actionable', () => {
  it('tells the person what to do rather than naming the field that failed', () => {
    // FR-006. "legalName is required" is the failure mode: the wire's identifier, in
    // English, describing the validator's state rather than the reader's next step.
    const messages = [
      messageFor({ ...VALID, legalName: '' }, 'legalName'),
      messageFor({ ...VALID, legalName: 'x'.repeat(251) }, 'legalName'),
      messageFor({ ...VALID, kind: 'company' }, 'kind'),
      messageFor({ ...VALID, rfc: 'A'.repeat(14) }, 'rfc'),
    ];

    for (const message of messages) {
      expect(message, 'a rule produced no message at all').not.toBeNull();
      // `rfc` is NOT in this pattern, deliberately: "RFC" is the domain's own Spanish
      // term — Registro Federal de Contribuyentes — and it is what the label says and what
      // a Mexican firm calls the field. It is the one identifier that is also correct copy.
      expect(message, `leaks a wire identifier: ${message}`).not.toMatch(
        /legalName|kind|required|invalid|must be/i,
      );
    }
  });
});

describe('every problem is reported at once', () => {
  it('reports all three failing fields from one parse', () => {
    // SC-002. A schema that stopped at the first failure would make the form show one
    // problem per attempt, which is the experience FR-005 exists to prevent — and it would
    // do so no matter how the form was configured.
    const result = clientFormSchema.safeParse({ kind: 'company', legalName: '', rfc: 'A'.repeat(20) });

    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = new Set(result.error.issues.map((i) => i.path.join('.')));
      expect(fields).toEqual(new Set(['kind', 'legalName', 'rfc']));
    }
  });
});
