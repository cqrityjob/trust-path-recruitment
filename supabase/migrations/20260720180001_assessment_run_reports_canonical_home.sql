-- assessment_run_reports gets a canonical home in the active migration path.
--
-- ── WHY THIS FILE EXISTS ───────────────────────────────────────────────
--
-- The Blueprint Engine (20260720180000_h4_1_assessment_blueprint_engine_
-- phase1.sql) has been PARKED: moved to supabase/archive/parked-migrations/
-- so no automated process can apply its 26 tables and 33 functions to a
-- database the product does not use them in. See
-- docs/technical/phase-0c-canonical-baseline-repair.md.
--
-- Parking it uncovered one genuine dependency the parking decision assumed
-- away. Of everything that migration creates, exactly ONE object is
-- load-bearing for the live product: public.assessment_run_reports, the saved
-- career report table that save_career_report() (20260718190227) and the
-- public assessment v2 migration (20260721090000) both depend on.
--
-- Its original CREATE TABLE is absent from this repository's history entirely
-- -- the table was created outside the migration path -- which is why the
-- Blueprint migration carried a defensive `CREATE TABLE IF NOT EXISTS`
-- reconstruction in its Section 8a. Parking the Blueprint file without
-- rescuing that block would have removed the only CREATE for a live table, and
-- clean replay would have failed at 20260721090000.
--
-- This migration is Section 8a, extracted verbatim in effect, and nothing
-- else. No Blueprint table, function, trigger or bridge column comes with it.
--
-- ── WHY IT IS SAFE ON A DATABASE THAT ALREADY HAS THE TABLE ────────────
--
-- `CREATE TABLE IF NOT EXISTS` plus a policy-existence guard: on hosted
-- production, where the table and its real grants and policies already exist,
-- every statement here is a no-op. It reconstructs only where the table is
-- genuinely absent, which in practice means a clean local replay.
--
-- Version 20260720180001 keeps the historical ordering intact: it lands where
-- the Blueprint migration used to sit, still before 20260721090000.
--
-- Forward-only. Remediation: DROP TABLE public.assessment_run_reports -- which
-- must never be run against an environment holding real saved reports.

CREATE TABLE IF NOT EXISTS public.assessment_run_reports (
  run_id         uuid PRIMARY KEY REFERENCES public.assessment_runs(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  completion_id  uuid NOT NULL,
  report_version text NOT NULL,
  engine_version text NOT NULL,
  graph_version  text NOT NULL,
  profile_version text NOT NULL,
  locale         text NOT NULL DEFAULT 'sv',
  inputs_hash    text NOT NULL,
  report         jsonb NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, completion_id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'assessment_run_reports'
  ) THEN
    EXECUTE 'ALTER TABLE public.assessment_run_reports ENABLE ROW LEVEL SECURITY';
    EXECUTE 'GRANT SELECT, INSERT ON public.assessment_run_reports TO authenticated';
    EXECUTE 'GRANT ALL ON public.assessment_run_reports TO service_role';
    EXECUTE $p$CREATE POLICY "own reports select" ON public.assessment_run_reports FOR SELECT TO authenticated USING (auth.uid() = user_id)$p$;
    EXECUTE $p$CREATE POLICY "own reports insert" ON public.assessment_run_reports FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id)$p$;
  END IF;
END $$;

COMMENT ON TABLE public.assessment_run_reports IS
  'Saved career report per assessment run. Created outside the migration path '
  'originally; given a canonical home here when the Blueprint Engine migration '
  'that used to carry its reconstruction was parked. Reconstructed only when '
  'genuinely absent -- never touches a pre-existing live configuration.';
