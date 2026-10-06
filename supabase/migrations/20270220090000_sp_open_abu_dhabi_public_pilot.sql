-- =============================================================================
-- Security Passport -- open Abu Dhabi (AE-AZ) as a PUBLIC PILOT
-- =============================================================================
--
-- DATA ONLY: no object is created, replaced or dropped. It needs 20261220090000
-- (the public_pilot state) and 20261221090000 (the UK and Dubai opened) and
-- refuses to run without them. The application's generated types are unaffected.
--
-- ── THE OWNER DECISION THIS FILE CARRIES ─────────────────────────────────
--
-- "Prepare the opening of AE-AZ as public_pilot. Check the seven definitions'
-- sources and catalogue approvals. Do not mark the legal review complete to
-- open the pilot." (owner, 2026-10-06)
--
-- Merging this file IS the decision to open. It is prepared so that the owner
-- can take that decision on what was checked, which is stated here without
-- softening:
--
--   * The seven definitions (20260914092000) were authored from the Ministry
--     of Interior's private-security framework and NOBODY IN THIS REPOSITORY
--     HAS PINNED THE EXACT PAGE. Their own migration says so, and names that
--     reading as the first item of the pack's legal review. That review stays
--     'pending' here, on the pack and on every definition.
--   * The registered source (ae_moi_private_security, moi.gov.ae) was
--     registered UNREAD and stays review_needed: no checked_on, no fingerprint.
--   * They carry authority_id = AE_MOI_PSBD, which is active, so the approved
--     catalogue admits them on the governed-issuer branch once the market and
--     the emirate are open. They had NO organisation-role rows and NO
--     definition-review rows, unlike Dubai's thirty (20261126090000).
--
-- A public pilot is, by definition (20261220090000), a market whose legal
-- review is still pending and whose definitions are not approved. What it
-- changes is catalogue availability and permission to register (concepts 2
-- and 3 of the completion work order); it changes nothing about trust, the
-- legal review or anyone's permission to work (4, 5 and 6), and the
-- postflight below proves each of those stood still.
--
-- ── WHAT CHANGES, AND WHAT DOES NOT ──────────────────────────────────────
--
--   changes   sp_sub_jurisdictions.is_active     AE-AZ: false -> true. The emirate
--                                                was listed inactive so the trigger
--                                                could say "not supported yet"; the
--                                                catalogue view and the claim rules
--                                                both require an ACTIVE region, so an
--                                                open market in a closed emirate
--                                                would be open on paper only.
--             sp_market_packs.pilot_state        AE-AZ: closed -> public_pilot
--             sp_credential_types.pilot_state    the 7 below: closed -> public_pilot
--             sp_credential_organisation_roles   + regulator and issuer rows for the 7,
--                                                pointing at AE_MOI_PSBD. The
--                                                disclosure payload (20261126090000)
--                                                reads a credential's issuer from
--                                                these rows and from nowhere else; a
--                                                public-pilot market whose shared
--                                                credentials carried no issuer would
--                                                be a worse product than a closed one.
--                                                source_url is the authority's
--                                                registered official URL and
--                                                checked_on is 2026-09-14, the date
--                                                the pack migration attributed the
--                                                authority to each definition. That
--                                                is what these rows restate. They do
--                                                NOT record a reading of the page:
--                                                none has happened, and the source
--                                                row says so.
--   unchanged is_active (false on the pack and all 7), legal_review_state
--             (pending on all of them), every claim, every professional-title
--             rule, every pilot grant, the UK, Dubai, Sweden, India and the
--             international catalogue, every other emirate (closed, inactive),
--             the registered source (unread), and the definitions' own fields:
--             no reference_pattern, no typical_validity_months, no name_ar,
--             no definition-review row. Validity is read from the licence.
--
-- One transaction: the change and its proof commit together or not at all.
--
-- Rollback: supabase/rollback/20270220090000_sp_open_abu_dhabi_public_pilot_rollback.sql
-- =============================================================================

BEGIN;

