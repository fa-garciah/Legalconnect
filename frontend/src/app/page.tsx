/**
 * T028 — the default landing inside the shell. No business screen content ships in
 * this slice (spec.md, Out of Scope); once a domain slice adds its first real screen,
 * this redirects into it instead of rendering placeholder text.
 */
export default function Home(): React.JSX.Element {
  return (
    <div data-testid="page-content">
      <p>Bienvenido a LegalConnect MX.</p>
    </div>
  );
}
