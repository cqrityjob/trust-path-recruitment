-- Current launch policy, using the established real assignment/review/release fixture.
-- Run on the final schema. Every fixture and temporary SELECT grant rolls back.
\set ON_ERROR_STOP on
BEGIN;
\ir employer_report_access_fixture.sql

CREATE FUNCTION pg_temp.read_as(_uid uuid, _sql text) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE result jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', coalesce(_uid::text, ''), true);
  EXECUTE CASE WHEN _uid IS NULL THEN 'SET LOCAL ROLE anon' ELSE 'SET LOCAL ROLE authenticated' END;
  BEGIN
    EXECUTE 'SELECT coalesce(jsonb_agg(to_jsonb(q)), ''[]''::jsonb) FROM (' || _sql || ') q' INTO result;
  EXCEPTION WHEN insufficient_privilege THEN result := '"denied"'::jsonb;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RETURN result;
END $$;
CREATE FUNCTION pg_temp.report(_uid uuid, _attempt uuid) RETURNS jsonb LANGUAGE sql AS $$
  SELECT pg_temp.read_as(_uid, format('SELECT * FROM public.scp_participant_report(%L)', _attempt));
$$;
CREATE FUNCTION pg_temp.progress(_uid uuid, _subject uuid) RETURNS jsonb LANGUAGE sql AS $$
  SELECT pg_temp.read_as(_uid, format('SELECT * FROM public.scp_subject_progress(%L)', _subject));
$$;
CREATE FUNCTION pg_temp.recs(_uid uuid, _subject uuid) RETURNS jsonb LANGUAGE sql AS $$
  SELECT pg_temp.read_as(_uid, format('SELECT * FROM public.scp_development_recommendations(%L)', _subject));
$$;

SELECT pg_temp.ok(pg_temp.report((SELECT p FROM rm), (SELECT r1 FROM rma)) = '[]',
  'PB1 workforce report is withheld even from its own participant');
SELECT pg_temp.ok(pg_temp.progress((SELECT p FROM rm), (SELECT s1 FROM rms)) = '[]',
  'PB2 workforce progression is withheld');
SELECT pg_temp.ok(pg_temp.recs((SELECT p FROM rm), (SELECT s1 FROM rms)) = '[]',
  'PB3 workforce recommendations are withheld');
SELECT pg_temp.ok(jsonb_array_length(pg_temp.report((SELECT c1 FROM rm), (SELECT v1 FROM rma))) = 1
  AND jsonb_array_length(pg_temp.progress((SELECT c1 FROM rm), (SELECT sv1 FROM rms))) > 0,
  'PB4 candidate report and progression remain readable');
SELECT pg_temp.ok(jsonb_array_length(pg_temp.recs((SELECT c1 FROM rm), (SELECT sv1 FROM rms))) > 0,
  'PB5 candidate-only recommendations remain available');
SELECT pg_temp.ok(pg_temp.report((SELECT c2 FROM rm), (SELECT v1 FROM rma)) = '[]'
  AND pg_temp.progress((SELECT c2 FROM rm), (SELECT sv1 FROM rms)) = '[]'
  AND pg_temp.recs((SELECT c2 FROM rm), (SELECT sv1 FROM rms)) = '[]',
  'PB6 another candidate cannot read report, progression or recommendations');
SELECT pg_temp.ok(pg_temp.report(NULL, (SELECT v1 FROM rma)) = '"denied"'
  AND pg_temp.progress(NULL, (SELECT sv1 FROM rms)) = '"denied"'
  AND pg_temp.recs(NULL, (SELECT sv1 FROM rms)) = '"denied"',
  'PB7 anonymous API calls are denied');
SELECT pg_temp.ok(NOT (SELECT auth_select OR anon_select FROM rm_before),
  'PB8 snapshot table SELECT is still revoked for both client roles');
SELECT pg_temp.ok(pg_temp.read_as((SELECT p FROM rm), 'SELECT id FROM public.scp_report_snapshots') = '[]'
  AND jsonb_array_length(pg_temp.read_as((SELECT c1 FROM rm), 'SELECT id FROM public.scp_report_snapshots')) = 1,
  'PB9 RLS itself filters workforce even with the fixture temporary SELECT grant');

-- Store unchanged employer/issuer output, then compare after every context case.
CREATE TEMP TABLE pb_employer_before AS SELECT
  pg_temp.read_as((SELECT ow FROM rm), format('SELECT * FROM public.scp_employer_report(%L)', (SELECT r1 FROM rma))) AS report,
  pg_temp.progress((SELECT ow FROM rm), (SELECT s1 FROM rms)) AS progress,
  pg_temp.recs((SELECT ow FROM rm), (SELECT s1 FROM rms)) AS recs;
SELECT pg_temp.ok(jsonb_array_length(report) = 1 AND jsonb_array_length(progress) > 0 AND jsonb_array_length(recs) > 0,
  'PB10 employer workforce report, progression and recommendations remain nonempty') FROM pb_employer_before;
