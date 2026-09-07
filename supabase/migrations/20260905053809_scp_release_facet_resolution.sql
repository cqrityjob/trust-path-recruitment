-- =============================================================================
-- TRUST Evidence Report — pre-R1 prerequisite: facet resolution by domain key
--
-- ── THE DEFECT ──────────────────────────────────────────────────────────────
--
-- scp_release_attempt_report (20260830093000) selects the interview-guide
-- prompt for a self-report entry with
--
--     p.facet_id = (SELECT f2.id FROM public.scp_competency_facets f2
--                    WHERE f2.slug = g.facet_slug)
--
-- A facet's identity is (competency_id, slug) -- that is the table's UNIQUE
-- constraint -- and a slug alone is not an identity. Wherever two facets share
-- a slug the scalar subquery returns two rows and the release fails with
-- 21000 "more than one row returned by a subquery used as an expression".
-- Production (wrygicdfxwjnrugduxnt, 2026-09-04) carries 48 historical facet
-- rows from the retired project's data restore whose competency ids no
-- longer exist, so every Väktare facet slug exists twice there and the
-- newest attempt cannot be released. Nothing in the bank, the scoring, the
-- signal or the report is wrong; the lookup is.
--
-- ── WHAT THIS FILE DOES ───────────────────────────────────────────────────
--
-- One CREATE OR REPLACE of scp_release_attempt_report: the 20260830093000
-- body, byte-for-byte, except that the guide's facet lookup binds the
-- prompt's facet to the area's competency AND the slug:
--
--     EXISTS (SELECT 1 FROM public.scp_competency_facets f2
--              WHERE f2.id = p.facet_id
--                AND f2.competency_id = c.id
--                AND f2.slug = g.facet_slug)
--
-- No LIMIT 1, no DISTINCT ON, no ORDER BY to pick one, no row deleted or
-- updated, no foreign key weakened. Grants, SECURITY DEFINER posture, pinned
-- search_path, the audience contracts and the report output contract are
-- unchanged: for a database where every slug is unique the released
-- documents are identical before and after (proven in
-- supabase/tests/scp_release_facet_resolution_test.sql).
--
-- ── ORDER ─────────────────────────────────────────────────────────────────
--
-- Sits between R2A-3 CONTRACT (20261026090000) and R1 provenance
-- (20261027090000). R1 refuses unless this correction is in place, and R1's
-- rollback restores THIS function, never the slug-only one.
--
-- Rollback: supabase/rollback/20261026093000_scp_release_facet_resolution_rollback.sql
-- (restores the 20260830093000 body verbatim; refuses while R1 is applied).
-- =============================================================================

-- ═══════════════════════════════════════════════════════════════════════════
-- §0  Refuse unless this is the pre-R1 function this file corrects
-- ═══════════════════════════════════════════════════════════════════════════

DO $pre$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public' AND p.proname = 'scp_report_manifest_computation') THEN
    RAISE EXCEPTION 'SCP_FACET_PRECONDITION: R1 provenance is applied; this correction belongs before it. Roll R1 back first, or apply the corrected R1.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'public' AND p.proname = 'scp_release_attempt_report' AND p.prosecdef
                    AND p.prosrc LIKE '%_observed_scope%'
                    AND p.prosrc LIKE '%scp_interview_guide_prompts%'
                    AND p.prosrc NOT LIKE '%_calculated_at%') THEN
    RAISE EXCEPTION 'SCP_FACET_PRECONDITION: scp_release_attempt_report is not the 20260830093000 definition this file corrects';
  END IF;
END
$pre$;

-- ═══════════════════════════════════════════════════════════════════════════
-- §1  The release function, corrected
-- ═══════════════════════════════════════════════════════════════════════════

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
  _emp_ctx jsonb; _par_ctx jsonb; _emp_brief jsonb; _par_brief jsonb;
  _org text; _purpose text; _slug text; _name_sv text; _name_en text;
  _version int; _lang text; _person text; _ref text;
  _rev_total int; _rev_done int; _obs int; _ctx int; _concerns int;
  _self int; _quick int; _answered int;
  _pv_key text; _ev_key text; _pv_num int; _ev_num int;
  _modules jsonb; _observed jsonb; _selfrep jsonb; _guide jsonb;
  _state_version constant text := 'des-v2';
  _scope_version constant text := 'attempt-v1';
  _brief_version constant text := 'rab-v1';
  _signal_version constant text := 'ras-v1';
