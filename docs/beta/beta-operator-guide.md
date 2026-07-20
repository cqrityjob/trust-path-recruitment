# CQrityjob closed beta — operator guide

This is the practical, day-to-day guide for whoever runs the closed beta
(Lovable, or a designated CQrityjob operator). It assumes H3.4A and H3.4B
have been applied to Lovable Cloud per
`docs/job-intelligence/phase-h3-4-report.md`'s handoff section.

## 1. Before inviting any testers

1. **Provision at least one platform admin.** Nothing in this codebase
   grants admin access by email or any implicit signal (confirmed in the
   H3.3 integrity review). In the Lovable Cloud SQL editor:
   ```sql
   INSERT INTO public.user_roles (user_id, role)
   VALUES ('<the real auth.users.id of an already-registered account>', 'admin');
   ```
   That person can then sign in at `/admin/login`.
2. **Confirm the release flags you want live.** `VITE_JOBS_ENABLED` and
   `VITE_EMPLOYER_PORTAL_ENABLED` (in `.env`) gate the jobs/employer
   surfaces entirely. Both must be `true` for the candidate application
   flow (H3.4A) to be reachable at all.
3. **Run the Preview checklist** in `docs/job-intelligence/phase-h3-4-report.md`
   §12 end-to-end with two throwaway accounts (one candidate, one
   employer) labelled per `docs/beta/beta-test-data.md`'s convention,
   before inviting real testers.

## 2. Inviting testers

- **Candidates**: send them to `/candidate/register`. No admin action is
  needed — self-service signup is already live (Phase H3.1).
- **Employers**: send them to `/employer/register`. New employers are
  created with status `pending` and cannot publish jobs until a platform
  admin approves them at `/admin/employers`.
- **Admins** (additional beta operators, if more than one person needs
  moderation access): provision via the SQL statement in §1.1 — there is
  no self-service admin signup, by design.

## 3. Day-to-day moderation workflow

1. **New employer signups** show up at `/admin/employers` (default filter:
   `pending`). Review the company details shown, then Approve or Reject
   (rejection requires an internal note — H3.3).
2. **New job submissions** show up at `/admin/jobs` (filter: "Pending
   review"). Open one, review it, then:
   - **Publish** to make it live and (if `application_method=internal`)
     immediately applicable on-platform.
   - **Reject** — as of H3.4B, this now requires a non-empty internal
     note (shown inline if you try to reject without one).
3. **Applications** are between the candidate and the employer directly —
   admins do not need to intervene in the normal flow. `/admin/jobs`
   still lets you see and moderate the underlying job at any time.
4. **Beta feedback** submitted via the site-wide "Beta feedback" footer
   link is readable at `/admin/feedback` (admin-only). There is no
   read/unread state or reply mechanism — this is intentionally minimal
   for the closed beta; treat it as an inbox to scan periodically.

## 4. What a candidate can do (H3.4A)

- Browse published jobs at `/jobs`.
- For a job with `application_method=internal` ("Apply via CQrityjob"),
  submit an application with a PDF CV (≤5MB), phone (optional), and a
  cover note (optional) — requires being signed in; the page prompts a
  sign-in redirect if not.
- View their own application history and current status at
  `/my-career/applications`.
- Withdraw an application that is still `submitted`, `reviewing`, or
  `interview` (not `hired`/`rejected`/already `withdrawn`).
- Download their own submitted CV via a short-lived (5-minute) signed URL.
- Re-apply to the same job after withdrawing (the platform only blocks a
  second *active* application, not a second attempt after withdrawal).

## 5. What an employer can do (H3.4A)

- At `/employer/$slug/applications`, see every application to their own
  jobs (never another employer's).
- Advance an application through: `submitted → reviewing → interview →
  hired`, or reject at any of those three stages. The UI only ever offers
  the buttons the database will actually accept.
- An employer can **never** set an application to `withdrawn` — only the
  candidate can withdraw their own application.
- Download a candidate's CV via a short-lived signed URL, gated on active
  employer membership.

## 6. Known beta-scope boundaries (do not attempt to expand these)

Per the H3.4 brief, none of the following are in scope for the closed
beta and should not be requested of testers or built ad hoc:

- Payments or subscriptions of any kind.
- An advanced ATS (pipelines, tags, scorecards, interview scheduling).
- Employer-initiated assessment invitations.
- Any AI-driven hiring/candidate-ranking decision.
- Advanced analytics dashboards.
- New Career Intelligence scoring or knowledge-graph changes.

If a tester requests one of these, note it as beta feedback (category
"idea") rather than implementing it — H3.4 explicitly defers all of these.

## 7. Data hygiene during the beta

- Follow `docs/beta/beta-test-data.md` for labelling any test accounts
  *you* create while operating the beta, and for safely cleaning them up
  afterward.
- `sweep_application_retention()` and `sweep_analytics_retention()`
  (pre-existing, service-role-only maintenance functions, Phase H1) are
  **not scheduled to run automatically** in this phase — if long-lived
  retention cleanup is wanted during the beta, it must be wired to a
  scheduled job (e.g. Supabase's pg_cron, or an external cron calling a
  service-role endpoint) separately. This is a deferred item, not a bug —
  see the phase report's "Deferred items" section.

## 8. If something looks broken

1. Check `/admin/feedback` first — testers may have already reported it.
2. Reproduce with a throwaway test account before assuming it's
   environment-specific.
3. Check the browser console and network tab for the exact error code
   (this codebase intentionally surfaces stable `UPPER_SNAKE_CASE` error
   codes, e.g. `DUPLICATE_APPLICATION`, `JOB_NOT_APPLICABLE` — never raw
   database errors) — the code alone usually tells you which validation
   rule fired.
4. For anything touching moderation status or authorization, the relevant
   database migration's own header comment documents the exact invariant
   being enforced (`supabase/migrations/20260720150000_h3_4a_candidate_
   application_core.sql` for applications, `20260720114043_...` and
   `20260720140000_...` for employer moderation).
