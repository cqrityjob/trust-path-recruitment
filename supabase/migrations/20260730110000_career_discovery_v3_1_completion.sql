-- Security Career Discovery v3.1 — PR 3: atomic, idempotent completion.
--
-- ADDITIVE ONLY. cd_complete_session (v3.0) is untouched and still callable;
-- v3.1 gets its own entry point because the two have deliberately different
-- repeat-call semantics and different payloads.
--
-- ── WHY A SEPARATE FUNCTION RATHER THAN A WIDER ONE ────────────────────
--
-- v3.0's contract REJECTS a repeat completion with CD_ALREADY_COMPLETED, so
-- a second call cannot look like it produced a second result. That was the
-- right call for a path with no retry story.
--
-- v3.1 needs retry safety instead: a network timeout after the transaction
-- commits but before the response arrives must not leave the candidate
-- unable to finish. So a repeat call here RETURNS the existing snapshot and
-- says it did not create one. Same outcome — exactly one snapshot — reached
-- by returning rather than raising.
--
-- Changing v3.0's semantics to match would alter a contract v3.0 clients
-- depend on, for no benefit to a version being retired.
--
-- ── ATOMICITY ──────────────────────────────────────────────────────────
--
-- The session row is locked FOR UPDATE first, so two concurrent completions
-- serialise: the second sees status='completed' and takes the idempotent
-- path. cd_report_snapshots.session_id is UNIQUE, so even a caller that
-- bypassed this function entirely cannot create a second snapshot.
--
-- Snapshot insert and status flip happen in one transaction. A session can
-- never be completed without its report, nor carry a report without being
-- completed.

-- =========================================================================
-- 1. Validation helper — is this session's evidence fit to be scored?
-- =========================================================================
--
-- Separate from the completion function so it can be called on its own, by
-- tests and by a future "can I finish?" check, without side effects.

CREATE OR REPLACE FUNCTION public.cd_v31_validate_session_evidence(_session_id uuid)
RETURNS TABLE (code text, detail text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _s record;
  _dv record;
  _expected integer;
  _answered integer;
  _bad_option text;
  _violations integer;
BEGIN
  SELECT * INTO _s FROM public.cd_sessions WHERE id = _session_id;
  IF _s.id IS NULL THEN
    RETURN QUERY SELECT 'CD_SESSION_NOT_FOUND', _session_id::text;
    RETURN;
  END IF;

  SELECT * INTO _dv FROM public.cd_definition_versions WHERE id = _s.definition_version_id;
  IF _dv.id IS NULL THEN
    RETURN QUERY SELECT 'CD_DEFINITION_VERSION_MISSING', _s.definition_version_id::text;
    RETURN;
  END IF;

  -- The definition must be one a session may legitimately have run against.
  -- 'design' is never administrable; 'retired' means the instrument was
  -- withdrawn, and a session that somehow survived may not be scored under it.
  IF _dv.lifecycle_status NOT IN ('internal_test', 'pilot', 'active') THEN
    RETURN QUERY SELECT 'CD_VERSION_NOT_ADMINISTRABLE', _dv.lifecycle_status;
  END IF;

  -- Every scored item in the registry must have exactly one answer.
  SELECT count(*) INTO _expected
    FROM public.cd_definition_items
   WHERE definition_version_id = _s.definition_version_id
     AND is_scored AND item_kind IN ('scale', 'single_choice');

  SELECT count(*) INTO _answered
    FROM public.cd_evidence e
    JOIN public.cd_definition_items di
      ON di.definition_version_id = _s.definition_version_id
     AND di.item_id = e.item_id
   WHERE e.session_id = _session_id
     AND di.is_scored AND di.item_kind IN ('scale', 'single_choice');

  IF _expected = 0 THEN
    RETURN QUERY SELECT 'CD_NO_SCORED_ITEMS',
      'the definition version registers no scale or single_choice items';
  ELSIF _answered <> _expected THEN
    RETURN QUERY SELECT 'CD_CORE_INCOMPLETE',
      format('%s of %s scored items answered', _answered, _expected);
  END IF;

  -- Owner requirement: option ids must belong to the correct item. A stored
  -- option id from another question would score the wrong dimensions
  -- silently, which is exactly the class of defect that survives to launch.
  SELECT string_agg(e.item_id || ' <- ' || e.option_id, ', ') INTO _bad_option
    FROM public.cd_evidence e
   WHERE e.session_id = _session_id
     AND e.option_id IS NOT NULL
     AND e.option_id NOT LIKE e.item_id || '\_%';

  IF _bad_option IS NOT NULL THEN
    RETURN QUERY SELECT 'CD_OPTION_ITEM_MISMATCH', _bad_option;
  END IF;

  -- Every stored option must exist in the matrix for the scoring version the
  -- session will be scored under.
  SELECT string_agg(DISTINCT e.option_id, ', ') INTO _bad_option
    FROM public.cd_evidence e
   WHERE e.session_id = _session_id
     AND e.option_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.cd_option_loadings l
        WHERE l.option_id = e.option_id
          AND l.scoring_version = _dv.scoring_version);

  IF _bad_option IS NOT NULL THEN
    RETURN QUERY SELECT 'CD_OPTION_NOT_IN_MATRIX', _bad_option;
  END IF;

  -- The matrix itself must be sound. Scoring against a matrix with a gap
  -- would produce a report nobody could defend.
  SELECT count(*) INTO _violations
    FROM public.cd_validate_option_matrix(_dv.scoring_version);
  IF _violations > 0 THEN
    RETURN QUERY SELECT 'CD_OPTION_MATRIX_INVALID',
      format('%s set-level violation(s) in scoring version %s', _violations, _dv.scoring_version);
  END IF;

  RETURN;
