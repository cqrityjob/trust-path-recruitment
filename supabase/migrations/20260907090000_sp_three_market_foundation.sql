-- Security Passport — the three-market regulatory foundation.
--
-- Additive only. No column is dropped, no constraint is tightened on an
-- existing row, every new column is NULLable or defaulted, and every existing
-- query keeps working. Sweden behaves exactly as it does today.
--
-- ── WHY THE VERSION IS NOT TODAY'S WALL CLOCK ──────────────────────────
--
-- Created with `supabase migration new sp_three_market_foundation`, which
-- stamped 20260822211350. This repository's migration versions deliberately
-- run ahead of the calendar (the latest applied is 20260906100000), so the
-- CLI's honest wall-clock stamp would sort BEFORE five migrations that are
-- already in the hosted ledger and replay out of order. Renamed to the next
-- canonical slot so repository replay order matches hosted apply order. The
-- filename is the only thing changed.
--
-- ── THE PROBLEM THIS SOLVES ────────────────────────────────────────────
--
-- Today jurisdiction is a two-letter string with exactly one value ('SE'),
-- and sp_credential_types has no country, no authority and no regulator. Put
-- a British SIA licence and a Swedish ordningsvaktsförordnande in that table
-- as it stands and they become peers in one flat vocabulary — which is the
-- precise shape of the claim this product must never make. A credential from
-- one market means nothing in another, and the schema has to be the thing
-- that knows it, not a convention in a component.
--
-- Four concepts are therefore separated, permanently:
--
--   jurisdiction        SE, GB, AE            — the country
--   sub-jurisdiction    AE-DU                 — the emirate/region, where the
--                                               authority is not national
--   authority           SIRA, SIA, Polisen    — who decides
--   market pack         SE, GB, AE-DU         — the reviewed body of rules
--
-- and one more that is easy to conflate and must not be:
--
--   profession family   SECURITY_GUARD        — global, descriptive
--   regulated role      Ordningsvakt, SIA DS  — local, legal
--
-- A regulated role belongs to exactly one market pack and maps UP to a family.
-- Nothing maps sideways. There is no table in which a Swedish role and a
-- British role are related to each other, because no such relation is true.
--
-- ── THE LEGAL GATE IS A CHECK CONSTRAINT, NOT A CONVENTION ─────────────
--
-- A market pack may only be active once its regulatory content has been
-- reviewed. That is enforced by sp_market_pack_active_needs_review rather
-- than by remembering, so shipping UK or UAE credentials to holders is
-- impossible until somebody deliberately records the review.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Jurisdictions: two more countries
-- ---------------------------------------------------------------------------
-- sp_jurisdictions already exists with CHECK (code ~ '^[A-Z]{2}$'). That check
-- is correct and stays: a country code IS two letters. Sub-jurisdictions get
-- their own table rather than loosening it, so 'AE-DU' can never be written
-- into a column whose readers assume ISO 3166-1 alpha-2.

INSERT INTO public.sp_jurisdictions (code, name_sv, name_en)
VALUES
  ('GB', 'Storbritannien', 'United Kingdom'),
  ('AE', 'Förenade Arabemiraten', 'United Arab Emirates')
ON CONFLICT (code) DO NOTHING;


-- ---------------------------------------------------------------------------
-- 2. Sub-jurisdictions
-- ---------------------------------------------------------------------------
-- Exists because "UAE" is not a regulator. SIRA licenses in Dubai; the other
-- six emirates have their own authorities, their own vocabularies and their
-- own processes, none of which have been reviewed. Storing a Dubai cadre card
-- as country='AE' would silently assert UAE-wide validity — a claim SIRA does
-- not make and this product must not make on its behalf.

CREATE TABLE IF NOT EXISTS public.sp_sub_jurisdictions (
  code text PRIMARY KEY CHECK (code ~ '^[A-Z]{2}-[A-Z0-9]{2,3}$'),

  jurisdiction_code text NOT NULL REFERENCES public.sp_jurisdictions(code),

  name_sv text NOT NULL CHECK (length(btrim(name_sv)) > 0),
  name_en text NOT NULL CHECK (length(btrim(name_en)) > 0),
  -- NULL until a competent native/legal reviewer supplies it. Deliberately
  -- not machine-filled: an Arabic legal term nobody checked is worse than a
  -- missing one, because it looks authoritative.
  name_ar text CHECK (name_ar IS NULL OR length(btrim(name_ar)) > 0),

  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),

  -- 'AE-DU' cannot be filed under Sweden. Cheap, and it closes the one way
  -- this table could produce a nonsense hierarchy.
  CONSTRAINT sp_sub_jurisdiction_matches_country
    CHECK (left(code, 2) = jurisdiction_code)
);

COMMENT ON TABLE public.sp_sub_jurisdictions IS
  'Emirates, devolved regions and any other sub-national area with its own '
  'security regulator. Present because a Dubai SIRA credential is not a UAE '
  'credential; only AE-DU is supported, and every other emirate is absent '
  'rather than assumed.';

-- Dubai is supported. The other six emirates are listed and INACTIVE rather
-- than omitted, and the difference matters: an absent row makes the foreign
-- key reject "AE-AZ" with a referential error that reads like a bug, while an
-- inactive row lets the trigger answer "Abu Dhabi is not supported yet" — a
-- true statement the UI can render as a state. Each of the six needs its own
-- authority, vocabulary, sources and verification route reviewed before it
-- could ever be switched on.
INSERT INTO public.sp_sub_jurisdictions (code, jurisdiction_code, name_sv, name_en, is_active)
VALUES
  ('AE-DU', 'AE', 'Dubai',           'Dubai',           true),
  ('AE-AZ', 'AE', 'Abu Dhabi',       'Abu Dhabi',       false),
  ('AE-SH', 'AE', 'Sharjah',         'Sharjah',         false),
  ('AE-AJ', 'AE', 'Ajman',           'Ajman',           false),
  ('AE-UQ', 'AE', 'Umm al-Quwain',   'Umm Al Quwain',   false),
  ('AE-RK', 'AE', 'Ras al-Khaimah',  'Ras Al Khaimah',  false),
  ('AE-FU', 'AE', 'Fujairah',        'Fujairah',        false)
