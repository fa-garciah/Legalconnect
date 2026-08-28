# Feature Specification: Client Screens & the Design System They Need

**Feature Branch**: `018-frontend-clients`

**Created**: 2026-08-28

**Status**: Draft, rev. 2 — **0 open clarifications**. Q1 resolved 2026-08-28. Four
decisions carried with recommendations.

**Epic**: EP03-ClientManagement (CLM), consuming EP00's frontend shell

**Constitution**: v1.4.0

**Tier Classification**: Cross-cutting — a firm that cannot see its own clients has no
product. Not removed at any iguala tier. This slice adds no capability and therefore no
tier gate; it consumes four rows `004` already governs.

**Stories**: `US02-EP03-CLM-SearchAndFilterClients`,
`US03-EP03-CLM-AddOrUpdateClientProfile`, `US07-EP03-CLM-RestoreWithdrawnClient` — see
Decision 1 on how these are shared with `006`.

**Input**: User description: *"pull the visual layer across — components, theme, route
shells — and build real client screens against 006's API with fresh validation."*

> **Citation convention.** Requirements of slices 004, 006 and 016a are cited as
> `004/FR-0NN`, `006/FR-0NN` and `016a/FR-0NN`. Bare `FR-0NN` refers to this document.

---

## What the prototype actually contains, checked rather than assumed

This slice was requested as a port from an existing project. Before specifying it, both
candidate folders were read. What they contain is not what a reader would assume from the
request, and the difference is the whole shape of this slice.

`LegalConnect - FrontEnd/` and `cosmic-legalconnect/` are **byte-identical** to each other.
Both are static visual mockups:

| Looked for | Found |
|---|---|
| Any `useForm`, `zodResolver` or `onSubmit=` in `app/` | **None** |
| Forms on the clients page | One unwired search input with a placeholder |
| Any `fetch`, `axios` or query hook, anywhere | **None** — no backend call exists |
| `zod` and `react-hook-form` in `package.json` | Present, imported **only** by the stock `components/ui/form.tsx` |
| Client page content | ~163 lines of hardcoded markup; the "Nuevo Cliente" button links nowhere |

The two validation libraries are there because the component scaffolder installs them with
its form primitive. **Nothing in the application uses either.** So there is no validation
to port, and this slice writes it rather than moving it.

What the prototype *is* worth taking is real and substantial: a themed component library,
eleven route shells, a navigation structure, and Spanish copy the constitution requires
anyway. That is a genuine head start on **appearance and structure**, and none at all on
behaviour.

**Two incompatibilities to carry into planning**, both found by reading the manifests:

| | Prototype | This repository |
|---|---|---|
| Styling engine | Tailwind v3, JS config file, `@tailwind` directives | Tailwind v4, CSS-first theme |
| Framework | Next 15 | Next 16 |

The styling difference means the visual layer cannot be copied file-for-file. Its theme
must be ported, which is Decision 3.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Find a client (Priority: P1)

Any internal member of the firm opens the client directory and finds the party they are
looking for, by name or by whether the firm still acts for them.

**Why this priority**: It is the only story a firm can use on day one against real data,
and every other screen in this slice is reached through it. It is also the one the current
product cannot do at all — `006` shipped the search API and nothing renders it.

**Independent Test**: Register clients through the API, open the directory, filter by a
fragment of a name and by status, and page through the results. Delivers a usable client
directory with no create, edit or withdraw path present.

**Acceptance Scenarios**:

1. **Given** a firm with more clients than fit one page, **When** the directory is opened,
   **Then** a bounded first page is shown with a way to reach the next, and each entry
   shows enough to identify it — legal name, kind, and whether it is still active.
2. **Given** the same firm, **When** a fragment of a name is typed, **Then** only matching
   clients are shown, matched without regard to letter case and anywhere in the name.
3. **Given** a filter that matches nothing, **When** the results return, **Then** the
   screen says so plainly and offers a way back to the unfiltered list — it does not look
   like a failure.
