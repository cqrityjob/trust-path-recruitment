-- ============================================================================
-- 20261201090000 -- The library: direct access to governed BESKT content, and
-- the recruitment setup that follows a case
-- ============================================================================
--
-- Owner decision 2026-09-19 (TRUST/BESKT product structure v2.0, section 6):
-- published methods and tests in the employer offer are available directly to
-- authorised users. No employer asks CQrityjob for access, holds a content
-- role, installs a method or waits for a platform administrator to activate it.
--
-- TRUST's interview content has worked this way since 20260925090000. This
-- migration gives BESKT the same rule and nothing more:
--
--   * beskt_method_versions.pilot_availability, set once per VERSION by the
--     platform publisher (beskt_set_pilot_availability), never per employer;
--   * one entitlement predicate, bcp_offer_covers(), used by every start path
--     (assign, start, invitation acceptance, preview, profile list, listing);
--   * published runnable versions need no pilot grant any more;
--   * availability freezes content (beskt_content_gate refuses edits);
--   * bcp_offer_content_covers() keeps started work readable (continuity).
--
-- What does NOT change: no review is recorded, no version is published, no
-- validation label moves, and the five open review gates of BESKT v0.1 stay
-- open. The internal test activation and the pilot grant tables stay, unused
-- by the product path. Candidate RLS, the security function's exclusive access
-- to a vetting, organisation isolation, assessor independence and the report
-- rules are untouched.
--
-- It also adds scp_recruitment_setups: the library choice (TRUST or BESKT, role
-- group, role profile, work environment) recorded against the case or the
-- BESKT assignment it started, so no later step asks for it again.
--
-- Nine function bodies are re-created by exact substitution on the current
-- ones; each is md5-pinned below (verified equal to production 2026-09-19) and
-- restored verbatim by supabase/rollback/20261201090000_*.sql.

DO $pre$
DECLARE _n integer; _md5 text;
BEGIN
  SELECT count(*), max(md5(p.prosrc)) INTO _n, _md5 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'bcp_accept_invitation';
  IF _n <> 1 OR _md5 <> '15fa23a1e8bbf1622b6458146fdca697' THEN
    RAISE EXCEPTION 'SCP_LIBRARY_PRECONDITION: bcp_accept_invitation is not the body this migration extends (count %, md5 %).', _n, _md5;
  END IF;
  SELECT count(*), max(md5(p.prosrc)) INTO _n, _md5 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'bcp_assign';
  IF _n <> 1 OR _md5 <> '7ea7e1a3925b0ba8a7acfb1b45c17c9a' THEN
    RAISE EXCEPTION 'SCP_LIBRARY_PRECONDITION: bcp_assign is not the body this migration extends (count %, md5 %).', _n, _md5;
  END IF;
  SELECT count(*), max(md5(p.prosrc)) INTO _n, _md5 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'bcp_assignable_exposure_profiles';
  IF _n <> 1 OR _md5 <> '58024b76b3b1dd97efe50d9c1f925acf' THEN
    RAISE EXCEPTION 'SCP_LIBRARY_PRECONDITION: bcp_assignable_exposure_profiles is not the body this migration extends (count %, md5 %).', _n, _md5;
  END IF;
  SELECT count(*), max(md5(p.prosrc)) INTO _n, _md5 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'bcp_check_start';
  IF _n <> 1 OR _md5 <> 'f0b36a8abee41fb46a557b890fdac4be' THEN
    RAISE EXCEPTION 'SCP_LIBRARY_PRECONDITION: bcp_check_start is not the body this migration extends (count %, md5 %).', _n, _md5;
  END IF;
  SELECT count(*), max(md5(p.prosrc)) INTO _n, _md5 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'bcp_conduct_topic_prompts';
  IF _n <> 1 OR _md5 <> '41aebf0cf4d7a705ad08b249dfd83a12' THEN
    RAISE EXCEPTION 'SCP_LIBRARY_PRECONDITION: bcp_conduct_topic_prompts is not the body this migration extends (count %, md5 %).', _n, _md5;
  END IF;
  SELECT count(*), max(md5(p.prosrc)) INTO _n, _md5 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'bcp_method_preview';
  IF _n <> 1 OR _md5 <> '751e1c0e7995907547864a5d2822bb19' THEN
    RAISE EXCEPTION 'SCP_LIBRARY_PRECONDITION: bcp_method_preview is not the body this migration extends (count %, md5 %).', _n, _md5;
  END IF;
  SELECT count(*), max(md5(p.prosrc)) INTO _n, _md5 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'bcp_party_can_read_method_version';
  IF _n <> 1 OR _md5 <> 'a54bd6eff5b4df587b9ef362396c1881' THEN
    RAISE EXCEPTION 'SCP_LIBRARY_PRECONDITION: bcp_party_can_read_method_version is not the body this migration extends (count %, md5 %).', _n, _md5;
  END IF;
  SELECT count(*), max(md5(p.prosrc)) INTO _n, _md5 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'beskt_content_gate';
  IF _n <> 1 OR _md5 <> '21eb1c0e2472d2fcf34ed39930f50761' THEN
    RAISE EXCEPTION 'SCP_LIBRARY_PRECONDITION: beskt_content_gate is not the body this migration extends (count %, md5 %).', _n, _md5;
  END IF;
  SELECT count(*), max(md5(p.prosrc)) INTO _n, _md5 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'bcp_assignable_method_versions';
  IF _n <> 1 OR _md5 <> '7a832d72a556286c60dbf23d31002060' THEN
    RAISE EXCEPTION 'SCP_LIBRARY_PRECONDITION: bcp_assignable_method_versions is not the body this migration extends (count %, md5 %).', _n, _md5;
  END IF;
  IF to_regclass('public.scp_recruitment_setups') IS NOT NULL THEN
    RAISE EXCEPTION 'SCP_LIBRARY_PRECONDITION: scp_recruitment_setups already exists.';
  END IF;
END $pre$;

-- ###########################################################################
-- SECTION 1 -- Open availability: a governed CONTENT property, not a grant
-- ###########################################################################
--
-- The same rule the TRUST interview packs have had since 20260925090000
-- (owner decision 2026-08-28): CQrityjob governs CONTENT -- creates, reviews,
-- versions, makes available, withdraws, retires -- and never enables the
-- product employer by employer. For BESKT:
--
--   BEFORE   startable = (published AND runnable AND employer-specific pilot grant)
--                        OR employer-specific internal test activation
--
--   AFTER    startable = employer ACTIVE AND (
--                          published AND runnable                    (production)
--                          OR made AVAILABLE by the publisher while still
--                             draft / in review, complete for its mode  (open pilot)
--                          OR employer-specific internal test activation (kept))
--
-- The pilot grant table and the internal test activation survive untouched;
-- neither is REQUIRED any more. Making a version available does not review,
-- publish or relabel it: validation_label stays what it is and every review
-- gate that is open stays open. Availability FREEZES the content, so what an
-- employer sees cannot drift under an assignment; withdraw first, then edit.

