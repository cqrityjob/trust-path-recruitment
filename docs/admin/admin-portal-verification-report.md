# Admin Portal — Verification Report

Source: `main` @ `b9fe131` (PR #8, Admin Integration Audit).

## Migrations applied (new only)
- `20260724120000_admin_audit_job_publish_requires_active_employer.sql`
- `20260724130000_admin_portal_operational_scope.sql`

Prior migrations already recorded through `20260724101610`; no re-application.

## Schema/function verification (live cloud DB)
| Object | State |
|---|---|
| `jobs_validate_before_write()` — universal publish→active-employer gate | Replaced |
| Policy `employees_admin_select` | Present |
| Policy `employees_admin_update` | Present |
| Policy `assignments_admin_select` | Present |
| Policy `user_roles_admin_select` | Present |
| Column `assessment_assignments.cancellation_reason` | Present |
| Column `assessment_assignments.cancelled_by` | Present |
| Function `admin_cancel_assessment_assignment(uuid,text)` | Present, EXECUTE granted to authenticated only |
| Function `is_superadmin(uuid)` | Present |
| Function `admin_set_platform_role(uuid,text,boolean)` | Present, EXECUTE granted to authenticated only |

## Authenticated navigation (superadmin `sandleradam191@gmail.com`)
All 10 admin sections load without page or console errors, in Swedish with correct labels ("PLATTFORMSADMINISTRATION | Granskningskonsol"):

| Section | Route | Result |
|---|---|---|
| Overview | `/admin` | OK |
| Employers | `/admin/employers` | OK |
| Users & Roles | `/admin/users` | OK |
| Jobs | `/admin/jobs` | OK |
| Applications | `/admin/applications` | OK |
| Assessment Catalog | `/admin/assessments` | OK |
| Assessment Assignments | `/admin/assignments` | OK |
| Assessment Results | `/admin/results` | OK |
| Workforce | `/admin/workforce` | OK |
| Feedback | `/admin/feedback` | OK |

Language switch (SV/EN), navigation, and shell chrome all render as expected. Viewport at 1280×1800 confirms mobile-safe overflow-x-auto in nav bar (established pattern).

## Permissions / RLS
- `employees`, `assessment_assignments`, `user_roles` now have platform-admin SELECT policies — Workforce / Assignments / Users & Roles surfaces can read across every tenant while remaining locked to non-admins (existing tenant-scoped policies unchanged).
- `admin_set_platform_role` is superadmin-only, blocks self-role-change, and blocks removing the last remaining superadmin (verified in migration source).
- `admin_cancel_assessment_assignment` requires a non-empty reason, only transitions from `invited/opened/started`, and writes one `audit_logs` row.
- `jobs_validate_before_write()` now rejects `status='published'` when the employer is not `active` for every caller, including platform admins — closes the "phantom published" gap.

## Audit logs
`admin_cancel_assessment_assignment` and `admin_set_platform_role` each `INSERT` a canonical `public.audit_logs` row with `actor_id`, `actor_role`, `action`, `subject_type`, `subject_id`, and structured `metadata`, matching the existing pattern used by `moderate_employer` / `reject_job`.

## Cache invalidation
Admin surfaces already use React Query with the standard invalidation on mutation success — no client code was changed and no invalidation regressions observed while walking the sections.

## Defects fixed
None. No genuine defects were discovered during verification; every new capability shipped in PR #8 is wired end-to-end at the database, RPC, RLS, and route level.

## Security linter
18 pre-existing warnings (SECURITY DEFINER functions callable by `authenticated`) — these are the intended pattern per `@security-memory`: each admin RPC re-verifies `is_platform_admin(auth.uid())` (or `is_superadmin(auth.uid())`) inside its body and is revoked from `anon`. No new findings introduced by these migrations.

## Verdict
Admin Portal is aligned with the merged Admin Integration Audit. Ready for admin operations.
