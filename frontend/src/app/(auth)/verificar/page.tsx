/**
 * T060 — `/verificar`, the challenge step.
 *
 * Reached only from the credential step, carrying its challenge token. Presenting
 * an answer with no pending challenge is refused by the API, so this screen needs
 * no gate of its own — the gate is STATE, not capability (contracts/README.md).
 */
import { Suspense } from 'react';
import type { Metadata } from 'next';
import { AuthCard } from '../AuthCard';
import { ChallengeForm } from './ChallengeForm';

export const metadata: Metadata = {
  title: 'Verificar · LegalConnect MX',
};

export default function VerificarPage(): React.JSX.Element {
  return (
    <AuthCard
      title="Verificación en dos pasos"
      description="Confirma tu identidad con el código de tu aplicación de autenticación."
    >
      {/* useSearchParams needs a Suspense boundary during static rendering. */}
      <Suspense fallback={null}>
        <ChallengeForm />
      </Suspense>
    </AuthCard>
  );
}
