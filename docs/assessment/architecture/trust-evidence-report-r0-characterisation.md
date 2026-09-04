# TRUST Evidence Report — PR-R0 characterisation

_"Från evidens till en bättre intervju."_

Start SHA `755b9b0` (origin/main, 2026-09-04). Branch
`feature/trust-evidence-report-r0-characterisation`.

PR-R0 changes **no schema, no scoring, no item, no competency and no report
output**. It maps the report chain as it stands, locks the safety contracts in
two guards, and records the gaps PR-R1 (computation manifest) and PR-R2
(audience-safe read paths) must close. Every claim below was verified against a
clean replay of the 253 active migrations and by walking the flagship form
(`security-officer-recruitment-form-a`, 50 items) through three candidates in
`supabase/tests/scp_trust_evidence_report_r0_test.sql`.

## 1. Current report architecture

```
scp_employer_assign            owner/admin; closed-test grant; pins assessment_version,
                               form, purpose_version, scoring model, governance of the day
  → scp_save_response          participant; responses immutable after submit
  → scp_submit_attempt         participant; gate: every item answered
       ├ deterministic score   → scp_competency_evidence (source_type = the ITEM's declared
       │                          evidence_source_type; provenance 'deterministic')
       └ human review opened   → scp_human_reviews (constructed_response, requires_human_review,
                                  or is_safety_critical) — NO evidence row yet
  → scp_complete_human_review  employer-authorised reviewer (scp_employer_reviewers), SoD-checked
       ├ upheld                → one evidence row, provenance 'human_review', contribution from
       │                          governed key / rubric mean (writing-quality dimension excluded)
       └ adjusted/overturned   → NO evidence row; the competency reads follow_up via the review
       last review closes      → scp_attempts.scored_at (automatic, not an employer act)
  → scp_release_attempt_report owner/admin of the commissioning organisation ONLY
       reads: scp_attempt_maturity (thresholds v1, counting sources only)
              scp_attempt_evidence_state (des-v2)
              scp_attempt_assessment_signal (ras-v1)      — observed, per competency
              scp_attempt_self_report_pattern (ras-v1)    — self-report, per facet
              scp_followup_prompts, scp_interview_guide_prompts (curated, published)
       writes: scp_report_snapshots × 2 (participant, employer): payload, brief, context,
               safety_flags, derivation_input, version columns
       trigger scp_add_brief_executive_summary (BEFORE INSERT, employer only)
       sets scp_attempts.released_at / status = 'released'
  → getAcademyReport (server fn) → rds-v1 buildDecisionSupport (TypeScript, pure) → routes
  → scp_record_interview_note / scp_record_employer_decision   append-only addenda,
                                                              separate tables, never in the snapshot
```

### A–O map

