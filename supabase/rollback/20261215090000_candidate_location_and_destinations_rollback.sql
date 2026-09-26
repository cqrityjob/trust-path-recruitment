-- Rollback of 20261215090000_candidate_location_and_destinations.sql
--
-- REFUSES once the change has been adopted: a stored residence or destination
-- answer, or a recorded funnel event under one of the six new names, is data a
-- person or the product created, and a rollback must not delete it. After
-- adoption the supported path is a forward fix.
--
-- Before adoption it removes exactly what the migration added and restores
-- admin_anonymise_user and the funnel allowlist to their 20260911090000 /
-- 20261004090000 text.

BEGIN;

DO $guard$
DECLARE _n bigint;
BEGIN
  SELECT (SELECT count(*) FROM public.candidate_current_location)
       + (SELECT count(*) FROM public.candidate_job_preferences)
       + (SELECT count(*) FROM public.cd_v31_funnel_events
           WHERE event_name IN ('india_landing_viewed','india_registration_started','india_registration_completed',
                                'passport_first_credential_saved','passport_review_requested','passport_share_link_created'))
    INTO _n;
  IF _n > 0 THEN
    RAISE EXCEPTION 'ROLLBACK_REFUSED_ADOPTED: % row(s) were created under 20261215090000; forward-fix instead', _n;
  END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION public.admin_anonymise_user(
  _user_id uuid,
  _reason text,
  _confirm_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _caller uuid := auth.uid();
  _clean_reason text;
  _email text;
  _pseudonym text;
  _active_memberships int;
  _roles int;
  _cleared jsonb;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_superadmin(_caller) THEN
    RAISE EXCEPTION 'FORBIDDEN_SUPERADMIN_REQUIRED: anonymising an account is a superadmin action.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _user_id = _caller THEN
    RAISE EXCEPTION 'SELF_ANONYMISE_NOT_ALLOWED: a superadmin cannot anonymise their own account.'
      USING ERRCODE = 'check_violation';
  END IF;

  _clean_reason := NULLIF(btrim(_reason), '');
  IF _clean_reason IS NULL THEN
    RAISE EXCEPTION 'REASON_REQUIRED: a reason is required to anonymise an account.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT email INTO _email FROM auth.users WHERE id = _user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'USER_NOT_FOUND: no such account.' USING ERRCODE = 'P0001';
  END IF;

  IF btrim(coalesce(_confirm_email, '')) <> coalesce(_email, '') THEN
    RAISE EXCEPTION 'CONFIRMATION_MISMATCH: the typed address does not match this account.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO _roles FROM public.user_roles WHERE user_id = _user_id;
  IF _roles > 0 THEN
    RAISE EXCEPTION 'USER_HOLDS_PLATFORM_ROLE: revoke the platform role before anonymising this account.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO _active_memberships
    FROM public.employer_memberships WHERE user_id = _user_id AND status = 'active';
  IF _active_memberships > 0 THEN
    RAISE EXCEPTION 'USER_HAS_ACTIVE_MEMBERSHIP: remove this person from their organisation before anonymising.'
      USING ERRCODE = 'check_violation';
  END IF;

  _pseudonym := 'anonymised+' || _user_id::text || '@removed.invalid';

  UPDATE public.profiles SET display_name = NULL, country = NULL, updated_at = now()
   WHERE id = _user_id;

  UPDATE public.sp_passport_profiles SET display_name = NULL, headline = NULL, updated_at = now()
   WHERE holder_user_id = _user_id;

  UPDATE auth.users
     SET email = _pseudonym,
         raw_user_meta_data = '{}'::jsonb,
         banned_until = now() + interval '100 years'
   WHERE id = _user_id;

  _cleared := jsonb_build_object(
    'profile', true,
    'passport_profile', EXISTS (SELECT 1 FROM public.sp_passport_profiles WHERE holder_user_id = _user_id),
    'auth_email', true,
    'account_disabled', true
  );

  INSERT INTO public.audit_logs (actor_id, actor_role, action, subject_type, subject_id, metadata)
  VALUES (_caller, 'superadmin', 'user_anonymised', 'user', _user_id::text,
          jsonb_build_object('reason', _clean_reason, 'cleared', _cleared,
                             'retained', jsonb_build_array('sp_claims', 'sp_evidence',
                               'scp_attempts', 'scp_competency_evidence', 'employees',
                               'job_applications', 'audit_logs')));

  RETURN jsonb_build_object('user_id', _user_id, 'anonymised', true, 'cleared', _cleared);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_anonymise_user(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_anonymise_user(uuid, text, text) TO authenticated, service_role;

DROP TABLE public.candidate_job_preferences;
DROP TABLE public.candidate_current_location;
DROP FUNCTION public.candidate_preferences_touch();
DROP FUNCTION public.candidate_destinations_distinct(text[]);

ALTER TABLE public.cd_v31_funnel_events
  DROP CONSTRAINT cd_v31_funnel_events_event_name_check;
ALTER TABLE public.cd_v31_funnel_events
  ADD CONSTRAINT cd_v31_funnel_events_event_name_check
  CHECK (event_name = ANY (ARRAY[
    'assessment_started'::text,
    'assessment_completed'::text,
    'career_context_completed'::text,
    'result_viewed'::text,
    'profession_explored'::text,
    'pathway_opened'::text,
    'jobs_clicked'::text,
    'career_card_opened'::text,
    'career_card_generated'::text,
    'share_initiated'::text,
    'image_saved'::text,
    'save_journey_clicked'::text,
    'result_claimed'::text,
    'feedback_submitted'::text,
    'result_downloaded'::text,
    'career_center_test_started'::text,
    'career_filter_used'::text
  ]));

CREATE OR REPLACE FUNCTION public.cd_v31_funnel_event_names()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT ARRAY[
    'assessment_started', 'assessment_completed', 'career_context_completed',
    'result_viewed', 'profession_explored', 'pathway_opened', 'jobs_clicked',
    'career_card_opened', 'career_card_generated', 'share_initiated',
    'image_saved', 'save_journey_clicked', 'result_claimed',
    'feedback_submitted', 'result_downloaded',
    'career_center_test_started', 'career_filter_used'
  ]::text[];
$$;

COMMIT;
