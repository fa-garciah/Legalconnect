# Quickstart Results — Client Screens & the Design System They Need

**Feature**: `018-frontend-clients` | **Validated**: 2026-08-28
**Quickstart**: [quickstart.md](./quickstart.md) | **Spec**: [spec.md](./spec.md)

Every scenario in the quickstart, run end to end against a live backend on 3001 with the
seeded tenant A. Results below are what actually happened, including the six defects found
and fixed during validation.

---

## Environment

| Piece | Value |
|---|---|
| Backend | `PORT=3001 npm run dev`, migrated and seeded |
| Database | `legalconnect-db` (postgres:16-alpine), `npm run db:seed` |
| Frontend | `npm run dev` on 3000, driven by Playwright's `webServer` |
| Principal fixture | Seeded dual identity `c370dcdb…`, tenant A `9f96c08a…`, archetype `MP` |
| Browsers | Chromium (`npx playwright install chromium` — was not installed) |

**Two setup steps the quickstart does not mention and should.** The Playwright browser
binary is not installed by `npm ci` and every e2e test fails with a launch error until
`npx playwright install chromium` is run. And `principal.fixture.json` ships pointing at
placeholder ids, so the directory renders an opaque refusal rather than data until it is
pointed at seeded values — which the quickstart *does* say, but says after the scenario
that first depends on it.

---

## Scenario 1 — The design system landed intact (FR-020 to FR-024)

| Step | Result |
|---|---|
| All 49 ported components mount | ✅ 49/49, plus a coverage guard that fails when a component has no case |
| Trigger/provider components mounted in that state | ✅ dialog, drawer, tooltip, popover, accordion, sheet, menubar, sidebar, command all open or wrapped |
| None skipped | ✅ `ui-smoke.test.tsx` reads `src/components/ui/` and compares against its own case list |
| Typecheck and lint | ✅ clean |
| Colour literals in files this slice wrote | ✅ zero matches |
| `tailwindcss-animate` absent | ✅ absent from `package.json` and from `node_modules` |
| The six animation utilities resolve | ✅ verified in the **built** CSS, not just the manifest — all six present in `.next/static/chunks/*.css`, along with the brand `#3730a3` |

---

## Scenario 2 — Find a client (US1)

| Step | Result |
|---|---|
| Four columns per row | ✅ razón social, tipo, RFC, estado |
| A client with no RFC | ✅ renders `—` |
| Fragment of a name | ✅ served by `006`, case-insensitive, matched anywhere |
| Clear the search box | ✅ whole directory returns; `q` is **omitted**, not sent empty |
| Nothing matched | ✅ empty state naming the term, with "Limpiar filtros" |
| A firm with no clients | ✅ a **different** empty state (SC-005) — asserted as different text, not merely as two tests |
| "Cargar más" while `nextCursor` is non-null | ✅ appends; cursor passed back verbatim |
| A filtered page with more remaining | ✅ full page, not short — the FR-003 assertion |
| Change a filter while paged | ✅ cursor resets (the filters are part of the query key) |
| Backend stopped | ✅ error state with retry, opaque bucket, no cause implied |
| Type quickly | ✅ one request after the 300 ms debounce settles |

---

## Scenario 3 — Register and correct a client (US2)

| Step | Result |
|---|---|
| Open the form | ✅ no errors before interaction |
| Submit empty | ✅ every problem at once, in Spanish, **zero requests sent** |
| Valid name, blank RFC | ✅ accepted; reaches `006` as `null`, renders as `—` |
| Odd-shaped RFC of reasonable length | ✅ accepted — format deliberately unvalidated |
| Save | ✅ dialog closes, client appears with no manual reload |
| Edit an existing client | ✅ `kind` renders as read-only text; no radio, no disabled control |
| Change the name and save | ✅ reflected in the directory |
| The edit payload | ✅ `kind` absent — verified against the real `006`, where a save is the proof |
| A `409` on a withdrawn client | ✅ shown against the form, typing preserved, record re-read |
| As `PL` | ✅ create and edit offered |
| As `AA` / `CM` | ✅ neither offered |

