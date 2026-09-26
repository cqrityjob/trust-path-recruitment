-- Security Passport — India: four national qualifications, recordable by every
-- registered holder, without a market pack and without a legal-review bypass.
--
-- ── OWNER DECISION ──────────────────────────────────────────────────────
--
-- 2026-09-26, the India entry task: "The released Indian qualification
-- catalogue must be usable by ordinary registered candidates without individual
-- pilot grants. Public catalogue availability does not make personal claims or
-- evidence public." That is the per-definition approval recorded here as
-- `is_active = true` on four definitions and nothing else. No market pack is
-- created, activated or approved, and no legal review is claimed: every row
-- below carries `legal_review_state = 'pending'`.
--
-- ── WHY A NEW SCOPE, AND WHY IT DOES NOT WEAKEN THE LEGAL GATE ──────────
--
-- A market pack is "one reviewed body of RULES" (three-market-architecture.md)
-- and `sp_market_pack_active_needs_review` refuses to switch one on without a
-- named legal reviewer. That gate exists because a pack's definitions can
-- create LOCAL ELIGIBILITY and ACTIVE TITLES — statements about who may work.
--
-- The four Indian definitions below are qualifications awarded under India's
-- National Skills Qualifications Framework (NSQF). They are certificates of an
-- assessed competence. They permit no work anywhere, India included, and in
-- India the only private-security licence is the AGENCY's licence under the
-- Private Security Agencies (Regulation) Act 2005 — there is no personal
-- "PSARA licence", and this migration creates none.
--
-- So they are declared with a third scope, `national_qualification`, whose
-- constraint makes it STRUCTURALLY incapable of carrying rules:
--
--   * jurisdiction required, sub-jurisdiction refused (no state-level claim);
--   * NO market pack, NO regulated role, NO authority_id;
--   * contributes_to may NEVER include local_eligibility or active_title;
--   * claim_type certification/training, category qualification only.
--
-- A national_qualification therefore needs no market pack for exactly the
-- reason a global_professional certification needs none (20261111090000): it
-- makes no statement a legal review would have to stand behind. Every existing
-- rule is untouched: a claim that names any OTHER Indian credential code, or an
-- IN claim for a code that is not a national qualification, is still refused
-- SP_JURISDICTION_NOT_SUPPORTED, and SE, GB, GB-NI and AE-DU are unchanged.
--
-- ── WHO IS WHO (never interchangeable) ──────────────────────────────────
--
--   regulator      NCVET — National Council for Vocational Education and
--                  Training. Regulates awarding bodies and approves NSQF
--                  qualifications on the National Qualifications Register.
--   awarding body  MEPSC — Management & Entrepreneurship and Professional
--                  Skills Council, an NCVET-recognised awarding body; each
--                  qualification file states "MEPSC will certify the
--                  learners". Recorded per VERSION (sp_credential_definition_
--                  versions), because it is a fact about the qualification,
--                  not about one holder's certificate.
--   issuer         STATED ON THE CERTIFICATE. The holder copies it. Skill India
--                  certificates are delivered as QR-coded digital certificates
--                  through DigiLocker and Skill India Digital (NSDC platforms);
--                  what a particular certificate prints as its issuer is not
--                  assumed, so the awarding body, NSDC and the training centre
--                  are never treated as one organisation. The save path
--                  refuses the regulator's own name as an issuer.
--   training provider  stated on the certificate.
--   verification   none automatic. The one documented route (NSDC's Skill
--                  Certificate API on API Setu) needs API Setu and NSDC approval
--                  and the holder's consent artefact; none exists, so nothing
--                  here claims or enables it.
--
-- ── VERSIONS, AND WHAT A VERSION IS NOT ─────────────────────────────────
--
-- A qualification pack is revised: MEP/Q7101 has been "Unarmed Security Guard"
-- and "Security Guard", at more than one NSQF level. A holder's certificate is
-- for the version they were assessed against, and a newer version does not make
-- it invalid. So the catalogue records versions separately
-- (`catalogue_status` current | superseded) and a holder MAY say which version
-- their certificate names (`sp_credential_details.definition_version`).
-- A superseded catalogue version is NOT an expired credential, and a
-- qualification's "next review date" is the standard's review, NEVER a
-- holder's expiry: requires_valid_until is false, allows_no_expiry is false
-- (no official source states lifetime validity either), and no expiry is ever
-- derived.
--
-- ── WHAT ELSE CHANGES ───────────────────────────────────────────────────
--
--   sp_approved_credential_catalogue  one branch added (national_qualification)
--   sp_claims_credential_rules        market gate skipped for a national
--                                     qualification of its own jurisdiction;
--                                     reproduced verbatim from 20261114090000
--   sp_closed_catalogue_details_guard version must belong to the definition
--   sp_save_international_credential  optional `definition_version` key
--   sp_verifier_request_detail        adds the claim's definition_version
--
-- Nothing is backfilled and no personal row is created, changed or deleted.
-- Sources checked 2026-09-26; see docs/release/2026-09-26-india-entry-schema.md.
--
-- Rollback: supabase/rollback/20261214090000_sp_india_national_qualifications_rollback.sql

BEGIN;

-- ── 0. Preconditions ────────────────────────────────────────────────────
DO $pre$
BEGIN
  IF to_regclass('public.sp_hayat_assessments') IS NULL THEN
    RAISE EXCEPTION 'SP_INDIA_PRECONDITION: 20261204090000 (HAYAT assessments) must be applied first';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='sp_save_international_credential'
                 AND pronamespace='public'::regnamespace AND prosrc LIKE '%authorisation_scope%') THEN
    RAISE EXCEPTION 'SP_INDIA_PRECONDITION: 20261126090000 (scope and document issuer) must be applied first';
  END IF;
  IF EXISTS (SELECT 1 FROM public.sp_market_packs WHERE jurisdiction_code='IN') THEN
    RAISE EXCEPTION 'SP_INDIA_PRECONDITION: an IN market pack exists; this migration assumes none';
  END IF;
END
$pre$;

-- ── 1. The scope ────────────────────────────────────────────────────────
INSERT INTO public.sp_credential_scopes (code, is_territorial, name_sv, name_en, meaning_en, sort_order)
VALUES ('national_qualification', true,
  'Nationell yrkeskvalifikation', 'National qualification',
  'A qualification awarded under one country''s national qualifications framework. '
  'It records an assessed competence and belongs to that country; it is NOT a licence '
  'or a permission to work anywhere, including in that country, so it carries no '
  'market rules and needs no market pack. Its jurisdiction never changes when the '
  'holder moves or states where they would like to work.',
  15);

ALTER TABLE public.sp_credential_types
  ADD CONSTRAINT sp_credential_type_national_qualification_bound
  CHECK (
    scope_code IS DISTINCT FROM 'national_qualification'
    OR (claim_type IN ('certification','training')
        AND category = 'qualification'
        AND jurisdiction_code IS NOT NULL
        AND sub_jurisdiction_code IS NULL
        AND market_pack_code IS NULL
        AND authority_id IS NULL
        AND regulated_role_id IS NULL
        AND NOT requires_scope
        AND NOT requires_valid_until
        AND NOT (contributes_to && ARRAY['local_eligibility','active_title']::text[]))
  );

-- ── 2. The country ──────────────────────────────────────────────────────
-- Also what lets a holder say "I work in India" (sp_passport_profiles.
-- jurisdiction_code references sp_jurisdictions). It opens no market.
INSERT INTO public.sp_jurisdictions (code, name_sv, name_en) VALUES ('IN', 'Indien', 'India');
INSERT INTO public.sp_credential_jurisdictions
  (code, jurisdiction_type, country_code, name_original, name_sv, name_en, source_url)
