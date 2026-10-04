-- Security Passport — the certification research integration.
--
-- Covers 20270212090000 (foundation), 20270213090000 (import) and
-- 20270214090000 (publication), in the final state after all three.
-- Synthetic holders only. Everything rolls back.
--
-- Labels RS<group>.<n> are the names the negative controls in scripts/db-test.sh
-- target: each planted defect must make THIS suite fail on a named assertion.
\set ON_ERROR_STOP on
BEGIN;

CREATE FUNCTION pg_temp.ok(b boolean, label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
  IF b IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: %', label; END IF;
  RAISE NOTICE 'ok  %', label; END $$;
-- The statement must be refused, and the refusal must name the needle.
CREATE FUNCTION pg_temp.refused(q text, needle text, label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
  BEGIN EXECUTE q; EXCEPTION WHEN OTHERS THEN
    IF position(needle IN SQLERRM) = 0 THEN
      RAISE EXCEPTION 'ASSERTION FAILED: % (refused, but with "%" instead of "%")', label, SQLERRM, needle;
    END IF;
    RAISE NOTICE 'ok  % (refused: %)', label, needle; RETURN;
  END;
  RAISE EXCEPTION 'ASSERTION FAILED: % (accepted)', label; END $$;
-- The statement must be refused for a privilege or policy reason, whatever its text.
CREATE FUNCTION pg_temp.denied(q text, label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
  BEGIN EXECUTE q; EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE NOT IN ('23514', '23503', '23505', '42501', 'P0001') THEN RAISE; END IF;
    RAISE NOTICE 'ok  % (denied)', label; RETURN;
  END;
  RAISE EXCEPTION 'ASSERTION FAILED: % (accepted)', label; END $$;

-- ── Fixtures ────────────────────────────────────────────────────────────
INSERT INTO auth.users(id, email) VALUES
  ('fd270000-0000-4000-8000-000000000001', 'research-holder-a@fixture.invalid'),
  ('fd270000-0000-4000-8000-000000000002', 'research-holder-b@fixture.invalid'),
  ('fd270000-0000-4000-8000-000000000003', 'research-nopassport@fixture.invalid'),
  ('fd270000-0000-4000-8000-000000000004', 'research-admin@fixture.invalid'),
  ('fd270000-0000-4000-8000-000000000005', 'research-verifier@fixture.invalid');
-- Holder A works in Sweden: an international certification is held by a person
-- in another country, and the work country never becomes the credential's scope.
INSERT INTO public.sp_passport_profiles(holder_user_id, jurisdiction_code) VALUES
  ('fd270000-0000-4000-8000-000000000001', 'SE'),
  ('fd270000-0000-4000-8000-000000000002', 'GB'),
  ('fd270000-0000-4000-8000-000000000004', 'SE'),
  ('fd270000-0000-4000-8000-000000000005', 'SE');
INSERT INTO public.user_roles(user_id, role) VALUES
  ('fd270000-0000-4000-8000-000000000004', 'admin'),
  ('fd270000-0000-4000-8000-000000000005', 'passport_verifier');

CREATE TEMP TABLE research_before AS SELECT
  (SELECT count(*) FROM public.sp_credential_types) AS types,
  (SELECT count(*) FROM public.sp_certification_definitions) AS definitions,
  (SELECT count(*) FROM public.sp_certification_issuers) AS issuers,
  (SELECT count(*) FROM public.sp_claims) AS claims,
  (SELECT count(*) FROM public.sp_approved_credential_catalogue) AS selectable;
GRANT SELECT ON research_before TO authenticated;

-- ═══ RS1. Every record accounted for, with provenance ════════════════════
SELECT pg_temp.ok((SELECT count(*) = 170 AND count(DISTINCT research_id) = 170
                     FROM public.sp_catalogue_research_records WHERE snapshot_date = DATE '2026-10-03'),
  'RS1.1 all 170 research records are present, each once');
SELECT pg_temp.ok((SELECT count(DISTINCT issuer_research_id) = 40 FROM public.sp_catalogue_research_records),
  'RS1.2 the 40 researched issuers are all represented');
SELECT pg_temp.ok((SELECT count(*) FILTER (WHERE reconciliation_outcome = 'matched_existing') = 14
                      AND count(*) FILTER (WHERE reconciliation_outcome = 'added_approved') = 140
                      AND count(*) FILTER (WHERE reconciliation_outcome = 'retained_for_review') = 16
                      AND count(*) FILTER (WHERE reconciliation_outcome = 'excluded') = 0
                      AND count(*) = 170 FROM public.sp_catalogue_research_records),
  'RS1.3 the outcomes are exactly 14 matched, 140 added, 16 retained, 0 excluded, and sum to 170');
SELECT pg_temp.ok((SELECT count(*) = 0 FROM public.sp_catalogue_research_records
                    WHERE catalogue_decision = 'pending' OR reconciliation_outcome = 'unreconciled'),
  'RS1.4 no record is silently left pending');
SELECT pg_temp.ok((SELECT count(*) = 0 FROM public.sp_catalogue_research_records
                    WHERE reviewer IS NULL OR reviewed_at IS NULL OR length(btrim(coalesce(decision_note, ''))) = 0),
  'RS1.5 every decision carries a reviewer, a date and a reason');
SELECT pg_temp.ok((SELECT count(*) = 0 FROM public.sp_catalogue_research_records
                    WHERE reconciliation_outcome = 'retained_for_review'
                      AND (length(btrim(coalesce(unresolved_issue, ''))) < 20
                           OR length(btrim(coalesce(required_action, ''))) < 20 OR holder_reason IS NULL)),
  'RS1.6 every retained record states its unresolved issue and the action');
SELECT pg_temp.ok((SELECT count(*) = 13 AND count(*) FILTER (WHERE reconciliation_outcome = 'retained_for_review') = 12
                      AND count(*) FILTER (WHERE reconciliation_outcome = 'matched_existing') = 1
                      FROM public.sp_catalogue_research_records WHERE research_status = 'source_recheck_required'),
  'RS1.7 the 13 source_recheck_required rows: 12 retained, 1 matched to a definition whose own sources stand');
SELECT pg_temp.ok((SELECT count(*) = 12 FROM public.sp_catalogue_research_records
                    WHERE research_status = 'source_recheck_required' AND recheck_checked_on = DATE '2026-10-03'
                      AND recheck_note LIKE '%EGRESS_BLOCKED%'),
  'RS1.8 each retained recheck row records the 2026-10-03 recheck and why it could not be closed');
SELECT pg_temp.ok((SELECT count(*) = 0 FROM public.sp_catalogue_research_records WHERE source_url !~ '^https://'),
  'RS1.9 every record keeps an https source');
SELECT pg_temp.ok((SELECT count(*) = 51 FROM public.sp_catalogue_research_records WHERE recommended_priority = 'P1')
                  AND (SELECT count(*) = 13 FROM public.sp_catalogue_research_records
                        WHERE recommended_priority = 'P1' AND reconciliation_outcome = 'matched_existing')
                  AND (SELECT count(*) = 3 FROM public.sp_catalogue_research_records
                        WHERE recommended_priority = 'P1' AND reconciliation_outcome = 'retained_for_review')
                  AND (SELECT count(*) = 35 FROM public.sp_catalogue_research_records
                        WHERE recommended_priority = 'P1' AND reconciliation_outcome = 'added_approved'),
  'RS1.10 all 51 P1 records are decided: 13 matched, 35 added, 3 retained');
SELECT pg_temp.refused($q$UPDATE public.sp_catalogue_research_records SET official_name = 'Renamed' WHERE research_id = (SELECT min(research_id) FROM public.sp_catalogue_research_records)$q$,
  'SP_RESEARCH_PROVENANCE_IMMUTABLE', 'RS1.11 the researched facts cannot be edited, even by the table owner');
SELECT pg_temp.refused($q$UPDATE public.sp_catalogue_research_records SET legal_recognition_status = 'recognised' WHERE research_id = (SELECT min(research_id) FROM public.sp_catalogue_research_records)$q$,
  'sp_catalogue_research_records_legal_recognition_status_check', 'RS1.12 no record can be edited into a legal recognition');
SELECT pg_temp.refused($q$UPDATE public.sp_catalogue_research_records SET holder_verification_policy = 'auto_verified' WHERE research_id = (SELECT min(research_id) FROM public.sp_catalogue_research_records)$q$,
  'sp_catalogue_research_records_holder_verification_policy_check', 'RS1.13 no record can be edited into automatic holder verification');
SELECT pg_temp.refused($q$UPDATE public.sp_catalogue_research_records SET catalogue_decision = 'approved', reconciliation_outcome = 'retained_for_review' WHERE reconciliation_outcome = 'retained_for_review'$q$,
  'sp_research_decision_matches_outcome', 'RS1.14 a decision and its outcome cannot disagree');
SELECT pg_temp.refused($q$UPDATE public.sp_catalogue_research_records SET unresolved_issue = NULL WHERE reconciliation_outcome = 'retained_for_review'$q$,
  'sp_research_retained_is_actionable', 'RS1.15 a retained record cannot lose its unresolved issue');

-- ═══ RS2. Reuse, never duplication ═══════════════════════════════════════
SELECT pg_temp.ok((SELECT count(*) = 14 AND count(DISTINCT credential_code) = 14
                      AND bool_and(credential_code IN (
                        'INTL_ASIS_APP','INTL_ASIS_CPP','INTL_ASIS_PCI','INTL_ASIS_PSP',
                        'INTL_ISC2_CC','INTL_ISC2_CCSP','INTL_ISC2_CGRC','INTL_ISC2_CISSP','INTL_ISC2_SSCP',
                        'INTL_ISACA_CISA','INTL_ISACA_CISM','INTL_ISACA_CRISC','INTL_ACFE_CFE','INTL_ACAMS_CAMS'))
                     FROM public.sp_catalogue_research_records WHERE reconciliation_outcome = 'matched_existing'),
  'RS2.1 the 14 matches are exactly the existing ASIS, ISC2, ISACA, ACFE and ACAMS definitions');
SELECT pg_temp.ok((SELECT count(*) = 1 FROM public.sp_certification_issuers WHERE issuer_code = 'ASIS')
                  AND (SELECT count(*) = 1 FROM public.sp_certification_issuers WHERE issuer_code = 'ISC2')
                  AND (SELECT count(*) = 1 FROM public.sp_certification_issuers WHERE issuer_code = 'ISACA')
                  AND (SELECT count(*) = 1 FROM public.sp_certification_issuers WHERE issuer_code = 'ACAMS')
                  AND (SELECT count(*) = 1 FROM public.sp_certification_issuers WHERE issuer_code = 'ACFE'),
  'RS2.2 the existing issuers are reused, never duplicated');
SELECT pg_temp.ok((SELECT count(*) = 4 FROM public.sp_certification_definitions d
                     JOIN public.sp_certification_issuers i ON i.id = d.issuer_id WHERE i.issuer_code = 'ISC2'
                       AND d.credential_code NOT IN ('INTL_ISC2_CC','INTL_ISC2_CCSP','INTL_ISC2_CGRC','INTL_ISC2_CISSP','INTL_ISC2_SSCP'))
                  AND (SELECT count(*) = 3 FROM public.sp_certification_definitions d
                     JOIN public.sp_certification_issuers i ON i.id = d.issuer_id WHERE i.issuer_code = 'ISACA'
                       AND d.credential_code NOT IN ('INTL_ISACA_CISA','INTL_ISACA_CISM','INTL_ISACA_CRISC')),
  'RS2.3 ISC2 and ISACA gain only their genuinely new awards, under the existing issuer');
SELECT pg_temp.ok((SELECT count(*) = 0 FROM (
                    SELECT issuer_id, lower(regexp_replace(canonical_name_en, '\s*\([^)]*\)\s*$', '')), lower(coalesce(abbreviation, ''))
                      FROM public.sp_certification_definitions GROUP BY 1, 2, 3 HAVING count(*) > 1) dup),
  'RS2.4 no issuer carries two definitions of the same award and abbreviation');
SELECT pg_temp.ok((SELECT count(*) = 0 FROM (
                    SELECT issuer_id, lower(abbreviation) FROM public.sp_certification_definitions
                     WHERE abbreviation IS NOT NULL GROUP BY 1, 2 HAVING count(*) > 1) dup),
  'RS2.5 no issuer reuses an abbreviation for two awards');
SELECT pg_temp.ok((SELECT count(DISTINCT i.issuer_code) = 2 FROM public.sp_certification_definitions d
                     JOIN public.sp_certification_issuers i ON i.id = d.issuer_id
                    WHERE d.abbreviation IN ('CIPM', 'CIPM I'))
                  AND (SELECT count(*) = 3 FROM public.sp_certification_definitions WHERE abbreviation IN ('CIPM', 'CIPM I', 'CIPM II')),
  'RS2.6 CIPM (IAPP) and CIPM I / II (IFCPP) are separate definitions under separate issuers');
SELECT pg_temp.ok((SELECT count(*) = 2 FROM public.sp_credential_types WHERE code IN ('INTL_OFFSEC_OSCP', 'INTL_OFFSEC_OSCP_PLUS')),
  'RS2.7 OSCP and OSCP+ are two definitions, neither inferred from the other');
SELECT pg_temp.ok((SELECT count(*) = 0 FROM public.sp_certification_issuers WHERE issuer_code ~* '(^|_)ISO($|_)' OR display_name ~* '^(iso|international organi[sz]ation for standardi[sz]ation)'),
  'RS2.8 ISO itself is never an issuer: PECB awards the ISO-based credentials');
SELECT pg_temp.ok((SELECT count(*) = 5 FROM public.sp_certification_definitions d
                     JOIN public.sp_certification_issuers i ON i.id = d.issuer_id WHERE i.issuer_code = 'PECB'),
  'RS2.9 the five ISO-based credentials are PECB awards');

-- ═══ RS3. The new definitions: structure, classes, honesty ═══════════════
CREATE TEMP TABLE research_added AS
  SELECT r.credential_code AS code, r.mapped_credential_class AS class, r.credential_kind, r.research_area
    FROM public.sp_catalogue_research_records r WHERE r.reconciliation_outcome = 'added_approved';
GRANT SELECT ON research_added TO authenticated;
SELECT pg_temp.ok((SELECT count(*) = 140 FROM research_added), 'RS3.1 140 definitions were added');
SELECT pg_temp.ok((SELECT count(*) = 0 FROM public.sp_credential_types t JOIN research_added a ON a.code = t.code
                    WHERE t.scope_code IS DISTINCT FROM 'global_professional'
                       OR t.jurisdiction_code IS NOT NULL OR t.sub_jurisdiction_code IS NOT NULL
                       OR t.market_pack_code IS NOT NULL OR t.authority_id IS NOT NULL OR t.regulated_role_id IS NOT NULL),
  'RS3.2 research scope never became a country, region, market, authority or role');
SELECT pg_temp.ok((SELECT count(*) = 0 FROM public.sp_credential_types t JOIN research_added a ON a.code = t.code
                    WHERE t.allows_no_expiry OR t.requires_valid_until OR t.requires_scope OR t.requires_issuer),
  'RS3.3 no new definition infers lifetime validity or demands a date, a scope or an issuer');
SELECT pg_temp.ok((SELECT count(*) = 0 FROM public.sp_credential_types t JOIN research_added a ON a.code = t.code
                    WHERE t.legal_review_state <> 'pending' OR t.pilot_state <> 'closed'
                       OR t.contributes_to && ARRAY['local_eligibility', 'active_title']::text[]),
  'RS3.4 no review is marked complete, no pilot is opened and no definition feeds eligibility or a title');
SELECT pg_temp.ok((SELECT count(*) = 0 FROM public.sp_certification_definitions d JOIN research_added a ON a.code = d.credential_code
                    WHERE d.maintenance_policy_type <> 'not_assessed' OR d.maintenance_cycle_months IS NOT NULL
                       OR d.maintenance_summary_en NOT LIKE '%not lifetime validity%'),
  'RS3.5 renewal is not assessed, carries no invented cycle, and says unknown is not lifetime');
SELECT pg_temp.ok((SELECT count(*) = 0 FROM public.sp_certification_issuers i
                    WHERE i.issuer_code IN (SELECT DISTINCT iss.issuer_code FROM public.sp_certification_definitions d
                          JOIN research_added a ON a.code = d.credential_code JOIN public.sp_certification_issuers iss ON iss.id = d.issuer_id)
                      AND i.issuer_code NOT IN ('ASIS','ISC2','ISACA','ACAMS','ACFE')
                      AND (i.verification_mode <> 'none' OR i.public_verification_url IS NOT NULL)),
  'RS3.6 no new issuer claims a holder lookup the research never established');
SELECT pg_temp.ok((SELECT count(*) FILTER (WHERE class = 'certification') = 78
                      AND count(*) FILTER (WHERE class = 'professional_qualification') = 35
                      AND count(*) FILTER (WHERE class = 'professional_designation') = 20
                      AND count(*) FILTER (WHERE class = 'assessed_certificate') = 6
                      AND count(*) FILTER (WHERE class = 'course_certificate') = 1 FROM research_added),
  'RS3.7 the kinds are kept apart: 78 certifications, 35 qualifications, 20 designations, 6 assessed certificates, 1 course certificate');
SELECT pg_temp.ok((SELECT count(*) = 0 FROM research_added a
                    LEFT JOIN public.sp_credential_definition_metadata m ON m.credential_code = a.code
                    WHERE a.class <> 'certification' AND m.credential_class IS DISTINCT FROM a.class),
  'RS3.8 every non-default kind is stored as its credential class');
SELECT pg_temp.ok((SELECT count(DISTINCT research_area) = 5 FROM research_added)
                  AND (SELECT count(DISTINCT credential_kind) = 5 FROM research_added),
  'RS3.9 all five research areas and all five kinds are represented among the additions');
SELECT pg_temp.ok((SELECT count(*) = 140 FROM public.sp_credential_definition_reviews rv JOIN research_added a ON a.code = rv.credential_code
                    WHERE rv.checked_on = DATE '2026-10-03' AND rv.source_url ~ '^https://'),
  'RS3.10 every addition keeps its source and research date');
SELECT pg_temp.ok((SELECT count(*) = 140 FROM public.sp_certification_sources s JOIN research_added a ON a.code = s.credential_code
                    WHERE s.source_kind = 'programme' AND s.reviewed_on = DATE '2026-10-03'),
  'RS3.11 every addition keeps a reviewed programme source in the existing source table');
SELECT pg_temp.ok((SELECT count(*) = 0 FROM public.sp_certification_definitions d JOIN research_added a ON a.code = d.credential_code
                    WHERE d.abbreviation IS NOT NULL AND length(d.abbreviation) > 24),
  'RS3.12 abbreviations are the issuer''s own, never invented or truncated');
SELECT pg_temp.ok((SELECT count(*) = 27 FROM public.sp_certification_definitions d JOIN research_added a ON a.code = d.credential_code
                    WHERE d.abbreviation IS NULL),
  'RS3.13 the 27 awards with no published abbreviation have none: the catalogue invents no abbreviation');
SELECT pg_temp.ok((SELECT count(*) = 0 FROM public.sp_credential_types t JOIN research_added a ON a.code = t.code
                    WHERE length(btrim(t.symbol_label)) NOT BETWEEN 1 AND 8),
  'RS3.14 every plate mark fits the plate');
SELECT pg_temp.ok((SELECT count(*) = 2 FROM public.sp_certification_definition_aliases),
  'RS3.15 only the two aliases the research text itself supports exist');

-- ═══ RS4. Inert until published (the pre-publication state) ═════════════
-- The state between the import and the publication, reproduced in this
-- transaction: the same rows, inactive.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'fd270000-0000-4000-8000-000000000001', true);
-- What an ordinary signed-in holder is offered once everything is published.
SELECT count(*) AS holder_selectable FROM public.sp_approved_credential_catalogue \gset
RESET ROLE;
UPDATE public.sp_credential_types SET is_active = false WHERE code IN (SELECT code FROM research_added);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'fd270000-0000-4000-8000-000000000001', true);
SELECT pg_temp.ok((SELECT count(*) = :holder_selectable - 140 FROM public.sp_approved_credential_catalogue),
  'RS4.1 before publication the approved catalogue offers none of the 140');
SELECT pg_temp.refused($q$SELECT public.sp_save_international_credential('{"definition_code":"INTL_COMPTIA_SECURITY_PLUS","market_country":"","market_region":""}')$q$,
  'SP_APPROVED_DEFINITION_REQUIRED', 'RS4.2 an approved-but-unpublished definition cannot be registered');
SELECT pg_temp.denied($q$INSERT INTO public.sp_claims(holder_user_id, claim_type, credential_code, title) VALUES (auth.uid(), 'certification', 'INTL_COMPTIA_SECURITY_PLUS', 'CompTIA Security+')$q$,
  'RS4.3 nor can a claim be written to it directly');
SELECT pg_temp.ok((SELECT count(*) = 0 FROM public.sp_certification_definition_aliases),
  'RS4.4 the alias of an unpublished definition is not readable by a holder');
RESET ROLE;
UPDATE public.sp_credential_types SET is_active = true WHERE code IN (SELECT code FROM research_added);

-- ═══ RS5. The real journey: every area and every kind ═══════════════════
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'fd270000-0000-4000-8000-000000000001', true);
SELECT pg_temp.ok((SELECT count(*) = :holder_selectable FROM public.sp_approved_credential_catalogue),
  'RS5.1 once published, the approved catalogue offers all 140 additions to a holder in any country');
