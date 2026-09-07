-- =============================================================================
-- TRUST Evidence Report — PR-R2A-2 hotfix: report-version continuity.
--
-- Restores availability of 16 released reports that the audience read
-- contracts stopped returning. Changes nothing else: no policy, no grant, no
-- audience predicate, no stored row, no scoring, no maturity, no competency,
-- no report content. It replaces two function bodies and introduces no object.
--
-- ── THE DEFECT, AS PROVEN ON PRODUCTION ───────────────────────────────────
--
-- Attempt b9ff051d-c3fe-486e-bee4-cfb2e9ba1e98: the candidate's history said
-- "Resultat tillgängligt" and offered the report, while the report route said
-- it was not available yet. Authenticated diagnosis on wrygicdfxwjnrugduxnt:
--
--   scp_participant_report(attempt)          -> 0 rows
--   direct read of scp_report_snapshots      -> 1 row
--   snapshot 250fa604-2ddb-46e0-bb66-6ebaf72d0708 is released and correctly
--   owned; its report_version_id d0ddaa61-2ede-4036-81a8-9555eb49338c has no
--   row in scp_report_versions.
--
-- 20261024090000 wrote both entry points with an INNER JOIN onto
-- scp_report_versions, purely to carry the template's limitation lines. A
-- snapshot whose template row is absent therefore vanished from the result,
-- and getAcademyReport rendered that as "not released". The report was never
-- lost and was never exposed: it was withheld.
--
-- ── WHY THE TEMPLATE ROWS ARE ABSENT ──────────────────────────────────────
--
-- scp_report_versions.id is `DEFAULT gen_random_uuid()` and every seeding
-- migration inserts WITHOUT an explicit id (20260808100000, 20260820100000).
-- The same logical template therefore has a DIFFERENT uuid in every database
-- built from this history. The snapshots predate the 2026-08-29 runtime
-- cutover and carry the retired project's ids, while this project's template
-- rows were created fresh by replaying the migrations. A data-only restore
-- does not enforce foreign keys, so the references survived the copy while
-- their targets did not.
--
-- It is NOT: a deleted template (no migration deletes one), an incomplete
-- backfill, or the release path (see below).
--
-- ── NOTHING NEW CAN BECOME ORPHANED ───────────────────────────────────────
--
-- scp_release_attempt_report SELECTS an existing published row and stores its
-- id, so it cannot mint a dangling reference; the foreign key on
-- scp_report_snapshots.report_version_id is enforced for every ordinary
-- INSERT; ON DELETE RESTRICT refuses to remove a template a snapshot still
-- points at; and the immutability trigger refuses to repoint a released
-- snapshot. The orphans could only arrive through a restore that bypassed
-- triggers. supabase/tests/scp_trust_evidence_report_r2a_continuity_test.sql
-- proves each of those four statements.
--
-- ── THE FIX ───────────────────────────────────────────────────────────────
--
-- LEFT JOIN instead of INNER JOIN, and coalesce the two limitation arrays to
-- empty. The template is a decoration on the audience document, not its
-- authorisation and not its content: every field a reader sees comes from the
-- snapshot itself. Provenance is NOT invented and NOT lost -- the snapshot's
-- own context still records report_key and report_version, so the document
-- still says which template produced it even when that template's row is
-- gone. What an affected historical report loses is the limitation TEXT,
-- which is why the missing rows are reported to the Product Owner as a
-- separate, optional data question rather than reconstructed here. No
-- historical version row is fabricated by this migration.
--
-- Everything else in both functions is byte-identical to 20261024090000: the
-- same audience predicate, the same mean/spread stripping, the same withheld
-- behaviour_version_id, the same absent derivation_input, the same grants.
-- =============================================================================

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
  --
  -- LEFT JOIN: a released report stays readable by the person it is about
  -- even when its template row is missing (see the migration header). The
  -- template contributes limitation lines and nothing else.
  SELECT s.id, s.attempt_id, s.subject_id, s.audience, s.released_at,
         s.payload,
         public.scp_audience_brief(s.brief),
         '[]'::jsonb,
         s.context,
         coalesce(v.limitations_sv, ARRAY[]::text[]),
         coalesce(v.limitations_en, ARRAY[]::text[])
    FROM public.scp_report_snapshots s
    LEFT JOIN public.scp_report_versions v ON v.id = s.report_version_id
   WHERE s.attempt_id = _attempt_id
     AND s.audience = 'participant'
     AND public.scp_report_snapshot_readable('participant', s.subject_id, s.issuer_organization_id);
$$;

