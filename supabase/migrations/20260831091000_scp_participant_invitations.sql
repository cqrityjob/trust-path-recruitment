-- An employer can invite somebody who has no CQrityjob account yet.
--
-- ── THE DEFECT ──────────────────────────────────────────────────────────
--
-- scp_employer_assign refuses with SCP_RECIPIENT_HAS_NO_ACCOUNT when the
-- address does not already exist in auth.users. As a safety property that is
-- right — an assessment attaches to a person, not to a string — but as a
-- PRODUCT model it is backwards: recruitment starts with somebody the employer
-- knows and the platform does not, and requiring the candidate to sign up
-- before the recruiter can even express the intent puts the burden in the
-- wrong place.
--
-- ── THE MODEL ───────────────────────────────────────────────────────────
--
--   invite  ->  address resolves to an account?
--                 yes -> assign now, exactly as before
--                 no  -> record a PENDING INVITATION carrying its context
--
--   the person later creates or confirms their account
--                     ->  claim  ->  assignment + attempt against their subject
--
-- The pending invitation is an intent, not an assignment. It writes nothing to
-- assessment_assignments and nothing to scp_attempts, holds no subject, and
-- produces no evidence. It carries only what is needed to bind correctly
-- later: who invited, which assessment, which context, and — when the
-- invitation came from a hiring pipeline — which job and application.
--
-- ── WHY GOVERNANCE IS RE-EVALUATED AT CLAIM, NOT FROZEN AT INVITE ───────
--
-- Freezing the governance decision would be simpler and wrong. A closed-test
-- grant expires. A grant gets revoked. Content gets retired. An invitation
-- sent in March and claimed in July must not replay March's permission, so the
-- claim asks scp_grant_permits_assignment again, and an invitation whose basis
-- has since gone away is marked expired and creates nothing. That is the
-- honest outcome and it is visible to the employer.
--
-- ── WHY A CONFIRMED ADDRESS IS THE BINDING KEY ──────────────────────────
--
-- The claim binds on the CALLER's own confirmed email. Not on an unconfirmed
-- one, and never on an address supplied in the request: otherwise anybody
-- could sign up as somebody else's address and take delivery of an assessment
-- meant for them, together with whatever job context travelled with it. Email
-- remains a resolution hint that fills a blank once; the durable key is the
-- subject it resolves to, and everything afterwards reads through that.
--
-- ── SCOPE ───────────────────────────────────────────────────────────────
--
-- One table, three functions, RLS. No existing function is modified. No
-- identity is merged: the claim binds an invitation to the subject the caller
-- already has, or mints one for a genuinely new person, and never moves an
-- invitation between two established subjects.
--
-- Remediation: drop the table and the three functions. Nothing else refers to
-- them, and no assignment created through a claim depends on the invitation
-- row afterwards.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. The intent
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.scp_assessment_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id uuid NOT NULL REFERENCES public.employers(id) ON DELETE RESTRICT,
  assessment_version_id uuid NOT NULL
    REFERENCES public.scp_assessment_versions(id) ON DELETE RESTRICT,

  -- Contact data and a resolution hint. Stored normalised so two spellings of
  -- the same address cannot produce two invitations that bind to two subjects.
  email text NOT NULL CHECK (email = lower(btrim(email)) AND position('@' in email) > 1),
  -- What the employer calls them, when they know. Never used to match: a name
  -- is not an identifier and matching on one is how the wrong person gets
  -- somebody else's assessment.
  invited_name text CHECK (invited_name IS NULL OR length(invited_name) <= 160),

  use_case text NOT NULL CHECK (use_case IN ('workforce','recruitment')),
  application_id uuid REFERENCES public.job_applications(id) ON DELETE SET NULL,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  language text NOT NULL DEFAULT 'sv' CHECK (language IN ('sv','en')),
  deadline timestamptz,

  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','bound','cancelled','expired')),

  -- Filled by the claim, and only by the claim.
  bound_subject_id uuid REFERENCES public.scp_subjects(id) ON DELETE RESTRICT,
  bound_assignment_id uuid REFERENCES public.assessment_assignments(id) ON DELETE SET NULL,
  bound_at timestamptz,
  -- Why an invitation stopped being claimable. Recorded rather than inferred,
  -- because "the grant expired" and "the employer cancelled it" look identical
  -- from the outside and mean different things to the person who was invited.
  closed_reason text,

  invited_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  invited_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  cancelled_at timestamptz,
  cancelled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT scp_invitation_bound_complete CHECK (
    (status <> 'bound' AND bound_subject_id IS NULL AND bound_at IS NULL)
    OR (status = 'bound' AND bound_subject_id IS NOT NULL AND bound_at IS NOT NULL)),
  -- An application is a recruitment object. Same rule the assignment path
  -- enforces, stated here so an invitation cannot be created in a shape the
  -- claim would later have to refuse.
  CONSTRAINT scp_invitation_application_is_recruitment CHECK (
    application_id IS NULL OR use_case = 'recruitment')
);