ON CONFLICT (code) DO NOTHING;


-- ---------------------------------------------------------------------------
-- 3. Market packs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sp_market_packs (
  code text PRIMARY KEY CHECK (code ~ '^[A-Z]{2}(-[A-Z0-9]{2,3})?$'),

  jurisdiction_code     text NOT NULL REFERENCES public.sp_jurisdictions(code),
  sub_jurisdiction_code text REFERENCES public.sp_sub_jurisdictions(code),

  name_sv text NOT NULL CHECK (length(btrim(name_sv)) > 0),
  name_en text NOT NULL CHECK (length(btrim(name_en)) > 0),
  name_ar text CHECK (name_ar IS NULL OR length(btrim(name_ar)) > 0),

  -- 'pending'      — authored from official sources, nobody has reviewed it
  -- 'in_review'    — with a reviewer now
  -- 'approved'     — a named reviewer signed off, recorded below
  -- 'grandfathered'— shipped before this registry existed. Carries the SAME
  --                  review debt as 'pending'; the separate value exists so
  --                  the debt is visible rather than laundered into 'approved'.
  legal_review_state text NOT NULL DEFAULT 'pending'
    CHECK (legal_review_state IN ('pending', 'in_review', 'approved', 'grandfathered')),
  legal_reviewed_by  text,
  legal_reviewed_on  date,

  is_active boolean NOT NULL DEFAULT false,

  effective_from date,
  superseded_on  date,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- The legal gate, as a constraint rather than a habit. Unreviewed
  -- regulatory content cannot be switched on by an INSERT, a seed, a test
  -- fixture or a well-meaning fix.
  CONSTRAINT sp_market_pack_active_needs_review
    CHECK (NOT is_active OR legal_review_state IN ('approved', 'grandfathered')),

  CONSTRAINT sp_market_pack_approval_is_attributed
    CHECK (legal_review_state <> 'approved'
           OR (legal_reviewed_by IS NOT NULL AND legal_reviewed_on IS NOT NULL)),

  CONSTRAINT sp_market_pack_sub_matches_country
    CHECK (sub_jurisdiction_code IS NULL
           OR left(sub_jurisdiction_code, 2) = jurisdiction_code),

  CONSTRAINT sp_market_pack_dates_ordered
    CHECK (superseded_on IS NULL OR effective_from IS NULL OR superseded_on >= effective_from)
);

COMMENT ON TABLE public.sp_market_packs IS
  'One reviewed body of regulatory rules per market. is_active cannot be true '
  'while legal_review_state is pending or in_review — see '
  'sp_market_pack_active_needs_review. That constraint is the reason an '
  'unreviewed UK or Dubai credential cannot reach a holder.';

COMMENT ON COLUMN public.sp_market_packs.legal_review_state IS
  'grandfathered means shipped before this registry existed and NOT reviewed. '
  'It is not a synonym for approved and must never be treated as one.';

INSERT INTO public.sp_market_packs
  (code, jurisdiction_code, sub_jurisdiction_code,
   name_sv, name_en, legal_review_state, is_active, effective_from)
VALUES
  -- Sweden is live today. Recording it as grandfathered states the truth:
  -- it works, and its regulatory content has not been through this registry's
  -- review either. Marking it 'approved' would be inventing a sign-off.
  ('SE',    'SE', NULL,
   'Sverige', 'Sweden', 'grandfathered', true, NULL),

  ('GB',    'GB', NULL,
   'Storbritannien', 'United Kingdom', 'pending', false, NULL),

  ('AE-DU', 'AE', 'AE-DU',
   'Dubai (SIRA)', 'Dubai (SIRA)', 'pending', false, NULL)
ON CONFLICT (code) DO NOTHING;


-- ---------------------------------------------------------------------------
-- 4. Profession families — global, descriptive, never legal
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sp_profession_families (
  code text PRIMARY KEY CHECK (code ~ '^[A-Z_]{3,32}$'),
  name_sv text NOT NULL,
  name_en text NOT NULL,
  name_ar text,
  is_active  boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.sp_profession_families IS
  'The global, descriptive layer: what kind of work this is, in any country. '
  'A family NEVER carries legal authority to work anywhere. Two roles sharing '
  'a family are similar occupations, not equivalent credentials.';

INSERT INTO public.sp_profession_families (code, name_sv, name_en, sort_order)
VALUES ('SECURITY_GUARD', 'Bevakning och ordningshållning', 'Security and guarding', 10)
ON CONFLICT (code) DO NOTHING;


-- ---------------------------------------------------------------------------
-- 5. Authorities
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sp_authorities (
  id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9_]{2,40}$'),

  jurisdiction_code     text NOT NULL REFERENCES public.sp_jurisdictions(code),
  sub_jurisdiction_code text REFERENCES public.sp_sub_jurisdictions(code),

  -- The authority's own name in its own language. Not a translation target:
  -- "Länsstyrelsen" is what the decision says, and rendering it as "County
  -- Administrative Board" in a Swedish document would misquote the source.
  name_local text NOT NULL CHECK (length(btrim(name_local)) > 0),
  name_en    text NOT NULL CHECK (length(btrim(name_en)) > 0),
  name_ar    text,

  official_url text CHECK (official_url IS NULL OR official_url ~ '^https://'),

  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT sp_authority_sub_matches_country
    CHECK (sub_jurisdiction_code IS NULL
           OR left(sub_jurisdiction_code, 2) = jurisdiction_code)
);

COMMENT ON TABLE public.sp_authorities IS
  'Who actually decides. Separate from the issuer a holder types, which is '
  'claimed and unverified: an authority here is the body whose decision the '
  'credential IS, and a training provider is not one.';

INSERT INTO public.sp_authorities
  (code, jurisdiction_code, sub_jurisdiction_code, name_local, name_en, official_url)
