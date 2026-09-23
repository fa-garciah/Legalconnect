# Feature Specification: The Product's Visual Language

**Feature Branch**: `020-design-language`
**Created**: 2026-09-21
**Status**: Draft — awaiting CC technical-lead approval
**Input**: The product works and does not look decided. Give it one visual identity —
typeface, type scale, palette, density and shape — defined once, applied everywhere, and
changed in one place.

---

## Pre-Specification Decisions

Three things were settled before writing, so they are recorded rather than left as
`[NEEDS CLARIFICATION]`:

1. **The direction was chosen from rendered options, not from a description.** Three were
   built against the real Clients and Case Register screens and reviewed on 2026-09-21. The
   chosen one keeps the brand indigo already decided on 2026-08-28 and takes its form
   language — serif display, warm neutral ground, rounded shapes — from the third option.
2. **The brand colour is not reopened.** `#3730A3` is recorded in `globals.css` as
   "confirmed as the decided brand rather than a generator's placeholder". This slice
   inherits it; it does not re-decide it.
3. **This is not a Cosmic Chimps branding exercise.** Principle III: the product core is
   firm-agnostic. The identity belongs to LegalConnect as a product, not to CC and not to
   Felipe's firm.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The product reads as one decided thing (Priority: P1) 🎯 MVP

*`US21-EP00-FND-ApplyProductVisualIdentity`*

Somebody from a law firm opens the product and sees an interface that was designed, not
assembled. The typeface was chosen. The headings and the file numbers share a voice. The
lists are dense enough to work in for a full day. Nothing on screen looks like a framework
default.

**Why this priority**: it is the whole slice. Everything else here is consequence.

**Why it is worth a slice at all**: the current typeface is `Geist`, which arrived with
`create-next-app` and which nobody chose. That single fact is the strongest signal the
product sends that it is a scaffold. It is also a one-file change, which is the best
effort-to-effect ratio available anywhere in the frontend.

**Independent Test**: open every existing screen. Confirm one type scale, one palette, one
density and one shape language across all of them, and that no screen carries a colour or
a size that the token set does not define.

**Acceptance Scenarios**:

1. **Given** any screen in the product, **When** it renders, **Then** every colour it draws
   resolves to a token defined in `globals.css` — no literal anywhere in application code.
2. **Given** the token set, **When** one brand value changes in `globals.css`, **Then**
   every screen changes with it and no component file is edited.
3. **Given** the type scale, **When** a heading, a body paragraph and a file number render,
   **Then** each takes its size and family from a named step, not from an ad-hoc utility.
4. **Given** a record list at a realistic length, **When** somebody scans it, **Then** the
   row rhythm is the decided density and not the component library's marketing default.
5. **Given** the four authentication screens, **When** they render, **Then** they carry the
   same identity as the rest of the product — they are the first thing a firm sees.

---

### User Story 2 - The interface is legible to everybody who uses it (Priority: P2)

Nobody is excluded by the new look: contrast holds, focus is visible, and nothing that was
reachable before becomes unreachable.

**Independent Test**: contrast-check every text-on-fill pair the token set produces; drive
every interactive control by keyboard.

**Acceptance Scenarios**:

1. **Given** any text token on any surface token it is paired with, **When** the contrast is
   measured, **Then** it is at least 4.5:1, or 3:1 at 24px and above.
2. **Given** any interactive control, **When** it receives keyboard focus, **Then** the focus
   ring is visible against its own background.
3. **Given** the screens `018` and `019` shipped, **When** they render under the new tokens,
   **Then** every existing component test and every e2e test still passes unchanged.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The product MUST define exactly one type scale, in `globals.css`, with named
  steps for display, heading, body, small and caption.
- **FR-002**: The product MUST load exactly two typefaces: one serif for display and record
  identifiers, one sans for interface text. Neither is a framework default.
- **FR-003**: File numbers, RFCs and dates MUST render with tabular figures, so columns of
  them align.
- **FR-004**: The brand colour MUST remain `#3730A3`, with `#2D2582` as its pressed state
  and `#EEF2FF` as its tint.
- **FR-005**: The palette MUST define one secondary accent, distinct in hue from the brand,
  for the one case the brand cannot carry: distinguishing a natural person from an
  organisation, and marking a suspended matter.
- **FR-006**: Surfaces MUST be warm rather than pure white. The ground, the rail and the
  borders share a warm neutral family.
- **FR-007**: The radius scale MUST be defined once and derived, as the existing `--radius`
  already is.
- **FR-008**: Density MUST be decided and named: control height, row height, card padding
  and the page gutter each take a token, not a per-screen guess.
- **FR-009**: No file in application code may contain a colour literal. The existing check
  from `018/T050` stays at zero.
- **FR-010**: Every screen the product already ships MUST render under the new identity —
  including the four authentication screens, which are outside the shell.
- **FR-011**: The unreachable dark theme MUST be resolved rather than left half-built. See
  Resolved Decisions.
