CREATE TABLE IF NOT EXISTS public.scp_followup_prompts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competency_id   uuid NOT NULL REFERENCES public.scp_competencies(id) ON DELETE RESTRICT,
  audience        text NOT NULL CHECK (audience IN ('employer','participant')),
  version_number  integer NOT NULL DEFAULT 1,
  content_status  text NOT NULL DEFAULT 'published'
                    CHECK (content_status IN ('draft','published','retired')),
  prompt_sv       text NOT NULL,
  prompt_en       text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (competency_id, audience, version_number)
);

ALTER TABLE public.scp_followup_prompts ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.scp_followup_prompts TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.scp_followup_prompts TO authenticated;
GRANT ALL ON public.scp_followup_prompts TO service_role;

DROP POLICY IF EXISTS scp_followup_prompts_read ON public.scp_followup_prompts;
CREATE POLICY scp_followup_prompts_read ON public.scp_followup_prompts
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS scp_followup_prompts_author_write ON public.scp_followup_prompts;
CREATE POLICY scp_followup_prompts_author_write ON public.scp_followup_prompts
  FOR ALL TO authenticated
  USING (public.scp_can_author(auth.uid()))
  WITH CHECK (public.scp_can_author(auth.uid()));

INSERT INTO public.scp_followup_prompts (competency_id, audience, prompt_sv, prompt_en)
SELECT c.id, v.audience, v.sv, v.en
  FROM public.scp_competencies c
  JOIN (VALUES
    ('SCC-01','employer',
     'Be personen beskriva ett tillfälle då någon med auktoritet bad om ett undantag från en rutin. Vad kontrollerades, vem kontaktades och hur dokumenterades beslutet?',
     'Ask the person to describe a time when somebody with authority asked for an exception to a routine. What did they verify, who did they contact, and how was the decision recorded?'),
    ('SCC-01','participant',
     'Tänk på en gång då någon bad dig frångå en rutin. Vad kontrollerade du innan du svarade?',
     'Think of a time somebody asked you to depart from a routine. What did you check before you answered?'),
    ('SCC-02','employer',
     'Be personen beskriva hur hen avgör vad som är en avvikelse på ett objekt hen är ny på.',
     'Ask the person how they work out what counts as a deviation at a site they are new to.'),
    ('SCC-02','participant',
     'Hur avgör du vad som är normalt på ett objekt du är ny på?',
     'How do you work out what normal looks like at a site you are new to?'),
    ('SCC-03','employer',
     'Be personen gå igenom en rond steg för steg: vad tittar hen efter, och vad får hen att stanna upp?',
     'Ask the person to walk through a patrol step by step: what are they looking for, and what makes them stop?'),
    ('SCC-03','participant',
     'Vad får dig att stanna upp och titta närmare under en rond?',
     'What makes you stop and look more closely during a patrol?'),
    ('SCC-04','employer',
     'Be personen beskriva ett tillfälle med två samtidiga krav. Vad valdes bort, och varför?',
     'Ask the person about a time two things needed doing at once. What did they set aside, and why?'),
    ('SCC-04','participant',
     'Beskriv ett tillfälle då två saker behövde göras samtidigt. Vad valde du bort?',
     'Describe a time two things needed doing at once. What did you set aside?'),
    ('SCC-05','employer',
     'Be personen beskriva ett möte med någon som var upprörd. Vad sa hen först, och vad undvek hen att göra?',
     'Ask the person about an encounter with somebody who was upset. What did they say first, and what did they avoid doing?'),
    ('SCC-05','participant',
     'Hur brukar du inleda ett samtal med någon som är upprörd?',
     'How do you usually open a conversation with somebody who is upset?'),
    ('SCC-06','employer',
     'Be personen läsa upp en egen rapport. Går det att skilja iakttagelse från bedömning?',
     'Ask the person to read out a report they wrote. Can observation be told apart from interpretation?'),
    ('SCC-06','participant',
     'Hur skiljer du på vad du såg och vad du tror hände när du rapporterar?',
     'When you report, how do you separate what you saw from what you think happened?'),
    ('SCC-07','employer',
     'Be personen beskriva hur hen säger nej till en besökare utan att situationen eskalerar.',
     'Ask the person how they say no to a visitor without the situation escalating.'),
    ('SCC-07','participant',
     'Hur säger du nej till någon utan att läget trappas upp?',
     'How do you say no to somebody without the situation escalating?'),
    ('SCC-08','employer',
     'Be personen beskriva en överlämning som gick fel. Vad saknades, och vad gör hen annorlunda nu?',
     'Ask the person about a handover that went wrong. What was missing, and what do they do differently now?'),
    ('SCC-08','participant',
     'Vad tar du alltid med i en överlämning, och varför just det?',
     'What do you always include in a handover, and why that in particular?'),
    ('SCC-09','employer',
     'Be personen beskriva ett tillfälle då hen inte hann klart. Vad rapporterades, och till vem?',
     'Ask the person about a time they did not finish. What was reported, and to whom?'),
    ('SCC-09','participant',
     'Vad gör du när du inte hinner klart med det du skulle?',
     'What do you do when you cannot finish what you were meant to?'),
    ('SCC-10','employer',
     'Be personen beskriva ett tillfälle då instruktionen ändrades mitt i ett pass.',
     'Ask the person about a time the instruction changed in the middle of a shift.'),
    ('SCC-10','participant',
     'Hur gör du när instruktionen ändras mitt i ett pass?',
     'What do you do when the instruction changes in the middle of a shift?'),
    ('SCC-11','employer',
     'Be personen beskriva var gränsen för det egna mandatet går, och ett tillfälle då hen stannade vid den.',
     'Ask the person where the limit of their own mandate sits, and about a time they stopped at it.'),
    ('SCC-11','participant',
     'Var går gränsen för ditt mandat, och när stannade du senast vid den?',
     'Where does the limit of your mandate sit, and when did you last stop at it?'),
    ('SCC-12','employer',
     'Be personen beskriva något hen ändrat i sitt arbetssätt det senaste året, och vad som utlöste det.',
     'Ask the person about something they changed in how they work over the past year, and what prompted it.'),
    ('SCC-12','participant',
     'Vad har du ändrat i ditt arbetssätt senaste året, och varför?',
     'What have you changed in how you work over the past year, and why?')
  ) AS v(code, audience, sv, en) ON v.code = c.code
