# LegalConnect MX — Master User Story Catalog

**Version:** 1.0 | **Date:** 2026-08-19 | **Constitution:** v1.1.0
**Naming:** `US<NN>-EP<NN>-<ModuleCode>-<ActionDescription>` (Development Handbook)

This document is the reconciled single source of truth for the backlog. It
supersedes `1. Epics.md` as the epic index.

**Slice column:** `MVP` / `IT2` / `IT3` per Story Mapping · `FND` = foundation,
mandatory before any business feature · `TBD` = not yet sliced · `DFT` = draft,
pending Discovery.

---

## Epic Index

| Ref | Code | Epic | US | Status |
|---|---|---|---|---|
| EP00 | FND | Platform Foundation | 15 | **NEW** — was missing entirely |
| EP01 | DSH | Dashboard | 11 | Existing |
| EP02 | CSM | Case Management | 13 | Existing + 3 new |
| EP03 | CLM | Client Management | 6 | Existing |
| EP04 | DOC | Document Management | 16 | Existing |
| EP05 | CAL | Calendar & Scheduling | 10 | Renamed from `ViewUpcomingEvents` |
| EP06 | KPI | KPI Dashboard | 9 | Renamed from `ViewOverallKPIs` + 1 new |
| EP07 | JCN | Judicial Connectors | 9 | Existing — **out of MVP, Fase 2** |
| EP08 | TTK | Time Tracking | 13 | Existing — **scope conflict open** |
| EP09 | BIL | Billing | 12 | Existing |
| EP10 | CFG | System Configuration | 10 | Existing |
| EP11 | PMG | Profile Management | 3 | Existing |
| EP12 | ASC | Account Security | 17 | **REWRITTEN** — was 2 US |
| EP13 | PTL | Client Portal | 10 | Renamed from `CommunicationChannel` — **unvalidated** |
| EP14 | NOT | Note Management | 5 | **NEW** — fills numbering gap |
| EP15 | QTE | Quote Management | 6 | **NEW** — fills numbering gap, referenced by EP16 |
| EP16 | CCT | Cost Center | 4 | Existing — **DRAFT** |

**Total: 169 user stories.**

---

## EP00-PlatformFoundation (FND) — NEW

Multi-tenancy, provisioning, audit log, permissions mechanism, tier entitlements.
Every other epic depends on this one.

| ID | Archetype | Capability | Slice |
|---|---|---|---|
| US01-EP00-FND-ProvisionTenant | CC Platform Operator | Provision a firm as an isolated tenant | FND |
| US02-EP00-FND-AssignTenantPlan | CC Platform Operator | Assign/change iguala plan without deployment | FND |
| US03-EP00-FND-EnforceTenantIsolation | CC Platform Operator | Isolation enforced at data layer | FND |
| US04-EP00-FND-DeactivateTenant | CC Platform Operator | Deactivate tenant without deleting data | FND |
| US05-EP00-FND-ConfigureTenantLimits | CC Platform Operator | Quantitative limits per plan | FND |
| US06-EP00-FND-WriteAuditEvent | Managing Partner | Every mutation logged append-only | FND |
| US07-EP00-FND-EnforceAuditImmutability | Managing Partner | Audit records unalterable by the app | FND |
| US08-EP00-FND-QueryAuditLog | System Administrator | Query own-tenant log by date/actor/entity | FND |
| US09-EP00-FND-ExportAuditTrail | Managing Partner | Export trail for a case or date range | IT2 |
| US10-EP00-FND-LogCrossTenantAttempt | CC Platform Operator | Cross-tenant attempts as security events | FND |
| US11-EP00-FND-EnforceDenyByDefault | System Administrator | No explicit permission = rejection | FND |
| US12-EP00-FND-DefineRole | System Administrator | Define roles as permission sets per tenant | FND |
| US13-EP00-FND-AssignRoleToUser | System Administrator | Assign/change a user's role | FND |
| US14-EP00-FND-EnforceEntitlementByTier | CC Platform Operator | Tier gate enforced in backend | FND |
| US15-EP00-FND-AuditPermissionChange | Managing Partner | Role/permission changes logged | FND |

