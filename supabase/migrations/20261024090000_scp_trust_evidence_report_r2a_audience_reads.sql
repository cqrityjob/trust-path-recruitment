-- =============================================================================
-- TRUST Evidence Report — PR-R2A audience boundary hardening, PHASE 1 of 2:
-- EXPAND
--
-- Closes the three exposures PR-R0 pinned (R0-X1, R0-X2, R0-X3) at the
-- database, without removing anything the code deployed today still calls.
-- The second phase, 20261025090000 (CONTRACT), withdraws the direct snapshot
-- read once getAcademyReport and the Interview Intelligence bridge have moved
-- to the entry points created here.
--
-- ── THE PRINCIPLE ─────────────────────────────────────────────────────────
--
-- Row-level security on scp_report_snapshots decides WHICH ROW a participant
-- or an employer member may read. It says nothing about which COLUMNS, and
-- `GRANT SELECT ON scp_report_snapshots TO authenticated` covers every
-- column. So the participant's own row handed a direct PostgREST read the
-- internal maturity derivation (`derivation_input`, R0-X1), the employer's
-- row did the same and its brief carried the per-area `mean`/`spread`
-- (R0-X3), and the participant could read their entire evidence ledger row by
-- row -- contribution, confidence, the reviewer's rubric basis and the safety
-- finding and severity the participant document deliberately withholds
-- (R0-X2). None of it is cross-tenant. All of it is data the audience
-- contract says the audience does not receive.
--
-- A field hidden by the frontend is not access control. The fix is that the
-- rows an audience can reach no longer contain the internal fields at all:
-- each audience reads its document through one SECURITY DEFINER entry point
-- that projects exactly the released fields, and the base rows stop being
-- readable by that audience.
--
-- ── WHAT THIS PHASE DOES ──────────────────────────────────────────────────
--
--   1. scp_report_snapshot_readable(audience, subject_id, issuer_org_id)
--      The ONE place the audience rule lives. It is the predicate the two
--      existing row policies have carried since 20260808090000, lifted into a
--      function so that the policies and the entry points below cannot drift
--      apart. The two policies are re-pointed at it, unchanged in meaning.
--
--   2. scp_audience_brief(brief)
--      Pure projection of a stored brief for an audience: strips `mean` and
--      `spread` from every `observed[]` and `self_reported[]` entry, touches
--      nothing else, keeps order, and returns NULL for a pre-brief snapshot.
--      The stored brief is NOT rewritten -- released snapshots are immutable
--      by trigger (20260808090000) and the numbers remain in the row for
--      PR-R1's private manifest. They simply never leave the database again
--      on an audience path.
--
--   3. scp_participant_report(attempt_id) / scp_employer_report(attempt_id)
--      The audience read contracts. Each returns zero or one row: the released
--      document for that audience -- payload, audience brief, context,
--      released_at, the template's limitations -- and nothing internal. The
--      participant document carries `safety_flags = []` structurally (the
--      participant contract has always been a boolean in the context,
--      RA3.2/RA3.3); the employer document carries each finding as
--      {finding, severity, observed_at} and drops `behaviour_version_id`,
--      a bare internal id no surface ever resolved (decision recorded in
--      docs/assessment/architecture/trust-evidence-report-r2a-audience-boundary.md).
--      `derivation_input` is not selected by either.
--
--   4. The participant's direct ledger read is withdrawn (R0-X2): policy
--      scp_evidence_own_select is dropped. No product surface reads the
--      ledger directly (PR-R0 guard G4) and every server routine that does is
--      SECURITY DEFINER, so nothing loses a read path. The reviewer/author
--      read (scp_evidence_author_read, 20260821090000) stays exactly as it is.
--
--   5. Default-privilege leftovers on the report chain's addendum tables.
--      scp_employer_report_decisions (20260820120000) and scp_interview_notes
--      (20260830093000) were created without a table grant, so they carry
--      whatever Supabase's default privileges handed out: on the hosted
--      project that is EVERYTHING to anon and authenticated, and TRUNCATE is
--      not bounded by row-level security nor by the append-only triggers
--      (which fire on UPDATE/DELETE only). Reproduced on a clean replay of
--      this repository: `authenticated` holds TRUNCATE on both tables. Both
--      are revoked to exactly what is used -- SELECT for authenticated,
--      narrowed by the existing member-read policies; every write goes
--      through the SECURITY DEFINER recorders. The same REVOKE-then-regrant
--      is applied to scp_report_snapshots and scp_competency_evidence, whose
--      repository grants name SELECT only but which arrived hosted with the
--      same default set.
--
-- ── WHAT THIS PHASE DOES NOT DO ───────────────────────────────────────────
--
-- It does not revoke the direct SELECT on scp_report_snapshots. The code on
-- main still reads the table through RLS, and withdrawing that here would
-- blank every released report between applying this file and deploying the
-- migrated code. CONTRACT (20261025090000) does it, and refuses to run unless
-- this phase is in place.
--
-- No scoring, maturity, signal, competency, item, threshold, template, report
-- version or stored snapshot changes. scp_release_attempt_report is not
-- touched. The visible report is the same document, minus two numbers that
-- no surface rendered and one id that nothing resolved.
--
-- Deploy order: safe alone; safe before or after the application code that
-- calls the new entry points (which does not merge until this file is
-- recorded applied -- scripts/schema-first-release-check.ts). Rollback:
-- supabase/rollback/20261024090000_scp_trust_evidence_report_r2a_audience_reads_rollback.sql,
-- to be run AFTER the contract rollback.
-- =============================================================================

-- ═══════════════════════════════════════════════════════════════════════════
-- §1  The audience rule, in one place
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
  'audience for the given subject / commissioning organisation. The single '
  'definition of the audience rule: the two row policies on '
  'scp_report_snapshots and the two audience entry points all evaluate this.';