BEGIN
  SELECT a.* INTO _a FROM public.scp_attempts a WHERE a.id = _attempt_id;
  IF _a.id IS NULL THEN RETURN; END IF;

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

  CREATE TEMP TABLE _scope ON COMMIT DROP AS
  SELECT e.id
    FROM public.scp_competency_evidence e
   WHERE e.superseded_by IS NULL
     AND e.source_ref IN (SELECT r.id FROM public.scp_candidate_responses r
                           WHERE r.attempt_id = _attempt_id);

  -- The evidence-kind boundary, established once and used everywhere below.
  CREATE TEMP TABLE _observed_scope ON COMMIT DROP AS
  SELECT e.id
    FROM public.scp_competency_evidence e
    JOIN public.scp_evidence_source_types t
      ON t.code = e.source_type AND t.counts_toward_maturity
   WHERE e.id IN (SELECT id FROM _scope);

  SELECT e.name INTO _org FROM public.employers e WHERE e.id = _a.issuer_organization_id;
  SELECT pv2.purpose_code INTO _purpose
    FROM public.scp_purpose_versions pv2 WHERE pv2.id = _a.purpose_version_id;
  SELECT d.slug, d.name_sv, d.name_en, av.version_number
    INTO _slug, _name_sv, _name_en, _version
    FROM public.scp_assessment_versions av
    JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
   WHERE av.id = _a.assessment_version_id;
  SELECT aa.language,
         CASE WHEN aa.employee_id IS NOT NULL OR aa.use_case = 'workforce'
              THEN 'employee' ELSE 'candidate' END
    INTO _lang, _person
    FROM public.assessment_assignments aa WHERE aa.id = _a.assignment_id;

  _ref := upper(substr(replace(_a.subject_id::text, '-', ''), 1, 6));

  SELECT count(*), count(DISTINCT e.context_ref)
    INTO _obs, _ctx
    FROM public.scp_competency_evidence e
   WHERE e.id IN (SELECT id FROM _observed_scope);

  SELECT count(*) INTO _self
    FROM public.scp_competency_evidence e
   WHERE e.id IN (SELECT id FROM _scope) AND e.source_type = 'self_report';

  SELECT count(*), count(*) FILTER (WHERE hr.review_status = 'completed')
    INTO _rev_total, _rev_done
    FROM public.scp_human_reviews hr
    JOIN public.scp_candidate_responses r ON r.id = hr.response_id
   WHERE r.attempt_id = _attempt_id;

  SELECT count(*) INTO _concerns
    FROM public.scp_competency_evidence e
   WHERE e.id IN (SELECT id FROM _scope)
     AND e.safety_finding IN ('low','medium','high','critical');

  -- A pace observation, and nothing more than that. Counts answers recorded
  -- within three seconds of the previous one, and is reported as a fact about
  -- the RUN rather than a finding about the person: fast answering has many
  -- innocent explanations -- a re-read pass, a resumed session, a confident
  -- reader -- and the product must not turn a timestamp into a character claim.
  --
  -- Reported PROPORTIONALLY, and only above a quarter of the run. A raw count
  -- is unreadable ("11 rapid answers" out of what?) and a signal that fires on
  -- two quick clicks is noise that trains the reader to skip the section. Both
  -- numbers are carried so the surface can state the denominator.
  SELECT count(*) FILTER (WHERE g.gap IS NOT NULL AND g.gap < interval '3 seconds'),
         count(*)
    INTO _quick, _answered
    FROM (SELECT r.responded_at
                 - lag(r.responded_at) OVER (ORDER BY fi.display_order) AS gap
            FROM public.scp_candidate_responses r
            JOIN public.scp_form_items fi
              ON fi.item_version_id = r.item_version_id AND fi.form_id = _a.form_id
           WHERE r.attempt_id = _attempt_id) g;

  WITH scope_comp AS (
    -- Competencies this attempt produced OBSERVED evidence for. Self-report is
    -- deliberately excluded here: a competency the person only DESCRIBED must
    -- not appear on an observed line, at any state, with any count.
    SELECT DISTINCT bcm.competency_version_id
      FROM public.scp_competency_evidence e
      JOIN public.scp_behaviour_competency_map bcm
        ON bcm.behaviour_version_id = e.behaviour_version_id
     WHERE e.id IN (SELECT id FROM _observed_scope)
    UNION
    -- Plus the ones a disputed review reached but deliberately left no evidence
    -- for. Without this the line disappears rather than reading "needs a
    -- follow-up", which is the opposite of what a disputed reading should say.
    SELECT DISTINCT bcm.competency_version_id
      FROM public.scp_human_reviews hr
      JOIN public.scp_candidate_responses r ON r.id = hr.response_id
      JOIN public.scp_item_versions iv ON iv.id = r.item_version_id
      JOIN public.scp_behaviour_competency_map bcm
        ON bcm.behaviour_version_id = iv.primary_behaviour_id
     WHERE r.attempt_id = _attempt_id
       AND hr.review_status = 'completed'
       AND hr.outcome IN ('adjusted','overturned')
  ), lines AS (
    SELECT c.code AS competency_code, cv.id AS competency_version_id,
           cv.name_sv, cv.name_en,
           public.scp_attempt_maturity(_attempt_id, cv.id, 'v1', now()) AS maturity,
           count(e.id) AS observations,
           coalesce(array_agg(DISTINCT e.source_type)
                      FILTER (WHERE e.source_type IS NOT NULL), ARRAY[]::text[]) AS source_types,
           string_agg(DISTINCT bv.statement_sv, ' ') AS behaviour_sv,
           string_agg(DISTINCT bv.statement_en, ' ') AS behaviour_en,
           coalesce(bool_or(e.provenance_type = 'human_review'), false) AS human_reviewed
      FROM scope_comp sc
      JOIN public.scp_competency_versions cv ON cv.id = sc.competency_version_id
      JOIN public.scp_competencies c ON c.id = cv.competency_id
      LEFT JOIN public.scp_behaviour_competency_map bcm
             ON bcm.competency_version_id = cv.id
      LEFT JOIN public.scp_competency_evidence e
             ON e.behaviour_version_id = bcm.behaviour_version_id
            AND e.id IN (SELECT id FROM _observed_scope)
      LEFT JOIN public.scp_behaviour_versions bv ON bv.id = bcm.behaviour_version_id
     GROUP BY c.code, cv.id, cv.name_sv, cv.name_en
  ), stated AS (
    SELECT l.*,
           public.scp_attempt_evidence_state(_attempt_id, l.competency_version_id, l.maturity) AS state
      FROM lines l
  )
  SELECT
    jsonb_agg(jsonb_build_object(
      'competency_code',    s.competency_code,
      'competency_name_sv', s.name_sv,
      'competency_name_en', s.name_en,
      'evidence_state',     s.state,
      'observations',       s.observations,
      'source_types',       to_jsonb(coalesce(s.source_types, ARRAY[]::text[])),
      'behaviour_sv',       s.behaviour_sv,
      'behaviour_en',       s.behaviour_en,
      'followup_sv',        fpe.prompt_sv,
      'followup_en',        fpe.prompt_en
    ) ORDER BY s.competency_code),
    jsonb_agg(jsonb_build_object(
      'competency_code',    s.competency_code,
      'competency_name_sv', s.name_sv,
      'competency_name_en', s.name_en,
      'evidence_state',     s.state,
      'observations',       s.observations,
      'behaviour_sv',       s.behaviour_sv,
      'behaviour_en',       s.behaviour_en,
      'human_reviewed',     s.human_reviewed,
      'reflection_sv',      fpp.prompt_sv,
      'reflection_en',      fpp.prompt_en
    ) ORDER BY s.competency_code),
    jsonb_agg(jsonb_build_object(
      'competency_code', s.competency_code,
      'maturity_level',  s.maturity,
      'threshold_version', 'v1'
    ) ORDER BY s.competency_code)
    INTO _emp_payload, _par_payload, _derivation
    FROM stated s
    LEFT JOIN public.scp_competency_versions cv2 ON cv2.id = s.competency_version_id
    LEFT JOIN public.scp_followup_prompts fpe
           ON fpe.competency_id = cv2.competency_id AND fpe.audience = 'employer'
          AND fpe.content_status = 'published'
    LEFT JOIN public.scp_followup_prompts fpp
           ON fpp.competency_id = cv2.competency_id AND fpp.audience = 'participant'
          AND fpp.content_status = 'published';

  -- ── The brief ─────────────────────────────────────────────────────────

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'block_key', b.block_key, 'name_sv', b.name_sv, 'name_en', b.name_en,
           'asks', b.asks,
           'items', (SELECT count(*) FROM public.scp_form_items fi
                      WHERE fi.form_id = _a.form_id AND fi.block_key = b.block_key),
           'answered', (SELECT count(*) FROM public.scp_form_items fi
                          JOIN public.scp_candidate_responses r
                            ON r.item_version_id = fi.item_version_id
                           AND r.attempt_id = _attempt_id
                         WHERE fi.form_id = _a.form_id AND fi.block_key = b.block_key)
         ) ORDER BY b.display_order), '[]'::jsonb)
    INTO _modules
    FROM public.scp_form_blocks b WHERE b.form_id = _a.form_id;

  SELECT coalesce(jsonb_agg(x ORDER BY x->>'competency_code'), '[]'::jsonb)
    INTO _observed
    FROM (
      SELECT jsonb_build_object(
               'area_code',    c.code,
               'area_sv',      cv.name_sv,
               'area_en',      cv.name_en,
               'evidence_type','observed',
               'signal',       sig.signal,
               'items',        sig.observations,
               'mean',         sig.mean,
               'spread',       sig.spread,
               'evidence_state', public.scp_attempt_evidence_state(
                                   _attempt_id, cv.id,
                                   public.scp_attempt_maturity(_attempt_id, cv.id, 'v1', now())),
               'behaviour_sv', bstat.sv,
               'behaviour_en', bstat.en,
               'why_sv', CASE sig.signal
                 WHEN 'strong'     THEN format('Svaren höll en jämn och hög nivå över %s uppgifter i den här bedömningen.', sig.observations)
                 WHEN 'consistent' THEN format('Svaren pekade åt samma håll över %s uppgifter i den här bedömningen.', sig.observations)
                 WHEN 'mixed'      THEN format('Svaren skilde sig åt mellan jämförbara uppgifter (%s uppgifter, spännvidd %s).', sig.observations, to_char(sig.spread,'FM0.00'))
                 WHEN 'developing' THEN format('Svaren valde genomgående handlingsalternativ som uppgifterna beskriver som mindre välavvägda (%s uppgifter).', sig.observations)
                 ELSE format('Endast %s uppgift(er) i den här bedömningen berörde området — för lite för att säga något om det.', sig.observations)
               END,
               'why_en', CASE sig.signal
                 WHEN 'strong'     THEN format('Answers were consistently strong across %s tasks in this assessment.', sig.observations)
                 WHEN 'consistent' THEN format('Answers pointed the same way across %s tasks in this assessment.', sig.observations)
                 WHEN 'mixed'      THEN format('Answers differed between comparable tasks (%s tasks, spread %s).', sig.observations, to_char(sig.spread,'FM0.00'))
                 WHEN 'developing' THEN format('Answers consistently chose options the tasks describe as less well-judged (%s tasks).', sig.observations)
                 ELSE format('Only %s task(s) in this assessment touched this area — too few to say anything about it.', sig.observations)
               END
             ) AS x
        FROM (SELECT DISTINCT bcm.competency_version_id AS cvid
                FROM public.scp_competency_evidence e
                JOIN public.scp_behaviour_competency_map bcm
                  ON bcm.behaviour_version_id = e.behaviour_version_id
               WHERE e.id IN (SELECT id FROM _observed_scope)) src
        JOIN public.scp_competency_versions cv ON cv.id = src.cvid
        JOIN public.scp_competencies c ON c.id = cv.competency_id
        CROSS JOIN LATERAL public.scp_attempt_assessment_signal(
                     _attempt_id, cv.id, _signal_version) sig
        LEFT JOIN LATERAL (
          SELECT string_agg(DISTINCT bv.statement_sv, ' ') AS sv,
                 string_agg(DISTINCT bv.statement_en, ' ') AS en
            FROM public.scp_behaviour_competency_map bcm2
            JOIN public.scp_behaviour_versions bv ON bv.id = bcm2.behaviour_version_id
           WHERE bcm2.competency_version_id = cv.id) bstat ON true
    ) q;

  SELECT coalesce(jsonb_agg(x ORDER BY x->>'domain_key'), '[]'::jsonb)
    INTO _selfrep
    FROM (
      SELECT jsonb_build_object(
               'domain_key',    f.slug,
               'domain_sv',     f.name_sv,
               'domain_en',     f.name_en,
               'area_code',     c.code,
               'evidence_type', 'self_reported',
               'pattern',       p.pattern,
               'consistency',   p.consistency,
               'items',         p.items,
               'mean',          p.mean,
               'spread',        p.spread,
               'why_sv', CASE
                 WHEN p.consistency = 'varied'
                   THEN format('Svaren varierade mellan närliggande frågor om %s. Utforska området i intervju.', lower(f.name_sv))
                 WHEN p.pattern = 'consistently_described'
                   THEN format('Deltagaren beskriver genomgående att hen arbetar så (%s frågor). Detta är självrapporterat och inte observerat.', p.items)
                 WHEN p.pattern = 'mostly_described'
                   THEN format('Deltagaren beskriver för det mesta att hen arbetar så (%s frågor). Detta är självrapporterat och inte observerat.', p.items)
                 ELSE format('Deltagaren beskriver att hen sällan arbetar så (%s frågor). Detta är självrapporterat och inte observerat.', p.items)
               END,
               'why_en', CASE
                 WHEN p.consistency = 'varied'
                   THEN format('Answers varied across related questions about %s. Explore this area in interview.', lower(f.name_en))
                 WHEN p.pattern = 'consistently_described'
                   THEN format('The participant consistently describes working this way (%s questions). This is self-reported, not observed.', p.items)
                 WHEN p.pattern = 'mostly_described'
                   THEN format('The participant mostly describes working this way (%s questions). This is self-reported, not observed.', p.items)
                 ELSE format('The participant describes rarely working this way (%s questions). This is self-reported, not observed.', p.items)
               END
             ) AS x
        FROM (SELECT DISTINCT iv.facet_id
                FROM public.scp_competency_evidence e
                JOIN public.scp_candidate_responses r ON r.id = e.source_ref
                JOIN public.scp_item_versions iv ON iv.id = r.item_version_id
               WHERE r.attempt_id = _attempt_id
                 AND e.source_type = 'self_report'
                 AND e.superseded_by IS NULL
                 AND iv.facet_id IS NOT NULL) src
        JOIN public.scp_competency_facets f ON f.id = src.facet_id
        JOIN public.scp_competencies c ON c.id = f.competency_id
        CROSS JOIN LATERAL public.scp_attempt_self_report_pattern(
                     _attempt_id, f.id, _signal_version) p
    ) q;

  -- The guide. Selection is deterministic: what the evidence produced decides
  -- the FOCUS, and the focus selects an authored question. Development first,
  -- then self-report answers that need an example behind them, then thin
  -- areas, then a strength worth testing the depth of -- which is the order a
  -- recruiter with forty minutes should spend them in.
  SELECT coalesce(jsonb_agg(x ORDER BY (x->>'guide_order')::int, x->>'area_code'), '[]'::jsonb)
    INTO _guide
    FROM (
      SELECT jsonb_build_object(
               'guide_order', CASE g.focus
                         WHEN 'explore_development'      THEN 1
                         WHEN 'explore_self_report'      THEN 2
                         WHEN 'explore_limited_evidence' THEN 3
                         ELSE 4 END,
               'area_code',     g.area_code,
               'area_sv',       g.area_sv,
               'area_en',       g.area_en,
               'focus',         g.focus,
               'evidence_type', g.evidence_type,
               'why_sv',        g.why_sv,
               'why_en',        g.why_en,
               'question_sv',   p.question_sv,
               'question_en',   p.question_en,
               'followup_sv',   p.followup_sv,
               'followup_en',   p.followup_en,
               'listen_for_sv', to_jsonb(p.listen_for_sv),
               'listen_for_en', to_jsonb(p.listen_for_en)
             ) AS x
        FROM (
          -- Observed areas that need exploring, or are worth confirming.
          SELECT (o->>'area_code') AS area_code,
                 (o->>'area_sv')   AS area_sv,
                 (o->>'area_en')   AS area_en,
                 'observed'        AS evidence_type,
                 CASE WHEN o->>'signal' IN ('developing','mixed') THEN 'explore_development'
                      WHEN o->>'signal' = 'limited'               THEN 'explore_limited_evidence'
                      ELSE 'confirm_strength' END AS focus,
                 (o->>'why_sv') AS why_sv,
                 (o->>'why_en') AS why_en,
                 NULL::text     AS facet_slug
            FROM jsonb_array_elements(_observed) o
          UNION ALL
          -- Self-descriptions whose related answers disagreed, and
          -- self-descriptions with no observed counterpart at all: both need a
          -- concrete example before anybody relies on them.
          SELECT (s->>'area_code'), (s->>'domain_sv'), (s->>'domain_en'),
                 'self_reported',
                 'explore_self_report',
                 (s->>'why_sv'), (s->>'why_en'),
                 (s->>'domain_key')
            FROM jsonb_array_elements(_selfrep) s
           WHERE s->>'consistency' = 'varied'
              OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(_observed) o2
                              WHERE o2->>'area_code' = s->>'area_code'
                                AND o2->>'signal' <> 'limited')
        ) g
        JOIN public.scp_competencies c ON c.code = g.area_code
        JOIN public.scp_interview_guide_prompts p
          ON p.competency_id = c.id
         AND p.focus = g.focus
         AND p.content_status = 'published'
         AND ((g.facet_slug IS NULL AND p.facet_id IS NULL)
           OR (g.facet_slug IS NOT NULL
               -- The facet is identified by its DOMAIN key, (competency, slug):
               -- UNIQUE (competency_id, slug). A slug alone is not an identity
               -- and resolves to more than one row wherever a second competency
               -- (or a historical row) carries the same slug. Bound relationally,
               -- never LIMIT 1, never DISTINCT ON.
               AND EXISTS (SELECT 1 FROM public.scp_competency_facets f2
                            WHERE f2.id = p.facet_id
                              AND f2.competency_id = c.id
                              AND f2.slug = g.facet_slug)))
    ) q;

  _emp_brief := jsonb_build_object(
    'brief_version',   _brief_version,
    'signal_version',  _signal_version,
    'audience',        'employer',
    'modules',         _modules,
    'observed',        _observed,
    'self_reported',   _selfrep,
    'interview_guide', _guide,
    'coverage', jsonb_build_object(
      'observed_observations',    _obs,
      'self_report_observations', _self,
      'evidence_contexts',        _ctx,
      'reviews_total',            _rev_total,
      'reviews_completed',        _rev_done),
    'pace', CASE
      WHEN _answered > 0 AND _quick::numeric / _answered >= 0.25
        THEN jsonb_build_object('rapid_answers', _quick, 'answered', _answered)
      ELSE NULL END);

  -- The participant's brief. Deliberately a SUBSET, not a softened version:
  -- the modules they completed and what they themselves said. No strengths
  -- ordering, no development framing, no interview guide -- those are written
  -- for a recruiter preparing a conversation, and handing them to the person
  -- being assessed would be handing them somebody else's working notes.
  _par_brief := jsonb_build_object(
    'brief_version',  _brief_version,
    'signal_version', _signal_version,
    'audience',       'participant',
    'modules',        _modules,
    'self_reported',  (
      SELECT coalesce(jsonb_agg(s - 'why_sv' - 'why_en' - 'mean' - 'spread'
                                  ORDER BY s->>'domain_key'), '[]'::jsonb)
        FROM jsonb_array_elements(_selfrep) s),
    'coverage', jsonb_build_object(
      'observed_observations',    _obs,
      'self_report_observations', _self,
      'evidence_contexts',        _ctx));

  -- Real findings only. A safety-critical item that a reviewer cleared is not a
  -- flag, and an alert that fires for everybody is not an alert.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'behaviour_version_id', e.behaviour_version_id,
           'severity', e.safety_severity,
           'finding', e.safety_finding,
           'observed_at', e.observed_at)), '[]'::jsonb)
    INTO _flags
    FROM public.scp_competency_evidence e
   WHERE e.id IN (SELECT id FROM _scope)
     AND e.safety_finding IN ('low','medium','high','critical');

  SELECT id, report_key, version_number INTO _pv, _pv_key, _pv_num
    FROM public.scp_report_versions
   WHERE audience = 'participant' AND content_status = 'published'
     AND (governance_mode = _a.governance_mode OR governance_mode IS NULL)
   ORDER BY (governance_mode IS NOT NULL) DESC, version_number DESC LIMIT 1;
  SELECT id, report_key, version_number INTO _ev, _ev_key, _ev_num
    FROM public.scp_report_versions
   WHERE audience = 'employer' AND content_status = 'published'
     AND (governance_mode = _a.governance_mode OR governance_mode IS NULL)
   ORDER BY (governance_mode IS NOT NULL) DESC, version_number DESC LIMIT 1;
  IF _pv IS NULL OR _ev IS NULL THEN
    RAISE EXCEPTION 'SCP_NO_PUBLISHED_REPORT_TEMPLATE: a report cannot be '
      'rendered without a published template for each audience.'
      USING ERRCODE = 'check_violation';
  END IF;

  _emp_ctx := jsonb_build_object(
    'participant_ref', _ref, 'person_context', _person,
    'organisation_name', _org, 'purpose_code', _purpose,
    'assessment_slug', _slug, 'assessment_name_sv', _name_sv,
    'assessment_name_en', _name_en, 'assessment_version', _version,
    'language', _lang, 'started_at', _a.started_at,
    'submitted_at', _a.submitted_at, 'scored_at', _a.scored_at,
    'governance_mode', _a.governance_mode,
    'validation_status', _a.validation_status_at_assignment,
    'content_status', _a.content_status_at_assignment,
    'attempt_status', 'released',
    'reviews_total', _rev_total, 'reviews_completed', _rev_done,
    'safety_concerns', _concerns,
    'evidence_observations', _obs, 'evidence_contexts', _ctx,
    'self_report_observations', _self,
    'report_key', _ev_key, 'report_version', _ev_num,
    'evidence_state_version', _state_version,
    'evidence_scope_version', _scope_version,
    'brief_version', _brief_version,
    'signal_version', _signal_version,
    'threshold_version', 'v1',
    'scoring_model_version', _a.scoring_model_version);

  -- Unchanged from 20260823090000 except for two additions, and the omissions
  -- are the point: no attempt_status, no review counts, no scoring model
  -- version and no participant_ref. RA8.4 and RA8.5 in the report-audience
  -- suite assert those absences, and they are absences by intent -- the person
  -- is told what concerns them, not how the machine ran.
  _par_ctx := jsonb_build_object(
    'person_context', _person, 'organisation_name', _org,
    'purpose_code', _purpose, 'assessment_name_sv', _name_sv,
    'assessment_name_en', _name_en, 'assessment_version', _version,
    'language', _lang, 'submitted_at', _a.submitted_at,
    'governance_mode', _a.governance_mode,
    'validation_status', _a.validation_status_at_assignment,
    'human_review_occurred', (_rev_total > 0),
    'safety_concern_present', (_concerns > 0),
    'evidence_observations', _obs, 'evidence_contexts', _ctx,
    'self_report_observations', _self,
    'report_key', _pv_key, 'report_version', _pv_num,
    'evidence_scope_version', _scope_version,
    'brief_version', _brief_version);

  INSERT INTO public.scp_report_snapshots
    (attempt_id, subject_id, issuer_organization_id, report_version_id,
     audience, payload, brief, safety_flags, threshold_version,
     scoring_model_version, evidence_state_version, evidence_scope_version,
     derivation_input, context)
  VALUES
    (_attempt_id, _a.subject_id, _a.issuer_organization_id, _pv,
     'participant', coalesce(_par_payload,'[]'::jsonb), _par_brief,
     '[]'::jsonb, 'v1', _a.scoring_model_version, _state_version,
     _scope_version, _derivation, _par_ctx)
  RETURNING id INTO _p_id;

  INSERT INTO public.scp_report_snapshots
    (attempt_id, subject_id, issuer_organization_id, report_version_id,
     audience, payload, brief, safety_flags, threshold_version,
     scoring_model_version, evidence_state_version, evidence_scope_version,
     derivation_input, context)
  VALUES
    (_attempt_id, _a.subject_id, _a.issuer_organization_id, _ev,
     'employer', coalesce(_emp_payload,'[]'::jsonb), _emp_brief,
     _flags, 'v1', _a.scoring_model_version, _state_version,
     _scope_version, _derivation, _emp_ctx)
  RETURNING id INTO _e_id;

  UPDATE public.scp_attempts
     SET released_at = now(), status = 'released'
   WHERE id = _attempt_id;

  DROP TABLE IF EXISTS _scope;
  DROP TABLE IF EXISTS _observed_scope;
  RETURN QUERY SELECT _p_id, _e_id;
