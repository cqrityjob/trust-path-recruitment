# Phase 0 — hosted grant surface audit

**Method:** migrations-only replay into an empty PostgreSQL 17 database
(`schema_only`, 162 tables, the 24 sanctioned known-failure migrations behaving
exactly as allowlisted). Audited with `has_table_privilege` / `has_function_privilege`.

> **Scope limit, stated plainly.** This is the audit of what the **canonical
> migration set produces**. Hosted production was not reachable in this session,
> so the hosted matrix could not be read. The hosted comparison is PHASE 0 query
> 0.7 in the [runbook](./phase-0-production-repair-runbook.md); the divergence
> below is the *known* one, not a complete hosted diff.

## Why this audit exists

`20260818194409` (Lovable-generated) carried three statements the canonical
migration never issues:

```sql
GRANT SELECT                 ON public.scp_followup_prompts TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.scp_followup_prompts TO authenticated;
GRANT ALL                    ON public.scp_followup_prompts TO service_role;
```

That is proof, not conjecture, that **Lovable-created tables can carry hosted
privileges a clean replay does not reproduce.** The class of risk is real; its
extent in production is unmeasured from here.

## Classification

| Class | Meaning | Count |
|---|---|---|
| **EXPECTED** | Privilege matches a policy that constrains it, and the application needs it | all rows below except where noted |
| **OVERBROAD BUT RLS-CONTAINED** | Wider table privilege than needed; RLS correctly prevents access | 1 (`scp_followup_prompts` write grants) |
| **OVERBROAD AND EXPLOITABLE** | Privilege reachable without an RLS constraint | **0** |
| **UNKNOWN** | Not determinable without hosted access | the hosted-only delta |

### The exploitable class is empty

```sql
SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity
   AND (has_table_privilege('authenticated',c.oid,'SELECT')
     OR has_table_privilege('anon',c.oid,'SELECT'));
-- 0 rows
```

**No CQrityjob table has RLS disabled while granted to `anon` or
`authenticated`.** Every write privilege below sits on an RLS-enabled table with
at least one matching write policy.

## `anon` surface — complete

| Table | Privileges | RLS | Verdict |
|---|---|---|---|
| `cd_definition_versions` | SELECT | ✅ | **EXPECTED** — the public availability check reads whether a version is administrable |
| `cd_test_feedback` | INSERT | ✅ | **EXPECTED** — anonymous feedback capture, insert-only |
| `cd_v31_funnel_events` | INSERT | ✅ | **EXPECTED** — anonymous funnel telemetry, insert-only |

`anon` holds nothing on any `scp_*` or `sp_*` table, and nothing on any
calibration table.

## `authenticated` write surface — sensitive tables

All RLS-enabled with matching write policies. Owner-scoped by policy in every case.

| Table | I/U/D | Verdict |
|---|---|---|
| `cd_sessions`, `cd_evidence`, `cd_career_goals`, `cd_shared_reports` | IUD | EXPECTED — the candidate owns their own run |
| `cd_report_snapshots` | D | EXPECTED — erasure right; snapshots are otherwise immutable |
| `assessment_assignments` | I | EXPECTED — **narrowed to owner/admin by PHASE B**, which is not yet applied in production |
| `job_applications` | I | EXPECTED — a candidate applies |
| `sp_claims`, `sp_evidence`, `sp_experience_periods`, `sp_passport_profiles` | I/IU | EXPECTED — the holder owns their Passport |
| `sp_verification_requests`, `sp_passport_events` | I | EXPECTED — append-only |
| `sp_disclosures` | U | EXPECTED — the holder revokes a share |
| `scp_followup_prompts` | IUD | **OVERBROAD BUT RLS-CONTAINED** — the write policy requires `scp_can_author(auth.uid())`, so an ordinary account gets nothing; but the table privilege is wider than the product needs |

## Calibration boundary — after the Phase 0 closeout

| Check | Result |
|---|---|
| `cd_option_loadings` — `authenticated` SELECT | **false** |
| `cd_profession_profiles` — `authenticated` SELECT | **false** |
| `cd_profession_profiles_current` — `authenticated` SELECT | **false** |
| `cd_profession_bands_for_matching(text[])` — `authenticated` EXECUTE | **true** (the only application path) |
| `scp_followup_prompts` — `anon` SELECT | **false** |

## Recommendation

**No speculative hardening migration is written.** The one canonical overbreadth
(`scp_followup_prompts` IUD) is RLS-contained, and narrowing it would break
authoring through PostgREST for legitimate content authors. The honest action is
PHASE B2 in the runbook: diff the **real hosted matrix** (query 0.7) against this
canonical matrix and harden only the differences.

Writing a migration against a grant matrix nobody has read would be guessing.
