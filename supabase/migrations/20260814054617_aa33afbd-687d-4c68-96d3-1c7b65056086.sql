-- Phase 2m — test fixtures are visible and assignable to internal orgs only.
--
-- ADDITIVE ONLY.
--
-- ── THE PROBLEM ───────────────────────────────────────────────────────
--
-- The delivery and Learning Mode fixtures are published, which is what makes
-- them assignable and therefore what makes the closed test possible. But
-- published also means every employer sees them: "TESTFIXTUR — leveranskedja"
-- appears in the library of any organisation that opens the Assessment Center.
--
-- A test fixture presented to a paying customer as a product is worse than an
-- empty catalogue. It is also the kind of thing nobody notices until an
-- employer assigns one to a real member of staff.
--
-- ── WHY A TABLE AND NOT A UI FILTER ───────────────────────────────────
--
-- Hiding fixtures in the library would be cosmetic: scp_employer_assign takes
-- an assessment_version_id from the caller, so an employer who learned the id
-- could still assign one. The restriction therefore lives in BOTH places, and
-- the assign path is the one that actually matters.
--
-- The allowlist is a table rather than a flag on employers because it is not a
-- property of the organisation -- it is a grant, revocable by deleting one row,
-- and it belongs to the Academy rather than to the employer model.

CREATE TABLE IF NOT EXISTS public.scp_fixture_access (
  employer_id uuid PRIMARY KEY REFERENCES public.employers(id) ON DELETE CASCADE,
  reason text NOT NULL,
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.scp_fixture_access IS
  'Organisations permitted to see and assign TEST FIXTURE content. Empty by '
  'default, so a fresh database shows fixtures to nobody. Membership is a '
  'grant, not a property of the employer: revoking it is deleting one row.';

ALTER TABLE public.scp_fixture_access ENABLE ROW LEVEL SECURITY;

-- Deliberately no policy for `authenticated`. Nothing in the product needs to
-- read this table directly -- the two functions below consult it as SECURITY
-- DEFINER -- and an employer has no business enumerating who else holds access.
GRANT ALL ON public.scp_fixture_access TO service_role;
REVOKE ALL ON public.scp_fixture_access FROM anon, authenticated;

-- =========================================================================
-- 1. The library hides fixtures from organisations without access
-- =========================================================================

CREATE OR REPLACE FUNCTION public.scp_employer_library(_employer_id uuid)
RETURNS TABLE (
  assessment_version_id uuid,
  definition_slug   text,
  name_sv           text,
  name_en           text,
  content_status    text,
  validation_status text,
  is_test_fixture   boolean,
  assignable        boolean,
  item_count        integer,
  target_minutes_min integer,
  target_minutes_max integer,
  programme_purpose_sv text,
  programme_purpose_en text,
  does_not_measure_sv  text[],
  does_not_measure_en  text[]
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE _may_see_fixtures boolean;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.employer_memberships m
                  WHERE m.user_id = auth.uid() AND m.employer_id = _employer_id
                    AND m.status = 'active') THEN
    RETURN;
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.scp_fixture_access fa
                  WHERE fa.employer_id = _employer_id)
    INTO _may_see_fixtures;

  RETURN QUERY
  SELECT
    av.id, d.slug, d.name_sv, d.name_en,
    av.content_status, av.validation_status, d.is_test_fixture,
    (av.content_status = 'published'
     AND av.retired_at IS NULL
     AND EXISTS (SELECT 1 FROM public.scp_forms f
                   JOIN public.scp_form_items fi ON fi.form_id = f.id
                  WHERE f.assessment_version_id = av.id)),
    COALESCE((SELECT count(*)::int FROM public.scp_forms f
                JOIN public.scp_form_items fi ON fi.form_id = f.id
               WHERE f.assessment_version_id = av.id), 0),
    (SELECT min(f.target_minutes_min) FROM public.scp_forms f WHERE f.assessment_version_id = av.id),
    (SELECT max(f.target_minutes_max) FROM public.scp_forms f WHERE f.assessment_version_id = av.id),
    pv.purpose_sv, pv.purpose_en, pv.does_not_measure_sv, pv.does_not_measure_en
  FROM public.scp_assessment_versions av
  JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
  JOIN public.scp_assessment_families fam ON fam.id = d.family_id
  LEFT JOIN public.scp_program_versions pv ON pv.id = av.program_version_id
  WHERE fam.product_type = 'development_programme'
    AND av.retired_at IS NULL
    -- Fixtures only for organisations holding an explicit grant.
    AND (NOT d.is_test_fixture OR _may_see_fixtures)
  ORDER BY (av.content_status = 'published') DESC, d.name_sv;
