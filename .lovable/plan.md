# Phase A — Final Scope (Revised for Approval)

Corrections from the approved review are applied verbatim below. Scope is unchanged: foundation, no user-visible UI, no feature-flag flip, CIE/CIG/assessment untouched.

## A.1 Schema — public vs. admin-only split

To avoid any risk of leaking internal metadata through anon reads, employer and job records are split into a public row and an admin-only sibling row. Only the public rows carry `GRANT SELECT TO anon`; sibling rows are readable only by admins/service_role.

### A.1.1 `public.job_import_sources` (unchanged from prior revision)

Reference table, admin-managed. `SELECT` to authenticated only; no anon grant. Kinds: `manual`, `employer`, `feed` (feed unused in v1).

### A.1.2 Employers — split model

**`public.employers` (public)**

| column | notes |
|---|---|
| `id uuid pk` | |
| `slug text not null unique` | ASCII-folded kebab-case |
| `name text not null` | |
| `logo_url text` | |
| `website text` | |
| `country text` | ISO 3166-1 alpha-2 |
| `description_sv text`, `description_en text` | employer-approved copy only |
| `created_at`, `updated_at timestamptz` | |

No `verified`, no `verification_notes`, no `created_by`, no `updated_by`, no admin flags on the public table.

**`public.employer_admin_meta` (admin-only)**

| column | notes |
|---|---|
| `employer_id uuid pk references employers(id) on delete cascade` | 1:1 |
| `verified boolean not null default false` | never rendered in v1 |
| `verification_notes text` | |
| `created_by uuid references auth.users on delete set null` | |
| `updated_by uuid references auth.users on delete set null` | |
| `created_at`, `updated_at timestamptz` | |

`SELECT/INSERT/UPDATE/DELETE` on `employer_admin_meta` restricted to `has_role(auth.uid(),'admin')` and `service_role`. No anon or authenticated grants.

### A.1.3 Jobs — split model

**`public.jobs` (public-facing row)** — same field set as previously proposed, minus admin-only metadata:

- Identity: `id`, `slug`, `short_id`, `source_id → job_import_sources`, `source_job_id`, `source_url`, `canonical_url`.
- `employer_id → employers(id)`.
- Classification: `profession_slug text`, `family_id text`, `related_profession_slugs text[]`, `sector`, `employer_type`.
- Presentation: `title_sv`, `title_en`, `description_sv`, `description_en`, `responsibilities jsonb`, `requirements jsonb`, `benefits jsonb`.
- Work context: `location_text`, `country`, `region`, `city`, `workplace_type`, `employment_type`, `experience_level`, `language_requirements text[]`, `travel_required`, `shift_work`, `night_work`.
- Formal/regulated: `regulated`, `formal_requirement_ids text[]`, `security_vetting_mentioned`, `driving_licence_required`.
- Application: `application_method text check (application_method in ('external','email','internal','unavailable'))`, `application_url`, `application_email`.
- Lifecycle: `status text check (status in ('draft','pending_review','published','expired','rejected','archived'))`, `published_at`, `deadline_at`, `expires_at`.
- Dedupe: `content_hash text`.
- Timestamps: `created_at`, `updated_at`.

Removed from the public row: `moderation_notes`, `reviewed_by`, `reviewed_at`, `created_by`, `updated_by`, `imported_at`. Those move to `job_admin_meta`.

**`public.job_admin_meta` (admin-only)**

| column | notes |
|---|---|
| `job_id uuid pk references jobs(id) on delete cascade` | 1:1 |
| `moderation_notes text` | |
| `reviewed_by uuid references auth.users on delete set null` | |
| `reviewed_at timestamptz` | |
| `created_by uuid references auth.users on delete set null` | |
| `updated_by uuid references auth.users on delete set null` | |
| `imported_at timestamptz` | |
| `duplicate_of uuid references jobs(id) on delete set null` | |
| `created_at`, `updated_at timestamptz` | |

Admin-only RLS; no anon/authenticated grants.

### A.1.4 `public.saved_jobs`

