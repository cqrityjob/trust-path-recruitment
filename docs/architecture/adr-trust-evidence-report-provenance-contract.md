# ADR — TRUST Evidence Report: canonical report contract and computation manifest

Status: **Decision 1 locked (PR-R0). Decision 3 IMPLEMENTED by PR-R1
(`20261027090000`, see
`docs/assessment/architecture/trust-evidence-report-r1-provenance.md`).
Audience read paths implemented by PR-R2A (20261024090000 – 20261026090000).
Decision 2 (the V3 audience shape) is still a contract only; PR-R3 builds
it.**

> **PR-R1 note (2026-09-04).** The manifest as built differs from the table
> below in three deliberate ways: (1) one row per **release**, both audience
> snapshots pointing at it (there is one calculation); (2) identity and
> `calculated_at` are **columns**, not body keys, so the hash covers frozen
> inputs, versions and computation only and the same inputs hash the same
> however often they are recomputed; (3) the evidence list is one entry per
> **response** (with the evidence row or the exclusion reason), rather than
> two lists, so every response is accounted for exactly once. The mapping
> version is a canonical hash of the map rows (`bcm-sha256:…`), since the
> map table carries no version column. The V3 fixture's
> `TRUST_MANIFEST_BODY_KEYS` names the keys the migration writes.

Date: 2026-09-04. Start SHA 755b9b0. Typed fixture:
`scripts/fixtures/trust-evidence-report-v3-contract.ts` (type-checked, walked
by `scripts/trust-evidence-report-check.ts`, imported by nothing in `src/`).

## Context

The product will ship the **CQrityjob TRUST Evidence Report** —
_"Från evidens till en bättre intervju."_ — on top of the existing chain:
Candidate Decision Support Report V2, rds-v1, `scp_competency_evidence`,
`scp_report_versions`, the two immutable audience snapshots,
`scp_release_attempt_report`, the Decision Support / Method Section and the
process links. There will be no parallel report engine.

The chain the report describes, unchanged:

```
question + response → evidence type → competency signal → limitation
  → human review → TRUST follow-up → documented interview outcome
```

`docs/assessment/architecture/trust-evidence-report-r0-characterisation.md`
records what the chain does today and what it does not freeze. Two things are
missing for the report to be a document a second person could reproduce and
trust: a **canonical audience shape** whose every field is a fact about the
evidence, and a **private computation manifest** that holds every number and
version the audience document was derived from.

## Decision 1 — product boundary (negative contract, locked now)

The report may support: `structured_interview`, `additional_assessment`,
`request_clarification`, `gather_more_evidence`. These are the four
`RecommendedNextStep` values rds-v1 already produces and the set may not
widen.

The report must never output, as a key, a value or a sentence: hire, reject,
recommended hire, not recommended, pass/fail, a candidate ranking, a
percentile, a benchmark, a match percentage, a job-fit percentage,
suitability, a potential score, a safety risk score, a personality
diagnosis, a predictive work-performance claim, a bias-free claim, a total
score, an employer-weighted candidate index, shortlist-by-score,
auto-screen-out, auto-rank. It must not introduce a radar/spider chart, a
closed competence polygon or a percentage competence profile during the
shadow pilot; the **Evidence Map** is the approved future visual model.

Enforced by: `scp_trust_evidence_report_r0_test.sql` TR9 (database),
`trust-evidence-report-check.ts` A/B/C (source, copy in sv and en, fixtures),
the apply-time vocabulary proofs in 20260830093000 and 20260831093000, and
`recruitment-decision-support-check.ts` §2.

## Decision 2 — canonical Report V3 shape (audience document)

`schema_version: "trust-evidence-report/v3"`. One document per audience.
Every number on an area is a **count**; there is no mean, spread, sum,
percentage or score anywhere in the audience document (guard H3).

```
TrustEvidenceReportV3
  schema_version, report_id, released_at, audience
  context        { person_context, organisation_name, purpose_code, assessment_slug,
                   assessment_version, language, governance_mode, validation_status }
  coverage       { observed_items, self_report_items, evidence_contexts,
                   areas_covered, areas_limited, areas_not_covered }
  areas[]        TrustEvidenceArea
  self_reported_patterns[]   TrustSelfReportedPattern (own array; interpretation label)
  trust_followups[]          TrustFollowUp (authored, versioned, never scored)
  limitations[]              TrustLimitation (closed code set)
  human_review   { reviews_total, reviews_completed, disputed_readings,
                   safety_findings_present: boolean, released_by_role, released_at }
  recommended_process_step   one of the four steps
  computation_manifest_ref   { manifest_id, canonical_sha256 }   — reference only
```

```
TrustEvidenceArea
  competency_code            SCC-nn
  competency_version         pinned
  evidence_state             observed_consistent | observed_mixed | observed_limited |
                             self_reported_only | not_covered | human_review_pending
  observed_item_count        count
  planned_item_count         count (what the form intended for this area)
  context_count              count
  source_types[]             registry codes; self_report never under an observed_* state
  coverage_status            covered | partially_covered | limited | not_covered
  review_status              not_required | pending | completed_upheld | completed_disputed
  methodological_flags[]     single_context | single_item | self_report_not_observed |
                             descriptive_only | methodologically_open | unvalidated_content | closed_test
  factual_explanation        { sv, en } — a fact about the evidence, never about the person
  follow_up_priority         first | next | if_time_allows | none
```