| #   | Question                                      | Answer (file:line)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | Report generation entry point                 | `public.scp_release_attempt_report(uuid)` — latest body `supabase/migrations/20260830093000_scp_candidate_brief_and_interview_guide.sql:695`. The only routine whose source inserts into `scp_report_snapshots` (TR4.6).                                                                                                                                                                                                                                                                                                                                                                                         |
| B   | Release path                                  | Same function. Preconditions: caller is `owner`/`admin` in `employer_memberships` of the commissioning org (`SCP_NOT_AUTHORISED_TO_RELEASE`), `scored_at IS NOT NULL` (`SCP_RELEASE_BEFORE_SCORED`), `released_at IS NULL` (`SCP_ALREADY_RELEASED`), a published template per audience (`SCP_NO_PUBLISHED_REPORT_TEMPLATE`). EXECUTE granted to `authenticated` only; not `anon`, not `service_role` (TR4.7). No trigger calls it (TR4.9).                                                                                                                                                                       |
| C   | Report versioning                             | `scp_report_versions` (template rows, `20260803110000_...sql:~430`): `report_key`, `version_number`, `audience`, `threshold_version`, `limitations_*`. Snapshot stores `report_version_id` + `context.report_key/report_version`. Derivation versions on the row: `threshold_version='v1'`, `evidence_state_version='des-v2'`, `evidence_scope_version='attempt-v1'`, `scoring_model_version='det-v1'`; in the brief: `brief_version='rab-v1'`, `signal_version='ras-v1'`. rds-v1 is a **client-side** layer (`src/lib/security-competency/decision-support.ts:59`) and is not stamped anywhere in the database. |
| D   | Participant snapshot                          | `_par_payload` (8 lines: code, names, evidence_state, observations, behaviour, human_reviewed, reflection prompt) + `_par_brief` (modules, self_reported minus mean/spread/why, coverage) + `_par_ctx` (no attempt_status, review counts, scoring model, participant_ref). `safety_flags = []`.                                                                                                                                                                                                                                                                                                                  |
| E   | Employer snapshot                             | `_emp_payload` (8 lines incl. source_types, followup prompt) + `_emp_brief` (modules, observed with signal/mean/spread/evidence_state/why, self_reported with mean/spread, interview_guide, coverage, pace, executive_summary) + `_emp_ctx` (full lineage) + `safety_flags` (finding/severity/behaviour/observed_at).                                                                                                                                                                                                                                                                                            |
| F   | Evidence generation                           | `scp_submit_attempt` (`20260830090000:~170`) and `scp_complete_human_review` (`20260829090000`). Ledger = `scp_competency_evidence` (append-only by trigger; superseded_by pattern). Two more writers exist for training (`scp_complete_learning_module`, `scp_complete_training_programme`) whose source type does not count (TR12.2).                                                                                                                                                                                                                                                                          |
| G   | Human review state                            | `scp_human_reviews.review_status` pending → completed, `outcome` upheld/adjusted/overturned, `reviewer_rationale`, `reviewed_under_break_glass`, `reviewer_conflict_disclosed` (20260903100000). Authorisation `scp_review_authorisation(uid, attempt)`; the review row is locked `FOR UPDATE` before any write.                                                                                                                                                                                                                                                                                                 |
| H   | Free-text inclusion                           | Only via G. Raw `response_text` never enters a snapshot (TR10.9, RB7.3). Rubric levels in `scp_review_rubric_scores` (author-read only).                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| I   | Self-report separation                        | Registry rule `scp_evidence_source_types.counts_toward_maturity = false` for `self_report` (20260830090000). Excluded from `scp_compute_maturity`, `scp_attempt_maturity`, `scp_attempt_assessment_signal` and the release function's `_observed_scope` by the same join. Own keys: `brief.self_reported[]`, `coverage.self_report_observations`.                                                                                                                                                                                                                                                                |
| J   | Safety findings                               | Human only: `scp_complete_human_review` requires a finding (`no_concern/low/medium/high/critical`) on every `is_safety_critical` item and refuses one elsewhere. Stored as `safety_finding` + `safety_severity` on the evidence row; surfaced as `safety_flags` (employer) and `context.safety_concern_present` (participant). `scp_submit_attempt` cannot write either column (TR7.10).                                                                                                                                                                                                                         |
| K   | Interview context                             | Assessment side: `brief.interview_guide[]` from `scp_interview_guide_prompts` selected by focus (development → self-report → limited → confirm). Interview Intelligence side: `src/lib/interview-intelligence/context.functions.ts:336` reads `released_at, brief` of the employer snapshot; carries `followup_sv` and never `question_sv`/`listen_for`. Later notes: `scp_interview_notes` (append-only, employer-read, never written to the ledger).                                                                                                                                                           |
| L   | Direct table reads from frontend              | Two server functions read `scp_report_snapshots` (§9). No client code reads the ledger, reviews, rubric levels or templates (G4).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| M   | RPCs/views used for reports                   | `scp_release_attempt_report`, `scp_application_assessments`, `scp_employer_person_assessments`, `scp_employer_participants`, `scp_employer_decisions`, `scp_record_employer_decision`, `scp_interview_notes`, `scp_record_interview_note`, `scp_my_assessment_history`, `scp_resolve_participant_identity`. Read model view `scp_rm_competency_profile` (security_invoker) exposes `maturity_level` per subject — not used by the report routes.                                                                                                                                                                 |
| N   | Provenance/version fields                     | Snapshot columns: `report_version_id`, `threshold_version`, `scoring_model_version`, `evidence_state_version`, `evidence_scope_version`, `released_at`. Context keys: see TR11.1/TR11.2. Attempt columns: `assessment_version_id`, `form_id`, `purpose_version_id`, `scoring_model_version`, `option_order_seed`, `content_status_at_assignment`, `validation_status_at_assignment`. Evidence columns: `scoring_model_version`, `provenance_type/ref`, `derivation_basis`, `source_snapshot_hash` (always NULL today).                                                                                           |
| O   | Internal derivation in audience-readable rows | **Yes — three places** (§6).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