---

## Scenario 4 — Withdraw and restore (US3)

| Step | Result |
|---|---|
| "Retirar" | ✅ confirmation first; nothing sent until confirmed |
| The confirmation's two sentences | ✅ both present, including "los asuntos existentes no se ven afectados" |
| Confirm | ✅ row reads *Retirado*, distinguishable from *Activo* |
| Filter to retirados | ✅ appears there |
| "Restaurar" | ✅ active again, no confirmation |
| Two distinct audit entries | ✅ **verified**, see below |
| As `PL` | ✅ neither control offered |
| As `BM` | ✅ both offered |

**On the audit row.** Reading the audit log needs `audit.read_own_tenant`, which `004`
gives to `SA` alone, while the seeded identity is `MP`. The check therefore skips under the
default fixture and says so rather than passing quietly. To get real evidence it was run
once with the seeded membership temporarily set to `SA`: both `client.deactivated` and
`client.reactivated` were present after a browser-driven round trip. The membership was
returned to `MP` afterwards. `006`'s own `tests/contract/client-audit.test.ts` asserts the
same property at the tier that can see the table.

---

## Scenario 4b — Accessibility (FR-025, FR-026)

| Step | Result |
|---|---|
| Keyboard traversal | ✅ every control reachable and operable |
| Focus moves into a dialog | ✅ |
| Close with the button | ✅ focus returns to the opener |
| Close with **Escape** | ✅ — **after a fix**, see Defect 3 |
| Every input labelled | ✅ resolved through `for`/`id`, not adjacency |
| Errors announced and associated | ✅ `aria-invalid` + `aria-describedby` → `role="alert"` |
| Open a record from a filtered, paged directory and close it | ✅ filter, pages and scroll position all survive — **after a fix**, see Defect 4 |

---

## Scenario 5 — Permissions at the surface

| Step | Result |
|---|---|
| Six internal archetypes, exact control sets | ✅ all six match `006/spec.md` rows 25-28 |
| `AA` / `CM` | ✅ directory only |
| `PL` | ✅ create and edit, no withdraw — `006`'s Q1 |
| `BM` | ✅ all four |
| Hidden control's request issued directly | ✅ `016a`'s `hidden-item-still-refused.spec.ts` still passes |
| Mirror disagreeing with `004` | ✅ `capability-matrix-sync.test.ts` covers the four new rows, transcribed by hand from the spec |
| The navigation entry | ✅ six internal archetypes; absent for the four portal ones |

---

## Scenario 6 — Nothing that already worked stopped working

| Step | Result |
|---|---|
| Frontend suite | ✅ **223 tests pass**, 25 files. One file fails to load: `tests/component/documents/DocumentList.test.tsx`, a **pre-existing** `007` red test whose component was never built (committed in `2157693`, before this slice) |
| Lint / typecheck | ✅ clean, zero errors and zero warnings |
| `refusal-bucket.ts`, `api-client.ts`, `TenantSwitcher` | ✅ `git diff` empty |
| `Shell.tsx`, `NavigationMenu.tsx`, `Header.tsx`, `navigation-items.ts` | ⚠️ **restyled to the supplied design** — see Deviation 1 |
| Backend suite | ✅ 1315/1315, 132 files |
| `spanish-copy.test.tsx` | ✅ extended, not duplicated; passes with this slice's four components added |
| Both viewports | ✅ no horizontal page scrolling — **after a fix**, see Defect 5 |
| Full e2e, both projects | ✅ 47–48 passed, 10 skipped, 0 failed, three consecutive runs |

---

## Defects found during validation, and fixed

Six. Prior slices found between one and three; the extra two are the price of this being the
first slice where a browser talks to the API and the first with real screens to lay out.

### 1. CORS was never enabled — every request from the browser failed

