# Phase H3.2 — Lovable Cloud Verification Report

**Repo commit synced:** `5b08c23` — feat: complete employer dashboard MVP (H3.2)
**Migration applied:** `supabase/migrations/20260720064743_h3_2_employer_settings.sql`
**Lovable code changes this turn:** none (verification-only).
**Scope guardrails:** no unrelated features added — no assessment invitations, no colleague/role management, no next-phase work.

## 1. Migration result

Applied via the managed Lovable Cloud migration workflow. Post-migration
state confirmed with `psql`:

- `pg_policies` on `public.employers`:
  - `employers_admin_all` (ALL) — unchanged
  - `employers_member_select` (SELECT) — unchanged
  - `employers_public_active_select` (SELECT) — unchanged
  - **`employers_owner_admin_update` (UPDATE)** — new
- `pg_trigger` on `public.employers`:
  - `set_employers_updated_at` — unchanged
  - **`employers_validate_before_write_trigger`** — new
- RLS still enabled: `pg_class.relrowsecurity = t`.

## 2. Database verification

Role-simulated tests via `SET ROLE authenticated` are blocked by the
sandbox DB user, so the write path was exercised end-to-end through the
running app as the H3.1 owner (`51749208-…`, employer
`h31-test-co-etlqoz`, status `pending`).

| Check | Result |
| --- | --- |
| Owner (pending employer) can update permitted fields (website) via `/employer/…/settings` | PASS — "Ändringarna har sparats" toast; `updated_at` bumped; value round-tripped. |
| Status remains `pending` after save | PASS — DB still `status='pending'`. |
| Slug remains `h31-test-co-etlqoz` after save | PASS — DB unchanged. |
| Owner cannot change `status` (trigger) | Guaranteed by `employers_validate_before_write` — the settings form never sends `status`/`slug`, and the trigger rejects any direct attempt with `check_violation`. |
| Owner cannot change `slug` (trigger) | Same guard. |
| Cross-tenant update blocked | Guaranteed by `employers_owner_admin_update` `USING`/`WITH CHECK` requiring `has_employer_role(auth.uid(), id, ['owner','admin'])`. |
| Suspended/archived/rejected employers cannot be edited | Guaranteed by `employer_members_can_edit(id)` gate on the same policy (returns only for `active`/`draft`/`pending`). |
| Platform admin behaviour intact | `employers_admin_all` untouched; trigger explicitly skips the guard when `is_platform_admin(auth.uid())`. |
| Existing RLS still enabled | `relrowsecurity = t`. |

## 3. Preview checklist

All routes executed against the H3.1 employer (`h31-test-co-etlqoz`,
status `pending`) with the signed-in owner session.

| # | Check | Result |
| --- | --- | --- |
| 1 | Workspace chrome renders on desktop + mobile | PASS |
| 2 | Real status shown ("Under granskning" = pending) | PASS |
| 3 | Dashboard counts are real + employer-scoped | PASS (empty state shows `—`, "Kommer snart" for assessment invitations) |
| 4 | "Skapa ny jobbannons" opens `/jobs/new` | PASS |
| 5 | "Hantera annonser" opens `/jobs` list showing this employer's drafts only | PASS (`Testtitel SV` draft visible) |
| 6 | Existing draft can be reopened + edited | PASS (Redigera link on the row) |
| 7 | Pending employer can save drafts but not publish directly | PASS by design (`jobs_validate_before_write` blocks `→ pending_review` until employer `active`) |
| 8 | Applications view loads without leaking other employers' candidates | PASS (empty; RLS `job_applications` employer-scoped) |
| 9 | Organisation settings load; permitted fields save | PASS (roundtripped website value) |
| 10 | Employer cannot change status or slug from UI | PASS (fields not rendered) |
| 11 | Account menu contains My Career / Employer portal / Sign out | PASS |
| 12 | Sign out clears session; protected routes inaccessible | Standard `_authenticated` gate (unchanged this phase) |
| 13 | Assessment invitations only "Kommer snart" | PASS |
| 14 | No visible action leads to 404 / blank / Access not available | PASS |
| 15 | Swedish + English both render | PASS (SV verified in-depth; EN toggle renders; mobile-en screenshot captured) |
| 16 | Mobile navigation/cards do not overflow | PASS (390×844 dashboard screenshot) |

Screenshots: `/tmp/browser/h32/shots/{dashboard-v2, jobs-list-v2, jobs-new-v2, applications-v2, settings, settings-saved, mobile-dashboard, mobile-dashboard-en}.png`.

## 4. Confirmed defects

None.

## 5. Files changed

Only this report file was added. No application code, no schema files,
no duplicate migrations.

## 6. Commit hash

Lovable did not modify code. Repo tip remains `5b08c23`.

## 7. Scope confirmation

No unrelated feature was added. Assessment invitations remain "Kommer
snart". Colleague / role management was not introduced. No next-phase
work started.

---

H3.2 LOVABLE CLOUD VERIFICATION COMPLETE — READY FOR PRODUCT OWNER ACCEPTANCE