- `user_id uuid not null references auth.users on delete cascade`
- `job_id uuid not null references jobs(id) on delete cascade`
- `saved_at timestamptz not null default now()`
- PK `(user_id, job_id)`; index `(user_id, saved_at desc)`.

RLS gated by `auth.uid() = user_id` for all four ops. No anon grant.

### A.1.5 `public.job_audit_events` — audit-safe

Must survive job deletion. FK to `jobs` is deliberately weak.

| column | notes |
|---|---|
| `id uuid pk` | |
| `job_id uuid` | **no FK reference** (kept as a plain uuid so hard-deleting a job cannot cascade or block audit). |
| `job_slug_snapshot text` | denormalised at write time for later lookup readability. |
| `actor_id uuid references auth.users on delete set null` | |
| `action text not null` | `created`, `updated`, `submitted`, `published`, `rejected`, `expired`, `archived`, `duplicate_marked`, `deleted` |
| `before jsonb`, `after jsonb` | |
| `created_at timestamptz not null default now()` | |

Policy for `jobs`: hard deletes are discouraged. The admin flow uses `status='archived'`; a `deleted` audit action is only produced when a genuine hard-delete happens (e.g., legal takedown) and the row's key facts are captured in `after` before the delete.

Index: `(job_id, created_at desc)`.

RLS: SELECT admin-only; no INSERT/UPDATE/DELETE from anon or authenticated (writes happen from admin server functions with `service_role` or from a trigger). No anon grant.

### A.1.6 CIG taxonomy protection at the database

`family_id` and `profession_slug` on `public.jobs` are validated by a database trigger, not by foreign key. Reasons documented in `docs/job-intelligence/schema.md`:

- **Family**: the canonical set lives in code (`src/lib/career-center/profession-families.ts`) — 13 fixed IDs — not in a DB reference table. The trigger validates `family_id` against a hard-coded whitelist inside a SQL function `public.assert_cig_family_id(text)` whose body enumerates the 13 IDs. Changing this list requires a migration; that is intentional and matches the frozen taxonomy rule.
- **Profession slug**: the CIG source of truth for professions lives in `cig_professions` (Supabase) and, for the code path, in `src/lib/career-center/professions/*`. A FK to `cig_professions.slug` is used **when technically possible** — i.e. if `cig_professions.slug` is unique. A companion trigger `public.assert_cig_profession_slug(text)` also enforces existence on write (defence-in-depth), and permits `null` for jobs not yet classified.
- Validation trigger `public.jobs_cig_taxonomy_check` runs `BEFORE INSERT OR UPDATE OF family_id, profession_slug ON public.jobs` and raises if either value is set to a non-canonical entry.
- If, at migration time, we discover `cig_professions.slug` is not unique, the FK is dropped from the migration and the trigger alone enforces the check. That decision is captured in the Phase A report; no schema drift is silently tolerated.

### A.1.7 Active-job predicate (single source of truth)

An immutable-style SQL function determines when a job is publicly visible. The same predicate is reused for `employers` visibility so an employer cannot be visible to anon while none of their jobs are.

```
public.job_is_active(status text, published_at timestamptz, deadline_at timestamptz, expires_at timestamptz) RETURNS boolean
  -> status = 'published'
     AND published_at IS NOT NULL AND published_at <= now()
     AND (deadline_at IS NULL OR deadline_at > now())
     AND (expires_at  IS NULL OR expires_at  > now())
```

Marked `STABLE` (not `IMMUTABLE`) because `now()` is time-varying.

### A.1.8 Published-job application-path validation

Enforced by a `BEFORE INSERT OR UPDATE` trigger on `public.jobs` (per Cloud rules that time/data-dependent rules use triggers, not CHECK):

- If the new `status = 'published'`:
  - `application_method` must be one of `external`, `email`, `internal`.
  - `application_method = 'unavailable'` is rejected.
  - `application_method = 'external'` requires non-empty `application_url`.
  - `application_method = 'email'` requires non-empty `application_email` matching a basic email pattern.
  - `application_method = 'internal'` requires an internal handler flag — not present in v1 — so `internal` is rejected on publish in v1 and unlocked in a later phase.
  - `published_at` must be non-null and `<= now()`.
  - `deadline_at`, if set, must be `>= published_at`.