- **FR-012**: Every text-on-fill pair the token set produces MUST meet 4.5:1, or 3:1 at 24px
  and above.
- **FR-013**: Changing the identity MUST remain a `globals.css` edit. A slice that needs a
  value the tokens do not provide adds a token; it does not paste a value.

---

## Success Criteria *(mandatory)*

- **SC-001**: `grep` for colour literals in `src/**` returns zero.
- **SC-002**: `layout.tsx` loads no font whose name is `Geist`.
- **SC-003**: All existing frontend tests pass with no assertion changed to accommodate the
  new look. A test that breaks reveals a regression, not a needed edit.
- **SC-004**: Every token pair in the contrast table is measured and recorded.
- **SC-005**: A single-value change to `--brand` visibly repaints every screen, demonstrated
  once and recorded.

---

## Out of Scope

**Screens that do not exist.** Seven of the ten navigation sections are marked
`available: false` because the product behind them has not been built. This slice paints
what exists; it does not invent `/calendario`, `/kpis`, `/conectores`, `/horas`,
`/facturacion` or `/configuracion`. Each of those is a domain slice with its own spec, its
own API and, for three of them, an unresolved scope decision. **Rendering an empty screen
behind a navigation item would directly contradict `016a`'s recorded reasoning that "a menu
item that 404s is worse than one that is honestly marked as not built."**

**`/documentos`.** `007` already specifies its four screens as T044–T047 and its API is
built and tested. It is the next slice to land, under its own spec, in this identity.

**New components.** `018` shipped 49. This slice restyles through tokens; it does not add to
the library.

**The client card's missing fields.** `018`'s own record notes that the reference design
wanted email, telephone, responsible attorney and a matter count, and that
`GET /tenant/clients` returns none of them. Filling those is a `006` change — columns, a
migration, an API change and a permission question for the count — not a visual one.

**A dashboard.** `/` is `016a`'s placeholder. `015-dashboards` owns it and reads from slices
that do not exist yet.

---

## Resolved Decisions

**D1 — The dark theme is removed, not completed.** `globals.css` defines a full `.dark`
block and **nothing in the product ever applies that class**: no toggle, no system-preference
listener, no server-rendered attribute. It has never rendered. Shipping a second complete
palette that no one can reach costs every future slice a `dark:` decision it cannot test, so
this slice deletes it and records the deletion. If the product wants dark mode it is its own
story, with a control, a persistence decision and its own contrast table — none of which
exists today.

**D2 — Pill-shaped controls require editing a vendored component, and that is deferred.**
The chosen direction draws buttons and inputs as pills. The radius scale cannot express that
without making every `rounded-md` surface a pill, including dialogs and cards. Getting it
properly means editing `button.tsx` and `input.tsx`, which `018` ported stock. That is a
defensible change — they are our components now, and "stock and unmodified" was a fact about
the port rather than a permanent rule — but it is a different kind of change from a token
edit and it is scoped separately, inside this slice's Phase 3, so the token work can land and
be verified on its own first.

**D3 — Warm ground with a cool brand is deliberate.** Indigo is cool and the neutrals are
warm. The pairing was chosen rather than tolerated: indigo on a warm ground reads as ink on
paper, which is the right register for a product whose subject is matters and case files. A
pure-white ground makes the same indigo read as generic SaaS.

---

## Dependencies

- **`016a-frontend-shell`** — the shell, the navigation registry and the feedback
  primitives this slice repaints. Built.
- **`018-frontend-clients`** — the 49 components, the token contract in
  `contracts/design-system.md`, and the no-literals rule this slice extends rather than
  replaces. Built.
- **`003-authentication-mfa`** — owns the four unchromed screens FR-010 brings into scope.
  Built.

No backend dependency. This slice changes no API call, no type and no data shape.

---

## Assumptions

- The two typefaces are served by Google Fonts through `next/font/google`, as the current
  scaffold already does. No self-hosting decision is made here.
- Nobody outside the team has seen the product yet, so no existing user is disrupted by the
  change of appearance.

---

## Traceability

| ID | Archetype | Capability |
|---|---|---|
| `US21-EP00-FND-ApplyProductVisualIdentity` | System User | One visual identity every module renders in |

Added to `master-user-story-catalog.md` in this slice's own PR, on the precedent
`016a-frontend-shell` set for `US17`–`US20`: architecture every later frontend slice inherits
enters the catalog rather than arriving as unbacked commits (Principle I).

---

## Approval Checklist

- [ ] Zero `[NEEDS CLARIFICATION]` markers — **met**
- [ ] `US21-EP00-FND` present in `master-user-story-catalog.md` — **met**, amended in this PR
- [ ] Direction chosen from rendered options rather than described — **met**, 2026-09-21
- [ ] D1 (dark theme removal) accepted by the CC technical lead
- [ ] D2 (editing two vendored components) accepted by the CC technical lead
- [ ] Contrast table produced and every pair passing
- [ ] CC technical-lead sign-off