SELECT pg_temp.ok((SELECT count(*) = 140 FROM public.sp_approved_credential_catalogue v JOIN research_added a ON a.code = v.code
                    WHERE v.scope_code = 'global_professional' AND v.country IS NULL AND v.region IS NULL AND v.issuer_name IS NOT NULL
                      AND v.credential_class = a.class),
  'RS5.2 each carries its issuer, its kind, no country and no region');

SELECT public.sp_save_international_credential('{"definition_code":"INTL_COMPTIA_SECURITY_PLUS","market_country":"","market_region":"","identifier":"SEC-001"}') AS c_cyber \gset
SELECT public.sp_save_international_credential('{"definition_code":"INTL_INSTITUTES_CPCU","market_country":"","market_region":"","issued_on":"2024-05-01"}') AS c_ins_des \gset
SELECT public.sp_save_international_credential('{"definition_code":"INTL_CII_DIPLOMA_INSURANCE","market_country":"","market_region":""}') AS c_ins_qual \gset
SELECT public.sp_save_international_credential('{"definition_code":"INTL_IFPO_CPO","market_country":"","market_region":"","issued_on":"2023-01-10","valid_until":"2030-01-10"}') AS c_phys \gset
SELECT public.sp_save_international_credential('{"definition_code":"INTL_NEBOSH_IGC","market_country":"","market_region":""}') AS c_res_qual \gset
SELECT public.sp_save_international_credential('{"definition_code":"INTL_IOSH_MANAGING_SAFELY","market_country":"","market_region":"","issued_on":"2025-02-02"}') AS c_res_course \gset
SELECT public.sp_save_international_credential('{"definition_code":"INTL_GARP_RAI","market_country":"","market_region":""}') AS c_risk_assessed \gset
SELECT public.sp_save_international_credential('{"definition_code":"INTL_PRMIA_PRM","market_country":"","market_region":""}') AS c_risk_des \gset
SELECT public.sp_save_international_credential('{"definition_code":"INTL_PMI_PMI_RMP","market_country":"","market_region":"","identifier":"RMP-9"}') AS c_risk_cert \gset

