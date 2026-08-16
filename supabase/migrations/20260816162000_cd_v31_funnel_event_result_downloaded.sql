-- Security Career Discovery v3.1 -- add 'result_downloaded' to the funnel
-- event allowlist (Final Candidate Result Delivery & Save Flow Fix, Anonymous
-- Result Actions).
--
-- cd_v31_funnel_events.event_name is CHECK-constrained to an explicit list
-- mirroring v31-feedback.functions.ts's FUNNEL_EVENT_NAMES. Additive only:
-- drop and recreate the same CHECK with one more allowed value, nothing else
-- about the table changes.

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
    'result_downloaded'::text
  ]));
