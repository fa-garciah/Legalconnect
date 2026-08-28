# LegalConnect MX — Master User Story Catalog

**Version:** 1.2 | **Date:** 2026-08-21 | **Constitution:** v1.4.0
**Naming:** `US<NN>-EP<NN>-<ModuleCode>-<ActionDescription>` (Development Handbook)

This document is the reconciled single source of truth for the backlog. It
supersedes `1. Epics.md` as the epic index.

**Slice column:** MVP / IT2 / IT3 per Story Mapping · FND = foundation,
mandatory before any business feature · TBD = not yet sliced · DFT = draft,
pending Discovery.

**Archetype codes** are fixed by Constitution v1.4.0 Principle IV: PO (CC Platform
Operator), MP, AA, PL, CM, BM, SA internal; CC (Corporate Client),
IC, CB, EL portal. PO replaced the earlier overloaded use of CC for the
vendor role.

---

## Epic Index

| Ref | Code | Epic | US | Status |
|---|---|---|---|---|
| EP00 | FND | Platform Foundation | 16 | **NEW** — was missing entirely; +US16 on 2026-08-21 |
| EP01 | DSH | Dashboard | 11 | Existing |
| EP02 | CSM | Case Management | 14 | Existing + 3 new; +US14 and US08 retitled (006) |
| EP03 | CLM | Client Management | 7 | Existing + US07 (006) |
| EP04 | DOC | Document Management | 16 | Existing |
| EP05 | CAL | Calendar & Scheduling | 10 | Renamed from ViewUpcomingEvents |
| EP06 | KPI | KPI Dashboard | 9 | Renamed from ViewOverallKPIs + 1 new |
| EP07 | JCN | Judicial Connectors | 9 | Existing — **out of MVP, Fase 2** |
| EP08 | TTK | Time Tracking | 13 | Existing — **scope conflict open** |
| EP09 | BIL | Billing | 12 | Existing |
| EP10 | CFG | System Configuration | 16 | Existing + 3 new (017) + 3 new (006) |
| EP11 | PMG | Profile Management | 3 | Existing |
| EP12 | ASC | Account Security | 19 | **REWRITTEN** — was 2 US; +US18–US19 on 2026-08-21 |
| EP13 | PTL | Client Portal | 10 | Renamed from CommunicationChannel — **unvalidated** |
| EP14 | NOT | Note Management | 5 | **NEW** — fills numbering gap |
| EP15 | QTE | Quote Management | 6 | **NEW** — fills numbering gap, referenced by EP16 |
| EP16 | CCT | Cost Center | 4 | Existing — **DRAFT** |

**Total: 173 user stories** — 168 as counted on 2026-08-26, plus the 5 slice
`006-client-case-core` adds (`US14-EP02`, `US07-EP03`, `US14`–`US16-EP10`). `US08-EP02` was
retitled, not added, so it does not move the total.

> **Reconciliation note (2026-08-26, slice 006).** Slice 006 corrected the total and its
> own three epic rows (`EP02` 13→14, `EP03` 6→7, `EP10` 13→16), following exactly the scope
> 017 set below: a slice fixes the catalogue-wide total and the rows it touches, and leaves
> the rest to whoever owns them. It did **not** re-derive `EP00`, `EP06` or `EP12`, whose
> figures were already known stale before this slice.