VALUES
  ('SE_POLISMYNDIGHETEN', 'SE', NULL,
   'Polismyndigheten', 'Swedish Police Authority',
   'https://polisen.se/lagar-och-regler/ordningsvakter/'),

  ('SE_LANSSTYRELSEN', 'SE', NULL,
   'Länsstyrelsen', 'County Administrative Board',
   'https://www.lansstyrelsen.se/ostergotland/samhalle/tillstand-for-att-utova-verksamhet/bevakningsforetag.html'),

  ('GB_SIA', 'GB', NULL,
   'Security Industry Authority', 'Security Industry Authority',
   'https://www.gov.uk/government/organisations/security-industry-authority'),

  ('AE_DU_SIRA', 'AE', 'AE-DU',
   'Security Industry Regulatory Agency', 'Security Industry Regulatory Agency',
   'https://www.sira.gov.ae/en/services')
ON CONFLICT (code) DO NOTHING;


-- ---------------------------------------------------------------------------
-- 6. Regulated roles — local, legal, never portable
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sp_regulated_roles (
  id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9_]{2,48}$'),

  market_pack_code       text NOT NULL REFERENCES public.sp_market_packs(code),
  profession_family_code text NOT NULL REFERENCES public.sp_profession_families(code),
  authority_id           uuid REFERENCES public.sp_authorities(id),

  name_local text NOT NULL CHECK (length(btrim(name_local)) > 0),
  name_en    text NOT NULL CHECK (length(btrim(name_en)) > 0),
  name_ar    text,

  is_active  boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.sp_regulated_roles IS
  'The local legal layer: Väktare, Ordningsvakt, SIA Door Supervisor, SIRA '
  'Security Guard. Each belongs to exactly one market pack. There is '
  'deliberately no table relating one role to a role in another market, '
  'because no such equivalence exists.';

-- Sweden's three roles. The UK and Dubai roles arrive with their own packs,
-- so that a role can never exist without the reviewed rules that define it.
INSERT INTO public.sp_regulated_roles
  (code, market_pack_code, profession_family_code, authority_id,
   name_local, name_en, sort_order)
SELECT v.code, 'SE', 'SECURITY_GUARD', a.id, v.name_local, v.name_en, v.sort_order
FROM (VALUES
    ('SE_VAKTARE',      'Väktare',      'Security guard (Väktare)',                10, NULL),
    ('SE_ORDNINGSVAKT', 'Ordningsvakt', 'Public order guard (Ordningsvakt)',       20, 'SE_POLISMYNDIGHETEN'),
    ('SE_SKYDDSVAKT',   'Skyddsvakt',   'Protective security guard (Skyddsvakt)',  30, 'SE_LANSSTYRELSEN')
  ) AS v(code, name_local, name_en, sort_order, authority_code)
LEFT JOIN public.sp_authorities a ON a.code = v.authority_code
ON CONFLICT (code) DO NOTHING;


-- ---------------------------------------------------------------------------
-- 7. The regulatory source registry
-- ---------------------------------------------------------------------------
-- Legal assumptions currently live in UI components and migration comments,
-- where nobody can audit them and nothing notices when the source moves. This
-- is the maintainable alternative: every rule points at the official page it
-- came from, the date somebody read it, and a fingerprint of what it said.
--
-- What this table deliberately does NOT do is make legislation executable.
-- Remote content never changes a rule. A changed fingerprint writes a review
-- item (section 8) and a human decides.

CREATE TABLE IF NOT EXISTS public.sp_regulatory_sources (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key text NOT NULL UNIQUE CHECK (source_key ~ '^[a-z0-9_]{3,64}$'),

  jurisdiction_code text NOT NULL REFERENCES public.sp_jurisdictions(code),
  market_pack_code  text REFERENCES public.sp_market_packs(code),
  authority_id      uuid REFERENCES public.sp_authorities(id),

  title text NOT NULL CHECK (length(btrim(title)) > 0),
  url   text NOT NULL CHECK (url ~ '^https://'),

  source_type text NOT NULL CHECK (source_type IN
    ('authority_guidance', 'legislation', 'regulator_register',
     'data_protection_guidance', 'training_directory')),

  -- The date a HUMAN OR THE MONITOR last read it, and what it said then.
  checked_on          date,
  content_fingerprint text CHECK (content_fingerprint IS NULL
                                  OR content_fingerprint ~ '^[0-9a-f]{64}$'),
  availability text NOT NULL DEFAULT 'unchecked'
    CHECK (availability IN ('unchecked', 'available', 'unreachable')),

  review_state text NOT NULL DEFAULT 'review_needed'
    CHECK (review_state IN ('current', 'review_needed', 'superseded')),

  effective_from date,
  superseded_on  date,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- A source cannot claim to be current until somebody has actually read it
  -- and recorded what it said. Without this, seeding a URL would be enough to
  -- make a rule look sourced.
  CONSTRAINT sp_source_current_has_been_checked
    CHECK (review_state <> 'current'
           OR (checked_on IS NOT NULL
               AND content_fingerprint IS NOT NULL
               AND availability = 'available'))
);

COMMENT ON TABLE public.sp_regulatory_sources IS
  'Official source of truth for every regulatory rule the product encodes. '
  'review_state cannot be current without checked_on and a fingerprint, so an '
  'unread URL can never make a rule look sourced.';

-- Seeded unchecked on purpose. The monitor sets checked_on, the fingerprint
-- and availability on its first run; until then every one of these reads
-- honestly as review_needed.
INSERT INTO public.sp_regulatory_sources
  (source_key, jurisdiction_code, market_pack_code, authority_id, title, url, source_type)
SELECT v.source_key, v.jurisdiction_code, v.market_pack_code, a.id,
       v.title, v.url, v.source_type
