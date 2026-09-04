# TRUST Evidence Report — PR-R2A audience boundary hardening

Start SHA `0f4ff0e` (origin/main, 2026-09-04, PR-R0 merged). Branch
`feature/trust-evidence-report-r2a-audience-boundary`.

PR-R2A is a **security containment** PR. It closes the three audience
exposures PR-R0 pinned (R0-X1, R0-X2, R0-X3), resolves the
`behaviour_version_id` question, closes the default-privilege leftover on the
report chain's tables, and migrates the two client consumers to audience-safe
read contracts. It changes **no scoring, no maturity, no signal, no
competency, no item, no threshold, no template, no report version, no stored
snapshot and no release function**. There is no Report V3, no Evidence Map,
no TRUST plan and no computation manifest here.

## 1. The principle

Row-level security on `scp_report_snapshots` decides which **row** an
audience may read. `GRANT SELECT ... TO authenticated` covers every
**column**, and a field the frontend does not select is still a field a
signed-in caller with the publishable key can `select=*`. So the fix is not a
narrower select and not a hidden field: the rows an audience can reach no
longer contain the internal fields at all, because the audience reaches its
document through one server-side projection and the table refuses the role.

## 2. What was closed

| Exposure | Was                                                                                                                                       | Now                                                                                                                                                                          | Proof                                                                                 |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| R0-X1    | participant could `select derivation_input` on their own snapshot row                                                                     | `scp_report_snapshots` refuses `authenticated` (42501); `scp_participant_report` has no such column                                                                           | TR10.5, TR10.5b, TR13.1, RA6.2b                                                       |
| R0-X2    | participant could select all 50 of their evidence rows: `contribution`, `confidence`, `derivation_basis`, `safety_finding`, `safety_severity` | policy `scp_evidence_own_select` dropped; the subject reads zero ledger rows; the author read (20260821090000) is untouched                                                    | TR10.6, TR10.6b, G8.0/G8.1 (competency graph), E3.1                                   |
| R0-X3    | employer could `select derivation_input`; `brief.observed[].mean/spread` and `brief.self_reported[].mean/spread` reached the client       | table refuses the role; `scp_employer_report` strips `mean`/`spread` from every area and pattern; the client type has no field for them                                       | TR10.10, TR10.10b, TR13.7, G2c, G7, C3                                                |
| —        | `safety_flags[].behaviour_version_id` on the employer row — a bare internal id no surface resolved                                        | **internal traceability only**: withheld by `scp_employer_report`; each finding leaves as `{finding, severity, observed_at}`; the row keeps the id for PR-R1's manifest       | TR13.9, TR13.10                                                                       |
| —        | `authenticated` (and hosted `anon`) held INSERT/UPDATE/DELETE/**TRUNCATE**/REFERENCES/TRIGGER on `scp_employer_report_decisions` and `scp_interview_notes` from default privileges; TRUNCATE bypasses RLS and the UPDATE/DELETE append-only triggers | `REVOKE ALL FROM PUBLIC, anon, authenticated`, then `GRANT SELECT TO authenticated` (member policies) and `ALL TO service_role`; same on `scp_report_snapshots` and `scp_competency_evidence` | TR13.17–13.20, E3.2–E3.5, RB6.4; hosted-like replay (§8)                              |

## 3. The read contracts (20261024090000, EXPAND)

`scp_report_snapshot_readable(audience, subject_id, issuer_organization_id)`
is the single definition of the audience rule — verbatim the two row-policy
predicates from 20260808090000 — and both row policies are re-pointed at it,
so the policies and the entry points cannot drift apart (TR13.13).

`scp_audience_brief(brief)` is a pure, STRICT projection: every `observed[]`
and `self_reported[]` entry loses `mean` and `spread`; every other key —
modules, coverage, pace, executive summary, interview guide, why-lines,
signals, patterns, item counts — passes through in order; NULL stays NULL
(apply-time proof in the migration; TR13.7 recomputes the strip
independently).

### Participant contract — `scp_participant_report(attempt_id)`

| Field                                | Content                                                              |
| ------------------------------------ | -------------------------------------------------------------------- |
| `id, attempt_id, subject_id`         | the row's own                                                        |
| `audience`                           | `'participant'`                                                      |
| `released_at`                        | the row's own                                                        |
| `payload`                            | the row's own (8 keys per line, TR10.2)                              |
| `brief`                              | byte-identical to the stored participant brief (it never had numbers) |
| `safety_flags`                       | `[]` **structurally** — the participant contract is the boolean `context.safety_concern_present` (RA3.2/3.3) |
| `context`                            | the row's own (19 keys, TR11.2)                                      |
| `limitations_sv`, `limitations_en`   | the pinned template's                                                |

