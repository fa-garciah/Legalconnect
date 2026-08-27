# Feature Specification: Frontend Application Shell

**Feature Branch**: `016a-frontend-shell`

**Created**: 2026-08-26

**Status**: Draft, rev. 3 — 0 open clarifications. Q1 resolved 2026-08-26 (option a);
four new catalog stories proposed

**Epic**: EP00-PlatformFoundation — the frontend counterpart to the mechanisms slice 001
built on the backend

**Constitution**: v1.4.0

**Tier Classification**: Cross-cutting — this slice is not tier-restricted. Individual
navigation items MAY later be tier-gated by whichever mechanism owns that decision; this
slice supplies the container, not the gate.

**Input**: User description: *"Feature Spec 016a — Frontend Application Shell. The
chrome every other frontend slice renders into: persistent menu and header, active-tenant
display and switching, and the three feedback states — loading, error, empty — that any
screen backed by a network request will eventually hit. No business screen content. No
authentication. No archetype matrix."*

---

## Revision Note (rev. 2, 2026-08-26) — 004 landed while this spec was in draft

The first revision of this document was written while `004-authorization-entitlements`
carried no matrix at all — Constitution Technical Debt item 11. It is now built and
tested: 21 capability rows, four archetype-holding internal codes plus `PO`, the four
portal archetypes asserted at zero, 665 tests, 100% coverage on `src/common/authz/**`.
Three things this changes here, each landing at its own section rather than as a
rewrite:

- Where this spec previously assumed a provisional, defaults-to-visible-to-all filter
  "pending slice 004," it now names `004/spec.md`'s Capability Matrix as the single
  source of truth for archetype-based item visibility — because Decision 4 fixed that
  matrix as a compile-time constant, identical for every tenant. There is nothing left
  to wait for; there is a document to source from instead of a placeholder.
- `004/FR-020` and `004/SC-004` now assert, not merely leave open, that the four portal
  archetypes hold zero capabilities today. This slice's "deferred" treatment of portal
  (see Permission Matrix) is unchanged in outcome — nothing renders for them either
  way — but it is no longer a hedge against the unknown; it is agreement with a tested
  fact.
- `004`'s own Out of Scope names "permission-derived navigation… a separate frontend
  slice (014)" as a projection of its module, never an authority. Read narrowly, that
  sentence is about the admin screens 014 builds. Read broadly, it could be mistaken for
  assigning all permission-derived navigation to 014, which would leave this slice's own
  item-level filtering unauthored. Flagging this now rather than resolving it silently:
  `estado-specs.md`'s own dependency table lists 014 as waiting on 004 + 016a, which only
  makes sense if this slice's filtering already exists for 014 to render inside. Treated
  here as a documentation gap in 004 to reconcile at its next amendment, not as a reason
  to withhold a general-purpose shell mechanism this slice was always going to need
  regardless of 014's own screens.

003 and 005 remain not built. Nothing about the principal-fixture assumption or the
sign-out boundary changes.

---

## Why This Slice Is Next

No screen delivered by slices 006 onward has anywhere to render, and no loading, error
or empty condition any of them will inevitably produce has a defined way to present
itself, until this slice exists. `estado-specs.md` marks this and 017-firm-directory as
the two slices ready to start today with zero blockers, precisely because both depend
only on slice 001, which is built — unlike 006-client-case-core (which additionally
waits on 004 and 017) or 014-admin-ui (which waits on 004 and this slice).

The mechanism is architecture, not a Discovery output: a navigation container, a header
carrying tenant context, and three feedback states are needed regardless of which way the
four open scope conflicts (native app, WhatsApp, Google Calendar, time tracking) resolve,
and regardless of whether EP13 survives Discovery. What Discovery can still change is the
specific list of items inside the shell. This spec treats that list as configuration
supplied to the mechanism, not as something the mechanism itself decides, so that a scope
conflict resolving later does not reopen this document.

No `frontend/` directory exists in the repository yet — `plan.md` of slice 001 recorded
that explicitly, and the only frontend artifact produced so far is an AI-generated,
non-mergeable mockup used strictly for requirements discovery. This slice is the first to
specify real frontend delivery.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Move between modules through one consistent shell (Priority: P1)

*`US17-EP00-FND-NavigateApplicationShell` — new catalog story*