SELECT pg_temp.ok((SELECT count(*) = 9 FROM public.sp_claims WHERE holder_user_id = auth.uid() AND lifecycle_state = 'active'),
  'RS5.3 nine credentials from all five areas save through the real RPC');
SELECT pg_temp.ok((SELECT count(*) = 0 FROM public.sp_claims WHERE holder_user_id = auth.uid() AND assertion_level <> 'self_declared'),
  'RS5.4 a catalogue definition verifies nobody: every claim is self-declared');
SELECT pg_temp.ok((SELECT count(*) = 0 FROM public.sp_claims WHERE holder_user_id = auth.uid() AND (jurisdiction_code IS NOT NULL OR sub_jurisdiction_code IS NOT NULL)),
  'RS5.5 an international credential held in Sweden carries no jurisdiction');
SELECT pg_temp.ok((SELECT count(*) = 9 FROM public.sp_claims c JOIN public.sp_certification_definitions d ON d.credential_code = c.credential_code
                     JOIN public.sp_certification_issuers i ON i.id = d.issuer_id
                    WHERE c.holder_user_id = auth.uid() AND c.claimed_issuer_name = i.display_name),
  'RS5.6 the governed issuer fills in automatically, never typed by the holder');
SELECT pg_temp.ok((SELECT credential_class FROM public.sp_credential_details WHERE claim_id = :'c_ins_des') = 'professional_designation'
                  AND (SELECT credential_class FROM public.sp_credential_details WHERE claim_id = :'c_ins_qual') = 'professional_qualification'
                  AND (SELECT credential_class FROM public.sp_credential_details WHERE claim_id = :'c_res_course') = 'course_certificate'
                  AND (SELECT credential_class FROM public.sp_credential_details WHERE claim_id = :'c_risk_assessed') = 'assessed_certificate'
                  AND (SELECT credential_class FROM public.sp_credential_details WHERE claim_id = :'c_cyber') = 'certification',
  'RS5.7 each saved claim stores its kind: designation, qualification, course certificate, assessed certificate, certification');