ALTER TABLE public.beskt_method_versions
  ADD COLUMN pilot_availability text NOT NULL DEFAULT 'restricted'
  CONSTRAINT beskt_method_versions_pilot_availability_check
  CHECK (pilot_availability IN ('restricted', 'open'));

COMMENT ON COLUMN public.beskt_method_versions.pilot_availability IS
  'Governed content property, set only by beskt_set_pilot_availability() (platform '
  'publisher). ''open'' makes a draft or in-review version, complete for its mode, '
  'startable by every ACTIVE employer without a per-employer grant; it neither '
  'reviews nor publishes the version, and it freezes its content. From publication '
  'on, content_status governs alone and the column is frozen by the version guard.';

ALTER TABLE public.beskt_method_events DROP CONSTRAINT beskt_method_events_event_check;
ALTER TABLE public.beskt_method_events ADD CONSTRAINT beskt_method_events_event_check
  CHECK (event = ANY (ARRAY['method_created', 'version_created', 'new_version_created',
    'draft_touched', 'submitted_for_review', 'review_approved', 'review_rejected',
    'published', 'suspended', 'retired', 'content_upserted', 'content_deleted',
    'availability_opened', 'availability_withdrawn']));

-- INTERNAL. True while the publisher has made this unpublished version available
-- AND it is still draft or in review AND it is complete and structurally safe for
-- its own mode. Suspending or retiring cannot reach it: those follow publication.
CREATE OR REPLACE FUNCTION public.bcp_open_pilot_available(_method_version_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
           SELECT 1 FROM public.beskt_method_versions v
            WHERE v.id = _method_version_id
              AND v.pilot_availability = 'open'
              AND v.content_status IN ('draft', 'in_review')
              AND v.content_hash IS NOT NULL)
     AND public.bcp_version_is_structurally_candidate_safe(_method_version_id);
$$;