VALUES ('IN', 'national', 'IN', 'India', 'Indien', 'India', 'https://www.nqr.gov.in/');

-- ── 3. The regulator ────────────────────────────────────────────────────
INSERT INTO public.sp_authorities (code, jurisdiction_code, name_local, name_en, official_url)
VALUES ('IN_NCVET', 'IN',
  'National Council for Vocational Education and Training (NCVET)',
  'National Council for Vocational Education and Training (NCVET)',
  'https://ncvet.gov.in/');

-- ── 4. A class that says what these are ─────────────────────────────────
INSERT INTO public.sp_credential_classes (code, name_sv, name_en)
VALUES ('vocational_qualification', 'Yrkeskvalifikation', 'Vocational qualification');

-- ── 5. The four definitions ─────────────────────────────────────────────
-- Names are the official titles with their qualification-pack code, so a
-- reader can find the standard. Swedish uses the same title: it is a proper
-- name of an Indian qualification, not a phrase to translate.
INSERT INTO public.sp_credential_types
  (code, claim_type, category, name_sv, name_en, symbol_label,
   requires_valid_until, requires_issuer, is_active, sort_order,
   scope_code, legal_review_state, contributes_to, pilot_state,
   market_pack_code, jurisdiction_code, sub_jurisdiction_code,
   authority_id, regulated_role_id, allows_no_expiry,
   reference_label_en, reference_label_local)
SELECT v.code, 'certification', 'qualification', v.name, v.name, v.symbol,
       false, true, true, v.sort_order,
       'national_qualification', 'pending', ARRAY['education_completed']::text[], 'closed',
       NULL, 'IN', NULL, NULL, NULL, false,
       'Certificate number', 'Certificate number'
FROM (VALUES
  ('IN_MEPSC_Q7101', 'Security Guard (MEP/Q7101)',             'Q7101', 2010),
  ('IN_MEPSC_Q7201', 'Security Supervisor (MEP/Q7201)',        'Q7201', 2020),
  ('IN_MEPSC_Q7104', 'CCTV Supervisor (MEP/Q7104)',            'Q7104', 2030),
  ('IN_MEPSC_Q7204', 'CCTV Video Footage Auditor (MEP/Q7204)', 'Q7204', 2040)
) AS v(code, name, symbol, sort_order);

INSERT INTO public.sp_credential_definition_metadata
  (credential_code, credential_class, original_name, original_language, description, external_revision)
SELECT t.code, 'vocational_qualification', t.name_en, 'en',
  'NSQF qualification (India). Records an assessed competence; not a licence and not a permission to work.',
  NULL
FROM public.sp_credential_types t WHERE t.scope_code = 'national_qualification';

INSERT INTO public.sp_credential_definition_jurisdictions
  (credential_code, jurisdiction_code, relation, source_url, reviewed_on)
SELECT t.code, 'IN', r.relation, 'https://www.nqr.gov.in/', DATE '2026-09-26'
FROM public.sp_credential_types t CROSS JOIN (VALUES ('issuing'),('validity')) r(relation)
WHERE t.scope_code = 'national_qualification';

-- ── 6. Organisation roles and source review ────────────────────────────
INSERT INTO public.sp_credential_organisation_roles
  (credential_code, role, authority_id, certification_issuer_id, document_specific, source_url, checked_on)
SELECT t.code, 'regulator', a.id, NULL, false, 'https://ncvet.gov.in/', DATE '2026-09-26'
FROM public.sp_credential_types t JOIN public.sp_authorities a ON a.code = 'IN_NCVET'
WHERE t.scope_code = 'national_qualification';

INSERT INTO public.sp_credential_organisation_roles
  (credential_code, role, authority_id, certification_issuer_id, document_specific, source_url, checked_on)
SELECT t.code, r.role, NULL, NULL, true, 'https://www.mepsc.in/occupational_standar/security/', DATE '2026-09-26'
FROM public.sp_credential_types t CROSS JOIN (VALUES ('issuer'),('training_provider')) r(role)
WHERE t.scope_code = 'national_qualification';

INSERT INTO public.sp_credential_definition_reviews
  (credential_code, professional_domain, source_url, checked_on, validity_sv, validity_en)
SELECT t.code,
  CASE WHEN t.code IN ('IN_MEPSC_Q7104','IN_MEPSC_Q7204') THEN 'physical_security' ELSE 'security_operations' END,
  'https://www.mepsc.in/occupational_standar/security/', DATE '2026-09-26',
  'Indisk NSQF-kvalifikation. Ingen källa anger att intyget upphör att gälla; kvalifikationens granskningsdatum gäller standarden, inte innehavarens intyg. Den ger ingen behörighet att arbeta som väktare, i Indien eller någon annanstans.',
  'Indian NSQF qualification. No official source states that the certificate expires; the qualification''s review date applies to the standard, not to a holder''s certificate. It permits no security work, in India or anywhere else.'
FROM public.sp_credential_types t WHERE t.scope_code = 'national_qualification';

-- ── 7. Versions ─────────────────────────────────────────────────────────
CREATE TABLE public.sp_credential_definition_versions (
  credential_code text NOT NULL REFERENCES public.sp_credential_types(code),
  version_key text NOT NULL CHECK (version_key ~ '^[a-z0-9][a-z0-9._-]{0,39}$'),
  official_title text NOT NULL CHECK (length(btrim(official_title)) BETWEEN 1 AND 160),
  qualification_code text CHECK (qualification_code IS NULL OR length(btrim(qualification_code)) BETWEEN 1 AND 40),
  qualification_version text CHECK (qualification_version IS NULL OR length(btrim(qualification_version)) BETWEEN 1 AND 20),
  register_code text CHECK (register_code IS NULL OR length(btrim(register_code)) BETWEEN 1 AND 60),
  framework_level numeric(3,1) CHECK (framework_level IS NULL OR framework_level BETWEEN 1 AND 10),
  awarding_body text NOT NULL CHECK (length(btrim(awarding_body)) BETWEEN 2 AND 160),
  -- The CATALOGUE's status of this version. 'superseded' means a newer version
  -- of the standard exists; it says nothing about any holder's certificate.
  catalogue_status text NOT NULL CHECK (catalogue_status IN ('current','superseded')),
  sort_order integer NOT NULL DEFAULT 0,
  source_url text NOT NULL CHECK (source_url ~ '^https://'),
  checked_on date NOT NULL,
  note_en text CHECK (note_en IS NULL OR length(btrim(note_en)) BETWEEN 1 AND 400),
  PRIMARY KEY (credential_code, version_key)
);
COMMENT ON TABLE public.sp_credential_definition_versions IS
  'Governed versions of a definition (qualification-pack revisions). catalogue_status '
  'is about the standard, never about a holder: a superseded version is not an expired '
  'credential. Catalogue data: readable by signed-in users, written only by reviewed migration.';
CREATE UNIQUE INDEX sp_credential_definition_versions_one_current
  ON public.sp_credential_definition_versions (credential_code) WHERE catalogue_status = 'current';
ALTER TABLE public.sp_credential_definition_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sp_credential_definition_versions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.sp_credential_definition_versions FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.sp_credential_definition_versions TO authenticated, service_role;
CREATE POLICY sp_credential_definition_versions_read ON public.sp_credential_definition_versions
  FOR SELECT TO authenticated, service_role USING (true);

