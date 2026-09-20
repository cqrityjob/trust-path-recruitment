-- ============================================================================
-- 20261202090000 -- One interview per intended start, created atomically
-- ============================================================================
--
-- "Förbered intervju" (PR #273) must open the interview that belongs to the
-- process the employer came from, or create exactly ONE -- also when two tabs
-- click at once, or a response is lost and the browser retries. A client
-- button, or "SELECT first, INSERT after", cannot promise that. This moves the
-- decision into one database function that serialises on the START itself.
--
-- ── What a start is ─────────────────────────────────────────────────────────
--
-- Not the application: one application can legitimately have a TRUST
-- interview AND a BESKT conversation, or an interview after each of two tests.
-- A start is identified by its SOURCE:
--
--   assessment:<assessment_assignment_id>   after a completed candidate test
--   beskt:<bcp_assignment_id>                after a BESKT preparation
--   setup:<application>:<method>:<role>:<environment>
--                                            before any test, from a setup the
--                                            employer chose explicitly
--
-- One LIVE start per (employer, key). A cancelled interview releases its start
-- (a new one may be created, and the old start is kept, marked superseded);
-- an interview that is complete or reported stays the answer for its start.
-- Nothing existing is merged, moved or deleted.
--
-- ── What is verified, not trusted ──────────────────────────────────────────
--
--   * the application belongs to the employer, and the caller works there;
--   * a test source is THIS application's assignment, for THIS applicant, not
--     cancelled, with an attempt the candidate has submitted;
--   * a BESKT source is this application's assignment and the caller is its
--     employer party (a vetting stays the security function's);
--   * the candidate is the application's own account -- never an invented
--     EXT- id when the account is known;
--   * the setup (method, role, environment) is the one recorded with the
--     source; when a source has none, only an explicit choice records one.
--
-- Which guide and test belong to a setup is DATA, not a frontend constant:
-- scp_recruitment_role_profiles / scp_recruitment_content_links, anchored in
-- the governed roles, packs and assessment definitions. The start verifies
-- the setup, the test and the guide against it before its first write.
--
-- A BESKT start (from an application OR an accepted standalone invitation)
-- creates the case together with its setup, material and the governed
-- preparation link (bcp_link_preparation_to_case), in the same transaction.
--
-- The case, its setup and its non-personal material (the guide's role
-- requirements and the advert) are written in the same transaction, so a
-- start either exists complete or does not exist at all.

DO $pre$
BEGIN
  IF to_regclass('public.scp_recruitment_setups') IS NULL
     OR to_regprocedure('public.scp_record_recruitment_setup(uuid,text,text,text,text,uuid,uuid)') IS NULL
     OR to_regprocedure('public.scp_iv_create_case(uuid,text,uuid,text,uuid,text,uuid,uuid)') IS NULL
     OR to_regprocedure('public.scp_iv_add_source(uuid,text,text,text,text,text,text,uuid)') IS NULL THEN
    RAISE EXCEPTION 'SCP_START_PRECONDITION: 20261201090000 and the interview runtime must be applied first.';
  END IF;
  IF to_regclass('public.scp_interview_starts') IS NOT NULL
     OR to_regclass('public.scp_assessment_setups') IS NOT NULL THEN
    RAISE EXCEPTION 'SCP_START_PRECONDITION: the start tables already exist.';
  END IF;
END $pre$;


-- ###########################################################################
-- SECTION 1 -- The setup a candidate TEST was sent with
-- ###########################################################################
CREATE TABLE public.scp_assessment_setups (
  assessment_assignment_id uuid PRIMARY KEY
    REFERENCES public.assessment_assignments(id) ON DELETE RESTRICT,
  employer_id uuid NOT NULL REFERENCES public.employers(id) ON DELETE RESTRICT,
  method text NOT NULL CHECK (method = 'trust'),
  role_group text NOT NULL CHECK (role_group IN ('operational', 'strategic')),
  role_profile text NOT NULL CHECK (role_profile ~ '^[a-z][a-z0-9_]{1,39}$'),
  environment text NOT NULL
    CHECK (environment IN ('general', 'data_centre', 'hospital', 'shopping_centre')),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.scp_assessment_setups IS
  'The library setup (method, role group, role profile, environment) a candidate test '
  'assignment was sent with. Written only by scp_record_assessment_setup() or an explicit '
  'choice in scp_iv_start_interview(); immutable.';

-- RLS enabled and, as for every scp_ table (decision B), not forced.
ALTER TABLE public.scp_assessment_setups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.scp_assessment_setups FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.scp_assessment_setups TO authenticated;
GRANT ALL ON public.scp_assessment_setups TO service_role;
CREATE POLICY scp_assessment_setups_member_read ON public.scp_assessment_setups
  FOR SELECT TO authenticated
  USING (public.has_employer_role(auth.uid(), employer_id, ARRAY['owner', 'admin', 'member']));


-- ###########################################################################
-- SECTION 1b -- Which content a setup leads to
-- ###########################################################################
-- The library's role profiles (vaktare, ...) and, per work environment, the
-- interview guide and candidate test that belong to them. Anchored in the
-- existing content model: a profile IS a governed role (scp_roles), its
-- guide must be a role-interview pack OF THAT ROLE, and its test must be a
-- definition of that role's profession -- a trigger refuses anything else.
-- Pack and definition, not version: a case pins the exact guide version it
-- was started with (scp_interview_cases.pack_version_id + content hash) and an
-- assignment pins its test version, so a new catalogue version never changes
-- a started case.
--
-- Only environments with content of their own have a row; "general" is the
-- only one today. No row, no start.
CREATE TABLE public.scp_recruitment_role_profiles (
  role_profile text PRIMARY KEY CHECK (role_profile ~ '^[a-z][a-z0-9_]{1,39}$'),
  role_group text NOT NULL CHECK (role_group IN ('operational', 'strategic')),
  role_id uuid NOT NULL REFERENCES public.scp_roles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.scp_recruitment_content_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_profile text NOT NULL REFERENCES public.scp_recruitment_role_profiles(role_profile) ON DELETE RESTRICT,
  environment text NOT NULL
    CHECK (environment IN ('general', 'data_centre', 'hospital', 'shopping_centre')),
  interview_pack_id uuid NOT NULL REFERENCES public.scp_interview_packs(id) ON DELETE RESTRICT,
  assessment_definition_id uuid REFERENCES public.scp_assessment_definitions(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role_profile, environment)
);

COMMENT ON TABLE public.scp_recruitment_content_links IS
  'Per library role profile and work environment: the role-interview guide (pack) and the candidate '
  'test (definition) that belong to it. scp_iv_start_interview verifies every start against it.';

CREATE OR REPLACE FUNCTION public.scp_guard_recruitment_content_link()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
       SELECT 1 FROM public.scp_interview_packs p
         JOIN public.scp_recruitment_role_profiles rp ON rp.role_profile = NEW.role_profile
        WHERE p.id = NEW.interview_pack_id AND p.pack_kind = 'role_interview' AND p.role_id = rp.role_id) THEN
    RAISE EXCEPTION 'SCP_CONTENT_LINK_INCONSISTENT: the guide is not a role-interview guide of this role.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.assessment_definition_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.scp_assessment_definitions d
         JOIN public.scp_recruitment_role_profiles rp ON rp.role_profile = NEW.role_profile
         JOIN public.scp_roles r ON r.id = rp.role_id
        WHERE d.id = NEW.assessment_definition_id AND d.profession_id = r.profession_id) THEN
    RAISE EXCEPTION 'SCP_CONTENT_LINK_INCONSISTENT: the test is not a test of this role''s profession.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER scp_recruitment_content_links_guard
  BEFORE INSERT OR UPDATE ON public.scp_recruitment_content_links
  FOR EACH ROW EXECUTE FUNCTION public.scp_guard_recruitment_content_link();

-- Non-personal catalogue rows: readable by signed-in users, written only by
-- migrations. RLS enabled and, as for every scp_ table (decision B), not forced.
ALTER TABLE public.scp_recruitment_role_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scp_recruitment_content_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.scp_recruitment_role_profiles FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.scp_recruitment_content_links FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.scp_recruitment_role_profiles TO authenticated;
GRANT SELECT ON public.scp_recruitment_content_links TO authenticated;
GRANT ALL ON public.scp_recruitment_role_profiles TO service_role;
GRANT ALL ON public.scp_recruitment_content_links TO service_role;
CREATE POLICY scp_recruitment_role_profiles_read ON public.scp_recruitment_role_profiles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY scp_recruitment_content_links_read ON public.scp_recruitment_content_links
  FOR SELECT TO authenticated USING (true);

-- The one setup with content today: TRUST/BESKT Väktare, general environment
-- -- the vaktare-se guide (role security-guard-se) and the
-- security-officer-recruitment test (same profession; verified hosted
-- 2026-09-19). Inserted only where that content exists.
INSERT INTO public.scp_recruitment_role_profiles (role_profile, role_group, role_id)
SELECT 'vaktare', 'operational', p.role_id
  FROM public.scp_interview_packs p WHERE p.slug = 'vaktare-se';
INSERT INTO public.scp_recruitment_content_links (role_profile, environment, interview_pack_id, assessment_definition_id)
SELECT 'vaktare', 'general', p.id,
       (SELECT d.id FROM public.scp_assessment_definitions d WHERE d.slug = 'security-officer-recruitment')
  FROM public.scp_interview_packs p
 WHERE p.slug = 'vaktare-se'
   AND EXISTS (SELECT 1 FROM public.scp_recruitment_role_profiles WHERE role_profile = 'vaktare');


-- ###########################################################################
-- SECTION 2 -- The starts
-- ###########################################################################
CREATE TABLE public.scp_interview_starts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id uuid NOT NULL REFERENCES public.employers(id) ON DELETE RESTRICT,
  -- NULL only for a start from an accepted BESKT invitation, which has no
  -- application and is never given one.
  application_id uuid REFERENCES public.job_applications(id) ON DELETE RESTRICT,
  start_key text NOT NULL CHECK (start_key ~ '^(assessment|beskt|setup):'),
  source_kind text NOT NULL
    CHECK (source_kind IN ('assessment_assignment', 'beskt_assignment', 'chosen_setup')),
  source_id uuid,
  interview_case_id uuid NOT NULL UNIQUE
    REFERENCES public.scp_interview_cases(id) ON DELETE RESTRICT,
  superseded_at timestamptz,
  superseded_reason text,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scp_interview_starts_source_check
    CHECK ((source_kind = 'chosen_setup') = (source_id IS NULL)),
  CONSTRAINT scp_interview_starts_application_check
    CHECK (application_id IS NOT NULL OR source_kind = 'beskt_assignment'),
  CONSTRAINT scp_interview_starts_superseded_check
    CHECK ((superseded_at IS NULL) = (superseded_reason IS NULL))
);

