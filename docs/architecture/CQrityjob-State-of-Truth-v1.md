# CQrityjob State of Truth v1.0

**The technical source of truth.** Product definition lives in
[Employer Product Source of Truth v1.1](../employer/employer-product-source-of-truth-v1.md);
this document records what is *actually true of the systems*.

**Version:** v1.0 — Phase 0 closeout · **Updated:** 18 August 2026
**Repair branch:** `fix/canonical-baseline-repair` (from `origin/main` @ `7ae642a`)

---

## 0. Canonical identity — LOCKED

| | |
|---|---|
| **Lovable project** | `9ec625ef-34a1-4b4b-8cbb-712cae168579` |
| **Canonical hosted Supabase** | **`zrahptwsnjcdyzfywbeh`** |
| Ledger rows | **100** (97 → 98 C2 → 99 Phase B → 100 C1, all 2026-08-19) |
| `cd_sessions` / `cd_report_snapshots` / `jobs` | **40 / 22 / 15** |

### Formally invalidated

**Project `mlvzmiutmyyqeuvjglco` is NOT CQrityjob production and is excluded from
every production conclusion in this document.** The earlier analysis built on it
reported a 172-row ledger. That analysis, and all five claims below, are
**superseded and must not be repeated or built upon**:

1. ~~Production has 172 migration ledger rows~~ → production has **97**
2. ~~All nine canonical migrations are registered canonically~~ → production registered closed-test governance under the Lovable-generated UUID version
3. ~~Passport Phase 11 is missing~~ → **Phase 11 IS applied**
4. ~~`20260818090000` is `scp_closed_test_governance`~~ → it is **Passport Phase 10**
5. ~~Security-gate findings C and D are already closed~~ → **all four exposures are OPEN**

> ### Verification boundary
>
> - **[VERIFIED]** — reproduced in this session against the repository or an empty PostgreSQL database.
> - **[OWNER-ASSERTED]** — stated in the locked Phase 0 brief. Hosted production was **not reachable** in this session, so these are not independently re-confirmed here; each is re-checked by PHASE 0 of the runbook before any action depends on it.
>
> No hosted database was read or written at any point.

---

## 1. Migration ledger and identity

| Fact | Value | Tag |
|---|---|---|
| Hosted ledger rows | **100** | **[VERIFIED]** — read directly via Lovable MCP |
| Repository files, `origin/main` @ `7ae642a` | 184 | **[VERIFIED]** |
| Repository files, after repair | **176** active + 1 parked | **[VERIFIED]** |
| Duplicate numeric versions after repair | **0** | **[VERIFIED]** |
| Clean replay from empty database | **PASSES** — 30 suites, 1,535 assertions | **[VERIFIED]** |

### Canonical replay identity vs hosted ledger identity

Two different things. The repository now records both, in
`supabase/migrations-policy.json` under `hostedLedgerOverrides`.

| Content | Canonical replay identity (filename) | Hosted ledger identity | Tag |
|---|---|---|---|
| Security Passport Phase 10 | `20260818090000_sp_phase10_self_review_and_decision_events.sql` | **`20260818090000`** | **[OWNER-ASSERTED]** |
| SCP closed-test governance | `20260818162445_scp_closed_test_governance.sql` | **`20260818162445`** — applied through Lovable under its generated version | **[OWNER-ASSERTED]** |
| `20260818090001` | — | **does not exist** | **[OWNER-ASSERTED]** |

**The Phase 0C rename of Passport Phase 10 to `20260818090001` was wrong and is
backed out.** The repository's only version collision is resolved instead by
giving closed-test governance the version production actually recorded, so both
files carry their true hosted identity and neither makes a false claim about how
production ran. Replay order is unaffected: nothing between `20260818090000` and
`20260818162445` depends on closed-test governance. **[VERIFIED]**

### The Lovable-edited migration fact

Lovable commits generated migrations directly to `main` under UUID filenames with
generic commit messages, and applies them to hosted production under those
generated versions. **[VERIFIED for the repository; OWNER-ASSERTED for hosted]**

- Its generator **strips SQL comments** — compare with comments stripped, or every pair looks different. **[VERIFIED]**
- Eleven re-issues existed on `main`; ten were SQL-identical to a canonical file, **one was not**. **[VERIFIED]**
- Two landed *during* the Phase 0C analysis. Any ledger snapshot ages quickly. **[VERIFIED]**

