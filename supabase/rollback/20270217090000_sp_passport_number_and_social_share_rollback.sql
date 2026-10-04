-- Roll back 20270217090000_sp_passport_number_and_social_share.
--
-- Restores sp_network_stats() to the staff-excluding rule of 20261227090000,
-- then drops the public social share, the number and the founder designation.
--
-- REFUSES to run while it would destroy holder data: any Passport number (the
-- founder's #1 included) or any public social share still on record. Passport
-- numbers are identities, and a share is something the holder published; a
-- rollback that silently erased them would be a second, unrecorded decision.
-- To go ahead deliberately, in the same session first:
--
--     SET app.sp_rollback_confirm = 'drop-numbers-and-shares';
--
-- Roll the application back first, or together: the sharing page, the public
-- share page and the card read these objects.
DO $guard$
DECLARE
  _numbers integer;
  _shares integer;
BEGIN
  IF to_regclass('public.sp_passport_numbers') IS NULL THEN
    RAISE NOTICE 'SP_NUMBER_ROLLBACK: 20270217090000 is not applied; nothing to do';
    RETURN;
  END IF;
  SELECT count(*) INTO _numbers FROM public.sp_passport_numbers;
  SELECT count(*) INTO _shares FROM public.sp_social_shares;
  IF (_numbers > 0 OR _shares > 0)
     AND coalesce(current_setting('app.sp_rollback_confirm', true), '') <> 'drop-numbers-and-shares' THEN
    RAISE EXCEPTION
      'SP_NUMBER_ROLLBACK_REFUSED: % Passport number(s) and % public social share(s) would be destroyed. Set app.sp_rollback_confirm = ''drop-numbers-and-shares'' to proceed deliberately.',
      _numbers, _shares USING ERRCODE = 'restrict_violation';
  END IF;
END
$guard$;

DROP FUNCTION IF EXISTS public.sp_get_social_share(text, boolean);
DROP FUNCTION IF EXISTS public.sp_list_my_social_shares();
DROP FUNCTION IF EXISTS public.sp_revoke_social_share(text);
DROP FUNCTION IF EXISTS public.sp_create_social_share(uuid[], text, integer, text, uuid);
DROP TABLE IF EXISTS public.sp_social_share_items;
DROP TABLE IF EXISTS public.sp_social_shares;

-- The count's previous rule (every staff account excluded), verbatim from
-- 20261227090000. It does not read the number or the founder designation.
CREATE OR REPLACE FUNCTION public.sp_network_stats()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _display   text;
  _min       integer;
  _passports integer;
  _creds     integer;
  _markets   jsonb;
  _other     boolean;
BEGIN
  SELECT p.display, p.min_group_size INTO _display, _min
    FROM public.sp_network_stats_policy p WHERE p.singleton;

  -- Fails closed: no row, or hidden, publishes nothing -- not even zero.
  IF _display IS NULL OR _display = 'hidden' THEN
    RETURN jsonb_build_object('display', 'hidden');
  END IF;
  _min := greatest(coalesce(_min, 5), 5);

  WITH counted AS (
    SELECT pr.holder_user_id, pr.jurisdiction_code, pr.work_location_confirmed_at
      FROM public.sp_passport_profiles pr
     WHERE pr.onboarding_state = 'completed'
       AND pr.declared_accurate_at IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.user_roles r
                        WHERE r.user_id = pr.holder_user_id)
       AND NOT EXISTS (SELECT 1 FROM public.sp_statistics_exclusions x
                        WHERE x.holder_user_id = pr.holder_user_id)
  ),
  by_market AS (
    SELECT c.jurisdiction_code AS code, count(*) AS n
      FROM counted c
     WHERE c.work_location_confirmed_at IS NOT NULL
       AND c.jurisdiction_code IS NOT NULL
     GROUP BY c.jurisdiction_code
  )
  SELECT
    (SELECT count(*) FROM counted),
    (SELECT count(*) FROM public.sp_claims cl
      WHERE cl.lifecycle_state = 'active'
        AND EXISTS (SELECT 1 FROM counted c WHERE c.holder_user_id = cl.holder_user_id)),
    -- Alphabetical by code: an order that carries no size information.
    coalesce((SELECT jsonb_agg(m.code ORDER BY m.code) FROM by_market m WHERE m.n >= _min),
             '[]'::jsonb),
    EXISTS (SELECT 1 FROM by_market m WHERE m.n < _min)
  INTO _passports, _creds, _markets, _other;

  RETURN jsonb_build_object(
    'display',     _display,
    'passports',   _passports,
    'credentials', _creds,
    'markets',     _markets,
    'otherMarkets', _other
  );
END;
$$;

DROP TRIGGER IF EXISTS sp_passport_number_on_complete_trg ON public.sp_passport_profiles;
DROP FUNCTION IF EXISTS public.sp_passport_number_on_complete();
DROP FUNCTION IF EXISTS public.sp_my_passport_number();
DROP FUNCTION IF EXISTS public.sp_designate_founder(uuid);
DROP FUNCTION IF EXISTS public.sp_assign_passport_number(uuid);
DROP FUNCTION IF EXISTS public.sp_network_counts_holder(uuid);
DROP TABLE IF EXISTS public.sp_passport_numbers;
DROP TABLE IF EXISTS public.sp_passport_numbers_retired;
DROP FUNCTION IF EXISTS public.sp_passport_numbers_retire();
DROP SEQUENCE IF EXISTS public.sp_passport_number_seq;
