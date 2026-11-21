-- Rollback for 20270328090000_security_work_monitoring_impact.sql.
-- Pre-adoption only: refuses while any approved host, official feed source,
-- fetched item, fetch run, cluster, impact brief, review flag or application
-- exists. Risks and actions created from a brief are ordinary records and are
-- never touched. Remove dependent application code before executing it.
BEGIN;
LOCK TABLE public.sw_sources, public.sw_source_items IN SHARE ROW EXCLUSIVE MODE;
DO $preserve$
DECLARE t text; adopted boolean;
BEGIN
  FOREACH t IN ARRAY ARRAY['sw_feed_hosts', 'sw_fetch_runs', 'sw_story_clusters', 'sw_cluster_items', 'sw_change_briefs', 'sw_review_flags', 'sw_change_brief_applications'] LOOP
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I)', t) INTO adopted;
    IF adopted THEN RAISE EXCEPTION 'SW_MONITORING_ROLLBACK_DATA_PRESENT: preserve adopted records' USING ERRCODE = '23514'; END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM public.sw_sources WHERE source_type = 'official_feed' OR feed_url IS NOT NULL OR last_checked_at IS NOT NULL)
     OR EXISTS (SELECT 1 FROM public.sw_source_items WHERE retrieval_status = 'fetched' OR content_hash IS NOT NULL OR observed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'SW_MONITORING_ROLLBACK_DATA_PRESENT: preserve adopted records' USING ERRCODE = '23514';
  END IF;
END $preserve$;
DROP FUNCTION public.sw_apply_change_brief(uuid, uuid, integer, uuid, jsonb);
DROP FUNCTION sw_private.apply_change_brief(uuid, uuid, integer, uuid, jsonb);
DROP FUNCTION public.sw_record_fetch(uuid, uuid, uuid, text, text, text);
DROP FUNCTION sw_private.record_fetch(uuid, uuid, uuid, text, text, text);
DROP TABLE public.sw_change_brief_applications;
DROP TABLE public.sw_review_flags;
DROP TABLE public.sw_change_briefs;
DROP TABLE public.sw_cluster_items;
DROP TABLE public.sw_story_clusters;
DROP TABLE public.sw_fetch_runs;
DROP FUNCTION sw_private.guard_review_flag();
DROP FUNCTION sw_private.supersede_previous_brief();
DROP FUNCTION sw_private.guard_change_brief();
DROP FUNCTION sw_private.story_key(text);
DROP TRIGGER sw_07_fetched_item ON public.sw_source_items;
DROP FUNCTION sw_private.guard_fetched_item();
DROP TRIGGER sw_09_feed_source ON public.sw_sources;
DROP FUNCTION sw_private.guard_feed_source();
DROP FUNCTION sw_private.feed_host(text);
DROP TABLE sw_private.fetch_intents;
ALTER TABLE public.sw_source_items
  DROP CONSTRAINT sw_source_items_retrieval_status_check,
  DROP COLUMN observed_at,
  DROP COLUMN content_hash,
  ADD CONSTRAINT sw_source_items_retrieval_status_check CHECK (retrieval_status = ANY (ARRAY['manual'::text, 'extracted'::text]));
ALTER TABLE public.sw_sources
  DROP CONSTRAINT sw_sources_feed_url_required,
  DROP CONSTRAINT sw_sources_source_type_check,
  DROP COLUMN feed_url,
  DROP COLUMN poll_target_minutes,
  DROP COLUMN last_checked_at,
  DROP COLUMN feed_etag,
  DROP COLUMN feed_last_modified,
  ADD CONSTRAINT sw_sources_source_type_check CHECK (source_type = ANY (ARRAY['manual'::text, 'url_reference'::text, 'document'::text]));
DROP TABLE public.sw_feed_hosts;
COMMIT;
