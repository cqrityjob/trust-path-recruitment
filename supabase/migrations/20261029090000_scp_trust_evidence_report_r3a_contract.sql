-- =============================================================================
-- TRUST Evidence Report — PR-R3A: REPORT V3 DATA CONTRACT (employer audience)
--
-- "Från evidens till en bättre intervju."
--
-- Two new routines:
--
--   scp_report_next_step(...)          the ONE rds-v1 process-step rule, as an
--                                      IMMUTABLE SQL function. The TypeScript
--                                      rds-v1 layer is held to it by a full
--                                      parity matrix in CI.
--
--   scp_employer_report_v3(attempt_id) the employer's Report V3 document as
--                                      one jsonb:
--
--     {
--       schema_version, report_id,
--       frozen_report: {
--         core:     the SHARED FROZEN NEUTRAL CORE -- competency identity,
--                   observed_pattern, evidence_sufficiency, evidence source
--                   summary, limitations, self-report as its own evidence
--                   type, methodological flags, version/provenance facts,
--                   frozen timestamps. Audience-neutral by construction: a
--                   participant projection may later be built on it.
--         employer: what only the commissioning organisation receives --
--                   its context, the primary next step, the thirty-second
--                   overview, the safety follow-up, per-area interview
--                   priorities, the TRUST follow-ups and the TRUST Interview
--                   Plan.
--       },
--       template_overlay: the LIVE limitation lines of the report template
--                         the release pinned (the R2A audience contract's
--                         template row), with their own as_of. Live by
--                         construction, so outside the frozen report.
--       addenda_overlay:  the LIVE post-interview addenda (scp_interview_notes),
--                         with their own as_of.
--     }
--
-- frozen_report is IMMUTABLE: every value in it is the release's, and
-- report_id and provenance describe all of it without exception. The two
-- overlays are the only things that may move after release.
--
-- ── THREE DIMENSIONS, KEPT APART ──────────────────────────────────────────
--
--   observed_pattern      what the observed responses LOOK LIKE:
--                         clearly_consistent | consistent | mixed |
--                         developing | not_established
--   evidence_sufficiency  how much observed evidence EXISTS:
--                         sufficient | limited | none
--   follow_up_priority    what the recruiter should DO (employer only):
--                         first | next | if_time_allows | none
--
-- Nothing encodes one of these in another. The two axes are independent: a
-- visible pattern may coexist with limited evidence; limited evidence keeps
-- the pattern from becoming a stable conclusion or clearest support. The
-- ras-v1 signal the release froze maps to both: strong/consistent/mixed/
-- developing are patterns; `limited` (the rule's own word for n < 3, which
-- carries no pattern) is `not_established`; sufficiency follows the count
-- (0 none, 1-2 limited, 3+ sufficient). `sufficient` means shadow-pilot
-- evidence coverage under the current governed rule and nothing more: not
-- psychometric validation, not demonstrated competence, not evidence about
-- future performance, not a stable trait. `evidence_state` (ADR Decision 2)
-- is kept as a composite PRESENTATION field derived from the dimensions; it
-- never replaces them.
--
-- ── VERSION-LOCKED: WHAT IS FROZEN AND WHAT IS STRUCTURAL ────────────────
--
-- Every CONCLUSION comes from the frozen employer snapshot as
-- scp_employer_report returns it. Every STRUCTURAL FACT that the snapshot
-- does not carry -- the composition of what the person answered per
-- competency, which free-text and safety-critical answers a person read,
-- the per-competency context count, the competency version, the rubric
-- editions -- comes from the PR-R1 computation manifest the snapshot is
-- linked to: the frozen, hashed record of the release. Only counts and
-- version identities are taken from it; no option key, score, contribution,
-- rubric level, finding or rationale is read, and nothing of its body is
-- projected. A report released before PR-R1 has no manifest, and every such
-- fact is then an explicit null (`provenance.evidence_basis_available =
-- false`): legacy provenance is never fabricated.
--
-- No read resolves "latest" or "currently active". The one catalogue lookup
-- that remains -- the name of a competency that has no frozen line -- takes
-- the version that was published at the release instant. The rubric edition
-- numbers are looked up by the frozen rubric-version ids, which a later
-- retirement does not change. Publishing a newer competency version,
-- retiring a rubric or editing catalogue metadata after release cannot alter
-- the frozen report; the suite proves it byte for byte.
--
-- ── WHAT THE DOCUMENT NEVER CONTAINS ─────────────────────────────────────
--
-- No derivation_input, no mean, no spread, no contribution, no option key, no
-- score value, no rubric level, no reviewer rationale, no reviewer workflow
-- state, no behaviour id, no manifest body, no manifest id, no hash, no
-- author user id, no author e-mail, no total, no ranking, no verdict. Every
-- number on a competency is a count.
--
-- ── WHAT THIS FILE DOES NOT DO ────────────────────────────────────────────
--
-- It does not touch scp_participant_report, scp_employer_report,
-- scp_release_attempt_report, the manifest, any policy, any grant on an
-- existing object, any stored row, any scoring routine, threshold, item,
-- competency or template. No parallel engine.
--
-- Requires 20261027090000 (PR-R1). §0 refuses otherwise.
--
-- Rollback: supabase/rollback/20261029090000_scp_trust_evidence_report_r3a_contract_rollback.sql
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
                    AND column_name = 'manifest_id')
     OR NOT EXISTS (SELECT 1 FROM information_schema.tables
                     WHERE table_schema = 'public' AND table_name = 'scp_report_computation_manifests') THEN
    RAISE EXCEPTION 'SCP_R3A_PRECONDITION: scp_report_snapshots.manifest_id is missing -- apply 20261027090000 (PR-R1 provenance) first';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_schema = 'public' AND table_name = 'scp_interview_notes') THEN
    RAISE EXCEPTION 'SCP_R3A_PRECONDITION: scp_interview_notes is missing -- apply 20260830093000 first';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public' AND p.proname IN ('scp_employer_report_v3', 'scp_report_next_step')) THEN
    RAISE EXCEPTION 'SCP_R3A_PRECONDITION: a PR-R3A routine already exists';
  END IF;
END
$pre$;

-- ═══════════════════════════════════════════════════════════════════════════
-- §1  The one process-step rule (rds-v1), version-locked
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.scp_report_next_step(
  _safety_findings_present boolean,
  _observed_items integer,
  _areas_sufficient integer,
  _areas_limited integer)