The one real delta — three `GRANT`s on `scp_followup_prompts` the canonical
migration never issues — is preserved in
`20260822090000_scp_followup_prompts_explicit_grants.sql`. **[VERIFIED]**

---

## 2. Dangerous-replay inventory

| Version | File | Disposition | Mechanism |
|---|---|---|---|
| `20260730110000` | `career_discovery_v3_1_completion` | **Never replay** — would restore the broken global ranking guard, can strip `security_invoker` from the stored-report view, and creates a candidate-data exposure | Stays in the active path (linear replay needs it); SHA-256 content-pinned; `manualExecution: forbidden` |
| `20260720180000` | `h4_1_assessment_blueprint_engine_phase1` | **Parked** — 26 tables, 33 functions the product does not use | Moved to `supabase/archive/parked-migrations/`; the CLI cannot reach it |
| `20260813090000` / `20260814054617` | fixture pair | **Retained duplicate** — both already recorded hosted | Recorded as an approved duplicate |

Other hazards the guard and runbook exist to prevent: obsolete
`scp_employer_assign` overloads, safety-critical routing regressions,
legal/human-review flag resets, Passport trust-field regressions, anchor-response
duplication, old job-publication guard regressions. Enforced by
`scripts/migration-safety-check.ts`, which runs in CI **and** inside
`scripts/db-test.sh` before it creates a database. **[VERIFIED]**

### Blueprint parking uncovered a false assumption

`public.assessment_run_reports` is **live product data** whose only
`CREATE TABLE` anywhere in the repository sat inside the Blueprint migration.
Rescued into `20260720180001_assessment_run_reports_canonical_home.sql`.
`assessment_run_answers` has no references and stays parked. **[VERIFIED]**

---

## 3. Security gate — ALL FOUR EXPOSURES CLOSED IN PRODUCTION (2026-08-19)

| # | Exposure | Production | Repository |
|---|---|---|---|
| A | `FOR ALL` author policies on `scp_attempts`, `scp_candidate_responses`, `scp_competency_evidence`, `scp_human_reviews` | **OPEN** **[OWNER-ASSERTED]** | Closed — `FOR SELECT`; writes via `SECURITY DEFINER`. SG2.1–SG2.10 **[VERIFIED]** |
| B | `assessment_assignments` employer INSERT/UPDATE policies use `NULL::text[]` | **OPEN** **[OWNER-ASSERTED]** | Closed — owner/admin via `has_employer_role`. SG1.1–SG1.7 **[VERIFIED]** |
| C | `scp_compute_maturity(uuid,uuid,text,timestamptz)` executable by `authenticated` | **OPEN** **[OWNER-ASSERTED]** | Closed — revoked from `anon`, `authenticated`, `service_role`, `PUBLIC`. SG4.1–SG4.6 **[VERIFIED]** |
| D | `assessment_assignments.scp_open` absent, duplicate-open protection inactive | **OPEN** **[OWNER-ASSERTED]** | Closed — trigger-owned flag + partial unique index. SG5.1–SG5.17 **[VERIFIED]** |

**PHASE B is the highest-priority production repair.**
`20260821090000_scp_pilot_security_gate.sql` is prepared, locally green at 46
assertions, with rollback SQL written in advance.

---

## 4. Security Passport

| Fact | State | Tag |
|---|---|---|
| Phase 10 hosted version | **`20260818090000`** | **[OWNER-ASSERTED]** |
| Phase 10 suite | 54 assertions passing | **[VERIFIED]** |
| Phase 11 | **APPLIED in production** | **[OWNER-ASSERTED]** |
| Phase 11 suite | 50 assertions passing | **[VERIFIED]** |
| Passport ↔ SCP boundary | no FK from `sp_*` into `scp_*` or `cd_*` | **[VERIFIED]** |
| Uploaded evidence | private bucket; verifier read only while a review is open; never in a disclosure | **[VERIFIED]** |

---

## 5. Career Discovery