SELECT pg_temp.ok((SELECT valid_until IS NULL AND no_expiry IS NULL FROM public.sp_claims c JOIN public.sp_credential_details d ON d.claim_id = c.id WHERE c.id = :'c_cyber'),
  'RS5.8 an omitted expiry stays omitted: not lifetime, not invented');
SELECT pg_temp.ok((SELECT valid_until = DATE '2030-01-10' FROM public.sp_claims WHERE id = :'c_phys'),
  'RS5.9 a stated expiry is kept as stated');
SELECT pg_temp.refused($q$SELECT public.sp_save_international_credential('{"definition_code":"INTL_OFFSEC_OSCP","market_country":"","market_region":"","no_expiry":true}')$q$,
  'SP_NO_EXPIRY_NOT_APPROVED', 'RS5.10 non-expiring is refused unless the definition allows it, even for OSCP');
SELECT pg_temp.refused($q$SELECT public.sp_save_international_credential('{"definition_code":"INTL_NEBOSH_IGC","market_country":"SE","market_region":""}')$q$,
  'SP_DEFINITION_NOT_AVAILABLE_IN_MARKET', 'RS5.11 an international credential cannot be filed under a country');
SELECT pg_temp.refused($q$SELECT public.sp_save_international_credential('{"definition_code":"INTL_NEBOSH_IGC","market_country":"","market_region":"","issuer_name":"Someone Else"}')$q$,
  'SP_ISSUER_IS_GOVERNED', 'RS5.12 the issuer cannot be overridden by the holder');
