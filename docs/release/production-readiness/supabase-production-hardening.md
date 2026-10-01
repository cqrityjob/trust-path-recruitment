# Production readiness — Supabase hardening checklist

Hosted project `wrygicdfxwjnrugduxnt` (eu-central-1, PostgreSQL 17.6). Audited read-only on 2026-09-28. **Nothing here was changed on the project.** Items are owner/dashboard actions unless marked "code".

## 1. State verified today

| Area | Verified | Result |
|---|---|---|
| RLS | every one of the 338 public tables has RLS enabled; a simulated anon, candidate and two employers see only catalogue rows and their own data; escalation writes refused | PASS (details in the UAT report §12) |
| Migrations | all 324 repository migrations present in `supabase_migrations.schema_migrations`; nothing hosted that is not in the repo | PASS — keep `release-parity:gate` green before every deploy; the four new migrations (#322–#325) are `pending` until applied |
| Client privileges | `TRUNCATE`/`REFERENCES`/`TRIGGER` revoked from anon/authenticated on all tables (`20261218090000`) | PASS |
| RPC surface | 392 callable functions, 337 SECURITY DEFINER; every user-defined one pins `search_path`; no definer function returns another party's data; 4 anon-callable definers are guarded/telemetry | PASS with 20 low-risk boolean/id oracles (§4) |
| Storage | 3 private buckets; policies keyed on `auth.uid()` folder; employer CV read only via own application row | PASS |
| Edge functions | `passport-share` v3 (deployed 2026-09-28 15:40 from merged code); `verify_jwt=false` by design | needs `PASSPORT_SHARE_ENTRY_PUBLISHED=1` after the site publishes `/p` |
| Auth | default mailer; confirmation ON; HIBP off | see `auth-and-email.md` |

## 2. Owner checklist for the production configuration / upgrade

1. **Backups.** Confirm daily backups are on and the retention matches the plan; enable Point-in-Time Recovery if the plan allows (recommended before real candidate data). Record where the restore procedure is and test a restore into a branch/new project once.
2. **Compute / plan.** If the project is upgraded (Pro, compute add-on): schedule during low use; a restart drops connections (the app reconnects). No schema change needed.
3. **Production/staging separation.** Today one project serves preview, published and local development. Options: (a) a Supabase branch or second project for staging with the same migrations applied through the tracked mechanism; (b) keep one project and rely on Hostinger staging pointing at production data (acceptable only during the overlap, with test data cleaned per `production-data-hygiene.md`). Owner decision; do not migrate PostgreSQL away from Supabase.
4. **Auth settings** — the nine items in `auth-and-email.md` §3 (SMTP, Site URL, Redirect URLs, templates, confirm-email, rate limits, HIBP, Google OAuth, domains).
5. **Secrets.** Service-role key stays server-only (Hostinger env); rotate any key that ever appeared in a chat, screenshot or repository. Edge-function secrets: `PUBLIC_SITE_URL`, `PASSPORT_SHARE_ENTRY_PUBLISHED`. Revoke the share whose token appeared in the owner's screenshot (Passport → "Dina delningar").
6. **Rate limits / abuse.** Auth rate limits (§4 above); PostgREST has none — the Passport public throttle (`sp_public_access_throttle`) covers share opens; consider Supabase's network restrictions (allowed CIDRs for the database port) once Hostinger's egress IPs are known.
7. **Logs.** Keep Auth, Postgres and edge-function logs at the plan's retention; the app itself logs to stdout (Hostinger). Nothing ships logs to a third party.
8. **Security advisor** — 1 ERROR, 4 WARN classes today; see §3.
9. **Performance advisor** — not reviewed in this pass; run it after the data cleanup.
10. **Recovery drill.** Document: how to restore a backup, how to roll back a migration (every migration since `20261204090000` ships a `supabase/rollback/*` artifact that refuses unsafe states), and how to point the app at a restored project (only `SUPABASE_URL`/keys change).

## 3. The two advisor items investigated

### `scp_scoring_version_lineage` is a SECURITY DEFINER view (advisor ERROR)

**Status: reviewed — accepted risk — no action required.** Owner decision 2026-10-01: the current design is kept. No migration, code, grant or database change follows from this advisor item.

| | |
|---|---|
| Advisor lint | `security_definer_view` (0010), level ERROR |
| Entity | `public.scp_scoring_version_lineage` |
| Reloptions | `security_invoker=false`, `security_barrier=true` (set in `20260801100000`) |
| Grants | `SELECT` to `authenticated` and `service_role`; `anon` and `PUBLIC` hold nothing on the view or its base table |
| Decision | Reviewed / accepted risk / no action required |
| Decision record | this section; rationale in `supabase/migrations/20260801100000_scp_restore_scoring_lineage_readability.sql` and in the view's `COMMENT` |

**Why security definer is used.** `20260727150000_scp_a4_scoring_visibility.sql` (review finding LOW-4) removed every client read policy from `scp_scoring_versions` and `scp_role_weight_profile_weights`, so only Security Competency authoring roles and platform admins can read the scoring model. Candidate and employer reports must still be able to state which scoring version produced a result and its validation status (spec 9.3, acceptance criterion 18). The view is the only authorised path to that information: it runs with the owner's rights, reads the restricted base table on the caller's behalf and returns only the columns listed in its body. Because the projection is an explicit column list, a column later added to `scp_scoring_versions` does not appear in the view.

**The nine exposed columns** (exactly these, no others):

1. `id`
2. `slug`
3. `version_number`
4. `content_status`
5. `validation_status`
6. `published_at`
7. `retired_at`
8. `core_summary_is_indicative`: presentation policy, whether a report may show the summary index alone
9. `norm_comparison_permitted`: presentation policy, whether a report may compare with a norm

**What is not exposed.** The scoring weights `sjt_weight` and `biq_weight`, the `content_hash`, the per-competency role weights (`scp_role_weight_profile_weights`) and the per-option scoring keys (`scp_item_options`). These stay readable by authoring roles and admins only, through RLS on the base tables.

**Why `security_invoker` is not used.** It was tried and caused an outage. The linter sweep `20260731053218_ebac47bc-fefb-457c-add0-71b0d6e6d768.sql` set `security_invoker = true`. The view then ran as the caller and hit the LOW-4 restriction, so candidates and employers read zero rows and reports could no longer state their scoring version. No data leaked, but the feature stopped working. `20260801100000_scp_restore_scoring_lineage_readability.sql` reverted only that change (the search_path pinning and anon EXECUTE revokes from the same sweep were kept), added `security_barrier = true`, restated the grants and documented the reason in the view's comment. The linter's other remedy, a read policy on `scp_scoring_versions`, is worse: RLS is row-level, so the policy would expose the weights on every readable row.

**Tests and negative controls that protect the design.**

| Guard | What it asserts |
|---|---|
| `20260801100000` postflight blocks 3a–3c | The migration fails if the view exposes `sjt_weight`/`biq_weight`/`content_hash` (`SCP_LINEAGE_LEAKS_SCORING_INTERNALS`), if a permissive read policy returns on the scoring tables (`SCP_SCORING_TABLES_UNRESTRICTED`), or if the view is still invoker (`SCP_LINEAGE_STILL_INVOKER`) |
| `supabase/tests/scp_a1_domain_model_test.sql` GROUP 20 | Candidate and employer read zero scoring versions, weights and option keys but can read lineage rows with real id, slug and validation status. Authors can read scoring versions. anon has no grant. The view exposes no weights or hash and is **exactly** the nine columns above |
| `supabase/tests/scp_a1_domain_model_test.sql` GROUP 20b | Pins the mechanism: the object is a view and runs with `security_invoker=false`; anon gets `permission denied` on the view and on the base tables |
| `supabase/tests/cd_outstanding_reviews_operator_only_test.sql` CDO4 | `scp_scoring_version_lineage` still carries `security_invoker=false` (contrast case to `cd_outstanding_reviews`, which is deliberately invoker) |
| `scripts/cd-outstanding-reviews-check.ts` (`bun run cd-outstanding-reviews:check`) | Static migration-history guard: fails with `CDO-GUARD-LINEAGE-FLIPPED` if the view ends as `security_invoker = true`, and with `CDO-GUARD-LINEAGE-MISSING` if it disappears |
| `scripts/negative-controls/cd-outstanding-reviews-controls.ts` `CDO-NC-LINEAGE-FLIPPED` (`bun run negative-controls:cd-outstanding-reviews`, part of `negative-controls:all`) | Injects the generic linter remediation (`security_invoker = true`) and proves the guard above catches it |
| `supabase/tests/scp_a_rollback_test.sql` | The LOW-4 lineage view exists before rollback |

**Reopening.** Do not flip this view to `security_invoker` in response to the advisor; the guards above will fail. Reopen only if a CTO or security review finds a concrete, exploitable issue (for example a column in the view that should not be public to authenticated users). In that case the alternative to evaluate as a separate change is: move the projection into a `SECURITY DEFINER` function with a pinned `search_path` in a schema not exposed through the API, and keep the public view as `security_invoker = true` over that function. That change must update every guard in the table above in the same PR.

### `unaccent` installed in the `public` schema (advisor WARN)

**Genuine security concern: low.** The extension's four C functions live in `public` because `20260719181557` created it there for slug generation (`create_my_employer_company`), and `20260916090000` pinned their `search_path` handling. Moving it to `extensions` means `ALTER EXTENSION unaccent SET SCHEMA extensions` plus a search-path qualification of every caller (`unaccent(...)` → `extensions.unaccent(...)`) and a re-check of the 4 functions in the hardening tests. Not a launch blocker; **schedule as a separate schema PR with its own regression evidence after launch** (category D).

### Also recorded
- 18 tables have RLS enabled with no policy (deny-all through PostgREST): intended for internal/ledger tables (`sp_share_handoffs`, `sp_share_sessions`, `scp_test_grants`, `storage_erasure_queue`, …). No action.
- 20 boolean/id oracle functions callable with any user id (`has_role`, `is_platform_admin`, `has_employer_role`, `scp_iv_case_employer`, `scp_interview_pack_validate`, `cd_v31_validate_session_evidence`, …): they reveal existence/role facts, no personal data. Category D: tighten after launch by refusing `_user_id <> auth.uid()` unless admin, the pattern `sp_market_access` already uses.

## 4. What must be true before owner UAT (from this document)

- [ ] SMTP, Site URL, Redirect URLs set (`auth-and-email.md`)
- [ ] HIBP protection enabled
- [ ] Backups confirmed; PITR decision made
- [ ] The four fix migrations applied through the tracked mechanism, `release-parity:gate` green
- [ ] `passport-share`: `PUBLIC_SITE_URL` set, switch set after `/p` is live
- [x] Advisor ERROR recorded as accepted (§3, owner decision 2026-10-01: reviewed / accepted risk / no action required)
