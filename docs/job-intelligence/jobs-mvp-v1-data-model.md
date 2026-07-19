# Jobs MVP v1 — Data Model

Companion to `jobs-mvp-v1-spec.md`, Part E and the Security Career
Intelligence Integration section. Mirrors the style and depth of the
existing `schema.md` (Phase A). This document does not repeat what
`schema.md` already covers correctly (active-job predicate, slug
format, existing CIG-protection triggers, existing user-deletion
cascades) — it covers what's new or changed for Jobs MVP v1 only.

**Revision note:** this version incorporates the fixes from the
pre-build design review (Critical findings C1/C2, High findings
H1–H5, Medium findings M1/M2/M4/M5, Low findings). Every RLS policy
and trigger extension below is written specifically because the
review found that leaving employer/candidate writes to
UI-or-server-function trust alone was insufficient — the database
itself now enforces the boundaries.

No migration in this document has been applied. All SQL here is
proposed, additive, and subject to the same live `pg_policies`
before/after verification discipline already established in the
Phase G1 rollback drill before it is ever merged.

## Summary table

| Table | Status | Purpose |
|---|---|---|
| `jobs` | **Altered (additive only)** | Gains Career Intelligence, salary, and provenance columns; gains employer-scoped RLS (read own, insert draft, update within an enforced transition guard); gains a trigger extension enforcing exactly which transitions/fields a non-admin actor may touch, and requiring `expires_at` at publish time. |
| `employers`, `employer_admin_meta`, `job_admin_meta`, `job_import_sources`, `saved_jobs` | **Unchanged** | Reused exactly as `schema.md` describes. |
| `job_audit_events` | **Altered (additive only)** | `action` CHECK gains `changes_requested`, `resubmitted`, `closed`. `expired` already exists in the CHECK list (Phase A) — it simply goes from unwritten to written. |
| `job_applications` | **New** | Internal applications only. `status` is `submitted`/`viewed`/`withdrawn` (no `closed` — see H4 below). **No direct `authenticated` UPDATE grant exists on this table at all** — every update goes through one of two service-role-mediated server functions with a fixed column allow-list. |
| `job_analytics_events` | **New** | Narrow, job-scoped event log, with a two-tier retention policy (M4). |
| CV storage bucket | **New (Storage, not a table)** | Private bucket + signed-URL access pattern, gated on active employer status, not just membership (H5). |
| `audit_logs` | **Reused, not altered** | Application status-change and CV file audit events are written here (existing G1 table), not into a new bespoke table. |
| Scheduled maintenance functions | **New** | `sweep_expired_jobs()`, `sweep_application_retention()`, `sweep_analytics_retention()` — see the dedicated section below. Their *scheduling mechanism* is an open technical question, flagged explicitly, not assumed. |
| `job_moderation_events`, `application_status_history`, `job_categories`/`job_skills`/`job_professions`, `job_locations`, employer public profiles (all named in the original 26-part brief) | **Not built** | Unchanged rationale from the prior revision — see the individual sections below. |

---

## `jobs` — additive changes

All new columns are nullable (no backfill required, no existing row
becomes invalid). Column list below is *only the delta* — see
`schema.md` for everything already documented.

| Column | Type | Nullable | Default | Purpose |
|---|---|---|---|---|
| `salary_min` | integer | yes | — | Structured salary floor. |
| `salary_max` | integer | yes | — | Structured salary ceiling. `CHECK (salary_max IS NULL OR salary_min IS NULL OR salary_max >= salary_min)`. |
| `salary_currency` | text | yes | — | `CHECK (salary_currency IS NULL OR salary_currency IN ('SEK','EUR','USD','GBP','NOK','DKK'))`. |
| `salary_period` | text | yes | — | `CHECK (salary_period IS NULL OR salary_period IN ('hour','month','year'))`. |
| `required_skill_ids` | uuid[] | yes | `'{}'` | References `cig_skills.id`, validated in the trigger (not a native array FK). |
| `preferred_skill_ids` | uuid[] | yes | `'{}'` | Same validation approach. |
| `seniority` | text | yes | — | `CHECK (seniority IS NULL OR seniority IN ('entry','mid','senior','lead'))`. |
| `education_requirements` | text | yes | — | Free text, moderation-relevant. `CHECK (char_length(education_requirements) <= 1000)`. |
| `work_environment` | text | yes | — | `CHECK (work_environment IS NULL OR work_environment IN ('critical_infrastructure','public_facing','cash_in_transit','office','industrial','other'))`. |
| `leadership_responsibility` | boolean | yes | `false` | Matches the existing boolean-flag style. |
| `source_type` | text | yes | — | `CHECK (source_type IS NULL OR source_type IN ('employer_entered','moderator_corrected','imported','ai_suggested'))` — Career Intelligence mapping provenance only. |
| `mapping_reviewed_by` | uuid, `REFERENCES auth.users(id) ON DELETE SET NULL` | yes | — | Records human confirmation of an AI-suggested/moderator-corrected mapping. Unpopulated until an AI-suggestion feature ships. |
| `mapping_reviewed_at` | timestamptz | yes | — | Paired with the above. |
| `confidence_level`, `inference_method`, `model_version` | text, text, text | yes | — | Reserved, unpopulated in MVP. |