COMMENT ON FUNCTION public.scp_participant_report(uuid) IS
  'The participant''s own released report for an attempt: payload, audience '
  'brief, context, release time and template limitations. Contains no '
  'derivation input, no evidence-ledger field, no finding severity. The only '
  'read path a participant client has to a report snapshot. A missing '
  'template row yields empty limitation arrays rather than withholding the '
  'report.';

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
  --
  -- LEFT JOIN for the same reason as the participant contract above.
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
         coalesce(v.limitations_sv, ARRAY[]::text[]),
         coalesce(v.limitations_en, ARRAY[]::text[])
    FROM public.scp_report_snapshots s
    LEFT JOIN public.scp_report_versions v ON v.id = s.report_version_id
   WHERE s.attempt_id = _attempt_id
     AND s.audience = 'employer'
     AND public.scp_report_snapshot_readable('employer', s.subject_id, s.issuer_organization_id);
$$;

COMMENT ON FUNCTION public.scp_employer_report(uuid) IS
  'The commissioning organisation''s released employer report for an '
  'attempt: payload, audience brief (no mean/spread), findings as '
  '{finding, severity, observed_at}, context, release time and template '
  'limitations. Contains no derivation input and no internal id. The only '
  'read path an employer client has to a report snapshot. A missing template '
  'row yields empty limitation arrays rather than withholding the report.';

-- The grants are unchanged by CREATE OR REPLACE, but restated so that the
-- posture is visible in this file and cannot drift if the functions are ever
-- recreated from it alone.
REVOKE ALL     ON FUNCTION public.scp_participant_report(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_participant_report(uuid) TO authenticated;
REVOKE ALL     ON FUNCTION public.scp_employer_report(uuid)    FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_employer_report(uuid)    TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- Proof, at apply time
-- ═══════════════════════════════════════════════════════════════════════════

DO $proof$
DECLARE _fn text; _orphans int;
BEGIN
  -- Both entry points still definer, still pinned, still gated on the shared
  -- audience predicate, still unreachable by anon.
  FOR _fn IN SELECT unnest(ARRAY['scp_participant_report','scp_employer_report']) LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                    WHERE n.nspname = 'public' AND p.proname = _fn AND p.prosecdef
                      AND p.prosrc LIKE '%scp_report_snapshot_readable%'
                      AND p.prosrc LIKE '%LEFT JOIN public.scp_report_versions%'
                      AND EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%')) THEN
      RAISE EXCEPTION 'SCP_R2A_CONTINUITY_PROOF: %() is not a pinned SECURITY DEFINER left-joining the template while still gating on the audience predicate', _fn;
    END IF;
    IF has_function_privilege('anon', ('public.' || _fn || '(uuid)')::regprocedure, 'EXECUTE') THEN
      RAISE EXCEPTION 'SCP_R2A_CONTINUITY_PROOF: anon can execute %()', _fn;
    END IF;
    IF NOT has_function_privilege('authenticated', ('public.' || _fn || '(uuid)')::regprocedure, 'EXECUTE') THEN
      RAISE EXCEPTION 'SCP_R2A_CONTINUITY_PROOF: authenticated cannot execute %()', _fn;
    END IF;
  END LOOP;

  -- The employer contract still withholds what it must.
  -- The quoted key, not the word: the body explains in a comment why
  -- behaviour_version_id is withheld, and that sentence must not trip this.
  IF (SELECT prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'scp_employer_report')
     LIKE '%''behaviour_version_id''%' THEN
    RAISE EXCEPTION 'SCP_R2A_CONTINUITY_PROOF: the employer contract now projects behaviour_version_id';
  END IF;
  -- Again the projected column, not the comment that explains its absence.
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname IN ('scp_participant_report','scp_employer_report')
         AND p.prosrc LIKE '%s.derivation_input%') > 0 THEN
    RAISE EXCEPTION 'SCP_R2A_CONTINUITY_PROOF: an audience contract now selects derivation_input';
  END IF;
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname IN ('scp_participant_report','scp_employer_report')
         AND p.prosrc LIKE '%scp_audience_brief%') <> 2 THEN
    RAISE EXCEPTION 'SCP_R2A_CONTINUITY_PROOF: an audience contract stopped stripping mean/spread';
  END IF;

  -- Nothing this migration must not touch has moved.
  IF NOT has_table_privilege('authenticated', 'public.scp_report_snapshots', 'SELECT') THEN
    RAISE EXCEPTION 'SCP_R2A_CONTINUITY_PROOF: the direct snapshot read is gone -- that is R2A-3, not this hotfix';
  END IF;
  IF (SELECT count(*) FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'scp_report_snapshots') <> 2
     OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
                     AND tablename = 'scp_competency_evidence' AND policyname = 'scp_evidence_own_select') THEN
    RAISE EXCEPTION 'SCP_R2A_CONTINUITY_PROOF: a policy this hotfix must not touch has changed';
  END IF;

  -- Report how much historical debt this database actually carries, so the
  -- number is recorded by the apply rather than asserted from elsewhere.
  SELECT count(*) INTO _orphans
    FROM public.scp_report_snapshots s
    LEFT JOIN public.scp_report_versions v ON v.id = s.report_version_id
   WHERE v.id IS NULL;
  RAISE NOTICE 'SCP_R2A_CONTINUITY: % released snapshot(s) reference a template row that does not exist in this database; all of them are readable again.', _orphans;
END
$proof$;
