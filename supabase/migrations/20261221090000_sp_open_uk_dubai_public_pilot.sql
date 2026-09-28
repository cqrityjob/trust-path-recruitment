-- =============================================================================
-- Security Passport -- open the United Kingdom and Dubai as a PUBLIC PILOT
-- =============================================================================
--
-- PR 4 of the completion work order (docs/passport/completion-work-order.md,
-- revision 3). DATA ONLY: no object is created, replaced or dropped. It needs
-- 20261220090000 (the public_pilot state) and refuses to run without it.
--
-- ── OWNER DECISION D2 -- PREPARED, NOT YET GIVEN ────────────────────────
--
-- "Ordinary registered users register supported credentials in Sweden, India,
-- the UK (preserving Northern Ireland distinctions) and Dubai, UAE without
-- individual pilot grants. 'Pilot' describes product maturity. It must not
-- mean that I manually approve each user." (owner, 2026-09-27)
--
-- D2 names the definitions that open. The list below is the PREPARED DEFAULT:
-- exactly the 44 definitions the owner already authorised for the internal
-- pilot (Route A, 2026-09-18) -- all 13 of Great Britain, Northern Ireland's
-- one, and all 30 of Dubai. Striking a code from the list holds that
-- definition back: it stays internal_pilot inside a public-pilot pack, which
-- neither route admits, so nobody can newly register it. Merging this file is
-- the owner's D2 decision and the production release (D3) at once.
--
-- ── WHAT CHANGES, AND WHAT DOES NOT ─────────────────────────────────────
--
--   changes   sp_market_packs.pilot_state      GB, GB-NI, AE-DU: internal_pilot
--                                              -> public_pilot
--             sp_credential_types.pilot_state  the 44 below: internal_pilot
--                                              -> public_pilot
--   unchanged is_active (false on all of them), legal_review_state (pending on
--             all of them), every claim, every professional-title rule, every
--             pilot grant (sp_pilot_members stays as history), Abu Dhabi and
--             every other emirate (closed), Sweden, India and the
--             international catalogue.
--
-- Opening a market changes catalogue availability and permission to register
-- (concepts 2 and 3 of the work order). It changes nothing about trust, the
-- legal review or anyone's permission to work (4, 5 and 6), and the
-- postflight below proves each of those stood still.
--
-- One transaction: the change and its proof commit together or not at all.
--
-- Rollback: supabase/rollback/20261221090000_sp_open_uk_dubai_public_pilot_rollback.sql
-- =============================================================================

BEGIN;

CREATE TEMP TABLE _sp_pr4_open (market_pack_code text NOT NULL, code text PRIMARY KEY)
  ON COMMIT DROP;
INSERT INTO _sp_pr4_open (market_pack_code, code) VALUES
  -- Great Britain: 7 licences, 6 licence-linked qualifications.
  ('GB', 'UK_SIA_LICENCE_SG'), ('GB', 'UK_SIA_LICENCE_DS'), ('GB', 'UK_SIA_LICENCE_CCTV'),
  ('GB', 'UK_SIA_LICENCE_CP'), ('GB', 'UK_SIA_LICENCE_CVIT'), ('GB', 'UK_SIA_LICENCE_KH'),
  ('GB', 'UK_SIA_LICENCE_NFL'),
  ('GB', 'UK_SIA_QUAL_SG'), ('GB', 'UK_SIA_QUAL_DS'), ('GB', 'UK_SIA_QUAL_CCTV'),
  ('GB', 'UK_SIA_QUAL_CP'), ('GB', 'UK_SIA_QUAL_CVIT'), ('GB', 'UK_SIA_TOP_UP'),
  -- Northern Ireland: vehicle immobilisation, licensed there and nowhere else.
  ('GB-NI', 'UK_SIA_LICENCE_VI'),
  -- Dubai: 15 SIRA cadre cards, 15 courses and checks.
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