-- INTERNAL. The one entitlement rule every start path asks: may this employer
-- start this version now?
CREATE OR REPLACE FUNCTION public.bcp_offer_covers(_employer_id uuid, _method_version_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(public.employer_is_active_status(_employer_id), false)
     AND (public.bcp_version_is_runnable(_method_version_id)
          OR public.bcp_open_pilot_available(_method_version_id)
          OR public.bcp_internal_test_activation_active(_employer_id, _method_version_id));
$$;

-- INTERNAL. Continuity: may an assignment that already exists keep reading the
-- content it pinned? Yes for published runnable content, for the exact content
-- an internal test activation covered, and for the exact (unchanged) content of
-- a draft or in-review version it was started on. Withdrawing availability stops
-- NEW starts; it does not pull the questions out from under a started one. An
-- edit after withdrawal changes the hash, and the pin no longer matches.
CREATE OR REPLACE FUNCTION public.bcp_offer_content_covers(
  _employer_id uuid, _method_version_id uuid, _pinned_content_hash text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.bcp_version_is_runnable(_method_version_id)
      OR public.bcp_internal_test_activation_covers(_employer_id, _method_version_id,
                                                    _pinned_content_hash)
      OR (EXISTS (SELECT 1 FROM public.beskt_method_versions v
                   WHERE v.id = _method_version_id
                     AND v.content_status IN ('draft', 'in_review')
                     AND v.content_hash IS NOT NULL
                     AND v.content_hash = _pinned_content_hash)
          AND public.bcp_version_is_structurally_candidate_safe(_method_version_id));
$$;

-- The governed setter. Platform publisher only, one reason, an operation receipt.
-- Setting the state it already has is answered, not refused: a repeated or
-- concurrent click changes nothing and creates nothing.
CREATE OR REPLACE FUNCTION public.beskt_set_pilot_availability(
  _operation_id uuid, _method_version_id uuid, _available boolean, _reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _request_hash text;
  _replay jsonb;
  _v public.beskt_method_versions%ROWTYPE;
  _target text := CASE WHEN _available THEN 'open' ELSE 'restricted' END;
  _result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'BESKT_NOT_AUTHENTICATED' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _available IS NULL THEN
    RAISE EXCEPTION 'BESKT_AVAILABILITY_REQUIRED' USING ERRCODE = 'check_violation';
  END IF;
  _request_hash := public.beskt_request_hash(jsonb_build_object(
    'op', 'set_pilot_availability', 'method_version_id', _method_version_id,
    'available', _available, 'reason', _reason));
  _replay := public.beskt_operation_begin(_operation_id, _request_hash);
  IF _replay IS NOT NULL THEN RETURN _replay; END IF;

  IF NOT public.scp_has_content_role(auth.uid(), 'publisher') THEN
    RAISE EXCEPTION 'BESKT_NOT_PUBLISHER: changing availability requires the platform publisher role.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _reason IS NULL OR length(btrim(_reason)) < 3 THEN
    RAISE EXCEPTION 'BESKT_REASON_REQUIRED: an availability change carries a written reason.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO _v FROM public.beskt_method_versions WHERE id = _method_version_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BESKT_VERSION_NOT_FOUND' USING ERRCODE = 'check_violation';
  END IF;
  IF _v.content_status NOT IN ('draft', 'in_review') THEN
    RAISE EXCEPTION
      'BESKT_NOT_OPENABLE: availability applies to draft and in-review content; from publication on the status governs alone (this version is "%").',
      _v.content_status USING ERRCODE = 'check_violation';
  END IF;

  IF _v.pilot_availability = _target THEN
    RETURN jsonb_build_object('method_version_id', _v.id, 'pilot_availability', _target,
                              'revision', _v.revision, 'changed', false);
  END IF;

  IF _available AND (_v.content_hash IS NULL
                     OR NOT public.bcp_version_is_structurally_candidate_safe(_v.id)) THEN
    RAISE EXCEPTION
      'BESKT_NOT_OPENABLE_INCOMPLETE: the version is not complete for its mode (content hash, exposure profile and, for a security vetting, its activation requirements).'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('beskt.governed_transition', 'on', true);
  UPDATE public.beskt_method_versions
     SET pilot_availability = _target, revision = _v.revision + 1, updated_at = now()
   WHERE id = _v.id;
  PERFORM set_config('beskt.governed_transition', 'off', true);

  _result := jsonb_build_object('method_version_id', _v.id, 'pilot_availability', _target,
                                'revision', _v.revision + 1, 'changed', true,
                                'content_hash', _v.content_hash);
  PERFORM public.beskt_record_event(_v.pack_id, _v.id,
    CASE WHEN _available THEN 'availability_opened' ELSE 'availability_withdrawn' END,
    _v.content_status, _v.content_status, btrim(_reason), _v.content_hash, _v.revision + 1,
    _operation_id, _request_hash, _result, '{}'::jsonb);
  RETURN _result;
END;
$$;


-- ###########################################################################
-- SECTION 2 -- The recruitment setup: method, role, environment, carried along
-- ###########################################################################
--
-- What the employer chose in the library -- TRUST or BESKT, the role group,
-- the role profile and the work environment -- recorded once against the case
-- or the BESKT assignment it started, so no later step asks for it again. The
-- content version is not repeated here: the case pins its pack version and the
-- assignment its method version, and those pins stay the source of truth.
--
-- Immutable: a setup describes a start that happened. The one later write is
-- attaching the interview case a BESKT assignment was carried into.

CREATE TABLE public.scp_recruitment_setups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id uuid NOT NULL REFERENCES public.employers(id) ON DELETE RESTRICT,
  method text NOT NULL CHECK (method IN ('trust', 'beskt')),
  role_group text NOT NULL CHECK (role_group IN ('operational', 'strategic')),
  role_profile text NOT NULL CHECK (role_profile ~ '^[a-z][a-z0-9_]{1,39}$'),
  environment text NOT NULL
    CHECK (environment IN ('general', 'data_centre', 'hospital', 'shopping_centre')),
  interview_case_id uuid UNIQUE REFERENCES public.scp_interview_cases(id) ON DELETE RESTRICT,
  beskt_assignment_id uuid UNIQUE REFERENCES public.bcp_assignments(id) ON DELETE RESTRICT,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scp_recruitment_setups_anchor_check
    CHECK (interview_case_id IS NOT NULL OR beskt_assignment_id IS NOT NULL),
  CONSTRAINT scp_recruitment_setups_method_anchor_check
    CHECK (method = 'beskt' OR beskt_assignment_id IS NULL)
);

COMMENT ON TABLE public.scp_recruitment_setups IS
  'The library choice (method, role group, role profile, work environment) a case '
  'or BESKT assignment was started with. Written only by scp_record_recruitment_setup(); '
  'immutable except for attaching the interview case a BESKT assignment was carried into.';

-- RLS enabled and, as for every scp_ table (decision B), not forced: the table
-- owner is the migration role, and client access is SELECT through the policy.
ALTER TABLE public.scp_recruitment_setups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.scp_recruitment_setups FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.scp_recruitment_setups TO authenticated;
GRANT ALL ON public.scp_recruitment_setups TO service_role;

-- Readable exactly where the thing it describes is readable: the case to a
-- reader of the case, the assignment to its employer party. A vetting's setup
-- therefore follows the vetting's own restriction to the security function.
CREATE POLICY scp_recruitment_setups_read ON public.scp_recruitment_setups
  FOR SELECT TO authenticated
  USING ((interview_case_id IS NOT NULL AND public.scp_iv_can_read_case(interview_case_id))
         OR (beskt_assignment_id IS NOT NULL AND public.bcp_employer_party(beskt_assignment_id)));

CREATE OR REPLACE FUNCTION public.scp_guard_recruitment_setup()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF coalesce(current_setting('scp.recruitment_setup_write', true), '') <> 'on' THEN
    RAISE EXCEPTION 'SCP_SETUP_UNGOVERNED_WRITE: a recruitment setup is written only by scp_record_recruitment_setup().'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'SCP_SETUP_APPEND_ONLY: a recruitment setup is never deleted.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE'
     AND NOT (OLD.interview_case_id IS NULL AND NEW.interview_case_id IS NOT NULL
              AND (to_jsonb(NEW) - 'interview_case_id') = (to_jsonb(OLD) - 'interview_case_id')) THEN
    RAISE EXCEPTION 'SCP_SETUP_IMMUTABLE: only the interview case a BESKT assignment was carried into may be attached, once.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER scp_recruitment_setups_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.scp_recruitment_setups
  FOR EACH ROW EXECUTE FUNCTION public.scp_guard_recruitment_setup();

-- Records the setup of a case or a BESKT assignment the caller may work on.
-- Idempotent: the same setup for the same anchor answers with the same id; a
-- different one is refused. Passing both anchors attaches the case to the
-- setup the assignment was started with (or records it, if there was none).
CREATE OR REPLACE FUNCTION public.scp_record_recruitment_setup(
  _employer_id uuid, _method text, _role_group text, _role_profile text, _environment text,
  _interview_case_id uuid, _beskt_assignment_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.scp_recruitment_setups%ROWTYPE;
  _id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'SCP_NOT_AUTHENTICATED' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _interview_case_id IS NULL AND _beskt_assignment_id IS NULL THEN
    RAISE EXCEPTION 'SCP_SETUP_ANCHOR_REQUIRED: a setup describes a case or a BESKT assignment.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _interview_case_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.scp_interview_cases c
        WHERE c.id = _interview_case_id AND c.employer_id = _employer_id
          AND public.scp_iv_can_write_case(c.id)) THEN
    RAISE EXCEPTION 'SCP_SETUP_NOT_PERMITTED' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _beskt_assignment_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.bcp_assignments a
        WHERE a.id = _beskt_assignment_id AND a.employer_id = _employer_id
          AND public.bcp_employer_party(a.id)) THEN
    RAISE EXCEPTION 'SCP_SETUP_NOT_PERMITTED' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _beskt_assignment_id IS NOT NULL AND _method <> 'beskt' THEN
    RAISE EXCEPTION 'SCP_SETUP_METHOD_MISMATCH: a BESKT assignment has a BESKT setup.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Serialise every write for the same anchors.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'scp_setup:' || coalesce(_interview_case_id::text, '') || ':' || coalesce(_beskt_assignment_id::text, ''), 0));

  SELECT * INTO _row FROM public.scp_recruitment_setups s
   WHERE (_beskt_assignment_id IS NOT NULL AND s.beskt_assignment_id = _beskt_assignment_id)
      OR (_beskt_assignment_id IS NULL AND s.interview_case_id = _interview_case_id)
   FOR UPDATE;
  IF FOUND THEN
    IF (_row.method, _row.role_group, _row.role_profile, _row.environment)
       IS DISTINCT FROM (_method, _role_group, _role_profile, _environment) THEN
      RAISE EXCEPTION 'SCP_SETUP_ALREADY_RECORDED: this start already has a different setup.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF _interview_case_id IS NOT NULL AND _row.interview_case_id IS DISTINCT FROM _interview_case_id THEN
      IF _row.interview_case_id IS NOT NULL THEN
        RAISE EXCEPTION 'SCP_SETUP_ALREADY_RECORDED: this assignment is already carried into another case.'
          USING ERRCODE = 'check_violation';
      END IF;
      PERFORM set_config('scp.recruitment_setup_write', 'on', true);
      UPDATE public.scp_recruitment_setups SET interview_case_id = _interview_case_id WHERE id = _row.id;
      PERFORM set_config('scp.recruitment_setup_write', 'off', true);
    END IF;
    RETURN _row.id;
  END IF;

  PERFORM set_config('scp.recruitment_setup_write', 'on', true);
  INSERT INTO public.scp_recruitment_setups
    (employer_id, method, role_group, role_profile, environment,
     interview_case_id, beskt_assignment_id, created_by)
  VALUES
    (_employer_id, _method, _role_group, _role_profile, _environment,
     _interview_case_id, _beskt_assignment_id, auth.uid())
  RETURNING id INTO _id;
  PERFORM set_config('scp.recruitment_setup_write', 'off', true);
  RETURN _id;
END;
$$;

-- ###########################################################################
-- SECTION 3 -- The start paths, on the one entitlement rule (bodies md5-pinned)
-- ###########################################################################

CREATE OR REPLACE FUNCTION public.bcp_accept_invitation(_operation_id uuid, _token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _i public.bcp_invitations%ROWTYPE; _v public.beskt_method_versions%ROWTYPE;
  _email text; _confirmed boolean; _request jsonb; _hash text; _replay jsonb; _id uuid; _result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'BCP_NOT_AUTHENTICATED' USING ERRCODE = 'insufficient_privilege';
  END IF;
  _request := jsonb_build_object('op', 'bcp_accept_invitation',
    'token_digest', public.bcp_invitation_token_digest(_token));
  _hash := public.beskt_request_hash(_request);
  _replay := public.bcp_operation_begin(_operation_id, _hash);
  IF _replay IS NOT NULL THEN RETURN _replay; END IF;

  SELECT lower(u.email), u.email_confirmed_at IS NOT NULL INTO _email, _confirmed
    FROM auth.users u WHERE u.id = auth.uid();
  SELECT * INTO _i FROM public.bcp_invitations
   WHERE token_digest = public.bcp_invitation_token_digest(_token) FOR UPDATE;
  IF NOT FOUND OR _i.invited_email <> _email THEN
    RAISE EXCEPTION 'BCP_INVITATION_NOT_AVAILABLE: this invitation is not available to this account.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT _confirmed THEN
    RAISE EXCEPTION 'BCP_EMAIL_NOT_CONFIRMED: confirm your e-mail address first.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _i.state <> 'pending' OR _i.expires_at <= now() THEN
    RAISE EXCEPTION 'BCP_INVITATION_NOT_PENDING: this invitation is no longer open.' USING ERRCODE = 'check_violation';
  END IF;
  IF auth.uid() = _i.created_by OR public.has_employer_role(auth.uid(), _i.employer_id, ARRAY['owner', 'admin', 'member']) THEN
    RAISE EXCEPTION 'BCP_CANDIDATE_IS_EMPLOYER_MEMBER: a member of the inviting organisation cannot be its own candidate here.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO _v FROM public.beskt_method_versions WHERE id = _i.method_version_id;
  -- The gate is re-checked at acceptance: an activation revoked, or content
  -- changed, since the invitation was sent means there is nothing to accept.
  IF _v.content_hash IS DISTINCT FROM _i.pinned_content_hash
     -- 20261201090000: the one entitlement rule, no per-employer grant.
     OR NOT public.bcp_offer_covers(_i.employer_id, _v.id) THEN
    RAISE EXCEPTION 'BCP_NOT_ASSIGNABLE: the method this invitation was for is no longer available; ask the employer for a new invitation.'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.bcp_assignments
    (employer_id, job_id, application_id, invitation_id, role_title, candidate_user_id,
     method_version_id, exposure_profile_id, mode, pinned_content_hash, pinned_release_scope,
     notice_version, due_at, assigned_by, responsible_interviewer_id, contact_statement,
     security_owner_id, role_security_attestation, lawful_basis_statement)
  VALUES
    (_i.employer_id, NULL, NULL, _i.id, _i.role_title, auth.uid(),
     _i.method_version_id, _i.exposure_profile_id, _i.mode, _i.pinned_content_hash, _v.release_scope,
     _i.notice_version, _i.due_at, _i.created_by, _i.responsible_interviewer_id, _i.contact_statement,
     _i.security_owner_id, _i.role_security_attestation, _i.lawful_basis_statement)
  RETURNING id INTO _id;

  PERFORM set_config('bcp.invitation_write', 'on', true);
  UPDATE public.bcp_invitations SET state = 'accepted', accepted_by = auth.uid(), accepted_at = now(),
         assignment_id = _id WHERE id = _i.id;
  PERFORM set_config('bcp.invitation_write', 'off', true);

  _result := jsonb_build_object('assignment_id', _id, 'invitation_id', _i.id, 'mode', _i.mode);
  PERFORM public.bcp_record_event(_id, NULL, _i.employer_id, _i.method_version_id, 'invitation_accepted',
    'pending', 'accepted', NULL, _i.pinned_content_hash, 1, _operation_id, _hash, _result);
  RETURN _result;
END $function$;

CREATE OR REPLACE FUNCTION public.bcp_assign(_operation_id uuid, _application_id uuid, _method_version_id uuid, _exposure_profile_id uuid, _expected_content_hash text, _notice_version text, _due_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _request jsonb; _hash text; _replay jsonb;
  _ja public.job_applications%ROWTYPE;
  _v public.beskt_method_versions%ROWTYPE;
  _p public.beskt_exposure_profiles%ROWTYPE;
  _id uuid; _result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'BCP_NOT_AUTHENTICATED' USING ERRCODE = 'insufficient_privilege';
  END IF;
  _request := jsonb_build_object('op', 'assign', 'application_id', _application_id,
    'method_version_id', _method_version_id, 'exposure_profile_id', _exposure_profile_id,
    'expected_content_hash', _expected_content_hash, 'notice_version', _notice_version,
    'due_at', _due_at);
  _hash := public.beskt_request_hash(_request);
  _replay := public.bcp_operation_begin(_operation_id, _hash);
  IF _replay IS NOT NULL THEN RETURN _replay; END IF;

  -- ---- the existing spine: application, employer, job, candidate ---------
  SELECT * INTO _ja FROM public.job_applications WHERE id = _application_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BCP_APPLICATION_NOT_FOUND' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT public.has_employer_role(auth.uid(), _ja.employer_id, ARRAY['owner', 'admin', 'member']) THEN
    RAISE EXCEPTION 'BCP_NOT_EMPLOYER_MEMBER: starting a preparation requires an active membership of the employer that owns this application.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT coalesce(public.employer_is_active_status(_ja.employer_id), false) THEN
    RAISE EXCEPTION 'BCP_EMPLOYER_NOT_ACTIVE: this employer account is not active, so it cannot start preparations.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _ja.withdrawn_at IS NOT NULL THEN
    RAISE EXCEPTION 'BCP_APPLICATION_WITHDRAWN: the candidate withdrew this application.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _ja.applicant_user_id IS NULL THEN
    RAISE EXCEPTION 'BCP_CANDIDATE_UNKNOWN: this application has no signed-in applicant, so there is nobody to prepare.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.jobs j
                  WHERE j.id = _ja.job_id AND j.employer_id = _ja.employer_id) THEN
    RAISE EXCEPTION 'BCP_CROSS_TENANT_JOB: that job belongs to a different employer.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ---- the governed method: published, recruitment support, pinned ------
  SELECT * INTO _v FROM public.beskt_method_versions WHERE id = _method_version_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BCP_METHOD_VERSION_NOT_FOUND' USING ERRCODE = 'check_violation';
  END IF;
  -- 20261129090000: or a version covered by this employer's live internal
  -- test activation -- the owner's recorded decision, never a review.
  -- 20261201090000: or a version the publisher made available to every
  -- active employer while it is still draft or in review.
  IF _v.content_status <> 'published'
     AND NOT public.bcp_open_pilot_available(_method_version_id)
     AND NOT public.bcp_internal_test_activation_active(_ja.employer_id, _method_version_id) THEN
    RAISE EXCEPTION 'BCP_METHOD_NOT_PUBLISHED: this method version is "%"; only a published version, one made available to employers, or one under this employer''s live internal test activation, may be assigned.', _v.content_status
      USING ERRCODE = 'check_violation';
  END IF;
  IF _v.mode <> 'recruitment_support' THEN
    RAISE EXCEPTION 'BCP_METHOD_MODE_NOT_PERMITTED: BESKT PR 3 assigns recruitment-support content only.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT (public.bcp_version_is_candidate_safe(_method_version_id)
          OR public.bcp_open_pilot_available(_method_version_id)
          OR public.bcp_internal_test_activation_active(_ja.employer_id, _method_version_id)) THEN
    RAISE EXCEPTION 'BCP_METHOD_NOT_CANDIDATE_SAFE: this version holds security-vetting content and can never be put in front of a candidate here.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO _p FROM public.beskt_exposure_profiles WHERE id = _exposure_profile_id;
  IF NOT FOUND OR _p.method_version_id IS DISTINCT FROM _method_version_id THEN
    RAISE EXCEPTION 'BCP_PROFILE_NOT_IN_VERSION: the exposure profile does not belong to this method version.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _p.permitted_mode <> 'recruitment_support' THEN
    RAISE EXCEPTION 'BCP_PROFILE_MODE_NOT_PERMITTED: this exposure profile is not recruitment support.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- The caller names the content it was looking at; a method edited or
  -- republished since is a different question set and is refused.
  IF _expected_content_hash IS NULL OR _v.content_hash IS DISTINCT FROM _expected_content_hash THEN
    RAISE EXCEPTION 'BCP_CONTENT_HASH_MISMATCH: this method version is at content hash %, not %. Reload and retry.',
      coalesce(_v.content_hash, '(null)'), coalesce(_expected_content_hash, '(null)')
      USING ERRCODE = 'check_violation';
  END IF;

  -- ---- the explicit release gate ----------------------------------------
  -- 20261201090000: the one entitlement rule, no per-employer grant.
  IF NOT public.bcp_offer_covers(_ja.employer_id, _method_version_id) THEN
    RAISE EXCEPTION 'BCP_NOT_ASSIGNABLE: this BESKT method version is not available to this employer.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _notice_version IS DISTINCT FROM public.bcp_notice_version() THEN
    RAISE EXCEPTION 'BCP_NOTICE_VERSION_UNKNOWN: the current candidate notice is "%".', public.bcp_notice_version()
      USING ERRCODE = 'check_violation';
  END IF;

  -- One live preparation per application. Serialise so two members cannot
  -- both pass the check.
  PERFORM pg_advisory_xact_lock(hashtextextended('bcp_application:' || _application_id::text, 0));
  IF EXISTS (SELECT 1 FROM public.bcp_assignments a
              WHERE a.application_id = _application_id AND a.lifecycle_state <> 'cancelled') THEN
    RAISE EXCEPTION 'BCP_ASSIGNMENT_EXISTS: this application already has a live BESKT preparation.'
      USING ERRCODE = 'unique_violation';
  END IF;

  INSERT INTO public.bcp_assignments
    (employer_id, job_id, application_id, candidate_user_id, method_version_id,
     exposure_profile_id, pinned_content_hash, pinned_release_scope, notice_version,
     due_at, assigned_by)
  VALUES
    (_ja.employer_id, _ja.job_id, _application_id, _ja.applicant_user_id, _method_version_id,
     _exposure_profile_id, _v.content_hash, _v.release_scope, _notice_version,
     _due_at, auth.uid())
  RETURNING id INTO _id;

  _result := jsonb_build_object(
    'assignment_id', _id, 'application_id', _application_id, 'employer_id', _ja.employer_id,
    'job_id', _ja.job_id, 'candidate_user_id', _ja.applicant_user_id,
    'method_version_id', _method_version_id, 'exposure_profile_id', _exposure_profile_id,
    'content_hash', _v.content_hash, 'notice_version', _notice_version,
    'lifecycle_state', 'assigned', 'revision', 1, 'operation_id', _operation_id);
  PERFORM public.bcp_record_event(_id, NULL, _ja.employer_id, _method_version_id,
    'assignment_created', NULL, 'assigned', NULL, _v.content_hash, 1, _operation_id, _hash, _result);
  RETURN _result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.bcp_assignable_exposure_profiles(_employer_id uuid, _method_version_id uuid)
 RETURNS TABLE(exposure_profile_id uuid, profile_key text, display_order integer, exposure_area text, duties_sv text, duties_en text, role_relevance_rationale_sv text, role_relevance_rationale_en text, retention_class text, candidate_item_count integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.has_employer_role(auth.uid(), _employer_id, ARRAY['owner', 'admin', 'member'])
     OR NOT coalesce(public.employer_is_active_status(_employer_id), false)
     OR NOT public.bcp_offer_covers(_employer_id, _method_version_id) THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT p.id, p.profile_key, p.display_order, p.exposure_area,
           p.duties_sv, p.duties_en,
           p.role_relevance_rationale_sv, p.role_relevance_rationale_en,
           p.retention_class,
           (SELECT count(*)::integer FROM public.beskt_items i
             WHERE i.exposure_profile_id = p.id
               AND i.phase = 'candidate_preparation'
               AND (i.permitted_mode = 'recruitment_support'
                    OR p.permitted_mode = 'security_vetting_support'))
      FROM public.beskt_exposure_profiles p
     WHERE p.method_version_id = _method_version_id
       AND p.permitted_mode = (SELECT v.mode FROM public.beskt_method_versions v
                                WHERE v.id = _method_version_id)
     ORDER BY p.display_order, p.profile_key;
END;
$function$;

CREATE OR REPLACE FUNCTION public.bcp_check_start(_employer_id uuid, _mode text, _method_version_id uuid, _exposure_profile_id uuid, _expected_content_hash text, _responsible_interviewer_id uuid, _contact_statement text, _security_owner_id uuid, _role_security_attestation text, _lawful_basis_statement text)
 RETURNS beskt_method_versions
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _v public.beskt_method_versions%ROWTYPE; _p public.beskt_exposure_profiles%ROWTYPE;
BEGIN
  IF NOT public.has_employer_role(auth.uid(), _employer_id, ARRAY['owner', 'admin', 'member']) THEN
    RAISE EXCEPTION 'BCP_NOT_EMPLOYER_MEMBER: starting BESKT requires an active membership of this employer.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT coalesce(public.employer_is_active_status(_employer_id), false) THEN
    RAISE EXCEPTION 'BCP_EMPLOYER_NOT_ACTIVE: this employer account is not active.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _mode NOT IN ('recruitment_support', 'security_vetting_support') THEN
    RAISE EXCEPTION 'BCP_MODE_UNKNOWN: "%".', _mode USING ERRCODE = 'check_violation';
  END IF;
  IF _mode = 'security_vetting_support' AND NOT public.bcp_is_security_officer(_employer_id, auth.uid()) THEN
    RAISE EXCEPTION 'BCP_NOT_SECURITY_OFFICER: only the employer''s appointed security function starts a security vetting.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO _v FROM public.beskt_method_versions WHERE id = _method_version_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BCP_METHOD_VERSION_NOT_FOUND' USING ERRCODE = 'check_violation';
  END IF;
  IF _v.mode <> _mode THEN
    RAISE EXCEPTION 'BCP_METHOD_MODE_NOT_PERMITTED: this method version is for %, not %.', _v.mode, _mode
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- 20261201090000: the one entitlement rule, no per-employer grant.
  IF NOT public.bcp_offer_covers(_employer_id, _method_version_id) THEN
    RAISE EXCEPTION 'BCP_NOT_ASSIGNABLE: this BESKT method version is not available to this employer.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _expected_content_hash IS NULL OR _v.content_hash IS DISTINCT FROM _expected_content_hash THEN
    RAISE EXCEPTION 'BCP_CONTENT_HASH_MISMATCH: this method version is at content hash %, not %. Reload and retry.',
      coalesce(_v.content_hash, '(null)'), coalesce(_expected_content_hash, '(null)')
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO _p FROM public.beskt_exposure_profiles WHERE id = _exposure_profile_id;
  IF NOT FOUND OR _p.method_version_id IS DISTINCT FROM _method_version_id THEN
    RAISE EXCEPTION 'BCP_PROFILE_NOT_IN_VERSION: the exposure profile does not belong to this method version.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _p.permitted_mode <> _mode THEN
    RAISE EXCEPTION 'BCP_PROFILE_MODE_NOT_PERMITTED: this exposure profile is for %.', _p.permitted_mode
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _responsible_interviewer_id IS NULL
     OR NOT public.has_employer_role(_responsible_interviewer_id, _employer_id, ARRAY['owner', 'admin', 'member']) THEN
    RAISE EXCEPTION 'BCP_INTERVIEWER_NOT_MEMBER: the responsible interviewer must be an active member of this employer.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF length(btrim(coalesce(_contact_statement, ''))) < 3 THEN
    RAISE EXCEPTION 'BCP_CONTACT_REQUIRED: tell the candidate how to reach you.' USING ERRCODE = 'check_violation';
  END IF;

  IF _mode = 'security_vetting_support' THEN
    IF NOT public.bcp_is_security_officer(_employer_id, _responsible_interviewer_id) THEN
      RAISE EXCEPTION 'BCP_INTERVIEWER_NOT_SECURITY_OFFICER: in a security vetting the responsible interviewer belongs to the appointed security function.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NOT public.bcp_is_security_officer(_employer_id, _security_owner_id) THEN
      RAISE EXCEPTION 'BCP_SECURITY_OWNER_REQUIRED: name the appointed security officer who owns this vetting.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF length(btrim(coalesce(_role_security_attestation, ''))) < 20 THEN
      RAISE EXCEPTION 'BCP_ATTESTATION_REQUIRED: attest, in your own words, that this role is security-sensitive.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF length(btrim(coalesce(_lawful_basis_statement, ''))) < 20 THEN
      RAISE EXCEPTION 'BCP_LAWFUL_BASIS_REQUIRED: state the lawful basis your organisation relies on.'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF _security_owner_id IS NOT NULL OR _role_security_attestation IS NOT NULL OR _lawful_basis_statement IS NOT NULL THEN
    RAISE EXCEPTION 'BCP_VETTING_FIELDS_OUT_OF_MODE: an attestation and a security owner belong to a security vetting only.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN _v;
END $function$;

CREATE OR REPLACE FUNCTION public.bcp_conduct_topic_prompts(_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _s public.bcp_conduct_sessions%ROWTYPE;
  _a public.bcp_assignments%ROWTYPE;
  _v public.beskt_method_versions%ROWTYPE;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'BCP_NOT_AUTHENTICATED: sign in first.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO _s FROM public.bcp_conduct_sessions WHERE id = _session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BCP_CONDUCT_SESSION_NOT_FOUND: no such conduct session.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The EXISTING case authority. A caller who cannot read the case cannot
  -- learn anything here, including whether the session exists in a readable
  -- state -- the refusal above is reached only for a session id that is not
  -- a session at all.
  IF NOT public.scp_iv_can_read_case(_s.case_id) THEN
    RAISE EXCEPTION 'BCP_CONDUCT_NOT_PERMITTED: you may not read this interview case.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO _a FROM public.bcp_assignments WHERE id = _s.assignment_id;
  SELECT * INTO _v FROM public.beskt_method_versions WHERE id = _s.bound_method_version_id;

  -- A version that is no longer published stops answering. Not an error: the
  -- interview's own record is unaffected and the screen says the wordings are
  -- unavailable, which is true and is different from inventing them.
  -- 20261129090000: unless it is the exact content an internal test
  -- activation of the assignment's employer covered -- the same rule as the
  -- party read, so a started test keeps its wordings after a revocation.
  IF _v.id IS NULL
     OR (_v.content_status <> 'published'
         AND NOT public.bcp_offer_content_covers(_a.employer_id, _v.id, _a.pinned_content_hash))
     OR _v.mode NOT IN ('recruitment_support', 'security_vetting_support') THEN
    RETURN jsonb_build_object(
      'session_id', _session_id,
      'method_version_id', _s.bound_method_version_id,
      'available', false,
      'reason', CASE WHEN _v.id IS NULL THEN 'version_not_found'
                     WHEN _v.mode NOT IN ('recruitment_support', 'security_vetting_support') THEN 'mode_not_permitted'
                     ELSE 'version_not_published' END,
      'topics', '[]'::jsonb,
      'stage_prompts', '[]'::jsonb,
      'produces_score', false,
      'interpretation', 'none');
  END IF;

  RETURN jsonb_build_object(
    'session_id', _session_id,
    'method_version_id', _v.id,
    'content_hash', _s.bound_content_hash,
    'available', true,
    'reason', NULL,

    -- Per frozen topic: the item's own governed wording and purpose, and the
    -- prompts that name that item. Ordered by the method's own display order.
    'topics', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'topic_id', t.id,
          'item_key', t.item_key,
          'reason', t.topic_reason,
          'prompts', coalesce((
            SELECT jsonb_agg(jsonb_build_object(
                'prompt_key', pr.prompt_key,
                'display_order', pr.display_order,
                'prompt_kind', pr.prompt_kind,
                'peace_stage', pr.peace_stage,
                'addressee', pr.addressee,
                'question_form', pr.question_form,
                'permitted_probe_bases', public.beskt_sorted_array(pr.permitted_probe_bases),
                'wording_sv', pr.wording_sv,
                'wording_en', pr.wording_en)
              ORDER BY pr.display_order, pr.prompt_key)
              FROM public.beskt_prompts pr
              JOIN public.beskt_items pi ON pi.id = pr.item_id
             WHERE pr.method_version_id = _v.id
               AND pr.item_id = t.item_id
               AND pr.exposure_profile_id = _a.exposure_profile_id
               AND pr.permitted_mode IN ('recruitment_support', _v.mode)
               AND pi.permitted_mode IN ('recruitment_support', _v.mode)
               AND pi.access_class <> 'authorised_security_function'), '[]'::jsonb))
        ORDER BY t.display_order)
        FROM public.bcp_case_topics t
        JOIN public.beskt_items i ON i.id = t.item_id
       WHERE t.link_id = _s.link_id
         AND i.permitted_mode IN ('recruitment_support', _v.mode)
         AND i.access_class <> 'authorised_security_function'), '[]'::jsonb),

    -- The method's own structure for the conversation, which belongs to no
    -- single item.
    'stage_prompts', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'prompt_key', pr.prompt_key,
          'display_order', pr.display_order,
          'prompt_kind', pr.prompt_kind,
          'peace_stage', pr.peace_stage,
          'addressee', pr.addressee,
          'question_form', pr.question_form,
          'wording_sv', pr.wording_sv,
          'wording_en', pr.wording_en)
        ORDER BY pr.display_order, pr.prompt_key)
        FROM public.beskt_prompts pr
       WHERE pr.method_version_id = _v.id
         AND pr.item_id IS NULL
         AND pr.exposure_profile_id = _a.exposure_profile_id
         AND pr.permitted_mode IN ('recruitment_support', _v.mode)), '[]'::jsonb),

    -- Said in the payload itself, as every BESKT read says it.
    'produces_score', false,
    'interpretation', 'none');