-- One live invitation per person per assessment per employer. A second one is
-- not a second assessment, it is a duplicate that would bind twice.
CREATE UNIQUE INDEX IF NOT EXISTS scp_assessment_invitations_live_uq
  ON public.scp_assessment_invitations (employer_id, email, assessment_version_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS scp_assessment_invitations_email_idx
  ON public.scp_assessment_invitations (email) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS scp_assessment_invitations_employer_idx
  ON public.scp_assessment_invitations (employer_id, invited_at DESC);

COMMENT ON TABLE public.scp_assessment_invitations IS
  'An intent to assess somebody the platform does not know yet. Deliberately '
  'not an assignment: it holds no subject, creates no attempt and produces no '
  'evidence until the invited person claims it with a CONFIRMED address of '
  'their own. Governance is re-evaluated at claim time, so an invitation whose '
  'basis has expired binds nothing.';

COMMENT ON COLUMN public.scp_assessment_invitations.email IS
  'Contact data and a one-time resolution hint, normalised. NOT the person '
  'identity: the durable key is bound_subject_id, established at claim.';

ALTER TABLE public.scp_assessment_invitations ENABLE ROW LEVEL SECURITY;

-- An employer sees its own invitations. The invited person does not read this
-- table at all — once they claim, they have an assignment, which is the thing
-- their own surfaces are built on.
DROP POLICY IF EXISTS scp_assessment_invitations_employer_read ON public.scp_assessment_invitations;
CREATE POLICY scp_assessment_invitations_employer_read ON public.scp_assessment_invitations
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.employer_memberships m
                  WHERE m.employer_id = scp_assessment_invitations.employer_id
                    AND m.user_id = auth.uid() AND m.status = 'active'));

-- Supabase grants ALL on new public tables to authenticated by default, and the
-- policy above would then be the only thing preventing a direct PostgREST
-- write. Revoked explicitly: the three definer functions below are the only
-- writers.
REVOKE ALL  ON public.scp_assessment_invitations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.scp_assessment_invitations TO authenticated;
GRANT ALL    ON public.scp_assessment_invitations TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Inviting
--
-- One entry point for both cases, because the employer is doing one thing and
-- should not have to know whether the person happens to have signed up. The
-- return says which of the two happened.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.scp_invite_participant(
  _employer_id uuid,
  _assessment_version_id uuid,
  _email text,
  _use_case text DEFAULT 'recruitment',
  _invited_name text DEFAULT NULL,
  _language text DEFAULT 'sv',
  _deadline timestamptz DEFAULT NULL,
  _application_id uuid DEFAULT NULL,
  _job_id uuid DEFAULT NULL)
RETURNS TABLE(outcome text, invitation_id uuid, assignment_id uuid,
              attempt_id uuid, subject_id uuid,
              governance_mode public.scp_governance_mode)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _role text; _norm text; _user uuid; _inv uuid;
  _app_employer uuid; _app_job uuid;
  _definition uuid; _cs text; _vs text; _fx boolean; _retired timestamptz;
  _mode public.scp_governance_mode;