## 2. Evidence channel matrix

| Channel                                                            | Source table(s)                                                              | source_type / provenance                                                       | Contributes numerically                                                                                                          | Counts as observed | Counts toward maturity | Eligible for report                                                           | Participant sees                               | Employer sees                                                                     | Raw/internal derivation exposed                                                                   |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ---------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 1. SJT / scenario response (`sjt_best_response`, `sjt_best_worst`) | `scp_candidate_responses` → `scp_competency_evidence`                        | `assessment_response` / `deterministic` (or `human_review` if safety-critical) | yes: governed key (`selected_score / item_max_score`, best/worst keys) at confidence 1.000                                       | yes                | yes                    | at release, after any mandatory review closed                                 | line: state + count + reflection prompt        | line: state + count + source_types + follow-up; brief: signal/why (+ mean/spread) | ledger row readable by the **participant** (contribution, basis); `mean/spread` in employer brief |
| 2. Self-report (`biq_frequency`, 24 items incl. c07/c19)           | same                                                                         | `self_report` / `deterministic`                                                | writes contribution/confidence but **never read by any counting join**                                                           | **no**             | **no** (registry)      | at release, own key only                                                      | pattern + consistency + items (no mean/spread) | pattern + consistency + items + mean/spread + why                                 | ledger row readable by the participant (contribution); mean/spread in employer brief              |
| 3. Constructed / free-text response                                | `scp_candidate_responses.response_text` → `scp_human_reviews`                | none until reviewed                                                            | **no** until 4                                                                                                                   | no                 | no                     | never as raw text                                                             | own answer text (own row)                      | never the text                                                                    | rubric levels: author-read only                                                                   |
| 4. Human-reviewed free text                                        | `scp_human_reviews` + `scp_review_rubric_scores` → `scp_competency_evidence` | `assessment_response` / `human_review`                                         | yes: rubric mean over construct-bearing dimensions (writing-quality excluded); 0 for adjusted/overturned (no row)                | yes (upheld only)  | yes (upheld only)      | at release; a disputed review forces `follow_up` on the line                  | `human_reviewed = true` on the line            | line + brief                                                                      | `derivation_basis` (rubric levels) readable by the participant                                    |
| 5. Safety finding                                                  | `scp_competency_evidence.safety_finding/severity` (human review only)        | `human_review`                                                                 | **no** (TR7.4–7.6); caps maturity at `developing_evidence` only when a level ≥ consistent exists, which one attempt cannot reach | n/a                | n/a (cap only)         | at release: `safety_flags` (employer), `safety_concern_present` (participant) | boolean only                                   | finding + severity + behaviour                                                    | `safety_finding`/`safety_severity` on the ledger row readable by the **participant**              |
| 6. Interview addendum                                              | `scp_interview_notes` (outcome + note), `scp_employer_report_decisions`      | none — never written to the ledger                                             | no                                                                                                                               | no                 | no                     | **never in the snapshot**                                                     | never                                          | own org only, via RPC                                                             | n/a                                                                                               |

## 3. Self-report separation (locked)

