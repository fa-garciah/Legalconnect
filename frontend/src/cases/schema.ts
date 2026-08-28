/**
 * T044 — what the browser may decide about a new matter, and nothing more.
 *
 * **The line this schema draws.** It asserts *shape*: a client is chosen, a file number is
 * present and not absurdly long, a status is chosen, and a supplied date is a real calendar
 * day. Each is knowable here, matches what `006` enforces, and saves a round trip.
 *
 * It asserts nothing that needs the server's knowledge — whether the file number is already
 * used, whether the client is still available, whether a catalog entry is still active,
 * whether the caller may create at all. Those arrive as refusals rendered against the form,
 * which is the *normal* path for facts the browser cannot know.
 *
 * **The file number's format is not validated, and that is deliberate.** It is the firm's own
 * reference: one writes `EXP-2026-0042`, another `2026/42-CIV`, another whatever their last
 * system produced. A pattern here would refuse matters `006` accepts, invisibly — nothing
 * server-side can observe a request that was never sent.
 */
import { z } from 'zod';

/** `006`'s column bound. Matching it here turns a round trip into an immediate answer. */
const FILE_NUMBER_MAX = 100;

/**
 * A real calendar day, not merely something shaped like one.
 *
 * The shape check alone lets `2026-02-30` through — it has the right digits in the right
 * places and does not exist. Round-tripping through `Date.UTC` is what catches it, and `UTC`
 * rather than local time because this is a calendar day and the timezone must not shift it
 * (the same trap `format.ts` avoids on the way out).
 */
function isRealCalendarDay(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const [, y, m, d] = match;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);

  const utc = new Date(Date.UTC(year, month - 1, day));
  return (
    utc.getUTCFullYear() === year && utc.getUTCMonth() === month - 1 && utc.getUTCDate() === day
  );
}

export const caseFormSchema = z.object({
  clientId: z
    .string({ error: 'Selecciona el cliente.' })
    .min(1, { error: 'Selecciona el cliente.' }),

  fileNumber: z
    .string({ error: 'Ingresa el número de expediente.' })
    // Trimmed before the length checks, so three spaces is absent rather than a number of
    // three characters — which is what `006` would conclude, one round trip later.
    .trim()
    .min(1, { error: 'Ingresa el número de expediente.' })
    .max(FILE_NUMBER_MAX, { error: 'El número de expediente es demasiado largo.' }),

  caseStatusId: z
    .string({ error: 'Selecciona el estado inicial.' })
    .min(1, { error: 'Selecciona el estado inicial.' }),

  /*
   * The three optionals are required *strings* rather than optional fields: a controlled
   * input always has a value, and "not chosen" is the empty string. They become **omitted**
   * at the api boundary — see `api.ts` — so `006` applies its own defaults rather than
   * receiving an empty string where it expects an id or a date.
   */
  matterTypeId: z.string(),
  venueId: z.string(),
  venueCaseReference: z.string().trim(),

  openedOn: z
    .string()
    .trim()
    .refine((value) => value === '' || isRealCalendarDay(value), {
      error: 'Ingresa una fecha válida.',
    }),
});

/**
 * What the form holds.
 *
 * Deliberately not a case: **no `closedOn`**. That date is derived by the server from the
 * status (`006/FR-008a`), and a field for it would create a second way for the two to
 * disagree — `006` refuses a request carrying it at all.
 */
export type CaseFormValues = z.infer<typeof caseFormSchema>;
