-- Rollback of 20270124090000_bcp_conduct_exposure_is_durable.
--
-- Drops the exposure triggers, their functions and the exposure record. After
-- it, reopening falls back to 20270122090000's check alone ("every other
-- position is locked now"), which a later join can make false again. Nothing
-- else is touched: no position, entry, panel or event row changes.

DROP TRIGGER IF EXISTS bcp_conduct_positions_exposure_record ON public.bcp_conduct_positions;
DROP TRIGGER IF EXISTS bcp_conduct_positions_exposure_guard ON public.bcp_conduct_positions;
DROP FUNCTION IF EXISTS public.bcp_conduct_position_exposure_record();
DROP FUNCTION IF EXISTS public.bcp_conduct_position_exposure_guard();
DROP TABLE IF EXISTS public.bcp_conduct_position_exposures;
DROP FUNCTION IF EXISTS public.bcp_guard_conduct_exposure_append_only();

DO $$
BEGIN
  IF to_regclass('public.bcp_conduct_position_exposures') IS NOT NULL
     OR EXISTS (SELECT 1 FROM pg_trigger WHERE NOT tgisinternal
                 AND tgname IN ('bcp_conduct_positions_exposure_guard', 'bcp_conduct_positions_exposure_record')) THEN
    RAISE EXCEPTION 'BCP_CONDUCT_EXPOSURE_ROLLBACK: the exposure record is still in place';
  END IF;
  RAISE NOTICE 'BCP_CONDUCT_EXPOSURE_ROLLBACK ok: exposure record and triggers removed';
END $$;