An authenticated person with an active tenant context reaches every module they are
entitled to from one persistent menu and header. No module builds its own top-level
navigation, and the person never loses track of which firm's data they are looking at.

**Why this priority**: Mirrors why tenant isolation came first in slice 001 — nothing
else in this slice, and no later slice's screen, has anywhere to render until this
exists. It is also the only story here whose content is fully fixed by architecture
rather than by which menu items exist yet.

**Independent Test**: Render the shell with a mocked principal and a small fixed set of
navigation items, some declaring an archetype the principal holds and some declaring one
it doesn't. Assert the permitted items render, the others don't, and selecting a
permitted item swaps the content region without leaving the shell.

**Acceptance Scenarios**:

1. **Given** an authenticated principal with an active tenant context, **When** the shell renders, **Then** a header and a navigation menu are present on every screen without exception.
2. **Given** a navigation item declaring no required archetype, **When** any authenticated principal views the menu, **Then** that item renders.
3. **Given** a navigation item declaring a required archetype the active membership does not hold, **When** the menu renders, **Then** that item does not render.
4. **Given** a person selects a navigation item they can see, **When** the selection completes, **Then** the content region changes to that module while the header and menu remain in place.
5. **Given** no active tenant context, **When** the shell would otherwise render, **Then** no navigation item is offered and the person is directed to establish one rather than seeing a menu with nothing behind it.

---

### User Story 2 - Know the active firm, and switch it when holding more than one (Priority: P2)

*`US19-EP12-ASC-SelectActiveTenant` — UI surface of a capability already delivered by
slice 002*

The header always shows which firm is active. A person who holds live membership in more
than one firm can change which one is active from there; a person who holds exactly one
never sees a switch they couldn't use.

**Why this priority**: Depends on Story 1 for a header to live in, but on nothing
unbuilt — 002 already exists. Ranked ahead of the feedback states because a wrong-tenant
screen that looks correct is a materially worse failure than a slow spinner.

**Independent Test**: Seed a mocked identity with two live memberships, render the
shell, assert the header names the active one, switch, and assert the header and content
both update with zero records from the previous tenant visible.

**Acceptance Scenarios**:

1. **Given** an active tenant context, **When** the shell renders, **Then** the header names that tenant at all times a tenant context is active.
2. **Given** an identity holding live membership in more than one tenant, **When** the header renders, **Then** a control to change the active tenant is offered.
3. **Given** an identity holding exactly one live membership, **When** the header renders, **Then** no tenant-switch control is offered.
4. **Given** a person switches the active tenant, **When** the switch completes, **Then** the header reflects the new tenant and the content region carries zero records from the previously active one.
5. **Given** a person attempts, by any means, to select a tenant they hold no live membership in, **When** the attempt is made, **Then** it is refused through the same generic error state any other refusal uses (see Story 4), disclosing nothing about the named tenant's existence, per `001/FR-008`.

---

### User Story 3 - See that content is loading, not stuck (Priority: P3)

*`US18-EP00-FND-SeeLoadingState` — new catalog story*

While a region of the screen waits on a network response, the person sees a clear
indication that something is happening, rather than a blank area or a frozen control.

**Why this priority**: Every screen any later slice builds will make a request that
takes a moment. Getting this wrong once means getting it wrong on every screen in the
product.

**Independent Test**: Simulate a delayed response for a region; assert a loading
indicator appears before the response arrives and is replaced by content, an error, or an
empty state — never left standing — once it does.

**Acceptance Scenarios**:

1. **Given** a region whose content has been requested but not yet returned, **When** the region renders, **Then** a loading indicator is shown in place of the eventual content.
2. **Given** a loading indicator is showing, **When** the request resolves — successfully, with an error, or with an empty result — **Then** the indicator is replaced by the corresponding state and never remains alongside it.
3. **Given** a request that never resolves, **When** a defined threshold passes, **Then** the region transitions to the error state rather than showing a loading indicator indefinitely.
4. **Given** two independent regions on the same screen, **When** one resolves before the other, **Then** each reflects only its own state — the faster region is not held back by the slower one.

---

### User Story 4 - Say what can safely be said, and nothing else, when a request fails (Priority: P4)

*`US19-EP00-FND-SeeErrorState` — new catalog story*

