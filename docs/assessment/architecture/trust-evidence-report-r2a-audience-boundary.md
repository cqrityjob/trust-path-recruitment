# TRUST Evidence Report — PR-R2A audience boundary hardening

Three independently deployable steps, in a fixed order, that close the
audience exposures PR-R0 pinned (R0-X1, R0-X2, R0-X3). The security design is
Product-Owner approved (2026-09-04); this document is the packaging of it into
a sequence that is safe wherever deployment stops.

| Step        | Branch                                              | Migration        | What it does                                                                                                                   | Safe to stop after?                                                                 |
| ----------- | --------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| **R2A-1**   | `feature/trust-evidence-report-r2a-1-expand`        | `20261024090000` | adds the audience read contracts; removes nothing                                                                              | yes — main's code is untouched; the entry points simply exist                       |
| **R2A-2**   | `feature/trust-evidence-report-r2a-2-app-cutover`   | none             | `getAcademyReport` and the Interview Intelligence bridge read through the contracts; client types lose `mean`/`spread`         | yes — old and new application versions both work while the direct read still exists |
| **R2A-3**   | `feature/trust-evidence-report-r2a-3-contract`      | `20261025090000` | withdraws the direct snapshot read, drops the subject's ledger policy, re-points the row policies, closes default-privilege leftovers | yes — and only then are R0-X1/X2/X3 closed                                          |

Mandatory order: merge R2A-1 → apply EXPAND hosted → verify the entry points
hosted with the current app unchanged → record `applied` in
`release-state.json` → merge/deploy R2A-2 → verify the deployed app calls the
entry points → only then merge/apply R2A-3. `scripts/schema-first-release-check.ts`
enforces the first half mechanically (R2A-2's code names objects R2A-1
introduces); the second half is a deployment fact that the CONTRACT migration
header, its release-state note and this document state.

Nothing in any step changes scoring, maturity, signals, competencies, items,
thresholds, templates, the report version, a stored snapshot or the release
function. There is no Report V3, no Evidence Map, no TRUST plan and no
computation manifest here.

## 1. The principle

Row-level security on `scp_report_snapshots` decides which **row** an
audience may read. `GRANT SELECT ... TO authenticated` covers every
**column**, and a field the frontend does not select is still a field a
signed-in caller with the publishable key can `select=*`. So the fix is not a
narrower select and not a hidden field: each audience reaches its document
through one server-side projection of exactly the released fields (R2A-1),
every consumer moves to it (R2A-2), and the base rows stop being readable by
that audience at all (R2A-3).

## 2. R2A-1 — EXPAND (this branch)

### What `20261024090000` adds

`scp_report_snapshot_readable(audience, subject_id, issuer_organization_id)`
— the audience rule as a function, verbatim the two row-policy predicates
from 20260808090000. The policies are **not** touched in this step; R2A-3
re-points them so the rule has one definition. Until then TR13.13 asserts the
policies are still in place and E1 asserts they still bound the direct read.

`scp_audience_brief(brief)` — a pure, STRICT projection: every `observed[]`
and `self_reported[]` entry loses `mean` and `spread`; every other key passes
through in order; NULL stays NULL (apply-time proof; TR13.7 recomputes the
strip independently). The stored brief is never rewritten — released
snapshots are immutable by trigger and PR-R1's manifest needs the numbers.

`scp_participant_report(attempt_id)` and `scp_employer_report(attempt_id)` —
the audience read contracts. SECURITY DEFINER, pinned `search_path`, EXECUTE
to `authenticated` only, never `anon`. Each returns zero or one row.

### Participant contract

| Field                              | Content                                                                                                   |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `id, attempt_id, subject_id`       | the row's own                                                                                             |
| `audience`                         | `'participant'`                                                                                           |
| `released_at`                      | the row's own                                                                                             |
| `payload`                          | the row's own                                                                                             |
| `brief`                            | byte-identical to the stored participant brief (it never carried numbers)                                 |
| `safety_flags`                     | `[]` **structurally** — the participant contract is the boolean `context.safety_concern_present` (RA3.2/3.3) |
| `context`                          | the row's own                                                                                             |
| `limitations_sv`, `limitations_en` | the pinned template's                                                                                     |

Eleven keys exactly (TR13.1); no `derivation_input`. Zero rows for anyone but
the subject.

### Employer contract

Same eleven keys (TR13.5b). `brief` is the stored brief minus `mean`/`spread`
on every area and pattern (TR13.7); `safety_flags` is each finding as
`{finding, severity, observed_at}` (TR13.9); `payload`, `context`, guide,
modules, coverage, summary, pace and versions are the row's own (TR13.6).
`behaviour_version_id` is **internal traceability**: it stays on the row for
the manifest and never reaches the document (TR13.10). `subject_id` remains
the pseudonymous subject; resolving it still needs
`scp_resolve_participant_identity`. Zero rows for a non-member or another
organisation (TR13.15/13.16).

### What R2A-1 leaves exactly as it is

The direct SELECT on `scp_report_snapshots`, policy `scp_evidence_own_select`,
both snapshot row policies and every table grant. The migration's apply-time
proof **refuses** if any of them moved. The PR-R0 pinned exposures
TR10.5X/6X/10X/13X therefore still hold and stay in the suite unchanged; they
are inverted in R2A-3.

### Proof in this step

- `scp_trust_evidence_report_r0_test.sql` group TR13 (21 assertions, 122 in the suite): the
  documents field for field against the row, the eleven-key shapes, the
  independent strip, the finding projection, tenant isolation and anon
  refusal through the entry points, definer/pinned posture and grants.
