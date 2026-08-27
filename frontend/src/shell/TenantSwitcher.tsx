/**
 * T032 — US2. FR-009, FR-010. Purely presentational: the cookie write and query
 * invalidation (research.md D2, contracts/feedback-states.md §5) live in the caller's
 * `onSwitch` handler (`Header`/`Shell`), keeping this component testable in isolation.
 */
import type { ActiveMembership } from '../session/types';

export interface TenantSwitcherProps {
  readonly memberships: readonly ActiveMembership[];
  readonly activeTenantId: string;
  readonly onSwitch: (tenantId: string) => void;
}

export function TenantSwitcher({ memberships, activeTenantId, onSwitch }: TenantSwitcherProps): React.JSX.Element | null {
  // FR-010: an identity holding exactly one live membership never sees a switch it
  // couldn't use.
  if (memberships.length <= 1) return null;

  return (
    <select
      data-testid="tenant-switcher"
      aria-label="Cambiar de firma activa"
      value={activeTenantId}
      onChange={(event) => onSwitch(event.target.value)}
      className="rounded border px-2 py-1"
    >
      {memberships.map((membership) => (
        <option key={membership.tenantId} value={membership.tenantId}>
          {membership.tenantName}
        </option>
      ))}
    </select>
  );
}