4. **Given** a filter is cleared, **When** the list reloads, **Then** the whole directory
   returns rather than an empty result.
5. **Given** a firm with no clients at all, **When** the directory is opened, **Then** it
   reads as "nothing here yet" and points at how to add the first one.
6. **Given** the directory is loading, **When** the response has not yet arrived, **Then**
   a loading state shows, distinct from both the empty and the error state.
7. **Given** the request fails, **When** the error renders, **Then** it follows the
   refusal-classification rules `016a` already fixed — a refusal must not disclose more
   than the caller's own archetype permits.

---

### User Story 2 - Register and correct a client (Priority: P2)

An `SA`, `MP`, `BM` or `PL` adds a party the firm will represent, and corrects the record
when something was captured wrongly.

**Why this priority**: Depends on US1 for the surface it is reached from. This is where
validation actually lives — the story the request was really about.

**Independent Test**: Open the create form, submit it empty and see every problem named at
once, correct them, save, then reopen the record and change the name. Delivers working
intake with no withdrawal path present.

**Acceptance Scenarios**:

1. **Given** the create form, **When** it is submitted with no legal name, **Then** the
   field is marked and the reason is stated in Spanish, **and** no request is sent.
2. **Given** the create form, **When** several fields are wrong at once, **Then** every
   problem is shown together rather than one at a time.
3. **Given** a valid entry with no RFC, **When** it is saved, **Then** it is accepted —
   RFC is optional, and a firm that has not yet collected one must not be blocked.
4. **Given** a field the person has not touched yet, **When** the form first renders,
   **Then** it shows no error — problems appear on interaction or on submit, never before.
5. **Given** a valid entry, **When** it is saved, **Then** the new client appears in the
   directory without a manual reload.
6. **Given** the server refuses the save for a reason the browser could not know, **When**
   the refusal returns, **Then** it is shown against the form rather than as a page-level
   error, and what was typed is preserved.
7. **Given** an existing client, **When** its legal name is corrected and saved, **Then**
   the change is reflected in the directory, and the kind — organization or person —
   cannot be changed.
8. **Given** a `PL`, **When** they register and correct a client, **Then** both succeed.

---

### User Story 3 - Withdraw a client, and undo it (Priority: P3)

An `SA`, `MP` or `BM` withdraws a party the firm no longer acts for, and restores one
withdrawn by mistake.

**Why this priority**: The narrowest of the three, and the one with the sharpest
consequence if the control is careless — withdrawal changes what a firm can do next.

**Independent Test**: Withdraw a client, confirm it is refused for new matters and still
resolves on its existing ones, then restore it and confirm it is usable again.

**Acceptance Scenarios**:

1. **Given** an active client, **When** withdrawal is chosen, **Then** confirmation is
   required before anything is sent, and the confirmation says what withdrawal does and
   does not do — no new matters, existing ones unaffected.
2. **Given** a withdrawn client, **When** the directory is filtered to withdrawn, **Then**
   it appears there and is visibly distinguishable from an active one.
3. **Given** a withdrawn client, **When** restoration is chosen, **Then** it is active
   again and immediately usable.
4. **Given** a `PL`, **When** they view a client they may correct but not withdraw,
   **Then** the withdrawal control is not offered to them.
5. **Given** that same `PL`, **When** the withdrawal request is issued anyway by other
   means, **Then** it is refused by the server exactly as if the control had never been
   hidden — the hiding is cosmetic (`016a/FR-027`).

---

### Edge Cases

- **A name filter matching hundreds of clients.** Bounded pages, and a page of results is
  a full page of *matches* rather than a short page — `006/FR-002a` filters before the
  page boundary, and the screen must not undo that by filtering again after fetching.
- **Two clients with the same legal name in one firm.** Legal and expected
  (`006` asserts it deliberately). The directory must not merge them or imply one is a
  duplicate.
