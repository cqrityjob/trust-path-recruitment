-- Security Passport — restore the canonical UK title-derivation contract.
--
-- ── WHY THIS MIGRATION EXISTS ──────────────────────────────────────────
--
-- Migration 3 (20260907092000_sp_uk_market_pack.sql) was applied to the hosted
-- project through Lovable's tracked-migration mechanism on 2026-08-24 as
-- version 20260824082256. Lovable did NOT execute the reviewed file verbatim.
-- It rewrote the professional-title block, and the rewrite is what production
-- actually ran:
--
--   * six local_eligibility rules were DROPPED — GB_SIA_ELIG_SG, _DS, _CCTV,
--     _CP, _CVIT and _KH — and replaced by a single GB_SIA_ELIGIBLE_NFL;
--   * the six education_completed rules were RENAMED from
--     GB_SIA_QUAL_{SG,DS,CCTV,CP,CVIT} / GB_SIA_TOP_UP to
--     GB_SIA_EDU_{SG,DS,CCTV,CP,CVIT,TOP_UP}, with different display text.
--
-- Hosted therefore holds 13 GB rules where the reviewed contract defines 19.
-- The owner has decided that the reviewed canonical contract in
-- 20260907092000_sp_uk_market_pack.sql is authoritative.
--
-- ── WHY IT MATTERS ─────────────────────────────────────────────────────
--
-- local_eligibility and active_title are two of the four derivation outputs
-- this product refuses to merge. "This licence is currently active" and "this
-- is what the holder may be called" are different claims, and an employer
-- reading one is not reading the other. With only the NFL eligibility rule
-- present, a holder with a current SIA licence in security guarding, door
-- supervision, public space surveillance, close protection, CVIT or key
-- holding derived a TITLE but no statement that the licence was active — the
-- title floating free of the authority underneath it.
--
-- ── WHY IT IS A NEW FILE ───────────────────────────────────────────────
--
-- 20260907092000 is already in the hosted ledger. Editing it would change what
-- a replay produces without changing production, which is precisely how the
-- two silently diverge. This migration is forward-only and idempotent, and it
-- is versioned into the gap between migration 3 and migration 4 so a clean
-- replay applies it in the same order production will.
--
-- ── WHAT IT DOES NOT TOUCH ─────────────────────────────────────────────
--
-- Only rows in sp_professional_titles whose market_pack_code is 'GB'. No
-- credential type, no regulated role, no jurisdiction, no holder claim, no
-- evidence, no disclosure, no verification request or decision, no grant, no
-- RLS policy, and not the GB market pack's is_active / legal_review_state.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Remove the rows Lovable's rewrite invented
-- ---------------------------------------------------------------------------
-- Deleted rather than renamed. A rename would preserve the priority and
-- display text of the generated rows, and those differ from the reviewed ones
-- too; re-seeding from the canonical definition in section 2 is the only way
-- to be sure every column matches the contract rather than merely the code.
--
-- Nothing references sp_professional_titles by foreign key, so this removes
-- derivation rules and nothing else.

DELETE FROM public.sp_professional_titles
 WHERE market_pack_code = 'GB'
   AND code IN (
     'GB_SIA_ELIGIBLE_NFL',
     'GB_SIA_EDU_SG', 'GB_SIA_EDU_DS', 'GB_SIA_EDU_CCTV',
     'GB_SIA_EDU_CP', 'GB_SIA_EDU_CVIT', 'GB_SIA_EDU_TOP_UP'
   );

-- ---------------------------------------------------------------------------
-- 2. Seed the canonical set
-- ---------------------------------------------------------------------------
-- Copied verbatim from the VALUES block of 20260907092000_sp_uk_market_pack.sql
-- so the two cannot drift: same codes, same output_kind, same display text,
-- same source credential, same role and same priority.
--
-- ON CONFLICT DO NOTHING keeps this idempotent and leaves the six active_title
-- rows — which Lovable did reproduce correctly — untouched.

INSERT INTO public.sp_professional_titles
  (code, market_pack_code, profession_family_code, regulated_role_id,
   output_kind, name_local, name_en, requires_credential_codes,
   requires_assertion_level, requires_current_validity, is_active, priority)
SELECT v.code, 'GB', 'SECURITY_GUARD', r.id, v.output_kind,
       v.name, v.name, ARRAY[v.cred]::text[], 'verified', true, false, v.priority
