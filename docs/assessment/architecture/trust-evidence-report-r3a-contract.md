# TRUST Evidence Report — PR-R3A: the Report V3 data contract

*Från evidens till en bättre intervju.*

PR-R3A (migration `20261029090000`) adds two routines and no UI:

- `scp_report_next_step(safety_findings_present, observed_items, areas_sufficient, areas_limited)`
  — the ONE rds-v1 process-step rule, IMMUTABLE, internal. The TypeScript
  rds-v1 layer is proven identical to it over the full state matrix in CI.
- `scp_employer_report_v3(attempt_id)` — the employer's Report V3 document as
  one jsonb: a **frozen report** (a shared audience-neutral **core** and the
  **employer projection**) beside two live overlays, the **template overlay**
  (the pinned template's limitation lines) and the **addenda overlay**.

It is the smallest safe projection the approved Report V3 UI (PR-R3B) needs.
No scoring, release, template, policy or grant on an existing object changes.

## 1. The semantic model

Three dimensions, kept apart everywhere (JSON, SQL, TypeScript, copy, tests):

| dimension | says | values | lives on |
|---|---|---|---|
| `observed_pattern` | what the observed responses look like | clearly_consistent · consistent · mixed · developing · not_established | core competency line |
| `evidence_sufficiency` | how much observed evidence exists | sufficient · limited · none | core competency line |
| `follow_up_priority` | what the recruiter should do | first · next · if_time_allows · none | employer area line |

The two axes are independent: a visible pattern may coexist with limited
evidence, and limited evidence keeps that pattern from becoming a stable
conclusion or entering clearest support. From the frozen ras-v1 signal:
strong → clearly_consistent, consistent → consistent, mixed → mixed,
developing → developing; the frozen `limited` signal (the rule's own word
for a basis it computed no pattern on) and no evidence both map to
`not_established`; sufficiency follows the observed count exactly: 0 →
none, 1–2 → limited, ≥ 3 → sufficient. Nothing invents a stronger pattern
than the evidence supports.

**`sufficient` means** shadow-pilot evidence coverage under the current
governed rule (ras-v1: at least three counted observed tasks) and nothing
more: not psychometric validation, not demonstrated competence, not evidence
about future performance, not a stable trait. The document states this in
`core.definitions.evidence_sufficiency`, in both languages, as a denial.

`evidence_state` (ADR Decision 2's closed set, with `observed_follow_up` for
`developing`) is kept as a composite presentation field **derived** from the
dimensions and the review state; it never replaces them.

**SCC-08** on one observed item is exactly:
`{ observed_pattern: not_established, evidence_sufficiency: limited,
observed_item_count: 1, methodological_flags: [single_item, …],
follow_up_priority: next }` with the card limitation *Det finns ett
observerat svar, men underlaget räcker inte för att fastställa ett stabilt
svarsmönster. Följ upp området i intervju.* / *There is one observed answer,
but the evidence is not enough to establish a stable response pattern.
Follow up the area in interview.* Suite V3 pins it; V3.4 states the
invariant over every competency of every document: sufficiency follows the
count and only the count; no competency without sufficient evidence reads
as a consistent state; no pattern is stated on no evidence.

## 2. The document

```
{ schema_version: "trust-evidence-report/v3", report_id,
  frozen_report: {
    core:     { core_version, assessment, timestamps, competencies[],
                self_reported_patterns[], coverage, human_review,
                definitions, limitations, provenance },
    employer: { context, primary_next_step, overview, safety_followup,
                areas[], trust_followups[], trust_plan } },
  template_overlay: { as_of, source, report_template, limitations },
  addenda_overlay:  { as_of, source, items[] } }
```

`frozen_report` is immutable: every value in it is the release's, and
`report_id` and `provenance` describe all of it without exception. Only the
two overlays may move after release, and each carries its own `as_of` and
`source`.

The typed contract is `scripts/fixtures/trust-evidence-report-v3-contract.ts`.
Guard H14 holds the migration to every key it names; guard H15 holds the
**employer path allowlist** (every object-key path at any depth, array
elements as `*`) to the one the database suite enforces (V8.1); guard H17 and
suite V8.1b hold every protected field to its exact approved path; guard H16
and suite V13 hold the core to the participant boundary, path-aware.

### 2.1 The shared frozen core (`trust-evidence-core/v1`)

Audience-neutral by construction: competency identity, `observed_pattern`,
`evidence_sufficiency`, the derived `evidence_state`, counts, source types,
the mandatory-review state (`not_required | pending | completed`),
methodological flags, the frozen why-line, the one card limitation,
`evidence_basis` counts (scenario, free text, self-description), behaviour,
the self-report domain keys; `self_reported_patterns` as its own evidence
type; `coverage` (report-level counts, sufficiency counts, the frozen
composition, modules); `human_review` (counts, `completed`, and a `meaning`
that is a denial); `definitions`; `limitations` (standing statement and the
closed code set); `provenance`. It names no safety finding, flag or
safety-critical review detail, no process step, priority or interview
material, no addendum or author, no organisation, attempt, subject or
participant reference, no answer key, rationale or scoring input (suite
V13.1, guard H16, both path-aware). A participant projection may later be
built on it as an explicit, path-aware, allowlisted projection; the full
core is never returned automatically. `coverage_status` is INTERNAL ONLY
(Product Owner decision) and has no path in the document.

### 2.2 The employer projection

`context` (attempt, pseudonymous subject, participant reference, person
context, organisation, purpose, the standing limitation),
`primary_next_step` (the rds-v1 rule over the document's own aggregates,
with `rule_version` and a handoff naming the attempt and at most three focus
areas), `overview`, `safety_followup` (only ever from the frozen human
findings; carries the safety-critical answer counts), `areas` (priority,
`safety_critical_follow_up`, `clearest_support_eligible`, `verify_reasons`,
the competency's safety-critical counts, the authored prompt, the guide
codes, traceability), `trust_followups` (the frozen guide verbatim),
`trust_plan` (at most three areas, at most five authored questions,
T-R-U-S-T with the five-step structure, never called STAR). Every safety
finding, flag and safety-review count lives here and nowhere else.

### 2.3 The thirty-second overview, from the separated dimensions

- **clearest_support**: `observed_pattern ∈ {clearly_consistent, consistent}`
  AND `evidence_sufficiency = sufficient` AND no verify reason (no safety
  finding, no pending review, no human review that changed a reading). A
  consistent pattern on limited evidence can never appear here (V7.6).
- **limited_evidence**: `evidence_sufficiency ∈ {limited, none}`, whatever
  pattern is visible.
- **verify_in_interview**: every area with a governed `verify_reason`
  (`safety_finding`, `developing_pattern`, `mixed_pattern`,
  `limited_evidence`, `pending_review`, `human_review_adjusted`). It may
  overlap limited_evidence; it never overlaps clearest_support.

### 2.4 The two live overlays

**template_overlay** — the limitation lines of the report template the
release pinned, read through the R2A audience contract (`source:
scp_report_versions`, with the template key and version). They follow a live
row, so they cannot be inside `frozen_report`; freezing the text itself
would mean writing it at release, which is a release-function change outside
PR-R3A. A later template edit reaches only this overlay (V11.4).

**addenda_overlay** — `scp_interview_notes` projected: status
(`supported_in_interview | not_supported_in_interview |
additional_context`), note, `recorded_at`, `author_display_name`, with its
own `as_of`. Adding an addendum changes only this overlay and its `as_of`;
`frozen_report`, `report_id` and provenance are byte-identical (V9.3).

**Product Owner disclosure decision:** `author_display_name` = KEEP, in the
employer addenda overlay only (minimal attribution for interview notes; from
`profiles.display_name`, or *Kollega*). Never an author UUID, e-mail,
membership id or authentication identity; never in the shared core, a
participant projection or the report's identity/provenance. Treated as
personal data and kept minimal (suite V9.2b, guard H17).

## 3. Version lock

Every **conclusion** comes from the frozen employer snapshot as
`scp_employer_report` returns it. Every **structural fact** the snapshot does
not carry comes from the PR-R1 computation manifest the snapshot is linked
to — the frozen, hashed record of the release — as counts and version
identities only: the composition of what the person answered per
competency (item formats, self-descriptions, safety-critical items), which
free-text and safety-critical answers a person read, the per-competency
context count, the competency version, the rubric editions. No option key,
score, contribution, rubric level, finding or rationale is read; nothing of
the body is projected; the manifest stays private (no grant moves).

No read resolves "latest" or "currently active":

| need | source | why stable |
|---|---|---|
| competency name/version | frozen line; else the version published at the release instant; version from the manifest | a later publication has a later `published_at` |
| rubric editions | manifest ids → `scp_rubric_versions.version_number` | retirement changes neither |
| composition, answers, review states | manifest | frozen and hashed at release |
| context count per competency | manifest `areas[].context_count` | frozen; the report-level count is separate |
| prompts, guide, why-lines, behaviours | frozen brief/payload | frozen |
| template limitation lines | the R2A audience contract's live template row | in `template_overlay`, outside `frozen_report` (V11.4) |

A report released before PR-R1 has no manifest: every such fact is an
explicit `null`, `provenance.evidence_basis_available = false`,
`computation_chain = legacy`; its competencies are the frozen lines. Nothing
is fabricated (V10.4/V10.5).

Suite V11 (TEST A) edits the template limitation text, publishes a newer
version of all eight competencies, retires the rubric editions used,
reorders the catalogue and edits the authored prompts and guide questions,
then proves the ENTIRE `frozen_report` byte-identical with `report_id` and
provenance unchanged; the template edit reaches only `template_overlay`.

## 4. The one rds-v1 rule

`scp_report_next_step` states rds-v1 once: a human safety finding →
`request_clarification`; no observed evidence → `gather_more_evidence`;
no sufficient area, or more limited than sufficient areas →
`additional_assessment`; else `structured_interview`, with the reason codes
`safety_follow_up | no_observed_evidence | thin_coverage |
ready_for_interview`. `scripts/trust-next-step-parity-check.ts` walks the
complete aggregate-input matrix for rds-v1 — every combination of the
aggregates the rule consumes (finding × sufficient areas × limited areas ×
evidence-free areas × item-count boundaries), with review status, disputed
state and priority walked beside them and proven inert; 2,304 points, not
the complete semantic state space of a report — through the TypeScript
`recommendNextStep` and emits the SQL assertions `db-test.sh` executes
against the database rule. The projection's `primary_next_step` is proven to
equal the rule over the document's own aggregates (V7.4).

## 5. Employer field allowlist decisions

| field | decision | reason |
|---|---|---|
| `reviews_disputed`, `completed_disputed`, `disputed_readings`, review `outcome` | INTERNAL ONLY | reviewer workflow state; the governed effect is carried as `verify_reasons: human_review_adjusted` and the frozen conclusions |
| `review_status` (`not_required · pending · completed`) | KEEP | the mandatory-review state that "Mänskligt granskat" rests on |
| `rubric_versions` (edition numbers) | KEEP | the PO header names the rubric version; numbers only, never ids |
| `human_review` counts (`reviews_total`, `reviews_completed`, `free_text`, `safety_critical`, `completed`, `required`) | KEEP | what "Mänskligt granskat" means, in counts |
| `evidence_basis` per competency (scenario, free-text, self-description counts) | KEEP | what the card's evidence is built on; no review workflow, no safety |
| `safety_critical` counts (per competency, per report) | KEEP, employer projection only | safety is never in the shared core |
| `coverage_status` | INTERNAL ONLY | one employer-facing sufficiency concept: `evidence_sufficiency` |
| addendum author `user_id`, `email`, membership id, auth identity | REMOVE | `author_display_name` only, employer addenda overlay only |
| `released_by_role`, manifest id/hash, `planned_item_count`, `response_pattern`, `safety_findings_present`, `template_limitations` | REMOVE | private, a blurred dimension, or relocated |

## 6. "Mänskligt granskat"

`human_review.completed` is true exactly when the mandatory reviews for
release are all completed; `human_review.meaning` states, in both languages,
that this does not mean approved, validated, right for the role, or endorsed.
Suite V12.1 asserts the document contains no such wording outside its own
denials; guard H16b asserts the meaning is a denial. `sufficient` is defined
the same way (V13.2, guard H16c).

## 7. Not exposed, security, compatibility

No derivation_input, mean, spread, contribution, option key, score value,
rubric level, reviewer rationale, reviewer outcome, behaviour id, manifest
body, manifest id, hash, author user id, author e-mail, total, ranking or
verdict (V8.1–V8.4, apply-time proof 3.3, guard H14e). Participant, other
organisation and stranger get NULL; anon is refused; the rule is internal;
the snapshot table and the manifest stay closed; both audience contracts and
the release function are untouched (V8.5–V8.9). Historical readability, the
R1 link, the R2A contracts and the Interview Intelligence handoff (through
the application page, as today) are preserved.

## 8. Rollback and replay

The rollback drops the two routines. In `db-test.sh` the suite (80
assertions, floor 75, nineteen mandatory labels) runs before the R1
rollback; the V3 rollback runs before R1's, R3A is proven to refuse without
R1, and both are re-applied after R1. The destructive platform rollback
drops both routines before the R1 unwind.

## 9. Left for later

- PR-R3B: the UI, print/PDF, dictionary copy for the closed sets.
- A participant projection on the shared core (not built).
- `methodologically_open` per self-report domain (no column; every pattern
  is `descriptive_only`).
- A durable attempt → interview-case link and a `source` column on
  `scp_interview_notes` (today the overlay's source is the constant
  `interview_note`).
- The `pace` block of the employer brief is not carried: not in the approved
  information architecture.