| Fact | Value | Tag |
|---|---|---|
| Session structure | **2 context + 22 scored + 4 adaptive = 28** | **[VERIFIED]** — `MVP_QUESTION_COUNT = 28`, asserted at import |
| Active content / scoring / pattern version | `v3.1-draft-3` | **[VERIFIED]** |
| Option matrix version | `v3.1-draft-2` — unchanged in draft-3, deliberately | **[VERIFIED]** |
| `lifecycle_status` | `active` | **[VERIFIED]** |
| Who may persist a run | platform admins and named `cd_internal_testers` only | **[VERIFIED]** |
| Scoring / calibration | **unchanged by Phase 0** | **[VERIFIED]** |

### Calibration data — now closed

| Path | Before | After |
|---|---|---|
| `cd_option_loadings` — `authenticated` SELECT | true | **false** |
| `cd_profession_profiles` — `authenticated` SELECT | true | **false** |
| `cd_profession_profiles_current` — `authenticated` SELECT | true | **false** |
| `cd_profession_bands_for_matching(text[])` | — | **the only application path**: `SECURITY DEFINER`, `search_path` pinned, 7 columns, current batch only, named professions only |

Proven by 21 assertions: candidate path works, ordinary authenticated cannot
dump, `anon` reaches nothing, service_role calibration path intact, stored
reports still reproducible. **[VERIFIED]**

---

## 6. Hosted grant divergence

Proven class of risk: Lovable-created tables can hold hosted privileges a clean
replay does not reproduce (`scp_followup_prompts`). Canonical audit: **zero
tables with RLS disabled while granted**; `anon` holds only three intentional,
RLS-constrained privileges; one OVERBROAD-BUT-RLS-CONTAINED case. Full matrix and
method in [phase-0-grant-surface-audit.md](../technical/phase-0-grant-surface-audit.md).
Hosted comparison is PHASE 0 query 0.7. **[VERIFIED locally; hosted UNKNOWN]**

---

## 7. MCP

`/mcp` served the authored question bank, dimension model, profession target
profiles and the matching engine **anonymously**. Now closed unless
`CQRITYJOB_MCP_ENABLED=true`, with an optional server-side bearer token, and it
returns 404 rather than 403. The generator plugin is removed from
`vite.config.ts`, and `scripts/mcp-exposure-check.ts` fails CI if the plugin or
its banner returns. **[VERIFIED]**

---

## 8. Consent

`consent_records` exists, is fully formed, and **has no writer anywhere in the
application**. `cd_sessions.consent` likewise. There is **no consent control in
the Career Discovery experience to persist** — a missing interaction, not a
persistence bug. No record was fabricated.

**Current configured processing basis for Career Discovery: none is represented
in the system — subject to final GDPR/legal review before external pilot.**

Full pack: [career-discovery-consent-gdpr-owner-pack.md](../technical/career-discovery-consent-gdpr-owner-pack.md). **[VERIFIED]**

---

## 9. Production work awaiting owner execution approval

| Phase | Action | Status |
|---|---|---|
| **0** | Preflight: confirm ref, ledger 97, identities, four exposures, fingerprints, restore point | **mandatory first** |
| **A** | Ledger-only reconciliation for proven applied-but-unrecorded migrations | procedure ready; per-entry list requires the accepted class map |
| **B** | `scp_pilot_security_gate` — **highest priority** | prepared, 46 assertions green, rollback written |
| **B2** | Grant hardening | only if the hosted grant diff proves it |
| **C** | Schema and trust corrections, one file at a time | 11 candidates, each verify-before-include |
| **D** | Post-repair verification and isolation smoke tests | defined |

Runbook: [phase-0-production-repair-runbook.md](../technical/phase-0-production-repair-runbook.md).
**No step uses `supabase db push`.**

---

## 10. Product positions recorded elsewhere

Development/workforce-first pilot · recruitment excluded from the first pilot ·
evidence-over-time · one assessment is not established competence · Väktare only
for the first pilot · no percentages or readiness scores · conservative
Assessment → Passport boundary · human decision final. All in the
[Employer Product Source of Truth v1.1](../employer/employer-product-source-of-truth-v1.md).

---

## 11. Production repair log

### C2 — applied 2026-08-19 **[VERIFIED]**

| | |
|---|---|
| Canonical file | `20260820130000_scp_report_attempt_scoped_evidence.sql` |
| Hosted version | **`20260819064230`** |
| Hosted name | **`b11ca5ba-298d-4d5e-b27e-b90d96390a18`** |
| Mechanism | Lovable `supabase--migration` (tracked) |
| Ledger | **97 → 98** |
| SQL equivalence | comment-stripped diff against the canonical file is empty apart from a trailing newline |
| Generated file on `main` | `20260819064230_b11ca5ba-…sql` — remove before merging the repair branch |
| Rollback used | **NO** |