Proven in TR5: observed line counts equal the observed item count per
competency (26 in total), `source_types` never names `self_report`, brief
arrays are stamped `observed` / `self_reported`, coverage counts the two
separately, `scp_attempt_maturity` recomputed over counting sources equals the
frozen `derivation_input`, and the participant sees a pattern without numbers.
The migration itself proves maturity is identical before and after adding
self-report evidence (20260830090000 §4).

### c07 / c19 status

| Item      | Format        | evidence_source_type | Keying (display order)            | In maturity | Interpretation field |
| --------- | ------------- | -------------------- | --------------------------------- | ----------- | -------------------- |
| so-rj-c07 | biq_frequency | self_report          | 0 / 2 / 3 / 2, not reverse-scored | no          | **none in schema**   |
| so-rj-c19 | biq_frequency | self_report          | 2 / 3 / 1 / 0, reverse-scored     | no          | **none in schema**   |

Both are held as **methodologically open** by Product Owner decision
(2026-09-03) and are labelled so in `vaktare-content-quality-check.ts` K10 and
`vaktare-self-report-quality-check.ts` E. The ledger records them as
`self_report` / `deterministic` and nothing else (TR5.9/5.10).

**Schema gap (PR-R1/R2):** there is no `interpretation` column — neither on
`scp_item_versions` nor on the evidence row nor in the brief — that could carry
`descriptive_only` / `methodologically_open`. The V3 contract reserves
`self_reported_patterns[].interpretation` and the manifest reserves
`classification`. PR-R0 does not add it.

## 4. Free-text boundary (locked)

| Claim                                                      | Status | Proof                                                                     |
| ---------------------------------------------------------- | ------ | ------------------------------------------------------------------------- |
| Raw free text is not automatically observed evidence       | TRUE   | TR1.3, TR3.2                                                              |
| It contributes only after a completed human rubric review  | TRUE   | TR3.3                                                                     |
| Writing quality is not a contribution input                | TRUE   | TR3.4, `assesses_writing_quality` excluded in `scp_complete_human_review` |
| Pending mandatory review prevents release                  | TRUE   | TR2.1, TR3.1                                                              |
| Adjusted/overturned review creates no numeric contribution | TRUE   | TR3.5 (levels preserved on the review, TR3.6)                             |
| Raw text never reaches a snapshot                          | TRUE   | TR10.9                                                                    |

No BLOCKER on this axis.

## 5. SCC-08 contract (locked)

The form carries exactly one observed SCC-08 item and no SCC-08 self-report
item (TR0.3). Thresholds v1 need two observations for `developing_evidence`
(TR0.6), so one attempt caps at `limited_evidence` (TR6.3). Externally:
signal `limited`, evidence_state `follow_up` on both audiences (never
`shown`, never `not_yet_shown`, never `critical`), the reason says the
assessment touched the area too little, the copy is _Begränsat underlag_ /
_Limited evidence_, and the brief carries an `explore_limited_evidence` guide
entry with an authored question in both languages (TR6.1–6.7; guard E).

Nothing about SCC-08 says weak, low, risk, fail or deficient in either
language.

## 6. Safety finding contract (locked)

Proven on identical answers (P1 cleared vs P2 one `high` finding): the
evidence row's contribution, confidence and basis are byte-identical; every
observed signal, mean and spread is identical; the frozen maturity derivation
is identical; the finding changes exactly one thing — the flagged competency's
state becomes `critical_follow_up` — and produces exactly one flag on the
employer snapshot and a boolean on the participant context (TR7.1–7.10).
Every finding in the ledger was made by an identified person; the
deterministic scorer cannot write one.

One nuance to carry into PR-R1: `scp_attempt_maturity` and
`scp_compute_maturity` cap a competency with a finding at
`developing_evidence` when it would otherwise reach `consistent`/`strong`.
On one attempt (one context) that level is unreachable, so the cap is inert
for the recruitment report; across contexts it is a _level_ cap, not a
subtraction. It must be named in the manifest's `classification_rule`.