WHERE NOT EXISTS (
  SELECT 1 FROM public.scp_followup_prompts fp
   WHERE fp.competency_id = c.id AND fp.audience = v.audience AND fp.version_number = 1);

ALTER TABLE public.scp_report_versions
  ADD COLUMN IF NOT EXISTS governance_mode public.scp_governance_mode;

COMMENT ON COLUMN public.scp_report_versions.governance_mode IS
  'Which governance basis this template describes. NULL = generic fallback.';

INSERT INTO public.scp_report_versions
  (report_key, version_number, content_status, audience, threshold_version,
   governance_mode, limitations_sv, limitations_en, published_at)
VALUES
  ('closed-test-employer', 1, 'published', 'employer', 'v1', 'closed_test',
   ARRAY[
     'Innehållet är ett pilotmaterial i stängt test. Det är ännu inte validerat och får inte ensamt ligga till grund för anställnings- eller placeringsbeslut.',
     'Underlaget kommer från ett bedömningstillfälle. Det beskriver vad som visats i just detta underlag, inte personens förmåga i stort.',
     'Nivåerna beskriver underlagets styrka, inte en rangordning av personer.',
     'Arbetsgivaren fattar beslutet. Rapporten är ett underlag för samtal och uppföljning.'],
   ARRAY[
     'This content is closed-test pilot material. It is not yet validated and must not on its own inform an employment or placement decision.',
     'The evidence comes from a single assessment occasion. It describes what was shown in that evidence, not the person''s ability in general.',
     'The levels describe the strength of the evidence, not a ranking of people.',
     'The employer makes the decision. This report is a basis for conversation and follow-up.'],
   now()),
  ('closed-test-participant', 1, 'published', 'participant', 'v1', 'closed_test',
   ARRAY[
     'Det här är ett pilotmaterial i stängt test. Det är inte validerat och används inte ensamt för beslut om anställning.',
     'Underlaget kommer från ett bedömningstillfälle och beskriver vad som visades där.',
     '"Ännu inte visat" betyder att underlaget inte räcker för att visa arbetssättet — inte att du saknar förmågan.',
     'En människa fattar beslutet. Du kan alltid be om rättelse av en faktauppgift.'],
   ARRAY[
     'This is closed-test pilot material. It is not validated and is not used on its own to decide employment.',
     'The evidence comes from one assessment occasion and describes what was shown there.',
     '"Not yet shown" means the evidence is not sufficient to show the way of working — not that you lack the ability.',
     'A person makes the decision. You can always ask for a factual detail to be corrected.'],
   now())
