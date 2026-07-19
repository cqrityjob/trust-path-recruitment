# Phase H3.1 — Correction Report

**Scope:** Self-service employer onboarding + CV storage security review.
**Not in scope:** H4 candidate loop, admin console changes, unrelated features.

## 1. Onboarding flow implemented

1. Authenticated user visits `/employer` with zero active memberships.
2. The neutral empty state now offers a **"Create an employer organisation"** CTA in addition to the existing "back to my career" link.
3. The CTA reveals an inline form (name required, website/country/description optional; validated client- and server-side).
4. Submission calls `createSelfServiceEmployer`, a server function that invokes the SECURITY DEFINER RPC `public.create_employer_self_service`.
5. The RPC atomically inserts:
   - a row into `public.employers` with server-forced `status = 'draft'`
   - a row into `public.employer_memberships` with server-forced `role = 'owner'`, `status = 'active'`, `created_by/invited_by = auth.uid()`, `invited_at/accepted_at = now()`
   - a `public.audit_logs` row (`action = 'employer_self_service_created'`)
6. On success, the React Query cache for `["employer","my-workspaces"]` is invalidated and the user is redirected to `/employer/<new-slug>` — the dashboard shell.
7. The user can immediately create and edit job **drafts**. Submission for review is trigger-blocked until a platform admin approves the organisation (see §4).

## 2. Employer status after self-service creation

`status = 'draft'`. Never `active`, never `verified` (there is no verified flag; visibility is derived from `status = 'active'` alone).

Publicly the organisation is invisible: `employers_public_active_select` and `jobs_public_active_select` are unchanged and continue to gate on `employer_is_active_status(id)` which returns true only for `'active'`.

## 3. Files changed

- **New**: `src/lib/job-intelligence/employer-onboarding.functions.ts` — thin wrapper around the RPC. No service-role import; uses the caller's bearer-scoped `ctx.supabase`.
- **New**: `docs/job-intelligence/phase-h3-1-correction-report.md` (this file).
- **Migration**: adds `employer_members_can_edit`, `create_employer_self_service`, tightens `jobs_validate_before_write`, updates the three `jobs_employer_*` RLS policies, drops the four `job_cvs_*` storage policies.
- `src/routes/_authenticated.employer.index.tsx` — empty state now offers self-service CTA + inline onboarding form. Existing 0/1/2+ workspace routing behaviour is preserved.
- `src/i18n/dictionaries.ts` — 12 new SV/EN keys for the onboarding UI.

## 4. Database and RLS changes

### New helper

`public.employer_members_can_edit(uuid) → boolean`, `SECURITY DEFINER`, returns `status IN ('active','draft')`. Executable by `authenticated` and `service_role` only.

### `jobs_employer_*` policies

All three policies (SELECT / INSERT / UPDATE) now use `employer_members_can_edit(employer_id)` instead of `employer_is_active_status(employer_id)`. Effect: owners of a **draft** employer can now see, create, and edit their own drafts. Public visibility is unaffected — the `jobs_public_active_select` policy still uses `employer_is_active_status`.

### `jobs_validate_before_write` trigger — new guard

For non-admins, when the requested transition targets `status = 'pending_review'`, the trigger now looks up `employers.status` and raises if it is not `'active'`. Message: *"Cannot submit job for review: employer organisation is not yet approved (status=…)"*.

All previous transition rules and the in-place-edit ban on `published` jobs are unchanged.

### `public.create_employer_self_service` RPC

- `SECURITY DEFINER`, `search_path = public`, executable only by `authenticated` (explicitly revoked from `PUBLIC` and `anon`).
- Validates: authenticated caller, name 2–200 chars, website ≤ 500 chars, country ≤ 2 chars.
- **One-org-per-user rule**: rejects if the caller already has any `role='owner' AND status='active'` membership. Additional workspaces require invitation (or platform-admin provisioning).
- Slug is server-derived from the name (`unaccent → lowercase → non-alnum → '-'`, truncated to 80 chars, uniqueness suffix `-2, -3, …` up to 200 tries). Client cannot influence it.
- Status, role, and membership status are hard-coded server-side (`'draft'`, `'owner'`, `'active'`). Any `website`/`country`/`description_*` fields go through `btrim`+`NULLIF` before insert.
- Audit event: `audit_logs` row with `actor_role='employer_self_service'`, `action='employer_self_service_created'`, `subject_type='employer'`, `subject_id=<uuid>`, `org_id=<uuid>`.

### RLS-bypass rationale

`create_employer_self_service` must run as `SECURITY DEFINER` because a user with zero memberships does not (and must not) satisfy the admin-scoped write policies on `employers`/`employer_memberships`. The bypass is safe because every privileged decision (status, role, uniqueness, one-org-per-user, slug) is enforced inside the function itself; no field is read from the caller without server-side normalisation.

## 5. Storage policy — before / after

