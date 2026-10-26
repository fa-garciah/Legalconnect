---
description: "Task list for 024-deployment-pipeline"
---

# Tasks: Automated Deployment Pipeline from Main

**Input**: [spec.md](./spec.md), [plan.md](./plan.md) · **PR**: [fa-garciah/Legalconnect#16](https://github.com/fa-garciah/Legalconnect/pull/16)

**Tests**: mandatory, strict TDD for every task that changes code — the test is run and **seen to
fail** before the task under it starts. Configuration and runbook tasks are verified in Phase 7 on
the real environment instead.

## Format: `[ID] [P?] [Story] Description`

Stories: **US1** deploy on green merge · **US2** red never deploys · **US3** rollback · **US4**
backups and restore · **US5** platform surface isolated.

**Owner**: tasks marked **[Francisco]** need the technical lead — credentials, AWS/Dokploy access, or
a decision. Everything else is repository work and does not wait on them.

---

## Phase 0: Already built (commits `070dd8b`…`63ca8f6` on PR 16)

- [x] T001 [US5] Platform surface answers only a loopback TCP peer, 404 otherwise; pinned by
      `backend/tests/unit/platform-surface-loopback.test.ts` (`0ca12fa`).
- [x] T002 [US1] `backend/Dockerfile` (API + one-shot migrate) and `frontend/Dockerfile` (standalone,
      `NEXT_PUBLIC_API_BASE_URL` build arg), both `USER node`; `backend` `npm start` →
      `dist/src/main.js` (`0ca12fa`).
- [x] T003 [US1] [US2] `.github/workflows/deploy.yml` — `workflow_run` on green CI, push to `main`
      only; GHCR `sha-<commit>` + `main`; webhook; health wait; platform-surface smoke (`f14e982`).
- [x] T004 [US1] `deploy/dokploy/docker-compose.yml` — `migrate` → `backend` (healthy) → `frontend`;
      owner credentials only in `migrate` (`f14e982`).
- [x] T005 [US1] `GET /health` beside the router, `tests/unit/health-route.test.ts` (`f14e982`).
- [x] T006 CI: MinIO dropped for the AWS test bucket from repository variables; undici and
      grpc-js advisories patched (`070dd8b`, `bd113b5`).
- [x] T007 Frontend `next` / `eslint-config-next` 16.4.0 → 16.4.3 for GHSA-2464-fhr4-w9xw; typecheck,
      lint, 779 tests and the production build pass (`63ca8f6`).
- [x] T008 `plan.md` (`5bbdf15`).

## Phase 1: Unblock CI on `main` (BLOCKS anything being published)

- [ ] T009 **[Francisco]** Repository variables `OBJECT_STORE_REGION`, `OBJECT_STORE_TEST_BUCKET`,
      `NEXT_PUBLIC_API_BASE_URL`; secrets `OBJECT_STORE_ACCESS_KEY_ID`,
      `OBJECT_STORE_SECRET_ACCESS_KEY`. Re-run PR 16's CI; `quality` must go green (it fails today on
      the S3 isolation suites with empty `OBJECT_STORE_*`).
- [ ] T010 **[Francisco]** Merge PR 16 once every check is green. `deploy.yml` fires only from the
      default branch, so the first `publish` run happens on that merge.
- [ ] T011 After T010: confirm the `publish` job pushed both images with both tags, and set the two
      GHCR packages' visibility explicitly (private).

## Phase 2: Decisions and governance (BLOCKS Phase 6–7, not Phase 3–5)

- [ ] T012 **[Francisco]** Answer spec open questions 1–4 (EC2 region, AWS account ownership,
      domains, staging) in `spec.md`.
- [ ] T013 **[Francisco]** Ratify or reject D5–D8, D9, D10, D12, D14, and choose D11 (accept a
      redeploy gap, or split into Dokploy Applications) and D13 (how a real firm's first administrator
      gets their invitation).
