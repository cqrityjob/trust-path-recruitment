# TRUST Evidence Report — PR-R3A: the Report V3 data contract

*Från evidens till en bättre intervju.*

PR-R3A adds one server-side read contract, `scp_employer_report_v3(attempt_id)`
(migration `20261028090000`), returning the employer's Report V3 document as a
single jsonb. It is the smallest safe projection the approved Report V3 UI
(PR-R3B) needs. No UI, no application code and no scoring, release, template,
policy or grant on an existing object changes in this PR.

## 1. What it is, in one sentence

A rearranged reading of the frozen employer document — read through
`scp_employer_report`, the only audience path a client has had to a snapshot
since PR-R2A — laid out the way the approved information architecture reads
it, with the form's composition and the review states added as structural
facts and the interview notes composed beside it.

## 2. Reuse, not a second engine

| Existing thing | How V3 uses it |
|---|---|
| `scp_employer_report(uuid)` (R2A audience contract) | The V3 function calls it first. Zero rows there (not released, wrong organisation, not a member) is `NULL` here. Every conclusion — signal, why-line, behaviour, self-report pattern, guide entry, safety finding, coverage count, version — is taken from that document and never recomputed. |
| `scp_report_snapshot_readable` | Inherited through the call above; the V3 function evaluates no audience rule of its own. |
| rds-v1 (`decision-support.ts`) | Its next-step rule is stated once more, server side, verbatim: human finding → `request_clarification`; no observed evidence → `gather_more_evidence`; more limited than usable areas → `additional_assessment`; else `structured_interview`. The four steps are the same closed set (guard B4 / H14g). |
| Frozen `interview_guide` | Becomes `trust_followups` verbatim, and the TRUST Interview Plan is selected from it deterministically (first three distinct areas in the guide's own order; the first two carry their authored follow-up: 2 + 2 + 1 = 5 questions at most). |
| `scp_interview_notes` (append-only, 20260830093000) | Becomes `interview_addenda`: `evidence_confirmed → supported_in_interview`, `evidence_not_confirmed → not_supported_in_interview`, `additional_context` unchanged, with note, timestamp and author. The released report is never rewritten. |
| PR-R1 manifest link | Read as one boolean: `provenance_summary.computation_chain = verified \| legacy`. No manifest id, no hash, no body. The migration never names the manifest table (guard H11). |

The apply-time proof and guard H14d refuse the function if it ever names a
signal, maturity, state or self-report routine, the evidence ledger, the
rubric levels, the option table or the snapshot's payload / brief /
derivation_input / hash columns directly.

## 3. Frozen versus structural

Every **conclusion** comes from the frozen snapshot. Three **structural
facts** are read from immutable rows because the snapshot does not carry
them and the layout needs them:

- the composition of the form the attempt was assigned
  (`scp_form_items × scp_item_versions`: how many scenario, free-text and
  self-description items each competency has, and which are safety-critical);
- which of those the person answered (`scp_candidate_responses`, counted
  only: no option id, no text);
- the state of the human reviews (`scp_human_reviews`: status and outcome
  counts; never rationale, never a rubric level, never a finding beyond what
  the snapshot froze).

A completed review is immutable and a report is released only after every
review is closed, so these counts cannot drift under a released report. The
suite proves it (V9.3: after two interview notes, every other line of the
document is byte-identical).

## 4. The document

Top level: `schema_version` (`trust-evidence-report/v3`), `report_id`,
`attempt_id`, `subject_id`, `released_at`, `audience`, `context`,
`primary_next_step`, `overview`, `safety_followup`, `coverage`, `areas`,
`self_reported_patterns`, `trust_followups`, `trust_plan`, `limitations`,
`human_review`, `provenance_summary`, `interview_addenda`. The typed shape is
`scripts/fixtures/trust-evidence-report-v3-contract.ts`; guard H14b/H14c hold
the migration to every key it names.

**Areas** — one per competency of the form (eight on Väktare v1), in the
catalogue's order. Every number is a count. `response_pattern` is the card
label from the frozen ras-v1 signal:

| signal | `response_pattern` | `evidence_state` | sv label |
|---|---|---|---|
| strong | `clearly_consistent` | `observed_consistent` | Tydligt sammanhållet svarsmönster |
| consistent | `consistent` | `observed_consistent` | Sammanhållet svarsmönster |
| mixed | `mixed` | `observed_mixed` | Blandat svarsmönster |
| developing | `follow_up` | `observed_follow_up` | Behöver följas upp |
| limited | `limited` | `observed_limited` | Begränsat underlag |
| (none) | `none` | `self_reported_only` / `not_covered` | Inget observerat underlag |

`observed_follow_up` is an amendment to ADR Decision 2, which had no value
for the `developing` signal; it reads as "a person should ask", never as a
level. A pending review gives `human_review_pending`; a disputed review gives
`review_status = completed_disputed` with the state unchanged. The
`critical_follow_up` state of the frozen document becomes
`safety_critical_follow_up = true` and `follow_up_priority = first`, and the
area is named in `safety_followup.areas_flagged_for_follow_up`.

`coverage_status`, `methodological_flags` (`single_item`, `single_context`,
`self_report_not_observed`, `unvalidated_content`, `closed_test`), the one
`limitation` a card states, `evidence_basis` (item and review counts per
channel), `behaviour`, the authored `interview_prompt`, the
`trust_followup_codes` the guide selected, and `traceability.available`.

**SCC-08.** One observed item, no self-report item. It reads `limited` /
`observed_limited` / `coverage_status = limited`, flagged `single_item`, with
the limitation "Endast en uppgift … följ upp i intervju", an
`explore_limited_evidence` follow-up and an interview priority. The suite's
regression rule V3.4 is stated over every area of every document: fewer than
three observed items can never read as a confident pattern, a full coverage
or a consistent state.

**Self-report** stays in `self_reported_patterns` (domain, competency,
pattern, consistency, count, `interpretation`, why-line). A card names only
`self_description_domain_keys`; no area ever lists `self_report` as a source.
`interpretation` is `descriptive_only` for every domain: the schema still has
no per-domain column for `methodologically_open`, so c07 / c19 remain a
content decision (gap recorded in R0 §3, unchanged).

**Free text** is its own channel: `evidence_basis.free_text_*` on the card,
`human_reviewed_free_text` among the sources only when a person read the
text and let it stand, and `human_review.free_text` at document level. An
overturned reading is `completed_disputed` and adds no source.

**Coverage** carries the frozen counts and the truthful composition of the
form: on Väktare v1, 22 scenario answers, 24 self-descriptions, 4 free-text
answers read by a person, 3 safety-critical answers checked — read from the
rows, never hard-coded.

**Safety.** `safety_followup` exists only from the frozen `safety_flags`,
which the release function writes from reviewer findings alone (no
deterministic path sets a finding; a cleared item is `no_concern` and never
a flag). Findings are `{finding, severity, observed_at}`; nothing is inferred
from a signal, a count or a self-description. With and without a finding,
every card reads the same apart from the follow-up marks (V5.8).

**Limitations**: the closed code set (`one_assessment_occasion`,
`single_evidence_context`, `self_report_not_observed`,
`unvalidated_content`, `closed_test_pilot`, `no_norm_group`,
`no_predictive_claim`) stated in both languages without the words the
vocabulary guards forbid, the template's own limitation lines beside them,
and the standing statement: *Detta visar hur kandidaten svarade i just dessa
uppgifter. Det fastställer inte lämplighet eller framtida arbetsprestation.
Beslutet är arbetsgivarens.*

**Provenance summary**: every version the snapshot froze, the template key
and version, the rubric editions bound to the form's free-text items, the
release instant (which is the calculation instant since PR-R1), and
`computation_chain`. Nothing private.

## 5. Not exposed

`derivation_input`, mean, spread, contribution, confidence, option keys,
score values, rubric levels, reviewer rationale, `behaviour_version_id`, the
manifest body, the manifest id, the hash, the reviewer's identity, the
released-by role, any total, ranking or verdict. Suite V8.1 scans the whole
document for each; V8.2 scans it for every forbidden claim in both languages
outside the template's own denial lines; the apply-time proof scans the
function for the 14-word list every report routine is held to, plus the V3
keys and the Swedish claims.

## 6. Audience safety

The participant, a second organisation and an unrelated account receive
`NULL`; anon cannot execute the function. The snapshot table stays closed,
`scp_participant_report` and `scp_employer_report` are untouched (the R2A
proofs still hold), and Report V3 is employer-only: nothing about a
participant document changes in this PR.

## 7. Historical compatibility

Two shapes production holds are walked by the suite: a snapshot whose
template row is missing (the sixteen orphans) renders fully with empty
template lines; a snapshot released before PR-R1 renders fully with
`computation_chain = legacy` and no traceability offered, and nothing else
in the document differs.

## 8. Rollback and replay

The rollback drops the one function. It runs in `db-test.sh` before the R1
rollback (V3 stands on the manifest link), the migration is proven to refuse
while R1 is absent (`SCP_R3A_PRECONDITION`), and it is re-applied after R1
is back. The suite (`scp_trust_evidence_report_r3a_contract_test.sql`, 67
assertions, floor 60, six mandatory labels) runs before the destructive
rollback block.

## 9. Left for PR-R3B and later

- The UI: labels for the closed sets above live in the dictionary, not here.
- The `Starta strukturerad intervju` handoff: `primary_next_step.interview_handoff`
  carries the attempt and the focus areas; the route still goes through the
  application page, which is where Interview Intelligence starts a case
  today. A durable `attempt → case` link does not exist and is a separate
  decision.
- A `source` column on `scp_interview_notes` (today the addendum's source is
  the constant `interview_note`), and a per-domain interpretation label.
- The `pace` block of the employer brief is not carried into V3: it is not
  in the approved information architecture.
