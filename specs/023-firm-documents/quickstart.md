# Quickstart — the firm's documents

**Slice**: `023-firm-documents` · **Written by hand**, 2026-09-25 (T030)

`/documentos` answers the question `021` could not: *where is the dictamen?* — without first
remembering which matter it was filed under.

---

## Seeing it

```bash
cd backend
npm run db:up && npm run db:migrate && npm run db:seed
npm run db:seed:demo          # 022 — a firm with 128 active documents across 40 matters
npm run dev                   # API on 3001

cd ../frontend
npm run dev                   # app on 3000
```

Sign in with the credentials `npm run db:seed:demo` printed (see
[`022`'s quickstart](../022-demo-firm-seed/quickstart.md)) and open **Documentos** in the
navigation — an entry that until this slice was inert text marked *Pronto*.

## What to try, and what each thing shows

| Do this | What it demonstrates |
|---|---|
| Sign in as **Alejandro Méndez** (`MP`) and open `/documentos` | 128 documents, newest first, each card naming its matter. `MP` is unrestricted |
| Sign in as **Jorge González** (`AA`) and open the same page | 48. Not a refusal, not an error — a shorter list and a **smaller count**, because both obey the same assignment predicate |
| Type `dictamen` in the search box | The count drops to 6. It filters on the server, not in the browser — which is why the count moves |
| Type `EXP-2026-20` | 79. The search covers the **matter's** file number as well as the document's name |
| Type `50%` | One document, the one actually called *Convenio 50%…*. Unescaped, `%` is a wildcard and this would return all 128 |
| Switch to the list view, reload | The layout is remembered per viewer, in this browser only |
| Filter by a type, then clear | "Limpiar filtros" appears whenever filters empty the list |
| Press **Subir documento** | The matter is asked for **first**, and only matters you can reach are offered |

### The archetypes, at a glance

| Archetype | `/documentos` |
|---|---|
| `MP`, `SA` | Every document in the firm |
| `AA`, `PL`, `CM` | Only documents of matters they hold a live assignment on |
| `BM` | **No navigation entry, and the endpoint refuses.** `BM` holds none of the nine `document.*` capabilities |

`PL` and `CM` on the demo firm hold no assignments, so they see an **empty list** rather than a
refusal. That distinction is the reason `document.read_list` is `tenant`-scoped — see the spec's
Decision 1.

## The API

```
GET /tenant/documents?q=&categoryId=&caseId=&limit=&cursor=
→ { items: [...], nextCursor: string | null, total: number }
```

- `total` is the whole filtered set **under the caller's own scope**, not the firm's total. It is
  what the screen prints as "N documentos".
- Every item carries `caseId` and `caseFileNumber`; it deliberately does **not** carry the
  client's name, though the join would make it free (Principle VI minimisation).
- A well-formed `categoryId`/`caseId` that matches nothing yields an empty list, never a refusal
  — a refusal would let a caller probe for ids.
- Withdrawn documents never appear. `021`'s withdrawn list stays per case.

## Things that surprised us, recorded so they surprise nobody twice

- **The sign-in throttle is per origin and in-memory.** `sign-in.service.ts:95` allows five
  attempts per fifteen minutes from one origin, refusing with the same uniform message a wrong
  password gets. A burst of local API experiments, or an e2e spec that signs in once per test,
  trips it — and the symptom (stuck on `/ingresar` or `/verificar`) says nothing about the cause.
  Restarting the backend clears it. `firm-documents.spec.ts` signs in once for the whole file
  for exactly this reason.
- **The count is absent, not zero, while loading.** Printing "0 documentos" during the request is
  a confident wrong answer; the e2e spec caught it doing so and the component now renders no
  count until the server has given one.

## Known debt this slice did not take on

- `frontend/src/app/documents/` is English while every route is Spanish. It holds `021`'s API
  client, which this slice extends; renaming it would touch every `021` import for no behaviour
  change. Recorded in `plan-paralelo-2026-09.md` §2 and in the spec's Out of Scope.
- `%` and `_` are still unescaped in `006`'s and `018`'s searches. This slice escapes them in its
  own (FR-008) and does not fix the others inside its diff.
