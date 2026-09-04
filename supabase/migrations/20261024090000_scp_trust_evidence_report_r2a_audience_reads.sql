-- =============================================================================
-- TRUST Evidence Report — PR-R2A-1: EXPAND
--
-- The first of three independently deployable steps that close the audience
-- exposures PR-R0 pinned (R0-X1, R0-X2, R0-X3):
--
--   PR-R2A-1  EXPAND      this file. Adds the audience read contracts. Removes
--                         nothing. The application on main today is unaffected.
--   PR-R2A-2  CUTOVER     application code: getAcademyReport and the Interview
--                         Intelligence bridge read through the contracts.
--   PR-R2A-3  CONTRACT    only once R2A-2 is live: withdraws the direct
--                         snapshot read, drops the subject's ledger policy,
--                         re-points the row policies at the shared predicate
--                         and closes the default-privilege leftovers.
--
-- ── THE PRINCIPLE ─────────────────────────────────────────────────────────
--
-- Row-level security on scp_report_snapshots decides WHICH ROW a participant
-- or an employer member may read. It says nothing about which COLUMNS, and
-- `GRANT SELECT ON scp_report_snapshots TO authenticated` covers every one.
-- So today the participant's own row hands a direct PostgREST read the
-- internal maturity derivation (`derivation_input`, R0-X1), the employer's
-- row does the same and its brief carries the per-area `mean`/`spread`
-- (R0-X3), and the participant can read their whole evidence ledger (R0-X2).
-- A field the frontend does not select is not access control. The fix is
-- that each audience reads its document through ONE server-side projection
-- of exactly the released fields -- and, in R2A-3, that the base rows stop
-- being readable by that audience at all.
--
-- ── WHAT THIS FILE DOES ───────────────────────────────────────────────────
--
--   1. scp_report_snapshot_readable(audience, subject_id, issuer_org_id)
--      The audience rule as a function: verbatim the predicates the two row
--      policies have carried since 20260808090000. The policies themselves
--      are NOT touched here; R2A-3 re-points them so that policies and entry
--      points evaluate one definition. Until then the function and the
--      policies are two copies of the same text, and TR13 asserts they agree.
--
--   2. scp_audience_brief(brief)
--      Pure projection of a stored brief for an audience: strips `mean` and
--      `spread` from every `observed[]` and `self_reported[]` entry, touches
--      nothing else, keeps order, NULL in NULL out. The stored brief is never
--      rewritten -- released snapshots are immutable by trigger and PR-R1's
--      private manifest needs the numbers.
--
--   3. scp_participant_report(attempt_id) / scp_employer_report(attempt_id)
--      The audience read contracts. Each returns zero or one row: the
--      released document for that audience -- payload, audience brief,
--      context, released_at, template limitations, ids -- and nothing
--      internal. No derivation_input. The participant document carries
--      `safety_flags = []` structurally (its contract has always been the
--      boolean in the context, RA3.2/RA3.3); the employer document carries
--      each finding as {finding, severity, observed_at} and withholds
--      `behaviour_version_id`, a bare internal id no surface ever resolved
--      (decision: internal traceability, for the manifest).
--
-- ── WHAT THIS FILE DOES NOT DO ────────────────────────────────────────────
--
-- It grants nothing new to any audience beyond EXECUTE on the two entry
-- points, and it revokes nothing. The direct SELECT on scp_report_snapshots,
-- the policy scp_evidence_own_select and every table grant stay exactly as
-- they are, so the code deployed today keeps working unchanged. It changes no
-- scoring, maturity, signal, competency, item, threshold, template, report
-- version, stored row or release function. Safe to apply on its own, and safe
-- to leave applied indefinitely.
--
-- Rollback: supabase/rollback/20261024090000_scp_trust_evidence_report_r2a_audience_reads_rollback.sql
-- (drops the four functions; refuses while R2A-3's policies depend on them).
-- =============================================================================

-- ═══════════════════════════════════════════════════════════════════════════
-- §1  The audience rule, as a function
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.scp_report_snapshot_readable(
  _audience text,
  _subject_id uuid,
  _issuer_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  -- Verbatim the predicates of scp_report_snapshots_own and
  -- scp_report_snapshots_employer (20260808090000). A participant reads their
  -- OWN participant document; an active member of the commissioning
  -- organisation reads that organisation's employer document. Anything else,
  -- including an unknown audience, is false.
  SELECT CASE _audience
    WHEN 'participant' THEN EXISTS (
      SELECT 1 FROM public.scp_subject_identities si
       WHERE si.subject_id = _subject_id
         AND si.user_id = auth.uid())
    WHEN 'employer' THEN
      _issuer_organization_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.employer_memberships m
         WHERE m.employer_id = _issuer_organization_id
           AND m.user_id = auth.uid()
           AND m.status = 'active')
    ELSE false
  END;
$$;

COMMENT ON FUNCTION public.scp_report_snapshot_readable(text, uuid, uuid) IS
  'Whether the calling user may read the report document of the given '
  'audience for the given subject / commissioning organisation. Evaluated by '
  'the two audience entry points; PR-R2A-3 re-points the two row policies on '
  'scp_report_snapshots at it as well, so the rule has one definition.';

-- Granted to authenticated now because R2A-3 will evaluate it inside a row
-- policy as the calling role (a policy expression checks EXECUTE).
REVOKE ALL     ON FUNCTION public.scp_report_snapshot_readable(text, uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_report_snapshot_readable(text, uuid, uuid) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- §2  The audience projection of a brief
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.scp_audience_brief(_brief jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = public, pg_temp
AS $$
  -- `mean` and `spread` are the per-area numbers the signal was derived from.
  -- They are an input to the released word label, not a released fact, and
  -- the employer type has said "never rendered" since 20260830093000. Every
  -- other key -- modules, coverage, pace, executive summary, interview guide,
  -- why lines, signals, patterns, item counts -- passes through untouched.
  SELECT _brief
    || CASE WHEN jsonb_typeof(_brief -> 'observed') = 'array' THEN
         jsonb_build_object('observed', (
           SELECT coalesce(jsonb_agg(o.value - 'mean' - 'spread' ORDER BY o.ordinality), '[]'::jsonb)
             FROM jsonb_array_elements(_brief -> 'observed') WITH ORDINALITY o))
       ELSE '{}'::jsonb END
    || CASE WHEN jsonb_typeof(_brief -> 'self_reported') = 'array' THEN
         jsonb_build_object('self_reported', (
           SELECT coalesce(jsonb_agg(r.value - 'mean' - 'spread' ORDER BY r.ordinality), '[]'::jsonb)
             FROM jsonb_array_elements(_brief -> 'self_reported') WITH ORDINALITY r))
       ELSE '{}'::jsonb END;
$$;

COMMENT ON FUNCTION public.scp_audience_brief(jsonb) IS
  'A stored candidate brief as an audience receives it: identical, except '
  'that every observed and self-reported area loses its internal mean and '
  'spread. Pure; NULL in, NULL out. The stored brief is never rewritten.';

-- Pure and harmless, but nothing outside the entry points needs it.
REVOKE ALL ON FUNCTION public.scp_audience_brief(jsonb) FROM PUBLIC, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- §3  The audience read contracts
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.scp_participant_report(_attempt_id uuid)
RETURNS TABLE (
  id uuid,
  attempt_id uuid,
  subject_id uuid,
  audience text,
  released_at timestamptz,
  payload jsonb,
  brief jsonb,
  safety_flags jsonb,
  context jsonb,
  limitations_sv text[],
  limitations_en text[])
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  -- The participant document and nothing else. No derivation_input, no
  -- employer document, no ledger. safety_flags is [] by contract: the
  -- participant is told that a concern exists (context.safety_concern_present)
  -- and never its severity (RA3.2, RA3.3). Zero rows when the caller is not
  -- the subject -- indistinguishable from "not released", as the row policy
  -- has always made it.
  SELECT s.id, s.attempt_id, s.subject_id, s.audience, s.released_at,
         s.payload,
         public.scp_audience_brief(s.brief),
         '[]'::jsonb,
         s.context,
         v.limitations_sv, v.limitations_en
    FROM public.scp_report_snapshots s
    JOIN public.scp_report_versions v ON v.id = s.report_version_id
   WHERE s.attempt_id = _attempt_id
     AND s.audience = 'participant'
     AND public.scp_report_snapshot_readable('participant', s.subject_id, s.issuer_organization_id);
$$;

COMMENT ON FUNCTION public.scp_participant_report(uuid) IS
  'The participant''s own released report for an attempt: payload, audience '
  'brief, context, release time and template limitations. Contains no '
  'derivation input, no evidence-ledger field, no finding severity. From '
  'PR-R2A-2 the only read path a participant client has to a report snapshot.';

CREATE OR REPLACE FUNCTION public.scp_employer_report(_attempt_id uuid)
RETURNS TABLE (
  id uuid,
  attempt_id uuid,
  subject_id uuid,
  audience text,
  released_at timestamptz,
  payload jsonb,
  brief jsonb,
  safety_flags jsonb,
  context jsonb,
  limitations_sv text[],
  limitations_en text[])
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  -- The employer document as released, minus what is internal: no
  -- derivation_input, no mean/spread on any area, and each human finding as
  -- {finding, severity, observed_at} -- the behaviour_version_id the release
  -- function stored beside it is traceability for the private manifest
  -- (PR-R1), not employer report data. subject_id is the pseudonymous
  -- subject, as the row has always carried it; resolving it to a person still
  -- needs scp_resolve_participant_identity. Zero rows for any other
  -- organisation or for a non-member.
  SELECT s.id, s.attempt_id, s.subject_id, s.audience, s.released_at,
         s.payload,
         public.scp_audience_brief(s.brief),
         (SELECT coalesce(jsonb_agg(jsonb_build_object(
                    'finding',     f.value -> 'finding',
                    'severity',    f.value -> 'severity',
                    'observed_at', f.value -> 'observed_at')
                  ORDER BY f.ordinality), '[]'::jsonb)
            FROM jsonb_array_elements(s.safety_flags) WITH ORDINALITY f),
         s.context,
         v.limitations_sv, v.limitations_en
    FROM public.scp_report_snapshots s
    JOIN public.scp_report_versions v ON v.id = s.report_version_id
   WHERE s.attempt_id = _attempt_id
     AND s.audience = 'employer'
     AND public.scp_report_snapshot_readable('employer', s.subject_id, s.issuer_organization_id);
$$;

COMMENT ON FUNCTION public.scp_employer_report(uuid) IS
  'The commissioning organisation''s released employer report for an '
  'attempt: payload, audience brief (no mean/spread), findings as '
  '{finding, severity, observed_at}, context, release time and template '
  'limitations. Contains no derivation input and no internal id. From '
  'PR-R2A-2 the only read path an employer client -- the results page and the '
  'Interview Intelligence context bridge -- has to a report snapshot.';

REVOKE ALL     ON FUNCTION public.scp_participant_report(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_participant_report(uuid) TO authenticated;
REVOKE ALL     ON FUNCTION public.scp_employer_report(uuid)    FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_employer_report(uuid)    TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- §4  Proof, at apply time
-- ═══════════════════════════════════════════════════════════════════════════

DO $proof$
DECLARE
  _fn text;
  _stripped jsonb;
BEGIN
  -- The three definer routines exist with the expected posture; none is
  -- reachable by anon (Supabase's function default would have granted it).
  FOR _fn IN SELECT unnest(ARRAY['scp_report_snapshot_readable',
                                 'scp_participant_report',
                                 'scp_employer_report']) LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                    WHERE n.nspname = 'public' AND p.proname = _fn AND p.prosecdef
                      AND EXISTS (SELECT 1 FROM unnest(p.proconfig) c
                                   WHERE c LIKE 'search_path=%')) THEN
      RAISE EXCEPTION 'SCP_R2A_EXPAND_PROOF: %() is missing, not SECURITY DEFINER, or has no pinned search_path', _fn;
    END IF;
    IF has_function_privilege('anon', ('public.' || _fn ||
         CASE _fn WHEN 'scp_report_snapshot_readable' THEN '(text,uuid,uuid)' ELSE '(uuid)' END)::regprocedure,
         'EXECUTE') THEN
      RAISE EXCEPTION 'SCP_R2A_EXPAND_PROOF: anon can execute %()', _fn;
    END IF;
  END LOOP;
  IF has_function_privilege('anon', 'public.scp_audience_brief(jsonb)'::regprocedure, 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.scp_audience_brief(jsonb)'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'SCP_R2A_EXPAND_PROOF: scp_audience_brief is reachable outside the entry points';
  END IF;

  -- The projection strips exactly mean/spread, keeps order and everything else.
  _stripped := public.scp_audience_brief(jsonb_build_object(
    'brief_version', 'rab-v1',
    'observed', jsonb_build_array(
      jsonb_build_object('area_code', 'b', 'signal', 'developing', 'mean', 0.41, 'spread', 0.2, 'items', 4),
      jsonb_build_object('area_code', 'a', 'signal', 'mixed', 'mean', 0.5, 'spread', 0.83, 'items', 3)),
    'self_reported', jsonb_build_array(
      jsonb_build_object('domain_key', 'x', 'pattern', 'mostly_described', 'mean', 2.1, 'spread', 0.4)),
    'coverage', jsonb_build_object('observed_observations', 7)));
  IF _stripped::text LIKE '%mean%' OR _stripped::text LIKE '%spread%'
     OR _stripped -> 'observed' -> 0 ->> 'area_code' <> 'b'
     OR _stripped -> 'observed' -> 1 ->> 'signal' <> 'mixed'
     OR (_stripped -> 'observed' -> 1 ->> 'items')::int <> 3
     OR _stripped -> 'self_reported' -> 0 ->> 'pattern' <> 'mostly_described'
     OR _stripped ->> 'brief_version' <> 'rab-v1'
     OR (_stripped -> 'coverage' ->> 'observed_observations')::int <> 7 THEN
    RAISE EXCEPTION 'SCP_R2A_EXPAND_PROOF: scp_audience_brief changed more or less than mean/spread: %', _stripped;
  END IF;
  IF public.scp_audience_brief(NULL) IS NOT NULL
     OR public.scp_audience_brief('{"modules": []}'::jsonb) <> '{"modules": []}'::jsonb THEN
    RAISE EXCEPTION 'SCP_R2A_EXPAND_PROOF: scp_audience_brief must pass NULL and a brief without areas through unchanged';
  END IF;

  -- Nothing the deployed application relies on has moved: the direct read,
  -- the two row policies and the subject's ledger policy are all still there.
  IF NOT has_table_privilege('authenticated', 'public.scp_report_snapshots', 'SELECT') THEN
    RAISE EXCEPTION 'SCP_R2A_EXPAND_PROOF: EXPAND must not withdraw the direct snapshot read (that is R2A-3)';
  END IF;
  IF (SELECT count(*) FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'scp_report_snapshots'
         AND policyname IN ('scp_report_snapshots_own', 'scp_report_snapshots_employer')) <> 2
     OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
                     AND tablename = 'scp_competency_evidence' AND policyname = 'scp_evidence_own_select') THEN
    RAISE EXCEPTION 'SCP_R2A_EXPAND_PROOF: EXPAND must leave every existing policy in place (that is R2A-3)';
  END IF;
END
$proof$;