**Found by** the first e2e run, which showed an opaque "no se pudo completar esta acción".
`curl` against the same endpoint worked perfectly, which is exactly why this survived until
now: no previous slice made a request from a browser. `016a` ships a shell with no network
calls at all.

The preflight `OPTIONS /tenant/clients` returned `404`, so the browser blocked every request
before sending it and `apiFetch` saw a network failure with no response to classify.

**Fixed** in `backend/src/main.ts` with an explicit origin list — never a wildcard. This API
trusts `x-identity-id` outright until `003` ships authentication, so any origin allowed here
can read any tenant's data. Outside production the default is the frontend's dev origin; in
production `CORS_ALLOWED_ORIGINS` must be set explicitly or no browser origin is allowed.
The key is documented in `.env.example` and the env-drift gate passes.

### 2. `chart.tsx` called a hook conditionally — a crash, not a lint nit

The prototype's tooltip returns a touch variant early, **above** a `React.useMemo`. The
component also subscribes to viewport width. So crossing 768 px — rotating a tablet,
dragging a window edge — changes the hook count between renders, React throws "Rendered
fewer hooks than expected", and the chart unmounts. Present in the prototype and inherited
verbatim. **Fixed** by hoisting the hook above the branch.

Two smaller defects came across in the same batch: `sidebar.tsx` called `Math.random()`
during render (a hydration mismatch under SSR, since server and client roll different
numbers — replaced with a hash of the element's own id), and `carousel.tsx` seeded state
from an effect (rewritten with `useSyncExternalStore`).

### 3. Escape closed a dialog and dropped focus on the document body

**Found by** the e2e focus test, which the quickstart singles out as the row most likely to
be missed. It was right. Radix's modal content prevents its focus scope's own restore and
focuses its `DialogTrigger` instead; these dialogs are driven from state and have no
trigger, so the override focused nothing. Closing with the button worked by accident.
**Fixed** in `src/lib/use-dialog-anchor.ts`.

### 4. Opening a dialog reset the page scroll to the top

**Found by** the SC-014 test — the one that justifies the whole dialog-over-route decision.
Radix locks body scrolling with `overflow: hidden`, and the browser discards the scroll
offset when it does. Measured: scrollY 400 before opening, 0 after closing.

This is not cosmetic. `018` renders a client's record as a dialog rather than a
`/clientes/[id]` route **specifically** so that someone deep in a filtered directory comes
back where they were. Losing the scroll position meant paying the route's cost — no
shareable link to a client — and getting its drawback anyway.

**Fixed** in the same hook. The first attempt captured the scroll position in the dialog's
mount handler and read zero every time: the scroll lock belongs to a descendant, and
descendant effects run first, so by then the offset is already gone. It is now latched
during the render in which the dialog opens, which is the last moment the value exists.

### 5. The page scrolled sideways on a phone

**Found by** the extended `responsive.spec.ts` at the mobile viewport; desktop passed. The
table sits in its own `overflow-x: auto` container and is meant to scroll inside it —
instead the container was stretched to the table's width and the whole page scrolled,
dragging the header and navigation off screen. Measured: 772 px of content in a 412 px
window.

Cause: `<main>` is a flex item, and a flex item defaults to `min-width: auto`, so it refuses
to shrink below its content. **See Deviation 1** for the fix and why it touches a file the
tasks said to leave alone.

### 6. An SC-014 assertion was flaky, for a reason unrelated to what it tested

It asserted an exact row count across a dialog open/close. Three e2e spec files write
clients into the same seeded tenant and Playwright runs spec files in parallel, so the
directory can legitimately gain a row mid-test — about one run in four. Changed to `>=`:
the defect it looks for (a reset to page one) shows *fewer* rows, so the weaker assertion
still catches it and ignores the noise. Verified stable over three consecutive full runs.

---

## Deviations from tasks.md, and why

### Deviation 1 — T051: the shell was restyled, and `Shell.tsx` rewritten

T051 requires `git diff` to be empty for six `016a` files. **Three still are** —
`refusal-bucket.ts`, `api-client.ts` and `TenantSwitcher.tsx`.

This happened in two stages, and the second was a direct instruction rather than a finding.

**Stage one, during validation:** `Shell.tsx` gained `min-w-0` on its `<main>` element and
nothing else, to stop a wide grid scrolling the whole page sideways (Defect 5). That was the
only fix available — `section { min-width: 0 }` was measured and does not work, because the
constraint is on the flex item, not its contents.

**Stage two, after the slice closed:** the product owner supplied the intended design — a
fixed left rail carrying the brand, the section list and the signed-in identity, with the
client directory as a card grid. Implementing it changed four `016a` files:

| File | Change |
|---|---|
| `Shell.tsx` | Rewritten: fixed rail from `lg` up, drawer below it, sticky top bar, content region |
| `NavigationMenu.tsx` | Rewritten as the rail's nav — icons, active state, unavailable state |
| `Header.tsx` | Brand moved out to the rail; keeps the active tenant name and switcher (FR-008 to FR-010) |
| `navigation-items.ts` | Ten sections instead of one; `icon` and `available` fields added |
| `Sidebar.tsx` | New |

**What did not change is the part `016a` specified.** The shell still mounts once, around
every route. The active firm is still named at all times, with the switch beside it. Items
are still filtered by archetype through the same `filterNavigationItems`. The feedback
primitives and the refusal classifier are untouched. `016a`'s own tests pass unchanged
except `responsive.spec.ts`, which was extended — below `lg` the rail is a drawer, so
"reachable at every viewport" now means opening it, which is what SC-011 asks for.

**One design decision worth recording.** The rail lists all ten sections; nine have no route.
They render as inert, visibly-unavailable rows rather than links — a menu item that 404s is
worse than one honestly marked as not built. Each slice flips its own flag when it ships its
screen. This does bend `016a`'s "a domain slice adds its own entry" rule, deliberately, so
the product's shape is legible while it is still being built.

### Deviation 2 — T052: the backend is not untouched

T052 requires `git diff --stat backend/` to be empty. Two files changed, both for Defect 1:
`src/main.ts` (+49) and `.env.example` (+15). Nothing else — no schema, no route, no service,
no test. The slice consumes `006`'s API exactly as specified; what it needed was permission
for a browser to reach it at all, which no spec anticipated because no previous slice made a
browser request.

### Deviation 3 — three ported components were edited

Research D1 claims the 49 components are stock and reference only token utilities, so the
whole styling migration reduces to `globals.css`. That claim held: **none** of the 24
TypeScript errors were styling errors. Three components needed third-party API renames after
their libraries moved to React-19-compatible majors — `calendar.tsx`, `resizable.tsx`,
`chart.tsx` — each recorded in its own header comment.

`resizable.tsx` is the one worth noting: the current version stopped emitting the data
attribute its vertical styling hangs off, so a straight rename would have type-checked,
mounted, passed the smoke test, and laid a vertical group out horizontally.

**One genuine exception to D1**: `chart-touch-tooltip.tsx` hardcodes `bg-white`,
`border-gray-200` and three `text-gray-*` values rather than theme roles, so it ignores the
theme and would render light-on-light under `.dark`. Left as-is deliberately — correcting it
changes appearance and nothing in this slice renders it — and recorded in the file for
whichever slice first puts a chart on a screen.

---

## Dependency versions, and why they are not the prototype's

T003 was to install the prototype's manifest. Five packages could not be pinned to it:
`react-day-picker` caps at React 18 and requires an incompatible `date-fns`, and `recharts`,
`react-resizable-panels`, `vaul` and `sonner` were all pre-React-19. The prototype ran them
only because `pnpm` ignores peer conflicts; `npm` refuses.

Decision: keep the React-19-compatible majors and adjust the three components that noticed.
The alternative — forcing the old versions past `npm` — would have shipped a tree the
package manager says is invalid, on the slice that establishes the design system for every
frontend slice after it.

---

## Traps worth recording

**`Response` bodies can be read once.** Handing the same `Response` instance to
`mockResolvedValue` makes the second `apiFetch` call throw "Body already read", which
surfaces three layers away as a mangled refusal and looks like a bug in the screen. Every
mock in this slice is a factory. This cost about twenty minutes and would cost the same
again.

**A component test cannot observe query invalidation without an observer.** Mounted alone, a
dialog is the only subscriber, so `invalidateQueries` marks the query stale and refetches
nothing. Asserting a second `fetch` there is asserting an artefact of the test's own
mounting; assert the invalidation instead.

**jsdom needs five shims** before Radix, embla, vaul, recharts and the resizable panels will
mount: `ResizeObserver`, `IntersectionObserver`, `matchMedia`, `scrollIntoView` and the three
pointer-capture methods. Without them a component does not render wrong, it throws — which
is the difference between a smoke test covering 49 components and one covering about thirty.
They are in `tests/setup.ts` with a note that nothing should assert against them.

---

## Known-not-covered

Unchanged from the quickstart's own list, plus what validation added:

- **Appearance is not asserted.** The smoke test proves components render, not that they look
  right. No screenshot diffing.
- **~37 of the 49 components have no caller.** Q1's accepted cost. Proven to render and
  nothing more.
- **No draft persistence**, no bulk actions, no import, no client detail beyond the record.
- **Case screens do not exist.** `006` shipped their API — including the product's first
  `assigned`-scope capability — and nothing renders it.
- **The prototype exists twice.** `LegalConnect - FrontEnd/` and `cosmic-legalconnect/` are
  byte-identical. One should be deleted so nobody later ports from the stale copy.
- **The audit assertion skips under the default fixture** (see Scenario 4). Real evidence was
  gathered once by hand; the standing automated check is `006`'s.
- **`react-day-picker`'s class mapping is unverified against a rendered calendar.** The
  rename was mechanical and the component mounts; no screen in this slice renders a date
  picker, so the first one that does should check it in a browser.

---

## Addendum: the supplied design, applied 2026-08-28

After the slice closed, the product owner supplied the intended layout and asked for the
left menu and the client screen to match it. Both were built. Three things are worth
recording because they are decisions, not omissions.

**The card cannot show what the design shows.** The reference card carries email, telephone,
a responsible attorney and a case count. `GET /tenant/clients` returns
`{ id, kind, legalName, rfc, status }` and nothing else — those four fields are hardcoded
sample data in the prototype with no storage behind them. The card therefore shows the type
(icon and subtitle), the status (badge) and the RFC, and the badge carries status where the
design put a case count. **Filling those four rows needs a `006` change** — columns, a
migration, an API change, and a permission question for the case count — not a frontend one.

**The rail lists nine sections that do not exist.** Rendered, not linked. See Deviation 1.

**Two colour choices differ from the reference, on purpose.** The design tints organisation
avatars blue and person avatars green. Neither is a theme role, and §3.4 forbids a colour
literal in a new file. The two are distinguished with `accent` and `secondary` instead —
still two glances apart, still a palette change away from being restyled. Adding a green
role to §3.1 would make the reference reachable; that is a token-set decision, not a
component one.

**Two real defects were found and fixed while doing this**, both by the tests rather than by
looking:

1. The navigation registry held icon *components*, and the root layout is a Server Component
   handing it to a Client Component. Functions do not cross that boundary, and every page
   render threw. Fixed by naming icons with strings and resolving them on the client — which
   also keeps the registry plain, serialisable data.
2. The SC-014 scroll test had been asserting a position its own actions destroyed: Playwright
   scrolls an element into view before clicking it, so scrolling the page and then clicking a
   control above the fold moves the page back before the dialog opens. It reported a product
   defect that was not there. The test now scrolls its target into view first and reads the
   position after. Verified stable over three consecutive full runs.