ON CONFLICT DO NOTHING;

ALTER TABLE public.scp_report_snapshots
  ADD COLUMN IF NOT EXISTS evidence_state_version text;

COMMENT ON COLUMN public.scp_report_snapshots.evidence_state_version IS
  'Which display_evidence_state derivation produced this payload. NULL on rows released before the projection existed; those payloads are historical and are never recomputed.';

ALTER TABLE public.scp_report_snapshots
  ADD COLUMN IF NOT EXISTS derivation_input jsonb;

COMMENT ON COLUMN public.scp_report_snapshots.derivation_input IS
  'Internal: per-competency maturity level the display state was derived from. Never sent to an employer or participant payload; exists so a historical report can be reproduced exactly.';

CREATE OR REPLACE FUNCTION public.scp_display_evidence_state(
  _subject_id uuid,
  _competency_version_id uuid,
  _maturity text)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE _needs_action boolean; _reviewer_flagged boolean;
BEGIN
  -- 1. Safety, and only from a human. A severity is something a reviewer wrote
  --    down; it is never derived from a score.
  SELECT EXISTS (
    SELECT 1
      FROM public.scp_competency_evidence e
      JOIN public.scp_behaviour_competency_map m ON m.behaviour_version_id = e.behaviour_version_id
     WHERE e.subject_id = _subject_id
       AND m.competency_version_id = _competency_version_id
       AND e.superseded_by IS NULL
       AND e.is_safety_critical
       AND (e.safety_severity IN ('high','critical') OR e.review_status IN ('pending','in_review'))
  ) INTO _needs_action;

  IF _needs_action THEN RETURN 'critical_follow_up'; END IF;

  -- 2. A reviewer who adjusted or overturned the reading has asked for a
  --    second look, whatever the maturity says.
  SELECT EXISTS (
    SELECT 1
      FROM public.scp_competency_evidence e
      JOIN public.scp_behaviour_competency_map m ON m.behaviour_version_id = e.behaviour_version_id
      JOIN public.scp_human_reviews hr ON hr.id = e.provenance_ref
     WHERE e.subject_id = _subject_id
       AND m.competency_version_id = _competency_version_id
       AND e.superseded_by IS NULL
       AND e.provenance_type = 'human_review'
       AND hr.outcome IN ('adjusted','overturned')
  ) INTO _reviewer_flagged;

  IF _reviewer_flagged THEN RETURN 'follow_up'; END IF;

  -- 3. The strength mapping. limited/developing fall to follow_up because
  --    scp_maturity_thresholds puts sufficiency at consistent_evidence.
  RETURN CASE _maturity
    WHEN 'strong_evidence'     THEN 'strongly_shown'
    WHEN 'consistent_evidence' THEN 'shown'
    WHEN 'no_evidence'         THEN 'not_yet_shown'
    ELSE 'follow_up'
  END;
END;
$function$;

