-- =============================================================================
-- ROLLBACK for 20261221090000_sp_open_uk_dubai_public_pilot.sql
-- =============================================================================
--
-- Returns the United Kingdom (GB, GB-NI) and Dubai (AE-DU), and the 44
-- definitions the migration opened, from public_pilot to internal_pilot:
-- members-only again, exactly as before the migration.
--
-- ── WHAT IT DOES NOT DO ─────────────────────────────────────────────────
--
-- It touches no claim. A holder who registered a UK or Dubai credential during
-- the public pilot keeps it, visible to them under the ownership rules, and can
-- still withdraw it, attach evidence and have it reviewed (the operation
-- policy of 20261220090000). What stops is NEW registration by anyone without
-- a pilot grant. No grant is created, restored or revoked: sp_pilot_members is
-- left exactly as it is.
--
-- It must run BEFORE the rollback of 20261220090000, which refuses while any
-- pack or definition is public_pilot.
--
-- One transaction; refuses unless the world is what the migration left.
-- =============================================================================

BEGIN;

CREATE TEMP TABLE _sp_pr4_opened (market_pack_code text NOT NULL, code text PRIMARY KEY)
  ON COMMIT DROP;
INSERT INTO _sp_pr4_opened (market_pack_code, code) VALUES
  ('GB', 'UK_SIA_LICENCE_SG'), ('GB', 'UK_SIA_LICENCE_DS'), ('GB', 'UK_SIA_LICENCE_CCTV'),
  ('GB', 'UK_SIA_LICENCE_CP'), ('GB', 'UK_SIA_LICENCE_CVIT'), ('GB', 'UK_SIA_LICENCE_KH'),
  ('GB', 'UK_SIA_LICENCE_NFL'),
  ('GB', 'UK_SIA_QUAL_SG'), ('GB', 'UK_SIA_QUAL_DS'), ('GB', 'UK_SIA_QUAL_CCTV'),
  ('GB', 'UK_SIA_QUAL_CP'), ('GB', 'UK_SIA_QUAL_CVIT'), ('GB', 'UK_SIA_TOP_UP'),
  ('GB-NI', 'UK_SIA_LICENCE_VI'),
  ('AE-DU', 'AE_DU_SIRA_CARD_GUARD'), ('AE-DU', 'AE_DU_SIRA_CARD_MONEY_TRANSPORT'),
  ('AE-DU', 'AE_DU_SIRA_CARD_EVENT_GUARD'), ('AE-DU', 'AE_DU_SIRA_CARD_BODYGUARD'),
  ('AE-DU', 'AE_DU_SIRA_CARD_WATCHMAN'), ('AE-DU', 'AE_DU_SIRA_CARD_SUPERVISOR'),
  ('AE-DU', 'AE_DU_SIRA_CARD_OPS_MANAGER'), ('AE-DU', 'AE_DU_SIRA_CARD_SECURITY_MANAGER'),
  ('AE-DU', 'AE_DU_SIRA_CARD_HEAD_OF_SECURITY'), ('AE-DU', 'AE_DU_SIRA_CARD_SYSTEMS_OPERATOR'),
  ('AE-DU', 'AE_DU_SIRA_CARD_SYSTEMS_TECHNICIAN'), ('AE-DU', 'AE_DU_SIRA_CARD_SYSTEMS_ENGINEER'),
  ('AE-DU', 'AE_DU_SIRA_CARD_TRAINER'), ('AE-DU', 'AE_DU_SIRA_CARD_EXPERT'),
  ('AE-DU', 'AE_DU_SIRA_CARD_CONSULTANT'),
  ('AE-DU', 'AE_DU_SIRA_GUARD_COURSE'), ('AE-DU', 'AE_DU_SUPERVISOR_COURSE'),
  ('AE-DU', 'AE_DU_OPS_MANAGER_COURSE'), ('AE-DU', 'AE_DU_SECURITY_MANAGER_COURSE'),
  ('AE-DU', 'AE_DU_SYSTEMS_OPERATOR_COURSE'), ('AE-DU', 'AE_DU_SYSTEMS_TECHNICIAN_COURSE'),
  ('AE-DU', 'AE_DU_SYSTEMS_ENGINEER_COURSE'), ('AE-DU', 'AE_DU_TRAINER_COURSE'),
  ('AE-DU', 'AE_DU_EVENTS_COURSE'), ('AE-DU', 'AE_DU_CASH_TRANSPORT_COURSE'),
  ('AE-DU', 'AE_DU_BASIC_FIRE_SAFETY'), ('AE-DU', 'AE_DU_BASIC_LIFE_SUPPORT'),
  ('AE-DU', 'AE_DU_PEOPLE_OF_DETERMINATION'), ('AE-DU', 'AE_DU_SPECIALIST_COURSE'),
  ('AE-DU', 'AE_DU_FITNESS_CHECKED');