---

## EP01-Dashboard (DSH)

| ID | Archetype | Capability | Slice |
|---|---|---|---|
| US01-EP01-DSH-ViewTodaysKPISummary | Managing Partner | Today's KPI summary | MVP |
| US02-EP01-DSH-ViewOverdueDeadlineAlerts | Managing Partner | Alerts for overdue deadlines | MVP |
| US03-EP01-DSH-ReviewRecentActivityFeed | Managing Partner | Recent team activity feed | MVP |
| US04-EP01-DSH-ViewUpcomingTasksAndDeadlines | Associate Attorney | Own upcoming tasks and deadlines | IT2 |
| US05-EP01-DSH-UseQuickActionLinks | Associate Attorney | Quick-create cases and tasks | IT2 |
| US06-EP01-DSH-ViewPendingFilings | Paralegal | Pending filings and court deadline notices | IT2 |
| US07-EP01-DSH-MonitorCaseStatusIndicators | Case Manager | Case status indicators, bottleneck detection | IT2 |
| US08-EP01-DSH-ViewOutstandingInvoices | Billing Manager | Outstanding invoices and payment stats | IT2 |
| US09-EP01-DSH-ViewSystemHealthMetrics | System Administrator | Platform availability and security metrics | IT3 |
| US10-EP01-DSH-ViewActiveMattersStatus | Corporate Client | Own active matter status | TBD |
| US11-EP01-DSH-ViewUpcomingHearings | Individual Client | Own upcoming hearings and required actions | TBD |

> **Fixed:** source `US09` was mislabeled with US08's title; `US10` was missing
> its `EP01` segment. US10–US11 are portal-facing and depend on EP13 validation.

---

## EP02-CaseManagement (CSM)

| ID | Archetype | Capability | Slice |
|---|---|---|---|
| US01-EP02-CSM-CreateNewCase | Case Manager | Create case in under 2 min from intake | MVP |
| US02-EP02-CSM-FilterCases | Case Manager | Filter by number, client, type, court, date, attorney, status | IT2 |
| US03-EP02-CSM-ViewCaseList | Case Manager | Tabular case list with key columns | MVP |
| US04-EP02-CSM-ViewCaseDetails | Associate Attorney | Detail panel on row selection | IT2 |
| US05-EP02-CSM-IdentifyUrgentCases | Case Manager | "Urgent" status badge | IT2 |
| US06-EP02-CSM-SortCases | Associate Attorney | Sort by any column | IT2 |
| US07-EP02-CSM-MonitorCaseStatus | Paralegal | Status: In Process / On Hold / Concluded | IT3 |
| US08-EP02-CSM-ViewAssignedAttorney | Case Manager | Assigned attorney per case | IT3 |
| US09-EP02-CSM-ViewUpcomingDeadlines | Paralegal | Next three deadlines per case | MVP |
| US10-EP02-CSM-ViewAssociatedTasks | Case Manager | Task count and status per case | MVP |
| **US11-EP02-CSM-ViewCaseActivityFeed** | Case Manager | Activity log of case, documents and notes | MVP |
| **US12-EP02-CSM-FilterActivityByMonth** | Case Manager | Filter case activity by month | MVP |
| **US13-EP02-CSM-GenerateClientActivityReport** | Managing Partner | Client-facing activity report per case | IT2 |

> **US11–US13 are new**, derived from "Actividad por Expediente" in the
> 23 Apr 2026 session, which had no epic assigned.

---

## EP03-ClientManagement (CLM)

| ID | Archetype | Capability | Slice |
|---|---|---|---|
| US01-EP03-CLM-ViewClientSummaryMetrics | Managing Partner | Total / active / new-this-month | IT2 |
| US02-EP03-CLM-SearchAndFilterClients | Associate Attorney | Search and filter by name or status | MVP |
| US03-EP03-CLM-AddOrUpdateClientProfile | Paralegal | Quick-add and edit client profiles | MVP |
| US04-EP03-CLM-ViewAndManageClientCases | Case Manager | Cases per client | MVP |
| US05-EP03-CLM-ViewBillingStatusIndicators | Billing Manager | Outstanding invoices beside client record | IT2 |
| US06-EP03-CLM-ConfigureDashboardColumns | System Administrator | Configurable columns and fields | IT2 |

