# Contract — The Design System

**Feature**: `018-frontend-clients` | **Constitution**: v1.4.0

What "port the visual layer" means precisely: which files move, what changes about them
(almost nothing), what has to be written from scratch (the theme), and what counts as done.

> **The finding this contract is built on.** The 49 components are stock and unmodified,
> contain no `@apply`, and reference only token utilities. The version difference between
> the prototype and this repository lives in *how the theme is declared*, not in what the
> components say. So this is a theme migration with a file copy attached — research D1.

---

## 1. What moves, and what does not

| From the prototype | Lands at | Count | Changed? |
|---|---|---|---|
| `components/ui/*.tsx` | `frontend/src/components/ui/` | **49** | **No** — copied as-is (research D1) |
| `lib/utils.ts` | `frontend/src/lib/utils.ts` | 1 | No. The `cn` helper every component imports |
| Theme values | `frontend/src/app/globals.css` | — | **Rewritten** — §3 |
| `components/*.tsx` (dashboard, charts, sidebar, header…) | — | 0 of 12 | **Not ported** — Q1's scope is the general-purpose library |
| `app/**/page.tsx` | — | 0 of 11 | **Not ported** — static mockups; this slice builds `clientes` against the real API |
| `tailwind.config.ts` | — | — | **Not ported** — the mechanism it uses was replaced; its contents move into `globals.css` |

### Why the 12 application components stay behind

`dashboard-metrics`, `dashboard-chart`, `casos-activos`, `proximas-fechas`,
`tareas-pendientes`, `calendar-chart` and the rest render screens this slice does not build,
against data **no slice has shipped**. Porting them would land components that cannot work
and that a later slice would rewrite anyway once the real shapes exist.

`sidebar.tsx` and `header.tsx` are excluded for a different reason: this repository already
has both, carrying behaviour the prototype's lack (Decision 4, research D7).

---

## 2. The import alias must be checked, once

The components import `@/lib/utils` and `@/components/ui/*`. Both projects map `@` to their
source root — the prototype via its own config, this repository via `tsconfig.json` and
`vitest.config.ts`. The paths therefore resolve unchanged.

**This is worth verifying on the first component rather than the forty-ninth.** An alias
mismatch fails identically for all of them, and finding it early is the difference between
one fix and a full re-copy.

---

## 3. The theme, which is written rather than copied

Research D3 in full: the prototype's theme variables are **vendor defaults**, and its actual
brand lives as hex literals in page markup — `#3730A3` fifty times, always as
`bg-[#3730A3] hover:bg-[#2D2582]`, overriding the theme on components that already support
`bg-primary`.

So there is no theme to copy. There is a palette to extract and declare.

### 3.1 What `globals.css` must define

| Group | Tokens | Value source |
|---|---|---|
| Brand | `--color-primary`, `--color-primary-foreground` | `#3730A3`, white. The hover pairing `#2D2582` is expressed as the primary's hover, not as a separate token |
| Text | `--color-foreground`, `--color-muted-foreground` | `#1A1A1A`, `#6B7280` |
| Surfaces | `--color-background`, `--color-card`, `--color-popover`, and their foregrounds | White, near-white |
| Structure | `--color-border`, `--color-input`, `--color-ring` | Neutral; `ring` follows the brand |
| Semantic | `--color-destructive`, `--color-accent`, `--color-secondary`, and their foregrounds | Vendor defaults are acceptable; `accent` may take the `#EEF2FF` tint the prototype uses for selected rows |
| Radius | `--radius`, plus the `lg`/`md`/`sm` derivations components reference | From the prototype's config |
| Keyframes | `accordion-down`, `accordion-up` | From the prototype's config — they were never in its plugin |

### 3.2 The two mechanism changes

- **The animation utilities** come from a package rather than a plugin. The prototype's
  plugin targets the previous major version's API and does not load; `tw-animate-css` is the
  maintained replacement and is imported from CSS (research D2). Six utilities depend on
  it: `animate-in`, `animate-out`, `animate-accordion-*`, `animate-caret-blink`,
  `animate-pulse`.
- **Dark mode** was a config key and is now a custom variant declared in CSS. The ported
  components carry `dark:` classes and will silently never activate them if this is omitted.

### 3.3 The contract the 49 components depend on

**These token names, unchanged.** The components reference them as utilities and render
unstyled — not broken, *unstyled* — if a name is missing. That failure is quiet, which is
exactly why §5's smoke test exists.

### 3.4 One rule for every file this slice writes

> **No colour literal in any new file.** Not `bg-[#3730A3]`, not `text-[#1A1A1A]`, not a
> hex in a style attribute.

The prototype does this fifty times and it is the practice being replaced, not copied. A
literal in a new file is a **defect**, for two concrete reasons: it silently opts that
element out of any future palette change, and it defeats the whole point of §3.1.

`variant="default"` on a button is already `#3730A3` once the tokens land. If something
needs a colour a token does not provide, the token set is wrong — fix §3.1, do not paste a
hex.

---

## 4. Dependencies this pulls in

Unavoidable: the ported components import these directly, and no subset of the 49 avoids
them.

| Group | Packages |
|---|---|
| Primitives | The `@radix-ui/*` packages the ported components import |
| Composition | `class-variance-authority`, `clsx`, `tailwind-merge` |
| Icons | `lucide-react` |
| Animation | `tw-animate-css` (**not** the prototype's `tailwindcss-animate`) |
| Forms | `react-hook-form`, `zod`, `@hookform/resolvers` |

**The forms group is a fresh adoption, not a carry-over.** All three are in the prototype's
manifest and none is used there — the scaffolder installs them with its form primitive
(spec, second section). This slice is the first real use in either project.

---

## 5. What "ported" means: the smoke test

FR-024 and SC-012. Research D5 explains the shape; this is the acceptance bar.

`tests/component/ui-smoke.test.tsx` iterates **every** ported component and asserts it
mounts and produces DOM.

| Asserted | Not asserted |
|---|---|
| It renders without throwing | That it looks right |
| It produces DOM rather than nothing | Pixel or screenshot comparison |
| Components needing a trigger or provider render in that state | Interaction behaviour beyond mounting |

**Why appearance is out of scope**: it is a human judgement, and screenshot-diffing 49
vendor components produces noise, not signal. The realistic failure after a theme migration
is *throwing* or *rendering empty* — a missing token, a plugin utility that no longer
exists, an import that did not resolve. Both are caught here.

**Nothing is skipped.** Dialogs, tooltips, popovers and accordions are mounted in the state
their upstream examples use. A skipped component is precisely the one that rots unnoticed
until the next slice builds on it — which is the risk Q1's answer created by landing ~37
components with no caller, and this is its mitigation.

---

## 6. Done when

- [ ] 49 components present under `src/components/ui/`, unmodified from the prototype
- [ ] `lib/utils.ts` present; `@` resolves in both the app and the test runner
- [ ] `globals.css` defines every token in §3.1; `tw-animate-css` imported; dark variant declared
- [ ] `tailwindcss-animate` is **absent** from the manifest
- [ ] `ui-smoke.test.tsx` passes for all 49, none skipped
- [ ] **0 colour literals** in any file this slice writes — greppable, and worth grepping
- [ ] `npm run lint` and `npx tsc --noEmit` clean
- [ ] `016a`'s existing 60 tests pass unchanged
