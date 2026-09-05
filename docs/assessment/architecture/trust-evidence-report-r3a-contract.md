# TRUST Evidence Report — PR-R3A: the Report V3 data contract

*Från evidens till en bättre intervju.*

PR-R3A (migration `20261028090000`) adds two routines and no UI:

- `scp_report_next_step(safety_findings_present, observed_items, areas_sufficient, areas_limited)`
  — the ONE rds-v1 process-step rule, IMMUTABLE, internal. The TypeScript
  rds-v1 layer is proven identical to it over the full state matrix in CI.
- `scp_employer_report_v3(attempt_id)` — the employer's Report V3 document as
  one jsonb: a **frozen report** (a shared audience-neutral **core** and the
  **employer projection**) beside a live **addenda overlay**.

It is the smallest safe projection the approved Report V3 UI (PR-R3B) needs.
No scoring, release, template, policy or grant on an existing object changes.

## 1. The semantic model

Three dimensions, kept apart everywhere (JSON, SQL, TypeScript, copy, tests):

| dimension | says | values | lives on |
|---|---|---|---|
| `observed_pattern` | what the observed responses look like | clearly_consistent · consistent · mixed · developing · not_established | core competency line |
| `evidence_sufficiency` | how much observed evidence exists | sufficient · limited · none | core competency line |
| `follow_up_priority` | what the recruiter should do | first · next · if_time_allows · none | employer area line |

From the frozen ras-v1 signal: strong → clearly_consistent, consistent →
consistent, mixed → mixed, developing → developing. `limited` (the governed
rule computes no pattern under three tasks) and no evidence both map to
`not_established`; sufficiency follows the observed count exactly: 0 →
none, 1–2 → limited, ≥ 3 → sufficient. Nothing invents a stronger pattern
than the evidence supports.

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
Follow up the area in interview.* Suite V3 pins it; V3.4 states the rule
over every competency of every document.

## 2. The document

```
{ schema_version: "trust-evidence-report/v3", report_id,
  frozen_report: {
    core:     { core_version, assessment, timestamps, competencies[],
                self_reported_patterns[], coverage, human_review,
                limitations, provenance },
    employer: { context, primary_next_step, overview, safety_followup,
                areas[], trust_followups[], trust_plan } },
  addenda_overlay: { as_of, source, items[] } }
```

The typed contract is `scripts/fixtures/trust-evidence-report-v3-contract.ts`.
Guard H14 holds the migration to every key it names; guard H15 holds the
**employer field allowlist** (every key at any depth) to the one the database
suite enforces (V8.1); guard H16 holds the core to the participant boundary.

### 2.1 The shared frozen core (`trust-evidence-core/v1`)

Audience-neutral by construction: competency identity, `observed_pattern`,
`evidence_sufficiency`, the derived `evidence_state`, counts, source types,
coverage status, the mandatory-review state (`not_required | pending |
completed`), methodological flags, the frozen why-line, the one card
limitation, `evidence_basis` counts, behaviour, the self-report domain keys;
`self_reported_patterns` as its own evidence type; `coverage` (report-level
counts, sufficiency counts, the frozen composition, modules); `human_review`
(counts, `completed`, and a `meaning` that is a denial); `limitations`
(standing statement and the closed code set); `provenance`. It names no
process step, priority, safety detail, interview material, addendum,
author, organisation, attempt or subject (suite V13, guard H16). A
participant projection may later be built on it; it is not built here.

### 2.2 The employer projection

`context` (attempt, pseudonymous subject, participant reference,
organisation, the standing limitation, the audience contract's template
lines), `primary_next_step` (the rds-v1 rule over the document's own
aggregates, with `rule_version` and a handoff naming the attempt and at
most three focus areas), `overview`, `safety_followup` (only ever from the
frozen human findings), `areas` (priority, `safety_critical_follow_up`,
`clearest_support_eligible`, `verify_reasons`, the authored prompt, the
guide codes, traceability), `trust_followups` (the frozen guide verbatim),
`trust_plan` (at most three areas, at most five authored questions,
T-R-U-S-T with the five-step structure, never called STAR).

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

### 2.4 The live addenda overlay

`scp_interview_notes` projected: status (`supported_in_interview |
not_supported_in_interview | additional_context`), note, `recorded_at`,
`author_display_name` (from `profiles`, or *Kollega*), with its own `as_of`.
Adding an addendum changes nothing in `frozen_report`, `report_id` or
provenance — the suite proves it byte for byte (V9.3).

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
| template limitation lines | the R2A audience contract's live template row | carried outside the frozen core and stated as such (V11.4) |

A report released before PR-R1 has no manifest: every such fact is an
explicit `null`, `provenance.evidence_basis_available = false`,
`computation_chain = legacy`; its competencies are the frozen lines. Nothing
is fabricated (V10.4/V10.5).

Suite V11 publishes a newer version of all eight competencies, retires the
rubric editions used, reorders the catalogue, edits the authored prompts and
guide questions, and proves the frozen core and the employer projection
byte-identical (outside the template lines, which are the audience
contract's).

## 4. The one rds-v1 rule

`scp_report_next_step` states rds-v1 once: a human safety finding →
`request_clarification`; no observed evidence → `gather_more_evidence`;
no sufficient area, or more limited than sufficient areas →
`additional_assessment`; else `structured_interview`, with the reason codes
`safety_follow_up | no_observed_evidence | thin_coverage |
ready_for_interview`. `scripts/trust-next-step-parity-check.ts` walks the
full matrix (finding × sufficient areas × limited areas × evidence-free
areas × review status × disputed state × priority × item-count boundaries;
2,304 points) through the TypeScript `recommendNextStep` and emits the SQL
assertions `db-test.sh` executes against the database rule. Review status,
disputed state and priority are walked and proven inert. The projection's
`primary_next_step` is proven to equal the rule over the document's own
aggregates (V7.4).

## 5. Employer field allowlist decisions

| field | decision | reason |
|---|---|---|
| `reviews_disputed`, `completed_disputed`, `disputed_readings`, review `outcome` | INTERNAL ONLY | reviewer workflow state; the governed effect is carried as `verify_reasons: human_review_adjusted` and the frozen conclusions |
| `review_status` (`not_required · pending · completed`) | KEEP | the mandatory-review state that "Mänskligt granskat" rests on |
| `rubric_versions` (edition numbers) | KEEP | the PO header names the rubric version; numbers only, never ids |
| `human_review` counts (`reviews_total`, `reviews_completed`, `free_text`, `safety_critical`, `completed`, `required`) | KEEP | what "Mänskligt granskat" means, in counts |
| `evidence_basis` per competency (items and reviewed counts) | KEEP | what the card's evidence is built on; no `reviews_completed`/`reviews_disputed` |
| addendum author `user_id`, `email` | REMOVE | `author_display_name` only |
| `released_by_role`, manifest id/hash, `planned_item_count`, `response_pattern` | REMOVE | private, or a blurred dimension |

## 6. "Mänskligt granskat"

`human_review.completed` is true exactly when the mandatory reviews for
release are all completed; `human_review.meaning` states, in both languages,
that this does not mean approved, validated, right for the role, or endorsed.
Suite V12.1 asserts the document contains no such wording outside its own
denials; guard H16b asserts the meaning is a denial.

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

The rollback drops the two routines. In `db-test.sh` the suite (77
assertions, floor 65, fourteen mandatory labels) runs before the R1
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