REVOKE ALL ON FUNCTION public.scp_display_evidence_state(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_display_evidence_state(uuid, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.scp_release_attempt_report(_attempt_id uuid)
RETURNS TABLE(participant_snapshot uuid, employer_snapshot uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _a public.scp_attempts%ROWTYPE;
  _role text; _flags jsonb; _emp_payload jsonb; _par_payload jsonb;
  _pv uuid; _ev uuid; _p_id uuid; _e_id uuid; _derivation jsonb;
  _state_version constant text := 'des-v1';
BEGIN
  SELECT a.* INTO _a FROM public.scp_attempts a WHERE a.id = _attempt_id;
  IF _a.id IS NULL THEN RETURN; END IF;

  -- Release is an employer act, restricted the same way identity resolution is.
  SELECT m.role INTO _role FROM public.employer_memberships m
   WHERE m.user_id = auth.uid() AND m.employer_id = _a.issuer_organization_id
     AND m.status = 'active';
  IF _role IS NULL OR _role NOT IN ('owner','admin') THEN
    RAISE EXCEPTION 'SCP_NOT_AUTHORISED_TO_RELEASE: releasing a development '
      'report requires owner or admin in the commissioning organisation.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _a.scored_at IS NULL THEN
    RAISE EXCEPTION 'SCP_RELEASE_BEFORE_SCORED: this attempt still has work '
      'outstanding -- a report cannot be released over an unreviewed response.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _a.released_at IS NOT NULL THEN
    RAISE EXCEPTION 'SCP_ALREADY_RELEASED: this attempt''s report is already '
      'released; snapshots are immutable.' USING ERRCODE = 'unique_violation';
  END IF;

  WITH lines AS (
    SELECT c.code AS competency_code,
           cv.id  AS competency_version_id,
           cv.name_sv, cv.name_en,
           public.scp_compute_maturity(_a.subject_id, cv.id, 'v1', now()) AS maturity,
           count(*) AS observations
      FROM public.scp_competency_evidence e
      JOIN public.scp_behaviour_versions bv ON bv.id = e.behaviour_version_id
      JOIN public.scp_behaviour_competency_map bcm ON bcm.behaviour_version_id = bv.id
      JOIN public.scp_competency_versions cv ON cv.id = bcm.competency_version_id
      JOIN public.scp_competencies c ON c.id = cv.competency_id
     WHERE e.subject_id = _a.subject_id AND e.superseded_by IS NULL
     GROUP BY c.code, cv.id, cv.name_sv, cv.name_en
  ), stated AS (
    SELECT l.*,
           public.scp_display_evidence_state(_a.subject_id, l.competency_version_id, l.maturity) AS state
      FROM lines l
  )
  SELECT jsonb_agg(jsonb_build_object(
           'competency_code',    s.competency_code,
           'competency_name_sv', s.name_sv,
           'competency_name_en', s.name_en,
           'evidence_state',     s.state,
           'observations',       s.observations,
           'followup_sv',        fp.prompt_sv,
           'followup_en',        fp.prompt_en
         ) ORDER BY s.competency_code)
    INTO _emp_payload
    FROM stated s
    LEFT JOIN public.scp_competency_versions cv2 ON cv2.id = s.competency_version_id
    LEFT JOIN public.scp_followup_prompts fp
           ON fp.competency_id = cv2.competency_id
          AND fp.audience = 'employer'
          AND fp.content_status = 'published';

  WITH lines AS (
    SELECT c.code AS competency_code,
           cv.id  AS competency_version_id,
           cv.name_sv, cv.name_en,
           public.scp_compute_maturity(_a.subject_id, cv.id, 'v1', now()) AS maturity,
           count(*) AS observations
      FROM public.scp_competency_evidence e
      JOIN public.scp_behaviour_versions bv ON bv.id = e.behaviour_version_id
      JOIN public.scp_behaviour_competency_map bcm ON bcm.behaviour_version_id = bv.id
      JOIN public.scp_competency_versions cv ON cv.id = bcm.competency_version_id
      JOIN public.scp_competencies c ON c.id = cv.competency_id
     WHERE e.subject_id = _a.subject_id AND e.superseded_by IS NULL
     GROUP BY c.code, cv.id, cv.name_sv, cv.name_en
  ), stated AS (
    SELECT l.*,
           public.scp_display_evidence_state(_a.subject_id, l.competency_version_id, l.maturity) AS state,
           EXISTS (
             SELECT 1 FROM public.scp_competency_evidence e2
               JOIN public.scp_behaviour_competency_map m2 ON m2.behaviour_version_id = e2.behaviour_version_id
              WHERE e2.subject_id = _a.subject_id
                AND m2.competency_version_id = l.competency_version_id
                AND e2.superseded_by IS NULL
                AND e2.provenance_type = 'human_review') AS human_reviewed
      FROM lines l
  )
  SELECT jsonb_agg(jsonb_build_object(
           'competency_code',    s.competency_code,
           'competency_name_sv', s.name_sv,
           'competency_name_en', s.name_en,
           'evidence_state',     s.state,
           'observations',       s.observations,
           'human_reviewed',     s.human_reviewed,
           'reflection_sv',      fp.prompt_sv,
           'reflection_en',      fp.prompt_en
         ) ORDER BY s.competency_code)
    INTO _par_payload
    FROM stated s
    LEFT JOIN public.scp_competency_versions cv2 ON cv2.id = s.competency_version_id
    LEFT JOIN public.scp_followup_prompts fp
           ON fp.competency_id = cv2.competency_id
          AND fp.audience = 'participant'
          AND fp.content_status = 'published';

  SELECT jsonb_agg(jsonb_build_object(
           'competency_code', x.code,
           'maturity_level',  x.maturity,
           'threshold_version', 'v1')
         ORDER BY x.code)
    INTO _derivation
    FROM (
      SELECT c.code,
             public.scp_compute_maturity(_a.subject_id, cv.id, 'v1', now()) AS maturity
        FROM public.scp_competency_evidence e
        JOIN public.scp_behaviour_versions bv ON bv.id = e.behaviour_version_id
        JOIN public.scp_behaviour_competency_map bcm ON bcm.behaviour_version_id = bv.id
        JOIN public.scp_competency_versions cv ON cv.id = bcm.competency_version_id
        JOIN public.scp_competencies c ON c.id = cv.competency_id
       WHERE e.subject_id = _a.subject_id AND e.superseded_by IS NULL
       GROUP BY c.code, cv.id
    ) x;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'behaviour_version_id', e.behaviour_version_id,
           'severity', e.safety_severity,
           'observed_at', e.observed_at)), '[]'::jsonb)
    INTO _flags
    FROM public.scp_competency_evidence e
   WHERE e.subject_id = _a.subject_id
     AND e.is_safety_critical AND e.superseded_by IS NULL;

  SELECT id INTO _pv FROM public.scp_report_versions
   WHERE audience = 'participant' AND content_status = 'published'
     AND (governance_mode = _a.governance_mode OR governance_mode IS NULL)
   ORDER BY (governance_mode IS NOT NULL) DESC, version_number DESC LIMIT 1;
  SELECT id INTO _ev FROM public.scp_report_versions
   WHERE audience = 'employer' AND content_status = 'published'
     AND (governance_mode = _a.governance_mode OR governance_mode IS NULL)
   ORDER BY (governance_mode IS NOT NULL) DESC, version_number DESC LIMIT 1;
  IF _pv IS NULL OR _ev IS NULL THEN
    RAISE EXCEPTION 'SCP_NO_PUBLISHED_REPORT_TEMPLATE: a report cannot be '
      'rendered without a published template for each audience.'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.scp_report_snapshots
    (attempt_id, subject_id, issuer_organization_id, report_version_id,
     audience, payload, safety_flags, scoring_model_version, evidence_state_version,
     derivation_input)
  VALUES (_attempt_id, _a.subject_id, _a.issuer_organization_id, _pv,
          'participant', COALESCE(_par_payload,'[]'::jsonb),
          '[]'::jsonb, _a.scoring_model_version, _state_version, _derivation)
  RETURNING id INTO _p_id;

  INSERT INTO public.scp_report_snapshots
    (attempt_id, subject_id, issuer_organization_id, report_version_id,
     audience, payload, safety_flags, scoring_model_version, evidence_state_version,
     derivation_input)
  VALUES (_attempt_id, _a.subject_id, _a.issuer_organization_id, _ev,
          'employer', COALESCE(_emp_payload,'[]'::jsonb), _flags,
          _a.scoring_model_version, _state_version, _derivation)
  RETURNING id INTO _e_id;

  UPDATE public.scp_attempts SET released_at = now(), status = 'released'
   WHERE id = _attempt_id;

  RETURN QUERY SELECT _p_id, _e_id;
