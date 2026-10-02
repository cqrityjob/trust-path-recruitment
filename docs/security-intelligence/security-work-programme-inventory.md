# Security Work — inventory before the programme redesign

Baseline: `0523602` (main after PR #364), inspected 2026-10-02 before any code
was written for the Security Command Center work. Facts only; the design that
follows from them is in `security-work-programme.md`.

## Routes (all under `src/routes/_authenticated.security-work*.tsx`)

| Route                                             | Component                                   |
| ------------------------------------------------- | ------------------------------------------- |
| `/security-work`                                  | `Entry` (workspace choice / create)         |
| `/security-work/$workspaceId`                     | `Overview`                                  |
| `/security-work/$workspaceId/monitoring`          | `Monitoring` (requirements + inbox)         |
| `/security-work/$workspaceId/analyses`            | `Analyses` (list, `?new=&method=`)          |
| `/security-work/$workspaceId/analyses/$analysisId`| `AnalysisDetail`                            |
| `/security-work/$workspaceId/risks`               | `RisksActions`                              |
| `/security-work/$workspaceId/reports`             | `Reports` list                              |
| `/security-work/$workspaceId/reports/$reportId`   | `Reports` detail (preview / approve / export)|
| `/security-work/$workspaceId/sources`             | `Sources` (evidence library)                |
| `/security-work/$workspaceId/sources/$sourceId`   | `SourceDetail`                              |
| `/security-work/$workspaceId/settings`            | `Profile` (monitoring profile + workspace)  |

The shell is `SecurityWorkLayout` (sidebar navigation, mobile menu), the
workspace context is `SecurityWorkspaceProvider` (`context.tsx`), identity is
`SecurityIdentityProvider`. Every page uses `useSecurityWorkspace()` for the
RLS-scoped snapshot, `canEdit`, `refresh()` and `deny()`.

## Components (`src/components/security-work/`)

`AiDraft`, `Analyses`, `AnalysisDetail`, `AssistanceStatus`, `Citations`,
`Entry`, `Evidence`, `ItemDetail`, `Monitoring`, `Overview`, `Profile`,
`Reports`, `Requirements`, `RisksActions` (exports `RiskEditor`,
`ActionEditor`, `RatingField`), `SecurityWorkLayout`, `SourceDetail`,
`Sources`, `analysis-ui` (`useWorkText`, `usePortfolio`, `useSavedOperation`,
`WorkStatus`, `RiskRating`), `ui` (`WorkButton`, `Field`, `TextField`,
`TextAreaField`, `PageHeading`, `EmptyState`, `SafetyNotice`, `WorkError`,
`formatDate`, `useUnsavedWarning`), `context`, `items`.

## Database (schema `public`, prefix `sw_`, helpers in `sw_private`)

Foundation `20261210090000_security_work_foundation.sql`:
`sw_workspaces`, `sw_workspace_memberships` (owner/editor/viewer,
`can_approve`), `sw_monitoring_profiles`, `sw_intelligence_requirements`,
`sw_sources`, `sw_source_items` (immutable facts), `sw_intelligence_items`
(triage), `sw_assessments`, `sw_risks` (`assessment_id NOT NULL`,
likelihood/consequence 1–5, proposed → accepted → closed), `sw_controls`,
`sw_actions` (`assessment_id NOT NULL`, `risk_id`, assignee, priority, due,
status open/in_progress/blocked/completed/cancelled), `sw_reports` (eight
legacy sections, draft → approved → exported/archived), `sw_citations`,
`sw_ai_runs`, `sw_audit_events`, `sw_record_versions`.

Analysis contract `20261211090000_security_work_analysis_contract.sql`:
`sw_method_versions` (rsa-v1 matrix, monitoring-v1, legacy), `sw_report_templates`,
`sw_analysis_inputs`, `sw_analysis_questions`, `sw_documents` (+ Storage bucket
`sw-documents`), `sw_extraction_segments`, `sw_report_approvals` (frozen
bundle), `sw_revision_requests`, `sw_ai_activations` (+ revocations),
`sw_processing_jobs`, `sw_report_exports`, `sw_ai_draft_applications`;
`sw_private.worker_keys`, `approval_intents`, `source_write_intents`.

Public RPCs: `sw_create_personal_workspace`, `sw_preview_report`,
`sw_approve_report`, `sw_revise_analysis`, `sw_revise_report`,
`sw_reserve_document`, `sw_reserve_processing`, `sw_dispatch_processing`,
`sw_complete_processing`, `sw_export_report`, `sw_apply_ai_draft`.

### RLS and guards

Every `sw_*` table has RLS, `REVOKE ALL`, `GRANT SELECT` with policy
`sw_member_read USING (sw_private.can_read(workspace_id))`; editors get
INSERT/UPDATE with `sw_private.can_edit(workspace_id)`. Predicates are
`SECURITY DEFINER`, `search_path = ''`, read only memberships, and require a
real non-anonymous human (`sw_private.is_human()`). Trigger
`sw_private.guard_record` (sw_10_guard) pins creator, immutable parent
identities (`assessment_id`, `risk_id`, `report_id`, `source_id` …), bumps
`version`, stamps `updated_at`. `sw_private.guard_lifecycle` (sw_20_lifecycle)
owns state machines and decision stamps (accepting a risk requires an approver
with `can_approve`, a rationale and — today — an approved parent assessment).
`sw_private.record_change` (sw_90_audit, definer) writes `sw_audit_events`
and version snapshots; history tables reject UPDATE/DELETE. The foundation
test asserts that every `sw_private` function pins `search_path=''` and that
no new function is executable by PUBLIC/anon/service.

### Workspace / organisation model

`sw_workspaces.kind` is `personal` or `organisation`; membership is the only
authority. There is no employer, candidate, Career or Passport relationship
in any predicate. One personal workspace per owner; organisation workspaces
exist in the schema without an invitation flow yet.

## Services and server functions (`src/lib/security-work/`)

`services.ts` (workspace, profile, requirements, sources, items, triage;
`requireWorkspace` precheck + RLS; `workResult` error envelope),
`security-work.functions.ts` (TanStack `createServerFn` + `requireSupabaseAuth`
+ Zod validators), `analysis-services.ts` / `analysis.functions.ts`
(portfolio, analysis detail, risks, actions, reports, citations, approvals,
revisions), `documents.functions.ts` (evidence list, upload, extraction),
`ai.functions.ts` + `processing/ai-jobs.server.ts` (AI status and draft
jobs), `report-export.ts` (frozen bundle HTML/print), `question-provenance.ts`.

## Monitoring, analyses, risk register, actions, reports, evidence

- Monitoring: requirements, manual sources/source items, triage with rationale,
  audit history per item.
- Analyses: RSA (calibrated 5×5 matrix) and monitoring analyses with inputs,
  questions, citations, AI drafts, review → approval, revisions.
- Risk register: `RisksActions` lists risks (always under an analysis) and
  actions (always under an analysis, optionally under a risk). No owner on
  risks; no link to protected assets; no gap concept.
- Reports: analysis reports with frozen approval bundles and exports. No
  management status report.
- Evidence: `Evidence.tsx` lists facts, extracted segments and documents;
  links exist only as citations and analysis inputs.

## AI implementation

Status: `getWorkAiStatus` → `workAiStatus` (env `SW_AI_ENABLED`, provider,
model, key, worker signing, plus an unrevoked `sw_ai_activations` row). No
activation exists; AI is **not** active anywhere. Draft generation is a
signed processing job (`sw_processing_jobs`) whose output is applied only via
`sw_apply_ai_draft` with provenance (`sw_ai_draft_applications`). Prompt and
schema contracts live in `processing/contracts.ts` and `ai.server.ts`
(Anthropic Messages API, injection screening, output validation). There is no
general-purpose assistant and no generic suggestion store.

## Audit history, permissions, localisation, tests

- Audit: `sw_audit_events` for every table with a trigger; `sw_record_versions`
  snapshots for assessments, risks, actions, reports.
- Permissions: viewer (read), editor (write), owner (workspace settings),
  `can_approve` (approve reports, accept/close risks).
- Localisation: `useT()` keys `sw.*` in `src/i18n/security-work-copy.ts`
  (Swedish source, English parity enforced by type) for the monitoring side;
  analysis pages use inline `useWorkText()(sv, en)` pairs. Language comes from
  the site-wide provider (`cqrityjob.lang`).
- Tests: SQL suites `supabase/tests/security_work_foundation_test.sql` (322+
  assertions), `security_work_analysis_contract_test.sql`,
  `security_work_negative_controls.sql`, registered by hand in
  `scripts/db-test.sh` (which also stands the foundation down and re-applies
  it, so every later SW migration needs its own rollback script in that
  sequence). Deterministic scripts: `scripts/security-work-*.ts` (bun +
  `node:assert`), typechecked via `tsconfig.scripts.json`. Browser/integration
  checks run in `.github/workflows/security-work-browser.yml` against a local
  Supabase stack. No vitest; no unit-test discovery.

## Release conventions that constrain this change

- Next canonical migration slot: `20270108090000` (ledger leads the clock).
- Every migration needs a rollback in `supabase/rollback/`, an entry in
  `supabase/release-state.json` (`hostedState: pending`, `introduces`), a
  line in `scripts/release-frontier-check.ts` `expectedPending`, and a
  registration in `scripts/db-test.sh`.
- `scripts/schema-first-release-check.ts` refuses to make application code
  merge-eligible while the migration it depends on is not recorded as
  applied. A branch carrying both halves is therefore expected to be red on
  that one check until the schema half has been merged and applied first.