-- Sources read 2026-09-26. Each row names the page or file that states it.
-- MEPSC's own page gives the qualification-pack (QP) code and version; the
-- National Qualifications Register (NQR) gives the register code and level.
-- Where the two number versions differently, both are kept as printed and no
-- sequence is inferred. NOT recorded because not substantiated by an official
-- source: a 2018 "Unarmed Security Guard" NSQF-4 version of MEP/Q7101, and an
-- NQR code for MEP/Q7204 v4.0.
INSERT INTO public.sp_credential_definition_versions
  (credential_code, version_key, official_title, qualification_code, qualification_version,
   register_code, framework_level, awarding_body, catalogue_status, sort_order, source_url, checked_on, note_en)
VALUES
 ('IN_MEPSC_Q7101','qp-6.0','Security Guard','MEP/Q7101','6.0','QG-03-OA-04021-2025-V2-MEPSC',3,
  'Management & Entrepreneurship and Professional Skills Council (MEPSC)','current',10,
  'https://nqr.gov.in/qualifications/13642',DATE '2026-09-26',
  'Approved at the 43rd NSQC on 08/05/2025; the qualification is listed valid until 08/05/2028 (a review date of the standard, not a holder''s expiry).'),
 ('IN_MEPSC_Q7101','nqr-2022-05425','Security Guard','MEP/Q7101',NULL,'2022/OAFM/MEPSC/05425',3,
  'Management & Entrepreneurship and Professional Skills Council (MEPSC)','superseded',20,
  'https://nqr.gov.in/qualifications/2613',DATE '2026-09-26',
  'The 2022 registration (qualification file v.3, NSQC 24/02/2022). Its model curriculum page header reads "Unarmed Security Guard".'),
 ('IN_MEPSC_Q7201','qp-5.0','Security Supervisor','MEP/Q7201','5.0','QG-4.5-OA-04023-2025-V2-MEPSC',4.5,
  'Management & Entrepreneurship and Professional Skills Council (MEPSC)','current',10,
  'https://nqr.gov.in/qualifications/13650',DATE '2026-09-26',
  'Approved 08/05/2025; listed valid until 08/05/2028.'),
 ('IN_MEPSC_Q7201','nqr-2022-05429','Security Supervisor','MEP/Q7201',NULL,'2022/OAFM/MEPSC/05429',3,
  'Management & Entrepreneurship and Professional Skills Council (MEPSC)','superseded',20,
  'https://nqr.gov.in/qualifications/2651',DATE '2026-09-26',
  'The 2022 registration (qualification file v.4, NSQC 24/02/2022), at NSQF level 3 as both the register page and the file state.'),
 ('IN_MEPSC_Q7201','qp-1.0','Security Supervisor','MEP/Q7201','1.0',NULL,5,
  'Management & Entrepreneurship and Professional Skills Council (MEPSC)','superseded',30,
  'https://nqr.gov.in/sites/default/files/MEPQ7201%20Security%20Supervisor.pdf',DATE '2026-09-26',
  'The first qualification pack (drafted 2013, last reviewed 27/03/2018), at NSQF level 5.'),
 ('IN_MEPSC_Q7104','qp-5.0','CCTV Supervisor','MEP/Q7104','5.0','QG-4.5-OA-04024-2025-V2-MEPSC',4.5,
  'Management & Entrepreneurship and Professional Skills Council (MEPSC)','current',10,
  'https://nqr.gov.in/qualifications/13652',DATE '2026-09-26',
  'Approved 01/05/2025; listed valid until 30/04/2028.'),
 ('IN_MEPSC_Q7104','nqr-2022-05427','CCTV Supervisor','MEP/Q7104',NULL,'2022/OAFM/MEPSC/05427',4,
  'Management & Entrepreneurship and Professional Skills Council (MEPSC)','superseded',20,
  'https://nqr.gov.in/qualifications/2650',DATE '2026-09-26',
  'The 2022 registration (qualification file v.4, NSQC 24/02/2022).'),
 ('IN_MEPSC_Q7104','qp-1.0','CCTV Supervisor','MEP/Q7104','1.0',NULL,5,
  'Management & Entrepreneurship and Professional Skills Council (MEPSC)','superseded',30,
  'https://nqr.gov.in/sites/default/files/MEPQ7104%20CCTV%20Supervisor.pdf',DATE '2026-09-26',
  'The first qualification pack (drafted 2013), at NSQF level 5.'),
 ('IN_MEPSC_Q7204','qp-4.0','CCTV Video Footage Auditor','MEP/Q7204','4.0',NULL,4,
  'Management & Entrepreneurship and Professional Skills Council (MEPSC)','current',10,
  'https://www.mepsc.in/occupational_standar/security/',DATE '2026-09-26',
  'Listed by MEPSC as version 4.0, NSQF level 4. No National Qualifications Register record for this version was found on 2026-09-26.'),
 ('IN_MEPSC_Q7204','nqr-2022-06149','CCTV Video Footage Auditor','MEP/Q7204','3.0','2022/SEC/MEPSC/06149',4,
  'Management & Entrepreneurship and Professional Skills Council (MEPSC)','superseded',20,
  'https://nqr.gov.in/qualifications/3222',DATE '2026-09-26',
  'The 2022 registration (qualification file v.3.0, NSQC 17/11/2022), listed valid until 17/11/2025; MEPSC stopped new batches from that date. Certificates already awarded against it are not thereby invalid.');

ALTER TABLE public.sp_credential_details ADD COLUMN definition_version text
  CHECK (definition_version IS NULL OR definition_version ~ '^[a-z0-9][a-z0-9._-]{0,39}$');
COMMENT ON COLUMN public.sp_credential_details.definition_version IS
  'The version of the governed definition the holder says their certificate names. '
  'Optional; never inferred. Must be a row of sp_credential_definition_versions for '
  'the claim''s own definition (sp_closed_catalogue_details_guard).';

-- ── 8. Official sources (unchecked until the monitor or a human reads them) ─
INSERT INTO public.sp_regulatory_sources (source_key, jurisdiction_code, market_pack_code, authority_id, title, url, source_type)
SELECT v.k, 'IN', NULL, a.id, v.title, v.url, v.t
FROM (VALUES
  ('in_nqr_register', 'IN_NCVET', 'National Qualifications Register (NCVET)', 'https://www.nqr.gov.in/', 'regulator_register'),
  ('in_ncvet_home', 'IN_NCVET', 'NCVET — National Council for Vocational Education and Training', 'https://ncvet.gov.in/', 'authority_guidance'),
  ('in_mepsc_security_standards', NULL, 'MEPSC — Security occupational standards', 'https://www.mepsc.in/occupational_standar/security/', 'training_directory'),
  ('in_mha_psara', NULL, 'Ministry of Home Affairs — Acts and rules (Private Security Agencies (Regulation) Act 2005)', 'https://www.mha.gov.in/en/divisionofmha/police-modernisation-division/acts-rules', 'legislation')
) AS v(k, auth, title, url, t)
LEFT JOIN public.sp_authorities a ON a.code = v.auth;

