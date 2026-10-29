# Feature Specification: Automated Deployment Pipeline from Main

**Feature Branch**: `024-deployment-pipeline`  
**Created**: 2026-10-09  
**Status**: Draft — decisions pending ratification by the CC technical lead (Francisco)  
**Input**: User story `US23-EP00-FND-DeployFromMain` (PO: *"every change merged to main that passes CI reaches a running environment without anyone building or copying anything by hand"*). On 2026-10-09, code merged to `main` sits in GitHub with no deployment target: CI runs the test suites and stops. Getting code onto a server requires manual SSH, manual builds, and manually typing environment variables.

> **Citation convention.** Requirements of previous slices are cited as `001/FR-0NN`, `002/FR-0NN`, `003/FR-0NN`, `007/FR-0NN`, `018/FR-0NN`, `021/FR-0NN`, and `022/FR-0NN`. Bare `FR-0NN` refers to this document. Code is cited as `path:line` and was read at the commit this branch starts from.
>
> **Authorship & Governance.** Drafted on 2026-10-09 by Antigravity, then reviewed and corrected by Claude against the code (the platform-surface fix, the image layout, the variable inventory and the GHCR owner were wrong or out of date in the draft). Four architectural decisions were taken by the technical lead (Francisco) on 2026-10-09 (D1–D4); the rest are proposed. Nothing in this document is ratified until approved by Francisco.
>
> **Corrected 2026-10-26 by Claude (task T014)** against what was built and tested on PR 16: two images rather than three, the `main` tag, the inventory, the KMS edge case, the backup mechanism, and decisions D9–D14 added (see [plan.md](./plan.md) § Findings) — proposed, except D11 and D13, which are choices left open. FR-017 is left as written: its fate is D11, which is the technical lead's call.

---

## Why this slice matters

**Software that only runs on a developer's laptop or in a headless CI runner is not a product; it is a repository.** Today, that is the exact state of LegalConnect MX:

- `.github/workflows/ci.yml:1-231` runs four quality gates on every pull request and every push to `main` (`quality`, `frontend`, `secret-scan`, `dependency-scan`). But when those gates turn green, the pipeline terminates. No container image is published, no server is notified, and no running process updates.
- Getting any change onto a host currently requires manual intervention: someone must SSH into a machine, pull git changes, assemble `.env` files, build binaries or Docker images locally, run database migrations, and restart processes. 
- Manual deployment violates the project's governing tenets:
  - **Dependencies and Infrastructure** (`constitution.md:483`): *"Infrastructure declared as code. No manual changes in production."*
  - **Principle V (Auditable by Construction)** (`constitution.md:163-177`): Deployments performed by hand leave no verifiable audit trail linking the running binary to a specific git commit SHA that satisfied CI.
  - **Principle VI (Compliance-by-Design)** (`constitution.md:183-186`): Hand-crafted environment files on shared host filesystems risk secret sprawl and unversioned credential leaks.
- Crucially, without automated deployment, reviewable increments cannot be verified by stakeholders or product owners. Slices `001` through `023` have delivered foundational multi-tenancy, authentication, case management, document storage, and seed fixtures, but none can be demonstrated outside a local workstation.

This slice delivers the continuous delivery backbone of `EP00` (Foundation): an automated, auditable, fail-safe pipeline that takes every commit merged to `main` through CI, builds immutable container images, runs isolated database migrations, and deploys the stack to a running host via Dokploy with zero manual steps.

---

## What the code actually does, checked against the code rather than its comments

`backend/src/main.ts`, `backend/src/common/auth/session.guard.ts`, `backend/src/common/auth/deployment-assertions.ts`, `backend/src/common/auth/key-provider.ts`, `backend/drizzle/migrate.ts`, `frontend/src/app/(auth)/ingresar/SignInForm.tsx`, `frontend/src/app/(auth)/enrolar/EnrollmentFlow.tsx`, `frontend/src/app/(auth)/recuperar/RecoveryForm.tsx`, `frontend/src/app/api/lc/[...path]/route.ts`, `backend/.env.example`, `frontend/.env.example`, and `.github/workflows/ci.yml` were read before this spec was written. Six critical findings constrain how the deployment pipeline must be constructed.

| # | What a reader would assume | What the code actually does | Consequence for this slice |
|---|---|---|---|
| 1 | **BLOCKER (security)**: The backend API can safely listen on `0.0.0.0` inside a Docker container | `session.guard.ts:89-107` explicitly exempts `PLATFORM_SURFACE` (`/internal/platform/*`) from authentication. The *only* protection is `main.ts:109-118` binding to `PLATFORM_BIND_HOST=127.0.0.1`. A Docker container listening on `0.0.0.0` exposes unauthenticated tenant creation, deactivation, plan changes, and admin seeding to the network | **Critical Blocker, confirmed by running the image**: with `PLATFORM_BIND_HOST=0.0.0.0`, `GET /internal/platform/tenants/:id` returned a firm's record to a caller outside the container with no session. Fixed in this slice in the guard itself: the platform surface admits only a TCP peer on the same machine and answers anyone else with the 404 an unknown route gets (`session.guard.ts`, `isLoopbackPeer`); Traefik refusing `/internal/*` is kept as a second layer → **FR-001**, **FR-002**, **Decision 6** |
| 2 | The frontend communicates with the backend exclusively via server-side API routes or internal networking | `SignInForm.tsx:24,42`, `EnrollmentFlow.tsx:29,58`, and `RecoveryForm.tsx:24,41` call `${process.env.NEXT_PUBLIC_API_BASE_URL}` **directly from the browser**. `route.ts:1-36` proxies authenticated calls only after a session exists | The backend must expose a public HTTPS origin; `CORS_ALLOWED_ORIGINS` (`main.ts:75-95`) must be configured with the public frontend origin; and `NEXT_PUBLIC_API_BASE_URL` must be supplied at frontend image **build time** (or all auth forms refactored behind `/api/lc`) → **FR-003**, **FR-004**, **Decision 7** |
| 3 | The backend can boot in production with default local encryption keys | `deployment-assertions.ts:32-64` executes at boot (`main.ts:37`) and throws `InsecureKeyProviderInDeployment` if `AUTH_KEY_PROVIDER=local` in `NODE_ENV=production` or `staging`. `key-provider.ts:187-204` requires `AUTH_KMS_KEY_ID` and AWS credentials | The production Dokploy environment **must** configure `AUTH_KEY_PROVIDER=kms`, supply `AUTH_KMS_KEY_ID`, and have IAM permissions for `kms:Encrypt` and `kms:Decrypt`. Booting without KMS fails immediately with no override flag → **FR-005**, **FR-006** |
| 4 | The running backend process applies its own database migrations at startup | `migrate.ts:19-29, 34-40` connects via `DATABASE_URL_MIGRATION` (table owner) and executes `ALTER ROLE ... PASSWORD` using four privileged password variables (`LC_APP_PASSWORD`, `LC_PLATFORM_PASSWORD`, etc.). Meanwhile, `backend/.env.example:6-14` and Constitution Principle II require that the runtime application (`lc_app`) owns nothing and holds no migration privileges | Migrations **cannot** run inside the web backend container. Migrations must execute as a separate, one-shot ephemeral container before the web container starts. Only the one-shot container receives `DATABASE_URL_MIGRATION` and role passwords → **FR-007**, **FR-008**, **Decision 5** |
| 5 | The AWS account blockage is unconfirmed, and object storage uses a local mock | `constitution.md:439-453` records `[PENDING] — the scope of the AWS account blockage is not confirmed`. However, as of 2026-10-09, an active AWS account is in use: `.github/workflows/ci.yml:58-61` and `backend/.env.example:57-60` run live integration tests against an S3 bucket (`c-market-storage` in `eu-central-1`) | The constitutional `[PENDING]` on account blockage must be resolved. S3 in AWS is usable now. The deployment pipeline uses AWS S3 for object storage and database backups, with credentials supplied securely → **FR-009**, **Constitution Amendments** |
| 6 | Application configuration is homogeneous across services | `backend/.env.example` defines 24 variables across 5 distinct database roles, KMS, S3, CORS, and auth locks. `frontend/.env.example` defines NextAuth cookies and public API URLs. None are shared identically | Every container (backend, migrate, frontend) requires an explicit, audited environment specification. Secret management evaluation with "Bella Baxter" is ongoing and out of scope; Dokploy and GitHub Actions secrets are used today → **FR-010**, **FR-011**, **Secret Inventory** |

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Continuous Deployment on Green Merge to Main (Priority: P1) 🎯 MVP