## 7. Audience boundaries and internal derivation exposure

> **Status (PR-R2A, 2026-09-04):** closed in three deployable steps — see
> `trust-evidence-report-r2a-audience-boundary.md`. R2A-1 (`20261024090000`)
> adds the audience read contracts and removes nothing, so the pinned
> assertions below still hold after it; R2A-2 moves both consumers to the
> contracts; R2A-3 (`20261025090000`) withdraws the direct read and the
> subject's ledger policy and inverts TR10.5X/6X/10X/13X deliberately.

RLS on `scp_report_snapshots` and `scp_competency_evidence` protects
**rows**. `GRANT SELECT ON public.scp_report_snapshots TO authenticated`
covers every column (TR10.13X). The server functions select narrowly; a direct
PostgREST read does not have to.

| Exposure | Who                    | What                                                                                                                                                                                                                                                                                          | Guard today                           | Pinned                   |
| -------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ------------------------ |
| R0-X1    | participant (own row)  | `derivation_input` (maturity_level per competency)                                                                                                                                                                                                                                            | `getAcademyReport` does not select it | TR10.5X                  |
| R0-X2    | participant (own rows) | whole evidence ledger for the subject: `contribution`, `confidence`, `derivation_basis` (rubric levels, key matches), `safety_finding`, `safety_severity`, `is_safety_critical` — all with `disclosure_class = 'internal_employer'`, which the policy `scp_evidence_own_select` does not read | no client code reads the table (G4)   | TR10.6X                  |
| R0-X3    | employer (own rows)    | `derivation_input`; `brief.observed[].mean/spread`, `brief.self_reported[].mean/spread` (the type says "never rendered", and no component renders them — C3)                                                                                                                                  | none at the row                       | TR10.10X                 |
| —        | employer               | ledger, responses, reviews, rubric levels, answer key                                                                                                                                                                                                                                         | RLS: no policy                        | TR10.8 (contract)        |
| —        | participant            | reviews (`reviewer_rationale`), rubric levels, answer key, employer snapshot                                                                                                                                                                                                                  | RLS                                   | TR10.3, RA6.2 (contract) |

R0-X2 is the most significant: the participant can read, via a direct table
read, the reviewer's severity on their own answer — the very thing RA3.2/RA3.3
keep out of the participant _payload_. It is not cross-tenant, no surface
renders it, and it is the participant's own data, so it is classified **P1
for PR-R2**, not a blocker for PR-R0. Recommended shape: an audience RPC/view
per document plus revoking column-level SELECT on `derivation_input`, and
either a `disclosure_class`-aware policy on the ledger or removing the
subject's direct read in favour of the participant report.

### Snapshot field classification

**Participant snapshot** (`audience = 'participant'`)

| Field                                                                                                                    | Classification                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| payload[].competency_code / name_sv / name_en / behaviour_sv / behaviour_en                                              | SAFE FOR PARTICIPANT                                                                                                                       |
| payload[].evidence_state, observations, human_reviewed, reflection_sv/en                                                 | SAFE FOR PARTICIPANT                                                                                                                       |
| brief.modules[], brief.coverage, brief.self_reported[] (pattern, consistency, items, domain, area_code)                  | SAFE FOR PARTICIPANT                                                                                                                       |
| context (19 keys, TR11.2)                                                                                                | SAFE FOR PARTICIPANT                                                                                                                       |
| safety_flags (always `[]`)                                                                                               | SAFE FOR PARTICIPANT                                                                                                                       |
| report_version_id, released_at, threshold_version, evidence_state_version, evidence_scope_version, scoring_model_version | SAFE FOR PARTICIPANT (lineage; `scoring_model_version` is UNKNOWN / NEEDS REVIEW — the context deliberately omits it, the column does not) |
| derivation_input                                                                                                         | **INTERNAL ONLY** — exposed (R0-X1)                                                                                                        |

**Employer snapshot** (`audience = 'employer'`)