---

## EP04-DocumentManagement (DOC)

| ID | Archetype | Capability | Slice |
|---|---|---|---|
| US01-EP04-DOC-UploadDocumentToFolder | Paralegal | Upload to correct folder | MVP |
| US02-EP04-DOC-PreviewDocumentInline | Associate Attorney | Preview without downloading | MVP |
| US03-EP04-DOC-OrganizeDocumentsByMatter | Case Manager | Categorize by case and subfolder | MVP |
| US04-EP04-DOC-ShareDocumentWithClient | Managing Partner | Secure share link | IT2 |
| US05-EP04-DOC-SearchDocumentsByKeyword | Paralegal | Keyword and filename search | IT2 |
| US06-EP04-DOC-AssignAccessPermissions | System Administrator | View/edit/download rights per role | MVP |
| US07-EP04-DOC-ViewDocumentHistory | Case Manager | Upload date and user per file | IT3 |
| US08-EP04-DOC-ReplaceDocumentVersion | Associate Attorney | Replace with updated version | IT2 |
| US09-EP04-DOC-DownloadDocumentEasily | Corporate Client | One-click download | TBD |
| US10-EP04-DOC-TagDocumentsByType | Paralegal | Labels: contract, evidence, etc. | IT3 |
| US11-EP04-DOC-BulkUploadDocuments | Case Manager | Multiple simultaneous uploads | IT2 |
| US12-EP04-DOC-NotifyTeamOnUpload | Paralegal | Team alert on upload | IT3 |
| US13-EP04-DOC-ConfirmDocumentView | Managing Partner | Who viewed a shared document | IT3 |
| US14-EP04-DOC-ExportDocumentsByCase | System Administrator | Export all case documents as folder | IT3 |
| US15-EP04-DOC-LinkDocumentsToCaseFile | Case Manager | Auto-link to related case | MVP |
| US16-EP04-DOC-AccessDocumentsOnMobile | Associate Attorney | View/download from phone | IT3 |

> **US06 promoted to MVP.** Constitution Principle IV (deny-by-default) makes
> document permissions non-deferrable — documents cannot ship without them.

---

## EP05-CalendarScheduling (CAL)

| ID | Archetype | Capability | Slice |
|---|---|---|---|
| US01-EP05-CAL-ViewUpcomingEvents | Associate Attorney | Unified calendar of hearings, deadlines, meetings | MVP |
| US02-EP05-CAL-ScheduleNewEvent | Paralegal | Create event from calendar | IT2 |
| US03-EP05-CAL-EditAndRescheduleEvent | Case Manager | Edit and reschedule | IT2 |
| US04-EP05-CAL-ReceiveEventNotifications | Associate Attorney | Automated reminders | MVP |
| US05-EP05-CAL-FilterCalendarByCase | Case Manager | Filter by case or client | IT2 |
| US06-EP05-CAL-SyncJudicialDeadlines | Case Manager | Auto-sync deadlines from court portals | IT3 |
| US07-EP05-CAL-ConfigureNotificationPreferences | System Administrator | Who receives which notifications | IT2 |
| US08-EP05-CAL-ViewEventsInClientPortal | Corporate Client | Hearings and deadlines in portal | TBD |
| US09-EP05-CAL-SetRecurringEvents | Associate Attorney | Recurring events | IT2 |
| US10-EP05-CAL-ExportCalendar | Billing Manager | Export to Outlook / Google Calendar | IT3 |

> **US06 depends on EP07** (out of MVP). **US10 is one of the four open scope
> conflicts** (Google Calendar sync).

---

## EP06-KPIDashboard (KPI)

