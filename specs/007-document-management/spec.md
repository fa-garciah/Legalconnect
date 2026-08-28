# Feature Specification: Case Documents

**Feature Branch**: `007-document-management`

**Created**: 2026-08-28

**Status**: Draft, rev. 3 — 0 open clarifications. All three closed 2026-08-28 as Decision 1, Decision 2 and Decision 3 (see Decisions) — the first two carried in from `plan.md`'s Phase 0 research, the third resolved directly; one resolved clarification recorded separately (US06); catalog amendments proposed

**Slice**: `007-document-management` — the number is identity, not execution order. Specified after `006-client-case-core`, which it attaches to.

**Epic**: EP04-DocumentManagement (DOC), plus new stories per Catalog Amendments

**Constitution**: v1.4.0

**Tier Classification**: Cross-cutting mechanism; **storage is the first quantitative entitlement limit this product enforces against a real feature** (Tier Entitlements: "users, storage, monthly CFDI issued"). No capability here is archetype-gated by tier — every internal archetype that can see a case can, per FR-013, work with its documents — but every upload is checked against the tenant's storage limit regardless of tier.

**Stories**: `US01-EP04-DOC-UploadDocumentToFolder`, `US02-EP04-DOC-PreviewDocumentInline`, `US03-EP04-DOC-OrganizeDocumentsByMatter`, `US06-EP04-DOC-AssignAccessPermissions` (resolved narrowly — see Resolved Clarifications), `US15-EP02-CSM-LinkDocumentsToCaseFile`, plus new stories per Catalog Amendments.

**Input**: `estado-specs.md`: *"Documentos del expediente."* Depends formally only on `017` per that table; in practice, every document attaches to a `Case`, which `006` supplies.

> **Citation convention.** Requirements of slices 001, 002, 004, 006 and 017 are cited
> as `001/FR-0NN`, `002/FR-0NN`, `004/FR-0NN`, `006/FR-0NN` and `017/FR-0NN`. Bare
> `FR-0NN` refers to this document.

---

## Why This Slice Matters More Than "Documents" Suggests

Two things close here that no prior slice could close on its own.

**It is the second slice to exercise `assigned` scope, and the first to exercise it by inheritance rather than by owning the relationship directly.** `006` registered the resolver and proved it against `Case`. A document has no assignment of its own — nobody is ever "assigned to a document." What a document has is a `Case`, and the case has a team. This slice's entire authorization story is one sentence: **a document's scope is its case's scope.** No new resolver, no new assignment table, no second source of truth for who may reach what.

**It is the first slice to make the storage limit real.** `004`'s Tier Entitlements section named three quantitative limits on day one — users, storage, monthly CFDI — and gave the mechanism a reader. Nothing has fed it a real number yet: user count is checked by invitation flows that predate 004's own completion, and CFDI is now out of MVP entirely (billing excluded, per the current commercial scope). Every document this slice stores has a byte size, and every tenant has a plan. This is where "storage" in that limit stops being a placeholder.

---

## A Document's Scope Is Its Case's Scope, Not Its Own

Stated before the requirements, the way `006` stated its own scope mechanics before its requirements, because it changes what a first reading of the Capability Matrix would suggest.

`004`'s `ScopeResolverPort` resolves a *(membership, target)* pair to yes or no. `006` registered the resolver for `assigned` and keyed it to a case ID. This slice needs the identical question asked of a *document* — but a document is not what the resolver knows how to answer.

The resolution is not a second resolver. It is a lookup performed **before** the scope check runs: given a document ID, read the one case it belongs to (FR-001 makes this reference mandatory and singular), and ask `006`'s existing resolver about *that* case ID. The document itself never becomes the scope target. This is why every document capability below declares `assigned` scope with a note reading "via case" rather than a document-specific kind — there is no document-specific kind, and inventing one would be a second mechanism answering a question `006` already answers.