END;
$function$;

COMMENT ON FUNCTION public.scp_release_attempt_report(uuid) IS
  'Freezes one attempt into two immutable snapshots and their briefs. The '
  'observed lines are built from counting evidence source types only, so a '
  'self-description can never be rendered as an observation; self-reported '
  'patterns occupy their own key. Neither brief contains a total, a percentage, '
  'a ranking, a suitability statement or an employment recommendation -- those '
  'are absent from the derivation rather than filtered from it. Guide facets '
  'resolve by (competency_id, slug) bound to the prompt''s facet (20261026093000).';

REVOKE ALL     ON FUNCTION public.scp_release_attempt_report(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_release_attempt_report(uuid) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- §2  Proof, at apply time: the predicate is structural, not a text fragment
-- ═══════════════════════════════════════════════════════════════════════════

DO $proof$
DECLARE _src text; _def text; _bad text;
BEGIN
  SELECT p.prosrc INTO _src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'scp_release_attempt_report' AND p.prosecdef
     AND EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%');
  IF _src IS NULL THEN
    RAISE EXCEPTION 'SCP_FACET_PROOF: the release function is not a pinned SECURITY DEFINER';
  END IF;
  -- Exactly one facet lookup, and it binds all three: the prompt's facet, the
  -- area's competency and the slug. No slug-only scalar subquery anywhere.
  IF regexp_count(_src, 'scp_competency_facets f2') <> 1
     OR _src !~ 'EXISTS \(SELECT 1 FROM public\.scp_competency_facets f2\s+WHERE f2\.id = p\.facet_id\s+AND f2\.competency_id = c\.id\s+AND f2\.slug = g\.facet_slug\)'
     OR _src ~ 'WHERE f2\.slug = g\.facet_slug'
     OR _src ~ '\(SELECT f2\.id FROM public\.scp_competency_facets'
     OR _src ~* 'scp_competency_facets[^;]*LIMIT 1'
     OR _src ~* 'DISTINCT ON \(f2' THEN
    RAISE EXCEPTION 'SCP_FACET_PROOF: the release function does not resolve the guide facet by (competency_id, slug) bound to the prompt''s facet_id';
  END IF;
  -- The lookup still names the competency the area was joined on.
  IF _src !~ 'JOIN public\.scp_competencies c ON c\.code = g\.area_code' THEN
    RAISE EXCEPTION 'SCP_FACET_PROOF: the guide no longer joins the area''s competency as c';
  END IF;
  -- Output contract untouched: the same keys the brief and payload have
  -- carried since 20260830093000, and no new one.
  IF _src NOT LIKE '%''interview_guide'', _guide%' OR _src NOT LIKE '%''listen_for_en'', to_jsonb(p.listen_for_en)%'
     OR _src LIKE '%prompt_id%' OR _src LIKE '%_calculated_at%' OR _src LIKE '%scp_report_manifest_computation%' THEN
    RAISE EXCEPTION 'SCP_FACET_PROOF: the release function output contract moved';
  END IF;
  -- Grants exactly as before.
  IF has_function_privilege('anon', 'public.scp_release_attempt_report(uuid)'::regprocedure, 'EXECUTE')
     OR has_function_privilege('service_role', 'public.scp_release_attempt_report(uuid)'::regprocedure, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.scp_release_attempt_report(uuid)'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'SCP_FACET_PROOF: the release function grants moved';
  END IF;
  -- The audience contracts are not touched by this file and never resolve a facet.
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public' AND p.proname IN ('scp_participant_report', 'scp_employer_report')
                AND p.prosrc ILIKE '%scp_competency_facets%') THEN
    RAISE EXCEPTION 'SCP_FACET_PROOF: an audience contract resolves facets';
  END IF;
  -- The 20260830093000 vocabulary proof, re-run over the corrected body.
  _def := lower(pg_get_functiondef('public.scp_release_attempt_report(uuid)'::regprocedure));
  FOREACH _bad IN ARRAY ARRAY[
    'hire', 'reject', 'suitab', 'unsuitab', 'recommend', 'rank',
    'percentile', 'overall_score', 'total_score', 'pass_fail', 'risk_score',
    'trust_score', 'integrity_score', 'personality'
  ] LOOP
    IF position(_bad IN _def) > 0 THEN
      RAISE EXCEPTION 'SCP_FORBIDDEN_REPORT_VOCABULARY: the release function contains "%"', _bad;
    END IF;
  END LOOP;
  IF position('counts_toward_maturity' IN _def) = 0 THEN
    RAISE EXCEPTION 'SCP_OBSERVED_BOUNDARY_MISSING: the release function no longer separates observed evidence from self-report';
  END IF;
  -- The domain key this file relies on is still the schema's rule.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.scp_competency_facets'::regclass AND contype = 'u'
                    AND pg_get_constraintdef(oid) = 'UNIQUE (competency_id, slug)') THEN
    RAISE EXCEPTION 'SCP_FACET_PROOF: scp_competency_facets no longer carries UNIQUE (competency_id, slug)';
  END IF;
  RAISE NOTICE 'facet resolution proven: guide facets resolve by (competency_id, slug) bound to the prompt; output contract and grants unchanged';
END
$proof$;