CREATE TEMP TABLE _sp_az_open (code text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO _sp_az_open (code) VALUES
  ('AE_AZ_PSBD_LICENCE_GUARD'), ('AE_AZ_PSBD_LICENCE_CIT'), ('AE_AZ_PSBD_LICENCE_BANKS'),
  ('AE_AZ_PSBD_LICENCE_EVENT'), ('AE_AZ_PSBD_LICENCE_SUPERVISOR'),
  ('AE_AZ_PSBD_LICENCE_MANAGER'), ('AE_AZ_PSBD_LICENCE_TRAINER');

-- What must stand still, fingerprinted BEFORE anything moves.
CREATE TEMP TABLE _sp_az_before ON COMMIT DROP AS
SELECT
  (SELECT md5(coalesce(string_agg(to_jsonb(c)::text, '|' ORDER BY c.id), ''))
     FROM public.sp_claims c)                                                           AS claims,
  (SELECT md5(coalesce(string_agg(to_jsonb(t)::text, '|' ORDER BY t.code), ''))
     FROM public.sp_professional_titles t)                                              AS titles,
  (SELECT md5(coalesce(string_agg(to_jsonb(m)::text, '|' ORDER BY m.user_id, m.market_pack_code), ''))
     FROM public.sp_pilot_members m)                                                    AS grants,
  (SELECT md5(coalesce(string_agg(
       concat_ws('/', t.code, t.is_active, t.legal_review_state, t.pilot_state, t.market_pack_code),
       '|' ORDER BY t.code), ''))
     FROM public.sp_credential_types t
    WHERE t.code NOT IN (SELECT code FROM _sp_az_open))                                 AS other_definitions,
  (SELECT md5(coalesce(string_agg(
       (to_jsonb(t) - 'pilot_state')::text, '|' ORDER BY t.code), ''))
     FROM public.sp_credential_types t
    WHERE t.code IN (SELECT code FROM _sp_az_open))                                     AS opened_everything_but_pilot_state,
  (SELECT md5(coalesce(string_agg(
       concat_ws('/', p.code, p.is_active, p.legal_review_state, p.legal_reviewed_by,
                 p.legal_reviewed_on, p.superseded_on),
       '|' ORDER BY p.code), ''))
     FROM public.sp_market_packs p)                                                     AS pack_approval_and_review,
  (SELECT md5(coalesce(string_agg(concat_ws('/', p.code, p.pilot_state), '|' ORDER BY p.code), ''))
     FROM public.sp_market_packs p
    WHERE p.code <> 'AE-AZ')                                                            AS other_packs,
  (SELECT md5(coalesce(string_agg(concat_ws('/', s.code, s.is_active), '|' ORDER BY s.code), ''))
     FROM public.sp_sub_jurisdictions s
    WHERE s.code <> 'AE-AZ')                                                            AS other_regions,
  (SELECT md5(coalesce(string_agg(to_jsonb(r)::text, '|' ORDER BY r.credential_code, r.role), ''))
     FROM public.sp_credential_organisation_roles r
    WHERE r.credential_code NOT IN (SELECT code FROM _sp_az_open))                      AS other_roles,
  (SELECT md5(coalesce(string_agg(to_jsonb(s)::text, '|' ORDER BY s.source_key), ''))
     FROM public.sp_regulatory_sources s)                                               AS sources,
  (SELECT md5(coalesce(string_agg(to_jsonb(a)::text, '|' ORDER BY a.code), ''))
     FROM public.sp_authorities a)                                                      AS authorities;

-- ── Preflight: the world this file expects ───────────────────────────────
DO $$
DECLARE _n int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'sp_market_pack_pilot_state_known'
                    AND pg_get_constraintdef(oid) LIKE '%public_pilot%') THEN
    RAISE EXCEPTION 'SP_OPEN_ABU_DHABI_PREFLIGHT: 20261220090000 (public_pilot) is not applied';
  END IF;
  IF (SELECT count(*) FROM public.sp_market_packs
       WHERE code IN ('GB', 'GB-NI', 'AE-DU') AND pilot_state = 'public_pilot') <> 3 THEN
    RAISE EXCEPTION 'SP_OPEN_ABU_DHABI_PREFLIGHT: 20261221090000 (the UK and Dubai open) is not applied';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sp_market_packs
                  WHERE code = 'AE-AZ' AND jurisdiction_code = 'AE' AND sub_jurisdiction_code = 'AE-AZ'
                    AND pilot_state = 'closed' AND NOT is_active AND legal_review_state = 'pending'
                    AND superseded_on IS NULL) THEN
    RAISE EXCEPTION 'SP_OPEN_ABU_DHABI_PREFLIGHT: expected the AE-AZ pack closed, inactive, review pending';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sp_sub_jurisdictions
                  WHERE code = 'AE-AZ' AND jurisdiction_code = 'AE' AND NOT is_active) THEN
    RAISE EXCEPTION 'SP_OPEN_ABU_DHABI_PREFLIGHT: expected the AE-AZ emirate listed and inactive';
  END IF;
  SELECT count(*) INTO _n FROM public.sp_credential_types t
   WHERE t.code IN (SELECT code FROM _sp_az_open)
     AND t.market_pack_code = 'AE-AZ' AND t.jurisdiction_code = 'AE' AND t.sub_jurisdiction_code = 'AE-AZ'
     AND t.pilot_state = 'closed' AND NOT t.is_active AND t.legal_review_state = 'pending'
     AND t.scope_code = 'national_regulated' AND t.requires_scope AND t.requires_valid_until;
  IF _n <> 7 OR (SELECT count(*) FROM public.sp_credential_types WHERE market_pack_code = 'AE-AZ') <> 7 THEN
    RAISE EXCEPTION 'SP_OPEN_ABU_DHABI_PREFLIGHT: expected exactly the 7 listed Abu Dhabi definitions, closed, inactive, review pending; found %', _n;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sp_authorities
                  WHERE code = 'AE_MOI_PSBD' AND is_active AND jurisdiction_code = 'AE'
                    AND official_url LIKE 'https://%') THEN
    RAISE EXCEPTION 'SP_OPEN_ABU_DHABI_PREFLIGHT: the Ministry of Interior authority is missing or inactive';
  END IF;
  IF (SELECT count(*) FROM public.sp_credential_types t
       WHERE t.code IN (SELECT code FROM _sp_az_open)
         AND t.authority_id = (SELECT id FROM public.sp_authorities WHERE code = 'AE_MOI_PSBD')) <> 7 THEN
    RAISE EXCEPTION 'SP_OPEN_ABU_DHABI_PREFLIGHT: every Abu Dhabi definition must carry the MOI authority';
  END IF;
  IF EXISTS (SELECT 1 FROM public.sp_credential_organisation_roles
              WHERE credential_code IN (SELECT code FROM _sp_az_open)) THEN
    RAISE EXCEPTION 'SP_OPEN_ABU_DHABI_PREFLIGHT: Abu Dhabi already has organisation roles; this file has run';
  END IF;
  IF (SELECT count(*) FROM public.sp_market_packs WHERE pilot_state = 'public_pilot') <> 3
  OR (SELECT count(*) FROM public.sp_credential_types WHERE pilot_state = 'public_pilot') <> 44 THEN
    RAISE EXCEPTION 'SP_OPEN_ABU_DHABI_PREFLIGHT: expected exactly 3 packs and 44 definitions in public pilot before this file';
  END IF;
