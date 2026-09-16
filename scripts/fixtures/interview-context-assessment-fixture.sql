BEGIN;
CREATE TEMP TABLE context_cast(app uuid,assignment uuid,attempt uuid,snapshot uuid,subject uuid,candidate uuid,released boolean);
INSERT INTO context_cast VALUES
('aa113333-0000-0000-0000-000000000002','aa114444-0000-0000-0000-000000000002','aa115555-0000-0000-0000-000000000002','aa116666-0000-0000-0000-000000000002','e4000000-0000-4000-8000-00000000ee01','e4000000-0000-4000-8000-0000000000c1',true),
('aa113333-0000-0000-0000-000000000003','aa114444-0000-0000-0000-000000000003','aa115555-0000-0000-0000-000000000003','aa116666-0000-0000-0000-000000000003','aa117777-0000-0000-0000-000000000003','9e000000-0000-4000-8000-0000000000c1',false);
INSERT INTO public.scp_subjects(id) SELECT subject FROM context_cast ON CONFLICT DO NOTHING;
INSERT INTO public.scp_subject_identities(subject_id,user_id) SELECT subject,candidate FROM context_cast ON CONFLICT DO NOTHING;
INSERT INTO public.assessment_assignments
SELECT (jsonb_populate_record(null::public.assessment_assignments,to_jsonb(a)||jsonb_build_object(
'id',c.assignment,'employer_id','11110000-1111-0000-0000-00000000000a','assigned_by','11110000-1111-4000-8000-000000000001',
'application_id',c.app,'job_id','aa112222-0000-0000-0000-000000000001','recipient_user_id',c.candidate,
'invitation_token_hash',c.assignment::text,'scp_open',false))).*
FROM public.assessment_assignments a CROSS JOIN context_cast c WHERE a.id='e4000000-0000-4000-8000-00000000a001' ON CONFLICT(id) DO NOTHING;
INSERT INTO public.scp_attempts
SELECT (jsonb_populate_record(null::public.scp_attempts,to_jsonb(a)||jsonb_build_object(
'id',c.attempt,'assignment_id',c.assignment,'subject_id',c.subject,'issuer_organization_id','11110000-1111-0000-0000-00000000000a'))).*
FROM public.scp_attempts a CROSS JOIN context_cast c WHERE a.id='e4000000-0000-4000-8000-00000000b011' ON CONFLICT(id) DO NOTHING;
INSERT INTO public.scp_report_snapshots
SELECT (jsonb_populate_record(null::public.scp_report_snapshots,to_jsonb(s)||jsonb_build_object(
'id',c.snapshot,'attempt_id',c.attempt,'subject_id',c.subject,'issuer_organization_id','11110000-1111-0000-0000-00000000000a',
'released_at',CASE WHEN c.released THEN now() ELSE NULL END,
'brief',s.brief||'{"interview_guide":[{"area_code":"SAK-01","area_sv":"Säkerhet","area_en":"Safety","focus":"explore_development","why_sv":"Följ upp det observerade underlaget","why_en":"Follow up observed evidence"}]}'::jsonb))).*
FROM public.scp_report_snapshots s CROSS JOIN context_cast c WHERE s.id='e4000000-0000-4000-8000-00000000c011' AND c.released ON CONFLICT(id) DO NOTHING;
UPDATE public.scp_attempts SET scored_at=coalesce(scored_at,now()), released_at=now(), status='released' WHERE id IN (SELECT attempt FROM context_cast WHERE released);
COMMIT;
