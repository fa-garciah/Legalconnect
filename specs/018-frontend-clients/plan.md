# Implementation Plan: Client Screens & the Design System They Need

**Branch**: `018-frontend-clients` | **Date**: 2026-08-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/018-frontend-clients/spec.md`

---

## Summary

Three client screens — directory, form, withdrawal — built against `006`'s five endpoints,
plus the component library and theme every later frontend slice will render into. The
first frontend slice to consume `016a`'s shell rather than build one.

**Decisions signed off before this plan** (spec.md, 2026-08-28): all four, plus Q1.

1. The three `EP03-CLM` catalog rows are delivered jointly by `006` and this slice.
2. The browser validates shape; the server owns truth.
3. The theme is ported forward to the current styling engine, not pinned backward.
4. `016a`'s shell keeps its behaviour and adopts the prototype's appearance.
5. **Q1**: all 49 general-purpose components port here; the 12 application-specific ones
   do not.

**Clarification session, 2026-08-28** — run after this plan's first revision, and both
answers are folded in below:

6. **WCAG 2.1 AA** binds this slice's three screens (FR-025, FR-026, SC-013). Accessibility
   was unmentioned in the first revision of both documents — a real gap in a slice made of
   dialogs and forms.
7. **A client's record is a dialog**, not a route (FR-027, SC-014). The first revision used
   the word "record" seven times without defining it; the plan had already assumed dialogs,
   so this confirms rather than changes the file layout.

### What Phase 0 found, and why it makes this slice smaller than it looked

Four things, each verified by reading the prototype rather than assuming. Together they
turn "migrate 49 components across a major version" into "define a theme and copy files."

| Expected | What the code actually shows |
|---|---|
| 49 components need hand-migration to the new styling engine | **They do not.** Every one is stock, unmodified, and uses only token utilities (`bg-primary`, `border-input`, `ring-ring`). Those are generated from the theme. Migrate the theme and the components work as they are — research D1. |
| The prototype has a theme to port | **Its theme is the vendor default.** `--primary` is near-black. The actual brand — `#3730A3`, used **50 times** — is hardcoded inline as `bg-[#3730A3]`, overriding the theme on every button. Porting it properly means *defining* it, which is better than what the prototype does — research D3. |
| Validation exists to copy | **None exists.** Established during `/speckit-specify` and restated in the spec's second section. This slice writes it. |
| One plugin dependency | Confirmed: components use `animate-in`, `animate-out`, `animate-accordion-*`. One package swap — research D2. |

The net: the port is a **theme** migration, not a component migration, and the brand
identity has to be extracted from scattered literals rather than copied from a config.

---

## Technical Context

**Language/Version**: TypeScript 5, React 19.2, Next 16.3 (App Router) — unchanged,
inherited from `016a`.

**Primary Dependencies**: Four groups, all new to this repository.

- **Component primitives**: the Radix packages the ported components import, plus
  `class-variance-authority`, `clsx`, `tailwind-merge` and `lucide-react`. Vendored
  components import these directly; there is no way to take the components without them.
- **Animation**: `tw-animate-css`, replacing the prototype's `tailwindcss-animate`, which
  is a plugin for the previous major version (research D2).
- **Forms**: `react-hook-form`, `zod`, `@hookform/resolvers` — present in the prototype's
  manifest and unused there, so this is a fresh adoption rather than a carry-over.
- **Nothing for data fetching.** `@tanstack/react-query` and `api-client.ts` already exist
  and are what these screens call.

**Storage**: None. This slice persists nothing; `006` owns the data.

**Testing**: Vitest + Testing Library (`tests/unit`, `tests/component`) and Playwright
(`tests/e2e`), the three tiers `016a` established. Strict TDD per the constitution, with
one exemption claimed explicitly — see the Constitution Check.

**Target Platform**: Browser. No new deployment surface.

**Project Type**: Frontend only. `backend/` is **not touched** — `006` shipped every
endpoint these screens call, and this slice adds no capability, no route and no migration.

**Performance Goals**: No new budget. The two that matter are inherited: `016a`'s loading
indicator thresholds (a request faster than the threshold shows no spinner), and
`006/FR-002a`'s server-side filtering, which this slice must not undo by filtering again
after the response (FR-003).

**Constraints**:

- **FR-022**: the shell's behaviour is consumed, not restyled away. The tenant switch,
  archetype-filtered navigation and refusal classification are `016a`'s and stay `016a`'s.
- **FR-015**: hiding a control is cosmetic. `004` refuses the underlying request either way.
- **FR-003**: filtering happens once, on the server. Re-filtering the response would
  shorten pages while the cursor still promised more.
- **FR-008**: the browser validates only what it can know alone.
- **FR-023**: all copy in Spanish, and `016a` already ships a test that detects English.
- **FR-024**: a ported component that no screen calls must still be verifiably correct.
- **FR-025/FR-026**: WCAG 2.1 AA on this slice's screens — keyboard operation, dialog focus
  management, announced validation errors, labelled inputs. The ported components implement
  most of this already; the requirement is what stops it being discarded by a wrapper.
