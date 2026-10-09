/** 008. Wire shapes of contracts/notes-activity-api.md, transcribed (not imported from `backend/`). */
export interface Note {
  readonly id: string;
  readonly body: string;
  readonly createdAt: string;
  readonly author: { readonly membershipId: string; readonly position: string | null };
  readonly own: boolean;
  /** Set by the server while the author's 24-hour window is open (Decision 3); null otherwise. */
  readonly correctableUntil: string | null;
}

export interface NoteList {
  readonly month: string;
  readonly items: readonly Note[];
}

export interface ActivityEntry {
  readonly id: string;
  readonly action: string;
  readonly occurredAt: string;
  readonly actor: { readonly membershipId: string; readonly position: string | null } | null;
  /** Documents only (FR-014). */
  readonly fileName: string | null;
}

export interface ActivityFeed {
  readonly month: string;
  readonly items: readonly ActivityEntry[];
  /** More than 200 entries that month; only the newest 200 are listed. */
  readonly truncated: boolean;
}
