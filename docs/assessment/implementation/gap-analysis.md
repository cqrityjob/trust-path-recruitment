# Requirements gap matrix

Current state of `origin/main` @ `bec5f9d` against *CQrityjob Security Competency Core Specification v2.0*, established by read-only investigation before any code was written.

Classification: **compliant** · **partial** · **missing** · **conflicting** · **legacy-retire** · **needs-review**

## A. Pre-existing ground truth

| Area | What actually exists |
|---|---|
| Legacy catalogue | `assessments` (TEXT id) × `assessment_versions` (`model_version`, `disclaimer_version`, `published_at`, `retired_at`). Four rows; `security_career_guidance` (0 runs, dead), `career-guidance` (8 completed runs), `public-career-assessment` (5 completed runs), `security-guard-foundation` (3 assignments, 1 completed). |
| Career Guidance content | 16 frozen questions in `src/lib/assessment-content.ts`, 16 mappings in `career-assessment/question-mappings.ts`, 14 dimensions, 19 competencies, 32 Question Library assets. |
| Assignment flow | `assessment_assignments` with a six-state machine, employer-scoped RLS, immutability-after-completion trigger, invitation tokens, email delivery tracking. |
| Blueprint Engine (H4.1) | Backend-only, never launched: `questions`/`question_versions`, `modules`/`module_versions`, `blueprints`/`blueprint_versions`, `evidence_signals`, scoring/requirement profile versions, content-event tables, publish/archive RPCs. Competency source is `cig_competencies`. |
| Identity & roles | `app_role` enum (superadmin, admin, content_editor, assessment_editor, support) + `user_roles` + `has_role()`; `employer_memberships` + `has_employer_role()` + `is_platform_admin()`. |
| Audit | `audit_logs` (service_role only, no client grants) + Blueprint Engine `*_content_events`. |
| Tests | 10 `scripts/*-check.ts` guards; CI runs lint (non-blocking), `tsc --noEmit`, `cie:check`, `kg:check`. No test runner configured. Playwright present but no assessment E2E. |
| Error codes | ~70 codes, all SCREAMING_SNAKE_CASE. |

## B. Requirement-by-requirement