**Existing column reused, newly wired into UI (no schema change):**
`formal_requirement_ids text[]` (licences/authorisations).

**Existing column, validation tightened at the application layer
only:** `experience_level text` stays unconstrained at the database
level; the employer form offers a controlled selector.

**Existing columns whose meaning changes for MVP v1 (no new columns,
new rules — see the trigger below):** `expires_at` becomes a
**required** field at publish time (was previously optional). This
resolves design-review finding M2 (Schema.org `validThrough` must
always be present on a published job) and is also the anchor for the
automatic-expiry mechanism in H3, below.

### Trigger change 1: `application_method = 'internal'` becomes allowed

Unchanged from the prior revision. Exactly one existing branch of
`jobs_validate_before_write()` is removed:

```sql
-- REMOVED:
-- IF NEW.application_method = 'internal' THEN
--   RAISE EXCEPTION 'application_method=internal is not supported in v1'
--     USING ERRCODE = 'check_violation';
-- END IF;
```

`'unavailable'` stays rejected at publish time. `'external'`/`'email'`
validation stays unchanged. `'email'` is not removed from the CHECK
constraint (backward compatibility only — the employer-facing form
never offers it).

### Trigger change 2 (new): `expires_at` required at publish, bounded maximum period

Added to the existing "published job requires..." block:

```sql
IF NEW.status = 'published' THEN
  -- ...existing published_at / deadline_at / application_method checks, unchanged...

  IF NEW.expires_at IS NULL THEN
    RAISE EXCEPTION 'A published job requires expires_at to be set (JobPosting validThrough)'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.expires_at > NEW.published_at + INTERVAL '90 days' THEN
    RAISE EXCEPTION 'expires_at cannot be more than 90 days after published_at'
      USING ERRCODE = 'check_violation';
  END IF;
END IF;
```

90 days is a proposed default maximum listing period, not a fixed
constant — it is owner-adjustable (a single `INTERVAL` literal in one
trigger) and should be confirmed against what's normal for
security-sector hiring cycles before H1 ships. This closes design-
review finding M2: every published job now has a database-enforced,
non-null, bounded `expires_at`, so `validThrough` can never be missing
from a published job's structured data.

### Trigger change 3 (new): employer self-service transition guard — resolves C1

**This is the direct fix for Critical finding C1.** The prior
revision described an employer write capability in prose (Part L's
access matrix) without ever defining the RLS policy or the guard that
prevents an employer from setting `status='published'` directly,
changing `employer_id`, or editing a published job's content. Both
are now specified together, because RLS alone cannot express
"this specific column may only take this specific new value coming
from this specific transition" — that needs a trigger.

Added as a new block inside `jobs_validate_before_write()`, evaluated
on every `INSERT`/`UPDATE` regardless of which RLS policy let the
write through. **Platform admins are exempt from this entire block** —
`is_platform_admin()` retains its existing unrestricted write path
(`jobs_admin_write`), and this guard would otherwise conflict with
legitimate admin actions (approving, force-editing, or authoring a
job directly).

