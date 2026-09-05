# TRUST Evidence Report — PR-R1 reproducible provenance

_"Från evidens till en bättre intervju."_

Start SHA `197dc30` (origin/main, 2026-09-04). Branch
`feature/trust-evidence-report-r1-provenance`. Migration `20261027090000`
(EXPAND only) and its rollback.

PR-R1 answers one question about every report released from now on:

> Exactly which frozen inputs, versions, mappings, rubric decisions and rules
> created this report?

It changes **no scoring, no threshold, no question, no competency, no
maturity rule, no report interpretation and no audience document**. The R0
suite's audience assertions (TR5–TR10, TR13, TR14) run unchanged on the same
three releases and pass, which is the proof that the report did not move.

## 1. What is added

| Object                                                           | Kind               | Who can reach it                                                                                                                   |
| ---------------------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `scp_report_computation_manifests`                               | table, private     | nobody as an audience: RLS on, **no policy**, no privilege for PUBLIC/anon/authenticated; `service_role` ALL; immutable by trigger |
| `scp_report_snapshots.manifest_id`, `.canonical_sha256`          | nullable columns   | same as the snapshot row (no audience privilege since R2A-3); NULL on every historical row                                         |
| `scp_report_manifest_hash(jsonb)`                                | IMMUTABLE function | internal (the table CHECK, the release, the verifier); revoked from anon/authenticated                                             |
| `scp_report_manifest_computation(uuid, timestamptz, text, text)` | SECURITY DEFINER   | internal; revoked from anon/authenticated                                                                                          |
| `scp_verify_report_manifest(uuid)`                               | SECURITY DEFINER   | `service_role` only                                                                                                                |
| `scp_release_attempt_report(uuid)`                               | replaced           | unchanged grants: `authenticated` only, never anon, never service_role                                                             |

One manifest per **release**: both audience snapshots point at the same row,
because there is one calculation. The manifest is inserted first, inside the
release transaction, with the two snapshot ids generated up front; the
snapshot-side links are ordinary foreign keys and the manifest-side links are
DEFERRABLE, switched to IMMEDIATE by the release function once both
snapshots exist.

## 2. What is frozen

Columns (identity, time, versions — outside the hash):

`attempt_id`, `subject_id`, `issuer_organization_id`, both snapshot ids,
both template ids, `calculated_at`, `calculation_schema_version` (`rcm-v1`),
`scoring_model_version`, `signal_model_version`, `threshold_version`,
`evidence_state_version`, `evidence_scope_version`, `brief_version`,
`competency_mapping_version`, `released_by`, `released_by_role`.

Body (`jsonb`, hashed):

