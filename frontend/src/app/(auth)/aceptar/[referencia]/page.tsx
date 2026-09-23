/**
 * `/aceptar/{referencia}` — where an invitation link lands. See `AcceptInvitationForm`.
 *
 * The reference is the raw token from the invitation email. It is passed to the API as-is
 * and hashed there (002/research D2); this page neither validates nor stores it, so it can
 * say nothing about whether the invitation is still good until the person submits.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthCard } from '../../AuthCard';
import { AcceptInvitationForm } from './AcceptInvitationForm';

export const metadata: Metadata = {
  title: 'Aceptar invitación · LegalConnect MX',
};

export default async function AceptarPage({
  params,
}: {
  params: Promise<{ referencia: string }>;
}): Promise<React.JSX.Element> {
  const { referencia } = await params;

  return (
    <AuthCard
      title="Crea tu acceso"
      description="Tu despacho te invitó a LegalConnect MX. Define la contraseña con la que vas a ingresar."
      topLink={
        <span>
          ¿Ya tienes acceso?{' '}
          <Link href="/ingresar" className="font-medium text-primary underline-offset-4 hover:underline">
            Inicia sesión
          </Link>
        </span>
      }
    >
      <AcceptInvitationForm reference={referencia} />
    </AuthCard>
  );
}