SELECT pg_temp.refused($q$SELECT public.sp_save_international_credential('{"definition_code":"INTL_NEBOSH_IGC","market_country":"","market_region":"","authorisation_scope":"all"}')$q$,
  'SP_SCOPE_NOT_APPLICABLE', 'RS5.13 a scope cannot be attached where the definition has none');
SELECT pg_temp.refused($q$SELECT public.sp_save_international_credential('{"definition_code":"INTL_NEBOSH_IGC","market_country":"","market_region":"","definition_version":"v1"}')$q$,
  'SP_DEFINITION_VERSION_UNKNOWN', 'RS5.14 a version is never invented where none is governed');
SELECT pg_temp.refused($q$SELECT public.sp_save_international_credential('{"definition_code":"INTL_GARP_RAI","market_country":"","market_region":"","issued_on":"2025-03-01","valid_until":"2025-01-01"}')$q$,
  'SP_INVALID_DATES', 'RS5.15 an expiry before the issue date is refused');
SELECT pg_temp.refused($q$SELECT public.sp_save_international_credential('{"definition_code":"INTL_CGSS_NOT_IN_CATALOGUE","market_country":"","market_region":""}')$q$,
  'SP_APPROVED_DEFINITION_REQUIRED', 'RS5.16 a retained research record cannot be registered');
RESET ROLE;

-- The work country changes; the credential's scope does not.
UPDATE public.sp_passport_profiles SET jurisdiction_code = 'GB' WHERE holder_user_id = 'fd270000-0000-4000-8000-000000000001';
SELECT pg_temp.ok((SELECT count(*) = 9 AND bool_and(jurisdiction_code IS NULL AND sub_jurisdiction_code IS NULL)
                     FROM public.sp_claims WHERE holder_user_id = 'fd270000-0000-4000-8000-000000000001'),
  'RS5.17 changing the work country leaves every international credential''s scope untouched');
UPDATE public.sp_passport_profiles SET jurisdiction_code = 'SE' WHERE holder_user_id = 'fd270000-0000-4000-8000-000000000001';

-- Explicit non-expiring status, where an administrator has allowed it.
UPDATE public.sp_credential_types SET allows_no_expiry = true WHERE code = 'INTL_OFFSEC_OSCP';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'fd270000-0000-4000-8000-000000000001', true);
SELECT public.sp_save_international_credential('{"definition_code":"INTL_OFFSEC_OSCP","market_country":"","market_region":"","no_expiry":true}') AS c_oscp \gset
SELECT pg_temp.ok((SELECT d.no_expiry AND c.valid_until IS NULL FROM public.sp_credential_details d JOIN public.sp_claims c ON c.id = d.claim_id WHERE c.id = :'c_oscp'),
  'RS5.18 an explicit, administrator-allowed non-expiring status is stored as stated');
RESET ROLE;
UPDATE public.sp_credential_types SET allows_no_expiry = false WHERE code = 'INTL_OFFSEC_OSCP';

-- Another holder neither sees nor changes these.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'fd270000-0000-4000-8000-000000000002', true);
SELECT pg_temp.ok((SELECT count(*) = 0 FROM public.sp_claims WHERE holder_user_id = 'fd270000-0000-4000-8000-000000000001'),
  'RS5.19 another holder cannot read these claims');
SELECT pg_temp.refused(format($q$SELECT public.sp_save_international_credential(jsonb_build_object('definition_code','INTL_COMPTIA_SECURITY_PLUS','market_country','','market_region','','claim_id',%L,'version',1))$q$, :'c_cyber'),
  'SP_NOT_EDITABLE', 'RS5.20 nor correct them');
RESET ROLE;

-- ═══ RS6. Selective sharing: only what was selected ═════════════════════
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'fd270000-0000-4000-8000-000000000001', true);
SELECT public.sp_create_credential_disclosure_v2(ARRAY[:'c_res_course', :'c_risk_assessed', :'c_ins_des']::uuid[], '{}', 7, NULL, NULL, 'en', 'fd270000-0000-4000-8000-0000000000a1') AS shared \gset
SELECT (:'shared'::jsonb->>'token') AS share_token, (:'shared'::jsonb->>'disclosure_id') AS share_id \gset
RESET ROLE;
SELECT public.sp_get_disclosure(:'share_token') AS payload \gset
SELECT pg_temp.ok(jsonb_array_length(:'payload'::jsonb->'verified_claims') = 3, 'RS6.1 the recipient receives exactly the three selected credentials');
SELECT pg_temp.ok((SELECT count(*) = 3 FROM jsonb_array_elements(:'payload'::jsonb->'verified_claims') e
                    WHERE e->>'scope_code' = 'global_professional' AND e->>'jurisdiction' IS NULL),
  'RS6.2 each is presented as an international credential with no jurisdiction');
SELECT pg_temp.ok((SELECT array_agg(DISTINCT e->>'credential_class' ORDER BY e->>'credential_class')
                     = ARRAY['assessed_certificate', 'course_certificate', 'professional_designation']
                     FROM jsonb_array_elements(:'payload'::jsonb->'verified_claims') e),
  'RS6.3 the recipient payload carries each credential''s kind');
SELECT pg_temp.ok(:'payload' NOT LIKE '%SEC-001%' AND :'payload' NOT LIKE '%RMP-9%' AND :'payload' NOT LIKE '%Security+%'
                  AND :'payload' NOT LIKE '%storage%' AND :'payload' NOT LIKE '%' || :'c_cyber' || '%',
  'RS6.4 nothing unselected, no identifier and no internal id reaches the recipient');
SELECT pg_temp.ok((SELECT count(*) = 3 FROM jsonb_array_elements(:'payload'::jsonb->'verified_claims') e
                    WHERE e->>'assertion' = 'self_declared'),
  'RS6.5 the recipient sees them as self-declared: a catalogue definition adds no trust');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'fd270000-0000-4000-8000-000000000001', true);
SELECT public.sp_revoke_disclosure(:'share_id');
RESET ROLE;
SELECT pg_temp.ok(public.sp_get_disclosure(:'share_token')->>'status' = 'unavailable', 'RS6.6 a revoked share is unavailable at once');

-- ═══ RS7. Holder requests: a request creates nothing ════════════════════
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'fd270000-0000-4000-8000-000000000001', true);
SELECT public.sp_request_catalogue_definition('{"requested_name":"Certified Widget Auditor","requested_issuer":"Widget Institute","requested_abbreviation":"CWA","source_url":"https://widgets.example/cwa","note":"Held since 2021"}') AS req_a \gset
SELECT public.sp_request_catalogue_definition('{"requested_name":"Certified Global Sanctions Specialist","requested_issuer":"ACAMS","research_id":"cred_d824dc90bfadcee6"}') AS req_b \gset
RESET ROLE;
SELECT pg_temp.ok((SELECT types = (SELECT count(*) FROM public.sp_credential_types) AND definitions = (SELECT count(*) FROM public.sp_certification_definitions)
                      AND issuers = (SELECT count(*) FROM public.sp_certification_issuers)
                      FROM research_before),
  'RS7.1 requests create no definition, no issuer and no type: the catalogue is unchanged');