FROM (VALUES
  -- ── Sweden ──────────────────────────────────────────────────────────
  ('se_polisen_ordningsvakter', 'SE', 'SE', 'SE_POLISMYNDIGHETEN',
   'Polisen — Ordningsvakter',
   'https://polisen.se/lagar-och-regler/ordningsvakter/', 'authority_guidance'),
  ('se_polisen_ov_utbildningar', 'SE', 'SE', 'SE_POLISMYNDIGHETEN',
   'Polisen — Ordningsvaktsutbildningar',
   'https://polisen.se/lagar-och-regler/ordningsvakter/utbildning-till-ordningsvakt/ordningsvaktsutbildningar/', 'authority_guidance'),
  ('se_polisen_ov_fortbildning', 'SE', 'SE', 'SE_POLISMYNDIGHETEN',
   'Polisen — Fortbildning för ordningsvakter',
   'https://polisen.se/lagar-och-regler/ordningsvakter/utbildning-till-ordningsvakt/ordningsvaktsutbildningar/fortbildning/', 'authority_guidance'),
  ('se_lansstyrelsen_bevakningsforetag', 'SE', 'SE', 'SE_LANSSTYRELSEN',
   'Länsstyrelsen — Bevakningsföretag och personal',
   'https://www.lansstyrelsen.se/ostergotland/samhalle/tillstand-for-att-utova-verksamhet/bevakningsforetag.html', 'authority_guidance'),
  ('se_lansstyrelsen_skyddsvakt', 'SE', 'SE', 'SE_LANSSTYRELSEN',
   'Länsstyrelsen — Ansök om godkännande av skyddsvakt',
   'https://www.lansstyrelsen.se/e-portal/sok-e-tjanster/ansok-om-godkannande-av-skyddsvakt.html', 'authority_guidance'),
  ('se_imy_rekryteringssystem', 'SE', 'SE', NULL,
   'IMY — Rekryteringssystem och kompetensdatabaser',
   'https://www.imy.se/verksamhet/dataskydd/dataskydd-pa-olika-omraden/arbetsliv/rekryteringssystem-och-kompetensdatabaser/', 'data_protection_guidance'),
  ('se_imy_brottsuppgifter', 'SE', 'SE', NULL,
   'IMY — Brottsuppgifter i arbetslivet',
   'https://www.imy.se/verksamhet/dataskydd/dataskydd-pa-olika-omraden/arbetsliv/tillaten-behandling--vilka-krav-galler/brottsuppgifter/', 'data_protection_guidance'),
  ('se_imy_rattslig_grund', 'SE', 'SE', NULL,
   'IMY — Rättslig grund',
   'https://www.imy.se/verksamhet/dataskydd/dataskydd-pa-olika-omraden/arbetsliv/tillaten-behandling--vilka-krav-galler/rattslig-grund/', 'data_protection_guidance'),
  ('se_imy_konsekvensbedomning', 'SE', 'SE', NULL,
   'IMY — Konsekvensbedömning (DPIA)',
   'https://www.imy.se/verksamhet/dataskydd/dataskydd-pa-olika-omraden/arbetsliv/tillaten-behandling--vilka-krav-galler/konsekvensbedomning/', 'data_protection_guidance'),

  -- ── United Kingdom ──────────────────────────────────────────────────
  ('gb_sia_need_a_licence', 'GB', 'GB', 'GB_SIA',
   'GOV.UK — Find out if you need an SIA licence',
   'https://www.gov.uk/guidance/find-out-if-you-need-an-sia-licence', 'authority_guidance'),
  ('gb_sia_apply', 'GB', 'GB', 'GB_SIA',
   'GOV.UK — Apply for an SIA licence',
   'https://www.gov.uk/guidance/apply-for-an-sia-licence', 'authority_guidance'),
  ('gb_sia_training', 'GB', 'GB', 'GB_SIA',
   'GOV.UK — Check what training you need to get an SIA licence',
   'https://www.gov.uk/guidance/check-what-training-you-need-to-get-an-sia-licence', 'authority_guidance'),
  ('gb_sia_check_a_licence', 'GB', 'GB', 'GB_SIA',
   'GOV.UK — Check a private security licence',
   'https://www.gov.uk/check-a-private-security-licence', 'authority_guidance'),
  ('gb_sia_public_register', 'GB', 'GB', 'GB_SIA',
   'SIA — Public register of licence holders',
   'https://rolh.services.sia.homeoffice.gov.uk/', 'regulator_register'),
  ('gb_ico_recruitment', 'GB', 'GB', NULL,
   'ICO — Recruitment and selection',
   'https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/employment/recruitment-and-selection/', 'data_protection_guidance'),
  ('gb_ico_vetting', 'GB', 'GB', NULL,
   'ICO — Pre-employment vetting of candidates',
   'https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/employment/recruitment-and-selection/pre-employment-vetting-of-candidates/', 'data_protection_guidance'),
  ('gb_ico_criminal_offence_data', 'GB', 'GB', NULL,
   'ICO — Rules on criminal offence data',
   'https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/criminal-offence-data/what-are-the-rules-on-criminal-offence-data/', 'data_protection_guidance'),
  ('gb_ico_automated_decisions', 'GB', 'GB', NULL,
   'ICO — Rights related to automated decision-making including profiling',
   'https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/individual-rights/rights-related-to-automated-decision-making-including-profiling/', 'data_protection_guidance'),

  -- ── UAE / Dubai ─────────────────────────────────────────────────────
  ('ae_du_sira_services', 'AE', 'AE-DU', 'AE_DU_SIRA',
   'SIRA — Services',
   'https://www.sira.gov.ae/en/services', 'authority_guidance'),
  ('ae_du_sira_cadre_card', 'AE', 'AE-DU', 'AE_DU_SIRA',
   'SIRA — Security Cadre Card',
   'https://www.sira.gov.ae/en/services/security-cadre-card', 'authority_guidance'),
  ('ae_du_sira_cadre_card_individual', 'AE', 'AE-DU', 'AE_DU_SIRA',
   'SIRA — Security Cadre Card (individual)',
   'https://www.sira.gov.ae/en/services/security-cadre-card-individual-3ad09d1c-2c672057', 'authority_guidance'),
  ('ae_du_sira_training_centres', 'AE', 'AE-DU', 'AE_DU_SIRA',
   'SIRA — Certified security training centres',
   'https://www.sira.gov.ae/en/information-center/certified-security-training-centers', 'training_directory'),
  ('ae_du_sira_portal', 'AE', 'AE-DU', 'AE_DU_SIRA',
   'SIRA — Portal and document verification',
   'https://portal.sira.gov.ae/web', 'regulator_register'),
  ('ae_business_regulations', 'AE', 'AE-DU', NULL,
   'u.ae — Business laws and compliance',
   'https://u.ae/en/information-and-services/business/Business-laws-and-compliance/business-regulations', 'legislation'),
  ('ae_data_protection_laws', 'AE', 'AE-DU', NULL,
   'u.ae — Data protection laws',
   'https://u.ae/en/about-the-uae/digital-uae/data/data-protection-laws', 'legislation')
) AS v(source_key, jurisdiction_code, market_pack_code, authority_code, title, url, source_type)
LEFT JOIN public.sp_authorities a ON a.code = v.authority_code
ON CONFLICT (source_key) DO NOTHING;


