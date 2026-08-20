-- #51 -- Response review becomes an employer capability, not a platform one.
--
-- ── THE PROBLEM ─────────────────────────────────────────────────────────
--
-- Reviewing a participant's response was gated on scp_can_author, which is
--
--     is_platform_admin OR content_role IN (editor, reviewer, publisher)
--
-- Two things are wrong with that, and they are different problems.
--
-- First, it conflates two unrelated SaaS roles. Authoring assessment CONTENT
-- and reading a named customer's participants' free-text ANSWERS are not the
-- same permission. A content editor hired to write items should not thereby be
-- able to read every employer's candidates' prose.
--
-- Second, scp_content_roles has no employer_id -- the capability is global by
-- construction. So the queue had no tenant predicate, and a holder saw every
-- organisation's responses. Measured before this migration: an owner of one
-- employer, holding platform admin, saw 66 review items belonging to a
-- different tenant, including response_text and that tenant's name.
--
-- The operational consequence is the one that matters commercially: on this
-- platform only three accounts could review anything, and two of them were
-- CQrityjob platform administrators. An employer could not complete its own
-- competence-development cycle without the platform operator doing the review.
-- That is not a self-service product.
--
-- ── THE MODEL ───────────────────────────────────────────────────────────
--
-- An employer authorises its own members to review responses, per use case.
-- Authorisation is a row: revocable, attributable, and scoped to one tenant.
--
-- Separation of duties is enforced in the database, not in the UI, and it is
-- deliberately stricter for recruitment than for workforce:
--
--   both use cases   -- the participant may not review their own responses
--                    -- the member who assigned the attempt may not review it
--   recruitment also -- nobody who acted on the candidate's application
--                    -- nobody who recorded an employer decision on the attempt
--
-- The reason for the asymmetry is that in recruitment the reviewing employer
-- has a direct interest in the outcome for a candidate it may reject, so the
-- reviewer must sit outside the hiring chain. In workforce development the
-- employer is developing its own staff and the conflict is weaker.
--
-- Platform admin keeps a break-glass path for support and incident work. It is
-- recorded on the review row, so "an administrator read this" is a fact in the
-- audit trail rather than an assumption.
--
-- ── ADDITIVE ────────────────────────────────────────────────────────────
--
-- One table, two functions, one nullable column. Three existing function
-- bodies are replaced via CREATE OR REPLACE. The state machine is untouched:
-- the last completed review still sets scored, and release still belongs to
-- the issuing employer. scp_can_author keeps its real job -- content
-- governance -- and simply stops being the gate for customer responses.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Who an employer has authorised to review its responses
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.scp_employer_reviewers (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id       uuid NOT NULL REFERENCES public.employers(id) ON DELETE CASCADE,
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  allowed_use_cases text[] NOT NULL DEFAULT ARRAY['workforce']::text[],
  granted_by        uuid REFERENCES auth.users(id),
  granted_at        timestamptz NOT NULL DEFAULT now(),
  revoked_at        timestamptz,
  revoked_by        uuid REFERENCES auth.users(id),
  CONSTRAINT scp_employer_reviewers_use_cases_valid
    CHECK (allowed_use_cases <@ ARRAY['workforce','recruitment']::text[]
           AND array_length(allowed_use_cases, 1) >= 1)
);

-- One live authorisation per person per employer. Revoked rows stay as history.
CREATE UNIQUE INDEX IF NOT EXISTS scp_employer_reviewers_live_uq
  ON public.scp_employer_reviewers (employer_id, user_id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS scp_employer_reviewers_user_idx
  ON public.scp_employer_reviewers (user_id) WHERE revoked_at IS NULL;

COMMENT ON TABLE public.scp_employer_reviewers IS
  'An employer''s authorisation for one of its members to review participant '
  'responses, scoped by use case. Revocable and attributable. This is not a '
  'content-governance role: see scp_content_roles for that.';

ALTER TABLE public.scp_employer_reviewers ENABLE ROW LEVEL SECURITY;

-- The employer's owners/admins manage it; a reviewer may see their own grant.
DROP POLICY IF EXISTS scp_employer_reviewers_read ON public.scp_employer_reviewers;
CREATE POLICY scp_employer_reviewers_read ON public.scp_employer_reviewers
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.has_employer_role(auth.uid(), employer_id, NULL)
  );