-- The atomic guarantee's second line: even a caller that bypassed the lock
-- could not create two LIVE starts for one source.
CREATE UNIQUE INDEX scp_interview_starts_one_live
  ON public.scp_interview_starts (employer_id, start_key) WHERE superseded_at IS NULL;

COMMENT ON TABLE public.scp_interview_starts IS
  'Which interview case a start (a completed test, a BESKT preparation, or an explicitly '
  'chosen setup for an application) led to. One live start per source; a cancelled case '
  'releases it and the old row is kept, superseded. Written only by scp_iv_start_interview().';

ALTER TABLE public.scp_interview_starts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.scp_interview_starts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.scp_interview_starts TO authenticated;
GRANT ALL ON public.scp_interview_starts TO service_role;
-- Readable exactly where its case is: a vetting's start stays the security
-- function's, like the case itself.
CREATE POLICY scp_interview_starts_read ON public.scp_interview_starts
  FOR SELECT TO authenticated
  USING (public.scp_iv_can_read_case(interview_case_id));


-- ###########################################################################
-- SECTION 3 -- The guards: governed writes only, append-only history
-- ###########################################################################
CREATE OR REPLACE FUNCTION public.scp_guard_interview_start_rows()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF coalesce(current_setting('scp.interview_start_write', true), '') <> 'on' THEN
    RAISE EXCEPTION 'SCP_START_UNGOVERNED_WRITE: % is written only by the governed start functions.',
      TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'SCP_START_APPEND_ONLY: % rows are never deleted.', TG_TABLE_NAME
      USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF TG_TABLE_NAME <> 'scp_interview_starts'
       OR NOT (OLD.superseded_at IS NULL AND NEW.superseded_at IS NOT NULL
               AND (to_jsonb(NEW) - 'superseded_at' - 'superseded_reason')
                 = (to_jsonb(OLD) - 'superseded_at' - 'superseded_reason')) THEN
      RAISE EXCEPTION 'SCP_START_IMMUTABLE: only a live start may be marked superseded, once.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER scp_assessment_setups_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.scp_assessment_setups
  FOR EACH ROW EXECUTE FUNCTION public.scp_guard_interview_start_rows();
