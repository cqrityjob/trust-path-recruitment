-- Career Intelligence Graph: two missing Swedish security leadership roles.
--
-- ── WHY ONLY TWO ─────────────────────────────────────────────────────────
--
-- A leader answering Career Discovery has to be able to say what they
-- actually do. An audit of cig_professions against the senior security roles
-- the Swedish market recognises found the catalogue already covers most of
-- them, under canonical titles:
--
--   Security Manager / Security Director / Head of Security / CSO
--       -> 'sakerhetschef' (Säkerhetschef / Head of Security)
--   Risk Manager                        -> 'risk-manager' (Riskchef)
--   Crisis / resilience leadership      -> 'krisberedskapssamordnare',
--                                          'bcm-specialist'
--   Security Coordinator                -> 'sakerhetssamordnare'
--
-- Those are NOT duplicated here. Minting an English "Security Director" row
-- beside Säkerhetschef would split one profession into several, each with its
-- own transitions, its own Career Center content and its own share of the
-- calibration -- the catalogue would grow and get less useful.
--
-- Two roles genuinely had no row and are not synonyms of one:
--
--   säkerhetsskyddschef -- the person an operator must appoint under
--       säkerhetsskyddslagen (2018:585). A distinct statutory function, not
--       a seniority label and not a synonym for säkerhetschef: an
--       organisation can have both, and the appointment carries its own
--       legal duties.
--
--   bevakningschef -- operational management inside an authorised guarding
--       company (bevakningsföretag). A line-management role over guarding
--       operations, which 'sakerhetschef' (client-side corporate security
--       leadership) does not describe.
--
-- ── content_status = 'draft', DELIBERATELY ───────────────────────────────
--
-- Both rows are selectable as a SELF-REPORTED current profession, which is
-- all this release needs. They carry no researched Career Center content and
-- no Layer 4 calibration, so 'draft' and quality_level 'C' state exactly
-- that -- the same shape the thirteen existing draft rows already have
-- (20260717073758). They are therefore not recommendable: cd_professions,
-- not this table, is what profession matching ranks, and neither role is in
-- it. Nothing here approves anything for ranking.
--
-- ── THE FAMILY IS RESOLVED AGAINST THE CANONICAL SET ─────────────────────
--
-- Not against the slugs the original 2026-07-17 seed used. Those families were
-- archived and hard-deleted by 20260717172039, which narrowed the graph to
-- fourteen canonical families with different slugs; a lookup on a legacy slug
-- silently yields NULL. Caught by clean-replay, not by review -- the first
-- version of this migration used 'corporate-security-leadership' and
-- 'operational-security' and produced two rows with no family at all.
--
-- The two roles take the same families as their nearest canonical neighbours,
-- which is what makes them findable in the same places:
--   sakerhetsskyddschef -> security-leadership-governance (as sakerhetschef)
--   bevakningschef      -> protective-operations          (as vaktare/skyddsvakt)
--
-- The assertion block below fails the migration if either lookup misses, so
-- this cannot regress into a NULL family again.
--
-- Additive: two INSERTs, ON CONFLICT DO NOTHING, no existing row touched, no
-- column, constraint, policy or grant changed.
--
-- Reversible: supabase/rollback/20260913092000_cig_security_leadership_professions_rollback.sql

INSERT INTO public.cig_professions
 (slug, canonical_key, primary_family_id, quality_level, content_status, is_regulated, country, jurisdiction,
  title_sv, title_en, summary_sv, summary_en, disclaimer_sv, disclaimer_en, graph_version, last_verified)
SELECT v.slug, v.canonical_key,
       (SELECT id FROM public.cig_profession_families WHERE slug = v.family_slug),
       v.quality_level::cig_quality_level, v.content_status::cig_content_status,
       v.is_regulated, v.country, v.jurisdiction,
       v.title_sv, v.title_en, v.summary_sv, v.summary_en, v.disclaimer_sv, v.disclaimer_en,
       'cig-2026.09-leadership.1', now()
FROM (VALUES
 ('sakerhetsskyddschef','se.security.sakerhetsskyddschef','security-leadership-governance','C','draft',true,'SE','SE',
  'Säkerhetsskyddschef','Head of Protective Security',
  'Utsedd befattning enligt säkerhetsskyddslagen med ansvar för verksamhetens säkerhetsskyddsarbete.',
  'Appointed function under the Swedish Protective Security Act, responsible for the organisation''s protective security work.',
  NULL,NULL),
 ('bevakningschef','se.security.bevakningschef','protective-operations','C','draft',false,'SE','SE',
  'Bevakningschef','Guarding Operations Manager',
  'Operativt chefsansvar för bevakningsverksamhet inom auktoriserat bevakningsföretag.',
  'Operational management responsibility for guarding services within an authorised guarding company.',
  NULL,NULL)
) AS v(slug, canonical_key, family_slug, quality_level, content_status, is_regulated, country, jurisdiction,
       title_sv, title_en, summary_sv, summary_en, disclaimer_sv, disclaimer_en)
ON CONFLICT (slug) DO NOTHING;

-- =========================================================================
-- Self-verification
-- =========================================================================

DO $$
DECLARE _n int; _approved int;
BEGIN
  SELECT count(*) INTO _n FROM public.cig_professions
   WHERE slug IN ('sakerhetsskyddschef','bevakningschef');
  IF _n <> 2 THEN
    RAISE EXCEPTION 'CIG_LEADERSHIP: expected both roles present, found %', _n;
  END IF;

  IF EXISTS (SELECT 1 FROM public.cig_professions
              WHERE slug IN ('sakerhetsskyddschef','bevakningschef')
                AND primary_family_id IS NULL) THEN
    RAISE EXCEPTION 'CIG_LEADERSHIP: a new role has no family -- the family slug did not resolve';
  END IF;

  -- These are self-report options, not recommendable professions. Layer 4
  -- ranks cd_professions; neither role may have appeared there.
  SELECT count(*) INTO _approved FROM public.cd_professions
   WHERE cig_profession_slug IN ('sakerhetsskyddschef','bevakningschef');
  IF _approved <> 0 THEN
    RAISE EXCEPTION 'CIG_LEADERSHIP: % of the new roles reached the ranked catalogue', _approved;
  END IF;
END $$;