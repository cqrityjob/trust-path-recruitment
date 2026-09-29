-- Roll back 20261222090000_cd_access_policy.
--
-- Drops the release-control table and its three functions. The application
-- then falls back to the behaviour before the migration ONLY once the
-- application is also rolled back (the server functions call
-- cd_access_state() and cd_v31_may_start()); until then the availability
-- read fails closed. Roll the application back first, or together.
--
-- REFUSES while the state is 'public': rolling this back would silently close
-- the analysis to every signed-in candidate again. Set the state back to
-- internal_test or paused deliberately first, so the closing is recorded.
DO $$
DECLARE _state text;
BEGIN
  IF to_regclass('public.cd_access_policy') IS NULL THEN
    RAISE NOTICE 'cd_access_policy absent; nothing to roll back';
    RETURN;
  END IF;
  SELECT state INTO _state FROM public.cd_access_policy WHERE singleton;
  IF _state = 'public' THEN
    RAISE EXCEPTION 'ROLLBACK REFUSED: Career Discovery is public. Set the state to internal_test or paused first, so that closing it is a recorded decision.';
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.cd_set_access_state(text, text);
DROP FUNCTION IF EXISTS public.cd_v31_may_start(uuid);
DROP FUNCTION IF EXISTS public.cd_access_state();
DROP TABLE IF EXISTS public.cd_access_policy;
