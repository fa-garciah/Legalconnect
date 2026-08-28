/**
 * T016 — the wire shapes of `006`'s case API.
 *
 * **Transcribed by hand from
 * [`006/contracts/case-api.md`](../../../specs/006-client-case-core/contracts/case-api.md)
 * and this slice's own
 * [case-list-filters.md](../../../specs/019-frontend-cases/contracts/case-list-filters.md),
 * never inferred from a live response.** A shape read off one payload holds until the second
 * payload differs — a `null` that happened to be filled in, an optional field that happened
 * to be there. The contract says which fields are always present; a sample cannot.
 *
 * Nothing here is validated at runtime. These describe what the server promises, and the
 * server is what enforces them. If a response ever disagrees, the fix is in one of the two
 * documents, not a guard here.
 */

/** A catalog entry as it appears embedded in a case: enough to name it, and nothing more. */
export interface CatalogRef {
  readonly id: string;
  readonly name: string;
}

/** A catalog entry as the catalog endpoint returns it. */
export interface CatalogEntry {
  readonly id: string;
  readonly name: string;
  readonly status: 'active' | 'retired';
  readonly retiredAt?: string | null;
  /**
   * `case-statuses` only. The firm's own declaration that this status ends a matter.
   *
   * The single semantic the catalog carries, and therefore the only thing a status badge is
   * allowed to signal (019 spec, Q3). A firm calling its final status *Archivado* must read
   * the same as one calling it *Concluido*; the product never infers from the name.
   */
  readonly isClosing?: boolean;
}

/**
 * One case, as the register receives it.
 *
 * **No team here.** `006` puts the case team on the single-case read only, and that route is
 * `assigned`-scoped and audited. Fetching it per row would write one audit entry per row.
 */
export interface CaseListItem {
  readonly id: string;
  readonly fileNumber: string;
  readonly client: { readonly id: string; readonly legalName: string };
  /** Carries no `isClosing` — that lives on the catalog, and the register joins it in. */
  readonly status: CatalogRef;
  /** Null for a matter the firm has not typed. */
  readonly matterType: CatalogRef | null;
  /** Null for a consultative matter, which is heard nowhere. */
  readonly venue: CatalogRef | null;
  /** The court's own number. Independent of `venue`; either may be present without the other. */
  readonly venueCaseReference: string | null;
  /**
   * A calendar day, `YYYY-MM-DD`. **Never parsed into a `Date`** — see `format.ts`.
   * `006` stores these as `date` rather than `timestamptz` precisely because they are days
   * and not instants, and the frontend must not promote them on the way to the screen.
   */
  readonly openedOn: string;
  /** Derived by the server from the status. Never supplied by a caller. */
  readonly closedOn: string | null;
}

/** A member on a case, and their role on it. */
export interface CaseTeamMember {
  readonly membershipId: string;
  readonly roleOnCase: string;
  readonly assignedAt: string;
}

/**
 * An opened case: the list item, plus catalog retirement marks, plus the team.
 *
 * `catalogStatus` is how `006/FR-020`'s "a retired entry stays resolvable, marked retired"
 * reaches the wire.
 */
export interface CaseDetail extends Omit<CaseListItem, 'client' | 'status' | 'matterType'> {
  readonly client: { readonly id: string; readonly legalName: string; readonly status: 'active' | 'inactive' };
  readonly status: CatalogRef & { readonly catalogStatus: 'active' | 'retired' };
  readonly matterType: (CatalogRef & { readonly catalogStatus: 'active' | 'retired' }) | null;
  /**
   * **Live** assignments only. History persists in `006`'s table and no route exposes it, so
   * a member whose firm membership was revoked is absent — revocation closed their
   * assignments in the same transaction.
   *
   * An empty team is a legitimate state, not an error: a freshly created case has none until
   * someone is put on it.
   */
  readonly team: readonly CaseTeamMember[];
}

/** The filters `GET /tenant/cases` accepts. Every field is omitted from the request when absent. */
export interface CaseListQuery {
  /**
   * Case-insensitive substring of the **file number or the client's legal name**. Trimmed
   * before sending; a whitespace-only value is *absent*, not an empty filter — sending `q=`
   * asks the server a different question than asking nothing.
   */
  readonly q?: string;
  readonly matterTypeId?: string;
  readonly venueId?: string;
  readonly limit?: number;
  /** Whatever the previous response returned, verbatim. Never parsed, never constructed. */
  readonly cursor?: string;
}

/**
 * `GET /tenant/cases`.
 *
 * `items` is already filtered, already paged, and already bounded by assignment. The filters
 * are applied inside the query before the page boundary, so a full page is a full page of
 * matches — which is why these screens must render what arrives rather than filter it again.
 */
export interface CaseListResponse {
  readonly items: readonly CaseListItem[];
  readonly nextCursor: string | null;
}

/** `GET /tenant/case-catalogs/:catalog`. */
export interface CatalogListResponse {
  readonly items: readonly CatalogEntry[];
}

/**
 * `POST /tenant/cases`.
 *
 * Optional fields are **omitted** rather than sent as `null` or `''`. `openedOn` omitted lets
 * `006` apply its own default of today.
 */
export interface CreateCaseRequest {
  readonly clientId: string;
  readonly fileNumber: string;
  readonly caseStatusId: string;
  readonly matterTypeId?: string;
  readonly venueId?: string;
  readonly venueCaseReference?: string;
  readonly openedOn?: string;
}

/**
 * `PATCH /tenant/cases/:caseId/status`.
 *
 * **The status, and nothing else.** `006` refuses a request naming `closedOn` at all — the
 * field is output-only, and accepting it would create a second way for the two to disagree.
 * A payload assembled by spreading the loaded record therefore earns a `400` on every save.
 */
export interface ChangeCaseStatusRequest {
  readonly caseStatusId: string;
}

/** What the status change returns. `closedOn` is stamped or cleared by the server. */
export interface CaseStatusChangeResponse {
  readonly id: string;
  readonly status: CatalogRef;
  readonly closedOn: string | null;
}
