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

**Genuine security concern: no. Do not change it.** The view is a deliberate read model: `20260727150000` (LOW-4) removed every client read policy from `scp_scoring_versions` so no candidate or employer can read scoring weights, and the view exposes only the lineage columns (no weights) on the caller's behalf. A previous linter-driven flip to `security_invoker = true` (`20260731053218`) made lineage unreadable for exactly the two audiences the read model serves and was reverted in `20260801100000`, which also set `security_barrier = true` and documented the reason. `scripts/cd-outstanding-reviews-check.ts` and its negative controls guard against repeating the flip. The linter flags definer views generically; this one is reviewed. **Action: none; record the advisor item as accepted with this reference.**

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
- [ ] Advisor ERROR recorded as accepted (§3)
