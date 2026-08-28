# Quickstart — Validating the Client Screens

**Feature**: `018-frontend-clients` | **Date**: 2026-08-28
**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) |
**Contracts**: [client-screens.md](./contracts/client-screens.md) ·
[design-system.md](./contracts/design-system.md)

A run-and-verify guide, not an implementation guide.

---

## Prerequisites

This slice needs the **backend running**, which no previous frontend slice did — `016a`
ships a shell with no network calls, and this is the first screen that talks to anything.

```bash
# 1. Backend, on the port the frontend expects
cd backend
npm ci
npm run db:up && npm run db:migrate && npm run db:seed
PORT=3001 npm run dev          # PowerShell: $env:PORT=3001; npm run dev

# 2. Frontend, in a second terminal
cd frontend
npm ci
npm run dev
```

**Port 3001 is not arbitrary.** `api-client.ts` defaults to `http://localhost:3001`, while
`next dev` takes 3000. Running the backend on its own default puts both on 3000 and the
frontend then calls itself. Either run the backend on 3001 as above, or set
`NEXT_PUBLIC_API_BASE_URL` to wherever it actually is.

**Who you are while testing.** There is no login — authentication is slice `003`. The
frontend reads `src/session/principal.fixture.json`, which ships with a single `SA`
membership whose ids do not correspond to anything the seed created. To exercise the
screens against real data, paste the seed's own output into that fixture:

```bash
cd backend && npm run db:seed | grep -E "SEED_TENANT_A|seeded identity dual"
```

Then set `identityId` and the membership's `tenantId` in the fixture to those values, and
`archetype` to whichever role the scenario under test needs. Changing that one field is how
every archetype row below is exercised.

---

## Scenario 1 — The design system landed intact (FR-020 to FR-024)

**Run this first.** Every screen below renders through these components, so a failure here
explains failures everywhere else.

```bash
cd frontend
npx vitest run tests/component/ui-smoke.test.tsx
```

| Step | Expected |
|---|---|
| All 49 ported components mount | Each produces DOM; **none skipped** (SC-012) |
| Components needing a trigger or provider — dialog, tooltip, popover, accordion | Mounted in that state, not skipped |
| A component whose token is missing from the theme | Fails here — this is the failure mode the test exists for |

```bash
npx tsc --noEmit && npm run lint
grep -rE "#[0-9A-Fa-f]{6}" src/app/clientes src/clients src/authz src/shell
```

| Step | Expected |
|---|---|
| Typecheck and lint | Clean |
| Colour literals in files this slice wrote | **Zero matches** (design-system.md §3.4) |
| `tailwindcss-animate` in `package.json` | Absent — replaced by `tw-animate-css` |

---

## Scenario 2 — Find a client (US1, FR-001 to FR-004)

```bash
npx vitest run tests/component/clientes/ClientDirectory.test.tsx
npx playwright test tests/e2e/client-directory.spec.ts
```

| Step | Expected |
|---|---|
| Open `/clientes` with clients seeded | A bounded page; each row shows razón social, tipo, RFC and estado |
| A client with no RFC | A dash, not an empty cell — "not collected" is visibly not a rendering fault |
| Type a fragment of a name | Only matching clients, matched anywhere in the name and in any letter case |
| Clear the search box | The **whole** directory returns, not an empty result |
| Search for something that matches nothing | Empty state naming what was searched, with a control to clear it |
| A firm with no clients at all | A **different** empty state — "aún no tiene clientes", pointing at how to add the first (SC-005) |
| More matches than fit one page | "Cargar más" appears; the next page continues the same filtered set |
| A filtered page with more matches remaining | A **full** page of matching clients — not a short one (FR-003) |
| Change the filter while on page 2 | The cursor resets; paging restarts within the new filter |
| Backend stopped mid-session | Error state with retry, no permission or plan cause implied |
| Type quickly in the search field | One request after typing settles, not one per keystroke |

**The row worth dwelling on** is the full-page one. `006` filters before the page boundary
so the page arrives complete; if the screen filters again after receiving it, pages shrink
while "Cargar más" still promises more. That defect is invisible until someone pages
through a filtered set, which is why it has its own row here and its own assertion.

---

## Scenario 3 — Register and correct a client (US2, FR-005 to FR-011)

```bash
npx vitest run tests/unit/client-schema.test.ts tests/component/clientes/ClientFormDialog.test.tsx
npx playwright test tests/e2e/client-intake.spec.ts
```