FROM (VALUES
  ('GB_SIA_TITLE_SG',   'active_title',        'Security Guard (SIA licensed) · United Kingdom',          'UK_SIA_LICENCE_SG',   'GB_SIA_SECURITY_GUARDING', 110),
  ('GB_SIA_TITLE_DS',   'active_title',        'Door Supervisor (SIA licensed) · United Kingdom',         'UK_SIA_LICENCE_DS',   'GB_SIA_DOOR_SUPERVISION',  120),
  ('GB_SIA_TITLE_CCTV', 'active_title',        'CCTV Operator (SIA licensed) · United Kingdom',           'UK_SIA_LICENCE_CCTV', 'GB_SIA_PUBLIC_SPACE_CCTV', 130),
  ('GB_SIA_TITLE_CP',   'active_title',        'Close Protection Operative (SIA licensed) · United Kingdom','UK_SIA_LICENCE_CP',  'GB_SIA_CLOSE_PROTECTION',  140),
  ('GB_SIA_TITLE_CVIT', 'active_title',        'Cash and Valuables in Transit Operative (SIA licensed) · United Kingdom', 'UK_SIA_LICENCE_CVIT', 'GB_SIA_CVIT', 150),
  ('GB_SIA_TITLE_KH',   'active_title',        'Key Holder (SIA licensed) · United Kingdom',              'UK_SIA_LICENCE_KH',   'GB_SIA_KEY_HOLDING',       160),

  ('GB_SIA_ELIG_SG',    'local_eligibility',   'SIA licence active — security guarding',                  'UK_SIA_LICENCE_SG',   'GB_SIA_SECURITY_GUARDING', 210),
  ('GB_SIA_ELIG_DS',    'local_eligibility',   'SIA licence active — door supervision',                   'UK_SIA_LICENCE_DS',   'GB_SIA_DOOR_SUPERVISION',  220),
  ('GB_SIA_ELIG_CCTV',  'local_eligibility',   'SIA licence active — public space surveillance',          'UK_SIA_LICENCE_CCTV', 'GB_SIA_PUBLIC_SPACE_CCTV', 230),
  ('GB_SIA_ELIG_CP',    'local_eligibility',   'SIA licence active — close protection',                   'UK_SIA_LICENCE_CP',   'GB_SIA_CLOSE_PROTECTION',  240),
  ('GB_SIA_ELIG_CVIT',  'local_eligibility',   'SIA licence active — cash and valuables in transit',      'UK_SIA_LICENCE_CVIT', 'GB_SIA_CVIT',              250),
  ('GB_SIA_ELIG_KH',    'local_eligibility',   'SIA licence active — key holding',                        'UK_SIA_LICENCE_KH',   'GB_SIA_KEY_HOLDING',       260),
  ('GB_SIA_ELIG_NFL',   'local_eligibility',   'SIA non-front-line licence active',                       'UK_SIA_LICENCE_NFL',  'GB_SIA_NON_FRONT_LINE',    270),

  ('GB_SIA_QUAL_SG',    'education_completed', 'Licence-linked qualification completed — security guarding',      'UK_SIA_QUAL_SG',   'GB_SIA_SECURITY_GUARDING', 310),
  ('GB_SIA_QUAL_DS',    'education_completed', 'Licence-linked qualification completed — door supervision',       'UK_SIA_QUAL_DS',   'GB_SIA_DOOR_SUPERVISION',  320),
  ('GB_SIA_QUAL_CCTV',  'education_completed', 'Licence-linked qualification completed — public space surveillance', 'UK_SIA_QUAL_CCTV', 'GB_SIA_PUBLIC_SPACE_CCTV', 330),
  ('GB_SIA_QUAL_CP',    'education_completed', 'Licence-linked qualification completed — close protection',       'UK_SIA_QUAL_CP',   'GB_SIA_CLOSE_PROTECTION',  340),
  ('GB_SIA_QUAL_CVIT',  'education_completed', 'Licence-linked qualification completed — cash and valuables in transit', 'UK_SIA_QUAL_CVIT', 'GB_SIA_CVIT',        350),
  ('GB_SIA_TOP_UP',     'education_completed', 'SIA top-up training completed',                                   'UK_SIA_TOP_UP',    NULL,                       360)
) AS v(code, output_kind, name, cred, role_code, priority)
LEFT JOIN public.sp_regulated_roles r ON r.code = v.role_code
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Prove it, in the same transaction
-- ---------------------------------------------------------------------------
-- Counting is not enough on its own: 19 rows split the wrong way across the
-- three outputs would still be wrong, and that is exactly the failure this
-- migration repairs. So the split is asserted too, and then every canonical
-- code is required to exist exactly once.

