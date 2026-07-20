-- =============================================================================
-- Phase H3.2 — Employer Dashboard Completion: organisation self-service
-- update capability.
--
-- Ground truth confirmed before writing this file (per working method):
-- `employers` currently has NO self-service write policy of any kind for
-- non-admin actors — only `employers_admin_all` (is_platform_admin()) and
-- `employers_public_active_select`/`employers_member_select` (read-only)
-- exist. An owner/admin member cannot update their own organisation's
-- name/website/country/registration_number/description today. This
-- migration adds exactly that, using the same has_employer_role() +
-- employer_members_can_edit() pair already established for the jobs
-- table's employer-write policies (supabase/migrations/20260719181557_...
-- sql), and the same trigger-guard pattern already established for jobs
-- (jobs_validate_before_write's non-admin transition guard) applied here
-- to protect `status` and `slug` specifically.
--
-- Additive only. Does not touch jobs, job_applications, employer_
-- memberships, employer_access_requests, or any existing policy/function
-- on `employers` (employers_admin_all, employers_member_select,
-- employers_public_active_select, employer_is_active_status,
-- employer_members_can_edit, has_employer_role, is_platform_admin all
-- remain exactly as they are).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. employers_owner_admin_update — new RLS policy
--
-- Scope: owner/admin members of an employer whose status still permits
-- editing (employer_members_can_edit() already returns true for
-- 'active'/'draft'/'pending' — the same set that already lets an owner/
-- admin edit job drafts, so organisation-profile edits follow the same
-- lifecycle rule rather than inventing a second one). A suspended/
-- archived/rejected employer's members lose this access, matching every
-- other employer-write surface in this schema.
-- -----------------------------------------------------------------------------

CREATE POLICY "employers_owner_admin_update" ON public.employers
  FOR UPDATE
  TO authenticated
  USING (
    public.has_employer_role(auth.uid(), id, ARRAY['owner', 'admin'])
    AND public.employer_members_can_edit(id)
  )
  WITH CHECK (
    public.has_employer_role(auth.uid(), id, ARRAY['owner', 'admin'])
    AND public.employer_members_can_edit(id)
  );


-- -----------------------------------------------------------------------------
-- 2. employers_validate_before_write() — new trigger, non-admin guard
--
-- RLS above decides *which rows* an owner/admin can reach; this trigger
-- decides *what they're allowed to change* on a reachable row -- the same
-- division of responsibility already used for jobs
-- (jobs_validate_before_write's employer-guard block). status and slug
-- are moderation/identity-owned fields: status must never be settable by
-- the employer (per the H3.2 brief's own explicit rule), and slug is
-- treated as a stable identifier elsewhere in this schema (job URLs,
-- localStorage last-visited-slug convenience) so it stays admin-only too,
-- consistent with that existing convention rather than introducing a new
-- one. Platform admins are exempt, matching the identical exemption
-- already used for the jobs-table guard.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.employers_validate_before_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NOT public.is_platform_admin(auth.uid()) THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'status is a moderation-owned field and cannot be changed by an employer member'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.slug IS DISTINCT FROM OLD.slug THEN
      RAISE EXCEPTION 'slug cannot be changed by an employer member'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER employers_validate_before_write_trigger
  BEFORE UPDATE ON public.employers
  FOR EACH ROW EXECUTE FUNCTION public.employers_validate_before_write();