CREATE TRIGGER scp_interview_starts_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.scp_interview_starts
  FOR EACH ROW EXECUTE FUNCTION public.scp_guard_interview_start_rows();


-- ###########################################################################
-- SECTION 4 -- Recording the setup a test is sent with
-- ###########################################################################
CREATE OR REPLACE FUNCTION public.scp_record_assessment_setup(
  _employer_id uuid, _assessment_assignment_id uuid,
  _role_group text, _role_profile text, _environment text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _row public.scp_assessment_setups%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'SCP_NOT_AUTHENTICATED' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT public.has_employer_role(auth.uid(), _employer_id, ARRAY['owner', 'admin'])
     OR NOT EXISTS (SELECT 1 FROM public.assessment_assignments aa
                     WHERE aa.id = _assessment_assignment_id AND aa.employer_id = _employer_id) THEN
    RAISE EXCEPTION 'SCP_SETUP_NOT_PERMITTED' USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('scp_assessment_setup:' || _assessment_assignment_id::text, 0));
  SELECT * INTO _row FROM public.scp_assessment_setups WHERE assessment_assignment_id = _assessment_assignment_id;
  IF FOUND THEN
    IF (_row.role_group, _row.role_profile, _row.environment)
       IS DISTINCT FROM (_role_group, _role_profile, _environment) THEN
      RAISE EXCEPTION 'SCP_SETUP_ALREADY_RECORDED: this test was sent with a different setup.'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN;
  END IF;
  PERFORM set_config('scp.interview_start_write', 'on', true);
  INSERT INTO public.scp_assessment_setups
    (assessment_assignment_id, employer_id, method, role_group, role_profile, environment, created_by)
  VALUES (_assessment_assignment_id, _employer_id, 'trust', _role_group, _role_profile, _environment, auth.uid());
  PERFORM set_config('scp.interview_start_write', 'off', true);