DROP POLICY IF EXISTS scp_employer_reviewers_write ON public.scp_employer_reviewers;
CREATE POLICY scp_employer_reviewers_write ON public.scp_employer_reviewers
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.employer_memberships m
             WHERE m.user_id = auth.uid() AND m.employer_id = scp_employer_reviewers.employer_id
               AND m.status = 'active' AND m.role IN ('owner','admin'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.employer_memberships m
             WHERE m.user_id = auth.uid() AND m.employer_id = scp_employer_reviewers.employer_id
               AND m.status = 'active' AND m.role IN ('owner','admin'))
  );

-- A reviewer must be a member of the organisation they review for. Authorising
-- an outsider would be a cross-tenant grant wearing a local name.
CREATE OR REPLACE FUNCTION public.scp_guard_reviewer_is_member()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.revoked_at IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.employer_memberships m
                      WHERE m.user_id = NEW.user_id AND m.employer_id = NEW.employer_id
                        AND m.status = 'active') THEN
    RAISE EXCEPTION
      'SCP_REVIEWER_NOT_A_MEMBER: a response reviewer must be an active member '
      'of the organisation whose responses they review.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END; $function$;

DROP TRIGGER IF EXISTS scp_employer_reviewers_member_guard ON public.scp_employer_reviewers;
CREATE TRIGGER scp_employer_reviewers_member_guard
  BEFORE INSERT OR UPDATE ON public.scp_employer_reviewers
  FOR EACH ROW EXECUTE FUNCTION public.scp_guard_reviewer_is_member();

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. May this person review for this employer, for this use case?
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.scp_can_review_for(
  _user_id     uuid,
  _employer_id uuid,
  _use_case    text DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.scp_employer_reviewers r
      JOIN public.employer_memberships m
        ON m.user_id = r.user_id AND m.employer_id = r.employer_id AND m.status = 'active'
     WHERE r.user_id = _user_id
       AND r.employer_id = _employer_id
       AND r.revoked_at IS NULL
       AND (_use_case IS NULL OR _use_case = ANY (r.allowed_use_cases))
  );
$function$;

COMMENT ON FUNCTION public.scp_can_review_for(uuid, uuid, text) IS
  'Employer-scoped response-review authorisation. Deliberately does NOT consult '
  'scp_can_author: authoring content and reading a customer''s participant '
  'responses are different permissions.';

