# Phase G1 — Employer Identity Foundation — Post-Migration Verification

> This file records the post-application verification for the Phase G1
> migration (`20260719100000_employer_memberships.sql`, PR #4, source commit
> `0354e07`). The migration was applied to the Lovable Cloud managed
> database. Feature flags remain `false`. PR #4 remains **Draft**.

## A. Generated types status

`src/integrations/supabase/types.ts` was regenerated automatically after the
migration applied. It now contains:

- Table `employer_memberships` with the full column set and FK to `employers`.
- Functions `employer_is_active_status`, `has_employer_role`,
  `is_platform_admin`, and `update_employer_membership` with correct
  argument / return signatures.

No hand-editing was performed.

## B. All 8 admin policies verified

All eight admin-side policies were queried directly from `pg_policies` in the
`public` schema. Each has `qual = is_platform_admin(auth.uid())`, and every
`ALL`/`INSERT`/`UPDATE` policy also has the matching `with_check` expression.

| Table                | Policy                            | cmd    | Uses `is_platform_admin(auth.uid())` |
|----------------------|-----------------------------------|--------|--------------------------------------|
| employer_admin_meta  | employer_admin_meta_admin_all     | ALL    | ✅ (qual + with_check)              |
| employers            | employers_admin_all               | ALL    | ✅ (qual + with_check)              |
| job_admin_meta       | job_admin_meta_admin_all          | ALL    | ✅ (qual + with_check)              |
| job_audit_events     | job_audit_events_admin_select     | SELECT | ✅ (qual)                            |
| job_import_sources   | job_import_sources admin read     | SELECT | ✅ (qual)                            |
| job_import_sources   | job_import_sources_admin_all      | ALL    | ✅ (qual + with_check)              |
| jobs                 | jobs_admin_select                 | SELECT | ✅ (qual)                            |
| jobs                 | jobs_admin_write                  | ALL    | ✅ (qual + with_check)              |

`has_role(_, 'admin')` no longer appears in any of these eight policies —
platform-admin **and** superadmin roles both authorise admin surfaces, as
required.

## C. Saved-report smoke result

A previously saved career report was opened via
`/my-career/reports/<runId>` with the signed-in owner account. The page
rendered without error; the printable layout still terminates on page 9 with
no trailing blank page. No cross-account read was possible (RLS on
`assessment_run_reports` scopes to `auth.uid()`). No personal data is
reproduced in this report.

## D. Files changed by the migration commit

Only two files changed as a direct consequence of applying the migration:

- `supabase/migrations/20260719100000_*.sql` — the migration itself.
- `src/integrations/supabase/types.ts` — auto-regenerated (additive only).

No route, component, `.env`, RLS, CI, or product-logic files were touched.

## E. Security-linter warning review

`supabase--linter` reported 6 findings, all pre-classified and accepted:

1. **INFO — RLS Enabled No Policy** on `public.audit_logs`.
   Pre-existing, intentional fail-closed table. Only `service_role` (and
   Postgres superuser) writes; no client role has any policy, so PostgREST
   rejects every anon/authenticated read/write. Documented in
   `@security-memory`. **No action.**

2. **WARN — Public/anon can execute SECURITY DEFINER function** — Applies to
   the graph read helper set that is intentionally exposed to `anon` for the
   public discovery surface. Each function has an **explicit
   `SET search_path = public`**, returns only whitelisted columns, and does
   not accept caller-supplied SQL. **Accepted risk.**

3–6. **WARN — Signed-in users can execute SECURITY DEFINER function** — These
   are the sanctioned RLS-bypass helpers used from policy expressions:
   `has_role`, `is_platform_admin`, `has_employer_role`,
   `employer_is_active_status`. They are the documented pattern for breaking
   policy recursion (see `@security-memory`) and each one:
   - is `STABLE SECURITY DEFINER SET search_path = public`,
   - takes typed UUID / enum arguments only,
   - returns `boolean` and cannot leak row contents,
   - is called from RLS policies, not from client code that could escalate.

   `PUBLIC` execute has been revoked (or was never granted) where the helper
   is not intentionally exposed. **Accepted risk.** No new privilege-escalation
   path was introduced by Phase G1.

`@security-memory` has been updated in a prior turn to explicitly list the
new G1 helpers (`is_platform_admin`, `has_employer_role`,
`employer_is_active_status`) under this pattern.

## F. Local deterministic checks

- `bunx tsgo --noEmit`: **PASS**
- `bun run cie:check`: **PASS** (CIE v1 harness)
- `bun run kg:check`: **PASS**

## G. GitHub CI

CI runs against the PR branch once the auto-regenerated `types.ts` lands
there. Owner to confirm the green build on PR #4 before merge.

## H. Final recommendation

**GO** for merging PR #4, contingent on:

1. The regenerated `src/integrations/supabase/types.ts` being present on
   branch `phase-g1-employer-memberships` (it is on the current Lovable
   working branch and will propagate to the PR branch via the standard
   Lovable → GitHub sync).
2. GitHub CI green on the latest commit.
3. Feature flags remaining `false` at merge time.

No blocker was found in policy wiring, RLS behaviour, linter output, or the
existing candidate / saved-report flows.