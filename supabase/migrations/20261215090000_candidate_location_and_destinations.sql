-- Candidate current location and desired work destinations, kept apart.
--
-- ── WHY TWO TABLES AND NOT A COLUMN SOMEWHERE ───────────────────────────
--
-- The India entry journey asks a new candidate three different questions that
-- the product had no place to answer truthfully:
--
--   * where do you LIVE now?          → the Profile owns this
--   * where do you WORK now?          → sp_passport_profiles.jurisdiction_code
--                                        (20260908093000), unchanged here
--   * where would you LIKE to work?   → job preferences own this
--
-- and four it must never infer from those answers: a credential's jurisdiction,
-- nationality, immigration or right-to-work status, and market access.
--
-- `profiles.country` already exists, but nothing in the application writes it,
-- the admin anonymisation clears it, and nothing records what it means. Reusing
-- it would give an unlabelled column a meaning after the fact, so it is left
-- alone. A residence answer is personal data with its own owner and its own
-- row-level boundary: it lives in candidate_current_location. A destination is
-- a PREFERENCE, never a fact about the person's standing anywhere: it lives in
-- candidate_job_preferences. Neither table is read by any Passport, catalogue,
-- sharing or recruitment function, so choosing "Dubai" can change nothing about
-- a credential, a work country or what a market lets anybody record.
--
-- ── WHAT IS DELIBERATELY NOT HERE ────────────────────────────────────────
--
-- No nationality, no passport number, no visa or residence-permit status, no
-- right-to-work flag and no "ready" score. Absence is the control: adding one is
-- a visible schema change somebody has to justify.
--
-- ── ANALYTICS ────────────────────────────────────────────────────────────
--
-- Six anonymous funnel names are added to the existing allowlist
-- (cd_v31_funnel_events, the product's only first-party analytics), exactly as
-- 20261004090000 did. Event name only; the entry point already refuses nested
-- or long detail values, and the application sends no detail for these.
--
-- Rollback: supabase/rollback/20261215090000_candidate_location_and_destinations_rollback.sql

BEGIN;

-- ── 1. Current location (Profile) ──────────────────────────────────────
CREATE TABLE public.candidate_current_location (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  -- ISO 3166-1 alpha-2. Not a foreign key to sp_jurisdictions: that table is
  -- the Passport's list of credential territories, and a person may live in a
  -- country the Passport has no credentials for.
  country_code text NOT NULL CHECK (country_code ~ '^[A-Z]{2}$'),
  -- Free text, optional, Unicode. A city or state as the person writes it.
  locality text CHECK (locality IS NULL OR (length(btrim(locality)) BETWEEN 1 AND 80
                                           AND locality !~ '[\x00-\x1f\x7f]')),
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.candidate_current_location IS
  'Where the candidate says they live now. Owned by the Profile. Not a work '
  'country, not a credential jurisdiction, not nationality and not a right to '
  'reside or work anywhere. Holder-only by RLS; no other user reads it.';

-- ── 2. Desired work destinations (Job preferences) ──────────────────────
CREATE TABLE public.candidate_job_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  -- A short governed vocabulary rather than free text: every value is one the
  -- product can say something truthful about. 'AE-DU' is Dubai (SIRA's
  -- emirate), 'AE' the other emirates. Order is the holder's.
  desired_destinations text[] NOT NULL DEFAULT '{}'::text[]
    CHECK (desired_destinations <@ ARRAY['IN','AE-DU','AE','GB','SE']::text[]
           AND cardinality(desired_destinations) <= 5
           AND array_position(desired_destinations, NULL) IS NULL),
  relocation_interest text
    CHECK (relocation_interest IS NULL
           OR relocation_interest IN ('not_looking','open','actively_looking')),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.candidate_job_preferences IS
  'Where the candidate would LIKE to work. A preference: it grants no market, '
  'changes no work country and no credential jurisdiction, and says nothing '
  'about permission to work. Holder-only by RLS.';

-- No duplicates in the destination list: an array CHECK cannot use a
-- subquery, so a small immutable helper states it.
CREATE FUNCTION public.candidate_destinations_distinct(_d text[])
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT cardinality(_d) = (SELECT count(DISTINCT x) FROM unnest(_d) AS x)
$$;
REVOKE ALL ON FUNCTION public.candidate_destinations_distinct(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.candidate_destinations_distinct(text[]) TO authenticated, service_role;
ALTER TABLE public.candidate_job_preferences
  ADD CONSTRAINT candidate_job_preferences_destinations_distinct
  CHECK (public.candidate_destinations_distinct(desired_destinations));

-- ── 3. updated_at, set by the database ─────────────────────────────────
CREATE FUNCTION public.candidate_preferences_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.updated_at := now();
  IF TG_TABLE_NAME = 'candidate_current_location' THEN
    NEW.confirmed_at := now();
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.candidate_preferences_touch() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER candidate_current_location_touch BEFORE INSERT OR UPDATE ON public.candidate_current_location
  FOR EACH ROW EXECUTE FUNCTION public.candidate_preferences_touch();
CREATE TRIGGER candidate_job_preferences_touch BEFORE INSERT OR UPDATE ON public.candidate_job_preferences
  FOR EACH ROW EXECUTE FUNCTION public.candidate_preferences_touch();

-- ── 4. The boundary: the holder, and nobody else ───────────────────────
-- The hosted platform's default privileges grant anon and authenticated every
-- table privilege (TRUNCATE included, which RLS does not cover), so the grant
-- is restated from nothing.
ALTER TABLE public.candidate_current_location ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_current_location FORCE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_job_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_job_preferences FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.candidate_current_location, public.candidate_job_preferences
  FROM PUBLIC, anon, authenticated, service_role;
-- Holder only. No service_role grant either: nothing server-side reads these
-- rows, and the one administrative path that must remove them
-- (admin_anonymise_user, below) runs as the table owner.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.candidate_current_location, public.candidate_job_preferences
  TO authenticated;

CREATE POLICY candidate_current_location_own ON public.candidate_current_location
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY candidate_job_preferences_own ON public.candidate_job_preferences
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ── 4b. Anonymisation clears them ───────────────────────────────────────
-- A residence answer is exactly the "personal profile data" admin_anonymise_user
-- exists to clear. Reproduced VERBATIM from 20260911090000 with two DELETEs and
-- one key in the `cleared` report added; nothing else changes.
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

  -- ADDED 20261215090000: where the person lives and would like to work.
  DELETE FROM public.candidate_current_location WHERE user_id = _user_id;
  DELETE FROM public.candidate_job_preferences WHERE user_id = _user_id;

  UPDATE auth.users
     SET email = _pseudonym,
         raw_user_meta_data = '{}'::jsonb,
         banned_until = now() + interval '100 years'
   WHERE id = _user_id;

  _cleared := jsonb_build_object(
    'profile', true,
    'passport_profile', EXISTS (SELECT 1 FROM public.sp_passport_profiles WHERE holder_user_id = _user_id),
    'location_and_destinations', true,
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

-- ── 5. Funnel names (anonymous, event name only) ───────────────────────
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
    'career_filter_used'::text,
    'india_landing_viewed'::text,
    'india_registration_started'::text,
    'india_registration_completed'::text,
    'passport_first_credential_saved'::text,
    'passport_review_requested'::text,
    'passport_share_link_created'::text
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
    'career_center_test_started', 'career_filter_used',
    'india_landing_viewed', 'india_registration_started', 'india_registration_completed',
    'passport_first_credential_saved', 'passport_review_requested', 'passport_share_link_created'
  ]::text[];
$$;

COMMIT;