END;
$$;


-- What a start reports, read from the rows themselves -- so a reopened
-- case whose setup or material is missing says so instead of claiming it is
-- complete. Internal: called only by scp_iv_start_interview().
CREATE OR REPLACE FUNCTION public.scp_iv_start_result(
  _case_id uuid, _created boolean, _method text, _g text, _r text, _e text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'case_id', c.id,
    'created', _created,
    'status', c.status,
    'setup_recorded', EXISTS (
      SELECT 1 FROM public.scp_recruitment_setups rs
       WHERE rs.interview_case_id = c.id
         AND (rs.method, rs.role_group, rs.role_profile, rs.environment)
             = (_method, _g, _r, _e)),
    'material', (SELECT count(*) FROM public.scp_interview_case_sources cs
                  WHERE cs.case_id = c.id
                    AND cs.source_kind IN ('employer_requirements', 'job_description')
                    AND cs.erased_at IS NULL),
    'method', _method, 'role_group', _g, 'role_profile', _r, 'environment', _e)
  FROM public.scp_interview_cases c WHERE c.id = _case_id;
$$;


-- The setups a start may be made with, for the employer to choose from when
-- the source carries none: those with content this employer may start and,
-- after a test, only those built on THAT test's definition. The same rows the
-- start verifies against -- the choice list is never a second truth.
CREATE OR REPLACE FUNCTION public.scp_iv_start_choices(
  _employer_id uuid, _assessment_assignment_id uuid DEFAULT NULL)
