-- =============================================================================
-- Security Passport — a pilot credential can actually be SAVED.
--
-- ── THE DEFECT ─────────────────────────────────────────────────────────
--
-- The pilot catalogues became visible and selectable, the right credential
-- was preselected from `?code=`, and then every save failed with "Något gick
-- fel. Försök igen."
--
-- Choosing a credential settles which regulated market the entry belongs to.
-- That assignment lived only in the form's radio-button onChange, so a holder
-- arriving from the catalogue kept the empty draft's `jurisdiction_code = 'SE'`,
-- and the write path wrote THAT — while never writing `sub_jurisdiction_code`
-- at all. The rows that reached this trigger were therefore:
--
--   UK_SIA_LICENCE_DS      filed in SE                  -> refused
--   AE_DU_SIRA_CARD_GUARD  filed in SE, no emirate      -> refused
--   AE_DU_SIRA_CARD_GUARD  filed in AE, no emirate      -> refused
--
-- ── WHAT THIS SUITE PROVES ─────────────────────────────────────────────
--
-- Every INSERT below is built THE WAY `credentialClaimFields` builds it — the
-- one pure mapping the server now uses — by reading `sp_credential_types` and
-- taking the market from the definition. So this is not a test of a hand-
-- written row that happens to work: it is the application's own mapping,
-- evaluated by the trigger that judges it. The defective shapes are asserted
-- to be refused in the same breath, because a suite that only proves the fix
-- works cannot tell you the defect was real.
--
-- Every statement runs as `SET LOCAL ROLE authenticated` with a JWT subject.
-- The older pilot suite ran as the table owner, which bypasses row level
-- security and is how a catalogue nobody could read stayed green for a round.
-- =============================================================================

