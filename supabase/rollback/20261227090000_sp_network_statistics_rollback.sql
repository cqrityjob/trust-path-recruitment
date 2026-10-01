-- Roll back 20261227090000_sp_network_statistics.
--
-- Drops the public statistics function, the admin switch, and the two private
-- tables. Nothing else depends on them: no Passport table, policy or grant was
-- changed by the migration. Roll the application back first, or together; until
-- then the homepage and Passport page read a missing function as "unavailable"
-- and draw nothing.
DROP FUNCTION IF EXISTS public.sp_set_network_stats_display(text, text);
DROP FUNCTION IF EXISTS public.sp_network_stats();
DROP TABLE IF EXISTS public.sp_statistics_exclusions;
DROP TABLE IF EXISTS public.sp_network_stats_policy;