BEGIN
  SELECT m.role INTO _role FROM public.employer_memberships m
   WHERE m.user_id = auth.uid() AND m.employer_id = _employer_id AND m.status = 'active';
  IF _role IS NULL OR _role NOT IN ('owner','admin') THEN
    RAISE EXCEPTION 'SCP_NOT_AUTHORISED_TO_ASSIGN: inviting a participant '
      'requires owner or admin.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  _norm := lower(btrim(coalesce(_email, '')));
  IF position('@' in _norm) < 2 THEN
    RAISE EXCEPTION 'SCP_INVALID_RECIPIENT: "%" is not an address an invitation '
      'can be sent to.', _email USING ERRCODE = 'check_violation';
  END IF;

  -- Resolve the account FIRST. When the person already exists the governed
  -- assign path is the right answer and this function simply delegates — one
  -- code path for permission, purpose and lineage, not two.
  SELECT id INTO _user FROM auth.users WHERE lower(email) = _norm;

  IF _user IS NOT NULL THEN
    RETURN QUERY
    SELECT 'assigned'::text, NULL::uuid, r.assignment_id, r.attempt_id,
           r.subject_id, r.governance_mode
      FROM public.scp_employer_assign(
             _employer_id, _assessment_version_id, _norm, _deadline,
             _language, _use_case, NULL, NULL, _application_id, _job_id) r;
    RETURN;
  END IF;

  -- ── No account. Everything below establishes that the invitation would be
  --    legitimate IF it were claimed today, so an employer learns about a
  --    governance problem now rather than after the candidate signs up.
  SELECT av.definition_id, av.content_status, av.validation_status,
         av.retired_at, d.is_test_fixture
    INTO _definition, _cs, _vs, _retired, _fx
    FROM public.scp_assessment_versions av
    JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
   WHERE av.id = _assessment_version_id;

  IF _definition IS NULL THEN
    RAISE EXCEPTION 'SCP_PROGRAMME_NOT_FOUND: no such assessment version.'
      USING ERRCODE = 'no_data_found';
  END IF;
  IF _retired IS NOT NULL THEN
    RAISE EXCEPTION 'SCP_PROGRAMME_RETIRED: this programme was retired and can '
      'no longer be assigned.' USING ERRCODE = 'check_violation';
  END IF;

  _mode := public.scp_grant_permits_assignment(_employer_id, _definition, _cs, _vs, _fx);
  IF _mode IS NULL THEN
    RAISE EXCEPTION
      'SCP_NO_GOVERNANCE_BASIS: this organisation has no basis to run this '
      'programme, so it cannot invite anybody to it.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _use_case = 'recruitment' AND _mode NOT IN ('recruitment','closed_test') THEN
    RAISE EXCEPTION
      'SCP_NOT_VALID_FOR_RECRUITMENT: this programme may be run as % only.', _mode
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _application_id IS NOT NULL THEN
    SELECT a.employer_id, a.job_id INTO _app_employer, _app_job
      FROM public.job_applications a WHERE a.id = _application_id;
    IF _app_employer IS NULL THEN
      RAISE EXCEPTION 'SCP_APPLICATION_NOT_FOUND: no such job application.'
        USING ERRCODE = 'no_data_found';
    END IF;
    IF _app_employer <> _employer_id THEN
      RAISE EXCEPTION 'SCP_APPLICATION_NOT_YOURS: that application belongs to '
        'another organisation.' USING ERRCODE = 'insufficient_privilege';
    END IF;
    _job_id := _app_job;
  END IF;

  IF _job_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.jobs j WHERE j.id = _job_id AND j.employer_id = _employer_id) THEN
    RAISE EXCEPTION 'SCP_JOB_NOT_YOURS: that job belongs to another '
      'organisation.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO public.scp_assessment_invitations
    (employer_id, assessment_version_id, email, invited_name, use_case,
     application_id, job_id, language, deadline, invited_by,
     expires_at)
  VALUES
    (_employer_id, _assessment_version_id, _norm, nullif(btrim(coalesce(_invited_name,'')),''),
     _use_case, _application_id, _job_id,
     CASE WHEN _language = 'en' THEN 'en' ELSE 'sv' END, _deadline, auth.uid(),
     COALESCE(_deadline, now() + interval '30 days'))
  ON CONFLICT (employer_id, email, assessment_version_id) WHERE status = 'pending'
  DO UPDATE SET invited_name = COALESCE(EXCLUDED.invited_name, public.scp_assessment_invitations.invited_name),
                expires_at = EXCLUDED.expires_at
  RETURNING id INTO _inv;

  RETURN QUERY SELECT 'invited'::text, _inv, NULL::uuid, NULL::uuid, NULL::uuid, _mode;
END;
$function$;

COMMENT ON FUNCTION public.scp_invite_participant(uuid, uuid, text, text, text, text, timestamptz, uuid, uuid) IS
  'Invite somebody to an assessment whether or not they have an account. '
  'Delegates to scp_employer_assign when the address resolves, so permission, '
  'purpose and lineage have exactly one implementation; otherwise records a '
  'pending invitation after checking the same governance the claim will check '
  'again. Returns outcome = assigned | invited.';