| Step | Expected |
|---|---|
| Open the form | **No errors shown** — nothing has been touched yet (FR-007) |
| Submit it empty | Every problem at once, in Spanish, and **no request sent** (SC-002, SC-003) |
| Fill a valid name, leave RFC blank | Accepted — RFC is optional (`006/FR-002`) |
| Enter an RFC of an odd shape but reasonable length | **Accepted.** Format is deliberately unvalidated — `006` does not validate it either, and a stricter browser would refuse records the server takes |
| Save a valid client | Dialog closes; the client appears in the directory with **no manual reload** (FR-011) |
| Open an existing client for editing | `kind` renders as read-only **text**, not a disabled control |
| Change the legal name and save | Reflected in the directory |
| Inspect the edit request | `kind` is **absent from the payload**, not sent-unchanged — `006` refuses a `PATCH` naming it |
| Edit a client someone else withdrew meanwhile | `409` shown against the form, what was typed preserved, record refreshed |
| Act as `PL` | Create and edit both succeed (`006`'s Q1) |
| Act as `AA` or `CM` | No "Nuevo cliente" button, no edit control |

**The `kind`-omission row is the one most likely to regress.** The natural implementation
spreads the loaded client into the payload, which sends `kind` and earns a `400` on every
save. It deserves its own assertion rather than being covered incidentally.

---

## Scenario 4 — Withdraw and restore (US3, FR-012, FR-013)

```bash
npx vitest run tests/component/clientes/WithdrawDialog.test.tsx
npx playwright test tests/e2e/client-withdraw-restore.spec.ts
```

| Step | Expected |
|---|---|
| Choose "Retirar" | Confirmation required **before** anything is sent (FR-012) |
| Read the confirmation | States both halves: no new matters, **and** existing matters unaffected |
| Confirm | The client shows as retirado and is visibly distinguishable from an active one |
| Filter to retirados | It appears there |
| Open it and choose "Restaurar" | Active again, immediately usable for a new matter — no confirmation, it is the undo |
| The round trip in the backend's audit log | `client.deactivated` then `client.reactivated`, two distinct entries (`006`'s SC-007b) |
| Act as `PL` | **No** withdraw control offered (`006`'s Q1) |
| Act as `BM` | Both controls offered |

**Why the confirmation's second sentence is a test row.** Withdrawal sounds destructive and
is not — `006/FR-008` guarantees existing matters are untouched. A confirmation that
omitted that would make people hesitate over a reversible action, which is a real usability
defect even though nothing technical is wrong.

---

## Scenario 4b — Accessible by keyboard and to a screen reader (FR-025, FR-026, SC-013)

```bash
npx vitest run tests/component/clientes/accessibility.test.tsx
```

| Step | Expected |
|---|---|
| Traverse each screen using only the keyboard | Every control reachable and operable; focus always visible |
| Open a dialog | Focus moves into it and stays there while it is open |
| Close a dialog with the button | Focus returns to the control that opened it |
| Close a dialog with **Escape** | Same — focus returns to the opener, not the top of the page |
| Inspect every input | Each has a programmatically associated label, not just adjacent text |
| Submit an invalid form | Each error is announced and associated with its input (SC-013) |
| Open the edit dialog from row 4 of page 3, then close it | The directory is still filtered, still on page 3, still scrolled there (SC-014, FR-027) |

**The Escape row is the one most likely to be missed**, because closing via the button
usually works by accident while Escape takes a different path out of the component.

## Scenario 5 — Permissions at the surface (FR-014 to FR-017, SC-006, SC-007)

```bash
npx vitest run tests/component/clientes/control-visibility.test.tsx tests/unit/capability-matrix-sync.test.ts
npx playwright test tests/e2e/hidden-item-still-refused.spec.ts
```

| Step | Expected |
|---|---|
| Each of the six internal archetypes in turn | Controls rendered match that archetype's row exactly — 0 shown that the server would refuse, 0 hidden that it would permit (SC-006) |
| `AA` and `CM` | Directory yes; create, edit, withdraw all absent |
| `PL` | Create and edit yes; withdraw absent |
| `BM` | All four |
| Issue a hidden control's request directly, bypassing the UI | Refused by the server **identically** to the case where it was never hidden (SC-007, `016a/FR-027`) |
| The mirror disagreeing with `004` | Build fails — `016a` already ships that check, extended here with four rows |
| The navigation entry | Visible to the six internal archetypes, absent for the four portal ones and `PO` |

---

## Scenario 6 — Nothing that already worked stopped working

```bash
cd frontend && npx vitest run && npm run lint && npx tsc --noEmit
cd ../backend && npm test
```

| Step | Expected |
|---|---|
| `016a`'s 60 existing frontend tests | Pass **unchanged** (SC-011) |
| `refusal-bucket.ts`, `api-client.ts`, `Shell`, `Header`, `NavigationMenu`, `TenantSwitcher` | `git diff` empty — research D7 |
| The backend suite | 1315/1315, untouched by this slice |
| `spanish-copy.test.tsx` | Passes with this slice's components added to it (SC-009) |
| Both viewports, all three screens | No horizontal scrolling of the page body (SC-010) |

---

## Known-not-covered

Recorded so the gaps are visible rather than assumed absent.

- **Appearance is not asserted.** The smoke test proves components render, not that they
  look right. No screenshot diffing — 49 vendor components would produce noise, not signal
  (design-system.md §5).
- **~37 of the 49 have no caller.** Q1's accepted cost. They are proven to render and
  nothing more; the first slice to use one is the first to exercise it properly.
- **No draft persistence.** A half-filled form abandoned by navigating away is lost, by
  decision (spec Assumptions).
- **No bulk actions, no import, no client detail beyond the record.**
- **Case screens do not exist.** `006` shipped their API — including the product's first
  `assigned`-scope capability — and nothing renders it. Not this slice's scope; flagged in
  plan.md so the gap stays visible.
- **The prototype exists twice.** `LegalConnect - FrontEnd/` and `cosmic-legalconnect/` are
  byte-identical. One should be deleted so nobody later ports from the stale copy.