-- ---------------------------------------------------------------------------
-- 8. Source review items — append-only, and the reason rules stay human
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sp_source_review_items (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.sp_regulatory_sources(id) ON DELETE RESTRICT,

  detected_at timestamptz NOT NULL DEFAULT now(),

  observation text NOT NULL CHECK (observation IN
    ('content_changed', 'unreachable', 'first_check', 'manual_review_requested')),

  previous_fingerprint text CHECK (previous_fingerprint IS NULL
                                   OR previous_fingerprint ~ '^[0-9a-f]{64}$'),
  observed_fingerprint text CHECK (observed_fingerprint IS NULL
                                   OR observed_fingerprint ~ '^[0-9a-f]{64}$'),

  resolution text NOT NULL DEFAULT 'open'
    CHECK (resolution IN ('open', 'accepted', 'rejected', 'superseded')),
  resolved_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at         timestamptz,
  resolution_note     text CHECK (resolution_note IS NULL OR length(resolution_note) <= 2000)
);

CREATE INDEX IF NOT EXISTS sp_source_review_items_open_idx
  ON public.sp_source_review_items (source_id, detected_at DESC)
  WHERE resolution = 'open';

COMMENT ON TABLE public.sp_source_review_items IS
  'A detected change to an official source. Writing one changes NOTHING about '
  'any rule — that is the whole point. Legislation is never executable from '
  'remote content; a human reads the review item and decides.';


-- ---------------------------------------------------------------------------
-- 9. Professional titles — the derivation rules, as data
-- ---------------------------------------------------------------------------
-- Today the Passport Card reads a stored profession_family string and prints
-- it. Nothing recomputes it when a förordnande expires, and nothing prevents
-- "Ordningsvakt" from appearing for somebody who only completed the course.
--
-- The fix is a single versioned derivation engine (src/lib/security-passport/
-- identity/) fed by THIS table. Rules live here rather than in the engine for
-- the same reason credential rules live in sp_credential_types: a rule in
-- TypeScript is a second source of truth that agrees today and disagrees after
-- the next market pack.
--
-- ── FOUR OUTPUTS, NEVER MERGED ─────────────────────────────────────────
--
--   education_completed    — you finished a course. Says nothing else.
--   professional_competence— you hold the competence a role is built on.
--   local_eligibility      — an authority currently permits you to work.
--   active_title           — what you may currently be CALLED.
--
-- VU1 produces the first. VU1+VU2 produces the second. Only a current
-- appointment produces the third and fourth. Collapsing any two of these is
-- how a training certificate turns into a claim of legal authority.

CREATE TABLE IF NOT EXISTS public.sp_professional_titles (
  code text PRIMARY KEY CHECK (code ~ '^[A-Z0-9_]{2,48}$'),

  market_pack_code       text NOT NULL REFERENCES public.sp_market_packs(code),
  profession_family_code text REFERENCES public.sp_profession_families(code),
  regulated_role_id      uuid REFERENCES public.sp_regulated_roles(id),

  output_kind text NOT NULL CHECK (output_kind IN
    ('education_completed', 'professional_competence',
     'local_eligibility', 'active_title')),

  -- Bilingual by contract. Switching language changes the LABEL and nothing
  -- else: not the title, not the jurisdiction, not the verification state.
  name_local text NOT NULL CHECK (length(btrim(name_local)) > 0),
  name_en    text NOT NULL CHECK (length(btrim(name_en)) > 0),
  name_ar    text,

  -- EVERY code listed must be present and satisfy the requirements below.
  -- An AND, never an OR: "VU1 or VU2 makes you a Väktare" is exactly the
  -- rule this product must not have.
  requires_credential_codes text[] NOT NULL
    CHECK (cardinality(requires_credential_codes) BETWEEN 1 AND 8),

  requires_assertion_level text NOT NULL DEFAULT 'verified'
    CHECK (requires_assertion_level IN ('self_declared', 'document_provided', 'verified')),

  -- When true the credential must be current on the evaluation date. Expiry,
  -- revocation, supersession and dispute all remove the title on the next
  -- read — no job, no sweep, nothing to stop running.
  requires_current_validity boolean NOT NULL DEFAULT true,

  priority   integer NOT NULL DEFAULT 0,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),

  -- An eligibility or a title asserts legal standing. Self-declared evidence
  -- can never produce one; the holder's private view may PREVIEW a
  -- self-declared title, and that preview is built in the engine and labelled,
  -- never sourced from a rule that permits it.
  CONSTRAINT sp_title_authority_needs_verification
    CHECK (output_kind NOT IN ('local_eligibility', 'active_title')
           OR requires_assertion_level = 'verified'),

  CONSTRAINT sp_title_authority_needs_currency
    CHECK (output_kind NOT IN ('local_eligibility', 'active_title')
           OR requires_current_validity)
);

COMMENT ON TABLE public.sp_professional_titles IS
  'Credential-to-title derivation rules. The ONLY place this mapping exists — '
  'no React component may carry one, enforced by '
  'scripts/passport-title-derivation-check.ts. requires_credential_codes is '
  'an AND: every listed credential must be held and satisfy the row.';

COMMENT ON COLUMN public.sp_professional_titles.output_kind IS
  'education_completed / professional_competence / local_eligibility / '
  'active_title are four SEPARATE outputs and are never conflated. Completing '
  'training is not competence, and competence is not legal authority to work.';

-- Sweden's rules are seeded with the Sweden truth model, not here: a title
-- rule must not exist before the credentials it names.


-- ---------------------------------------------------------------------------
-- 10. sp_credential_types learns where it is
-- ---------------------------------------------------------------------------
-- All NULLable, then backfilled for the four Swedish launch credentials in
-- the same transaction, so no existing row is ever momentarily invalid.