REVOKE ALL     ON FUNCTION public.scp_invite_participant(uuid, uuid, text, text, text, text, timestamptz, uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_invite_participant(uuid, uuid, text, text, text, text, timestamptz, uuid, uuid) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Claiming
--
-- Called by the invited person, for themselves, after they have an account
-- with a CONFIRMED address. Idempotent: running it twice binds nothing twice,
-- because the invitation leaves 'pending' the moment it binds.
--
-- Every governance decision is made HERE, now, against today's grants — not
-- replayed from invitation time. An invitation whose basis has gone away is
-- closed with a reason rather than silently producing an attempt nobody may
-- run.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.scp_claim_assessment_invitations()
RETURNS TABLE(invitation_id uuid, assignment_id uuid, attempt_id uuid,
              employer_id uuid, outcome text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _user uuid; _email text; _confirmed timestamptz; _subject uuid;
  _inv record;
  _definition uuid; _cs text; _vs text; _fx boolean; _retired timestamptz;
  _mode public.scp_governance_mode; _grant uuid; _purpose_code text;
  _purpose uuid; _form uuid; _assignment uuid; _attempt uuid;
BEGIN
  _user := auth.uid();
  IF _user IS NULL THEN RETURN; END IF;

  SELECT lower(btrim(u.email)), u.email_confirmed_at
    INTO _email, _confirmed
    FROM auth.users u WHERE u.id = _user;

  -- The whole safety of this path. Without a confirmed address, signing up as
  -- somebody else's email would take delivery of their assessment and the job
  -- context attached to it. Returning nothing is correct and silent: the person
  -- has simply not proved the address yet.
  IF _email IS NULL OR _confirmed IS NULL THEN RETURN; END IF;

  -- One professional identity per human, reused if it exists.
  SELECT si.subject_id INTO _subject
    FROM public.scp_subject_identities si WHERE si.user_id = _user;
  IF _subject IS NULL THEN
    INSERT INTO public.scp_subjects DEFAULT VALUES RETURNING id INTO _subject;
    INSERT INTO public.scp_subject_identities (subject_id, user_id)
    VALUES (_subject, _user);
  END IF;

  FOR _inv IN
    SELECT * FROM public.scp_assessment_invitations i
     WHERE i.email = _email AND i.status = 'pending'
     ORDER BY i.invited_at
     FOR UPDATE
  LOOP
    IF _inv.expires_at <= now() THEN
      UPDATE public.scp_assessment_invitations
         SET status = 'expired', closed_reason = 'invitation_expired'
       WHERE id = _inv.id;
      RETURN QUERY SELECT _inv.id, NULL::uuid, NULL::uuid, _inv.employer_id, 'expired'::text;
      CONTINUE;
    END IF;

    SELECT av.definition_id, av.content_status, av.validation_status,
           av.retired_at, d.is_test_fixture
      INTO _definition, _cs, _vs, _retired, _fx
      FROM public.scp_assessment_versions av
      JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
     WHERE av.id = _inv.assessment_version_id;

    _mode := CASE WHEN _retired IS NOT NULL THEN NULL
                  ELSE public.scp_grant_permits_assignment(
                         _inv.employer_id, _definition, _cs, _vs, _fx) END;

    -- Re-evaluated, not replayed. A revoked or expired grant closes the
    -- invitation instead of producing an attempt.
    IF _mode IS NULL
       OR (_inv.use_case = 'recruitment' AND _mode NOT IN ('recruitment','closed_test'))
    THEN
      UPDATE public.scp_assessment_invitations
         SET status = 'expired',
             closed_reason = CASE WHEN _retired IS NOT NULL THEN 'programme_retired'
                                  ELSE 'governance_basis_withdrawn' END
       WHERE id = _inv.id;
      RETURN QUERY SELECT _inv.id, NULL::uuid, NULL::uuid, _inv.employer_id, 'expired'::text;
      CONTINUE;
    END IF;

    _purpose_code := public.scp_required_purpose_code(_inv.use_case, NULL, _mode);
    SELECT pv.id INTO _purpose
      FROM public.scp_purpose_versions pv
      JOIN public.scp_processing_purposes p ON p.code = pv.purpose_code
     WHERE pv.purpose_code = _purpose_code
       AND p.is_active AND pv.published_at IS NOT NULL AND pv.retired_at IS NULL
     ORDER BY pv.version_number DESC LIMIT 1;

    IF _purpose IS NULL THEN
      UPDATE public.scp_assessment_invitations
         SET status = 'expired', closed_reason = 'purpose_not_available'
       WHERE id = _inv.id;
      RETURN QUERY SELECT _inv.id, NULL::uuid, NULL::uuid, _inv.employer_id, 'expired'::text;
      CONTINUE;
    END IF;

    _grant := NULL;
    IF _mode <> 'recruitment' THEN
      SELECT g.id INTO _grant FROM public.scp_test_grants g
       WHERE g.employer_id = _inv.employer_id AND g.purpose = _mode
         AND g.revoked_at IS NULL
         AND (g.expires_at IS NULL OR g.expires_at > now())
         AND (g.definition_id IS NULL OR g.definition_id = _definition)
       ORDER BY (g.definition_id IS NOT NULL) DESC, g.granted_at DESC LIMIT 1;
    END IF;

    SELECT f.id INTO _form FROM public.scp_forms f
     WHERE f.assessment_version_id = _inv.assessment_version_id
     ORDER BY f.created_at LIMIT 1;

    INSERT INTO public.assessment_assignments
      (employer_id, scp_assessment_version_id, profile_id, use_case,
       recipient_email, recipient_user_id, application_id, job_id, assigned_by,
       invitation_token_hash, expires_at, status, language)
    VALUES
      (_inv.employer_id, _inv.assessment_version_id, 'academy', _inv.use_case,
       _email, _user, _inv.application_id, _inv.job_id, _inv.invited_by,
       encode(sha256((gen_random_uuid()::text || gen_random_uuid()::text)::bytea), 'hex'),
       COALESCE(_inv.deadline, now() + interval '30 days'), 'invited',
       _inv.language)
    RETURNING id INTO _assignment;

    INSERT INTO public.scp_attempts
      (subject_id, issuer_organization_id, assignment_id, mode, form_id,
       assessment_version_id, purpose_version_id, jurisdiction_id,
       scoring_model_version, status, governance_mode,
       validation_status_at_assignment, content_status_at_assignment, test_grant_id)
    VALUES
      (_subject, _inv.employer_id, _assignment, 'assessment', _form,
       _inv.assessment_version_id, _purpose,
       (SELECT id FROM public.scp_jurisdictions WHERE code = 'SE'),
       'det-v1', 'in_progress', _mode, _vs, _cs, _grant)
    RETURNING id INTO _attempt;

    UPDATE public.scp_assessment_invitations
       SET status = 'bound', bound_subject_id = _subject,
           bound_assignment_id = _assignment, bound_at = now()
     WHERE id = _inv.id;

    RETURN QUERY SELECT _inv.id, _assignment, _attempt, _inv.employer_id, 'bound'::text;
  END LOOP;
END;
$function$;

COMMENT ON FUNCTION public.scp_claim_assessment_invitations() IS
  'Binds every pending invitation addressed to the CALLER''S OWN confirmed '
  'email to the caller''s subject, creating the assignment and attempt. Never '
  'takes an address as an argument, so it cannot be pointed at somebody else. '
  'Governance is re-evaluated now: an invitation whose grant was revoked, whose '
  'programme was retired or which has expired is closed with a reason and '
  'creates nothing.';

REVOKE ALL     ON FUNCTION public.scp_claim_assessment_invitations() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_claim_assessment_invitations() TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Cancelling
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.scp_cancel_assessment_invitation(
  _invitation_id uuid,
  _reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE _employer uuid; _status text;
BEGIN
  SELECT i.employer_id, i.status INTO _employer, _status
    FROM public.scp_assessment_invitations i WHERE i.id = _invitation_id;
  IF _employer IS NULL THEN
    RAISE EXCEPTION 'SCP_INVITATION_NOT_FOUND: no such invitation.'
      USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.employer_memberships m
                  WHERE m.employer_id = _employer AND m.user_id = auth.uid()
                    AND m.status = 'active' AND m.role IN ('owner','admin')) THEN
    RAISE EXCEPTION 'SCP_NOT_AUTHORISED_TO_ASSIGN: cancelling an invitation '
      'requires owner or admin.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- A bound invitation is history. Cancelling it would not undo the assignment
  -- it produced, so it must not look as if it had.
  IF _status <> 'pending' THEN
    RAISE EXCEPTION 'SCP_INVITATION_NOT_PENDING: this invitation is "%" and can '
      'no longer be cancelled.', _status USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.scp_assessment_invitations
     SET status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(),
         closed_reason = nullif(btrim(coalesce(_reason,'')),'')
   WHERE id = _invitation_id;
END;
$function$;

REVOKE ALL     ON FUNCTION public.scp_cancel_assessment_invitation(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_cancel_assessment_invitation(uuid, text) TO authenticated;