-- Evaluated inside a row policy as the calling role, so authenticated needs
-- EXECUTE (a policy expression checks it; a trigger does not).
REVOKE ALL     ON FUNCTION public.scp_report_snapshot_readable(text, uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_report_snapshot_readable(text, uuid, uuid) TO authenticated;

-- The two policies, re-pointed. Same rows as before, by construction.
DROP POLICY IF EXISTS scp_report_snapshots_own ON public.scp_report_snapshots;
CREATE POLICY scp_report_snapshots_own ON public.scp_report_snapshots
  FOR SELECT TO authenticated
  USING (audience = 'participant'
         AND public.scp_report_snapshot_readable(audience, subject_id, issuer_organization_id));

DROP POLICY IF EXISTS scp_report_snapshots_employer ON public.scp_report_snapshots;
CREATE POLICY scp_report_snapshots_employer ON public.scp_report_snapshots
  FOR SELECT TO authenticated
  USING (audience = 'employer'
         AND public.scp_report_snapshot_readable(audience, subject_id, issuer_organization_id));

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
  'derivation input, no evidence-ledger field, no finding severity. The only '
  'read path a participant client has to a report snapshot.';

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
  'limitations. Contains no derivation input and no internal id. The only '
  'read path an employer client -- the results page and the Interview '
  'Intelligence context bridge -- has to a report snapshot.';

REVOKE ALL     ON FUNCTION public.scp_participant_report(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_participant_report(uuid) TO authenticated;
REVOKE ALL     ON FUNCTION public.scp_employer_report(uuid)    FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_employer_report(uuid)    TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- §4  R0-X2 — the participant's direct ledger read
-- ═══════════════════════════════════════════════════════════════════════════

-- scp_evidence_own_select (20260804061230) let the subject select their own
-- evidence rows in full, and the policy never read disclosure_class -- every
-- row says 'internal_employer'. The participant's report is the audience
-- document; the ledger is the working material behind it. The author read
-- from 20260821090000 stays. No projection is created: no participant surface
-- needs a ledger field (PR-R0 guard G4), and the smallest safe projection of
-- nothing is nothing.
DROP POLICY IF EXISTS scp_evidence_own_select ON public.scp_competency_evidence;

-- ═══════════════════════════════════════════════════════════════════════════
-- §5  Table privileges on the report chain: exactly what is used
-- ═══════════════════════════════════════════════════════════════════════════

-- REVOKE ALL then re-grant, rather than revoking a named list: the inherited
-- set is whatever the default privileges happened to include when the table
-- was created hosted, and a named list silently misses anything else in it.
--
-- scp_report_snapshots keeps SELECT for authenticated in THIS phase because
-- the deployed code reads it directly; CONTRACT removes that.
REVOKE ALL ON public.scp_report_snapshots          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.scp_competency_evidence       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.scp_employer_report_decisions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.scp_interview_notes           FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.scp_report_snapshots          TO authenticated;  -- until CONTRACT
GRANT SELECT ON public.scp_competency_evidence       TO authenticated;  -- author policy
GRANT SELECT ON public.scp_employer_report_decisions TO authenticated;  -- member policy
GRANT SELECT ON public.scp_interview_notes           TO authenticated;  -- member policy

GRANT ALL ON public.scp_report_snapshots          TO service_role;
GRANT ALL ON public.scp_competency_evidence       TO service_role;
GRANT ALL ON public.scp_employer_report_decisions TO service_role;
GRANT ALL ON public.scp_interview_notes           TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- §6  Proof, at apply time
-- ═══════════════════════════════════════════════════════════════════════════

DO $proof$
DECLARE
  _fn text;
  _stripped jsonb;
  _priv text;
BEGIN
  -- The four routines exist with the expected security posture.
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

  -- The row policies evaluate the shared predicate and the subject's ledger
  -- policy is gone.
  IF (SELECT count(*) FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'scp_report_snapshots'
         AND policyname IN ('scp_report_snapshots_own', 'scp_report_snapshots_employer')
         AND qual LIKE '%scp_report_snapshot_readable%') <> 2 THEN
    RAISE EXCEPTION 'SCP_R2A_EXPAND_PROOF: the snapshot row policies do not evaluate scp_report_snapshot_readable';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
              AND tablename = 'scp_competency_evidence' AND policyname = 'scp_evidence_own_select') THEN
    RAISE EXCEPTION 'SCP_R2A_EXPAND_PROOF: scp_evidence_own_select survived';
  END IF;

  -- anon holds nothing, authenticated holds SELECT and only SELECT, on the four.
  FOR _fn IN SELECT unnest(ARRAY['scp_report_snapshots', 'scp_competency_evidence',
                                 'scp_employer_report_decisions', 'scp_interview_notes']) LOOP
    IF EXISTS (SELECT 1 FROM information_schema.table_privileges
                WHERE table_schema = 'public' AND table_name = _fn
                  AND grantee IN ('anon', 'PUBLIC')) THEN
      RAISE EXCEPTION 'SCP_R2A_EXPAND_PROOF: anon/PUBLIC still holds a privilege on %', _fn;
    END IF;
    SELECT string_agg(privilege_type, ',' ORDER BY privilege_type) INTO _priv
      FROM information_schema.table_privileges
     WHERE table_schema = 'public' AND table_name = _fn AND grantee = 'authenticated';
    IF _priv IS DISTINCT FROM 'SELECT' THEN
      RAISE EXCEPTION 'SCP_R2A_EXPAND_PROOF: authenticated holds [%] on %, expected SELECT only', _priv, _fn;
    END IF;
  END LOOP;
END
$proof$;
