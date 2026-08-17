-- The Assessment Library tells the truth about what may be assigned.
--
-- ── THE DEFECT ──────────────────────────────────────────────────────────
--
-- scp_employer_library computed `assignable` as `content_status = 'published'`
-- — the same stale rule 20260819100000 replaced in the assignment path. So the
-- library and the engine disagreed:
--
--   library:  "Kan inte tilldelas ännu — under utveckling och ännu inte
--              validerad."   (cannot be assigned yet)
--   engine:   scp_employer_assign would have accepted it, because the
--             organisation holds a scoped closed_test grant.
--
-- Found by running the real product in a browser as a synthetic employer that
-- genuinely holds a Väktare pilot grant: the Security Guard programme — the
-- entire point of the pilot — was displayed as un-assignable.
--
-- ── THE FIX ─────────────────────────────────────────────────────────────
--
-- `assignable` now asks scp_grant_permits_assignment, exactly as the assign
-- path does, so there is ONE definition of "may this organisation run this
-- content" and the library cannot drift from it again.
--
-- A `governance_mode` column is added so the UI can say WHY it is assignable
-- rather than only whether. That distinction matters here: a closed-test pilot
-- is assignable AND unvalidated at the same time, and a library that shows
-- only a boolean cannot express that without lying in one direction or the
-- other.
--
-- The fixture-visibility rule is unchanged, and still separate: seeing a
-- fixture in the list and being permitted to run it are different questions.
--
-- Reversible: restore the previous body from 20260812090000.

DROP FUNCTION IF EXISTS public.scp_employer_library(uuid);

CREATE OR REPLACE FUNCTION public.scp_employer_library(_employer_id uuid)
RETURNS TABLE(
  assessment_version_id uuid, definition_slug text, name_sv text, name_en text,
  content_status text, validation_status text, is_test_fixture boolean,
  assignable boolean, governance_mode public.scp_governance_mode,
  item_count integer, target_minutes_min integer, target_minutes_max integer,
  programme_purpose_sv text, programme_purpose_en text,
  does_not_measure_sv text[], does_not_measure_en text[])
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
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
    -- Assignable exactly when the engine would accept it, and only when the
    -- form actually has items: a programme with no questions is not an
    -- assessment, whatever its governance says.
    (public.scp_grant_permits_assignment(
       _employer_id, d.id, av.content_status, av.validation_status,
       d.is_test_fixture) IS NOT NULL
     AND av.retired_at IS NULL
     AND EXISTS (SELECT 1 FROM public.scp_forms f
                   JOIN public.scp_form_items fi ON fi.form_id = f.id
                  WHERE f.assessment_version_id = av.id)),
    public.scp_grant_permits_assignment(
      _employer_id, d.id, av.content_status, av.validation_status,
      d.is_test_fixture),
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
    AND (NOT d.is_test_fixture OR _may_see_fixtures)
  ORDER BY (av.content_status = 'published') DESC, d.name_sv;
END; $function$;

COMMENT ON FUNCTION public.scp_employer_library(uuid) IS
  'What this organisation may see and run. `assignable` asks '
  'scp_grant_permits_assignment, the same question the assign path asks, so '
  'the library can never again show a programme as un-assignable that the '
  'engine would accept. `governance_mode` says on what basis, so a closed-test '
  'pilot can be presented as runnable AND unvalidated at once.';

REVOKE ALL     ON FUNCTION public.scp_employer_library(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_employer_library(uuid) TO authenticated;

DO $$
BEGIN
  IF pg_get_functiondef('public.scp_employer_library(uuid)'::regprocedure)
       NOT LIKE '%scp_grant_permits_assignment%' THEN
    RAISE EXCEPTION 'SCP_LIBRARY_GOVERNANCE: the library still decides '
      'assignability on its own';
  END IF;
END $$;
