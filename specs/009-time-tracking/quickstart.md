# Quickstart — Recording Time

**Feature**: `009-time-tracking` · Results go in [quickstart-results.md](./quickstart-results.md),
each scenario marked verified or not verified, by name.

## Setup

```bash
cd backend
npm run db:up && npm run db:migrate && npm run db:seed && npm run db:seed:demo
npm run dev                       # :3001
cd ../frontend && npm run dev     # :3000
```

Sign in with the demo credentials printed by `db:seed:demo` (`022` quickstart).

## Scenarios

| # | As | Do | Expect |
|---|---|---|---|
| Q1 | AA (Laura Ramírez) | Open the menu | "Registro de Horas" is a link; `/horas` shows this week with entries from the seed and a total |
| Q2 | AA | Choose a matter, "Iniciar cronómetro", reload the page | The timer is still running with the same start |
| Q3 | AA | "Detener y registrar" with a description | Entry under today, ≥ 1 min, label "Cronómetro"; timer card back to idle |
| Q4 | AA | Start a timer in two tabs | The second is refused: "Ya tienes un cronómetro en marcha" |
| Q5 | AA | "Registrar horas": yesterday, 1 h 30 min, description | Entry under yesterday, "1 h 30 min", "Manual"; totals grow by 90 |
| Q6 | AA | Same dialog with tomorrow / 0 min / 25 h / blank description | Refused before sending |
| Q7 | AA | "Corregir" the 1 h 30 min entry to 45 min | Saved; audit row `time_entry.corrected` with `{"changed":["minutes"]}` only |
| Q8 | AA | "Eliminar" it, confirm | Gone from list and totals; row still in `time_entry` with `voided_at` |
| Q9 | AA | Look at a seeded entry older than a day | No "Corregir" / "Eliminar" |
| Q10 | AA | "Semana anterior", "Este mes", a custom 70-day range | Ranges load; 70 days refused before sending |
| Q11 | MP | Open `/horas` | Only the MP's own entries |
| Q12 | BM, SA | Open the menu; request `/tenant/time-entries` directly | No entry; `403` |
| Q13 | CM | Unassign the AA from a matter with an AA entry | The AA's timesheet and totals drop that entry on reload |
| Q14 | any | `/configuracion` → matrix | A "Registro de horas" group with four read-only rows |
| Q15 | phone width | `/horas` at 390 px | No horizontal scroll; timer card and list stack |

## Automated

`backend`: `npm run lint && npm run typecheck && npm test -- --coverage`, plus `test:isolation`,
`test:rls`, `verify:role`, `test:auth-coverage`.
`frontend`: `npm test && npm run typecheck && npm run lint && npm run build`, and
`npx playwright test tests/e2e/horas.spec.ts` against the stack above.