Eleven keys, exactly (TR13.1). Zero rows for anyone but the subject.

### Employer contract — `scp_employer_report(attempt_id)`

Same eleven keys (TR13.5). `brief` is the stored brief minus `mean`/`spread`
on every area and pattern; `safety_flags` is each finding as
`{finding, severity, observed_at}`; `payload`, `context`, guide, modules,
coverage, summary, pace and versions are the row's own (TR13.6). Zero rows
for a non-member or another organisation. `subject_id` remains the
pseudonymous subject the row always carried; resolving it to a person still
needs `scp_resolve_participant_identity`.

Both entry points: `SECURITY DEFINER`, `search_path` pinned, EXECUTE to
`authenticated` only, never `anon` (TR13.14, sql-security guard). Neither
selects `derivation_input`.

## 4. The direct read, withdrawn (20261025090000, CONTRACT)

`REVOKE SELECT ON public.scp_report_snapshots FROM authenticated`. The two row
policies stay as defence in depth and as the visible statement of the rule.
`service_role` keeps ALL. CONTRACT refuses with `SCP_R2A_EXPAND_MISSING`
unless EXPAND is in place; the EXPAND rollback refuses with `ROLLBACK
BLOCKED` while CONTRACT is still applied.

Every SQL routine that reads `scp_report_snapshots` or
`scp_competency_evidence` is `SECURITY DEFINER` (verified on the replay:
`scp_application_assessments`, `scp_employer_person_assessments`,
`scp_employer_person_overview`, `scp_my_assessment_history`,
`scp_subject_progress`, `scp_development_recommendations`,
`scp_release_attempt_report`, the admin routines, …), so no server path lost a
read. The one `security_invoker` view, `scp_rm_competency_profile`, is for
internal services and is not read by any route.

## 5. Client migration

| Consumer                                                                   | Before                                                                   | After                                                                                                        |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `getAcademyReport` (`src/lib/security-competency/academy-employer.functions.ts`) | `.from("scp_report_snapshots").select(9 columns + template join)`      | `.rpc("scp_participant_report")` or `.rpc("scp_employer_report")` by `audience`; same `ReportSnapshot` shape |
| Interview Intelligence bridge (`src/lib/interview-intelligence/context.functions.ts:readAssessment`) | `.from("scp_report_snapshots").select("released_at, brief").eq("audience","employer")` | `.rpc("scp_employer_report")`; still carries only `released_at`, area/signal/behaviour and guide follow-ups |

`ObservedArea` and `SelfReportedArea` lose `mean`/`spread`; `mapBrief` no
longer reads them; the fixture `released-candidate-brief.ts` no longer
carries them. `byWeight` in decision-support orders by `items` and never used
`mean`, so no panel changes order. The routes are untouched.

No parallel report logic: one release function, one document per audience,
one rule.

Guard G (`trust-evidence-report:check`) now pins **zero** direct readers
(G1), the two RPC calls (G2, G3), a client type with no `mean`/`spread` (G2c),
the bridge carrying no payload/context/question/listen-for (G3c), and the
typed RPC shapes naming nothing internal (G7). `interview-context-bridge:check`
G/H are re-pinned to the RPC.

## 6. Report output change

**Employer document:** `brief.observed[].mean`, `brief.observed[].spread`,
`brief.self_reported[].mean`, `brief.self_reported[].spread` and
`safety_flags[].behaviour_version_id` no longer leave the database. No surface
rendered any of them (PR-R0 guard C3). Nothing visible changes.

**Participant document:** none. TR13.2–13.4 compare it field for field
against the row.

Scoring change: NONE. Maturity change: NONE. Competency change: NONE. Report
version: unchanged (`report_version_id` is the row's own; no template row is
touched).

## 7. Tests

