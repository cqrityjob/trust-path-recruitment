# Jobs MVP v1 — H1 Implementation Report

**Scope:** Database, security, and maintenance foundation only. No UI is
wired in this phase. All existing feature flags remain unchanged.

## Summary of what was implemented

1. **`jobs` table — additive columns**
   - Salary: `salary_min`, `salary_max`, `salary_currency`, `salary_period`
     (with range, currency, and period CHECK constraints).
   - CIG mapping: `required_skill_ids uuid[]`, `preferred_skill_ids uuid[]`,
     `seniority`, `education_requirements`, `work_environment`,
     `leadership_responsibility`.
   - Mapping provenance: `source_type`, `mapping_reviewed_by`,
     `mapping_reviewed_at`, plus reserved `confidence_level`,
     `inference_method`, `model_version`.

2. **`jobs_validate_before_write` trigger (C1 + M2)**
   - Now allows `application_method = 'internal'`.
   - Requires `expires_at` on every published job, capped at 90 days after
     `published_at` (JobPosting `validThrough`).
   - Employer transition guard (bypassed by platform admins only):
     - INSERT: status must be `draft`.
     - UPDATE: `employer_id` and `published_at` are immutable.
     - Allowed transitions: `draft→pending_review`, `rejected→pending_review`,
       `published→archived`.
     - Employers cannot set `status='published'` directly.
     - Employers may only close (`published→archived`) a published job; no
       other columns may change in the same UPDATE — every content, meta,
       CIG, application, and salary field is diff-checked.
     - Non-editable states (`pending_review`, `expired`, `archived`)
       reject employer UPDATEs entirely.

3. **`jobs` employer-scoped RLS (additive)**
   - `jobs_employer_select_own`, `jobs_employer_insert_draft`,
     `jobs_employer_update_editable` — all require an active
     `employer_memberships` row **and** `employers.status='active'`.
   - Existing public/admin policies retained.

4. **`job_applications` — new table (C2)**
   - Columns per spec: `job_id`, `employer_id`, `applicant_user_id`,
     `status ∈ {submitted, viewed, withdrawn}`, `phone`, `cover_note`
     (≤1000 chars), CV metadata (`cv_storage_path`, `cv_original_filename`,
     `cv_mime_type` ∈ {PDF, DOCX}, `cv_size_bytes` ≤ 5 MB),
     `consent_given_at`, `withdrawn_at`, `employer_note`.
   - Unique `(job_id, applicant_user_id)`; indexes for applicant timeline
     and employer/job/status queries.
   - Trigger `job_applications_stamp_employer_id` copies `employer_id`
     from the parent `jobs` row on INSERT — clients cannot forge it.
     Trigger function is SECURITY DEFINER, EXECUTE revoked from
     PUBLIC/anon/authenticated, granted only to `service_role`.
   - RLS: applicant SELECT/INSERT own; employer members SELECT (active
     employer only); platform admin SELECT/UPDATE. **No UPDATE policy for
     `authenticated`** — all state changes route through server functions.

5. **`job_analytics_events` — new table (M4)**
   - Narrow event log; only `service_role` can INSERT/DELETE; only
     platform admins can SELECT. `anon`/`authenticated` have no access.

6. **`job_audit_events.action` extended**
   - Adds `changes_requested`, `resubmitted`, `closed` alongside existing
     actions.

7. **CV storage bucket `job-application-cvs`** (H5)
   - Created as a **private** bucket via the storage tool.
   - No `authenticated`/`anon` policies on `storage.objects` for this
     bucket — direct client access is denied by default. All access flows
     through `getApplicationCvSignedUrl`, which authorises the caller and
     returns a 5-minute signed URL.

8. **Scheduled maintenance functions** (M2, H3, M4)
   - `sweep_expired_jobs()` — flips `published → expired` when
     `expires_at <= now()`, writes audit rows.
   - `sweep_application_retention()` — hard-deletes application rows and
     returns their CV paths for storage cleanup 12 months after their
     parent job was archived/expired, or 12 months after withdrawal.
   - `sweep_analytics_retention()` — de-identifies analytics events after
     90 days and purges them after 24 months.
   - All three are SECURITY DEFINER, EXECUTE granted **only** to
     `service_role`. Not yet scheduled — see “Deviations / risks” below.

9. **Server functions**
   - `src/lib/job-intelligence/applications.functions.ts`:
     - `withdrawMyApplication` — applicant-only.
     - `updateApplicationAsEmployer` — active employer member; `viewed`
       transition and/or employer note.
     - `getApplicationCvSignedUrl` — 5-minute signed URL; applicant or
       active employer member of the job’s employer.
   - All use `requireSupabaseAuth`, verify authorisation server-side, and
     lazy-import `supabaseAdmin` inside the handler.

## Every modified file

- **Database migrations** (via `supabase--migration`):
  - Jobs MVP v1 H1 additive schema, trigger, RLS, and maintenance
    functions.
  - Revoke EXECUTE on `job_applications_stamp_employer_id` from
    PUBLIC/anon/authenticated.
- **Storage:** created private bucket `job-application-cvs`.
- **New file:** `src/lib/job-intelligence/applications.functions.ts`.
- **New file:** `docs/job-intelligence/phase-h1-report.md`.

## Security changes

- New employer-scoped RLS policies on `jobs`, gated by both active
  membership and active employer.
- Publication path locked to platform admins via the trigger.
- `job_applications` state changes only via server functions; direct
  authenticated UPDATE has no policy.
- CV bucket is private and unreachable without a signed URL issued by
  an authorised server function.
- Analytics events invisible to regular users; admin-only reads.

### Linter delta

Baseline before H1: 6 findings (RLS-no-policy on `audit_logs`, plus 5
sanctioned SECURITY DEFINER helpers documented in `@security-memory`).
After H1: still 6 findings — no net new findings introduced.

## Deviations / assumptions

- **`pg_cron` is not installed** on this project. The three sweep
  functions are implemented and executable by `service_role`, but not
  scheduled. The scheduler choice is deferred to the platform team.
- **Application storage RLS is deny-by-default** on `storage.objects`
  for the CV bucket (no policies added). This satisfies “no direct
  client access” without exposing a policy surface to tune.

## Verification

- `bunx tsgo --noEmit` — PASS.
- `bun run cie:check` — PASS (11/11 personas).
- `bun run kg:check` — OK.
- `supabase--linter` — 6 pre-existing findings, no new ones.

H1 IMPLEMENTATION COMPLETE — READY FOR OWNER QA