-- =============================================================================
-- ROLLBACK for 20270220090000_sp_open_abu_dhabi_public_pilot.sql
-- =============================================================================
--
-- Returns Abu Dhabi (AE-AZ) and its seven definitions from public_pilot to
-- closed, the emirate to inactive, and removes the fourteen organisation-role
-- rows the migration added. Exactly the state 20260914092000 left.
--
-- ── WHAT IT DOES NOT DO ─────────────────────────────────────────────────
--
-- It touches no claim. A holder who registered an Abu Dhabi licence during the
-- public pilot keeps it, visible to them under the ownership rules, and can
-- still withdraw it, attach evidence and have it reviewed (the operation policy
-- of 20261220090000). What stops is NEW registration. No grant is created,
-- restored or revoked. No approval or review state moves.
--
-- A rollback that removed the issuer roles while shared Abu Dhabi claims exist
-- would take the issuer line off every recipient view of them. So it REFUSES
-- while any Abu Dhabi claim exists, unless the operator opts in with
--   SET LOCAL sp.rollback_may_strip_abu_dhabi_issuer = 'yes';
-- after reading this. The claims themselves are never deleted.
--
-- It must run BEFORE the rollback of 20261221090000 (whose postflight requires
-- Abu Dhabi closed) and therefore before the rollback of 20261220090000.
--
-- One transaction; refuses unless the world is what the migration left.
-- =============================================================================

BEGIN;

CREATE TEMP TABLE _sp_az_opened (code text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO _sp_az_opened (code) VALUES
  ('AE_AZ_PSBD_LICENCE_GUARD'), ('AE_AZ_PSBD_LICENCE_CIT'), ('AE_AZ_PSBD_LICENCE_BANKS'),
  ('AE_AZ_PSBD_LICENCE_EVENT'), ('AE_AZ_PSBD_LICENCE_SUPERVISOR'),
  ('AE_AZ_PSBD_LICENCE_MANAGER'), ('AE_AZ_PSBD_LICENCE_TRAINER');

CREATE TEMP TABLE _sp_az_rb_before ON COMMIT DROP AS
SELECT
  (SELECT md5(coalesce(string_agg(to_jsonb(c)::text, '|' ORDER BY c.id), ''))
     FROM public.sp_claims c) AS claims,
  (SELECT md5(coalesce(string_agg(to_jsonb(m)::text, '|' ORDER BY m.user_id, m.market_pack_code), ''))
     FROM public.sp_pilot_members m) AS grants,
  (SELECT md5(coalesce(string_agg(
       concat_ws('/', t.code, t.is_active, t.legal_review_state), '|' ORDER BY t.code), ''))
     FROM public.sp_credential_types t) AS approval_and_review,
  (SELECT md5(coalesce(string_agg(to_jsonb(r)::text, '|' ORDER BY r.credential_code, r.role), ''))
     FROM public.sp_credential_organisation_roles r
    WHERE r.credential_code NOT IN (SELECT code FROM _sp_az_opened)) AS other_roles;

DO $$
DECLARE _n int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.sp_market_packs
                  WHERE code = 'AE-AZ' AND pilot_state = 'public_pilot' AND NOT is_active) THEN
    RAISE EXCEPTION 'ROLLBACK REFUSED: expected AE-AZ in public pilot and inactive';
  END IF;
  SELECT count(*) INTO _n FROM _sp_az_opened o
    JOIN public.sp_credential_types t ON t.code = o.code AND t.market_pack_code = 'AE-AZ'
   WHERE t.pilot_state = 'public_pilot' AND NOT t.is_active;
  IF _n <> 7 THEN
    RAISE EXCEPTION 'ROLLBACK REFUSED: expected the 7 opened definitions in public pilot and inactive; found %', _n;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sp_sub_jurisdictions WHERE code = 'AE-AZ' AND is_active) THEN
    RAISE EXCEPTION 'ROLLBACK REFUSED: expected the AE-AZ emirate active';
  END IF;
  IF (SELECT count(*) FROM public.sp_credential_organisation_roles
       WHERE credential_code IN (SELECT code FROM _sp_az_opened)) <> 14 THEN
    RAISE EXCEPTION 'ROLLBACK REFUSED: expected exactly the 14 organisation roles the migration added';
  END IF;
  SELECT count(*) INTO _n FROM public.sp_claims WHERE sub_jurisdiction_code = 'AE-AZ';
  IF _n > 0 AND coalesce(current_setting('sp.rollback_may_strip_abu_dhabi_issuer', true), '') <> 'yes' THEN
    RAISE EXCEPTION 'ROLLBACK REFUSED: % Abu Dhabi claim(s) exist and would lose their issuer line on every recipient view; SET LOCAL sp.rollback_may_strip_abu_dhabi_issuer = ''yes'' to proceed anyway (the claims are kept)', _n;
  END IF;
