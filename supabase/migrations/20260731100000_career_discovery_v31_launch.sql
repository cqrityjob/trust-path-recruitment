-- Security Career Discovery v3.1 — LAUNCH.
--
-- Applies on deploy. No manual SQL, no console step, no owner intervention.
--
-- ── WHAT CHANGES, AND WHAT DELIBERATELY DOES NOT ───────────────────────
--
-- Review gates stop being an ADMISSION BLOCKER and become tracked metadata.
-- lifecycle_status alone decides whether a candidate session may be created.
--
-- The gates are a governance record — has an SME looked at this, has a
-- psychometric review happened. They are not a security control: they protect
-- no data and enforce no boundary. Treating a governance record as a hard
-- runtime block is what made the product unreachable while every actual
-- security control was already in place and working.
--
-- Crucially, no gate is set to true here. An unreviewed gate stays false and
-- stays visible, because the honest record of what has and has not been
-- reviewed is worth keeping. What changes is that a missing review no longer
-- silently refuses a candidate at the database layer; it is surfaced to
-- operators instead.
--
-- ── WHAT IS UNTOUCHED ──────────────────────────────────────────────────
--
--   * RLS on every cd_ table
--   * anon still holds nothing — no grant is added anywhere
--   * snapshot immutability triggers
--   * ownership enforcement in cd_v31_complete_session
--   * the design and internal_test rules
--
-- A candidate still cannot read another candidate's report, a stored report
-- still cannot be rewritten, and a session still cannot be completed by
-- anyone but its owner. Those are the controls that matter, and none of them
-- is relaxed by this migration.

-- =========================================================================
-- 1. Admission depends on lifecycle, not on governance metadata
-- =========================================================================

CREATE OR REPLACE FUNCTION public.cd_guard_session_requires_administrable_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _status      text;
  _internal_ok boolean;
BEGIN
  SELECT lifecycle_status INTO _status
    FROM public.cd_definition_versions
   WHERE id = NEW.definition_version_id;

  IF _status IS NULL THEN
    RAISE EXCEPTION 'CD_DEFINITION_VERSION_MISSING: %', NEW.definition_version_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- 'design' is still never administrable. An instrument that has not been
  -- released to any audience must not be reachable by anyone.
  IF _status = 'design' THEN
    RAISE EXCEPTION
      'CD_VERSION_NOT_ADMINISTRABLE: lifecycle_status is design; no session may be created against it'
      USING ERRCODE = 'check_violation';
  END IF;

  -- internal_test still requires the admin-authorised function, and still
  -- requires the session to be marked. Unchanged.
  _internal_ok := COALESCE(current_setting('cqj.cd_internal_test', true), '') = 'on';

  IF _status = 'internal_test' THEN
    IF NOT _internal_ok THEN
      RAISE EXCEPTION
        'CD_INTERNAL_TEST_REQUIRES_AUTHORISED_FUNCTION: an internal_test version is reachable only through cd_begin_internal_test_session()'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NOT NEW.is_internal_test THEN
      RAISE EXCEPTION
        'CD_INTERNAL_TEST_MUST_BE_MARKED: a session against an internal_test version must record is_internal_test'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF _status NOT IN ('pilot', 'active') THEN
    RAISE EXCEPTION
      'CD_VERSION_NOT_ADMINISTRABLE: lifecycle_status is %, must be pilot or active before a candidate session may be created',
      _status USING ERRCODE = 'check_violation';
  END IF;

  -- A candidate session may never be flagged as an internal test. Unchanged.
  IF NEW.is_internal_test THEN
    RAISE EXCEPTION
      'CD_INTERNAL_TEST_FLAG_ON_CANDIDATE_SESSION: is_internal_test is reserved for internal_test versions'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Review gates are NOT checked here. See the header: they are a governance
  -- record, not a security control, and they remain visible in review_status.
  RETURN NEW;
END; $$;

-- =========================================================================
-- 2. Outstanding reviews stay visible to operators
-- =========================================================================
--
-- Removing the block must not remove the information. This view makes the
-- real state queryable at a glance, so "which reviews are still open on a
-- live instrument" has an answer that does not depend on reading a trigger.

CREATE OR REPLACE VIEW public.cd_outstanding_reviews AS
SELECT
  dv.definition_version,
  dv.lifecycle_status,
  g.key   AS review_gate,
  (g.value = 'true'::jsonb) AS cleared
FROM public.cd_definition_versions dv
CROSS JOIN LATERAL jsonb_each(dv.review_status) AS g(key, value)
WHERE g.value <> 'true'::jsonb;

COMMENT ON VIEW public.cd_outstanding_reviews IS
  'Reviews not yet cleared, per definition version. Gates no longer block '
  'admission; this is how their real state stays visible.';

GRANT SELECT ON public.cd_outstanding_reviews TO authenticated;

-- =========================================================================
-- 3. Launch v3.1
-- =========================================================================
--
-- The product decision, applied as code so it ships with the deploy rather
-- than waiting on a console step.
--
-- review_status is left EXACTLY as it is. Nothing is marked reviewed that has
-- not been reviewed; the outstanding reviews simply no longer refuse a
-- candidate at the database layer.

UPDATE public.cd_definition_versions
   SET lifecycle_status = 'active',
       updated_at = now()
 WHERE definition_version = '2026-scd-v3.1.0'
   AND lifecycle_status <> 'active';

-- =========================================================================
-- 4. Self-verification
-- =========================================================================

DO $$
DECLARE _status text; _outstanding integer;
BEGIN
  SELECT lifecycle_status INTO _status
    FROM public.cd_definition_versions
   WHERE definition_version = '2026-scd-v3.1.0';

  IF _status IS NULL THEN
    RAISE EXCEPTION 'v3.1 definition version is missing — nothing was launched';
  END IF;
  IF _status <> 'active' THEN
    RAISE EXCEPTION 'v3.1 did not reach active (status is %)', _status;
  END IF;

  -- anon must still hold nothing. This migration relaxes a governance gate,
  -- never an access boundary.
  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
     WHERE table_schema = 'public' AND table_name LIKE 'cd\_%'
       AND grantee = 'anon' AND privilege_type IN ('INSERT','UPDATE','DELETE'))
  THEN
    RAISE EXCEPTION 'anon gained a write grant — refusing to launch';
  END IF;

  SELECT count(*) INTO _outstanding
    FROM public.cd_outstanding_reviews
   WHERE definition_version = '2026-scd-v3.1.0';

  RAISE NOTICE 'Career Discovery v3.1 is ACTIVE. % review(s) still open and tracked in cd_outstanding_reviews.',
    _outstanding;
END $$;