RETURNS TABLE (step text, reason_code text, rule_version text)
LANGUAGE sql
IMMUTABLE STRICT PARALLEL SAFE
SET search_path = public, pg_temp
AS $$
  -- rds-v1, exactly as src/lib/security-competency/decision-support.ts
  -- states its next-step rule. The TypeScript layer is held to this
  -- function over the full state matrix by scripts/trust-next-step-parity-
  -- check.ts, which db-test.sh executes against this database. A process
  -- step the employer takes next; never an employment decision.
  SELECT CASE
           WHEN _safety_findings_present                      THEN 'request_clarification'
           WHEN _observed_items = 0                           THEN 'gather_more_evidence'
           WHEN _areas_sufficient = 0
             OR _areas_limited > _areas_sufficient            THEN 'additional_assessment'
           ELSE                                                    'structured_interview'
         END,
         CASE
           WHEN _safety_findings_present                      THEN 'safety_follow_up'
           WHEN _observed_items = 0                           THEN 'no_observed_evidence'
           WHEN _areas_sufficient = 0
             OR _areas_limited > _areas_sufficient            THEN 'thin_coverage'
           ELSE                                                    'ready_for_interview'
         END,
         'rds-v1';
$$;

COMMENT ON FUNCTION public.scp_report_next_step(boolean, integer, integer, integer) IS
  'The rds-v1 process-step rule: a human safety finding asks for a '
  'clarification first; no observed evidence asks for more evidence; fewer '
  'sufficient than limited areas (or none sufficient) asks for a further '
  'assessment; otherwise a structured interview. One of four process steps, '
  'never an employment decision. Internal: the employer V3 contract calls it, '
  'and the TypeScript rds-v1 layer is proven identical to it in CI.';

REVOKE ALL ON FUNCTION public.scp_report_next_step(boolean, integer, integer, integer) FROM PUBLIC, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- §2  The employer Report V3 document
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
  _issuer uuid;
  _schema constant text := 'trust-evidence-report/v3';
  _core_version constant text := 'trust-evidence-core/v1';
  _ctx jsonb; _brief jsonb; _payload jsonb; _flags jsonb;
  _observed jsonb; _selfrep jsonb; _guide jsonb; _cov jsonb; _modules jsonb;
  _contexts int := 0; _governance text; _validation text;
  _verified boolean := false; _mf jsonb; _mf_ev jsonb; _mf_rv jsonb; _mf_areas jsonb;
  _codes jsonb; _c text; _o jsonb; _p jsonb; _ma jsonb; _fact jsonb;
  _core_areas jsonb := '[]'::jsonb; _emp_areas jsonb := '[]'::jsonb;
  _patterns jsonb; _followups jsonb; _plan jsonb; _overview jsonb; _limits jsonb;
  _hr jsonb; _prov jsonb; _next jsonb; _safety jsonb; _overlay jsonb;
  _composition jsonb; _rubrics jsonb; _name_sv text; _name_en text; _cver text;
  _signal text; _state text; _pattern text; _suff text; _v3state text; _review text;
  _coverage text; _priority text; _flagsarr jsonb; _sources jsonb;
  _why_sv text; _why_en text; _lim jsonb; _guide_for jsonb; _self_for jsonb;
  _obs_n int; _ctx_n int; _answered int; _pending int; _disputed int;
  _ft_items int; _ft_reviewed int; _sc_items int; _sc_reviewed int;
  _scen_items int; _self_items int; _basis jsonb;
  _n_suff int := 0; _n_limited int := 0; _n_none int := 0;
  _tot_ft_items int := 0; _tot_ft_reviewed int := 0; _tot_sc_items int := 0;
  _tot_sc_reviewed int := 0; _tot_scen int := 0; _tot_self int := 0;
  _any_pending boolean := false; _clearest_ok boolean; _reasons jsonb;
  _step record; _reason_sv text; _reason_en text;
  _has_finding boolean; _critical_codes jsonb; _rt int; _rc int;
