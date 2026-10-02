-- =============================================================================
-- P1-I -- an approved organisation that changes its identity goes back to review
-- =============================================================================
--
-- THE DEFECT (2026-10-02 final audit, P1-I, reproduced on production with a
-- rolled-back probe):
--
--   Moderation approves an organisation's identity once (pending -> active).
--   After that an owner or admin could rewrite name, organisation number,
--   website and logo freely (employers_owner_admin_update; the status guard
--   employers_validate_before_write protects only status and slug) and stay
--   active -- e.g. copy another approved organisation's name and number
--   (probe: rows=1, identity_identical_to_other_active_org=t, status=active).
--   Live ads and the apply flow then present the copied identity, and
--   candidates send applications to an organisation nobody reviewed under that
--   name. The duplicate check exists only at creation.
--
-- THE FIX (owner decision: option B, re-review): when an ACTIVE organisation's
-- material identity changes -- name, country, registration_number or website,
-- the four identity fields the moderation queue reviews; compared trimmed and
-- case-insensitively, so a cosmetic re-type is not a change -- the status
-- guard sets the organisation back to 'pending'. Moderation then approves it
-- again (moderate_employer pending -> active) or rejects it. While pending the
-- organisation keeps its own set-up but no active-organisation capability
-- (has_active_employer_role), and its ads are not public.
--
-- NOT MATERIAL (no re-review): description_sv/_en, logo_url -- profile fields
-- the moderation queue does not review. NOT CHANGED: draft/pending
-- organisations' edits (already under review); a platform admin's edit;
-- moderate_employer and its marker; the slug rule; any row. The function body
-- is otherwise the hosted one (md5 e3fd899458d95fe8c00c5f4dfa082fa8, pinned by
-- the rollback).
--
-- Rollback: supabase/rollback/20270122090000_employer_identity_rereview_rollback.sql
-- Suite:    supabase/tests/employer_identity_rereview_test.sql
-- =============================================================================

CREATE OR REPLACE FUNCTION public.employers_validate_before_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Status invariant (H3.3 database-integrity fix): no caller, of any
  -- role, including a verified platform admin, may change an existing
  -- employer's status except by executing inside moderate_employer(),
  -- which sets this exact transaction-local marker immediately before its
  -- own internal UPDATE. A client can never set this marker itself.
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF current_setting('app.employer_moderation_in_progress', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'employers.status can only be changed via moderate_employer()'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND NOT public.is_platform_admin(auth.uid()) THEN
    IF NEW.slug IS DISTINCT FROM OLD.slug THEN
      RAISE EXCEPTION 'slug cannot be changed by an employer member'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- 20270122090000 (P1-I): an approved organisation that
  -- changes the identity moderation approved -- its name, country,
  -- organisation number or website, exactly what the moderation queue reviews
  -- (admin-employer-moderation.functions.ts) -- goes back to review. Profile
  -- edits (description, logo) do not. The status move is made here, by the
  -- invariant's own guard, not by setting the moderation marker; a platform
  -- admin's edit and moderate_employer's own writes are unaffected.
  IF TG_OP = 'UPDATE'
     AND OLD.status = 'active' AND NEW.status = 'active'
     AND current_setting('app.employer_moderation_in_progress', true) IS DISTINCT FROM 'on'
     AND NOT public.is_platform_admin(auth.uid())
     AND (lower(btrim(coalesce(NEW.name, ''))) IS DISTINCT FROM lower(btrim(coalesce(OLD.name, '')))
          OR lower(btrim(coalesce(NEW.registration_number, ''))) IS DISTINCT FROM lower(btrim(coalesce(OLD.registration_number, '')))
          OR lower(btrim(coalesce(NEW.website, ''))) IS DISTINCT FROM lower(btrim(coalesce(OLD.website, '')))
          OR lower(btrim(coalesce(NEW.country, ''))) IS DISTINCT FROM lower(btrim(coalesce(OLD.country, '')))) THEN
    NEW.status := 'pending';
  END IF;

  RETURN NEW;
END;
$function$
;

DO $$
DECLARE _src text := (SELECT prosrc FROM pg_proc WHERE proname = 'employers_validate_before_write'
                         AND pronamespace = 'public'::regnamespace);
BEGIN
  IF position('20270122090000' IN _src) = 0 OR position('registration_number' IN _src) = 0 THEN
    RAISE EXCEPTION 'EMPLOYER_IDENTITY_REREVIEW_PROOF: the status guard does not return identity changes to review';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'employers_validate_before_write_trigger'
                  AND tgrelid = 'public.employers'::regclass) THEN
    RAISE EXCEPTION 'EMPLOYER_IDENTITY_REREVIEW_PROOF: the status guard trigger is missing';
  END IF;
  RAISE NOTICE 'EMPLOYER_IDENTITY_REREVIEW_PROOF ok: an approved organisation that changes its identity goes back to review';
END $$;