| ID | Archetype | Capability | Slice |
|---|---|---|---|
| US01-EP06-KPI-ViewOverallKPIs | Managing Partner | Active matters, resolution time, success rate, revenue | MVP |
| US02-EP06-KPI-MonitorWorkloadDistribution | Case Manager | Active matters per attorney | IT2 |
| US03-EP06-KPI-TrackSuccessRateByType | Managing Partner | Success rate by case type | IT3 |
| US04-EP06-KPI-AnalyzeResolutionTimeTrends | Case Manager | Resolution time over quarters | IT3 |
| US05-EP06-KPI-MonitorRevenueGrowth | Billing Manager | Monthly revenue growth % | IT2 |
| US06-EP06-KPI-ReceiveKPIAlerts | Associate Attorney | Alert on KPI threshold deviation | IT3 |
| US07-EP06-KPI-FilterKPIsByDateRange | Paralegal | Custom date ranges | IT2 |
| US08-EP06-KPI-ExportDashboardReport | System Administrator | Export dashboard as PDF | IT3 |
| **US09-EP06-KPI-ViewAdministrativeDashboard** | Managing Partner | Billing, hour costs and monthly summary | MVP |

> **US09 is new**, derived from "Dashboard Administrativo" in the 23 Apr 2026
> session, which had no epic assigned.

---

## EP07-JudicialConnectors (JCN) — OUT OF MVP / FASE 2

| ID | Archetype | Capability | Slice |
|---|---|---|---|
| US01-EP07-JCN-ViewConnectorStatus | Case Manager | Last sync date, success/failure | IT2 |
| US02-EP07-JCN-TriggerManualSync | Case Manager | On-demand sync per case | IT2 |
| US03-EP07-JCN-ConfigureConnectors | System Administrator | Court systems, credentials, frequency | IT2 |
| US04-EP07-JCN-MapCasesToConnectors | Associate Attorney | Link cases to connectors | IT2 |
| US05-EP07-JCN-ReviewImportedUpdates | Paralegal | Approve imports before merge | IT2 |
| US06-EP07-JCN-ReceiveSyncAlerts | Case Manager | Alerts on failure or new updates | IT2 |
| US07-EP07-JCN-FilterConnectorLogs | System Administrator | Filter logs by date, court, case | IT3 |
| US08-EP07-JCN-ScheduleAutomaticSync | System Administrator | Daily 6 AM scheduled sync | IT3 |
| US09-EP07-JCN-ExportSyncReport | Managing Partner | Monthly sync activity report | IT3 |

> Entire epic deferred to Fase 2. **Credential custody warning:** storing each
> firm's court portal credentials carries the same handling requirements as the
> CSD (Constitution, PAC section).

---

## EP08-TimeTracking (TTK) — SCOPE CONFLICT OPEN

| ID | Archetype | Capability | Slice |
|---|---|---|---|
| US01-EP08-TTK-StartStopTimer | Associate Attorney | Live timer on a case | MVP |
| US02-EP08-TTK-LogManualHours | Associate Attorney | Manual entry with date, case, description | MVP |
| US03-EP08-TTK-EditTimeEntries | Associate Attorney | Edit/delete within 24 h | IT2 |
| US04-EP08-TTK-ViewMyTimesheet | Associate Attorney | Own timesheet by date range | MVP |
| US05-EP08-TTK-LogParalegalHours | Paralegal | Record support work time | MVP |
| US06-EP08-TTK-ApproveTimeEntries | Billing Manager | Approve/reject submitted entries | IT2 |
| US07-EP08-TTK-ExportTimeDataToCFDI | Billing Manager | Export approved entries to invoicing | IT2 |
| US08-EP08-TTK-ViewTeamHours | Case Manager | Aggregated hours per member per case | IT3 |
| US09-EP08-TTK-SetTimeEntryAlerts | Case Manager | Weekly alerts for missing timesheets | IT3 |
| US10-EP08-TTK-ConfigureBillableRates | System Administrator | Default and case-specific rates | MVP |
| US11-EP08-TTK-ManageTimeTrackingPermissions | System Administrator | Grant/revoke log, approve, export rights | MVP |
| US12-EP08-TTK-ViewUtilizationDashboard | Managing Partner | Utilization rates, quarterly billable hours | IT3 |
| US13-EP08-TTK-ViewClientHoursPortal | Corporate Client | Hours logged on own cases | TBD |