- **A client withdrawn while someone else has its record open.** The next action against
  it refuses; the screen shows the refusal without losing what was typed.
- **A very long legal name.** Must not break the layout of the directory row.
- **Navigating away from a half-filled create form.** Out of scope — no draft persistence.
- **A person holding an archetype with no client-write capability.** Sees the directory,
  is offered no create or edit control, and any refusal they do provoke is `004`'s.
- **The browser and the server disagreeing about validity.** The server wins, always.
- **A dialog opened, then dismissed by pressing Escape.** Focus returns to the control that
  opened it, not to the top of the page — otherwise a keyboard user loses their place in a
  directory they may have paged into (FR-025).
- **The browser back button pressed while a dialog is open.** Out of scope as a behaviour
  this slice guarantees: with no route per record (FR-027), back leaves the directory
  entirely. Named so it is a known consequence of the dialog choice rather than a surprise.

---

## Requirements *(mandatory)*

### Functional Requirements

**The client directory**

- **FR-001**: The directory MUST show every client of the acting firm and no client of any
  other, in bounded portions with a way to reach the next.
- **FR-002**: The directory MUST offer a name filter matching any part of the legal name
  without regard to letter case, and a filter by active or withdrawn status, both served
  by `006/FR-002a` rather than reimplemented in the browser.
- **FR-003**: Filtering MUST NOT be applied a second time after the response arrives — the
  page boundary already accounts for it, and re-filtering would silently shorten pages.
- **FR-004**: An empty result MUST be distinguishable from a failure and from a still-
  loading screen, and MUST say which of "no clients yet" or "nothing matched" applies.

**Intake and correction**

- **FR-005**: The create and edit forms MUST validate in the browser before sending, and
  MUST show every problem at once rather than one per attempt.
- **FR-006**: Validation messages MUST be in Spanish and MUST name what to do, not what
  failed internally.
- **FR-007**: A field MUST NOT show an error before the person has interacted with it or
  attempted to submit.
- **FR-008**: Browser-side validation MUST be confined to what the browser can know on its
  own — presence, shape and length. Anything requiring the server's knowledge MUST NOT be
  guessed at (see Decision 2).
- **FR-009**: A server refusal on a form submission MUST be rendered against the form, and
  MUST preserve what was entered.
- **FR-010**: A client's kind MUST NOT be editable after creation, and the interface MUST
  NOT offer a control that implies otherwise.
- **FR-011**: A successful save MUST update the directory without requiring a manual
  reload.

**Where a record is shown**

- **FR-027**: A client's record MUST be shown in a dialog over the directory rather than at
  its own route. The directory's filter, cursor position and scroll MUST survive opening
  and closing one, so correcting several clients does not mean repeated round trips through
  a filtered search.

**Withdrawal and restoration**

- **FR-012**: Withdrawal MUST require an explicit confirmation that states its
  consequence — barred from new matters, existing matters unaffected.
- **FR-013**: Restoration MUST be reachable from a withdrawn client's own record.

**Permissions at the surface**

- **FR-014**: A control whose capability the acting archetype does not hold MUST NOT be
  rendered.
- **FR-015**: Hiding a control MUST NOT be treated as enforcement. The server refuses the
  underlying request identically whether or not the control was shown
  (`016a/FR-027`, `016a/SC-014`).
- **FR-016**: Each capability this slice's controls depend on MUST be added to the
  frontend's checked-in capability mirror in the same change that adds the control
  (`016a/FR-025`).
- **FR-017**: The client entry MUST be added to the shell's navigation registry in the same
  change, with the archetypes that may see it (`016a/FR-002`).

**Refusals**

- **FR-018**: Every failed request MUST be classified by the existing refusal rules rather
  than by new per-screen handling, so that a refusal discloses nothing beyond what the
  caller's archetype already permits.
- **FR-019**: A refusal that carries a remedy — a role problem, a plan problem — MUST say
  so; one that does not MUST stay generic.