-- ── 9. The catalogue view: one branch added ────────────────────────────
CREATE OR REPLACE VIEW public.sp_approved_credential_catalogue WITH (security_invoker=true,security_barrier=true) AS
SELECT t.code, t.claim_type, t.name_sv, t.name_en,
 coalesce(m.credential_class,CASE t.claim_type WHEN 'licence' THEN 'regulated_authorisation' WHEN 'training' THEN 'mandatory_training' ELSE 'certification' END) AS credential_class,
 t.scope_code, t.jurisdiction_code AS country, t.sub_jurisdiction_code AS region,
 CASE WHEN EXISTS (SELECT 1 FROM public.sp_credential_organisation_roles r WHERE r.credential_code=t.code AND r.role='issuer' AND r.document_specific)
      THEN NULL::uuid ELSE coalesce(i.id,a.id) END AS issuer_id,
 CASE WHEN EXISTS (SELECT 1 FROM public.sp_credential_organisation_roles r WHERE r.credential_code=t.code AND r.role='issuer' AND r.document_specific)
      THEN NULL::text ELSE coalesce(i.display_name,a.name_local) END AS issuer_name,
 coalesce(d.programme_url,a.official_url) AS official_url,
 coalesce(d.public_verification_url,i.public_verification_url) AS verification_url,
 i.verification_mode, t.requires_valid_until, t.allows_no_expiry,
 t.reference_pattern, m.original_language,
 d.maintenance_summary_en, t.typical_validity_months
FROM public.sp_credential_types t
LEFT JOIN public.sp_certification_definitions d ON d.credential_code=t.code
LEFT JOIN public.sp_certification_issuers i ON i.id=d.issuer_id AND i.is_active
 AND i.effective_from<=current_date AND (i.effective_to IS NULL OR i.effective_to>current_date)
LEFT JOIN public.sp_authorities a ON a.id=t.authority_id AND a.is_active
LEFT JOIN public.sp_credential_definition_metadata m ON m.credential_code=t.code
WHERE
 -- The DEFINITION must be approved (is_active) for everyone alike: pilot
 -- membership opens a market, it never approves a definition.
 -- A scoped definition (SV, a SIRA cadre card) is in the catalogue: the scope is a
 -- REQUIRED holder field enforced by the write path, not a reason to withhold it.
 --
 -- ROUTE A (owner decision, 2026-09-18). A definition is admitted when it is
 -- approved for everyone (is_active), OR when ALL of these hold: the definition
 -- itself is internal_pilot; ITS OWN market pack is internal_pilot and not
 -- active; and the caller holds a valid membership of THAT pack. The owner's
 -- per-definition pilot authorisation (20260915090000) is what is honoured:
 -- is_active stays false, so the day a pack is activated publicly a pilot-only
 -- definition is offered to NOBODY until it is approved on its own. A single
 -- definition is held back by setting its pilot_state to 'closed'.
 (t.is_active
  OR (t.pilot_state='internal_pilot' AND t.market_pack_code IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.sp_market_packs pp WHERE pp.code=t.market_pack_code
                   AND pp.pilot_state='internal_pilot' AND NOT pp.is_active AND pp.superseded_on IS NULL)
      AND public.sp_is_pilot_member(auth.uid(), t.market_pack_code)))
 AND m.deprecated_at IS NULL
 -- GUARDED RELEASE. A definition that needs a holder-written scope or a
 -- document-stated issuer can only be saved by an application that sends those
 -- fields. Over the REST LISTING of this view, such a row is offered only to a
 -- caller that declares the contract (header x-passport-catalogue-contract: 2).
 -- An application deployed before this migration sends no such header and is
 -- therefore never offered a credential its form cannot save. Every other
 -- reader — the save RPC, the table guards, SQL — sees the full catalogue.
 AND (NOT (t.requires_scope OR EXISTS (SELECT 1 FROM public.sp_credential_organisation_roles r
            WHERE r.credential_code=t.code AND r.role='issuer' AND r.document_specific))
      OR coalesce(current_setting('request.path', true),'') <> '/sp_approved_credential_catalogue'
      OR coalesce(nullif(current_setting('request.headers', true),'')::json->>'x-passport-catalogue-contract','') = '2')
 AND (d.effective_from IS NULL OR d.effective_from<=current_date)
 AND (d.retired_on IS NULL OR d.retired_on>current_date)
 AND public.sp_is_passport_credential(t.claim_type,t.code)
 AND ((t.scope_code='global_professional' AND i.id IS NOT NULL)
 OR (t.scope_code='national_regulated'
 -- The issuer is a governed authority, OR the governed organisation-role model
 -- says the issuer is stated on the document (an awarding organisation or an
 -- authorised training provider) under a governed, active REGULATOR.
 AND (a.id IS NOT NULL OR (
   EXISTS (SELECT 1 FROM public.sp_credential_organisation_roles r
            WHERE r.credential_code=t.code AND r.role='issuer' AND r.document_specific)
   AND EXISTS (SELECT 1 FROM public.sp_credential_organisation_roles r
            JOIN public.sp_authorities ra ON ra.id=r.authority_id AND ra.is_active
            WHERE r.credential_code=t.code AND r.role='regulator')))
 AND EXISTS (SELECT 1 FROM public.sp_jurisdictions j WHERE j.code=t.jurisdiction_code AND j.is_active)
 AND (t.sub_jurisdiction_code IS NULL OR EXISTS (SELECT 1 FROM public.sp_sub_jurisdictions j WHERE j.code=t.sub_jurisdiction_code AND j.is_active))
 AND EXISTS (
   SELECT 1 FROM public.sp_market_packs p WHERE p.code=t.market_pack_code
   -- An active market, or an internal-pilot market for its own pilot member:
   -- the same two states sp_market_access() reports as 'production' / 'pilot'.
   AND (p.is_active
        OR (p.pilot_state='internal_pilot' AND public.sp_is_pilot_member(auth.uid(), p.code)))
   AND p.superseded_on IS NULL
   AND p.jurisdiction_code=t.jurisdiction_code
   AND p.sub_jurisdiction_code IS NOT DISTINCT FROM t.sub_jurisdiction_code))
 -- ADDED 20261214090000. A NATIONAL QUALIFICATION carries no market rules
 -- (sp_credential_type_national_qualification_bound), so it needs no market
 -- pack: it is offered when it is approved (is_active, above), its country is
 -- active, the organisation-role model says its issuer is stated on the
 -- certificate, and a governed, active regulator of THAT country is recorded.
 OR (t.scope_code='national_qualification'
  AND t.market_pack_code IS NULL AND t.sub_jurisdiction_code IS NULL
  AND EXISTS (SELECT 1 FROM public.sp_jurisdictions j WHERE j.code=t.jurisdiction_code AND j.is_active)
  AND EXISTS (SELECT 1 FROM public.sp_credential_organisation_roles r
               WHERE r.credential_code=t.code AND r.role='issuer' AND r.document_specific)
  AND EXISTS (SELECT 1 FROM public.sp_credential_organisation_roles r
               JOIN public.sp_authorities ra ON ra.id=r.authority_id AND ra.is_active
                AND ra.jurisdiction_code=t.jurisdiction_code
               WHERE r.credential_code=t.code AND r.role='regulator')));

-- Re-stated, not assumed: a replaced view keeps its grants, and this says so.
REVOKE ALL ON public.sp_approved_credential_catalogue FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.sp_approved_credential_catalogue TO authenticated,service_role;


-- ── 10. The claim rules: the market gate skips a national qualification ─
-- Reproduced VERBATIM from 20261114090000 with the one condition and the
-- comment sentence marked ADDED.
CREATE OR REPLACE FUNCTION public.sp_claims_credential_rules()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $fn$
DECLARE
  _t    public.sp_credential_types%ROWTYPE;
  _pack public.sp_market_packs%ROWTYPE;
  _country_needs_sub boolean;
  _prev_scope text;
  _scope_missing boolean;
  _pilot_market boolean := false;
  _governed_issuer text;