---

## EP09-Billing (BIL)

| ID | Archetype | Capability | Slice |
|---|---|---|---|
| US01-EP09-BIL-ViewMonthlyBillingSummary | Billing Manager | Monthly total and MoM change | MVP |
| US02-EP09-BIL-ViewPendingInvoices | Billing Manager | Count and value of pending invoices | IT2 |
| US03-EP09-BIL-ViewPaidInvoices | Billing Manager | Count and total paid this month | IT2 |
| US04-EP09-BIL-ViewAveragePaymentTime | Billing Manager | Average payment time and change | IT2 |
| US05-EP09-BIL-GenerateNewInvoice | Billing Manager | Create invoice with client, concept, dates, amount | MVP |
| US06-EP09-BIL-FilterInvoices | Billing Manager | Filter by number, client, concept, dates, amount, status | IT2 |
| US07-EP09-BIL-DownloadInvoicePDF | Billing Manager | Download invoice PDF | IT2 |
| US08-EP09-BIL-SwitchBillingTabs | Billing Manager | Invoices / Time Records / Reports tabs | IT2 |
| US09-EP09-BIL-ViewInvoiceDetails | Billing Manager | Invoice detail view | MVP |
| US10-EP09-BIL-GenerateBillingReport | Billing Manager | Period billing reports | IT3 |
| US11-EP09-BIL-ViewBillingKPIs | Managing Partner | Billing KPI summary cards | IT3 |
| US12-EP09-BIL-UpdateInvoiceStatus | Billing Manager | Mark paid / cancelled | MVP |

> **Gap:** no US covers CFDI stamping via PAC, cancellation with SAT acuse,
> complemento de pago, or multi-issuer CSD handling. The heaviest technical work
> in this epic is unspecified. Must be resolved in Discovery.

---

## EP10-SystemConfiguration (CFG)

| ID | Archetype | Capability | Slice |
|---|---|---|---|
| US01-EP10-CFG-ManageUsers | System Administrator | Create, edit, deactivate accounts | MVP |
| US02-EP10-CFG-ManageRoles | System Administrator | Define and assign roles | MVP |
| US03-EP10-CFG-ConfigurePermissions | System Administrator | Granular permissions per role | MVP |
| US04-EP10-CFG-ConfigureBillingParameters | Billing Manager | Rates, tax rates, invoice templates | MVP |
| US05-EP10-CFG-ConfigureCFDIIntegration | Billing Manager | CFDI credentials | IT2 |
| US06-EP10-CFG-ConfigureClientPortal | System Administrator | Portal branding, access levels, auth | TBD |
| US07-EP10-CFG-ConfigureJudicialConnectors | System Administrator | Add and test court portal connections | IT3 |
| US08-EP10-CFG-ConfigureNotifications | System Administrator | Email and WhatsApp templates and triggers | IT2 |
| US09-EP10-CFG-ConfigureKPIDashboards | Managing Partner | Default KPIs and alert thresholds | IT3 |
| US10-EP10-CFG-ConfigureTimeTrackingRules | Associate Attorney | Time increments and rounding rules | IT3 |

> **US01–US03 overlap EP00 and EP12** (US11–US13-EP00-FND,
> US01-EP12-ASC-InviteUser). Resolve before /specify: EP00 owns the mechanism,
> EP10 owns the admin UI. **US08 is a scope conflict** (WhatsApp).

---

## EP11-ProfileManagement (PMG)

| ID | Archetype | Capability | Slice |
|---|---|---|---|
| US01-EP11-PMG-EditBasicInfo | System User | Edit full name and address | MVP |
| US02-EP11-PMG-ManageContact | System User | Configure email and phone | MVP |
| US03-EP11-PMG-UpdatePhoto | System User | Upload/change profile picture | IT2 |