- [x] T014 Spec corrections (plan § Findings): US1 scenario 1 → two images and `main` tag; approval
      checklist's D6 label; inventory `NEXTAUTH_URL` → `APP_PUBLIC_URL`; KMS edge case → boot
      failure (D12); FR-017 wording per D11.
      *(Done 2026-10-26, plus US4/FR-013/FR-016 for D9–D10, the inventory's missing rows, and
      D9–D14 in Decisions. FR-017 only annotated: its wording waits for D11.)*
- [x] T015 Constitution amendment draft 1.5.0 → 1.6.0: Stack (`constitution.md:520`), MVP
      prohibitions (`constitution.md:655`), Data Residency `[PENDING]` (`constitution.md:439`) closed,
      plus a dated waiver if T012 puts the EC2 outside `mx-central-1`. Draft suits Antigravity once
      its headless permissions allow it; reviewed against the constitution before commit.
      *(Drafted 2026-10-26 in `constitution-amendment-draft.md`, directly — Antigravity's headless run
      could not get permissions. Region-dependent text left in two variants. Beyond the three named
      lines it also covers the two Dependencies-and-Infrastructure rules this deployment meets only
      in part, as Technical Debt 12 and 13.)*
- [ ] T016 **[Francisco]** Ratify T015, and land it in its own PR against
      `.specify/memory/constitution.md` (Merge Rules).

## Phase 3: The deploy proves the new release is live (US1) — D9

- [x] T017 Unit test — extend `backend/tests/unit/health-route.test.ts`: with `BUILD_SHA=abc123`
      the 200 body is exactly `{"status":"ok","version":"abc123"}`; without it `version` is
      `"unknown"`; the 503 body stays exactly `{"status":"unavailable"}` (no version on failure).
      **See it fail.**
- [x] T018 `backend/src/common/http/health.ts` returns `version` from `process.env.BUILD_SHA`;
      update the file's "discloses nothing" comment to say why a public commit SHA is not a
      disclosure. `backend/Dockerfile`: `ARG BUILD_SHA` → `ENV BUILD_SHA` in the runtime stage.
- [x] T019 `deploy.yml`: pass `build-args: BUILD_SHA=${{ env.SHA }}` to the backend build; the wait
      step succeeds only when `/health`'s `version` equals `$SHA`, failing after 10 minutes (SC-001).

## Phase 4: A KMS misconfiguration stops the container booting (US1) — D12

- [x] T020 Unit test `backend/tests/unit/key-provider-canary.test.ts`: `assertKeyProviderReachable`
      with a provider whose `wrap` rejects → throws naming the key, not the cause's secrets; whose
      `unwrap` returns different bytes → throws; that round-trips → resolves; with
      `AUTH_KEY_PROVIDER=local` outside production → not called. **See it fail.**
- [x] T021 `assertKeyProviderReachable` in `backend/src/common/auth/deployment-assertions.ts`:
      `wrap` then `unwrap` a random 32-byte canary through `resolveKeyProvider()`
      (`key-provider.ts:187`), compare. Call it in `main.ts` right after `assertKeyProviderIsSafe()`
      and before `listen()`, so the health check never passes and the old container keeps serving.

## Phase 5: Edge hardening and image lint (US5, SC-010)