| # | Spec requirement | Before | After PR-A | Notes |
|---|---|---|---|---|
| 1 | Separate assessment family for Security Competency (1.1, 13.1) | **missing** | **compliant** | `scp_assessment_families`, 3 rows, slug+product_type immutable |
| 2 | Twelve SCC constructs with stable IDs separate from versioned definitions (5, 13.1) | **missing** | **compliant** | `scp_competencies` (12) + `scp_competency_versions` (12 published) |
| 3 | Competency facets for content coverage (5.1, 6) | **missing** | **compliant** | `scp_competency_facets`, 48 rows (4 per construct) |
| 4 | Professions with market metadata (13.1, directive §7) | **missing** | **compliant** | 3 Swedish regulated roles, explicit `market='SE'` |
| 5 | Assessment definitions, family-link and purpose immutable (13.1) | **conflicting** | **compliant** | Legacy `assessments` has no family concept at all; new table + identity trigger |
| 6 | Assessment versions with validation status and retirement (13.1, 14) | **partial** | **compliant** | Legacy had `retired_at` but no validation status; new table has both |
| 7 | Item + item version foundation (13.1, Bilaga A) | **missing** | **compliant** | `scp_items` + `scp_item_versions` with format, constructs, review evidence |
| 8 | Three item formats: SJT best-response, SJT rate-effectiveness, BIQ frequency (7.2, 7.3) | **missing** | **compliant** | `item_format` CHECK |
| 9 | Per-option scoring key 0–3 with written rationale (Bilaga A) | **missing** | **compliant** | `scp_item_options`, range CHECK, `scoring_rationale_sv` NOT NULL |
| 10 | Scoring key never reaches the browser (12.1, AC-12) | **missing** | **compliant** | Key in separate table from label; RLS default-deny for non-authoring roles; proven by test |
| 11 | Language adaptations as separate linked objects (7.1, 11) | **conflicting** | **compliant** | Blueprint Engine uses `text_sv`/`text_en` columns; new model uses `scp_item_texts` rows with `adaptation_status` |
| 12 | Forms with controlled randomisation (7.1, 13.1) | **missing** | **compliant** | `scp_forms` + `scp_form_items` with `block_key`, `randomise_options` |
| 13 | Core + Module bundle lineage (2, 13.1) | **missing** | **compliant** | `scp_bundle_versions` pins core/module version, both forms, scoring/report/disclaimer versions |
| 14 | Role weight profiles with validation status (5.2, 13.1) | **missing** | **compliant** | `scp_role_weight_profiles` + weights, 0–12 scale, default `design` |
| 15 | Published content immutable via UI/API/SQL/service role (13.2, AC-8/9, T-004) | **missing** | **compliant** | `BEFORE UPDATE` triggers on 4 version tables + 5 child tables; 8 assertions |
| 16 | Two-person publication principle (13.3, T-013) | **missing** | **partial** | Table + roles + RLS in place; the enforcing publish RPC is PR-B |
| 16a | Scoring weights versioned, configurable, not hard-coded (owner decision A) | **missing** | **compliant** | `scp_scoring_versions`; bundles hold an FK; CI fails on a hard-coded 0.7/0.3 |
| 16b | Non-operational status prevents assignment to real candidates (owner decision B) | **missing** | **compliant** | `scp_bundle_version_assignability()`, fails closed; 9 assertions |
| 16c | Legally dependent items unpublishable without recorded review (owner decision C) | **missing** | **compliant** | Publication trigger + second check at assignment; 6 assertions |
| 16d | Explicit, reviewed cross-profession item reuse (owner decision D) | **missing** | **compliant** | `scp_item_version_professions` with per-role job-analysis reference |
| 17 | Assessment editor / reviewer / publisher roles (13.3) | **partial** | **compliant** | Only `assessment_editor` existed; `scp_content_roles` adds all three without mutating `app_role` |
| 18 | Append-only audit of critical actions (12.1, 13.1, AC-20) | **partial** | **compliant** | `scp_content_events`, no UPDATE/DELETE grant; retirement itself logged |
| 19 | Legacy `security-guard-foundation` retired, never mutated (2.2, §6, AC-4/5/6, T-002/003) | **legacy-retire** | **compliant** | `retired_at` + `retired_reason` + catalogue hidden + INSERT-only guard; 4 assertions |
| 20 | Stable error code for retired assessment (T-002) | **missing** | **compliant** | `ASSESSMENT_RETIRED` — see conflict note below |
| 21 | SHA-256 content hash on published versions (13.2) | **missing** | **partial** | `content_hash` columns exist; computation is PR-B |
| 22 | Legal review gate for Swedish regulated content (10.3) | **missing** | **compliant** | `legal_basis_required` + `legal_review_status` + CHECK constraint |
| 23 | Bias / SME review evidence (7.4) | **missing** | **compliant** | First-class columns with review-status CHECKs |
| 24 | AI-authored drafts never auto-operational (7.1, 7.5) | **missing** | **compliant** | `authored_by_ai` flag; validation status defaults to `design` |
| 25 | Draft items cannot be assigned (AC-15) | **missing** | **compliant** | The assignability gate blocks a bundle if any item in either form is unpublished; asserted |
| 26 | Item bank not readable by employer (13.3, AC-13) | **missing** | **compliant** | RLS default-deny; proven by differential test (employer 0 rows, editor >0) |
| 27 | Career Guidance content not reused (§5, 13.2, AC-2/3) | **conflicting** | **compliant** | This was the defect. Now: separation trigger + CI guard + no FKs |
| 28 | Career Guidance unchanged and operational (§5, T-020) | — | **compliant** | Zero files touched; guard asserts 16/16/14 still intact |
| 29 | Deterministic server-side scoring, 70/30 (8.1, 8.2) | **missing** | **missing** | PR-D |
| 30 | Quality flags and interpretation strength (8.4, 8.5) | **missing** | **missing** | Types defined; implementation is PR-D |
| 31 | Candidate + employer reports with lineage, validation status, disclaimer (9) | **missing** | **missing** | PR-E |
| 32 | Prohibited-language guards (9.2, 13) | **missing** | **missing** | PR-E |
| 33 | Candidate runtime: autosave, resume, idempotent submit (AC-22, T-005/010/011) | **missing** | **missing** | PR-C |
| 34 | Pilot analytics, deidentified export (15.1, AC-12) | **missing** | **missing** | PR-F |
| 35 | Norms / benchmarks | **missing** | **missing** | Deliberately deferred (spec 8.3, 15.3) |
| 36 | DPIA, retention schedule, candidate rights flow (12) | **needs-review** | **needs-review** | Owner + DPO decision, not an engineering task |
| 37 | Psychometric approval of constructs and weights | **needs-review** | **needs-review** | Bilaga D sign-off page is unsigned |
| 38 | Item content for Core (144 draft) and 3 modules (48 each) | **missing** | **missing** | PR-B authoring flow first; content is a separate, expert-reviewed deliverable |