| Field                                                                                       | Classification                                                                                                                                      |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| payload[] (code, names, evidence_state, observations, source_types, behaviour, followup)    | SAFE FOR EMPLOYER                                                                                                                                   |
| brief.modules, brief.coverage, brief.pace, brief.executive_summary, brief.interview_guide[] | SAFE FOR EMPLOYER                                                                                                                                   |
| brief.observed[].signal / items / evidence_state / why / behaviour                          | SAFE FOR EMPLOYER                                                                                                                                   |
| brief.observed[].mean, spread; brief.self_reported[].mean, spread                           | **UNKNOWN / NEEDS REVIEW** — internal numbers on an audience document (R0-X3); PR-R1 moves them to the manifest, PR-R2 decides the audience payload |
| safety_flags[] (finding, severity, behaviour_version_id, observed_at)                       | SAFE FOR EMPLOYER (human finding; `behaviour_version_id` is a bare uuid the client never resolves — NEEDS REVIEW for PR-R2)                         |
| context (30 keys, TR11.1) incl. participant_ref                                             | SAFE FOR EMPLOYER                                                                                                                                   |
| derivation_input                                                                            | **INTERNAL ONLY** — exposed (R0-X3)                                                                                                                 |

## 8. Immutability contract (locked)

| Claim                                                                                                     | Status                                                                                                                                               | Proof                                                                                                                                                    |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Released snapshot immutable (UPDATE/DELETE, owner included)                                               | TRUE                                                                                                                                                 | TR8.1, TR8.2 (trigger, not policy)                                                                                                                       |
| Attempt pins assessment version, form, purpose version, scoring model, option seed, governance of the day | TRUE                                                                                                                                                 | TR8.8                                                                                                                                                    |
| Form pins item versions                                                                                   | TRUE                                                                                                                                                 | TR8.10                                                                                                                                                   |
| Report template pinned by id and named in context                                                         | TRUE                                                                                                                                                 | TR8.9, TR8.11                                                                                                                                            |
| Review state frozen at release                                                                            | PARTIAL                                                                                                                                              | counts only (`reviews_total/completed`); outcomes are not in the snapshot — the state is derivable from `scp_human_reviews` today but not frozen (PR-R1) |
| Item edited after release → snapshot unchanged                                                            | TRUE                                                                                                                                                 | TR8.4/8.5                                                                                                                                                |
| Competency mapping changed after release → snapshot unchanged                                             | TRUE by construction (JSON is self-contained); **the mapping version is not recorded**, so the snapshot cannot say which mapping produced it (PR-R1) |
| Newer template published → snapshot pinned to the old one                                                 | TRUE                                                                                                                                                 | TR8.4                                                                                                                                                    |
| Later review data / interview addendum / decision → snapshot unchanged, addendum separate and append-only | TRUE                                                                                                                                                 | TR8.4–8.7                                                                                                                                                |

Gap: nothing pins **item version ids**, **option/key version**, **rubric
version** or **competency mapping version** on the snapshot itself — they are
reachable through the attempt today and would silently drift if the bank
were re-versioned in place. That is the PR-R1 manifest's job.

## 9. Direct client read audit

| File                                                                                  | Read path                                                                                                                                                                              | Audience                                                                       | Fields available to the client                                                                                 | Risk                                                                  |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `src/lib/security-competency/academy-employer.functions.ts:1345` (`getAcademyReport`) | `from("scp_report_snapshots").select("id, attempt_id, subject_id, audience, released_at, payload, brief, safety_flags, context, scp_report_versions(limitations_sv, limitations_en)")` | participant **and** employer (same function, `audience` argument; RLS decides) | everything selected; `brief.observed[].mean/spread` reach the employer client; `derivation_input` not selected | R0-X3 (mean/spread); the function is the natural seam for a PR-R2 RPC |
| `src/lib/interview-intelligence/context.functions.ts:336`                             | `from("scp_report_snapshots").select("released_at, brief").eq("audience","employer")`                                                                                                  | employer (interview prep)                                                      | `brief` in full, then narrowed in code to area/signal/behaviour + guide follow-ups                             | low; still carries mean/spread into the server process                |
| `src/lib/security-competency/academy-delivery.functions.ts:198`                       | `from("scp_attempts")`                                                                                                                                                                 | participant (own delivery)                                                     | attempt columns                                                                                                | out of scope (not a report read) — pinned by G5                       |
| any route / component                                                                 | none read `scp_competency_evidence`, `scp_human_reviews`, `scp_review_rubric_scores`, `scp_report_versions` directly                                                                   | —                                                                              | —                                                                                                              | G4                                                                    |

