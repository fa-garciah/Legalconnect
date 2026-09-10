import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { Shell } from "../shell/Shell";
import { NAVIGATION_ITEMS } from "../shell/navigation-items";
import { getPrincipal } from "../session/principal";
import { readActiveTenantServer } from "../session/active-tenant.server";
import { headers } from "next/headers";

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
const UNCHROMED_PATHS = ["/ingresar", "/verificar", "/enrolar", "/recuperar"];

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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

  if (unchromed) {
    return (
      <html lang="es" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
        <body className="min-h-full flex flex-col">
          <Providers>{children}</Providers>
        </body>
      </html>
    );
  }

  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
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