-- What must stand still, fingerprinted BEFORE anything moves.
CREATE TEMP TABLE _sp_pr4_before ON COMMIT DROP AS
SELECT
  (SELECT md5(coalesce(string_agg(to_jsonb(c)::text, '|' ORDER BY c.id), ''))
     FROM public.sp_claims c) AS claims,
  (SELECT md5(coalesce(string_agg(to_jsonb(t)::text, '|' ORDER BY t.code), ''))
     FROM public.sp_professional_titles t) AS titles,
  (SELECT md5(coalesce(string_agg(to_jsonb(m)::text, '|' ORDER BY m.user_id, m.market_pack_code), ''))
     FROM public.sp_pilot_members m) AS grants,
  (SELECT md5(coalesce(string_agg(
       concat_ws('/', t.code, t.is_active, t.legal_review_state, t.pilot_state, t.market_pack_code),
       '|' ORDER BY t.code), ''))
     FROM public.sp_credential_types t
    WHERE t.code NOT IN (SELECT code FROM _sp_pr4_open)) AS other_definitions,
  (SELECT md5(coalesce(string_agg(
       concat_ws('/', t.code, t.is_active, t.legal_review_state), '|' ORDER BY t.code), ''))
     FROM public.sp_credential_types t
    WHERE t.code IN (SELECT code FROM _sp_pr4_open)) AS opened_approval_and_review,
  (SELECT md5(coalesce(string_agg(
       concat_ws('/', p.code, p.is_active, p.legal_review_state, p.legal_reviewed_by,
                 p.legal_reviewed_on, p.superseded_on),
       '|' ORDER BY p.code), ''))
     FROM public.sp_market_packs p) AS pack_approval_and_review,
  (SELECT md5(coalesce(string_agg(concat_ws('/', p.code, p.pilot_state), '|' ORDER BY p.code), ''))
     FROM public.sp_market_packs p
    WHERE p.code NOT IN ('GB', 'GB-NI', 'AE-DU')) AS other_packs;

-- ── Preflight: refuse unless the world is exactly what this file expects ──
DO $$
DECLARE
  _n int;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'sp_market_pack_pilot_state_known'
       AND position('public_pilot' IN pg_get_constraintdef(oid)) > 0)
  OR NOT EXISTS (
    SELECT 1 FROM pg_proc
     WHERE pronamespace = 'public'::regnamespace AND proname = 'sp_market_access'
       AND position('public_pilot' IN prosrc) > 0)
  THEN
    RAISE EXCEPTION 'SP_OPEN_UK_DUBAI_PREFLIGHT: 20261220090000 (the public_pilot state) is not applied';
  END IF;

  SELECT count(*) INTO _n FROM public.sp_market_packs
   WHERE code IN ('GB', 'GB-NI', 'AE-DU')
     AND pilot_state = 'internal_pilot' AND NOT is_active AND superseded_on IS NULL;
  IF _n <> 3 THEN
    RAISE EXCEPTION 'SP_OPEN_UK_DUBAI_PREFLIGHT: expected GB, GB-NI and AE-DU in internal pilot, inactive and current; found % of 3', _n;
  END IF;

  SELECT count(*) INTO _n
    FROM _sp_pr4_open o
    JOIN public.sp_credential_types t
      ON t.code = o.code AND t.market_pack_code = o.market_pack_code
   WHERE t.pilot_state = 'internal_pilot' AND NOT t.is_active;
  IF _n <> 44 THEN
    RAISE EXCEPTION 'SP_OPEN_UK_DUBAI_PREFLIGHT: expected the 44 listed definitions in internal pilot, inactive, in their own pack; found %', _n;
  END IF;

  IF EXISTS (SELECT 1 FROM public.sp_market_packs WHERE pilot_state = 'public_pilot')
  OR EXISTS (SELECT 1 FROM public.sp_credential_types WHERE pilot_state = 'public_pilot') THEN
    RAISE EXCEPTION 'SP_OPEN_UK_DUBAI_PREFLIGHT: something is already in public pilot';
  END IF;
END $$;

-- ── The change ──────────────────────────────────────────────────────────
UPDATE public.sp_market_packs
   SET pilot_state = 'public_pilot'
 WHERE code IN ('GB', 'GB-NI', 'AE-DU') AND pilot_state = 'internal_pilot';

UPDATE public.sp_credential_types t
   SET pilot_state = 'public_pilot'
  FROM _sp_pr4_open o
 WHERE t.code = o.code AND t.market_pack_code = o.market_pack_code
   AND t.pilot_state = 'internal_pilot';

-- ── Postflight: exactly this moved, and nothing else did ────────────────
DO $$
DECLARE
  _b record;
  _n int;
