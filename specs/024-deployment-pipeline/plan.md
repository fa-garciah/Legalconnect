# Implementation Plan: Automated Deployment Pipeline from Main

**Branch**: `024-deployment-pipeline` | **Date**: 2026-10-26 | **Spec**: [spec.md](./spec.md) | **PR**: [fa-garciah/Legalconnect#16](https://github.com/fa-garciah/Legalconnect/pull/16)

> **Authorship.** Written 2026-10-26 by Claude directly: the Antigravity draft produced nothing (its
> headless run was refused a command permission it could not prompt for). Every `path:line` below was
> read at `f14e982`. Not ratified: D5–D8 and the new D9–D12 await the technical lead (Francisco).

## Summary

Half of this slice is already built and on PR 16: the platform surface closed in the guard, both
production images, `deploy.yml` (CI green on `main` → GHCR → Dokploy webhook → smoke), the Dokploy
compose with a one-shot `migrate` ahead of the API, and `GET /health`. The compose ran end to end
against an empty PostgreSQL 16 (49 migrations, `/health` ok, platform surface 404 from outside,
frontend 200, no owner credentials in the API's environment).

What remains is in three kinds:

1. **Things only the technical lead can do** — repository variables and secrets, the four open
   questions, ratifying decisions, the constitution amendment, and the Dokploy/AWS setup.
2. **Four gaps this plan found by reading the built code against the spec** (§ Findings) — the
   deploy workflow's health wait passes against the *old* release, a KMS misconfiguration is invisible
   to `/health`, compose redeploys are not zero-downtime, and a single-database `pg_dump` does not
   restore the roles the spec says it restores.
3. **Unbuilt work** — backups and the restore runbook (US4), the Traefik refusal of `/internal/*`,
   Dockerfile linting (SC-010), and acceptance on the real environment.

**No new package dependency. No new migration.**

## Technical Context

| | |
|---|---|
| Images | `ghcr.io/fa-garciah/legalconnect-backend` (API + one-shot migration, `backend/Dockerfile:1-5`), `ghcr.io/fa-garciah/legalconnect-frontend` (Next standalone, `frontend/Dockerfile`). Both `node:22-bookworm-slim`, `USER node` |
| Tags | `sha-<commit CI tested>` and `main` (`deploy.yml:46-48,68-70`). The compose picks one through `IMAGE_TAG` (`docker-compose.yml:14,27,70`), defaulting to `main` — this is also the rollback lever |
| Trigger | `workflow_run` on CI completed, `main`, push only, success only (`deploy.yml:5-19`); `concurrency: deploy-production`, not cancelling (`deploy.yml:13-15`) |
| Host | Dokploy on one AWS EC2 instance — region and account **unknown** (spec open questions 1–2) |
| Proxy | Traefik, owned by Dokploy; domains set in Dokploy's UI. The compose carries no Traefik labels today |
| Database | PostgreSQL 16 as a separate Dokploy *Database* service on `dokploy-network` (`docker-compose.yml:5`), not part of the compose |
| Object storage | AWS S3 (D4). CI's test bucket now comes from repository variables (`ci.yml:59-63`) |
| Keys | KMS for TOTP envelopes; `AUTH_KEY_PROVIDER: kms` is fixed in the compose (`docker-compose.yml:49`) |
| New dependencies | **None** in either package manifest |
| New migration | **None** |

## Constitution Check

| Principle / rule | Status |
|---|---|
| Stack — `AWS mx-central-1 — ECS Fargate + RDS PostgreSQL + …` (`constitution.md:520`) | **Violated by D1/D2.** Needs the amendment drafted in Phase B. Gate on "done" |
| MVP prohibitions — `❌ Kubernetes — ECS Fargate is used instead.` (`constitution.md:655`) | **Stale under D1.** Same amendment |
| Data Residency — region `mx-central-1` (`constitution.md:424-425`), `[PENDING]` account blockage (`constitution.md:439`) | **Open.** S3 test bucket is `eu-central-1`; EC2 region unknown. If it is not `mx-central-1`, the amendment must carry an explicit, dated waiver. Gate on "done" |
| "Infrastructure declared as code. No manual changes in production." (`constitution.md:483`) | Met for images, workflow and compose. **Not met** for Dokploy's own configuration (domains, env, registry credential, backup schedule) which lives in its UI — Phase E writes it down as a runbook; recorded as a known deviation, not hidden |
| II — tenant isolation / least privilege | Met: owner connection and role passwords exist only in `migrate` (`docker-compose.yml:18-23`); the API gets `lc_app`, `lc_platform`, `lc_auth` URLs only (`docker-compose.yml:39-41`) |
| IV — deny by default | Met: platform surface admits only a loopback peer (`session.guard.ts:123,168`), 404 otherwise. `/health` sits beside the router so it adds no capability exception (`health.ts:5-10`) |
| V — auditable | Each running image is `sha-<commit>` that passed CI (`deploy.yml:25-30`). Dokploy's deploy log is the record of *when*; nothing in-app records deployments, by design |
| VI — compliance | Secrets in Dokploy's env store and GitHub secrets, none in the repo. Backups (Phase D) must be encrypted at rest — D10 |
| Constitution version | 1.5.0 (`constitution.md:950`) → 1.6.0 with the amendment |

## Requirement status

| Req | Status | Where / what is missing |
|---|---|---|
| FR-001 | **Built** (guard); proxy layer remaining | `session.guard.ts:108-123,168`; pinned by `tests/unit/platform-surface-loopback.test.ts`. Traefik rule: Phase C |
| FR-002 | **Built** | `deploy.yml:96-106` — accepts only 403/404, sends a forged `X-Forwarded-For` |
| FR-003 | Remaining | Domains + Let's Encrypt in Dokploy. Blocked on open question 3 |
| FR-004 | Remaining | `CORS_ALLOWED_ORIGINS` wired (`docker-compose.yml:42`); value blocked on domains |
| FR-005 | **Built** | `AUTH_KEY_PROVIDER: kms` fixed (`docker-compose.yml:49`); `assertKeyProviderIsSafe` (`deployment-assertions.ts:59`) |
| FR-006 | Remaining | KMS key + IAM policy. Blocked on open question 2. See Finding 2 |
| FR-007 | **Built** | `depends_on … service_completed_successfully` (`docker-compose.yml:30-32`). Failure path not yet exercised — Phase F |
| FR-008 | **Built** | `docker-compose.yml:18-23` vs `:33-60` |
| FR-009 | **Built** (wiring) | `docker-compose.yml:43-46`; values in Dokploy |
| FR-010 | **Built** | `deploy.yml:41-72` |
| FR-011 | **Built**, inactive | `deploy.yml:82-84` runs only once secret `DOKPLOY_WEBHOOK_URL` exists |
| FR-012 | Remaining | Dokploy Database service + volume. Phase E |
| FR-013 | Remaining | Phase D |
| FR-014 | **Built** | `frontend/Dockerfile`, build arg from repository variable (`deploy.yml:54-67`) |
| FR-015 | **Built** | `USER node` in both Dockerfiles |
| FR-016 | **Built** | `health.ts`, `main.ts:104-105`, `tests/unit/health-route.test.ts`. See Finding 1 |
| FR-017 | **Not met by the current shape** | Finding 3 / D11 |
| FR-018 | Partly | `IMAGE_TAG` makes rollback a one-variable change; not yet exercised — Phase F |
| SC-001 | Remaining | Phase F, after Finding 1 is fixed (otherwise unmeasurable) |
| SC-002 | **Built** | `deploy.yml:19`; demonstrated on a red run in Phase F |
| SC-003 | **Built** | Unit test + `deploy.yml:96-106` |
| SC-004, SC-006, SC-007, SC-008 | Remaining | Phase F on the real environment |
| SC-005 | **Built** (ordering) | Same as FR-007 |
| SC-009 | Remaining | Phase D. See Finding 4 |
| SC-010 | Partly | Non-root and secret-free hold; **no Dockerfile lint runs anywhere** — Phase C |

## Findings (the built code read against the spec)

1. **The post-deploy health wait proves nothing about the new release.** `deploy.yml:86-94` polls
   `$API/health` for `"ok"`, but the old containers answer `"ok"` too, and `/health` deliberately
   carries no version (`health.ts:12`). The step passes the instant it starts. US1's independent test
   asks for `/health` to report the new SHA. → **D9**: the backend image takes a `BUILD_SHA` build arg;
   `/health` returns `{"status":"ok","version":"<sha>"}` (a commit SHA is public in the repository and
   says nothing about any firm, so FR-016's "disclose nothing about tenants" holds); the workflow waits
   for `version == SHA`.
2. **A KMS misconfiguration is invisible to `/health`.** The spec's KMS edge case says the health check
   must fail. It cannot: the boot assertion checks only that the provider is `kms`
   (`deployment-assertions.ts:59`), and `/health` probes only the database, on purpose
   (`health.ts:13-15`). A missing IAM permission would deploy green and break every MFA enrolment.
   → **D12**: at boot, with `AUTH_KEY_PROVIDER=kms`, encrypt and decrypt one canary through the key
   provider; failure throws before `listen()`, so the container never becomes healthy and the previous
   one keeps serving. Fixes the spec's edge case without putting KMS latency on every probe.
3. **Compose redeploys are not zero-downtime (FR-017).** Dokploy redeploys a Compose service with
   `docker compose up -d`: the old `backend` is stopped, then the new one starts and must pass its
   health check, so there is a gap of roughly `start_period` + first probe. Swarm "stack" mode would give
   `start-first` rolling updates but ignores `depends_on`, which is what orders `migrate` before the
   API. → **D11**, for the technical lead: (a) accept a short gap for the MVP and amend FR-017's
   wording, or (b) split into a Dokploy *Application* per service (Swarm, rolling) with `migrate` run as
   a pre-deploy step. This plan proposes (a): one tenant in demo, and (b) moves the migration ordering
   out of the file that currently guarantees it.
4. **`pg_dump` of one database does not restore the roles.** `lc_app`, `lc_platform`, `lc_retention`,
   `lc_auth`, `lc_audit_writer` and `lc_identity_writer` are cluster-level objects created by migrations
   (`drizzle/0000_roles.sql:15-43`, `0015_accept_invitation_fn.sql:15`, `0030_lc_auth_role.sql:38`). A
   database dump carries the `GRANT`s to them but not the `CREATE ROLE`s, so a restore into a blank
   cluster fails on the first grant — and US4 scenario 2 says the roles come back. → The restore runbook
   creates the roles first (by running those three migration files' role blocks, or from a
   `pg_dumpall --globals-only` taken with each backup, minus passwords), then restores, then runs
   `migrate` once to set passwords from the environment (`migrate.ts`'s `ROLE_PASSWORD_ENV`).

**Spec corrections to make alongside** (wording only): US1 scenario 1 names three images and a
`latest` tag — it is two images (D5) and `main` (FR-010); the approval checklist still calls D6
"Traefik perimeter protection"; the inventory's `NEXTAUTH_URL` is supplied as `APP_PUBLIC_URL`, which the
compose maps to both `AUTH_URL` and `NEXTAUTH_URL` (`docker-compose.yml:78-82`).

## Work remaining, by phase

### Phase A — Unblock CI on `main` (technical lead)

- Repository **variables** `OBJECT_STORE_REGION`, `OBJECT_STORE_TEST_BUCKET`, `NEXT_PUBLIC_API_BASE_URL`;
  **secrets** `OBJECT_STORE_ACCESS_KEY_ID`, `OBJECT_STORE_SECRET_ACCESS_KEY`. Today the repository has
  none (checked 2026-10-26), so PR 16's `quality` job will fail on the S3 suites.
- Merge PR 16 once green. `deploy.yml` only fires from the default branch, so nothing publishes before.
- Make the two GHCR packages' visibility explicit (private, read by Dokploy with a PAT).

### Phase B — Decisions and governance

- Answer open questions 1–4 in the spec (region, account, domains, staging).
- Ratify D5–D8; decide D9–D12 (this plan).
- Write the constitution amendment (Stack, prohibitions, Data Residency + waiver if needed), bump to
  1.6.0, and the spec corrections above. Drafting suits Antigravity once its permissions are set up.

### Phase C — Code and configuration in the repository (TDD where there is code)

- **D9** — `BUILD_SHA` build arg in `backend/Dockerfile`, passed by `deploy.yml`; `/health` returns it;
  `health-route.test.ts` asserts the body shape and still that it never carries anything else; the
  wait step compares versions.
- **D12** — boot-time KMS canary beside `assertKeyProviderIsSafe`, unit-tested with a failing provider.
- **Traefik second layer** — labels on `backend` in the compose: a router for
  ``Host(api) && PathPrefix(`/internal`)`` with higher priority than Dokploy's, through an
  `ipAllowList` middleware of `127.0.0.1/32`, which answers 403 to everyone outside. The smoke step
  already accepts 403 (`deploy.yml:104-106`). Router/host names must match what Dokploy generates;
  verified in Phase F, not assumed.
- **SC-010** — a `hadolint` step over both Dockerfiles in `ci.yml` (a pinned action, not a package
  dependency), failing on warnings.

### Phase D — Backups and restore (US4)

- **D10 (proposed)** — use Dokploy's built-in scheduled backups for its Database service: daily
  `pg_dump`, gzip, timestamped, to an S3 destination; encryption at rest by the bucket's default
  SSE-KMS. No backup code of our own to maintain. Bucket: dedicated, versioned, lifecycle-expired,
  not the documents bucket.
- `deploy/runbooks/restore.md` — blank PostgreSQL 16 → roles (Finding 4) → `gunzip | psql` →
  `migrate` for passwords → `npm run verify:role` and `npm run test:rls` against it
  (`backend/package.json:28-29`).
- `deploy/scripts/restore-check.sh` — the same, scripted against a throwaway container, so SC-009 is
  a command rather than a reading of the runbook.

### Phase E — Dokploy environment (runbook: `quickstart.md`)

Per-container environment from the spec's inventory; the GHCR pull credential (PAT, `read:packages`)
and its rotation; KMS key, IAM policy (`kms:Encrypt`, `kms:Decrypt` on that key only); Database
service with its volume; domains and TLS; backup schedule; `IMAGE_TAG` left at `main`. The runbook is
the declared form of the configuration that Dokploy's UI holds (see the constitution check).

### Phase F — Acceptance on the real environment (`quickstart-results.md`, as 022/023)

SC-001 (merge → new `version` live < 10 min), SC-002 (a deliberately red run deploys nothing), SC-003
(outside `POST /internal/platform/tenants` → 403/404), SC-004 (boot logs), SC-006 (`docker inspect` of
the API has no `DATABASE_URL_MIGRATION`), a failing migration leaves the old API serving, SC-007
(sign-in, MFA, documents — first firm and admin provisioned through the platform surface from inside
the container), SC-008 (`IMAGE_TAG=sha-<previous>` → redeploy < 3 min), SC-009 (Phase D's script).

## Project Structure

```text
.github/workflows/
├── ci.yml                         # changed: S3 from repo vars (done); + hadolint (Phase C)
└── deploy.yml                     # NEW (done); + BUILD_SHA, version wait (Phase C)
backend/
├── Dockerfile                     # NEW (done); + BUILD_SHA arg (Phase C)
├── package.json                   # changed: start → dist/src/main.js (done)
├── src/main.ts                    # changed: registerHealthRoute (done); + KMS canary (Phase C)
├── src/common/http/health.ts      # NEW (done); + version (Phase C)
├── src/common/auth/session.guard.ts           # changed: loopback-only platform surface (done)
├── src/common/auth/deployment-assertions.ts   # + KMS canary (Phase C)
└── tests/unit/{platform-surface-loopback,health-route}.test.ts   # NEW (done)
frontend/
├── Dockerfile, .dockerignore      # NEW (done)
└── next.config.ts                 # changed: output 'standalone' (done)
deploy/
├── dokploy/docker-compose.yml     # NEW (done); + Traefik /internal labels (Phase C)
├── runbooks/restore.md            # Phase D
└── scripts/restore-check.sh       # Phase D
specs/024-deployment-pipeline/
├── spec.md, plan.md
├── quickstart.md                  # Phase E
└── quickstart-results.md          # Phase F
.specify/memory/constitution.md    # amendment 1.6.0 (Phase B)
```

## Risks

- **Everything in Phase F waits on Phase A/B.** No domains, no region, no secrets → no deployment to
  accept. The repository-side work (Phase C, D's scripts) does not wait and should go first.
- **Data residency.** If the EC2 is outside `mx-central-1`, privileged client data lives abroad from
  the first real upload. The amendment must say so plainly, with an end date, before real firms use it.
- **Single host.** One EC2, one Docker daemon, one disk: the backups in Phase D are the only recovery
  path. An unverified backup is no backup — SC-009 runs before any real firm's data goes in.
- **Dokploy's UI is configuration outside git.** Mitigated only by the Phase E runbook; drift between
  the runbook and the UI is not detected automatically.
- **GHCR PAT expiry** silently stops pulls; the next deploy fails, the running one keeps serving.
  Rotation date goes in the runbook.
