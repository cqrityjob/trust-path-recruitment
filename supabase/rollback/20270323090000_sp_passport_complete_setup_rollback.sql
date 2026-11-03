-- Roll back 20270323090000_sp_passport_complete_setup.
--
-- Drops the /passport/start completion and the profile completion guard. It
-- stores nothing of its own, so the rollback never refuses: profiles it
-- completed stay completed and declared, and numbers the trigger assigned stay
-- assigned (a number is never taken back). Without the guard a client role can
-- again write `onboarding_state = 'completed'` to its own profile, as before
-- this migration. Roll back the application release that calls
-- sp_passport_complete_setup first.
--
-- No BEGIN/COMMIT of its own, so a test can run the real file inside its
-- transaction.
DROP TRIGGER IF EXISTS sp_profile_completion_guard ON public.sp_passport_profiles;
DROP FUNCTION IF EXISTS public.sp_passport_completion_guard();
DROP FUNCTION IF EXISTS public.sp_passport_complete_setup(boolean);
