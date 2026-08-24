-- Rollback for 20260907092500_sp_uk_title_rules_correction.sql
--
-- Restores the pre-correction hosted state exactly: the 13 GB rules Lovable's
-- rewrite of migration 3 actually produced. That is deliberately NOT the
-- reviewed canonical contract — a rollback's job is to put back what was
-- there, not what should have been there. Rolling this correction back
-- reinstates the defect, which is the honest outcome and the reason to think
-- twice before running it.
--
-- Touches only sp_professional_titles rows with market_pack_code = 'GB'. No
-- holder claim, evidence, disclosure, verification request or decision is
-- read or written. No grant, policy or market-pack flag changes.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Refuse to run against a database this rollback does not describe
-- ---------------------------------------------------------------------------
-- If the canonical set is not what is actually present, something other than
-- the paired migration changed these rows, and blindly rewriting them would
-- destroy that instead of reverting this.

DO $guard$
DECLARE _total integer; _elig integer;
BEGIN
  SELECT count(*) INTO _total FROM public.sp_professional_titles WHERE market_pack_code = 'GB';
  SELECT count(*) INTO _elig  FROM public.sp_professional_titles
   WHERE market_pack_code = 'GB' AND output_kind = 'local_eligibility';

  IF _total = 13 AND _elig = 1 THEN
    RAISE NOTICE 'Already at the pre-correction state; nothing to roll back.';
  ELSIF _total <> 19 OR _elig <> 7 THEN
    RAISE EXCEPTION
      'ROLLBACK REFUSED: expected either the canonical 19 GB rules (7 eligibility) '
      'or the pre-correction 13 (1 eligibility); found % rules with % eligibility. '
      'Something else changed these rows — inspect before reverting.', _total, _elig;
  END IF;
END $guard$;

-- ---------------------------------------------------------------------------
-- 2. Put back exactly what migration 3 produced hosted
-- ---------------------------------------------------------------------------
DELETE FROM public.sp_professional_titles
 WHERE market_pack_code = 'GB'
   AND code IN (
     'GB_SIA_ELIG_SG', 'GB_SIA_ELIG_DS', 'GB_SIA_ELIG_CCTV', 'GB_SIA_ELIG_CP',
     'GB_SIA_ELIG_CVIT', 'GB_SIA_ELIG_KH', 'GB_SIA_ELIG_NFL',
     'GB_SIA_QUAL_SG', 'GB_SIA_QUAL_DS', 'GB_SIA_QUAL_CCTV', 'GB_SIA_QUAL_CP',
     'GB_SIA_QUAL_CVIT', 'GB_SIA_TOP_UP'
   );

INSERT INTO public.sp_professional_titles
  (code, market_pack_code, profession_family_code, regulated_role_id,
   output_kind, name_local, name_en, requires_credential_codes,
   requires_assertion_level, requires_current_validity, is_active, priority)
SELECT v.code, 'GB', 'SECURITY_GUARD', r.id, v.output_kind,
       v.name, v.name, ARRAY[v.cred]::text[], 'verified', true, false, v.priority
FROM (VALUES
  ('GB_SIA_ELIGIBLE_NFL', 'local_eligibility', 'SIA Non-Front-Line licence held · United Kingdom',        'UK_SIA_LICENCE_NFL',  'GB_SIA_NON_FRONT_LINE',    210),
  ('GB_SIA_EDU_SG',   'education_completed', 'Licence-linked qualification — Security Guarding',        'UK_SIA_QUAL_SG',      'GB_SIA_SECURITY_GUARDING', 310),
  ('GB_SIA_EDU_DS',   'education_completed', 'Licence-linked qualification — Door Supervision',         'UK_SIA_QUAL_DS',      'GB_SIA_DOOR_SUPERVISION',  320),
  ('GB_SIA_EDU_CCTV', 'education_completed', 'Licence-linked qualification — Public Space Surveillance',  'UK_SIA_QUAL_CCTV',    'GB_SIA_PUBLIC_SPACE_CCTV', 330),
  ('GB_SIA_EDU_CP',   'education_completed', 'Licence-linked qualification — Close Protection',           'UK_SIA_QUAL_CP',      'GB_SIA_CLOSE_PROTECTION',  340),
  ('GB_SIA_EDU_CVIT', 'education_completed', 'Licence-linked qualification — Cash and Valuables in Transit','UK_SIA_QUAL_CVIT',    'GB_SIA_CVIT',              350),
  ('GB_SIA_EDU_TOP_UP','education_completed','SIA top-up / refresher training completed',                 'UK_SIA_TOP_UP',       NULL,                       360)
) AS v(code, output_kind, name, cred, role_code, priority)
LEFT JOIN public.sp_regulated_roles r ON r.code = v.role_code
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Prove the revert landed, and that it cost no holder data
-- ---------------------------------------------------------------------------
DO $verify$
DECLARE _total integer; _title integer; _elig integer; _edu integer; _stray text;
BEGIN
  SELECT count(*) INTO _total FROM public.sp_professional_titles WHERE market_pack_code = 'GB';
  SELECT count(*) INTO _title FROM public.sp_professional_titles
   WHERE market_pack_code = 'GB' AND output_kind = 'active_title';
  SELECT count(*) INTO _elig FROM public.sp_professional_titles
   WHERE market_pack_code = 'GB' AND output_kind = 'local_eligibility';
  SELECT count(*) INTO _edu FROM public.sp_professional_titles
   WHERE market_pack_code = 'GB' AND output_kind = 'education_completed';

  IF _total <> 13 OR _title <> 6 OR _elig <> 1 OR _edu <> 6 THEN
    RAISE EXCEPTION
      'ROLLBACK INCOMPLETE: expected the pre-correction 13/6/1/6, found %/%/%/%',
      _total, _title, _elig, _edu;
  END IF;

  SELECT string_agg(code, ', ' ORDER BY code) INTO _stray
    FROM public.sp_professional_titles
   WHERE market_pack_code = 'GB' AND code LIKE 'GB\_SIA\_ELIG\_%';
  IF _stray IS NOT NULL THEN
    RAISE EXCEPTION 'ROLLBACK INCOMPLETE: canonical eligibility rule(s) survive: %', _stray;
  END IF;

  RAISE NOTICE 'ok  reverted to the 13 pre-correction GB rules; holder data untouched';
END $verify$;

COMMIT;
