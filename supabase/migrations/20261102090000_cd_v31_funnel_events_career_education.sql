-- Career Center pilot -- add one funnel event for the education surface.
--
-- cd_v31_funnel_events.event_name is CHECK-constrained to an explicit list
-- mirroring v31-feedback.functions.ts's FUNNEL_EVENT_NAMES. Additive only:
-- drop and recreate the same CHECK with one more allowed value, exactly as
-- 20261004090000_cd_v31_funnel_events_career_center.sql did for the two
-- Career Center events and 20260816162000 did for 'result_downloaded'. The
-- SECURITY DEFINER entry point validates against cd_v31_funnel_event_names(),
-- so that function is extended in the same migration. Nothing else about the
-- table, its policies or its entry point changes. No object is introduced.
--
-- ── WHY THIS EVENT EXISTS ────────────────────────────────────────────────
--
-- CQrityjob intends to place paid training providers on profession guides.
-- The rule that makes that acceptable is that payment may never influence
-- which professions are recommended, which career routes are shown, or the
-- order education appears in -- and the rule has to be AUDITABLE, not merely
-- asserted. That requires organic and sponsored placements to be measurable
-- as separate populations.
--
-- 'career_education_opened' carries a 'placement' detail of exactly
-- 'organic' or 'sponsored' (see src/lib/career-center/analytics.ts), so the
-- two can be counted, compared and reported on independently. No existing
-- event name means "a reader opened a training offer", and overloading
-- 'jobs_clicked' or 'pathway_opened' would put two different actions in one
-- bucket and destroy the very comparison this exists to make.
--
-- The detail column already stores a flat jsonb object of scalars; nothing
-- about its shape changes here.
--
-- Nothing renders differently before or after this runs: the tracker is
-- fire-and-forget and never throws to its caller, so until this is applied
-- the new event is simply rejected and logged. Every other event is
-- unaffected.

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
    'career_filter_used'::text,
    'career_education_opened'::text
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
    'career_center_test_started', 'career_filter_used',
    'career_education_opened'
  ]::text[];
$$;