When a request fails, the person sees a state that says so and offers a way to try
again. For some failures, that is all it may ever say — a resource that doesn't exist and
one belonging to another tenant must look exactly alike, per Principle II. For others,
004 was built specifically to make more possible: a permission gap, a missing case
assignment and a plan that excludes this feature carry three different remedies, and
`004/FR-006` and `004/FR-017` require them to be told apart. This story draws that line
rather than collapsing everything into one silence.

**Why this priority**: The state most likely to be improvised badly under deadline
pressure if it isn't drawn once, centrally — and the one most tied to Principle II on one
side and to 004's refusal-ordering guarantee on the other. Getting the line in the wrong
place is either a leak or a needlessly unhelpful product.

**Independent Test**: Simulate, for the same region: (a) a not-found and a cross-tenant
refusal, and assert the two render identically; (b) a permission refusal, a scope refusal
and an entitlement refusal, and assert each renders distinct, remedy-specific copy that
never names or implies the specific resource; (c) an `mfa_not_enrolled` refusal, and
assert it renders in the same opaque bucket as (a), not the distinguishable bucket of
(b).

**Acceptance Scenarios**:

1. **Given** a request that fails for any reason, **When** the failure is received, **Then** the affected region shows an error state offering a way to retry, except where a specific remedy is called for (scenarios 4–6).
2. **Given** the error state is showing, **When** the person retries, **Then** the same request is re-attempted, not a different action.
3. **Given** a not-found failure and a cross-tenant refusal for the same region, **When** each error state renders, **Then** the two are indistinguishable from one another by presentation alone, per `001/FR-008` and `001/SC-003`.
4. **Given** a permission refusal for a caller already resolved inside their own tenant, **When** it renders, **Then** the copy indicates a role limitation without naming or implying the specific resource, per `004/FR-006` and `004/FR-023`.
5. **Given** a scope refusal (the caller holds the capability but not over this entity), **When** it renders, **Then** the copy indicates the caller isn't assigned to this item, without confirming the item's existence to a caller who couldn't otherwise reach it, per `004/FR-017` and `004/FR-023`.
6. **Given** an entitlement refusal, **When** it renders, **Then** the copy indicates the tenant's plan doesn't include this, distinguishable from the permission and scope copy of scenarios 4 and 5, per `004/FR-006`.
7. **Given** an `mfa_not_enrolled` refusal, **When** it renders, **Then** it is treated as opaque, in the same bucket as scenario 3, because 004's Refusal Ordering places it first, ahead of every distinction FR-006 and FR-017 permit.
8. **Given** a generic technical failure (network unreachable, server error) with no security cause to report, **When** it renders, **Then** the copy offers only a retry, implying no permission, scope or entitlement cause.
9. **Given** an error state is showing, **When** the person navigates away and back, **Then** the request is attempted fresh rather than the stale error being redisplayed.

---

### User Story 5 - See a clear empty state when there's simply nothing there yet (Priority: P5)

*`US20-EP00-FND-SeeEmptyState` — new catalog story*

When a request succeeds but returns nothing — a new tenant's first day, a filter that
matches nothing — the person sees a state that says so clearly, distinct from both "still
loading" and "something broke," with guidance on what to do next where one exists.

**Why this priority**: Lowest build-order priority of the three feedback states, and the
easiest to skip under time pressure, but every list screen any later slice builds will
eventually be empty for some tenant on some day.

**Independent Test**: Simulate a successful response carrying zero records and assert
the empty state renders, is visually distinguishable from both the loading and the error
state, and offers guidance when a next action exists.

**Acceptance Scenarios**:

1. **Given** a successful response carrying zero records, **When** the region renders, **Then** an empty state is shown rather than a blank table or blank area.
2. **Given** the empty state is showing, **When** compared against the loading and error states for the same region, **Then** all three are visually distinguishable from one another.
3. **Given** a screen where a next action exists (e.g., creating the first record), **When** the empty state renders, **Then** that guidance is offered.
4. **Given** a screen where no next action exists for the person's archetype, **When** the empty state renders, **Then** it says nothing false about what they can do.
5. **Given** a filtered view that returns zero records while the underlying data is not actually empty, **When** the empty state renders, **Then** its copy reflects the filter, not an unqualified claim that no data exists.

---

### Edge Cases

