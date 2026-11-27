/**
 * T016 (extended by T042) — US4. Renders from a `ClassifiedRefusal`, never from raw
 * response text — contracts/feedback-states.md §3's copy table, verbatim.
 */
import type { ClassifiedRefusal } from './refusal-bucket';

export interface ErrorStateProps {
  readonly refusal: ClassifiedRefusal;
  readonly onRetry: () => void;
}

const COPY: Record<ClassifiedRefusal['bucket'], string> = {
  opaque: 'No se pudo completar esta acción. Inténtalo de nuevo.',
  role: 'Tu rol actual no permite esta acción.',
  'entitlement-feature': 'Tu plan actual no incluye esta función.',
  'entitlement-limit': 'Se alcanzó el límite de tu plan para esto.',
};

export function ErrorState({ refusal, onRetry }: ErrorStateProps): React.JSX.Element {
  return (
    <div data-testid="error-state" role="alert" className="flex flex-col items-start gap-2 p-4">
      <p data-testid="error-state-copy">{COPY[refusal.bucket]}</p>
      {/*
        Only a refusal that may pass on its own offers a retry. A role or a plan refusal answers
        the same every time, and a "Reintentar" under it is a button that can never work — the
        rehearsal showed one under "Tu rol actual no permite esta acción" (2026-11-27).
      */}
      {refusal.bucket === 'opaque' ? (
        <button type="button" onClick={onRetry} className="underline">
          Reintentar
        </button>
      ) : null}
    </div>
  );
}
