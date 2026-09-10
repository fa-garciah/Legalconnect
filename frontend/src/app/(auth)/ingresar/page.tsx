/**
 * T059 — `/ingresar`, the credential step.
 *
 * In the `(auth)` route group, OUTSIDE the shell chrome: a person here has no
 * principal for `Header`, `NavigationMenu` or `TenantSwitcher` to render from.
 * Spanish route segment, following the convention 018 and 019 set with
 * `clientes` and `expedientes`.
 */
import type { Metadata } from 'next';
import { AuthCard } from '../AuthCard';
import { SignInForm } from './SignInForm';

export const metadata: Metadata = {
  title: 'Ingresar · LegalConnect MX',
};

export default function IngresarPage(): React.JSX.Element {
  return (
    <AuthCard
      title="Ingresar"
      description="Ingresa tu correo y contraseña para continuar."
    >
      <SignInForm />
    </AuthCard>
  );
}
