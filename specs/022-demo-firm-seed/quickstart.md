# Quickstart — the demo firm

**Slice**: `022-demo-firm-seed` · **Written by hand**, 2026-09-25 (T035)

Everything here is fixture material for a **local** database. `npm run db:seed:demo` refuses to
run anywhere else, on two checks with no override (spec Decision 3). If you are reading this
while connected to anything real, the command has already refused.

---

## Setting up from nothing

```bash
cd backend
npm ci

# Postgres (and MinIO, if it can be pulled — see "MinIO" below)
npm run db:up

npm run db:migrate      # schema
npm run db:seed         # the fixture tenants the isolation suite reads — unchanged by this slice
npm run db:seed:demo    # the demo firm: people who can sign in, and six quarters of matters
```

Then, in two terminals:

```bash
cd backend  && npm run dev     # API on http://127.0.0.1:3001
cd frontend && npm run dev     # app on http://localhost:3000
```

Open **http://localhost:3000**, and sign in with any person below.

> `backend/.env` must point `DATABASE_URL_*` at a local host. If your Postgres is published on a
> port other than 5432 (another project's container often has 5432), set the port in `.env` and
> add a `backend/docker-compose.override.yml` — that file is gitignored precisely because the
> port collision is per-machine.

## Signing in

Three steps, because MFA is mandatory and this seed installs no way around it (FR-013):

1. **Correo** — one of the addresses below.
2. **Contraseña** — the same for everybody: `demo-local-legalconnect-2026`
3. **Código de verificación** — six digits from an authenticator app.

For step 3, add the person's **TOTP secret** to an authenticator app once (Google Authenticator,
Authy, 1Password — "enter a setup key manually"). After that it shows a fresh code every 30
seconds, for as long as the demo database exists, because the secret is derived and never
re-rolled.

If you have no authenticator app to hand, the backup codes below also satisfy the challenge —
but each one is **single-use**, and consuming one drops the rest of the set and revokes every
live session, because that is what recovery means (`recovery.service.ts`). Use the TOTP secret
for ordinary work.

### The seven people

Every one of them is at **Despacho Méndez & Asociados, S.C.** (`DMA180312K21`). The archetype is
what makes each interesting: sign in as several and watch the navigation and the controls change.

| Archetype | Who | Position | What they are for |
|---|---|---|---|
| `MP` | Alejandro Méndez Solórzano | Socio | The full internal surface; the only archetype that can withdraw a document |
| `AA` | Laura Ramírez Ibarra | Asociado Senior | Assigned scope — a case register shorter than the firm's. **Also `MP` at the second firm**, so the tenant switcher has something to switch |
| `AA` | Jorge González Peña | Asociado | The same, with a visibly smaller load |
| `PL` | Mariana Torres Aguilar | Paralegal | Can upload, cannot change a category, cannot withdraw |
| `CM` | Rocío Villalobos Nieto | Coordinadora de Casos | Can change a category, cannot withdraw |
| `BM` | Sergio Pantoja Duarte | Administrador | **Holds no document capability at all** |
| `SA` | Ivonne Carrasco Lira | Administrador de Sistemas | `/configuracion`, and the shortest session budget (30 min idle) |

### Credentials

**Shared password for all seven:** `demo-local-legalconnect-2026`

**The TOTP secrets and backup codes are not transcribed into this file, on purpose.** An early
draft pasted them in, and that contradicted the requirement they exist to satisfy: FR-018 asks
for credentials that are *derivable from readable phrases rather than stored as high-entropy
blobs*, and thirty-two characters of base32 in a committed Markdown file is exactly such a blob
— the sort of string `gitleaks` is built to flag, and rightly.

What is committed instead is the **derivation**, in `backend/drizzle/demo/firm.ts`:

| Material | Derived from | Result |
|---|---|---|
| Password | written out above | the same for all seven |
| TOTP secret | `sha256("demo-totp-<slug>")`, first 20 bytes, base32 | 32 base32 characters |
| Backup codes | `sha256("demo-backup-<slug>-<0…9>")`, mapped onto the Crockford alphabet | ten `XXXXX-…` codes |

The slugs are `mendez`, `ramirez`, `gonzalez`, `torres`, `villalobos`, `pantoja`, `carrasco`.

**To get the ready-to-use values, run the command** — `npm run db:seed:demo` ends with a table
of every email and its TOTP secret, and prints it again identically on every run, because
nothing here is random. That is the whole point of Decision 2: the credentials survive the
terminal scrolling away.

To print one person's backup codes without re-seeding:

```bash
cd backend
npx tsx -e "console.log(require('./drizzle/demo/report').renderBackupCodes('mendez'))"
```

(The `require` form rather than a dynamic `import` is not a style choice: `tsx -e` compiles to
CommonJS here, and the `import()` version fails. Verified by running both.)

## What the demo firm contains

| | Méndez & Asociados | Ríos y Caballero |
|---|---|---|
| Plan | `profesional` | `esencial` |
| People | 7 (one per internal archetype) | 1 (Laura Ramírez, as `MP`) |
| Clients | 25 — 18 organisations, 7 natural persons | 4 |
| Matters | 40, opened across the last six quarters | 5 |
| Closed matters | ~11, each with a `closed_on` after its `opened_on` | some |
| Documents | 130, unevenly spread, 2 withdrawn | 5 |
| Calendar events | ~18: hearings, deadlines, meetings, past and future | ~3 |

Every name is invented. There is no real company and no real person in this data.

**The second firm is deliberately thin.** It exists so that switching firms visibly changes the
data, which is how a reviewer *checks* tenant isolation rather than taking it on trust.

## MinIO, and what fails without it

Document rows are always written. The bytes behind them need the object store, and on
2026-09-25 `quay.io` refuses the pinned `minio/minio` and `minio/mc` images with `401
Unauthorized` (Docker Hub pulls work, so it is not a proxy).

When the store is unreachable the command:

- writes **every** database row,
- names the documents whose bytes are missing,
- exits **non-zero**.

Everything except document preview and download works normally in that state. When MinIO is
available again, re-run `npm run db:seed:demo`: it writes only the missing objects, because
every key is derived rather than generated.

## The two refusals

```bash
NODE_ENV=production npm run db:seed:demo
# refusing to seed the demo firm: NODE_ENV is production. …There is deliberately no override.

# …or with DATABASE_URL_MIGRATION pointing anywhere but a local host:
# refusing to seed the demo firm: the database host is db.prod.internal, which is not a local host.
```

Both happen **before any connection is opened**, so a refusal has written nothing. There is no
flag, environment variable or argument that gets past either — see `backend/drizzle/demo/guard.ts`,
which is eleven lines for exactly that reason.

## Re-running it

Safe and expected. Every insert has a conflict target on a real natural key and every id the
command chooses is derived from the row's own identity, so a second run writes no row, no
duplicate object, and prints the same credentials. `demo-seed.test.ts` asserts that by
fingerprinting eleven tables before and after a second run.

## What this does NOT do

- **It does not replace `npm run db:seed`.** That seed's two tenants are what the isolation suite
  reads; run both.
- **It does not set case outcomes.** The column does not exist yet — `015-kpi-dashboard` adds it
  and amends this command in the same slice (spec Decision 7). Until then a success rate cannot
  be computed from this data.
- **It does not walk the invitation flow.** `scripts/demo-invitation.ts` still does that, and is
  still the only way to exercise a person setting their own password.