- [x] T022 [P] [US5] Traefik second layer in `deploy/dokploy/docker-compose.yml`: on `backend`,
      labels for a router ``Host(`${API_HOST}`) && PathPrefix(`/internal`)`` with a priority above
      Dokploy's generated router, through an `ipallowlist` middleware `sourcerange=127.0.0.1/32`
      (answers 403). `API_HOST` set in Dokploy per T029. Verified in T036, not before — the
      router names Dokploy generates are not knowable from the repository.
      *(Done with `Path(`/internal`) || PathPrefix(`/internal/`)` — `PathPrefix(`/internal`)` also
      caught `/internalx`. Proven against Traefik v3.6 with a stand-in API: 403 on both entrypoints,
      forged `X-Forwarded-For` included; other paths pass. Dokploy's real routers: T036.)*
- [x] T023 [P] SC-010: `hadolint` job in `.github/workflows/ci.yml` over `backend/Dockerfile` and
      `frontend/Dockerfile` (pinned `hadolint/hadolint-action` by tag), failure threshold
      `warning`. Fix whatever it reports in the same task; justify any inline ignore.
      *(Both Dockerfiles clean under hadolint v2.12.0; nothing to ignore.)*

## Phase 6: Backups and restore (US4) — D10

- [x] T024 [US4] `deploy/scripts/restore-check.sh` — given a `.sql.gz`: start a throwaway
      `postgres:16` container; create the six roles first (plan Finding 4: the `CREATE ROLE` blocks of
      `drizzle/0000_roles.sql`, `0015_accept_invitation_fn.sql`, `0030_lc_auth_role.sql`, which are
      idempotent `DO` blocks); `gunzip | psql`; run `node dist/drizzle/migrate.js` from the backend
      image to set passwords and confirm nothing is pending; run `npm run verify:role` and
      `npm run test:rls` against it; tear down. Exits non-zero on any step.
      *(Built wider than written: roles come from every `CREATE ROLE` block in the image's own
      migrations, not three named files; it accepts custom-format and plain dumps; and it diffs the
      restored grants/owners/policies/roles against a fresh migration by the same image, because the
      two suites check grants on two tables only.)*
- [x] T025 [US4] Prove T024 locally: `pg_dump` the compose stack's database after `npm run db:seed:demo`
      (022's demo firm), gzip, run the script, record the output in `quickstart-results.md`. Run in
      the Linux container, not Windows (argon2 is blocked by Smart App Control).
      *(Custom and plain dumps PASS; a `--no-acl --no-owner` dump — Dokploy's own format — FAILS.
      Recorded in `quickstart-results.md`.)*
- [x] T026 [US4] `deploy/runbooks/restore.md` — the manual form of T024 against the production
      host, including where backups live, how to pick one, and who may run it.
- [x] T027a [US4] Declare the backup bucket in `infra/backups.tf`: own KMS key, versioned, TLS-only,
      refuses objects under any other key, lifecycle expiry from `backup_retention_days` (no default —
      the lead's call), writer policy (`s3:PutObject` + `kms:GenerateDataKey`) and reader policy.
      `terraform validate` and `fmt -check` pass; nothing applied.
- [ ] T027 **[Francisco]** [US4] `terraform apply` it (`quickstart.md` §1), and attach the writer
      policy to whatever runs the schedule.
- [ ] ~~T028 Dokploy Database service → Backups~~ — **struck 2026-10-26**: Dokploy's built-in
      PostgreSQL backup is `pg_dump -Fc --no-acl --no-owner`, which T025 shows restores into an
      unusable database (plan D10, revised).
- [x] T028a [US4] `deploy/scripts/backup.sh` — `pg_dump -Fc` as the schema owner (ACLs and owners
      kept) | gzip | `aws s3 cp -` to the T027 bucket with `--sse aws:kms`, key
      `legalconnect-<UTC timestamp>.dump.gz`; exits non-zero if any stage fails (`pipefail`). Proven
      locally by feeding its output to `restore-check.sh` (S3 stage stubbed with a local file).
      *(Done, safer than written: the dump lands in a private temp dir and is uploaded only after
      `pg_dump` exits 0, so a dump killed mid-`COPY` leaves nothing in the target — tested. S3 proven
      against MinIO with SSE-KMS rather than stubbed; `sha256` in the object metadata.)*
- [ ] T028b **[Francisco]** [US4] Schedule T028a daily on the host (`quickstart.md` §8: cron) and
      run `restore-check.sh` on its first upload.
- [x] T028c `deploy/scripts/audit-maintenance.sh` (D14): as `lc_retention`, keep audit partitions
      two months ahead and run `retention.sql` from the image. Tested: recreates a missing future
      partition, drops the one month past 24, idempotent, refused as `lc_app`.

## Phase 7: The Dokploy environment (US1, US3) — `quickstart.md`

- [x] T029 `specs/024-deployment-pipeline/quickstart.md` — the runbook that is the declared form of
      Dokploy's UI configuration: Database service + volume; Compose service from
      `deploy/dokploy/docker-compose.yml`; every variable per the spec's inventory, split by
      container, plus `API_HOST` (the API domain, for T022's labels); `IMAGE_TAG`; domains and TLS; GHCR registry credential (PAT `read:packages`, its
      expiry date and rotation steps); KMS key and IAM policy (`kms:Encrypt`/`kms:Decrypt` on that key
      only); the webhook URL into secret `DOKPLOY_WEBHOOK_URL`; first firm and admin provisioned
      through the platform surface from inside the backend container.
      *(Written 2026-10-26 with `<REGION>`, `<APP_DOMAIN>`, `<API_DOMAIN>` placeholders. Writing it
      surfaced D13: the first administrator's invitation link is never returned or sent.)*
- [ ] T030 **[Francisco]** Execute T029 on the EC2 host (needs T012).

## Phase 8: Acceptance on the real environment (`quickstart-results.md`)

- [ ] T031 [US1] SC-001: merge a visible change; `deploy.yml` reaches the new `version` in < 10 min
      with no command typed on the server. Record run URL and timings.
- [ ] T032 [US2] SC-002: a PR merged with a deliberately failing check (then reverted) → no
      `publish`, no webhook, running `version` unchanged.
- [ ] T033 [US1] Migration failure: deploy an image whose migration fails (throwaway branch tag via
      `IMAGE_TAG`) → `migrate` exits non-zero, the old `backend` keeps serving.
- [ ] T034 [US1] SC-004, SC-006: boot logs clean under `kms`; `docker inspect` of `backend` shows no
      `DATABASE_URL_MIGRATION` and no `LC_*_PASSWORD`.
- [ ] T035 [US1] D12 in place: a deliberately wrong `AUTH_KMS_KEY_ID` → container never healthy,
      previous one keeps serving. Restore the right value.
- [ ] T036 [US5] SC-003: from outside, `POST /internal/platform/tenants` (with and without forged
      `X-Forwarded-For`) → 403 from Traefik (T022) — or 404 if the label is not matching, which is a
      T022 defect to fix, not a pass.
- [ ] T037 [US1] SC-007: sign in, complete MFA, open a matter's documents, preview one. **Blocked on
      T041** for any firm but a demo one.
- [ ] T038 [US3] SC-008: `IMAGE_TAG=sha-<previous>` → redeploy → previous `version` live < 3 min;
      then back to `main`.
- [ ] T039 [US4] SC-009: download the latest scheduled backup from S3, run T024's script on it.

## Phase 9: Close

- [ ] T041 After T013 chooses D13: make a real firm's first administrator reachable. If (a), the
      seed endpoint returns the reference link once — test-first, a contract test on
      `seed.controller.ts`; it changes 002/FR-035's response, so its own small PR.
- [ ] T042 Constitution debt 13 (once ratified): CI's S3 key pair → GitHub OIDC to a role scoped to
      the test bucket. Needs `object-store.config.ts` to accept the default credential chain, which it
      does not today (it requires the static pair).
- [ ] T040 Spec status → completed only when Phase 2's ratifications are in and T031–T039 are
      recorded; living specs synced if the slice changed any capability (it should not).

---

## Dependencies

- Phase 1 → T011 and everything in Phase 8.
- Phase 2 (T012) → T029–T030 → Phase 8.
- Phases 3, 4, 5, 6 (T024–T026) are repository work: start now, in any order; T017→T018→T019 and
  T020→T021 are strict TDD chains. T022 and T023 are `[P]`.
- T027 and T028b need T012 (account and region) and feed T039.
- T037 needs T041, which needs T013's choice on D13.
- D9 (Phase 3) and D12 (Phase 4) are proposals: if T013 rejects either, its tasks are struck, not
  left open.