END $$;

-- ── 1. The emirate ───────────────────────────────────────────────────────
UPDATE public.sp_sub_jurisdictions SET is_active = true
 WHERE code = 'AE-AZ' AND NOT is_active;

-- ── 2. The market and its definitions ────────────────────────────────────
UPDATE public.sp_market_packs SET pilot_state = 'public_pilot'
 WHERE code = 'AE-AZ' AND pilot_state = 'closed';

UPDATE public.sp_credential_types t SET pilot_state = 'public_pilot'
  FROM _sp_az_open o
 WHERE t.code = o.code AND t.market_pack_code = 'AE-AZ' AND t.pilot_state = 'closed';

-- ── 3. Who regulates and who issues: the Ministry of Interior, as attributed ──
-- Restates the authority attribution of 20260914092000 (see the header). No
-- verification_authority row: whether the Ministry answers a third party's
-- standing check is not known here, and an unknown is left absent.
INSERT INTO public.sp_credential_organisation_roles
  (credential_code, role, authority_id, certification_issuer_id, document_specific, source_url, checked_on)
SELECT o.code, r.role, a.id, NULL, false, a.official_url, DATE '2026-09-14'
  FROM _sp_az_open o
 CROSS JOIN (VALUES ('regulator'), ('issuer')) r(role)
  JOIN public.sp_authorities a ON a.code = 'AE_MOI_PSBD'
ON CONFLICT (credential_code, role) DO NOTHING;

-- ── Postflight: exactly this moved, and nothing else did ────────────────
DO $$
DECLARE
  _b record;
  _n int;
