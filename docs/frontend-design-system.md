# The frontend design system

**Established by**: [`018-frontend-clients`](../specs/018-frontend-clients/spec.md), 2026-08-28

Short version: **the next frontend slice imports from `frontend/src/components/ui/`. It does
not port from a prototype again.**

---

## What exists

| Where | What |
|---|---|
| `frontend/src/components/ui/` | 49 components — buttons, inputs, dialogs, tables, menus, charts, calendar, sidebar. Every one mounts; `tests/component/ui-smoke.test.tsx` proves it and fails when a new one arrives without a case |
| `frontend/src/app/globals.css` | The theme. Every colour role, the radius scale, the dark variant, the accordion keyframes. **The brand lives here**, as `--brand`, and reaches components through `--color-primary` |
| `frontend/src/lib/utils.ts` | `cn`, the class merger every component uses |
| `frontend/src/lib/use-dialog-anchor.ts` | Focus and scroll restoration for any modal not driven by a `DialogTrigger` |
| `frontend/src/feedback/` | `016a`'s loading / error / empty / boundary primitives. Not part of the port; still the right thing to use |
| `frontend/tests/setup.ts` | The jsdom shims these components need in order to mount at all |

---

## Rules that came with it

**No colour literals in application code.** Not `bg-[#3730A3]`, not a hex in a `style`
attribute. `variant="default"` on a button is already the brand. If something needs a colour
the tokens do not provide, the token set is wrong — add the token. The prototype hardcoded
the brand ninety-two times and that is the practice being replaced, not carried forward.
`018/T050` greps for this; keep it at zero.

**Wide content scrolls inside its own container, never the page.** A table goes in an
`overflow-x: auto` wrapper, and the flex ancestors need `min-w-0` or the wrapper is stretched
instead of clipping. `tests/e2e/responsive.spec.ts` checks the page body at two viewports.

**A control's visibility is keyed to a capability id, never to an archetype list.** Use
`can(capability, archetype)` from `src/authz/can.ts`. An inline `['MP','SA']` is a second
source of truth that drifts from `004` silently; a capability id inherits
`capability-matrix-sync.test.ts`'s check for free. And hiding is cosmetic — the server
refuses identically either way.

**Copy is Spanish, and the wire's vocabulary is not copy.** `inactive` is the wire's word;
*retirado* is the domain's. Add new components to `tests/component/spanish-copy.test.tsx`
rather than writing a second copy test.

---

## Before adding a new component

Check `src/components/ui/` first — roughly 37 of the 49 have no caller yet, so the thing you
need may already be there. What "no caller" means precisely: it mounts and produces DOM, and
nothing more has been verified. The first slice to use one is the first to exercise it
properly, and should expect to check it in a browser.

Two known caveats, both recorded in the files themselves:

- `chart-touch-tooltip.tsx` hardcodes light-mode greys and ignores the theme.
- `calendar.tsx`'s class mapping was migrated across a major version and has never been seen
  rendered.

---

## What not to do

**Do not port from `LegalConnect - FrontEnd/` or `cosmic-legalconnect/`.** Those are the
prototype, they are byte-identical to each other, and they are a major version behind on
Next, React, Tailwind and five component libraries. Everything worth taking from them is
already here, with the version gaps resolved and recorded. One of the two copies should be
deleted so nobody ports from the stale one by accident.