BEGIN
  -- The released employer document, through the audience contract. Zero rows
  -- there -- not released, not this organisation, not a member -- is NULL
  -- here, indistinguishable from "no report", exactly as before.
  SELECT e.* INTO _d FROM public.scp_employer_report(_attempt_id) e;
  IF NOT FOUND THEN RETURN NULL; END IF;

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
  _rt := coalesce((_cov ->> 'reviews_total')::int, (_ctx ->> 'reviews_total')::int, 0);
  _rc := coalesce((_cov ->> 'reviews_completed')::int, (_ctx ->> 'reviews_completed')::int, 0);

  -- ── The frozen record of the release (PR-R1), read for counts and version
  --    identities only. Absent on a report released before PR-R1.
  SELECT m.body, s.issuer_organization_id INTO _mf, _issuer
    FROM public.scp_report_snapshots s
    LEFT JOIN public.scp_report_computation_manifests m ON m.id = s.manifest_id
   WHERE s.id = _d.id;
  _verified := _mf IS NOT NULL;
  _mf_ev    := CASE WHEN _verified THEN coalesce(_mf -> 'computation' -> 'evidence', '[]'::jsonb) ELSE '[]'::jsonb END;
  _mf_rv    := CASE WHEN _verified THEN coalesce(_mf -> 'computation' -> 'reviews',  '[]'::jsonb) ELSE '[]'::jsonb END;
  _mf_areas := CASE WHEN _verified THEN coalesce(_mf -> 'computation' -> 'areas',    '[]'::jsonb) ELSE '[]'::jsonb END;

  -- The rubric editions that read the free text: the frozen ids, resolved to
  -- their edition numbers. Retiring an edition later changes neither.
  SELECT coalesce(jsonb_agg(DISTINCT rv.version_number), '[]'::jsonb)
    INTO _rubrics
    FROM jsonb_array_elements_text(CASE WHEN _verified THEN coalesce(_mf -> 'versions' -> 'rubric_versions', '[]'::jsonb) ELSE '[]'::jsonb END) x(id)
    JOIN public.scp_rubric_versions rv ON rv.id = x.id::uuid;

  -- The competencies of the report: every competency the frozen document
  -- lines name, plus (with a manifest) every competency the person answered
  -- a task for. Ordered by code: SCC-nn sorts as the catalogue does, and no
  -- live catalogue ordering is read.
  SELECT coalesce(jsonb_agg(code ORDER BY code), '[]'::jsonb) INTO _codes
    FROM (
      SELECT DISTINCT code FROM (
        SELECT o ->> 'area_code' AS code FROM jsonb_array_elements(_observed) o
        UNION SELECT p ->> 'competency_code' FROM jsonb_array_elements(_payload) p
        UNION SELECT e ->> 'competency_code' FROM jsonb_array_elements(_mf_ev) e
      ) u WHERE code IS NOT NULL) q;

  FOR _c IN SELECT x FROM jsonb_array_elements_text(_codes) x LOOP
    SELECT o  INTO _o  FROM jsonb_array_elements(_observed) o WHERE o ->> 'area_code' = _c LIMIT 1;
    SELECT p  INTO _p  FROM jsonb_array_elements(_payload)  p WHERE p ->> 'competency_code' = _c LIMIT 1;
    SELECT a  INTO _ma FROM jsonb_array_elements(_mf_areas) a WHERE a ->> 'competency_code' = _c LIMIT 1;

    -- Structural facts, frozen at release (counts only).
    IF _verified THEN
      SELECT jsonb_build_object(
        'answered',    count(*),
        'scen_items',  count(*) FILTER (WHERE e ->> 'evidence_source_type' <> 'self_report' AND e ->> 'item_format' <> 'constructed_response'),
        'ft_items',    count(*) FILTER (WHERE e ->> 'item_format' = 'constructed_response'),
        'ft_reviewed', count(*) FILTER (WHERE e ->> 'item_format' = 'constructed_response' AND e ->> 'review_status' = 'completed'),
        'self_items',  count(*) FILTER (WHERE e ->> 'evidence_source_type' = 'self_report'),
        'sc_items',    count(*) FILTER (WHERE (e ->> 'is_safety_critical')::boolean),
        'sc_reviewed', count(*) FILTER (WHERE (e ->> 'is_safety_critical')::boolean AND e ->> 'review_status' = 'completed'),
        'pending',     count(*) FILTER (WHERE e ->> 'review_status' IN ('pending', 'in_review')),
        'disputed',    count(*) FILTER (WHERE e ->> 'review_outcome' IN ('adjusted', 'overturned')))
        INTO _fact
        FROM jsonb_array_elements(_mf_ev) e WHERE e ->> 'competency_code' = _c;
      _answered    := (_fact ->> 'answered')::int;
      _scen_items  := (_fact ->> 'scen_items')::int;
      _ft_items    := (_fact ->> 'ft_items')::int;
      _ft_reviewed := (_fact ->> 'ft_reviewed')::int;
      _self_items  := (_fact ->> 'self_items')::int;
      _sc_items    := (_fact ->> 'sc_items')::int;
      _sc_reviewed := (_fact ->> 'sc_reviewed')::int;
      _pending     := (_fact ->> 'pending')::int;
      _disputed    := (_fact ->> 'disputed')::int;
      _ctx_n       := (_ma ->> 'context_count')::int;
      _cver        := _ma ->> 'competency_version';
      _tot_scen := _tot_scen + _scen_items; _tot_self := _tot_self + _self_items;
      _tot_ft_items := _tot_ft_items + _ft_items; _tot_ft_reviewed := _tot_ft_reviewed + _ft_reviewed;
      _tot_sc_items := _tot_sc_items + _sc_items; _tot_sc_reviewed := _tot_sc_reviewed + _sc_reviewed;
      IF _pending > 0 THEN _any_pending := true; END IF;
    ELSE
      _answered := NULL; _scen_items := NULL; _ft_items := NULL; _ft_reviewed := NULL;
      _self_items := NULL; _sc_items := NULL; _sc_reviewed := NULL; _pending := 0; _disputed := 0;
      _ctx_n := NULL; _cver := NULL;
    END IF;

    -- Identity: the frozen line's name; failing that, the version that was
    -- published at the release instant. Never "latest".
    _name_sv := coalesce(_o ->> 'area_sv', _p ->> 'competency_name_sv');
    _name_en := coalesce(_o ->> 'area_en', _p ->> 'competency_name_en');
    IF _name_sv IS NULL OR _cver IS NULL THEN
      SELECT coalesce(_name_sv, cv.name_sv), coalesce(_name_en, cv.name_en), coalesce(_cver, cv.version_number::text)
        INTO _name_sv, _name_en, _cver
        FROM public.scp_competencies c
        JOIN public.scp_competency_versions cv ON cv.competency_id = c.id
       WHERE c.code = _c
         AND cv.created_at <= _d.released_at
       ORDER BY (cv.published_at IS NOT NULL AND cv.published_at <= _d.released_at) DESC,
                cv.version_number DESC
       LIMIT 1;
    END IF;

    _obs_n  := coalesce((_o ->> 'items')::int, 0);
    _signal := _o ->> 'signal';
    _state  := coalesce(_p ->> 'evidence_state', _o ->> 'evidence_state');

    SELECT coalesce(jsonb_agg(s ORDER BY s ->> 'domain_key'), '[]'::jsonb) INTO _self_for
      FROM jsonb_array_elements(_selfrep) s WHERE s ->> 'area_code' = _c;
    SELECT coalesce(jsonb_agg(g ORDER BY (g ->> 'guide_order')::int, g ->> 'focus'), '[]'::jsonb) INTO _guide_for
      FROM jsonb_array_elements(_guide) g WHERE g ->> 'area_code' = _c;

    -- Dimension 1: what the observed responses look like. The frozen signal
    -- `limited` is the rule's own word for a basis it computed no pattern
    -- on, so it and no evidence are both not_established; a pattern the
    -- rule did state is kept whatever the count -- the count is dimension 2.
    _pattern := CASE _signal
      WHEN 'strong'     THEN 'clearly_consistent'
      WHEN 'consistent' THEN 'consistent'
      WHEN 'mixed'      THEN 'mixed'
      WHEN 'developing' THEN 'developing'
      ELSE                   'not_established' END;

    -- Dimension 2: how much observed evidence exists.
    _suff := CASE
      WHEN _obs_n = 0                              THEN 'none'
      WHEN _signal = 'limited' OR _obs_n < 3       THEN 'limited'
      ELSE                                              'sufficient' END;

    _review := CASE
      WHEN NOT _verified  THEN NULL
      WHEN _pending > 0   THEN 'pending'
      WHEN _ft_items + _sc_items > 0 THEN 'completed'
      ELSE                     'not_required' END;

    -- The composite presentation state (ADR Decision 2), DERIVED from the
    -- dimensions; it never replaces them.
    _v3state := CASE
      WHEN _pending > 0                                          THEN 'human_review_pending'
      WHEN _suff = 'none' AND jsonb_array_length(_self_for) > 0  THEN 'self_reported_only'
      WHEN _suff = 'none'                                        THEN 'not_covered'
      WHEN _suff = 'limited'                                     THEN 'observed_limited'
      WHEN _pattern = 'mixed'                                    THEN 'observed_mixed'
      WHEN _pattern = 'developing'                               THEN 'observed_follow_up'
      ELSE                                                            'observed_consistent' END;

    _coverage := CASE
      WHEN _suff = 'none' AND coalesce(_answered, 0) > 0 THEN 'partially_covered'
      WHEN _suff = 'none'                                THEN 'not_covered'
      WHEN _suff = 'limited'                             THEN 'limited'
      WHEN _answered IS NOT NULL AND _obs_n < (_scen_items + _ft_items) THEN 'partially_covered'
      ELSE                                                    'covered' END;

    -- Dimension 3 (employer only): what to do next about this area. The
    -- frozen guide's selection for the area, the safety state on top.
    _priority := CASE
      WHEN _state = 'critical_follow_up' THEN 'first'
      WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(_guide_for) g WHERE g ->> 'focus' = 'explore_development') THEN 'first'
      WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(_guide_for) g WHERE g ->> 'focus' IN ('explore_limited_evidence', 'explore_self_report')) THEN 'next'
      WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(_guide_for) g WHERE g ->> 'focus' = 'confirm_strength') THEN 'if_time_allows'
      ELSE 'none' END;

    _flagsarr := '[]'::jsonb;
    IF _obs_n = 1 THEN _flagsarr := _flagsarr || '"single_item"'::jsonb; END IF;
    IF _ctx_n = 1 OR (_ctx_n IS NULL AND _obs_n > 0 AND _contexts <= 1) THEN _flagsarr := _flagsarr || '"single_context"'::jsonb; END IF;
    IF jsonb_array_length(_self_for) > 0 THEN _flagsarr := _flagsarr || '"self_report_not_observed"'::jsonb; END IF;
    IF coalesce(_validation, '') <> 'validated' THEN _flagsarr := _flagsarr || '"unvalidated_content"'::jsonb; END IF;
    IF _governance = 'closed_test' THEN _flagsarr := _flagsarr || '"closed_test"'::jsonb; END IF;

    -- The frozen source-type codes, plus the free-text channel as its own
    -- code when a person read the free text and it stands as evidence.
    _sources := coalesce(_p -> 'source_types', '[]'::jsonb);
    IF _verified AND _obs_n > 0
       AND EXISTS (SELECT 1 FROM jsonb_array_elements(_mf_ev) e
                    WHERE e ->> 'competency_code' = _c AND e ->> 'item_format' = 'constructed_response'
                      AND (e ->> 'included')::boolean)
       AND NOT (_sources ? 'human_reviewed_free_text') THEN
      _sources := _sources || '"human_reviewed_free_text"'::jsonb;
    END IF;

    -- What the observed tasks showed: the frozen why-line when there is one;
    -- otherwise a fact about the instrument, never about the person.
    IF _o IS NOT NULL THEN
      _why_sv := _o ->> 'why_sv'; _why_en := _o ->> 'why_en';
    ELSIF _pending > 0 THEN
      _why_sv := 'En mänsklig granskning av ett svar inom området är inte slutförd.';
      _why_en := 'A human review of an answer in this area has not been completed.';
    ELSIF coalesce(_answered, 0) > 0 THEN
      _why_sv := 'Det observerade svaret i området gav inget underlag som står kvar efter mänsklig granskning. Följ upp i intervju.';
      _why_en := 'The observed answer in this area left no evidence standing after human review. Follow up in interview.';
    ELSIF jsonb_array_length(_self_for) > 0 THEN
      _why_sv := 'Inga observerade uppgifter i den här bedömningen berörde området. Kandidatens egen beskrivning redovisas separat och är inte observerat underlag.';
      _why_en := 'No observed task in this assessment touched this area. The candidate''s own description is reported separately and is not observed evidence.';
    ELSE
      _why_sv := 'Inga observerade uppgifter i den här bedömningen berörde området.';
      _why_en := 'No observed task in this assessment touched this area.';
    END IF;

    -- The one limitation the card states, when it has one.
    _lim := CASE
      WHEN _obs_n = 1 THEN jsonb_build_object('code', 'single_item',
        'sv', 'Det finns ett observerat svar, men underlaget räcker inte för att fastställa ett stabilt svarsmönster. Följ upp området i intervju.',
        'en', 'There is one observed answer, but the evidence is not enough to establish a stable response pattern. Follow up the area in interview.')
      WHEN _suff = 'limited' THEN jsonb_build_object('code', 'few_items',
        'sv', format('Det finns %s observerade svar, men underlaget räcker inte för att fastställa ett stabilt svarsmönster. Följ upp området i intervju.', _obs_n),
        'en', format('There are %s observed answers, but the evidence is not enough to establish a stable response pattern. Follow up the area in interview.', _obs_n))
      WHEN _suff = 'none' AND jsonb_array_length(_self_for) > 0 THEN jsonb_build_object('code', 'self_report_only',
        'sv', 'Området har enbart kandidatens egen beskrivning. Självrapport är inte observerat underlag.',
        'en', 'This area has only the candidate''s own description. Self-report is not observed evidence.')
      WHEN _suff = 'none' THEN jsonb_build_object('code', 'no_observed_evidence',
        'sv', 'Området saknar observerat underlag i den här bedömningen.',
        'en', 'This area has no observed evidence in this assessment.')
      ELSE NULL END;

    IF _suff = 'sufficient' THEN _n_suff := _n_suff + 1;
    ELSIF _suff = 'limited' THEN _n_limited := _n_limited + 1;
    ELSE _n_none := _n_none + 1; END IF;

    _basis := CASE WHEN _verified THEN jsonb_build_object(
      'scenario_items',           _scen_items,
      'free_text_items',          _ft_items,
      'free_text_reviewed',       _ft_reviewed,
      'self_description_items',   _self_items) ELSE NULL END;

    -- Why the area belongs in the interview, as governed reasons (employer
    -- only): a human safety finding, a mixed or developing pattern, limited
    -- evidence, a pending review, or a human review that changed a reading.
    -- The last is a fact of governed state, never the reviewer's workflow.
    _reasons := '[]'::jsonb;
    IF _state = 'critical_follow_up' THEN _reasons := _reasons || '"safety_finding"'::jsonb; END IF;
    IF _pattern = 'developing' THEN _reasons := _reasons || '"developing_pattern"'::jsonb; END IF;
    IF _pattern = 'mixed' THEN _reasons := _reasons || '"mixed_pattern"'::jsonb; END IF;
    IF _disputed > 0 THEN _reasons := _reasons || '"human_review_adjusted"'::jsonb; END IF;
    IF _pending > 0 THEN _reasons := _reasons || '"pending_review"'::jsonb; END IF;
    IF _suff = 'limited' THEN _reasons := _reasons || '"limited_evidence"'::jsonb; END IF;

    -- Whether this area may stand as "clearest support": an established
    -- consistent pattern, on sufficient evidence, with nothing to verify.
    _clearest_ok := _pattern IN ('clearly_consistent', 'consistent') AND _suff = 'sufficient'
                    AND jsonb_array_length(_reasons) = 0;

    _core_areas := _core_areas || jsonb_build_object(
      'competency_code',      _c,
      'competency_version',   _cver,
      'competency_name_sv',   _name_sv,
      'competency_name_en',   _name_en,
      'observed_pattern',     _pattern,
      'evidence_sufficiency', _suff,
      'evidence_state',       _v3state,
      'observed_item_count',  _obs_n,
      'answered_item_count',  _answered,
      'context_count',        _ctx_n,
      'source_types',         _sources,
      'review_status',        _review,
      'methodological_flags', _flagsarr,
      'factual_explanation',  jsonb_build_object('sv', _why_sv, 'en', _why_en),
      'limitation',           _lim,
      'evidence_basis',       _basis,
      'behaviour',            jsonb_build_object('sv', coalesce(_o ->> 'behaviour_sv', _p ->> 'behaviour_sv'),
                                                 'en', coalesce(_o ->> 'behaviour_en', _p ->> 'behaviour_en')),
      'self_description_domain_keys', (SELECT coalesce(jsonb_agg(s ->> 'domain_key'), '[]'::jsonb) FROM jsonb_array_elements(_self_for) s));

    _emp_areas := _emp_areas || jsonb_build_object(
      'competency_code',            _c,
      'follow_up_priority',         _priority,
      'safety_critical_follow_up',  (_state = 'critical_follow_up'),
      'clearest_support_eligible',  _clearest_ok,
      'verify_reasons',             _reasons,
      'safety_critical',            CASE WHEN _verified THEN jsonb_build_object('items', _sc_items, 'reviewed', _sc_reviewed) ELSE NULL END,
      'interview_prompt',           CASE WHEN _p ? 'followup_sv' THEN jsonb_build_object('sv', _p ->> 'followup_sv', 'en', _p ->> 'followup_en') ELSE NULL END,
      'trust_followup_codes',       (SELECT coalesce(jsonb_agg(g ->> 'focus'), '[]'::jsonb) FROM jsonb_array_elements(_guide_for) g),
      'traceability',               jsonb_build_object('available', _verified));
  END LOOP;

  -- ── Self-report, in its own array (core) ───────────────────────────────
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

  -- ── TRUST follow-ups (employer): every authored guide entry the release selected
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

  -- ── The TRUST Interview Plan (employer): at most three areas, at most five questions
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
        'existing_evidence',    jsonb_build_object('sv', g ->> 'why_sv', 'en', g ->> 'why_en'),
        'observed_item_count',  coalesce((SELECT (a ->> 'observed_item_count')::int FROM jsonb_array_elements(_core_areas) a WHERE a ->> 'competency_code' = g ->> 'area_code'), 0),
        'observed_pattern',     coalesce((SELECT a ->> 'observed_pattern' FROM jsonb_array_elements(_core_areas) a WHERE a ->> 'competency_code' = g ->> 'area_code'), 'not_established'),
        'evidence_sufficiency', coalesce((SELECT a ->> 'evidence_sufficiency' FROM jsonb_array_elements(_core_areas) a WHERE a ->> 'competency_code' = g ->> 'area_code'), 'none'),
        'limitation',           (SELECT a -> 'limitation' FROM jsonb_array_elements(_core_areas) a WHERE a ->> 'competency_code' = g ->> 'area_code')),
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

  -- ── The thirty-second overview (employer), from the separated dimensions ─
  --   clearest_support:    an established consistent pattern AND sufficient
  --                        evidence AND no safety follow-up AND no unresolved
  --                        human-review state.
  --   limited_evidence:    evidence_sufficiency limited or none, whatever
  --                        pattern may be visible.
  --   verify_in_interview: every area with a governed verify reason (a human
  --                        safety finding, a mixed or developing pattern,
  --                        limited evidence, a pending review, a human review
  --                        that changed a reading). May overlap
  --                        limited_evidence; never overlaps clearest_support.
  WITH a AS (
    SELECT c.a AS core, e.a AS emp, c.ord
      FROM jsonb_array_elements(_core_areas) WITH ORDINALITY c(a, ord)
      JOIN jsonb_array_elements(_emp_areas) e(a) ON e.a ->> 'competency_code' = c.a ->> 'competency_code'
  ), line AS (
    SELECT ord, core, emp, jsonb_build_object(
      'competency_code',      core ->> 'competency_code',
      'competency_name_sv',   core ->> 'competency_name_sv',
      'competency_name_en',   core ->> 'competency_name_en',
      'observed_pattern',     core ->> 'observed_pattern',
      'evidence_sufficiency', core ->> 'evidence_sufficiency',
      'observed_item_count',  (core ->> 'observed_item_count')::int,
      'follow_up_priority',   emp ->> 'follow_up_priority',
      'safety_critical_follow_up', (emp ->> 'safety_critical_follow_up')::boolean,
      'verify_reasons',       emp -> 'verify_reasons',
      'line',                 core -> 'factual_explanation') AS l
      FROM a
  )
  SELECT jsonb_build_object(
    'clearest_support', (
      SELECT coalesce(jsonb_agg(l ORDER BY (core ->> 'observed_pattern' = 'clearly_consistent') DESC,
                                        (core ->> 'observed_item_count')::int DESC, core ->> 'competency_code'), '[]'::jsonb)
        FROM (SELECT * FROM line WHERE (emp ->> 'clearest_support_eligible')::boolean
               ORDER BY (core ->> 'observed_pattern' = 'clearly_consistent') DESC,
                        (core ->> 'observed_item_count')::int DESC, core ->> 'competency_code'
               LIMIT 3) q),
    'verify_in_interview', (
      SELECT coalesce(jsonb_agg(l ORDER BY (emp ->> 'safety_critical_follow_up')::boolean DESC,
                                        (core ->> 'observed_pattern' = 'developing') DESC,
                                        (core ->> 'observed_pattern' = 'mixed') DESC,
                                        (emp -> 'verify_reasons' ? 'human_review_adjusted') DESC,
                                        (core ->> 'review_status' = 'pending') DESC,
                                        (core ->> 'observed_item_count')::int DESC, core ->> 'competency_code'), '[]'::jsonb)
        FROM (SELECT * FROM line
               WHERE jsonb_array_length(emp -> 'verify_reasons') > 0
               ORDER BY (emp ->> 'safety_critical_follow_up')::boolean DESC,
                        (core ->> 'observed_pattern' = 'developing') DESC,
                        (core ->> 'observed_pattern' = 'mixed') DESC,
                        (emp -> 'verify_reasons' ? 'human_review_adjusted') DESC,
                        (core ->> 'review_status' = 'pending') DESC,
                        (core ->> 'observed_item_count')::int DESC, core ->> 'competency_code'
               LIMIT 3) q),
    'limited_evidence', (
      SELECT coalesce(jsonb_agg(l ORDER BY (core ->> 'evidence_sufficiency' = 'limited') DESC,
                                        (core ->> 'observed_item_count')::int DESC, core ->> 'competency_code'), '[]'::jsonb)
        FROM (SELECT * FROM line WHERE core ->> 'evidence_sufficiency' IN ('limited', 'none')
               ORDER BY (core ->> 'evidence_sufficiency' = 'limited') DESC,
                        (core ->> 'observed_item_count')::int DESC, core ->> 'competency_code'
               LIMIT 3) q))
    INTO _overview;

  -- ── The primary next step (employer): the one rds-v1 rule ──────────────
  SELECT * INTO _step FROM public.scp_report_next_step(
    _has_finding, coalesce((_cov ->> 'observed_observations')::int, 0), _n_suff, _n_limited);
  _reason_sv := CASE _step.reason_code
    WHEN 'safety_follow_up'     THEN 'Ett säkerhetskritiskt svar behöver följas upp innan processen går vidare.'
    WHEN 'no_observed_evidence' THEN 'Bedömningen gav inga observerade svar att utgå ifrån. Det säger ingenting om personen, bara att underlaget saknas.'
    WHEN 'thin_coverage'        THEN 'Fler områden berördes för lite än som faktiskt prövades. Komplettera underlaget innan en intervju byggs på det -- det säger något om bedömningens bredd och inget om kandidaten.'
    ELSE                             'Underlaget räcker för att förbereda ett strukturerat samtal. Frågorna i TRUST Interview Plan är valda utifrån just de här svaren.' END;
  _reason_en := CASE _step.reason_code
    WHEN 'safety_follow_up'     THEN 'A safety-critical response needs following up before the process continues.'
    WHEN 'no_observed_evidence' THEN 'This assessment produced no observed responses to work from. That says nothing about the person, only that the evidence is missing.'
    WHEN 'thin_coverage'        THEN 'More areas were barely touched than were actually exercised. Broaden the evidence before an interview builds on it -- that says something about the breadth of the assessment and nothing about the candidate.'
    ELSE                             'There is enough here to prepare a structured conversation. The questions in the TRUST Interview Plan were selected from these specific responses.' END;
  _next := jsonb_build_object(
    'step',         _step.step,
    'reason_code',  _step.reason_code,
    'rule_version', _step.rule_version,
    'reason',       jsonb_build_object('sv', _reason_sv, 'en', _reason_en),
    'interview_handoff', jsonb_build_object(
      'attempt_id',       _attempt_id,
      'focus_area_codes', (SELECT coalesce(jsonb_agg(p ->> 'competency_code' ORDER BY (p ->> 'order')::int), '[]'::jsonb)
                             FROM jsonb_array_elements(_plan -> 'priorities') p)));

  -- ── Safety (employer): only ever an explicit human-reviewed finding ────
  -- The snapshot's safety_flags are written from reviewer findings alone
  -- (no deterministic path sets a finding; a cleared item is no_concern and
  -- never a flag). Nothing here infers anything from a pattern, a count or a
  -- self-description.
  SELECT coalesce(jsonb_agg(x.a ->> 'competency_code' ORDER BY x.ord), '[]'::jsonb)
    INTO _critical_codes
    FROM jsonb_array_elements(_emp_areas) WITH ORDINALITY x(a, ord)
   WHERE (x.a ->> 'safety_critical_follow_up')::boolean;
  _safety := jsonb_build_object(
    'present',        _has_finding,
    'source',         'human_review',
    'findings',       _flags,
    'finding_count',  jsonb_array_length(_flags),
    'areas_flagged_for_follow_up', _critical_codes,
    'safety_critical', CASE WHEN _verified THEN jsonb_build_object('items', _tot_sc_items, 'reviewed', _tot_sc_reviewed) ELSE NULL END,
    'statement', jsonb_build_object(
      'sv', 'Ett säkerhetskritiskt svar har granskats av en person och behöver följas upp i samtal. Det är en uppföljningspunkt, inte en slutsats om personen.',
      'en', 'A safety-critical answer has been reviewed by a person and needs to be followed up in conversation. It is a follow-up point, not a conclusion about the person.'));

  -- ── Limitations (core): the closed code set, in both languages ─────────
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

  -- ── Human review (core): the mandatory reviews for release, as counts ──
  -- "Mänskligt granskat" means exactly this and nothing more.
  _hr := jsonb_build_object(
    'required',          _rt > 0,
    'reviews_total',     _rt,
    'reviews_completed', _rc,
    'completed',         (_rt = _rc AND NOT _any_pending),
    'free_text',         CASE WHEN _verified THEN jsonb_build_object('items', _tot_ft_items, 'reviewed', _tot_ft_reviewed) ELSE NULL END,
    'meaning', jsonb_build_object(
      'sv', 'Mänskligt granskat betyder att de obligatoriska mänskliga granskningarna inför frisläppning är slutförda. Det betyder inte att svaren är godkända, validerade eller lämpliga, och det är inte ett omdöme från granskaren.',
      'en', 'Human-reviewed means that the mandatory human reviews required for release were completed. It does not mean the answers are approved or validated, it does not say the person is right for the role, and it is not an endorsement by the reviewer.'));

  _composition := CASE WHEN _verified THEN jsonb_build_object(
    'scenario_items',           _tot_scen,
    'self_description_items',   _tot_self,
    'free_text_items',          _tot_ft_items,
    'free_text_reviewed',       _tot_ft_reviewed) ELSE NULL END;

  _prov := jsonb_build_object(
    'report_id',              _d.id,
    'released_at',            _d.released_at,
    'calculated_at',          _d.released_at,
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
    'evidence_basis_available', _verified,
    'traceability_available', _verified);

  -- ── The live addenda overlay: the append-only interview notes ──────────
  -- Composed beside the frozen report, never inside it. Attribution is the
  -- minimum display field (Product Owner decision): a display name, in the
  -- employer addenda overlay only; never a user id, an e-mail, a membership
  -- id or an authentication identity.
  SELECT jsonb_build_object(
    'as_of',  clock_timestamp(),
    'source', 'interview_note',
    'items',  coalesce(jsonb_agg(jsonb_build_object(
      'id',                  n.id,
      'competency_code',     n.area_code,
      'status',              CASE n.outcome
                               WHEN 'evidence_confirmed'     THEN 'supported_in_interview'
                               WHEN 'evidence_not_confirmed' THEN 'not_supported_in_interview'
                               ELSE 'additional_context' END,
      'note',                n.note,
      'recorded_at',         n.recorded_at,
      'author_display_name', coalesce(nullif(btrim(pr.display_name), ''), 'Kollega'))
      ORDER BY n.recorded_at DESC, n.area_code, n.id), '[]'::jsonb))
    INTO _overlay
    FROM public.scp_interview_notes n
    LEFT JOIN public.profiles pr ON pr.id = n.recorded_by
   WHERE n.attempt_id = _attempt_id
     AND n.employer_id = _issuer;

  RETURN jsonb_build_object(
    'schema_version', _schema,
    'report_id',      _d.id,
    'frozen_report', jsonb_build_object(
      'core', jsonb_build_object(
        'core_version', _core_version,
        'assessment', jsonb_build_object(
          'assessment_slug',    _ctx ->> 'assessment_slug',
          'assessment_name_sv', _ctx ->> 'assessment_name_sv',
          'assessment_name_en', _ctx ->> 'assessment_name_en',
          'assessment_version', (_ctx ->> 'assessment_version')::int,
          'language',           _ctx ->> 'language',
          'governance_mode',    _governance,
          'validation_status',  _validation,
          'content_status',     _ctx ->> 'content_status'),
        'timestamps', jsonb_build_object(
          'started_at',   _ctx -> 'started_at',
          'submitted_at', _ctx -> 'submitted_at',
          'scored_at',    _ctx -> 'scored_at',
          'released_at',  to_jsonb(_d.released_at),
          'calculated_at', to_jsonb(_d.released_at)),
        'competencies',           _core_areas,
        'self_reported_patterns', _patterns,
        'coverage', jsonb_build_object(
          'observed_items',      coalesce((_cov ->> 'observed_observations')::int, 0),
          'self_report_items',   coalesce((_cov ->> 'self_report_observations')::int, 0),
          'evidence_contexts',   _contexts,
          'areas_sufficient',    _n_suff,
          'areas_limited',       _n_limited,
          'areas_none',          _n_none,
          'composition',         _composition,
          'modules',             _modules),
        'human_review',  _hr,
        'definitions', jsonb_build_object(
          'evidence_sufficiency', jsonb_build_object(
            'rule_version',           _ctx ->> 'signal_version',
            'minimum_observed_items', 3,
            'sv', 'Tillräckligt underlag betyder att tillräckligt många observerade uppgifter berörde området enligt den nuvarande regeln i skuggpiloten. Det betyder inte psykometrisk validering, inte visad kompetens, inte något om framtida arbetsprestation och inte en stabil egenskap.',
            'en', 'Sufficient evidence means that enough observed tasks touched the area under the current shadow-pilot rule. It does not mean psychometric validation, demonstrated competence, anything about future work performance, or a stable trait.')),
        'limitations', jsonb_build_object(
          'standing_statement', jsonb_build_object(
            'sv', 'Detta visar hur kandidaten svarade i just dessa uppgifter. Det fastställer inte lämplighet eller framtida arbetsprestation. Beslutet är arbetsgivarens.',
            'en', 'This shows how the candidate answered these specific tasks. It does not settle whether the person is right for the role, nor future work performance. The decision is the employer''s.'),
          'items', _limits),
        'provenance',    _prov),
      'employer', jsonb_build_object(
        'context', jsonb_build_object(
          'attempt_id',         _d.attempt_id,
          'subject_id',         _d.subject_id,
          'participant_ref',    _ctx ->> 'participant_ref',
          'person_context',     _ctx ->> 'person_context',
          'organisation_name',  _ctx ->> 'organisation_name',
          'purpose_code',       _ctx ->> 'purpose_code',
          'standing_limitation', jsonb_build_object(
            'sv', 'Underlag för fortsatt mänsklig bedömning -- inte ett anställningsbeslut.',
            'en', 'Evidence for continued human judgement -- not an employment decision.')),
        'primary_next_step', _next,
        'overview',          _overview,
        'safety_followup',   _safety,
        'areas',             _emp_areas,
        'trust_followups',   _followups,
        'trust_plan',        _plan)),
    -- The template's limitation lines follow the live template row through
    -- the R2A audience contract; they are therefore an overlay, never part of
    -- the frozen report.
    'template_overlay', jsonb_build_object(
      'as_of',           clock_timestamp(),
      'source',          'scp_report_versions',
      'report_template', jsonb_build_object('report_key', _ctx ->> 'report_key',
                                            'version', (_ctx ->> 'report_version')::int),
      'limitations',     jsonb_build_object('sv', to_jsonb(coalesce(_d.limitations_sv, ARRAY[]::text[])),
                                            'en', to_jsonb(coalesce(_d.limitations_en, ARRAY[]::text[])))),
    'addenda_overlay', _overlay);