DO $verify$
DECLARE
  _total   integer;
  _title   integer;
  _elig    integer;
  _edu     integer;
  _stray   text;
  _missing text;
  _dupes   text;
  _active  boolean;
  _review  text;
BEGIN
  SELECT count(*) INTO _total FROM public.sp_professional_titles WHERE market_pack_code = 'GB';
  IF _total <> 19 THEN
    RAISE EXCEPTION 'UK_TITLE_CORRECTION: expected 19 GB title rules, found %', _total;
  END IF;

  SELECT count(*) INTO _title FROM public.sp_professional_titles
   WHERE market_pack_code = 'GB' AND output_kind = 'active_title';
  SELECT count(*) INTO _elig FROM public.sp_professional_titles
   WHERE market_pack_code = 'GB' AND output_kind = 'local_eligibility';
  SELECT count(*) INTO _edu FROM public.sp_professional_titles
   WHERE market_pack_code = 'GB' AND output_kind = 'education_completed';

  IF _title <> 6 THEN
    RAISE EXCEPTION 'UK_TITLE_CORRECTION: expected 6 GB active_title rules, found %', _title;
  END IF;
  IF _elig <> 7 THEN
    RAISE EXCEPTION
      'UK_TITLE_CORRECTION: expected 7 GB local_eligibility rules, found %. '
      'This is the defect the correction exists to close: a current licence '
      'must say it is active, not only produce a title.', _elig;
  END IF;
  IF _edu <> 6 THEN
    RAISE EXCEPTION 'UK_TITLE_CORRECTION: expected 6 GB education_completed rules, found %', _edu;
  END IF;

  SELECT string_agg(code, ', ' ORDER BY code) INTO _stray
    FROM public.sp_professional_titles
   WHERE market_pack_code = 'GB'
     AND (code LIKE 'GB\_SIA\_EDU\_%' OR code = 'GB_SIA_ELIGIBLE_NFL');
  IF _stray IS NOT NULL THEN
    RAISE EXCEPTION 'UK_TITLE_CORRECTION: generated (non-canonical) rule(s) survive: %', _stray;
  END IF;

  SELECT string_agg(c, ', ' ORDER BY c) INTO _missing
    FROM unnest(ARRAY[
      'GB_SIA_TITLE_SG','GB_SIA_TITLE_DS','GB_SIA_TITLE_CCTV','GB_SIA_TITLE_CP',
      'GB_SIA_TITLE_CVIT','GB_SIA_TITLE_KH',
      'GB_SIA_ELIG_SG','GB_SIA_ELIG_DS','GB_SIA_ELIG_CCTV','GB_SIA_ELIG_CP',
      'GB_SIA_ELIG_CVIT','GB_SIA_ELIG_KH','GB_SIA_ELIG_NFL',
      'GB_SIA_QUAL_SG','GB_SIA_QUAL_DS','GB_SIA_QUAL_CCTV','GB_SIA_QUAL_CP',
      'GB_SIA_QUAL_CVIT','GB_SIA_TOP_UP']) AS c
   WHERE NOT EXISTS (SELECT 1 FROM public.sp_professional_titles t
                      WHERE t.code = c AND t.market_pack_code = 'GB');
  IF _missing IS NOT NULL THEN
    RAISE EXCEPTION 'UK_TITLE_CORRECTION: canonical rule(s) missing: %', _missing;
  END IF;

  SELECT string_agg(code || ' x' || n, ', ') INTO _dupes FROM (
    SELECT code, count(*) AS n FROM public.sp_professional_titles
     WHERE market_pack_code = 'GB' GROUP BY code HAVING count(*) > 1) d;
  IF _dupes IS NOT NULL THEN
    RAISE EXCEPTION 'UK_TITLE_CORRECTION: duplicate rule code(s): %', _dupes;
  END IF;

  -- The legal gate is not this migration's to move, and proving it did not
  -- move is cheaper than trusting that nothing touched it.
  SELECT is_active, legal_review_state INTO _active, _review
    FROM public.sp_market_packs WHERE code = 'GB';
  IF _active OR _review <> 'pending' THEN
    RAISE EXCEPTION
      'UK_TITLE_CORRECTION: the GB market pack must stay is_active=false / '
      'pending; found is_active=%, legal_review_state=%', _active, _review;
  END IF;

  RAISE NOTICE 'ok  19 canonical GB title rules (6 active_title, 7 local_eligibility, 6 education_completed); GB still inactive/pending';
END $verify$;

COMMIT;