**The visual layer**

- **FR-020**: The interface MUST adopt a shared component library and theme, so that this
  slice's screens and every later one look like one product rather than like the slice
  that built them.
- **FR-021**: The component library MUST work with the styling engine this repository
  already uses; the prototype's is a major version behind (see Decision 3).
- **FR-022**: Adopting the visual layer MUST NOT replace the application shell. The shell
  owns the tenant context, the archetype-filtered navigation and the feedback states, and
  those are behaviour this slice consumes rather than restyles (see Decision 4).
- **FR-023**: All interface copy MUST be in Spanish (Constitution, Merge Rules).
- **FR-024**: Every component ported but not yet used by a screen MUST be verifiably
  correct under the current styling engine — it MUST render, and MUST NOT carry class names
  or configuration the current engine no longer honours. A silently broken component is
  worse than an absent one, because the next slice will build on it before discovering the
  fault. How that verification is done is `/speckit-plan`'s to decide; that it happens is
  not optional (Q1).

**Accessibility**

> This slice's screens MUST meet WCAG 2.1 AA. The two requirements below name the parts
> that actually bite in a slice made of dialogs and forms; they are not the whole standard,
> and meeting them is necessary rather than sufficient.

- **FR-025**: Every control MUST be reachable and operable by keyboard alone, with a
  visible focus indicator. A dialog MUST move focus into itself when it opens, MUST keep
  focus within itself while open, and MUST return focus to whatever opened it on close.
- **FR-026**: Every input MUST have a programmatically associated label, and a validation
  error MUST be announced to assistive technology and associated with the input it
  describes. An error shown only as red text beside a field is not an error a screen reader
  user receives.

### Capability Matrix *(required by Principle IV)*

**This slice adds no capability.** It renders four that `004` already governs and `006`
already enforces. The matrix below is the mirror `016a/FR-025` requires, not a new grant —
its purpose is to state which control each archetype is offered.

| Capability (004 row) | What it renders here | MP | AA | PL | CM | BM | SA |
|---|---|---|---|---|---|---|---|
| `client.read` (25) | The directory, and a client's record | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `client.create` (26) | The "new client" control and form | ✅ | ❌ | ✅ | ❌ | ✅ | ✅ |
| `client.update` (27) | The edit control and form | ✅ | ❌ | ✅ | ❌ | ✅ | ✅ |
| `client.deactivate` (28) | Both the withdraw and the restore control | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ |

Notes:

- **`PL` may create and correct, and may not withdraw.** That split is `006`'s Q1, resolved
  2026-08-27, and this slice renders it rather than reinterpreting it.
- **Withdraw and restore share one row.** Whoever may withdraw may restore — `006/FR-004a`.
- The four portal archetypes (`CC`, `IC`, `CB`, `EL`) and `PO` reach none of these screens;
  client-portal visibility is EP13 and remains unvalidated.
- A row appearing here and not in `004`'s registry, or disagreeing with it, MUST fail the
  build — `016a` already ships that correspondence test.

### Key Entities

This slice introduces no entity. It renders **Client** as `006` defines it — a party the
firm represents, carrying a kind (`organization` or `person`), a legal name, an optional
RFC, and an active-or-withdrawn status that moves in both directions.

---

## Success Criteria *(mandatory)*

- **SC-001**: A person who knows part of a client's name finds that client in under 10
  seconds from opening the directory, without reading documentation.
- **SC-002**: 100% of validation problems on a submitted form are shown together; 0
  submissions require more than one attempt to learn about more than one problem.
- **SC-003**: 0 requests are sent for a form the browser could already tell was invalid.
- **SC-004**: A filtered page returns a full portion of matching clients in 100% of trials
  where more matches exist — no page is short while further matches remain.
- **SC-005**: An empty directory, an empty filter result, a loading directory and a failed
  directory are visually distinguishable from each other in 100% of trials.
