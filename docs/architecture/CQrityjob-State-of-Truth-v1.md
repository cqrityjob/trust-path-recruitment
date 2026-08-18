# CQrityjob State of Truth v1

**The technical source of truth.** Product definition lives in
[Employer Product Source of Truth](../employer/employer-product-source-of-truth-v1.md);
this document records what is *actually true of the systems*.

**Version:** v1, with the Phase 0C addendum · **Updated:** 18 August 2026
**Repair branch:** `fix/canonical-baseline-repair` (from `origin/main` @ `7ae642a`)

> ### Verification boundary — read first
>
> Statements below are tagged:
>
> - **[VERIFIED]** — reproduced in the Phase 0C session against the repository or an empty PostgreSQL database.
> - **[INHERITED]** — taken from the [Phase 0 report](../technical/phase-0-migration-ledger-reconciliation.md) and **not** re-confirmed. Hosted production was **not reachable** in the Phase 0C session.
> - **[UNKNOWN]** — no evidence available in either.
>
> No hosted production database was read or written during Phase 0C.

---

## 1. Migration ledger

| Fact | Value | Tag |
|---|---|---|
| Hosted ledger count | 172 versions, as of the Phase 0 run | **[INHERITED]** |
| Hosted ledger count *now* | — | **[UNKNOWN]** — no hosted access |
| Repository files, `origin/main` @ `7ae642a` | 184 | **[VERIFIED]** |
| Repository files, after repair | **175** | **[VERIFIED]** |
| Duplicate numeric versions, before | 1 (`20260818090000`) | **[VERIFIED]** |
| Duplicate numeric versions, after | **0** | **[VERIFIED]** |
| Only local-not-hosted migration | `20260818120000_sp_phase11…` | **[INHERITED]** |

### The Lovable-edited migration fact