BEGIN
  -- ── The market gate ────────────────────────────────────────────────
  --
  -- Scoped to regulated credentials. A claim that names no credential_code is
  -- a language, a practical capability or a general certificate; its
  -- jurisdiction is PROVENANCE — where the thing came from — and provenance is
  -- a fact about the holder's history, not a request to register a regulated
  -- authorisation in a market.
  --
  -- A global certification carries no jurisdiction at all, so it never enters
  -- this block: it is available to a holder in Sweden, in Dubai, in a country
  -- with no market pack and to a holder who has stated no country, and it
  -- needs no pilot entitlement to be recorded.
  --
  -- ADDED 20261214090000: a national qualification of its OWN jurisdiction
  -- skips the market gate, for the reason a global certification does: it
  -- authorises nothing, so there is no market rule to enforce. Only the exact
  -- pairing is exempt -- the definition's own country, no sub-jurisdiction --
  -- and everything below (availability, jurisdiction match, title, reference)
  -- still runs.
  IF NEW.credential_code IS NOT NULL AND NEW.jurisdiction_code IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.sp_credential_types q
                      WHERE q.code = NEW.credential_code
                        AND q.scope_code = 'national_qualification'
                        AND q.market_pack_code IS NULL
                        AND q.jurisdiction_code = NEW.jurisdiction_code
                        AND NEW.sub_jurisdiction_code IS NULL) THEN
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
        RAISE EXCEPTION
          'SP_SUB_JURISDICTION_REQUIRED: % regulates security locally; name the emirate or region',
          NEW.jurisdiction_code
          USING ERRCODE = 'check_violation';
      END IF;

      IF NEW.sub_jurisdiction_code IS NOT NULL THEN
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
      _pilot_market := _pack.pilot_state = 'internal_pilot'
                       AND public.sp_is_pilot_member(auth.uid(), _pack.code);
      IF NOT _pilot_market THEN
        RAISE EXCEPTION
          'SP_MARKET_PACK_NOT_ACTIVE: market pack % is not available yet (legal review: %)',
          _pack.code, _pack.legal_review_state
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;

  IF NEW.credential_code IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO _t FROM public.sp_credential_types WHERE code = NEW.credential_code;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SP_CREDENTIAL_CODE_UNKNOWN: %', NEW.credential_code
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- ── ADDED 20261111090000: a portable certification stays portable ──
  --
  -- The governed definition, not the submitted row, decides this. A caller
  -- that forges a country onto a global certification is refused here rather
  -- than silently filing a CPP as a Swedish credential.
  IF _t.scope_code = 'global_professional'
     AND (NEW.jurisdiction_code IS NOT NULL OR NEW.sub_jurisdiction_code IS NOT NULL) THEN
    RAISE EXCEPTION
      'SP_GLOBAL_CERTIFICATION_HAS_NO_JURISDICTION: % is an international professional certification and is not a credential of %',
      NEW.credential_code, coalesce(NEW.sub_jurisdiction_code, NEW.jurisdiction_code)
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT (_t.is_active OR (_pilot_market AND _t.pilot_state = 'internal_pilot'))
     AND TG_OP = 'INSERT' THEN
    RAISE EXCEPTION
      'SP_CREDENTIAL_NOT_AVAILABLE: % is not available yet',
      NEW.credential_code
      USING ERRCODE = 'check_violation';
  END IF;

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

  IF _t.narrow_result_only THEN
    IF NEW.holder_note IS NOT NULL AND length(btrim(NEW.holder_note)) > 0 THEN
      RAISE EXCEPTION
        'SP_CREDENTIAL_NARROW_RESULT_ONLY: % records a checked result and nothing else; no note may be attached',
        NEW.credential_code
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NOT _t.title_is_holder_written
     AND (TG_OP = 'INSERT' OR NEW.title IS DISTINCT FROM OLD.title)
     AND btrim(NEW.title) NOT IN (_t.name_sv, _t.name_en) THEN
    RAISE EXCEPTION
      'SP_CREDENTIAL_TITLE_CONTROLLED: % is named by its definition (% / %), not by the holder',
      NEW.credential_code, _t.name_sv, _t.name_en
      USING ERRCODE = 'check_violation';
  END IF;

  IF _t.reference_pattern IS NOT NULL
     AND NEW.credential_reference IS NOT NULL
     AND length(btrim(NEW.credential_reference)) > 0
     AND btrim(NEW.credential_reference) !~ _t.reference_pattern THEN
    RAISE EXCEPTION
      'SP_CREDENTIAL_REFERENCE_FORMAT: % expects a reference matching %',
      NEW.credential_code, _t.reference_pattern
      USING ERRCODE = 'check_violation';
  END IF;

  -- NOTE ON PLACEMENT. This block sits ABOVE the draft early-return below,
  -- and that position is the rule rather than an accident. The early return
  -- exists so an unfinished draft is not blocked by COMPLETENESS rules -- a
  -- missing expiry, a missing scope -- which is right: a holder is still
  -- typing. Issuer identity is not completeness. A draft may be SILENT about
  -- its issuer, and the active check below is guarded on lifecycle_state for
  -- exactly that reason; it may not name the wrong organisation and wait.
  -- Placed after the early return, as it first was here, a forged issuer was
  -- accepted on a draft and simply refused later at activation -- which
  -- stores the false attribution, shows it to the holder as saved, and makes
  -- the refusal arrive at the least useful moment.
  -- ── THE GOVERNED ISSUER ────────────────────────────────────────────
  --
  -- A governed international certification is awarded by ONE organisation,
  -- and the catalogue already knows which: sp_certification_definitions ->
  -- sp_certification_issuers.display_name. Until this rule existed nothing
  -- connected the two on the write path. `claimed_issuer_name` was free text
  -- straight from the client, `authenticated` holds INSERT and UPDATE on its
  -- own sp_claims rows, and sp_disclosure_payload ships the column to a
  -- recipient as 'issuer' -- so a holder could persist INTL_ASIS_CPP with
  -- claimed_issuer_name = 'Fake Corporation', or edit ONLY that column on a
  -- real claim, and the Passport would attribute a governed certification to
  -- an organisation that never awarded it. Reproduced end to end against a
  -- full replay before this migration was written.
  --
  -- The rule is here, in the trigger, rather than in a server function
  -- because the trigger is the only place that binds EVERY caller: the app,
  -- a direct PostgREST write with the holder's own token, and service_role.
  -- A CHECK constraint cannot express it -- the governed name lives in
  -- another table.
  --
  -- WHAT IT DOES NOT DO. It never INFERS an issuer. It does not read the
  -- title, the abbreviation or the issuer-alias table -- those aliases are a
  -- SEARCH vocabulary and storing one would put a name beside somebody's
  -- credential that its issuer does not use. It does not rewrite the
  -- submitted value into the right one either: a silent correction would tell
  -- a holder their input was accepted when it was replaced. It refuses, and
  -- names the governed issuer in the message so the caller can send it.
  --
  -- Nothing here touches a non-global credential. A national credential's
  -- appointing authority and a free-text claim's issuer keep exactly the
  -- semantics they have had since 20260817160000.
  --
  -- IDENTITY, NOT PRESENCE. This rule says WHICH issuer may be stored; it does
  -- not say one must be. Whether a credential must name an issuer at all is
  -- already a property of the catalogue -- sp_credential_types.requires_issuer,
  -- enforced by SP_CREDENTIAL_REQUIRES_ISSUER below -- and all fourteen
  -- governed certifications currently set it false. An earlier draft of this
  -- migration also refused an ACTIVE global claim with a NULL issuer. That was
  -- an over-reach: it contradicted the catalogue's own flag, and it broke
  -- 20261111090000's canonical write-path suite, which files a CPP exactly the
  -- way the product does. An absent issuer is incomplete; it is not a false
  -- attribution, and only false attribution is what this migration exists to
  -- stop. Making the issuer mandatory is a one-row-per-definition data change
  -- (requires_issuer = true) and an owner's decision, not a side effect of a
  -- security fix.
  IF _t.scope_code = 'global_professional' THEN
    SELECT i.display_name INTO _governed_issuer
      FROM public.sp_certification_definitions d
      JOIN public.sp_certification_issuers i ON i.id = d.issuer_id
     WHERE d.credential_code = NEW.credential_code;

    -- Fail CLOSED. A global definition with no certification detail row is a
    -- catalogue that contradicts itself; refusing the write is the only
    -- answer that cannot attribute the credential to nobody in particular.
    IF _governed_issuer IS NULL THEN
      RAISE EXCEPTION
        'SP_GLOBAL_CERTIFICATION_ISSUER_UNKNOWN: % declares an international scope but the catalogue records no issuer for it',
        NEW.credential_code
        USING ERRCODE = 'check_violation';
    END IF;

    -- A draft may be incomplete -- NULL -- while the holder is still filling
    -- it in. It may never carry arbitrary text.
    IF NEW.claimed_issuer_name IS NOT NULL
       AND btrim(NEW.claimed_issuer_name) <> _governed_issuer THEN
      RAISE EXCEPTION
        'SP_GLOBAL_CERTIFICATION_ISSUER_NOT_GOVERNED: % is awarded by %; the issuer may not be stated as %',
        NEW.credential_code, _governed_issuer, NEW.claimed_issuer_name
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

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

  IF _t.requires_scope
     AND (NEW.authorisation_scope IS NULL OR length(btrim(NEW.authorisation_scope)) = 0) THEN

    _scope_missing := true;

    IF TG_OP = 'UPDATE' THEN
      _scope_missing := (OLD.authorisation_scope IS NOT NULL
                         AND length(btrim(OLD.authorisation_scope)) > 0);

    ELSIF NEW.supersedes_id IS NOT NULL THEN
      SELECT authorisation_scope INTO _prev_scope
        FROM public.sp_claims WHERE id = NEW.supersedes_id;

      _scope_missing := (_prev_scope IS NOT NULL AND length(btrim(_prev_scope)) > 0);
    END IF;

    IF _scope_missing THEN
      RAISE EXCEPTION
        'SP_CREDENTIAL_REQUIRES_SCOPE: % is limited to an employer, principal or protected object and must say which',
        NEW.credential_code
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END $fn$;
COMMENT ON FUNCTION public.sp_claims_credential_rules IS
  'Enforces the taxonomy, market, SCOPE and governed-ISSUER rules on every '
  'claim write, for every caller including service_role. 20261214090000 adds '
  'one exemption: a national_qualification claim filed under its own definition''s '
  'country, with no sub-jurisdiction, skips the market-pack gate (it authorises '
  'nothing). Otherwise unchanged from '
  '20261111090000 except for the global-certification issuer block: a claim '
  'on a governed global_professional definition may carry no issuer other '
  'than the one sp_certification_definitions -> sp_certification_issuers '
  'records, may not be active without it, and is never inferred from a '
  'title, an abbreviation or a search alias.';