SELECT pg_temp.ok((SELECT count(*) = 2 AND bool_and(status = 'open') FROM public.sp_catalogue_requests WHERE holder_user_id = 'fd270000-0000-4000-8000-000000000001'),
  'RS7.2 two requests are open, awaiting an administrator');
SELECT pg_temp.ok((SELECT count(*) = 10 FROM public.sp_claims WHERE holder_user_id = 'fd270000-0000-4000-8000-000000000001' AND credential_code IS NOT NULL),
  'RS7.3 requests add no claim to the holder''s Passport (the ten from RS5 only)');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'fd270000-0000-4000-8000-000000000001', true);
SELECT pg_temp.ok((SELECT count(*) = :holder_selectable FROM public.sp_approved_credential_catalogue),
  'RS7.4 requests change no availability');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'fd270000-0000-4000-8000-000000000001', true);
SELECT pg_temp.refused($q$SELECT public.sp_request_catalogue_definition('{"requested_name":"certified widget auditor","requested_issuer":" WIDGET INSTITUTE "}')$q$,
  'SP_REQUEST_DUPLICATE', 'RS7.5 a second open request for the same award is refused by the database');
SELECT pg_temp.refused($q$SELECT public.sp_request_catalogue_definition('{"requested_name":"ab","requested_issuer":"Widget Institute"}')$q$,
  'SP_REQUEST_NAME_INVALID', 'RS7.6 a too-short name is refused');
SELECT pg_temp.refused($q$SELECT public.sp_request_catalogue_definition('{"requested_name":"Some Award","requested_issuer":""}')$q$,
  'SP_REQUEST_ISSUER_INVALID', 'RS7.7 an empty issuer is refused');
SELECT pg_temp.refused($q$SELECT public.sp_request_catalogue_definition('{"requested_name":"Some Award","requested_issuer":"Some Body","source_url":"http://insecure.example"}')$q$,
  'SP_REQUEST_URL_INVALID', 'RS7.8 a non-https source link is refused');
SELECT pg_temp.refused($q$SELECT public.sp_request_catalogue_definition('{"requested_name":"Some Award","requested_issuer":"Some Body","credential_code":"INTL_ASIS_CPP"}')$q$,
  'SP_INVALID_CATALOGUE_REQUEST', 'RS7.9 a request cannot name a definition, status or any field of its own choosing');
SELECT pg_temp.refused($q$SELECT public.sp_request_catalogue_definition('{"requested_name":"Some Award","requested_issuer":"Some Body","research_id":"cred_0000000000000000"}')$q$,
  'SP_REQUEST_UNKNOWN_RECORD', 'RS7.10 a request cannot cite a research record that does not exist');
SELECT pg_temp.refused($q$SELECT public.sp_request_catalogue_definition('{"requested_name":"Some Award","requested_issuer":"Some Body","research_id":"cred_ddb38dabc42858ab"}')$q$,
  'SP_REQUEST_UNKNOWN_RECORD', 'RS7.11 nor one that is already a definition');
-- The allowance: ten open requests, then no more.
DO $$ BEGIN
  FOR i IN 1..8 LOOP
    PERFORM public.sp_request_catalogue_definition(jsonb_build_object('requested_name', 'Allowance test award ' || i, 'requested_issuer', 'Allowance Body'));
  END LOOP;
END $$;
SELECT pg_temp.refused($q$SELECT public.sp_request_catalogue_definition('{"requested_name":"The eleventh award","requested_issuer":"Allowance Body"}')$q$,
  'SP_REQUEST_LIMIT', 'RS7.12 a holder has at most ten open requests');
SELECT pg_temp.ok((SELECT count(*) = 10 FROM public.sp_list_my_catalogue_requests()), 'RS7.13 a holder reads their own requests');
SELECT pg_temp.ok((SELECT count(*) = 0 FROM public.sp_catalogue_requests), 'RS7.14 a holder cannot read the request table directly');
SELECT set_config('request.jwt.claim.sub', 'fd270000-0000-4000-8000-000000000002', true);
SELECT pg_temp.ok((SELECT count(*) = 0 FROM public.sp_list_my_catalogue_requests()), 'RS7.15 another holder sees none of them');
SELECT set_config('request.jwt.claim.sub', 'fd270000-0000-4000-8000-000000000003', true);
SELECT pg_temp.refused($q$SELECT public.sp_request_catalogue_definition('{"requested_name":"Some Award","requested_issuer":"Some Body"}')$q$,
  'SP_NO_PASSPORT', 'RS7.16 a request needs a Passport, like a registration');
RESET ROLE;

-- ═══ RS8. "Not yet available": a reason, never a hidden record ══════════
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'fd270000-0000-4000-8000-000000000001', true);
SELECT pg_temp.ok((SELECT count(*) = 1 AND min(holder_reason) = 'awaiting_source_check' AND min(acronym) = 'CGSS'
                     FROM public.sp_catalogue_unavailable_matches('cgss')),
  'RS8.1 searching a retained award returns it with a controlled reason');
SELECT pg_temp.ok((SELECT count(*) = 0 FROM public.sp_catalogue_unavailable_matches('CPP')),
  'RS8.2 an available award is not listed as unavailable, and "cpp" does not find "IFCPP"');
SELECT pg_temp.ok((SELECT count(*) = 1 AND min(acronym) = 'CVRS' FROM public.sp_catalogue_unavailable_matches('ifcpp visitor')),
  'RS8.2b an issuer acronym and a title word find the record together');
SELECT pg_temp.ok((SELECT min(holder_reason) = 'retired_for_new_candidates' FROM public.sp_catalogue_unavailable_matches('loss adjusters advanced diploma')),
  'RS8.3 a retired award says it is retired for new candidates (multi-word search)');
SELECT pg_temp.ok((SELECT count(*) = 0 FROM public.sp_catalogue_unavailable_matches('%')) AND (SELECT count(*) = 0 FROM public.sp_catalogue_unavailable_matches('a')),
  'RS8.4 a search term is text, not a pattern, and a one-letter term matches nothing');
SELECT pg_temp.ok(pg_get_function_result('public.sp_catalogue_unavailable_matches(text,integer)'::regprocedure)
                  = 'TABLE(research_id text, official_name text, acronym text, issuer_name text, holder_reason text)',
  'RS8.5 the holder-facing columns are exactly five: no note, reviewer, URL or recheck text');