\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION pg_temp.ok(_cond boolean, _label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF NOT _cond THEN
    RAISE EXCEPTION 'ASSERTION FAILED: %', _label;
  END IF;
  RAISE NOTICE 'ok  %', _label;
END $$;

/** One INSERT as role authenticated, reporting 'OK' or the SP_ code it was
 *  refused with. `_jur` and `_sub` are passed EXPLICITLY so the suite can
 *  file the defective shapes as well as the correct one. */
CREATE OR REPLACE FUNCTION pg_temp.file_as(
  _uid uuid, _code text, _jur text, _sub text, _mode text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE _t public.sp_credential_types%ROWTYPE; _msg text;
BEGIN
  -- The definition, read as the owner: this helper is building the row the
  -- application would build, not testing whether it can see the taxonomy.
  SELECT * INTO _t FROM public.sp_credential_types WHERE code = _code;
  IF NOT FOUND THEN RETURN 'NO_SUCH_TYPE'; END IF;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _uid::text, true);
  BEGIN
    INSERT INTO public.sp_claims
      (holder_user_id, claim_type, credential_code, title,
       claimed_issuer_name, jurisdiction_code, sub_jurisdiction_code,
       valid_until, authorisation_scope, lifecycle_state)
    VALUES (
      _uid,
      _t.claim_type,
      _t.code,
      -- `credentialClaimFields`: a governed credential takes the taxonomy's
      -- own Swedish label.
      _t.name_sv,
      CASE WHEN _t.requires_issuer THEN 'Fiktiv myndighet' ELSE NULL END,
      _jur,
      _sub,
      CASE WHEN _t.requires_valid_until THEN DATE '2030-01-01' ELSE NULL END,
      CASE WHEN _t.requires_scope THEN 'Fiktivt bevakningsuppdrag' ELSE NULL END,
      _mode);
    RESET ROLE;
    RETURN 'OK';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS _msg = MESSAGE_TEXT;
    RESET ROLE;
    RETURN split_part(_msg, ':', 1);
  END;
END $$;

/** The same INSERT, with the market taken FROM THE DEFINITION — exactly what
 *  `credentialClaimFields(draft, type, mode)` produces. */
CREATE OR REPLACE FUNCTION pg_temp.file_from_taxonomy(_uid uuid, _code text, _mode text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE _t public.sp_credential_types%ROWTYPE;
BEGIN
  SELECT * INTO _t FROM public.sp_credential_types WHERE code = _code;
  IF NOT FOUND THEN RETURN 'NO_SUCH_TYPE'; END IF;
  RETURN pg_temp.file_as(_uid, _code, _t.jurisdiction_code, _t.sub_jurisdiction_code, _mode);
END $$;

DO $$
DECLARE
  _member uuid := gen_random_uuid();
  _admin  uuid := gen_random_uuid();
  _se     uuid := gen_random_uuid();
  _r      text;
  _n      integer;
  _claim  uuid;
  _has_ni boolean;
  _se_before jsonb;
BEGIN
  INSERT INTO auth.users (id, email)
  VALUES (_member, 'writepath-member@fixture.invalid'),
         (_admin,  'writepath-admin@fixture.invalid'),
         (_se,     'writepath-swede@fixture.invalid')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (_admin, 'admin') ON CONFLICT DO NOTHING;

  SELECT EXISTS (SELECT 1 FROM public.sp_market_packs WHERE code = 'GB-NI') INTO _has_ni;

  PERFORM set_config('request.jwt.claim.sub', _admin::text, true);
  PERFORM public.sp_grant_pilot_member(_member, 'GB',    'write path suite');
  PERFORM public.sp_grant_pilot_member(_member, 'AE-DU', 'write path suite');
  IF _has_ni THEN
    PERFORM public.sp_grant_pilot_member(_member, 'GB-NI', 'write path suite');
  END IF;

  -- A Swedish holder with a Swedish record, established BEFORE anything
  -- pilot happens. Group 5 proves it is still exactly this afterwards.
  _r := pg_temp.file_from_taxonomy(_se, 'VU1', 'active');
  PERFORM pg_temp.ok(_r = 'OK', '0.1 a Swedish holder records VU1 (got ' || _r || ')');
  SELECT to_jsonb(c) - 'id' - 'created_at' - 'updated_at'
    INTO _se_before
    FROM public.sp_claims c WHERE c.holder_user_id = _se AND c.credential_code = 'VU1';

  -- =====================================================================
  RAISE NOTICE 'GROUP 1 -- THE DEFECT: the rows the old write path built are refused';
  -- =====================================================================
  _r := pg_temp.file_as(_member, 'UK_SIA_LICENCE_DS', 'SE', NULL, 'active');
  PERFORM pg_temp.ok(_r = 'SP_CREDENTIAL_NOT_AVAILABLE',
    '1.1 a British licence filed in Sweden is refused (got ' || _r || ')');

  _r := pg_temp.file_as(_member, 'AE_DU_SIRA_CARD_GUARD', 'SE', NULL, 'active');
  PERFORM pg_temp.ok(_r = 'SP_CREDENTIAL_NOT_AVAILABLE',
    '1.2 a Dubai cadre card filed in Sweden is refused (got ' || _r || ')');

  -- Even after the country was corrected by hand, which is what a tester
  -- would try next: the emirate was never written at all.
  _r := pg_temp.file_as(_member, 'AE_DU_SIRA_CARD_GUARD', 'AE', NULL, 'active');
  PERFORM pg_temp.ok(_r = 'SP_SUB_JURISDICTION_REQUIRED',
    '1.3 a Dubai cadre card with no emirate is refused (got ' || _r || ')');

  -- And a DRAFT fails the same way: the market rules run above the trigger's
  -- draft early-return, so "save draft" was broken too.
  _r := pg_temp.file_as(_member, 'UK_SIA_LICENCE_DS', 'SE', NULL, 'draft');
  PERFORM pg_temp.ok(_r = 'SP_CREDENTIAL_NOT_AVAILABLE',
    '1.4 saving it as a DRAFT was refused too (got ' || _r || ')');

  -- =====================================================================
  RAISE NOTICE 'GROUP 2 -- THE FIX: the market comes from the definition';
  -- =====================================================================
  _r := pg_temp.file_from_taxonomy(_member, 'UK_SIA_LICENCE_DS', 'draft');
  PERFORM pg_temp.ok(_r = 'OK',
    '2.1 the British licence saves as a draft (got ' || _r || ')');

  _r := pg_temp.file_from_taxonomy(_member, 'UK_SIA_LICENCE_DS', 'active');
  PERFORM pg_temp.ok(_r = 'OK',
    '2.2 and is added to the Passport (got ' || _r || ')');

  SELECT count(*) INTO _n FROM public.sp_claims
   WHERE holder_user_id = _member AND credential_code = 'UK_SIA_LICENCE_DS'
     AND jurisdiction_code = 'GB' AND sub_jurisdiction_code IS NULL;
  PERFORM pg_temp.ok(_n = 2,
    '2.3 both rows are stored in GB with no sub-jurisdiction');

  _r := pg_temp.file_from_taxonomy(_member, 'AE_DU_SIRA_CARD_GUARD', 'active');
  PERFORM pg_temp.ok(_r = 'OK',
    '2.4 the Dubai cadre card is added (got ' || _r || ')');

  SELECT count(*) INTO _n FROM public.sp_claims
   WHERE holder_user_id = _member AND credential_code = 'AE_DU_SIRA_CARD_GUARD'
     AND jurisdiction_code = 'AE' AND sub_jurisdiction_code = 'AE-DU';
  PERFORM pg_temp.ok(_n = 1,
    '2.5 and is stored in AE / AE-DU: the emirate is written, not omitted');

  IF _has_ni THEN
    _r := pg_temp.file_from_taxonomy(_member, 'UK_SIA_LICENCE_VI', 'active');
    PERFORM pg_temp.ok(_r = 'OK',
      '2.6 the Northern Ireland licence is added (got ' || _r || ')');
    SELECT count(*) INTO _n FROM public.sp_claims
     WHERE holder_user_id = _member AND credential_code = 'UK_SIA_LICENCE_VI'
       AND jurisdiction_code = 'GB' AND sub_jurisdiction_code = 'GB-NI';
    PERFORM pg_temp.ok(_n = 1,
      '2.7 and is stored in GB / GB-NI, never as ordinary Great Britain');
  ELSE
    RAISE NOTICE 'ok  2.6 GB-NI pack absent (20260914090000 unapplied); NI write skipped';
    RAISE NOTICE 'ok  2.7 GB-NI pack absent; NI storage assertion skipped';
  END IF;

  -- Every pilot credential in both catalogues, not just the two named ones.
  -- A catalogue that can be browsed and not saved is the whole defect, so the
  -- assertion is about the catalogue, not about a sample of it.
  SELECT count(*) INTO _n
    FROM public.sp_credential_types t
   WHERE t.market_pack_code IN ('GB', 'AE-DU')
     AND pg_temp.file_from_taxonomy(_member, t.code, 'draft') <> 'OK';
  PERFORM pg_temp.ok(_n = 0,
    '2.8 EVERY GB and Dubai credential can be saved as a draft, not just the two named ones');

  -- =====================================================================
  RAISE NOTICE 'GROUP 3 -- the market rules are not relaxed by any of this';
  -- =====================================================================
  _r := pg_temp.file_as(_member, 'VU1', 'GB', NULL, 'active');
  PERFORM pg_temp.ok(_r = 'SP_CREDENTIAL_JURISDICTION_MISMATCH',
    '3.1 a Swedish course filed in Great Britain is still a mismatch (got ' || _r || ')');

  -- A sub-jurisdiction no market pack covers is refused at the market gate.
  _r := pg_temp.file_as(_member, 'UK_SIA_LICENCE_DS', 'GB', 'GB-XX', 'active');
  PERFORM pg_temp.ok(_r = 'SP_SUB_JURISDICTION_NOT_SUPPORTED',
    '3.2 a British licence filed in a submarket nobody has authored is refused (got ' || _r || ')');

  -- OBSERVED, AND DELIBERATELY NOT CHANGED HERE: a credential whose
  -- DEFINITION names no submarket (an ordinary GB licence) is accepted when
  -- filed under GB-NI, because the trigger's submarket rule only fires for a
  -- definition that names one. That is shipped migration behaviour
  -- (20260907092000 / 20260914090000) and this hotfix edits no migration.
  -- It is unreachable from the application either way: the market now comes
  -- from the definition on every path, so that row is never built — which is
  -- what the assertion below, and the guard's mapping assertions, pin down.
  PERFORM pg_temp.ok(
    (SELECT sub_jurisdiction_code IS NULL FROM public.sp_credential_types
      WHERE code = 'UK_SIA_LICENCE_DS'),
    '3.2b the ordinary GB licence names no submarket, so the write path sends none');

  IF _has_ni THEN
    _r := pg_temp.file_as(_member, 'UK_SIA_LICENCE_VI', 'GB', NULL, 'active');
    PERFORM pg_temp.ok(_r = 'SP_SUB_JURISDICTION_NOT_SUPPORTED',
      '3.3 and the Northern Ireland licence filed as ordinary GB is refused (got ' || _r || ')');
  ELSE
    RAISE NOTICE 'ok  3.3 GB-NI pack absent; the NI/GB separation is asserted by its own suite';
  END IF;

  -- Abu Dhabi: refused either by the market gate (no entitlement to a closed
  -- pack) or by the submarket rule. Both are refusals and the assertion takes
  -- either, because pinning the order would pin an implementation detail.
  _r := pg_temp.file_as(_member, 'AE_DU_SIRA_CARD_GUARD', 'AE', 'AE-AZ', 'active');
  PERFORM pg_temp.ok(_r IN ('SP_SUB_JURISDICTION_NOT_SUPPORTED', 'SP_MARKET_PACK_NOT_ACTIVE'),
    '3.4 a Dubai card filed in Abu Dhabi is refused (got ' || _r || ')');

  -- A non-member gets the public refusal for the same taxonomy-built row:
  -- the fix corrects the market, it does not open one.
  _r := pg_temp.file_from_taxonomy(_se, 'UK_SIA_LICENCE_DS', 'active');
  PERFORM pg_temp.ok(_r = 'SP_MARKET_PACK_NOT_ACTIVE',
    '3.5 a holder with no entitlement is still refused the same row (got ' || _r || ')');

  -- =====================================================================
  RAISE NOTICE 'GROUP 4 -- a correction CLEARS the previous market';
  -- =====================================================================
  -- The write path writes sub_jurisdiction_code on every write rather than
  -- omitting it, so changing a Dubai card into a British licence cannot leave
  -- the emirate behind on the row.
  SELECT id INTO _claim FROM public.sp_claims
   WHERE holder_user_id = _member AND credential_code = 'AE_DU_SIRA_CARD_GUARD'
   ORDER BY created_at LIMIT 1;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _member::text, true);
  BEGIN
    UPDATE public.sp_claims
       SET credential_code = 'UK_SIA_LICENCE_DS',
           claim_type = 'licence',
           title = (SELECT name_sv FROM public.sp_credential_types WHERE code = 'UK_SIA_LICENCE_DS'),
           jurisdiction_code = 'GB',
           sub_jurisdiction_code = NULL
     WHERE id = _claim;
    RESET ROLE;
    _r := 'OK';
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    _r := 'REFUSED';
  END;
  PERFORM pg_temp.ok(_r = 'OK',
    '4.1 correcting a Dubai card into a British licence clears the emirate (got ' || _r || ')');
  SELECT count(*) INTO _n FROM public.sp_claims
   WHERE id = _claim AND jurisdiction_code = 'GB' AND sub_jurisdiction_code IS NULL;
  PERFORM pg_temp.ok(_n = 1, '4.2 and the stored row carries GB with no emirate');

  -- The same correction WITHOUT clearing it — what omitting the column would
  -- have left behind — is refused.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _member::text, true);
  BEGIN
    UPDATE public.sp_claims SET sub_jurisdiction_code = 'AE-DU' WHERE id = _claim;
    RESET ROLE;
    _r := 'OK';
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    _r := 'REFUSED';
  END;
  PERFORM pg_temp.ok(_r = 'REFUSED',
    '4.3 leaving the old emirate on a British licence is refused (got ' || _r || ')');

  -- =====================================================================
  RAISE NOTICE 'GROUP 5 -- nothing Swedish moved';
  -- =====================================================================
  SELECT count(*) INTO _n FROM public.sp_claims
   WHERE holder_user_id = _se AND credential_code = 'VU1'
     AND jurisdiction_code = 'SE' AND sub_jurisdiction_code IS NULL;
  PERFORM pg_temp.ok(_n = 1, '5.1 the Swedish record is still Swedish');
  PERFORM pg_temp.ok(
    (SELECT to_jsonb(c) - 'id' - 'created_at' - 'updated_at' FROM public.sp_claims c
      WHERE c.holder_user_id = _se AND c.credential_code = 'VU1') = _se_before,
    '5.2 and is byte-for-byte the row it was before any pilot write');

  SELECT count(*) INTO _n FROM public.sp_claims
   WHERE jurisdiction_code = 'SE' AND sub_jurisdiction_code IS NOT NULL;
  PERFORM pg_temp.ok(_n = 0, '5.3 no Swedish claim gained a sub-jurisdiction');

  -- =====================================================================
  RAISE NOTICE 'GROUP 6 -- and no market was opened by fixing the write path';
  -- =====================================================================
  SELECT count(*) INTO _n FROM public.sp_market_packs WHERE is_active;
  PERFORM pg_temp.ok(_n = 1, '6.1 exactly one market is publicly active');
  PERFORM pg_temp.ok(
    (SELECT is_active AND pilot_state = 'closed' FROM public.sp_market_packs WHERE code = 'SE'),
    '6.2 and it is Sweden');
  SELECT count(*) INTO _n FROM public.sp_market_packs
   WHERE code IN ('GB', 'GB-NI', 'AE-DU')
     AND (is_active OR pilot_state <> 'internal_pilot' OR legal_review_state <> 'pending');
  PERFORM pg_temp.ok(_n = 0,
    '6.3 GB, GB-NI and Dubai are still internal_pilot with a pending legal review');

  -- =====================================================================
  RAISE NOTICE 'GROUP 7 -- cleanup';
  -- =====================================================================
  PERFORM set_config('request.jwt.claim.sub', '', true);
  DELETE FROM public.sp_claims WHERE holder_user_id IN (_member, _se);
  DELETE FROM public.user_roles WHERE user_id = _admin;
  DELETE FROM auth.users WHERE id IN (_member, _admin, _se);
  SELECT count(*) INTO _n FROM public.sp_pilot_members WHERE user_id = _member;
  PERFORM pg_temp.ok(_n = 0, '7.1 the suite left no entitlement behind');
END $$;