> **Reconciliation note (2026-08-26, slice 017).** The previous header read 172, and
> the `US` column above still sums to 175 after this slice's +3. Counting the actual
> rows in the epic tables gives 168. The 7-row gap predates this slice: `EP00` lists
> 16 and holds 15 (004's Decision 4 retired `US12-EP00-FND`), `EP02` lists 13 and
> holds 10, `EP06` lists 9 and holds 8, `EP12` lists 19 and holds 17. Slice 017 did
> not re-derive those four figures — it verified and corrected only the catalogue-wide
> total and its own `EP10` row, exactly as `017/spec.md`'s Approval Checklist note
> asked. The four stale per-epic figures are left for the slice that owns them.

---

## EP00-PlatformFoundation (FND) — NEW

Multi-tenancy, provisioning, audit log, permissions mechanism, tier entitlements.
Every other epic depends on this one.

| ID | Archetype | Capability | Slice |
|---|---|---|---|
| US01-EP00-FND-ProvisionTenant | PO | Provision a firm as an isolated tenant | FND |
| US02-EP00-FND-AssignTenantPlan | PO | Assign/change iguala plan without deployment | FND |
| US03-EP00-FND-EnforceTenantIsolation | PO | Isolation enforced at data layer | FND |
| US04-EP00-FND-DeactivateTenant | PO | Deactivate tenant without deleting data | FND |
| US05-EP00-FND-ConfigureTenantLimits | PO | Quantitative limits per plan | FND |
| US06-EP00-FND-WriteAuditEvent | MP | Every mutation logged append-only | FND |
| US07-EP00-FND-EnforceAuditImmutability | MP | Audit records unalterable by the app | FND |
| US08-EP00-FND-QueryAuditLog | SA | Query own-tenant log by date/actor/entity | FND |
| US09-EP00-FND-ExportAuditTrail | MP | Export trail for a case or date range | IT2 |
| US10-EP00-FND-LogCrossTenantAttempt | PO | Cross-tenant attempts as security events | FND |
| US11-EP00-FND-EnforceDenyByDefault | SA | No explicit permission = rejection | FND |
| US12-EP00-FND-DefineRole | SA | Define roles as permission sets per tenant | FND |
| US13-EP00-FND-AssignRoleToUser | SA | Assign/change a user's role | FND |
| US14-EP00-FND-EnforceEntitlementByTier | PO | Tier gate enforced in backend | FND |
| US15-EP00-FND-AuditPermissionChange | MP | Role/permission changes logged | FND |
| **US16-EP00-FND-SeedFirstAdministrator** | PO | Issue the first SA invitation for a tenant with no members yet | FND |
| **US17-EP00-FND-NavigateApplicationShell** | System User | One persistent menu and header every module renders into | FND |
| **US18-EP00-FND-SeeLoadingState** | System User | A region backed by a network request shows it is loading | FND |
| **US19-EP00-FND-SeeErrorState** | System User | A failed request shows a state offering retry, opaque or remedy-specific per cause | FND |
| **US20-EP00-FND-SeeEmptyState** | System User | A successful response with zero records shows a clear empty state | FND |

> **Delivered:** US01–US08 and US10 by slice 001-tenant-foundation; US13 and US15 by
> slice 002-identity-membership; US11 and US14 by slice 004-authorization-entitlements;
> US17–US20 by slice 016a-frontend-shell. **Pending:** US09 → IT2.
>
> **US17–US20 added 2026-08-26**, closing 016a-frontend-shell's own Principle I
> traceability gap — the persistent navigation shell and its three feedback states
> (loading, error, empty) are architecture every later frontend slice depends on, not
> business capability any existing story already covered. Raises EP00 from 16 to 20
> stories.
>
> **US16 added 2026-08-21**, closing Open Question 2 of spec 002. The permission
> matrix of that spec correctly denies PO every membership capability — if CC staff
> could create memberships, CC could grant itself access to a firm's case files,
> which is what Principle II exists to prevent. That left a real bootstrap gap: a
> freshly provisioned tenant has no member who can invite the first one. US16 is the
> narrowest resolution: one archetype (SA), available only while the tenant holds
> zero live memberships, granting the operator nothing, and self-extinguishing.
>
> **US12 retired 2026-08-26** (moved here from EP01, where it was misplaced — US12 is
> an EP00 story). As written, "define roles as permission sets per tenant" is
> unimplementable against what `002-identity-membership` already shipped: `archetype`
> is a fixed ten-value PostgreSQL enum, and Principle III forbids tenant-specific logic
> in the product core. The only viable reading — "assign which of the fixed archetypes
> a member holds" — is `US13-EP00-FND-AssignRoleToUser`, already delivered. Retired as
> a duplicate rather than specified. See `004-authorization-entitlements/spec.md`,
> Decision 4, and `plan.md` Open Item 1.

---

## EP01-Dashboard (DSH)

| ID | Archetype | Capability | Slice |
|---|---|---|---|
| US01-EP01-DSH-ViewTodaysKPISummary | MP | Today's KPI summary | MVP |
| US02-EP01-DSH-ViewOverdueDeadlineAlerts | MP | Alerts for overdue deadlines | MVP |
| US03-EP01-DSH-ReviewRecentActivityFeed | MP | Recent team activity feed | MVP |
| US04-EP01-DSH-ViewUpcomingTasksAndDeadlines | AA | Own upcoming tasks and deadlines | IT2 |
| US05-EP01-DSH-UseQuickActionLinks | AA | Quick-create cases and tasks | IT2 |
| US06-EP01-DSH-ViewPendingFilings | PL | Pending filings and court deadline notices | IT2 |
| US07-EP01-DSH-MonitorCaseStatusIndicators | CM | Case status indicators, bottleneck detection | IT2 |
| US08-EP01-DSH-ViewOutstandingInvoices | BM | Outstanding invoices and payment stats | IT2 |
| US09-EP01-DSH-ViewSystemHealthMetrics | SA | Platform availability and security metrics | IT3 |
| US10-EP01-DSH-ViewActiveMattersStatus | CC | Own active matter status | TBD |
| US11-EP01-DSH-ViewUpcomingHearings | IC | Own upcoming hearings and required actions | TBD |

> **Fixed:** source US09 was mislabeled with US08's title; US10 was missing
> its EP01 segment. US10–US11 are portal-facing and depend on EP13 validation.

---

## EP02-CaseManagement (CSM)

| ID | Archetype | Capability | Slice |
|---|---|---|---|
| US01-EP02-CSM-CreateNewCase | CM | Create case in under 2 min from intake | 006 + 019 |
| US02-EP02-CSM-FilterCases | CM | Filter by number, client, type, court, date, attorney, status | 019 (partial) |
| US03-EP02-CSM-ViewCaseList | CM | Tabular case list with key columns | 006 + 019 |
| US04-EP02-CSM-ViewCaseDetails | AA | Detail panel on row selection | 006 + 019 |
| US05-EP02-CSM-IdentifyUrgentCases | CM | "Urgent" status badge | IT2 |
| US06-EP02-CSM-SortCases | AA | Sort by any column | IT2 |
| US07-EP02-CSM-MonitorCaseStatus | PL | Status: In Process / On Hold / Concluded | 006 + 019 |
| US08-EP02-CSM-ViewCaseTeam | CM | Every member assigned to a case, with their role on it | 006 + 019 |
| US09-EP02-CSM-ViewUpcomingDeadlines | PL | Next three deadlines per case | MVP |
| US10-EP02-CSM-ViewAssociatedTasks | CM | Task count and status per case | MVP |
| **US11-EP02-CSM-ViewCaseActivityFeed** | CM | Activity log of case, documents and notes | MVP |
| **US12-EP02-CSM-FilterActivityByMonth** | CM | Filter case activity by month | MVP |
| **US13-EP02-CSM-GenerateClientActivityReport** | MP | Client-facing activity report per case | IT2 |
| **US14-EP02-CSM-AssignCaseTeamMember** | MP | Put a firm member on a matter, with a role, and take them off it | 006 |

> **US11–US13 are new**, derived from "Actividad por Expediente" in the
> 23 Apr 2026 session, which had no epic assigned.

> **Amended 2026-08-28 by slice `019-frontend-cases`** (Principle I).
>
> Six rows re-attributed under the joint-delivery convention `018` introduced for `EP03`:
> `006` built the API, `019` builds the interface, and a story is delivered when a person can
> do the thing. `US01`, `US03`, `US04`, `US07` and `US08` now read `006 + 019`.
>
> **`US02-EP02-CSM-FilterCases` reads `019 (partial)`, and the qualifier is deliberate.**
> The row asks for filtering by "number, client, type, court, date, attorney, status". `019`
> delivers **number, client, type and court**. It does not deliver date, attorney or status,
> and each is withheld for its own reason rather than for lack of time:
>
> - **attorney** — there is nothing to filter by. No table in this product stores a person's
>   name; `identity` holds an email and `membership` holds an archetype. This is the same
>   finding that removed the *Abogado* column from the screen (`019` spec, Q2). It becomes
>   possible when slice `003` ships identity.
> - **date** and **status** — buildable today, simply not asked for by the reference design
>   the slice was given. They are three more predicates in the same array, and the slice that
>   wants them should say so.
>
> The row is left open rather than split into a second id, for the reason `018` gave: the
> firm asked for "filter cases", not for "filter cases (four of seven ways)".
>
> **`US05-EP02-CSM-IdentifyUrgentCases` stays unclaimed**, and this is worth recording. It
> asks for an "Urgent" status badge. Case statuses are a per-tenant catalogue of free text
> whose only declared semantic is whether a status closes a matter — there is nowhere in
> `006` for urgency to live, and the product must not infer it from a firm happening to name
> a status *Urgente*. Delivering this row needs a product decision about what urgency means
> and who declares it, which `019` deliberately did not make on a badge's behalf.
>
> **`US06`** (sorting) and **`US14`** (assign a team member) also stay unclaimed — see `019`'s
> Out of Scope for both.
>
> The catalogue-wide total is unchanged: 0 stories added, 6 rows re-attributed.

> **Amended 2026-08-26 by slice `006-client-case-core`** (Principle I), three changes:
>
> - **`US14` is new.** `US08` covered only *reading* who is on a matter. Assigning and
>   unassigning had no story at all, while being the story slice 006 exists for — it is
>   what supplies `004`'s `assigned` scope resolver, deferred there by design.
> - **`US08` was retitled** from `ViewAssignedAttorney`. It read "Assigned attorney",
>   singular, which is precisely what the prototype could express (one free-text name on
>   the case) and what 006 replaces with a team of many, each carrying a role.
> - **`US08` moved `IT3` → `006`.** The read side of case teams ships with the write side;
>   leaving it in IT3 would have described a field that already existed.

---

## EP03-ClientManagement (CLM)

| ID | Archetype | Capability | Slice |
|---|---|---|---|
| US01-EP03-CLM-ViewClientSummaryMetrics | MP | Total / active / new-this-month | IT2 |
| US02-EP03-CLM-SearchAndFilterClients | AA | Search and filter by name or status | 006 + 018 |
| US03-EP03-CLM-AddOrUpdateClientProfile | PL | Quick-add and edit client profiles | 006 + 018 |
| US04-EP03-CLM-ViewAndManageClientCases | CM | Cases per client | 006 |
| US05-EP03-CLM-ViewBillingStatusIndicators | BM | Outstanding invoices beside client record | IT2 |
| US06-EP03-CLM-ConfigureDashboardColumns | SA | Configurable columns and fields | IT2 |
| **US07-EP03-CLM-RestoreWithdrawnClient** | MP | Restore a client withdrawn in error | 006 + 018 |

> **Amended 2026-08-28 by slice `018-frontend-clients`** (Principle I) — and this one
> introduces a **convention this catalogue has not used before**, so read it once.
>
> Three rows now read `006 + 018` rather than naming a single slice. They are **jointly
> delivered**: `006` built the API, `018` builds the screen.
>
> **Why the split is real and not bookkeeping.** Every one of these three describes
> something a *person* does — searching clients, quick-adding a profile, restoring one
> withdrawn by mistake. `006` moved them to itself when it shipped their endpoints, which
> was right at the time and is now half true: an API nobody can reach does not let a
> paralegal quick-add a client. A story is delivered when a user can do the thing, and
> neither slice achieves that alone.
>
> **The rule this sets for later slices.** When a capability's API and its interface land
> in different slices, the row names both rather than being claimed by whichever shipped
> first — and rather than minting a second, UI-only id. Duplicating the id would imply the
> firm asked for "search clients (API)" and "search clients (screen)" as separate wants.
> It did not.
>
> **Not applied retroactively.** Rows belonging to slices that shipped API and interface
> together, or that have no interface yet, are untouched. `US04-EP03-CLM` stays at `006`
> because `018` does not build a cases-per-client view — see `018`'s Out of Scope.
>
> The catalogue-wide total is unchanged: 0 stories added, 3 rows re-attributed.

> **Amended 2026-08-26 by slice `006-client-case-core`** (Principle I):
>
> - **`US07` is new.** Withdrawal had no inverse, so a mis-click permanently barred a party
>   from ever having a new matter opened against them — and merging duplicate clients is out
>   of scope, so the duplicate that remedy forces would be permanent too. Restoration is
>   governed by the capability that withdraws, so it adds no permission question.
> - **`US02`, `US03`, `US04` moved `MVP` → `006`**, the slice that delivers them. `US03`'s
>   `PL` archetype is honoured: `PL` creates and updates clients in 006's matrix and does
>   not withdraw them.

---

## EP04-DocumentManagement (DOC)

| ID | Archetype | Capability | Slice |
|---|---|---|---|
| US01-EP04-DOC-UploadDocumentToFolder | PL | Upload to correct folder | MVP |
| US02-EP04-DOC-PreviewDocumentInline | AA | Preview without downloading | MVP |
| US03-EP04-DOC-OrganizeDocumentsByMatter | CM | Categorize by case and subfolder | MVP |
| US04-EP04-DOC-ShareDocumentWithClient | MP | Secure share link | IT2 |
| US05-EP04-DOC-SearchDocumentsByKeyword | PL | Keyword and filename search | IT2 |
| US06-EP04-DOC-AssignAccessPermissions | SA | View/edit/download rights per role | MVP |
| US07-EP04-DOC-ViewDocumentHistory | CM | Upload date and user per file | IT3 |
| US08-EP04-DOC-ReplaceDocumentVersion | AA | Replace with updated version | IT2 |
| US09-EP04-DOC-DownloadDocumentEasily | CC | One-click download | TBD |
| US10-EP04-DOC-TagDocumentsByType | PL | Labels: contract, evidence, etc. | IT3 |
| US11-EP04-DOC-BulkUploadDocuments | CM | Multiple simultaneous uploads | IT2 |
| US12-EP04-DOC-NotifyTeamOnUpload | PL | Team alert on upload | IT3 |
| US13-EP04-DOC-ConfirmDocumentView | MP | Who viewed a shared document | IT3 |
| US14-EP04-DOC-ExportDocumentsByCase | SA | Export all case documents as folder | IT3 |
| US15-EP04-DOC-LinkDocumentsToCaseFile | CM | Auto-link to related case | MVP |
| US16-EP04-DOC-AccessDocumentsOnMobile | AA | View/download from phone | IT3 |

> **US06 promoted to MVP.** Constitution Principle IV (deny-by-default) makes
> document permissions non-deferrable — documents cannot ship without them.

---

## EP05-CalendarScheduling (CAL)

| ID | Archetype | Capability | Slice |
|---|---|---|---|
| US01-EP05-CAL-ViewUpcomingEvents | AA | Unified calendar of hearings, deadlines, meetings | MVP |
| US02-EP05-CAL-ScheduleNewEvent | PL | Create event from calendar | IT2 |
| US03-EP05-CAL-EditAndRescheduleEvent | CM | Edit and reschedule | IT2 |
| US04-EP05-CAL-ReceiveEventNotifications | AA | Automated reminders | MVP |
| US05-EP05-CAL-FilterCalendarByCase | CM | Filter by case or client | IT2 |
| US06-EP05-CAL-SyncJudicialDeadlines | CM | Auto-sync deadlines from court portals | IT3 |
| US07-EP05-CAL-ConfigureNotificationPreferences | SA | Who receives which notifications | IT2 |
| US08-EP05-CAL-ViewEventsInClientPortal | CC | Hearings and deadlines in portal | TBD |
| US09-EP05-CAL-SetRecurringEvents | AA | Recurring events | IT2 |
| US10-EP05-CAL-ExportCalendar | BM | Export to Outlook / Google Calendar | IT3 |

> **US06 depends on EP07** (out of MVP). **US10 is one of the four open scope
> conflicts** (Google Calendar sync).

---

## EP06-KPIDashboard (KPI)

| ID | Archetype | Capability | Slice |
|---|---|---|---|
| US01-EP06-KPI-ViewOverallKPIs | MP | Active matters, resolution time, success rate, revenue | MVP |
| US02-EP06-KPI-MonitorWorkloadDistribution | CM | Active matters per attorney | IT2 |
| US03-EP06-KPI-TrackSuccessRateByType | MP | Success rate by case type | IT3 |
| US04-EP06-KPI-AnalyzeResolutionTimeTrends | CM | Resolution time over quarters | IT3 |
| US05-EP06-KPI-MonitorRevenueGrowth | BM | Monthly revenue growth % | IT2 |
| US06-EP06-KPI-ReceiveKPIAlerts | AA | Alert on KPI threshold deviation | IT3 |
| US07-EP06-KPI-FilterKPIsByDateRange | PL | Custom date ranges | IT2 |
| US08-EP06-KPI-ExportDashboardReport | SA | Export dashboard as PDF | IT3 |
| **US09-EP06-KPI-ViewAdministrativeDashboard** | MP | Billing, hour costs and monthly summary | MVP |

> **US09 is new**, derived from "Dashboard Administrativo" in the 23 Apr 2026
> session, which had no epic assigned.

---

## EP07-JudicialConnectors (JCN) — OUT OF MVP / FASE 2

| ID | Archetype | Capability | Slice |
|---|---|---|---|
| US01-EP07-JCN-ViewConnectorStatus | CM | Last sync date, success/failure | IT2 |
| US02-EP07-JCN-TriggerManualSync | CM | On-demand sync per case | IT2 |
| US03-EP07-JCN-ConfigureConnectors | SA | Court systems, credentials, frequency | IT2 |
| US04-EP07-JCN-MapCasesToConnectors | AA | Link cases to connectors | IT2 |
| US05-EP07-JCN-ReviewImportedUpdates | PL | Approve imports before merge | IT2 |
| US06-EP07-JCN-ReceiveSyncAlerts | CM | Alerts on failure or new updates | IT2 |
| US07-EP07-JCN-FilterConnectorLogs | SA | Filter logs by date, court, case | IT3 |
| US08-EP07-JCN-ScheduleAutomaticSync | SA | Daily 6 AM scheduled sync | IT3 |
| US09-EP07-JCN-ExportSyncReport | MP | Monthly sync activity report | IT3 |

> Entire epic deferred to Fase 2. **Credential custody warning:** storing each
> firm's court portal credentials carries the same handling requirements as the
> CSD (Constitution, PAC section).

---

## EP08-TimeTracking (TTK) — SCOPE CONFLICT OPEN

| ID | Archetype | Capability | Slice |
|---|---|---|---|
| US01-EP08-TTK-StartStopTimer | AA | Live timer on a case | MVP |
| US02-EP08-TTK-LogManualHours | AA | Manual entry with date, case, description | MVP |
| US03-EP08-TTK-EditTimeEntries | AA | Edit/delete within 24 h | IT2 |
| US04-EP08-TTK-ViewMyTimesheet | AA | Own timesheet by date range | MVP |
| US05-EP08-TTK-LogParalegalHours | PL | Record support work time | MVP |
| US06-EP08-TTK-ApproveTimeEntries | BM | Approve/reject submitted entries | IT2 |
| US07-EP08-TTK-ExportTimeDataToCFDI | BM | Export approved entries to invoicing | IT2 |
| US08-EP08-TTK-ViewTeamHours | CM | Aggregated hours per member per case | IT3 |
| US09-EP08-TTK-SetTimeEntryAlerts | CM | Weekly alerts for missing timesheets | IT3 |
| US10-EP08-TTK-ConfigureBillableRates | SA | Default and case-specific rates | MVP |
| US11-EP08-TTK-ManageTimeTrackingPermissions | SA | Grant/revoke log, approve, export rights | MVP |
| US12-EP08-TTK-ViewUtilizationDashboard | MP | Utilization rates, quarterly billable hours | IT3 |
| US13-EP08-TTK-ViewClientHoursPortal | CC | Hours logged on own cases | TBD |

---

## EP09-Billing (BIL)

| ID | Archetype | Capability | Slice |
|---|---|---|---|
| US01-EP09-BIL-ViewMonthlyBillingSummary | BM | Monthly total and MoM change | MVP |
| US02-EP09-BIL-ViewPendingInvoices | BM | Count and value of pending invoices | IT2 |
| US03-EP09-BIL-ViewPaidInvoices | BM | Count and total paid this month | IT2 |
| US04-EP09-BIL-ViewAveragePaymentTime | BM | Average payment time and change | IT2 |
| US05-EP09-BIL-GenerateNewInvoice | BM | Create invoice with client, concept, dates, amount | MVP |
| US06-EP09-BIL-FilterInvoices | BM | Filter by number, client, concept, dates, amount, status | IT2 |
| US07-EP09-BIL-DownloadInvoicePDF | BM | Download invoice PDF | IT2 |
| US08-EP09-BIL-SwitchBillingTabs | BM | Invoices / Time Records / Reports tabs | IT2 |
| US09-EP09-BIL-ViewInvoiceDetails | BM | Invoice detail view | MVP |
| US10-EP09-BIL-GenerateBillingReport | BM | Period billing reports | IT3 |
| US11-EP09-BIL-ViewBillingKPIs | MP | Billing KPI summary cards | IT3 |
| US12-EP09-BIL-UpdateInvoiceStatus | BM | Mark paid / cancelled | MVP |

> **Gap:** no US covers CFDI stamping via PAC, cancellation with SAT acuse,
> complemento de pago, or multi-issuer CSD handling. The heaviest technical work
> in this epic is unspecified. Must be resolved in Discovery. Gates slice
> 011-cfdi-stamping together with the PAC pending.

---

## EP10-SystemConfiguration (CFG)

| ID | Archetype | Capability | Slice |
|---|---|---|---|
| US01-EP10-CFG-ManageUsers | SA | Create, edit, deactivate accounts | MVP |
| US02-EP10-CFG-ManageRoles | SA | Define and assign roles | MVP |
| US03-EP10-CFG-ConfigurePermissions | SA | Granular permissions per role | MVP |
| US04-EP10-CFG-ConfigureBillingParameters | BM | Rates, tax rates, invoice templates | MVP |
| US05-EP10-CFG-ConfigureCFDIIntegration | BM | CFDI credentials | IT2 |
| US06-EP10-CFG-ConfigureClientPortal | SA | Portal branding, access levels, auth | TBD |
| US07-EP10-CFG-ConfigureJudicialConnectors | SA | Add and test court portal connections | IT3 |
| US08-EP10-CFG-ConfigureNotifications | SA | Email and WhatsApp templates and triggers | IT2 |
| US09-EP10-CFG-ConfigureKPIDashboards | MP | Default KPIs and alert thresholds | IT3 |
| US10-EP10-CFG-ConfigureTimeTrackingRules | AA | Time increments and rounding rules | IT3 |
| US11-EP10-CFG-AssignMemberPosition | MP | Record which position a firm member holds | 017 |
| US12-EP10-CFG-DefinePositionCatalog | MP | Maintain the firm's own set of positions | 017 |
| US13-EP10-CFG-ViewFirmDirectory | AA | Browse the firm's own directory | 017 |
| **US14-EP10-CFG-DefineCaseStatusCatalog** | MP | Maintain the firm's own case statuses, and declare which of them end a matter | 006 |
| **US15-EP10-CFG-DefineMatterTypeCatalog** | MP | Maintain the firm's own matter types | 006 |
| **US16-EP10-CFG-DefineVenueCatalog** | MP | Maintain the firm's own courts and venues | 006 |

> **US14–US16 added 2026-08-26 by slice `006-client-case-core`** (Principle I). The
> conceptual model assumed case status, matter type and venue lived in the firm directory;
> **017 as built ships only the position catalog**, so these three were nobody's until now.
> They are consumed exclusively by `Case`, which 006 also owns, so 006 owns them — see its
> Decision 1. `US14` carries one thing the other two do not: a firm declares which of its
> own statuses ends a matter, because the product cannot know that from a name it did not
> choose.

> **US11–US13 added 2026-08-26 by slice 017-firm-directory** (Principle I). Position
> is the firm's own organizational hierarchy, deliberately tenant-configurable — the
> mirror image of 004's fixed archetype matrix, and the row Principle III exists to
> permit. `MP` holds US11–US12 alongside `SA`; US13 is read by all six internal
> archetypes.

> **US01–US03 overlap EP00 and EP12.** Ownership is now split by slice: the
> mechanism is slices 002 and 004, the administrative UI is slice 014. Behaviour
> belongs to the mechanism, presentation to the UI. **US08 is a scope conflict**
> (WhatsApp).

---

## EP11-ProfileManagement (PMG)

| ID | Archetype | Capability | Slice |
|---|---|---|---|
| US01-EP11-PMG-EditBasicInfo | System User | Edit full name and address | MVP |
| US02-EP11-PMG-ManageContact | System User | Configure email and phone | MVP |
| US03-EP11-PMG-UpdatePhoto | System User | Upload/change profile picture | IT2 |

> **US02 conflicts with the IdP.** If email is the identity identifier, changing
> it is an identity operation requiring step-up MFA and re-verification, not a
> profile edit. 002/FR-003 already forbids the silent-merge behaviour that would
> make this dangerous; the user-facing flow remains unspecified.

---

## EP12-AccountSecurity (ASC) — REWRITTEN

| ID | Archetype | Capability | Slice |
|---|---|---|---|
| US01-EP12-ASC-InviteUser | SA | Invite by email with target role | FND |
| US02-EP12-ASC-EnrollMFAFactor | System User | Mandatory second factor at enrollment | FND |
| US03-EP12-ASC-ReceiveBackupCodes | System User | Single-use backup codes | FND |
| US04-EP12-ASC-RejectExpiredInvitation | SA | Single-use, expiring invitations | FND |
| US05-EP12-ASC-PreventAccountEnumeration | SA | No disclosure of email existence | FND |
| US06-EP12-ASC-AuthenticateWithMFA | System User | Second factor on every sign-in | FND |
| US07-EP12-ASC-ExpireIdleSession | MP | Idle and absolute expiry by role class | FND |
| US08-EP12-ASC-SignOut | System User | Immediate invalidation, server and IdP | FND |
| US09-EP12-ASC-ViewActiveSessions | System User | Device, location, last activity | IT2 |
| US10-EP12-ASC-RevokeSession | System User | Revoke individually or all | IT2 |
| US11-EP12-ASC-RevokeSessionsOnDeactivation | SA | Deactivation revokes all sessions | FND |
| US12-EP12-ASC-StepUpForSensitiveOperation | MP | Fresh factor regardless of session age | FND |
| US13-EP12-ASC-RecoverWithBackupCode | System User | Recover and re-enroll a factor | FND |
| US14-EP12-ASC-RequestAssistedMFAReset | System User | Defined path when codes exhausted | IT2 |
| US15-EP12-ASC-PerformAssistedMFAReset | SA | Reset with step-up + out-of-band reference | IT2 |
| US16-EP12-ASC-AuditMFAReset | MP | Reset logged with authorising party | IT2 |
| US17-EP12-ASC-ReviewTenantMFAStatus | SA | MFA coverage across own tenant | IT2 |
| **US18-EP12-ASC-AcceptInvitation** | System User | Accept a valid invitation and obtain membership in that tenant | FND |
| **US19-EP12-ASC-SelectActiveTenant** | System User | Choose which tenant is active when holding more than one membership | FND |

> **Retired:** US01-EP12-Security-ChangePassword — handled by the external IdP,
> not this product. US02-EP12-Security-ActiveDevices — superseded by US09/US10.
>
> **US18–US19 added 2026-08-21**, surfaced while drafting spec
> 002-identity-membership. US01 covered issuing an invitation and nothing
> covered the invited person acting on it — the moment an identity and a
> membership actually come into existence. Separately, 001/FR-022 requires the
> active tenant to be explicit and membership-verified, and for an identity holding
> several memberships nothing described who chooses. Without both stories the slice
> 002 PRs carry no traceable ID and Principle I rejects them. Constitution
> Technical Debt item 3 records the same gap for external portal users.
>
> **US03 and US13 are built, not bought.** Constitution v1.4.0 selected Amazon
> Cognito, which provides no backup codes, so this product custodies hashed backup
> code material under a named constitutional exception. Coverage of that path is
> blocking in CI. See Constitution Technical Debt item 8.
>
> **Slice assignment:** US01, US04, US05, US18, US19 → 002-identity-membership.
> US02, US03, US06, US13 → 003-authentication-mfa. US07, US08, US11, US12 →
> 005-session-lifecycle. US09, US10, US14–US17 → IT2.

---

## EP13-ClientPortal (PTL) — UNVALIDATED

| ID | Archetype | Capability | Slice |
|---|---|---|---|
| US01-EP13-PTL-ViewCaseStatus | CC | Current status of each active case | TBD |
| US02-EP13-PTL-ReviewHistoricCases | EL | Closed cases with outcomes and dates | TBD |
| US03-EP13-PTL-UploadRequiredDocumentation | IC | Secure upload to case file | TBD |
| US04-EP13-PTL-ViewBillingStatus | CB | Amounts due and due dates | TBD |
| US05-EP13-PTL-SendMessageToFirm | EL | Secure messaging to legal team | TBD |
| US06-EP13-PTL-RequestMeetingSlot | CC | Request meeting from available windows | TBD |
| US07-EP13-PTL-ReceiveCaseNotifications | IC | Real-time notifications | TBD |
| US08-EP13-PTL-DownloadCaseDocuments | EL | Bulk ZIP download | TBD |
| US09-EP13-PTL-TrackDocumentRequests | IC | Checklist with submission deadlines | TBD |
| US10-EP13-PTL-ProvidePortalFeedback | CC | Feedback after case milestones | TBD |

> **Missing entirely:** external user onboarding — invitation, enrollment and
> first access for a client. With universal mandatory MFA, that flow is a
> precondition for this epic to function at all. Do not spec EP13 until it exists.
> EP12's US18–US19 cover the internal equivalent; whether the external flow
> reuses them is an EP13 question, not settled here.
> **Cost note, revised:** external users will outnumber internal roughly 10:1 per
> tenant. The MAU argument is now much weaker than when it was written — Cognito's
> free allowance of 10,000 MAU absorbs the projected external population for the
> first tens of firms — but the MFA reset support volume still lands on CC's iguala
> margin, and email OTP for portal users is no longer permitted in v1.0
> (Constitution v1.4.0), so those users need TOTP like everyone else.

---

## EP14-NoteManagement (NOT) — NEW

Source: "Gestión de Notas — alta de notas asignadas a Expediente. Histórico por
mes se deberá mostrar dentro de Expediente." (23 Apr 2026)

| ID | Archetype | Capability | Slice |
|---|---|---|---|
| US01-EP14-NOT-CreateCaseNote | AA | Create a note attached to a case | MVP |
| US02-EP14-NOT-ViewNoteHistoryByMonth | CM | Note history grouped by month within the case | MVP |
| US03-EP14-NOT-EditOwnNote | AA | Edit own note within a defined window | IT2 |
| US04-EP14-NOT-RestrictNoteVisibility | MP | Limit note visibility by role | IT2 |
| US05-EP14-NOT-AuditNoteChanges | MP | Note creation and edits in the audit log | MVP |

> [NEEDS CLARIFICATION] Are notes ever client-visible via EP13, or strictly
> internal work product? This affects privilege and cannot be assumed. Blocks
> slice 008-notes-and-activity.

---

## EP15-QuoteManagement (QTE) — NEW

Source: "Alta de Cotización — subir documentos de propuesta para indicar si el
cliente acepta o no la cotización. Se requiere histórico de actividad, costo por
hora por expediente, carga de pagos de cliente." (23 Apr 2026)
Referenced by EP16 ("link to EP15/EP09").

| ID | Archetype | Capability | Slice |
|---|---|---|---|
| US01-EP15-QTE-UploadQuoteDocument | BM | Upload a proposal document to a case | MVP |
| US02-EP15-QTE-RecordQuoteDecision | BM | Record client acceptance or rejection | MVP |
| US03-EP15-QTE-SetCaseHourlyRate | BM | Set hourly cost per case | MVP |
| US04-EP15-QTE-RegisterClientPayment | BM | Register payments received from client | MVP |
| US05-EP15-QTE-ViewQuoteHistory | MP | Quote and decision history per case | IT2 |
| US06-EP15-QTE-LinkQuoteToInvoice | BM | Link accepted quote to invoicing | IT2 |

> [NEEDS CLARIFICATION] Does US04 (client payments) overlap
> US12-EP09-BIL-UpdateInvoiceStatus? Payment registration must live in exactly
> one place or the ledger diverges. Blocks slice 012-quotes-and-payments.

---

## EP16-CostCenter (CCT) — DRAFT

| ID | Archetype | Capability | Slice |
|---|---|---|---|
| US01-EP16-CCT-AssignViaticosToAttorney | BM | Assign travel budget, optionally per case | DFT |
| US02-EP16-CCT-RegisterExpense | AA | Register expense against assigned budget | DFT |
| US03-EP16-CCT-RegisterPaymentToAttorney | BM | Auditable ledger of internal disbursements | DFT |
| US04-EP16-CCT-ViewCostSummary | MP | Monthly cost summary beside revenue | DFT |

> Open questions carried from the original file: approval flow, receipts vs.
> fixed allowance, client billable pass-through, and whether payroll is in scope.

---

## Unassigned requirements — no epic, no US

From the 23 Apr 2026 session notes. All four are the open scope conflicts:

| Requirement | Status |
|---|---|
| Native mobile application | Conflict — MVP assumes responsive web |
| WhatsApp notifications | Partially in US08-EP10-CFG; delivery unspecified |
| Google Calendar sync | Partially in US10-EP05-CAL; marked IT3 |
| **Offline operation** | **No epic, no US, no estimate.** Architecturally incompatible with the current plan |

**Offline is not a feature.** Offline-first plus multi-tenancy plus an
append-only audit log requires conflict resolution and a client-side sync engine,
and it makes the audit story genuinely hard (when did the mutation occur, when
did it sync, which wins). If it survives Discovery, the current quote is not
deliverable.

---

## Reconciliation summary

**Fixed**
- EP00 created — tenancy, audit and permissions had no epic — then extended to 16
  with US16 (seed first administrator)
- EP12 rewritten from 2 US to 17, then to 19 (US18–US19)
- EP14 and EP15 created, closing the numbering gap EP16 already referenced
- Four April features assigned: Notes → EP14, Quotes → EP15, Case Activity →
  EP02 US11–13, Admin Dashboard → EP06 US09
- EP05, EP06, EP13 renamed to match their actual scope
- `<ModuleCode>` applied to all 172 US per the Handbook
- Mislabeled and malformed IDs in EP01 corrected
- Archetype column normalised to the codes fixed in Constitution v1.4.0; PO
  replaces the overloaded vendor use of CC
- Slice assignments recorded for EP00 and EP12, so the FND stories are traceable to
  a specific spec directory rather than to an epic

**Closed**
1. ~~Can a user belong to more than one tenant?~~ **Yes** (001/FR-021). Identity
   and membership are distinct; archetype is a property of membership.
2. ~~How does a tenant's first System Administrator obtain access?~~ **Seed
   invitation** from the platform context, archetype SA only, available only while
   the tenant holds zero live memberships (US16-EP00-FND, 002/FR-035).
3. ~~Identity provider and hosting region.~~ **Amazon Cognito user pools
   (Essentials) in mx-central-1** — Constitution v1.4.0.

**Still open**
1. EP13 unvalidated against client priorities; external onboarding missing.
2. EP09 has no CFDI stamping, cancellation or multi-issuer stories, and the PAC is
   still `[PENDING]`. Together these gate slice 011.
3. US02-EP11 (change email) conflicts with IdP identity semantics.
4. Offline operation unspecified and unestimated.
5. Are notes client-visible via EP13? Blocks slice 008.
6. Does EP15 US04 overlap EP09 US12 for payment registration? Blocks slice 012.
7. Time tracking scope conflict. Blocks slice 009.