One consequence worth naming: `006`'s Decision 2 (`MP` and `SA` satisfy the `assigned` resolver unconditionally) is inherited for free. This slice makes no independent decision about whether `MP` or `SA` can reach every document in the tenant — it reuses the same resolver call `006` already made that decision for, on the same case ID. Widening or narrowing that exemption is `006`'s decision to revisit, never this slice's to duplicate.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Upload a document to a case (Priority: P1)

An `MP`, `AA`, `PL`, `CM` or `SA` assigned to a case (or exempted per Decision 2, inherited) adds a file to it. Nothing else in this slice has anywhere to point until a document exists.

**Why this priority**: The root action. Every other story in this slice reads, organizes or withdraws something Story 1 created.

**Independent Test**: Upload a file against a case from `006`; read it back; confirm it carries the case reference, an uploader, and a timestamp; confirm a person not assigned to that case cannot upload to it.

**Acceptance Scenarios**:

1. **Given** a case the caller is assigned to (or `MP`/`SA`), **When** a file is uploaded against it, **Then** it is stored with a reference to exactly that case, the uploading membership, and the time of upload.
2. **Given** a case the caller is not assigned to, **When** an upload against it is attempted, **Then** it is refused, opaquely, indistinguishable from uploading to a case that does not exist — the same bucket `006/FR-016`–`FR-017` already established, reached here through the same resolver.
3. **Given** a tenant at its storage limit, **When** an upload is attempted, **Then** it is refused on entitlement, naming the limit reached, per `004/FR-024` — distinguishable from the scope refusal of scenario 2, because the two are different facts with different remedies (get assigned vs. upgrade plan).
4. **Given** a tenant of another firm, **When** any member of it attempts to read or reference this document, **Then** the attempt is refused and recorded as a cross-tenant access attempt, per `001/FR-011`.
5. **Given** a document uploaded with no category chosen, **When** it is stored, **Then** it receives the tenant's default "unclassified" category rather than being rejected for missing one (see Resolved Decisions).

---

### User Story 2 - Read, preview and download a case's documents (Priority: P2)

An `MP`, `AA`, `PL`, `CM` or `SA` who can reach a case can see what is filed on it and view a document's contents without a separate download step.

**Why this priority**: A document nobody can read is not a feature. Depends on Story 1 having produced something to read.

**Independent Test**: Upload two documents to a case; read the case's document list as an assigned member and confirm both appear; read it as an unassigned member and confirm an empty, non-error result; preview one document's contents inline; download it.

**Acceptance Scenarios**:

1. **Given** a case the caller is assigned to, **When** its document list is read, **Then** every document referencing that case is returned.
2. **Given** a case the caller is not assigned to, **When** its document list is read, **Then** the attempt is refused with the same opacity as Story 1 scenario 2 — this is a single named case's documents, not the multi-case list shape `006/FR-014` reserves for tenant-wide filtering, so a total refusal is the right shape here, not an empty result. *(Contrast: a member with no case assignments at all reading their own overall case list gets an empty result per `006`/SC-003; a member who is assigned to zero of *this specific* case's team gets a refusal, because they named one case directly rather than asking for everything they're entitled to.)*
3. **Given** a document the caller can reach, **When** they request to preview it, **Then** its contents render without requiring a separate file to be saved to their device first, for file types the product supports inline.
4. **Given** a file type with no supported inline preview, **When** preview is requested, **Then** the person is told plainly rather than shown a blank or broken viewer, and download remains available if download rights allow it (Open Question 2).
5. **Given** a document the caller can reach, **When** they download it, **Then** the download is audited as its own interactive access, distinct from a preview.

---

### User Story 3 - Organize documents by category (Priority: P3)

An `MP`, `CM` or `SA` files a document under the firm's own category — contract, evidence, correspondence, whatever the tenant's own catalog names — so a case's documents are browsable by kind, not only by upload order.

**Why this priority**: Depends on Story 1 having produced a document and, structurally, on the tenant's category catalog existing (seeded at provisioning, following `017`/`006`'s pattern) before anyone chooses from it.

