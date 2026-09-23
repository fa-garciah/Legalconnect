/**
 * The credential-attaching proxy, and the close of the open item `api-client.ts` recorded.
 *
 * WHY IT EXISTS. `api-client.ts` runs in the BROWSER and the API's access credential lives
 * in an httpOnly cookie precisely so that script on the page cannot read it (003/FR-051).
 * So a browser-direct call could not authenticate at all: every one of them answered 401,
 * and neither the client directory (018) nor the case register (019) could load a row.
 * That file named the two real options — "a Next route-handler proxy that attaches the
 * credential server-side, and same-site cookie auth on the API" — and left the choice open.
 *
 * THIS IS THE FIRST, AND THE SECOND WAS REJECTED ON PURPOSE. Same-site cookie auth would
 * mean the API trusts a cookie, and the API's entire model is that it trusts a bearer token
 * it resolves against its own `session` table on every request (003/FR-034, and the
 * constitution's "never against a bearer token's signature and expiry alone"). Changing
 * that to suit the browser would be the frontend dictating the backend's security model,
 * for a problem the frontend can solve on its own side.
 *
 * WHAT THIS IS, STATED PLAINLY: a hole punched through the httpOnly boundary, deliberately.
 * It runs on the server, so it MAY read the cookie. Two rules keep the hole from becoming a
 * bypass, and both are asserted in `tests/unit/api-proxy.test.ts`:
 *
 *   1. The credential is READ HERE, never accepted from the caller. A browser that sends
 *      its own `authorization` header has it discarded, not forwarded.
 *   2. `x-identity-id` is never forwarded. 003/FR-041 removed that header precisely because
 *      it asserted an identity nothing had verified; re-admitting it through a proxy would
 *      undo that.
 *
 * WHAT IT DOES NOT DO. It adds no authorization of its own and makes no decision about what
 * the caller may read. Every such decision stays in the API, under RLS, exactly where the
 * constitution puts it — this only carries a credential the browser is not allowed to hold.
 * A bug here is an availability bug, never an isolation one.
 *
 * `x-tenant-id` IS forwarded, and that is not an identity claim: it selects WHICH of the
 * caller's own memberships to activate, and `membership` under RLS decides whether they may
 * (002/FR-013, 002/FR-016). A forged value reaches a policy that refuses it.
 */
import { readAccessToken } from '@/session/session-store';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';

/**
 * Headers the proxy passes through. An ALLOW-LIST rather than a deny-list, because the
 * failure modes are asymmetric: forgetting to strip a dangerous header admits it, while
 * forgetting to allow a harmless one merely breaks a feature visibly.
 *
 * `content-type` carries the multipart boundary 007's upload needs; `accept` and
 * `accept-language` are ordinary content negotiation. Nothing else is forwarded —
 * notably not `authorization`, not `x-identity-id`, and not `cookie`.
 *
 * `x-step-up-token` (014/FR-027) is 005's elevation for the five step-up capabilities. Without
 * it every one of them was refused from the browser. It cannot stand in for the session: the
 * API binds it to one identity and one capability, consumes it on first use, and accepts it only
 * alongside the bearer attached below.
 */
const FORWARDED_HEADERS = [
  'content-type',
  'accept',
  'accept-language',
  'x-tenant-id',
  'x-step-up-token',
] as const;

/** The API's own refusal shape, so a proxy-level refusal classifies like any other. */
function refuse(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function proxy(request: Request, params: Promise<{ path: string[] }>): Promise<Response> {
  const accessToken = await readAccessToken();
  if (!accessToken) {
    // Byte-identical in shape to the API's own unauthenticated refusal, and reached
    // without touching the network: there is nothing to ask on behalf of nobody.
    return refuse(401, 'unauthenticated', 'No autenticado.');
  }

  const { path } = await params;
  const search = new URL(request.url).search;
  const target = `${API_BASE_URL}/${path.join('/')}${search}`;

  const headers: Record<string, string> = { authorization: `Bearer ${accessToken}` };
  for (const name of FORWARDED_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers[name] = value;
  }

  // GET and DELETE carry no body; `duplex` is required by the Fetch spec for a streamed
  // request body and Node refuses the call without it.
  const method = request.method;
  const hasBody = method !== 'GET' && method !== 'HEAD' && method !== 'DELETE';

  let response: Response;
  try {
    response = await fetch(target, {
      method,
      headers,
      ...(hasBody ? { body: request.body, duplex: 'half' } : {}),
      cache: 'no-store',
    } as RequestInit);
  } catch {
    // The API is unreachable. `016a`'s classifier buckets a null-bodied failure as opaque,
    // which is the honest answer: nothing is known about why.
    return refuse(502, 'upstream_unreachable', 'No se pudo completar esta acción.');
  }

  /*
   * The status and the body pass through UNTOUCHED, and that is load-bearing rather than
   * laziness. `016a`'s `classifyRefusal` reads the status and `body.error.code` to decide
   * whether a refusal is opaque or remedy-specific (004/contracts/refusal.md §2). A proxy
   * that normalised either — collapsing 403s into 500s, or re-wrapping the body — would
   * turn every distinguishable refusal in the product into an opaque one, and no test on
   * either side would notice, because both sides would still be individually correct.
   */
  const body = await response.arrayBuffer();
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: {
      'content-type': response.headers.get('content-type') ?? 'application/json',
      // 007 serves documents through here; the browser needs the disposition to save one
      // under its real filename rather than as the route's last path segment.
      ...(response.headers.get('content-disposition')
        ? { 'content-disposition': response.headers.get('content-disposition')! }
        : {}),
    },
  });
}

type Ctx = { params: Promise<{ path: string[] }> };

export const GET = (request: Request, ctx: Ctx): Promise<Response> => proxy(request, ctx.params);
export const POST = (request: Request, ctx: Ctx): Promise<Response> => proxy(request, ctx.params);
export const PATCH = (request: Request, ctx: Ctx): Promise<Response> => proxy(request, ctx.params);
export const PUT = (request: Request, ctx: Ctx): Promise<Response> => proxy(request, ctx.params);
export const DELETE = (request: Request, ctx: Ctx): Promise<Response> => proxy(request, ctx.params);
