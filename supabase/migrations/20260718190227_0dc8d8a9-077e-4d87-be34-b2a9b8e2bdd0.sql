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
SET search_path TO 'public'
AS $function$
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

  SELECT arr.run_id INTO v_run_id
    FROM public.assessment_run_reports AS arr
   WHERE arr.completion_id = p_completion_id
     AND arr.user_id = p_user_id;
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
  ) RETURNING assessment_runs.id INTO v_run_id;

  INSERT INTO public.assessment_run_reports (
    run_id, user_id, completion_id, report_version, engine_version,
    graph_version, profile_version, locale, inputs_hash, report
  ) VALUES (
    v_run_id, p_user_id, p_completion_id, p_report_version, p_engine_version,
    p_graph_version, p_profile_version, p_locale, p_inputs_hash, p_report
  )
  ON CONFLICT (user_id, completion_id) DO NOTHING
  RETURNING assessment_run_reports.run_id INTO v_inserted_run_id;

  IF v_inserted_run_id IS NOT NULL THEN
    RETURN QUERY SELECT v_run_id, true;
    RETURN;
  END IF;

  DELETE FROM public.assessment_runs AS ar WHERE ar.id = v_run_id;

  SELECT arr.run_id INTO v_run_id
    FROM public.assessment_run_reports AS arr
   WHERE arr.completion_id = p_completion_id
     AND arr.user_id = p_user_id;

  IF v_run_id IS NULL THEN
    RAISE EXCEPTION 'save_career_report: lost insert race for completion_id % but could not locate the winning row', p_completion_id;
  END IF;

  RETURN QUERY SELECT v_run_id, false;
END;
$function$;