| Key              | Content                                                                                                                                                                                                                                                   |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schema_version` | `rcm-v1`                                                                                                                                                                                                                                                  |
| `attempt`        | the attempt's pins: assessment version, form, purpose version, role/jurisdiction, option-order seed, governance and validation status of the day, language, timestamps (UTC)                                                                              |
| `versions`       | every version string; `rubric_versions[]`; `competency_mapping_version` (`bcm-sha256:<hash of the map rows>`); `trust_question_version` (the guide-prompt row ids and versions, in guide order); `report_template_version` per audience (id, key, number) |
| `prompts`        | `interview_guide[]` (prompt id, version, area, focus, order) and `followup[]` (the employer follow-up and participant reflection prompt ids per competency)                                                                                               |
| `coverage`       | the counts the context already carries, plus `answered`                                                                                                                                                                                                   |
| `computation`    | see below                                                                                                                                                                                                                                                 |

`computation` (built by `scp_report_manifest_computation`):

- `classification_rule` — the ras-v1 bands, the thresholds-v1 maturity rule
  including the safety **level cap**, the des-v2 state rule, and the
  self-report pattern rule, as one text; every area repeats it.
- `thresholds[]` — the four v1 threshold **rows with their values**.
- `source_types[]` — the registry rule for each source type present
  (`self_report` → `counts_toward_maturity = false`).
- `competency_mapping` — the map rows the attempt's behaviours resolve
  through, and their canonical hash as the mapping version.
- `rubric_versions[]`.
- `evidence[]` — **one entry per response of the attempt**, in form order:
  item id, slug, version id and number, format, declared source type,
  `option_key_version` (the item version id), the option key chosen and its
  score value and the item max, best/worst keys where applicable, the
  behaviour and competency, the evidence row (id, source type, provenance,
  contribution, confidence, derivation basis, rubric version, finding and
  severity, context, observed_at, valid_until, superseded_by), the latest
  review (id, status, outcome), `classification`
  (`observed` / `self_report` / `none`), `included`, `counted_for_maturity`
  and `exclusion_reason` (`self_report_non_counting`, `training_non_counting`,
  `superseded`, `review_disputed`, `review_pending`, `no_evidence_row`).
- `reviews[]` — every review: trigger, status, outcome, rubric version and
  **levels**, completed_at, break-glass flag. Never the reviewer's rationale.
- `areas[]` — per competency the release function lines: `item_count`,
  `weighted_sum`, `denominator`, `mean`, `spread`, `context_count`,
  `source_type_count`, `safety_finding_present`, `disputed_review_present`,
  `evidence_ids[]`, `final_area_signal`, `maturity_level`, `evidence_state`.
- `self_report_areas[]` — per facet, kept apart: the same numbers, the
  pattern and consistency, the item slugs and evidence ids, classified
  `self_report`. No interpretation label (c07/c19 stay methodologically open
  by Product Owner decision; that is a content decision, not a schema one).

`included` is the ras-v1 signal predicate (counting source type, not
superseded, source is a response of this attempt). `counted_for_maturity`
additionally honours `valid_until` at `calculated_at`, as
`scp_attempt_maturity` does. On an attempt the two coincide.

## 3. Not a second engine

The builder does not classify anything itself. Every `final_area_signal`,
`maturity_level`, `evidence_state`, `pattern` and `consistency` in the
manifest comes from `scp_attempt_assessment_signal`, `scp_attempt_maturity`,
`scp_attempt_evidence_state` and `scp_attempt_self_report_pattern` — the
routines the release function has always called. What the builder adds is
the record of what those routines were given: the rows, the weighted sum, the
denominator, the spread. It then re-reads the signal routine and **raises
`SCP_MANIFEST_DERIVATION_MISMATCH`** if its own count, mean, spread or signal
differ from it, so a release can never freeze a provenance that does not
explain its own report. TR12.1 pins exactly two routines that derive an
evidence-state payload: the release function and this builder.

## 4. One instant

`scp_release_attempt_report` now takes `now()` once into `_calculated_at`
and passes it to both `scp_attempt_maturity` calls, the builder and the
`released_at` columns. Inside one transaction `now()` is constant, so no
value changed; what changed is that the instant is **stored** on the manifest
and the verifier can rebuild under it.

## 5. The hash contract

```
canonical_sha256 = scp_report_manifest_hash(body)
                 = sha256(convert_to(body::text, 'UTF8')) as lower-case hex