END;
$function$;

CREATE OR REPLACE FUNCTION public.bcp_method_preview(_employer_id uuid, _method_version_id uuid, _exposure_profile_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _v public.beskt_method_versions%ROWTYPE; _officer boolean;
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.has_employer_role(auth.uid(), _employer_id, ARRAY['owner', 'admin', 'member']) THEN
    RAISE EXCEPTION 'BCP_NOT_EMPLOYER_MEMBER' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO _v FROM public.beskt_method_versions WHERE id = _method_version_id;
  IF NOT FOUND OR NOT public.bcp_offer_covers(_employer_id, _v.id) THEN
    RAISE EXCEPTION 'BCP_NOT_ASSIGNABLE' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.beskt_exposure_profiles p
                  WHERE p.id = _exposure_profile_id AND p.method_version_id = _v.id) THEN
    RAISE EXCEPTION 'BCP_PROFILE_NOT_IN_VERSION' USING ERRCODE = 'check_violation';
  END IF;
  _officer := public.bcp_is_security_officer(_employer_id, auth.uid());
  RETURN jsonb_build_object(
    'method_version_id', _v.id, 'mode', _v.mode, 'content_hash', _v.content_hash,
    'content_status', _v.content_status, 'validation_label', _v.validation_label,
    'wording_visible', _v.mode = 'recruitment_support' OR _officer,
    'sections', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'section_key', s.section_key, 'title_sv', s.title_sv, 'title_en', s.title_en,
          'item_count', (SELECT count(*) FROM public.beskt_items i
                          WHERE i.section_id = s.id AND i.phase = 'candidate_preparation'
                            AND i.exposure_profile_id = _exposure_profile_id),
          'items', CASE WHEN _v.mode = 'recruitment_support' OR _officer THEN coalesce((
            SELECT jsonb_agg(jsonb_build_object(
                'item_key', i.item_key, 'wording_sv', i.wording_sv, 'wording_en', i.wording_en,
                'purpose_sv', i.purpose_sv, 'purpose_en', i.purpose_en,
                'answer_type', i.answer_type, 'requiredness', i.requiredness,
                'discuss_orally_allowed', i.discuss_orally_allowed,
                'is_follow_up', EXISTS (SELECT 1 FROM public.beskt_routing_rules r
                                         WHERE r.target_item_id = i.id AND r.action = 'show'
                                           AND r.condition_kind <> 'always'),
                'sensitivity_class', i.sensitivity_class)
              ORDER BY i.display_order, i.item_key)
              FROM public.beskt_items i
             WHERE i.section_id = s.id AND i.phase = 'candidate_preparation'
               AND i.exposure_profile_id = _exposure_profile_id), '[]'::jsonb)
            ELSE '[]'::jsonb END)
        ORDER BY s.display_order, s.section_key)
        FROM public.beskt_sections s
       WHERE s.method_version_id = _v.id
         AND EXISTS (SELECT 1 FROM public.beskt_items i
                      WHERE i.section_id = s.id AND i.phase = 'candidate_preparation'
                        AND i.exposure_profile_id = _exposure_profile_id)), '[]'::jsonb));
