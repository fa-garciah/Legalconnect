/**
 * T025 — the calls this slice makes against `006`'s case API.
 *
 * **Everything goes through `apiFetch`** (contracts/case-screens.md §0). It is the only place
 * `x-identity-id` and `x-tenant-id` are attached, so a call that built its own request would
 * reach the server as nobody, from nowhere. No exception.
 *
 * **`unwrap` is the shape `QueryBoundary` expects.** `apiFetch` never throws; it returns a
 * discriminated result. `useQuery` communicates failure by rejection, and `016a`'s
 * `classifyRefusal` needs the status and body intact — a thrown `Error` would flatten both
 * and every refusal would classify as opaque. Same contract `018`'s client module uses.
 *
 * **The boundary conversions live here and nowhere else** (data-model.md). A form holds `''`
 * for an optional a controlled input must render; the wire wants the field *omitted*, so
 * `006` can apply its own defaults. Doing that conversion in the form as well is how the two
 * come to disagree.
 */
import { apiFetch, type ApiResult, type FailedResponse } from '../lib/api-client';
import type {
  CaseDetail,
  CaseListItem,
  CaseListQuery,
  CaseListResponse,
  CaseStatusChangeResponse,
  CatalogListResponse,
} from './types';

async function unwrap<T>(result: ApiResult<T>): Promise<T> {
  if (result.ok) return result.data;
  if (result.status === null || result.body === null) {
    // No response at all — nothing to classify, and `016a` buckets it as opaque.
    return Promise.reject(null);
  }
  const failed: FailedResponse = { status: result.status, body: result.body };
  return Promise.reject(failed);
}

/**
 * A value that is meaningfully present.
 *
 * `006` treats an empty or whitespace-only `q` as *absent*, not as a filter matching nothing
 * — so sending `q=` after someone clears the search box would ask a different question than
 * asking nothing, and could empty a register that has matters in it.
 */
function meaningful(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** `GET /tenant/cases`. Every filter is omitted when absent, never sent empty. */
export function listCases(query: CaseListQuery): Promise<CaseListResponse> {
  const params = new URLSearchParams();

  const q = meaningful(query.q);
  if (q) params.set('q', q);
  if (query.matterTypeId) params.set('matterTypeId', query.matterTypeId);
  if (query.venueId) params.set('venueId', query.venueId);
  if (query.limit !== undefined) params.set('limit', String(query.limit));
  // Verbatim. `001` encodes it and `006` returns it; parsing or rebuilding it would couple
  // this screen to an encoding neither slice promised to keep.
  if (query.cursor) params.set('cursor', query.cursor);

  const suffix = params.toString();
  return apiFetch<CaseListResponse>(`/tenant/cases${suffix ? `?${suffix}` : ''}`).then(unwrap);
}

/** The three catalogs this screen reads. */
export type CaseCatalog = 'case-statuses' | 'matter-types' | 'venues';

/**
 * `GET /tenant/case-catalogs/:catalog`.
 *
 * Read once per screen, never per row. `case-statuses` is what carries `isClosing`, which is
 * the only thing a status badge is allowed to signal.
 */
export function listCaseCatalog(catalog: CaseCatalog): Promise<CatalogListResponse> {
  return apiFetch<CatalogListResponse>(`/tenant/case-catalogs/${catalog}`).then(unwrap);
}

/**
 * `GET /tenant/cases/:caseId`.
 *
 * **This route is audited.** One call is one recorded access, so it is made when a person
 * deliberately opens a matter and at no other time — never per row, never on hover, never on
 * a window regaining focus (research D3, D4).
 *
 * It is also `assigned`-scoped: a matter the caller is not on returns `404`, byte-identical
 * to a matter that does not exist. The screen must not tell them apart.
 */
export function readCase(id: string): Promise<CaseDetail> {
  return apiFetch<CaseDetail>(`/tenant/cases/${id}`).then(unwrap);
}

/** What the create form holds. Optionals are strings because controlled inputs need them. */
export interface CaseFormValues {
  readonly clientId: string;
  readonly fileNumber: string;
  readonly caseStatusId: string;
  readonly matterTypeId: string;
  readonly venueId: string;
  readonly venueCaseReference: string;
  readonly openedOn: string;
}

/**
 * `POST /tenant/cases`.
 *
 * **An empty optional is omitted, not sent as `null` or `''`.** `006` reads a missing
 * `openedOn` as "today"; an empty string is a malformed date and earns a `400` for a field
 * the person deliberately left alone.
 */
export function createCase(values: CaseFormValues): Promise<CaseListItem> {
  const body: Record<string, unknown> = {
    clientId: values.clientId,
    fileNumber: values.fileNumber.trim(),
    caseStatusId: values.caseStatusId,
  };

  const matterTypeId = meaningful(values.matterTypeId);
  if (matterTypeId) body.matterTypeId = matterTypeId;

  const venueId = meaningful(values.venueId);
  if (venueId) body.venueId = venueId;

  const venueCaseReference = meaningful(values.venueCaseReference);
  if (venueCaseReference) body.venueCaseReference = venueCaseReference;

  const openedOn = meaningful(values.openedOn);
  if (openedOn) body.openedOn = openedOn;

  return apiFetch<CaseListItem>('/tenant/cases', {
    method: 'POST',
    body: JSON.stringify(body),
  }).then(unwrap);
}

/**
 * `PATCH /tenant/cases/:caseId/status`.
 *
 * **The status, and nothing else.** The signature takes an id rather than an object for
 * exactly this reason: `006` refuses a request naming `closedOn` at all — the field is
 * output-only — so an implementation that spread the loaded record into the payload would
 * fail on every save, including ones that changed only the status. A closed argument list
 * makes that a compile error rather than a runtime surprise.
 */
export function changeCaseStatus(id: string, caseStatusId: string): Promise<CaseStatusChangeResponse> {
  return apiFetch<CaseStatusChangeResponse>(`/tenant/cases/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ caseStatusId }),
  }).then(unwrap);
}