Objects created: `scp_report_snapshots.evidence_scope_version`, `scp_attempt_maturity`,
`scp_attempt_evidence_state`. `scp_release_attempt_report` replaced — it no longer
contains `e.subject_id = _a.subject_id`, so cumulative cross-attempt evidence can
no longer reach a single-attempt report.

Unchanged and verified: 2 report snapshots (both still `evidence_scope_version IS
NULL`, so neither was rewritten) · 4 evidence rows, 4/4 still resolving to their
originating attempt · `cd_sessions` 40 · `cd_report_snapshots` 22 · `jobs` 15 ·
`scp_compute_maturity` intact · `anon` cannot execute either new function.

**The Lovable mechanism cannot record canonical versions.** Every future
production migration therefore adds a row to `appliedThroughLovable` in
`supabase/migrations-policy.json`, which is the canonical ↔ hosted registry and
the reason no canonical file is ever executed twice.

### Still open

Phase B (`20260821090000_scp_pilot_security_gate`) — all four exposures remain
OPEN. C1 (`20260820120000_scp_employer_report_decisions`) — absent. Phase A —
recommended **skip**.

### Phase B — applied 2026-08-19 **[VERIFIED]**

| | |
|---|---|
| Canonical file | `20260821090000_scp_pilot_security_gate.sql` |
| Hosted version | **`20260819065241`** |
| Hosted name | **`c75dc2bf-317c-41af-b63a-1a6cd678f32a`** |
| Ledger | **98 → 99** |
| Self-verifying `DO` block | passed |
| Rollback used | **NO** |

**All four exposures closed, verified independently:**

| | Before | After |
|---|---|---|
| **A** `FOR ALL` author policies | 4 | **0** — all seven policies on those tables are now `SELECT` |
| **B** `NULL::text[]` assignment policies | 2 | **0** — 2 policies now name `owner`/`admin` |
| **C** `authenticated` EXECUTE on the four derivation functions | all true | **all false** |
| **D** `scp_open` column / index / backfill | absent | column ✅, `scp_assignments_one_open_per_subject_idx` ✅, **backfill = 1** |

Backfill is exactly right: 1 assignment open, matching the 1 in-progress attempt;
0 assignments wrongly open.

Column-level grant is precise: `authenticated` may update `status` and
`cancelled_at`, and may **not** update `scp_open` or `employer_id`.

Lifecycle objects present: 3 new triggers on `assessment_assignments`
(`_one_open`, `_scp_open_set`, `_scp_terminal_sync`), 1 on `scp_attempts`
(`scp_attempts_clear_assignment_open`), 4 functions, **none executable by
`authenticated`**. `SCP_ASSIGNMENT_ALREADY_OPEN` is present in the guard.

**C2 survived Phase B**, which was the specific risk: `scp_attempt_maturity` and
`scp_attempt_evidence_state` still exist (their EXECUTE grant was revoked, which
is intended), and `scp_release_attempt_report` is still `SECURITY DEFINER` and
still calls them. `scp_employer_assign` remains a single `SECURITY DEFINER`
overload, callable by `authenticated`.

Unchanged: assignments 6 · attempts 2 (1 released, 1 in_progress) · responses 7 ·
human reviews 1 · evidence 4 · report snapshots 2 · cd_sessions 40 ·
cd_report_snapshots 22 · jobs 15 · applications 1 · passport profiles 2.

### Phase B — product acceptance, 2026-08-19 **[VERIFIED]**

Run against production through the real RPC (`scp_employer_assign`) and the real
RLS policies, with `auth.uid()` impersonated per test, inside **one transaction
deliberately aborted by a final `RAISE`**. Nothing persisted: the postcheck
confirms every synthetic row rolled back.

| Test | Result | Evidence |
|---|---|---|
| 1 — owner/admin can assign | **SUCCESS** | assignment + attempt created, `governance=development`, `status=invited`, **`scp_open=t`** set by trigger |
| 2 — ordinary member cannot | **DENIED** | `SCP_NOT_AUTHORISED_TO_ASSIGN: assigning requires owner or admin.` |
| 3 — duplicate open refused | **REFUSED** | `SCP_ASSIGNMENT_ALREADY_OPEN` — fired against the genuine pre-existing open assignment, and again against one created in-test |
| 4 — owner cancellation works | **SUCCESS** | `status=cancelled`, `cancelled_at` set, **`scp_open` cleared to `f` automatically** |
| 4b — `scp_open` not client-writable | **BLOCKED** | `permission denied for table assessment_assignments` |