Lovable commits generated migration files directly to `main`, under UUID
filenames, with generic commit messages ("Changes", "Work in progress", "Made
the requested updates"). **[VERIFIED]**

- Its generator **strips SQL comments**, so a raw hash comparison against the canonical file always shows a difference even when the SQL is identical. Compare with comments stripped. **[VERIFIED]**
- Eleven such re-issues existed on `main`. Ten were SQL-identical to a canonical migration. **One was not.** **[VERIFIED]**
- Two of the eleven (`20260818194409`, `20260818194544`) landed **after** the Phase 0 baseline, during analysis. Any ledger snapshot ages quickly. **[VERIFIED]**

### The one real delta

`20260818194409` carried three `GRANT` statements on `scp_followup_prompts` that
its canonical counterpart `20260820100000` does not issue at all. Preserved in
`20260822090000_scp_followup_prompts_explicit_grants.sql`. **[VERIFIED]**

### Version collision resolution

| File | Repository version | Hosted version |
|---|---|---|
| `scp_closed_test_governance` | `20260818090000` | `20260818090000` **[INHERITED]** |
| `sp_phase10_self_review_and_decision_events` | renamed to **`20260818090001`** | `20260818090001` **[INHERITED]** |

Recorded in `supabase/migrations-policy.json` → `hostedLedgerOverrides`, with the
query that proves it. **[VERIFIED as a repository state]**

---

## 2. Dangerous-to-replay files

| Version | File | Disposition | Mechanism |
|---|---|---|---|
| `20260730110000` | `career_discovery_v3_1_completion` | **Never replay.** Re-running restores the broken global ranking guard, can strip `security_invoker` from the stored-report view, and creates a candidate-data exposure | Stays in the active path (linear replay needs it); SHA-256 content-pinned in policy; `manualExecution: forbidden` |
| `20260720180000` | `h4_1_assessment_blueprint_engine_phase1` | **Parked.** 26 tables, 33 functions the product does not use | Moved to `supabase/archive/parked-migrations/`; the CLI cannot reach it |
| `20260813090000` / `20260814054617` | fixture pair | **Retained duplicate.** Both already recorded hosted | Recorded as an approved duplicate |

Enforced by `scripts/migration-safety-check.ts`, run by CI and by
`scripts/db-test.sh` before it creates a database. **[VERIFIED]**

### Blueprint parking uncovered a false assumption

`public.assessment_run_reports` is a **live product table** whose only
`CREATE TABLE` in the entire repository was inside the Blueprint migration.
Rescued into `20260720180001_assessment_run_reports_canonical_home.sql`.
`assessment_run_answers` was checked the same way and has no references; it stays
parked. **[VERIFIED]**

---

## 3. Clean replay

| State | Result |
|---|---|
| `origin/main` @ `7ae642a`, empty database | **FAILS** — `20260819090000_employer_people_model` (duplicate `ADD CONSTRAINT`) and `20260819100000_scp_governed_assignment` (`found 2` `scp_employer_assign` overloads) **[VERIFIED]** |
| After repair, empty database | **PASSES** — 29 suites, **1,514 assertions** **[VERIFIED]** |

Documented floor at Phase 8.5A was 1,441 assertions across 27 suites; the
repaired baseline is above it on both counts. No test was weakened, skipped or
re-thresholded.

---

## 4. Security Passport

| Fact | State | Tag |
|---|---|---|
| Phase 10 hosted version | `20260818090001`, **not** `20260818090000` | **[INHERITED]** |
| Phase 10 suite | 54 assertions passing | **[VERIFIED]** |
| Phase 11 (`20260818120000`, languages + practical skills) | In repository, **not applied hosted** | **[INHERITED]** |
| Phase 11 suite | 50 assertions passing | **[VERIFIED]** |
| Passport ↔ SCP boundary | No FK from `sp_*` into `scp_*` or `cd_*`; enforced by the separation suite | **[VERIFIED]** |
| Uploaded evidence | Private bucket; verifier read only while a review is open; never in a disclosure | **[VERIFIED]** |

Phase 11 is the single known repository-vs-hosted schema difference. **[INHERITED]**

---

## 5. Career Discovery

| Fact | Value | Tag |
|---|---|---|
| Live instrument | v3.1 | **[VERIFIED]** |
| Session structure | **2 context + 22 scored Career DNA + 4 adaptive = 28** | **[VERIFIED]** |
| Enforcement | `MVP_QUESTION_COUNT = 28`, asserted at import in `v31/personal-layer.ts` | **[VERIFIED]** |
| Definition versions seeded | `2026-scd-v3.0.0`, `2026-scd-v3.1.0` | **[VERIFIED]** |
| v3.1 lifecycle status | `active` since `20260731100000` | **[VERIFIED]** |
| Who may persist a run | Platform admins and named `cd_internal_testers` only | **[VERIFIED]** |
| Scoring | Frozen. Not touched by Phase 0C | **[VERIFIED]** |

> **Correction of record.** Several documents and at least one code comment state
> **26 questions / 20 scored**. That was true of an earlier draft and is now
> wrong. The correct figure is **28 / 22**, and the code asserts it. The stale
> figures survive in `docs/assessment/career-discovery/v31-personal-layer.md` and
> in a comment in `src/lib/career-discovery/v31-public.functions.ts`; the comment
> was deliberately **not** edited in Phase 0C because Career Discovery is frozen
> and a comment change is not worth touching a frozen module for.

### Calibration data exposure

| Table | State | Tag |
|---|---|---|
| `cd_option_loadings` | **Closed** in `20260822091000`. No application reader — the engine scores from the TypeScript matrix | **[VERIFIED]** |
| `cd_profession_profiles` | **Still exposed to any authenticated account.** Cannot be closed without changing a frozen CD object: `cd_profession_profiles_current` is `security_invoker`, so revoking the base grant breaks signed-in matching | **[VERIFIED]** |

Two prepared, unapplied options are held in the
[Phase 0C report](../technical/phase-0c-canonical-baseline-repair.md) §8.2.

---

## 6. Security Competency Platform

| Fact | State | Tag |
|---|---|---|
| `scp_pilot_security_gate` (`20260821090000`) | In repository; 46 assertions passing | **[VERIFIED]** |
| — exposure A: `FOR ALL` author policies | Closed in repository | **[VERIFIED]** / hosted **[UNKNOWN]** |
| — exposure B: assignment INSERT/UPDATE role | Closed in repository | **[VERIFIED]** / hosted **[UNKNOWN]** |
| — exposure C: `scp_compute_maturity` EXECUTE | Closed in repository | **[VERIFIED]**; hosted reported already closed **[INHERITED]** |
| — exposure D: `scp_open` + duplicate-open index | Closed in repository | **[VERIFIED]**; hosted index reported present **[INHERITED]** |
| Governed assignment | Exactly one `scp_employer_assign`, 8-argument, `SECURITY DEFINER` | **[VERIFIED]**; hosted matches **[INHERITED]** |
| `selection_support` purpose | Inactive, no published version → recruitment **fails closed** | **[VERIFIED]** |
| `reassessment` purpose | Inactive → reassessment **fails closed** | **[VERIFIED]** |
| `competence_development` purpose | Active and published | **[VERIFIED]** |
| Väktare programme content | 18 items, draft/design, 12 safety-critical; closed-test grant only | **[VERIFIED]** |

**Because C and D are reported already present hosted, `20260821090000` may
already be applied.** PHASE B of the runbook checks before acting.

---

## 7. Trust findings

| # | Finding | State |
|---|---|---|
| 1 | `/mcp` served the question bank, dimension model, profession target profiles and the matching engine anonymously | **Fixed in repository.** Closed unless `CQRITYJOB_MCP_ENABLED=true`; optional bearer token; returns 404 when closed **[VERIFIED]** |
| 2 | CD calibration matrices readable by any authenticated account | **Half fixed** — see §5 |
| 3 | Career Discovery consent not persisted | **Not implemented.** There is no consent control in the CD experience to persist. Building one requires authoring consent text and a lawful basis — an owner + legal decision **[VERIFIED]** |

---

## 8. Production actions awaiting owner approval

| Phase | Action | Precondition |
|---|---|---|
| **0** | Read hosted ledger, collisions, security-gate objects, function/policy fingerprints | none — READ ONLY, and mandatory first |
| **A** | Ledger-only repair for any version applied but unrecorded | Phase 0 proves such versions exist. Expected: **empty set** |
| **B** | `20260821090000_scp_pilot_security_gate` | Phase 0 proves it is not already applied |
| **C** | `public_assessment_v2` → `jobs_archive_lifecycle` → `employer_report_decisions` → `report_attempt_scoped_evidence` → `sp_phase11` → legacy retirement → v3.0 contract normalisation | each proven genuinely missing; applied one file at a time |

**No step uses `supabase db push`, `db reset`, or marks a migration applied whose
SQL has not run.**

---

## 9. Product positions this document does not restate

Development/workforce-first pilot · recruitment excluded from the first pilot ·
evidence-over-time model · no percentages or readiness scores · conservative
Assessment → Passport boundary · human decision final. All are recorded in the
[Employer Product Source of Truth v1.1](../employer/employer-product-source-of-truth-v1.md).