ALTER TABLE public.sp_credential_types
  ADD COLUMN IF NOT EXISTS market_pack_code text
    REFERENCES public.sp_market_packs(code),
  ADD COLUMN IF NOT EXISTS jurisdiction_code text
    REFERENCES public.sp_jurisdictions(code),
  ADD COLUMN IF NOT EXISTS sub_jurisdiction_code text
    REFERENCES public.sp_sub_jurisdictions(code),
  ADD COLUMN IF NOT EXISTS authority_id uuid
    REFERENCES public.sp_authorities(id),
  ADD COLUMN IF NOT EXISTS regulated_role_id uuid
    REFERENCES public.sp_regulated_roles(id),
  ADD COLUMN IF NOT EXISTS name_ar text,
  ADD COLUMN IF NOT EXISTS legal_review_state text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS contributes_to text[] NOT NULL DEFAULT '{}'::text[];

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'sp_credential_type_review_state') THEN
    ALTER TABLE public.sp_credential_types
      ADD CONSTRAINT sp_credential_type_review_state
      CHECK (legal_review_state IN ('pending', 'in_review', 'approved', 'grandfathered'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'sp_credential_type_contributes_to_known') THEN
    ALTER TABLE public.sp_credential_types
      ADD CONSTRAINT sp_credential_type_contributes_to_known
      CHECK (contributes_to <@ ARRAY[
        'education_completed', 'professional_competence',
        'local_eligibility', 'active_title']::text[]);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'sp_credential_type_sub_matches_country') THEN
    ALTER TABLE public.sp_credential_types
      ADD CONSTRAINT sp_credential_type_sub_matches_country
      CHECK (sub_jurisdiction_code IS NULL
             OR jurisdiction_code IS NULL
             OR left(sub_jurisdiction_code, 2) = jurisdiction_code);
  END IF;
END $do$;

COMMENT ON COLUMN public.sp_credential_types.market_pack_code IS
  'Which reviewed body of rules this credential belongs to. A credential whose '
  'pack is inactive cannot be written to a claim — see '
  'sp_claims_credential_rules. This is what keeps a British licence and a '
  'Swedish förordnande from becoming peers in one flat vocabulary.';

COMMENT ON COLUMN public.sp_credential_types.contributes_to IS
  'Which of the four derivation outputs this credential can feed. Being able '
  'to feed active_title is NOT the same as producing one: the rule lives in '
  'sp_professional_titles and may require several credentials together.';

-- Backfill: the four Swedish launch credentials.
UPDATE public.sp_credential_types SET
  market_pack_code  = 'SE',
  jurisdiction_code = 'SE',
  legal_review_state = 'grandfathered'
WHERE code IN ('VU1', 'VU2', 'OV', 'SV');

-- VU1 is completed training and NOTHING else. It is not competence and it is
-- certainly not authority; the whole Swedish truth model turns on this row.
UPDATE public.sp_credential_types
   SET contributes_to = ARRAY['education_completed']::text[]
 WHERE code = 'VU1';

UPDATE public.sp_credential_types
   SET contributes_to = ARRAY['education_completed', 'professional_competence']::text[]
 WHERE code = 'VU2';

UPDATE public.sp_credential_types SET
  contributes_to    = ARRAY['local_eligibility', 'active_title']::text[],
  authority_id      = (SELECT id FROM public.sp_authorities WHERE code = 'SE_POLISMYNDIGHETEN'),
  regulated_role_id = (SELECT id FROM public.sp_regulated_roles WHERE code = 'SE_ORDNINGSVAKT')
WHERE code = 'OV';

UPDATE public.sp_credential_types SET
  contributes_to    = ARRAY['local_eligibility', 'active_title']::text[],
  authority_id      = (SELECT id FROM public.sp_authorities WHERE code = 'SE_LANSSTYRELSEN'),
  regulated_role_id = (SELECT id FROM public.sp_regulated_roles WHERE code = 'SE_SKYDDSVAKT')
WHERE code = 'SV';


-- ---------------------------------------------------------------------------
-- 11. sp_claims learns which emirate
-- ---------------------------------------------------------------------------
ALTER TABLE public.sp_claims
  ADD COLUMN IF NOT EXISTS sub_jurisdiction_code text
    REFERENCES public.sp_sub_jurisdictions(code);

COMMENT ON COLUMN public.sp_claims.sub_jurisdiction_code IS
  'Required for any jurisdiction whose regulator is sub-national. A UAE claim '
  'without it is refused rather than stored as UAE-wide — see '
  'sp_claims_credential_rules.';

CREATE INDEX IF NOT EXISTS sp_claims_sub_jurisdiction_idx
  ON public.sp_claims (holder_user_id, sub_jurisdiction_code)
  WHERE sub_jurisdiction_code IS NOT NULL;


-- ---------------------------------------------------------------------------
-- 12. Fail closed: the claim trigger learns about markets
-- ---------------------------------------------------------------------------
-- Extends the existing sp_claims_credential_rules rather than adding a second
-- trigger. Two triggers on one table would mean two places to read before
-- anyone could say what the database actually refuses.
--
-- Everything the previous version did, it still does, in the same order. The
-- additions are the four market checks, and they sit BEFORE the draft
-- exemption on purpose: a missing valid_until becomes valid when the holder
-- finishes typing, but an unsupported jurisdiction never does. Letting a draft
-- hold one would mean the refusal arrives at submit time, after the work.

CREATE OR REPLACE FUNCTION public.sp_claims_credential_rules()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $fn$
DECLARE
  _t    public.sp_credential_types%ROWTYPE;
  _pack public.sp_market_packs%ROWTYPE;
  _country_needs_sub boolean;