- **SC-006**: For each of the six internal archetypes, the controls rendered match that
  archetype's row in the matrix above in 100% of trials — 0 controls shown that the server
  would refuse, and 0 hidden that it would permit.
- **SC-007**: Issuing a hidden control's request by other means is refused identically to
  the case where the control was never hidden, in 100% of trials.
- **SC-008**: A client withdrawn and restored through the interface is usable for a new
  matter afterwards, with 0 duplicate records created to achieve it.
- **SC-009**: 100% of interface copy is in Spanish.
- **SC-010**: Every screen in this slice renders usably at both a narrow and a wide
  viewport, with no horizontal scrolling of the page body.
- **SC-011**: The existing frontend and backend suites pass unchanged — 0 regressions, and
  in particular 0 changes to the refusal-classification rules `016a` fixed.
- **SC-012**: 100% of ported components render without error under the current styling
  engine, including those no screen calls yet, and 0 retain configuration the current engine
  no longer honours (FR-024).
- **SC-013**: Across this slice's three screens: 0 controls are unreachable by keyboard,
  100% of inputs carry an associated label, 100% of validation errors are announced, and
  every dialog returns focus to its opener on close (FR-025, FR-026).
- **SC-014**: Opening and closing a record from a filtered, paged directory returns the
  person to the same filter and the same position in 100% of trials — 0 resets (FR-027).

---

## Clarifications

### Session 2026-08-28

- Q: What level of accessibility must these screens meet? → A: WCAG 2.1 AA for this slice's three screens — keyboard reachability, dialog focus management, announced validation errors, labelled inputs, visible focus (FR-025, FR-026, SC-013).
- Q: Is a client's record a dialog over the directory, or its own page at a shareable URL? → A: A dialog. One route, `/clientes`; the list and its filter stay behind it. No shareable per-client URL in this slice (FR-027).

### Q1 — How much of the prototype's component library comes across? *(resolved 2026-08-28)*

The prototype carries **49 interface components** plus 12 application-specific ones. These
screens need roughly a dozen.

**Resolution: all 49 come across in this slice.** The 12 application-specific ones do not —
they render screens this slice does not build.

**Rationale.** The port is a styling-engine migration, not a file copy (Decision 3), so its
cost is paid per batch rather than per component. Splitting it means paying that cost again
in every later frontend slice, and each payment carries the risk of two slices migrating
the same component differently. Doing it once leaves a single consistent library and gives
the next slice nothing to do.

**The cost, named rather than glossed.** Roughly three-quarters of what lands will have no
caller on the day it lands. That is real, and two things follow from it:

- **FR-024 below** requires the unused ones to be verifiably *present and correct*, not
  merely present. A component that lands broken is worse than one that never landed, since
  the next slice will trust it.
- The constitution's testing discipline has no exemption that obviously covers vendored,
  uncalled interface code. Exemption 2 (tool-generated code) is the nearest fit and is not
  an exact one. **`/speckit-plan` must state which exemption it is claiming, or add the
  coverage** — this is flagged rather than assumed.

---

## Decisions Requiring Sign-Off

### Decision 1 — This slice shares three catalog stories with `006`, rather than claiming new ones

**Recommendation: accept.** `US02`, `US03` and `US07-EP03-CLM` describe things a *person*
does — searching clients, adding and editing a profile, restoring a withdrawn one. `006`
moved all three to itself when it shipped their APIs.

That was right at the time and is now half true: an API nobody can reach does not let a
paralegal quick-add a client. A story is delivered when a user can do the thing, so these
three span two slices — `006` built the half a screen talks to, this slice builds the half
a person touches.

**What this requires**: the catalog's `Slice` column for those three rows becomes
`006 + 018`, with a note that the capability is delivered across both. That is a new
convention for this catalog and should be agreed rather than assumed, which is why it is a
decision rather than a footnote.