| Suite / guard                                       | Change                                                                                                                                                   |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scp_trust_evidence_report_r0_test.sql`             | TR10.5X/6X/10X/13X inverted **on purpose** to their closed form under the same numbers; TR10 reads through the entry points; new group TR13 (21 assertions); floor 100 → 135 (138 run) |
| `scp_trust_evidence_report_r2a_expand_test.sql`     | **new**: the post-EXPAND state serves main's direct reads (E1) AND the entry points (E2); `db-test.sh` reaches it by rolling CONTRACT back, then re-applies |
| `scp_report_audience_test.sql` RA6                  | reads through the entry points; RA6.2b/6.4b assert the table refuses; RA6.7/6.8 anon cannot execute                                                       |
| `scp_competency_graph_test.sql` G8.1                | **inverted on purpose**: a subject reads zero ledger rows (G8.0 proves rows exist)                                                                        |
| `scp_phase2_journey_test.sql` J6.1/6.2              | through the entry points                                                                                                                                 |
| `scp_workforce_e2e_test.sql` F25/F27                | the surface's snapshot id is the one the entry point returns                                                                                              |
| `scp_recruitment_brief_test.sql` RB6.4/6.7/6.9/6.10 | RB6.4 now expects `permission denied` (stronger than "matched no rows"); reads through the entry points                                                   |
| `scp_a_rollback_test.sql`                           | drops the four routines so "no scp_ function remains" still holds                                                                                        |

Every R0 contract stays: self-report separation (TR5), c07/c19 (TR5.9/5.10),
SCC-08 (TR6), safety finding (TR7), human release (TR2/TR4), immutability
(TR8), forbidden claims (TR9), provenance baseline (TR11), one engine (TR12);
`recruitment-decision-support:check`, `recruitment-report-render:check`,
`interview-context-bridge:check`, `review-contribution-guard`, the reviewer
suite. None was weakened; only the four X assertions and G8.1 — the
exposures R0 documented as future fixes — were inverted.

## 8. Default privileges, proven on a hosted-like replay

A clean replay cannot show the hosted grant surface for tables created before
the mirror migrations. Rebuilt as bootstrap → the three
`ALTER DEFAULT PRIVILEGES ... TO anon, authenticated, service_role` → full
replay of main: `anon` and `authenticated` held the full seven-privilege set
on all four tables and `TRUNCATE public.scp_report_snapshots` **succeeded** as
`authenticated`. After 20261024090000: `authenticated` holds SELECT only on
the ledger and the two addendum tables, nothing on the snapshots after
CONTRACT, `anon` nothing on any of the four, and the four new functions are
not anon-executable despite the function default. The wider cause — every
other pre-20260916 table in `public` arrived hosted with the same set — is
**out of scope here** and remains open (see memory note on hosted default
privileges); it is recorded, not fixed, by this PR.

## 9. Deploy order and the schema-first gate

This is an EXPAND / APPLICATION / CONTRACT release, and the repository's
`schema-first-release:check` enforces it:

1. **EXPAND** `20261024090000` — safe alone; adds the entry points, closes the
   ledger read and the grants; leaves the direct snapshot read for main's code.
2. **Application** — `getAcademyReport` and the bridge move to the entry
   points. Merge-eligible only after step 1 is recorded `applied`.
3. **CONTRACT** `20261025090000` — safe only once step 2 is live; withdraws
   the direct read. Applied earlier, every released report reads as "not
   released" and the interview briefing loses its assessment context until
   the code catches up — a blank, not a corruption; the contract rollback
   restores the read.

The branch is built as two commits in that order (schema first, then
application) so the schema commit is independently mergeable. On the combined
head the gate reports BLOCKED by design, naming exactly the two call sites and
the EXPAND migration; that is the gate working, not a defect. Full CI on the
combined head is therefore green on every job except that one until EXPAND is
applied hosted and recorded.

## 10. Rollback plan

Reverse order, and the files enforce it:

1. `supabase/rollback/20261025090000_..._contract_rollback.sql` — re-grants
   SELECT to `authenticated` (reinstates R0-X1/R0-X3 as a direct read).
2. `supabase/rollback/20261024090000_..._audience_reads_rollback.sql` —
   refuses while CONTRACT is applied; restores the original inline policy
   predicates and `scp_evidence_own_select` (reinstates R0-X2); drops the four
   routines. It does **not** re-grant the default-privilege leftovers; the
   repository never granted them.

Verified locally: forward, forward, EXPAND rollback refused, CONTRACT
rollback, EXPAND rollback, forward again; CONTRACT alone refused on a fresh
replay.

## 11. Left open, deliberately

- PR-R1: the private computation manifest (mean/spread, per-item
  contribution, included/excluded evidence, canonical hash). The stored rows
  keep `mean`/`spread` and `behaviour_version_id` for it (TR13.8, TR13.10).
- Column-level narrowing of `scp_report_versions` (limitations text; readable
  by `authenticated`, not sensitive).
- The platform-wide default-privilege leftover on every other pre-20260916
  table (§8).
- The bridge now receives the whole employer document into the server process
  and narrows it in code; a narrower bridge-specific projection would be a
  second contract, which "no parallel report logic" rules out.
