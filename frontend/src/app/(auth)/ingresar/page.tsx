/**
 * The sign-in screen.
 *
 * TWO NOTICES, EACH ARRIVING BY A REDIRECT THAT ALREADY EXISTED. `/api/sesion/expirada` sends
 * a person here with `?sesion=expirada` after their session died, and invitation acceptance
 * sends them with `?invitacion=aceptada`. Both used to land on an unexplained sign-in form;
 * a person bounced out of the product, or who has just set a password, should be told why
 * they are here.
 *
 * The top corner holds no "Regístrate" link, unlike the reference design: there is no open
 * sign-up in this product. A firm invites a person, and the invitation email is the way in.
 */
import type { Metadata } from 'next';
import { CheckCircle2, Clock } from 'lucide-react';
import { AuthCard } from '../AuthCard';
import { SignInForm } from './SignInForm';

export const metadata: Metadata = {
  title: 'Ingresar · LegalConnect MX',
};

function Notice({ icon: Icon, children }: { icon: typeof Clock; children: React.ReactNode }): React.JSX.Element {
  return (
    <p role="status" className="flex gap-2.5 rounded-lg bg-accent px-3.5 py-3 text-small text-accent-foreground">
      <Icon aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

export default async function IngresarPage({
  searchParams,
}: {
  searchParams: Promise<{ sesion?: string; invitacion?: string }>;
}): Promise<React.JSX.Element> {
  const params = await searchParams;

  const notice =
    params.invitacion === 'aceptada' ? (
      <Notice icon={CheckCircle2}>
        Tu acceso quedó listo. Inicia sesión para registrar tu segundo factor.
      </Notice>
    ) : params.sesion === 'expirada' ? (
      <Notice icon={Clock}>Tu sesión terminó. Vuelve a ingresar para continuar.</Notice>
    ) : null;

  return (
    <AuthCard
      title="Ingresar"
      description="Accede con tu correo del despacho."
      notice={notice}
    >
      <SignInForm />
    </AuthCard>
  );
}
