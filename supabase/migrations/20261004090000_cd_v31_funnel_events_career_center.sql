-- Security Career Center -- add the two Career Center funnel events to the
-- allowlist (Career Center product completion, section 11 "Measurement").
--
-- cd_v31_funnel_events.event_name is CHECK-constrained to an explicit list
-- mirroring v31-feedback.functions.ts's FUNNEL_EVENT_NAMES. Additive only:
-- drop and recreate the same CHECK with two more allowed values, exactly as
-- 20260816162000_cd_v31_funnel_event_result_downloaded.sql did for
-- 'result_downloaded'. The SECURITY DEFINER entry point validates against
-- cd_v31_funnel_event_names(), so that function must be extended in the same
-- migration. Nothing else about the table, its policies or its entry point
-- changes.
--
-- Why two new names rather than reusing existing ones:
--
--   'career_center_test_started' is the Career Center CTA click. It is NOT
--   'assessment_started', which the assessment flow fires when the first
--   question is answered. The gap between the two IS the hub's conversion
--   drop-off; collapsing them into one name deletes that measurement.
--
--   'career_filter_used' has no existing analogue at all.
--
-- The other two Career Center events reuse names already on this list --
-- 'profession_explored' for a guide being opened and 'assessment_completed'
-- for the test being finished -- so the funnel stays one vocabulary.
--
-- Nothing renders differently before or after this runs: the tracker is
-- fire-and-forget and never throws to its caller, so until this is applied
-- the two new events are simply rejected and logged.

ALTER TABLE public.cd_v31_funnel_events
  DROP CONSTRAINT cd_v31_funnel_events_event_name_check;

ALTER TABLE public.cd_v31_funnel_events
  ADD CONSTRAINT cd_v31_funnel_events_event_name_check
  CHECK (event_name = ANY (ARRAY[
    'assessment_started'::text,
    'assessment_completed'::text,
    'career_context_completed'::text,
    'result_viewed'::text,
    'profession_explored'::text,
    'pathway_opened'::text,
    'jobs_clicked'::text,
    'career_card_opened'::text,
    'career_card_generated'::text,
    'share_initiated'::text,
    'image_saved'::text,
    'save_journey_clicked'::text,
    'result_claimed'::text,
    'feedback_submitted'::text,
    'result_downloaded'::text,
    'career_center_test_started'::text,
    'career_filter_used'::text
  ]));

-- Keep the RPC allowlist identical to the table CHECK. The security-hardening
-- suite asserts both directions of this invariant (S2.16/S2.17), and the RPC
-- rejects any event name not returned here before attempting the insert.
CREATE OR REPLACE FUNCTION public.cd_v31_funnel_event_names()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT ARRAY[
    'assessment_started', 'assessment_completed', 'career_context_completed',
    'result_viewed', 'profession_explored', 'pathway_opened', 'jobs_clicked',
    'career_card_opened', 'career_card_generated', 'share_initiated',
    'image_saved', 'save_journey_clicked', 'result_claimed',
    'feedback_submitted', 'result_downloaded',
    'career_center_test_started', 'career_filter_used'
  ]::text[];
$$;