REVOKE ALL ON FUNCTION public.sp_claims_credential_rules() FROM PUBLIC, anon;


-- ── 11. Claim details: a stated version belongs to the definition ──────
-- Reproduced VERBATIM from 20261121090000 with the version check ADDED.
CREATE OR REPLACE FUNCTION public.sp_closed_catalogue_details_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.sp_approved_credential_catalogue%ROWTYPE;
BEGIN
 SELECT a.* INTO d FROM public.sp_approved_credential_catalogue a JOIN public.sp_claims c ON c.credential_code=a.code WHERE c.id=NEW.claim_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'SP_APPROVED_DEFINITION_REQUIRED'; END IF;
 IF NEW.credential_class IS DISTINCT FROM d.credential_class
 OR NEW.original_language IS DISTINCT FROM d.original_language
 OR NEW.issuing_country_code IS DISTINCT FROM d.country
 OR NEW.issuing_jurisdiction_code IS DISTINCT FROM coalesce(d.region,d.country)
 OR NEW.validity_jurisdiction_code IS DISTINCT FROM coalesce(d.region,d.country)
 THEN RAISE EXCEPTION 'SP_GOVERNED_METADATA_IMMUTABLE'; END IF;
 IF NEW.no_expiry IS TRUE AND (NOT d.allows_no_expiry OR d.requires_valid_until)
 THEN RAISE EXCEPTION 'SP_NO_EXPIRY_NOT_APPROVED'; END IF;
 -- ADDED 20261214090000: a stated version must be one of THIS definition's.
 IF NEW.definition_version IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM public.sp_credential_definition_versions v
    WHERE v.credential_code=d.code AND v.version_key=NEW.definition_version)
 THEN RAISE EXCEPTION 'SP_DEFINITION_VERSION_UNKNOWN'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.sp_closed_catalogue_details_guard() FROM PUBLIC,anon,authenticated,service_role;