A developer opens a pull request against `main`. Peer review is approved. All CI quality gates pass. When the PR is merged to `main`, GitHub Actions automatically builds container images, pushes them to GitHub Container Registry (GHCR), and triggers Dokploy via webhook. Dokploy runs migrations and updates the running containers without human intervention.

**Catalog**: `US23-EP00-FND-DeployFromMain` (FND) — PO quote: *"every change merged to main that passes CI reaches a running environment without anyone building or copying anything by hand"*.

**Why this priority**: Without this capability, continuous delivery does not exist. Every deployment is a manual, bespoke chore prone to configuration drift and operational failure.

**Independent Test**: Merge a commit to `main` with a visible version/build tag. Observe GitHub Actions workflow execution. Verify that GHCR receives new tagged images, Dokploy webhook triggers, migrations execute, containers restart, and `GET /health` (or frontend homepage) reports the new commit SHA within 10 minutes, with zero terminal commands typed on the server.

**Acceptance Scenarios**:

1. **Given** a commit merged to `main`, **When** the CI workflow completes successfully, **Then** a release job builds the multi-stage `backend` image (which also runs the one-shot migration, Decision 5) and the `frontend` image, each tagged with both `sha-<commit>` and `main`.
2. **Given** newly published images in GHCR, **When** GitHub Actions issues an authenticated POST request to Dokploy's deployment webhook, **Then** Dokploy accepts the trigger and initiates a service update.
3. **Given** a service update in Dokploy, **When** deployment starts, **Then** the one-shot `migrate` container runs first to completion against the database before any new application container receives traffic.
4. **Given** successful migration, **When** new `backend` and `frontend` containers pass health checks, **Then** Traefik routes traffic to them and terminates the old containers.

---

### User Story 2 — Defective or Failing Code Never Deploys (Priority: P1) 🎯 MVP

A commit is pushed or merged to `main` where a unit test fails, a linter complains, a type error exists, or secret scanning detects a committed credential. The deployment pipeline halts immediately; no image is pushed to GHCR, Dokploy is never notified, and the running environment remains entirely unaffected.

**Why this priority**: Constitution Merge Rules (`constitution.md:761`) mandate: *"Green CI mandatory. Never merge on red."* The deployment pipeline must strictly enforce this: broken software must never reach a live environment.

**Independent Test**: Simulate a failing quality step in CI on a branch targeting `main`. Verify that the workflow terminates in error, the GHCR push step is skipped, the Dokploy webhook step is not executed, and Dokploy audit logs show no deployment trigger.

**Acceptance Scenarios**:

1. **Given** a workflow run on `main` where any step in `quality`, `frontend`, `secret-scan`, or `dependency-scan` fails, **When** CI finishes, **Then** the deploy/publish job is skipped.
2. **Given** a skipped deploy job, **Then** no webhook is dispatched to Dokploy.
3. **Given** no webhook dispatched, **Then** the running environment continues operating on its prior stable release without container restarts or state mutations.

---

### User Story 3 — Zero-Downtime Rollback to Previous Release (Priority: P2)

A release is deployed that passes automated tests but exhibits an unexpected runtime defect. A platform operator opens the Dokploy dashboard and triggers a rollback to the previous known-good image tag (`sha-<previous_commit>`). Dokploy updates the containers to the previous image within three minutes.

**Why this priority**: Rapid recovery from production incidents is essential for business continuity and preserving service availability.

**Independent Test**: In Dokploy, select the previous image tag for `backend` and `frontend` and trigger deploy. Verify that Traefik seamlessly shifts incoming requests to the restored image versions without database corruption.

**Acceptance Scenarios**:

1. **Given** an active deployment of `sha-B`, **When** the operator re-deploys `sha-A` via Dokploy, **Then** Dokploy pulls the immutable image `ghcr.io/...:sha-A` from GHCR.
2. **Given** the restored container passes health checks, **Then** Traefik switches traffic immediately.
3. **Given** database schema backward compatibility (expanded-contract discipline), **Then** the rollback container operates correctly without requiring schema rollback.

---

### User Story 4 — Automated PostgreSQL Backups and Verified Restoration (Priority: P2)

PostgreSQL runs as a container managed by Dokploy on the EC2 host (replacing managed AWS RDS per Decision D2). Daily automated backups — taken with grants and owners, which is where the isolation lives — are compressed, encrypted, and uploaded to AWS S3. A documented and tested restoration script allows recovering the database from an S3 backup snapshot onto a test or recovery instance.