**Independent Test**: Add a category to a tenant's catalog; assign it to a document; retire it; confirm the document keeps displaying its (now retired) category and the retired category is offered for no new document.

**Acceptance Scenarios**:

1. **Given** an `MP`, `CM` or `SA` and a document on a case they can reach, **When** they assign it a category from the tenant's own catalog, **Then** the document reflects it.
2. **Given** a category name that does not exist in the tenant's own catalog, **When** an assignment naming it is attempted, **Then** it is refused.
3. **Given** a category currently applied to one or more documents, **When** it is retired, **Then** those documents keep displaying it, marked retired, and it is offered for no new assignment — following `017/FR-007`–`FR-008` exactly.
4. **Given** a freshly provisioned tenant, **When** its document-category catalog is first read, **Then** it is already populated with a firm-agnostic default seed, immediately editable, including the "unclassified" default Story 1 scenario 5 relies on.
5. **Given** an `AA` or `PL`, **When** either attempts to change a document's category, **Then** it is refused — organizing is `MP`/`CM`/`SA`'s capability, matching the catalog's own naming of `CM` for this story and the narrower set `006`'s row 35 already used for a structurally identical catalog.

---

### User Story 4 - Withdraw and restore a document (Priority: P4)

An `MP` or `SA` removes a document from active use without destroying the record, and can bring it back.

**Why this priority**: Lowest priority because it is this slice's own addition, not a literal catalog story (see Catalog Amendments) — inferred from the retirement convention every prior slice established, not from an explicit US.

**Independent Test**: Withdraw a document; confirm it no longer appears in the case's active document list; confirm it remains resolvable to whoever could see it before, marked withdrawn; restore it; confirm both events are audited separately.

**Acceptance Scenarios**:

1. **Given** a document on a case the caller reaches, **When** an `MP` or `SA` withdraws it, **Then** it stops appearing in the case's active document list and is never hard-deleted.
2. **Given** a withdrawn document, **When** the same capability restores it, **Then** it reappears in the active list, and both the withdrawal and the restoration stand in the audit trail as separate events — mirrors `006`'s FR-004a exactly.
3. **Given** an `AA`, `PL` or `CM`, **When** any attempts to withdraw a document, **Then** it is refused — narrower than Story 3's organizing capability, mirroring `006`'s own narrower deactivate-vs-edit split for clients.

---

### Edge Cases

