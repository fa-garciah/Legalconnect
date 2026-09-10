/**
 * T058 — the unauthenticated and unenrolled redirects. FR-052.
 *
 * NAMED `proxy.ts`, NOT `middleware.ts`. The middleware convention is
 * DEPRECATED in Next.js 16 and renamed to `proxy` — same functionality, new
 * file and export names (node_modules/next/dist/docs, file-conventions/
 * middleware.md). Written against the current convention rather than migrated
 * later by a codemod, since this file is new in this slice and there is nothing
 * to preserve.
 *
 * WHY A REDIRECT AND NOT A HALF-POPULATED SCREEN. A person whose session the
 * backend has invalidated — revoked, expired, or killed by a detected refresh
 * reuse — still has a browser cookie. Without this, their next navigation renders
 * the shell, every query inside it answers 401, and they see a page of error
 * states with a navigation bar around it. That reads as "the product is broken"
 * rather than "you are signed out", and it is the single most likely way for a
 * revocation to look like a bug.
 *
 * THIS IS CONVENIENCE, NOT ENFORCEMENT, and the distinction matters. Middleware
 * decides what to RENDER; it decides nothing about what may be READ. Every API
 * request is validated against the product's own session table regardless of what
 * happened here (FR-034), so a middleware bug is a navigation annoyance and never
 * an authorization hole. Nothing below is a security control.
 */
import { NextResponse, type NextRequest } from 'next/server';

/** Reachable without a session — they are how a session comes to exist. */
const PUBLIC_PATHS = ['/ingresar', '/verificar', '/enrolar', '/recuperar', '/aceptar'];

/** NextAuth's cookie, in both the plain and the __Secure- forms. */
const SESSION_COOKIES = ['authjs.session-token', '__Secure-authjs.session-token'];

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  const isPublic = PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
  const hasSession = SESSION_COOKIES.some((name) => request.cookies.has(name));

  if (!hasSession && !isPublic) {
    const target = request.nextUrl.clone();
    target.pathname = '/ingresar';
    target.search = '';
    // Where they were going, so signing in resumes it rather than dropping them
    // on the dashboard. Only the path — a query string could carry anything.
    if (pathname !== '/') target.searchParams.set('destino', pathname);
    return NextResponse.redirect(target);
  }

  // Already signed in and standing on the sign-in screen: send them onward
  // rather than letting them authenticate twice.
  if (hasSession && (pathname === '/ingresar' || pathname === '/verificar')) {
    const target = request.nextUrl.clone();
    target.pathname = '/';
    target.search = '';
    return NextResponse.redirect(target);
  }

  // The root layout needs the path to decide whether to mount the shell, and a
  // Server Component cannot read it any other way. Set here rather than guessed
  // from a segment, so the layout and this file agree by construction.
  const forwarded = new Headers(request.headers);
  forwarded.set('x-pathname', pathname);
  return NextResponse.next({ request: { headers: forwarded } });
}

export const config = {
  /**
   * Everything except Next's own assets and the auth API routes. The API routes
   * are excluded because redirecting NextAuth's own callback would break the
   * ceremony this middleware exists to protect the end of.
   */
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