BEGIN
  -- ── Market gate, independent of the credential taxonomy ──────────────
  -- Applies to every claim that names a jurisdiction, including free-text
  -- ones: an unknown or unreviewed market must fail closed regardless of
  -- whether the holder picked a supported credential inside it.
  IF NEW.jurisdiction_code IS NOT NULL THEN
    SELECT * INTO _pack
      FROM public.sp_market_packs
     WHERE jurisdiction_code = NEW.jurisdiction_code
       AND sub_jurisdiction_code IS NOT DISTINCT FROM NEW.sub_jurisdiction_code
       AND superseded_on IS NULL;

    IF NOT FOUND THEN
      SELECT EXISTS (
        SELECT 1 FROM public.sp_market_packs
         WHERE jurisdiction_code = NEW.jurisdiction_code
           AND sub_jurisdiction_code IS NOT NULL
      ) INTO _country_needs_sub;

      IF _country_needs_sub AND NEW.sub_jurisdiction_code IS NULL THEN
        -- The Dubai case. A UAE credential with no emirate would be stored as
        -- nationally valid, which SIRA does not claim and neither will we.
        RAISE EXCEPTION
          'SP_SUB_JURISDICTION_REQUIRED: % regulates security locally; name the emirate or region',
          NEW.jurisdiction_code
          USING ERRCODE = 'check_violation';
      END IF;

      IF NEW.sub_jurisdiction_code IS NOT NULL THEN
        -- Abu Dhabi, Sharjah and the rest land here. Separate from the
        -- unknown-country case so the UI can say which emirate is not
        -- supported yet rather than rejecting the country.
        RAISE EXCEPTION
          'SP_SUB_JURISDICTION_NOT_SUPPORTED: % is not supported yet',
          NEW.sub_jurisdiction_code
          USING ERRCODE = 'check_violation';
      END IF;

      RAISE EXCEPTION
        'SP_JURISDICTION_NOT_SUPPORTED: no market pack covers %',
        NEW.jurisdiction_code
        USING ERRCODE = 'check_violation';
    END IF;

    IF NOT _pack.is_active THEN
      -- Authored but unreviewed, or deliberately switched off. Distinguishable
      -- from "unknown" so the UI can say "not supported yet" rather than
      -- failing as though the holder typed something wrong.
      RAISE EXCEPTION
        'SP_MARKET_PACK_NOT_ACTIVE: market pack % is not available yet (legal review: %)',
        _pack.code, _pack.legal_review_state
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- ── Everything below is the pre-existing taxonomy contract ───────────
  IF NEW.credential_code IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO _t FROM public.sp_credential_types WHERE code = NEW.credential_code;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SP_CREDENTIAL_CODE_UNKNOWN: %', NEW.credential_code
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- A credential belongs to the market that regulates it. Filing a Swedish
  -- förordnande as a British claim is the cross-market equivalence this
  -- whole migration exists to prevent, so it is refused at the write.
  IF _t.jurisdiction_code IS NOT NULL
     AND NEW.jurisdiction_code IS NOT NULL
     AND _t.jurisdiction_code <> NEW.jurisdiction_code THEN
    RAISE EXCEPTION
      'SP_CREDENTIAL_JURISDICTION_MISMATCH: % is a % credential, filed as %',
      NEW.credential_code, _t.jurisdiction_code, NEW.jurisdiction_code
      USING ERRCODE = 'check_violation';
  END IF;

  IF _t.sub_jurisdiction_code IS NOT NULL
     AND NEW.sub_jurisdiction_code IS DISTINCT FROM _t.sub_jurisdiction_code THEN
    RAISE EXCEPTION
      'SP_SUB_JURISDICTION_NOT_SUPPORTED: % is issued in % and is not valid elsewhere',
      NEW.credential_code, _t.sub_jurisdiction_code
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.claim_type <> _t.claim_type THEN
    RAISE EXCEPTION 'SP_CREDENTIAL_CLAIM_TYPE_MISMATCH: % expects claim_type %, got %',
      NEW.credential_code, _t.claim_type, NEW.claim_type
      USING ERRCODE = 'check_violation';
  END IF;

  -- A draft is work in progress and is deliberately exempt from the
  -- COMPLETENESS rules: the holder is still filling the form in. The market
  -- checks above are not completeness rules and bind immediately.
  IF NEW.lifecycle_state = 'draft' THEN
    RETURN NEW;
  END IF;

  IF _t.requires_valid_until AND NEW.valid_until IS NULL THEN
    RAISE EXCEPTION 'SP_CREDENTIAL_REQUIRES_VALID_UNTIL: % is a time-limited appointment',
      NEW.credential_code
      USING ERRCODE = 'check_violation';
  END IF;

  IF _t.requires_issuer
     AND (NEW.claimed_issuer_name IS NULL OR length(btrim(NEW.claimed_issuer_name)) = 0) THEN
    RAISE EXCEPTION 'SP_CREDENTIAL_REQUIRES_ISSUER: % must name an appointing authority',
      NEW.credential_code
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $fn$;

COMMENT ON FUNCTION public.sp_claims_credential_rules IS
  'Enforces the taxonomy AND market rules on every claim write, for every '
  'caller including service_role. An unknown jurisdiction, an inactive market '
  'pack, a missing emirate and a cross-market credential each fail closed with '
  'a distinguishable SP_* code the UI renders as a state. Drafts are exempt '
  'from completeness only, never from the market gate.';

REVOKE ALL ON FUNCTION public.sp_claims_credential_rules() FROM PUBLIC, anon;


-- ---------------------------------------------------------------------------
-- 13. A title rule may not reach across a market
-- ---------------------------------------------------------------------------
-- Without this, one row saying "SIA_DS + VU2 makes you an Ordningsvakt" would
-- be storable, and the engine would faithfully derive it. The rules are data,
-- so the data needs the same integrity the code would have had.

CREATE OR REPLACE FUNCTION public.sp_professional_title_rule_integrity()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $fn$
DECLARE _code text;
        _t     public.sp_credential_types%ROWTYPE;
BEGIN
  FOREACH _code IN ARRAY NEW.requires_credential_codes LOOP
    SELECT * INTO _t FROM public.sp_credential_types WHERE code = _code;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'SP_TITLE_RULE_UNKNOWN_CREDENTIAL: % names %, which does not exist',
        NEW.code, _code
        USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF _t.market_pack_code IS DISTINCT FROM NEW.market_pack_code THEN
      RAISE EXCEPTION
        'SP_TITLE_RULE_CROSS_MARKET: % belongs to market %, but % is a % credential',
        NEW.code, NEW.market_pack_code, _code, coalesce(_t.market_pack_code, 'unassigned')
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;

  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS sp_professional_title_rule_integrity_trg ON public.sp_professional_titles;
