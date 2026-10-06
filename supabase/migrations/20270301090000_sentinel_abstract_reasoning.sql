-- Created with supabase migration new, moved after the canonical ledger.
-- Original Sentinel pilot: no production activation or fabricated approval.
CREATE TABLE public.sentinel_forms (
  assessment_version_id uuid PRIMARY KEY REFERENCES public.scp_assessment_versions(id),
  form_id uuid NOT NULL REFERENCES public.scp_forms(id),
  version text NOT NULL UNIQUE,
  duration_seconds integer NOT NULL CHECK(duration_seconds BETWEEN 60 AND 7200),
  bank jsonb NOT NULL CHECK(jsonb_array_length(bank) >= 40),
  items jsonb NOT NULL CHECK(jsonb_array_length(items) = 20),
  practice jsonb NOT NULL CHECK(jsonb_array_length(practice) = 3),
  assignments_enabled boolean NOT NULL DEFAULT false,
  owner_approved_at timestamptz,
  privacy_approved_at timestamptz,
  preview_only boolean NOT NULL DEFAULT false,
  CHECK(NOT assignments_enabled OR preview_only OR (owner_approved_at IS NOT NULL AND privacy_approved_at IS NOT NULL))
);
CREATE TABLE public.sentinel_sessions (
  attempt_id uuid PRIMARY KEY REFERENCES public.scp_attempts(id) ON DELETE CASCADE,
  recipient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assignment_id uuid NOT NULL REFERENCES public.assessment_assignments(id) ON DELETE CASCADE,
  version text NOT NULL,
  items jsonb NOT NULL,
  duration_seconds integer NOT NULL,
  status text NOT NULL DEFAULT 'ready' CHECK(status IN('ready','running','completed','timed_out','abandoned')),
  started_at timestamptz,
  deadline timestamptz,
  finished_at timestamptz,
  answers jsonb NOT NULL DEFAULT '{}',
  revision integer NOT NULL DEFAULT 0,
  report jsonb,
  report_visible boolean NOT NULL DEFAULT false,
  accommodation boolean NOT NULL DEFAULT false
);
ALTER TABLE public.sentinel_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sentinel_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sentinel_forms, public.sentinel_sessions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.sentinel_forms, public.sentinel_sessions TO service_role;

CREATE FUNCTION public.sentinel_assignment_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public,pg_temp AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM public.sentinel_forms f WHERE f.assessment_version_id=NEW.scp_assessment_version_id
     AND (NOT f.assignments_enabled OR (f.preview_only AND NOT EXISTS (
       SELECT 1 FROM public.scp_fixture_access fa WHERE fa.employer_id=NEW.employer_id)))) THEN
    RAISE EXCEPTION 'SENTINEL_RELEASE_REQUIRED' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sentinel_assignment_guard BEFORE INSERT ON public.assessment_assignments
FOR EACH ROW EXECUTE FUNCTION public.sentinel_assignment_guard();
CREATE FUNCTION public.sentinel_allocate() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public,pg_temp AS $$
BEGIN
  INSERT INTO public.sentinel_sessions(attempt_id,recipient_user_id,assignment_id,version,items,duration_seconds)
  SELECT NEW.id,aa.recipient_user_id,aa.id,f.version,f.items,f.duration_seconds
  FROM public.sentinel_forms f JOIN public.assessment_assignments aa ON aa.id=NEW.assignment_id
  WHERE f.assessment_version_id=NEW.assessment_version_id;
  RETURN NEW;
END $$;
CREATE TRIGGER sentinel_allocate AFTER INSERT ON public.scp_attempts FOR EACH ROW EXECUTE FUNCTION public.sentinel_allocate();
-- Generic competency finalisation must never score Sentinel or add evidence.
CREATE FUNCTION public.sentinel_attempt_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public,pg_temp AS $$
BEGIN
  IF NEW.status='abandoned' THEN
    UPDATE public.sentinel_sessions SET status='abandoned',revision=revision+1 WHERE attempt_id=NEW.id AND status IN('ready','running');
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND EXISTS(SELECT 1 FROM public.sentinel_sessions WHERE attempt_id=NEW.id)
     AND current_setting('sentinel.finalising',true) IS DISTINCT FROM NEW.id::text THEN
    RAISE EXCEPTION 'SENTINEL_USE_TIMED_RUNNER' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sentinel_attempt_guard BEFORE UPDATE ON public.scp_attempts FOR EACH ROW EXECUTE FUNCTION public.sentinel_attempt_guard();

