/**
 * 014 T001. Wire shapes for `/configuracion`, matching contracts/admin-screens.md §1 and the
 * `002` / `017` contracts it consumes. Transcribed, not imported from `backend/`.
 */
import type { Archetype } from '../session/types';

/**
 * One row of the member list. `email` is `null` when the list came from the directory
 * fallback (`GET /tenant/directory`), which carries no email — contracts §1.2.
 */
export interface Member {
  readonly membershipId: string;
  readonly email: string | null;
  readonly archetype: Archetype;
  readonly positionName: string | null;
}

export interface MemberList {
  readonly items: readonly Member[];
  /** `false` when the fallback served the list, so the screen says why there is no email. */
  readonly withEmail: boolean;
}

/** `GET /tenant/invitations` item. `invitedEmail` is 014/FR-028. */
export interface PendingInvitation {
  readonly id: string;
  readonly targetArchetype: Archetype;
  readonly status: 'pending';
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly invitedEmail: string;
}

/** `POST /tenant/invitations` `201`. `invitationLink` is returned here once and never again. */
export interface IssuedInvitation {
  readonly id: string;
  readonly targetArchetype: Archetype;
  readonly status: 'pending';
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly invitationLink: string;
}

/** `017`'s catalog entry. */
export interface Position {
  readonly id: string;
  readonly name: string;
  readonly status: 'active' | 'retired';
}

/** `017`'s directory item — the fallback source of the member list, and position assignment. */
export interface DirectoryItem {
  readonly membershipId: string;
  readonly archetype: Archetype;
  readonly positionId: string | null;
  readonly positionName: string | null;
}