- **A document whose case is later withdrawn or closed.** Out of scope for this slice to define new behavior for — the document continues resolving through its case reference exactly as before; case closure is `006`'s own concern and carries no cascading effect here, mirroring `006`'s own refusal to cascade client deactivation onto cases (`006/FR-008`).
- **A category retired while documents reference it.** Resolved in Story 3 scenario 3 — displays, marked retired, unavailable for new assignment.
- **An upload that partially transfers before failing.** No partial document should ever become readable; a failed upload leaves nothing behind rather than a corrupt or incomplete record. (A `plan.md` concern for how the storage transfer is sequenced, stated here because the functional guarantee belongs in the spec even though the mechanism doesn't.)
- **A document exactly at the moment a tenant crosses its storage limit mid-upload.** The check MUST be evaluated against the size the completed upload would add, not only against the size already stored before it started — otherwise the last upload that crosses the limit succeeds and every one after it is refused for a boundary the accepted one already broke.
- **The same file uploaded twice, byte-for-byte.** Accepted as two distinct documents. No content-based deduplication in this slice; each carries its own upload event and its own audit trail, and a firm's own organizational habits (Story 3) are how it tells them apart, not a system-imposed uniqueness rule.
- **A file type the product cannot preview and also cannot safely determine the type of.** Falls into Story 2 scenario 4's "no supported inline preview" branch rather than a separate error — the person is not shown a technical failure for a case the product simply doesn't render.

## Requirements *(mandatory)*

### Functional Requirements

**Documents**

- **FR-001**: A document MUST reference exactly one case of its own tenant. This reference MUST NOT change after upload — moving a document to a different case is not a capability this slice provides.
- **FR-002**: A document MUST carry the uploading membership and the time of upload, and MUST NOT be attributable to an identity directly — mirrors `006/FR-010`'s and `017/FR-001`'s treatment of membership-scoped attribution.
- **FR-003**: A document's binary content MUST be stored consistent with the constitution's Data Residency constraints. This slice makes no technology choice here — that is `plan.md`'s decision, constrained by what the constitution already fixes.
- **FR-004**: A document MUST NOT be hard-deleted. Withdrawal (Story 4) is a status change; the record and its content persist.

**Scope, inherited rather than owned**

- **FR-005**: Every capability in this slice that reads or writes a **specific document**, or a **specific case's** document list, MUST declare scope kind `assigned`, resolved by looking up that document's (or that list's) case reference and invoking `006`'s existing resolver against it. This slice MUST NOT register a second `assigned` resolver and MUST NOT introduce a document-specific scope kind.
- **FR-006**: The lookup in FR-005 MUST occur before the scope decision, never after — a capability MUST NOT execute against a document's content and only afterward discover it should have been refused.
- **FR-007**: A scope refusal reached through FR-005 MUST be indistinguishable from the response for a document, or a case, that does not exist, exactly as `006/FR-016`–`FR-017` already require of the case-level refusal this slice's checks resolve through.
- **FR-008**: `006`'s Decision 2 exemption (`MP` and `SA` satisfy `assigned` unconditionally) applies to every capability in this slice by the same inheritance as FR-005 — this slice declares no independent exemption and no independent narrowing of it.

**Categories**

- **FR-009**: Each tenant MUST have its own document-category catalog, isolated from every other tenant's, following `017`'s catalog pattern exactly: seeded at provisioning with a firm-agnostic default (including an "unclassified" entry), immediately editable, and never hard-deleted (`017/FR-006`–`FR-009`).
- **FR-010**: A document uploaded with no category chosen MUST receive the tenant's default "unclassified" category rather than being rejected for missing one.
- **FR-011**: A category assignment naming an entry absent from the tenant's own catalog, or belonging to another tenant's catalog, MUST be refused.
- **FR-012**: A retired category MUST remain resolvable on every document already referencing it and MUST be offered for no new assignment, following `017/FR-008` exactly.

**Storage entitlement**

- **FR-013**: An upload MUST be checked against the tenant's storage quantitative limit before it is accepted, evaluated against the size the completed upload would add to the tenant's total, not only against the size already stored. A refusal on this ground MUST name the limit reached, per `004/FR-024`, and MUST be distinguishable from a scope refusal (FR-007) — different fact, different remedy.
- **FR-014**: The storage total against which FR-013 checks MUST be read from live data at the time of the check, never cached, matching `004/FR-027`'s requirement of every other entitlement read in the product.
- **FR-015**: Withdrawing a document (Story 4) MUST NOT reduce the tenant's counted storage total — the content is retained (FR-004), and a withdraw-then-reupload cycle MUST NOT be usable to evade FR-013. *(Whether a withdrawn document's storage is billed differently from an active one is a `plan.md` / commercial question, not an architectural one this FR takes a position on beyond "still counted.")*

**Access**

- **FR-016**: Reading, previewing and downloading a document the caller can reach MUST each be available to every internal archetype except `BM`, mirroring `006`'s own exclusion of `BM` from case content on Principle VI minimisation grounds — billing has no need to know a matter's documents.
- **FR-017**: Organizing a document's category (Story 3) and withdrawing or restoring one (Story 4) MUST be narrower than reading — `MP`/`CM`/`SA` for organizing, `MP`/`SA` for withdraw and restore — matching the create/update-vs-deactivate split `006` already drew for clients.
- **FR-018**: `US06`'s literal wording ("assign access permissions... per role") is satisfied entirely by this slice's fixed Capability Matrix rows plus `004`'s existing archetype-assignment capability (row 7); this slice defines no per-tenant, per-document or runtime-configurable permission editor. See Resolved Clarifications.

**Audit**

- **FR-019**: Every mutation in this slice — upload, category change, withdrawal, restoration, category catalog entry created or retired — MUST emit exactly one audit entry carrying actor, subject, and, for a change, the previous and new values, following `006/FR-022`'s pattern.
- **FR-020**: Opening one named document for preview, and downloading one, MUST each be audited as their own distinct interactive access, per the constitution's Principle V naming documents explicitly among the entities whose *access* (not only modification) is recorded. Both MUST be channel-gated to interactive reads only, following `006/FR-023`'s gate, so automated traffic cannot inflate the log it is watching.
- **FR-021**: Reading a case's document **list** MUST NOT be audited, mirroring `006`'s own resolved reasoning exactly: a list read discloses only rows the caller is already scoped to, and opening one named document is the access a firm needs evidence of, not the enumeration.
- **FR-022**: This slice's new capabilities MUST be added to `004`'s capability registry and permission matrix in the same change, per `004/FR-021`. This slice MUST NOT define a parallel authorization mechanism.

### Capability Matrix extension *(required by Principle IV; extends `004`'s registry per `004/FR-021`, continuing `006`'s numbering)*

Deny by default. Rows continue the registry's numbering — 1–21 declared by `004`, 22–24 by `017`, 25–35 by `006`.

| # | Capability | Scope | MP | AA | PL | CM | BM | SA | PO |
|---|---|---|---|---|---|---|---|---|---|
| 36 | Upload a document to a case | `assigned` (via case) | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| 37 | Read a case's documents (list and preview) | `assigned` (via case) | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| 38 | Download a document | `assigned` (via case) | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| 39 | Change a document's category | `assigned` (via case) | ✅ | ❌ | ❌ | ✅ | ❌ | ✅ | ❌ |
| 40 | Withdraw a document | `assigned` (via case) | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| 41 | Restore a withdrawn document | `assigned` (via case) | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| 42 | Read the document-category catalog | `tenant` | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| 43 | Manage the document-category catalog | `tenant` | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |

Notes on this extension:

- **Rows 36–41 all declare `assigned`, and all resolve through `006`'s existing resolver via the document's case reference** (FR-005) — none registers a new resolver, and `MP`/`SA` satisfy every one of them unconditionally by the same inheritance (FR-008), not by a row-specific exemption.
- **Row 38 (download) is provisional as drafted** — granted the same set as row 37 (read) for lack of a signal to narrow it. See Open Question 2.
- **`BM` holds zero rows in this table**, matching `006`'s exact reasoning for excluding it from case content: billing needs a case *reference*, never case *content*.
- **Row 43 is `MP` + `SA`**, matching `006`'s row 35 and `017`'s row 23 exactly, for a structurally identical catalog.
- The four portal archetypes hold **zero** rows here, per `004/FR-020`; `PO` holds zero, per `004/FR-008`.

### Key Entities

- **Document**: References exactly one case (FR-001), carries the uploading membership, upload timestamp, a category (never null — FR-010), and an active-or-withdrawn status (FR-004). Tenant-scoped, transitively through its case.
- **DocumentCategory**: A tenant-defined catalog entry carrying a name and an active-or-retired status, seeded with a firm-agnostic default including "unclassified" (FR-009). Structurally identical to `006`'s `CaseStatus`/`MatterType`/`Venue` and `017`'s `Position`.

This slice adds two tables. It changes no table owned by 001, 002, 004, 006 or 017. It extends the shared capability registry, permission matrix and audit action vocabulary, each in the same change that needs it (FR-019, FR-022).

## Success Criteria *(mandatory)*

- **SC-001**: 100% of uploads succeed only against a case the caller is assigned to or exempted for (Decision 2, inherited); 0% succeed against any other case.
- **SC-002**: 100% of scope refusals reached through this slice (upload, read, download, organize, withdraw, restore) are byte-identical to the response for a nonexistent document or case; 0% disclose which.
- **SC-003**: An upload that would exceed the tenant's storage limit is refused in 100% of trials, naming the limit reached; an upload that would not exceed it succeeds in 100% of trials, evaluated against the size the completed upload would add.
- **SC-004**: 100% of cross-tenant access attempts against a document or a category catalog entry are refused and recorded as cross-tenant access attempts; 0% succeed.
- **SC-005**: A retired category remains resolvable on 100% of documents already referencing it and is offered for 0% of new assignments.
- **SC-006**: A withdrawn document is absent from its case's active document list in 100% of trials, remains resolvable to a prior viewer marked withdrawn, and is never hard-deleted.
- **SC-007**: A document withdrawn and then restored is visible in its case's active list again in 100% of trials, with 2 distinct audit entries recording the round trip.
- **SC-008**: 100% of uploads, category changes, withdrawals and restorations produce exactly 1 audit entry carrying actor, subject and, where a value changed, both its previous and new value.
- **SC-009**: 100% of interactive single-document previews and downloads produce exactly 1 audit entry each; 100% of automated ones produce 0, per FR-020's channel gate; 0% of document-list reads are audited.
- **SC-010**: A newly provisioned tenant's document-category catalog contains the default seed, including "unclassified," and is immediately editable, with 0 manual setup steps before the first upload.
- **SC-011**: `BM` and each of the four portal archetypes and `PO` are refused every one of this slice's eight capabilities, asserted individually rather than inferred, mirroring `004/SC-004`'s and `006/SC-010`'s method.
- **SC-012**: The existing suites of 001, 002, 004, 006 and 017 pass unchanged — 0 regressions.

## Resolved Clarifications

### US06 — What "assign access permissions per role" means against the as-built architecture

**The conflict.** The catalog names `US06-EP04-DOC-AssignAccessPermissions` as an `SA` capability to configure *"view/edit/download rights per role."* Read literally, this asks for a runtime, per-tenant permission editor. `004`'s Decision 4 already resolved the general version of this question — archetypes and their capabilities are a compile-time constant, identical for every tenant, specifically so the matrix stays exhaustively testable and so Principle III holds. A per-tenant permission editor for documents would reopen exactly the question Decision 4 closed, for one epic only.

**Resolution: satisfied without new mechanism.** Rows 36–41's differentiated archetype grants **are** "rights per role" — view, download and organize are already independently assignable per archetype, declared once, product-wide. The runtime lever the story actually wants — an `SA` deciding what one particular person may do — already exists one layer up: `004`'s own row 7, changing a member's archetype. `US06` asked for a knob; the product already has one, and it is not a document-specific one.

**Consequence.** No new capability, no per-document ACL, no per-tenant override table. `US06` needs no catalog amendment — like `017`'s Q1 treatment of `US03-EP03-CLM`, the story is satisfied by reading it at the grain the architecture actually supports rather than the grain it was written at.

## Resolved Decisions

- **Default category seed, including "unclassified."** Mirrors `006`'s and `017`'s seeding precedent exactly, with the addition that an upload naming no category must still succeed (FR-010) — a firm-agnostic default that is always present is what makes that possible without a special-cased null.
- **Retirement, never deletion**, for both documents (withdrawal) and category entries — extends the convention 001, 002, 004, 006 and 017 already established (FR-004, FR-012).
- **Scope is inherited from the case, never owned by the document.** Stated at length above; recorded here as a decision because a future reader could otherwise "fix" a document row to a document-specific scope kind and quietly duplicate `006`'s mechanism.
- **Storage counts a withdrawn document.** FR-015. Reversible withdrawal that also freed storage would make the limit gameable by withdraw-and-reupload cycling; the cost is a tenant's storage total not shrinking when they tidy up, which is judged the lesser problem.

## Decisions

### Decision 1 — Flat, tenant-wide category catalog, not a folder hierarchy *(resolved 2026-08-28)*

**Resolved: option (a).** `US03`'s "organize by case and subfolder" is satisfied by the
flat, tenant-wide `DocumentCategory` catalog as drafted (FR-009–FR-012), not a real
per-case, user-created folder hierarchy.

**Rationale.** Consistent with `006`'s own instruction that this slice's catalog gap
"should resolve it the same way" as `006`'s three catalogs — tenant-scoped, seeded,
retired-not-deleted. A nested, per-case, user-authored folder tree is a materially
larger build (arbitrary depth, rename, move-with-contents, empty-folder states) with no
catalog precedent anywhere in this product. The rejected alternative — a real folder
hierarchy — was closer to what a firm used to a shared drive might expect, but needed
its own data model and its own spec section, and was never scoped as a catalog by
`006`'s framing. Carried in from `plan.md`'s Phase 0 research (D1); no requirement or
success criterion above changes as a result — FR-009–FR-012 already described exactly
this shape.

### Decision 2 — Download rights equal read rights (row 38 = row 37) *(resolved 2026-08-28)*

**Resolved: option (a).** Downloading a document (row 38) is granted the identical
archetype set as reading/previewing it (row 37): `MP`, `AA`, `PL`, `CM`, `SA`. No
narrower grant for download.

**Rationale.** No catalog story or prior slice narrows it, and inventing a restriction
without a stated reason would be speculative scope in the direction this project's own
precedent (`017`'s Decision 2, `006`'s Decision 2) consistently avoids. The rejected
alternative — a narrower download right (e.g., a paralegal views inline but cannot take
a copy) — is a real, common law-firm control this product's catalog simply does not
name; if it turns out to matter, it is a one-row change to the Capability Matrix later,
following the same FR-022 discipline every other slice already does. Carried in from
`plan.md`'s Phase 0 research (D2); the Capability Matrix's row 38 already reads this
way — this decision makes "provisional" in that row's note no longer operative.

### Decision 3 — Malware/virus scanning deferred out of MVP scope *(resolved 2026-08-28)*

**Resolved: deferred.** Real content-based malware/virus scanning on upload is out of
scope for this slice and for MVP generally. It is not addressed anywhere in the
constitution, the catalog, or any prior slice, and building it here would mean
committing to a scanning provider and an infrastructure cost nobody has evaluated.

**What still applies regardless of this decision.** An allowed MIME-type and extension
list (documents, images, common Office formats — no executables, scripts, or archive
formats that can contain them) is ordinary input validation, not malware scanning, and
remains in scope as table-stakes upload validation (FR-001's implicit "a document" is
a file of a kind this product recognises) — it costs nothing and closes the crudest
attack class independent of whatever this decision resolves.

**Consequence.** Recorded as recognized technical debt, the same category `004`'s own
Technical Debt section already tracks rather than silently inherits — real content
scanning is a future slice's concern if/when the constitution or a client requirement
brings it into scope, not a gap this spec pretends does not exist.

## Open Questions

None. All three clarifications are closed — see Decisions above.

## Catalog Amendments Required Before Any PR Opens

Principle I: a story not in `master-user-story-catalog.md` does not exist.

| Amendment | Why |
|---|---|
| **New** — withdraw/restore a document, EP04-DOC | No story covers this; inferred from the retirement convention every prior slice established (Resolved Decisions). Next available `EP04-DOC` number after `US16`. |
| **New** — document-category catalog management, EP10-CFG | Same gap `006` and `017` each closed for their own catalogs. Exact number depends on what `017`'s `US11`–`13` and `006`'s own proposed EP10-CFG addition actually land as in the catalog file — reconcile there, not from this document's arithmetic. |
| **No amendment** — `US06-EP04-DOC-AssignAccessPermissions` | Resolved narrowly against existing mechanism; see Resolved Clarifications. |

## Assumptions

- **A single-file size ceiling exists but its number is a `plan.md` / commercial decision**, not fixed here — analogous to how the transactional email provider was `002/plan.md`'s decision, not the constitution's.
- **`US15-EP02-CSM-LinkDocumentsToCaseFile`'s "auto-link"** is satisfied by FR-001's mandatory, immutable case reference at upload time — there is no separate "link" step to specify.
- **No capability in this slice is tier-gated by archetype.** The one tier-sensitive mechanic is the storage quantitative limit (FR-013), which is entitlement, not permission, and applies identically regardless of which of the three igualas the tenant holds.
- **No capability in this slice requires step-up MFA.** The constitution's step-up list names *full case export* (`US14-EP04-DOC`, IT3, not this slice) — ordinary upload, read, download and organize are not on that list.
- **Client-portal visibility of any document is out of scope.** Portal archetypes hold zero rows here (FR-016's exclusion list plus `004/FR-020`); EP13 remains unvalidated.

## Dependencies

| On | For | Status |
|---|---|---|
| `001-tenant-foundation` | Tenant isolation, audit log, data-residency constraints | Satisfied — built |
| `002-identity-membership` | Membership, which upload attribution references | Satisfied — built |
| `004-authorization-entitlements` | Capability registry, decision function, storage entitlement mechanism | Satisfied — built |
| `006-client-case-core` | `Case`, `CaseAssignment`, the `assigned` resolver this slice reuses without registering its own | **Drafted, rev. 2, not yet approved** — four decisions outstanding. If `006`'s Decision 2 (blanket `MP`/`SA` visibility) or Decision 4 (opaque scope refusal) is rejected on sign-off rather than accepted, FR-007 and FR-008 here need revisiting in lockstep, the same way `016a`'s rev. 3 already adopted Decision 4's outcome ahead of that sign-off |
| `017-firm-directory` | Catalog pattern precedent only, per `006`'s own disclaimer for its own catalogs | Satisfied — built. Not a source of `DocumentCategory` |
| `016a-frontend-shell` | Renders this slice's screens inside its shell; exercises its opaque-bucket classifier a second time (after `006`), testing nothing new for it | Satisfied — drafted, rev. 3 |

## Out of Scope

Bulk upload (`US11`, IT2). Keyword and filename search (`US05`, IT2). Sharing a document with a client (`US04`, IT2 — also EP13-adjacent). Replacing a document's content / version history (`US08`, `US07`, IT2/IT3). Tagging beyond category (`US10`, IT3). Upload notifications to the team (`US12`, IT3). Confirming who viewed a shared document (`US13`, IT3). Exporting all of a case's documents as a folder (`US14`, IT3 — also requires step-up MFA per the constitution, unavailable before slice 005). Mobile-native access (`US16`, IT3 — also a native-app MVP prohibition). Client-portal visibility of any of this (EP13, unvalidated). Malware/virus scanning (Decision 3 — deferred as recognized technical debt; a MIME-type/extension allowlist remains in scope as ordinary validation). A real nested folder hierarchy (Decision 1). The exact numeric storage ceiling per tier (a `plan.md` / commercial decision). Moving a document to a different case after upload (FR-001).

## Approval Checklist

- [x] All three `[NEEDS CLARIFICATION]` items closed — Decision 1 (flat catalog), Decision 2 (equal download rights) and Decision 3 (malware scanning deferred), 2026-08-28
- [ ] No implementation or technology detail in this document
- [ ] Every requirement is test-verifiable
- [ ] Cross-tenant leak test defined and accepted (Principle II) — SC-002, SC-004
- [ ] Audit events enumerated per operation (Principle V) — FR-019–FR-021, SC-008–SC-009
- [ ] Capability Matrix extension declared and added to `004`'s registry in the same change (Principle IV, FR-022, `004/FR-021`)
- [ ] Tier classification declared (Tier Entitlements) — cross-cutting, with storage as the first live quantitative limit
- [ ] Catalog Amendments table actioned in `master-user-story-catalog.md` before any PR opens (Principle I)
- [ ] Dependency on `006`'s outstanding Decisions 2 and 4 tracked to resolution, not merely noted
- [ ] Approved by Cosmic Chimps technical lead