- For non-published statuses, none of the above apply — drafts can be incomplete.

## A.2 RLS policies (revised)

Enable RLS on all five new tables. GRANTs and policies together in the same migration.

- **`job_import_sources`**: `GRANT SELECT TO authenticated`. Admin all via `has_role(auth.uid(),'admin')`. No anon.
- **`employers`** (public row):
  - Anon+authenticated SELECT: `EXISTS (SELECT 1 FROM public.jobs j WHERE j.employer_id = employers.id AND public.job_is_active(j.status, j.published_at, j.deadline_at, j.expires_at))`.
  - Admin all.
  - No `TO anon` write grants.
- **`employer_admin_meta`**: admin-only SELECT/INSERT/UPDATE/DELETE via `has_role`. `GRANT ALL TO service_role`. No anon, no authenticated.
- **`jobs`**: three SELECT policies:
  1. Anon+authenticated: `public.job_is_active(status, published_at, deadline_at, expires_at) = true`.
  2. Admin: all rows via `has_role(auth.uid(),'admin')`.
  3. (No general author-read policy in v1 — writes are admin-only, so drafts are always admin-owned. This removes the need to expose `created_by` on the public row.)
  Writes: admin-only via `has_role`. `GRANT SELECT TO anon, authenticated`; `GRANT INSERT/UPDATE/DELETE TO authenticated` (gated to admins by policy); `GRANT ALL TO service_role`.
- **`job_admin_meta`**: admin-only, same shape as `employer_admin_meta`. No anon/authenticated grants.
- **`saved_jobs`**: `auth.uid() = user_id` for SELECT/INSERT/DELETE. `GRANT SELECT, INSERT, DELETE TO authenticated`. `GRANT ALL TO service_role`. No anon.
- **`job_audit_events`**: SELECT admin-only. No write policies (writes via `service_role` from server functions and from an internal AFTER-trigger on `public.jobs` running as `security definer`). `GRANT SELECT TO authenticated` (admin-gated by policy). `GRANT ALL TO service_role`. No anon.

Result: no admin-only column reaches an anon read path, either directly or through a join.

## A.3 Migration & rollback

- **Schema migration** (`<ts>_phase_a_job_intelligence_foundation.sql`): reference table → `employers` → `employer_admin_meta` → `jobs` → `job_admin_meta` → `saved_jobs` → `job_audit_events` → `job_is_active` function → CIG taxonomy validators → published-path trigger → `updated_at` triggers → GRANTs → RLS enable → policies. **No seed rows.** No fictional employers or demo jobs in this migration.
- **Seed migration/script** (dev/test only): a separate file `supabase/seeds/phase_a_dev_seed.sql` is authored but is NOT part of the production migration pipeline. It is applied manually in development via `psql` against a dev database when a developer wants demo data. The Phase A report documents the exact command and warns against running it in production. Every seeded row carries `[TEST DATA]` in `title_sv`/`title_en`/`description_*`; employer names carry a `(demo)` suffix. This satisfies "seed process must not run automatically in production".
- **Rollback**: revert migration drops in reverse order — `job_audit_events → saved_jobs → job_admin_meta → jobs → employer_admin_meta → employers → job_import_sources`, then the trigger functions and `job_is_active`. Documented in `docs/job-intelligence/rollback.md` with the exact SQL and the note that no existing table/policy is modified, so rollback is safe at any point in Phase A.

## A.4 Feature flag

`VITE_JOBS_ENABLED` is a **release-control flag only**, not a security boundary. It gates rendering of Phase C+ public UI, nothing else. Database RLS and server-side authorisation remain effective independent of the flag: with the flag off, RLS still hides drafts and admin metadata; with the flag on, RLS is still the last line of defence. This is stated explicitly in `docs/job-intelligence/README.md` and `docs/job-intelligence/schema.md`.

