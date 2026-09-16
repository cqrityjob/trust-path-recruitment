-- =============================================================================
-- Security Passport — Phase 6b assertions: correction preserves the credential
--
-- Every rule is asserted by MUTATION: the suite attempts the thing the rule
-- forbids and fails if the database allows it.
--
-- The two properties that matter most:
--
--   * correcting a credential must not silently discard its code, its
--     reference or the holder's note;
--   * a correction that changes WHAT IS ASSERTED must not carry someone
--     else's verification decision onto the new version.
--
-- Verified fixtures are seeded by direct INSERT with attribution. That is
-- legitimate here: the trust-immutability trigger guards UPDATEs, the CHECK
-- constraint still demands attribution on INSERT, and the verification
-- workflow itself is already proven by the Phase 3/4 suite. This file is about
-- correction.
-- =============================================================================

\set ON_ERROR_STOP on
SET client_min_messages TO NOTICE;

CREATE OR REPLACE FUNCTION pg_temp.ok(cond boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF cond IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: %', label; END IF;
  RAISE NOTICE 'ok  %', label;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.must_fail(stmt text, needle text, label text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE _msg text;
BEGIN
  BEGIN EXECUTE stmt;
  EXCEPTION WHEN OTHERS THEN
    _msg := SQLERRM;
    IF needle <> '' AND position(lower(needle) IN lower(_msg)) = 0 THEN
      RAISE EXCEPTION 'ASSERTION FAILED: % -- wrong error: %', label, _msg;
    END IF;
    RAISE NOTICE 'ok  % (refused: %)', label, left(_msg, 80);
    RETURN;
  END;
  RAISE EXCEPTION 'ASSERTION FAILED: % -- SUCCEEDED but must be refused', label;
END $$;

\echo '==> Security Passport Phase 6b'

INSERT INTO auth.users (id, email) VALUES
  ('f6b00000-0000-0000-0000-000000000001','p6b-holder@example.test'),
  ('f6b00000-0000-0000-0000-000000000002','p6b-other@example.test'),
  ('f6b00000-0000-0000-0000-000000000009','p6b-verifier@example.test')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.sp_passport_profiles (holder_user_id, display_name)
VALUES ('f6b00000-0000-0000-0000-000000000001','P6B Holder (fiktiv)')
ON CONFLICT (holder_user_id) DO NOTHING;


-- Fixture privilege is limited to seeding starting trust; all mutations under
-- test run as authenticated. Every fixture resolves an existing approved row.
CREATE FUNCTION pg_temp.governed_claim(_holder uuid,_code text,_level text DEFAULT 'self_declared',_reference text DEFAULT 'OLD') RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE _id uuid;
BEGIN
 INSERT INTO public.sp_claims(holder_user_id,claim_type,title,credential_code,claimed_issuer_name,jurisdiction_code,sub_jurisdiction_code,credential_reference,valid_until,assertion_level,verified_by_user_id,verified_at)
 SELECT _holder,d.claim_type,d.name_sv,d.code,d.issuer_name,d.country,d.region,_reference,DATE '2030-01-01',_level,
 CASE WHEN _level='verified' THEN 'f6b00000-0000-0000-0000-000000000009'::uuid END,
 CASE WHEN _level='verified' THEN now() END
 FROM public.sp_approved_credential_catalogue d WHERE code=_code RETURNING id INTO _id;
 IF _id IS NULL THEN RAISE EXCEPTION 'Missing governed fixture'; END IF;
 RETURN _id;
END $$;
CREATE FUNCTION pg_temp.correct_personal(_id uuid,_reference text,_expiry date DEFAULT '2030-01-01') RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE c public.sp_claims%ROWTYPE;
BEGIN
 SELECT * INTO STRICT c FROM public.sp_claims WHERE id=_id;
 RETURN public.sp_correct_claim(c.id,c.title,c.claimed_issuer_name,c.jurisdiction_code,c.issued_on,c.valid_from,_expiry,'Corrected identifier',c.credential_code,_reference,NULL,NULL,NULL,c.sub_jurisdiction_code,NULL);
END $$;

\echo '    GROUP 1 -- governed identity and personal fields survive correction'
DO $$ DECLARE h uuid:='f6b00000-0000-0000-0000-000000000001'; old_id uuid; new_id uuid; r public.sp_claims%ROWTYPE; BEGIN
 old_id:=pg_temp.governed_claim(h,'INTL_ASIS_CPP','self_declared','CERT-1001');
 SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claim.sub',h::text,true);
 new_id:=pg_temp.correct_personal(old_id,'CERT-1001'); RESET ROLE;
 SELECT * INTO r FROM public.sp_claims WHERE id=new_id;
 PERFORM pg_temp.ok(r.credential_code='INTL_ASIS_CPP','1.1 definition survives correction');
 PERFORM pg_temp.ok(r.credential_reference='CERT-1001','1.2 reference survives correction');
 PERFORM pg_temp.ok(r.holder_note IS NULL,'1.3 no unapproved candidate field is introduced');
 PERFORM pg_temp.ok(r.version_no=2 AND r.supersedes_id=old_id,'1.4 version and predecessor are retained');
 PERFORM pg_temp.ok(r.lifecycle_state='active','1.5 successor is active');
 PERFORM pg_temp.ok((SELECT lifecycle_state='superseded' FROM public.sp_claims WHERE id=old_id),'1.6 predecessor is superseded');
 PERFORM pg_temp.ok((SELECT count(*)=1 FROM public.sp_claims WHERE id=old_id),'1.7 predecessor remains as history');
 PERFORM pg_temp.ok((SELECT credential_reference='CERT-1001' FROM public.sp_claims WHERE id=old_id),'1.8 predecessor retains its own fields');
END $$;

\echo '    GROUP 2 -- personal replacement is allowed; definition replacement is not'
DO $$ DECLARE h uuid:='f6b00000-0000-0000-0000-000000000001'; old_id uuid; new_id uuid; BEGIN
 old_id:=pg_temp.governed_claim(h,'INTL_ASIS_CPP');
 SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claim.sub',h::text,true);
 PERFORM pg_temp.must_fail(format('SELECT public.sp_correct_claim(%L,''Physical Security Professional (PSP)'',''ASIS International'',NULL,NULL,NULL,NULL,''switch'',''INTL_ASIS_PSP'',NULL,NULL)',old_id),'SP_DEFINITION_IMMUTABLE','2.1 even another approved definition cannot replace this claim definition');
 new_id:=pg_temp.correct_personal(old_id,'CERT-3003');
 PERFORM pg_temp.ok((SELECT credential_reference='CERT-3003' FROM public.sp_claims WHERE id=new_id),'2.2 personal reference can be updated');
 PERFORM pg_temp.ok((SELECT holder_note IS NULL FROM public.sp_claims WHERE id=new_id),'2.3 unapproved holder note stays absent');
 PERFORM pg_temp.must_fail(format('SELECT public.sp_correct_claim(%L,''x'',NULL,NULL,NULL,NULL,NULL,''invent'',''NOTREAL'',NULL,NULL)',new_id),'SP_DEFINITION_IMMUTABLE','2.4 correction cannot invent a definition');
 PERFORM pg_temp.must_fail(format('SELECT public.sp_correct_claim(%L,''Certified Protection Professional (CPP)'',''Fake issuer'',NULL,NULL,NULL,NULL,''issuer'',''INTL_ASIS_CPP'',NULL,NULL)',new_id),'SP_GOVERNED_METADATA_IMMUTABLE','2.5 correction cannot redefine the issuer');
 RESET ROLE;
END $$;

\echo '    GROUP 3 -- material personal correction resets verification'
DO $$ DECLARE h uuid:='f6b00000-0000-0000-0000-000000000001'; old_id uuid; new_id uuid; r public.sp_claims%ROWTYPE; detail jsonb; BEGIN
 old_id:=pg_temp.governed_claim(h,'OV','verified','DNR-4004');
 SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claim.sub',h::text,true);
 new_id:=pg_temp.correct_personal(old_id,'DNR-9999'); RESET ROLE;
 SELECT * INTO r FROM public.sp_claims WHERE id=new_id;
 PERFORM pg_temp.ok(r.assertion_level='self_declared','3.1 material correction resets trust');
 PERFORM pg_temp.ok(r.verified_by_user_id IS NULL AND r.verified_at IS NULL,'3.2 verifier attribution cannot transfer');
 PERFORM pg_temp.ok(r.assertion_level<>'verified','3.3 successor must be reviewed again');
 SELECT e.detail INTO detail FROM public.sp_passport_events e WHERE subject_id=new_id AND event_type='claim_corrected';
 PERFORM pg_temp.ok((detail->>'verification_reset')::boolean,'3.4 audit records verification reset');
 PERFORM pg_temp.ok(detail->>'previous_assertion_level'='verified','3.5 audit records previous trust');
END $$;

\echo '    GROUP 4 -- governed scope and unapproved notes cannot be corrected'
DO $$ DECLARE h uuid:='f6b00000-0000-0000-0000-000000000001'; old_id uuid; new_id uuid; r public.sp_claims%ROWTYPE; BEGIN
 old_id:=pg_temp.governed_claim(h,'OV','verified','DNR-5005');
 SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claim.sub',h::text,true);
 PERFORM pg_temp.must_fail(format('SELECT public.sp_correct_claim(%L,''Ordningsvaktsförordnande'',''Polismyndigheten'',''SE'',NULL,NULL,''2030-01-01'',''note'',''OV'',''DNR-5005'',''unapproved note'')',old_id),'SP_GOVERNED_METADATA_IMMUTABLE','4.1 candidate cannot add an unapproved note');
 PERFORM pg_temp.must_fail(format('UPDATE public.sp_claims SET authorisation_scope=''custom scope'' WHERE id=%L',old_id),'SP_GOVERNED_METADATA_IMMUTABLE','4.2 candidate cannot change governed scope');
 new_id:=pg_temp.correct_personal(old_id,'DNR-5005'); RESET ROLE;
 SELECT * INTO r FROM public.sp_claims WHERE id=new_id;
 PERFORM pg_temp.ok(r.assertion_level='verified' AND r.verified_by_user_id='f6b00000-0000-0000-0000-000000000009'::uuid AND r.verified_at IS NOT NULL,'4.3 identical facts retain their legitimate attributed legacy decision');
 PERFORM pg_temp.ok(r.holder_note IS NULL AND r.authorisation_scope IS NULL,'4.4 denied metadata never reaches the successor');
END $$;

\echo '    GROUP 5 -- documentation does not transfer across material correction'
DO $$ DECLARE h uuid:='f6b00000-0000-0000-0000-000000000001'; old_id uuid; new_id uuid; BEGIN
 old_id:=pg_temp.governed_claim(h,'INTL_ASIS_CPP','document_provided');
 SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claim.sub',h::text,true);
 new_id:=pg_temp.correct_personal(old_id,'NEW'); RESET ROLE;
 PERFORM pg_temp.ok((SELECT assertion_level='self_declared' FROM public.sp_claims WHERE id=new_id),'5.1 document-provided does not follow material correction');
 PERFORM pg_temp.ok((SELECT assertion_level='document_provided' FROM public.sp_claims WHERE id=old_id),'5.2 historical documentation status remains on its original version');
END $$;

\echo '    GROUP 6 -- no holder command can assign approved trust'
DO $$ DECLARE h uuid:='f6b00000-0000-0000-0000-000000000001'; old_id uuid; new_id uuid; args text; BEGIN
 old_id:=pg_temp.governed_claim(h,'INTL_ASIS_PSP');
 SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claim.sub',h::text,true);
 new_id:=pg_temp.correct_personal(old_id,'NEW');
 PERFORM pg_temp.ok((SELECT assertion_level='self_declared' FROM public.sp_claims WHERE id=new_id),'6.1 correction never raises trust');
 SELECT pg_get_function_arguments(p.oid) INTO args FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='sp_correct_claim';
 PERFORM pg_temp.ok(position('assertion' IN args)=0,'6.2 correction exposes no assertion-level argument');
 PERFORM pg_temp.ok(position('verified' IN args)=0,'6.3 correction exposes no verifier attribution argument');
 PERFORM pg_temp.must_fail(format('UPDATE public.sp_claims SET assertion_level=''verified'' WHERE id=%L',new_id),'SP_TRUST_FIELD_IMMUTABLE','6.4 direct promotion remains forbidden'); RESET ROLE;
END $$;

\echo '    GROUP 7 -- ownership, stale-version and validity guards remain enforced'
DO $$ DECLARE h uuid:='f6b00000-0000-0000-0000-000000000001'; old_id uuid; new_id uuid; BEGIN
 old_id:=pg_temp.governed_claim(h,'OV');
 SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claim.sub','f6b00000-0000-0000-0000-000000000002',true);
 PERFORM pg_temp.must_fail(format('SELECT public.sp_correct_claim(%L,''stolen'',NULL,NULL,NULL,NULL,NULL,''r'',''OV'',NULL,NULL)',old_id),'SP_NOT_HOLDER','7.1 another holder cannot correct a claim');
 PERFORM set_config('request.jwt.claim.sub',h::text,true);
 new_id:=pg_temp.correct_personal(old_id,'NEW');
 PERFORM pg_temp.must_fail(format('SELECT pg_temp.correct_personal(%L,''AGAIN'')',old_id),'SP_CLAIM_NOT_CORRECTABLE','7.2 superseded history cannot be corrected again');
 PERFORM pg_temp.must_fail(format('SELECT pg_temp.correct_personal(%L,''NEW'',NULL)',new_id),'SP_CREDENTIAL_REQUIRES_VALID_UNTIL','7.3 correction cannot erase required expiry'); RESET ROLE;
END $$;
-- =============================================================================
\echo '    GROUP 8 -- audit history stays attributable and append-only'
-- =============================================================================
DO $$
DECLARE
  _h uuid := 'f6b00000-0000-0000-0000-000000000001';
  _ev uuid; _detail jsonb;
BEGIN
  SELECT id, detail INTO _ev, _detail FROM public.sp_passport_events
   WHERE holder_user_id = _h AND event_type = 'claim_corrected'
   ORDER BY occurred_at DESC LIMIT 1;

  PERFORM pg_temp.ok(_ev IS NOT NULL,
    '8.1 a correction appends an audit event');
  PERFORM pg_temp.ok(
    (SELECT actor_user_id FROM public.sp_passport_events WHERE id = _ev) = _h,
    '8.2 the event names the actor who made the correction');
  PERFORM pg_temp.ok(_detail ? 'supersedes' AND _detail ? 'material_change',
    '8.3 the event records what it superseded and whether the change was material');

  -- Private content must not be copied into the log, where it would outlive
  -- the correction that removed it.
  PERFORM pg_temp.ok(NOT (_detail ? 'credential_reference'),
    '8.4 the audit event does not copy the credential reference');
  PERFORM pg_temp.ok(NOT (_detail ? 'holder_note'),
    '8.5 the audit event does not copy the holder note');

  PERFORM pg_temp.must_fail(
    format('UPDATE public.sp_passport_events SET detail = ''{}''::jsonb WHERE id = %L', _ev),
    '',
    '8.6 passport events are append-only');
  PERFORM pg_temp.must_fail(
    format('DELETE FROM public.sp_passport_events WHERE id = %L', _ev),
    '',
    '8.7 passport events cannot be deleted');
END $$;

-- =============================================================================
\echo '    GROUP 9 -- the private fields are still undisclosable'
-- =============================================================================
DO $$
BEGIN
  PERFORM pg_temp.ok(
    pg_get_functiondef('public.sp_get_disclosure(text)'::regprocedure)
      !~ '(credential_reference|holder_note)',
    '9.1 sp_get_disclosure still names neither private column');
END $$;

-- Clean up this suite's own fixtures.
DELETE FROM public.sp_claims
 WHERE holder_user_id IN ('f6b00000-0000-0000-0000-000000000001',
                          'f6b00000-0000-0000-0000-000000000002');
DELETE FROM public.sp_passport_profiles
 WHERE holder_user_id = 'f6b00000-0000-0000-0000-000000000001';
\echo '    ok  9.2 suite fixtures removed'