RETURNS TABLE (role_group text, role_profile text, environment text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.role_group, p.role_profile, l.environment
    FROM public.scp_recruitment_content_links l
    JOIN public.scp_recruitment_role_profiles p ON p.role_profile = l.role_profile
   WHERE auth.uid() IS NOT NULL
     AND public.has_employer_role(auth.uid(), _employer_id, ARRAY['owner', 'admin', 'member'])
     AND EXISTS (SELECT 1 FROM public.scp_iv_startable_pack_versions(_employer_id) s
                   JOIN public.scp_interview_pack_versions v ON v.id = s.pack_version_id
                  WHERE v.pack_id = l.interview_pack_id)
     AND (_assessment_assignment_id IS NULL
          OR l.assessment_definition_id = (
               SELECT av.definition_id FROM public.assessment_assignments aa
                 JOIN public.scp_assessment_versions av ON av.id = aa.scp_assessment_version_id
                WHERE aa.id = _assessment_assignment_id AND aa.employer_id = _employer_id))
   ORDER BY p.role_group, p.role_profile, l.environment;
$$;


-- ###########################################################################
-- SECTION 5 -- The start
-- ###########################################################################
-- Returns the case for the intended start, creating it -- with its setup, its
-- material and (for BESKT) its governed preparation link -- exactly once.
--
-- Everything the caller supplies is VERIFIED before the first write:
--   * the source (test / BESKT assignment / chosen setup) and its candidate;
--   * the setup: a known role profile in its own role group, and a content
--     link for that profile in that environment (scp_recruitment_content_links);
--   * a test source: the test's definition is the one that link names -- a
--     Väktare test cannot be relabelled as another role's test;
--   * the guide: a supplied pack version must be a version of the linked
--     guide; when none is supplied the linked guide's newest version this
--     employer may start is used. Being allowed to start a guide does not
--     make it this setup's guide.
-- Reopening a live start returns its case untouched: the versions the case
-- pinned stay pinned, whatever the catalogue holds today.
CREATE OR REPLACE FUNCTION public.scp_iv_start_interview(
  _employer_id uuid, _application_id uuid, _source_kind text, _source_id uuid, _method text,
  _pack_version_id uuid DEFAULT NULL,
  _role_group text DEFAULT NULL, _role_profile text DEFAULT NULL, _environment text DEFAULT NULL,
  _title text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _app public.job_applications%ROWTYPE;
  _ba public.bcp_assignments%ROWTYPE;
  _profile public.scp_recruitment_role_profiles%ROWTYPE;
  _link public.scp_recruitment_content_links%ROWTYPE;
  _g text := _role_group; _r text := _role_profile; _e text := _environment;
  _record_test_setup boolean := false;
  _need_setup boolean := false;
  _test_def uuid;
  _pack uuid := _pack_version_id;
  _key text;
  _live record;
  _case uuid;
  _candidate uuid;
  _job uuid;
  _name text;
  _case_title text;
  _job_title text;
  _requirements text;
  _advert text;
  _n integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'SCP_NOT_AUTHENTICATED' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _method IS NULL OR _method NOT IN ('trust', 'beskt')
     OR _source_kind IS NULL
     OR _source_kind NOT IN ('assessment_assignment', 'beskt_assignment', 'chosen_setup')
     OR (_source_kind = 'chosen_setup') <> (_source_id IS NULL)
     OR (_source_kind = 'assessment_assignment' AND _method <> 'trust')
     OR (_source_kind = 'beskt_assignment' AND _method <> 'beskt')
     OR (_source_kind = 'chosen_setup' AND _method <> 'trust')
     -- Only an accepted BESKT invitation starts without an application.
     OR (_application_id IS NULL AND _source_kind <> 'beskt_assignment')
     OR (_title IS NOT NULL AND (length(btrim(_title)) = 0 OR length(_title) > 300)) THEN
    RAISE EXCEPTION 'SCP_START_INVALID: that combination of method and source is not a start.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The caller works here, and the application is this employer's. The same
  -- answer for "not yours" and "does not exist".
  IF NOT public.has_employer_role(auth.uid(), _employer_id, ARRAY['owner', 'admin', 'member']) THEN
    RAISE EXCEPTION 'SCP_START_NOT_FOUND' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _application_id IS NOT NULL THEN
    SELECT * INTO _app FROM public.job_applications
     WHERE id = _application_id AND employer_id = _employer_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'SCP_START_NOT_FOUND' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- ---- the source, and the setup that belongs to it -------------------------
  IF _source_kind = 'assessment_assignment' THEN
    SELECT av.definition_id INTO _test_def
      FROM public.assessment_assignments aa
      JOIN public.scp_assessment_versions av ON av.id = aa.scp_assessment_version_id
     WHERE aa.id = _source_id AND aa.employer_id = _employer_id
       AND aa.application_id = _application_id
       AND aa.cancelled_at IS NULL
       AND aa.recipient_user_id IS NOT DISTINCT FROM _app.applicant_user_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'SCP_START_SOURCE_MISMATCH: that test does not belong to this application and its candidate.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.scp_attempts t
                    WHERE t.assignment_id = _source_id
                      AND t.status IN ('submitted', 'scored', 'released')) THEN
      RAISE EXCEPTION 'SCP_START_TEST_NOT_COMPLETE: the candidate has not submitted this test.'
        USING ERRCODE = 'check_violation';
    END IF;
    SELECT s.role_group, s.role_profile, s.environment INTO _g, _r, _e
      FROM public.scp_assessment_setups s WHERE s.assessment_assignment_id = _source_id;
    IF NOT FOUND THEN
      _g := _role_group; _r := _role_profile; _e := _environment;
      _need_setup := _g IS NULL OR _r IS NULL OR _e IS NULL;
      _record_test_setup := true;    -- recorded after every check has passed
    ELSIF _role_group IS NOT NULL
          AND (_g, _r, _e) IS DISTINCT FROM (_role_group, _role_profile, _environment) THEN
      RAISE EXCEPTION 'SCP_SETUP_ALREADY_RECORDED: this test was sent with a different setup.'
        USING ERRCODE = 'check_violation';
    END IF;
    _key := 'assessment:' || _source_id::text;

  ELSIF _source_kind = 'beskt_assignment' THEN
    SELECT * INTO _ba FROM public.bcp_assignments b
     WHERE b.id = _source_id AND b.employer_id = _employer_id;
    -- A security vetting's employer party is the security function alone
    -- (bcp_employer_party), so a plain member is refused here.
    IF NOT FOUND OR _ba.lifecycle_state = 'cancelled' OR NOT public.bcp_employer_party(_ba.id)
       OR (_application_id IS NULL
           AND (_ba.application_id IS NOT NULL OR _ba.invitation_id IS NULL))
       OR (_application_id IS NOT NULL
           AND (_ba.application_id IS DISTINCT FROM _application_id
                OR _ba.candidate_user_id IS DISTINCT FROM _app.applicant_user_id)) THEN
      RAISE EXCEPTION 'SCP_START_SOURCE_MISMATCH: that BESKT assignment is not one you may carry into an interview.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    SELECT s.role_group, s.role_profile, s.environment INTO _g, _r, _e
      FROM public.scp_recruitment_setups s WHERE s.beskt_assignment_id = _source_id;
    IF FOUND THEN
      IF _role_group IS NOT NULL
         AND (_g, _r, _e) IS DISTINCT FROM (_role_group, _role_profile, _environment) THEN
        RAISE EXCEPTION 'SCP_SETUP_ALREADY_RECORDED: this BESKT assignment has a different setup.'
          USING ERRCODE = 'check_violation';
      END IF;
    ELSE
      _g := _role_group; _r := _role_profile; _e := _environment;
      _need_setup := _g IS NULL OR _r IS NULL OR _e IS NULL;
    END IF;
    _key := 'beskt:' || _source_id::text;

  ELSE
    _need_setup := _g IS NULL OR _r IS NULL OR _e IS NULL;
  END IF;

  -- No setup from the source and none chosen: an explicitly chosen GUIDE
  -- names its role through its one general-environment content link.
  -- Anything else -- no guide, or a guide linked more than once -- is an
  -- explicit choice the employer still has to make. Nothing is guessed.
  IF _need_setup THEN
    IF _pack_version_id IS NOT NULL THEN
      SELECT count(*) INTO _n
        FROM public.scp_recruitment_content_links l
        JOIN public.scp_interview_pack_versions v ON v.pack_id = l.interview_pack_id
       WHERE v.id = _pack_version_id AND l.environment = 'general';
    END IF;
    IF _pack_version_id IS NULL OR _n <> 1 THEN
      RAISE EXCEPTION 'SCP_START_SETUP_REQUIRED: there is no setup for this start; choose one explicitly.'
        USING ERRCODE = 'check_violation';
    END IF;
    SELECT p.role_group, p.role_profile, l.environment INTO _g, _r, _e
      FROM public.scp_recruitment_content_links l
      JOIN public.scp_recruitment_role_profiles p ON p.role_profile = l.role_profile
      JOIN public.scp_interview_pack_versions v ON v.pack_id = l.interview_pack_id
     WHERE v.id = _pack_version_id AND l.environment = 'general';
  END IF;
  IF _source_kind = 'chosen_setup' THEN
    _key := format('setup:%s:%s:%s:%s:%s', _application_id, _method, _g, _r, _e);
  END IF;

  -- ---- the setup against the content model, before any write -----------------
  SELECT * INTO _profile FROM public.scp_recruitment_role_profiles WHERE role_profile = _r;
  IF NOT FOUND OR _profile.role_group <> _g THEN
    RAISE EXCEPTION 'SCP_START_SETUP_INCOMPATIBLE: that role profile is not a role of that role group.'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO _link FROM public.scp_recruitment_content_links
   WHERE role_profile = _r AND environment = _e;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SCP_START_NO_CONTENT: there is no interview content for that role in that environment.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _source_kind = 'assessment_assignment'
     AND _link.assessment_definition_id IS DISTINCT FROM _test_def THEN
    RAISE EXCEPTION 'SCP_START_TEST_MISMATCH: the test the candidate took is not the test of that role.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _pack_version_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.scp_interview_pack_versions v
        WHERE v.id = _pack_version_id AND v.pack_id = _link.interview_pack_id) THEN
    RAISE EXCEPTION 'SCP_START_GUIDE_MISMATCH: that interview guide is not the guide of this setup.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- ---- serialise on the start itself --------------------------------------
  PERFORM pg_advisory_xact_lock(hashtextextended('scp_iv_start:' || _employer_id::text || ':' || _key, 0));

  SELECT s.id, s.interview_case_id, c.cancelled_at, c.status INTO _live
    FROM public.scp_interview_starts s
    JOIN public.scp_interview_cases c ON c.id = s.interview_case_id
   WHERE s.employer_id = _employer_id AND s.start_key = _key AND s.superseded_at IS NULL;
  IF FOUND THEN
    IF _live.cancelled_at IS NULL THEN
      -- Never reveal a case the caller may not read; never replace it either.
      IF NOT public.scp_iv_can_read_case(_live.interview_case_id) THEN
        RAISE EXCEPTION 'SCP_START_NOT_PERMITTED: this start belongs to a case you may not open.'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
      RETURN public.scp_iv_start_result(_live.interview_case_id, false, _method, _g, _r, _e);
    END IF;
    -- A cancelled case releases its start; its row is kept, superseded.
    PERFORM set_config('scp.interview_start_write', 'on', true);
    UPDATE public.scp_interview_starts
       SET superseded_at = now(), superseded_reason = 'case_cancelled'
     WHERE id = _live.id;
    PERFORM set_config('scp.interview_start_write', 'off', true);
  END IF;

  IF _source_kind = 'beskt_assignment' THEN
    -- The case this preparation is already linked to is the safe existing
    -- link: adopted after the read check, never duplicated or replaced.
    SELECT l.case_id AS interview_case_id, c.cancelled_at INTO _live
      FROM public.bcp_case_links l
      JOIN public.scp_interview_cases c ON c.id = l.case_id
     WHERE l.assignment_id = _source_id AND l.unlinked_at IS NULL;
    IF NOT FOUND THEN
      -- A case carried from the assignment before starts existed (20261201).
      SELECT rs.interview_case_id, c.cancelled_at INTO _live
        FROM public.scp_recruitment_setups rs
        JOIN public.scp_interview_cases c ON c.id = rs.interview_case_id
       WHERE rs.beskt_assignment_id = _source_id;
    END IF;
    IF FOUND THEN
      IF _live.cancelled_at IS NOT NULL THEN
        RAISE EXCEPTION 'SCP_START_BESKT_ALREADY_CARRIED: this BESKT assignment was carried into a case that is cancelled.'
          USING ERRCODE = 'check_violation';
      END IF;
      IF NOT public.scp_iv_can_read_case(_live.interview_case_id) THEN
        RAISE EXCEPTION 'SCP_START_NOT_PERMITTED: this start belongs to a case you may not open.'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
      PERFORM set_config('scp.interview_start_write', 'on', true);
      INSERT INTO public.scp_interview_starts
        (employer_id, application_id, start_key, source_kind, source_id, interview_case_id, created_by)
      VALUES (_employer_id, _application_id, _key, _source_kind, _source_id, _live.interview_case_id, auth.uid());
      PERFORM set_config('scp.interview_start_write', 'off', true);
      RETURN public.scp_iv_start_result(_live.interview_case_id, false, _method, _g, _r, _e);
    END IF;
    -- A new BESKT case is created WITH its governed link, so a security
    -- vetting's case is restricted from the moment it exists.
    IF _ba.lifecycle_state <> 'submitted' THEN
      RAISE EXCEPTION 'SCP_START_BESKT_NOT_SUBMITTED: the candidate has not submitted this preparation yet.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- ---- the guide version ---------------------------------------------------
  IF _pack IS NULL THEN
    SELECT s.pack_version_id INTO _pack
      FROM public.scp_iv_startable_pack_versions(_employer_id) s
      JOIN public.scp_interview_pack_versions v ON v.id = s.pack_version_id
     WHERE v.pack_id = _link.interview_pack_id
     ORDER BY v.version_number DESC
     LIMIT 1;
    IF _pack IS NULL THEN
      RAISE EXCEPTION 'SCP_START_NO_GUIDE_AVAILABLE: the guide of this setup is not available to this employer.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- ---- create: case, setup, material and link, in this one transaction ------
  IF _record_test_setup THEN
    PERFORM public.scp_record_assessment_setup(_employer_id, _source_id, _g, _r, _e);
  END IF;

  IF _application_id IS NOT NULL THEN
    SELECT c.display_name, c.job_title_sv INTO _name, _job_title
      FROM public.scp_application_candidate(_application_id) c;
    _candidate := _app.applicant_user_id;
    _job := _app.job_id;
  ELSE
    -- An accepted invitation: the account that accepted it, and the name
    -- and role the employer invited under. No application is invented.
    SELECT i.candidate_display_name INTO _name
      FROM public.bcp_invitations i WHERE i.id = _ba.invitation_id;
    _job_title := _ba.role_title;
    _candidate := _ba.candidate_user_id;
    _job := NULL;
  END IF;
  _name := coalesce(nullif(btrim(coalesce(_name, '')), ''), 'Kandidat');
  _case_title := coalesce(nullif(btrim(coalesce(_title, '')), ''),
                          concat_ws(' — ', nullif(btrim(coalesce(_job_title, '')), ''), _name));

  _case := public.scp_iv_create_case(
    _employer_id, _case_title, _pack, _name,
    _candidate,
    CASE WHEN _candidate IS NULL THEN 'APP-' || _application_id::text END,
    _job, _application_id);

  PERFORM public.scp_record_recruitment_setup(
    _employer_id, _method, _g, _r, _e, _case,
    CASE WHEN _source_kind = 'beskt_assignment' THEN _source_id END);

  SELECT string_agg(concat_ws(E'\n', c.code || ' ' || c.name_sv, c.definition_sv), E'\n\n'
                    ORDER BY c.display_order)
    INTO _requirements
    FROM public.scp_interview_pack_competencies c WHERE c.pack_version_id = _pack;
  IF _requirements IS NOT NULL THEN
    PERFORM public.scp_iv_add_source(_case, 'employer_requirements', 'Rollens krav (ur intervjuguiden)',
      _requirements, 'recruitment_interview',
      'Inga personuppgifter: den styrda kravprofilen ur intervjuguiden / No personal data: the guide''s governed requirement profile.',
      'employer_supplied', NULL);
  END IF;
  IF _job IS NOT NULL THEN
    SELECT nullif(concat_ws(E'\n\n', j.title_sv, j.description_sv,
             (SELECT string_agg(x, E'\n') FROM jsonb_array_elements_text(
                CASE WHEN jsonb_typeof(j.responsibilities) = 'array' THEN j.responsibilities ELSE '[]'::jsonb END) x),
             j.requirements_sv), '')
      INTO _advert FROM public.jobs j WHERE j.id = _job AND j.employer_id = _employer_id;
    IF _advert IS NOT NULL THEN
      PERFORM public.scp_iv_add_source(_case, 'job_description', 'Annonsen', _advert,
        'recruitment_interview',
        'Inga personuppgifter: arbetsgivarens publicerade annons / No personal data: the employer''s published advert.',
        'employer_supplied', NULL);
    END IF;
  END IF;

  -- The governed BESKT link: the submitted preparation bound to this case by
  -- the same function the manual link uses -- a pointer to the candidate's
  -- answers, never a copy of them. Its operation id is derived from the case,
  -- so it is this start's and no other's.
  IF _source_kind = 'beskt_assignment' THEN
    PERFORM public.bcp_link_preparation_to_case(
      md5('scp_iv_start_link:' || _case::text)::uuid, _source_id, _case,
      (SELECT revision FROM public.bcp_assignments WHERE id = _source_id));
  END IF;

  PERFORM set_config('scp.interview_start_write', 'on', true);
  INSERT INTO public.scp_interview_starts
    (employer_id, application_id, start_key, source_kind, source_id, interview_case_id, created_by)
  VALUES (_employer_id, _application_id, _key, _source_kind, _source_id, _case, auth.uid());
  PERFORM set_config('scp.interview_start_write', 'off', true);

  RETURN public.scp_iv_start_result(_case, true, _method, _g, _r, _e);