-- ── 12. The governed save RPC: an optional definition_version ─────────
-- Reproduced VERBATIM from 20261126090000 with the version handling ADDED.
CREATE OR REPLACE FUNCTION public.sp_save_international_credential(_input jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.sp_approved_credential_catalogue%ROWTYPE; _old public.sp_claims%ROWTYPE;
 _id uuid; _issued date; _expiry date; _no_expiry boolean;
 _requires_scope boolean; _scope text; _issuer text; _version text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'SP_NOT_AUTHENTICATED'; END IF;
 IF NOT public.sp_passport_session_active() THEN RAISE EXCEPTION 'SP_SESSION_REVOKED' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(_input) IS DISTINCT FROM 'object' OR EXISTS (
 SELECT 1 FROM jsonb_object_keys(_input) k WHERE k<>ALL(ARRAY['claim_id','version','definition_code','market_country','market_region','identifier','issued_on','valid_until','no_expiry','authorisation_scope','issuer_name','definition_version']))
 THEN RAISE EXCEPTION 'SP_INVALID_CREDENTIAL_INPUT'; END IF;
 SELECT * INTO d FROM public.sp_approved_credential_catalogue WHERE code=_input->>'definition_code';
 IF NOT FOUND THEN RAISE EXCEPTION 'SP_APPROVED_DEFINITION_REQUIRED'; END IF;
 IF nullif(_input->>'market_country','') IS DISTINCT FROM d.country
 OR nullif(_input->>'market_region','') IS DISTINCT FROM d.region
 THEN RAISE EXCEPTION 'SP_DEFINITION_NOT_AVAILABLE_IN_MARKET'; END IF;
 IF length(coalesce(_input->>'identifier',''))>120 THEN RAISE EXCEPTION 'SP_INVALID_CREDENTIAL_INPUT'; END IF;
 -- SCOPE: required on a scoped definition, refused on every other one. Never inferred.
 SELECT t.requires_scope INTO _requires_scope FROM public.sp_credential_types t WHERE t.code=d.code;
 _scope:=nullif(btrim(coalesce(_input->>'authorisation_scope','')),'');
 IF length(coalesce(_scope,''))>200 THEN RAISE EXCEPTION 'SP_INVALID_CREDENTIAL_INPUT'; END IF;
 IF _requires_scope AND _scope IS NULL THEN RAISE EXCEPTION 'SP_CREDENTIAL_REQUIRES_SCOPE'; END IF;
 IF NOT _requires_scope AND _scope IS NOT NULL THEN RAISE EXCEPTION 'SP_SCOPE_NOT_APPLICABLE'; END IF;
 -- ISSUER: governed and fixed wherever the catalogue names one. Holder-stated only
 -- where the organisation-role model says the issuer is stated on the document.
 _issuer:=nullif(btrim(coalesce(_input->>'issuer_name','')),'');
 IF length(coalesce(_issuer,''))>160 THEN RAISE EXCEPTION 'SP_INVALID_CREDENTIAL_INPUT'; END IF;
 IF d.issuer_name IS NULL AND (_issuer IS NULL OR length(_issuer)<2) THEN RAISE EXCEPTION 'SP_CREDENTIAL_REQUIRES_ISSUER'; END IF;
 IF d.issuer_name IS NOT NULL AND _issuer IS NOT NULL THEN RAISE EXCEPTION 'SP_ISSUER_IS_GOVERNED'; END IF;
 -- A document-stated issuer is an awarding organisation or a training provider.
 -- A governed AUTHORITY is neither: the regulator does not deliver the course.
 IF d.issuer_name IS NULL AND EXISTS (SELECT 1 FROM public.sp_authorities g
   WHERE lower(g.name_local)=lower(_issuer) OR lower(g.name_en)=lower(_issuer))
 THEN RAISE EXCEPTION 'SP_ISSUER_IS_A_REGULATOR'; END IF;
 IF nullif(_input->>'issued_on','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
 OR nullif(_input->>'valid_until','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
 THEN RAISE EXCEPTION 'SP_INVALID_CREDENTIAL_DATE'; END IF;
 _issued:=nullif(_input->>'issued_on','')::date; _expiry:=nullif(_input->>'valid_until','')::date;
 _no_expiry:=(_input->>'no_expiry')::boolean;
 IF _no_expiry IS TRUE AND (NOT d.allows_no_expiry OR d.requires_valid_until) THEN RAISE EXCEPTION 'SP_NO_EXPIRY_NOT_APPROVED'; END IF;
 IF _no_expiry IS TRUE AND _expiry IS NOT NULL THEN RAISE EXCEPTION 'SP_EXPIRY_CONFLICT'; END IF;
 IF _issued IS NOT NULL AND _expiry IS NOT NULL AND _expiry<=_issued THEN RAISE EXCEPTION 'SP_INVALID_DATES'; END IF;
 IF d.requires_valid_until AND _expiry IS NULL THEN RAISE EXCEPTION 'SP_CREDENTIAL_REQUIRES_VALID_UNTIL'; END IF;
 -- ADDED 20261214090000: the version the certificate names. Optional, never
 -- inferred, and only one of this definition's governed versions.
 _version:=nullif(btrim(coalesce(_input->>'definition_version','')),'');
 IF _version IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.sp_credential_definition_versions v
   WHERE v.credential_code=d.code AND v.version_key=_version)
 THEN RAISE EXCEPTION 'SP_DEFINITION_VERSION_UNKNOWN'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.sp_passport_profiles WHERE holder_user_id=auth.uid()) THEN RAISE EXCEPTION 'SP_NO_PASSPORT'; END IF;
 IF nullif(_input->>'claim_id','') IS NOT NULL THEN
 SELECT * INTO _old FROM public.sp_claims WHERE id=(_input->>'claim_id')::uuid AND holder_user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND OR _old.credential_code IS DISTINCT FROM d.code THEN RAISE EXCEPTION 'SP_NOT_EDITABLE'; END IF;
 IF _old.version_no IS DISTINCT FROM (_input->>'version')::integer THEN RAISE EXCEPTION 'SP_STALE_VERSION'; END IF;
 _id:=public.sp_correct_claim(_old.id,d.name_en,coalesce(d.issuer_name,_issuer),d.country,_issued,_issued,_expiry,
 'Holder corrected personal credential data',d.code,nullif(_input->>'identifier',''),NULL,NULL,NULL,d.region,_scope);
 IF EXISTS(SELECT 1 FROM public.sp_claims WHERE id=_id AND assertion_level<>'self_declared') THEN RAISE EXCEPTION 'SP_METADATA_REVIEW_REQUIRED'; END IF;
 ELSE
 INSERT INTO public.sp_claims(holder_user_id,claim_type,credential_code,title,claimed_issuer_name,jurisdiction_code,sub_jurisdiction_code,
 issued_on,valid_from,valid_until,credential_reference,authorisation_scope)
 VALUES(auth.uid(),d.claim_type,d.code,d.name_en,coalesce(d.issuer_name,_issuer),d.country,d.region,_issued,_issued,_expiry,nullif(_input->>'identifier',''),_scope) RETURNING id INTO _id;
 END IF;
 INSERT INTO public.sp_credential_details(claim_id,credential_class,original_language,issuing_country_code,issuing_jurisdiction_code,validity_jurisdiction_code,no_expiry,definition_version)
 VALUES(_id,d.credential_class,d.original_language,d.country,coalesce(d.region,d.country),coalesce(d.region,d.country),_no_expiry,_version);
 RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.sp_save_international_credential(jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.sp_save_international_credential(jsonb) TO authenticated;

-- ── 13. The reviewer's detail: the stated version ──────────────────────
-- Reproduced VERBATIM from 20261014090000 with one key ADDED.
CREATE OR REPLACE FUNCTION public.sp_verifier_request_detail(_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _r public.sp_verification_requests%ROWTYPE; _out jsonb;
BEGIN
  IF NOT public.sp_is_verifier(auth.uid()) THEN
    RAISE EXCEPTION 'SP_NOT_VERIFIER' USING ERRCODE='insufficient_privilege';
  END IF;

  SELECT * INTO _r FROM public.sp_verification_requests
   WHERE id = _request_id AND request_kind = 'cqrityjob_review';
  IF NOT FOUND THEN RAISE EXCEPTION 'SP_REQUEST_NOT_FOUND' USING ERRCODE='no_data_found'; END IF;

  SELECT jsonb_build_object(
    'id', _r.id,
    'status', _r.status,
    'submitted_at', _r.submitted_at,
    'subject_type', CASE WHEN _r.claim_id IS NOT NULL THEN 'claim' ELSE 'experience' END,
    'is_self', (_r.holder_user_id = auth.uid()),
    'holder_name', (SELECT coalesce(display_name,'') FROM public.sp_passport_profiles
                     WHERE holder_user_id = _r.holder_user_id),
    -- The claim as the CANDIDATE stated it. `credential_code` and
    -- `credential_reference` are what a certificate is matched against;
    -- `sub_jurisdiction_code` is the difference between a Dubai licence and a
    -- UAE-wide one; `authorisation_scope` is the limit that turns a scoped
    -- approval into a general one when it goes missing.
    --
    -- ── WHY credential_reference IS HERE AND NOWHERE ELSE ────────────
    --
    -- Phase 7 documents it as PRIVATE and keeps it out of every disclosure
    -- package, because to a recipient it is a lookup key into someone else's
    -- register. That boundary is unchanged and still asserted for all five
    -- packages (phase 7 suite, GROUP 3).
    --
    -- The verifier is not a recipient. Matching the number on the certificate
    -- against the number on the claim is the specific act being asked for,
    -- and a reviewer who cannot see the claimed reference is checking a title
    -- against a document. This function is verifier-gated and the column is
    -- reachable through no other path.
    --
    -- `holder_note` is deliberately NOT here. Phase 7 calls it the holder's
    -- private words, and unlike the reference it is not something a document
    -- is checked against.
    'claim', (SELECT jsonb_build_object(
                'id', c.id, 'type', c.claim_type, 'title', c.title,
                'issuer', c.claimed_issuer_name, 'jurisdiction', c.jurisdiction_code,
                'sub_jurisdiction', c.sub_jurisdiction_code,
                'credential_code', c.credential_code,
                'credential_reference', c.credential_reference,
                'authorisation_scope', c.authorisation_scope,
                'issued_on', c.issued_on, 'valid_from', c.valid_from,
                'valid_until', c.valid_until,
                'assertion', c.assertion_level, 'lifecycle', c.lifecycle_state,
                'version_no', c.version_no,
                -- ADDED 20261214090000: the definition version the holder
                -- says the certificate names (catalogue data explains it).
                'definition_version', (SELECT m.definition_version FROM public.sp_credential_details m
                                        WHERE m.claim_id = c.id))
                FROM public.sp_claims c WHERE c.id = _r.claim_id),
    'period', (SELECT jsonb_build_object(
                'id', e.id, 'employer', e.employer_name, 'role', e.role_title,
                'started_on', e.started_on, 'ended_on', e.ended_on,
                'employment_type', e.employment_type, 'jurisdiction', e.jurisdiction_code,
                'security_relevance', e.security_relevance,
                'security_fraction', e.security_fraction,
                'fte_fraction', e.fte_fraction,
                'version_no', e.version_no,
                'assertion', e.assertion_level, 'lifecycle', e.lifecycle_state)
                FROM public.sp_experience_periods e WHERE e.id = _r.period_id),
    -- Prior versions of THIS fact, for claims and now for periods too. A
    -- correction by supersession is the signal that this is not a first
    -- submission, and it was reaching the reviewer for one object type only.
    'previous_versions', CASE
      WHEN _r.claim_id IS NOT NULL THEN coalesce((
        SELECT jsonb_agg(jsonb_build_object('id', pc.id, 'title', pc.title,
                                            'version_no', pc.version_no,
                                            'lifecycle', pc.lifecycle_state)
                         ORDER BY pc.version_no)
          FROM public.sp_claims pc
         WHERE pc.holder_user_id = _r.holder_user_id
           AND pc.id <> _r.claim_id
           AND pc.id IN (SELECT supersedes_id FROM public.sp_claims WHERE id = _r.claim_id)
      ), '[]'::jsonb)
      ELSE coalesce((
        SELECT jsonb_agg(jsonb_build_object('id', pe.id,
                                            'title', pe.role_title || ' — ' || pe.employer_name,
                                            'version_no', pe.version_no,
                                            'lifecycle', pe.lifecycle_state)
                         ORDER BY pe.version_no)
          FROM public.sp_experience_periods pe
         WHERE pe.holder_user_id = _r.holder_user_id
           AND pe.id <> _r.period_id
           AND pe.id IN (SELECT supersedes_id FROM public.sp_experience_periods
                          WHERE id = _r.period_id)
      ), '[]'::jsonb)
    END,
    'evidence', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', ev.id, 'file_name', ev.file_name, 'mime_type', ev.mime_type,
               'size_bytes', ev.size_bytes, 'storage_path', ev.storage_path,
               'uploaded_at', ev.uploaded_at) ORDER BY ev.uploaded_at)
        FROM public.sp_evidence ev
       WHERE ev.lifecycle_state = 'active'
         AND ((_r.claim_id IS NOT NULL AND ev.claim_id = _r.claim_id)
           OR (_r.period_id IS NOT NULL AND ev.period_id = _r.period_id))
    ), '[]'::jsonb),
    'prior_decisions', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'decision', d.decision, 'organisation', d.decider_organisation,
               'method', d.verification_method, 'decided_at', d.decided_at,
               'note', d.decision_note) ORDER BY d.decided_at DESC)
        FROM public.sp_verification_decisions d
        JOIN public.sp_verification_requests r2 ON r2.id = d.request_id
       WHERE r2.holder_user_id = _r.holder_user_id
         AND ((_r.claim_id IS NOT NULL AND r2.claim_id = _r.claim_id)
           OR (_r.period_id IS NOT NULL AND r2.period_id = _r.period_id))
    ), '[]'::jsonb)
  ) INTO _out;

  RETURN _out;
