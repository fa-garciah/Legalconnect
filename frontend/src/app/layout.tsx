import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { Shell } from "../shell/Shell";
import { NAVIGATION_ITEMS } from "../shell/navigation-items";
import { getPrincipal } from "../session/principal";
import { readActiveTenantServer } from "../session/active-tenant.server";

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
  const [principal, activeTenant] = await Promise.all([getPrincipal(), readActiveTenantServer()]);

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
