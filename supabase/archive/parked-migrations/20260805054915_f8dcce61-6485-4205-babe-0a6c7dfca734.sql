-- Phase 2j — remove scp_employer_assign's dependency on pgcrypto.

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
                       WHERE f.assessment_version_id = av.id))
    INTO _assignable
    FROM public.scp_assessment_versions av WHERE av.id = _assessment_version_id;

  IF NOT coalesce(_assignable, false) THEN
    RAISE EXCEPTION
      'SCP_PROGRAMME_NOT_ASSIGNABLE: this programme is not published, or has no '
      'items. Publication is a reviewed step, not a toggle.'
      USING ERRCODE = 'check_violation';
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
     -- Core Postgres only: pgcrypto is not reachable from this function's
     -- pinned search_path, and pinning it is not negotiable.
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

DO $$
DECLARE _def text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO _def FROM pg_proc
   WHERE proname = 'scp_employer_assign' LIMIT 1;

  IF _def ILIKE '%gen_random_bytes%' THEN
    RAISE EXCEPTION 'SCP_P2J_STILL_USES_PGCRYPTO';
  END IF;

  IF _def NOT ILIKE '%search_path%' THEN
    RAISE EXCEPTION 'SCP_P2J_SEARCH_PATH_UNPINNED: a SECURITY DEFINER function '
      'must pin its search_path.';
  END IF;
END $$;

INSERT INTO public.scp_content_events (subject_type, subject_ref, action, reason, metadata)
VALUES (
  'assessment_version', 'scp-phase2j-assign-token', 'updated',
  'Phase 2j: scp_employer_assign no longer calls pgcrypto''s gen_random_bytes, which was unreachable from its pinned search_path and made every assignment fail on a Supabase-shaped database. Replaced with core sha256(gen_random_uuid()). The search_path stays pinned; unpinning it would have masked the error at the cost of a privilege-escalation vector.',
  jsonb_build_object(
    'migration', '20260811100000_scp_phase2j_assign_token_without_pgcrypto',
    'pgcrypto_dependency_removed', true,
    'search_path_still_pinned', true));