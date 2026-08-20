# Infrastructure

Declared as code. Constitution, Dependencies and Infrastructure: **no manual changes
in production**, and no long-lived credentials in CI — short-lived roles only.

## Blocked on a constitution `[PENDING]`

The AWS **region is not yet chosen** (Constitution, Data Residency). This blocks
production deployment, not development, so the module below declares structure and
variables without committing to a region.

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