END $function$;

CREATE OR REPLACE FUNCTION public.bcp_party_can_read_method_version(_method_version_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.bcp_assignments a
       WHERE a.method_version_id = _method_version_id
         AND a.lifecycle_state <> 'cancelled'
         AND (a.candidate_user_id = auth.uid()
              OR public.bcp_employer_party(a.id))
         -- 20261201090000: a published candidate-safe version, the exact
         -- content an internal test activation of THIS employer covered, or the
         -- exact unchanged content of the draft it was started on.
         AND public.bcp_offer_content_covers(a.employer_id, _method_version_id,
                                             a.pinned_content_hash));
$function$;

CREATE OR REPLACE FUNCTION public.beskt_content_gate(_method_version_id uuid, _expected_revision integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _v public.beskt_method_versions%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'BESKT_NOT_AUTHENTICATED' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- The SAME role beskt_touch_draft demands. Authoring content and touching a
  -- draft are the same act of editorship; inventing a second role here would
  -- mean two answers to one question.
  IF NOT public.scp_interview_can_edit(auth.uid()) THEN
    RAISE EXCEPTION
      'BESKT_NOT_EDITOR: authoring method content requires the platform content editor role.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  _v := public.beskt_lock_version(_method_version_id, _expected_revision);
  IF _v.content_status NOT IN ('draft', 'in_review') THEN
    RAISE EXCEPTION
      'BESKT_PUBLISHED_IMMUTABLE: version is "%" and can no longer be edited. Create a new version instead.',
      _v.content_status USING ERRCODE = 'check_violation';
  END IF;
  -- 20261201090000: content employers can start is frozen while it is
  -- available. Withdraw availability first, then edit.
  IF _v.pilot_availability = 'open' THEN
    RAISE EXCEPTION
      'BESKT_OPEN_FROZEN: this version is available to employers and cannot be edited; withdraw its availability first.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN jsonb_build_object(
    'method_version_id', _v.id, 'pack_id', _v.pack_id,
    'content_status', _v.content_status, 'revision', _v.revision);
