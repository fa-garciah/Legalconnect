import type { Metadata } from "next";
import { Newsreader, Public_Sans } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { Shell } from "../shell/Shell";
import { NAVIGATION_ITEMS } from "../shell/navigation-items";
import { getPrincipal } from "../session/principal";
import { readActiveTenantServer } from "../session/active-tenant.server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

/**
 * 003/T059. The four authentication routes render WITHOUT the shell.
 *
 * A person on them has no principal, so `Header`, `NavigationMenu` and
 * `TenantSwitcher` have nothing to render from — and drawing an empty tenant
 * switcher above a sign-in form invites somebody to click it. A nested layout
 * cannot escape this one in the App Router, so the decision is made here, where
 * the shell is actually mounted.
 *
 * `src/shell/` is deliberately NOT modified: 016a's module contract survives
 * untouched (FR-048, SC-025), and T063 asserts that with an empty diff.
 */
// `/aceptar` added with the invitation-acceptance screen: a person following an invitation
// link has no session yet, and without this the dead-session redirect below would send them
// to sign in before they could set the password they would sign in with.
const UNCHROMED_PATHS = ["/ingresar", "/verificar", "/enrolar", "/recuperar", "/aceptar"];

/**
 * The two families. `020-design-language`, FR-002.
 *
 * WHAT THIS REPLACED. `Geist` and `Geist_Mono` arrived with `create-next-app` and nobody
 * chose them. That single fact was the clearest signal the product sent that it was a
 * scaffold rather than a product, and it was a one-file change — the best
 * effort-to-effect ratio anywhere in the frontend.
 *
 * Newsreader carries the voice: page titles, card headings, and the file number itself,
 * which is the first thing a lawyer looks for on any screen. Public Sans carries the
 * interface. Two families, one job each.
 *
 * `--font-mono` is no longer a loaded webfont: nothing in the product renders code, and a
 * third family downloaded on every page load to style nothing is cost with no effect.
 * `globals.css` points it at the system monospace stack instead.
 */
const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  weight: ["500", "600"],
  display: "swap",
});

const publicSans = Public_Sans({
  variable: "--font-public-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "LegalConnect MX",
  description: "LegalConnect MX",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // FR-001/FR-006: the shell mounts once, here, so no later slice's screen builds its
  // own top-level navigation. Read server-side for SSR (research.md D2); Shell itself
  // is a Client Component so the tenant switch (US2) can update without a reload.
  const [principal, activeTenant, headerList] = await Promise.all([
    getPrincipal(),
    readActiveTenantServer(),
    headers(),
  ]);

  // Next sets this on every request; the fallback keeps the shell for anything
  // that somehow arrives without it, which is the safe direction — a signed-in
  // person seeing no navigation is a worse failure than an unauthenticated one
  // seeing some.
  const pathname = headerList.get("x-pathname") ?? headerList.get("x-invoke-path") ?? "";
  const unchromed = UNCHROMED_PATHS.some((path) => pathname.startsWith(path));

  /*
   * A COOKIE IS NOT A SESSION, and this is where that finally gets enforced.
   *
   * `proxy.ts` redirects when the cookie is ABSENT and says so itself: "THIS IS
   * CONVENIENCE, NOT ENFORCEMENT." A cookie that outlives its session — revoked, idle-timed
   * out, or past the 12-hour absolute limit `005` enforces — sails straight through it. The
   * shell then rendered with an anonymous principal and showed "Selecciona una firma para
   * continuar" with no firm to select, no navigation, and no sign-out control, because that
   * control lives in the rail that is not drawn in this state. The person could neither get
   * in nor get out; the only way through was a URL nobody would guess.
   *
   * `getPrincipal()` has already asked the API, so by here the answer is authoritative.
   *
   * NOT STRAIGHT TO `/ingresar`. The first version did that and looped: the stale cookie was
   * still present, and `proxy.ts` sends anyone holding a cookie away from `/ingresar` and
   * back here. `/api/sesion/expirada` clears the cookie first, so the person arrives at
   * sign-in with nothing left to bounce them.
   */
  if (!unchromed && !principal.authenticated) {
    redirect("/api/sesion/expirada");
  }

  if (unchromed) {
    return (
      <html lang="es" className={`${publicSans.variable} ${newsreader.variable} h-full antialiased`}>
        <body className="min-h-full flex flex-col">
          <Providers>{children}</Providers>
        </body>
      </html>
    );
  }

  return (
    <html
      lang="es"
      className={`${publicSans.variable} ${newsreader.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers>
          <Shell principal={principal} initialActiveTenant={activeTenant} items={NAVIGATION_ITEMS}>
            {children}
          </Shell>
        </Providers>
      </body>
    </html>
  );
}