CREATE TEMP TABLE _sp_pr4_rb_before ON COMMIT DROP AS
SELECT
  (SELECT md5(coalesce(string_agg(to_jsonb(c)::text, '|' ORDER BY c.id), ''))
     FROM public.sp_claims c) AS claims,
  (SELECT md5(coalesce(string_agg(to_jsonb(m)::text, '|' ORDER BY m.user_id, m.market_pack_code), ''))
     FROM public.sp_pilot_members m) AS grants,
  (SELECT md5(coalesce(string_agg(
       concat_ws('/', t.code, t.is_active, t.legal_review_state), '|' ORDER BY t.code), ''))
     FROM public.sp_credential_types t) AS approval_and_review;

DO $$
DECLARE
  _n int;
BEGIN
  SELECT count(*) INTO _n FROM public.sp_market_packs
   WHERE code IN ('GB', 'GB-NI', 'AE-DU') AND pilot_state = 'public_pilot' AND NOT is_active;
  IF _n <> 3 THEN
    RAISE EXCEPTION 'ROLLBACK REFUSED: expected GB, GB-NI and AE-DU in public pilot and inactive; found % of 3', _n;
  END IF;
  SELECT count(*) INTO _n
    FROM _sp_pr4_opened o
    JOIN public.sp_credential_types t
      ON t.code = o.code AND t.market_pack_code = o.market_pack_code
   WHERE t.pilot_state = 'public_pilot' AND NOT t.is_active;
  IF _n <> 44 THEN
    RAISE EXCEPTION 'ROLLBACK REFUSED: expected the 44 opened definitions in public pilot and inactive; found %', _n;
  END IF;
END $$;

UPDATE public.sp_credential_types t
   SET pilot_state = 'internal_pilot'
  FROM _sp_pr4_opened o
 WHERE t.code = o.code AND t.market_pack_code = o.market_pack_code
   AND t.pilot_state = 'public_pilot';

UPDATE public.sp_market_packs
   SET pilot_state = 'internal_pilot'
 WHERE code IN ('GB', 'GB-NI', 'AE-DU') AND pilot_state = 'public_pilot';

DO $$
DECLARE
  _b record;
BEGIN
  SELECT * INTO _b FROM _sp_pr4_rb_before;
  IF (SELECT count(*) FROM public.sp_market_packs
       WHERE code IN ('GB', 'GB-NI', 'AE-DU') AND pilot_state = 'internal_pilot') <> 3
  OR (SELECT count(*) FROM public.sp_credential_types t JOIN _sp_pr4_opened o ON o.code = t.code
       WHERE t.pilot_state = 'internal_pilot') <> 44 THEN
    RAISE EXCEPTION 'ROLLBACK FAILED: the three packs and 44 definitions are not all back in internal pilot';
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
  RAISE NOTICE 'SP_OPEN_UK_DUBAI_ROLLBACK ok: the UK and Dubai are members-only again; claims and grants untouched';
END $$;

COMMIT;
