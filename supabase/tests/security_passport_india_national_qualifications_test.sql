-- Security Passport — India's four national qualifications, as the database
-- enforces them (20261214090000).
--
--   1. The catalogue: exactly four IN definitions, each a national
--      qualification that can create no eligibility and no title, approved
--      for everyone WITHOUT a market pack, a pilot grant or a legal-review
--      claim. Every other market is unchanged.
--   2. An ordinary registered holder — no pilot membership, any work country —
--      sees and saves every one of the four through the real RPC and reads it
--      back: IN, no region, the issuer as stated on the certificate, the
--      version the certificate names, no invented expiry.
--   3. The exemption from the market gate is exactly as wide as the scope: an
--      IN claim for any other kind of definition, an IN claim with a
--      sub-jurisdiction and a forged regulator-as-issuer are refused.
--   4. Where the holder lives or wants to work changes nothing about a
--      credential or a market.
--   5. Review: request → clarification → a document added in answer →
--      approval by a passport_verifier, who sees the stated version.
--   6. Another candidate and an anonymous caller read and change nothing.
--   7. A share discloses the selected credential with its national scope and
--      country, and no identifier, version, evidence or reviewer note.
--
-- Everything is inside one transaction and rolled back.
\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.ok(b boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 IF b IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: %',label; END IF;
 RAISE NOTICE 'ok %',label; END $$;
CREATE FUNCTION pg_temp.refused(q text,needle text,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 BEGIN EXECUTE q; EXCEPTION WHEN OTHERS THEN
   IF position(needle IN SQLERRM)=0 THEN RAISE EXCEPTION 'ASSERTION FAILED: % refused for another reason: %',label,SQLERRM; END IF;
   RAISE NOTICE 'ok %',label; RETURN;
 END; RAISE EXCEPTION 'ASSERTION FAILED: accepted %',label;
END $$;

INSERT INTO auth.users(id,email) VALUES
 ('fd140000-0000-4000-8000-000000000001','india-holder@fixture.invalid'),
 ('fd140000-0000-4000-8000-000000000002','india-other@fixture.invalid'),
 ('fd140000-0000-4000-8000-000000000003','india-reviewer@fixture.invalid'),
 ('fd140000-0000-4000-8000-000000000004','india-se-holder@fixture.invalid');
-- The holder states India as work country; the Swedish holder states Sweden.
INSERT INTO public.sp_passport_profiles(holder_user_id,jurisdiction_code,work_location_confirmed_at) VALUES
 ('fd140000-0000-4000-8000-000000000001','IN',now()),
 ('fd140000-0000-4000-8000-000000000002',NULL,NULL),
 ('fd140000-0000-4000-8000-000000000004','SE',now());
INSERT INTO public.user_roles(user_id,role) VALUES ('fd140000-0000-4000-8000-000000000003','passport_verifier');

-- ── 1. The catalogue ────────────────────────────────────────────────────
SELECT pg_temp.ok((SELECT count(*)=4 FROM public.sp_credential_types WHERE jurisdiction_code='IN'),
 '1.1 exactly four Indian definitions exist');
SELECT pg_temp.ok((SELECT bool_and(scope_code='national_qualification' AND is_active AND market_pack_code IS NULL
   AND sub_jurisdiction_code IS NULL AND authority_id IS NULL AND regulated_role_id IS NULL
   AND legal_review_state='pending' AND NOT requires_valid_until AND NOT allows_no_expiry
   AND typical_validity_months IS NULL AND claim_type='certification' AND category='qualification'
   AND NOT (contributes_to && ARRAY['local_eligibility','active_title']::text[]))
   FROM public.sp_credential_types WHERE jurisdiction_code='IN'),
 '1.2 each is an approved national qualification with no pack, no role, no expiry rule, no eligibility or title, and no legal-review claim');
SELECT pg_temp.ok((SELECT array_agg(code ORDER BY code)=ARRAY['IN_MEPSC_Q7101','IN_MEPSC_Q7104','IN_MEPSC_Q7201','IN_MEPSC_Q7204']
   FROM public.sp_credential_types WHERE jurisdiction_code='IN'),
 '1.3 the four are Security Guard, CCTV Supervisor, Security Supervisor and CCTV Video Footage Auditor');
SELECT pg_temp.ok(NOT EXISTS(SELECT 1 FROM public.sp_market_packs WHERE jurisdiction_code='IN'),
 '1.4 India has no market pack');
SELECT pg_temp.ok((SELECT count(*)=1 FROM public.sp_market_packs WHERE is_active)
  AND (SELECT count(*)=0 FROM public.sp_credential_types WHERE market_pack_code IN ('GB','GB-NI','AE-DU','AE-AZ') AND is_active),
 '1.5 exactly one market is active and no GB, NI, Dubai or Abu Dhabi definition is public');
SELECT pg_temp.ok(NOT EXISTS(SELECT 1 FROM public.sp_credential_types
   WHERE jurisdiction_code='IN' AND (claim_type='licence' OR name_en ~* 'psara|licen[cs]e|armed')),
 '1.6 there is no personal PSARA licence and no armed-security definition');
SELECT pg_temp.ok((SELECT bool_and(n=1) FROM (SELECT count(*) FILTER (WHERE v.catalogue_status='current') n
   FROM public.sp_credential_types t LEFT JOIN public.sp_credential_definition_versions v ON v.credential_code=t.code
   WHERE t.jurisdiction_code='IN' GROUP BY t.code) s),
 '1.7 every Indian definition has exactly one current version');
SELECT pg_temp.ok((SELECT bool_and(awarding_body LIKE '%MEPSC%' AND source_url ~ '^https://')
   FROM public.sp_credential_definition_versions v JOIN public.sp_credential_types t ON t.code=v.credential_code
   WHERE t.jurisdiction_code='IN'),
 '1.8 every version names its awarding body and a source');
SELECT pg_temp.ok((SELECT count(*)=4 FROM public.sp_credential_organisation_roles r
   JOIN public.sp_authorities a ON a.id=r.authority_id WHERE r.role='regulator' AND a.code='IN_NCVET')
  AND (SELECT count(*)=4 FROM public.sp_credential_organisation_roles r JOIN public.sp_credential_types t ON t.code=r.credential_code
   WHERE t.jurisdiction_code='IN' AND r.role='issuer' AND r.document_specific)
  AND NOT EXISTS(SELECT 1 FROM public.sp_certification_definitions d JOIN public.sp_credential_types t ON t.code=d.credential_code WHERE t.jurisdiction_code='IN'),
 '1.9 regulator NCVET, issuer stated on the certificate, and no international-certification row');

-- The constraint makes the scope incapable of carrying rules.
SELECT pg_temp.refused($q$UPDATE public.sp_credential_types SET contributes_to=ARRAY['local_eligibility'] WHERE code='IN_MEPSC_Q7101'$q$,
 'sp_credential_type_national_qualification_bound','1.10 a national qualification cannot create local eligibility');
SELECT pg_temp.refused($q$UPDATE public.sp_credential_types SET market_pack_code='SE' WHERE code='IN_MEPSC_Q7101'$q$,
 'sp_credential_type_national_qualification_bound','1.11 a national qualification cannot join a market pack');
SELECT pg_temp.refused($q$UPDATE public.sp_credential_types SET requires_valid_until=true WHERE code='IN_MEPSC_Q7101'$q$,
 'sp_credential_type_national_qualification_bound','1.12 a national qualification cannot be made to demand an expiry');

-- ── 2. An ordinary holder, no pilot membership ─────────────────────────
SELECT pg_temp.ok(NOT EXISTS(SELECT 1 FROM public.sp_pilot_members WHERE user_id='fd140000-0000-4000-8000-000000000001'),'2.1 the holder has no pilot membership');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fd140000-0000-4000-8000-000000000001',true);
SELECT pg_temp.ok((SELECT count(*)=4 FROM public.sp_approved_credential_catalogue WHERE country='IN' AND region IS NULL
   AND issuer_name IS NULL AND scope_code='national_qualification'),
 '2.2 the holder is offered all four, with the issuer to be stated from the certificate');
SELECT count(*) AS se_n FROM public.sp_approved_credential_catalogue WHERE country='SE' \gset
SELECT count(*) AS intl_n FROM public.sp_approved_credential_catalogue WHERE scope_code='global_professional' \gset
SELECT pg_temp.ok(:se_n=8 AND :intl_n=14 AND (SELECT count(*)=0 FROM public.sp_approved_credential_catalogue WHERE country IN ('GB','AE')),
 '2.3 Sweden (8) and the international certifications (14) are unchanged; GB and Dubai stay closed');

-- GUARDED RELEASE. Over PostgREST's listing path, an application that does not
-- send the catalogue contract (one deployed before this release) is offered no
-- definition it cannot save — so none of the four.
SELECT set_config('request.path','/sp_approved_credential_catalogue',true);
SELECT set_config('request.headers','{}',true);
SELECT pg_temp.ok((SELECT count(*)=0 FROM public.sp_approved_credential_catalogue WHERE country='IN'),
 '2.4 an application without the catalogue contract is offered none of the four');
SELECT set_config('request.headers','{"x-passport-catalogue-contract":"2"}',true);
SELECT pg_temp.ok((SELECT count(*)=4 FROM public.sp_approved_credential_catalogue WHERE country='IN'),
 '2.5 the application that sends the contract is offered all four');
SELECT set_config('request.path','',true);
SELECT set_config('request.headers','',true);

SELECT public.sp_save_international_credential('{"definition_code":"IN_MEPSC_Q7101","market_country":"IN","identifier":"SID-FIXTURE-0001","issued_on":"2023-03-04","issuer_name":"Management & Entrepreneurship and Professional Skills Council (MEPSC)","definition_version":"qp-6.0"}') AS g \gset
SELECT public.sp_save_international_credential('{"definition_code":"IN_MEPSC_Q7201","market_country":"IN","issued_on":"2021-11-30","issuer_name":"Fixture Skill Centre, Pune"}') AS s \gset
SELECT public.sp_save_international_credential('{"definition_code":"IN_MEPSC_Q7104","market_country":"IN","issued_on":"2024-01-15","issuer_name":"MEPSC","definition_version":"qp-5.0"}') AS c \gset
SELECT public.sp_save_international_credential('{"definition_code":"IN_MEPSC_Q7204","market_country":"IN","issuer_name":"MEPSC"}') AS a \gset
SELECT pg_temp.ok((SELECT count(*)=4 FROM public.sp_claims WHERE holder_user_id=auth.uid() AND id IN (:'g',:'s',:'c',:'a')
   AND jurisdiction_code='IN' AND sub_jurisdiction_code IS NULL AND assertion_level='self_declared'
   AND lifecycle_state='active' AND valid_until IS NULL),
 '2.6 all four save: IN, no region, self-declared, active, and no expiry was invented');
SELECT pg_temp.ok((SELECT credential_reference='SID-FIXTURE-0001' AND issued_on='2023-03-04' AND claimed_issuer_name LIKE 'Management & Entrepreneurship%'
   AND title='Security Guard (MEP/Q7101)' FROM public.sp_claims WHERE id=:'g'),
 '2.7 read back: certificate number, issue date, the issuer as stated and the governed title');
SELECT pg_temp.ok((SELECT definition_version='qp-6.0' AND issuing_country_code='IN' AND validity_jurisdiction_code='IN'
   AND credential_class='vocational_qualification' AND no_expiry IS NULL FROM public.sp_credential_details WHERE claim_id=:'g'),
 '2.8 read back: the stated version, India as issuing and validity territory, the class, no lifetime claim');
SELECT pg_temp.ok((SELECT definition_version IS NULL FROM public.sp_credential_details WHERE claim_id=:'s'),
 '2.9 a holder who does not know the version states none, and none is inferred');
SELECT pg_temp.ok((SELECT issued_on IS NULL AND credential_reference IS NULL FROM public.sp_claims WHERE id=:'a'),
 '2.10 a credential can be saved with only its issuer, to be completed later');

-- Refusals, each for its own reason.
SELECT pg_temp.refused($q$SELECT public.sp_save_international_credential('{"definition_code":"IN_MEPSC_Q7101","market_country":"IN"}')$q$,
 'SP_CREDENTIAL_REQUIRES_ISSUER','2.11 the issuer on the certificate is required');
SELECT pg_temp.refused($q$SELECT public.sp_save_international_credential('{"definition_code":"IN_MEPSC_Q7101","market_country":"IN","issuer_name":"National Council for Vocational Education and Training (NCVET)"}')$q$,
 'SP_ISSUER_IS_A_REGULATOR','2.12 the regulator cannot be named as the issuer');
SELECT pg_temp.refused($q$SELECT public.sp_save_international_credential('{"definition_code":"IN_MEPSC_Q7101","market_country":"IN","issuer_name":"MEPSC","definition_version":"qp-99"}')$q$,
 'SP_DEFINITION_VERSION_UNKNOWN','2.13 an unknown version is refused');
SELECT pg_temp.refused($q$SELECT public.sp_save_international_credential('{"definition_code":"IN_MEPSC_Q7204","market_country":"IN","issuer_name":"MEPSC","definition_version":"qp-6.0"}')$q$,
 'SP_DEFINITION_VERSION_UNKNOWN','2.14 another definition''s version is refused');
SELECT pg_temp.refused($q$SELECT public.sp_save_international_credential('{"definition_code":"IN_MEPSC_Q7101","market_country":"AE","market_region":"AE-DU","issuer_name":"MEPSC"}')$q$,
 'SP_DEFINITION_NOT_AVAILABLE_IN_MARKET','2.15 an Indian qualification cannot be filed as a Dubai credential');
SELECT pg_temp.refused($q$SELECT public.sp_save_international_credential('{"definition_code":"IN_MEPSC_Q7101","market_country":"IN","issuer_name":"MEPSC","no_expiry":true}')$q$,
 'SP_NO_EXPIRY_NOT_APPROVED','2.16 lifetime validity cannot be declared');
SELECT pg_temp.refused($q$SELECT public.sp_save_international_credential('{"definition_code":"IN_MEPSC_Q7101","market_country":"IN","issuer_name":"MEPSC","authorisation_scope":"Fixture Agency"}')$q$,
 'SP_SCOPE_NOT_APPLICABLE','2.17 an agency cannot be attached as if the qualification were an agency licence');
SELECT pg_temp.refused(format($q$UPDATE public.sp_credential_details SET definition_version='qp-5.0' WHERE claim_id=%L$q$,:'g'),
 'SP_DEFINITION_VERSION_UNKNOWN','2.18 a direct write cannot attach another definition''s version');
SELECT pg_temp.refused(format($q$UPDATE public.sp_claims SET assertion_level='verified' WHERE id=%L$q$,:'g'),
 'SP_TRUST_FIELD_IMMUTABLE','2.19 the holder cannot promote their own credential');

-- Correction creates a successor; the old row becomes history.
SELECT version_no AS gv FROM public.sp_claims WHERE id=:'g' \gset
SELECT public.sp_save_international_credential(format('{"claim_id":"%s","version":%s,"definition_code":"IN_MEPSC_Q7101","market_country":"IN","identifier":"SID-FIXTURE-0002","issued_on":"2023-04-03","issuer_name":"MEPSC","definition_version":"qp-6.0"}',:'g',:'gv')::jsonb) AS g2 \gset
SELECT pg_temp.ok((SELECT supersedes_id=:'g'::uuid AND credential_reference='SID-FIXTURE-0002' AND issued_on='2023-04-03' AND jurisdiction_code='IN'
   FROM public.sp_claims WHERE id=:'g2')
  AND (SELECT lifecycle_state<>'active' FROM public.sp_claims WHERE id=:'g')
  AND (SELECT definition_version='qp-6.0' FROM public.sp_credential_details WHERE claim_id=:'g2'),
 '2.20 a correction is a successor that keeps India and the version; the old version is history');
RESET ROLE;

-- ── 3. The exemption is exactly as wide as the scope ───────────────────
-- A definition of any OTHER scope filed under IN still meets the market gate.
INSERT INTO public.sp_credential_types(code,claim_type,category,name_sv,name_en,symbol_label,is_active,scope_code,jurisdiction_code,contributes_to)
VALUES ('IN_FIXTURE_REGULATED','licence','appointment','Fixture','Fixture','FX',true,'national_regulated','IN','{}');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fd140000-0000-4000-8000-000000000001',true);
SELECT pg_temp.ok(NOT EXISTS(SELECT 1 FROM public.sp_approved_credential_catalogue WHERE code='IN_FIXTURE_REGULATED'),
 '3.1 an Indian REGULATED definition is not offered: India has no reviewed market');
SELECT pg_temp.refused($q$INSERT INTO public.sp_claims(holder_user_id,claim_type,credential_code,title,jurisdiction_code,lifecycle_state) VALUES(auth.uid(),'licence','IN_FIXTURE_REGULATED','Fixture','IN','draft')$q$,
 'SP_APPROVED_DEFINITION_REQUIRED','3.2 nor written: the closed catalogue refuses it first');
SELECT pg_temp.refused($q$INSERT INTO public.sp_claims(holder_user_id,claim_type,credential_code,title,jurisdiction_code,claimed_issuer_name,lifecycle_state) VALUES(auth.uid(),'certification','IN_MEPSC_Q7101','Security Guard (MEP/Q7101)','SE','MEPSC','active')$q$,
 'SP_GOVERNED_METADATA_IMMUTABLE','3.3 an Indian qualification cannot be relabelled as Swedish');
RESET ROLE;
-- THE RULE ITSELF, with the closed-catalogue guard stood down inside this
-- rolled-back transaction, so each refusal below is sp_claims_credential_rules'
-- own and not an earlier trigger's.
ALTER TABLE public.sp_claims DISABLE TRIGGER sp_00_closed_catalogue;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fd140000-0000-4000-8000-000000000001',true);
SELECT pg_temp.refused($q$INSERT INTO public.sp_claims(holder_user_id,claim_type,credential_code,title,jurisdiction_code,lifecycle_state) VALUES(auth.uid(),'licence','IN_FIXTURE_REGULATED','Fixture','IN','draft')$q$,
 'SP_JURISDICTION_NOT_SUPPORTED','3.4 the market gate still stands for any IN definition that is not a national qualification, even a draft');
SELECT pg_temp.refused($q$INSERT INTO public.sp_claims(holder_user_id,claim_type,credential_code,title,jurisdiction_code,sub_jurisdiction_code,lifecycle_state) VALUES(auth.uid(),'certification','IN_MEPSC_Q7101','Security Guard (MEP/Q7101)','IN','IN-MH','draft')$q$,
 'SP_SUB_JURISDICTION_NOT_SUPPORTED','3.5 a state-level Indian claim is not exempt and is refused');
SELECT pg_temp.refused($q$INSERT INTO public.sp_claims(holder_user_id,claim_type,credential_code,title,jurisdiction_code,claimed_issuer_name,lifecycle_state) VALUES(auth.uid(),'certification','IN_MEPSC_Q7101','Security Guard (MEP/Q7101)','SE','MEPSC','active')$q$,
 'SP_CREDENTIAL_JURISDICTION_MISMATCH','3.6 filed under Sweden it meets the Swedish market and the jurisdiction check');
INSERT INTO public.sp_claims(holder_user_id,claim_type,credential_code,title,jurisdiction_code,claimed_issuer_name,lifecycle_state)
 VALUES(auth.uid(),'certification','IN_MEPSC_Q7101','Security Guard (MEP/Q7101)','IN','MEPSC','draft');
SELECT pg_temp.ok(true,'3.7 and the exact pairing — its own country, no region — passes the rule');
RESET ROLE;
ALTER TABLE public.sp_claims ENABLE TRIGGER sp_00_closed_catalogue;
UPDATE public.sp_credential_types SET is_active=false WHERE code='IN_MEPSC_Q7204';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fd140000-0000-4000-8000-000000000001',true);
SELECT pg_temp.ok(NOT EXISTS(SELECT 1 FROM public.sp_approved_credential_catalogue WHERE code='IN_MEPSC_Q7204'),
 '3.8 a national qualification withdrawn from approval (is_active false) is offered to nobody');
SELECT pg_temp.refused($q$SELECT public.sp_save_international_credential('{"definition_code":"IN_MEPSC_Q7204","market_country":"IN","issuer_name":"MEPSC"}')$q$,
 'SP_APPROVED_DEFINITION_REQUIRED','3.9 and cannot be saved');
SELECT pg_temp.ok((SELECT count(*)=1 FROM public.sp_claims WHERE id=:'a'),'3.10 what was saved while it was approved is kept');
RESET ROLE;
UPDATE public.sp_credential_types SET is_active=true WHERE code='IN_MEPSC_Q7204';
DELETE FROM public.sp_credential_types WHERE code='IN_FIXTURE_REGULATED';

-- ── 4. Where the holder lives or wants to work changes nothing ─────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fd140000-0000-4000-8000-000000000001',true);
INSERT INTO public.candidate_current_location(user_id,country_code,locality) VALUES (auth.uid(),'IN','पुणे');
INSERT INTO public.candidate_job_preferences(user_id,desired_destinations,relocation_interest) VALUES (auth.uid(),ARRAY['AE-DU','GB'],'open');
SELECT pg_temp.ok((SELECT jurisdiction_code='IN' AND sub_jurisdiction_code IS NULL FROM public.sp_passport_profiles WHERE holder_user_id=auth.uid()),
 '4.1 choosing Dubai as a destination leaves the work country India');
SELECT pg_temp.ok((SELECT count(*)=0 FROM public.sp_claims WHERE holder_user_id=auth.uid() AND lifecycle_state='active' AND jurisdiction_code<>'IN'),
 '4.2 and relabels no credential');
SELECT pg_temp.ok(public.sp_market_access(auth.uid(),'AE-DU')='closed' AND (SELECT count(*)=0 FROM public.sp_approved_credential_catalogue WHERE region='AE-DU'),
 '4.3 and grants no Dubai access');
SELECT pg_temp.ok((SELECT locality='पुणे' FROM public.candidate_current_location WHERE user_id=auth.uid()),
 '4.4 a locality in any script is kept as written');
RESET ROLE;
-- A Swedish holder sees the same four: availability does not follow residence or work country.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fd140000-0000-4000-8000-000000000004',true);
SELECT pg_temp.ok((SELECT count(*)=4 FROM public.sp_approved_credential_catalogue WHERE country='IN'),
 '4.5 a holder working in Sweden may record an Indian qualification: nationality and residence are never asked');
RESET ROLE;

-- ── 5. Review: request, clarification, answer, decision ────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fd140000-0000-4000-8000-000000000001',true);
SELECT public.sp_attach_evidence(:'g2'::uuid,NULL,'fd140000-0000-4000-8000-000000000001/in-cert.pdf','certificate.pdf','application/pdf',4096,repeat('cd',32));
SELECT public.sp_submit_for_verification(:'g2'::uuid,NULL,'cqrityjob_review',NULL) AS req \gset
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fd140000-0000-4000-8000-000000000003',true);
SELECT pg_temp.ok(position(:'req' IN public.sp_verifier_queue('pending')::text)>0,'5.1 the reviewer finds the Indian request in the queue');
SELECT public.sp_verifier_request_detail(:'req'::uuid) AS det \gset
SELECT pg_temp.ok((:'det'::jsonb#>>'{claim,credential_code}')='IN_MEPSC_Q7101' AND (:'det'::jsonb#>>'{claim,jurisdiction}')='IN'
   AND (:'det'::jsonb#>>'{claim,definition_version}')='qp-6.0' AND (:'det'::jsonb#>>'{claim,issuer}')='MEPSC'
   AND jsonb_array_length(:'det'::jsonb->'evidence')=1,
 '5.2 the reviewer sees the definition, the stated version, the issuer as stated and the evidence');
SELECT pg_temp.ok((SELECT awarding_body LIKE '%MEPSC%' AND qualification_code='MEP/Q7101' FROM public.sp_credential_definition_versions
   WHERE credential_code='IN_MEPSC_Q7101' AND version_key='qp-6.0'),
 '5.3 and can read what that version is, and who awards it');
SELECT public.sp_verifier_decide(:'req'::uuid,'clarification_requested',NULL,'Certificate page 2 missing','Please add the page that shows the certificate number.',NULL,NULL);
RESET ROLE;
-- One transaction has one now(): without this the approval below and the
-- clarification would tie on decided_at, and "the latest decision" would be
-- picked by uuid order. The clarification is moved an hour back -- the order
-- in which a real reviewer makes them. (Append-only guard stood down for this
-- one fixture write, inside the rolled-back transaction.)
ALTER TABLE public.sp_verification_decisions DISABLE TRIGGER sp_decisions_append_only;
UPDATE public.sp_verification_decisions SET decided_at=decided_at-interval '1 hour' WHERE request_id=:'req';
ALTER TABLE public.sp_verification_decisions ENABLE TRIGGER sp_decisions_append_only;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fd140000-0000-4000-8000-000000000001',true);
SELECT pg_temp.ok((SELECT status='clarification_requested' FROM public.sp_verification_requests WHERE id=:'req'),'5.4 the holder sees clarification requested');
SELECT public.sp_attach_evidence(:'g2'::uuid,NULL,'fd140000-0000-4000-8000-000000000001/in-cert-p2.pdf','certificate-page-2.pdf','application/pdf',2048,repeat('ef',32));
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fd140000-0000-4000-8000-000000000003',true);
SELECT pg_temp.ok(position(:'req' IN public.sp_verifier_queue('clarification_requested')::text)>0
   AND jsonb_array_length(public.sp_verifier_request_detail(:'req'::uuid)->'evidence')=2,
 '5.5 the reviewer finds the answered request and the added document');
SELECT public.sp_verifier_decide(:'req'::uuid,'approved','document_review','Checked against certificate','',NULL,NULL);
RESET ROLE;
SELECT pg_temp.ok((SELECT assertion_level='verified' FROM public.sp_claims WHERE id=:'g2'),
 '5.6 only the reviewer''s recorded decision moves the credential to verified');
SELECT pg_temp.ok((SELECT count(*)=2 FROM public.sp_verification_decisions WHERE request_id=:'req'),
 '5.7 both decisions are recorded');

-- ── 6. Another candidate and an anonymous caller ───────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fd140000-0000-4000-8000-000000000002',true);
SELECT pg_temp.ok((SELECT count(*)=0 FROM public.sp_claims WHERE holder_user_id='fd140000-0000-4000-8000-000000000001'),
 '6.1 another candidate cannot read the claims');
SELECT pg_temp.ok((SELECT count(*)=0 FROM public.sp_credential_details WHERE claim_id IN (:'g2',:'s')),
 '6.2 nor their details');
SELECT pg_temp.ok((SELECT count(*)=0 FROM public.sp_evidence WHERE claim_id=:'g2'),'6.3 nor the evidence');
SELECT pg_temp.ok(((SELECT count(*) FROM public.candidate_current_location)+(SELECT count(*) FROM public.candidate_job_preferences))=0,
 '6.4 nor where they live or want to work');
UPDATE public.sp_claims SET credential_reference='HIJACK' WHERE id=:'s';
SELECT pg_temp.ok((SELECT count(*)=0 FROM public.sp_claims WHERE credential_reference='HIJACK'),'6.5 an update of another''s claim touches nothing');
SELECT pg_temp.refused(format($q$SELECT public.sp_save_international_credential('{"claim_id":"%s","version":1,"definition_code":"IN_MEPSC_Q7201","market_country":"IN","issuer_name":"Other Centre"}')$q$,:'s'),
 'SP_NOT_EDITABLE','6.6 nor can the save RPC correct it');
SELECT pg_temp.refused(format($q$SELECT public.sp_submit_for_verification(%L,NULL,'cqrityjob_review',NULL)$q$,:'s'),
 'SP_NOT_HOLDER','6.7 nor submit it for review');
SELECT pg_temp.refused(format($q$SELECT public.sp_verifier_request_detail(%L)$q$,:'req'),'SP_NOT_VERIFIER','6.8 nor read the review');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.refused($q$SELECT count(*) FROM public.sp_approved_credential_catalogue$q$,'permission denied','6.9 anon cannot list the catalogue');
SELECT pg_temp.refused($q$SELECT count(*) FROM public.sp_credential_definition_versions$q$,'permission denied','6.10 anon cannot read the versions table');
SELECT pg_temp.refused($q$SELECT count(*) FROM public.candidate_current_location$q$,'permission denied','6.11 anon cannot read current locations');
SELECT pg_temp.refused($q$SELECT count(*) FROM public.candidate_job_preferences$q$,'permission denied','6.12 anon cannot read job preferences');
SELECT pg_temp.refused($q$SELECT public.sp_save_international_credential('{"definition_code":"IN_MEPSC_Q7101","market_country":"IN","issuer_name":"MEPSC"}')$q$,
 'permission denied','6.13 anon cannot save');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fd140000-0000-4000-8000-000000000002',true);
SELECT pg_temp.refused($q$INSERT INTO public.sp_credential_definition_versions(credential_code,version_key,official_title,awarding_body,catalogue_status,source_url,checked_on) VALUES('IN_MEPSC_Q7101','fake','x','x','superseded','https://x.example/',current_date)$q$,
 'permission denied','6.14 a signed-in user cannot add a catalogue version');
SELECT pg_temp.refused($q$UPDATE public.sp_credential_types SET is_active=false WHERE code='IN_MEPSC_Q7101'$q$,
 'permission denied','6.15 nor change a definition');
RESET ROLE;

-- ── 7. Sharing ─────────────────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fd140000-0000-4000-8000-000000000001',true);
SELECT public.sp_create_credential_disclosure_v2(ARRAY[:'g2',:'c']::uuid[],'{}',7,NULL,NULL,'en','fd140000-0000-4000-8000-000000000091') AS share \gset
RESET ROLE;
INSERT INTO public.sp_share_sessions(disclosure_id,session_hash,expires_at)
 VALUES((:'share'::jsonb->>'disclosure_id')::uuid,encode(digest(repeat('c',64),'sha256'),'hex'),now()+interval '20 minutes');
SELECT public.sp_get_disclosure_session(repeat('c',64)) AS payload \gset
SELECT pg_temp.ok(jsonb_array_length(:'payload'::jsonb->'verified_claims')=2,'7.1 exactly the two selected credentials are disclosed');
SELECT pg_temp.ok((SELECT bool_and(c->>'scope_code'='national_qualification' AND c->>'validity_jurisdiction'='IN')
   FROM jsonb_array_elements(:'payload'::jsonb->'verified_claims') c),
 '7.2 each carries its national scope and India');
SELECT pg_temp.ok(EXISTS(SELECT 1 FROM jsonb_array_elements(:'payload'::jsonb->'verified_claims') c
   WHERE c->>'credential_code'='IN_MEPSC_Q7101' AND c->>'assertion'='verified')
  AND EXISTS(SELECT 1 FROM jsonb_array_elements(:'payload'::jsonb->'verified_claims') c
   WHERE c->>'credential_code'='IN_MEPSC_Q7104' AND c->>'assertion'='self_declared'),
 '7.3 each carries its own truthful status: one verified, one self-declared');
SELECT pg_temp.ok(position('SID-FIXTURE' IN :'payload')=0 AND position('qp-6.0' IN :'payload')=0 AND position('certificate' IN :'payload')=0
   AND position('Certificate page 2 missing' IN :'payload')=0 AND position('in-cert' IN :'payload')=0,
 '7.4 no identifier, version, evidence file, storage path or reviewer note reaches the recipient');
SELECT pg_temp.ok(position(:'s' IN :'payload')=0 AND position('Security Supervisor' IN :'payload')=0,
 '7.5 the unselected credential is absent');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fd140000-0000-4000-8000-000000000001',true);
SELECT public.sp_revoke_disclosure((:'share'::jsonb->>'disclosure_id')::uuid);
RESET ROLE;
SELECT pg_temp.ok((public.sp_get_disclosure_session(repeat('c',64))->>'status')<>'active','7.6 a revoked share no longer reads as active');
ROLLBACK;
