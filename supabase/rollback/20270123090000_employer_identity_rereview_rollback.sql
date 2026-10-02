-- Rollback of 20270123090000_employer_identity_rereview.
--
-- !! THIS REOPENS P1-I !! An approved organisation can again take another
-- organisation's identity without review. Run it ONLY in an isolated test
-- database (scripts/db-test.sh cycles it). Restores the hosted body exactly
-- (md5(prosrc) e3fd899458d95fe8c00c5f4dfa082fa8).
CREATE OR REPLACE FUNCTION public.employers_validate_before_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Status invariant (H3.3 database-integrity fix): no caller, of any
  -- role, including a verified platform admin, may change an existing
  -- employer's status except by executing inside moderate_employer(),
  -- which sets this exact transaction-local marker immediately before its
  -- own internal UPDATE. A client can never set this marker itself.
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF current_setting('app.employer_moderation_in_progress', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'employers.status can only be changed via moderate_employer()'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND NOT public.is_platform_admin(auth.uid()) THEN
    IF NEW.slug IS DISTINCT FROM OLD.slug THEN
      RAISE EXCEPTION 'slug cannot be changed by an employer member'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$
;

DO $$ BEGIN
  IF md5((SELECT prosrc FROM pg_proc WHERE proname = 'employers_validate_before_write'
            AND pronamespace = 'public'::regnamespace)) <> 'e3fd899458d95fe8c00c5f4dfa082fa8' THEN
    RAISE EXCEPTION 'EMPLOYER_IDENTITY_REREVIEW_ROLLBACK: the restored body is not the hosted one';
  END IF;
  RAISE NOTICE 'EMPLOYER_IDENTITY_REREVIEW_ROLLBACK ok: the pre-fix body is restored';
END $$;
