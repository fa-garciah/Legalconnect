# Contract — Administration Screens (`/configuracion`)

**Slice**: `014-admin-ui` · **Spec**: [../spec.md](../spec.md) · **Plan**: [../plan.md](../plan.md)

Every screen below renders inside `016a`'s shell, calls the API only through `apiFetch`
(`frontend/src/lib/api-client.ts`, same-origin proxy `/api/lc`), uses `020`'s tokens only, and
reuses `016a`'s feedback primitives (`frontend/src/feedback/`) for loading, empty and error
states. Visibility is keyed to a **capability id** through `can()` (`frontend/src/authz/can.ts`),
never to an inline archetype list. Hiding a control is cosmetic: the server refuses identically.

All capability sets below were checked against `backend/src/common/authz/matrix.ts` on
2026-09-23.

---

## 1. Backend contract changes (two; everything else is consumed as-is)

### 1.1 `POST /tenant/invitations` gains `invitationLink` — Decision 3

**`201 Created`**, extending `002/contracts/tenant-invitations.md`:

```json
{
  "id": "9f1c...",
  "targetArchetype": "AA",
  "status": "pending",
  "issuedAt": "2026-09-23T18:04:11Z",
  "expiresAt": "2026-09-30T18:04:11Z",
  "invitationLink": "/aceptar/uz3bta2Q5Y5bQXv_xKzK1zrdAp8QtvBgwM9qtfeYsso"
}
```

| Rule | Why |
|---|---|
| `invitationLink` is present on EVERY `201`, including when the email already holds a live membership | `002/FR-029`: the response must not distinguish the two. The service already inserts a real invitation in both cases (`invitation.service.ts`, `issue()`), so the link is genuine either way. **No branch may be added that omits or fakes it for existing members.** |
| The link is relative (`/aceptar/{raw}`) | The API does not know the frontend's origin; the screen prefixes `window.location.origin`. |
| Returned ONCE | `GET /tenant/invitations` never includes it; there is no route that re-reads it (FR-004). |
| Never in logs, audit metadata or error bodies | FR-002. `invitation.issued` audit entries keep their current metadata; the token is not added. |
| `email` is still not echoed | Unchanged from `002`. |

### 1.2 `GET /tenant/members` — NEW, Decision 5 *(pending CC technical-lead approval)*

**Capability**: `membership.read_tenant` (`SA`, `MP`) — exists, currently unused.

**`200 OK`**

```json
{
  "items": [
    {
      "membershipId": "b012...",
      "email": "lucia@despachoalfa.mx",
      "archetype": "AA",
      "positionName": "Asociado Senior"
    }
  ]
}
```

| Rule | Why |
|---|---|
| Live memberships of the ACTIVE tenant only | Principle II. |
| `email` readable through one new RLS policy on `identity` for `lc_app` (migration `0044`), admitting a row only when `app.tenant_id` is set AND the identity holds a live membership in that tenant | The mirror of `0043`'s guard. `0043`'s first draft widened isolation because policies OR together; this one is written guard-first and ships only with `members-email-isolation.test.ts` green. |
| Audited as a read of personal data | Principle VI. |
| Until Decision 5 is signed, the screen falls back to `GET /tenant/directory` and shows position + archetype only, labelled "Correo no disponible" | The list must not ship as bare UUIDs. |

---

## 2. Screens

`/configuracion` is one page with three tabs (Decision 4). The navigation item `configuracion`
becomes `available: true` with `requiredArchetypes: ['SA', 'MP']` (FR-025).

### 2.1 Tab "Usuarios e invitaciones" (default) — US1

| Element | Calls | Gate (capability) | Visible to |
|---|---|---|---|
| Members list | `GET /tenant/members` (Decision 5) or `GET /tenant/directory` | `membership.read_tenant` / `directory.read` | SA, MP |
| "Invitar" button → dialog (email + role) | `POST /tenant/invitations` | `invitation.issue` | SA, MP |
| One-time link modal ("Copiar enlace") | — (response of the call above) | — | the issuer |
| Pending invitations table | `GET /tenant/invitations` | `invitation.read_pending` | SA, MP |
| "Revocar" on a pending invitation | `POST /tenant/invitations/{id}/revoke` | `invitation.revoke` | SA, MP |
| "Desactivar" on a member | `PATCH /tenant/memberships/{id}/revoke` | `membership.revoke` | SA, MP |

Rules:

- The role selector offers only archetypes **not broader than the issuer's own** (`002/FR-021`;
  `isBroaderThan` in `backend/src/modules/invitation/archetype-rank.ts`). An `MP` is never offered
  `SA`. The server refuses regardless.
- The link modal states, in Spanish, that the link will not be shown again. Closing it discards it
  from component state. It is never written to browser storage (the `003/FR-051` rule applies).
- The last remaining `SA` cannot be deactivated or demoted from the UI (FR-012). The server's own
  rule is authoritative; the UI only prevents offering it.

Copy examples: "Invitar a una persona" · "El enlace solo se muestra una vez. Cópialo y envíalo por
un canal seguro." · "Revocar invitación" · "Desactivar acceso".

### 2.2 Tab "Cargos y roles" — US2

| Element | Calls | Gate | Visible to |
|---|---|---|---|
| Position catalog (active and retired) | `GET /tenant/directory/positions` | `directory.read` | all internal |
| "Nuevo cargo" | `POST /tenant/directory/positions` | `directory.manage_catalog` | SA, MP |
| "Retirar" on a position | `PATCH /tenant/directory/positions/{id}/retire` | `directory.manage_catalog` | SA, MP |
| "Asignar cargo" on a member | `PATCH /tenant/directory/entries/{membershipId}/position` | `directory.assign_position` | SA, MP |
| "Cambiar rol" on a member | `PATCH /tenant/memberships/{id}/archetype` | `membership.change_archetype` | **SA only** |

`membership.change_archetype` is `SA`-only in the matrix, unlike the rest of this tab — an `MP`
sees the role but no control to change it.

### 2.3 Tab "Matriz de permisos" — US3 (read-only, Decision 1)

| Element | Source | Gate |
|---|---|---|
| Capabilities grouped by domain × the six internal archetypes | `frontend/src/authz/capability-matrix.ts` (the mirror `capability-matrix-sync.test.ts` keeps in step with the backend) | SA, MP |

No control on this tab mutates anything. A callout explains, in Spanish, that roles are fixed by
the product and a firm decides who holds each role, not what a role may do.

---

## 3. States (every data region)

| State | Rendering |
|---|---|
| Loading | `016a`'s `LoadingState` after its threshold |
| Empty — no pending invitations | `EmptyState`: "No hay invitaciones pendientes." with the "Invitar" action for SA/MP |
| Empty — no custom positions | `EmptyState`: "Tu despacho aún no define cargos." |
| Refused (403) | `016a`'s classifier: opaque or remedy-specific, never a raw code |
| Network failure | `ErrorState` with retry |

---

## 4. Explicitly not in this contract

- Billing parameters (US04) — deferred to `010-billing-core` (Decision 2).
- Editing what an archetype may do — not possible by design (`004` Decision 4).
- Resending an invitation link — impossible: the raw token is never stored. The path is revoke and
  re-issue.