```

Canonical form is PostgreSQL's jsonb text serialisation: keys in jsonb's
canonical order, duplicates collapsed, whitespace normalised, numerics at
the scale written, array order preserved. Two bodies equal as jsonb hash
identically however their keys were typed; array order is content. The rule
is pinned at apply time to the digest of a known canonical text
(`{"a": 2, "b": 1}` →
`21501dba…397a323`), so a serialisation change cannot pass unnoticed.

The table refuses a row whose `canonical_sha256` is not the hash of its
`body` (CHECK). Identity (manifest id, snapshot ids) and time
(`calculated_at`) are columns, not body keys: **the same frozen inputs under
the same versions hash the same however often they are recomputed** (TR15.29
recomputes the computation part and gets the identical jsonb and hash).

`scp_verify_report_manifest(id)` returns `integrity_ok` (stored hash = hash
of stored body), `reproducible` (stored computation = a rebuild from the
live ledger under the frozen instant and versions) and `snapshots_linked`.
A re-seeded threshold value after release keeps `integrity_ok` true and
turns `reproducible` false; restoring it restores reproducibility (TR15.30).
A difference is information, not an error.

## 6. Privacy and access

| Path                                             | Result                                                                                                                                                                                                                      |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| participant, table                               | `permission denied` (TR15.33)                                                                                                                                                                                               |
| participant, builder / verifier / hash           | `permission denied` (TR15.33b–d)                                                                                                                                                                                            |
| employer owner, table and link columns           | `permission denied` (TR15.35, 15.35b); TRUNCATE refused (15.35c)                                                                                                                                                            |
| another organisation, stranger, anon             | `permission denied` (TR15.37, 15.37b–d)                                                                                                                                                                                     |
| `scp_participant_report` / `scp_employer_report` | untouched; neither projects `manifest_id` / `canonical_sha256` (apply-time proof 7.7); the documents name no manifest, hash, denominator, option key, score, rubric version, exclusion reason or prompt id (TR15.34, 15.36) |
| `service_role`                                   | verifier and table (TR15.38)                                                                                                                                                                                                |

The manifest holds answer-key material (option keys and scores) and rubric
levels precisely **because** it is private; it holds no candidate words, no
reviewer rationale and no e-mail address (TR15.22). The authorised
traceability projection for Report V3 (PR-R3) is a separate, approved subset
and never this row.

## 7. Legacy reports

Every snapshot released before this migration keeps `manifest_id IS NULL`
and `canonical_sha256 IS NULL`. Nothing is backfilled: the inputs those
reports were derived from were never captured per item, and a manifest
invented after the fact would be provenance theatre. Their audience documents
are unaffected (the R2A continuity contract still applies; the continuity
suite still passes). A report released after this migration always has a
manifest, in the same transaction, or is not released.

## 8. Guide-prompt ids without changing the brief

The guide entries carry `prompt_id` / `prompt_version` while the guide is
built and lose both before the brief is stored; the ids go to the manifest.
TR15.25 checks every released guide entry against a published prompt row of
that id, version and focus, in order, and that the brief carries neither key.

## 9. Proof

- `supabase/tests/scp_trust_evidence_report_r0_test.sql`: TR11.4 and TR12.1
  inverted deliberately; TR12.1b; group **TR15** (52 assertions).
- Apply-time proof in the migration: posture, immutability trigger, pinned
  hash digest, exactly one snapshot writer and one manifest writer, one
  `calculated_at`, the 20260830093000 vocabulary proof over the release
  function and both new routines, audience contracts untouched.
- `scripts/db-test.sh`: rolls R1 back (the rollback refuses while manifests
  exist unless `scp.discard_manifests = 'yes'`), proves the pre-R1 state,
  re-applies, proves the post-R1 state.
- `scripts/trust-evidence-report-check.ts`: H10/H11 inverted (exactly one
  creator, PR-R1's); H11b–e posture, immutability, body keys, audience
  contracts untouched.

## 10. Gap table, closed

| Provenance element (R0 §10)           | After PR-R1                                                                            |
| ------------------------------------- | -------------------------------------------------------------------------------------- |
| calculated_at                         | FROZEN — one instant, on the manifest, used by every maturity call and by the verifier |
| calculation_schema_version            | FROZEN — `rcm-v1`                                                                      |
| scoring / signal / threshold version  | FROZEN — columns and body; the threshold **rows** frozen too                           |
| rubric version                        | FROZEN — per evidence row, per review, and as `rubric_versions[]`                      |
| competency mapping version            | FROZEN — the map rows and their canonical hash                                         |
| report template version               | FROZEN — per audience, id + key + number                                               |
| TRUST question version                | FROZEN — guide-prompt row ids and versions, in order; follow-up prompt ids per line    |
| included / excluded evidence rows     | FROZEN — every response, with `included` and `exclusion_reason`                        |
| per-item contribution / confidence    | FROZEN — on every evidence entry                                                       |
| observed / self-report classification | FROZEN — per item (`classification`), and the registry rule that decides it            |
| denominator / weighted sum / spread   | FROZEN — per area and per self-report facet                                            |
| canonical hash                        | FROZEN — CHECK-enforced, pinned rule, verifier                                         |

## 11. Hosted apply, 2026-09-04: applied, regression, rolled back

The canonical file (origin/main `c5c08be`, sha256 `e8bf24f8…af446`) was
applied verbatim to `wrygicdfxwjnrugduxnt` through the Supabase management
API and stamped as ledger version `20260904190901`. The apply-time proof
passed; every read-only verification listed in §6 passed on production; the
five routines were md5-identical to a local strict replay.

A transient, rolled-back release over the eight releasable attempts then
found a **regression**: `scp_attempts.option_order_seed` does not exist on
production, because `20261021090000` (option order per attempt) is still
pending there, and a plpgsql `%ROWTYPE` field is resolved at run time. The
R1 release function therefore installed cleanly and failed on every call
with `42703`. Seven of eight attempts hit it. The eighth
(`890b7968`, the only post-cutover attempt) fails on the pre-R1 function
too: 48 orphaned `scp_competency_facets` rows from the retired project's
data restore (created 2026-07-28, competency ids that no longer exist)
duplicate every facet slug, and the guide-prompt selection's
`(SELECT f2.id … WHERE f2.slug = g.facet_slug)` returns two rows (`21000`).
That defect predates R1 and is reported separately.

The documented rollback was executed the same session. Its proof passed;
the release function is back at md5 `578cfd1432a7351a830a353c6b57ee77`, the
value observed before the apply; no R1 object remains; the R2A-3 posture and
the data (16 / 547 / 34) are unchanged; a transient pre-R1 baseline released
seven of eight attempts again. The ledger keeps row `20260904190901` whose
objects no longer exist.

Consequences carried into this file's next revision:

- §0 now refuses with `SCP_R1_PRECONDITION` unless
  `scp_attempts.option_order_seed` exists.
- `scp_guard_manifest_immutable()` is revoked from PUBLIC/anon/authenticated
  (hosted default privileges had granted anon EXECUTE; direct calls fail
  with "trigger functions can only be called as triggers", so the exposure
  was inert, but the rule is that no new function arrives reachable).
- Re-apply order is a Product Owner decision: `20261021090000` first, then
  this file. The re-apply will create a second ledger row; the 2026-09-04
  row must then be recorded as a no-op.
- The local strict replay could not have caught this: it applies every
  migration in order. A migration that reads a column another _pending_
  migration introduces needs its own precondition, and the hosted ledger
  frontier must be read before any apply.

## 12. RUN 1 prerequisites (2026-09-04/05): option order refused, facet resolution corrected

**Option order (`20261021090000`).** Reviewed against the merged canonical
file: nullable `scp_attempts.option_order_seed`, no default, no backfill,
NULL stays NULL forever (the BEFORE UPDATE trigger refuses NULL → value),
only new attempts get a seed, only `sjt_best_response` / `sjt_best_worst`
are shuffled, `biq_frequency` / `sjt_rate_effectiveness` keep their authored
order structurally, answers stay option-id based, scoring untouched, every
new function revoked from anon/authenticated. Verdict on the file: safe.
The hosted apply on 2026-09-04T19:40Z was nevertheless **refused by the
file's own proof** (`SCP_OPTION_ORDER_ITEM_COUNT: expected 50 Väktare
items, found 100`) and rolled back whole: production carries two
`scp_forms` rows with the Väktare slug — `b1c2ca5e` (2026-08-21, items on
the 48 orphaned facets, 12 attempts) and `ed74e29f` (2026-08-28, the replay,
1 attempt) — because the uniqueness is `(assessment_version_id, slug)` and
the retired project's restore left its form beside the replayed one; 16
other form slugs are duplicated the same way. Nothing was written; digests
before and after are identical. Re-apply needs a Product Owner decision:
retire the historical form rows, or scope the proof's count to the form the
live assessment version references.

**Facet resolution (`20261026093000`, new, between R2A-3 and R1).** The
release function resolved a guide facet with a slug-only scalar subquery;
the facet's identity is `(competency_id, slug)`. The prerequisite replaces
the subquery, in the 20260830093000 body verbatim, with

```
EXISTS (SELECT 1 FROM public.scp_competency_facets f2
         WHERE f2.id = p.facet_id
           AND f2.competency_id = c.id
           AND f2.slug = g.facet_slug)
```

No `LIMIT 1`, no `DISTINCT ON`, no row deleted or updated, no FK weakened.
The same predicate is in the R1 forward function and in the function the R1
rollback restores; R1's §0 refuses unless the pre-R1 function carries it,
and R1's §7 asserts it structurally (exactly one facet reference binding
all three, no slug-only form, no `LIMIT`/`DISTINCT ON`). Proven by
`scp_release_facet_resolution_test.sql` on valid relational fixtures: a
second real competency receives the form's facet slugs with wrong-facet
prompts; the release under duplicates is byte-equal to the clean control,
wrong prompts are never selected, contributions / signals / classification
are identical. `db-test.sh` walks R1 rollback → facet rollback → R1 refused
→ facet re-apply → seed hidden → R1 refused → R1 re-apply.

Production data: the 48 orphan facets and the duplicated forms were **not**
deleted or modified.
