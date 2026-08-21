# Contracts: Identity, Membership & Invitation

**Feature**: `002-identity-membership` | **Date**: 2026-08-21

REST over JSON, continuing slice 001's conventions exactly — see
[001/contracts/README.md](../../001-tenant-foundation/contracts/README.md) for
media type, identifiers, timestamps, pagination and the error body shape, all
unchanged here.

This slice exposes three HTTP surfaces plus one internal mechanism, extending
001's two surfaces to four:

| Contract | Surface | Consumer |
|---|---|---|
| [tenant-invitations.md](./tenant-invitations.md) | Tenant application — requires an active tenant | An authorized member of a firm (SA or MP) |
| [self-service.md](./self-service.md) | Identity-only — authenticated subject, no tenant active | The invited person, before and immediately after accepting |
| [platform-seed.md](./platform-seed.md) | Platform administration — no tenant context | Cosmic Chimps operators, one capability only |
| *(internal)* identity context | Not HTTP | Backs `self-service.md`; documented inline there rather than as a separate file, since it has exactly two callers |

## The one response rule that still governs

001's rule carries over unchanged: any attempt to reach another tenant's resource,
or to accept an invitation that is expired, used, revoked, or was never issued,
answers with the **same generic body**, never a status or message that lets a
caller distinguish one cause from another. `tenant-invitations.md` inherits `404`
for cross-tenant attempts from 001's mechanism directly. `self-service.md`'s
accept-invitation route answers its own single generic refusal shape — see that
contract for why it is `400`, not `404`: there is no tenant-existence question to
protect once the caller is not yet inside any tenant at all, but there is still an
email-enumeration question (FR-028), which is what the uniform body protects.

## Authentication status, stated plainly — unchanged from 001, extended to new headers

This slice authenticates nothing, the same boundary 001 drew. It is the slice that
gives identity and membership *real data*; it is not the slice that verifies a
caller's claim to be a given identity. That remains slice 003.

**Therefore none of the three HTTP surfaces below may be exposed to a network
before slice 003 lands** — the same constraint 001 stated for its own two
surfaces, now covering two more. During this slice, every route is bound to
loopback and exercised by tests only ([research.md D10](../research.md#d10--this-slices-http-surfaces-stay-off-the-network-the-same-way-001s-did)).

Test-only headers, standing in for what slice 003 will verify for real:

| Header | Stands in for | Used by |
|---|---|---|
| `x-identity-id` | An already-resolved identity (unchanged from 001) | Tenant-application routes; enumerate-own-memberships |
| `x-tenant-id` | The named target tenant (unchanged from 001) | Tenant-application routes |
| `x-subject` | The IdP subject identifier, before any identity row may exist | Accept-invitation only |
| `x-email` | The authenticated person's email, for FR-024's match check | Accept-invitation only |

The seed capability (`platform-seed.md`) needs none of these — it authenticates
the *platform operator's intent to name an invitee*, not the invitee, and it is
already on the platform surface's existing loopback-only posture from 001.

## Step-up MFA — four capabilities, still withheld from production

The constitution's step-up requirement for creating or deactivating users and for
permission-matrix changes covers four capabilities here: issuing an ordinary
invitation, revoking a membership, changing an archetype, and issuing a seed
invitation. Slice 005 owns the mechanism. Until it exists, D10's non-exposure
posture is what keeps this from being a gap rather than a deferral — the same
stance 001 took toward its own step-up-gated operations.
