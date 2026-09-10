/**
 * T072 — `/enrolar`. Reached from the credential step when the API answers
 * `next: "enrollment"`, which is the only way an unenrolled identity moves at
 * all: the unenrolled state resolves to enrollment or to refusal, never to
 * access (FR-006).
 */
import { Suspense } from 'react';
import type { Metadata } from 'next';
import { AuthCard } from '../AuthCard';
import { EnrollmentFlow } from './EnrollmentFlow';

export const metadata: Metadata = {
  title: 'Registrar segundo factor · LegalConnect MX',
};

export default function EnrolarPage(): React.JSX.Element {
  return (
    <AuthCard
      title="Registra tu segundo factor"
      description="Todas las cuentas requieren verificación en dos pasos."
    >
      <Suspense fallback={null}>
        <EnrollmentFlow />
      </Suspense>
    </AuthCard>
  );
}