RESET ROLE;

-- ═══ RS9. Administrator decisions: authorised, bounded, audited ═════════
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'fd270000-0000-4000-8000-000000000001', true);
SELECT pg_temp.refused(format($q$SELECT public.sp_admin_resolve_catalogue_request(%L, 'declined', 'No')$q$, :'req_a'),
  'SP_CATALOGUE_ADMIN_REQUIRED', 'RS9.1 a holder cannot resolve a request');
SELECT pg_temp.refused($q$SELECT public.sp_admin_review_research_record((SELECT id FROM public.sp_catalogue_research_records WHERE reconciliation_outcome = 'retained_for_review' LIMIT 1), 'excluded', 'No')$q$,
  'SP_CATALOGUE_ADMIN_REQUIRED', 'RS9.2 a holder cannot record a research decision');
SELECT pg_temp.ok((SELECT count(*) = 0 FROM public.sp_catalogue_research_records), 'RS9.3 a holder cannot read the research records');
SELECT set_config('request.jwt.claim.sub', 'fd270000-0000-4000-8000-000000000005', true);
SELECT pg_temp.refused(format($q$SELECT public.sp_admin_resolve_catalogue_request(%L, 'declined', 'No')$q$, :'req_a'),
  'SP_CATALOGUE_ADMIN_REQUIRED', 'RS9.4 a Passport verifier is not a catalogue administrator');
SELECT pg_temp.ok((SELECT count(*) = 0 FROM public.sp_catalogue_research_records), 'RS9.5 nor can a verifier read the research records');
RESET ROLE;
SELECT pg_temp.ok(NOT has_function_privilege('anon', 'public.sp_admin_review_research_record(uuid,text,text,text,text,text)', 'EXECUTE')
                  AND NOT has_function_privilege('anon', 'public.sp_admin_resolve_catalogue_request(uuid,text,text,text,uuid)', 'EXECUTE')
                  AND NOT has_function_privilege('anon', 'public.sp_request_catalogue_definition(jsonb)', 'EXECUTE')
                  AND NOT has_function_privilege('anon', 'public.sp_catalogue_unavailable_matches(text,integer)', 'EXECUTE')
                  AND NOT has_function_privilege('anon', 'public.sp_list_my_catalogue_requests()', 'EXECUTE'),
  'RS9.6 a signed-out visitor can execute none of the five new functions');
SELECT pg_temp.ok(NOT has_table_privilege('authenticated', 'public.sp_catalogue_research_records', 'INSERT')
                  AND NOT has_table_privilege('authenticated', 'public.sp_catalogue_research_records', 'UPDATE')
                  AND NOT has_table_privilege('authenticated', 'public.sp_catalogue_research_records', 'DELETE')
                  AND NOT has_table_privilege('authenticated', 'public.sp_catalogue_requests', 'INSERT')
                  AND NOT has_table_privilege('authenticated', 'public.sp_catalogue_requests', 'UPDATE')
                  AND NOT has_table_privilege('authenticated', 'public.sp_catalogue_requests', 'DELETE')
                  AND NOT has_table_privilege('authenticated', 'public.sp_certification_definition_aliases', 'INSERT')
                  AND NOT has_table_privilege('anon', 'public.sp_catalogue_research_records', 'SELECT')
                  AND NOT has_table_privilege('anon', 'public.sp_catalogue_requests', 'SELECT'),
  'RS9.7 no client role holds a write privilege on any new table, and anon reads none');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'fd270000-0000-4000-8000-000000000001', true);
SELECT pg_temp.denied($q$INSERT INTO public.sp_catalogue_requests(holder_user_id, requested_name, requested_issuer) VALUES (auth.uid(), 'Direct insert', 'Direct body')$q$,
  'RS9.8 a request cannot be written to the table directly');
SELECT pg_temp.denied($q$UPDATE public.sp_catalogue_requests SET status = 'answered_existing'$q$,
  'RS9.9 a holder cannot resolve their own request');
SELECT pg_temp.denied($q$UPDATE public.sp_catalogue_research_records SET reconciliation_outcome = 'excluded'$q$,
  'RS9.10 a holder cannot edit a research decision');
RESET ROLE;

-- The administrator.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'fd270000-0000-4000-8000-000000000004', true);
SELECT pg_temp.ok((SELECT count(*) = 170 FROM public.sp_catalogue_research_records), 'RS9.11 the administrator reads all 170 research records');
SELECT pg_temp.ok((SELECT count(*) = 10 FROM public.sp_catalogue_requests), 'RS9.12 and every holder request');
SELECT pg_temp.refused($q$SELECT public.sp_admin_review_research_record((SELECT id FROM public.sp_catalogue_research_records WHERE reconciliation_outcome = 'retained_for_review' LIMIT 1), 'approved', 'Looks fine')$q$,
  'SP_RESEARCH_DECISION_INVALID', 'RS9.13 approval is not an in-app decision: it is a reviewed migration');
SELECT pg_temp.refused($q$SELECT public.sp_admin_review_research_record((SELECT id FROM public.sp_catalogue_research_records WHERE reconciliation_outcome = 'added_approved' LIMIT 1), 'excluded', 'Withdraw it')$q$,
  'SP_RESEARCH_RECORD_IS_PUBLISHED', 'RS9.14 a record that is already a definition cannot be withdrawn in-app');
SELECT pg_temp.refused($q$SELECT public.sp_admin_review_research_record((SELECT id FROM public.sp_catalogue_research_records WHERE reconciliation_outcome = 'matched_existing' LIMIT 1), 'pending', 'Reopen')$q$,
  'SP_RESEARCH_RECORD_IS_PUBLISHED', 'RS9.15 nor can a matched record');
SELECT pg_temp.refused($q$SELECT public.sp_admin_review_research_record((SELECT id FROM public.sp_catalogue_research_records WHERE reconciliation_outcome = 'retained_for_review' LIMIT 1), 'excluded', '')$q$,
  'SP_RESEARCH_REASON_REQUIRED', 'RS9.16 a decision needs a reason');
SELECT pg_temp.refused($q$SELECT public.sp_admin_review_research_record((SELECT id FROM public.sp_catalogue_research_records WHERE research_id = 'cred_d824dc90bfadcee6'), 'needs_information', 'Still open')$q$,
  'SP_RESEARCH_ISSUE_REQUIRED', 'RS9.17 retaining a record needs its issue, action and holder reason');
SELECT public.sp_admin_review_research_record((SELECT id FROM public.sp_catalogue_research_records WHERE research_id = 'cred_d824dc90bfadcee6'),
  'excluded', 'Owner decision: the programme is not offered through the Passport.');