Helper: `src/lib/job-intelligence/feature-flag.ts` exposes `jobsEnabled()` reading `import.meta.env.VITE_JOBS_ENABLED === 'true'`. Not consumed by Phase A.

## A.5 Seed-data approach

- Production: **no seed rows in the schema migration**.
- Development: `supabase/seeds/phase_a_dev_seed.sql` — 5 fictional employers (all suffixed `(demo)`), 8 fictional jobs (all prefixed `[TEST DATA]`), mapped to real published CIG family IDs and, where possible, to real published `cig_professions.slug`. Applied by an engineer with a documented command, never automatically. The seed file itself carries a header comment: `-- DEVELOPMENT SEED ONLY. DO NOT APPLY IN PRODUCTION.`.
- CI: any test that needs data creates rows programmatically inside the test, not through the seed file.

## A.6 Security & GDPR impact (updated)

- Anon reads see: `job_import_sources` — never; `employers` — only when linked to an active job (predicate applied in the policy); `jobs` — only when `job_is_active()` is true; all admin-only sibling tables — never; `saved_jobs`, `job_audit_events` — never.
- User deletion:
  - `saved_jobs.user_id`: `ON DELETE CASCADE`.
  - `employer_admin_meta.created_by/updated_by`, `job_admin_meta.created_by/updated_by/reviewed_by`, `job_audit_events.actor_id`: `ON DELETE SET NULL`. Audit history is preserved with a null actor.
- Audit preservation: `job_audit_events.job_id` is not a FK, and hard deletes on `jobs` are actively discouraged in favour of `status='archived'`. If a hard delete is ever performed, its `deleted` event is written to `job_audit_events` first, capturing `before`/`after`.
- Verified/moderation metadata: never exposed via the public read path because it lives in separate admin-only tables. Column-level hiding is not relied on.
- Feature flag: does not gate RLS. Documented as such.
- Linter: run `supabase--linter` after the migration is approved; fix any new finding before sign-off.

## A.7 Acceptance criteria (revised)

1. Migration applies cleanly on dev; linter reports no new critical findings.
2. All new tables/functions/triggers exist per spec; RLS enabled; GRANTs applied.
3. Anon SELECT on `jobs` returns only rows where `job_is_active()` is true; expiring by either `deadline_at` or `expires_at` hides the row.
4. Anon SELECT on `employers` returns only employers with at least one active job.
5. Anon SELECT on `employer_admin_meta`, `job_admin_meta`, `job_audit_events`, `saved_jobs`, `job_import_sources` all return 0 rows / permission-denied.
6. Non-admin authenticated user cannot read `job_admin_meta`, `employer_admin_meta`, `job_audit_events`, or other users' `saved_jobs`.
7. Admin can read all rows across every table.
8. Attempting to publish a job with `application_method='unavailable'` is rejected by the trigger.
9. Attempting to publish `external` without `application_url`, or `email` without `application_email`, is rejected.
10. Attempting to set `family_id` or `profession_slug` to a non-canonical value is rejected.
11. Deleting a user cascades their `saved_jobs`; nulls `created_by/updated_by/reviewed_by/actor_id` in admin/audit tables; leaves audit rows intact.
12. Hard-deleting a `jobs` row (via admin/service_role) does not delete its `job_audit_events` history; `job_admin_meta` is cascaded away with the job (1:1), consistent with the archive-preferred policy.
13. Production schema migration contains **zero** seed rows for employers/jobs; only `job_import_sources` reference rows.
14. Dev seed file exists, is not in the migration pipeline, is prefixed with a "do not run in production" header, and all its rows are clearly marked.
15. `VITE_JOBS_ENABLED=false` in dev; `/jobs` unchanged; documentation states the flag is release-control only.
16. `bun cie:check` remains green. CIE, assessment, CIG code paths untouched.
17. Type-check clean; Playwright smoke on `/`, `/security-career-assessment`, `/career-center`, `/jobs` unchanged.
18. `docs/job-intelligence/rollback.md`, `schema.md`, `README.md` present and current.
19. No existing table, policy, function, or GRANT modified.

