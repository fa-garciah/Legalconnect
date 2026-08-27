/**
 * T016 (extended by T046) — FR-017, FR-018. `guidance` is the calling screen's own
 * text (contracts/feedback-states.md §2); its absence must assert nothing false about
 * what the person can do — so this component never fabricates a call-to-action.
 */
export interface EmptyStateProps {
  readonly guidance?: string;
}

export function EmptyState({ guidance }: EmptyStateProps): React.JSX.Element {
  return (
    <div data-testid="empty-state" className="flex flex-col items-center gap-2 p-8 text-center">
      <p className="font-medium">Aún no hay nada aquí.</p>
      {guidance ? <p data-testid="empty-state-guidance" className="text-sm">{guidance}</p> : null}
    </div>
  );
}
