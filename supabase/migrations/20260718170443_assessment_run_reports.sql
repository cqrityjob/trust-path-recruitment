-- Phase 2 — Saved Career Intelligence Report.
--
-- Additive only. No existing table, column, policy, function, or grant is
-- modified. This migration is independent of, and does not attempt to
-- resolve, the pre-existing duplicate-migration situation around
-- security_career_profiles (see docs/ or the Phase 2 plan for details) —
-- that duplication is left untouched pending verification against the
-- connected project's migration ledger, per explicit instruction.
--
-- This table holds one immutable, versioned JSON snapshot per completed
-- assessment run. It is never read by the scoring engine (career-profile.ts
-- / scoring.ts / family-ranking.ts / target-vector.ts have no awareness
-- this table exists) and is never recomputed on read — the report content
-- is frozen at save time.

CREATE TABLE public.assessment_run_reports (
  run_id UUID PRIMARY KEY REFERENCES public.assessment_runs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  completion_id UUID NOT NULL,
  report_version TEXT NOT NULL DEFAULT 'car-v1',
  engine_version TEXT NOT NULL,
  graph_version TEXT NOT NULL,
  profile_version TEXT,
  locale TEXT NOT NULL,
  inputs_hash TEXT NOT NULL,
  report JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, completion_id)
);

-- Reads only, for authenticated owners. No INSERT/UPDATE/DELETE grant is
-- given to `authenticated` at all — writes only ever happen through
-- save_career_report() below, which is executable by service_role only.
GRANT SELECT ON public.assessment_run_reports TO authenticated;
GRANT ALL ON public.assessment_run_reports TO service_role;
ALTER TABLE public.assessment_run_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own report select" ON public.assessment_run_reports
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
-- No INSERT/UPDATE/DELETE policy exists for `authenticated` — there is no
-- grant for those operations to attach a policy to.

CREATE INDEX idx_assessment_run_reports_user
  ON public.assessment_run_reports (user_id, created_at DESC);

-- ---------------------------------------------------------------------
-- save_career_report — atomic, server-only persistence.
--
-- Callable ONLY by service_role. Not authenticated, not anon, not PUBLIC.
-- The only code that can ever invoke this is the TanStack server function
-- src/lib/career-intelligence-engine/report.functions.ts::saveMyCareerReport,
-- which runs behind requireSupabaseAuth (so the caller's identity is
-- already independently verified) and computes the report content via the
-- unmodified, trusted scoring engine (so the content is already
-- independently trustworthy) before ever calling this function. This
-- function therefore does not need to re-derive trust from its own
-- arguments — the security property is "only trusted server code can
-- reach this function at all", enforced by the grant below, not by
-- content validation inside the function body.
--
-- auth.uid() does not resolve under a service_role connection (no end-user
-- JWT is attached to that session), so ownership is passed explicitly as
-- p_user_id — sourced, by the one caller that can ever reach this
-- function, from its own already-verified context.userId, never from raw
-- client input.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_career_report(
  p_user_id uuid,
  p_completion_id uuid,
  p_assessment_id text,
  p_assessment_version_id uuid,
  p_graph_version text,
  p_locale text,
  p_result_summary jsonb,
  p_profile_snapshot jsonb,
  p_report jsonb,
  p_report_version text,
  p_engine_version text,
  p_profile_version text,
  p_inputs_hash text
)
RETURNS TABLE(run_id uuid, created_new boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run_id uuid;
  v_inserted_run_id uuid;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'save_career_report: p_user_id is required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p_user_id) THEN
    RAISE EXCEPTION 'save_career_report: unknown user_id %', p_user_id;
  END IF;

  -- Fast path: this exact completion was already saved (sequential retry).
  SELECT arr.run_id INTO v_run_id
    FROM public.assessment_run_reports arr
   WHERE arr.completion_id = p_completion_id AND arr.user_id = p_user_id;
  IF v_run_id IS NOT NULL THEN
    RETURN QUERY SELECT v_run_id, false;
    RETURN;
  END IF;

  INSERT INTO public.assessment_runs (
    user_id, assessment_id, assessment_version_id, graph_version,
    locale, status, completed_at, result_summary, profile_snapshot
  ) VALUES (
    p_user_id, p_assessment_id, p_assessment_version_id, p_graph_version,
    p_locale, 'completed', now(), p_result_summary, p_profile_snapshot
  ) RETURNING id INTO v_run_id;

  -- Race path: narrowly scoped to exactly the (user_id, completion_id)
  -- constraint. No broad exception handler — an unrelated constraint
  -- violation (should one ever exist) surfaces as a normal, uncaught
  -- error rather than being silently treated as "already saved".
  INSERT INTO public.assessment_run_reports (
    run_id, user_id, completion_id, report_version, engine_version,
    graph_version, profile_version, locale, inputs_hash, report
  ) VALUES (
    v_run_id, p_user_id, p_completion_id, p_report_version, p_engine_version,
    p_graph_version, p_profile_version, p_locale, p_inputs_hash, p_report
  )
  ON CONFLICT (user_id, completion_id) DO NOTHING
  RETURNING run_id INTO v_inserted_run_id;

  IF v_inserted_run_id IS NOT NULL THEN
    RETURN QUERY SELECT v_run_id, true; -- we won: both rows are ours
    RETURN;
  END IF;

  -- We lost the race: a concurrent call for the same completion_id already
  -- inserted its report first. Our own just-inserted assessment_runs row
  -- would otherwise be an orphan with no report — remove it explicitly.
  -- (ON CONFLICT DO NOTHING does not roll back earlier statements in this
  -- function; only an unhandled exception would, and none was raised.)
  DELETE FROM public.assessment_runs WHERE id = v_run_id;

  SELECT arr.run_id INTO v_run_id
    FROM public.assessment_run_reports arr
   WHERE arr.completion_id = p_completion_id AND arr.user_id = p_user_id;

  IF v_run_id IS NULL THEN
    -- Should be unreachable: ON CONFLICT above only fires when a row with
    -- this exact (user_id, completion_id) exists. Fail loudly rather than
    -- return a wrong or empty result if it ever does happen.
    RAISE EXCEPTION 'save_career_report: lost insert race for completion_id % but could not locate the winning row', p_completion_id;
  END IF;

  RETURN QUERY SELECT v_run_id, false;
END;
$$;

REVOKE ALL ON FUNCTION public.save_career_report FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_career_report FROM authenticated;
REVOKE ALL ON FUNCTION public.save_career_report FROM anon;
GRANT EXECUTE ON FUNCTION public.save_career_report TO service_role;
