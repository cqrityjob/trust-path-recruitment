-- =============================================================================
-- TRUST Evidence Report — PR-R3A: REPORT V3 DATA CONTRACT (employer audience)
--
-- "Från evidens till en bättre intervju."
--
-- One new read contract, scp_employer_report_v3(attempt_id), returning the
-- employer's Report V3 document as one jsonb. It is a PROJECTION of the
-- released employer document -- read through scp_employer_report, the only
-- audience path a client has to a snapshot since PR-R2A -- arranged the way
-- the approved Report V3 information architecture reads it: next step,
-- thirty-second overview, coverage, eight evidence cards, self-report kept
-- apart, TRUST interview plan, limitations, provenance summary, and the
-- post-interview addenda that already exist as scp_interview_notes.
--
-- ── WHAT IS FROZEN AND WHAT IS STRUCTURAL ────────────────────────────────
--
-- Every CONCLUSION in the document -- each area's response pattern, its
-- evidence state, its factual explanation, the self-report patterns, the
-- interview guide, the safety findings, the coverage counts, the versions --
-- comes from the frozen employer snapshot exactly as scp_employer_report
-- returns it. Nothing is recomputed from the evidence ledger, and no signal,
-- threshold, maturity or classification routine is called.
--
-- Three things are STRUCTURAL FACTS read from immutable rows instead, because
-- the snapshot does not carry them and the Report V3 layout needs them:
--
--   * the composition of the form the attempt was assigned (how many
--     scenario, free-text and self-description items each competency has:
--     scp_form_items x scp_item_versions, versioned content),
--   * which of those the person answered (scp_candidate_responses, immutable
--     after submission; only counted, never read: no option, no text), and
--   * the state of the human reviews those responses received
--     (scp_human_reviews: status and outcome COUNTS only; never the rationale,
--     never a rubric level, never a finding beyond what the snapshot froze).
--
-- A completed review is immutable, and a report is released only after every
-- review is closed, so these counts cannot drift under a released report.
--
-- ── WHAT THE DOCUMENT NEVER CONTAINS ─────────────────────────────────────
--
-- No derivation_input, no mean, no spread, no contribution, no option key, no
-- score value, no rubric level, no reviewer rationale, no behaviour id, no
-- manifest body, no manifest id, no hash, no total, no ranking, no verdict.
-- Every number on an area is a count. The private computation manifest is
-- referenced only as a fact -- whether this report was released with a
-- verified computation chain -- and never by id.
--
-- ── WHAT THIS FILE DOES NOT DO ────────────────────────────────────────────
--
-- It does not touch scp_participant_report, scp_employer_report,
-- scp_release_attempt_report, any policy, any grant on an existing object,
-- any stored row, any scoring routine, any threshold, any item, any
-- competency, any template. No parallel engine: the document is a rearranged
-- reading of the frozen document, and the suite proves that every conclusion
-- in it equals the one the frozen document carries.
--
-- Requires 20261027090000 (PR-R1): the provenance summary reads the link the
-- snapshot carries to its private manifest as a boolean. §0 refuses otherwise.
--
-- Rollback: supabase/rollback/20261028090000_scp_trust_evidence_report_r3a_contract_rollback.sql
-- =============================================================================

-- ═══════════════════════════════════════════════════════════════════════════
-- §0  Refuse unless the ground this stands on is there
-- ═══════════════════════════════════════════════════════════════════════════

DO $pre$
BEGIN
  IF has_table_privilege('authenticated', 'public.scp_report_snapshots', 'SELECT') THEN
    RAISE EXCEPTION 'SCP_R3A_PRECONDITION: authenticated can still SELECT scp_report_snapshots -- apply 20261026090000 (R2A-3 CONTRACT) first';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'public' AND p.proname = 'scp_employer_report' AND p.prosecdef
                    AND p.prosrc LIKE '%scp_report_snapshot_readable%'
                    AND p.prosrc LIKE '%scp_audience_brief%') THEN
    RAISE EXCEPTION 'SCP_R3A_PRECONDITION: scp_employer_report is not the R2A audience contract';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'scp_report_snapshots'
                    AND column_name = 'manifest_id') THEN
    RAISE EXCEPTION 'SCP_R3A_PRECONDITION: scp_report_snapshots.manifest_id is missing -- apply 20261027090000 (PR-R1 provenance) first';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_schema = 'public' AND table_name = 'scp_interview_notes') THEN
    RAISE EXCEPTION 'SCP_R3A_PRECONDITION: scp_interview_notes is missing -- apply 20260830093000 first';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public' AND p.proname = 'scp_employer_report_v3') THEN
    RAISE EXCEPTION 'SCP_R3A_PRECONDITION: scp_employer_report_v3 already exists';
  END IF;
END
$pre$;