END; $$;

COMMENT ON FUNCTION public.scp_employer_library(uuid) IS
  'Catalogue metadata for the employer Assessment Library. TEST FIXTURE '
  'content is returned only to organisations listed in scp_fixture_access, so '
  'an ordinary employer never sees it. Never returns a form, item, option, key '
  'or rubric.';

REVOKE ALL     ON FUNCTION public.scp_employer_library(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_employer_library(uuid) TO authenticated;

-- =========================================================================
-- 2. Assignment refuses fixtures for organisations without access
-- =========================================================================
--
-- This is the half that matters. Hiding a row in a list is a courtesy;
-- refusing the write is the control.

CREATE OR REPLACE FUNCTION public.scp_employer_assign(
  _employer_id uuid,
  _assessment_version_id uuid,
  _recipient_email text,
  _deadline timestamptz DEFAULT NULL,
  _language text DEFAULT 'sv'
)
RETURNS TABLE (assignment_id uuid, attempt_id uuid, subject_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  _role text; _user uuid; _subject uuid; _form uuid; _purpose uuid;
  _assignment uuid; _attempt uuid; _assignable boolean; _email text;
  _is_fixture boolean;
BEGIN
  SELECT m.role INTO _role FROM public.employer_memberships m
   WHERE m.user_id = auth.uid() AND m.employer_id = _employer_id AND m.status = 'active';
  IF _role IS NULL OR _role NOT IN ('owner','admin') THEN
    RAISE EXCEPTION 'SCP_NOT_AUTHORISED_TO_ASSIGN: assigning requires owner or admin.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT (av.content_status = 'published' AND av.retired_at IS NULL
          AND EXISTS (SELECT 1 FROM public.scp_forms f
                        JOIN public.scp_form_items fi ON fi.form_id = f.id
                       WHERE f.assessment_version_id = av.id)),
         d.is_test_fixture
    INTO _assignable, _is_fixture
    FROM public.scp_assessment_versions av
    JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
   WHERE av.id = _assessment_version_id;

  IF NOT coalesce(_assignable, false) THEN
    RAISE EXCEPTION
      'SCP_PROGRAMME_NOT_ASSIGNABLE: this programme is not published, or has no '
      'items. Publication is a reviewed step, not a toggle.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Checked HERE, not only in the library, because the caller supplies the
  -- version id and could otherwise assign a fixture it was never shown.
  IF coalesce(_is_fixture, false)
     AND NOT EXISTS (SELECT 1 FROM public.scp_fixture_access fa
                      WHERE fa.employer_id = _employer_id) THEN
    RAISE EXCEPTION
      'SCP_FIXTURE_NOT_AVAILABLE: this is internal test content and is not '
      'available to this organisation.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  _email := lower(btrim(_recipient_email));
  SELECT id INTO _user FROM auth.users WHERE lower(email) = _email;
  IF _user IS NULL THEN
    RAISE EXCEPTION
      'SCP_RECIPIENT_HAS_NO_ACCOUNT: % has no CQrityjob account yet. A '
      'development assessment is attached to a person, not to an address.', _email
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT si.subject_id INTO _subject
    FROM public.scp_subject_identities si WHERE si.user_id = _user;
  IF _subject IS NULL THEN
    INSERT INTO public.scp_subjects DEFAULT VALUES RETURNING id INTO _subject;
    INSERT INTO public.scp_subject_identities (subject_id, user_id) VALUES (_subject, _user);
  END IF;

  SELECT f.id INTO _form FROM public.scp_forms f
   WHERE f.assessment_version_id = _assessment_version_id
   ORDER BY f.created_at LIMIT 1;

  SELECT pv.id INTO _purpose FROM public.scp_purpose_versions pv
    JOIN public.scp_processing_purposes p ON p.code = pv.purpose_code
   WHERE p.is_active AND pv.published_at IS NOT NULL
   ORDER BY pv.published_at DESC LIMIT 1;
  IF _purpose IS NULL THEN
    RAISE EXCEPTION 'SCP_NO_ACTIVE_PURPOSE: no active, published processing '
      'purpose exists, so nothing may be assigned.' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.assessment_assignments
    (employer_id, scp_assessment_version_id, profile_id, use_case, recipient_email,
     recipient_user_id, assigned_by, invitation_token_hash, expires_at, status, language)
  VALUES
    (_employer_id, _assessment_version_id, 'academy', 'workforce', _email,
     _user, auth.uid(),
     encode(sha256((gen_random_uuid()::text || gen_random_uuid()::text)::bytea), 'hex'),
     COALESCE(_deadline, now() + interval '30 days'), 'invited',
     CASE WHEN _language = 'en' THEN 'en' ELSE 'sv' END)
  RETURNING id INTO _assignment;

  INSERT INTO public.scp_attempts
    (subject_id, issuer_organization_id, assignment_id, mode, form_id,
     assessment_version_id, purpose_version_id, jurisdiction_id,
     scoring_model_version, status)
  VALUES
    (_subject, _employer_id, _assignment, 'assessment', _form,
     _assessment_version_id, _purpose,
     (SELECT id FROM public.scp_jurisdictions WHERE code = 'SE'),
     'det-v1', 'in_progress')
  RETURNING id INTO _attempt;

  RETURN QUERY SELECT _assignment, _attempt, _subject;
END; $$;

REVOKE ALL     ON FUNCTION public.scp_employer_assign(uuid, uuid, text, timestamptz, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_employer_assign(uuid, uuid, text, timestamptz, text) TO authenticated;

-- =========================================================================
-- 3. Prove it
-- =========================================================================

DO $$
DECLARE _def text;
BEGIN
  -- Empty by default: a fresh database grants fixture access to nobody.
  IF (SELECT count(*) FROM public.scp_fixture_access) <> 0 THEN
    RAISE EXCEPTION 'SCP_P2M_ACCESS_NOT_EMPTY: fixture access must start empty';
  END IF;

  SELECT pg_get_functiondef(oid) INTO _def FROM pg_proc
   WHERE proname = 'scp_employer_assign' LIMIT 1;
  IF _def NOT ILIKE '%SCP_FIXTURE_NOT_AVAILABLE%' THEN
    RAISE EXCEPTION 'SCP_P2M_ASSIGN_GATE_MISSING: assignment would still accept a fixture';
  END IF;

  SELECT pg_get_functiondef(oid) INTO _def FROM pg_proc
   WHERE proname = 'scp_employer_library' LIMIT 1;
  IF _def NOT ILIKE '%_may_see_fixtures%' THEN
    RAISE EXCEPTION 'SCP_P2M_LIBRARY_GATE_MISSING';
  END IF;

  -- Real content is still draft and AI still off.
  IF EXISTS (SELECT 1 FROM public.scp_assessment_versions av
               JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
              WHERE av.content_status = 'published' AND NOT d.is_test_fixture) THEN
    RAISE EXCEPTION 'SCP_P2M_REAL_CONTENT_PUBLISHED';
  END IF;
  IF EXISTS (SELECT 1 FROM public.scp_ai_providers
              WHERE is_enabled AND code <> 'null_provider') THEN
    RAISE EXCEPTION 'SCP_P2M_AI_ENABLED';
  END IF;
END $$;

INSERT INTO public.scp_content_events (subject_type, subject_ref, action, reason, metadata)
VALUES (
  'assessment_version', 'scp-phase2m-fixture-access', 'updated',
  'Phase 2m: test fixture content is now visible and assignable only to organisations listed in scp_fixture_access, which starts empty. Publishing a fixture is what makes the closed test possible, but published also meant every employer saw it; the restriction is enforced at assignment as well as in the library, because hiding a row in a list is a courtesy and refusing the write is the control.',
  jsonb_build_object(
    'migration', '20260813090000_scp_phase2m_fixture_internal_only',
    'default_access', 'none',
    'enforced_at', ARRAY['scp_employer_library','scp_employer_assign']));