- **FR-027**: records render in dialogs, and the directory's filter and position survive
  one opening and closing.

**Scale/Scope**: 49 components ported, 3 screens built, 1 navigation entry, 4 capability
mirror rows, ~10 new dependencies. No backend change, no schema change, no new capability.

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

### Initial gate — before Phase 0

| # | Principle | Verdict | Basis |
|---|---|---|---|
| I | Spec-First Delivery (NON-NEGOTIABLE) | ✅ **PASS** *(was ⚠️; cleared 2026-08-28)* | The three `EP03-CLM` rows now read `006 + 018` in `master-user-story-catalog.md`, and the joint-delivery convention Decision 1 proposed is recorded in the catalogue's own `EP03` amendment note. T001 done. |
| II | Tenant Isolation (NON-NEGOTIABLE) | ✅ PASS | This slice opens no connection and writes no query. Every request goes through `api-client.ts`, which attaches the active tenant; isolation is enforced server-side by RLS and `006`'s scope resolver, neither of which a browser can reach around. |
| III | Product Core vs. Tenant Customization | ✅ PASS | Nothing firm-specific enters the interface. The brand palette is the product's, not a client's, and the prototype's Spanish copy is a starting point rather than a requirement (spec Assumptions). |
| IV | Least Privilege by Default | ✅ PASS | **No capability is added.** The matrix in the spec is a mirror of four rows `004` governs, and `016a` already ships the test that fails the build if the mirror and `004` disagree. |
| V | Auditable by Construction | ✅ PASS | Not applicable in the browser — `006` audits every mutation these screens trigger, server-side, where it cannot be bypassed. This slice adds no audit surface and must not attempt one. |
| VI | Compliance-by-Design | ✅ PASS | No new personal data is collected or displayed beyond what `006` already stores. No client data is logged. |

**Testing discipline** — one exemption claimed, explicitly, as the spec's Q1 requires:

> **Exemption 2 (tool-generated code) is claimed for the 49 ported components' internals,
> and for those only.**
>
> They are vendor scaffolding, generated by a component CLI and vendored unmodified —
> `button.tsx` is verbatim upstream, checked. Writing unit tests for a `cva` variant map
> nobody wrote would test the vendor, not this product.
>
> **What the exemption does NOT cover, and what is therefore tested**: that each ported
> component renders at all under the current styling engine (FR-024, SC-012), and every
> line of this slice's own code — the screens, the validation schema, the mapping from
> refusal to form error. A component that lands silently broken is worse than one that
> never landed, because the next slice will build on it before finding the fault. That is
> the one thing "it's vendored" does not excuse, and research D5 specifies the smoke test
> that covers it.

### Re-check — after Phase 1 design

| # | Principle | Verdict | What the design delivers |
|---|---|---|---|
| I | Spec-First | ✅ **PASS** *(cleared 2026-08-28)* | The amendment landed. Phase 1 introduced no requirement absent from the spec. |
| II | Tenant Isolation | ✅ PASS | Confirmed by design: `contracts/client-screens.md` routes every call through the existing `apiFetch`, which is the only place tenant and identity headers are set. No screen constructs a request itself. |
| III | Product Core | ✅ PASS | Confirmed: the palette lands as semantic tokens (`--color-primary`), not as a firm's colours. |
| IV | Least Privilege | ✅ PASS | Confirmed: four mirror rows, zero new capabilities, and `capability-matrix-sync.test.ts` extended with the same four rows transcribed from `004`. |
| V | Auditability | ✅ PASS | Confirmed: no browser-side audit path exists or is added. |
| VI | Compliance | ✅ PASS | Confirmed. |

**One design consequence worth naming under IV.** `data-model.md` gives each control a
single capability id, and the screens read visibility from the mirror rather than from an
archetype list. That matters because an archetype list would drift from `004` silently,
while the mirror is build-checked. FR-014's hiding and FR-015's non-enforcement are then
the same fact expressed once.

---

## Project Structure

### Documentation (this feature)

```text
specs/018-frontend-clients/
├── spec.md
├── plan.md                    # This file
├── research.md                # Phase 0 — D1..D7
├── data-model.md              # Phase 1 — view models, validation schema, control map
├── contracts/
│   ├── client-screens.md      # Routes, states, and the calls each screen makes
│   └── design-system.md       # The theme contract, and what "ported" means per component
├── quickstart.md              # Phase 1 — run-and-verify
└── tasks.md                   # /speckit-tasks — NOT created by /speckit-plan
```

### Source Code (repository root)