-- ═══════════════════════════════════════════════════════════════════════════
-- §1  The employer Report V3 document
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.scp_employer_report_v3(_attempt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _d record;
  _a public.scp_attempts%ROWTYPE;
  _schema constant text := 'trust-evidence-report/v3';
  _ctx jsonb; _brief jsonb; _payload jsonb; _flags jsonb;
  _observed jsonb; _selfrep jsonb; _guide jsonb; _cov jsonb; _modules jsonb;
  _contexts int := 0; _governance text; _validation text;
  _verified boolean := false;
  _comp jsonb; _c jsonb; _o jsonb; _p jsonb;
  _areas jsonb := '[]'::jsonb; _patterns jsonb; _followups jsonb; _plan jsonb;
  _overview jsonb; _limits jsonb; _hr jsonb; _prov jsonb; _next jsonb;
  _safety jsonb; _addenda jsonb; _composition jsonb; _rubrics jsonb;
  _signal text; _state text; _pattern text; _v3state text; _review text;
  _coverage text; _priority text; _flagsarr jsonb; _sources jsonb;
  _why_sv text; _why_en text; _lim jsonb; _guide_for jsonb; _self_for jsonb;
  _obs_n int; _planned_obs int; _answered_obs int; _pending int; _disputed int;
  _completed int; _ft_items int; _ft_answered int; _ft_reviewed int; _ft_upheld int;
  _sc_items int; _sc_reviewed int; _self_items int; _self_answered int;
  _scen_items int; _scen_answered int;
  _n_limited int := 0; _n_covered int := 0; _n_not int := 0; _n_usable int := 0;
  _tot_pending int := 0; _tot_disputed int := 0; _tot_ft_items int := 0;
  _tot_ft_answered int := 0; _tot_ft_reviewed int := 0; _tot_sc_items int := 0;
  _tot_sc_reviewed int := 0; _tot_scen_items int := 0; _tot_scen_answered int := 0;
  _tot_self_items int := 0; _tot_self_answered int := 0;
  _step text; _reason text; _reason_sv text; _reason_en text;
  _has_finding boolean; _critical_codes jsonb;
BEGIN
  -- The released employer document, through the audience contract. Zero rows
  -- there -- not released, not this organisation, not a member -- is NULL
  -- here, indistinguishable from "no report", exactly as before.
  SELECT e.* INTO _d FROM public.scp_employer_report(_attempt_id) e;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT a.* INTO _a FROM public.scp_attempts a WHERE a.id = _attempt_id;

  _ctx      := coalesce(_d.context, '{}'::jsonb);
  _brief    := coalesce(_d.brief, '{}'::jsonb);
  _payload  := coalesce(_d.payload, '[]'::jsonb);
  _flags    := coalesce(_d.safety_flags, '[]'::jsonb);
  _observed := CASE WHEN jsonb_typeof(_brief -> 'observed') = 'array' THEN _brief -> 'observed' ELSE '[]'::jsonb END;
  _selfrep  := CASE WHEN jsonb_typeof(_brief -> 'self_reported') = 'array' THEN _brief -> 'self_reported' ELSE '[]'::jsonb END;
  _guide    := CASE WHEN jsonb_typeof(_brief -> 'interview_guide') = 'array' THEN _brief -> 'interview_guide' ELSE '[]'::jsonb END;
  _modules  := CASE WHEN jsonb_typeof(_brief -> 'modules') = 'array' THEN _brief -> 'modules' ELSE '[]'::jsonb END;
  _cov      := coalesce(_brief -> 'coverage', '{}'::jsonb);
  _contexts := coalesce((_cov ->> 'evidence_contexts')::int, (_ctx ->> 'evidence_contexts')::int, 0);
  _governance := _ctx ->> 'governance_mode';
  _validation := _ctx ->> 'validation_status';
  _has_finding := jsonb_array_length(_flags) > 0;

  -- A fact, never an id: was this report released with a verified
  -- computation chain (PR-R1) or before it (legacy provenance)?
  SELECT s.manifest_id IS NOT NULL INTO _verified
    FROM public.scp_report_snapshots s WHERE s.id = _d.id;

  -- ── Structural facts: the form, the answers, the reviews (counts only) ──
  WITH fi AS (
    SELECT iv.competency_id, iv.item_format, iv.evidence_source_type,
           iv.is_safety_critical, iv.id AS ivid
      FROM public.scp_form_items f
      JOIN public.scp_item_versions iv ON iv.id = f.item_version_id
     WHERE f.form_id = _a.form_id
  ), resp AS (
    SELECT r.id AS response_id, r.item_version_id
      FROM public.scp_candidate_responses r
     WHERE r.attempt_id = _attempt_id
  ), rev AS (
    SELECT DISTINCT ON (hr.response_id) hr.response_id, hr.review_status, hr.outcome
      FROM public.scp_human_reviews hr
      JOIN resp ON resp.response_id = hr.response_id
     ORDER BY hr.response_id, hr.opened_at DESC, hr.id DESC
  ), per AS (
    SELECT fi.competency_id,
      count(*) FILTER (WHERE fi.evidence_source_type <> 'self_report' AND fi.item_format <> 'constructed_response') AS scen_items,
      count(*) FILTER (WHERE fi.item_format = 'constructed_response')                                                AS ft_items,
      count(*) FILTER (WHERE fi.evidence_source_type = 'self_report')                                                AS self_items,
      count(*) FILTER (WHERE fi.is_safety_critical)                                                                  AS sc_items,
      count(resp.response_id) FILTER (WHERE fi.evidence_source_type <> 'self_report' AND fi.item_format <> 'constructed_response') AS scen_answered,
      count(resp.response_id) FILTER (WHERE fi.item_format = 'constructed_response')                                 AS ft_answered,
      count(resp.response_id) FILTER (WHERE fi.evidence_source_type = 'self_report')                                 AS self_answered,
      count(rev.response_id)  FILTER (WHERE rev.review_status IN ('pending','in_review'))                            AS reviews_pending,
      count(rev.response_id)  FILTER (WHERE rev.review_status = 'completed')                                         AS reviews_completed,
      count(rev.response_id)  FILTER (WHERE rev.review_status = 'completed' AND rev.outcome IN ('adjusted','overturned')) AS reviews_disputed,
      count(rev.response_id)  FILTER (WHERE rev.review_status = 'completed' AND fi.item_format = 'constructed_response') AS ft_reviewed,
      count(rev.response_id)  FILTER (WHERE rev.review_status = 'completed' AND rev.outcome = 'upheld' AND fi.item_format = 'constructed_response') AS ft_upheld,
      count(rev.response_id)  FILTER (WHERE rev.review_status = 'completed' AND fi.is_safety_critical)               AS sc_reviewed
      FROM fi
      LEFT JOIN resp ON resp.item_version_id = fi.ivid
      LEFT JOIN rev  ON rev.response_id = resp.response_id
     GROUP BY fi.competency_id
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'code',            c.code,
           'display_order',   c.display_order,
           'name_sv',         cv.name_sv,
           'name_en',         cv.name_en,
           'version',         cv.version_number,
           'scen_items',      per.scen_items,
           'ft_items',        per.ft_items,
           'self_items',      per.self_items,
           'sc_items',        per.sc_items,
           'scen_answered',   per.scen_answered,
           'ft_answered',     per.ft_answered,
           'self_answered',   per.self_answered,
           'reviews_pending', per.reviews_pending,
           'reviews_completed', per.reviews_completed,
           'reviews_disputed', per.reviews_disputed,
           'ft_reviewed',     per.ft_reviewed,
           'ft_upheld',       per.ft_upheld,
           'sc_reviewed',     per.sc_reviewed)
         ORDER BY c.display_order, c.code), '[]'::jsonb)
    INTO _comp
    FROM per
    JOIN public.scp_competencies c ON c.id = per.competency_id
    LEFT JOIN LATERAL (
      SELECT v.name_sv, v.name_en, v.version_number
        FROM public.scp_competency_versions v
       WHERE v.competency_id = c.id
       ORDER BY (v.content_status = 'published') DESC, v.version_number DESC
       LIMIT 1) cv ON true;

  -- The rubric versions bound to the form's free-text items: a content fact
  -- of the instrument (which rubric edition read the free text), never a
  -- level. The edition is pinned by the item version the form carries,
  -- whatever its content-governance status (a closed test runs on drafts).
  SELECT coalesce(jsonb_agg(DISTINCT rv.version_number), '[]'::jsonb)
    INTO _rubrics
    FROM public.scp_form_items f
    JOIN public.scp_item_versions iv ON iv.id = f.item_version_id
    JOIN public.scp_rubric_versions rv ON rv.item_version_id = iv.id
   WHERE f.form_id = _a.form_id AND iv.item_format = 'constructed_response'
     AND rv.retired_at IS NULL;

  -- ── The eight evidence cards ──────────────────────────────────────────
  FOR _c IN SELECT x FROM jsonb_array_elements(_comp) x LOOP
    SELECT o INTO _o FROM jsonb_array_elements(_observed) o WHERE o ->> 'area_code' = _c ->> 'code' LIMIT 1;
    SELECT p INTO _p FROM jsonb_array_elements(_payload)  p WHERE p ->> 'competency_code' = _c ->> 'code' LIMIT 1;

    _scen_items   := (_c ->> 'scen_items')::int;   _scen_answered := (_c ->> 'scen_answered')::int;
    _ft_items     := (_c ->> 'ft_items')::int;     _ft_answered   := (_c ->> 'ft_answered')::int;
    _ft_reviewed  := (_c ->> 'ft_reviewed')::int;  _ft_upheld     := (_c ->> 'ft_upheld')::int;
    _self_items   := (_c ->> 'self_items')::int;   _self_answered := (_c ->> 'self_answered')::int;
    _sc_items     := (_c ->> 'sc_items')::int;     _sc_reviewed   := (_c ->> 'sc_reviewed')::int;
    _pending      := (_c ->> 'reviews_pending')::int;
    _completed    := (_c ->> 'reviews_completed')::int;
    _disputed     := (_c ->> 'reviews_disputed')::int;
    _planned_obs  := _scen_items + _ft_items;
    _answered_obs := _scen_answered + _ft_answered;
    _obs_n        := coalesce((_o ->> 'items')::int, 0);
    _signal       := _o ->> 'signal';
    _state        := coalesce(_p ->> 'evidence_state', _o ->> 'evidence_state');

    _tot_pending      := _tot_pending + _pending;
    _tot_disputed     := _tot_disputed + _disputed;
    _tot_ft_items     := _tot_ft_items + _ft_items;
    _tot_ft_answered  := _tot_ft_answered + _ft_answered;
    _tot_ft_reviewed  := _tot_ft_reviewed + _ft_reviewed;
    _tot_sc_items     := _tot_sc_items + _sc_items;
    _tot_sc_reviewed  := _tot_sc_reviewed + _sc_reviewed;
    _tot_scen_items   := _tot_scen_items + _scen_items;
    _tot_scen_answered := _tot_scen_answered + _scen_answered;
    _tot_self_items   := _tot_self_items + _self_items;
    _tot_self_answered := _tot_self_answered + _self_answered;

    SELECT coalesce(jsonb_agg(s ORDER BY s ->> 'domain_key'), '[]'::jsonb) INTO _self_for
      FROM jsonb_array_elements(_selfrep) s WHERE s ->> 'area_code' = _c ->> 'code';
    SELECT coalesce(jsonb_agg(g ORDER BY (g ->> 'guide_order')::int, g ->> 'focus'), '[]'::jsonb) INTO _guide_for
      FROM jsonb_array_elements(_guide) g WHERE g ->> 'area_code' = _c ->> 'code';

    -- The response-pattern label: the frozen ras-v1 signal, one word each.
    -- Describes THIS assessment's answers; asserts nothing about the person.
    _pattern := CASE _signal
      WHEN 'strong'     THEN 'clearly_consistent'
      WHEN 'consistent' THEN 'consistent'
      WHEN 'mixed'      THEN 'mixed'
      WHEN 'developing' THEN 'follow_up'
      WHEN 'limited'    THEN 'limited'
      ELSE 'none' END;

    -- The evidence state of the ADR (Decision 2), from the frozen signal and
    -- the structural facts; never from a recomputation.
    _v3state := CASE
      WHEN _pending > 0                                   THEN 'human_review_pending'
      WHEN _obs_n = 0 AND _answered_obs > 0 AND _disputed > 0 THEN 'observed_limited'
      WHEN _obs_n = 0 AND jsonb_array_length(_self_for) > 0 THEN 'self_reported_only'
      WHEN _obs_n = 0                                     THEN 'not_covered'
      WHEN _signal = 'limited'                            THEN 'observed_limited'
      WHEN _signal = 'mixed'                              THEN 'observed_mixed'
      WHEN _signal = 'developing'                         THEN 'observed_follow_up'
      ELSE                                                     'observed_consistent' END;

    _review := CASE
      WHEN _pending > 0   THEN 'pending'
      WHEN _disputed > 0  THEN 'completed_disputed'
      WHEN _completed > 0 THEN 'completed_upheld'
      ELSE                     'not_required' END;

    _coverage := CASE
      WHEN _planned_obs = 0                       THEN 'not_covered'
      WHEN _obs_n = 0 AND _answered_obs = 0       THEN 'not_covered'
      WHEN _obs_n = 0                             THEN 'partially_covered'
      WHEN _obs_n < 3 OR _signal = 'limited'      THEN 'limited'
      WHEN _obs_n < _planned_obs                  THEN 'partially_covered'
      ELSE                                             'covered' END;

    -- Interview priority: what the frozen guide selected for this area, the
    -- safety state on top. first > next > if_time_allows > none.
    _priority := CASE
      WHEN _state = 'critical_follow_up' THEN 'first'
      WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(_guide_for) g WHERE g ->> 'focus' = 'explore_development') THEN 'first'
      WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(_guide_for) g WHERE g ->> 'focus' IN ('explore_limited_evidence','explore_self_report')) THEN 'next'
      WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(_guide_for) g WHERE g ->> 'focus' = 'confirm_strength') THEN 'if_time_allows'
      WHEN _disputed > 0 THEN 'next'
      ELSE 'none' END;

    _flagsarr := '[]'::jsonb;
    IF _obs_n = 1 THEN _flagsarr := _flagsarr || '"single_item"'::jsonb; END IF;
    IF _obs_n > 0 AND _contexts <= 1 THEN _flagsarr := _flagsarr || '"single_context"'::jsonb; END IF;
    IF jsonb_array_length(_self_for) > 0 THEN _flagsarr := _flagsarr || '"self_report_not_observed"'::jsonb; END IF;
    IF coalesce(_validation, '') <> 'validated' THEN _flagsarr := _flagsarr || '"unvalidated_content"'::jsonb; END IF;
    IF _governance = 'closed_test' THEN _flagsarr := _flagsarr || '"closed_test"'::jsonb; END IF;

    -- The frozen source-type codes, plus the free-text channel as its own
    -- code when a person read the free text and let it stand.
    _sources := coalesce(_p -> 'source_types', '[]'::jsonb);
    IF _ft_upheld > 0 AND _obs_n > 0 AND NOT (_sources ? 'human_reviewed_free_text') THEN
      _sources := _sources || '"human_reviewed_free_text"'::jsonb;
    END IF;

    -- What the observed tasks showed: the frozen why-line when there is one;
    -- otherwise a fact about the instrument, never about the person.
    IF _o IS NOT NULL THEN
      _why_sv := _o ->> 'why_sv'; _why_en := _o ->> 'why_en';
    ELSIF _pending > 0 THEN
      _why_sv := 'En mänsklig granskning av ett svar inom området är inte slutförd.';
      _why_en := 'A human review of an answer in this area has not been completed.';
    ELSIF _answered_obs > 0 AND _disputed > 0 THEN
      _why_sv := 'Det observerade svaret i området lästes av en granskare som inte lät läsningen stå. Inget observerat underlag återstår; följ upp i intervju.';
      _why_en := 'The observed answer in this area was read by a reviewer who did not let the reading stand. No observed evidence remains; follow up in interview.';
    ELSIF _planned_obs = 0 AND jsonb_array_length(_self_for) > 0 THEN
      _why_sv := 'Inga observerade uppgifter i den här bedömningen berörde området. Kandidatens egen beskrivning redovisas separat och är inte observerat underlag.';
      _why_en := 'No observed task in this assessment touched this area. The candidate''s own description is reported separately and is not observed evidence.';
    ELSE
      _why_sv := 'Inga observerade uppgifter i den här bedömningen berörde området.';
      _why_en := 'No observed task in this assessment touched this area.';
    END IF;

    -- The one limitation the card states, when it has one.
    _lim := CASE
      WHEN _obs_n = 1 THEN jsonb_build_object('code', 'single_item',
        'sv', 'Endast en uppgift i den här bedömningen berörde området. Det räcker inte för en slutsats -- följ upp i intervju.',
        'en', 'Only one task in this assessment touched this area. That is not enough for a conclusion -- follow up in interview.')
      WHEN _obs_n > 0 AND _obs_n < 3 THEN jsonb_build_object('code', 'few_items',
        'sv', format('Endast %s uppgifter i den här bedömningen berörde området -- för lite för en slutsats.', _obs_n),
        'en', format('Only %s tasks in this assessment touched this area -- too few for a conclusion.', _obs_n))
      WHEN _obs_n = 0 AND jsonb_array_length(_self_for) > 0 THEN jsonb_build_object('code', 'self_report_only',
        'sv', 'Området har enbart kandidatens egen beskrivning. Självrapport är inte observerat underlag.',
        'en', 'This area has only the candidate''s own description. Self-report is not observed evidence.')
      WHEN _obs_n = 0 THEN jsonb_build_object('code', 'no_observed_evidence',
        'sv', 'Området saknar observerat underlag i den här bedömningen.',
        'en', 'This area has no observed evidence in this assessment.')
      ELSE NULL END;

    IF _signal = 'limited' OR (_obs_n > 0 AND _obs_n < 3) THEN _n_limited := _n_limited + 1;
    ELSIF _obs_n = 0 THEN _n_not := _n_not + 1;
    ELSE _n_covered := _n_covered + 1; END IF;
    IF _signal IN ('strong','consistent','mixed','developing') THEN _n_usable := _n_usable + 1; END IF;

    _areas := _areas || jsonb_build_object(
      'competency_code',      _c ->> 'code',
      'competency_version',   coalesce(_c ->> 'version', '1'),
      'competency_name_sv',   coalesce(_o ->> 'area_sv', _p ->> 'competency_name_sv', _c ->> 'name_sv'),
      'competency_name_en',   coalesce(_o ->> 'area_en', _p ->> 'competency_name_en', _c ->> 'name_en'),
      'response_pattern',     _pattern,
      'evidence_state',       _v3state,
      'observed_item_count',  _obs_n,
      'planned_item_count',   _planned_obs,
      'answered_item_count',  _answered_obs,
      'context_count',        CASE WHEN _obs_n > 0 THEN _contexts ELSE 0 END,
      'source_types',         _sources,
      'coverage_status',      _coverage,
      'review_status',        _review,
      'methodological_flags', _flagsarr,
      'factual_explanation',  jsonb_build_object('sv', _why_sv, 'en', _why_en),
      'follow_up_priority',   _priority,
      'safety_critical_follow_up', (_state = 'critical_follow_up'),
      'limitation',           _lim,
      'evidence_basis', jsonb_build_object(
        'scenario_items',        _scen_items,
        'scenario_answered',     _scen_answered,
        'free_text_items',       _ft_items,
        'free_text_answered',    _ft_answered,
        'free_text_reviewed',    _ft_reviewed,
        'self_description_items',    _self_items,
        'self_description_answered', _self_answered,
        'safety_critical_items',     _sc_items,
        'safety_critical_reviewed',  _sc_reviewed,
        'reviews_completed',     _completed,
        'reviews_disputed',      _disputed),
      'behaviour',            jsonb_build_object('sv', coalesce(_o ->> 'behaviour_sv', _p ->> 'behaviour_sv'),
                                                 'en', coalesce(_o ->> 'behaviour_en', _p ->> 'behaviour_en')),
      'self_description_domain_keys', (SELECT coalesce(jsonb_agg(s ->> 'domain_key'), '[]'::jsonb) FROM jsonb_array_elements(_self_for) s),
      'interview_prompt',     CASE WHEN _p ? 'followup_sv' THEN jsonb_build_object('sv', _p ->> 'followup_sv', 'en', _p ->> 'followup_en') ELSE NULL END,
      'trust_followup_codes', (SELECT coalesce(jsonb_agg(g ->> 'focus'), '[]'::jsonb) FROM jsonb_array_elements(_guide_for) g),
      'traceability',         jsonb_build_object('available', _verified));
  END LOOP;

  -- ── Self-report, in its own array ──────────────────────────────────────
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'domain_key',      s ->> 'domain_key',
           'domain_sv',       s ->> 'domain_sv',
           'domain_en',       s ->> 'domain_en',
           'competency_code', s ->> 'area_code',
           'evidence_type',   'self_reported',
           'pattern',         s ->> 'pattern',
           'consistency',     s ->> 'consistency',
           'item_count',      coalesce((s ->> 'items')::int, 0),
           'interpretation',  'descriptive_only',
           'factual_explanation', jsonb_build_object('sv', s ->> 'why_sv', 'en', s ->> 'why_en'))
         ORDER BY s ->> 'area_code', s ->> 'domain_key'), '[]'::jsonb)
    INTO _patterns
    FROM jsonb_array_elements(_selfrep) s;

  -- ── TRUST follow-ups: every authored guide entry the release selected ──
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'competency_code', g ->> 'area_code',
           'area_sv',         g ->> 'area_sv',
           'area_en',         g ->> 'area_en',
           'trust_question_version', 'igp-v1',
           'focus',           g ->> 'focus',
           'evidence_type',   g ->> 'evidence_type',
           'why',             jsonb_build_object('sv', g ->> 'why_sv', 'en', g ->> 'why_en'),
           'question',        jsonb_build_object('sv', g ->> 'question_sv', 'en', g ->> 'question_en'),
           'followup',        jsonb_build_object('sv', g ->> 'followup_sv', 'en', g ->> 'followup_en'),
           'listen_for',      jsonb_build_object('sv', coalesce(g -> 'listen_for_sv', '[]'::jsonb), 'en', coalesce(g -> 'listen_for_en', '[]'::jsonb)),
           'priority',        CASE g ->> 'focus'
                                WHEN 'explore_development'      THEN 'first'
                                WHEN 'explore_self_report'      THEN 'next'
                                WHEN 'explore_limited_evidence' THEN 'next'
                                ELSE 'if_time_allows' END)
         ORDER BY (g ->> 'guide_order')::int, g ->> 'area_code', g ->> 'focus'), '[]'::jsonb)
    INTO _followups
    FROM jsonb_array_elements(_guide) g;

  -- ── The TRUST Interview Plan: at most three areas, at most five questions ─
  -- Areas in the order the frozen guide put them (development first, then
  -- self-descriptions that need an example, then thin areas, then strengths
  -- to confirm). The first two areas carry their authored follow-up too;
  -- the third carries its main question only: 2 + 2 + 1 = 5.
  WITH g AS (
    SELECT x.value AS g, x.ordinality AS ord FROM jsonb_array_elements(_guide) WITH ORDINALITY x
  ), firsts AS (
    SELECT DISTINCT ON (g ->> 'area_code') g, ord FROM g ORDER BY g ->> 'area_code', ord
  ), top3 AS (
    SELECT g, row_number() OVER (ORDER BY ord) AS rn FROM firsts ORDER BY ord LIMIT 3
  )
  SELECT jsonb_build_object(
    'heading',    jsonb_build_object('sv', 'TRUST Interview Plan', 'en', 'TRUST Interview Plan'),
    'subheading', jsonb_build_object('sv', 'Från evidens till en bättre intervju.', 'en', 'From evidence to a better interview.'),
    'priorities', coalesce(jsonb_agg(jsonb_build_object(
      'order',           rn,
      'competency_code', g ->> 'area_code',
      'target', jsonb_build_object(
        'competency_code', g ->> 'area_code',
        'area_sv',         g ->> 'area_sv',
        'area_en',         g ->> 'area_en',
        'focus',           g ->> 'focus',
        'evidence_type',   g ->> 'evidence_type'),
      'ready', jsonb_build_object(
        'existing_evidence', jsonb_build_object('sv', g ->> 'why_sv', 'en', g ->> 'why_en'),
        'observed_item_count', coalesce((SELECT (a ->> 'observed_item_count')::int FROM jsonb_array_elements(_areas) a WHERE a ->> 'competency_code' = g ->> 'area_code'), 0),
        'response_pattern',    coalesce((SELECT a ->> 'response_pattern' FROM jsonb_array_elements(_areas) a WHERE a ->> 'competency_code' = g ->> 'area_code'), 'none'),
        'limitation',          (SELECT a -> 'limitation' FROM jsonb_array_elements(_areas) a WHERE a ->> 'competency_code' = g ->> 'area_code')),
      'understand', jsonb_build_object(
        'question', jsonb_build_object('sv', g ->> 'question_sv', 'en', g ->> 'question_en')),
      'structure', jsonb_build_object(
        'steps', jsonb_build_array(
          jsonb_build_object('key', 'situation',  'sv', 'Situation',  'en', 'Situation'),
          jsonb_build_object('key', 'own_role',   'sv', 'Egen roll',  'en', 'Own role'),
          jsonb_build_object('key', 'action',     'sv', 'Agerande',   'en', 'Action'),
          jsonb_build_object('key', 'result',     'sv', 'Resultat',   'en', 'Result'),
          jsonb_build_object('key', 'reflection', 'sv', 'Reflektion', 'en', 'Reflection')),
        'followup', CASE WHEN rn <= 2 THEN jsonb_build_object('sv', g ->> 'followup_sv', 'en', g ->> 'followup_en') ELSE NULL END),
      'tell', jsonb_build_object(
        'listen_for', jsonb_build_object('sv', coalesce(g -> 'listen_for_sv', '[]'::jsonb), 'en', coalesce(g -> 'listen_for_en', '[]'::jsonb)),
        'document',   jsonb_build_object(
          'sv', 'Dokumentera det konkreta exemplet, personens egen roll, vad hen gjorde och vad det ledde till. Skriv ned vad som sades, inte en tolkning.',
          'en', 'Document the concrete example, the person''s own role, what they did and what it led to. Write down what was said, not an interpretation.'))
    ) ORDER BY rn), '[]'::jsonb),
    'question_count', coalesce(sum(CASE WHEN rn <= 2 THEN 2 ELSE 1 END), 0),
    'question_limit', 5,
    'area_limit',     3)
    INTO _plan
    FROM top3;

  -- ── The thirty-second overview ─────────────────────────────────────────
  SELECT jsonb_build_object(
    'clearest_support', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'competency_code', a ->> 'competency_code',
               'competency_name_sv', a ->> 'competency_name_sv',
               'competency_name_en', a ->> 'competency_name_en',
               'response_pattern', a ->> 'response_pattern',
               'observed_item_count', (a ->> 'observed_item_count')::int,
               'line', a -> 'factual_explanation')
             ORDER BY (a ->> 'response_pattern' = 'clearly_consistent') DESC,
                      (a ->> 'observed_item_count')::int DESC, a ->> 'competency_code'), '[]'::jsonb)
        FROM (SELECT a FROM jsonb_array_elements(_areas) a
               WHERE a ->> 'response_pattern' IN ('clearly_consistent','consistent')
                 AND NOT (a ->> 'safety_critical_follow_up')::boolean
               ORDER BY (a ->> 'response_pattern' = 'clearly_consistent') DESC,
                        (a ->> 'observed_item_count')::int DESC, a ->> 'competency_code'
               LIMIT 3) q),
    'verify_in_interview', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'competency_code', a ->> 'competency_code',
               'competency_name_sv', a ->> 'competency_name_sv',
               'competency_name_en', a ->> 'competency_name_en',
               'response_pattern', a ->> 'response_pattern',
               'observed_item_count', (a ->> 'observed_item_count')::int,
               'safety_critical_follow_up', (a ->> 'safety_critical_follow_up')::boolean,
               'line', a -> 'factual_explanation')
             ORDER BY (a ->> 'safety_critical_follow_up')::boolean DESC,
                      (a ->> 'response_pattern' = 'follow_up') DESC,
                      (a ->> 'review_status' = 'completed_disputed') DESC,
                      (a ->> 'observed_item_count')::int DESC, a ->> 'competency_code'), '[]'::jsonb)
        FROM (SELECT a FROM jsonb_array_elements(_areas) a
               WHERE (a ->> 'safety_critical_follow_up')::boolean
                  OR a ->> 'response_pattern' IN ('follow_up','mixed')
                  OR a ->> 'review_status' = 'completed_disputed'
               ORDER BY (a ->> 'safety_critical_follow_up')::boolean DESC,
                        (a ->> 'response_pattern' = 'follow_up') DESC,
                        (a ->> 'review_status' = 'completed_disputed') DESC,
                        (a ->> 'observed_item_count')::int DESC, a ->> 'competency_code'
               LIMIT 3) q),
    'limited_evidence', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'competency_code', a ->> 'competency_code',
               'competency_name_sv', a ->> 'competency_name_sv',
               'competency_name_en', a ->> 'competency_name_en',
               'response_pattern', a ->> 'response_pattern',
               'observed_item_count', (a ->> 'observed_item_count')::int,
               'line', a -> 'factual_explanation')
             ORDER BY (a ->> 'planned_item_count')::int DESC, a ->> 'competency_code'), '[]'::jsonb)
        FROM (SELECT a FROM jsonb_array_elements(_areas) a
               WHERE a ->> 'response_pattern' IN ('limited','none')
                 AND NOT (a ->> 'safety_critical_follow_up')::boolean
               ORDER BY (a ->> 'planned_item_count')::int DESC, a ->> 'competency_code'
               LIMIT 3) q))
    INTO _overview;

  -- ── The primary next step: the rds-v1 rule, stated once, server side ───
  -- A process step the employer takes; never an employment decision.
  IF _has_finding THEN
    _step := 'request_clarification'; _reason := 'safety_follow_up';
    _reason_sv := 'Ett säkerhetskritiskt svar behöver följas upp innan processen går vidare.';
    _reason_en := 'A safety-critical response needs following up before the process continues.';
  ELSIF coalesce((_cov ->> 'observed_observations')::int, 0) = 0 THEN
    _step := 'gather_more_evidence'; _reason := 'no_observed_evidence';
    _reason_sv := 'Bedömningen gav inga observerade svar att utgå ifrån. Det säger ingenting om personen, bara att underlaget saknas.';
    _reason_en := 'This assessment produced no observed responses to work from. That says nothing about the person, only that the evidence is missing.';
  ELSIF _n_usable = 0 OR _n_limited > _n_usable THEN
    _step := 'additional_assessment'; _reason := 'thin_coverage';
    _reason_sv := 'Fler områden berördes för lite än som faktiskt prövades. Komplettera underlaget innan en intervju byggs på det -- det säger något om bedömningens bredd och inget om kandidaten.';
    _reason_en := 'More areas were barely touched than were actually exercised. Broaden the evidence before an interview builds on it -- that says something about the breadth of the assessment and nothing about the candidate.';
  ELSE
    _step := 'structured_interview'; _reason := 'ready_for_interview';
    _reason_sv := 'Underlaget räcker för att förbereda ett strukturerat samtal. Frågorna i TRUST Interview Plan är valda utifrån just de här svaren.';
    _reason_en := 'There is enough here to prepare a structured conversation. The questions in the TRUST Interview Plan were selected from these specific responses.';
  END IF;
  _next := jsonb_build_object(
    'step',        _step,
    'reason_code', _reason,
    'reason',      jsonb_build_object('sv', _reason_sv, 'en', _reason_en),
    'interview_handoff', jsonb_build_object(
      'attempt_id',       _attempt_id,
      'focus_area_codes', (SELECT coalesce(jsonb_agg(p ->> 'competency_code' ORDER BY (p ->> 'order')::int), '[]'::jsonb)
                             FROM jsonb_array_elements(_plan -> 'priorities') p)));

  -- ── Safety: only ever an explicit human-reviewed finding ───────────────
  -- The snapshot's safety_flags are written from reviewer findings alone
  -- (no deterministic path sets a finding; a cleared item is no_concern and
  -- never a flag). Nothing here infers anything from a signal, a count or a
  -- self-description.
  SELECT coalesce(jsonb_agg(x.a ->> 'competency_code' ORDER BY x.ord), '[]'::jsonb)
    INTO _critical_codes
    FROM jsonb_array_elements(_areas) WITH ORDINALITY x(a, ord)
   WHERE (x.a ->> 'safety_critical_follow_up')::boolean;
  _safety := jsonb_build_object(
    'present',        _has_finding,
    'source',         'human_review',
    'findings',       _flags,
    'finding_count',  jsonb_array_length(_flags),
    'areas_flagged_for_follow_up', _critical_codes,
    'statement', jsonb_build_object(
      'sv', 'Ett säkerhetskritiskt svar har granskats av en person och behöver följas upp i samtal. Det är en uppföljningspunkt, inte en slutsats om personen.',
      'en', 'A safety-critical answer has been reviewed by a person and needs to be followed up in conversation. It is a follow-up point, not a conclusion about the person.'));

  -- ── Limitations: the closed code set, stated in both languages ─────────
  _limits := jsonb_build_array(
    jsonb_build_object('code', 'one_assessment_occasion', 'statement', jsonb_build_object(
      'sv', 'Underlaget kommer från ett bedömningstillfälle.',
      'en', 'The evidence comes from one assessment occasion.')));
  IF _contexts <= 1 THEN
    _limits := _limits || jsonb_build_object('code', 'single_evidence_context', 'statement', jsonb_build_object(
      'sv', 'Allt observerat underlag kommer från ett och samma sammanhang.',
      'en', 'All observed evidence comes from one and the same context.'));
  END IF;
  IF jsonb_array_length(_patterns) > 0 THEN
    _limits := _limits || jsonb_build_object('code', 'self_report_not_observed', 'statement', jsonb_build_object(
      'sv', 'Kandidatens egen beskrivning är självrapporterad och inte observerat underlag. Den visar inte att kompetensen finns.',
      'en', 'The candidate''s own description is self-reported and not observed evidence. It does not show that the competency is present.'));
  END IF;
  IF coalesce(_validation, '') <> 'validated' THEN
    _limits := _limits || jsonb_build_object('code', 'unvalidated_content', 'statement', jsonb_build_object(
      'sv', 'Bedömningens innehåll är under utveckling och inte validerat.',
      'en', 'The assessment content is under development and not validated.'));
  END IF;
  IF _governance = 'closed_test' THEN
    _limits := _limits || jsonb_build_object('code', 'closed_test_pilot', 'statement', jsonb_build_object(
      'sv', 'Bedömningen genomfördes i ett slutet test.',
      'en', 'The assessment was run in a closed test.'));
  END IF;
  _limits := _limits
    || jsonb_build_object('code', 'no_norm_group', 'statement', jsonb_build_object(
         'sv', 'Svaren jämförs inte med andra kandidater eller med någon referensgrupp, och ingen kandidat ställs mot en annan.',
         'en', 'Answers are not compared with other candidates or with any reference group, and no candidate is set against another.'))
    || jsonb_build_object('code', 'no_predictive_claim', 'statement', jsonb_build_object(
         'sv', 'Underlaget säger inget om framtida arbetsprestation, och det finns ingen samlad siffra.',
         'en', 'The evidence says nothing about future work performance, and there is no single figure.'));

  -- ── Human review: counts and states, nothing a person wrote ────────────
  _hr := jsonb_build_object(
    'reviews_total',        coalesce((_cov ->> 'reviews_total')::int, (_ctx ->> 'reviews_total')::int, 0),
    'reviews_completed',    coalesce((_cov ->> 'reviews_completed')::int, (_ctx ->> 'reviews_completed')::int, 0),
    'reviews_pending',      _tot_pending,
    'disputed_readings',    _tot_disputed,
    'safety_findings_present', _has_finding,
    'free_text', jsonb_build_object('items', _tot_ft_items, 'answered', _tot_ft_answered, 'reviewed', _tot_ft_reviewed),
    'safety_critical', jsonb_build_object('items', _tot_sc_items, 'reviewed', _tot_sc_reviewed),
    'complete', (_tot_pending = 0
                 AND coalesce((_cov ->> 'reviews_completed')::int, 0) = coalesce((_cov ->> 'reviews_total')::int, 0)),
    'released_at',          _d.released_at);

  -- ── Post-interview addenda: the append-only interview notes ────────────
  -- A separate record composed with the report; the report itself is never
  -- rewritten. Statuses map one to one onto the approved addendum set.
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id',              n.id,
           'competency_code', n.area_code,
           'status',          CASE n.outcome
                                WHEN 'evidence_confirmed'     THEN 'supported_in_interview'
                                WHEN 'evidence_not_confirmed' THEN 'not_supported_in_interview'
                                ELSE 'additional_context' END,
           'note',            n.note,
           'source',          'interview_note',
           'recorded_at',     n.recorded_at,
           'author',          jsonb_build_object('user_id', n.recorded_by,
                                                 'email', (SELECT u.email FROM auth.users u WHERE u.id = n.recorded_by)))
         ORDER BY n.recorded_at DESC, n.area_code, n.id), '[]'::jsonb)
    INTO _addenda
    FROM public.scp_interview_notes n
   WHERE n.attempt_id = _attempt_id
     AND n.employer_id = _a.issuer_organization_id;

  _composition := jsonb_build_object(
    'scenario_items',            _tot_scen_items,
    'scenario_answered',         _tot_scen_answered,
    'self_description_items',    _tot_self_items,
    'self_description_answered', _tot_self_answered,
    'free_text_items',           _tot_ft_items,
    'free_text_answered',        _tot_ft_answered,
    'free_text_reviewed',        _tot_ft_reviewed,
    'safety_critical_items',     _tot_sc_items,
    'safety_critical_reviewed',  _tot_sc_reviewed);

  _prov := jsonb_build_object(
    'report_id',              _d.id,
    'released_at',            _d.released_at,
    'calculated_at',          _d.released_at,
    'assessment_slug',        _ctx ->> 'assessment_slug',
    'assessment_version',     (_ctx ->> 'assessment_version')::int,
    'scoring_model_version',  _ctx ->> 'scoring_model_version',
    'threshold_version',      _ctx ->> 'threshold_version',
    'signal_version',         _ctx ->> 'signal_version',
    'evidence_state_version', _ctx ->> 'evidence_state_version',
    'evidence_scope_version', _ctx ->> 'evidence_scope_version',
    'brief_version',          _ctx ->> 'brief_version',
    'rubric_versions',        _rubrics,
    'report_template',        jsonb_build_object('report_key', _ctx ->> 'report_key',
                                                 'version', (_ctx ->> 'report_version')::int),
    'computation_chain',      CASE WHEN _verified THEN 'verified' ELSE 'legacy' END,
    'traceability_available', _verified);

  RETURN jsonb_build_object(
    'schema_version', _schema,
    'report_id',      _d.id,
    'attempt_id',     _d.attempt_id,
    'subject_id',     _d.subject_id,
    'released_at',    _d.released_at,
    'audience',       'employer',
    'context', jsonb_build_object(
      'participant_ref',      _ctx ->> 'participant_ref',
      'person_context',       _ctx ->> 'person_context',
      'organisation_name',    _ctx ->> 'organisation_name',
      'purpose_code',         _ctx ->> 'purpose_code',
      'assessment_slug',      _ctx ->> 'assessment_slug',
      'assessment_name_sv',   _ctx ->> 'assessment_name_sv',
      'assessment_name_en',   _ctx ->> 'assessment_name_en',
      'assessment_version',   (_ctx ->> 'assessment_version')::int,
      'language',             _ctx ->> 'language',
      'governance_mode',      _governance,
      'validation_status',    _validation,
      'content_status',       _ctx ->> 'content_status',
      'started_at',           _ctx -> 'started_at',
      'submitted_at',         _ctx -> 'submitted_at',
      'scored_at',            _ctx -> 'scored_at',
      'human_reviewed_badge', (_tot_pending = 0 AND coalesce((_cov ->> 'reviews_completed')::int, 0) > 0),
      'standing_limitation', jsonb_build_object(
        'sv', 'Underlag för fortsatt mänsklig bedömning -- inte ett anställningsbeslut.',
        'en', 'Evidence for continued human judgement -- not an employment decision.')),
    'primary_next_step', _next,
    'overview',          _overview,
    'safety_followup',   _safety,
    'coverage', jsonb_build_object(
      'observed_items',        coalesce((_cov ->> 'observed_observations')::int, 0),
      'self_report_items',     coalesce((_cov ->> 'self_report_observations')::int, 0),
      'evidence_contexts',     _contexts,
      'areas_covered',         _n_covered,
      'areas_limited',         _n_limited,
      'areas_not_covered',     _n_not,
      'composition',           _composition,
      'modules',               _modules),
    'areas',                  _areas,
    'self_reported_patterns', _patterns,
    'trust_followups',        _followups,
    'trust_plan',             _plan,
    'limitations', jsonb_build_object(
      'standing_statement', jsonb_build_object(
        'sv', 'Detta visar hur kandidaten svarade i just dessa uppgifter. Det fastställer inte lämplighet eller framtida arbetsprestation. Beslutet är arbetsgivarens.',
        'en', 'This shows how the candidate answered these specific tasks. It does not settle whether the person is right for the role, nor future work performance. The decision is the employer''s.'),
      'items',    _limits,
      'template', jsonb_build_object('sv', to_jsonb(coalesce(_d.limitations_sv, ARRAY[]::text[])),
                                     'en', to_jsonb(coalesce(_d.limitations_en, ARRAY[]::text[])))),
    'human_review',       _hr,
    'provenance_summary', _prov,
    'interview_addenda',  _addenda);