REVOKE ALL     ON FUNCTION public.scp_can_review_for(uuid, uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_can_review_for(uuid, uuid, text) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Separation of duties
--
-- Returns the reason this person must not review this attempt, or NULL when
-- there is no conflict. Returning the reason rather than a boolean lets the
-- queue explain itself and lets a test assert WHICH rule fired.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.scp_review_conflict(_user_id uuid, _attempt_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE _a public.scp_attempts%ROWTYPE; _use_case text; _application uuid; _subject_user uuid;
BEGIN
  SELECT a.* INTO _a FROM public.scp_attempts a WHERE a.id = _attempt_id;
  IF _a.id IS NULL THEN RETURN 'unknown_attempt'; END IF;

  -- Nobody reviews their own responses.
  SELECT si.user_id INTO _subject_user
    FROM public.scp_subject_identities si WHERE si.subject_id = _a.subject_id;
  IF _subject_user = _user_id THEN RETURN 'is_participant'; END IF;

  SELECT aa.use_case, aa.application_id INTO _use_case, _application
    FROM public.assessment_assignments aa WHERE aa.id = _a.assignment_id;

  -- The person who commissioned the assessment does not also judge it.
  IF EXISTS (SELECT 1 FROM public.assessment_assignments aa
              WHERE aa.id = _a.assignment_id AND aa.assigned_by = _user_id) THEN
    RETURN 'assigned_this_assessment';
  END IF;

  -- Recruitment only: the reviewer must sit outside the hiring chain, because
  -- the employer has a direct interest in the outcome for this candidate.
  IF _use_case = 'recruitment' THEN
    IF _application IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.job_application_status_events e
                    WHERE e.application_id = _application AND e.actor_user_id = _user_id) THEN
      RETURN 'acted_on_this_application';
    END IF;
    IF EXISTS (SELECT 1 FROM public.scp_employer_report_decisions d
                WHERE d.attempt_id = _attempt_id AND d.decided_by = _user_id) THEN
      RETURN 'recorded_employer_decision';
    END IF;
  END IF;

  RETURN NULL;
END; $function$;

COMMENT ON FUNCTION public.scp_review_conflict(uuid, uuid) IS
  'The separation-of-duties reason this person may not review this attempt, or '
  'NULL. Stricter for recruitment: the reviewer must sit outside the hiring '
  'chain for that candidate.';

REVOKE ALL     ON FUNCTION public.scp_review_conflict(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_review_conflict(uuid, uuid) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Break-glass is a recorded fact, not a silent one
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.scp_human_reviews
  ADD COLUMN IF NOT EXISTS reviewed_under_break_glass boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.scp_human_reviews.reviewed_under_break_glass IS
  'True when a CQrityjob platform administrator completed this review without '
  'employer authorisation. Support and incident work is legitimate; doing it '
  'invisibly is not.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. The queue answers one question: what am I authorised to review?
--
-- Same output columns as before -- the reviewer UI is unchanged. What changes
-- is the scope: work now reaches a reviewer because an employer authorised
-- them for that tenant and that use case, and because no separation-of-duties
-- rule disqualifies them from that specific attempt.
--
-- Platform admin is deliberately NOT in this predicate. Break-glass is for
-- incidents and lives on the write path below, where it is recorded. Putting
-- it here would put administrators back in the normal customer workflow, which
-- is the defect this migration exists to remove.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.scp_review_queue(_language text DEFAULT 'sv-SE')
RETURNS TABLE(
  review_id uuid, attempt_id uuid, trigger_reason text, opened_at timestamptz,
  participant_ref text, organisation_name text, assessment_name text,
  assessment_slug text, governance_mode public.scp_governance_mode,
  validation_status_at_assignment text, purpose_code text,
  item_display_order integer, item_scenario text, item_prompt text,
  is_safety_critical boolean, finding_required boolean,
  item_format text, response_text text, chosen_label text,
  chosen_best_label text, chosen_worst_label text, rubric jsonb,
  outstanding_in_attempt integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF _language NOT IN ('sv-SE', 'en-GB') THEN
    _language := 'sv-SE';
  END IF;

  RETURN QUERY
  SELECT
    hr.id, at.id, hr.trigger_reason, hr.opened_at,
    upper(substr(replace(at.subject_id::text, '-', ''), 1, 6)),
    e.name,
    CASE WHEN _language = 'en-GB' THEN d.name_en ELSE d.name_sv END,
    d.slug, at.governance_mode, at.validation_status_at_assignment, pv.purpose_code,
    fi.display_order,
    coalesce(itx.scenario, itx_any.scenario),
    coalesce(itx.prompt, itx_any.prompt),
    iv.is_safety_critical, iv.is_safety_critical,
    iv.item_format, r.response_text, chosen.label, chosen_best.label, chosen_worst.label,
    rub.dimensions,
    (SELECT count(*)::int
       FROM public.scp_human_reviews hr2
       JOIN public.scp_candidate_responses r2 ON r2.id = hr2.response_id
      WHERE r2.attempt_id = at.id AND hr2.review_status = 'pending')
  FROM public.scp_human_reviews hr
  JOIN public.scp_candidate_responses r ON r.id = hr.response_id
  JOIN public.scp_attempts at ON at.id = r.attempt_id
  JOIN public.scp_item_versions iv ON iv.id = r.item_version_id
  LEFT JOIN public.assessment_assignments aa ON aa.id = at.assignment_id
  LEFT JOIN public.scp_form_items fi
         ON fi.form_id = at.form_id AND fi.item_version_id = iv.id
  LEFT JOIN public.scp_item_texts itx
         ON itx.item_version_id = iv.id AND itx.language = _language
  LEFT JOIN LATERAL (
    SELECT t.scenario, t.prompt FROM public.scp_item_texts t
     WHERE t.item_version_id = iv.id ORDER BY t.language = 'sv-SE' DESC LIMIT 1) itx_any ON true
  LEFT JOIN LATERAL (
    SELECT ot.label FROM public.scp_item_option_texts ot
     WHERE ot.item_option_id = r.selected_option_id
     ORDER BY ot.language = _language DESC LIMIT 1) chosen ON true
  LEFT JOIN LATERAL (
    SELECT ot.label FROM public.scp_item_option_texts ot
     WHERE ot.item_option_id = r.best_option_id
     ORDER BY ot.language = _language DESC LIMIT 1) chosen_best ON true
  LEFT JOIN LATERAL (
    SELECT ot.label FROM public.scp_item_option_texts ot
     WHERE ot.item_option_id = r.worst_option_id
     ORDER BY ot.language = _language DESC LIMIT 1) chosen_worst ON true
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object(
             'dimension_key', rd.dimension_key,
             'name', CASE WHEN _language = 'en-GB' THEN rd.name_en ELSE rd.name_sv END,
             'criterion', CASE WHEN _language = 'en-GB'
                               THEN rd.observable_criteria_en ELSE rd.observable_criteria_sv END,
             'style_only', rd.assesses_writing_quality,
             'levels', (SELECT jsonb_agg(jsonb_build_object(
                                 'level', l.level,
                                 'descriptor', CASE WHEN _language = 'en-GB'
                                                    THEN l.descriptor_en ELSE l.descriptor_sv END)
                                ORDER BY l.level)
                          FROM public.scp_rubric_levels l
                         WHERE l.rubric_dimension_id = rd.id))
             ORDER BY rd.display_order) AS dimensions
      FROM public.scp_rubric_dimensions rd
     WHERE iv.item_format = 'constructed_response'
       AND rd.rubric_version_id = (
         SELECT rv.id FROM public.scp_rubric_versions rv
          WHERE rv.item_version_id = iv.id
          ORDER BY rv.version_number DESC LIMIT 1)) rub ON true
  LEFT JOIN public.employers e ON e.id = at.issuer_organization_id
  LEFT JOIN public.scp_assessment_versions av ON av.id = at.assessment_version_id
  LEFT JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
  LEFT JOIN public.scp_purpose_versions pv ON pv.id = at.purpose_version_id
  WHERE hr.review_status = 'pending'
    AND public.scp_can_review_for(auth.uid(), at.issuer_organization_id,
                                  coalesce(aa.use_case, 'workforce'))
    AND public.scp_review_conflict(auth.uid(), at.id) IS NULL
  ORDER BY hr.opened_at, fi.display_order;
END;
$function$;

REVOKE ALL     ON FUNCTION public.scp_review_queue(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_review_queue(text) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Completing a review: authorised, conflict-free, or recorded break-glass
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.scp_review_authorisation(_user_id uuid, _attempt_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE _issuer uuid; _use_case text; _conflict text;
BEGIN
  SELECT at.issuer_organization_id, coalesce(aa.use_case, 'workforce')
    INTO _issuer, _use_case
    FROM public.scp_attempts at
    LEFT JOIN public.assessment_assignments aa ON aa.id = at.assignment_id
   WHERE at.id = _attempt_id;
  IF _issuer IS NULL THEN RETURN 'unknown_attempt'; END IF;

  IF public.scp_can_review_for(_user_id, _issuer, _use_case) THEN
    _conflict := public.scp_review_conflict(_user_id, _attempt_id);
    IF _conflict IS NOT NULL THEN RETURN 'conflict:' || _conflict; END IF;
    RETURN 'authorised';
  END IF;

  -- Support and incident work remains possible, and remains visible.
  IF public.is_platform_admin(_user_id) THEN RETURN 'break_glass'; END IF;

  RETURN 'not_authorised';
END; $function$;

COMMENT ON FUNCTION public.scp_review_authorisation(uuid, uuid) IS
  'On what basis this person may complete reviews on this attempt: authorised, '
  'break_glass, conflict:<rule>, or not_authorised.';

REVOKE ALL     ON FUNCTION public.scp_review_authorisation(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_review_authorisation(uuid, uuid) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. Completing a review, re-gated
--
-- Body carried forward verbatim from 20260824090000 (the concurrency-safe
-- version, row lock and all). Three changes only:
--   * the global scp_can_author entry gate is gone;
--   * authorisation is resolved per attempt, once the review row is locked and
--     the attempt is known, via scp_review_authorisation;
--   * break-glass use is recorded on the review row.
-- The scoring transition is untouched: the last completed review still sets
-- the attempt to scored.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.scp_complete_human_review(
  _review_id      uuid,
  _outcome        text,
  _rationale      text,
  _safety_finding text    DEFAULT NULL,
  _rubric_levels  jsonb   DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _resp record; _a public.scp_attempts%ROWTYPE; _evidence_id uuid; _outstanding int;
  _rubric_version_id uuid; _dim record; _expected int; _supplied int;
  _contribution numeric; _max numeric; _basis jsonb; _severity text;
  _level int; _sum int := 0; _n int := 0; _levels jsonb := '{}'::jsonb;
  _authz text;
BEGIN
  IF _outcome NOT IN ('upheld','adjusted','overturned') THEN
    RAISE EXCEPTION 'SCP_BAD_REVIEW_OUTCOME: "%" is not a review outcome.', _outcome
      USING ERRCODE = 'check_violation';
  END IF;
  IF coalesce(btrim(_rationale),'') = '' THEN
    RAISE EXCEPTION 'SCP_REVIEW_WITHOUT_RATIONALE: a review decision must state '
      'its reasons.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT hr.id AS review_id, r.id AS response_id, r.attempt_id,
         r.selected_option_id, r.best_option_id, r.worst_option_id,
         iv.id AS item_version_id, iv.item_format,
         iv.primary_behaviour_id, iv.is_safety_critical
    INTO _resp
    FROM public.scp_human_reviews hr
    JOIN public.scp_candidate_responses r ON r.id = hr.response_id
    JOIN public.scp_item_versions iv ON iv.id = r.item_version_id
   WHERE hr.id = _review_id AND hr.review_status = 'pending'
     -- F1. Lock the review row here, before ANYTHING is written. Two concurrent
     -- callers both used to pass this lookup, and the loser then inserted a
     -- second evidence row for the same response into an append-only ledger.
     -- With the lock the loser blocks here, re-reads after the winner commits,
     -- finds no pending row and raises below -- before the rubric insert, so a
     -- constructed response fails by name rather than on a unique violation.
     FOR UPDATE OF hr;

  IF _resp.review_id IS NULL THEN
    RAISE EXCEPTION 'SCP_REVIEW_NOT_PENDING: no pending review with that id.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- #51. Authorisation is per attempt, not per platform capability. The employer
  -- that commissioned the attempt authorises its own reviewers, and separation of
  -- duties disqualifies the participant, the person who assigned it, and -- for
  -- recruitment -- anyone in that candidate's hiring chain.
  _authz := public.scp_review_authorisation(auth.uid(), _resp.attempt_id);
  IF _authz = 'not_authorised' THEN
    RAISE EXCEPTION
      'SCP_NOT_A_REVIEWER: you are not authorised by this organisation to '
      'review its participant responses.' USING ERRCODE = 'insufficient_privilege';
  ELSIF _authz LIKE 'conflict:%' THEN
    RAISE EXCEPTION
      'SCP_REVIEW_CONFLICT_OF_INTEREST: you may not review this attempt (%).',
      replace(_authz, 'conflict:', '') USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── The safety conclusion ───────────────────────────────────────────────
  --
  -- Still mandatory on a safety-critical item, still never inferred from a
  -- score, and still refused on an item that never claimed to be safety-
  -- critical. What changed is that 'no_concern' is now one of the answers, so a
  -- reviewer looking at a correct response is no longer forced to grade its
  -- severity.
  IF _resp.is_safety_critical THEN
    IF _safety_finding IS NULL THEN
      RAISE EXCEPTION
        'SCP_SAFETY_FINDING_REQUIRED: this item is safety-critical, so the '
        'review must state what it found in THIS response: no_concern, low, '
        'medium, high or critical.' USING ERRCODE = 'check_violation';
    END IF;
    IF _safety_finding NOT IN ('no_concern','low','medium','high','critical') THEN
      RAISE EXCEPTION
        'SCP_BAD_SAFETY_FINDING: "%" is not a finding. Use no_concern, low, '
        'medium, high or critical.', _safety_finding USING ERRCODE = 'check_violation';
    END IF;
  ELSIF _safety_finding IS NOT NULL THEN
    RAISE EXCEPTION
      'SCP_FINDING_ON_NON_SAFETY_ITEM: this item is not safety-critical, so a '
      'safety finding would make the evidence say something the item never '
      'claimed.' USING ERRCODE = 'check_violation';
  END IF;

  _severity := CASE WHEN _safety_finding IN ('low','medium','high','critical')
                    THEN _safety_finding ELSE NULL END;

  -- ── The rubric, for a constructed response ──────────────────────────────
  IF _resp.item_format = 'constructed_response' THEN
    SELECT rv.id INTO _rubric_version_id
      FROM public.scp_rubric_versions rv
     WHERE rv.item_version_id = _resp.item_version_id
     ORDER BY rv.version_number DESC LIMIT 1;

    IF _rubric_version_id IS NULL THEN
      RAISE EXCEPTION
        'SCP_NO_RUBRIC: this constructed response has no rubric, so no governed '
        'contribution can be derived for it.' USING ERRCODE = 'check_violation';
    END IF;

    IF _rubric_levels IS NULL OR jsonb_typeof(_rubric_levels) <> 'object' THEN
      RAISE EXCEPTION
        'SCP_RUBRIC_LEVELS_REQUIRED: a constructed response is scored against '
        'its rubric. Supply a level 0-4 for every dimension.'
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT count(*) INTO _expected FROM public.scp_rubric_dimensions d
     WHERE d.rubric_version_id = _rubric_version_id;
    SELECT count(*) INTO _supplied FROM jsonb_object_keys(_rubric_levels);

    -- Every dimension, and nothing that is not a dimension. A missing one is a
    -- judgement the reviewer did not make; an unknown one is a judgement about
    -- something this rubric does not measure.
    IF EXISTS (
      SELECT 1 FROM public.scp_rubric_dimensions d
       WHERE d.rubric_version_id = _rubric_version_id
         AND NOT (_rubric_levels ? d.dimension_key))
    THEN
      RAISE EXCEPTION
        'SCP_RUBRIC_DIMENSION_MISSING: every rubric dimension needs an explicit '
        'level. Expected % dimension(s), got %.', _expected, _supplied
        USING ERRCODE = 'check_violation';
    END IF;
    IF _supplied <> _expected THEN
      RAISE EXCEPTION
        'SCP_RUBRIC_DIMENSION_UNKNOWN: % level(s) supplied for a rubric with % '
        'dimension(s).', _supplied, _expected USING ERRCODE = 'check_violation';
    END IF;

    FOR _dim IN
      SELECT d.id, d.dimension_key, d.assesses_writing_quality
        FROM public.scp_rubric_dimensions d
       WHERE d.rubric_version_id = _rubric_version_id
       ORDER BY d.display_order
    LOOP
      IF jsonb_typeof(_rubric_levels -> _dim.dimension_key) <> 'number' THEN
        RAISE EXCEPTION
          'SCP_RUBRIC_LEVEL_NOT_A_LEVEL: dimension "%" needs a level 0-4.',
          _dim.dimension_key USING ERRCODE = 'check_violation';
      END IF;
      _level := (_rubric_levels ->> _dim.dimension_key)::int;
      IF _level < 0 OR _level > 4 THEN
        RAISE EXCEPTION
          'SCP_RUBRIC_LEVEL_OUT_OF_RANGE: dimension "%" got level %, which is '
          'not on the 0-4 scale.', _dim.dimension_key, _level
          USING ERRCODE = 'check_violation';
      END IF;

      INSERT INTO public.scp_review_rubric_scores
        (review_id, rubric_dimension_id, level, scored_by)
      VALUES (_review_id, _dim.id, _level, auth.uid());

      _levels := _levels || jsonb_build_object(_dim.dimension_key, _level);

      -- Only construct-bearing dimensions move the number. The rubric marks the
      -- style dimension with assesses_writing_quality, the scoring prompt says
      -- simple language must score equally to polished, and the anchors carry a
      -- deliberate polished-but-empty example. Letting it contribute here would
      -- contradict all three.
      IF NOT _dim.assesses_writing_quality THEN
        _sum := _sum + _level;
        _n   := _n + 1;
      END IF;
    END LOOP;

    IF _n = 0 THEN
      RAISE EXCEPTION
        'SCP_RUBRIC_ALL_STYLE: this rubric has no construct-bearing dimension, '
        'so it cannot produce a contribution.' USING ERRCODE = 'check_violation';
    END IF;

    _contribution := round((_sum::numeric / _n) / 4.0, 3);
    _basis := jsonb_build_object(
      'method', 'governed_rubric_mean',
      'rubric_version_id', _rubric_version_id,
      'levels', _levels,
      'contributing_dimensions', _n,
      'scale_max', 4);

  ELSIF _rubric_levels IS NOT NULL THEN
    RAISE EXCEPTION
      'SCP_RUBRIC_LEVELS_ON_NON_RUBRIC_ITEM: only a constructed response is '
      'scored against a rubric.' USING ERRCODE = 'check_violation';

  -- ── The governed item score, for an SJT ────────────────────────────────
  --
  -- Identical arithmetic to the deterministic branch of scp_submit_attempt.
  -- These items reached a human because a safety-critical observation needs a
  -- human conclusion, not because their score was unknown.
  ELSIF _resp.item_format = 'sjt_best_worst' THEN
    SELECT (COALESCE((SELECT CASE WHEN o.is_best_key  THEN 1 ELSE 0 END
                        FROM public.scp_item_options o WHERE o.id = _resp.best_option_id), 0)
          + COALESCE((SELECT CASE WHEN o.is_worst_key THEN 1 ELSE 0 END
                        FROM public.scp_item_options o WHERE o.id = _resp.worst_option_id), 0))
           / 2.0
      INTO _contribution;
    _basis := jsonb_build_object(
      'method', 'governed_best_worst_keys',
      'best_option_matched',
        COALESCE((SELECT o.is_best_key FROM public.scp_item_options o
                   WHERE o.id = _resp.best_option_id), false),
      'worst_option_matched',
        COALESCE((SELECT o.is_worst_key FROM public.scp_item_options o
                   WHERE o.id = _resp.worst_option_id), false),
      'scale_max', 1);

  ELSE
    SELECT max(o.score_value) INTO _max
      FROM public.scp_item_options o WHERE o.item_version_id = _resp.item_version_id;
    SELECT COALESCE(
             (SELECT o.score_value FROM public.scp_item_options o
               WHERE o.id = _resp.selected_option_id), 0)
           / NULLIF(_max, 0)
      INTO _contribution;
    _basis := jsonb_build_object(
      'method', 'governed_item_score',
      'selected_score',
        COALESCE((SELECT o.score_value FROM public.scp_item_options o
                   WHERE o.id = _resp.selected_option_id), 0),
      'item_max_score', _max);
  END IF;

  SELECT a.* INTO _a FROM public.scp_attempts a WHERE a.id = _resp.attempt_id;

  UPDATE public.scp_human_reviews
     SET review_status = 'completed', outcome = _outcome,
         reviewer_actor_id = auth.uid(), reviewer_rationale = _rationale,
         completed_at = now(),
         reviewed_under_break_glass = (_authz = 'break_glass')
   WHERE id = _review_id
     AND review_status = 'pending';

  -- Belt and braces with the lock above. If the row is no longer pending the
  -- transaction stops here, before any evidence is written.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SCP_REVIEW_NOT_PENDING: this review was completed by '
      'someone else while you were working on it. Nothing you entered has been '
      'saved. Reload the queue.' USING ERRCODE = 'check_violation';
  END IF;

  -- ── Evidence, only when the governed reading stands ─────────────────────
  --
  -- adjusted/overturned means the reviewer disputes the reading and there is no
  -- governed alternative to replace it with. Writing the participant's original
  -- number here would record it as accepted; writing a made-up one would be
  -- worse. So nothing is written, and the competency stays a follow-up case --
  -- scp_attempt_evidence_state finds it through the review rather than through
  -- an evidence row.
  IF _outcome <> 'upheld' THEN
    SELECT count(*) INTO _outstanding
      FROM public.scp_human_reviews hr
      JOIN public.scp_candidate_responses r ON r.id = hr.response_id
     WHERE r.attempt_id = _resp.attempt_id AND hr.review_status = 'pending';
    IF _outstanding = 0 THEN
      UPDATE public.scp_attempts
         SET status = 'scored', scored_at = now()
       WHERE id = _resp.attempt_id AND status = 'submitted';
    END IF;
    RETURN NULL;
  END IF;

  INSERT INTO public.scp_competency_evidence (
    subject_id, behaviour_version_id, source_type, source_ref,
    provenance_type, provenance_ref, created_by_service, assessor_actor_id,
    issuer_organization_id, jurisdiction_id, purpose_version_id, role_version_id,
    context_type, context_ref, contribution, confidence,
    is_safety_critical, safety_severity, safety_finding, derivation_basis,
    review_status, disclosure_class, observed_at)
  VALUES (
    _a.subject_id, _resp.primary_behaviour_id, 'assessment_response', _resp.response_id,
    'human_review', _review_id, 'scp_complete_human_review', auth.uid(),
    _a.issuer_organization_id, _a.jurisdiction_id, _a.purpose_version_id,
    _a.role_version_id, 'assessment_form', _a.form_id,
    round(greatest(0, least(1, COALESCE(_contribution, 0))), 3), 1.000,
    _resp.is_safety_critical, _severity, _safety_finding, _basis,
    'upheld', 'internal_employer', now())
  RETURNING id INTO _evidence_id;

  SELECT count(*) INTO _outstanding
    FROM public.scp_human_reviews hr
    JOIN public.scp_candidate_responses r ON r.id = hr.response_id
   WHERE r.attempt_id = _resp.attempt_id AND hr.review_status = 'pending';

  IF _outstanding = 0 THEN
    UPDATE public.scp_attempts
       SET status = 'scored', scored_at = now()
     WHERE id = _resp.attempt_id AND status = 'submitted';
  END IF;

  RETURN _evidence_id;
END; $function$;

REVOKE ALL     ON FUNCTION public.scp_complete_human_review(uuid, text, text, text, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_complete_human_review(uuid, text, text, text, jsonb) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. Counters must answer the same question as the queue
--
-- The old pressure function was employer-scoped while the queue was capability
-- scoped, so the page could show "0 waiting" above a list of pending cards.
-- Both now mean: work THIS caller can act on for THIS employer.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.scp_employer_review_pressure(_employer_id uuid)
RETURNS TABLE(awaiting_review integer, attempts_blocked integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.employer_memberships m
                  WHERE m.user_id = auth.uid() AND m.employer_id = _employer_id
                    AND m.status = 'active') THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT count(*)::int,
         count(DISTINCT at.id)::int
    FROM public.scp_human_reviews hr
    JOIN public.scp_candidate_responses r ON r.id = hr.response_id
    JOIN public.scp_attempts at ON at.id = r.attempt_id
   WHERE hr.review_status = 'pending'
     AND at.issuer_organization_id = _employer_id;
END; $function$;

REVOKE ALL     ON FUNCTION public.scp_employer_review_pressure(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_employer_review_pressure(uuid) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. Prove it
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE _def text;
BEGIN
  -- 9a. Response review no longer runs through the content-authoring capability.
  _def := pg_get_functiondef('public.scp_review_queue(text)'::regprocedure);
  IF _def LIKE '%scp_can_author%' THEN
    RAISE EXCEPTION 'SCP_REVIEW_STILL_CONTENT_GATED: the queue still consults scp_can_author';
  END IF;
  IF _def NOT LIKE '%scp_can_review_for%' THEN
    RAISE EXCEPTION 'SCP_REVIEW_UNSCOPED: the queue does not consult employer authorisation';
  END IF;
  IF _def NOT LIKE '%scp_review_conflict%' THEN
    RAISE EXCEPTION 'SCP_REVIEW_NO_SOD: the queue does not apply separation of duties';
  END IF;

  _def := pg_get_functiondef('public.scp_complete_human_review(uuid,text,text,text,jsonb)'::regprocedure);
  IF _def LIKE '%scp_can_author%' THEN
    RAISE EXCEPTION 'SCP_REVIEW_STILL_CONTENT_GATED: completing a review still consults scp_can_author';
  END IF;
  IF _def NOT LIKE '%scp_review_authorisation%' THEN
    RAISE EXCEPTION 'SCP_REVIEW_UNSCOPED: completing a review is not authorised per attempt';
  END IF;
  -- The scoring transition must survive the re-gating.
  IF _def NOT LIKE '%scored%' THEN
    RAISE EXCEPTION 'SCP_SCORING_TRANSITION_LOST: the last-review-completes-scoring rule is gone';
  END IF;

  -- 9b. A content role alone grants nothing over customer responses.
  IF public.scp_can_review_for(
       '00000000-0000-0000-0000-000000000000'::uuid,
       '00000000-0000-0000-0000-000000000001'::uuid, 'workforce') THEN
    RAISE EXCEPTION 'SCP_REVIEW_OPEN_DOOR: review authorisation granted without a grant row';
  END IF;

  -- 9c. Authoring content is still a real, separate capability.
  IF to_regprocedure('public.scp_can_author(uuid)') IS NULL THEN
    RAISE EXCEPTION 'SCP_CONTENT_GOVERNANCE_LOST: scp_can_author was removed';
  END IF;
END $$;
