# Constitution amendment 1.5.0 → 1.6.0 — DRAFT

**Status**: draft, **not ratified**. Written 2026-10-26 by Claude for task T015 of slice 024. Nothing
here takes effect until the CC technical lead (Francisco) approves it (Governance: "a PR with
written justification, approval by a CC technical lead, and a semantic version bump"). Per Merge
Rules the amendment itself lands in its own PR against `.specify/memory/constitution.md`, not in
slice 024's PR; this file is where it is prepared.

**One input is still missing**: the EC2 region (spec open question 1). Section 3 is written in two
variants; delete the one that does not apply.

---

## Why

Slice 024 deploys LegalConnect for the first time. The technical lead decided on 2026-10-09 to run
it on Dokploy on an existing EC2 host with PostgreSQL in a container (spec D1, D2). The constitution
still names ECS Fargate and RDS, still carries the `[PENDING]` on the AWS account blockage, and has
four rules this deployment meets only in part. Amending now rather than after is what Governance
demands: "Relaxing a principle de facto — without an amendment — invalidates the authority of the
entire document."

**Version**: MINOR (1.6.0). No Core Principle (I–VI) is removed, renamed or redefined. Technology
Constraints and Security Constraints change; one `[PENDING]` closes; technical debt is added.

---

## 1. Technology Constraints › Stack (`constitution.md:520`)

Current:

```
Cloud:      AWS mx-central-1 — ECS Fargate + RDS PostgreSQL + S3 + KMS + SQS
```

Proposed:

```
Cloud:      AWS <region> — EC2 running Dokploy (Docker + Traefik) + PostgreSQL 16 in a
             container + S3 + KMS (SQS when a queue is first needed)
Images:     GitHub Container Registry, built only by CI from a commit that passed every gate
```

Add beneath the Stack block:

> **Dokploy and containerised PostgreSQL — decided 2026-10-09 (slice 024, D1/D2).** Chosen over ECS
> Fargate + RDS for the MVP to cut operational and AWS cost while one host suffices. What this gives
> up, stated so it is not forgotten: Multi-AZ failover, AWS-managed point-in-time recovery, and
> managed minor upgrades. Backups, restore, disk and host patching become CC's responsibility. The
> backup obligations below exist because of this decision. Revisit before the first paying firm
> whose contract assumes managed-database recovery guarantees.

## 2. Explicit MVP Prohibitions (`constitution.md:655`)

Current: `❌ Kubernetes — ECS Fargate is used instead.`

Proposed: `❌ Kubernetes, ECS — a single Dokploy host on EC2 is used instead for the MVP.`

## 3. Security Constraints › Data Residency (`constitution.md:424-453`)

**Close the `[PENDING]` on the AWS account blockage** (`constitution.md:439`). Proposed text:

> **Closed 2026-10-26: the blockage was not account-wide.** As of 2026-10-09 the account serves S3
> (CI's test bucket) and an EC2 host running Dokploy. The identity decision of v1.5.0 stands, as that
> section anticipated it would either way.

Then **one** of:

**3a — if the EC2 host is in `mx-central-1`.** No other change to the section: the region decision
holds, and the list of services verified there gains EC2.

**3b — if the EC2 host is in `<region>`, outside Mexico.** Add:

> **Temporary residency exception, `<date>` to `<end date>`.** The MVP environment runs in
> `<region>`, outside Mexico, because `<reason>`. During this window case files, documents, identity
> records and the audit log of every firm on that environment reside in `<region>`, and their
> backups with them. Consequences: (1) no firm's production data goes in until each firm's privacy
> notice declares the transfer under LFPDPPP; (2) no commercial material may claim residency in
> Mexico for this environment; (3) the window ends with a migration to `mx-central-1`, or with a
> further amendment — it does not lapse silently. **Owner:** CC technical lead.

## 4. Security Constraints › Infrastructure and backups (near `constitution.md:474-483`)

The existing rule **"Backups reside in the same jurisdiction as the primary data"** is unchanged and
now binds: the backup bucket must be in the same jurisdiction as the EC2 host. Add after it:

> A backup counts only if it restores. Database backups are taken with grants and owners (the
> isolation of Principle II lives in them), uploaded only once complete, and a backup format is
> trusted only after a restore of it has passed the slice-024 check
> (`deploy/scripts/restore-check.sh`). Dokploy's built-in PostgreSQL backup omits grants and owners
> and does not satisfy this rule.

## 5. Dependencies and Infrastructure (`constitution.md:481-483`) — two rules met only in part

**"Infrastructure declared as code. No manual changes in production."** The images, the deploy
workflow, the Compose file, the backup script, the KMS key, the backup bucket and IAM policies are
code (`.github/workflows/`, `deploy/`, `infra/`). Dokploy's own configuration — which services
exist, their environment, domains, the registry credential, the schedule — lives in its UI.
Proposed: keep the rule and add Recognised Technical Debt:

> **12. Dokploy configuration is a runbook, not code.** `specs/024-deployment-pipeline/quickstart.md`
> is its declared form; drift between it and the UI is not detected. Remedy: Dokploy's API or an
> export checked into `deploy/`, when a second environment makes drift likely. Review trigger: the
> first staging environment.

**"No long-lived credentials in CI; short-lived roles only."** CI currently holds two: the S3 test
bucket's access key pair (repository secrets, since 2026-10-09) and the Dokploy webhook URL, which
is a bearer credential. Proposed: keep the rule and add:

> **13. Two long-lived credentials in CI.** The S3 test key pair is replaced by GitHub OIDC
> federation to a role scoped to the test bucket (the application reads `OBJECT_STORE_*` keys
> explicitly, so this needs a small change to how CI hands credentials to it). The Dokploy webhook
> has no short-lived form; it is restricted to `main`'s deploy job, rotated on any suspected
> exposure, and its rotation date is recorded in `quickstart.md`.

## 6. Secrets

v1.5.0's Data Residency text names Secrets Manager among the infrastructure in use. For the MVP,
runtime secrets live in Dokploy's encrypted environment store and build-time ones in GitHub Actions
secrets (spec 024, Bella Baxter out of scope). Proposed wording: "Secrets live in a managed secret
store — today Dokploy's environment store; never in the repository, never in logs."

## 7. Governance

"Two remain: PAC selection, and the scope of the AWS account blockage" → **"One remains: PAC
selection."**

## 8. Amendment History entry (to add)

> **1.6.0** — **Deployment target set: Dokploy on EC2 with containerised PostgreSQL**, replacing ECS
> Fargate + RDS for the MVP (slice 024, D1/D2), with what is given up named. **`[PENDING]` on the AWS
> account blockage closed**: not account-wide. Data Residency: `<3a: unchanged>` / `<3b: dated
> exception for <region>>`. Backups must restore: grants and owners kept, verified by restore.
> Technical Debt 12 (Dokploy configuration as a runbook) and 13 (two long-lived CI credentials).

## Consequences (for the amendment PR's own table)

| Artifact | Stale after 1.6.0 | Blocks? |
|---|---|---|
| `infra/README.md` | Still says region and Cognito "decided in v1.4.0" and lists RDS | No — text only |
| `infra/main.tf` | Header still calls the region a constitution `[PENDING]` | No — its variable has no default either way |
| `specs/registro-specs-mvp.md` | Deployment row | No |
| Privacy notice | Only under 3b: must declare the transfer before any firm's data goes in | **Yes, under 3b**, for onboarding a real firm |