**Why this priority**: Moving from AWS RDS to self-hosted PostgreSQL transfers the entire burden of data safety, disaster recovery, and point-in-time recovery onto CC. Unbacked data under attorney-client privilege is an unacceptable existential risk.

**Independent Test**: Run `deploy/scripts/backup.sh` (Decision 10). Verify that a `legalconnect-<timestamp>.dump.gz` appears in the designated AWS S3 backup bucket, encrypted with SSE-KMS and carrying its `sha256`. Download it to a clean environment and run `deploy/scripts/restore-check.sh` on it: it restores, matches a fresh migration's grants, owners, policies and roles, and passes `npm run verify:role` and `npm run test:rls`.

**Acceptance Scenarios**:

1. **Given** the containerized PostgreSQL instance, **When** the scheduled backup timer triggers, **Then** a full database dump (`pg_dump -Fc` as the schema owner, grants and owners kept) is executed, timestamped, compressed, and uploaded to the configured S3 backup bucket — and a dump that fails partway uploads nothing.
2. **Given** an S3 backup artifact, **When** restored into an empty PostgreSQL database using the restore runbook, **Then** all schemas, tables, RLS policies and grants are completely restored. The roles (`lc_app`, `lc_auth`, etc.) belong to the cluster, not the database, so no database dump carries them: the runbook creates them first from the migrations, and the migration job then sets their passwords.
3. **Given** restored data, **When** `npm run verify:role` runs against it, **Then** all security constraints (non-superuser, no `BYPASSRLS`) pass.

---

### User Story 5 — Platform Surface Network Isolation Enforcement (Priority: P1) 🎯 Security

An external attacker or scanner sends an HTTP request to `https://<api-domain>/internal/platform/tenants` to provision a tenant or change plan limits. The backend container listens on `0.0.0.0`, so the loopback binding no longer protects anything. The session guard refuses every platform-surface request whose TCP peer is not this machine, with the same 404 an unknown route produces; Traefik additionally refuses `/internal/*` at the edge.

**Why this priority**: `session.guard.ts:89-107` explicitly exempts `/internal/platform/*` from authentication. Exposing this surface over the public internet is a catastrophic security vulnerability that completely compromises tenant isolation.

**Independent Test**: From an external network, `curl -X POST https://<api-domain>/internal/platform/tenants` (and the same with a forged `X-Forwarded-For: 127.0.0.1`) answers 404. From inside the backend container (`docker exec` running a `fetch` against `http://127.0.0.1:3000/internal/platform/...`), the same surface answers. Verified locally against the built image on 2026-10-09; `tests/unit/platform-surface-loopback.test.ts` pins the guard.

**Acceptance Scenarios**:

1. **Given** a request to `/internal/*` whose TCP peer is not loopback, **When** it reaches the backend, **Then** the session guard answers 404 with the body of an unknown route, whatever `X-Forwarded-For` says.
2. **Given** the same request through the public domain, **Then** Traefik refuses it before it reaches the backend (defence in depth; the guard does not depend on it).
3. **Given** a deployment, **Then** a post-deploy smoke step asserts from outside that `POST /internal/platform/tenants` does not succeed.

---

### Edge Cases

