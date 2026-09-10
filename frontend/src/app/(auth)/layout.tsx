/**
 * T059/T060 — the authentication route group's layout.
 *
 * ITS ONLY JOB IS TO NOT BE THE SHELL. The root layout mounts `Shell` — header,
 * navigation, tenant switcher — around every route, which is exactly right for
 * every route where somebody is signed in and wrong for the four where nobody
 * is: a person at the sign-in screen has no principal for `Header`,
 * `NavigationMenu` or `TenantSwitcher` to render from.
 *
 * A nested layout cannot escape its parent in the App Router, so the root layout
 * reads the segment and skips the shell for this group. That check lives there
 * rather than here because that is where the shell is mounted — and `src/shell/`
 * itself is untouched, which is what FR-048 and SC-025 require and what T063
 * asserts with an empty diff.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return <>{children}</>;
}