- What happens when the data supplying the navigation item list itself fails to load — does the shell degrade to a minimal static menu, or show a shell-level error?
- What happens when a person's active membership is revoked while they are already viewing the shell?
- What happens when the identity's last-used tenant is one it holds a live membership in, but that tenant has since been deactivated?
- What happens on a very fast response — does the loading indicator flash on and off, and is there a minimum display duration to avoid that?
- What happens when a screen has some regions loaded, one still loading, and one errored, all at once?
- Where does selecting a navigation item for a module whose owning slice has not shipped a screen yet lead?
- How does the shell behave exactly at the boundary between a desktop-sized and a mobile-sized viewport?
- What happens when connectivity is lost entirely mid-session, beyond what an ordinary failed request already covers? (Recognised Technical Debt item 7 — offline is unspecified; not solved here.)
- What happens when an item is both archetype-permitted and tier-excluded — does it render at all, and if so, does selecting it produce the entitlement-refusal copy immediately or only after the request round-trips?
- Where exactly does a permission-refusal's remedy copy risk crossing from "distinguishable" (`004/FR-006`) into "discloses the resource" (`004/FR-023`) — e.g., does naming which archetype would be permitted say too much about what the hidden thing is?

---

## Requirements *(mandatory)*

### Functional Requirements

**Navigation shell**

- **FR-001**: The system MUST provide a single persistent navigation surface (header and menu) common to every screen delivered by any later slice; no later slice MUST build its own top-level navigation.
- **FR-002**: The navigation menu MUST render from a data-driven list of items; each item MAY declare a list of archetypes required to see it.
- **FR-003**: An item declaring no required archetype MUST be visible to every authenticated archetype holding an active tenant context.
- **FR-004**: An item whose required-archetype list does not include the active membership's archetype MUST NOT render.
- **FR-005**: Hiding a navigation item is a presentation choice only. It MUST NOT be treated, described, or relied upon as an enforcement mechanism — per the constitution's Tier Entitlements section, hiding a control in the frontend does not constitute enforcement, and per 004's own framing, this shell's filtering is "a projection of [004's] module, never an authority."
- **FR-006**: Selecting a visible navigation item MUST change only the content region; the header and menu MUST remain in place.
- **FR-007**: With no active tenant context, the shell MUST NOT offer any navigation item, and MUST direct the person to establish one.

**Tenant context**

- **FR-008**: The header MUST display the active tenant's name at all times a tenant context is active.
- **FR-009**: When the active identity holds a live membership in more than one tenant, the header MUST offer a control to change the active tenant, invoking `002/FR-013–FR-018`'s existing resolution rather than reimplementing it.
- **FR-010**: When the identity holds exactly one live membership, no tenant-switch control needs to render.
- **FR-011**: Switching the active tenant MUST fully replace the content region's data; zero records from the previously active tenant MUST remain visible after the switch completes.
- **FR-012**: An attempt to select a tenant for which no live membership exists MUST be refused and rendered through the same generic error state as any other refusal (FR-016), disclosing nothing about that tenant, per `001/FR-008`.

**Feedback states**

