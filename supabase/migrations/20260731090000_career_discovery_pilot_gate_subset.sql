-- Career Discovery — a real pilot gate, distinct from full activation.
--
-- ADDITIVE AND BEHAVIOUR-PRESERVING FOR 'active'. No gate is cleared here, no
-- lifecycle_status is changed, and no production data is touched. This migration
-- changes only what the guard REQUIRES, and only for 'pilot'.
--
-- ── THE PROBLEM THIS SOLVES ────────────────────────────────────────────
--
-- cd_guard_session_administrable required ALL SEVEN review gates for both
-- 'pilot' and 'active'. That made 'pilot' unreachable in practice: several
-- gates — psychometric review against real response distributions, bias review
-- against real selection rates — CANNOT be satisfied before a pilot, because
-- the pilot is what produces the evidence they need.
--
-- A control that can only be satisfied after the thing it gates is not a
-- control. It is an invitation to clear gates dishonestly to get moving, which
-- is far worse than having no gate at all.
--
-- ── THE FIX ────────────────────────────────────────────────────────────
--
-- Two named sets, both explicit in the database rather than in a comment:
--
--   PILOT  requires the gates that must hold before ANY real person is
--          exposed to the instrument — the ones a pilot cannot retroactively
--          make safe.
--   ACTIVE continues to require all seven, unchanged.
--
-- Unresolved gates stay visible in review_status and stay false. Nothing is
-- silently cleared, and a gate outstanding at pilot still blocks 'active'.
--
-- ── WHY THESE FOUR ARE MANDATORY FOR PILOT ─────────────────────────────
--
--   content_review        A participant reads the questions. Wording that has
--                         not been approved cannot be un-shown afterwards.
--   language_review       Both languages are administered from day one; an
--                         unreviewed translation is an unreviewed instrument.
--   privacy_legal_review  Real answers from real people are stored. Consent,
--                         retention and lawful basis must be settled BEFORE
--                         collection, never after.
--   accessibility_review  A pilot that excludes participants who use a screen
--                         reader produces biased data AND a discriminatory
--                         experience. Not fixable in hindsight.
--
-- ── WHY THE OTHER THREE ARE NOT MANDATORY FOR PILOT ────────────────────
--
--   psychometric_review   Needs real response distributions. That is the
--                         pilot's purpose.
--   bias_review           The §7 exit criteria are measured ON pilot data.
--   sme_review            Practitioner review is scheduled to run alongside
--                         the pilot; its absence does not endanger a
--                         participant, and pilot output is explicitly
--                         provisional.
--
-- All three remain false, remain visible, and remain mandatory for 'active'.

-- =========================================================================
-- 1. The two gate sets, as data
-- =========================================================================

CREATE OR REPLACE FUNCTION public.cd_mandatory_gates(_lifecycle_status text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE _lifecycle_status
    WHEN 'pilot' THEN ARRAY[
      'content_review', 'language_review', 'privacy_legal_review', 'accessibility_review']
    WHEN 'active' THEN ARRAY[
      'content_review', 'language_review', 'privacy_legal_review', 'accessibility_review',
      'sme_review', 'bias_review', 'psychometric_review']
    ELSE ARRAY[]::text[]
  END;
$$;

COMMENT ON FUNCTION public.cd_mandatory_gates(text) IS
  'Review gates that must be cleared for a lifecycle status. pilot requires the '
  'four that cannot be made safe retroactively; active requires all seven.';

-- =========================================================================
-- 2. Enforcement
-- =========================================================================
--
-- Replaces only the gate-counting tail of the guard. Every other branch —
-- design refusal, internal_test authorisation, the is_internal_test rules —
-- is reproduced verbatim so this migration cannot quietly relax one of them.

CREATE OR REPLACE FUNCTION public.cd_guard_session_requires_administrable_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _status       text;
  _gates        jsonb;
  _internal_ok  boolean;
  _missing      text[];
BEGIN
  SELECT lifecycle_status, review_status INTO _status, _gates
    FROM public.cd_definition_versions
   WHERE id = NEW.definition_version_id;

  IF _status IS NULL THEN
    RAISE EXCEPTION 'CD_DEFINITION_VERSION_MISSING: %', NEW.definition_version_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF _status = 'design' THEN
    RAISE EXCEPTION
      'CD_VERSION_NOT_ADMINISTRABLE: lifecycle_status is design; no session may be created against it'
      USING ERRCODE = 'check_violation';
  END IF;

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
    -- Internal testing deliberately runs BEFORE the review gates, which is
    -- the point of it; the participants are named and informed.
    RETURN NEW;
  END IF;

  IF _status NOT IN ('pilot', 'active') THEN
    RAISE EXCEPTION
      'CD_VERSION_NOT_ADMINISTRABLE: lifecycle_status is %, must be pilot or active before a candidate session may be created',
      _status USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.is_internal_test THEN
    RAISE EXCEPTION
      'CD_INTERNAL_TEST_FLAG_ON_CANDIDATE_SESSION: is_internal_test is reserved for internal_test versions'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The change: gates required for THIS status, named individually in the
  -- error so an operator is told exactly what is missing rather than a count.
  SELECT array_agg(gate ORDER BY gate) INTO _missing
    FROM unnest(public.cd_mandatory_gates(_status)) AS gate
   WHERE COALESCE(_gates -> gate, 'false'::jsonb) <> 'true'::jsonb;

  IF _missing IS NOT NULL AND array_length(_missing, 1) > 0 THEN
    RAISE EXCEPTION
      'CD_REVIEW_GATES_OUTSTANDING: % gate(s) required for % are not cleared: %',
      array_length(_missing, 1), _status, array_to_string(_missing, ', ')
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END; $$;

-- =========================================================================
-- 3. Self-verification
-- =========================================================================
--
-- Asserts the SETS, not the behaviour of any particular definition version,
-- so this passes identically on a clean replay and against Cloud.

DO $$
DECLARE _pilot text[]; _active text[];
BEGIN
  _pilot  := public.cd_mandatory_gates('pilot');
  _active := public.cd_mandatory_gates('active');

  IF array_length(_pilot, 1) <> 4 THEN
    RAISE EXCEPTION 'pilot must require exactly 4 gates, found %', array_length(_pilot, 1);
  END IF;
  IF array_length(_active, 1) <> 7 THEN
    RAISE EXCEPTION 'active must still require all 7 gates, found %', array_length(_active, 1);
  END IF;

  -- Every pilot gate must also be an active gate: pilot may narrow the set,
  -- never introduce a requirement active does not have.
  IF EXISTS (SELECT 1 FROM unnest(_pilot) g WHERE g <> ALL (_active)) THEN
    RAISE EXCEPTION 'pilot requires a gate that active does not — the sets have diverged';
  END IF;

  IF 'privacy_legal_review' <> ALL (_pilot) THEN
    RAISE EXCEPTION 'privacy_legal_review must be mandatory for pilot';
  END IF;
  IF 'accessibility_review' <> ALL (_pilot) THEN
    RAISE EXCEPTION 'accessibility_review must be mandatory for pilot';
  END IF;

  RAISE NOTICE 'Career Discovery pilot gate subset installed: pilot=% active=%',
    array_length(_pilot, 1), array_length(_active, 1);
END $$;