Snapshot payloads reach two routes:
`_authenticated.employer.$employerSlug.assessments.results.$attemptId.tsx`
(employer; runs rds-v1 over `brief` + `safetyFlags.length`) and
`_authenticated.academy.report.$attemptId.tsx` (participant). Neither renders
`mean`/`spread`, a percentage, or a radar (guard C).

The unguarded surface is the **PostgREST table endpoint itself**: a signed-in
participant or employer with the publishable key can `select=*` on
`scp_report_snapshots` (and the participant on `scp_competency_evidence`) and
receive the columns above. PR-R2 scope.

## 10. Reproducibility gap table (PR-R1 input)

| Provenance element                  | Status today               | Where / why                                                                                                                                                                                  |
| ----------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| calculated_at                       | PARTIALLY FROZEN           | `released_at` / `context.scored_at`; no separate calculation timestamp; `scp_attempt_maturity(..., now())` is evaluated at release and the instant is not stored                             |
| calculation_schema_version          | NOT FROZEN                 | no such field; the closest is the tuple (des-v2, attempt-v1, ras-v1, rab-v1, v1, det-v1) spread over columns and context                                                                     |
| scoring model version               | CURRENTLY FROZEN           | `scp_attempts.scoring_model_version` → snapshot + evidence rows (`det-v1`)                                                                                                                   |
| signal model version                | CURRENTLY FROZEN           | `brief.signal_version = 'ras-v1'`, `context.signal_version` (employer)                                                                                                                       |
| threshold version                   | CURRENTLY FROZEN           | `threshold_version = 'v1'` column + `derivation_input[].threshold_version`; the threshold **values** are not frozen (a re-seeded `scp_maturity_thresholds` row would change a recomputation) |
| rubric version                      | NOT FROZEN on the snapshot | `derivation_basis.rubric_version_id` on the evidence row only                                                                                                                                |
| competency mapping version          | NOT FROZEN                 | `scp_behaviour_competency_map` has no version; the snapshot names competency codes only                                                                                                      |
| report template version             | CURRENTLY FROZEN           | `report_version_id` + `context.report_key/report_version`                                                                                                                                    |
| TRUST question version              | NOT FROZEN                 | `scp_interview_guide_prompts` rows have `content_status` but no version; the snapshot copies the text, not the row id                                                                        |
| included evidence rows              | NOT FROZEN                 | `_observed_scope` is a temp table at release; no ids are stored                                                                                                                              |
| excluded evidence rows + reason     | NOT FROZEN                 | self-report / training / superseded / disputed rows are excluded by join, never listed                                                                                                       |
| per-item contribution               | NOT FROZEN on the snapshot | on the ledger row; not in `derivation_input` (TR11.3)                                                                                                                                        |
| per-item confidence                 | NOT FROZEN on the snapshot | same                                                                                                                                                                                         |
| observed/self-report classification | PARTIALLY FROZEN           | per area (`evidence_type`), not per item; the registry flag could change                                                                                                                     |
| denominator / weighted sum / spread | PARTIALLY FROZEN           | `mean` and `spread` per area in the employer brief (audience document, wrong place); `items` count; no denominator, no weighted sum                                                          |
| canonical hash                      | NOT FROZEN                 | `source_snapshot_hash` exists on the evidence row and is always NULL; nothing hashes the snapshot                                                                                            |

## 11. PR-R1 input — private immutable computation manifest