```text
frontend/
├── src/
│   ├── app/
│   │   ├── globals.css              # MODIFIED: the theme — @theme tokens, the brand
│   │   │                            #   palette, and the dark variant (research D3)
│   │   ├── layout.tsx               # MODIFIED: font wiring only; Shell stays as it is
│   │   └── clientes/                # FR-027: ONE route. No [id] segment — records are
│   │       │                         #   dialogs, and the prototype's clientes/[id] is
│   │       │                         #   deliberately not ported
│   │       ├── page.tsx             # US1 — the directory
│   │       ├── ClientDirectory.tsx  # US1 — list, filters, pagination
│   │       ├── ClientFilters.tsx    # US1 — name and status, debounced
│   │       ├── ClientFormDialog.tsx # US2 — create and edit, one component
│   │       └── WithdrawDialog.tsx   # US3 — withdraw and restore confirmation
│   ├── clients/
│   │   ├── api.ts                   # The five calls, through apiFetch — mirrors
│   │   │                            #   007's src/app/documents/api.ts shape
│   │   ├── schema.ts                # The validation schema (Decision 2's shape half)
│   │   └── types.ts                 # Wire shapes from 006/contracts/client-api.md
│   ├── components/ui/               # NEW: the 49 ported components, vendored
│   ├── lib/utils.ts                 # NEW: the `cn` helper every component imports
│   ├── authz/capability-matrix.ts   # MODIFIED: +4 mirror rows (016a/FR-025)
│   └── shell/navigation-items.ts    # MODIFIED: +1 entry (016a/FR-002)
└── tests/
    ├── unit/
    │   ├── client-schema.test.ts            # Validation rules, no DOM
    │   ├── client-api.test.ts               # Request shapes and refusal mapping
    │   └── capability-matrix-sync.test.ts   # MODIFIED: +4 rows in 016a's fixture
    ├── component/
    │   ├── clientes/ClientDirectory.test.tsx
    │   ├── clientes/ClientFormDialog.test.tsx
    │   ├── clientes/WithdrawDialog.test.tsx
    │   ├── clientes/control-visibility.test.tsx  # FR-014, per archetype
    │   ├── clientes/accessibility.test.tsx   # FR-025/FR-026 — labels, announcements,
    │   │                                     #   focus trap and restoration
    │   ├── ui-smoke.test.tsx                # FR-024/SC-012 — every ported component
    │   └── spanish-copy.test.tsx            # MODIFIED: +this slice's components
    └── e2e/
        ├── client-directory.spec.ts         # US1 end to end
        ├── client-intake.spec.ts            # US2, incl. multi-error display
        └── client-withdraw-restore.spec.ts  # US3
```

**Structure Decision.** Three placements are deliberate and worth stating.

- **`src/app/clientes/`, in Spanish.** The route is user-visible and the constitution puts
  UI in Spanish; the prototype's own route is `clientes`. Code identifiers stay English
  per the same rule — hence `ClientDirectory.tsx` inside `clientes/`.
- **`src/clients/` separate from the route folder.** The API calls, schema and types are
  not screen-specific and a later case-screens slice will import the same `apiFetch`
  patterns. Keeping them out of `app/` also keeps them inside the coverage include, which
  excludes `app/**/page.tsx`.
- **`src/components/ui/` at the top level**, not under `app/`. It is shared vendor code,
  and 48 of its 49 files belong to no screen in this slice.

---

## Complexity Tracking

| Deviation | Why Needed | Alternative Rejected Because |
|---|---|---|
| 49 components land, ~12 called | Q1, signed off. Pays the theme migration once and leaves later slices nothing to do. | Porting in batches — each batch repeats the migration and risks two slices migrating the same component differently. |
| Exemption 2 claimed for vendored component internals | They are unmodified CLI output; unit-testing a vendor's variant map tests the vendor. | Writing tests for all 49 — cost with no signal. **Mitigated rather than waved through**: FR-024's smoke test proves each one renders (research D5). |
| ~10 new dependencies at once | The ported components import Radix primitives directly; there is no subset that avoids them. | Rewriting the components to drop Radix — that is building a component library, not adopting one. |
| No shareable URL for an individual client | FR-027, signed off. A dialog keeps the directory's filter and position behind it, which matters for a screen whose job is find-then-correct. | A route per record — it loses the filter on every return unless that also moves into the URL, and makes each edit two navigations. Revisitable: adding a route later does not invalidate the dialog. |

**No principle is violated by this plan.** The one exemption is named, scoped, and
compensated; the one ⚠️ is the catalog amendment, which is procedural and merges first.

---

## Open items for the CC technical lead

1. ~~**The catalog amendment must merge first**~~ **Done 2026-08-28** (T001). Three `EP03`
   rows now read `006 + 018`, and the joint-delivery convention is written into the
   catalogue's own amendment note — including the rule for later slices, and the note that
   it is not applied retroactively. Constitution Check I's ⚠️ is **cleared**.

2. ~~**The brand palette is being *defined* here, not copied.**~~ **Resolved 2026-08-28**:
   confirmed as the decided brand rather than a generator's placeholder. `#3730A3`,
   `#2D2582`, `#1A1A1A`, `#6B7280` and `#EEF2FF` land as tokens in T008. The prototype
   hardcodes the first of those fifty times and never puts it in its theme; this slice
   fixes that rather than reproducing it.

3. **The prototype exists twice.** `LegalConnect - FrontEnd/` and `cosmic-legalconnect/`
   are byte-identical. One should be deleted to stop a future reader porting from the
   stale one.

4. **`006`'s three unrendered capabilities.** This slice renders four of `006`'s eleven
   rows. The case rows — including the first `assigned`-scope capability in the product —
   still have no screen. Not this slice's scope; flagged so the gap stays visible.