## A.8 Test plan (revised)

Executed against the dev database after migration approval.

- **Schema shape**: assert every column, type, default, index, trigger, and function exists as specified via `information_schema` and `pg_proc` queries.
- **Active-job predicate** — table-driven tests with published_at/deadline_at/expires_at permutations: past-published + future-deadline + null-expires = visible; past-expires = hidden; future-published = hidden; deadline in the past = hidden.
- **Application-path validation**: 6 negative cases (unavailable-on-publish, external-without-url, email-without-@, internal-on-publish, published_at null, deadline before published_at) each rejected with a clear error; 3 positive cases accepted.
- **CIG taxonomy**: assert non-canonical `family_id` rejected; non-existent `profession_slug` rejected; null `profession_slug` accepted with a valid `family_id`.
- **RLS matrix**: exhaustive anon/authenticated-non-admin/admin × (jobs/employers/admin_meta tables/audit/saved_jobs) SELECT tests; write attempts denied where policy forbids.
- **Cross-user saved_jobs**: user A writes; user B SELECT returns 0; user B DELETE denied.
- **User deletion** (in a disposable dev user): delete `auth.users` row → `saved_jobs` rows gone; `created_by`/`updated_by`/`reviewed_by`/`actor_id` set to null in the admin/audit tables; audit rows still present.
- **Job hard-delete** (admin path): audit rows for that `job_id` remain readable to admin; `job_admin_meta` for that job removed.
- **Rollback drill**: apply revert → confirm all Phase A objects removed → re-apply forward → identical state.
- **Regression**: `bun cie:check`, `bun kg-check` (or equivalent), full Playwright smoke.
- **Linter**: `supabase--linter` reports no new critical/warning findings attributable to Phase A.
- **Production-safety check**: `rg "INSERT INTO public.(employers|jobs) " supabase/migrations/` on the Phase A migration returns zero matches.

## A.9 Files expected to change (revised)

New files:

- `supabase/migrations/<ts>_phase_a_job_intelligence_foundation.sql` — schema, functions, triggers, RLS, GRANTs, and **only** `job_import_sources` reference-row inserts. No employers, no jobs.
- `supabase/seeds/phase_a_dev_seed.sql` — dev/test only, header warning, 5 fictional employers + 8 fictional jobs, all clearly marked. Not part of the migration pipeline.
- `src/lib/job-intelligence/feature-flag.ts` — release-control helper (unused in Phase A).
- `src/lib/job-intelligence/types.ts` — TS shapes only, no logic; splits `Job` (public) from `JobAdminMeta`, and `Employer` from `EmployerAdminMeta`.
- `docs/job-intelligence/README.md` — index; states the flag is release-control only.
- `docs/job-intelligence/schema.md` — schema, RLS matrix, active-job predicate, CIG taxonomy protection, admin/public split rationale, slug format.
- `docs/job-intelligence/rollback.md` — rollback SQL and drill notes.
- `docs/job-intelligence/phase-a-report.md` — filled in at Phase A completion.

Auto-regenerated:

- `src/integrations/supabase/types.ts` — regenerated after the migration is approved and applied; not hand-edited.

Modified:

- `.env.example` — add `VITE_JOBS_ENABLED=false` with a comment noting it is release-control only.

Not modified in Phase A: `src/routes/jobs.tsx`, all Career Center and assessment routes, `src/lib/career-intelligence-engine/*`, `src/lib/career-center/*`, `src/lib/knowledge-graph/*`, `src/routes/__root.tsx`, `src/routes/sitemap[.]xml.ts`, `src/i18n/dictionaries.ts`.

## A.10 Non-goals (unchanged)

No admin UI, no public Jobs UI change, no JSON-LD/sitemap, no analytics, no relevance engine, no employer self-serve writes, no badges rendered, no feature-flag flip, no CIE/assessment/CIG modification.

## Stop point

Stop after this revised Phase A. On approval, implementation proceeds exactly as scoped above; Phase B does not begin until the Phase A report is signed off.
