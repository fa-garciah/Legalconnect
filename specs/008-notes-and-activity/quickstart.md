# Quickstart — Case Notes and Case Activity

Results: [quickstart-results.md](./quickstart-results.md).

## Setup

`npm run db:up && npm run db:migrate && npm run db:seed:demo` in `backend/`, then `npm run dev` in
both. Sign in with the demo credentials `db:seed:demo` prints.

## Scenarios

| # | As | Do | Expect |
|---|---|---|---|
| Q1 | AA (Jorge González) | Open a matter he is on → "Notas" | Seeded notes grouped by month, author by position |
| Q2 | AA | Write "Audiencia diferida al 20" and save | Top of this month; "Corregir"/"Eliminar" shown |
| Q3 | AA | Correct it, then delete it | Text changes; then gone from the list (row kept, voided) |
| Q4 | AA | Open "Actividad" on the same matter | "Escribió una nota", "Corrigió una nota", "Eliminó una nota" — no note text |
| Q5 | MP | Change the matter's status, upload a document | Both appear in Actividad; the status change names no old/new value |
| Q6 | AA | Open a matter he is not on, by URL | Not available (404) on both pages |
| Q7 | BM | Open the case panel | No "Notas" or "Actividad" (BM has no case access at all) |
| Q8 | SA | Open a matter | "Actividad" yes, "Notas" no |
| Q9 | any | A seeded, untouched matter's Actividad | Empty state — the seed writes no history |