BEGIN
  SELECT * INTO _b FROM _sp_pr4_before;

  SELECT count(*) INTO _n FROM public.sp_market_packs
   WHERE pilot_state = 'public_pilot' AND NOT is_active AND legal_review_state = 'pending';
  IF _n <> 3
  OR NOT EXISTS (SELECT 1 FROM public.sp_market_packs WHERE code = 'GB' AND pilot_state = 'public_pilot')
  OR NOT EXISTS (SELECT 1 FROM public.sp_market_packs WHERE code = 'GB-NI' AND pilot_state = 'public_pilot')
  OR NOT EXISTS (SELECT 1 FROM public.sp_market_packs WHERE code = 'AE-DU' AND pilot_state = 'public_pilot')
  THEN
    RAISE EXCEPTION 'SP_OPEN_UK_DUBAI_POSTFLIGHT: expected exactly GB, GB-NI and AE-DU in public pilot, inactive, review pending';
  END IF;

  SELECT count(*) INTO _n FROM public.sp_credential_types
   WHERE pilot_state = 'public_pilot' AND NOT is_active AND legal_review_state = 'pending';
  IF _n <> 44 OR (SELECT count(*) FROM public.sp_credential_types WHERE pilot_state = 'public_pilot') <> 44 THEN
    RAISE EXCEPTION 'SP_OPEN_UK_DUBAI_POSTFLIGHT: expected exactly 44 public-pilot definitions, none approved, review pending; found %', _n;
  END IF;

  IF EXISTS (SELECT 1 FROM public.sp_market_packs
              WHERE code = 'AE-AZ' AND (pilot_state <> 'closed' OR is_active)) THEN
    RAISE EXCEPTION 'SP_OPEN_UK_DUBAI_POSTFLIGHT: Abu Dhabi must stay closed';
  END IF;

  IF (SELECT md5(coalesce(string_agg(to_jsonb(c)::text, '|' ORDER BY c.id), ''))
        FROM public.sp_claims c) IS DISTINCT FROM _b.claims THEN
    RAISE EXCEPTION 'SP_OPEN_UK_DUBAI_POSTFLIGHT: a claim changed';
  END IF;
  IF (SELECT md5(coalesce(string_agg(to_jsonb(t)::text, '|' ORDER BY t.code), ''))
        FROM public.sp_professional_titles t) IS DISTINCT FROM _b.titles THEN
    RAISE EXCEPTION 'SP_OPEN_UK_DUBAI_POSTFLIGHT: a professional-title rule changed';
  END IF;
  IF (SELECT md5(coalesce(string_agg(to_jsonb(m)::text, '|' ORDER BY m.user_id, m.market_pack_code), ''))
        FROM public.sp_pilot_members m) IS DISTINCT FROM _b.grants THEN
    RAISE EXCEPTION 'SP_OPEN_UK_DUBAI_POSTFLIGHT: a pilot grant changed';
  END IF;
  IF (SELECT md5(coalesce(string_agg(
         concat_ws('/', t.code, t.is_active, t.legal_review_state, t.pilot_state, t.market_pack_code),
         '|' ORDER BY t.code), ''))
        FROM public.sp_credential_types t
       WHERE t.code NOT IN (SELECT code FROM _sp_pr4_open)) IS DISTINCT FROM _b.other_definitions THEN
    RAISE EXCEPTION 'SP_OPEN_UK_DUBAI_POSTFLIGHT: a definition outside the list changed';
  END IF;
  IF (SELECT md5(coalesce(string_agg(
         concat_ws('/', t.code, t.is_active, t.legal_review_state), '|' ORDER BY t.code), ''))
        FROM public.sp_credential_types t
       WHERE t.code IN (SELECT code FROM _sp_pr4_open)) IS DISTINCT FROM _b.opened_approval_and_review THEN
    RAISE EXCEPTION 'SP_OPEN_UK_DUBAI_POSTFLIGHT: an opened definition''s approval or legal review changed';
  END IF;
  IF (SELECT md5(coalesce(string_agg(
         concat_ws('/', p.code, p.is_active, p.legal_review_state, p.legal_reviewed_by,
                   p.legal_reviewed_on, p.superseded_on),
         '|' ORDER BY p.code), ''))
        FROM public.sp_market_packs p) IS DISTINCT FROM _b.pack_approval_and_review THEN
    RAISE EXCEPTION 'SP_OPEN_UK_DUBAI_POSTFLIGHT: a market pack''s activation or legal review changed';
  END IF;
  IF (SELECT md5(coalesce(string_agg(concat_ws('/', p.code, p.pilot_state), '|' ORDER BY p.code), ''))
        FROM public.sp_market_packs p
       WHERE p.code NOT IN ('GB', 'GB-NI', 'AE-DU')) IS DISTINCT FROM _b.other_packs THEN
    RAISE EXCEPTION 'SP_OPEN_UK_DUBAI_POSTFLIGHT: another market pack changed';
  END IF;

  RAISE NOTICE 'SP_OPEN_UK_DUBAI_PROOF ok: 3 packs and 44 definitions in public pilot; approval, legal review, claims, titles and grants unchanged; Abu Dhabi closed';
END $$;

COMMIT;