**Rejected alternative**: minting new UI-only story ids. It would double the row count for
one capability and invite the reading that "search clients (API)" and "search clients
(screen)" are separate things a firm asked for. They are not.

### Decision 2 — The browser validates shape; the server owns truth

**Recommendation: accept.** Browser-side validation covers what the browser can decide
alone: a legal name is present and within length, a kind is one of the two permitted, an
RFC — if given — is not absurdly long.

It does **not** attempt: whether a client may still be used, whether a name collides,
whether the acting archetype holds the capability. Those need the server's knowledge, and
a browser that guessed would eventually guess wrong and refuse something legitimate.

**The rule when they disagree**: the server wins, and its refusal is displayed. This is
why FR-009 requires refusals to render against the form and preserve what was typed —
that path is not an error case, it is the normal way facts the browser cannot know arrive.

**The cost, named**: a person can fill a valid-looking form and still be refused. That is
correct behaviour and not a defect. Attempting to eliminate it would mean duplicating
`006`'s rules in the browser, where they would drift.

### Decision 3 — The theme is ported forward, not pinned backward

**Recommendation: accept.** The prototype styles with the previous major version of the
styling engine and configures it in a way the current version replaced. Two ways out:

- Port the theme forward to the version this repository already uses.
- Move this repository back to the prototype's version.

**Port forward.** Moving back would take the whole frontend — including `016a`'s shipped,
tested shell — to an older engine to accommodate a mockup, and would have to be undone
later. The port is bounded: a palette, a radius scale, and a set of semantic colour names.

**Consequence**: components cannot be copied file-for-file. Each needs its class names
checked against the current engine. That is the real cost of this slice's visual half, and
it is the reason Q1's answer matters.

### Decision 4 — The shell stays; the prototype contributes appearance only

**Recommendation: accept.** The prototype has its own sidebar and header. So does this
repository — but `016a`'s versions carry behaviour the prototype's do not: the active-firm
display and switch, navigation filtered by archetype, and the four feedback states.

The prototype's are static markup with a hardcoded menu.

**So the shell wins structurally and the prototype wins visually.** `016a`'s components
keep their behaviour and adopt the prototype's look. Replacing them would discard the
tenant switch, the archetype filtering and the refusal classification — all of which are
tested, and two of which are constitutional obligations rather than preferences.

**Recorded because the opposite is tempting**: pasting the prototype's shell is faster on
the first afternoon and costs the three mechanisms above, silently, with the tests that
prove them deleted to make it compile.

---

## Assumptions

- **Screens for cases are out of scope**, though the prototype has them and `006` shipped
  their API. The request named client screens; case screens are a slice of their own and
  will reuse everything this one establishes.
- **The prototype's 12 application-specific components are not ported** — its dashboard
  metrics, charts, active-case list and pending-task widgets render screens this slice does
  not build, against data no slice has yet shipped. Q1's answer covers the general-purpose
  library only.
- **No draft persistence.** A half-filled form abandoned by navigating away is lost. Adding
  it would be scope nobody asked for.
- **No bulk actions.** Clients are created, corrected and withdrawn one at a time.
- **No client detail page beyond the record itself.** The prototype's client detail screen
  shows related matters and billing; those belong to the slices that own that data — and
  with FR-027 there is no per-client route for them to live at yet. The slice that needs one
  introduces it.
- **No shareable link to an individual client**, which is FR-027's accepted cost. Judged
  acceptable because a client record is something people look up rather than send to each
  other; a matter is the thing people send, and that is a different slice's decision to
  make.
- **The existing session seam is unchanged.** The frontend still resolves who the caller is
  through the fixture `016a` established; real authentication is slice `003`.
- **Pagination reuses the existing cursor mechanism** rather than introducing page numbers,
  at the page size `001` already defaults to. The screen does not choose its own.
- **The search field debounces** rather than issuing a request per keystroke. Considered
  during clarification and left as an assumption because the alternative — a request per
  character — has no advocate: it multiplies load and makes results flicker as they are
  overtaken.