SELECT pg_temp.ok((SELECT reconciliation_outcome = 'excluded' AND catalogue_decision = 'excluded' AND holder_reason = 'not_offered'
                          AND reviewed_by_user_id = 'fd270000-0000-4000-8000-000000000004' AND reviewer = 'platform_admin' AND reviewed_at IS NOT NULL
                          AND credential_code IS NULL
                     FROM public.sp_catalogue_research_records WHERE research_id = 'cred_d824dc90bfadcee6'),
  'RS9.18 an exclusion records who, when and why, and creates no definition');
SELECT pg_temp.ok((SELECT count(*) = 1 FROM public.audit_logs WHERE action = 'catalogue_research_decided' AND actor_id = 'fd270000-0000-4000-8000-000000000004'),
  'RS9.19 the decision is in the existing audit trail');
SELECT public.sp_admin_review_research_record((SELECT id FROM public.sp_catalogue_research_records WHERE research_id = 'cred_d824dc90bfadcee6'),
  'needs_information', 'Reopened for source confirmation.', 'The page still has to be opened.', 'Open the issuer page and confirm the title.', 'awaiting_source_check');
SELECT pg_temp.ok((SELECT reconciliation_outcome = 'retained_for_review' AND holder_reason = 'awaiting_source_check' FROM public.sp_catalogue_research_records WHERE research_id = 'cred_d824dc90bfadcee6'),
  'RS9.20 a record can be returned to review with its issue and action');

SELECT pg_temp.refused(format($q$SELECT public.sp_admin_resolve_catalogue_request(%L, 'declined', '')$q$, :'req_a'),
  'SP_REQUEST_REASON_REQUIRED', 'RS9.21 declining a request needs a reason the holder can read');
SELECT pg_temp.refused(format($q$SELECT public.sp_admin_resolve_catalogue_request(%L, 'answered_existing', 'Already there')$q$, :'req_a'),
  'SP_REQUEST_DEFINITION_REQUIRED', 'RS9.22 answering with an existing definition names that definition');
SELECT pg_temp.refused(format($q$SELECT public.sp_admin_resolve_catalogue_request(%L, 'answered_existing', 'Already there', 'NOT_A_REAL_CODE')$q$, :'req_a'),
  'SP_REQUEST_DEFINITION_REQUIRED', 'RS9.23 and it must be a real one');
SELECT public.sp_admin_resolve_catalogue_request(:'req_a', 'answered_existing', 'This award is already offered.', 'INTL_ASIS_CPP');
SELECT public.sp_admin_resolve_catalogue_request(:'req_b', 'in_research', 'Under review for the catalogue.', NULL,
  (SELECT id FROM public.sp_catalogue_research_records WHERE research_id = 'cred_d824dc90bfadcee6'));
SELECT pg_temp.ok((SELECT count(*) = 2 FROM public.audit_logs WHERE action = 'catalogue_request_resolved'), 'RS9.24 each resolution is audited');
RESET ROLE;
SELECT pg_temp.ok((SELECT types = (SELECT count(*) FROM public.sp_credential_types) AND definitions = (SELECT count(*) FROM public.sp_certification_definitions)
                     FROM research_before)
                  AND (SELECT count(*) = 10 FROM public.sp_claims WHERE holder_user_id = 'fd270000-0000-4000-8000-000000000001' AND credential_code IS NOT NULL),
  'RS9.25 resolving requests and decisions changed no definition and no claim');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'fd270000-0000-4000-8000-000000000001', true);
SELECT pg_temp.ok((SELECT count(*) = 1 AND min(resolution_note) = 'This award is already offered.' FROM public.sp_list_my_catalogue_requests() WHERE status = 'answered_existing'),
  'RS9.26 the holder sees the outcome and the note written for them');
SELECT pg_temp.ok(pg_get_function_result('public.sp_list_my_catalogue_requests()'::regprocedure) NOT LIKE '%resolved_by%',
  'RS9.27 the holder''s view of a request exposes no administrator identity');
-- Reopening is held to the same allowance. Holder A is back at ten open
-- (eight left after the two resolutions above, plus two more).
SELECT public.sp_request_catalogue_definition('{"requested_name":"Allowance refill award 1","requested_issuer":"Allowance Body"}');
SELECT public.sp_request_catalogue_definition('{"requested_name":"Allowance refill award 2","requested_issuer":"Allowance Body"}');
SELECT set_config('request.jwt.claim.sub', 'fd270000-0000-4000-8000-000000000004', true);
SELECT pg_temp.refused(format($q$SELECT public.sp_admin_resolve_catalogue_request(%L, 'open')$q$, :'req_b'),
  'SP_REQUEST_LIMIT', 'RS9.28 an administrator cannot reopen a request past the holder''s ten open');
SELECT pg_temp.ok((SELECT status = 'in_research' FROM public.sp_catalogue_requests WHERE id = :'req_b')
                  AND (SELECT count(*) = 10 FROM public.sp_catalogue_requests
                        WHERE holder_user_id = 'fd270000-0000-4000-8000-000000000001' AND status = 'open')
                  AND (SELECT count(*) = 2 FROM public.audit_logs WHERE action = 'catalogue_request_resolved'),
  'RS9.29 the refused reopen changed nothing and wrote no audit row');
SELECT public.sp_admin_resolve_catalogue_request(
  (SELECT id FROM public.sp_catalogue_requests WHERE requested_name = 'Allowance refill award 2'),
  'declined', 'Duplicate of an existing request.');
SELECT public.sp_admin_resolve_catalogue_request(:'req_b', 'open');
SELECT pg_temp.ok((SELECT status = 'open' AND resolved_at IS NULL AND resolved_by_user_id IS NULL AND resolution_note IS NULL
                     FROM public.sp_catalogue_requests WHERE id = :'req_b')
                  AND (SELECT count(*) = 10 FROM public.sp_catalogue_requests
                        WHERE holder_user_id = 'fd270000-0000-4000-8000-000000000001' AND status = 'open')
                  AND (SELECT count(*) = 4 FROM public.audit_logs WHERE action = 'catalogue_request_resolved'),
  'RS9.30 below the allowance a reopen succeeds, back to exactly ten open, and is audited');
RESET ROLE;

-- ═══ RS10. Verification stays separate ══════════════════════════════════
SELECT pg_temp.ok(NOT has_function_privilege('authenticated', 'public.sp_hayat_record_assessment(uuid,uuid,text,uuid,text,text,text,text,text,text[],jsonb,text,text[],timestamptz,integer)', 'EXECUTE'),
  'RS10.1 a holder still cannot write an automatic check result');
SELECT pg_temp.ok((SELECT count(*) = 0 FROM public.sp_claims WHERE credential_code IN (SELECT code FROM research_added) AND assertion_level <> 'self_declared'),
  'RS10.2 no research decision, request or publication moved a claim above self-declared');
SELECT pg_temp.ok((SELECT count(*) = (SELECT claims FROM research_before) + 10 FROM public.sp_claims),
  'RS10.3 the only claims created are the ten the holder saved');

ROLLBACK;