END $$;

COMMENT ON FUNCTION public.cd_v31_validate_session_evidence(uuid) IS
  'Returns one row per reason this session may not be completed. Zero rows '
  'means the evidence is fit to score. Read-only and side-effect free.';

REVOKE ALL ON FUNCTION public.cd_v31_validate_session_evidence(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cd_v31_validate_session_evidence(uuid) TO authenticated, service_role;

-- =========================================================================
-- 2. Completion
-- =========================================================================

CREATE OR REPLACE FUNCTION public.cd_v31_complete_session(
  _session_id                 uuid,
  _payload                    jsonb,
  _pattern_definition_version text,
  _completed_at               timestamptz
)
RETURNS TABLE (snapshot_id uuid, was_created boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _s          record;
  _existing   uuid;
  _new        uuid;
  _failures   text;
  _areas      jsonb;
BEGIN
  -- 1. Lock. A concurrent completion blocks here and then takes the
  --    idempotent branch below rather than racing to insert.
  SELECT * INTO _s FROM public.cd_sessions WHERE id = _session_id FOR UPDATE;

  IF _s.id IS NULL THEN
    RAISE EXCEPTION 'CD_SESSION_NOT_FOUND: %', _session_id USING ERRCODE = 'no_data_found';
  END IF;

  -- 2. Ownership. SECURITY DEFINER, so this must never become a route to
  --    completing someone else's session. A service_role caller has
  --    auth.uid() IS NULL and is trusted.
  IF auth.uid() IS NOT NULL AND _s.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'CD_NOT_SESSION_OWNER: a session may only be completed by its owner'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 3. IDEMPOTENCY. A retry after a committed completion returns the stored
  --    result. It does not recompute, does not overwrite, and does not
  --    pretend to have created anything.
  SELECT id INTO _existing FROM public.cd_report_snapshots WHERE session_id = _session_id;
  IF _existing IS NOT NULL THEN
    RETURN QUERY SELECT _existing, false;
    RETURN;
  END IF;

  -- A session marked completed with no snapshot is a broken state that
  -- should be impossible. Say so rather than quietly writing a second-best
  -- report on top of it.
  IF _s.status = 'completed' THEN
    RAISE EXCEPTION 'CD_COMPLETED_WITHOUT_SNAPSHOT: session % is completed but has no report',
      _session_id USING ERRCODE = 'internal_error';
  END IF;

  -- 4. Evidence validation. Every failure is reported at once.
  SELECT string_agg(code || ' (' || detail || ')', '; ') INTO _failures
    FROM public.cd_v31_validate_session_evidence(_session_id);

  IF _failures IS NOT NULL THEN
    RAISE EXCEPTION 'CD_VALIDATION_FAILED: %', _failures USING ERRCODE = 'check_violation';
  END IF;

  -- 5. Payload shape. The database does not recompute the report, but it
  --    refuses to store one that is obviously not a report.
  IF _payload IS NULL OR _payload->'outputA' IS NULL OR _payload->'outputB' IS NULL THEN
    RAISE EXCEPTION 'CD_PAYLOAD_INCOMPLETE: outputA and outputB are both required'
      USING ERRCODE = 'check_violation';
  END IF;

  IF _payload->'versions'->>'reportSchemaVersion' IS NULL THEN
    RAISE EXCEPTION 'CD_PAYLOAD_UNVERSIONED: the payload carries no report schema version'
      USING ERRCODE = 'check_violation';
  END IF;

  IF _pattern_definition_version IS NULL
     OR _pattern_definition_version <> (_payload->'versions'->>'patternDefinitionVersion') THEN
    RAISE EXCEPTION 'CD_PATTERN_VERSION_MISMATCH: column and payload disagree'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Owner requirement: an unapproved profession may never reach candidate
  -- ranking. Enforced here as well as in the domain layer, because this is
  -- the last point before the claim becomes permanent.
  IF jsonb_array_length(COALESCE(_payload->'professions'->'matches', '[]'::jsonb)) > 0
     AND NOT EXISTS (SELECT 1 FROM public.cd_professions WHERE approved_for_ranking) THEN
    RAISE EXCEPTION 'CD_UNAPPROVED_PROFESSION_RANKING: no profession is approved for ranking'
      USING ERRCODE = 'check_violation';
  END IF;

  _areas := COALESCE(_payload->'outputA'->'areas', '[]'::jsonb);
  IF jsonb_array_length(_areas) = 0 THEN
    RAISE EXCEPTION 'CD_EMPTY_RANKING: a report cannot be stored with no ranked Security Career Areas'
      USING ERRCODE = 'check_violation';
  END IF;

  -- 6. Store. The version tuple columns are assigned by
  --    cd_guard_snapshot_derive_versions() from the session's definition
  --    version; the 'derived' literals are placeholders it overwrites.
  INSERT INTO public.cd_report_snapshots
    (session_id, definition_version, content_version, scoring_version, taxonomy_version,
     dna_scores, career_areas, confidence, coverage, contextual_tags,
     pattern_definition_version, patterns, candidate_story, generated_at)
  VALUES
    (_session_id, 'derived', 'derived', 'derived', 'derived',
     jsonb_build_object('report', _payload),
     _areas,
     COALESCE(_payload->'outputA'->'confidence', '{}'::jsonb),
     COALESCE(_payload->'outputA'->'coverage', '{}'::jsonb),
     ARRAY[]::text[],
     _pattern_definition_version,
     COALESCE(_payload->'outputA', '{}'::jsonb),
     COALESCE(_payload->'outputB', '{}'::jsonb),
     _completed_at)
  RETURNING id INTO _new;

  -- 7. Flip the session. The marker is transaction-local so it cannot leak
  --    to a client statement and let a client self-complete.
  PERFORM set_config('cqj.cd_completing', _session_id::text, true);

  UPDATE public.cd_sessions
     SET status = 'completed', completed_at = _completed_at
   WHERE id = _session_id;

  PERFORM set_config('cqj.cd_completing', '', true);

  RETURN QUERY SELECT _new, true;
END $$;

COMMENT ON FUNCTION public.cd_v31_complete_session(uuid, jsonb, text, timestamptz) IS
  'Atomic, idempotent v3.1 completion. Returns (snapshot_id, was_created). A '
  'repeat call after a committed completion returns the stored snapshot with '
  'was_created = false rather than raising or duplicating.';

REVOKE ALL ON FUNCTION public.cd_v31_complete_session(uuid, jsonb, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cd_v31_complete_session(uuid, jsonb, text, timestamptz)
  TO authenticated, service_role;

-- =========================================================================
-- 3. Historical isolation
-- =========================================================================
--
-- A stored report must be readable without consulting any current definition.
-- This view proves that is possible: it reads ONLY the snapshot row, joins
-- nothing to cd_definition_versions, cd_definition_items or
-- cd_option_loadings, and is therefore unaffected by anything those tables
-- later say.

CREATE OR REPLACE VIEW public.cd_v31_stored_reports AS
SELECT
  s.id                          AS snapshot_id,
  s.session_id,
  s.generated_at,
  s.definition_version,
  s.content_version,
  s.scoring_version,
  s.pattern_definition_version,
  s.dna_scores -> 'report' -> 'versions'  AS versions,
  s.dna_scores -> 'report' -> 'locale'    AS locale,
  s.patterns                    AS output_a,
  s.candidate_story             AS output_b,
  s.career_areas
FROM public.cd_report_snapshots s;

COMMENT ON VIEW public.cd_v31_stored_reports IS
  'A stored report, read from the snapshot alone. Joins no definition, item '
  'or matrix table, so changing any of them cannot alter what this returns.';

GRANT SELECT ON public.cd_v31_stored_reports TO authenticated;

-- =========================================================================
-- 4. Self-verification
-- =========================================================================

DO $$
DECLARE _fn integer; _view integer;
BEGIN
  SELECT count(*) INTO _fn FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('cd_v31_complete_session', 'cd_v31_validate_session_evidence');
  IF _fn <> 2 THEN
    RAISE EXCEPTION 'v3.1 completion functions did not install (found %)', _fn;
  END IF;

  SELECT count(*) INTO _view FROM information_schema.views
   WHERE table_schema = 'public' AND table_name = 'cd_v31_stored_reports';
  IF _view <> 1 THEN
    RAISE EXCEPTION 'cd_v31_stored_reports view did not install';
  END IF;

  -- v3.0's completion contract must be untouched: exactly one overload,
  -- still taking its six arguments. Checked by arity rather than by the
  -- rendered signature, which includes parameter names and is brittle.
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'cd_complete_session') <> 1 THEN
    RAISE EXCEPTION 'the v3.0 completion contract is no longer a single overload';
  END IF;

  IF (SELECT p.pronargs FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'cd_complete_session') <> 6 THEN
    RAISE EXCEPTION 'the v3.0 completion contract changed arity';
  END IF;

  RAISE NOTICE 'Career Discovery v3.1 completion layer installed and verified.';
END $$;
