/**
 * T090 — `/recuperar`. Reached from the challenge screen's link, carrying the
 * same challenge token `/auth/factor` would have received.
 */
import { Suspense } from 'react';
import type { Metadata } from 'next';
import { AuthCard } from '../AuthCard';
import { RecoveryForm } from './RecoveryForm';

export const metadata: Metadata = {
  title: 'Recuperar acceso · LegalConnect MX',
};

export default function RecuperarPage(): React.JSX.Element {
  return (
    <AuthCard
      title="Recuperar acceso"
      description="¿Perdiste tu aplicación de autenticación? Usa un código de respaldo."
    >
      <Suspense fallback={null}>
        <RecoveryForm />
      </Suspense>
    </AuthCard>
  );
}
