# Infrastructure

Declared as code. Constitution, Dependencies and Infrastructure: **no manual changes
in production**, and no long-lived credentials in CI — short-lived roles only.

## Region and identity provider — updated 2026-11-25 (slice 024)

**Region: `eu-central-1`** (Frankfurt) for the MVP: the existing EC2 host that runs Dokploy and the
documents bucket are there (slice 024, open question 1). This is outside Mexico and needs the dated
residency exception drafted in `specs/024-deployment-pipeline/constitution-amendment-draft.md`
before any real firm's data goes in. Apply with `-var aws_region=eu-central-1 -var environment=prod`
(one production environment, no staging). **Identity provider: self-hosted** (Constitution v1.5.0) —
Cognito is retired; KMS holds only the TOTP envelope key.

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

## Transactional email — Resend (decided 2026-11-25)

Invitation and notification email goes through **Resend**, replacing the earlier SES-in-`us-east-1`
candidate. Nothing sends email yet: tenant and seed invitations return their link once to the issuer
(014 Decision 3, 024 Decision 13), and the issuer delivers it. When sending is built it needs one
secret, `RESEND_API_KEY`, and no AWS resource. Email leaves Mexico whatever the provider
(Constitution Technical Debt item 9); the privacy notice must name Resend.