END; $$;

REVOKE ALL ON FUNCTION public.sp_verifier_request_detail(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_verifier_request_detail(uuid) TO authenticated;

-- ── 14. What this migration may not have done ──────────────────────────
DO $post$
DECLARE _n int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relnamespace='public'::regnamespace AND relname='sp_approved_credential_catalogue'
    AND reloptions @> ARRAY['security_invoker=true','security_barrier=true']) THEN
    RAISE EXCEPTION 'sp_approved_credential_catalogue lost security_invoker/security_barrier';
  END IF;
  -- No market was created, activated or approved.
  IF EXISTS (SELECT 1 FROM public.sp_market_packs WHERE jurisdiction_code='IN') THEN
    RAISE EXCEPTION 'SP_INDIA_POST: an IN market pack exists';
  END IF;
  IF EXISTS (SELECT 1 FROM public.sp_credential_types WHERE market_pack_code IN ('GB','GB-NI','AE-DU','AE-AZ') AND is_active)
     OR EXISTS (SELECT 1 FROM public.sp_market_packs WHERE code IN ('GB','GB-NI','AE-DU','AE-AZ') AND is_active) THEN
    RAISE EXCEPTION 'SP_INDIA_POST: a pilot or closed market or definition is active';
  END IF;
  -- Exactly the four, all national qualifications of India, none able to
  -- create eligibility or a title, none carrying a legal-review claim.
  SELECT count(*) INTO _n FROM public.sp_credential_types WHERE jurisdiction_code='IN';
  IF _n <> 4 THEN RAISE EXCEPTION 'SP_INDIA_POST: expected 4 IN definitions, found %', _n; END IF;
  IF EXISTS (SELECT 1 FROM public.sp_credential_types WHERE jurisdiction_code='IN'
              AND (scope_code IS DISTINCT FROM 'national_qualification' OR NOT is_active
                   OR legal_review_state <> 'pending'
                   OR contributes_to && ARRAY['local_eligibility','active_title']::text[])) THEN
    RAISE EXCEPTION 'SP_INDIA_POST: an IN definition is not a pending-review national qualification';
  END IF;
  -- No personal "PSARA licence", no armed-security definition.
  IF EXISTS (SELECT 1 FROM public.sp_credential_types
              WHERE jurisdiction_code='IN' AND (name_en ~* 'psara|licen[cs]e|armed' OR claim_type='licence')) THEN
    RAISE EXCEPTION 'SP_INDIA_POST: an Indian licence-shaped or armed-security definition exists';
  END IF;
  -- Every definition has exactly one current version, and nothing sets an expiry.
  IF EXISTS (SELECT 1 FROM public.sp_credential_types t WHERE t.jurisdiction_code='IN'
              AND (SELECT count(*) FROM public.sp_credential_definition_versions v
                    WHERE v.credential_code=t.code AND v.catalogue_status='current') <> 1) THEN
    RAISE EXCEPTION 'SP_INDIA_POST: an IN definition lacks exactly one current version';
  END IF;
  IF EXISTS (SELECT 1 FROM public.sp_credential_types WHERE jurisdiction_code='IN'
              AND (requires_valid_until OR allows_no_expiry OR typical_validity_months IS NOT NULL)) THEN
    RAISE EXCEPTION 'SP_INDIA_POST: an IN definition implies an expiry or lifetime validity';
  END IF;
  -- Nothing personal was touched.
  IF EXISTS (SELECT 1 FROM public.sp_credential_details WHERE definition_version IS NOT NULL) THEN
    RAISE EXCEPTION 'SP_INDIA_POST: a personal row carries a definition version';
  END IF;
END
$post$;

COMMIT;