END;
$function$;

-- The versions an employer may start today, of both purposes, each saying WHY:
-- published, available to employers while in review (open pilot), or under this
-- employer's internal test activation. The per-employer pilot grant is no longer
-- a condition; content_status and availability are returned so the library can
-- state the version's real standing instead of implying a review.
DROP FUNCTION public.bcp_assignable_method_versions(uuid);
CREATE FUNCTION public.bcp_assignable_method_versions(_employer_id uuid)
 RETURNS TABLE(method_version_id uuid, pack_id uuid, pack_slug text, name_sv text, name_en text,
               purpose_sv text, version_number integer, mode text, validation_label text,
               release_scope text, content_hash text, summary_sv text, summary_en text,
               grant_expires_on date, content_status text, availability text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.has_employer_role(auth.uid(), _employer_id, ARRAY['owner', 'admin', 'member'])
     OR NOT coalesce(public.employer_is_active_status(_employer_id), false) THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT v.id, p.id, p.slug, p.name_sv, p.name_en, p.purpose_sv, v.version_number,
           v.mode, v.validation_label, v.release_scope, v.content_hash,
           v.summary_sv, v.summary_en,
           CASE WHEN public.bcp_version_is_runnable(v.id) OR public.bcp_open_pilot_available(v.id)
                THEN NULL::date
                ELSE (SELECT t.expires_on FROM public.bcp_internal_test_activations t
                       WHERE t.employer_id = _employer_id AND t.method_version_id = v.id
                         AND t.revoked_at IS NULL
                       ORDER BY t.expires_on DESC LIMIT 1) END,
           v.content_status,
           CASE WHEN public.bcp_version_is_runnable(v.id) THEN 'published'
                WHEN public.bcp_open_pilot_available(v.id) THEN 'open_pilot'
                ELSE 'internal_test' END
      FROM public.beskt_method_versions v
      JOIN public.scp_interview_packs p ON p.id = v.pack_id
     WHERE p.pack_kind = 'beskt_method'
       AND public.bcp_offer_covers(_employer_id, v.id)
     ORDER BY 4, 7 DESC;
END;
$function$;

-- ###########################################################################
-- SECTION 4 -- Grants, each written out so the SQL security guard can read it
-- ###########################################################################
REVOKE ALL ON FUNCTION public.bcp_open_pilot_available(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bcp_offer_covers(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bcp_offer_content_covers(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.scp_guard_recruitment_setup() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.beskt_set_pilot_availability(uuid, uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.beskt_set_pilot_availability(uuid, uuid, boolean, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.scp_record_recruitment_setup(uuid, text, text, text, text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_record_recruitment_setup(uuid, text, text, text, text, uuid, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.bcp_assignable_method_versions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bcp_assignable_method_versions(uuid) TO authenticated, service_role;


-- ---- postflight ---------------------------------------------------------------
DO $proof$
DECLARE _fn text;
BEGIN
  FOREACH _fn IN ARRAY ARRAY['bcp_accept_invitation', 'bcp_assign', 'bcp_assignable_exposure_profiles',
                             'bcp_check_start', 'bcp_method_preview', 'bcp_assignable_method_versions'] LOOP
    IF position('bcp_offer_covers' IN (SELECT prosrc FROM pg_proc WHERE proname = _fn)) = 0 THEN
      RAISE EXCEPTION 'SCP_LIBRARY_PROOF: % does not ask the one entitlement rule.', _fn;
    END IF;
    IF position('bcp_pilot_grant_active' IN (SELECT prosrc FROM pg_proc WHERE proname = _fn)) > 0 THEN
      RAISE EXCEPTION 'SCP_LIBRARY_PROOF: % still requires a per-employer pilot grant.', _fn;
    END IF;
  END LOOP;
  IF position('BESKT_OPEN_FROZEN' IN (SELECT prosrc FROM pg_proc WHERE proname = 'beskt_content_gate')) = 0 THEN
    RAISE EXCEPTION 'SCP_LIBRARY_PROOF: available content is not frozen.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.beskt_method_versions WHERE pilot_availability <> 'restricted') THEN
    RAISE EXCEPTION 'SCP_LIBRARY_PROOF: no version may start out available.';
  END IF;
  IF has_function_privilege('anon', 'public.scp_record_recruitment_setup(uuid,text,text,text,text,uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.bcp_offer_covers(uuid,uuid)', 'EXECUTE')
     OR has_table_privilege('authenticated', 'public.scp_recruitment_setups', 'INSERT')
     OR has_table_privilege('anon', 'public.scp_recruitment_setups', 'SELECT') THEN
    RAISE EXCEPTION 'SCP_LIBRARY_PROOF: a grant is wider than intended.';
  END IF;
  RAISE NOTICE 'SCP_LIBRARY_DIRECT_ACCESS_PROOF ok';
END $proof$;