END;
$function$;

DROP FUNCTION IF EXISTS public.scp_subject_progress(uuid);

CREATE OR REPLACE FUNCTION public.scp_subject_progress(_subject_id uuid)
RETURNS TABLE(released_at timestamptz, attempt_id uuid, competency_code text,
              competency_name_sv text, competency_name_en text,
              evidence_state text, observations integer, safety_flag_count integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE _audience text;
BEGIN
  IF EXISTS (SELECT 1 FROM public.scp_subject_identities si
              WHERE si.subject_id = _subject_id AND si.user_id = auth.uid()) THEN
    _audience := 'participant';
  ELSIF EXISTS (SELECT 1 FROM public.scp_attempts a
                  JOIN public.employer_memberships m
                    ON m.employer_id = a.issuer_organization_id
                   AND m.user_id = auth.uid() AND m.status = 'active'
                 WHERE a.subject_id = _subject_id AND a.released_at IS NOT NULL) THEN
    _audience := 'employer';
  ELSE
    RETURN;
  END IF;

  RETURN QUERY
  SELECT s.released_at, s.attempt_id,
         x->>'competency_code', x->>'competency_name_sv', x->>'competency_name_en',
         x->>'evidence_state', (x->>'observations')::int,
         jsonb_array_length(s.safety_flags)
    FROM public.scp_report_snapshots s,
         jsonb_array_elements(s.payload) x
   WHERE s.subject_id = _subject_id
     AND s.audience = _audience
   ORDER BY s.released_at, x->>'competency_code';
END;
$function$;

REVOKE ALL ON FUNCTION public.scp_subject_progress(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_subject_progress(uuid) TO authenticated;