CREATE TRIGGER sp_professional_title_rule_integrity_trg
  BEFORE INSERT OR UPDATE ON public.sp_professional_titles
  FOR EACH ROW EXECUTE FUNCTION public.sp_professional_title_rule_integrity();

COMMENT ON FUNCTION public.sp_professional_title_rule_integrity IS
  'Refuses a derivation rule that names a credential from another market. '
  'The one structural guarantee that no title can ever be derived from a '
  'foreign credential, however the rule data is edited.';

REVOKE ALL ON FUNCTION public.sp_professional_title_rule_integrity() FROM PUBLIC, anon;


-- ---------------------------------------------------------------------------
-- 14. RLS and grants
-- ---------------------------------------------------------------------------
-- RLS and grants are separate gates and both are set explicitly on every new
-- table. The hosted project's ALTER DEFAULT PRIVILEGES grants to anon, so the
-- REVOKE lines are load-bearing rather than decorative — a local replay cannot
-- observe that grant, which is exactly why it is written out here.
--
-- All seven tables are reference data: no personal data, no holder rows. They
-- are readable by any signed-in user so the forms, the renewal links and the
-- derivation engine can populate. None is readable by anon: the recipient page
-- never queries them — sp_disclosure_payload carries the labels it needs into
-- its payload, so the public surface stays exactly one function.

ALTER TABLE public.sp_sub_jurisdictions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sp_market_packs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sp_profession_families   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sp_authorities           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sp_regulated_roles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sp_regulatory_sources    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sp_source_review_items   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sp_professional_titles   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sp_sub_jurisdictions_read ON public.sp_sub_jurisdictions;
CREATE POLICY sp_sub_jurisdictions_read ON public.sp_sub_jurisdictions
  FOR SELECT TO authenticated USING (true);

-- Deliberately NOT filtered by is_active. A holder must be able to see that
-- Abu Dhabi exists and is not supported yet; hiding the row would render as
-- "that place does not exist", which is a different and wronger message.
COMMENT ON POLICY sp_sub_jurisdictions_read ON public.sp_sub_jurisdictions IS
  'Unsupported sub-jurisdictions stay visible on purpose so the UI can say '
  '"not supported yet" instead of silently omitting a real emirate.';

DROP POLICY IF EXISTS sp_market_packs_read ON public.sp_market_packs;
CREATE POLICY sp_market_packs_read ON public.sp_market_packs
  FOR SELECT TO authenticated USING (superseded_on IS NULL);

DROP POLICY IF EXISTS sp_profession_families_read ON public.sp_profession_families;
CREATE POLICY sp_profession_families_read ON public.sp_profession_families
  FOR SELECT TO authenticated USING (is_active);

DROP POLICY IF EXISTS sp_authorities_read ON public.sp_authorities;
CREATE POLICY sp_authorities_read ON public.sp_authorities
  FOR SELECT TO authenticated USING (is_active);

DROP POLICY IF EXISTS sp_regulated_roles_read ON public.sp_regulated_roles;
CREATE POLICY sp_regulated_roles_read ON public.sp_regulated_roles
  FOR SELECT TO authenticated USING (is_active);

DROP POLICY IF EXISTS sp_regulatory_sources_read ON public.sp_regulatory_sources;
CREATE POLICY sp_regulatory_sources_read ON public.sp_regulatory_sources
  FOR SELECT TO authenticated USING (superseded_on IS NULL);

DROP POLICY IF EXISTS sp_professional_titles_read ON public.sp_professional_titles;
CREATE POLICY sp_professional_titles_read ON public.sp_professional_titles
  FOR SELECT TO authenticated USING (is_active);

GRANT SELECT ON public.sp_sub_jurisdictions   TO authenticated;
GRANT SELECT ON public.sp_market_packs        TO authenticated;
GRANT SELECT ON public.sp_profession_families TO authenticated;
GRANT SELECT ON public.sp_authorities         TO authenticated;
GRANT SELECT ON public.sp_regulated_roles     TO authenticated;
GRANT SELECT ON public.sp_regulatory_sources  TO authenticated;
GRANT SELECT ON public.sp_professional_titles TO authenticated;

REVOKE ALL ON public.sp_sub_jurisdictions   FROM anon;
REVOKE ALL ON public.sp_market_packs        FROM anon;
REVOKE ALL ON public.sp_profession_families FROM anon;
REVOKE ALL ON public.sp_authorities         FROM anon;
REVOKE ALL ON public.sp_regulated_roles     FROM anon;
REVOKE ALL ON public.sp_regulatory_sources  FROM anon;
REVOKE ALL ON public.sp_professional_titles FROM anon;

-- sp_source_review_items gets RLS with NO policy and NO grant to either role.
-- That is not an omission: a review item is regulatory operations data, it is
-- written by the monitor under service_role, and nothing in the holder-facing
-- product has any reason to read one. RLS with no policy denies everyone;
-- adding a reader later is a deliberate change rather than a default.
REVOKE ALL ON public.sp_source_review_items FROM anon, authenticated;

-- Nothing may be written to reference data through the API by an end user.
-- Seeding and maintenance happen in migrations and under service_role.
REVOKE INSERT, UPDATE, DELETE ON public.sp_sub_jurisdictions   FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.sp_market_packs        FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.sp_profession_families FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.sp_authorities         FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.sp_regulated_roles     FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.sp_regulatory_sources  FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.sp_professional_titles FROM authenticated;


-- ---------------------------------------------------------------------------
-- 15. updated_at
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS sp_market_packs_set_updated_at ON public.sp_market_packs;
CREATE TRIGGER sp_market_packs_set_updated_at
  BEFORE UPDATE ON public.sp_market_packs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS sp_regulatory_sources_set_updated_at ON public.sp_regulatory_sources;
CREATE TRIGGER sp_regulatory_sources_set_updated_at
  BEFORE UPDATE ON public.sp_regulatory_sources
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMIT;
