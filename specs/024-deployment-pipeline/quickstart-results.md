# Quickstart results — 024 Deployment pipeline

Evidence recorded as each check is run. Repository-side checks first; the real-environment checks
(tasks T031–T039) are added when Dokploy is configured.

## 2026-10-26 — repository work (T017–T026), Windows 11 + Docker Desktop 29

### D9 — `/health` reports the build (T017–T019)

- `tests/unit/health-route.test.ts`: the two new cases failed first (`expected { status: 'ok' } to
  deeply equal { status: 'ok', version: 'abc123' }`), then 5/5 passed.
- Image `lc-backend:local` built with `--build-arg BUILD_SHA=local`, booted against a migrated
  PostgreSQL 16: `GET /health` → `{"status":"ok","version":"local"}`.
- `deploy.yml`'s wait step now compares `version` with the commit it built. Not yet run in Actions:
  it executes only once `DOKPLOY_WEBHOOK_URL` exists.

### D12 — KMS round trip at boot (T020–T021)

- `tests/unit/key-provider-canary.test.ts`: 5 failed first (function absent), then 5/5 passed.
- The same image with `NODE_ENV=production`, `AUTH_KEY_PROVIDER=kms`, an unreachable key and invalid
  credentials: exit 1 before listening —
  `refusing to start: the envelope key arn:aws:kms:…:key/does-not-exist failed a wrap/unwrap round
  trip (… The security token included in the request is invalid.)`.

### Traefik refuses `/internal/*` (T022)

Traefik v3.6 with the backend's labels copied verbatim from `deploy/dokploy/docker-compose.yml`
(`API_HOST=api.test`), a `traefik/whoami` stand-in for the API, and a lower-priority router standing
in for the one Dokploy generates:

| Request (Host `api.test`) | `web` | `websecure` |
|---|---|---|
| `POST /internal/platform/tenants` | 403 | 403 |
| same, `X-Forwarded-For: 127.0.0.1` | 403 | 403 |
| `GET /internal` | 403 | 403 |
| `GET /internalx` | 200 | 200 |
| `GET /health` | 200 | 200 |

The first draft used `PathPrefix(`/internal`)`, which also caught `/internalx`; tightened to
`Path(`/internal`) || PathPrefix(`/internal/`)`. Traefik v3.1 could not talk to Docker Engine 29's
API at all — Dokploy's own Traefik version must be recent enough; checked in T036.

### Dockerfile lint (T023)

`hadolint` v2.12.0, `--failure-threshold warning`: `backend/Dockerfile` and `frontend/Dockerfile`
both clean, nothing to ignore.

### Restore check (T024–T025)

Source: PostgreSQL 16, 49 migrations from `lc-backend:local`, then `npm run db:seed:demo` (2 firms,
45 matters, 135 documents). Three backups of it, each run through `deploy/scripts/restore-check.sh`:

| Backup | Result |
|---|---|
| `pg_dump -Fc \| gzip` | **PASS** — 6 role blocks, 49 migrations recorded, migrate applied none, security fingerprint identical to a fresh migration (135 entries), `verify:role` + `test:rls` 39/39 |
| `pg_dump \| gzip` (plain SQL) | **PASS** — same |
| `pg_dump -Fc --no-acl --no-owner \| gzip` (Dokploy's built-in backup) | **FAIL**, as it must — every function and table ACL missing, e.g. `resolve_session` lost `lc_app=X`, `accept_invitation` lost `lc_app=X` |

The third row is why plan D10 changed: Dokploy's built-in PostgreSQL backup cannot be the backup.
`test:rls` checks policies, and `verify:role` checks role attributes plus the grants on two tables
(`audit_event`, `tenant`). They would notice a `--no-acl` dump through `audit_event` alone; they would
not notice one function's lost `EXECUTE` or one table's lost `SELECT`. That is why the script compares
the whole security configuration with a fresh migration rather than relying on them alone.
