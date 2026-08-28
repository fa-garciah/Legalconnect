# Research — Client Screens & the Design System They Need

**Feature**: `018-frontend-clients` | **Date**: 2026-08-28
**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

Seven decisions. D1–D3 are the port; D4–D6 are the screens; D7 is what this slice
deliberately leaves alone.

Every claim about the prototype or this repository below was read from the files, not
recalled.

---

## D1 — The components port as source, unmodified. The migration is the theme.

**Decision.** Copy all 49 component files across unchanged. Do not hand-edit them for the
new styling engine.

**Why this works, which is not obvious.** The concern that motivated Q1 was a major-version
migration across 49 files. Reading them dissolves it:

- **They are stock.** `components/ui/button.tsx` is verbatim upstream output — the same
  `cva` base string, the same six variants. Nothing was customised, so there is nothing
  bespoke to preserve.
- **They contain no `@apply`.** Checked across the whole directory: zero occurrences. The
  directive whose behaviour changed between versions is not used.
- **Every class they reference is a token utility.** `bg-primary`, `text-primary-foreground`,
  `border-input`, `ring-ring`, `ring-offset-background`. In the previous version those came
  from a JavaScript config; in the current one they come from a CSS `@theme` block. **The
  utility names are identical either way.** Define the tokens and the existing class strings
  resolve.

So the version difference lives entirely in *how the theme is declared*, not in what the
components say. That is one file (D3), not forty-nine.

**What this does not cover, and is handled elsewhere**: the animation utilities, which come
from a plugin rather than from tokens (D2), and the proof that each component actually does
render once landed (D5).

**Alternatives considered.**

- *Regenerate from the current registry with the component CLI.* Tempting, and it would
  produce components already written for this version. Rejected for two reasons: it needs
  network access this repository's CI does not assume, and the current registry's output
  differs from the prototype's in structure — adopting it would mean the screens are built
  against components nobody has seen, losing the one thing the prototype was worth taking.
- *Rewrite the components without the primitive library.* That is building a component
  library rather than adopting one. Out of proportion to a client directory.

---

## D2 — One plugin swap: `tailwindcss-animate` → `tw-animate-css`

**Decision.** Replace the dependency and import the replacement from `globals.css`.

**Why it is needed.** The ported components use six animation utilities, found by grep:
`animate-in`, `animate-out`, `animate-accordion-down`, `animate-accordion-up`,
`animate-caret-blink`, `animate-pulse`. The first four come from the prototype's plugin,
which is written against the previous version's plugin API and does not load in the current
one.

`tw-animate-css` is the maintained replacement, distributed as CSS rather than as a plugin,
so it is imported rather than configured — which suits a version whose config *is* CSS.

**The two accordion keyframes need declaring either way.** They were in the prototype's JS
config, not in its plugin, so they move into `@theme` with the rest (D3).

**Alternative considered.** Declaring all six sets of keyframes by hand and dropping the
dependency. Rejected: it is more code to own for no benefit, and `animate-in`/`animate-out`
carry a family of modifiers (fade, zoom, slide, with directions and durations) that would
have to be reproduced faithfully or the components would degrade in ways nobody would
notice until a dialog looked wrong.

---

## D3 — The brand palette is *defined* here, because the prototype never defined it

**This is the finding that most changes what "port the theme" means.**

**What the prototype actually does.** Its theme variables are the vendor defaults —
`--primary: 222.2 47.4% 11.2%`, a near-black. Its real brand is not there at all. It lives
as hex literals in page markup:

| Literal | Occurrences | Evident role |
|---|---|---|
| `#3730A3` | **50** | Primary — every branded button, `bg-[#3730A3]` |
| `#2D2582` | **27** | Primary hover — always paired with the above |
| `#1A1A1A` | 15 | Heading text |
| `#6B7280` | 6 | Muted text |
| `#EEF2FF` | 3 | Primary tint / selected background |

Every branded button in the prototype reads
`className="bg-[#3730A3] hover:bg-[#2D2582]"` — an inline override of the theme, repeated
fifty times, on components that already support `bg-primary`.

**Decision.** Put the palette in `@theme` where it belongs: `--color-primary: #3730A3` and
the rest as semantic tokens. Then the stock components render branded **with no inline
override at all**, and this slice's screens use `variant="default"` rather than pasting a
hex.

**Why this is a port rather than a redesign.** The rendered result is the prototype's — same
colours, same pairings. What changes is where they are written. A future palette change
becomes one line instead of ninety-two edits, and D1's "components work unmodified" only
holds if the tokens carry the brand.

**Also required in the same file**, both moving from the prototype's JS config into CSS:
the border-radius scale (`--radius` and its three derivations), and the dark-mode variant,
which the previous version expressed as a config key and the current one expresses as a
custom variant.

**Recorded for the technical lead** (plan.md, open item 2): if those hex values were a
generator's placeholder rather than a decided brand, this is the cheapest moment in the
project to change them.

---

## D4 — Validation: `zod` schema, resolved into `react-hook-form`, shape only

**Decision.** One schema per form, in `src/clients/schema.ts`, consumed by the form through
the resolver package. Validation on blur and on submit, never on first render.

**What the schema asserts** — Decision 2's "shape" half, and nothing beyond it:

| Field | Rule | Why the browser may decide this |
|---|---|---|
| `legalName` | present after trimming, ≤ 250 characters | Both are knowable without the server, and `006` enforces the same bounds |
| `kind` | exactly `organization` or `person` | A closed set fixed by `006`'s schema |
| `rfc` | optional; if present, ≤ 13 characters after trimming | `006/FR-002` makes it nullable. **Format is deliberately not checked** — see below |

**Why RFC format is not validated.** It would be easy and it would be wrong. `006`'s own
service declines to validate it, for a stated reason: a client's RFC becomes load-bearing
when invoicing ships, and rejecting a half-collected one now would block the intake this
slice exists to enable. A browser stricter than the server refuses records the server would
accept — the exact failure Decision 2 exists to prevent.

**What the schema must never assert**: whether a client may still be used, whether a name
collides, whether the caller holds the capability. Each needs the server's knowledge.

**Timing.** `react-hook-form`'s validation mode is set so untouched fields stay clean
(FR-007) and all errors appear together on submit (FR-005, SC-002) rather than one per
attempt.

**Alternatives considered.**

- *Native HTML constraint validation.* Free and no dependency, but it shows one error at a
  time and its messages cannot be reliably translated — both directly contradict FR-005 and
  FR-006.
- *Hand-rolled validation.* Avoids a dependency this repository has never had, but the
  dependency is already in the prototype's manifest and is the thing the request asked for.

---

## D5 — FR-024's proof: one render smoke test over all 49

**Decision.** A single test file iterates every ported component and asserts it renders
without throwing.

**Why this is the right shape rather than 49 test files.** The exemption claimed in
plan.md's Constitution Check covers the components' *internals* — their variant maps are
vendor output, and testing them tests the vendor. It does not cover whether they survived
the move. Those are different questions, and only the second is this slice's to answer.

A component that lands silently broken is worse than one that never landed: the next
frontend slice will build on it and discover the fault at the least convenient moment. That
is the risk Q1's answer created by landing ~37 uncalled components, and this is its
mitigation.

**What the test asserts, and deliberately does not.** That each component mounts with
minimal props and produces DOM. Not that it looks right — appearance is a human judgement
and screenshot-diffing 49 vendor components would be noise. The realistic failure mode
after a theme migration is *throwing* or *rendering empty*, not rendering ugly, and this
catches both.

**Components requiring a provider or a trigger** — dialogs, tooltips, popovers, accordions —
are mounted in the state their upstream examples use, rather than skipped. A skipped
component is exactly the one that would rot unnoticed.

---

## D6 — Refusals reach the form; the classifier is not touched

**Decision.** `src/clients/api.ts` returns `016a`'s existing `ApiResult` shape unchanged.
The form maps a failed result onto a form-level error, preserving what was typed (FR-009).
`refusal-bucket.ts` is **not modified**.

**Why the classifier stays untouched.** It already handles every code `006`'s client routes
return. Checked against `006/contracts/client-api.md` §7:

| `006` returns | Existing classification | Rendered as |
|---|---|---|
| `403 not_authorized` | role bucket | "your role does not permit this" |
| `404 not_found` | opaque | generic — and identical to a cross-tenant refusal, deliberately |
| `400 validation_failed` | opaque, by the `default` branch | generic retry copy |
| `409 already_deactivated` / `already_active` | opaque, same branch | generic |

The last two rows are the interesting ones. Neither code is in the classifier's switch, so
both fall to `default` → opaque. **That is correct for security and unhelpful for the
person**, who did something legitimate and gets generic copy.

**Resolution: fix it in the form, not in the classifier.** A `409` on a withdrawal means
the record moved under the caller — the form says so and refreshes. That is screen-level
knowledge about one route, not a wire-level classification rule, and putting it in the
classifier would make a security-shaped module carry per-screen copy. `016a`'s research D3
drew that line deliberately; this slice respects it.

**Consequence for FR-019**: a refusal carrying a remedy says so, because the classifier
already distinguishes role and plan refusals. One that does not stays generic — which for
`404` is the whole point.

---

## D7 — What this slice deliberately does not touch

Recorded because each is a thing a reasonable implementer might change, and each would
cost something specific.

| Left alone | What changing it would cost |
|---|---|
| `Shell`, `Header`, `NavigationMenu`, `TenantSwitcher` | Decision 4. They carry the tenant switch, archetype filtering and feedback states — three tested mechanisms, two constitutional. They get the new look via tokens, not a rewrite. |
| `refusal-bucket.ts` | D6. It is the module that makes an `assigned`-scope refusal indistinguishable from a nonexistent resource, and `006` just spent a slice proving that end to end. |
| `api-client.ts` | It is the only place tenant and identity headers are attached. A screen that built its own request would bypass the one seam that guarantees they are present. |
| The `principal` fixture | Real sessions are slice `003`. Screens read the principal through the existing seam and will keep working when it is replaced. |
| Any backend file | `006` shipped every endpoint. If a screen appears to need a backend change, that is a spec gap to raise, not a change to make here. |
| The prototype's 12 application components | Q1's scope is the general-purpose library. Those render dashboards and case lists against data no slice has shipped. |

---

## Open questions carried to `plan.md`

None technical. The four items `plan.md` carries are governance and product: the catalog
amendment, confirming the brand palette, deleting the duplicate prototype folder, and the
visibility of `006`'s still-unrendered case capabilities.