```sql
IF NOT public.is_platform_admin(auth.uid()) THEN

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' THEN
      RAISE EXCEPTION 'Employers may only create a job with status=draft'
        USING ERRCODE = 'check_violation';
    END IF;

  ELSIF TG_OP = 'UPDATE' THEN

    IF NEW.employer_id IS DISTINCT FROM OLD.employer_id THEN
      RAISE EXCEPTION 'employer_id cannot be changed'
        USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.published_at IS DISTINCT FROM OLD.published_at THEN
      RAISE EXCEPTION 'published_at is a moderation-owned field'
        USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NOT (
        (OLD.status = 'draft'     AND NEW.status = 'pending_review') OR
        (OLD.status = 'rejected'  AND NEW.status = 'pending_review') OR
        (OLD.status = 'published' AND NEW.status = 'archived')
      ) THEN
        RAISE EXCEPTION 'Employers cannot change status from % to %', OLD.status, NEW.status
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;

    IF OLD.status = 'published' AND NEW.status = 'archived' THEN
      -- The ONLY change permitted alongside a published->archived
      -- close is the status change itself. No content column may
      -- change in the same write -- an employer never edits a
      -- published job in place (Part M1: close-and-clone only). The
      -- implementer extends this check to every candidate-facing
      -- content column on the table; a representative subset is
      -- shown here.
      IF NEW.title_sv IS DISTINCT FROM OLD.title_sv
         OR NEW.title_en IS DISTINCT FROM OLD.title_en
         OR NEW.description_sv IS DISTINCT FROM OLD.description_sv
         OR NEW.description_en IS DISTINCT FROM OLD.description_en
         OR NEW.profession_slug IS DISTINCT FROM OLD.profession_slug
         OR NEW.salary_min IS DISTINCT FROM OLD.salary_min
         OR NEW.salary_max IS DISTINCT FROM OLD.salary_max
      THEN
        RAISE EXCEPTION 'A published job cannot be edited in place; close and duplicate it instead'
          USING ERRCODE = 'check_violation';
      END IF;

    ELSIF OLD.status NOT IN ('draft','rejected') THEN
      RAISE EXCEPTION 'Job is not in an employer-editable state'
        USING ERRCODE = 'check_violation';
    END IF;

  END IF;

END IF;
```

**Moderation-owned fields on the sibling table:** `job_admin_meta`
(`moderation_notes`, `reviewed_by`, `reviewed_at`) is a separate
table, already admin-only via `job_admin_meta_admin_all` RLS —
employers have no grant on it at all, so no additional guard is
needed there.

### RLS: employer writes to `jobs` — resolves C1

```sql
-- SELECT: employer members read every job belonging to their own
-- active employer, regardless of status -- needed for the employer
-- job list, which must show draft/pending_review/published/rejected/
-- archived jobs, not just the publicly-active subset.
CREATE POLICY "jobs_employer_select_own" ON public.jobs
  FOR SELECT TO authenticated
  USING (
    public.has_employer_role(auth.uid(), employer_id, NULL)
    AND public.employer_is_active_status(employer_id)
  );

-- INSERT: employer members may only ever create a new job as a draft,
-- for their own active employer. employer_id is not separately
-- re-derived by a trigger here (unlike job_applications, below) since
-- it is client-supplied at creation time by definition -- the
-- WITH CHECK below is the enforcement point, backed by the INSERT
-- branch of the trigger above (status must be 'draft').
CREATE POLICY "jobs_employer_insert_draft" ON public.jobs
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_employer_role(auth.uid(), employer_id, NULL)
    AND public.employer_is_active_status(employer_id)
    AND status = 'draft'
  );

-- UPDATE: employer members may only touch rows currently in draft,
-- rejected, or published state (pending_review is moderation-owned
-- while under review; archived is terminal). RLS decides *which rows*
-- are reachable; the trigger above decides *what changes* are legal
-- to a reachable row -- this policy is not sufficient on its own,
-- and is not meant to be.
CREATE POLICY "jobs_employer_update_editable" ON public.jobs
  FOR UPDATE TO authenticated
  USING (
    public.has_employer_role(auth.uid(), employer_id, NULL)
    AND public.employer_is_active_status(employer_id)
    AND status IN ('draft','rejected','published')
  )
  WITH CHECK (
    public.has_employer_role(auth.uid(), employer_id, NULL)
    AND public.employer_is_active_status(employer_id)
  );

-- No DELETE policy for employers. Jobs are never hard-deleted by an
-- employer -- only moved through the status machine.
```