## C. Documented conflicts and how they were resolved

**1. Error-code casing.** The specification writes the retirement code as `assessment_retired` (T-002). This repository's established convention for every one of ~70 thrown error codes is SCREAMING_SNAKE_CASE. Resolved in favour of repository convention: the stable code is `ASSESSMENT_RETIRED`. Source-of-truth order places existing repository conventions below the specification, but the specification says "en stabil felkod" — stability, not casing, is the requirement, and consistency with the surrounding codebase serves it better. Recorded in `src/lib/security-competency/types.ts`.

**2. Table naming.** Spec 13.1 names tables `assessment_definitions`, `assessment_versions`, `assignments`. `assessment_versions` is a live table with production rows. Resolved with the `scp_` prefix (matching the existing `cig_` convention) and a documented mapping. No weakening of the model.

**3. Reviewer/publisher roles vs the `app_role` enum.** Adding enum values inside a migration transaction cannot then be used in the same transaction, and mutating a live enum referenced by existing RLS policies is not backwards-compatible. Resolved with the additive `scp_content_roles` table. `app_role` is untouched.

**4. Blueprint Engine overlap.** Rejected as a base — full reasoning in the [ADR](../../architecture/adr-security-competency-product-separation.md) and in the migration header. Its conventions are reused; its tables are not.

**5. Facets as reportable scales.** Spec 5.1 forbids reporting facets as separate psychometric scales before each has sufficient items and its own validity evidence. Facets are therefore stored for content coverage and item design only; no report surface reads them. Recorded as a table comment so a future implementer meets the constraint where they would otherwise violate it.

## D. Owner decisions — resolved 2026-07-27

Four of the questions raised in the original PR-A report have been decided and implemented. Full text and implementation notes: [owner-decisions.md](../governance/owner-decisions.md).

| Question | Decision | Status |
|---|---|---|
| Constructs and 70/30 weighting | Approved as provisional baseline; must be versioned and configurable | Implemented (A2 §1) |
| DPIA | Required before real recruitment use; not a blocker for development or staging | Implemented as a non-operational assignability gate (A2 §4) |
| Swedish legal review | Content may be drafted; may not publish or assign until review recorded | Implemented (A2 §2) |
| Separate profession item banks | Separate identities and lineage; genuine reuse modelled explicitly | Implemented (A2 §3) |

## E. Still requiring a decision that is not engineering's to make

| Item | Owner |
|---|---|
| Psychometric sign-off before the weighting leaves `design` | Psychometric specialist (Bilaga D) |
| The DPIA itself, before any real recruitment use | Legal / DPO |
| The legal reviews the schema now demands for Ordningsvakt and Skyddsvakt items | Qualified Swedish legal reviewer |
| SME panel composition (spec 14 wants ≥15 SMEs from ≥5 environments) | Product owner |
| Retention periods per data class (spec 12) | Legal / DPO |
| The unimplemented data export/deletion right already promised in UI copy (`dictionaries.ts:2243`) | Product owner — pre-existing, outside this specification, still a live exposure |
