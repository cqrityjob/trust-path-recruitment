# Security Work programme — Security Command Center

Branch `claude/compassionate-turing-2a2evm`. Inventory first:
`security-work-programme-inventory.md`. This document is the delivery note.

## 1. Architecture summary

One programme, six areas, no wizard:

| #   | Area                     | Records                                                     | Module(s)                            |
| --- | ------------------------ | ----------------------------------------------------------- | ------------------------------------ |
| 1   | Mission & Mandate        | `sw_security_mandates`                                      | `/mandate`                           |
| 2   | Protected Assets         | `sw_protected_assets`, `sw_risk_assets`                     | `/assets`                            |
| 3   | Threats & Risks          | `sw_risks` (+ owner, scenario, source), `sw_risk_assets`    | `/risks` (existing)                  |
| 4   | Security Baseline & Gaps | `sw_baseline_assessments`, `sw_baseline_answers`, `sw_gaps` | `/baseline`, `/gaps`                 |
| 5   | Actions & Governance     | `sw_actions` (+ gap, asset, source, approval)               | `/risks`, `/gaps`                    |
| 6   | Monitoring & Reporting   | existing monitoring, `sw_management_reports`                | `/monitoring`, `/reports` (existing) |

Cross-cutting: `sw_evidence_links` (evidence library attached to any record),
`sw_ai_suggestions` (every AI output), `sw_programme_plans` (optional 90-day
plan). Content (baseline questions, help texts, maturity ladder, 90-day
checklist) lives in the repository, versioned
(`src/lib/security-work/programme/content/`); the database stores only
answers and progress together with the content version and market.

Layers:

- `src/lib/security-work/programme/rules.ts`, `maturity.ts`, `gaps.ts`,
  `management-report.ts` — pure deterministic functions over a plain
  `ProgrammeFacts` snapshot. No I/O, no AI.
- `services.ts` / `programme.functions.ts` — caller-scoped reads and writes
  through the existing `requireWorkspace` precheck and RLS client.
- `assistant.server.ts` — CQrityjob Security AI (server-only).
- `src/components/security-work/*` — Overview (command center), Mandate,
  Assets, Baseline, Gaps, Plan, ManagementReport(s), extended RisksActions,
  SecurityAssistant panel, grouped navigation in `SecurityWorkLayout`.

## 2. Existing functionality reused

Workspace and membership model, RLS predicates (`sw_private.can_read/
can_edit/can_approve`), record guard and audit triggers, the analysis
pipeline (RSA/monitoring analyses, approvals, revisions), monitoring
(requirements, sources, inbox), evidence library (`sw_sources`,
`sw_documents`, extraction), reports and exports, the AI activation gate
(`sw_ai_activations`, env configuration), `useT()` copy architecture,
`WorkButton`/`Field`/`PageHeading`/`EmptyState`/`WorkError` primitives,
`usePortfolio`, `useSavedOperation`, `RiskRating`/`riskColour` (fixed
matrix), every existing route and URL.

## 3. Database changes (`supabase/migrations/20270117090000_security_work_programme.sql`)

New tables (all RLS, workspace-scoped, editor-insert/update, audited):
`sw_security_mandates`, `sw_protected_assets`, `sw_risk_assets`,
`sw_baseline_assessments`, `sw_baseline_answers`, `sw_gaps`,
`sw_evidence_links`, `sw_ai_suggestions`, `sw_programme_plans`,
`sw_management_reports`.

Altered, backward compatible: `sw_risks.assessment_id` nullable + `owner_id`,
`threat_scenario`, `source_kind`; `sw_actions.assessment_id` nullable +
`gap_id`, `asset_id`, `source_kind`, `approval_required`, `approval_note`.
Existing rows keep their analysis parent and every existing rule.

Lifecycle: `sw_private.guard_lifecycle` is re-created with one change (a
risk WITHOUT an analysis parent may be accepted by an approver with a
rationale). New `sw_private.guard_programme` (suggestions: proposed only,
content immutable, decision stamped, final; management reports: draft →
approved → archived, approver and executive position required; baselines:
one open per workspace, completion stamped) and
`sw_private.guard_action_approval` (approval-required actions completed by
approvers only, with a note).

Rollback `supabase/rollback/20270117090000_security_work_programme_rollback.sql`
refuses adopted data and restores the previous lifecycle body verbatim
(local md5 equal before/after). Registered in `release-state.json` as
`pending`, in `release-frontier-check.ts` and in `scripts/db-test.sh`.

## 4. New routes / components