- **FR-013**: While a region's content is being fetched, that region MUST show a loading indicator rather than remaining blank, frozen, or displaying stale content past a defined threshold.
- **FR-014**: A request that fails for any reason MUST cause the affected region to show an error state offering a way to retry the same request, rather than a blank region or an unhandled failure reaching the person.
- **FR-015**: Retrying MUST re-attempt the same request; it MUST NOT silently substitute a different action.
- **FR-016**: A failure that could otherwise disclose the existence of something the caller has no path to — a genuinely nonexistent resource, a cross-tenant refusal (`001/FR-008`), and an `mfa_not_enrolled` refusal (004's Refusal Ordering, position 1, ahead of every distinction FR-024 permits) — MUST render through one identical, generic error state, disclosing nothing beyond "this could not be completed."
- **FR-024**: A permission, scope or entitlement refusal — each reachable only by a caller who already passed FR-016's checks — MUST render distinct, remedy-specific copy (role limitation / not assigned to this item / plan does not include this), per `004/FR-006` and `004/FR-017`, provided the copy discloses no more about the specific resource's existence or shape than `004/FR-023` already permits at that point. A generic technical failure with no security cause (network unreachable, server error) MUST offer only a retry and MUST imply none of the three.
- **FR-017**: A region receiving a successful response carrying zero records MUST show an empty state, distinguishable from both the loading and the error state, rather than an empty table or unexplained blank area.
- **FR-018**: An empty state MUST offer guidance on the next available action when one exists, and MUST assert nothing false when none does.
- **FR-019**: The three feedback states (loading, error, empty) MUST be mutually exclusive for a given region at a given moment.

**Language and responsiveness**

- **FR-020**: All shell copy — menu labels, header text, and the three feedback states' copy — MUST be in Spanish, per the constitution's language rule for UI.
- **FR-021**: The shell MUST remain fully usable at both a desktop-sized and a mobile-sized viewport; responsive web is the sole supported surface for v1.0 (native mobile app is an explicit MVP prohibition).

**Scope boundary**

- **FR-022**: The shell MUST NOT itself decide which archetype may perform which action. It MUST only render or withhold presentation from data supplied by whichever mechanism owns that decision.
- **FR-023**: The shell MUST NOT perform authentication. It MUST operate against an already-resolved principal, supplied however that principal is currently produced — a development fixture until slice 003 exists, a real session afterward.
- **FR-025**: An item's required-archetype list MUST be sourced from `004/spec.md`'s Capability Matrix, not maintained as an independent list. Since Decision 4 fixed that matrix as a compile-time constant identical for every tenant, this is a build-time correspondence to keep in sync, not a runtime call — a mismatch between the two is a defect in this slice, never a second source of truth.
- **FR-026**: Where a navigation item is additionally tier-gated (belongs to a capability 004's entitlement mapping may exclude for a given plan), that gate MUST be evaluated against the active tenant's live entitlement data, never against a compiled default — because, unlike the archetype matrix, the entitlement mapping is runtime configuration that changes without deployment (`004/FR-007`).
- **FR-027**: Hiding a navigation item from an archetype MUST NOT change what happens if that archetype invokes the underlying capability directly. 004's decision function MUST refuse it exactly as it would if the item had never been hidden — the hide is cosmetic, 004 remains the boundary.
- **FR-028**: A navigation item for a module whose owning slice has not shipped a screen yet, or for an epic still pending Discovery validation (EP13, or anything an open scope conflict might exclude), MUST be absent from the rendered menu entirely — never rendered as a visible, disabled placeholder. *(Decision 1, resolved 2026-08-26 — see Open Questions.)*

### Permission Matrix *(required by Principle IV)*

Deny by default. Any archetype not listed has no access to any capability in this table.

| Capability | Platform Operator (PO) | SA (per tenant) | MP / AA / PL / CM / BM | Portal (CC / IC / CB / EL) |
|---|---|---|---|---|
| View shell (header + menu) | N/A — operates outside any tenant session (`001/FR-009`) | Read | Read | Deferred — EP13 unvalidated |
| View active tenant name | N/A | Read | Read | Deferred |
| Switch own active tenant | N/A | Read/Update, self only | Read/Update, self only | Deferred |
| View own profile control | N/A | Read | Read | Deferred |
| Decide which items another archetype may see | Deny — no archetype holds this in this slice | Deny | Deny | Deny |

Notes on this matrix:

- This slice grants no create, update or delete capability over any business entity. Every row above is either a read of one's own context or a self-scoped update — which tenant is active for oneself, and for no one else.
- Deciding which items an archetype may see belongs to `004/spec.md`'s Capability Matrix (FR-025) — never to this slice, and never to the archetype viewing the menu.
- Portal archetypes are marked deferred, not denied — but as of 004, this is no longer a hedge against an unknown: `004/FR-020` and `004/SC-004` already assert, tested, that `CC`, `IC`, `CB` and `EL` hold exactly zero capabilities today. What this slice defers is the possibility that a future EP13 validation adds rows for them; it renders nothing for them either way, right now.
- The Platform Operator's platform administration context (`001/FR-009`) is not a tenant session, and this slice's shell is a tenant-session surface. `004/FR-008` now enumerates PO's complete surface at seven platform capabilities, none tenant-scoped; a platform-operator-facing administrative UI for them, if one is ever needed, is out of scope here.

### Key Entities

This slice introduces no persisted entity. It renders state resolved by other slices —
identity and active membership from slice 002, module content from each business slice —
and holds only ephemeral client-side UI state (which item is selected, whether a given
region is loading) that is not persisted server-side and carries no tenant or business
data of its own.

---

## Success Criteria *(mandatory)*

- **SC-001**: 100% of navigation items whose required-archetype list excludes the active membership's archetype are absent from the rendered menu, across every archetype/item pair in the test matrix; 0% render.
- **SC-002**: 100% of items declaring no requirement render, across every archetype tested.
- **SC-003**: Selecting any visible item changes only the content region in 100% of trials; the header and menu remain present and unchanged in 100% of trials.
- **SC-004**: A simulated failed request produces an error state in 100% of trials, with 0 blank regions and 0 unhandled failures reaching the person.
- **SC-005**: Rendered content is identical across the opaque bucket's causes (not-found, cross-tenant refusal, `mfa_not_enrolled`) in 100% of comparisons, and 0 of them can be told apart from one another or from a nonexistent resource.
- **SC-006**: A simulated response carrying zero records produces the empty state, distinguishable from both the loading and error states, in 100% of trials.
- **SC-007**: A mocked identity holding two live memberships can change its active tenant; header and content both reflect the new tenant within 2 seconds of the switch completing, with 0 records from the previous tenant visible.
- **SC-008**: A mocked identity holding exactly one live membership is offered no tenant-switch control, in 100% of trials.
- **SC-009**: An attempt to select a tenant the mocked identity holds no live membership in is refused and rendered through the same error state exercised in SC-005, in 100% of trials.
- **SC-010**: 100% of shell copy sampled across the header, menu and three feedback states is in Spanish; 0 instances of English user-facing copy.
- **SC-011**: Every control in the shell is reachable and usable at both a desktop-sized and a mobile-sized viewport, in 100% of the controls tested at each size.
- **SC-012**: No region presents more than one of the three feedback states at once, in 100% of trials simulating overlapping conditions.
- **SC-013**: Rendered content for permission, scope and entitlement refusals is mutually distinguishable in 100% of comparisons — 3 distinct remedy messages for 3 distinct causes — while 0 of the three disclose the specific resource's existence or shape beyond what `004/FR-023` already permits at that point.
- **SC-014**: For every navigation item this shell hides from a given archetype, invoking the underlying capability directly is refused by 004's decision function in 100% of trials — the hide is cosmetic, not the boundary.

---

## Assumptions

- A principal (identity plus active membership) is assumed to be supplied by a development fixture until slice 003 delivers real login — mirroring how slice 001 assumed identity fixtures before slice 002 replaced them with real data. Wiring the shell to real authentication is slice 003's job, not this one.
- The tenant-selection mechanism of `002/FR-013–FR-018` is assumed to already exist and to be invoked, not reimplemented, by the header's switch control.
- The archetype-to-action matrix of slice 004 is assumed to be the single source of truth for archetype-based item visibility, per Decision 4's fixing of that matrix as a compile-time constant identical for every tenant. This slice assumes no runtime call is needed to know which archetype may see which item — only a build-time correspondence kept in sync with `004/spec.md`. Tier-based visibility, where it applies, is assumed to need a runtime read instead, since the entitlement mapping (unlike the archetype matrix) is configuration that changes without deployment.
- Portal archetypes (`CC`, `IC`, `CB`, `EL`) are assumed out of scope for this slice's shell, since EP13 remains unvalidated. A portal-facing shell, if EP13 survives Discovery, is assumed to need its own specification given its very different trust boundary and audience, not an extension of this one.
- The specific set of module navigation items is assumed to track whichever epics the catalog currently marks MVP, and to change as Discovery closes the remaining scope conflicts. Adding or removing an item is assumed to be configuration, not a re-specification of this slice.
- No offline behavior is assumed. Per Recognised Technical Debt item 7, offline operation is unspecified and unestimated; this shell assumes network connectivity and defines no state beyond the ordinary error state a lost connection already produces.

## Dependencies

- **Slice 001 (built)**: supplies the resolved tenant context this shell displays. 001 itself ships no UI.
- **Slice 002 (built)**: the tenant switcher invokes its SelectActiveTenant capability (`US19-EP12-ASC-SelectActiveTenant`) rather than reimplementing tenant resolution.
- **Slice 003 (not built)**: owns real sign-in. Until it exists, this shell operates against a supplied principal rather than performing authentication itself.
- **Slice 005 (not built)**: owns sign-out and session lifecycle. Sign-out is explicitly out of scope here (see Out of Scope).
- **Slice 004 (built and tested** — 665 tests, 100% coverage on `src/common/authz/**`; its own Approval Checklist still awaits CC technical-lead sign-off**)**: owns the archetype-to-action matrix, now a compile-time constant per its Decision 4. This slice's item-level filter reads that matrix (FR-025); it does not maintain a competing one. 004's own Out of Scope names "a separate frontend slice (014)" for permission-derived navigation — read here as an incomplete list rather than an exclusion of this slice, per the Revision Note above; worth reconciling at 004's next amendment.
- **Slice 014-admin-ui** depends on this slice for its own screens' navigation container, per `estado-specs.md` (014 waits on 004 + 016a).
- Every business slice from 006-client-case-core onward is assumed to render its screens inside this shell rather than building a competing top-level navigation. This slice does not gate them technically; it is a convention this spec establishes, and later specs are expected to follow it.
- **Principle I traceability**: four catalog stories are proposed as additions —
  `US17-EP00-FND-NavigateApplicationShell`, `US18-EP00-FND-SeeLoadingState`,
  `US19-EP00-FND-SeeErrorState`, `US20-EP00-FND-SeeEmptyState` — raising EP00 from 16 to
  20 stories and the catalog total accordingly. Without them this slice cannot merge
  under Principle I, the same class of correction slice 002 made when it added US18–US19
  to EP12.

## Out of Scope

Real authentication and sign-in (slice 003). Sign-out and its server- and provider-side
invalidation (slice 005). Defining the archetype-to-action matrix or the entitlement
mapping (slice 004 owns both; this shell consumes them, per FR-025 and FR-026).
Server-side authorization enforcement itself — this shell's filtering is cosmetic
(FR-027); 004's decision function is the boundary regardless of what this shell renders.
Any specific business screen's content (dashboards, case lists, documents, billing,
calendar, etc.) — each is its own slice's spec. A portal-facing (EP13) version of this
shell. Offline behavior. A native mobile app shell (constitution MVP prohibition).
Localization beyond Spanish.

## Decisions

### Decision 1 — Unshipped and pending-Discovery modules are absent, not placeholders *(resolved 2026-08-26)*

**Resolved: option (a).** A navigation item for a module whose owning slice has not
shipped a screen yet, or for an epic still pending Discovery validation (EP13, and
anything the four open scope conflicts might exclude), is **absent from the rendered
menu entirely** until its owning slice ships. It never renders as a visible, disabled
placeholder (e.g., "Próximamente").

**Rationale.** Narrower: it cannot create an expectation for functionality that may
never ship or whose scope is still contested. Consistent with the slice roadmap's own
warning that screens implying epics outside MVP already generate client expectation and
must be managed in Discovery, not discovered in week 10. The rejected alternative
(visible, disabled placeholder) would have signalled product breadth during Discovery
demos at the cost of setting expectations for scope still open to negotiation —
including EP13, which did not appear in the client's own stated priorities.

Consequence carried into `plan.md`: the navigation item list is filtered to shipped
modules before rendering; there is no "coming soon" visual state anywhere in this
slice's scope. Codified as FR-028.

## Approval Checklist

- [x] No `[NEEDS CLARIFICATION]` left open — **0 remain**, Q1 resolved as Decision 1
- [x] No implementation or technology detail in this document — the stack (Next.js, TanStack Query, Tailwind) lives in `plan.md`, not here
- [x] Every requirement is test-verifiable — 16 test files, 59 unit/component tests plus 4 passing e2e tests, 0 failures (T051); see `quickstart-results.md`. One documented, non-blocking gap: the `scope` refusal bucket (research.md D3) is not yet reachable through any real 004 response
- [ ] Cross-tenant leak test defined and accepted (Principle II) — here: error-state indistinguishability (FR-016, SC-005) carries the guarantee through to the presentation layer; the leak test itself belongs to slices 001/002
- [x] Audit events enumerated per operation (Principle V) — N/A: this slice performs no mutation to any audited entity type; zero new audited actions
- [x] Permission matrix declared (Principle IV)
- [x] Tier classification declared (Tier Entitlements)
- [x] US17–US20-EP00-FND added to `master-user-story-catalog.md` (Principle I) — added 2026-08-26, EP00 raised from 16 to 20 stories, reconciled against the catalog's actual current state (004's Decision 4/Decision 5 already reflected there)
- [ ] 004's Out of Scope note naming "a separate frontend slice (014)" for permission-derived navigation reconciled with this slice's existence (see Revision Note) — flag at 004's next amendment, not blocking
- [ ] Approved by Cosmic Chimps technical lead
