# tools/demo-video

Two scripts that drive a running LegalConnect with the demo firm loaded (`backend/drizzle/seed-demo.ts`).
They use the Playwright already installed for `frontend/`, so run `npm ci` in `frontend/` first.

| Script | What it does | Output |
| --- | --- | --- |
| `smoke.mjs` | Signs in as each of the six demo roles (password + TOTP) and opens every section, recording API errors, console errors and a screenshot per page | `out/smoke/report.json` and one `.png` per role and section |
| `record.mjs` | Records the narrated demo from the "Guion de demostración": captions, a visible cursor and title cards are drawn into the page | `out/video/legalconnect-demo.webm` (about 3 minutes, 1440×900) |

```bash
node tools/demo-video/smoke.mjs  http://localhost:4100
node tools/demo-video/record.mjs http://localhost:4100
```

The base URL defaults to the local rehearsal (`http://localhost:4100`). Both scripts sign in with the
fixed demo credentials of `backend/drizzle/demo/firm.ts`, so they only work against a database the demo
seed loaded — never point them at a firm's real data.

`record.mjs` creates matter `EXP-2026-3001` as the case manager. File numbers are unique per firm: to
record again without re-seeding, pass another one, e.g. `DEMO_FILE_NUMBER=EXP-2026-3101`.

Found with `smoke.mjs` on 2026-11-27, all fixed: the sign-in throttle refusing the sixth person to sign
in from one address, Registro de Horas linking matters to a page that does not exist, and a
"Reintentar" offered under role refusals.