END;
$function$;

COMMENT ON FUNCTION public.scp_employer_report_v3(uuid) IS
  'The employer''s Report V3 document for a released attempt, as one jsonb: '
  'next step, thirty-second overview, coverage, one evidence card per '
  'competency of the form, self-report in its own array, TRUST follow-ups '
  'and plan, limitations, human-review counts, provenance summary and the '
  'post-interview addenda. Every conclusion is the frozen employer '
  'document''s, read through scp_employer_report; the form composition, '
  'answer counts and review states are structural facts from immutable '
  'rows. Every number on an area is a count. Contains no derivation input, '
  'no mean, no spread, no option key, no rubric level, no reviewer '
  'rationale, no behaviour id, no manifest body, no manifest id, no hash. '
  'NULL when the caller may not read the employer document.';

REVOKE ALL     ON FUNCTION public.scp_employer_report_v3(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_employer_report_v3(uuid) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- §2  Proof, at apply time
-- ═══════════════════════════════════════════════════════════════════════════

DO $proof$
DECLARE _def text; _bad text; _src text;
BEGIN
  -- 2.1 Posture: definer, pinned, authenticated only, reading through the
  -- audience contract, and never the base table for the document.
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'public' AND p.proname = 'scp_employer_report_v3' AND p.prosecdef
                    AND p.provolatile = 's'
                    AND EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%')) THEN
    RAISE EXCEPTION 'SCP_R3A_PROOF: scp_employer_report_v3 is not a pinned, STABLE SECURITY DEFINER';
  END IF;
  IF has_function_privilege('anon', 'public.scp_employer_report_v3(uuid)'::regprocedure, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.scp_employer_report_v3(uuid)'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'SCP_R3A_PROOF: the V3 contract grants moved';
  END IF;
  _src := (SELECT p.prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname = 'scp_employer_report_v3');
  IF _src NOT LIKE '%FROM public.scp_employer_report(_attempt_id)%' THEN
    RAISE EXCEPTION 'SCP_R3A_PROOF: the V3 contract does not read the document through scp_employer_report';
  END IF;
  IF _src LIKE '%s.derivation_input%' OR _src LIKE '%s.payload%' OR _src LIKE '%s.brief%'
     OR _src LIKE '%s.canonical_sha256%' OR _src LIKE '%reviewer_rationale%'
     OR _src LIKE '%scp_review_rubric_scores%' OR _src LIKE '%scp_competency_evidence%'
     OR _src LIKE '%scp_item_options%' OR _src LIKE '%score_value%' OR _src LIKE '%response_text%'
     OR _src LIKE '%scp_attempt_assessment_signal%' OR _src LIKE '%scp_attempt_maturity%'
     OR _src LIKE '%scp_attempt_evidence_state%' OR _src LIKE '%scp_attempt_self_report_pattern%' THEN
    RAISE EXCEPTION 'SCP_R3A_PROOF: the V3 contract reaches something internal or recomputes a conclusion';
  END IF;
  -- The manifest is a fact here, never a row: the only column named is the link.
  IF _src LIKE '%manifest_id%' AND _src NOT LIKE '%s.manifest_id IS NOT NULL INTO _verified%' THEN
    RAISE EXCEPTION 'SCP_R3A_PROOF: the V3 contract uses the manifest link as more than a boolean';
  END IF;
  IF _src LIKE '%''manifest_id''%' OR _src LIKE '%''canonical_sha256''%' OR _src LIKE '%''behaviour_version_id''%'
     OR _src LIKE '%''mean''%' OR _src LIKE '%''spread''%' OR _src LIKE '%''derivation_input''%' THEN
    RAISE EXCEPTION 'SCP_R3A_PROOF: the V3 contract projects a withheld key';
  END IF;

  -- 2.2 The audience contracts this file must not touch have not moved.
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname IN ('scp_participant_report','scp_employer_report')
         AND p.prosrc LIKE '%scp_audience_brief%' AND p.prosrc LIKE '%LEFT JOIN public.scp_report_versions%') <> 2
     OR has_table_privilege('authenticated', 'public.scp_report_snapshots', 'SELECT')
     OR has_table_privilege('anon', 'public.scp_report_snapshots', 'SELECT') THEN
    RAISE EXCEPTION 'SCP_R3A_PROOF: the R2A audience posture moved';
  END IF;

  -- 2.3 The vocabulary this product refuses to produce: the same list every
  -- report routine is held to, over the new contract.
  _def := lower(pg_get_functiondef('public.scp_employer_report_v3(uuid)'::regprocedure));
  FOREACH _bad IN ARRAY ARRAY[
    'hire', 'reject', 'suitab', 'unsuitab', 'recommend', 'rank',
    'percentile', 'overall_score', 'total_score', 'pass_fail', 'risk_score',
    'trust_score', 'integrity_score', 'personality',
    'benchmark', 'match_percent', 'job_fit', 'fit_score', 'potential_score',
    'traffic_light', 'radar', 'spider', 'bias_free', 'predicted_performance',
    'olämplig', 'rangordn', 'percentil', 'totalpoäng', 'normgrupp', 'förutsäger'
  ] LOOP
    IF position(_bad IN _def) > 0 THEN
      RAISE EXCEPTION
        'SCP_FORBIDDEN_REPORT_VOCABULARY: scp_employer_report_v3 contains "%". '
        'CQrityjob produces decision support, never an employment decision.', _bad;
    END IF;
  END LOOP;
  IF position('self_reported_patterns' IN _def) = 0 OR position('''descriptive_only''' IN _def) = 0 THEN
    RAISE EXCEPTION 'SCP_R3A_PROOF: self-report is not carried in its own array with its interpretation label';
  END IF;

  RAISE NOTICE 'PR-R3A contract proven: employer V3 projection reads through the audience contract, recomputes nothing, projects no internal key, and states no verdict';
END
$proof$;