- `scp_trust_evidence_report_r2a_expand_test.sql` (15 assertions): main's
  direct reads (E1) and the entry points (E2) work in the same state; nothing
  R2A-3 owns has moved (E3). R2A-3 will reach this state by rolling itself
  back and running this file.
- `scp_a_rollback_test.sql` drops the four routines.
- Rollback `supabase/rollback/20261024090000_..._rollback.sql`: drops the four
  routines; refuses while R2A-3 is applied.
- `schema-first-release:check` = PASS (nothing in `src/` names the entry
  points yet).

## 3. R2A-2 — application cutover (planned; stacked on R2A-1)

- `getAcademyReport` (`src/lib/security-competency/academy-employer.functions.ts`)
  calls `scp_participant_report` or `scp_employer_report` by audience; same
  `ReportSnapshot` shape to the routes.
- `readAssessment` (`src/lib/interview-intelligence/context.functions.ts`)
  calls `scp_employer_report`; still carries only `released_at`,
  area/signal/behaviour and guide follow-ups.
- `ObservedArea` / `SelfReportedArea` lose `mean`/`spread`; `mapBrief` no
  longer reads them; `released-candidate-brief.ts` follows. `byWeight` in
  decision-support orders by `items` and never used `mean`; no panel changes.
- Typed RPC shapes spliced into `types.ts`.
- `trust-evidence-report:check` G pins **zero** direct readers, the two RPC
  calls, a client type without `mean`/`spread`, the bridge carrying no
  payload/context/question/listen-for, and typed shapes naming nothing
  internal. `interview-context-bridge:check` G/H re-pinned to the RPC.
- No migration. The direct read stays: an old and a new application version
  both work during the rollout window.
- `schema-first-release:check` is BLOCKED on this branch until R2A-1's
  release-state entry is recorded `applied` with evidence; that is the gate
  doing its job, and it passes the moment the entry is flipped.

## 4. R2A-3 — CONTRACT (planned; prepare only once R2A-2 is proven live)

Migration `20261025090000`, refusing with `SCP_R2A_EXPAND_MISSING` unless
R2A-1 is applied:

- `REVOKE SELECT ON scp_report_snapshots FROM authenticated` — after this an
  audience reaches a snapshot only through the entry points. Closes R0-X1 and
  R0-X3 at the row.
- `DROP POLICY scp_evidence_own_select` — the subject reads zero ledger rows
  (contribution, confidence, rubric basis, safety finding/severity). Closes
  R0-X2. The author read (20260821090000) stays; every routine that reads the
  ledger is SECURITY DEFINER, so no server path loses a read.
- Re-point `scp_report_snapshots_own` / `scp_report_snapshots_employer` at
  `scp_report_snapshot_readable` — one definition of the rule, kept as
  defence in depth.
- `REVOKE ALL FROM PUBLIC, anon, authenticated` then `GRANT SELECT TO
  authenticated` (policy-bounded) and `ALL TO service_role` on
  `scp_employer_report_decisions`, `scp_interview_notes`,
  `scp_competency_evidence` and `scp_report_snapshots`. On a clean replay
  `authenticated` holds TRUNCATE on both addendum tables; on a hosted-like
  replay (default privileges applied first) `TRUNCATE scp_report_snapshots`
  **succeeded** as `authenticated` and `TRUNCATE scp_interview_notes` as
  `anon`. TRUNCATE is bounded neither by RLS nor by the UPDATE/DELETE
  append-only triggers.
- Tests: TR10.5X/6X/10X/13X inverted **deliberately** to their closed form;
  TR13 extended with table refusal, ledger closure, TRUNCATE/INSERT/UPDATE/
  DELETE refusal for anon and authenticated, and the governed recorders still
  working; RA6, J6, F25/F27, RB6 and competency-graph G8.1 move to the entry
  points (G8.1 inverted on purpose); `db-test.sh` rolls CONTRACT back, runs
  the expand suite, re-applies. Rollback re-grants the direct read and refuses
  nothing; the R2A-1 rollback refuses while it is applied.
- Precondition (a deployment fact no repo file can check): R2A-2 must be
  live. Applied earlier, every released report reads as "not released" and
  the interview briefing loses its assessment context until the code catches
  up — a blank, not a corruption; the rollback restores the read.

## 5. Security acceptance after R2A-3

| Exposure | Closed by                                                                     | Proof (R2A-3 suite)                        |
| -------- | ----------------------------------------------------------------------------- | ------------------------------------------ |
| R0-X1    | table refuses `authenticated`; participant document has no `derivation_input` | TR10.5, TR10.5b, TR13.1, RA6.2b            |
| R0-X2    | subject's ledger policy dropped                                               | TR10.6, TR10.6b, G8.0/G8.1, E3             |
| R0-X3    | table refuses; employer document without `mean`/`spread`; no client field     | TR10.10, TR10.10b, TR13.7, G2c, G7, C3     |
| —        | `behaviour_version_id` internal                                               | TR13.9, TR13.10 (already in R2A-1)         |
| —        | default-privilege leftovers                                                   | TR13 anon/authenticated TRUNCATE assertions |

Tenant isolation is unchanged at every step (TR10.11/10.12, RA6.5/6.6, RB6.7,
E1.5/1.6, E2.3, TR13.15/13.16).

## 6. Left open, deliberately

- PR-R1: the private computation manifest. The stored rows keep
  `mean`/`spread` and `behaviour_version_id` for it (TR13.8, TR13.10).
- The platform-wide default-privilege leftover on every other pre-20260916
  table (recorded, not fixed, by R2A-3).
- Column-level narrowing of `scp_report_versions` (limitations text; readable
  by `authenticated`, not sensitive).
