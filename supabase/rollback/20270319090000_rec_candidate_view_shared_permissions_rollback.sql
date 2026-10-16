-- Rollback of 20270319090000 (rec_candidate_view_shared_permissions).
-- The slot replaced one function body and stored nothing, so there is no data
-- to preserve: this restores rec_ri_candidate_view to its 20270308090000 body
-- verbatim (the per-application rec_can_manage call), with the same grants,
-- and clears the comment the slot added. Safe to run at any time.
BEGIN;

CREATE OR REPLACE FUNCTION public.rec_ri_candidate_view(_employer_id uuid,_job_id uuid,_filters jsonb,_sort text,_dir text,_page integer,_size integer,_around uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE f jsonb:=coalesce(_filters,'{}'); sortv text:=coalesce(_sort,'requirements'); stagev text:=coalesce(f->>'stage','open'); dirv text:=coalesce(_dir,CASE WHEN sortv IN ('requirements','applied') THEN 'desc' ELSE 'asc' END); result jsonb;
BEGIN
  IF NOT public.rec_is_member(_employer_id) OR (_job_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.jobs WHERE id=_job_id AND employer_id=_employer_id)) THEN RAISE EXCEPTION 'RECRUITMENT_NOT_PERMITTED' USING ERRCODE='insufficient_privilege'; END IF;
  IF jsonb_typeof(f)<>'object' OR sortv NOT IN ('requirements','applied','name','stage','activity') OR dirv NOT IN ('asc','desc') OR coalesce(_size,25) NOT BETWEEN 1 AND 100 OR stagev NOT IN ('all','received','archived','open','decided','new','review','interview')
    OR (f->>'requirement' IS NOT NULL AND f->>'requirement' NOT IN ('green','yellow','gray','not_established')) OR (f->>'review' IS NOT NULL AND f->>'review' NOT IN ('pending','reviewed','stale','remaining')) OR (f->>'analysis' IS NOT NULL AND f->>'analysis'<>'not_used') THEN RAISE EXCEPTION 'CANDIDATE_VIEW_INVALID' USING ERRCODE='check_violation'; END IF;
  IF (f ? 'answers' AND jsonb_typeof(f->'answers')<>'array') OR char_length(f->>'q')>160
    OR (f->>'assessment' IS NOT NULL AND f->>'assessment'<>'open')
    OR (f->>'status' IS NOT NULL AND f->>'status' NOT IN ('submitted','reviewing','interview','hired','rejected','withdrawn'))
    OR (f->>'owner' IS NOT NULL AND f->>'owner'<>'none' AND f->>'owner' !~ '^[a-fA-F0-9-]{36}$')
    OR (f->>'job' IS NOT NULL AND f->>'job' !~ '^[a-fA-F0-9-]{36}$') THEN RAISE EXCEPTION 'CANDIDATE_VIEW_INVALID' USING ERRCODE='check_violation'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(f->'answers','[]'))af WHERE jsonb_typeof(af)<>'object' OR af->>'question_id' IS NULL OR jsonb_typeof(af->'value') IS DISTINCT FROM 'boolean') THEN RAISE EXCEPTION 'CANDIDATE_VIEW_INVALID' USING ERRCODE='check_violation'; END IF;
  WITH base AS MATERIALIZED(
    SELECT a.id,a.job_id,a.applicant_user_id,a.status,a.created_at,a.updated_at,a.cv_storage_path,a.cv_source,a.employer_archived_at,p.display_name,m.responsible_user_id,m.first_viewed_at,coalesce(m.version,1)meta_version,j.title_sv,j.title_en,
      public.rec_can_manage(a.job_id)can_manage,recruiter_intelligence.application_state(a.id)ri,
      b.starts_at next_activity_at,b.timezone next_activity_timezone,b.status next_activity_status,
      EXISTS(SELECT 1 FROM public.assessment_assignments aa WHERE aa.application_id=a.id AND aa.status NOT IN ('completed','cancelled','expired'))assessment_open
    FROM public.job_applications a JOIN public.jobs j ON j.id=a.job_id LEFT JOIN public.profiles p ON p.id=a.applicant_user_id
    LEFT JOIN public.recruitment_application_meta m ON m.application_id=a.id
    LEFT JOIN LATERAL(SELECT bk.starts_at,bk.timezone,bk.status FROM public.recruitment_interview_bookings bk WHERE bk.application_id=a.id AND a.status IN ('submitted','reviewing','interview') AND bk.status IN ('planned','invited','confirmed') AND bk.starts_at>=now()-interval '1 hour' ORDER BY bk.starts_at,bk.id LIMIT 1)b ON true
    WHERE a.employer_id=_employer_id AND (_job_id IS NULL OR a.job_id=_job_id)
  ), filtered AS MATERIALIZED(
    SELECT * FROM base a WHERE CASE stagev WHEN 'received' THEN true WHEN 'archived' THEN a.employer_archived_at IS NOT NULL ELSE a.employer_archived_at IS NULL END
      AND CASE stagev WHEN 'open' THEN a.status IN ('submitted','reviewing','interview') WHEN 'decided' THEN a.status NOT IN ('submitted','reviewing','interview') WHEN 'new' THEN a.status='submitted' WHEN 'review' THEN a.status='reviewing' WHEN 'interview' THEN a.status='interview' ELSE true END
      AND (f->>'job' IS NULL OR a.job_id::text=f->>'job') AND (f->>'status' IS NULL OR a.status=f->>'status')
      AND (f->>'owner' IS NULL OR CASE WHEN f->>'owner'='none' THEN a.responsible_user_id IS NULL ELSE a.responsible_user_id::text=f->>'owner' END)
      AND (nullif(btrim(f->>'q'),'') IS NULL OR a.display_name ILIKE '%'||replace(replace(replace(btrim(f->>'q'),'\','\\'),'%','\%'),'_','\_')||'%' ESCAPE '\')
      AND (f->>'requirement' IS NULL OR a.ri->>'requirementStatus'=f->>'requirement')
      AND (f->>'review' IS NULL OR CASE WHEN f->>'review'='remaining' THEN a.ri->>'reviewState'<>'reviewed' ELSE a.ri->>'reviewState'=f->>'review' END)
      AND (f->>'analysis' IS NULL OR a.ri->>'analysisState'=f->>'analysis')
      AND (f->>'assessment' IS NULL OR f->>'assessment'<>'open' OR a.assessment_open)
      AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(f->'answers','[]'))af WHERE NOT EXISTS(SELECT 1 FROM public.job_application_answers ans WHERE ans.application_id=a.id AND ans.question_id::text=af->>'question_id' AND to_jsonb(ans.answer_bool)=af->'value'))
  ), ranked AS MATERIALIZED(
    SELECT f.*,row_number() OVER(ORDER BY
      CASE WHEN sortv='requirements' THEN CASE f.ri->>'requirementStatus' WHEN 'green' THEN 0 WHEN 'yellow' THEN 1 WHEN 'gray' THEN 2 ELSE 3 END END,
      CASE WHEN sortv IN ('requirements','applied') AND dirv='asc' THEN f.created_at END ASC,
      CASE WHEN sortv IN ('requirements','applied') AND dirv='desc' THEN f.created_at END DESC,
      CASE WHEN sortv='name' AND dirv='asc' THEN f.display_name COLLATE "sv-SE-x-icu" END ASC NULLS LAST,
      CASE WHEN sortv='name' AND dirv='desc' THEN f.display_name COLLATE "sv-SE-x-icu" END DESC NULLS LAST,
      CASE WHEN sortv='stage' THEN array_position(ARRAY['submitted','reviewing','interview','hired','rejected','withdrawn'],f.status)*CASE WHEN dirv='asc' THEN 1 ELSE -1 END END,
      CASE WHEN sortv='activity' AND dirv='asc' THEN f.next_activity_at END ASC NULLS LAST,
      CASE WHEN sortv='activity' AND dirv='desc' THEN f.next_activity_at END DESC NULLS LAST,f.id ASC)rank FROM filtered f
  ), bounds AS(SELECT count(*)total,greatest(1,ceil(count(*)::numeric/coalesce(_size,25))::integer)pages FROM filtered), pagebounds AS(SELECT *,least(greatest(coalesce(_page,1),1),pages)page FROM bounds), picked AS(
    SELECT r.* FROM ranked r CROSS JOIN pagebounds b WHERE CASE WHEN _around IS NOT NULL THEN r.rank BETWEEN (SELECT rank-1 FROM ranked WHERE id=_around) AND (SELECT rank+1 FROM ranked WHERE id=_around) ELSE r.rank>(b.page-1)*coalesce(_size,25) AND r.rank<=b.page*coalesce(_size,25) END
  ) SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg((to_jsonb(p)-'ri'-'cv_document_snapshot')||jsonb_build_object('requirement_status',p.ri->>'requirementStatus','review_state',p.ri->>'reviewState','analysis_state',p.ri->>'analysisState','next_action',p.ri->>'nextAction','review_revision',p.ri->'revision','profile_version',p.ri->'profileVersion') ORDER BY p.rank)FROM picked p),'[]'),
    'total',b.total,'page',b.page,'pages',b.pages,'from',coalesce((SELECT min(rank)FROM picked),0),'to',coalesce((SELECT max(rank)FROM picked),0),
    'counts',(SELECT jsonb_build_object('total',count(*),'new',count(*)FILTER(WHERE status='submitted'),'review',count(*)FILTER(WHERE status='reviewing'),'interview',count(*)FILTER(WHERE status='interview'),'hired',count(*)FILTER(WHERE status='hired'),'decided',count(*)FILTER(WHERE status NOT IN ('submitted','reviewing','interview')))FROM base WHERE employer_archived_at IS NULL),
    'intelligenceCounts',(SELECT jsonb_build_object('received',count(*),'reviewed',count(*)FILTER(WHERE ri->>'reviewState'='reviewed'),'remaining',count(*)FILTER(WHERE ri->>'reviewState'<>'reviewed'),'green',count(*)FILTER(WHERE ri->>'requirementStatus'='green'),'yellow',count(*)FILTER(WHERE ri->>'requirementStatus'='yellow'),'gray',count(*)FILTER(WHERE ri->>'requirementStatus'='gray'),'notEstablished',count(*)FILTER(WHERE ri->>'requirementStatus'='not_established'),'filtered',b.total,'filteredReviewed',(SELECT count(*)FROM filtered WHERE ri->>'reviewState'='reviewed'),'filteredRemaining',(SELECT count(*)FROM filtered WHERE ri->>'reviewState'<>'reviewed'),'archived',count(*)FILTER(WHERE employer_archived_at IS NOT NULL),'withdrawn',count(*)FILTER(WHERE status='withdrawn'),'decided',count(*)FILTER(WHERE status NOT IN ('submitted','reviewing','interview')))FROM base)) INTO result FROM pagebounds b;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.rec_ri_candidate_view(uuid,uuid,jsonb,text,text,integer,integer,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rec_ri_candidate_view(uuid,uuid,jsonb,text,text,integer,integer,uuid) TO authenticated;

COMMENT ON FUNCTION public.rec_ri_candidate_view(uuid,uuid,jsonb,text,text,integer,integer,uuid) IS NULL;

COMMIT;