-- Minimum extension to the shared assignment path: protected Sentinel forms
-- count as real content. Everything else, including grants/purposes/tenant
-- checks, idempotency and application-state checks, remains in that function.
DO $$ DECLARE body text; patched text;
BEGIN
  body:=pg_get_functiondef('public.scp_employer_assign(uuid,uuid,text,timestamptz,text,text,uuid,text,uuid,uuid)'::regprocedure);
  patched:=replace(body,'IF NOT _has_items THEN','IF NOT _has_items AND NOT EXISTS (SELECT 1 FROM public.sentinel_forms sf WHERE sf.assessment_version_id = _assessment_version_id) THEN');
  IF patched=body THEN RAISE EXCEPTION 'SENTINEL_ASSIGNMENT_PRECONDITION'; END IF;
  EXECUTE patched;
END $$;

CREATE FUNCTION public.sentinel_catalog(_employer_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public,pg_temp AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('versionId',f.assessment_version_id,'version',f.version,
   'durationSeconds',f.duration_seconds,'assignable',f.assignments_enabled
    AND (NOT f.preview_only OR EXISTS(SELECT 1 FROM public.scp_fixture_access fa WHERE fa.employer_id=_employer_id))
    AND public.scp_grant_permits_assignment(_employer_id,av.definition_id,av.content_status,av.validation_status,false) IS NOT NULL)), '[]')
 FROM public.sentinel_forms f JOIN public.scp_assessment_versions av ON av.id=f.assessment_version_id
 WHERE EXISTS(SELECT 1 FROM public.employer_memberships m WHERE m.employer_id=_employer_id AND m.user_id=auth.uid() AND m.status='active');
$$;

