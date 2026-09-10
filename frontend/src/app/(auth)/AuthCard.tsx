/**
 * The frame both authentication screens sit in.
 *
 * Deliberately NOT the shell. A person here has no principal, so `Header`,
 * `NavigationMenu` and `TenantSwitcher` have nothing to render from — which is
 * why the root layout skips the shell for these routes and why this frame
 * exists instead of reusing one.
 */
import type { ReactNode } from 'react';

export function AuthCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-12">
      <div className="w-full max-w-sm space-y-6 rounded-lg border bg-background p-6 shadow-sm sm:p-8">
        <header className="space-y-1.5">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </header>
        {children}
      </div>
    </main>
  );
}
