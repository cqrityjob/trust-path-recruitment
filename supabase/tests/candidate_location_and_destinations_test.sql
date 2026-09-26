-- Candidate current location and desired destinations (20261215090000).
--
--   1. The holder reads and writes their own row, and nobody else can.
--   2. The destination vocabulary is closed, ordered and free of duplicates;
--      a locality is free Unicode text without control characters.
--   3. Anonymisation removes both rows.
--   4. The six funnel names are accepted anonymously by the governed entry
--      point, which still refuses any other name.
--
-- Everything is inside one transaction and rolled back.
\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.ok(b boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 IF b IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: %',label; END IF;
 RAISE NOTICE 'ok %',label; END $$;
CREATE FUNCTION pg_temp.refused(q text,needle text,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 BEGIN EXECUTE q; EXCEPTION WHEN OTHERS THEN
   IF position(needle IN SQLERRM)=0 THEN RAISE EXCEPTION 'ASSERTION FAILED: % refused for another reason: %',label,SQLERRM; END IF;
   RAISE NOTICE 'ok %',label; RETURN;
 END; RAISE EXCEPTION 'ASSERTION FAILED: accepted %',label;
END $$;

INSERT INTO auth.users(id,email) VALUES
 ('fd150000-0000-4000-8000-000000000001','loc-holder@fixture.invalid'),
 ('fd150000-0000-4000-8000-000000000002','loc-other@fixture.invalid'),
 ('fd150000-0000-4000-8000-00000000005a','loc-superadmin@fixture.invalid');
INSERT INTO public.profiles(id,display_name) VALUES ('fd150000-0000-4000-8000-000000000001','Priya Ramaswamy Iyer')
 ON CONFLICT (id) DO UPDATE SET display_name=EXCLUDED.display_name;
INSERT INTO public.user_roles(user_id,role) VALUES ('fd150000-0000-4000-8000-00000000005a','superadmin');

-- ── 1. Own row only ─────────────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fd150000-0000-4000-8000-000000000001',true);
INSERT INTO public.candidate_current_location(user_id,country_code,locality) VALUES (auth.uid(),'IN','Navi Mumbai');
INSERT INTO public.candidate_job_preferences(user_id,desired_destinations,relocation_interest) VALUES (auth.uid(),ARRAY['AE-DU','IN'],'actively_looking');
SELECT pg_temp.ok((SELECT country_code='IN' AND locality='Navi Mumbai' AND confirmed_at IS NOT NULL FROM public.candidate_current_location WHERE user_id=auth.uid()),
 '1.1 the holder stores where they live');
SELECT pg_temp.ok((SELECT desired_destinations=ARRAY['AE-DU','IN'] AND relocation_interest='actively_looking' FROM public.candidate_job_preferences WHERE user_id=auth.uid()),
 '1.2 and where they would like to work, in their own order');
UPDATE public.candidate_job_preferences SET desired_destinations=ARRAY['AE-DU'] WHERE user_id=auth.uid();
SELECT pg_temp.ok((SELECT desired_destinations=ARRAY['AE-DU'] FROM public.candidate_job_preferences WHERE user_id=auth.uid()),'1.3 and can change it');
SELECT pg_temp.refused($q$INSERT INTO public.candidate_current_location(user_id,country_code) VALUES ('fd150000-0000-4000-8000-000000000002','IN')$q$,
 'row-level security','1.4 cannot write a row for somebody else');
SELECT pg_temp.refused($q$TRUNCATE public.candidate_current_location$q$,'permission denied','1.5 cannot truncate');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fd150000-0000-4000-8000-000000000002',true);
SELECT pg_temp.ok((SELECT count(*)=0 FROM public.candidate_current_location)
  AND (SELECT count(*)=0 FROM public.candidate_job_preferences),'1.6 another candidate reads nothing');
UPDATE public.candidate_job_preferences SET desired_destinations='{}' WHERE user_id='fd150000-0000-4000-8000-000000000001';
DELETE FROM public.candidate_current_location WHERE user_id='fd150000-0000-4000-8000-000000000001';
RESET ROLE;
SELECT pg_temp.ok((SELECT count(*)=1 FROM public.candidate_current_location WHERE user_id='fd150000-0000-4000-8000-000000000001')
  AND (SELECT desired_destinations=ARRAY['AE-DU'] FROM public.candidate_job_preferences WHERE user_id='fd150000-0000-4000-8000-000000000001'),
 '1.7 and changes nothing');
SET LOCAL ROLE anon;
SELECT pg_temp.refused($q$SELECT count(*) FROM public.candidate_current_location$q$,'permission denied','1.8 anon cannot read locations');
SELECT pg_temp.refused($q$SELECT count(*) FROM public.candidate_job_preferences$q$,'permission denied','1.9 anon cannot read preferences');
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT pg_temp.refused($q$SELECT count(*) FROM public.candidate_current_location$q$,'permission denied','1.10 no server key reads them either');
RESET ROLE;

-- ── 2. Shapes ───────────────────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fd150000-0000-4000-8000-000000000001',true);
SELECT pg_temp.refused($q$UPDATE public.candidate_job_preferences SET desired_destinations=ARRAY['US'] WHERE user_id=auth.uid()$q$,'check constraint','2.1 a destination outside the vocabulary is refused');
SELECT pg_temp.refused($q$UPDATE public.candidate_job_preferences SET desired_destinations=ARRAY['GB','GB'] WHERE user_id=auth.uid()$q$,'candidate_job_preferences_destinations_distinct','2.2 a duplicate destination is refused');
SELECT pg_temp.refused($q$UPDATE public.candidate_job_preferences SET relocation_interest='visa_sponsored' WHERE user_id=auth.uid()$q$,'check constraint','2.3 relocation interest is a closed list with no immigration status in it');
SELECT pg_temp.refused($q$UPDATE public.candidate_current_location SET country_code='India' WHERE user_id=auth.uid()$q$,'check constraint','2.4 a country is an ISO code');
SELECT pg_temp.refused(format($q$UPDATE public.candidate_current_location SET locality=%L WHERE user_id=auth.uid()$q$, 'Pune'||chr(10)||'x'),'check constraint','2.5 a locality cannot carry control characters');
UPDATE public.candidate_current_location SET locality='தூத்துக்குடி' WHERE user_id=auth.uid();
SELECT pg_temp.ok((SELECT locality='தூத்துக்குடி' FROM public.candidate_current_location WHERE user_id=auth.uid()),'2.6 a locality in Tamil script is kept exactly');
SELECT pg_temp.ok(NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public'
   AND table_name IN ('candidate_current_location','candidate_job_preferences')
   AND column_name ~* 'national|passport|visa|permit|right_to_work|citizen'),
 '2.7 neither table has a nationality, passport, visa, permit or right-to-work column');
RESET ROLE;

-- ── 3. Anonymisation removes both rows ─────────────────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fd150000-0000-4000-8000-00000000005a',true);
SELECT public.admin_anonymise_user('fd150000-0000-4000-8000-000000000001','fixture erasure request','loc-holder@fixture.invalid') AS anon_result \gset
RESET ROLE;
SELECT pg_temp.ok((SELECT count(*)=0 FROM public.candidate_current_location WHERE user_id='fd150000-0000-4000-8000-000000000001')
  AND (SELECT count(*)=0 FROM public.candidate_job_preferences WHERE user_id='fd150000-0000-4000-8000-000000000001')
  AND (:'anon_result'::jsonb#>>'{cleared,location_and_destinations}')='true',
 '3.1 anonymisation deletes where the person lives and wants to work, and says so');

-- ── 4. Funnel names ─────────────────────────────────────────────────────
-- An anonymous visitor carries no subject: clear the one an earlier block set.
SELECT set_config('request.jwt.claim.sub','',true);
SET LOCAL ROLE anon;
SELECT public.cd_record_funnel_event('india_landing_viewed','{}'::jsonb,NULL);
SELECT public.cd_record_funnel_event('passport_share_link_created','{}'::jsonb,NULL);
SELECT pg_temp.refused($q$SELECT public.cd_record_funnel_event('india_candidate_name','{}'::jsonb,NULL)$q$,'CD_FUNNEL_EVENT_UNKNOWN','4.1 an unlisted name is refused');
RESET ROLE;
SELECT pg_temp.ok((SELECT count(*)=2 FROM public.cd_v31_funnel_events WHERE event_name IN ('india_landing_viewed','passport_share_link_created') AND user_id IS NULL),
 '4.2 the new names are recorded, anonymously');
SELECT pg_temp.ok((SELECT array_agg(x ORDER BY x) FROM unnest(public.cd_v31_funnel_event_names()) x)
  @> ARRAY['india_landing_viewed','india_registration_completed','india_registration_started','passport_first_credential_saved','passport_review_requested','passport_share_link_created'],
 '4.3 the entry point lists all six');
ROLLBACK;
