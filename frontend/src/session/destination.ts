/**
 * Which `destino` the sign-in flow will honour. The open-redirect guard.
 *
 * `proxy.ts` puts the path a signed-out person was trying to reach on the sign-in URL as
 * `?destino=`, and the sign-in screens carry it to the end so the person resumes where they were
 * rather than starting over (found by the 2026-10-29 critique: every sign-in ended on the empty
 * home page). But `destino` arrives in a URL anybody can craft and send, so it is honoured only
 * as a path inside this product:
 *
 *   - it must start with one `/`: `//host` is protocol-relative and leaves the site;
 *   - no backslash, which some browsers normalise into `/` and so into `//host`;
 *   - parsed against a fixed origin and kept only if the origin did not change;
 *   - never a sign-in screen or an API route, which would loop or do something on arrival;
 *   - path only: a query string could carry anything, which is why `proxy.ts` drops it too.
 *
 * Returns `null` for anything else, and the caller falls back to `/`.
 */
const BASE = 'http://legalconnect.invalid';

/** Paths that are never a place to resume: they sign in, or they are not pages at all. */
const NOT_A_DESTINATION = ['/ingresar', '/verificar', '/enrolar', '/recuperar', '/aceptar', '/api'];

export function safeDestination(raw: string | null | undefined): string | null {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return null;

  let url: URL;
  try {
    url = new URL(raw, BASE);
  } catch {
    return null;
  }
  if (url.origin !== BASE) return null;

  const path = url.pathname;
  if (path === '/') return null;
  if (NOT_A_DESTINATION.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
    return null;
  }
  return path;
}