> **US02 conflicts with the IdP.** If email is the identity identifier, changing
> it is an identity operation requiring step-up MFA and re-verification, not a
> profile edit. Must be resolved with spec 002.

---

## EP12-AccountSecurity (ASC) — REWRITTEN

| ID | Archetype | Capability | Slice |
|---|---|---|---|
| US01-EP12-ASC-InviteUser | System Administrator | Invite by email with target role | FND |
| US02-EP12-ASC-EnrollMFAFactor | System User | Mandatory second factor at enrollment | FND |
| US03-EP12-ASC-ReceiveBackupCodes | System User | Single-use backup codes | FND |
| US04-EP12-ASC-RejectExpiredInvitation | System Administrator | Single-use, expiring invitations | FND |
| US05-EP12-ASC-PreventAccountEnumeration | System Administrator | No disclosure of email existence | FND |
| US06-EP12-ASC-AuthenticateWithMFA | System User | Second factor on every sign-in | FND |
| US07-EP12-ASC-ExpireIdleSession | Managing Partner | Idle and absolute expiry by role class | FND |
| US08-EP12-ASC-SignOut | System User | Immediate invalidation, server and IdP | FND |
| US09-EP12-ASC-ViewActiveSessions | System User | Device, location, last activity | IT2 |
| US10-EP12-ASC-RevokeSession | System User | Revoke individually or all | IT2 |
| US11-EP12-ASC-RevokeSessionsOnDeactivation | System Administrator | Deactivation revokes all sessions | FND |
| US12-EP12-ASC-StepUpForSensitiveOperation | Managing Partner | Fresh factor regardless of session age | FND |
| US13-EP12-ASC-RecoverWithBackupCode | System User | Recover and re-enroll a factor | FND |
| US14-EP12-ASC-RequestAssistedMFAReset | System User | Defined path when codes exhausted | IT2 |
| US15-EP12-ASC-PerformAssistedMFAReset | System Administrator | Reset with step-up + out-of-band reference | IT2 |
| US16-EP12-ASC-AuditMFAReset | Managing Partner | Reset logged with authorising party | IT2 |
| US17-EP12-ASC-ReviewTenantMFAStatus | System Administrator | MFA coverage across own tenant | IT2 |

> **Retired:** `US01-EP12-Security-ChangePassword` — handled by the external IdP,
> not this product. `US02-EP12-Security-ActiveDevices` — superseded by US09/US10.

---

## EP13-ClientPortal (PTL) — UNVALIDATED

| ID | Archetype | Capability | Slice |
|---|---|---|---|
| US01-EP13-PTL-ViewCaseStatus | Corporate Client | Current status of each active case | TBD |
| US02-EP13-PTL-ReviewHistoricCases | Authorized Third-Party Viewer | Closed cases with outcomes and dates | TBD |
| US03-EP13-PTL-UploadRequiredDocumentation | Family Member / Legal Guardian | Secure upload to case file | TBD |
| US04-EP13-PTL-ViewBillingStatus | Corporate Billing Contact | Amounts due and due dates | TBD |
| US05-EP13-PTL-SendMessageToFirm | External Legal Representative | Secure messaging to legal team | TBD |
| US06-EP13-PTL-RequestMeetingSlot | Corporate Client | Request meeting from available windows | TBD |
| US07-EP13-PTL-ReceiveCaseNotifications | Individual Client | Real-time notifications | TBD |
| US08-EP13-PTL-DownloadCaseDocuments | Authorized Third-Party Viewer | Bulk ZIP download | TBD |
| US09-EP13-PTL-TrackDocumentRequests | Family Member / Legal Guardian | Checklist with submission deadlines | TBD |
| US10-EP13-PTL-ProvidePortalFeedback | Corporate Client | Feedback after case milestones | TBD |

> **Missing entirely:** external user onboarding — invitation, enrollment and
> first access for a client. With universal mandatory MFA, that flow is a
> precondition for this epic to function at all. Do not spec EP13 until it exists.
> **Cost note:** external users will outnumber internal roughly 10:1 per tenant,
> driving IdP MAU cost and MFA reset support volume, both of which land on CC's
> iguala margin.