CREATE FUNCTION public.sentinel_finish_internal(_attempt_id uuid, _timeout boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public,pg_temp AS $$
DECLARE s public.sentinel_sessions; correct_count int; answered_count int; end_time timestamptz;
BEGIN
 SELECT * INTO s FROM public.sentinel_sessions WHERE attempt_id=_attempt_id FOR UPDATE;
 IF s.status <> 'running' THEN RETURN; END IF;
 end_time:=least(clock_timestamp(),s.deadline);
 SELECT count(*) FILTER(WHERE s.answers->>(i->'question'->>'id')=i->>'key'),
 count(*) FILTER(WHERE s.answers ? (i->'question'->>'id')) INTO correct_count,answered_count
 FROM jsonb_array_elements(s.items) i;
 UPDATE public.sentinel_sessions SET status=CASE WHEN _timeout THEN 'timed_out' ELSE 'completed' END,
 finished_at=end_time,revision=revision+1,
 report=jsonb_build_object('version',s.version,'status',CASE WHEN _timeout THEN 'timed_out' ELSE 'completed' END,
  'correct',correct_count,'incorrect',answered_count-correct_count,'unanswered',20-answered_count,'total',20,
  'elapsedSeconds',greatest(0,extract(epoch FROM end_time-s.started_at)::int),'finishedAt',end_time,
  'durationSeconds',s.duration_seconds,'accommodation',s.accommodation)
 WHERE attempt_id=_attempt_id;
 PERFORM set_config('sentinel.finalising',_attempt_id::text,true);
 UPDATE public.scp_attempts SET status='scored',submitted_at=end_time,scored_at=end_time WHERE id=_attempt_id;
 UPDATE public.assessment_assignments SET completed_at=end_time WHERE id=s.assignment_id;
END $$;
REVOKE ALL ON FUNCTION public.sentinel_finish_internal(uuid,boolean) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.sentinel_session(_attempt_id uuid, _action text DEFAULT 'get',
 _question_id text DEFAULT NULL, _option_id text DEFAULT NULL, _revision int DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public,pg_temp AS $$
DECLARE s public.sentinel_sessions; aa public.assessment_assignments; opts jsonb; now_time timestamptz;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'SENTINEL_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 SELECT * INTO s FROM public.sentinel_sessions WHERE attempt_id=_attempt_id AND recipient_user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO aa FROM public.assessment_assignments WHERE id=s.assignment_id;
 now_time:=clock_timestamp();
 IF aa.status='cancelled' OR (aa.expires_at<=now_time AND s.status='ready') THEN
   UPDATE public.sentinel_sessions SET status='abandoned',revision=revision+1 WHERE attempt_id=_attempt_id AND status IN('ready','running');
 ELSIF s.status='running' AND now_time>=s.deadline THEN
   PERFORM public.sentinel_finish_internal(_attempt_id,true);
 ELSIF _action='start' AND s.status='ready' THEN
   UPDATE public.sentinel_sessions SET status='running',started_at=now_time,deadline=now_time+make_interval(secs=>duration_seconds),revision=revision+1 WHERE attempt_id=_attempt_id;
   UPDATE public.assessment_assignments SET started_at=now_time WHERE id=s.assignment_id;
 ELSIF _action='save' AND s.status='running' THEN
   SELECT i->'question'->'options' INTO opts FROM jsonb_array_elements(s.items) i WHERE i->'question'->>'id'=_question_id;
   IF opts IS NULL OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(opts) o WHERE o->>'id'=_option_id) THEN
     RAISE EXCEPTION 'SENTINEL_INVALID_OPTION' USING ERRCODE='22023'; END IF;
   IF s.answers->>_question_id = _option_id THEN NULL;
   ELSIF _revision IS DISTINCT FROM s.revision THEN RAISE EXCEPTION 'SENTINEL_REVISION_CONFLICT' USING ERRCODE='40001'; END IF;
   IF s.answers->>_question_id IS DISTINCT FROM _option_id THEN
   UPDATE public.sentinel_sessions SET answers=jsonb_set(answers,ARRAY[_question_id],to_jsonb(_option_id)),revision=revision+1 WHERE attempt_id=_attempt_id;
   END IF;
 ELSIF _action='finish' AND s.status='running' THEN
   PERFORM public.sentinel_finish_internal(_attempt_id,false);
 ELSIF _action NOT IN('get','start','save','finish') THEN
   RAISE EXCEPTION 'SENTINEL_INVALID_ACTION' USING ERRCODE='22023';
 END IF;
 SELECT * INTO s FROM public.sentinel_sessions WHERE attempt_id=_attempt_id;
 RETURN jsonb_build_object('attemptId',s.attempt_id,'language',aa.language,'version',s.version,'status',s.status,
 'durationSeconds',s.duration_seconds,'deadline',s.deadline,'serverNow',clock_timestamp(),'revision',s.revision,'answers',s.answers,
 'questions',CASE WHEN s.status='running' THEN (SELECT jsonb_agg(i->'question') FROM jsonb_array_elements(s.items) i) ELSE '[]'::jsonb END,
 'reportVisible',s.report_visible,'report',CASE WHEN s.report_visible THEN s.report ELSE NULL END);
END $$;

CREATE FUNCTION public.sentinel_report(_attempt_id uuid, _employer_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public,pg_temp AS $$
DECLARE s public.sentinel_sessions;
BEGIN
 SELECT ss.* INTO s FROM public.sentinel_sessions ss JOIN public.assessment_assignments aa ON aa.id=ss.assignment_id
 WHERE ss.attempt_id=_attempt_id AND auth.uid() IS NOT NULL AND (
  (_employer_id IS NULL AND ss.recipient_user_id=auth.uid()) OR
  (_employer_id=aa.employer_id AND public.scp_attempt_reports_readable(ss.attempt_id)));
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF s.status='running' AND clock_timestamp()>=s.deadline THEN
   PERFORM public.sentinel_finish_internal(_attempt_id,true);
   SELECT * INTO s FROM public.sentinel_sessions WHERE attempt_id=_attempt_id;
 END IF;
 RETURN jsonb_build_object('sentinel',true,'status',s.status,'report',CASE WHEN _employer_id IS NOT NULL OR s.report_visible THEN s.report ELSE NULL END,'reportVisible',s.report_visible);
END $$;
CREATE FUNCTION public.sentinel_employer_action(_attempt_id uuid,_action text,_duration_seconds int DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public,pg_temp AS $$
DECLARE s public.sentinel_sessions;
BEGIN
 SELECT ss.* INTO s FROM public.sentinel_sessions ss JOIN public.assessment_assignments aa ON aa.id=ss.assignment_id
 WHERE ss.attempt_id=_attempt_id AND EXISTS(SELECT 1 FROM public.employer_memberships m WHERE m.employer_id=aa.employer_id AND m.user_id=auth.uid() AND m.status='active' AND m.role IN('owner','admin')) AND public.scp_attempt_reports_readable(ss.attempt_id) FOR UPDATE OF ss;
 IF NOT FOUND THEN RAISE EXCEPTION 'SENTINEL_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 IF _action='release' AND s.report IS NOT NULL THEN UPDATE public.sentinel_sessions SET report_visible=true WHERE attempt_id=_attempt_id;
 ELSIF _action='accommodation' AND s.status='ready' AND _duration_seconds BETWEEN s.duration_seconds AND 7200 THEN
   UPDATE public.sentinel_sessions SET duration_seconds=_duration_seconds,accommodation=true WHERE attempt_id=_attempt_id;
   UPDATE public.scp_attempts SET accommodation_granted=true,accommodation_note='Authorised extended time' WHERE id=_attempt_id;
 ELSE RAISE EXCEPTION 'SENTINEL_INVALID_ACTION' USING ERRCODE='22023'; END IF;
END $$;
CREATE FUNCTION public.sentinel_review() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public,pg_temp AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.scp_can_author(auth.uid()) THEN RAISE EXCEPTION 'SENTINEL_AUTHOR_REQUIRED' USING ERRCODE='42501'; END IF;
 RETURN (SELECT jsonb_agg(to_jsonb(f)) FROM public.sentinel_forms f);
END $$;
CREATE FUNCTION public.sentinel_practice(_attempt_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public,pg_temp AS $$
 SELECT f.practice FROM public.sentinel_sessions s JOIN public.scp_attempts a ON a.id=s.attempt_id
 JOIN public.sentinel_forms f ON f.assessment_version_id=a.assessment_version_id
 WHERE s.attempt_id=_attempt_id AND s.recipient_user_id=auth.uid();
$$;
-- Erasure follows account closure; recruitment retention follows the assignment.
CREATE FUNCTION public.sentinel_erase_assignment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public,pg_temp AS $$
BEGIN
 DELETE FROM public.sentinel_sessions WHERE assignment_id=OLD.id; RETURN OLD;
END $$;
CREATE TRIGGER sentinel_erase_assignment BEFORE DELETE ON public.assessment_assignments FOR EACH ROW EXECUTE FUNCTION public.sentinel_erase_assignment();
-- Explicit revokes are also readable by the repository security audit.
REVOKE ALL ON FUNCTION public.sentinel_assignment_guard() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.sentinel_allocate() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.sentinel_attempt_guard() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.sentinel_catalog(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.sentinel_finish_internal(uuid,boolean) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.sentinel_session(uuid,text,text,text,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.sentinel_report(uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.sentinel_employer_action(uuid,text,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.sentinel_review() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.sentinel_practice(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.sentinel_erase_assignment() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sentinel_catalog(uuid),public.sentinel_session(uuid,text,text,text,int),public.sentinel_report(uuid,uuid),public.sentinel_employer_action(uuid,text,int),public.sentinel_review(),public.sentinel_practice(uuid) TO authenticated;

CREATE FUNCTION public.sentinel_status(_attempt_ids uuid[]) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public,pg_temp AS $$
DECLARE s public.sentinel_sessions; result jsonb:='[]'; employer_read boolean;
BEGIN
 FOR s IN SELECT * FROM public.sentinel_sessions ss WHERE ss.attempt_id=ANY(_attempt_ids)
   AND (ss.recipient_user_id=auth.uid() OR public.scp_attempt_reports_readable(ss.attempt_id)) LOOP
  IF s.status='running' AND clock_timestamp()>=s.deadline THEN
    PERFORM public.sentinel_finish_internal(s.attempt_id,true);
    SELECT * INTO s FROM public.sentinel_sessions WHERE attempt_id=s.attempt_id;
  END IF;
  employer_read:=public.scp_attempt_reports_readable(s.attempt_id);
  result:=result||jsonb_build_array(jsonb_build_object('attempt_id',s.attempt_id,
   'attempt_status',CASE WHEN s.status IN('ready','running') THEN 'in_progress' WHEN s.status='abandoned' THEN 'abandoned' ELSE 'scored' END,
   'answered',(SELECT count(*) FROM jsonb_object_keys(s.answers)),'total_items',20,
   'report_available',s.report IS NOT NULL AND (employer_read OR s.report_visible),
   'released_at',CASE WHEN s.report IS NOT NULL AND (employer_read OR s.report_visible) THEN s.finished_at ELSE NULL END,
   'name_sv','Sentinel – abstrakt problemlösning','name_en','Sentinel – Abstract Reasoning'));
 END LOOP;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.sentinel_status(uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sentinel_status(uuid[]) TO authenticated;

-- Content is imported separately into the protected table, never committed
-- with answer keys to this publicly readable source repository. No default
-- production form, release approval or assignment activation is fabricated.
DO $seed$ DECLARE d uuid; av uuid;
BEGIN
 INSERT INTO public.scp_assessment_definitions(family_id,slug,name_sv,name_en,purpose,designed_for)
 SELECT family_id,'abstract_reasoning_v1','Sentinel – abstrakt problemlösning','Sentinel – Abstract Reasoning','development_programme','recruitment_support'
 FROM public.scp_assessment_definitions WHERE slug='security-officer-recruitment' RETURNING id INTO d;
 INSERT INTO public.scp_assessment_versions(definition_id,version_number,content_status,validation_status,language_scope,notes)
 VALUES(d,1,'draft','design',ARRAY['sv-SE','en-GB'],'Original fixed-form pilot; private content import and content/privacy approval required; no norms.') RETURNING id INTO av;
 INSERT INTO public.scp_forms(assessment_version_id,slug,name_sv,name_en,target_minutes_min,target_minutes_max,randomise_within_block)
 VALUES(av,'sentinel-v1-a','Sentinel A','Sentinel A',25,25,false);
END $seed$;