Create `scp_report_computation_manifests` (one row per snapshot, both
audiences pointing at the same manifest or one per audience — decision for
PR-R1), written inside `scp_release_attempt_report` in the same transaction,
immutable by trigger, RLS with **no** participant or employer policy,
`REVOKE ALL FROM anon, authenticated` (server/reviewer/internal paths only).
Fields: see the ADR. Additionally:

1. record `calculated_at` as the single `now()` used for every maturity call;
2. snapshot the threshold **rows** used (not only `'v1'`);
3. record evidence ids included and excluded with a reason enum;
4. record item_version_id, option/key version (today: the item version id), rubric_version_id and a mapping version (introduce `scp_behaviour_competency_map.version` or hash the map);
5. record `trust_question_version` by copying the guide-prompt row ids;
6. compute `canonical_sha256` over a canonical JSON of the manifest and store it on the manifest; store `manifest_id` + hash on the snapshot row (a new nullable column is an EXPAND-only change);
7. move `mean`/`spread` out of `brief.observed[]`/`brief.self_reported[]` into the manifest **only in PR-R2**, since removing them changes report output and the fixture `released-candidate-brief.ts`;
8. add the `interpretation` label (`descriptive_only` / `methodologically_open`) for self-report facets, starting with c07/c19, on the item version and copied into the manifest classification.

## 12. PR-R2 input — safe participant/employer read paths

1. `scp_participant_report(attempt_id)` and `scp_employer_report(attempt_id)` SECURITY DEFINER RPCs (or `security_invoker` views) returning exactly the audience document: payload, brief (employer brief without mean/spread), context, safety_flags, released_at, template limitations. Authorise on the existing policies' predicates.
2. `getAcademyReport` and the interview bridge switch to them; guard G1 then pins zero direct reads.
3. `REVOKE SELECT (derivation_input) ON public.scp_report_snapshots FROM authenticated` — closes R0-X1/R0-X3 at the column.
4. `scp_evidence_own_select`: either drop the subject's direct read (the participant report is the audience document) or filter on `disclosure_class` and strip `contribution`, `confidence`, `derivation_basis`, `safety_finding`, `safety_severity` behind a view — closes R0-X2.
5. `safety_flags[].behaviour_version_id`: resolve to a competency/behaviour label server-side or drop the id.
6. Extend `scp_report_audience_test.sql` RA6 to assert `select=*` shape per audience over the new RPCs, and flip TR10.5X / 10.6X / 10.10X / 10.13X to their closed form.
7. Anon TRUNCATE on `scp_employer_report_decisions` and `scp_interview_notes` (hosted default-privilege issue, already known) — include in the same hardening pass.

## 13. Existing guards this builds on (not duplicated)

`scp_report_audience_test.sql` (RA1–RA10), `scp_recruitment_brief_test.sql`
(RB0–RB7), `scp_employer_reviewer_test.sql`, `employer_vaktare_journey_test.sql`
(VJ), `scp_language_contract_test.sql`, `scp_option_order_integrity_test.sql`;
`recruitment-decision-support-check.ts`, `review-contribution-guard-check.ts`,
`interview-context-bridge-check.ts`, `vaktare-self-report-quality-check.ts`
(E: c07/c19), `vaktare-content-quality-check.ts` (C4/C5: SCC-08 cap, K10/K14),
`security-competency-separation-check.ts`, `sql-security-guard-check.ts`;
apply-time proofs inside 20260830090000, 20260830093000 §7, 20260831093000,
20261022090000 and 20261023090000.

New in PR-R0: `supabase/tests/scp_trust_evidence_report_r0_test.sql` (101
assertions, registered in `scripts/db-test.sh` before the rollback block) and
`scripts/trust-evidence-report-check.ts` (`bun run trust-evidence-report:check`,
in CI), plus `scripts/fixtures/trust-evidence-report-v3-contract.ts` and
`docs/architecture/adr-trust-evidence-report-provenance-contract.md`.