**Programme substitution, stated openly.** The brief named
`sg-operational-baseline`. That programme is `draft/design` and the only grant in
production is `purpose='development'`, which covers fixtures rather than
unvalidated real content, so `scp_employer_assign` refuses it with
`SCP_NO_GOVERNANCE_BASIS`. That refusal is the closed-test governance gate
working correctly and is **unrelated to Phase B** — assigning it would require an
owner-issued `closed_test` grant that does not exist. The tests therefore ran
against `fixture-delivery-e2e` (`published/pilot`), which has a real governance
basis and exercises the identical Phase B code paths.

`fixture-learning-e2e` was tried first and refused with
`SCP_ATTEMPT_MODE_MISMATCH` — a learning form cannot be served as an assessment
attempt. Also correct, also unrelated to Phase B.

**Post-test integrity:** assignments 6 · memberships 4 (0 with role `member`) ·
attempts 2 (1 released, 1 in_progress) · responses 7 · evidence 4 · reviews 1 ·
snapshots 2 · cd_sessions 40 · cd_report_snapshots 22 · jobs 15 · applications 1 ·
passport profiles 2 · ledger 99. Assignment `661030e9` is still
`invited / scp_open=true`. A/B/C/D remain closed; C2 functions intact and still
wired into `scp_release_attempt_report`.

### C1 — applied 2026-08-19 **[VERIFIED]**

| | |
|---|---|
| Canonical file | `20260820120000_scp_employer_report_decisions.sql` |
| Hosted version | **`20260819071312`** |
| Hosted name | **`e1402c2b-e0c6-496a-a178-efb208d07a64`** |
| Ledger | **99 → 100** |
| Rollback used | **NO** |

Created: `scp_employer_report_decisions` (0 rows) · indexes `_attempt_idx` and
`_supersedes_once` (plus pkey) · RLS enabled with exactly one policy,
`scp_employer_decisions_member_read` (SELECT, authenticated) · trigger
`scp_employer_decisions_append_only` on **UPDATE and DELETE** · functions
`scp_guard_decision_append_only`, `scp_record_employer_decision`,
`scp_employer_decisions`. `anon` cannot record; `authenticated` can.

**There is deliberately no INSERT, UPDATE or DELETE policy.** Every write goes
through `scp_record_employer_decision`, which is where the owner/admin check
lives — a member may read a decision and may not make one.

#### Append-only proven at runtime, then rolled back

| Step | Result |
|---|---|
| Record via the real RPC | **SUCCESS** |
| `UPDATE` the decision | **REFUSED** — `SCP_DECISION_APPEND_ONLY` |
| `DELETE` the decision | **REFUSED** — `SCP_DECISION_APPEND_ONLY` |
| Record a correction that supersedes it | **SUCCESS** |
| Supersede the same decision twice | **REFUSED** — `scp_employer_report_decisions_supersedes_once` |
| History | 2 rows, exactly 1 current |

The UPDATE and DELETE were attempted **as the table owner**, who bypasses RLS —
so the refusal comes from the trigger, not from a policy. That is the structural
guarantee: an employer's recorded decision about a person cannot be quietly
rewritten by anyone, including infrastructure roles.

Both decision rows were discarded by the transaction abort: the table is back to
**0 rows**, and the report-snapshot fingerprint is unchanged
(`c4a1336ccc441f5bd9e4415774cb6dd0`).

#### Phase 0 production repair — complete

| Step | Canonical | Hosted version | Ledger |
|---|---|---|---|
| C2 | `20260820130000_scp_report_attempt_scoped_evidence` | `20260819064230` | 97 → 98 |
| Phase B | `20260821090000_scp_pilot_security_gate` | `20260819065241` | 98 → 99 |
| C1 | `20260820120000_scp_employer_report_decisions` | `20260819071312` | 99 → 100 |

Three generated duplicate files now sit on `main` and must be removed before the
repair branch merges. Phase A remains **recommended skip**.
