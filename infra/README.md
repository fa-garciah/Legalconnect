# Infrastructure

Declared as code. Constitution, Dependencies and Infrastructure: **no manual changes
in production**, and no long-lived credentials in CI — short-lived roles only.

## Region and identity provider — decided in Constitution v1.4.0

**Region: `mx-central-1`** (AWS Mexico, Central). **Identity provider: Amazon
Cognito user pools, Essentials tier**, one shared pool and one app client. Both
close the `[PENDING]`s this section carried under earlier constitution
versions; see the constitution's Data Residency and Authentication sections for
the reasoning.

Constraints that apply whichever region is chosen:

- The region must appear in the firm's privacy notice under LFPDPPP.
- Any international transfer must be declared.
- The contractual operator of the infrastructure must be documented along with its
  legal capacity as data processor, since cloud is billed as a pass-through to the
  firm.
- **Backups reside in the same jurisdiction as the primary data.**

## What slice 001 needs

| Resource | Why |
|---|---|
| RDS PostgreSQL 16 | The version the null-safe RLS predicate rule was reproduced against |
| Three database roles | Migration/owner, application (owns nothing), platform — see `backend/drizzle/0000_roles.sql` |
| KMS key | Encryption at rest, no exception |
| Secrets manager entries | Role passwords. Never in the repository, never in logs |
| Scheduled retention task | Drops audit partitions past 24 months, under the retention role only |

Not needed yet: ECS Fargate service, S3 buckets, SQS queues. This slice delivers no
HTTP surface that may be exposed to a network, because it authenticates nothing.

## Do not deploy this slice

The platform administration surface performs unauthenticated tenant creation and plan
changes if it is reachable. It stays bound to loopback until slice 003 lands session
and MFA handling.

## What slice 002 needs, in addition — **open item for the CC technical lead**

**Transactional email provider — not yet confirmed by infra** (plan.md open
item 2, research.md D7). Because SES is unavailable in `mx-central-1`,
invitation delivery goes through SES in a secondary region — candidate:
`us-east-1` — rather than a third-party provider, so the stack adds no new
vendor. This is a `plan.md` decision, not a constitutional one, so it can be
revisited without a constitution amendment. Needs sign-off on the specific
secondary region before `/speckit-implement`'s email-dispatch follow-up (this
slice composes the message via `backend/src/modules/invitation/message-template.ts`
but does not yet send it — see `quickstart-results.md`, "Not yet built").

All three of Cognito, `mx-central-1` and the SES cross-region choice are
already reflected in `backend/.env.example`'s `EMAIL_PROVIDER_REGION` and
`EMAIL_SENDER_ADDRESS`, and in Constitution v1.4.0 Technical Debt item 9
(transactional email leaves the region regardless of which provider is
chosen).

This slice's own HTTP surfaces (invitation issue/revoke/list, accept,
enumerate-own-memberships, membership revoke/archetype-change, seed) add no
new infrastructure resource beyond what 001 already requires — no new table
needs its own AWS resource, and no route here is any more network-exposed
than 001's platform surface already was.