Routes added under `/security-work/$workspaceId`: `/mandate`, `/assets`,
`/baseline`, `/gaps`, `/plan`, `/reports/management/$reportId`. `/risks`
accepts `?new&assetId&gapId&riskId`. Nothing removed or renamed.

Navigation: Overview · Programme (Mission & Mandate, Protected Assets,
Security Baseline) · Operations (Monitoring, Analyses, Gaps, Risks &
Actions) · Reporting (Reports, Evidence) · Settings. Gaps sits under
Operations because gaps are worked daily; it is the one addition to the
requested list.

## 5. Deterministic rules (all in `rules.ts`, tested in `scripts/security-work-programme-check.ts`)

- **Programme status** per area: `not_started | in_progress |
needs_attention | complete`, see the doc comment on `programmeStatus`.
- **Maturity**: Informal/Managed/Measured/Optimised. A domain reaches level
  L only when every applicable question at L and below is answered Yes and
  at least one applicable question at L is in scope; Partly/No/unanswered
  stop the ladder; Not applicable is removed. Overall = lowest assessed
  domain. The quick set tops out at Measured; Optimised needs the detailed
  review.
- **Gaps**: No/Partly answers are potential gaps (derived, never written);
  the user records them; recording never creates an action.
- **Attention items**: counted, ordered by severity then urgency, every
  item has a CTA.
- **Next action**: fixed precedence (overdue → mandate → assets → asset
  links → owners → ratings → baseline → risks → gaps → actions → report);
  prerequisite warnings never block.
- **Management report**: FACTS (frozen records) and SYSTEM-CALCULATED
  (counts, maturity, top risks by L×C, deltas) are built in code and stored
  apart from the NARRATIVE.

## 6. AI guardrails

- One assistant, context-aware (`assistant-capabilities.ts`); each
  capability names its contexts, its output shape (zod, no score/level/
  owner/status/decision fields) and a deterministic fallback shown when AI
  is unavailable.
- Only the records named by the context are sent; never monitoring items,
  source extracts, incident text, risk scores or anything from another
  workspace. Source records are stored on the suggestion.
- Output is validated; invalid output stores nothing. Valid output is a
  `proposed` suggestion; approving/rejecting changes only that row
  (database trigger). Applying is an explicit choice the approving human
  makes; the server then writes exactly that through the ordinary services,
  as that user, and records `applied_target`.
- The activation gate is the existing one (`SW_AI_ENABLED`, provider,
  model, key, signed worker, unrevoked `sw_ai_activations`); nothing was
  activated and no paid service was called.
- SQL suite proves: a suggestion cannot be born approved, content is
  immutable, decision stamps are trigger-owned, approval changes no
  authoritative record, no database function copies a suggestion anywhere.

## 7. RLS / security

Same pattern as the foundation for all ten tables. The suite
`supabase/tests/security_work_programme_test.sql` (56 assertions) proves
isolation for viewer, editor, approver, another workspace's owner, an
outsider, anon and service_role, plus every lifecycle rule above. The
assistant only reads through the caller's RLS client.

## 8. Test coverage

- `bun run security-work:programme-check` (19 deterministic checks, in CI).
- `supabase/tests/security_work_programme_test.sql` in `scripts/db-test.sh`
  (CI database job), with rollback refusal, stand-down and reapply proofs.
- `bun run e2e:security-work-programme` — backend-free routed journey on
  desktop and 375px mobile (in the public-entry browser job). Swedish and
  English.
- Existing `security_work_foundation_test.sql` (322) and
  `security_work_analysis_contract_test.sql` (69) pass with the migration
  applied (local replay).
- Type-check, lint and production build pass.

## 9. Screenshots

`docs/security-intelligence/programme-evidence/` (desktop 01–11, mobile
menu, baseline, overview, management report).

## 10. Known limitations

- The schema half shipped alone in #376 (`20270117090000`), was applied by
  the official integration and verified read-only
  (`docs/release/2026-10-02-security-work-programme-hosted-verification.md`);
  this branch carries the application half and that record.
- The assistant is wired to the activation gate but has not been exercised
  against a live provider (none is activated). Its provider call is a
  single bounded POST without the processing-job budget ledger.
- Approve-and-apply is two statements (writes, then the decision); if the
  decision update fails after the writes, the writes stand as explicit user
  actions and the suggestion stays proposed (the user can reject it).
- Membership names are not available to the client (only ids); owners are
  shown as "Me" / "Workspace member · id" / free text.
- Management report export is browser print; the frozen-bundle export of
  analysis reports is not reused.
- The browser journey runs on the dev server with fixtures; persistence and
  RLS are covered by the SQL suite, not by the journey.
