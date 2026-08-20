# Plan module

Tier assignment and limit configuration (US5 — `US02-EP00-FND-AssignTenantPlan`,
`US05-EP00-FND-ConfigureTenantLimits`).

**Nothing in this module enforces limits or entitlements.** A tenant can be moved
onto a tier whose `entitlements` disable a feature it is actively using, or whose
`limits` are below what it would need, and nothing here stops that — enforcement
of both is slice 004's job, per plan.md's Technical Context. This module only
makes the tier and its ceilings *configurable without a deployment* (FR-004,
FR-016), which is a different guarantee from *enforced*.

**The `409 limits_exceeded` on a plan change is an operator warning gate, not a
technical constraint.** It compares the target plan's limits against the
*current* plan's limits — the only quantitative reference this slice has, since
it owns no business tables to measure real consumption against. Re-sending the
same request with `acknowledgeExceededLimits: true` always succeeds; nothing
downstream checks that acknowledgement against anything real. Do not mistake this
for capacity enforcement when building slice 004 — it is a confirmation prompt,
sized to warn an operator who might be about to under-provision a tenant, not a
guarantee that the tenant fits.
