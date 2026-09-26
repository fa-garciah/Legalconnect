# Quickstart — the KPI dashboard

**Slice**: `015-kpi-dashboard` · **Written by hand**, 2026-09-26 (T030)

`/kpis` answers the partner's question — *how is the firm doing?* — from the matters already in
the database, and says **"Sin datos"** rather than `0` everywhere it cannot.

---

## Seeing it

```bash
cd backend
npm run db:up && npm run db:migrate && npm run db:seed
npm run db:seed:demo          # 022 — 40 matters over six quarters, about half of them closed
npm run dev                   # API on 3001

cd ../frontend
npm run dev                   # app on 3000
```

`npm run db:migrate` must include **0047** (`case_outcome`): without it `/kpis` still renders,
but the success rate is permanently "Datos insuficientes" because there is nowhere to record how
a matter ended.

Sign in with the credentials `npm run db:seed:demo` printed (see
[`022`'s quickstart](../022-demo-firm-seed/quickstart.md)) and open **KPIs** in the navigation —
an entry that until this slice was inert text marked *Pronto*.

## What to try, and what each thing shows

| Do this | What it demonstrates |
|---|---|
| Sign in as **Alejandro Méndez** (`MP`) and open `/kpis` | Three tiles and two tabs, computed over the whole firm. The default period is the current quarter |
| Read the **Asuntos activos** tile | It carries **no** change-vs-previous, and that is deliberate: an active count is a fact about today and the product keeps no historical snapshot to compare it against |
| Read **Tiempo promedio de resolución** | The figure, its change in months, and the number of matters it was computed from. An average of one matter and an average of forty look identical without that |
| Read **Tasa de éxito** | A percentage whose change is in **points** (`pp`), not per cent — "+14 %" of a percentage is ambiguous and this is the number people quote |
| Switch the period to **Último año** | Every figure is recomputed on the server. The active count does not move (it is about today); the samples grow |
| Scroll to **Asuntos por responsable** | Bars labelled by the firm's own positions — *Socio*, *Asociado Senior* — never by email. There is a **Sin responsable** bar for matters nobody leads |
| Read the table under any chart | The same numbers as the bars, as a real `<table>` with a caption. It is the accessible contract (FR-012), and it is also what survives being pasted into an email |
| Open the **Asuntos** tab | Success rate by matter type, each rate travelling with the number of matters behind it |
| Sign in as **Laura Ramírez** (`AA`) | **No KPIs entry in the navigation**, and typing `/kpis` gives *"Tu rol actual no permite esta acción."* — the link being hidden is cosmetic; the server is what refuses |

### The archetypes, at a glance

| Archetype | `/kpis` |
|---|---|
| `MP`, `CM`, `SA` | The whole firm's figures |
| `AA`, `PL` | **No navigation entry, and the endpoint refuses (403).** They see their own matters, not the firm's shape |
| `BM` | The same refusal. Aggregates over matters are matter content (Principle VI) |

This is narrower than any other tenant read in the product, and Decision 4 in the spec records
why: a firm-wide aggregate summarises **every** matter, including the ones the reader is not on,
so only the three archetypes that already see every matter may read one.

## Declaring how a matter ended

The success rate has exactly one source, and it is not derived from anything:

1. Open **Expedientes**, open a matter whose status is a closing one (*Concluido*).
2. Below *Cambiar estado*, **Declarar resultado** offers four values — *Favorable*,
   *Desfavorable*, *Convenio*, *Sin resolución*.
3. The control appears **only on a closed matter**, because `case_file_outcome_requires_closed`
   refuses a declaration on an open one. Offering the choice would be inviting a `400`.
4. A declaration can be corrected later; there is no way to un-declare, because *undeclared* is
   where a matter starts, not somewhere it can be sent back to.

`022`'s demo firm arrives with its closed matters already declared, unevenly by practice area, so
the by-type chart is not five identical bars.

## The API

```
GET /tenant/kpis?period=month|quarter|year
→ { period, activeCases, averageResolutionMonths, successRate,
    casesPerAttorney, successRateByMatterType, resolutionTrend }
```

- **Every numeric field is `number | null`.** `null` means the server has no answer — no matter
  closed in that quarter, a rate below the reporting floor, a delta with nothing to compare
  against. A `0` would mean *resolved instantly*, or *unchanged*, and the screen must not say
  either by accident.
- Aggregated **in Postgres**, one row per group, never by paging rows into Node.
- `casesPerAttorney` carries a `position`, never an email: `kpi.read` does not imply
  `membership.read_tenant`, and an aggregate should hold no personal data at all (Decision 10).
- The headline success rate is **withheld below five declared outcomes** (FR-009) and says how
  many are missing. The by-type breakdown deliberately has **no** floor (FR-009a) — one floor for
  both made every bar on `022`'s firm read "Datos insuficientes", a correct refusal that
  demonstrated nothing.
- Periods are computed in `America/Mexico_City`, so a quarter that ends at 23:00 on the last day
  lands in the closing quarter and not the next one.

## What is deliberately absent

The mockup this screen was built from shows a fourth tile, **Ingresos**, and a third tab,
**Financiero**. Neither is here. There is no invoice, payment, quote or time-entry table anywhere
in the schema and `010-billing-core` is unwritten, so a revenue tile could only read `$0` — and a
`$0` in the most prominent position on a dashboard invites exactly one interpretation, which is
false. Spec Decision 2 records this, and `KpiDashboard.test.tsx` asserts the absence, because a
future reader looking at the mockup will otherwise assume they were forgotten.

## Things that surprised us, recorded so they surprise nobody twice

- **A per-group floor of five destroyed the by-type chart.** Applying FR-009's floor to the
  breakdown as well made every bar on the demo firm read "Datos insuficientes". The fix was a
  spec amendment (FR-009a), not a quiet code change — a missing requirement goes into `spec.md`.
- **Drawing the demo outcome from the RNG corrupted developers' databases.** Consuming one extra
  random number per matter shifted the whole stream, so an *open* matter on disk received a
  *closed* matter's outcome and `case_file_outcome_requires_closed` refused the write. The
  outcome is now derived from a hash of the file number, which leaves `022`'s firm unchanged.
- **The demo seed's upsert omitted `opened_on`.** Re-seeding on a later day moved a matter's
  opening date (the generator clamps it to the seed date) while keeping the previous run's
  closing date — one matter ended up closed nine days before it opened, feeding a negative
  duration into an average presented as months. The upsert now writes the whole generated tuple,
  and `demo-matters.test.ts` asserts the invariant across five different clocks.
- **The sign-in throttle is per origin and in-memory**, five attempts per fifteen minutes
  (`sign-in.service.ts`). `kpis.spec.ts` signs in twice for the whole file — once as the `MP` and
  once as the `AA` — for this reason. Restarting the backend clears it.

## Known debt this slice did not take on

- **EP01's Dashboard Principal (`/`) is untouched.** It remains the placeholder `016a` shipped.
  This slice builds EP06's dedicated screen only; folding these figures into the home page is a
  separate decision about what a firm sees first.
- **Positions, not names.** No table in this product stores a person's display name, so the
  workload chart is labelled by the firm's own positions and two people sharing one are told
  apart by a short id fragment. This disappears the day any slice stores a name; it is recorded
  in the spec rather than papered over.
- **No revenue, no billing, no time.** See *What is deliberately absent*. `010-billing-core`
  unblocks the two hidden figures; nothing in this slice anticipates it.
