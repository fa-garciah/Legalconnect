/**
 * T035 — the one question a control asks before deciding whether to draw itself.
 *
 * **This is not authorization.** The server decides, independently, on every request, and
 * it is the only thing standing between a caller and the data (`016a`/FR-015). Deleting
 * this file would make the interface clumsier — buttons offering actions that refuse — and
 * would change nothing about what anyone can actually do. `016a`'s
 * `hidden-item-still-refused.spec.ts` exists to keep that true.
 *
 * **Why a capability id and not an archetype list.** A control written as
 * `allowedArchetypes={['MP', 'SA']}` is a second source of truth. It agrees with `004`
 * until the day a matrix row changes, and then it disagrees silently — there is nothing to
 * compare it against. A capability id resolves through the mirror, and the mirror is
 * checked against the spec by `capability-matrix-sync.test.ts` on every run. Keying a
 * control to an id therefore inherits that check for free; an inline list inherits nothing.
 */
import { CAPABILITY_MATRIX } from './capability-matrix';
import type { Archetype } from '../session/types';

/**
 * Whether `archetype` holds `capability`, according to the mirror of `004`'s matrix.
 *
 * **Deny by default, including for an unknown id.** A capability nobody has mirrored yet
 * returns `false` rather than `true`: a typo in an id should hide a control, which is
 * visible and reported, rather than reveal one, which is not.
 */
export function can(capability: string, archetype: Archetype | undefined): boolean {
  if (!archetype) return false;
  return CAPABILITY_MATRIX[capability]?.has(archetype) ?? false;
}