Mapping from today's shapes (for PR-R3, not PR-R0): `signal strong/consistent
→ observed_consistent`, `mixed → observed_mixed`, `limited → observed_limited`
(SCC-08 on one item), a competency with self-report only →
`self_reported_only`, a disputed review → `review_status =
completed_disputed` and `evidence_state` unchanged, a pending review →
`human_review_pending`. `critical_follow_up` becomes `human_review.safety_findings_present = true`
plus `follow_up_priority = first` on the area — never a state that reads as a
risk level.

## Decision 3 — private computation manifest (PR-R1, not created here)

Table `public.scp_report_computation_manifests`. One row per released
snapshot, inserted in the same transaction as the snapshot by
`scp_release_attempt_report`, **immutable after insert** (trigger, so it
holds for the table owner and `service_role`), **private**: RLS enabled with
no participant and no employer policy, `REVOKE ALL FROM PUBLIC, anon,
authenticated`; readable only through server, reviewer or internal paths that
PR-R1 defines explicitly.

Immutable fields:

| Group       | Fields                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity    | `report_version_id`, `snapshot_id`, `attempt_id`                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Time        | `calculated_at` (the single `now()` every maturity/signal call used)                                                                                                                                                                                                                                                                                                                                                                                              |
| Versions    | `calculation_schema_version`, `scoring_model_version` (det-v1), `signal_model_version` (ras-v1), `threshold_version` (v1) **and the threshold rows**, `evidence_state_version` (des-v2), `evidence_scope_version` (attempt-v1), `report_template_version` (scp_report_versions.id), `trust_question_version` (guide-prompt row ids), `rubric_versions[]`, `competency_mapping_version`                                                                            |
| Evidence    | `included_evidence[]`, `excluded_evidence[]` — each with `evidence_id`, `response_id`, `item_id`, `item_version`, `option_key_version`, `rubric_version`, `competency_code`, `competency_mapping_version`, `source_type`, `classification` (observed / self_report), `provenance_type`, `contribution`, `confidence`, `included`, `exclusion_reason` (self_report_non_counting / training_non_counting / superseded / expired / review_disputed / review_pending) |
| Computation | per area: `item_count`, `weighted_sum`, `denominator`, `spread`, `classification_rule` (e.g. "ras-v1: n<3 → limited; spread ≥ 0.6 → mixed; mean ≥ 0.8 → strong; ≥ 0.62 → consistent; else developing; safety cap: consistent/strong → developing when a finding exists"), `final_area_signal`                                                                                                                                                                     |
| Integrity   | `canonical_sha256` over the canonical JSON of the manifest                                                                                                                                                                                                                                                                                                                                                                                                        |

The audience document references the manifest by `manifest_id` and
`canonical_sha256` only. `mean` and `spread` leave the employer brief when
PR-R2 rebuilds the audience payload; until then they are a pinned exposure
(TR10.10X).

## Decision 4 — provenance the report must carry to be reproducible

A released report is reproducible when a reviewer can, from the manifest
alone: list the evidence rows that were counted and the ones that were not
and why; re-run the classification rule over the listed contributions and
confidences with the listed thresholds and obtain the same area signals; and
recompute `canonical_sha256` and match it. The gap table in the
characterisation document (§10) is the checklist; every NOT FROZEN and
PARTIALLY FROZEN row becomes a manifest field.

## Consequences

- PR-R0: none at runtime. Two guards fail the build if a forbidden key or
  phrase enters the report layer or the contract, if a radar is rendered on a
  report surface, if a new direct snapshot read appears, or if a migration
  creates the manifest ahead of PR-R1.
- PR-R1 (done, `20261027090000`): EXPAND-only migration (new table, nullable
  `manifest_id` / `canonical_sha256` on the snapshot), release function
  writes the manifest, suite proves privacy (participant, employer, anon,
  other org read nothing), immutability and hash stability; TR11.4 and
  TR12.1 are inverted deliberately (TR11.3 still holds: `derivation_input`
  is unchanged, the per-item freeze lives on the manifest).
- PR-R2A, packaged as three deployable steps (`trust-evidence-report-r2a-audience-boundary.md`):
  R2A-1 EXPAND `20261024090000` adds `scp_participant_report` /
  `scp_employer_report` and removes nothing; R2A-2 moves the two consumers;
  R2A-3 CONTRACT `20261025090000` withdraws the direct `authenticated` SELECT
  on the snapshot table entirely rather than column by column, because the
  employer brief's `mean`/`spread` live inside the `brief` column and a
  column-level revoke of `derivation_input` alone would not close R0-X3.
  `mean`/`spread` leave the audience document at the read; the stored row
  keeps them for the manifest.
- PR-R2 as originally listed: audience RPCs/views; column-level revoke of `derivation_input`;
  ledger disclosure fix; TR10.\*X inverted deliberately; guard G1 pinned to
  zero direct reads.
- Self-publication, radar/Evidence Map rendering and any AI narrative
  provider remain out of scope until the product owner lifts them.

## Alternatives considered

- **Widen `derivation_input` instead of a new table.** Rejected: it lives on
  the audience-readable row, which is the exposure PR-R2 exists to close.
- **Store the manifest inside the brief.** Rejected for the same reason, and
  because the brief is an audience document by definition.
- **Hash the snapshot instead of a manifest.** Rejected: the snapshot omits
  the inputs, so a matching hash would prove only that the rendering did not
  change, not that it could be recomputed.
