/**
 * T019 — the wire shapes of `006`'s client API.
 *
 * **Transcribed by hand from
 * [`006/contracts/client-api.md`](../../../specs/006-client-case-core/contracts/client-api.md),
 * never inferred from a live response** (data-model.md). The distinction matters: a shape
 * read off one payload is a shape that holds until the second payload differs — a `null`
 * that happened to be filled in, an optional field that happened to be present. The
 * contract states which fields are always there; a sample cannot.
 *
 * Nothing here is validated at runtime. These are compile-time descriptions of what the
 * server promises, and the server is the thing that enforces them. If a response ever
 * disagrees with this file, the fix is in one of the two documents, not a guard here.
 */

/** `006/contracts/client-api.md` §2. Fixed at creation; `PATCH` naming it is refused. */
export type ClientKind = 'organization' | 'person';

/**
 * `006/FR-004`. `inactive` means *withdrawn* — barred from new cases, still resolving on
 * every case that already references it.
 *
 * The word "inactive" never reaches a screen. The copy is Spanish and the domain's term is
 * *retirado* (018/FR-020); this identifier is the wire's word, not the reader's.
 */
export type ClientStatus = 'active' | 'inactive';

/**
 * One client as the list and detail routes return it.
 *
 * `rfc` is `null` rather than `''` when it was never collected, and the directory renders
 * that as a dash — so "we do not have it" is visibly different from a cell that failed to
 * draw (018/FR-005). `006` does not validate RFC format: a client's RFC becomes
 * load-bearing when invoicing ships, and refusing a half-collected record now would keep
 * legitimate parties out of the directory.
 */
export interface Client {
  readonly id: string;
  readonly kind: ClientKind;
  readonly legalName: string;
  readonly rfc: string | null;
  readonly status: ClientStatus;
}

/**
 * `GET /tenant/clients`.
 *
 * **`nextCursor` is opaque and stays opaque.** `001` encodes it, `006` returns it, and the
 * only two things this application may legitimately do with it are pass it back unchanged
 * and check whether it is `null`. Decoding it would couple these screens to an encoding
 * neither slice promised to keep.
 *
 * `items` is already filtered and already paged. `q` and `status` are applied inside the
 * query, before the page boundary (`006/FR-002a`), so a page of 50 is 50 *matching*
 * clients — which is why these screens must render what arrives rather than filter it
 * again (018/FR-003).
 */
export interface ClientListResponse {
  readonly items: readonly Client[];
  readonly nextCursor: string | null;
}

/** The filters `GET /tenant/clients` accepts. Every field is omitted from the request when absent. */
export interface ClientListQuery {
  /**
   * Case-insensitive substring of the legal name. Trimmed before sending; a whitespace-only
   * value is *absent*, not an empty filter — sending `q=` would ask the server a different
   * question than asking nothing.
   */
  readonly q?: string;
  readonly status?: ClientStatus;
  readonly limit?: number;
  /** Whatever the previous response returned, verbatim. */
  readonly cursor?: string;
}

/** `POST /tenant/clients`. `rfc` may be `null`; `kind` is required and never changes after this. */
export interface CreateClientRequest {
  readonly kind: ClientKind;
  readonly legalName: string;
  readonly rfc: string | null;
}

/**
 * `PATCH /tenant/clients/:id`. Every field optional; omitted fields are left alone.
 *
 * **`kind` is absent from this type on purpose.** `006` refuses a `PATCH` that names it,
 * even with an unchanged value, so the natural implementation — spread the client into the
 * payload and send it — earns a `400`. Leaving the field out of the type makes that a
 * compile error instead of a runtime surprise (data-model.md, *Boundary conversions*).
 */
export interface UpdateClientRequest {
  readonly legalName?: string;
  readonly rfc?: string | null;
}

/**
 * What `POST /tenant/clients/:id/deactivate` and `.../reactivate` return.
 *
 * Both routes hold the same capability (`client.deactivate`, row 28) because `006/FR-004a`
 * decided that whoever may withdraw a client may restore one. Deactivate returns a
 * timestamp; reactivate returns `null` in the same field.
 */
export interface ClientStatusChangeResponse {
  readonly id: string;
  readonly status: ClientStatus;
  readonly deactivatedAt: string | null;
}
