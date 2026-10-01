# Security Passport Network — live statistics

Real, aggregate, automatically updated growth figures for the public site.
Nothing is seeded, inflated or hand-maintained.

> **Delivered in two steps (schema-first-release rule).** This change is the database half: the migration, its rollback, its database tests and the guard updates. The homepage and Passport-page UI (component, copy, guard, negative controls, screenshots) follows in a second PR, opened only after this migration is merged and applied on the hosted project and recorded `applied` in `supabase/release-state.json`. Sections below describe the whole feature.

## Definitions (audited against production, 2026-10-01)

| Term | Rule |
|---|---|
| **Security Passport created** | One holder with `sp_passport_profiles.onboarding_state = 'completed'` **and** `declared_accurate_at IS NOT NULL`, who is not a staff account (no `user_roles` row) and not listed in `sp_statistics_exclusions`. |
| **Credentials represented** | `sp_claims` rows with `lifecycle_state = 'active'` held by a counted holder. Draft, expired, revoked, superseded, disputed and withdrawn are not counted. |
| **Market** | The country the holder *stated* they work in (`jurisdiction_code`), only where `work_location_confirmed_at IS NOT NULL`. A market is named only when at least `min_group_size` (default and floor: 5) counted holders confirmed it; smaller ones are "Other markets", returned as a boolean. |

Why not "a profile row exists": `ensureMyPassport()` inserts the row when anyone first opens `/passport`, so a row means "looked", not "created". The row is keyed by `holder_user_id` (primary key) and `completed` is a one-way door, so page loads, shares, edits, credential additions/corrections, sessions, duplicates and create/delete/recreate cannot raise the count. Deleting an account removes its Passport from the count.

## Production audit (counts only, read-only)

4 profile rows · 2 completed · **both completed Passports belong to staff accounts** · 3 rows with a holder-confirmed country · 0 emails matching the documented test conventions. Real adoption excluding staff is therefore **0 today**, which is why publication ships **hidden**.

## Architecture

`sp_passport_profiles` / `sp_claims` (private, RLS unchanged) → `sp_network_stats()` (`SECURITY DEFINER`, executable by `anon`) → one `jsonb` document → `useQuery` (10-minute stale time) → homepage band / Passport page band.

* `{"display":"hidden"}` and **no number** until the owner publishes; a missing policy row also reads hidden.
* Response keys, exactly: `display, passports, credentials, markets (ISO codes, alphabetical), otherMarkets (boolean)`. No per-market count, id, name, email, timestamp or row.
* No table gains a policy or a client grant. The policy and exclusion tables are revoked from `anon`/`authenticated`.
* No realtime, no background job, no extra infrastructure. The aggregate is computed per call (bounded, indexed tables); if volume ever warrants it, a periodic snapshot can replace the live read without changing the contract.

## Owner controls

```sql
-- publish on the Passport page only / everywhere / hide again (platform admin session)
SELECT public.sp_set_network_stats_display('passport_page', 'reason');
SELECT public.sp_set_network_stats_display('public', 'reason');
SELECT public.sp_set_network_stats_display('hidden', 'reason');

-- keep a test / UAT / demo account out of the figures (SQL editor)
INSERT INTO public.sp_statistics_exclusions (holder_user_id, reason) VALUES ('<uuid>', 'UAT account');
-- no application role holds DELETE on any sp_* table (Phase 8 rule); an exclusion is lifted by the database owner in the SQL editor.
```

## Placement

* **Homepage:** directly after the Security Passport entry band (`for-dig`), before the jobs. Visitor learns what the Passport is, then sees the network. It is a conditional band, not a seventh section, and draws nothing until `display = 'public'`.
* **Passport page:** directly after the hero, from `passport_page` onward — the natural home for the number from day one if the owner wants it before the homepage.

## Rejected

* **"Markets represented" as a number:** an exact count reveals how many sub-threshold markets exist; counting only disclosed markets would understate. The sentence "Growing across …" conveys it without either problem.
* Per-market counts, ranking, maps, IP/geolocation, credential jurisdiction as holder location.

## Tests

`bun run passport-network-stats:db` (28 behavioural checks against a throwaway Postgres: counting rule, repeated reads, credential edits, staff/test exclusion, threshold, anon cannot enumerate, RLS unchanged). The 101-assertion UI/contract guard, its 14 negative controls and the screenshots ship with the UI PR.

## Existing guards extended (reviewed exception)

`sp_network_stats()` is the one `sp_*` function `anon` may execute. The anon-executable SECURITY DEFINER allowlist (`security_hardening_test.sql` S3.1, `scp_interview_method_library_tenant_read_test.sql` ML10.8 and its guard script) now lists six, and the four "anon executes no `sp_*` function" assertions (phase 3 6.2, phase 5 7.2, phase 7 9.2, trust-source 8.4) name that single exception. The migration is classified `pending` in `supabase/release-state.json`.