END $$;

DELETE FROM public.sp_credential_organisation_roles
 WHERE credential_code IN (SELECT code FROM _sp_az_opened);

UPDATE public.sp_credential_types t SET pilot_state = 'closed'
  FROM _sp_az_opened o
 WHERE t.code = o.code AND t.market_pack_code = 'AE-AZ' AND t.pilot_state = 'public_pilot';

UPDATE public.sp_market_packs SET pilot_state = 'closed'
 WHERE code = 'AE-AZ' AND pilot_state = 'public_pilot';

UPDATE public.sp_sub_jurisdictions SET is_active = false
 WHERE code = 'AE-AZ' AND is_active;

DO $$
DECLARE _b record;
BEGIN
  SELECT * INTO _b FROM _sp_az_rb_before;
  IF (SELECT pilot_state FROM public.sp_market_packs WHERE code = 'AE-AZ') <> 'closed'
  OR (SELECT count(*) FROM public.sp_credential_types WHERE market_pack_code = 'AE-AZ' AND pilot_state = 'closed') <> 7
  OR (SELECT is_active FROM public.sp_sub_jurisdictions WHERE code = 'AE-AZ')
  OR EXISTS (SELECT 1 FROM public.sp_credential_organisation_roles
              WHERE credential_code IN (SELECT code FROM _sp_az_opened)) THEN
    RAISE EXCEPTION 'ROLLBACK FAILED: Abu Dhabi is not closed, inactive and role-less again';
  END IF;
  IF (SELECT count(*) FROM public.sp_market_packs WHERE pilot_state = 'public_pilot') <> 3
  OR (SELECT count(*) FROM public.sp_credential_types WHERE pilot_state = 'public_pilot') <> 44 THEN
    RAISE EXCEPTION 'ROLLBACK FAILED: the UK and Dubai public pilot is not exactly 3 packs and 44 definitions';
  END IF;
  IF (SELECT md5(coalesce(string_agg(to_jsonb(c)::text, '|' ORDER BY c.id), ''))
        FROM public.sp_claims c) IS DISTINCT FROM _b.claims THEN
    RAISE EXCEPTION 'ROLLBACK FAILED: a claim changed';
  END IF;
  IF (SELECT md5(coalesce(string_agg(to_jsonb(m)::text, '|' ORDER BY m.user_id, m.market_pack_code), ''))
        FROM public.sp_pilot_members m) IS DISTINCT FROM _b.grants THEN
    RAISE EXCEPTION 'ROLLBACK FAILED: a pilot grant changed';
  END IF;
  IF (SELECT md5(coalesce(string_agg(
         concat_ws('/', t.code, t.is_active, t.legal_review_state), '|' ORDER BY t.code), ''))
        FROM public.sp_credential_types t) IS DISTINCT FROM _b.approval_and_review THEN
    RAISE EXCEPTION 'ROLLBACK FAILED: a definition''s approval or legal review changed';
  END IF;
  IF (SELECT md5(coalesce(string_agg(to_jsonb(r)::text, '|' ORDER BY r.credential_code, r.role), ''))
        FROM public.sp_credential_organisation_roles r
       WHERE r.credential_code NOT IN (SELECT code FROM _sp_az_opened)) IS DISTINCT FROM _b.other_roles THEN
    RAISE EXCEPTION 'ROLLBACK FAILED: an organisation role outside Abu Dhabi changed';
  END IF;
  RAISE NOTICE 'SP_OPEN_ABU_DHABI_ROLLBACK ok: Abu Dhabi is closed again; claims, grants, approval and review untouched';
END $$;

COMMIT;