END;
$$;


-- ###########################################################################
-- SECTION 6 -- Grants, each written out
-- ###########################################################################
REVOKE ALL ON FUNCTION public.scp_guard_interview_start_rows() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.scp_iv_start_result(uuid, boolean, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.scp_guard_recruitment_content_link() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.scp_iv_start_choices(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_start_choices(uuid, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.scp_record_assessment_setup(uuid, uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_record_assessment_setup(uuid, uuid, text, text, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.scp_iv_start_interview(uuid, uuid, text, uuid, text, uuid, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_start_interview(uuid, uuid, text, uuid, text, uuid, text, text, text, text) TO authenticated, service_role;


-- ---- postflight ---------------------------------------------------------------
DO $proof$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'scp_interview_starts_one_live') THEN
    RAISE EXCEPTION 'SCP_START_PROOF: the one-live-start index is missing.';
  END IF;
  -- Where the Väktare content exists, its link exists (every database that
  -- replays the history, and the hosted project).
  IF EXISTS (SELECT 1 FROM public.scp_interview_packs WHERE slug = 'vaktare-se')
     AND NOT EXISTS (SELECT 1 FROM public.scp_recruitment_content_links l
                       JOIN public.scp_interview_packs p ON p.id = l.interview_pack_id
                      WHERE l.role_profile = 'vaktare' AND l.environment = 'general' AND p.slug = 'vaktare-se') THEN
    RAISE EXCEPTION 'SCP_START_PROOF: the Väktare content link is missing.';
  END IF;
  IF position('pg_advisory_xact_lock' IN (SELECT prosrc FROM pg_proc WHERE proname = 'scp_iv_start_interview')) = 0 THEN
    RAISE EXCEPTION 'SCP_START_PROOF: the start is not serialised.';
  END IF;
  IF has_function_privilege('anon', 'public.scp_iv_start_interview(uuid,uuid,text,uuid,text,uuid,text,text,text,text)', 'EXECUTE')
     OR has_table_privilege('authenticated', 'public.scp_interview_starts', 'INSERT')
     OR has_table_privilege('authenticated', 'public.scp_assessment_setups', 'INSERT')
     OR has_table_privilege('anon', 'public.scp_interview_starts', 'SELECT')
     OR has_table_privilege('authenticated', 'public.scp_recruitment_content_links', 'INSERT')
     OR has_table_privilege('authenticated', 'public.scp_recruitment_role_profiles', 'UPDATE')
     OR has_table_privilege('anon', 'public.scp_recruitment_content_links', 'SELECT')
     OR has_function_privilege('anon', 'public.scp_iv_start_choices(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'SCP_START_PROOF: a grant is wider than intended.';
  END IF;
  RAISE NOTICE 'SCP_INTERVIEW_STARTS_PROOF ok';
END $proof$;