SELECT pg_temp.ok(jsonb_array_length(pg_temp.read_as((SELECT ow FROM rm), format(
    'SELECT * FROM public.scp_participant_report_for_issuer(%L)', (SELECT r1 FROM rma)))) = 1
  AND pg_temp.read_as((SELECT xo FROM rm), format('SELECT * FROM public.scp_participant_report_for_issuer(%L)', (SELECT r1 FROM rma))) = '[]',
  'PB11 commissioning issuer preview remains available; other issuer denied');

-- Historical data fixtures only: immutable rows can enter through old restores.
-- Disable USER triggers only while the privileged fixture changes those rows.
SAVEPOINT historical_context;
ALTER TABLE public.scp_report_snapshots DISABLE TRIGGER USER;
DO $$
DECLARE ctx jsonb;
BEGIN
  FOREACH ctx IN ARRAY ARRAY['{}'::jsonb, '{"person_context":null}', '{"person_context":"unknown"}', '{"person_context":"employee"}'] LOOP
    UPDATE public.scp_report_snapshots SET context = ctx
     WHERE attempt_id = (SELECT v1 FROM rma) AND audience = 'participant';
    PERFORM pg_temp.ok(pg_temp.report((SELECT c1 FROM rm), (SELECT v1 FROM rma)) = '[]'
      AND pg_temp.progress((SELECT c1 FROM rm), (SELECT sv1 FROM rms)) = '[]'
      AND pg_temp.recs((SELECT c1 FROM rm), (SELECT sv1 FROM rms)) = '[]'
      AND pg_temp.read_as((SELECT c1 FROM rm), 'SELECT id FROM public.scp_report_snapshots') = '[]',
      'PB12 historical missing/null/unknown/workforce context fails closed on RPC and RLS: ' || ctx::text);
  END LOOP;
END $$;
ROLLBACK TO historical_context;

-- Reuse the existing released workforce attempts as mixed historical snapshots.
SAVEPOINT mixed;
ALTER TABLE public.scp_report_snapshots DISABLE TRIGGER USER;
UPDATE public.scp_report_snapshots SET subject_id = (SELECT sv1 FROM rms)
 WHERE attempt_id IN ((SELECT r1 FROM rma), (SELECT r2 FROM rma)) AND audience = 'participant';
SELECT pg_temp.ok(jsonb_array_length(pg_temp.report((SELECT c1 FROM rm), (SELECT v1 FROM rma))) = 1
  AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(pg_temp.progress((SELECT c1 FROM rm), (SELECT sv1 FROM rms))) x
                   WHERE (x->>'attempt_id')::uuid <> (SELECT v1 FROM rma))
  AND pg_temp.recs((SELECT c1 FROM rm), (SELECT sv1 FROM rms)) = '[]',
  'PB13 mixed history keeps candidate report and progress only, withholds aggregate recommendations');
UPDATE public.scp_report_snapshots SET payload = '[]', context = '{}'
 WHERE attempt_id IN ((SELECT r1 FROM rma), (SELECT r2 FROM rma)) AND audience = 'participant';
SELECT pg_temp.ok(pg_temp.recs((SELECT c1 FROM rm), (SELECT sv1 FROM rms)) = '[]',
  'PB14 empty payload with missing context still blocks aggregate recommendations');
ROLLBACK TO mixed;

-- Evidence not represented by a candidate snapshot must not influence an aggregate.
SAVEPOINT orphan_evidence;
ALTER TABLE public.scp_competency_evidence DISABLE TRIGGER USER;
UPDATE public.scp_competency_evidence SET source_ref = gen_random_uuid()
 WHERE subject_id = (SELECT sv1 FROM rms);
SELECT pg_temp.ok(pg_temp.recs((SELECT c1 FROM rm), (SELECT sv1 FROM rms)) = '[]',
  'PB15 unresolvable evidence fails closed even with candidate-only snapshots');
ROLLBACK TO orphan_evidence;
SELECT pg_temp.ok(report = pg_temp.read_as((SELECT ow FROM rm), format('SELECT * FROM public.scp_employer_report(%L)', (SELECT r1 FROM rma)))
  AND progress = pg_temp.progress((SELECT ow FROM rm), (SELECT s1 FROM rms))
  AND recs = pg_temp.recs((SELECT ow FROM rm), (SELECT s1 FROM rms)),
  'PB16 employer projections stay byte-equivalent') FROM pb_employer_before;

SELECT pg_temp.ok(pg_temp.read_as(NULL, $$SELECT public.cd_record_funnel_event('result_viewed')$$) = '"denied"'
  AND pg_temp.read_as((SELECT c1 FROM rm), $$SELECT public.cd_record_funnel_event('result_viewed')$$) = '"denied"'
  AND has_function_privilege('service_role', 'public.cd_record_funnel_event(text,jsonb,uuid)', 'EXECUTE'),
  'PB17 client funnel RPC denied; service role retained');
SELECT pg_temp.ok(pg_temp.read_as(NULL, $$SELECT public.cd_submit_test_feedback('sv')$$) <> '"denied"'
  AND pg_temp.read_as((SELECT c1 FROM rm), $$SELECT public.cd_submit_test_feedback('en')$$) <> '"denied"',
  'PB18 real anonymous and authenticated test feedback still writes');
ROLLBACK;