- **One-shot migration fails**: If `migrate.ts` fails (e.g., syntax error in migration script, lock contention), the container exits with non-zero status. Dokploy MUST NOT proceed with updating the `backend` or `frontend` containers; the deployment is marked failed, and running containers remain untouched.
- **Postgres not yet accepting connections**: the migration job MUST start only once PostgreSQL is healthy (`depends_on: condition: service_healthy` or Dokploy's equivalent), and a failed connection MUST fail the job rather than be retried indefinitely.
- **KMS outage or misconfigured IAM credentials**: If the EC2 instance lacks `kms:Decrypt` permission or `AUTH_KMS_KEY_ID` is invalid, nothing at boot used to notice — the first TOTP operation would fail, and `/health` (which probes only the database) would stay green. Under Decision 12 the API wraps and unwraps a canary through the key before listening and refuses to start if that fails, so the new container never becomes healthy and the previous one keeps serving. A KMS outage *after* boot still surfaces only on MFA operations; detecting it is a monitoring concern, not this slice's.
- **CORS preflight rejection on frontend domain change**: If the frontend domain changes and `CORS_ALLOWED_ORIGINS` is not updated in Dokploy, browser requests fail with opaque errors (`main.ts:50-74`). Dokploy configuration must explicitly couple the two variables.
- **GHCR rate limits or authentication expiration**: GitHub Actions authenticates to GHCR using `GITHUB_TOKEN` with `packages: write`. Dokploy authenticates to GHCR using a long-lived GitHub Personal Access Token (PAT) with `read:packages`. Expiration of this PAT blocks Dokploy image pulling; documentation must include credential rotation procedures.
- **Concurrent webhook invocations**: If two commits are merged to `main` in quick succession, Dokploy must queue deployments serially rather than executing concurrent migrations that could cause DDL deadlocks.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The platform surface (`/internal/platform/*`) MUST answer only a TCP peer on the same machine (`127.0.0.0/8`, `::1`, IPv4-mapped loopback), read from the socket and never from a forwarding header, and MUST answer every other caller with the 404 an unknown route produces. Implemented in `session.guard.ts`; pinned by `tests/unit/platform-surface-loopback.test.ts`. The reverse proxy SHOULD additionally refuse `/internal/*`.
- **FR-002**: A post-deployment smoke step MUST assert against the public backend origin that `POST /internal/platform/tenants` does not succeed (404 or a proxy refusal).
- **FR-003**: The backend API container MUST be exposed on a public HTTPS domain with valid TLS certificates managed automatically by Traefik (Let's Encrypt).
- **FR-004**: The backend container environment MUST configure `CORS_ALLOWED_ORIGINS` matching the public HTTPS origin of the frontend container.
- **FR-005**: In production and staging deployments, the backend container MUST be configured with `AUTH_KEY_PROVIDER=kms` and a valid `AUTH_KMS_KEY_ID`. Setting `AUTH_KEY_PROVIDER=local` MUST cause startup termination via `assertKeyProviderIsSafe` (`main.ts:37`).
- **FR-006**: The AWS IAM permissions assigned to the EC2 host (via IAM Instance Profile) or container environment MUST permit `kms:Encrypt` and `kms:Decrypt` for the key specified in `AUTH_KMS_KEY_ID`.
- **FR-007**: Database migrations MUST execute as a separate, one-shot container (the backend image run with `node dist/drizzle/migrate.js`) that runs to completion before updated `backend` containers start.
- **FR-008**: Privileged database credentials (`DATABASE_URL_MIGRATION`, `LC_APP_PASSWORD`, `LC_PLATFORM_PASSWORD`, `LC_RETENTION_PASSWORD`, `LC_AUTH_PASSWORD`) MUST be injected ONLY into the `migrate` container and MUST NOT be accessible to the `backend` or `frontend` containers.
- **FR-009**: S3 object storage credentials and configuration (`OBJECT_STORE_REGION`, `OBJECT_STORE_BUCKET`, `OBJECT_STORE_ACCESS_KEY_ID`, `OBJECT_STORE_SECRET_ACCESS_KEY`) MUST be injected into the backend container, connecting to the AWS S3 bucket.
- **FR-010**: Container images MUST be built by GitHub Actions and pushed to GitHub Container Registry (`ghcr.io/fa-garciah/legalconnect-backend` and `ghcr.io/fa-garciah/legalconnect-frontend`, owner taken from the repository `fa-garciah/Legalconnect`) tagged with both `sha-<commit_sha>` and `main`.
- **FR-011**: GitHub Actions MUST trigger deployment via an authenticated POST request to Dokploy's application webhook URL only after all CI quality gates pass.
- **FR-012**: The PostgreSQL database MUST run as a container within Dokploy, storing its data on an EC2 persistent volume.
- **FR-013**: The database MUST be backed up daily to AWS S3, compressed, timestamped and encrypted with SSE-KMS, **with grants and owners included** (Decision 10: Dokploy's built-in PostgreSQL backup omits both and does not qualify). A backup that fails partway MUST leave nothing in the bucket.
- **FR-014**: The frontend container image MUST be built using a multi-stage Dockerfile that injects `NEXT_PUBLIC_API_BASE_URL` at build time to support direct browser auth calls.
- **FR-015**: Both `backend` and `frontend` Docker images MUST run as unprivileged non-root users (`node`).
- **FR-016**: The backend MUST gain a `/health` endpoint (none exists today: `GET /health` answers 404) that validates database connectivity and returns HTTP 200, used by Dokploy and Traefik for health checks. It MUST disclose nothing about tenants. Under Decision 9 it reports the commit the image was built from, so the deploy can tell the new release from the old one.
- **FR-017**: Dokploy MUST implement rolling deployment or health-checked container replacement: incoming traffic is routed to the new container only after health checks pass. *(Not met by the Compose shape as built — a redeploy stops the old API before the new one is healthy. Decision 11, pending.)*
- **FR-018**: Dokploy MUST maintain previous image tags to allow single-click rollback from the Dokploy UI.

---

### Container Secret & Runtime Variable Inventory (Finding F6)

Every runtime variable declared in `backend/.env.example` and `frontend/.env.example` is cataloged below, along with its deployment target and custodian. `DATABASE_URL_RETENTION` is deliberately absent from every container: `.env.example` states the application does not hold that connection, and nothing in `backend/src` reads it; the retention job is not part of this slice.

| Container | Variable Name | Purpose & Security Classification | Where it Lives |
|---|---|---|---|
| **`migrate`** | `DATABASE_URL_MIGRATION` | High secret. Table owner connection string (`lc_migration`). Runs DDL. | Dokploy Environment (Secret) |
| **`migrate`** | `LC_APP_PASSWORD` | Secret. Password for application role `lc_app`. | Dokploy Environment (Secret) |
| **`migrate`** | `LC_PLATFORM_PASSWORD` | Secret. Password for platform role `lc_platform`. | Dokploy Environment (Secret) |
| **`migrate`** | `LC_RETENTION_PASSWORD` | Secret. Password for retention role `lc_retention`. | Dokploy Environment (Secret) |
| **`migrate`** | `LC_AUTH_PASSWORD` | Secret. Password for auth role `lc_auth`. | Dokploy Environment (Secret) |
| **`backend`** | `DATABASE_URL_APP` | Secret. Application connection string (`lc_app`). Subject to RLS. | Dokploy Environment (Secret) |
| **`backend`** | `DATABASE_URL_AUTH` | High secret. Dedicated connection string for `lc_auth` (auth tables). | Dokploy Environment (Secret) |
| **`backend`** | `DATABASE_URL_PLATFORM` | Secret. Platform administration connection string (`lc_platform`). | Dokploy Environment (Secret) |
| **`backend`** | `PORT` | Configuration. Port NestJS listens on (e.g., `3000`). | Dokploy Environment |
| **`backend`** | `PLATFORM_BIND_HOST` | Configuration. Container bind interface (`0.0.0.0`). The platform surface is protected by the loopback-peer check (FR-001), not by this value. | Dokploy Environment |
| **`backend`** | `NODE_ENV` | Configuration. Set to `production` (triggers deployment assertions). | Dokploy Environment |
| **`backend`** | `CORS_ALLOWED_ORIGINS` | Configuration. Public HTTPS origin of the frontend. | Dokploy Environment |
| **`backend`** | `AUTH_KEY_PROVIDER` | Security configuration. Set to `kms` in production. | Dokploy Environment |
| **`backend`** | `AUTH_KMS_KEY_ID` | Configuration/Secret. AWS KMS Key ID or ARN for TOTP envelopes. | Dokploy Environment |
| **`backend`** | `AWS_REGION` | Configuration. AWS Region for KMS client (e.g., `mx-central-1` or `eu-central-1`). | Dokploy Environment |
| **`backend`** | `AWS_ACCESS_KEY_ID` | Secret. AWS IAM Access Key for KMS (if not using EC2 IAM Role). | Dokploy Environment (Secret) |
| **`backend`** | `AWS_SECRET_ACCESS_KEY` | High secret. AWS IAM Secret Key for KMS. | Dokploy Environment (Secret) |
| **`backend`** | `OBJECT_STORE_REGION` | Configuration. S3 bucket region (`eu-central-1`). | Dokploy Environment |
| **`backend`** | `OBJECT_STORE_BUCKET` | Configuration. S3 bucket name (`c-market-storage`). | Dokploy Environment |
| **`backend`** | `OBJECT_STORE_ACCESS_KEY_ID` | Secret. AWS Access Key for S3 document storage. | Dokploy Environment (Secret) |
| **`backend`** | `OBJECT_STORE_SECRET_ACCESS_KEY` | High secret. AWS Secret Key for S3 document storage. | Dokploy Environment (Secret) |
| **`backend`** | `DOCUMENT_MAX_UPLOAD_BYTES` | Configuration. Maximum upload size in bytes (`26214400`). | Dokploy Environment |
| **`backend`** | `EMAIL_PROVIDER_REGION` | Configuration. Transactional email region (`us-east-1`). | Dokploy Environment |
| **`backend`** | `EMAIL_SENDER_ADDRESS` | Configuration. Sender email (`no-reply@legalconnect.mx`). | Dokploy Environment |
| **`backend`** | `INVITATION_MAX_FAILED_ATTEMPTS`| Configuration. Threshold (`10`). | Dokploy Environment |
| **`backend`** | `INVITATION_ISSUANCE_RATE_PER_HOUR`| Configuration. Hourly cap (`200`). | Dokploy Environment |
| **`backend`** | `AUTH_LOCKOUT_THRESHOLD` | Configuration. Failed MFA threshold (`5`). | Dokploy Environment |
| **`backend`** | `AUTH_LOCKOUT_MINUTES` | Configuration. Lockout duration (`15`). | Dokploy Environment |
| **`backend`** | `AUTH_BACKUP_CODE_COUNT` | Configuration. Backup code count (`10`). | Dokploy Environment |
| **`frontend`**| `APP_PUBLIC_URL` | Configuration. Canonical public HTTPS URL of the frontend. The compose maps it to both `AUTH_URL` and `NEXTAUTH_URL` (Auth.js v5 reads the first, `.env.example` documents the second) and fixes `AUTH_TRUST_HOST=true` behind the proxy. | Dokploy Environment |
| **`frontend`**| `NEXTAUTH_SECRET` | High secret. 32-byte encryption key for session cookies; mapped to `AUTH_SECRET` too. | Dokploy Environment (Secret) |
| **`frontend`**| `NEXT_PUBLIC_API_BASE_URL` | Configuration. Public HTTPS origin of backend API. Inlined into the browser bundle **at build time**, so setting it in Dokploy has no effect. | **GitHub Actions repository variable** → build arg |
| **`frontend`**| `PORT`, `NODE_ENV` | Fixed in the image (`3000`, `production`). | `frontend/Dockerfile` |
| **compose**   | `API_HOST` | Configuration. The API's domain, bare (no scheme). Used by the Traefik labels that refuse `/internal/*` at the edge. | Dokploy Environment |
| **compose**   | `IMAGE_TAG` | Configuration. Which image tag runs: `main` normally, `sha-<commit>` to roll back (US3). | Dokploy Environment |
| **image**     | `BUILD_SHA` | Not configuration. The commit the backend image was built from, reported by `/health` (Decision 9). | `deploy.yml` build arg |
| **backup**    | `DATABASE_URL_BACKUP` | High secret. The schema owner's connection; a dump as `lc_app` could not read the grants. | Host schedule's environment (Secret) |
| **backup**    | `BACKUP_TARGET`, `BACKUP_KMS_KEY_ID` | Configuration. `s3://<bucket>/<prefix>` and the SSE-KMS key. | Host schedule's environment |
| **backup**    | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` | Secret. An identity with `s3:PutObject` on the backup bucket and `kms:GenerateDataKey` on its key — or an instance profile instead. | Host schedule's environment (Secret) |
| **CI / GHA**  | `GITHUB_TOKEN` | Automatic. Publishes to GHCR (`packages: write`); no PAT needed for the push. | Provided by Actions |
| **CI / GHA**  | `DOKPLOY_WEBHOOK_URL` | Secret. Webhook URL to trigger Dokploy deployment. Until it exists, a green `main` only publishes images. | GitHub Actions Secret |
| **Dokploy**   | GHCR pull credential | Secret. A PAT with `read:packages` only; its expiry date goes in `quickstart.md`. | Dokploy Registry settings |

> **Note on "Bella Baxter"**: A dedicated secret management integration codenamed "Bella Baxter" is currently being evaluated separately by Cosmic Chimps. It is out of scope for this slice. For slice 024, runtime secrets live in Dokploy's encrypted environment store and build secrets live in GitHub Actions Secrets.

---

### Capability Matrix *(Principle IV)*

This slice introduces no end-user product capabilities and modifies no user archetypes. It establishes infrastructure access controls and network perimeters:

| Surface / Endpoint | Public Internet | Internal Container Network | Host / Localhost |
|---|---|---|---|
| Frontend Web UI (`/`, `/ingresar`, etc.) | **Allowed** (HTTPS via Traefik) | Allowed | Allowed |
| Backend Public API (`/auth/*`, `/tenant/*`) | **Allowed** (HTTPS via Traefik) | Allowed | Allowed |
| Platform Admin (`/internal/platform/*`) | **BLOCKED** (guard 404; Traefik refusal as a second layer) | **BLOCKED** (peer is not loopback) | **Allowed** (from inside the backend container only) |
| PostgreSQL Database (`5432`) | **BLOCKED** (No public port binding)| **Allowed** (within Docker network) | **Allowed** (via local socket/bind) |
| Traefik Dashboard / Dokploy UI | Restricted (Auth / IP Allowlist) | Allowed | Allowed |

---

### Key Entities

- **Deploy workflow (`.github/workflows/deploy.yml`)**: runs only after the `CI` workflow (`ci.yml`) finishes green on a push to `main`; builds the images from the commit CI tested, pushes to GHCR, fires the Dokploy webhook, waits for `/health` to report that commit, and checks from outside that the platform surface is refused.
- **Docker Images in GHCR**:
  - `ghcr.io/fa-garciah/legalconnect-backend:<tag>`: NestJS production application; the same image runs the one-shot migration (`node dist/drizzle/migrate.js`).
  - `ghcr.io/fa-garciah/legalconnect-frontend:<tag>`: Next.js standalone production server.
- **Dokploy Project Stack**: Self-hosted PaaS project on the EC2 host containing:
  - Traefik edge reverse proxy (Dokploy's own).
  - PostgreSQL as a separate Dokploy *Database* service with a persistent volume, on `dokploy-network`.
  - A *Compose* service from `deploy/dokploy/docker-compose.yml`: the `migrate` one-shot task, then `backend`, then `frontend`.
- **Backup job**: `deploy/scripts/backup.sh`, run daily on the host; `deploy/scripts/restore-check.sh` proves any backup; `deploy/runbooks/restore.md` is the procedure.
- **S3 Backup Bucket**: AWS S3 bucket receiving encrypted daily PostgreSQL dumps.

---

## Success Criteria *(mandatory)*

- **SC-001**: A git merge to `main` that satisfies all CI checks automatically deploys to the Dokploy environment and is live within 10 minutes without manual intervention.
- **SC-002**: A git commit on `main` that fails any CI check (lint, typecheck, unit tests, isolation tests, RLS verification, secret scan, dependency audit) produces zero container builds and triggers zero deployments.
- **SC-003**: External requests to `https://<api-domain>/internal/platform/tenants` never succeed (404 from the guard, or a proxy refusal), verified by an automated smoke test and by `tests/unit/platform-surface-loopback.test.ts`.
- **SC-004**: The backend container boots successfully in production with `NODE_ENV=production` and `AUTH_KEY_PROVIDER=kms`, and logs zero assertion errors.
- **SC-005**: All database migrations run to completion before updated application containers receive web traffic.
- **SC-006**: The backend container environment contains no owner credentials (`DATABASE_URL_MIGRATION` is absent), verified by environment inspection.
- **SC-007**: A user can sign in, complete MFA challenge, view case documents, and preview uploaded files on the deployed environment.
- **SC-008**: An operator can trigger a rollback in Dokploy to a previous commit SHA, returning the service to the previous release within 3 minutes.
- **SC-009**: Scheduled automated database backups execute to AWS S3, and a test restoration into a blank database successfully passes `npm run verify:role` and `npm run test:rls`.
- **SC-010**: All committed Dockerfiles pass security linting, contain no hardcoded secrets, and run as unprivileged user `node`.

---

## Decisions

Four architectural decisions were taken by the technical lead (Francisco) on 2026-10-09 (D1–D4). Decisions D5–D8 are proposed to resolve implementation details; D9–D14 were added on 2026-10-26 from reading the built code against this spec (plan.md § Findings); D11 and D13 are choices left to the technical lead, the rest are proposed.

### Decision 1 — Dokploy on AWS EC2 replacing ECS Fargate

**Taken (by Francisco 2026-10-09)**: The application stack runs under Dokploy (self-hosted PaaS, Docker + Traefik) on an existing AWS EC2 instance, replacing "ECS Fargate" in the constitution's Technology Constraints Stack (`constitution.md:520`).  
**Why**: Avoids ECS task definition complexity, enables unified management of reverse proxy routing, environment variables, and Docker containers in a lightweight single-node PaaS, reducing operational overhead during MVP development.  
**Cost**: High-availability multi-zone orchestration provided natively by ECS Fargate is relinquished; instance health, Docker daemon uptime, and host OS patching become self-managed responsibilities.  
**`[NEEDS CLARIFICATION: EC2 region]`**: The existing EC2 instance's AWS region is **not yet known**. If the instance is in any region other than `mx-central-1`, **Constitution Principle VI and Security Constraints (Data Residency) are violated**. A specific constitutional amendment will be required if the instance cannot be located in `mx-central-1`.

### Decision 2 — Containerized PostgreSQL inside Dokploy replacing RDS

**Taken (by Francisco 2026-10-09)**: PostgreSQL 16 runs as a Docker container on the EC2 host managed by Dokploy, replacing managed "RDS PostgreSQL" (`constitution.md:520`).  
**Why**: Dramatically simplifies local networking between the app and database, cuts AWS RDS infrastructure costs during MVP, and allows local role management.  
**Cost**: Automated RDS Multi-AZ failover, AWS-managed automated point-in-time recovery, and zero-downtime RDS minor version upgrades are lost. Backups, disaster recovery, disk volume resizing, and corruption recovery become our direct responsibility. The spec mandates automated scheduled backups to AWS S3 and a tested restore runbook (**FR-012**, **FR-013**, **SC-009**).

### Decision 3 — Deployment Flow: CI Passing on Main → GHCR → Dokploy Webhook

**Taken (by Francisco 2026-10-09)**: Continuous deployment triggers strictly after CI passes on `main`. GitHub Actions builds the Docker images, pushes them to GitHub Container Registry (GHCR), and calls Dokploy's deploy webhook via authenticated HTTPS POST.  
**Why**: Ensures that only code that has passed every strict quality gate (typechecking, linting, RLS verification, cross-tenant isolation, MFA coverage, secret scan, audit) can ever be packaged into an image. Offloads image building from the EC2 host to GitHub runners.  
**Cost**: Requires maintaining GHCR credentials in Dokploy, setting up a secure webhook endpoint, and managing image storage/pruning policies in GHCR.

### Decision 4 — Document Storage Remains AWS S3

**Taken (by Francisco 2026-10-09)**: Document storage remains on AWS S3 (`c-market-storage`), accessed via credentials injected from environment secrets. (MinIO was formally removed on 2026-10-09).  
**Why**: Preserves production parity with slice `007` and `021` implementation. Both CI and deployed environments use the real AWS S3 API with signed URLs.  
**Cost**: S3 egress and storage costs; cross-region considerations if the EC2 host and S3 bucket reside in different AWS regions.

### Decision 5 — Ephemeral One-Shot Migration Container (Proposed)

**Proposed, implemented**: Database migrations execute as a one-shot run of the backend image (`node dist/drizzle/migrate.js`; the Dockerfile copies `drizzle/*.sql` beside the compiled script, which reads them from its own directory) before the web backend container starts. One image instead of two keeps the migration code and the application from drifting apart.  
**Why**: Satisfies Finding F4. Migrations require the database owner role (`lc_migration`) and role passwords to alter credentials. The running web application (`lc_app`) MUST NEVER hold owner privileges or know role passwords (`constitution.md:541-544`). Running migrations as a one-shot container enforces physical credential separation at the container runtime level.  
**Cost**: Slightly longer deployment time; Dokploy must coordinate running the migration container to successful exit (`0`) before triggering rolling restart of the backend service.

### Decision 6 — The platform surface checks its caller; the proxy is a second layer (Proposed, implemented)

**Proposed**: The session guard admits a platform-surface request only when its TCP peer is loopback, and answers everyone else with an unknown route's 404. Traefik additionally refuses `/internal/*`.  
**Why**: Resolves Finding F1. A container must listen on `0.0.0.0`, which removes the only control the surface had. A proxy rule alone would leave the surface open to every other container on the Docker network and to any path that bypasses the proxy (a published port, a misrouted domain); a check in the application holds wherever the process runs. The peer comes from the socket because `X-Forwarded-For` is client-writable.  
**Cost**: An operator reaches the surface only from inside the backend container. The surface still authenticates nobody: a real PO identity remains future work (`session.guard.ts`'s own note), and this decision does not pretend otherwise.

### Decision 7 — Frontend Image Built per Environment with Public API Base URL (Proposed)

**Taken (Proposed)**: The Next.js frontend Docker image is built with `NEXT_PUBLIC_API_BASE_URL` provided as a Docker build argument in GitHub Actions.  
**Why**: Resolves Finding F2. Next.js inlines `NEXT_PUBLIC_*` variables into client-side JavaScript bundles at build time. The authentication forms (`SignInForm`, `EnrollmentFlow`, `RecoveryForm`) directly call this URL from the browser.  
**Alternative considered**: Routing the four authentication forms through the Next.js server (`/api/lc/*` or a sibling route), which would let the backend stay private. Not chosen for this slice because it changes `003`'s sign-in flow, which is outside this slice's scope; worth its own change later.

### Decision 8 — Multi-Stage Production Dockerfiles with Non-Root Execution (Proposed)

**Proposed, implemented**: `backend/Dockerfile` and `frontend/Dockerfile` use multi-stage builds on `node:22-bookworm-slim` (glibc, so the prebuilt `@node-rs/argon2` binary loads; Alpine would need the musl build), discard devDependencies from the final image, and run as user `node`. Both images built and booted locally on 2026-10-09; with `NODE_ENV=production` and `AUTH_KEY_PROVIDER=local` the backend refuses to start, as designed.  
**Why**: Minimizes container image attack surface, shrinks image transfer size to GHCR and EC2, and enforces least privilege execution inside containers.  
**Cost**: Requires maintaining explicit build stages and dependency pruning in Dockerfiles.

### Decision 9 — `/health` reports the build commit (Proposed, implemented)

**Proposed**: The backend image carries `BUILD_SHA` (the commit CI tested); `/health` answers `{"status":"ok","version":"<sha>"}`, and the deploy workflow waits until it reports the commit it built.
**Why**: The previous release answers `"ok"` too, so a wait for `"ok"` passed the moment it began and SC-001 could not be measured. A commit SHA is public in the repository and says nothing about any firm.
**Cost**: `/health` now discloses which release is running — to anyone, by design.

### Decision 10 — Our own backup script, not Dokploy's (Proposed, implemented; revised 2026-10-26)

**Proposed**: `deploy/scripts/backup.sh` — `pg_dump -Fc` as the schema owner, gzip, upload to S3 with SSE-KMS only after the dump succeeded — run daily on the host.
**Why**: Dokploy's built-in PostgreSQL backup runs `pg_dump --no-acl --no-owner`. `restore-check.sh` showed such a dump restoring without error into a database where every grant and every `EXECUTE` on the `SECURITY DEFINER` functions is gone.
**Cost**: A script and a schedule of our own to keep, instead of a Dokploy checkbox.

### Decision 11 — Accept a short redeploy gap for the MVP, or split the services (Pending — technical lead)

**Options**: (a) keep the Compose service and accept a gap of roughly `start_period` + one probe on every deploy, amending FR-017's wording; (b) one Dokploy *Application* per service (Swarm, `start-first` rolling updates) with the migration as a pre-deploy step.
**Proposed**: (a). One firm in demo, and (b) moves "migrate before the API" out of the one file that guarantees it today (`depends_on: service_completed_successfully`).
**Cost of (a)**: FR-017 as written is not met; a few seconds of 502 per deploy.

### Decision 12 — The API proves its KMS key at boot (Proposed, implemented)

**Proposed**: In production and staging, the API wraps and unwraps a random canary through the configured key before listening, and refuses to start if that fails.
**Why**: A wrong key id or a missing IAM grant otherwise deploys green and fails every MFA enrolment; `/health` deliberately probes only the database.
**Cost**: One KMS round trip per container start, and a boot that fails during a KMS outage — which is the intended behaviour.

### Decision 13 — How the first administrator of a real firm receives their invitation (Pending — technical lead)

**Problem** (found 2026-10-26 while writing `quickstart.md`): `POST /internal/platform/tenants/:id/seed-administrator` (002/FR-035) generates the invitation token, stores its hash, and returns neither the token nor a link (`seed.service.ts:46-69`); no email provider exists yet. Tenant-issued invitations do return theirs (`invitation.service.ts:94`). So on a deployed environment the first administrator of a firm cannot be reached, and SC-007 cannot be met for anyone but a demo firm — and the demo seed refuses any non-local database by design (022/FR-012).
**Options**: (a) the seed endpoint returns the reference link once, to its caller — who is, since Decision 6, only someone with a shell inside the backend container; (b) wire transactional email first (slice 002's plan decision, out of this slice's scope); (c) a one-off operator script that issues the seed invitation directly in the database and prints the link.
**Proposed**: (a) — smallest change, and the caller is already the most privileged operator there is. It changes 002's contract, so it is its own small change with a contract test, not a line slipped into this slice.

### Decision 14 — The audit log's scheduled duties run on the host (Proposed, implemented)

**Proposed**: `deploy/scripts/audit-maintenance.sh`, daily on the host as `lc_retention`: creates the audit partitions for this month and the next two, and runs `backend/drizzle/retention.sql` (001/FR-019) taken from the backend image.
**Why**: `infra/retention-schedule.tf` scheduled retention with EventBridge against RDS, neither of which exists under D1/D2; and the API creates partitions only at boot (`partition-maintenance.ts`, two months ahead), so a container left running longer than that would reach a month with no partition and every audited action would fail.
**Cost**: A second host job beside the backup.

### Decision 15 — CI reads its secrets from Bella Baxter, keyless (Taken by Francisco 2026-10-29; first step: CI only)

**Taken**: Secrets move to Bella Baxter, Cosmic Chimps' secret-management gateway, self-hosted, with Bella's own OpenBao as the store. First step: CI only. The `quality` job exchanges its GitHub OIDC token for a short-lived Bella key (`cosmic-chimps/bella-baxter-setup-action`, trust domain bound to this repository) and reads the test bucket's credentials from the Bella project `legalconnect-ci`, environment `test`. Runtime containers follow later, one Bella API key per service (decided, not yet built).
**Why**: GitHub stops holding long-lived credentials (the constitution's "no long-lived credentials in CI"; amendment draft, debt 13) without first changing how the application reads S3 credentials (T042's obstacle).
**Transition**: while the repository variable `BELLA_BAXTER_URL` is unset, the same CI step reads the GitHub variables and secrets as before, so CI does not depend on Bella until Bella is ready.
**Cost**: CI depends on a self-hosted service that must be reachable from GitHub over public HTTPS with a publicly trusted certificate, and that seals on every host restart until two of three unseal keys are entered. The setup action exists only in preview tags (`v0.1.1-preview.109` pinned).

---

## Constitution Amendments Required

Adopting Dokploy, containerized PostgreSQL, and acknowledging the AWS account state requires a formal amendment to `constitution.md` (raising version from `1.5.0` to `1.6.0`):

1. **Technology Constraints › Stack (`constitution.md:518-532`)**:
   - *Current line*:  
     `Cloud: AWS mx-central-1 — ECS Fargate + RDS PostgreSQL + S3 + KMS + SQS`
   - *Amended line*:  
     `Cloud: AWS EC2 (Dokploy PaaS: Docker + Traefik) + containerized PostgreSQL + S3 + KMS + SQS`  
     *(Pending EC2 region confirmation per `[NEEDS CLARIFICATION: EC2 region]`)*.
2. **Explicit MVP Prohibitions (`constitution.md:651-665`)**:
   - *Current line*:  
     `❌ Kubernetes — ECS Fargate is used instead.`
   - *Amended line*:  
     `❌ Kubernetes / ECS Fargate — Dokploy on AWS EC2 is used instead for the MVP deployment.`
3. **Security Constraints › Data Residency (`constitution.md:424-453`)**:
   - *Current state*: Records `[PENDING] — the scope of the AWS account blockage is not confirmed` (`constitution.md:439`).
   - *Resolution*: Close the pending item. The AWS account is usable for S3 (`c-market-storage` in `eu-central-1`) and EC2 as of 2026-10-09.
   - *Regional Residency Clarification*: The S3 bucket is currently in `eu-central-1`. The EC2 instance region must be confirmed. If the EC2 instance is not in `mx-central-1`, an explicit data residency waiver/amendment must be ratified, noting that primary data and document storage reside outside Mexico during MVP.

---

## Out of Scope

- **Multi-Environment Staging Pipeline**: Orchestrating distinct staging and production Dokploy environments on separate EC2 instances or subdomains (deferred pending clarification).
- **"Bella Baxter" Secret Management**: Dedicated enterprise secrets integration currently in evaluation.
- **Transactional Email Provider (SES)**: Production transactional email provisioning remains governed by slice `002`'s plan; CI and local development use mocks/placeholders.
- **High-Availability Clustering**: Multi-node Docker Swarm or Kubernetes clustering; single-node Dokploy on EC2 is the accepted MVP architecture.
- **WAF / DDoS Mitigation**: Cloudflare or AWS WAF deployment in front of Traefik.

---

## Assumptions

- An AWS EC2 instance is provisioned and accessible, with Docker and Dokploy installed and running.
- A public domain or DNS zone is available to route traffic to the EC2 host's public IP address.
- GitHub repository secrets can be created for GHCR authentication and Dokploy deployment webhooks.
- AWS credentials or an IAM Instance Profile attached to the EC2 host allow access to AWS KMS and AWS S3.
- PostgreSQL container storage is mounted on a persistent EC2 EBS volume that survives container restarts.

---

## Open questions ([NEEDS CLARIFICATION] items)

1. **`[NEEDS CLARIFICATION: EC2 region]`**: What AWS region does the existing EC2 host reside in? If it is NOT `mx-central-1`, Constitution Principle VI and Security Constraints (Data Residency) are violated. An explicit amendment must document the region and justify the temporary deviation.
2. **`[NEEDS CLARIFICATION: AWS Account Ownership]`**: Does the AWS account hosting the EC2 instance also own the S3 bucket (`c-market-storage` in `eu-central-1`), or are they separate accounts? If separate, cross-account IAM role delegation or static IAM user credentials must be configured.
3. **`[NEEDS CLARIFICATION: Domain Names]`**: What are the canonical public domain names for the frontend and backend API (e.g., `app.legalconnect.mx` and `api.legalconnect.mx`, or an IP/nip.io temporary domain)?
4. **`[NEEDS CLARIFICATION: Staging Environment]`**: Does this deployment pipeline target a single production environment, or should `main` deploy to a staging environment first, with production triggered by version tags?

---

## Approval Checklist

- [ ] Decision 1 — Dokploy on AWS EC2 replacing ECS Fargate — *Decided by Francisco 2026-10-09, pending region clarification*
- [ ] Decision 2 — Containerized PostgreSQL inside Dokploy replacing RDS — *Decided by Francisco 2026-10-09*
- [ ] Decision 3 — Deploy flow: CI → GHCR → Dokploy webhook — *Decided by Francisco 2026-10-09*
- [ ] Decision 4 — AWS S3 retained for document storage — *Decided by Francisco 2026-10-09*
- [ ] Decision 5 — Ephemeral one-shot migration container — *Proposed, pending ratification by Francisco*
- [ ] Decision 6 — The platform surface checks its caller; the proxy is a second layer — *Proposed, pending ratification by Francisco*
- [ ] Decision 7 — Frontend image built per environment with public API base URL — *Proposed, pending ratification by Francisco*
- [ ] Decision 8 — Multi-stage production Dockerfiles with non-root user — *Proposed, pending ratification by Francisco*
- [ ] Decision 9 — `/health` reports the build commit — *Proposed, pending ratification by Francisco*
- [ ] Decision 10 — Our own backup script, not Dokploy's — *Proposed, pending ratification by Francisco*
- [ ] Decision 11 — Redeploy gap vs split services — *Pending a choice by Francisco*
- [ ] Decision 12 — KMS key proven at boot — *Proposed, pending ratification by Francisco*
- [ ] Decision 13 — First administrator's invitation on a real environment — *Pending a choice by Francisco*
- [ ] Decision 14 — Audit partitions and retention as a host job — *Proposed, pending ratification by Francisco*
- [x] Decision 15 — CI secrets from Bella Baxter, keyless — *Taken by Francisco 2026-10-29 (instance self-hosted, Bella's OpenBao, one API key per service later, CI first)*
- [ ] Resolution of `[NEEDS CLARIFICATION: EC2 region]` and associated Data Residency amendment
- [ ] Resolution of domain names, AWS account ownership, and staging environment scope
- [ ] Findings F1–F6 reviewed against the code by Claude on 2026-10-09 (F1 reproduced against the built image), pending Francisco's read
- [ ] Constitution amendment (Stack, MVP Prohibitions, Data Residency) written and ratified — *drafted 2026-10-26 in [constitution-amendment-draft.md](./constitution-amendment-draft.md), region still open; not ratified*