- **A successful save refetches rather than guessing.** The list is invalidated and reloads
  from the server rather than being patched optimistically. Optimistic updates would show a
  row the server might still refuse, and `006` has refusals a browser cannot predict
  (Decision 2) — which is exactly when optimism is wrong.
- **The prototype's Spanish copy is a starting point**, not a specification. Where it
  disagrees with `006`'s vocabulary, `006` wins.

---

## Dependencies

| On | For | Status |
|---|---|---|
| `006-client-case-core` | The five client endpoints, their refusal codes, and the `PL` split this slice renders | Satisfied — built and validated |
| `016a-frontend-shell` | The shell, the navigation registry, the capability mirror, and the four feedback states | Satisfied — built. This slice is the first consumer it was designed for |
| `004-authorization-entitlements` | The four capability rows and the refusal ordering | Satisfied — built |
| The prototype folder | Component library, theme, route structure, Spanish copy | Available locally, read and inventoried. Contains **no** validation to port — see above |
| Sign-off on Q1 and Decisions 1–4 | Slice size, and the catalog convention | **Outstanding** |

---

## Out of Scope

Case screens, document screens, billing, calendar, time tracking, dashboards and every
other route the prototype mocks up. Authentication and real sessions (`003`). Client-portal
views of any of this (EP13, unvalidated). Merging duplicate clients — `006` has no merge
operation to call. Draft persistence, bulk actions, and client import. Offline support.
Reworking `016a`'s shell behaviour: this slice restyles it and changes nothing it does.
Accessibility work on `016a`'s shell or on the ported components no screen calls — FR-025
and FR-026 bind this slice's own three screens, and widening them would pull a shipped
slice into this one's scope.

---

## Approval Checklist

- [x] **Q1 answered** (2026-08-28) — all 49 general-purpose components port in this
      slice; the 12 application-specific ones do not. FR-024 and SC-012 added to cover the
      ones that land without a caller
- [x] Decision 1 signed off, and **actioned 2026-08-28** — `US02`, `US03` and `US07-EP03-CLM`
      now read `006 + 018`, with the joint-delivery convention recorded in the catalogue's
      own `EP03` amendment note
- [x] Decision 2 signed off, and **implemented 2026-08-28** — `src/clients/schema.ts`
      asserts shape only; `client-schema.test.ts` holds open the four things it must
      *accept*, including an oddly-shaped RFC, because `006` accepts them too
- [x] Decision 3 signed off, and **implemented 2026-08-28** — the brand lives in
      `globals.css` as a token rather than in ninety-two markup literals; zero colour
      literals in any file this slice wrote, and `#3730a3` verified present in the built CSS
- [x] Decision 4 signed off, and **implemented 2026-08-28** — five of the six `016a` files
      research D7 lists are byte-identical. `Shell.tsx` gained one utility class, `min-w-0`,
      to stop a four-column table scrolling the whole page sideways on a phone; recorded as
      Deviation 1 in [quickstart-results.md](./quickstart-results.md) with the measurements
- [x] `master-user-story-catalog.md` amended per Decision 1 (2026-08-28), before any PR
      opens (Principle I)
- [x] Permission matrix declared, and declared as a **mirror** — this slice adds no
      capability (Principle IV)
- [x] Confirmed against the prototype by reading it: no validation exists there to port,
      and the styling engine is a major version behind
- [x] **Satisfied.** plan.md's Constitution Check claims Exemption 2 (tool-generated code)
      for the 49 ported components' internals and for those only, and states what the
      exemption does *not* cover. That uncovered part is `tests/component/ui-smoke.test.tsx`
      (T013): all 49 mount and produce DOM, **none skipped**, with a guard that fails when a
      component in `src/components/ui/` has no case. It earned its keep — it is what caught
      `sidebar.tsx` importing a hook name that did not exist even in the prototype
- [x] Zero `[NEEDS CLARIFICATION]`