BEGIN
  SELECT * INTO _b FROM _sp_az_before;

  IF NOT EXISTS (SELECT 1 FROM public.sp_sub_jurisdictions WHERE code = 'AE-AZ' AND is_active) THEN
    RAISE EXCEPTION 'SP_OPEN_ABU_DHABI_POSTFLIGHT: the emirate is not active';
  END IF;
  IF (SELECT count(*) FROM public.sp_sub_jurisdictions WHERE jurisdiction_code = 'AE' AND is_active) <> 2 THEN
    RAISE EXCEPTION 'SP_OPEN_ABU_DHABI_POSTFLIGHT: expected exactly two active emirates, Dubai and Abu Dhabi';
  END IF;

  SELECT count(*) INTO _n FROM public.sp_market_packs
   WHERE pilot_state = 'public_pilot' AND NOT is_active AND legal_review_state = 'pending';
  IF _n <> 4
  OR NOT EXISTS (SELECT 1 FROM public.sp_market_packs WHERE code = 'AE-AZ' AND pilot_state = 'public_pilot') THEN
    RAISE EXCEPTION 'SP_OPEN_ABU_DHABI_POSTFLIGHT: expected GB, GB-NI, AE-DU and AE-AZ in public pilot, inactive, review pending';
  END IF;

  SELECT count(*) INTO _n FROM public.sp_credential_types
   WHERE pilot_state = 'public_pilot' AND NOT is_active AND legal_review_state = 'pending';
  IF _n <> 51 OR (SELECT count(*) FROM public.sp_credential_types WHERE pilot_state = 'public_pilot') <> 51
  OR (SELECT count(*) FROM public.sp_credential_types WHERE market_pack_code = 'AE-AZ' AND pilot_state = 'public_pilot') <> 7 THEN
    RAISE EXCEPTION 'SP_OPEN_ABU_DHABI_POSTFLIGHT: expected exactly 51 public-pilot definitions (44 + 7), none approved, review pending; found %', _n;
  END IF;

  IF (SELECT count(*) FROM public.sp_credential_organisation_roles r
       WHERE r.credential_code IN (SELECT code FROM _sp_az_open)
         AND r.role IN ('regulator', 'issuer')
         AND r.authority_id = (SELECT id FROM public.sp_authorities WHERE code = 'AE_MOI_PSBD')
         AND NOT r.document_specific AND r.checked_on = DATE '2026-09-14') <> 14
  OR (SELECT count(*) FROM public.sp_credential_organisation_roles
       WHERE credential_code IN (SELECT code FROM _sp_az_open)) <> 14 THEN
    RAISE EXCEPTION 'SP_OPEN_ABU_DHABI_POSTFLIGHT: expected exactly 14 organisation roles (regulator + issuer x 7), all the Ministry';
  END IF;

  -- The catalogue admits them now, and only to a signed-in holder.
  IF public.sp_market_access(NULL, 'AE-AZ') <> 'closed' THEN
    RAISE EXCEPTION 'SP_OPEN_ABU_DHABI_POSTFLIGHT: without a signed-in user the public pilot must be closed';
  END IF;

  -- Every other emirate stays listed and inactive.
  IF (SELECT count(*) FROM public.sp_sub_jurisdictions WHERE jurisdiction_code = 'AE') <> 7
  OR (SELECT count(*) FROM public.sp_market_packs WHERE jurisdiction_code = 'AE') <> 2 THEN
    RAISE EXCEPTION 'SP_OPEN_ABU_DHABI_POSTFLIGHT: the other five emirates must stay listed, packless and inactive';
  END IF;

  IF (SELECT md5(coalesce(string_agg(to_jsonb(c)::text, '|' ORDER BY c.id), ''))
        FROM public.sp_claims c) IS DISTINCT FROM _b.claims THEN
    RAISE EXCEPTION 'SP_OPEN_ABU_DHABI_POSTFLIGHT: a claim changed';
  END IF;
  IF (SELECT md5(coalesce(string_agg(to_jsonb(t)::text, '|' ORDER BY t.code), ''))
        FROM public.sp_professional_titles t) IS DISTINCT FROM _b.titles THEN
    RAISE EXCEPTION 'SP_OPEN_ABU_DHABI_POSTFLIGHT: a professional-title rule changed';
  END IF;
  IF (SELECT md5(coalesce(string_agg(to_jsonb(m)::text, '|' ORDER BY m.user_id, m.market_pack_code), ''))
        FROM public.sp_pilot_members m) IS DISTINCT FROM _b.grants THEN
    RAISE EXCEPTION 'SP_OPEN_ABU_DHABI_POSTFLIGHT: a pilot grant changed';
  END IF;
  IF (SELECT md5(coalesce(string_agg(
         concat_ws('/', t.code, t.is_active, t.legal_review_state, t.pilot_state, t.market_pack_code),
         '|' ORDER BY t.code), ''))
        FROM public.sp_credential_types t
       WHERE t.code NOT IN (SELECT code FROM _sp_az_open)) IS DISTINCT FROM _b.other_definitions THEN
    RAISE EXCEPTION 'SP_OPEN_ABU_DHABI_POSTFLIGHT: a definition outside the seven changed';
  END IF;
  IF (SELECT md5(coalesce(string_agg(
         (to_jsonb(t) - 'pilot_state')::text, '|' ORDER BY t.code), ''))
        FROM public.sp_credential_types t
       WHERE t.code IN (SELECT code FROM _sp_az_open)) IS DISTINCT FROM _b.opened_everything_but_pilot_state THEN
    RAISE EXCEPTION 'SP_OPEN_ABU_DHABI_POSTFLIGHT: something other than pilot_state changed on an opened definition';
  END IF;
  IF (SELECT md5(coalesce(string_agg(
         concat_ws('/', p.code, p.is_active, p.legal_review_state, p.legal_reviewed_by,
                   p.legal_reviewed_on, p.superseded_on),
         '|' ORDER BY p.code), ''))
        FROM public.sp_market_packs p) IS DISTINCT FROM _b.pack_approval_and_review THEN
    RAISE EXCEPTION 'SP_OPEN_ABU_DHABI_POSTFLIGHT: a market pack''s activation or legal review changed';
  END IF;
  IF (SELECT md5(coalesce(string_agg(concat_ws('/', p.code, p.pilot_state), '|' ORDER BY p.code), ''))
        FROM public.sp_market_packs p WHERE p.code <> 'AE-AZ') IS DISTINCT FROM _b.other_packs THEN
    RAISE EXCEPTION 'SP_OPEN_ABU_DHABI_POSTFLIGHT: another market pack changed';
  END IF;
  IF (SELECT md5(coalesce(string_agg(concat_ws('/', s.code, s.is_active), '|' ORDER BY s.code), ''))
        FROM public.sp_sub_jurisdictions s WHERE s.code <> 'AE-AZ') IS DISTINCT FROM _b.other_regions THEN
    RAISE EXCEPTION 'SP_OPEN_ABU_DHABI_POSTFLIGHT: another region changed';
  END IF;
  IF (SELECT md5(coalesce(string_agg(to_jsonb(r)::text, '|' ORDER BY r.credential_code, r.role), ''))
        FROM public.sp_credential_organisation_roles r
       WHERE r.credential_code NOT IN (SELECT code FROM _sp_az_open)) IS DISTINCT FROM _b.other_roles THEN
    RAISE EXCEPTION 'SP_OPEN_ABU_DHABI_POSTFLIGHT: an organisation role outside Abu Dhabi changed';
  END IF;
  IF (SELECT md5(coalesce(string_agg(to_jsonb(s)::text, '|' ORDER BY s.source_key), ''))
        FROM public.sp_regulatory_sources s) IS DISTINCT FROM _b.sources THEN
    RAISE EXCEPTION 'SP_OPEN_ABU_DHABI_POSTFLIGHT: a regulatory source changed -- this file reads none';
  END IF;
  IF (SELECT md5(coalesce(string_agg(to_jsonb(a)::text, '|' ORDER BY a.code), ''))
        FROM public.sp_authorities a) IS DISTINCT FROM _b.authorities THEN
    RAISE EXCEPTION 'SP_OPEN_ABU_DHABI_POSTFLIGHT: an authority changed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.sp_credential_definition_reviews
              WHERE credential_code IN (SELECT code FROM _sp_az_open)) THEN
    RAISE EXCEPTION 'SP_OPEN_ABU_DHABI_POSTFLIGHT: no definition review may be claimed by this file';
  END IF;

  RAISE NOTICE 'SP_OPEN_ABU_DHABI_PROOF ok: 4 packs and 51 definitions in public pilot; Abu Dhabi active as a region with 14 Ministry roles; approval, legal review, claims, titles, grants, sources and authorities unchanged';
END $$;

COMMIT;