**Allowed transitions by actor (summary, cross-referenced from the
main spec's Part F):**

| Transition | Employer member (active) | Platform admin |
|---|---|---|
| (new) → `draft` | ✅ own employer only | ✅ any |
| `draft` → `pending_review` | ✅ | ✅ |
| `rejected` → `pending_review` | ✅ | ✅ |
| `pending_review` → `published` | ❌ (trigger-blocked) | ✅ |
| `pending_review` → `draft`/`rejected` | ❌ (trigger-blocked) | ✅ |
| `published` → `archived` (close, content unchanged) | ✅ | ✅ |
| `published` → any other status, or any content edit while `published` | ❌ (trigger-blocked) | ✅ (admin exception only) |
| `employer_id` change, any state | ❌ (trigger-blocked, always) | ✅ (admin exception only) |
| `published_at` change, any state | ❌ (trigger-blocked, always) | ✅ (admin exception only) |

---

## `job_audit_events` — additive change

`action` CHECK gains: `changes_requested`, `resubmitted`, `closed`.
`expired` requires **no CHECK change** — it was already a legal value
from Phase A, simply never written until the H3 automatic-expiry sweep
(below) starts writing it.

```sql
ALTER TABLE public.job_audit_events
  DROP CONSTRAINT job_audit_events_action_check,
  ADD CONSTRAINT job_audit_events_action_check
    CHECK (action IN (
      'created','updated','submitted','published','rejected','expired',
      'archived','duplicate_marked','deleted',
      'changes_requested','resubmitted','closed'
    ));
```

---

## `job_applications` (new)

### Status set — resolves H4

**`status` is `submitted` / `viewed` / `withdrawn` only.** The
previous revision's `closed` value is removed: no document ever
defined who set it, when, or what the candidate would see, and its
most likely naive rendering ("Closed") would have delivered the exact
rejection signal Part G.2 explicitly designs against. An employer's
private assessment of an application (interested, not moving forward,
etc.) is captured **only** as free text in `employer_note` — never as
a structured status, and never candidate-visible. This is a strictly
simpler model than the one it replaces, not a smaller one: it removes
an undefined state rather than resolving it into a new defined one.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | PK |
| `job_id` | uuid | no | — | `REFERENCES jobs(id) ON DELETE CASCADE` |
| `employer_id` | uuid | no | — | `REFERENCES employers(id) ON DELETE CASCADE`. **Never client-supplied** — stamped by a `BEFORE INSERT` trigger from `jobs.employer_id` (below), not merely "set by the server function" as the prior revision assumed. |
| `applicant_user_id` | uuid | no | — | `REFERENCES auth.users(id) ON DELETE CASCADE` |
| `status` | text | no | `'submitted'` | `CHECK (status IN ('submitted','viewed','withdrawn'))` |
| `phone` | text | yes | — | Optional, candidate-entered |
| `cover_note` | text | yes | — | `CHECK (cover_note IS NULL OR char_length(cover_note) <= 1000)` |
| `cv_storage_path` | text | yes | — | Object path in the private CV bucket. Randomised (below). |
| `cv_original_filename` | text | yes | — | Display-only, sanitised on both write and read (Low finding, below) — never used to derive the storage path. |
| `cv_mime_type` | text | yes | — | `CHECK (cv_mime_type IS NULL OR cv_mime_type IN ('application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document'))` |
| `cv_size_bytes` | integer | yes | — | `CHECK (cv_size_bytes IS NULL OR cv_size_bytes <= 5242880)` (5 MB) |
| `consent_given_at` | timestamptz | no | — | Set once, at submission |
| `withdrawn_at` | timestamptz | yes | — | Set only by `withdraw_my_application()` (below) |
| `employer_note` | text | yes | — | Private, employer-only, never candidate-visible. Settable only by `update_application_as_employer()` (below). |
| `created_at` | timestamptz | no | `now()` | |
| `updated_at` | timestamptz | no | `now()` | Touched only by the two server functions below, or by `sweep_application_retention()`. |

Constraints: `UNIQUE (job_id, applicant_user_id)`. Indexes:
`(applicant_user_id, created_at DESC)`, `(employer_id, job_id, status)`.

### `employer_id` stamping trigger

```sql
CREATE OR REPLACE FUNCTION public.job_applications_stamp_employer_id()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  SELECT employer_id INTO NEW.employer_id FROM public.jobs WHERE id = NEW.job_id;
  IF NEW.employer_id IS NULL THEN
    RAISE EXCEPTION 'job_id does not reference an existing job';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER job_applications_stamp_employer_id_trigger
  BEFORE INSERT ON public.job_applications
  FOR EACH ROW EXECUTE FUNCTION public.job_applications_stamp_employer_id();
```

`NEW.employer_id` is overwritten unconditionally, regardless of what a
client submits — this is a database-level guarantee, not an
application-layer convention.

### RLS — resolves C2 and H5

```sql
ALTER TABLE public.job_applications ENABLE ROW LEVEL SECURITY;

-- SELECT: candidate reads their own applications.
CREATE POLICY "job_applications_owner_select" ON public.job_applications
  FOR SELECT TO authenticated
  USING (applicant_user_id = auth.uid());

-- INSERT: candidate creates their own application. employer_id is
-- re-derived by the trigger above regardless of this WITH CHECK.
CREATE POLICY "job_applications_owner_insert" ON public.job_applications
  FOR INSERT TO authenticated
  WITH CHECK (applicant_user_id = auth.uid());

-- SELECT: employer members read applications for their own jobs --
-- ONLY while the employer's own account is active. This is the H5
-- fix: the prior revision used has_employer_role() alone here, which
-- does not check the employer's own status, so a suspended employer's
-- members would have retained read access to candidate applications
-- and CVs. Both checks are now required together, matching the
-- pattern already used by jobs_public_active_select /
-- employers_public_active_select elsewhere in this schema.
CREATE POLICY "job_applications_employer_select" ON public.job_applications
  FOR SELECT TO authenticated
  USING (
    public.has_employer_role(auth.uid(), employer_id, NULL)
    AND public.employer_is_active_status(employer_id)
  );

-- SELECT: platform admins, for audit/support use only (Part L).
CREATE POLICY "job_applications_admin_select" ON public.job_applications
  FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));

-- NO UPDATE POLICY EXISTS FOR `authenticated` AT ALL. This is
-- deliberate, not an oversight -- it is the direct fix for C2. By the
-- same convention already used by `audit_logs` in this schema
-- ("no policies for authenticated -> effectively deny"), the absence
-- of an UPDATE policy means every direct client UPDATE attempt is
-- denied by RLS regardless of row ownership. All updates happen
-- exclusively through the two SECURITY DEFINER server functions
-- below, which run as service_role after performing their own
-- authorization check in application code -- the same two-step
-- pattern already used by the existing getEmployerDashboardStats
-- function (RLS-scoped check, then a privileged operation).

-- Admins retain a narrow, explicit UPDATE path for rare support
-- corrections -- this is the one intentional exception, and every use
-- is already covered by the general admin audit-logging discipline
-- used throughout this schema.
CREATE POLICY "job_applications_admin_update" ON public.job_applications
  FOR UPDATE TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

REVOKE ALL ON public.job_applications FROM anon;
```

No anon access at all — internal applications require sign-in by
design.

### Server functions — the only way a candidate or employer updates a row

**`withdraw_my_application({ applicationId })`** (candidate-facing):
1. `requireSupabaseAuth` middleware (existing pattern).
2. Using the RLS-scoped authenticated client, verify a row exists with
   `id = applicationId AND applicant_user_id = ctx.userId AND status IN ('submitted','viewed')`.
   If not found (wrong owner, or already withdrawn), fail closed with
   a generic message — never reveal which condition failed.
3. Using `supabaseAdmin` (service-role, dynamic-imported after the
   check — the existing pattern), `UPDATE job_applications SET status
   = 'withdrawn', withdrawn_at = now(), updated_at = now() WHERE id =
   applicationId`. **No other column is ever touched by this
   function.**
4. Write one `audit_logs` row: `action = 'application_withdrawn'`,
   `subject_type = 'job_application'`, `subject_id = applicationId`,
   `actor_id = ctx.userId`, `org_id = <the application's employer_id>`.

**`update_application_as_employer({ applicationId, markViewed?, employerNote? })`**
(employer-facing):
1. `requireSupabaseAuth`.
2. Using the RLS-scoped authenticated client, fetch the row's
   `employer_id` (fails closed with a generic message if the row
   doesn't exist or isn't visible to the caller under
   `job_applications_employer_select`, which already requires an
   active employer — this is the H5 fix applied at the function layer
   too, not just the SELECT policy, so the check is enforced twice).
3. Explicitly re-verify `has_employer_role(ctx.userId, employerId,
   NULL) AND employer_is_active_status(employerId)` in application
   code before writing — never rely on the earlier read alone having
   proven this for the write.
4. Using `supabaseAdmin`: if `markViewed` is true and current
   `status = 'submitted'`, set `status = 'viewed'`; if `employerNote`
   is provided, set `employer_note = employerNote` (server-side length
   cap, e.g. 2000 characters); always set `updated_at = now()`.
   **`cover_note`, `cv_storage_path`, `cv_original_filename`, `phone`,
   `consent_given_at`, `applicant_user_id`, and `withdrawn_at` are
   never touched by this function under any input.**
5. Write one `audit_logs` row per logical change: `action =
   'application_reviewed'` (if `markViewed`) and/or `action =
   'application_note_updated'` (if `employerNote` set), `subject_type
   = 'job_application'`, `subject_id = applicationId`, `actor_id =
   ctx.userId`, `org_id = employerId`.

**`submit_job_application({ jobId, phone?, coverNote?, cvStoragePath?,
cvOriginalFilename?, cvMimeType?, cvSizeBytes?, consent })`**
(candidate-facing, the original submission — unchanged in spirit from
the prior revision, restated here for completeness): requires
`consent = true`; the CV fields are populated only after a successful
upload via the storage server function below, never as raw client
file bytes passed to this function. INSERT goes through the RLS-scoped
authenticated client (`job_applications_owner_insert`), with
`employer_id` re-derived server-side by the stamping trigger
regardless of anything the client sends. The `UNIQUE(job_id,
applicant_user_id)` constraint provides the duplicate-application
guard at the database level, not just in application logic.

**Deletion behaviour (unchanged from the prior revision, restated
because it remains the single most likely gap for an implementer to
miss):** `ON DELETE CASCADE` on `job_id`/`applicant_user_id` removes
the database row automatically but does **not** delete the associated
CV Storage object — Postgres cascade has no knowledge of
`storage.objects`. `sweep_application_retention()` (below) is the one
place both the row and the object are removed together.

---

## CV storage (Supabase Storage, not a database table)

| Property | Value |
|---|---|
| Bucket name | `job-application-cvs` |
| Public | No — private bucket, no public bucket policy under any circumstance |
| Object path | `applications/{application_id}/{random_uuid}.{ext}` — never derivable from `job_id`/`applicant_user_id` |
| Upload path | Server function only. Validates MIME type via declared `Content-Type` **and** magic bytes, extension match, size ≤ 5 MB. Subject to the rate limit below (M5). |
| Download path | Server function issues a short-lived (5-minute) signed URL after re-checking: candidate owns the application, **OR** (`has_employer_role()` **AND** `employer_is_active_status()`, both required — H5), **OR** `is_platform_admin()`. |
| `storage.objects` policies for this bucket | No `SELECT`/`INSERT` policy for `anon` or `authenticated` at all — every access goes through the server function using `supabaseAdmin`, which performs the authorization check in application code before issuing a signed URL. |
| Filename handling (Low finding) | `cv_original_filename` is user-supplied and untrusted. It is (a) HTML-escaped wherever rendered in any UI list ("CV: `<filename>`"), and (b) passed through a strict allow-list sanitiser (strip control characters, path separators, and quote characters; cap length) before being used in a `Content-Disposition` header on download. It is **never** used to construct or influence the Storage object path — the object path is always the random-UUID pattern above, independent of the filename entirely. |
| Retention | See `sweep_application_retention()`, below — resolves H2. |
| Audit | Every upload/download/replace/delete writes one row to `audit_logs`: `action IN ('cv_uploaded','cv_downloaded','cv_replaced','cv_deleted')`, `subject_type='job_application'`, `subject_id=<application id>`, `actor_id=<caller>`. |

**Malware scanning** — unchanged phased plan from the prior revision:
strict validation + private bucket + signed URLs + never
executing/rendering files server-side is the MVP-launch control set;
live AV scanning is a required fast-follow; the residual risk
(a disguised file passing type/magic-byte checks) requires explicit
owner acceptance to launch without live scanning, or a URL-only CV
fallback until scanning exists.

---

## `job_analytics_events` (new)

No change to the table shape from the prior revision. Retention policy
is new — see `sweep_analytics_retention()`, below (resolves M4).

```sql
ALTER TABLE public.job_analytics_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "job_analytics_events_admin_select" ON public.job_analytics_events
  FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));

REVOKE ALL ON public.job_analytics_events FROM anon, authenticated;
GRANT ALL ON public.job_analytics_events TO service_role;
```

---

## Scheduled maintenance functions

### Open technical question — applies to all three functions below

**No existing scheduled-job mechanism was found anywhere in this
repository during the original audit** (no `pg_cron` usage, no
scheduled Supabase Edge Function). Before H1 is considered complete,
confirm whether the connected Lovable Cloud project has `pg_cron`
enabled, or whether these functions must instead be invoked by an
external scheduler calling a dedicated, service-role-gated server
function on a timer. This is flagged explicitly rather than assumed,
consistent with this project's own established practice of verifying
tooling availability in-runner rather than assuming it (the
`tsgo`/`tsc` resolution question from Phase G1 is the precedent). The
three functions below are written as plain `SECURITY DEFINER`
Postgres functions specifically so that whichever scheduling mechanism
is confirmed, invoking them is a one-line call — the functions
themselves do not depend on the answer.

### `sweep_expired_jobs()` — resolves H3

Automatic `published → expired` transition. **This is now a MUST for
MVP**, not a "SHOULD for audit clarity" as the prior revision framed
it — because the 12-month application/CV retention clock (H2, below)
needs every published job to reach a terminal state within a bounded
time, and a manual-close-only model leaves that unbounded.

```sql
CREATE OR REPLACE FUNCTION public.sweep_expired_jobs()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  affected integer;
BEGIN
  WITH flipped AS (
    UPDATE public.jobs
    SET status = 'expired', updated_at = now()
    WHERE status = 'published' AND expires_at <= now()
    RETURNING id, slug
  )
  INSERT INTO public.job_audit_events (job_id, job_slug_snapshot, actor_id, action, after)
  SELECT id, slug, NULL, 'expired', jsonb_build_object('status', 'expired')
  FROM flipped;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

REVOKE ALL ON FUNCTION public.sweep_expired_jobs() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sweep_expired_jobs() TO service_role;
```

Run at least daily. **Candidate-facing behaviour is unchanged by this
sweep** — `job_is_active()` already excludes past-`expires_at` jobs
from public queries at read time, regardless of the stored `status`
value; the sweep's purpose is to reach a durable terminal state for
the retention clock and the audit trail, not to change what candidates
see. **Employer-facing:** the employer job list already reflects
"expired" via `job_is_active()`-style computation before the sweep
runs; the sweep makes it authoritative in `status` too. **Employer
notification:** an in-app indicator (days remaining / "Expired" badge
on the employer job list) is MUST for MVP, since it's a read of an
existing column; an email/push reminder before expiry remains a
SHOULD-soon (Part Q, unchanged). **Jobs closed manually before
expiry:** unaffected — `archived` is already a terminal state and this
sweep only ever touches `status = 'published'` rows.

### `sweep_application_retention()` — resolves H2

**Chosen MVP retention model (per owner direction): full hard delete
of both the `job_applications` row and its CV Storage object — no
partial anonymization, no residual row.** This resolves the direct
contradiction in the prior revision (the main spec said "file + row";
this document said "file only, row persists") by making the row-level
deletion the single, unambiguous answer in both documents. Aggregate,
non-personal statistics (e.g. "how many applications did job X
receive in total") are derived independently from `job_analytics_events`
(`application_submitted` event count), which has its own separate,
already-anonymizing retention policy below — `job_applications` itself
is never partially retained for statistics purposes.

Retention clock starts at whichever terminal event happens first for
the parent job (`archived` via manual close, or `expired` via the
sweep above) — both are now guaranteed to occur within a bounded time
(H3 closes the previously-unbounded gap) — or at the application's own
`withdrawn_at`, whichever is earliest.

```sql
CREATE OR REPLACE FUNCTION public.sweep_application_retention()
RETURNS TABLE(application_id uuid, cv_storage_path text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH doomed AS (
    SELECT ja.id, ja.cv_storage_path
    FROM public.job_applications ja
    JOIN public.jobs j ON j.id = ja.job_id
    WHERE
      (j.status IN ('archived', 'expired') AND j.updated_at <= now() - INTERVAL '12 months')
      OR (ja.status = 'withdrawn' AND ja.withdrawn_at <= now() - INTERVAL '12 months')
  )
  DELETE FROM public.job_applications
  WHERE id IN (SELECT id FROM doomed)
  RETURNING id, (SELECT cv_storage_path FROM doomed WHERE doomed.id = job_applications.id);
END;
$$;

REVOKE ALL ON FUNCTION public.sweep_application_retention() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sweep_application_retention() TO service_role;
```

This function **returns** the set of deleted rows' `cv_storage_path`
values rather than deleting the Storage objects itself — a raw SQL
function cannot call the Storage API. The calling scheduled task
(service-role) deletes each returned Storage object immediately after
this function runs, in the same maintenance job, so no orphaned CV
file survives its row's deletion for longer than one sweep interval.
**What the candidate sees:** once retention fires, the application no
longer appears in `/my-career/applications` — this is a disclosed,
deliberate trade-off (Part M), not a bug; nothing in the candidate
experience implies applications are retained forever.

### `sweep_analytics_retention()` — resolves M4

Two-tier policy, applied uniformly to all event types (browsing
events, `job_saved`, `application_started`/`application_submitted`,
`external_application_opened`, employer-side events):

1. **De-identify:** any event row with a non-null `user_id` older than
   **90 days** has `user_id` set to `NULL`. The event itself (job_id,
   event_name, timestamp, non-PII properties) is retained for trend
   analysis; the link back to a specific person is removed.
2. **Purge:** any event row with a null `user_id` (already-anonymous
   at creation, or de-identified by step 1) older than **24 months**
   is hard-deleted.

```sql
CREATE OR REPLACE FUNCTION public.sweep_analytics_retention()
RETURNS TABLE(deidentified integer, purged integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  n_deid integer;
  n_purge integer;
BEGIN
  UPDATE public.job_analytics_events
  SET user_id = NULL
  WHERE user_id IS NOT NULL AND created_at <= now() - INTERVAL '90 days';
  GET DIAGNOSTICS n_deid = ROW_COUNT;

  DELETE FROM public.job_analytics_events
  WHERE user_id IS NULL AND created_at <= now() - INTERVAL '24 months';
  GET DIAGNOSTICS n_purge = ROW_COUNT;

  RETURN QUERY SELECT n_deid, n_purge;
END;
$$;

REVOKE ALL ON FUNCTION public.sweep_analytics_retention() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sweep_analytics_retention() TO service_role;
```

`external_application_opened` events follow the same two-tier rule as
every other event type — no special case, since these events already
never carry more than an optional `user_id` (Part G.1).

---

## Rate limiting — resolves M5

**No existing rate-limiting infrastructure was found anywhere in this
codebase** (confirmed by the original audit) — unlike every other
control in this document, there is no existing pattern to reuse
directly. Recommended MVP mechanism, using only what already exists:

Each rate-limited server function (`submit_job_application`, the CV
upload function, the signed-URL issuance function, and the
`external_application_opened` event-recording path) performs a
`COUNT`-style check against `audit_logs` (for CV/application actions)
or `job_analytics_events` (for the anonymous external-click event)
for the same actor (`actor_id`/`user_id`, or an IP-hash for
unauthenticated external-click recording) within a rolling window,
**before** performing the privileged action, and rejects with a
generic "too many requests, try again later" message if the count
exceeds a threshold. No new table, no external service (e.g. Redis) —
this reuses tables the schema already has as the rate-limit ledger.

Proposed starting thresholds (owner-adjustable, not load-bearing to
correctness): 10 application submissions/hour/user, 5 CV
uploads-or-replacements/hour/user, 20 signed-URL issuances/hour/user,
30 external-application-click events/hour/IP-hash for anonymous
callers. **Per the design review's explicit instruction, the exact
mechanism and thresholds are marked a required, launch-blocking H6
technical decision** — the design above is the recommended default,
not a settled implementation, and must be confirmed (or replaced) with
a concrete decision before H6 ships, alongside the CV
malware-scanning residual-risk acceptance it sits next to in Part Y.

---

## Security Career Intelligence Integration — schema cross-reference

Unchanged from the prior revision. Full mapping table lives in the
main spec's "Security Career Intelligence Integration" section.
`job_categories`, `job_skills`, `job_professions` join tables remain
explicitly not built — `jobs.profession_slug`, `jobs.family_id`,
`jobs.related_profession_slugs`, and `jobs.required_skill_ids`/
`preferred_skill_ids` are the complete taxonomy surface.

---

## MVP / SHOULD / DEFER, by object (cross-reference to spec Part X)

| Object | Status |
|---|---|
| `jobs` additive columns (salary, CI mapping, provenance-reserved) | MUST EXIST FOR MVP |
| `jobs_validate_before_write()` — internal-application unblock | MUST EXIST FOR MVP |
| `jobs_validate_before_write()` — `expires_at` required at publish (M2) | MUST EXIST FOR MVP |
| `jobs_validate_before_write()` — employer transition guard (C1) | **MUST EXIST FOR MVP — Critical fix, part of H1** |
| `jobs_employer_select_own`/`_insert_draft`/`_update_editable` RLS (C1) | **MUST EXIST FOR MVP — Critical fix, part of H1** |
| `job_audit_events.action` CHECK extension | MUST EXIST FOR MVP |
| `job_applications` table, RLS (no direct UPDATE grant), stamping trigger (C2) | **MUST EXIST FOR MVP — Critical fix, part of H1** |
| `withdraw_my_application()` / `update_application_as_employer()` server functions (C2) | MUST EXIST FOR MVP, built in H6 (the schema/RLS foundation that makes them safe is H1; the functions themselves ship with the application feature) |
| CV storage bucket + policies + server-function access pattern, incl. `employer_is_active_status()` check (H5) | MUST EXIST FOR MVP, subject to the malware-scanning owner risk-acceptance decision |
| `job_analytics_events` + RLS + retention sweep (M4) | MUST EXIST FOR MVP (narrow scope only) |
| `sweep_expired_jobs()` (H3) | **MUST EXIST FOR MVP** |
| `sweep_application_retention()` (H2) | **MUST EXIST FOR MVP** |
| `sweep_analytics_retention()` (M4) | MUST EXIST FOR MVP |
| Scheduling mechanism for the three sweeps | **Open technical decision — must be confirmed before H1 is considered complete** |
| Rate-limiting mechanism (M5) | Recommended default given above; **launch-blocking technical decision required at H6** |
| `job_admin_meta.duplicate_of` wiring | SHOULD EXIST SOON |
| `experience_level` DB-level CHECK tightening | SHOULD EXIST SOON |
| `confidence_level`/`inference_method`/`model_version` becoming populated | DEFER |
| `job_locations` (multi-location per posting) | DEFER |
| General-purpose analytics platform beyond `job_analytics_events` | DEFER |
