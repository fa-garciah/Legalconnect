# Quickstart — standing up LegalConnect on Dokploy (024, T029)

This is the **declared form of everything Dokploy's UI holds** (constitution draft, debt item 12): if
the UI and this file disagree, one of them is wrong, and it should be fixed the same day. Evidence of
each check goes in [quickstart-results.md](./quickstart-results.md).

Placeholders still open (spec open questions): `<REGION>` (EC2 region — also decides the constitution
amendment's variant), `<APP_DOMAIN>` and `<API_DOMAIN>` (e.g. `app.legalconnect.mx`,
`api.legalconnect.mx`), `<ENV>` (`prod`, unless staging is decided).

**Blocking the first real sign-in (Decision 13, pending):** `POST …/seed-administrator` creates the
first administrator's invitation but neither returns its link nor sends it (no email provider yet),
so §7 cannot finish for a real firm until that is decided. See tasks T041.

---

## 1. AWS, as code (`infra/`)

```bash
cd infra
terraform init
terraform apply -var aws_region=<REGION> -var environment=<ENV> -var backup_retention_days=<N>
```

This creates the TOTP envelope key (`main.tf`) and the backup bucket, its key and the writer/reader
policies (`backups.tf`). Outputs give `AUTH_KMS_KEY_ID`, `BACKUP_TARGET`, `BACKUP_KMS_KEY_ID`.

Still to attach, once spec open question 2 says which identity runs where:

| Identity | Needs | From |
|---|---|---|
| The API (`backend` container) | `kms:Encrypt`, `kms:Decrypt`, `kms:DescribeKey` on the TOTP key | `data.aws_iam_policy_document.totp_envelope_use` — declared, not yet an `aws_iam_policy` |
| The API | S3 on the **production documents bucket** | Which bucket is open: the CI test bucket must not be it |
| The backup schedule | `aws_iam_policy.db_backup_writer` | `backups.tf` |
| A person restoring | `aws_iam_policy.db_backup_reader` | `backups.tf` |

The API reads static `OBJECT_STORE_*` keys for S3 (`object-store.config.ts:21-29`) but the default
credential chain for KMS, so an EC2 instance profile covers KMS only. If containers are to use the
instance profile, set the instance metadata **hop limit to 2** — a container is one hop further than
the host.

## 2. GitHub repository settings

Settings → Secrets and variables → Actions.

| Kind | Name | Value |
|---|---|---|
| Variable | `OBJECT_STORE_REGION` | the CI test bucket's region |
| Variable | `OBJECT_STORE_TEST_BUCKET` | the CI test bucket |
| Secret | `OBJECT_STORE_ACCESS_KEY_ID`, `OBJECT_STORE_SECRET_ACCESS_KEY` | an IAM user reaching only that bucket |
| Variable | `NEXT_PUBLIC_API_BASE_URL` | `https://<API_DOMAIN>` — baked into the frontend image at build |
| Secret | `DOKPLOY_WEBHOOK_URL` | from §5; until it exists a green `main` only publishes images |

After the first green `main`: Packages → `legalconnect-backend` and `legalconnect-frontend` → keep
them **private**.

## 3. Registry credential in Dokploy

A classic GitHub PAT with **`read:packages` only**. Dokploy → Registry → add `ghcr.io`, user
`fa-garciah`, password = the PAT.

**Expiry: `<date>`** — write it here when created. When it lapses, deploys fail at the pull and the
running release keeps serving; rotate by creating a new PAT and replacing it in Dokploy.

## 4. PostgreSQL (Dokploy → Database → PostgreSQL)

- Version **16**. Database `legalconnect`. User **`lc_migration`** (the schema owner — every role,
  grant and the backup script assume this name). Password: `openssl rand -base64 32`.
- **No external port.** It is reached only on `dokploy-network` by its internal host name.
- Persistent volume: Dokploy's default; note the host path here: `<path>`.
- **Do not enable Dokploy's Backups tab** for it (Decision 10 — its dumps drop every grant). §8 is
  the backup.

## 5. The application (Dokploy → Compose)

Source: this repository, branch `main`, compose path `deploy/dokploy/docker-compose.yml`, so the
file Dokploy runs is the reviewed one. Environment tab — every value below, nothing else:

```dotenv
IMAGE_TAG=main
API_HOST=<API_DOMAIN>
APP_PUBLIC_URL=https://<APP_DOMAIN>

# migrate only — the owner connection and the role passwords (FR-008)
DATABASE_URL_MIGRATION=postgresql://lc_migration:<pw>@<pg-internal-host>:5432/legalconnect
LC_APP_PASSWORD=<openssl rand -hex 24>
LC_PLATFORM_PASSWORD=<openssl rand -hex 24>
LC_RETENTION_PASSWORD=<openssl rand -hex 24>
LC_AUTH_PASSWORD=<openssl rand -hex 24>

# backend
DATABASE_URL_APP=postgresql://lc_app:<LC_APP_PASSWORD>@<pg-internal-host>:5432/legalconnect
DATABASE_URL_PLATFORM=postgresql://lc_platform:<LC_PLATFORM_PASSWORD>@<pg-internal-host>:5432/legalconnect
DATABASE_URL_AUTH=postgresql://lc_auth:<LC_AUTH_PASSWORD>@<pg-internal-host>:5432/legalconnect
CORS_ALLOWED_ORIGINS=https://<APP_DOMAIN>
OBJECT_STORE_REGION=<documents bucket region>
OBJECT_STORE_BUCKET=<production documents bucket>
OBJECT_STORE_ACCESS_KEY_ID=<…>
OBJECT_STORE_SECRET_ACCESS_KEY=<…>
AUTH_KMS_KEY_ID=<terraform output totp_envelope_key_id>
AWS_REGION=<REGION>
# AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY only if not using the instance profile
EMAIL_SENDER_ADDRESS=no-reply@legalconnect.mx

# frontend
NEXTAUTH_SECRET=<openssl rand -base64 32>
```

`NODE_ENV`, `PORT`, `PLATFORM_BIND_HOST`, `AUTH_KEY_PROVIDER=kms` and the auth/invitation limits are
fixed in the compose file, not here. `DATABASE_URL_RETENTION` is in **no** container — only in §8.
Rotating `NEXTAUTH_SECRET` signs everyone out (no data lost).

Domains tab:

| Service | Port | Domain | HTTPS |
|---|---|---|---|
| `frontend` | 3000 | `<APP_DOMAIN>` | Let's Encrypt |
| `backend` | 3000 | `<API_DOMAIN>` | Let's Encrypt |

Deployments tab → copy the **webhook URL** into the `DOKPLOY_WEBHOOK_URL` secret (§2). Treat it as a
credential: it redeploys production.

## 6. First deploy

Trigger a deploy from Dokploy (or merge to `main`). Expect, in order: `migrate` applies every
migration and exits 0; `backend` turns healthy (it refuses to start if its role is unsafe or its KMS
key does not round-trip — read its log if it never does); `frontend` starts.

```bash
curl https://<API_DOMAIN>/health          # {"status":"ok","version":"<sha>"}
curl -X POST https://<API_DOMAIN>/internal/platform/tenants -H 'content-type: application/json' -d '{}'
                                          # 403 (Traefik) — anything else is a defect (T036)
```

## 7. The first firm

The platform surface answers only from inside the `backend` container (Decision 6). From the host:

```bash
docker exec -i <backend-container> node -e '
  fetch("http://127.0.0.1:3000/internal/platform/tenants", { method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "<legal name>", rfc: "<RFC>", planCode: "esencial" }) })
  .then(async r => console.log(r.status, await r.text()))'
```

Then `POST /internal/platform/tenants/<id>/seed-administrator` with `{ "email": "<admin email>" }`
the same way. **This is where Decision 13 bites**: the invitation exists, its link reaches no one.

## 8. Scheduled jobs on the host

Not in Dokploy, because Dokploy's database backup is the thing being avoided. A read-only clone of
this repository on the host (`/opt/legalconnect`, at `main`) supplies the scripts; a root-only
environment file holds their secrets:

```bash
# /etc/legalconnect/jobs.env   (chmod 600, owner root)
DATABASE_URL_BACKUP=postgresql://lc_migration:<pw>@<pg-internal-host>:5432/legalconnect
DATABASE_URL_RETENTION=postgresql://lc_retention:<LC_RETENTION_PASSWORD>@<pg-internal-host>:5432/legalconnect
BACKUP_TARGET=<terraform output db_backup_target>
BACKUP_KMS_KEY_ID=<terraform output db_backup_kms_key_id>   # the ARN: the bucket refuses any other key
AWS_REGION=<REGION>
```

```cron
# /etc/cron.d/legalconnect
15 3 * * * root set -a; . /etc/legalconnect/jobs.env; /opt/legalconnect/deploy/scripts/backup.sh >> /var/log/legalconnect-backup.log 2>&1
45 3 * * * root set -a; . /etc/legalconnect/jobs.env; /opt/legalconnect/deploy/scripts/audit-maintenance.sh >> /var/log/legalconnect-audit.log 2>&1
```

`audit-maintenance.sh` keeps audit partitions two months ahead (without it, an API that is not
redeployed for two months stops being able to audit — and therefore to act) and runs the 24-month
retention (001/FR-019). Then, once: download the first backup and run
`deploy/scripts/restore-check.sh` on it (T028b).

## 9. Rolling back

Dokploy → Compose → Environment: `IMAGE_TAG=sha-<previous commit>` → Deploy. The previous
commit's tag is in GHCR and in the previous `deploy.yml` run. Set it back to `main` once the fix is
merged. The migration step of an older image finds nothing to do, and the older API runs on the
newer schema **only if the migrations since were additive** (spec US3 scenario 3 assumes this; no
check enforces it). Look at what the bad release migrated before rolling back across it.

## 10. Restoring

[`deploy/runbooks/restore.md`](../../deploy/runbooks/restore.md).
