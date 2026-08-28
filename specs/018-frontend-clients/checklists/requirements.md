# Specification Quality Checklist: Client Screens & the Design System They Need

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-28
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain — Q1 resolved 2026-08-28
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Project-Specific Gates *(from Constitution v1.4.0)*

- [x] **Principle I** — every cited story id verified present in
      `master-user-story-catalog.md`. The one complication (three rows already claimed by
      `006`) is raised as Decision 1 rather than silently double-claimed.
- [x] **Principle III** — nothing firm-specific enters the interface; the prototype's
      Spanish copy is treated as a starting point, not a requirement.
- [x] **Principle IV** — permission matrix present, and explicitly declared a **mirror**:
      this slice adds no capability row. Portal archetypes and `PO` zeroed.
- [x] **Principle VI** — no new personal data is collected or displayed beyond what `006`
      already stores.
- [x] **Merge Rules** — Spanish UI copy required by FR-023 and asserted by SC-009.

## Validation Findings

Five iterations were run. All corrections below are against **verified** state — the
prototype folders and this repository's manifests were read, not assumed.

### Iteration 1 — the premise of the request did not survive checking

The slice was requested as *"pull the visual layer across … with fresh validation"*, on the
understanding that the source project had client validation to copy.

**It does not.** Both candidate folders are byte-identical static mockups: no `useForm`, no
`zodResolver`, no `onSubmit=`, no network call of any kind. `zod` and `react-hook-form`
appear in the manifest only because the component scaffolder installs them alongside its
form primitive, which nothing in the application uses.

The spec was written to say this plainly in its own second section rather than to proceed
as though a port were possible. The word *fresh* in the request turns out to be the whole
of the validation work, not a qualifier on it.

### Iteration 2 — two incompatibilities the request could not have known about

- **Styling engine is a major version behind** (v3 in the prototype, v4 here), configured
  by a mechanism the current version replaced. Components therefore cannot be copied
  file-for-file. Raised as Decision 3, and it is the reason Q1's answer changes the slice's
  size.
- **Framework is a version behind** (Next 15 vs 16). Lower impact, recorded in the same
  table so planning does not rediscover it.

### Iteration 3 — the shell collision, and a Principle I complication

- **Both projects have a sidebar and header.** The prototype's are static markup with a
  hardcoded menu; `016a`'s carry the tenant switch, archetype-filtered navigation and the
  four feedback states. Replacing them would silently discard three tested mechanisms, two
  of them constitutional. Raised as Decision 4, with the tempting wrong answer named
  explicitly.
- **Three catalog rows are already claimed by `006`.** `US02`, `US03` and
  `US07-EP03-CLM` describe user-facing capability; `006` delivered their APIs and moved the
  rows to itself. Neither slice delivers them alone. Rather than double-claim or mint
  duplicate ids, Decision 1 proposes a joint-delivery convention and flags that the catalog
  does not currently have one.

### Iteration 4 — Q1 resolved (2026-08-28)

All 49 general-purpose components port in this slice; the prototype's 12
application-specific ones do not, since they render screens this slice does not build
against data no slice has shipped.

The answer's cost is that roughly three-quarters of what lands will have no caller on the
day it lands. Rather than leave that implicit, two things were added:

- **FR-024** — an unused component must be verifiably *correct*, not merely present. A
  silently broken one is worse than an absent one, because the next slice will build on it
  before finding the fault.
- **SC-012** — 100% of ported components render under the current styling engine,
  including the uncalled ones.

**Flagged for `/speckit-plan`, not resolved here**: the constitution's testing discipline
has no exemption that clearly covers vendored, uncalled interface code. Exemption 2
(tool-generated code) is the nearest fit and is not exact. The plan must state which
exemption it claims or add the coverage; an unstated exemption is a constitution violation
under the Development Workflow section. Added to the Approval Checklist.

### Iteration 5 — clarification session (2026-08-28), run after `/speckit-plan`

Two gaps, both genuine, both found by scanning the taxonomy rather than re-reading the
prose. Neither was a re-litigation of a settled decision.

| # | Gap | Category | Resolution | Added |
|---|---|---|---|---|
| 1 | **Accessibility was unmentioned in both spec and plan** — zero occurrences of *keyboard*, *focus*, *label*, *aria* or *WCAG*. In a slice made of dialogs and forms, that is the category most likely to be got wrong and hardest to retrofit. | Interaction & UX Flow → Accessibility (**Missing**) | WCAG 2.1 AA, bound to this slice's three screens only | FR-025, FR-026, SC-013, an edge case, an Out-of-Scope boundary |
| 2 | **"A client's record" appeared seven times and was never defined** — dialog, row expansion or route? The Assumptions section said "no client detail page beyond the record itself", which is circular. The plan had silently assumed dialogs. | Interaction & UX Flow → Critical journeys (**Partial**) | A dialog. One route, `/clientes`; no per-client URL | FR-027, SC-014, an edge case, two Assumptions |

**Gap 2 is the one worth noting for process.** The plan had already chosen dialogs and was
internally consistent — so nothing would have failed. The spec simply did not say, and a
different implementer reading only the spec could reasonably have built routes. Confirming
it cost one question; discovering it after three screens existed would have cost a rewrite.

**Three lower-impact items were resolved as Assumptions rather than asked**, each having a
default with no serious advocate for the alternative: page size (inherit `001`'s), search
debouncing (debounce — a request per keystroke has nothing to recommend it), and refetch
versus optimistic update (refetch, because `006` has refusals a browser cannot predict,
which is exactly when optimism is wrong).

**Downstream propagation.** This session ran after `/speckit-plan`, so both answers were
carried into `plan.md`, `contracts/client-screens.md`, `data-model.md` and `quickstart.md`
in the same pass. `tasks.md` does not exist yet and needs nothing.

## Notes

- **All checklist items pass.** No `[NEEDS CLARIFICATION]` markers remain.
- Four decisions carry recommendations and await sign-off. They are not
  `[NEEDS CLARIFICATION]` markers: each has a defensible default with its rationale and its
  cost recorded.
- **Decision 1 is the one to read carefully.** It asks the catalog to adopt a convention it
  has never used, and that is a governance change rather than a slice detail.
