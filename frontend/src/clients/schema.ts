/**
 * T033 — what the browser may decide about a client form, and nothing more.
 *
 * **The line this schema draws** (research D4, data-model.md). It asserts *shape*: a name
 * is present and not absurdly long, `kind` is one of two values, an RFC fits the column.
 * Every one of those is knowable here, matches what `006` enforces, and saves a round trip.
 *
 * It asserts nothing that needs the server's knowledge — whether a name already exists,
 * whether the client is still usable, whether the caller holds the capability. Those arrive
 * as refusals rendered against the form, which is the *normal* path for facts the browser
 * cannot know, not an error case.
 *
 * **RFC format is not validated, and that is deliberate.** Adding a pattern here would look
 * like an improvement. `006`'s own service declines to validate it, for a stated reason: a
 * client's RFC becomes load-bearing when invoicing ships, and refusing a half-collected one
 * now blocks the intake this slice exists to enable. A browser stricter than the server
 * refuses records the server would accept, and does it invisibly — nothing server-side can
 * observe a request that was never sent. `tests/unit/client-schema.test.ts` holds this open
 * on purpose.
 *
 * **Messages say what to do, not what failed** (FR-006). "Ingresa la razón social", never
 * "legalName is required" — which is the wire's identifier, in the wrong language,
 * describing the validator's state rather than the reader's next step.
 */
import { z } from 'zod';

/** `006`'s column bound. Matching it here turns a round trip into an immediate answer. */
const LEGAL_NAME_MAX = 250;

/** An RFC is 12 characters for an organization, 13 for a person. The column takes 13. */
const RFC_MAX = 13;

export const clientFormSchema = z.object({
  kind: z.enum(['organization', 'person'], {
    // Covers both "absent" and "not one of the two" — from the reader's side those are the
    // same situation, and they get the same instruction.
    error: 'Selecciona el tipo de cliente.',
  }),

  legalName: z
    .string({ error: 'Ingresa la razón social.' })
    // Trimmed before the length checks, so three spaces is absent rather than a name of
    // three characters — which is what `006` would conclude, one round trip later.
    .trim()
    .min(1, { error: 'Ingresa la razón social.' })
    .max(LEGAL_NAME_MAX, { error: 'La razón social es demasiado larga.' }),

  /*
   * A string, never `string | null`, and required rather than optional. A controlled input
   * needs a string, and `null` would make React switch the field between controlled and
   * uncontrolled mid-life. The field is always present in the form; "not collected" is the
   * empty string, which becomes `null` at the api boundary — in `clients/api.ts`, once, so
   * the two conversions cannot disagree.
   *
   * Required also keeps zod's input and output types identical. `.optional().default('')`
   * would make them differ, and `react-hook-form`'s resolver types the form by the output
   * while typing the resolver by the input — a mismatch that surfaces as an unreadable
   * generic error far from its cause.
   */
  rfc: z
    .string({ error: 'El RFC es demasiado largo.' })
    .trim()
    .max(RFC_MAX, { error: 'El RFC es demasiado largo.' }),
});

/**
 * What the form holds.
 *
 * Deliberately not `Client`: no `id`, and **no `status`**. Status moves only through the
 * withdraw and restore routes, and a field for it here would invite a control that sends
 * one.
 */
export type ClientFormValues = z.infer<typeof clientFormSchema>;