---

## EP14-NoteManagement (NOT) — NEW

Source: "Gestión de Notas — alta de notas asignadas a Expediente. Histórico por
mes se deberá mostrar dentro de Expediente." (23 Apr 2026)

| ID | Archetype | Capability | Slice |
|---|---|---|---|
| US01-EP14-NOT-CreateCaseNote | Associate Attorney | Create a note attached to a case | MVP |
| US02-EP14-NOT-ViewNoteHistoryByMonth | Case Manager | Note history grouped by month within the case | MVP |
| US03-EP14-NOT-EditOwnNote | Associate Attorney | Edit own note within a defined window | IT2 |
| US04-EP14-NOT-RestrictNoteVisibility | Managing Partner | Limit note visibility by role | IT2 |
| US05-EP14-NOT-AuditNoteChanges | Managing Partner | Note creation and edits in the audit log | MVP |

> `[NEEDS CLARIFICATION]` Are notes ever client-visible via EP13, or strictly
> internal work product? This affects privilege and cannot be assumed.

---

## EP15-QuoteManagement (QTE) — NEW

Source: "Alta de Cotización — subir documentos de propuesta para indicar si el
cliente acepta o no la cotización. Se requiere histórico de actividad, costo por
hora por expediente, carga de pagos de cliente." (23 Apr 2026)
Referenced by EP16 ("link to EP15/EP09").

| ID | Archetype | Capability | Slice |
|---|---|---|---|
| US01-EP15-QTE-UploadQuoteDocument | Billing Manager | Upload a proposal document to a case | MVP |
| US02-EP15-QTE-RecordQuoteDecision | Billing Manager | Record client acceptance or rejection | MVP |
| US03-EP15-QTE-SetCaseHourlyRate | Billing Manager | Set hourly cost per case | MVP |
| US04-EP15-QTE-RegisterClientPayment | Billing Manager | Register payments received from client | MVP |
| US05-EP15-QTE-ViewQuoteHistory | Managing Partner | Quote and decision history per case | IT2 |
| US06-EP15-QTE-LinkQuoteToInvoice | Billing Manager | Link accepted quote to invoicing | IT2 |

> `[NEEDS CLARIFICATION]` Does US04 (client payments) overlap
> US12-EP09-BIL-UpdateInvoiceStatus? Payment registration must live in exactly
> one place or the ledger diverges.

---

## EP16-CostCenter (CCT) — DRAFT

| ID | Archetype | Capability | Slice |
|---|---|---|---|
| US01-EP16-CCT-AssignViaticosToAttorney | Billing Manager | Assign travel budget, optionally per case | DFT |
| US02-EP16-CCT-RegisterExpense | Associate Attorney | Register expense against assigned budget | DFT |
| US03-EP16-CCT-RegisterPaymentToAttorney | Billing Manager | Auditable ledger of internal disbursements | DFT |
| US04-EP16-CCT-ViewCostSummary | Managing Partner | Monthly cost summary beside revenue | DFT |

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
- EP00 created — tenancy, audit and permissions had no epic
- EP12 rewritten from 2 US to 17
- EP14 and EP15 created, closing the numbering gap EP16 already referenced
- Four April features assigned: Notes → EP14, Quotes → EP15, Case Activity →
  EP02 US11–13, Admin Dashboard → EP06 US09
- EP05, EP06, EP13 renamed to match their actual scope
- `<ModuleCode>` applied to all 169 US per the Handbook
- Mislabeled and malformed IDs in EP01 corrected

**Still open**
1. Can a user belong to more than one tenant? Blocks the identity model.
2. EP13 unvalidated against client priorities; external onboarding missing.
3. EP09 has no CFDI stamping, cancellation or multi-issuer stories.
4. US01–US03-EP10 overlap EP00/EP12 — ownership must be split.
5. US02-EP11 (change email) conflicts with IdP identity semantics.
6. Offline operation unspecified and unestimated.