### Before (added by scanner auto-fix)

Four policies on `storage.objects` for bucket `job-application-cvs`:

- `job_cvs_owner_select` — SELECT for `authenticated`, path segment 1 = `auth.uid()`
- `job_cvs_owner_insert` — INSERT idem
- `job_cvs_owner_update` — UPDATE idem
- `job_cvs_owner_delete` — DELETE idem

### After (this migration)

**All four policies dropped.** The `job-application-cvs` bucket remains private (`public = false`). With no authenticated policies present, `storage.objects` is deny-by-default for that bucket for signed-in browser clients. `service_role` retains full access via the underlying grants Supabase ships.

### Security reasoning

1. **Intended path format**: the H1 spec places CV files under `<applicant_user_id>/<application_id>/<filename>` and access is exclusively through server-issued signed URLs (issued by `applications.functions.ts` after authorising the caller against a `job_applications` row). Direct browser access was never part of the approved design.
2. **Path-based ownership is not enough**: the removed policies only checked the first path segment. They did *not* verify that a `job_applications` row exists for that user + object, and they did *not* prevent an authenticated user with no application from creating a `<their-uid>/anything.pdf` object in the private bucket (defeats the intended lifecycle guarantees such as `sweep_application_retention`). They also permitted UPDATE and DELETE, which are not required until H4 introduces browser uploads and even then the design routes writes through the server, not the browser.
3. **No conflict with the approved design**: `applications.functions.ts` uses signed URLs (`.storage.from(bucket).createSignedUrl(...)`) issued after row-level authorisation. That path uses `service_role` under the hood; it does not need any authenticated policy on `storage.objects` to function.
4. **Cross-user access via malformed paths**: not possible under the previous policies for INSERT (the WITH CHECK is enforced), but SELECT allowed reading any object whose first path segment matched the caller's uid — meaning any object the caller could persuade the bucket to accept became readable. With the policies removed, deny-by-default eliminates this class entirely.
5. **UPDATE / DELETE necessity before H4**: none. Retention is driven by `sweep_application_retention` (service_role); withdrawals mark a row without touching storage; deletes are administrative.
6. **Ownership vs `job_applications` rows**: the removed policies never checked `job_applications`. When H4 introduces browser uploads we will re-add policies gated on the existence of an owning row (a security-definer helper such as `application_belongs_to_user(object_name, uid)`), not on path shape alone.

**Least-privilege outcome**: no authenticated access to the private bucket. Server flow (signed URLs, issued after DB authorisation) is unchanged and still functional. When H4 lands, the correct policies will be added deliberately, not by auto-fix.

## 6. Tests

No new automated pgTAP-style tests were added in this correction (the existing `tests/database/phase-g1/` suite covers the membership-role RLS/RPC surface). Reasoning: the new writes go exclusively through `create_employer_self_service` and the tightened trigger, both of which are enforced by the database; runtime behaviour was verified against the running instance via:

- `tsgo --noEmit` — **PASS** (types compile after new i18n keys, new server fn, new route form).
- `bun run cie:check` — **PASS** (unchanged — no CIE surface touched).
- `bun run kg:check` — **OK** (unchanged).
- SQL manual check (via `supabase--read_query`, out-of-band): calling `create_employer_self_service` a second time from the same authenticated user raises *"You already own an employer organisation"*, confirming the one-org rule; setting `status='pending_review'` on a job under a `draft` employer raises the new trigger error.

Recommendation for a follow-up hardening PR: add a pgTAP suite covering (a) authenticated non-admin cannot INSERT into `employers` directly, (b) `create_employer_self_service` succeeds once and fails on repeat, (c) trigger blocks pending_review while draft, permits it once employer is `active`, (d) `storage.objects` returns 0 rows for a signed-in user probing bucket `job-application-cvs`.

## 7. Deviations and remaining limitations

- **No `pending_review` employer status**. The approved schema exposes only `draft/active/suspended/archived`. `draft` is used as the moderation-pending state. This matches the spec's guidance to *"choose the safest status supported by the approved schema"*.
- **One organisation per self-service user**. A user who legitimately owns two organisations still requires platform-admin provisioning for the second. Rationale: prevents drive-by squatting of employer names by a single actor. Reviewable later if product wants a looser rule.
- **Approval path**. There is no in-product UI for a platform admin to flip `status: draft → active`; the existing admin console path (`admin.functions.ts` update flow) is used out-of-band. Adding an in-product review queue is a separate scope.
- **Feature flag unchanged**. `VITE_JOBS_ENABLED` and `VITE_EMPLOYER_PORTAL_ENABLED` remain as set for Owner QA; this correction did not touch `.env`.
- **Storage policies for H4**. When H4 introduces browser uploads, add ownership policies gated on `job_applications` rows (not on path shape alone) in the same migration as the upload surface.

---

**H3.1 CORRECTION COMPLETE — READY FOR OWNER QA**