END;
$function$;

COMMENT ON FUNCTION public.scp_employer_report_v3(uuid) IS
  'The employer''s Report V3 document for a released attempt, as one jsonb: '
  'a frozen report (a shared audience-neutral core -- observed_pattern, '
  'evidence_sufficiency, counts, self-report apart, limitations, human-review '
  'counts, provenance -- and the employer projection: next step, overview, '
  'safety follow-up, interview priorities, TRUST follow-ups and plan) beside '
  'a live addenda overlay with its own as_of. Every conclusion is the frozen '
  'employer document''s, read through scp_employer_report; every structural '
  'fact is the release''s frozen manifest, as counts and version identities '
  'only, or an explicit null on a pre-R1 report. Every number on a competency '
  'is a count. Contains no derivation input, no mean, no spread, no option '
  'key, no rubric level, no reviewer rationale, no behaviour id, no manifest '
  'body, no manifest id, no hash, no author id, no e-mail. NULL when the '
  'caller may not read the employer document.';

REVOKE ALL     ON FUNCTION public.scp_employer_report_v3(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_employer_report_v3(uuid) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- §3  Proof, at apply time
-- ═══════════════════════════════════════════════════════════════════════════

DO $proof$
DECLARE _def text; _bad text; _src text; _r record;
BEGIN
  -- 3.1 Posture: definer, pinned, STABLE, authenticated only; the rule
  -- immutable and internal.
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'public' AND p.proname = 'scp_employer_report_v3' AND p.prosecdef
                    AND p.provolatile = 's'
                    AND EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%')) THEN
    RAISE EXCEPTION 'SCP_R3A_PROOF: scp_employer_report_v3 is not a pinned, STABLE SECURITY DEFINER';
  END IF;
  IF has_function_privilege('anon', 'public.scp_employer_report_v3(uuid)'::regprocedure, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.scp_employer_report_v3(uuid)'::regprocedure, 'EXECUTE')
     OR has_function_privilege('anon', 'public.scp_report_next_step(boolean,integer,integer,integer)'::regprocedure, 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.scp_report_next_step(boolean,integer,integer,integer)'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'SCP_R3A_PROOF: the V3 contract grants moved';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'public' AND p.proname = 'scp_report_next_step' AND p.provolatile = 'i') THEN
    RAISE EXCEPTION 'SCP_R3A_PROOF: the process-step rule is not IMMUTABLE';
  END IF;

  -- 3.2 The rule, at its four corners, as rds-v1 states them.
  SELECT * INTO _r FROM public.scp_report_next_step(true, 26, 5, 3);
  IF _r.step <> 'request_clarification' OR _r.reason_code <> 'safety_follow_up' THEN RAISE EXCEPTION 'SCP_R3A_PROOF: rule corner 1'; END IF;
  SELECT * INTO _r FROM public.scp_report_next_step(false, 0, 0, 0);
  IF _r.step <> 'gather_more_evidence' OR _r.reason_code <> 'no_observed_evidence' THEN RAISE EXCEPTION 'SCP_R3A_PROOF: rule corner 2'; END IF;
  SELECT * INTO _r FROM public.scp_report_next_step(false, 5, 1, 2);
  IF _r.step <> 'additional_assessment' OR _r.reason_code <> 'thin_coverage' THEN RAISE EXCEPTION 'SCP_R3A_PROOF: rule corner 3'; END IF;
  SELECT * INTO _r FROM public.scp_report_next_step(false, 26, 5, 3);
  IF _r.step <> 'structured_interview' OR _r.reason_code <> 'ready_for_interview' THEN RAISE EXCEPTION 'SCP_R3A_PROOF: rule corner 4'; END IF;

  -- 3.3 Reads through the audience contract; reaches nothing internal and
  -- recomputes nothing; takes counts and version identities from the frozen
  -- manifest and never its numbers, keys, levels or findings.
  _src := (SELECT p.prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname = 'scp_employer_report_v3');
  IF _src NOT LIKE '%FROM public.scp_employer_report(_attempt_id)%' THEN
    RAISE EXCEPTION 'SCP_R3A_PROOF: the V3 contract does not read the document through scp_employer_report';
  END IF;
  IF _src LIKE '%s.derivation_input%' OR _src LIKE '%s.payload%' OR _src LIKE '%s.brief%'
     OR _src LIKE '%s.canonical_sha256%' OR _src LIKE '%reviewer_rationale%'
     OR _src LIKE '%scp_review_rubric_scores%' OR _src LIKE '%scp_competency_evidence%'
     OR _src LIKE '%scp_item_options%' OR _src LIKE '%score_value%' OR _src LIKE '%response_text%'
     OR _src LIKE '%scp_candidate_responses%' OR _src LIKE '%scp_human_reviews%' OR _src LIKE '%scp_form_items%'
     OR _src LIKE '%scp_attempt_assessment_signal%' OR _src LIKE '%scp_attempt_maturity%'
     OR _src LIKE '%scp_attempt_evidence_state%' OR _src LIKE '%scp_attempt_self_report_pattern%'
     OR _src LIKE '%selected_option_key%' OR _src LIKE '%best_option_key%' OR _src LIKE '%worst_option_key%'
     OR _src LIKE '%selected_score_value%' OR _src LIKE '%item_max_score%'
     OR _src LIKE '%''contribution''%' OR _src LIKE '%''confidence''%' OR _src LIKE '%rubric_levels%'
     OR _src LIKE '%''safety_finding''%' OR _src LIKE '%''safety_severity''%' OR _src LIKE '%derivation_basis%'
     OR _src LIKE '%weighted_sum%' OR _src LIKE '%denominator%' OR _src LIKE '%m.canonical_sha256%'
     OR _src LIKE '%auth.users%' OR _src LIKE '%.email%' THEN
    RAISE EXCEPTION 'SCP_R3A_PROOF: the V3 contract reaches something internal or recomputes a conclusion';
  END IF;
  IF _src LIKE '%''manifest_id''%' OR _src LIKE '%''canonical_sha256''%' OR _src LIKE '%''behaviour_version_id''%'
     OR _src LIKE '%''mean''%' OR _src LIKE '%''spread''%' OR _src LIKE '%''derivation_input''%'
     OR _src LIKE '%''user_id''%' OR _src LIKE '%''email''%' OR _src LIKE '%''body''%'
     OR _src LIKE '%''reviews_disputed''%' OR _src LIKE '%''completed_disputed''%' OR _src LIKE '%''disputed_readings''%' THEN
    RAISE EXCEPTION 'SCP_R3A_PROOF: the V3 contract projects a withheld key';
  END IF;
  -- Version lock: no "latest" or "currently active" catalogue read.
  IF _src ~* 'content_status\s*=\s*''published''\)\s*DESC' OR _src ~* 'is_active' OR _src ~* 'retired_at IS NULL' THEN
    RAISE EXCEPTION 'SCP_R3A_PROOF: the V3 contract resolves a catalogue version by current status instead of the release instant';
  END IF;

  -- 3.4 The audience contracts this file must not touch have not moved.
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname IN ('scp_participant_report','scp_employer_report')
         AND p.prosrc LIKE '%scp_audience_brief%' AND p.prosrc LIKE '%LEFT JOIN public.scp_report_versions%') <> 2
     OR has_table_privilege('authenticated', 'public.scp_report_snapshots', 'SELECT')
     OR has_table_privilege('anon', 'public.scp_report_snapshots', 'SELECT')
     OR has_table_privilege('authenticated', 'public.scp_report_computation_manifests', 'SELECT')
     OR has_table_privilege('anon', 'public.scp_report_computation_manifests', 'SELECT') THEN
    RAISE EXCEPTION 'SCP_R3A_PROOF: the R2A audience posture or the manifest privacy moved';
  END IF;

  -- 3.5 The vocabulary this product refuses to produce, over both routines.
  FOR _def IN SELECT lower(pg_get_functiondef(f::regprocedure))
              FROM unnest(ARRAY['public.scp_employer_report_v3(uuid)',
                                'public.scp_report_next_step(boolean,integer,integer,integer)']) f LOOP
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
          'SCP_FORBIDDEN_REPORT_VOCABULARY: a PR-R3A routine contains "%". '
          'CQrityjob produces decision support, never an employment decision.', _bad;
      END IF;
    END LOOP;
  END LOOP;
  _def := lower(pg_get_functiondef('public.scp_employer_report_v3(uuid)'::regprocedure));
  IF position('self_reported_patterns' IN _def) = 0 OR position('''descriptive_only''' IN _def) = 0
     OR position('''observed_pattern''' IN _def) = 0 OR position('''evidence_sufficiency''' IN _def) = 0
     OR position('''follow_up_priority''' IN _def) = 0 OR position('''addenda_overlay''' IN _def) = 0
     OR position('''template_overlay''' IN _def) = 0 OR position('''frozen_report''' IN _def) = 0
     OR position('''coverage_status''' IN _def) > 0 OR position('''safety_findings_present''' IN _def) > 0 THEN
    RAISE EXCEPTION 'SCP_R3A_PROOF: the three dimensions, the self-report array or the frozen/overlay boundary are missing';
  END IF;

  RAISE NOTICE 'PR-R3A contract proven: one process-step rule; the employer V3 projection reads through the audience contract, takes counts from the frozen manifest, recomputes nothing, projects no internal key, keeps the three dimensions apart and the addenda outside the frozen report';
END
$proof$;
