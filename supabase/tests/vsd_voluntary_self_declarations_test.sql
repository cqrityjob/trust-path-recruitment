-- Voluntary profile self-declarations -- executed.
--
-- Proves 20270324090000 does what it says, with synthetic fixtures only:
--
--   GROUP V1  closed by default: with no processing authorization nothing is
--             collected -- not a statement, not a document row, not a byte in
--             Storage -- for any kind, and the migration records none
--   GROUP V2  the authorization table itself: a criminal-history row cannot
--             rest on consent or omit its Art. 10 authority and period; no
--             disclosure operation exists; a row is immutable but revocable
--   GROUP V3  save, reload, change, renew: the holder's own affirmation is
--             required every time; one statement per kind; a stale screen
--             cannot renew; a signed-out or other user reaches nothing
--   GROUP V4  documents: no client ever reads the bucket directly; bytes are
--             attached only after the server's content stamp; an unfinished
--             upload can be abandoned but an attached one cannot be;
--             only where the authorization permits storing one,
--             only its permitted type, only the prepared path, bound to the
--             exact revision; a duplicate is refused; replacing or changing
--             sends the old file to erasure
--   GROUP V5  review: a Passport verifier and a platform admin are NOT
--             reviewers; an appointed reviewer sees a file only on the
--             holder's request; a review never survives a change or a
--             replacement
--   GROUP V6  withdrawal, deletion and erasure: access ends in the same
--             transaction, the file is queued, a failed cleanup stays
--             visible, and a row is reported deleted only once its object is
--             really absent
--   GROUP V7  retention and revocation end ACCESS at once -- before any
--             reconciliation, profile read or purge has run -- for the
--             holder, the reviewer, another user and a signed-out session
--   GROUP V8  account erasure queues the files and leaves no row
--   GROUP V9  isolation and privileges: no other function, view or table in
--             the database names a vsd_ object; no score, rank or free-text
--             column exists; anon executes nothing; the real rollback and a
--             clean re-apply
--
-- Every simulated JWT names a live auth.sessions row. One transaction, rolled
-- back. The suite shares one now(); V7 moves a row's retention to exercise it.

\set ON_ERROR_STOP on
SET client_min_messages TO NOTICE;

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.ok(cond boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF cond IS NOT TRUE THEN RAISE EXCEPTION 'ASSERTION FAILED: %', label; END IF;
  RAISE NOTICE 'ok  %', label;
END $$;

-- One statement as a signed-in user, through the authenticated role, with a
-- JWT naming their live session (or, with _live = false, one that does not
-- exist). Returns the first column of the first row as text, 'rows:<n>' for a
-- statement that returns nothing, or 'err:<message>'.
CREATE OR REPLACE FUNCTION pg_temp.run(_uid uuid, _sql text, _live boolean DEFAULT true)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE _r text; _n bigint;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', _uid, 'role', 'authenticated',
                      'session_id', CASE WHEN _live THEN _uid ELSE gen_random_uuid() END)::text, true);
  PERFORM set_config('request.jwt.claim.sub', _uid::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    IF _sql ~* '^\s*(select|with)\M' THEN
      EXECUTE _sql INTO _r;
    ELSE
      EXECUTE _sql;
      GET DIAGNOSTICS _n = ROW_COUNT;
      _r := 'rows:' || _n;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    _r := 'err:' || SQLERRM;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RETURN _r;
END $$;

-- The holder's own payload for one kind, read the way the screen reads it.
CREATE OR REPLACE FUNCTION pg_temp.decl(_uid uuid, _kind text) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE _all jsonb := pg_temp.run(_uid, 'SELECT public.vsd_my_declarations()::text')::jsonb;
BEGIN
  RETURN (SELECT e FROM jsonb_array_elements(_all -> 'declarations') e
           WHERE e ->> 'kind' = _kind ORDER BY e ->> 'status' LIMIT 1);
END $$;

CREATE OR REPLACE FUNCTION pg_temp.save(_uid uuid, _kind text, _version text, _expected integer,
                                        _date date DEFAULT current_date) RETURNS text
LANGUAGE sql AS $$
  SELECT pg_temp.run(_uid, format(
    'SELECT public.vsd_save_declaration(%L, ''SE'', %L, %L, true, %s)::text',
    _kind, _version, _date, coalesce(_expected::text, 'NULL')))
$$;

CREATE OR REPLACE FUNCTION pg_temp.begin_doc(_uid uuid, _doc uuid, _decl uuid, _rev integer,
                                             _type text, _sha text) RETURNS text
LANGUAGE sql AS $$
  SELECT pg_temp.run(_uid, format(
    'SELECT public.vsd_begin_document(%L, %L, %s, %L, current_date - 3, ''SYNTHETIC-fixture.pdf'', ''application/pdf'', 1024, %L)::text',
    _doc, _decl, _rev, _type, _sha))
$$;

CREATE OR REPLACE FUNCTION pg_temp.put(_uid uuid, _path text) RETURNS text
LANGUAGE sql AS $$
  SELECT pg_temp.run(_uid, format(
    'INSERT INTO storage.objects (bucket_id, name) VALUES (''self-declaration-documents'', %L)', _path))
$$;

-- The server's content verification, as the service role would record it
-- after reading the object back: this row's own declared values.
CREATE OR REPLACE FUNCTION pg_temp.stamp(_doc uuid) RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.vsd_stamp_document_content(x.id, x.holder_user_id, x.size_bytes, x.sha256, x.mime_type)
     FROM public.vsd_documents x WHERE x.id = _doc;
  RETURN 'ok';
EXCEPTION WHEN OTHERS THEN RETURN 'err:' || SQLERRM;
END $$;

-- Whether the application server would be allowed to deliver the bytes to
-- this caller right now. This is the ONLY way to a document.
CREATE OR REPLACE FUNCTION pg_temp.can_open(_uid uuid, _doc uuid, _live boolean DEFAULT true) RETURNS boolean
LANGUAGE sql AS $$
  SELECT pg_temp.run(_uid, format('SELECT public.vsd_authorize_document_read(%L)::text', _doc), _live)
         NOT LIKE 'err:%'
$$;

-- A direct Storage read (what a download, a listing or a signed link needs).
CREATE OR REPLACE FUNCTION pg_temp.can_read(_uid uuid, _path text) RETURNS boolean
LANGUAGE sql AS $$
  SELECT pg_temp.run(_uid, format(
    'SELECT count(*)::text FROM storage.objects WHERE bucket_id = ''self-declaration-documents'' AND name = %L',
    _path)) = '1'
$$;

-- A table read made AFTER a mutation in the same assertion. A plain subquery
-- would run on the statement's own snapshot and miss what a function called
-- earlier in that statement just wrote; a volatile function reads afresh.
CREATE OR REPLACE FUNCTION pg_temp.q(_sql text) RETURNS boolean
LANGUAGE plpgsql VOLATILE AS $$
DECLARE _r boolean;
BEGIN
  EXECUTE 'SELECT (' || _sql || ')' INTO _r;
  RETURN _r;
END $$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO PUBLIC;

-- ── Fixtures (synthetic) ──────────────────────────────────────────────────
--   a1 holder A          a2 holder B (the other user)
--   a3 Passport verifier a4 platform admin      a5 appointed reviewer
--   a6 holder erased with their account

INSERT INTO auth.users (id, email, email_confirmed_at, raw_user_meta_data) VALUES
  ('5e000000-0000-4000-8000-0000000000a1', 'vsd-holder-a@test.invalid', now(), '{}'),
  ('5e000000-0000-4000-8000-0000000000a2', 'vsd-holder-b@test.invalid', now(), '{}'),
  ('5e000000-0000-4000-8000-0000000000a3', 'vsd-verifier@test.invalid', now(), '{}'),
  ('5e000000-0000-4000-8000-0000000000a4', 'vsd-admin@test.invalid', now(), '{}'),
  ('5e000000-0000-4000-8000-0000000000a5', 'vsd-reviewer@test.invalid', now(), '{}'),
  ('5e000000-0000-4000-8000-0000000000a6', 'vsd-erased@test.invalid', now(), '{}');
INSERT INTO auth.sessions (id, user_id)
SELECT id, id FROM auth.users WHERE email LIKE 'vsd-%@test.invalid';
INSERT INTO public.user_roles (user_id, role) VALUES
  ('5e000000-0000-4000-8000-0000000000a3', 'passport_verifier'),
  ('5e000000-0000-4000-8000-0000000000a4', 'admin');

\set A '''5e000000-0000-4000-8000-0000000000a1'''
\set B '''5e000000-0000-4000-8000-0000000000a2'''
\set VERIFIER '''5e000000-0000-4000-8000-0000000000a3'''
\set ADMIN '''5e000000-0000-4000-8000-0000000000a4'''
\set REVIEWER '''5e000000-0000-4000-8000-0000000000a5'''
\set ERASED '''5e000000-0000-4000-8000-0000000000a6'''

-- ══ GROUP V1 · closed by default ══════════════════════════════════════════

SELECT pg_temp.ok((SELECT count(*) = 0 FROM public.vsd_processing_authorizations),
  'V1.1 the migration records no processing authorization');
SELECT pg_temp.ok(
  pg_temp.save(:A, 'enforcement_debt_none', 'se-enforcement-v1', NULL) = 'err:VSD_PROCESSING_NOT_AUTHORIZED'
  AND pg_temp.save(:A, 'payment_remarks_none', 'se-remarks-v1', NULL) = 'err:VSD_PROCESSING_NOT_AUTHORIZED',
  'V1.2 without an authorization a financial statement is refused');
SELECT pg_temp.ok(
  pg_temp.save(:A, 'criminal_history', 'se-criminal-v1', NULL) = 'err:VSD_PROCESSING_NOT_AUTHORIZED',
  'V1.3 without an authorization a criminal-history statement is refused');
SELECT pg_temp.ok((SELECT count(*) = 0 FROM public.vsd_declarations),
  'V1.4 the refusals stored nothing');
SELECT pg_temp.ok(
  pg_temp.put(:A, '5e000000-0000-4000-8000-0000000000a1/5e000000-0000-4000-8000-00000000d0c0.pdf')
    LIKE 'err:%row-level security%'
  AND NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'self-declaration-documents'),
  'V1.5 a direct Storage upload into the bucket is refused');
SELECT pg_temp.ok(
  (pg_temp.run(:A, 'SELECT public.vsd_my_declarations()::text')::jsonb)
    = '{"authorizations": [], "declarations": []}'::jsonb,
  'V1.6 the holder is told nothing is open');

-- ══ GROUP V2 · the authorization table ════════════════════════════════════

CREATE OR REPLACE FUNCTION pg_temp.auth_insert(_kind text, _basis text, _authority text, _period text,
                                               _ops text[], _types text[], _version text) RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.vsd_processing_authorizations
    (declaration_kind, jurisdiction, statement_version, operator_name, operator_registration, purpose,
     legal_basis, legal_basis_detail, assessment_reference, offence_data_authority, statement_period,
     retention_days, permitted_operations, permitted_document_types, approved_by_name, approved_on)
  VALUES (_kind, 'SE', _version, 'SYNTHETIC Operator AB', 'SYNTHETIC-000000-0000',
          'SYNTHETIC fixture purpose for the automated suite only.',
          _basis, 'SYNTHETIC fixture basis for the automated suite only.', 'SYNTHETIC-ASSESSMENT-1',
          _authority, _period, 180, _ops, _types, 'SYNTHETIC Approver', current_date);
  RETURN 'ok';
EXCEPTION WHEN OTHERS THEN RETURN 'err:' || SQLERRM;
END $$;

SELECT pg_temp.ok(
  pg_temp.auth_insert('criminal_history', 'consent', 'SYNTHETIC national-law authority', 'SYNTHETIC last five years',
                      ARRAY['collect_declaration'], '{}', 'se-criminal-v1')
    LIKE 'err:%vsd_auth_criminal_needs_reviewed_basis%',
  'V2.1 a criminal-history authorization cannot rest on consent');
SELECT pg_temp.ok(
  pg_temp.auth_insert('criminal_history', 'legal_obligation', NULL, 'SYNTHETIC last five years',
                      ARRAY['collect_declaration'], '{}', 'se-criminal-v1')
    LIKE 'err:%vsd_auth_criminal_needs_reviewed_basis%'
  AND pg_temp.auth_insert('criminal_history', 'legal_obligation', 'SYNTHETIC national-law authority', NULL,
                      ARRAY['collect_declaration'], '{}', 'se-criminal-v1')
    LIKE 'err:%vsd_auth_criminal_needs_reviewed_basis%',
  'V2.2 a criminal-history authorization must name its Art. 10 authority and its period');
SELECT pg_temp.ok(
  pg_temp.auth_insert('payment_remarks_none', 'consent', NULL, NULL,
                      ARRAY['collect_declaration', 'disclose_to_employer'], '{}', 'se-remarks-v1')
    LIKE 'err:%vsd_auth_operations_known%',
  'V2.3 no disclosure operation can be authorized');
SELECT pg_temp.ok(
  pg_temp.auth_insert('payment_remarks_none', 'consent', NULL, NULL,
                      ARRAY['collect_declaration', 'store_document'], ARRAY['police_extract'], 'se-remarks-v1')
    LIKE 'err:%vsd_auth_document_types_match_kind%',
  'V2.4 a document type belongs to its own kind only');
SELECT pg_temp.ok(
  pg_temp.auth_insert('payment_remarks_none', 'consent', NULL, NULL,
                      ARRAY['collect_declaration'], ARRAY['credit_report'], 'se-remarks-v1')
    LIKE 'err:%vsd_auth_document_types_iff_storage%',
  'V2.5 a document type without the storage operation is refused');

-- The synthetic authorizations the rest of the suite runs under:
--   enforcement: collect + store + human review     remarks: collect only
SELECT pg_temp.ok(
  pg_temp.auth_insert('enforcement_debt_none', 'consent', NULL, NULL,
                      ARRAY['collect_declaration', 'store_document', 'human_document_review'],
                      ARRAY['enforcement_authority_statement'], 'se-enforcement-v1') = 'ok'
  AND pg_temp.auth_insert('payment_remarks_none', 'consent', NULL, NULL,
                      ARRAY['collect_declaration'], '{}', 'se-remarks-v1') = 'ok',
  'V2.6 a complete authorization is accepted');
SELECT pg_temp.ok(
  pg_temp.auth_insert('payment_remarks_none', 'consent', NULL, NULL,
                      ARRAY['collect_declaration'], '{}', 'se-remarks-v2') LIKE 'err:%vsd_auth_one_current_idx%',
  'V2.7 one current authorization per kind and jurisdiction');

DO $$
DECLARE _msg text;
BEGIN
  BEGIN
    UPDATE public.vsd_processing_authorizations SET retention_days = 3650
     WHERE declaration_kind = 'payment_remarks_none';
    _msg := 'updated';
  EXCEPTION WHEN OTHERS THEN _msg := SQLERRM; END;
  PERFORM pg_temp.ok(_msg = 'VSD_AUTHORIZATION_IMMUTABLE', 'V2.8 a recorded authorization cannot be edited');
  BEGIN
    DELETE FROM public.vsd_processing_authorizations WHERE declaration_kind = 'payment_remarks_none';
    _msg := 'deleted';
  EXCEPTION WHEN OTHERS THEN _msg := SQLERRM; END;
  PERFORM pg_temp.ok(_msg = 'VSD_AUTHORIZATION_IMMUTABLE', 'V2.9 a recorded authorization cannot be deleted');
END $$;

SELECT pg_temp.ok(
  pg_temp.run(:A, 'INSERT INTO public.vsd_processing_authorizations (declaration_kind) VALUES (''criminal_history'')')
    LIKE 'err:permission denied%'
  AND pg_temp.run(:ADMIN, 'SELECT count(*)::text FROM public.vsd_processing_authorizations')
    LIKE 'err:permission denied%',
  'V2.10 no client role, an administrator included, reads or writes the authorization table');

-- ══ GROUP V3 · save, reload, change, renew ════════════════════════════════

SELECT pg_temp.ok(
  pg_temp.run(:A, 'SELECT public.vsd_save_declaration(''payment_remarks_none'', ''SE'', ''se-remarks-v1'', current_date, false, NULL)::text')
    = 'err:VSD_AFFIRMATION_REQUIRED'
  AND pg_temp.run(:A, 'SELECT public.vsd_save_declaration(''payment_remarks_none'', ''SE'', ''se-remarks-v1'', current_date, NULL, NULL)::text')
    = 'err:VSD_AFFIRMATION_REQUIRED',
  'V3.1 nothing is stored without the holder''s own affirmation');
SELECT pg_temp.ok(
  pg_temp.save(:A, 'payment_remarks_none', 'se-remarks-v0', NULL) = 'err:VSD_STATEMENT_VERSION_MISMATCH',
  'V3.2 a statement version the authorization does not name is refused');
SELECT pg_temp.ok(
  pg_temp.save(:A, 'payment_remarks_none', 'se-remarks-v1', NULL, current_date + 2) = 'err:VSD_INVALID_DATE'
  AND pg_temp.save(:A, 'payment_remarks_none', 'se-remarks-v1', NULL, current_date - 32) = 'err:VSD_INVALID_DATE',
  'V3.3 a future or long-past date is refused');
SELECT pg_temp.ok(
  pg_temp.run(:A, 'SELECT public.vsd_save_declaration(''payment_remarks_none'', ''SE'', ''se-remarks-v1'', current_date, true, NULL)::text', false)
    = 'err:VSD_NOT_AUTHENTICATED',
  'V3.4 a signed-out session saves nothing');
SELECT pg_temp.ok((SELECT count(*) = 0 FROM public.vsd_declarations), 'V3.5 the refusals stored nothing');

SELECT pg_temp.ok(
  (pg_temp.save(:A, 'payment_remarks_none', 'se-remarks-v1', NULL)::jsonb)
    @> jsonb_build_object('status', 'active', 'revision', 1, 'provenance', 'self_declared',
                          'asOfDate', current_date, 'document', NULL, 'erasures', '[]'::jsonb),
  'V3.6 a statement is saved as self-declared, at revision 1');
SELECT pg_temp.ok(
  pg_temp.decl(:A, 'payment_remarks_none')
    @> jsonb_build_object('status', 'active', 'revision', 1, 'statementVersion', 'se-remarks-v1'),
  'V3.7 a reload returns the saved statement');
SELECT pg_temp.ok(
  pg_temp.save(:A, 'payment_remarks_none', 'se-remarks-v1', NULL) = 'err:VSD_DECLARATION_EXISTS'
  AND (SELECT count(*) = 1 FROM public.vsd_declarations),
  'V3.8 a second save does not create a duplicate');
SELECT pg_temp.ok(
  pg_temp.save(:A, 'payment_remarks_none', 'se-remarks-v1', 7) = 'err:VSD_STALE_REVISION',
  'V3.9 a stale screen cannot change or renew');
SELECT pg_temp.ok(
  (pg_temp.save(:A, 'payment_remarks_none', 'se-remarks-v1', 1, current_date - 1)::jsonb)
    @> jsonb_build_object('revision', 2, 'asOfDate', current_date - 1, 'status', 'active'),
  'V3.10 a change or renewal moves the revision');
SELECT pg_temp.ok(
  pg_temp.decl(:B, 'payment_remarks_none') IS NULL
  AND pg_temp.run(:B, 'SELECT count(*)::text FROM public.vsd_declarations') LIKE 'err:permission denied%',
  'V3.11 another user sees nothing of it');
SELECT pg_temp.ok(
  pg_temp.run(:B, format('SELECT public.vsd_withdraw_declaration(%L)::text',
                         (SELECT id FROM public.vsd_declarations LIMIT 1))) = 'err:VSD_DECLARATION_NOT_FOUND'
  AND pg_temp.run(:B, format('SELECT public.vsd_delete_declaration(%L)::text',
                         (SELECT id FROM public.vsd_declarations LIMIT 1))) = 'err:VSD_DECLARATION_NOT_FOUND'
  AND (SELECT status = 'active' FROM public.vsd_declarations),
  'V3.12 another user can neither withdraw nor delete it');
SELECT pg_temp.ok(
  (pg_temp.save(:B, 'payment_remarks_none', 'se-remarks-v1', NULL)::jsonb) ->> 'revision' = '1',
  'V3.13 each holder has their own statement');

-- ══ GROUP V4 · documents ══════════════════════════════════════════════════

CREATE TEMP TABLE ids (k text PRIMARY KEY, v uuid);
GRANT ALL ON ids TO PUBLIC;
INSERT INTO ids VALUES ('remarks_a', (SELECT id FROM public.vsd_declarations
                                       WHERE holder_user_id = :A AND declaration_kind = 'payment_remarks_none'));

SELECT pg_temp.ok(
  pg_temp.begin_doc(:A, '5e000000-0000-4000-8000-00000000d001', (SELECT v FROM ids WHERE k = 'remarks_a'), 2,
                    'credit_report', repeat('a', 64)) = 'err:VSD_PROCESSING_NOT_AUTHORIZED'
  AND (SELECT count(*) = 0 FROM public.vsd_documents),
  'V4.1 no document row where the authorization does not permit storing one');

INSERT INTO ids VALUES ('enf_a',
  ((pg_temp.save(:A, 'enforcement_debt_none', 'se-enforcement-v1', NULL)::jsonb) ->> 'id')::uuid);

SELECT pg_temp.ok(
  pg_temp.begin_doc(:A, '5e000000-0000-4000-8000-00000000d001', (SELECT v FROM ids WHERE k = 'enf_a'), 1,
                    'credit_report', repeat('a', 64)) = 'err:VSD_PROCESSING_NOT_AUTHORIZED',
  'V4.2 a document type the authorization does not permit is refused');
SELECT pg_temp.ok(
  pg_temp.begin_doc(:A, '5e000000-0000-4000-8000-00000000d001', (SELECT v FROM ids WHERE k = 'enf_a'), 9,
                    'enforcement_authority_statement', repeat('a', 64)) = 'err:VSD_STALE_REVISION',
  'V4.3 a document cannot be begun for a revision that is not current');
SELECT pg_temp.ok(
  pg_temp.begin_doc(:B, '5e000000-0000-4000-8000-00000000d001', (SELECT v FROM ids WHERE k = 'enf_a'), 1,
                    'enforcement_authority_statement', repeat('a', 64)) = 'err:VSD_DECLARATION_NOT_FOUND',
  'V4.4 another user cannot begin a document on it');
SELECT pg_temp.ok(
  (pg_temp.begin_doc(:A, '5e000000-0000-4000-8000-00000000d001', (SELECT v FROM ids WHERE k = 'enf_a'), 1,
                     'enforcement_authority_statement', repeat('a', 64))::jsonb)
    @> jsonb_build_object('status', 'prepared', 'declarationRevision', 1,
         'documentType', 'enforcement_authority_statement', 'jurisdiction', 'SE',
         'issueDate', current_date - 3,
         'storagePath', '5e000000-0000-4000-8000-0000000000a1/5e000000-0000-4000-8000-00000000d001.pdf'),
  'V4.5 an upload is prepared with its type, jurisdiction, issue date and exact revision');
SELECT pg_temp.ok(
  pg_temp.decl(:A, 'enforcement_debt_none') ->> 'provenance' = 'self_declared',
  'V4.6 a prepared upload is not "document provided"');
SELECT pg_temp.ok(
  pg_temp.run(:A, 'SELECT public.vsd_attach_document(''5e000000-0000-4000-8000-00000000d001'')::text')
    = 'err:VSD_OBJECT_NOT_FOUND',
  'V4.7 a document cannot be attached before its bytes exist');
SELECT pg_temp.ok(
  pg_temp.put(:B, '5e000000-0000-4000-8000-0000000000a1/5e000000-0000-4000-8000-00000000d001.pdf')
    LIKE 'err:%row-level security%'
  AND pg_temp.put(:A, '5e000000-0000-4000-8000-0000000000a1/5e000000-0000-4000-8000-00000000d0ff.pdf')
    LIKE 'err:%row-level security%'
  AND pg_temp.run(:A, 'INSERT INTO storage.objects (bucket_id, name) VALUES (''self-declaration-documents'', ''5e000000-0000-4000-8000-0000000000a1/5e000000-0000-4000-8000-00000000d001.pdf'')', false)
    LIKE 'err:%row-level security%',
  'V4.8 only the holder, signed in, can upload, and only to the prepared path');
SELECT pg_temp.ok(
  pg_temp.put(:A, '5e000000-0000-4000-8000-0000000000a1/5e000000-0000-4000-8000-00000000d001.pdf') = 'rows:1',
  'V4.9 the holder uploads the prepared document');
SELECT pg_temp.ok(
  pg_temp.run(:A, 'SELECT public.vsd_attach_document(''5e000000-0000-4000-8000-00000000d001'')::text') = 'err:VSD_CONTENT_UNVERIFIED',
  'V4.9a uploaded bytes cannot be attached until the server has verified them');
SELECT pg_temp.ok(
  pg_temp.run(:A, 'SELECT public.vsd_stamp_document_content(''5e000000-0000-4000-8000-00000000d001'', ''5e000000-0000-4000-8000-0000000000a1'', 1024, repeat(''a'', 64), ''application/pdf'')')
    LIKE 'err:permission denied%'
  AND NOT has_function_privilege('authenticated', 'public.vsd_stamp_document_content(uuid,uuid,integer,text,text)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.vsd_stamp_document_content(uuid,uuid,integer,text,text)', 'EXECUTE'),
  'V4.9b no client can vouch for its own bytes: the content stamp is for the service role only');
DO $$
DECLARE _msg text;
BEGIN
  BEGIN
    PERFORM public.vsd_stamp_document_content('5e000000-0000-4000-8000-00000000d001', '5e000000-0000-4000-8000-0000000000a1', 1024, repeat('9', 64), 'application/pdf');
    _msg := 'stamped';
  EXCEPTION WHEN OTHERS THEN _msg := SQLERRM; END;
  PERFORM pg_temp.ok(_msg = 'VSD_CONTENT_MISMATCH', 'V4.9c bytes whose real hash differs from the declared one are not stamped');
  BEGIN
    PERFORM public.vsd_stamp_document_content('5e000000-0000-4000-8000-00000000d001', '5e000000-0000-4000-8000-0000000000a2', 1024, repeat('a', 64), 'application/pdf');
    _msg := 'stamped';
  EXCEPTION WHEN OTHERS THEN _msg := SQLERRM; END;
  PERFORM pg_temp.ok(_msg = 'VSD_DOCUMENT_NOT_FOUND', 'V4.9d a stamp for another holder is refused');
END $$;
SELECT pg_temp.ok(
  pg_temp.run(:A, 'SELECT public.vsd_attach_document(''5e000000-0000-4000-8000-00000000d001'')::text') = 'err:VSD_CONTENT_UNVERIFIED'
  AND pg_temp.stamp('5e000000-0000-4000-8000-00000000d001') = 'ok',
  'V4.9e the server stamps the content it verified');
SELECT pg_temp.ok(
  (pg_temp.run(:A, 'SELECT public.vsd_attach_document(''5e000000-0000-4000-8000-00000000d001'')::text')::jsonb)
    ->> 'status' = 'attached'
  AND pg_temp.decl(:A, 'enforcement_debt_none') ->> 'provenance' = 'document_provided'
  AND pg_temp.decl(:A, 'enforcement_debt_none') -> 'document' ->> 'declarationRevision' = '1',
  'V4.10 an attached document makes the statement "document provided", at that revision');
SELECT pg_temp.ok(
  pg_temp.can_open(:A, '5e000000-0000-4000-8000-00000000d001')
  AND NOT pg_temp.can_open(:B, '5e000000-0000-4000-8000-00000000d001')
  AND NOT pg_temp.can_open(:ADMIN, '5e000000-0000-4000-8000-00000000d001')
  AND NOT pg_temp.can_open(:VERIFIER, '5e000000-0000-4000-8000-00000000d001')
  AND NOT pg_temp.can_open(:A, '5e000000-0000-4000-8000-00000000d001', false),
  'V4.11 only the holder, signed in, is authorized to open the file: not another user, an administrator or a Passport verifier');
SELECT pg_temp.ok(
  NOT pg_temp.can_read(:A, '5e000000-0000-4000-8000-0000000000a1/5e000000-0000-4000-8000-00000000d001.pdf')
  AND NOT pg_temp.can_read(:B, '5e000000-0000-4000-8000-0000000000a1/5e000000-0000-4000-8000-00000000d001.pdf')
  AND NOT pg_temp.can_read(:ADMIN, '5e000000-0000-4000-8000-0000000000a1/5e000000-0000-4000-8000-00000000d001.pdf')
  AND pg_temp.run(:A, 'SELECT count(*)::text FROM storage.objects WHERE bucket_id = ''self-declaration-documents''') = '0'
  AND (SELECT count(*) = 1 FROM storage.objects WHERE bucket_id = 'self-declaration-documents'),
  'V4.11a no client reads the bucket directly -- not even the holder -- so Storage can neither serve nor sign the object');
SELECT pg_temp.ok(
  (pg_temp.run(:A, 'SELECT public.vsd_abandon_upload(''5e000000-0000-4000-8000-00000000d001'')::text')::jsonb) = '{"status": "attached"}'::jsonb
  AND pg_temp.q($q$SELECT status = 'attached' FROM public.vsd_documents WHERE id = '5e000000-0000-4000-8000-00000000d001'$q$)
  AND pg_temp.q($q$SELECT count(*) = 0 FROM public.storage_erasure_queue WHERE bucket_id = 'self-declaration-documents'$q$),
  'V4.11b abandoning an upload never touches a document that was in fact attached');
SELECT pg_temp.ok(
  (pg_temp.run(:A, 'SELECT public.vsd_upload_state(''5e000000-0000-4000-8000-00000000d001'')::text')::jsonb)
    @> '{"status": "attached", "bytesMatched": true, "declarationRevision": 1}'::jsonb
  AND (pg_temp.run(:B, 'SELECT public.vsd_upload_state(''5e000000-0000-4000-8000-00000000d001'')::text')::jsonb) = '{"status": "absent"}'::jsonb
  AND (pg_temp.begin_doc(:A, '5e000000-0000-4000-8000-00000000d001', (SELECT v FROM ids WHERE k = 'enf_a'), 1,
                         'enforcement_authority_statement', repeat('a', 64))::jsonb) ->> 'status' = 'attached',
  'V4.11c a retry of a completed upload finds it attached, and another user finds nothing');
SELECT pg_temp.ok(
  pg_temp.run(:A, 'UPDATE storage.objects SET name = name || ''x'' WHERE bucket_id = ''self-declaration-documents''') = 'rows:0'
  AND pg_temp.run(:A, 'DELETE FROM storage.objects WHERE bucket_id = ''self-declaration-documents''') = 'rows:0'
  AND (SELECT count(*) = 1 FROM storage.objects WHERE bucket_id = 'self-declaration-documents'),
  'V4.12 no client can overwrite or delete an object directly');
SELECT pg_temp.ok(
  pg_temp.begin_doc(:A, '5e000000-0000-4000-8000-00000000d002', (SELECT v FROM ids WHERE k = 'enf_a'), 1,
                    'enforcement_authority_statement', repeat('a', 64)) = 'err:VSD_DOCUMENT_DUPLICATE',
  'V4.13 the same file is not attached twice');
SELECT pg_temp.ok(
  pg_temp.begin_doc(:A, '5e000000-0000-4000-8000-00000000d001', (SELECT v FROM ids WHERE k = 'enf_a'), 1,
                    'enforcement_authority_statement', repeat('b', 64)) = 'err:VSD_UPLOAD_INTENT_MISMATCH',
  'V4.14 an upload id cannot be reused for different bytes');

-- Replacement.
SELECT pg_temp.ok(
  (pg_temp.begin_doc(:A, '5e000000-0000-4000-8000-00000000d002', (SELECT v FROM ids WHERE k = 'enf_a'), 1,
                     'enforcement_authority_statement', repeat('b', 64))::jsonb) ->> 'status' = 'prepared'
  AND pg_temp.put(:A, '5e000000-0000-4000-8000-0000000000a1/5e000000-0000-4000-8000-00000000d002.pdf') = 'rows:1'
  AND pg_temp.stamp('5e000000-0000-4000-8000-00000000d002') = 'ok'
  AND (pg_temp.run(:A, 'SELECT public.vsd_attach_document(''5e000000-0000-4000-8000-00000000d002'')::text')::jsonb)
        ->> 'status' = 'attached',
  'V4.15 a replacement document is attached');
SELECT pg_temp.ok(
  (SELECT status = 'erasure_pending' FROM public.vsd_documents WHERE id = '5e000000-0000-4000-8000-00000000d001')
  AND (SELECT count(*) = 1 FROM public.storage_erasure_queue
        WHERE bucket_id = 'self-declaration-documents' AND completed_at IS NULL
          AND object_path = '5e000000-0000-4000-8000-0000000000a1/5e000000-0000-4000-8000-00000000d001.pdf'
          AND reason = 'self_declaration_document_replaced'
          AND subject_user_id = :A)
  AND NOT pg_temp.can_open(:A, '5e000000-0000-4000-8000-00000000d001'),
  'V4.16 the replaced file is queued for erasure and can no longer be opened, in the same transaction');
SELECT pg_temp.ok(
  pg_temp.put(:A, '5e000000-0000-4000-8000-0000000000a1/5e000000-0000-4000-8000-00000000d001.pdf')
    LIKE 'err:%row-level security%',
  'V4.17 nothing can be uploaded to a path that is owed to erasure');

-- ══ GROUP V5 · review ═════════════════════════════════════════════════════

SELECT pg_temp.ok(
  pg_temp.decl(:A, 'enforcement_debt_none') ->> 'reviewAvailable' = 'false'
  AND pg_temp.run(:A, 'SELECT public.vsd_set_document_review_request(''5e000000-0000-4000-8000-00000000d002'', true)::text')
    = 'err:VSD_REVIEW_UNAVAILABLE',
  'V5.1 with no appointed reviewer a review cannot be requested');

INSERT INTO public.vsd_document_reviewers (user_id, authorization_id, appointed_by_name, appointed_on)
SELECT :REVIEWER, id, 'SYNTHETIC Appointer', current_date
  FROM public.vsd_processing_authorizations WHERE declaration_kind = 'enforcement_debt_none';

SELECT pg_temp.ok(
  pg_temp.run(:REVIEWER, 'SELECT public.vsd_reviewer_queue()::text') = '[]'
  AND NOT pg_temp.can_open(:REVIEWER, '5e000000-0000-4000-8000-00000000d002')
  AND pg_temp.run(:REVIEWER, 'SELECT public.vsd_reviewer_record_review(''5e000000-0000-4000-8000-00000000d002'', 1, ''matches_declared_details'')::text')
    = 'err:VSD_DOCUMENT_NOT_FOUND',
  'V5.2 an appointed reviewer sees and decides nothing the holder has not asked to have reviewed');
SELECT pg_temp.ok(
  (pg_temp.run(:A, 'SELECT public.vsd_set_document_review_request(''5e000000-0000-4000-8000-00000000d002'', true)::text')::jsonb)
    ->> 'reviewRequestedAt' IS NOT NULL,
  'V5.3 the holder asks for a review');
SELECT pg_temp.ok(
  pg_temp.run(:VERIFIER, 'SELECT public.vsd_reviewer_queue()::text') = '[]'
  AND pg_temp.run(:ADMIN, 'SELECT public.vsd_reviewer_queue()::text') = '[]'
  AND NOT pg_temp.can_open(:VERIFIER, '5e000000-0000-4000-8000-00000000d002')
  AND NOT pg_temp.can_open(:ADMIN, '5e000000-0000-4000-8000-00000000d002')
  AND pg_temp.run(:VERIFIER, 'SELECT public.vsd_reviewer_record_review(''5e000000-0000-4000-8000-00000000d002'', 1, ''matches_declared_details'')::text')
    = 'err:VSD_DOCUMENT_NOT_FOUND'
  AND pg_temp.run(:ADMIN, 'SELECT public.vsd_reviewer_record_review(''5e000000-0000-4000-8000-00000000d002'', 1, ''matches_declared_details'')::text')
    = 'err:VSD_DOCUMENT_NOT_FOUND',
  'V5.4 a Passport verifier and a platform admin are not reviewers here');
SELECT pg_temp.ok(
  jsonb_array_length(pg_temp.run(:REVIEWER, 'SELECT public.vsd_reviewer_queue()::text')::jsonb) = 1
  AND pg_temp.can_open(:REVIEWER, '5e000000-0000-4000-8000-00000000d002')
  AND NOT pg_temp.can_open(:REVIEWER, '5e000000-0000-4000-8000-00000000d001')
  AND NOT pg_temp.can_open(:REVIEWER, '5e000000-0000-4000-8000-00000000d002', false)
  AND NOT pg_temp.can_read(:REVIEWER, '5e000000-0000-4000-8000-0000000000a1/5e000000-0000-4000-8000-00000000d002.pdf'),
  'V5.5 the appointed reviewer sees the requested document, and only that one');
SELECT pg_temp.ok(
  pg_temp.run(:REVIEWER, 'SELECT public.vsd_reviewer_record_review(''5e000000-0000-4000-8000-00000000d002'', 4, ''matches_declared_details'')::text')
    = 'err:VSD_STALE_REVISION'
  AND pg_temp.run(:REVIEWER, 'SELECT public.vsd_reviewer_record_review(''5e000000-0000-4000-8000-00000000d002'', 1, ''clean_record'')::text')
    = 'err:VSD_INVALID_INPUT',
  'V5.6 a review names the revision it saw, and has no "clean record" outcome');
SELECT pg_temp.ok(
  pg_temp.run(:REVIEWER, 'SELECT public.vsd_reviewer_record_review(''5e000000-0000-4000-8000-00000000d002'', 1, ''matches_declared_details'')::text')
    NOT LIKE 'err:%'
  AND pg_temp.decl(:A, 'enforcement_debt_none') ->> 'provenance' = 'document_reviewed',
  'V5.7 a recorded review makes the statement "document reviewed"');
SELECT pg_temp.ok(
  pg_temp.run(:REVIEWER, 'SELECT public.vsd_reviewer_record_review(''5e000000-0000-4000-8000-00000000d002'', 1, ''not_confirmed'')::text')
    = 'err:VSD_ALREADY_REVIEWED',
  'V5.8 a document is reviewed once');

-- Replacing the document: the old review is not inherited.
SELECT pg_temp.ok(
  (pg_temp.begin_doc(:A, '5e000000-0000-4000-8000-00000000d003', (SELECT v FROM ids WHERE k = 'enf_a'), 1,
                     'enforcement_authority_statement', repeat('c', 64))::jsonb) ->> 'status' = 'prepared'
  AND pg_temp.put(:A, '5e000000-0000-4000-8000-0000000000a1/5e000000-0000-4000-8000-00000000d003.pdf') = 'rows:1'
  AND pg_temp.stamp('5e000000-0000-4000-8000-00000000d003') = 'ok'
  AND (pg_temp.run(:A, 'SELECT public.vsd_attach_document(''5e000000-0000-4000-8000-00000000d003'')::text')::jsonb)
        ->> 'status' = 'attached'
  AND pg_temp.decl(:A, 'enforcement_debt_none') ->> 'provenance' = 'document_provided'
  AND pg_temp.q('SELECT count(*) = 0 FROM public.vsd_document_reviews'),
  'V5.9 a replaced document does not inherit the old review');

-- Review the replacement, then change the statement.
SELECT pg_temp.run(:A, 'SELECT public.vsd_set_document_review_request(''5e000000-0000-4000-8000-00000000d003'', true)::text');
SELECT pg_temp.run(:REVIEWER, 'SELECT public.vsd_reviewer_record_review(''5e000000-0000-4000-8000-00000000d003'', 1, ''matches_declared_details'')::text');
SELECT pg_temp.ok(pg_temp.decl(:A, 'enforcement_debt_none') ->> 'provenance' = 'document_reviewed',
  'V5.10 the replacement is reviewed in its own right');
SELECT pg_temp.ok(
  (pg_temp.save(:A, 'enforcement_debt_none', 'se-enforcement-v1', 1)::jsonb)
    @> '{"revision": 2, "provenance": "self_declared", "document": null}'::jsonb
  AND pg_temp.q('SELECT count(*) = 0 FROM public.vsd_document_reviews')
  AND pg_temp.q($q$SELECT status = 'erasure_pending' FROM public.vsd_documents WHERE id = '5e000000-0000-4000-8000-00000000d003'$q$)
  AND NOT pg_temp.can_open(:REVIEWER, '5e000000-0000-4000-8000-00000000d003')
  AND pg_temp.run(:REVIEWER, 'SELECT public.vsd_reviewer_queue()::text') = '[]',
  'V5.11 a changed or renewed statement inherits neither the document nor its review');

-- ══ GROUP V6 · withdrawal, deletion, erasure ══════════════════════════════

-- A fresh document on the renewed statement (revision 2).
SELECT pg_temp.begin_doc(:A, '5e000000-0000-4000-8000-00000000d004', (SELECT v FROM ids WHERE k = 'enf_a'), 2,
                         'enforcement_authority_statement', repeat('d', 64));
SELECT pg_temp.put(:A, '5e000000-0000-4000-8000-0000000000a1/5e000000-0000-4000-8000-00000000d004.pdf');
SELECT pg_temp.stamp('5e000000-0000-4000-8000-00000000d004');
SELECT pg_temp.run(:A, 'SELECT public.vsd_attach_document(''5e000000-0000-4000-8000-00000000d004'')::text');

SELECT pg_temp.ok(
  jsonb_array_length(pg_temp.decl(:A, 'enforcement_debt_none') -> 'erasures') = 3
  AND pg_temp.decl(:A, 'enforcement_debt_none') -> 'erasures' -> 0 ->> 'failed' = 'false',
  'V6.1 files owed to erasure stay visible to the holder until they are gone');

-- A sweep that failed on one object.
UPDATE public.storage_erasure_queue SET attempts = 2, last_attempt_at = now(), last_error = 'SYNTHETIC storage failure'
 WHERE object_path = '5e000000-0000-4000-8000-0000000000a1/5e000000-0000-4000-8000-00000000d001.pdf';
SELECT pg_temp.ok(
  (SELECT e ->> 'failed' = 'true' AND e ->> 'attempts' = '2'
     FROM jsonb_array_elements(pg_temp.decl(:A, 'enforcement_debt_none') -> 'erasures') e
    WHERE e ->> 'documentId' = '5e000000-0000-4000-8000-00000000d001'),
  'V6.2 a failed cleanup is shown as failed, with its attempts');

-- A sweep that succeeded on two objects.
DELETE FROM storage.objects WHERE bucket_id = 'self-declaration-documents'
  AND name IN ('5e000000-0000-4000-8000-0000000000a1/5e000000-0000-4000-8000-00000000d002.pdf',
               '5e000000-0000-4000-8000-0000000000a1/5e000000-0000-4000-8000-00000000d003.pdf');
SELECT pg_temp.ok(
  jsonb_array_length(pg_temp.decl(:A, 'enforcement_debt_none') -> 'erasures') = 1
  AND pg_temp.q($q$SELECT count(*) = 0 FROM public.vsd_documents
        WHERE id IN ('5e000000-0000-4000-8000-00000000d002', '5e000000-0000-4000-8000-00000000d003')$q$),
  'V6.3 a document row leaves only once its object is absent');

SELECT pg_temp.ok(
  (pg_temp.run(:A, format('SELECT public.vsd_withdraw_declaration(%L)::text', (SELECT v FROM ids WHERE k = 'enf_a')))::jsonb)
    @> '{"status": "withdrawn", "provenance": null, "document": null, "revision": 3}'::jsonb
  AND NOT pg_temp.can_open(:A, '5e000000-0000-4000-8000-00000000d004')
  AND pg_temp.q($q$SELECT count(*) = 1 FROM public.storage_erasure_queue
        WHERE object_path = '5e000000-0000-4000-8000-0000000000a1/5e000000-0000-4000-8000-00000000d004.pdf'
          AND reason = 'self_declaration_withdrawn' AND completed_at IS NULL$q$),
  'V6.4 withdrawing ends access to the file at once and queues it');
SELECT pg_temp.ok(
  pg_temp.begin_doc(:A, '5e000000-0000-4000-8000-00000000d005', (SELECT v FROM ids WHERE k = 'enf_a'), 3,
                    'enforcement_authority_statement', repeat('e', 64)) = 'err:VSD_DECLARATION_NOT_FOUND',
  'V6.5 a withdrawn statement takes no document');

SELECT pg_temp.ok(
  (pg_temp.run(:A, format('SELECT public.vsd_delete_declaration(%L)::text', (SELECT v FROM ids WHERE k = 'enf_a')))::jsonb)
    = '{"deleted": false, "pendingFiles": 2}'::jsonb
  AND pg_temp.decl(:A, 'enforcement_debt_none') ->> 'status' = 'deletion_pending',
  'V6.6 a deletion is not reported complete while files remain');
SELECT pg_temp.ok(
  (pg_temp.save(:A, 'enforcement_debt_none', 'se-enforcement-v1', NULL)::jsonb) ->> 'status' = 'active'
  AND pg_temp.q($q$SELECT count(*) = 2 FROM public.vsd_declarations
        WHERE holder_user_id = '5e000000-0000-4000-8000-0000000000a1' AND declaration_kind = 'enforcement_debt_none'$q$),
  'V6.7 an owed cleanup does not stop the holder declaring again');

-- The queue row was marked complete but the object is still there: owed again.
UPDATE public.storage_erasure_queue SET completed_at = now()
 WHERE object_path = '5e000000-0000-4000-8000-0000000000a1/5e000000-0000-4000-8000-00000000d004.pdf';
SELECT pg_temp.run(:A, 'SELECT public.vsd_my_declarations()::text');
SELECT pg_temp.ok(
  (SELECT count(*) = 1 FROM public.storage_erasure_queue
    WHERE object_path = '5e000000-0000-4000-8000-0000000000a1/5e000000-0000-4000-8000-00000000d004.pdf'
      AND completed_at IS NULL AND reason = 'self_declaration_erasure_requeued'),
  'V6.8 an object that survived a "completed" sweep is queued again');

DELETE FROM storage.objects WHERE bucket_id = 'self-declaration-documents'
  AND name LIKE '5e000000-0000-4000-8000-0000000000a1/%';
SELECT pg_temp.ok(
  (pg_temp.run(:A, format('SELECT public.vsd_delete_declaration(%L)::text', (SELECT v FROM ids WHERE k = 'enf_a')))::jsonb)
    = '{"deleted": true, "pendingFiles": 0}'::jsonb
  AND pg_temp.q($q$SELECT NOT EXISTS (SELECT 1 FROM public.vsd_declarations WHERE id = (SELECT v FROM ids WHERE k = 'enf_a'))$q$)
  AND pg_temp.q($q$SELECT NOT EXISTS (SELECT 1 FROM public.vsd_documents WHERE holder_user_id = '5e000000-0000-4000-8000-0000000000a1')$q$),
  'V6.9 once the objects are absent the deletion completes and no row remains');
SELECT pg_temp.ok(
  (pg_temp.run(:A, format('SELECT public.vsd_delete_declaration(%L)::text', (SELECT v FROM ids WHERE k = 'remarks_a')))::jsonb)
    = '{"deleted": true, "pendingFiles": 0}'::jsonb,
  'V6.10 a statement with no document is deleted at once');

-- Abandoning an unfinished upload.
UPDATE ids SET v = (SELECT id FROM public.vsd_declarations
                     WHERE holder_user_id = :A AND declaration_kind = 'enforcement_debt_none')
 WHERE k = 'enf_a';
SELECT pg_temp.begin_doc(:A, '5e000000-0000-4000-8000-00000000d006', (SELECT v FROM ids WHERE k = 'enf_a'), 1,
                         'enforcement_authority_statement', repeat('f', 64));
SELECT pg_temp.ok(
  (pg_temp.run(:A, 'SELECT public.vsd_discard_document(''5e000000-0000-4000-8000-00000000d006'')::text')::jsonb)
    = '{"erased": true}'::jsonb
  AND pg_temp.put(:A, '5e000000-0000-4000-8000-0000000000a1/5e000000-0000-4000-8000-00000000d006.pdf') LIKE 'err:%'
  AND pg_temp.run(:B, 'SELECT public.vsd_discard_document(''5e000000-0000-4000-8000-00000000d006'')::text')
        = '{"erased": true}',
  'V6.11 an abandoned upload is discarded and its path closed');

-- ══ GROUP V7 · retention and revocation end access at once ═══════════════

UPDATE public.vsd_declarations SET retain_until = now() - interval '1 second'
 WHERE holder_user_id = :B AND declaration_kind = 'payment_remarks_none';
SELECT pg_temp.ok(
  pg_temp.decl(:B, 'payment_remarks_none') IS NULL
  AND pg_temp.q($q$SELECT NOT EXISTS (SELECT 1 FROM public.vsd_declarations WHERE holder_user_id = '5e000000-0000-4000-8000-0000000000a2')$q$),
  'V7.1 a statement past its retention is gone on the next read');

-- A live, reviewed-on-request document (d007) and an unfinished upload (d008).
SELECT pg_temp.begin_doc(:A, '5e000000-0000-4000-8000-00000000d007', (SELECT v FROM ids WHERE k = 'enf_a'), 1,
                         'enforcement_authority_statement', repeat('1', 64));
SELECT pg_temp.put(:A, '5e000000-0000-4000-8000-0000000000a1/5e000000-0000-4000-8000-00000000d007.pdf');
SELECT pg_temp.stamp('5e000000-0000-4000-8000-00000000d007');
SELECT pg_temp.run(:A, 'SELECT public.vsd_attach_document(''5e000000-0000-4000-8000-00000000d007'')::text');
SELECT pg_temp.run(:A, 'SELECT public.vsd_set_document_review_request(''5e000000-0000-4000-8000-00000000d007'', true)::text');
SELECT pg_temp.begin_doc(:A, '5e000000-0000-4000-8000-00000000d008', (SELECT v FROM ids WHERE k = 'enf_a'), 1,
                         'enforcement_authority_statement', repeat('2', 64));

SELECT pg_temp.ok(
  pg_temp.can_open(:A, '5e000000-0000-4000-8000-00000000d007') AND pg_temp.can_open(:REVIEWER, '5e000000-0000-4000-8000-00000000d007')
  AND NOT pg_temp.can_open(:B, '5e000000-0000-4000-8000-00000000d007') AND NOT pg_temp.can_open(:A, '5e000000-0000-4000-8000-00000000d007', false)
  AND jsonb_array_length(pg_temp.run(:REVIEWER, 'SELECT public.vsd_reviewer_queue()::text')::jsonb) = 1,
  'V7.2 control: while the statement is current the holder and the appointed reviewer may open the document');

-- RETENTION PASSES. Nothing reconciles: no profile read, no purge, no write.
UPDATE public.vsd_declarations SET retain_until = now() - interval '1 second'
 WHERE id = (SELECT v FROM ids WHERE k = 'enf_a');
SELECT pg_temp.ok(
  NOT pg_temp.can_open(:A, '5e000000-0000-4000-8000-00000000d007'),
  'V7.3 past retention the holder is refused the document at once, before any reconciliation');
SELECT pg_temp.ok(
  NOT pg_temp.can_open(:REVIEWER, '5e000000-0000-4000-8000-00000000d007')
  AND pg_temp.run(:REVIEWER, 'SELECT public.vsd_reviewer_queue()::text') = '[]'
  AND pg_temp.run(:REVIEWER, 'SELECT public.vsd_reviewer_record_review(''5e000000-0000-4000-8000-00000000d007'', 1, ''matches_declared_details'')::text')
        = 'err:VSD_DOCUMENT_NOT_FOUND',
  'V7.4 past retention the reviewer can neither open, list nor review it');
SELECT pg_temp.ok(
  NOT pg_temp.can_open(:B, '5e000000-0000-4000-8000-00000000d007') AND NOT pg_temp.can_open(:ADMIN, '5e000000-0000-4000-8000-00000000d007')
  AND NOT pg_temp.can_open(:A, '5e000000-0000-4000-8000-00000000d007', false) AND NOT pg_temp.can_open(:REVIEWER, '5e000000-0000-4000-8000-00000000d007', false)
  AND NOT pg_temp.can_read(:A, '5e000000-0000-4000-8000-0000000000a1/5e000000-0000-4000-8000-00000000d007.pdf') AND NOT pg_temp.can_read(:REVIEWER, '5e000000-0000-4000-8000-0000000000a1/5e000000-0000-4000-8000-00000000d007.pdf'),
  'V7.5 past retention: another user, an administrator, signed-out sessions and direct Storage reads are all refused');
SELECT pg_temp.ok(
  pg_temp.put(:A, '5e000000-0000-4000-8000-0000000000a1/5e000000-0000-4000-8000-00000000d008.pdf') LIKE 'err:%row-level security%'
  AND pg_temp.begin_doc(:A, '5e000000-0000-4000-8000-00000000d0e1', (SELECT v FROM ids WHERE k = 'enf_a'), 1,
                        'enforcement_authority_statement', repeat('4', 64)) = 'err:VSD_PROCESSING_NOT_AUTHORIZED'
  AND pg_temp.run(:A, 'SELECT public.vsd_set_document_review_request(''5e000000-0000-4000-8000-00000000d007'', true)::text')
        = 'err:VSD_PROCESSING_NOT_AUTHORIZED',
  'V7.6 past retention no upload, new document or review request is accepted');
SELECT pg_temp.ok(
  (SELECT status = 'active' FROM public.vsd_declarations WHERE id = (SELECT v FROM ids WHERE k = 'enf_a'))
  AND (SELECT status = 'attached' FROM public.vsd_documents WHERE id = '5e000000-0000-4000-8000-00000000d007')
  AND (SELECT count(*) = 1 FROM storage.objects WHERE name = '5e000000-0000-4000-8000-0000000000a1/5e000000-0000-4000-8000-00000000d007.pdf'),
  'V7.7 and all of that held while the rows and the object were still exactly as they were: nothing had reconciled');

-- Back inside retention: access returns, so it was the deadline that refused.
UPDATE public.vsd_declarations SET retain_until = now() + interval '30 days'
 WHERE id = (SELECT v FROM ids WHERE k = 'enf_a');
SELECT pg_temp.ok(
  pg_temp.can_open(:A, '5e000000-0000-4000-8000-00000000d007') AND pg_temp.can_open(:REVIEWER, '5e000000-0000-4000-8000-00000000d007'),
  'V7.8 control: inside retention again, access returns');

-- THE REVIEWER'S APPOINTMENT ENDS.
UPDATE public.vsd_document_reviewers SET revoked_at = now() WHERE user_id = :REVIEWER;
SELECT pg_temp.ok(
  NOT pg_temp.can_open(:REVIEWER, '5e000000-0000-4000-8000-00000000d007') AND pg_temp.can_open(:A, '5e000000-0000-4000-8000-00000000d007')
  AND pg_temp.run(:REVIEWER, 'SELECT public.vsd_reviewer_queue()::text') = '[]',
  'V7.9 a reviewer whose appointment ended is refused at once; the holder is not');
UPDATE public.vsd_document_reviewers SET revoked_at = NULL WHERE user_id = :REVIEWER;

-- THE HOLDER TAKES THE REQUEST BACK.
SELECT pg_temp.run(:A, 'SELECT public.vsd_set_document_review_request(''5e000000-0000-4000-8000-00000000d007'', false)::text');
SELECT pg_temp.ok(
  NOT pg_temp.can_open(:REVIEWER, '5e000000-0000-4000-8000-00000000d007'),
  'V7.10 a reviewer is refused as soon as the holder takes the review request back');
SELECT pg_temp.run(:A, 'SELECT public.vsd_set_document_review_request(''5e000000-0000-4000-8000-00000000d007'', true)::text');
SELECT pg_temp.ok(pg_temp.can_open(:REVIEWER, '5e000000-0000-4000-8000-00000000d007'), 'V7.11 control: with the request standing the reviewer may open it again');

-- THE AUTHORIZATION IS REVOKED. Again nothing reconciles first.
UPDATE public.vsd_processing_authorizations SET revoked_at = now()
 WHERE declaration_kind = 'enforcement_debt_none';
SELECT pg_temp.ok(
  NOT pg_temp.can_open(:A, '5e000000-0000-4000-8000-00000000d007'),
  'V7.12 under a revoked authorization the holder is refused the document at once, before any reconciliation');
SELECT pg_temp.ok(
  NOT pg_temp.can_open(:REVIEWER, '5e000000-0000-4000-8000-00000000d007')
  AND pg_temp.run(:REVIEWER, 'SELECT public.vsd_reviewer_queue()::text') = '[]'
  AND pg_temp.run(:REVIEWER, 'SELECT public.vsd_reviewer_record_review(''5e000000-0000-4000-8000-00000000d007'', 1, ''matches_declared_details'')::text')
        = 'err:VSD_DOCUMENT_NOT_FOUND',
  'V7.13 under a revoked authorization the reviewer can neither open, list nor review it');
SELECT pg_temp.ok(
  NOT pg_temp.can_open(:B, '5e000000-0000-4000-8000-00000000d007') AND NOT pg_temp.can_open(:ADMIN, '5e000000-0000-4000-8000-00000000d007')
  AND NOT pg_temp.can_open(:A, '5e000000-0000-4000-8000-00000000d007', false)
  AND NOT pg_temp.can_read(:A, '5e000000-0000-4000-8000-0000000000a1/5e000000-0000-4000-8000-00000000d007.pdf'),
  'V7.14 under a revoked authorization: another user, an administrator, a signed-out session and direct Storage are refused');
SELECT pg_temp.ok(
  pg_temp.put(:A, '5e000000-0000-4000-8000-0000000000a1/5e000000-0000-4000-8000-00000000d008.pdf') LIKE 'err:%row-level security%'
  AND pg_temp.stamp('5e000000-0000-4000-8000-00000000d008') LIKE 'err:%'
  AND pg_temp.save(:A, 'enforcement_debt_none', 'se-enforcement-v1', 1) = 'err:VSD_PROCESSING_NOT_AUTHORIZED',
  'V7.15 a revoked authorization stops uploads, content stamps and statements at once');
SELECT pg_temp.ok(
  (SELECT status = 'active' FROM public.vsd_declarations WHERE id = (SELECT v FROM ids WHERE k = 'enf_a'))
  AND (SELECT status = 'attached' FROM public.vsd_documents WHERE id = '5e000000-0000-4000-8000-00000000d007'),
  'V7.16 and all of that held before anything had reconciled the rows');
SELECT pg_temp.ok(
  pg_temp.decl(:A, 'enforcement_debt_none') ->> 'status' = 'deletion_pending'
  AND NOT pg_temp.can_open(:A, '5e000000-0000-4000-8000-00000000d007')
  AND pg_temp.q($q$SELECT count(*) = 1 FROM public.storage_erasure_queue
        WHERE object_path = '5e000000-0000-4000-8000-0000000000a1/5e000000-0000-4000-8000-00000000d007.pdf'
          AND reason = 'self_declaration_retention_ended' AND completed_at IS NULL$q$),
  'V7.17 the next read then deletes what was collected under it and queues the file');
SELECT pg_temp.ok(
  pg_temp.run(:A, 'SELECT public.vsd_purge_due()::text') LIKE 'err:permission denied%'
  AND has_function_privilege('service_role', 'public.vsd_purge_due()', 'EXECUTE'),
  'V7.18 the retention purge is for the service role only');

-- ══ GROUP V8 · a properly reviewed criminal-history authorization, and account erasure ══

SELECT pg_temp.ok(
  pg_temp.auth_insert('criminal_history', 'legal_obligation', 'SYNTHETIC national-law authority', 'SYNTHETIC last five years',
                      ARRAY['collect_declaration', 'store_document'], ARRAY['police_extract'], 'se-criminal-synthetic-v1') = 'ok',
  'V8.1 a criminal-history authorization with a reviewed basis, authority and period is accepted');
INSERT INTO ids VALUES ('crim', ((pg_temp.save(:ERASED, 'criminal_history', 'se-criminal-synthetic-v1', NULL)::jsonb) ->> 'id')::uuid);
SELECT pg_temp.begin_doc(:ERASED, '5e000000-0000-4000-8000-00000000d009', (SELECT v FROM ids WHERE k = 'crim'), 1,
                         'police_extract', repeat('3', 64));
SELECT pg_temp.put(:ERASED, '5e000000-0000-4000-8000-0000000000a6/5e000000-0000-4000-8000-00000000d009.pdf');
SELECT pg_temp.stamp('5e000000-0000-4000-8000-00000000d009');
SELECT pg_temp.ok(
  (pg_temp.run(:ERASED, 'SELECT public.vsd_attach_document(''5e000000-0000-4000-8000-00000000d009'')::text')::jsonb)
    ->> 'status' = 'attached'
  AND pg_temp.decl(:ERASED, 'criminal_history') ->> 'provenance' = 'document_provided'
  AND (pg_temp.run(:ERASED, 'SELECT public.vsd_my_declarations()::text')::jsonb) -> 'authorizations' @>
        '[{"kind": "criminal_history", "statementPeriod": "SYNTHETIC last five years", "legalBasis": "legal_obligation"}]'::jsonb,
  'V8.2 under it the complete path works, and the holder is shown the basis and period');

DELETE FROM auth.users WHERE id = :ERASED;
SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM public.vsd_declarations WHERE holder_user_id = :ERASED)
  AND NOT EXISTS (SELECT 1 FROM public.vsd_documents WHERE holder_user_id = :ERASED)
  AND (SELECT count(*) = 1 FROM public.storage_erasure_queue
        WHERE bucket_id = 'self-declaration-documents' AND completed_at IS NULL
          AND object_path = '5e000000-0000-4000-8000-0000000000a6/5e000000-0000-4000-8000-00000000d009.pdf'
          AND reason = 'self_declaration_rows_erased'),
  'V8.3 erasing the account removes every row and queues the file');
SELECT pg_temp.ok(
  (SELECT bool_and(c.confdeltype = 'c') AND count(*) = 3
     FROM pg_constraint c
    WHERE c.contype = 'f' AND c.confrelid = 'auth.users'::regclass
      AND c.conrelid IN ('public.vsd_declarations'::regclass, 'public.vsd_documents'::regclass,
                         'public.vsd_document_reviewers'::regclass)),
  'V8.4 every holder table cascades from the account, so the catalogue-driven erasure reaches it');

-- ══ GROUP V9 · isolation, privileges, rollback ════════════════════════════

SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg_temp%'
       AND p.proname NOT LIKE 'vsd\_%' AND p.prokind IN ('f', 'p')
       AND p.prosrc ~* '\mvsd_'),
  'V9.1 no other function in the database names a vsd_ object');
SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM pg_views WHERE schemaname NOT IN ('pg_catalog', 'information_schema') AND definition ~* '\mvsd_')
  AND NOT EXISTS (SELECT 1 FROM pg_matviews WHERE definition ~* '\mvsd_'),
  'V9.2 no view names a vsd_ object');
SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.contype = 'f' AND c.confrelid::regclass::text LIKE 'vsd\_%'
       AND c.conrelid::regclass::text NOT LIKE 'vsd\_%')
  AND NOT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
     WHERE NOT t.tgisinternal AND p.proname LIKE 'vsd\_%' AND t.tgrelid::regclass::text NOT LIKE 'vsd\_%'),
  'V9.3 no other table references, or is triggered by, a vsd_ object');
SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name IN ('vsd_declarations', 'vsd_documents', 'vsd_document_reviews', 'vsd_document_reviewers')
       AND column_name ~* '(score|rank|rating|risk|suitab|decision|verified|clean|amount|creditor|offen[cs]e|explanation|note|comment|personnummer|identity_number|national_id)'),
  'V9.4 no holder-data column can hold a score, a verdict, an explanation, an amount or an identity number');
SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace AND p.proname LIKE 'vsd\_%'
       AND (has_function_privilege('anon', p.oid, 'EXECUTE')
            OR EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a WHERE a.grantee = 0))),
  'V9.5 anon and PUBLIC execute no vsd_ function');
SELECT pg_temp.ok(
  (SELECT array_agg(p.proname::text ORDER BY p.proname) FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.proname LIKE 'vsd\_%'
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE'))
  = ARRAY['vsd_abandon_upload', 'vsd_attach_document', 'vsd_authorize_document_read', 'vsd_begin_document',
          'vsd_delete_declaration', 'vsd_discard_document', 'vsd_document_storage_writable',
          'vsd_my_declarations', 'vsd_reviewer_queue', 'vsd_reviewer_record_review',
          'vsd_save_declaration', 'vsd_set_document_review_request', 'vsd_upload_state',
          'vsd_withdraw_declaration'],
  'V9.6 a signed-in user executes exactly the fourteen client functions');
SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM pg_policies
               WHERE schemaname = 'storage' AND tablename = 'objects' AND permissive = 'PERMISSIVE'
                 AND cmd <> 'INSERT' AND coalesce(qual, '') || coalesce(with_check, '') LIKE '%self-declaration-documents%')
  AND (SELECT count(*) = 1 FROM pg_policies
        WHERE schemaname = 'storage' AND tablename = 'objects' AND permissive = 'PERMISSIVE'
          AND policyname LIKE 'vsd\_%')
  AND (SELECT qual = '(bucket_id <> ''self-declaration-documents''::text)' FROM pg_policies
        WHERE schemaname = 'storage' AND policyname = 'vsd_documents_select_fence'),
  'V9.6a the bucket''s only permissive policy is the upload; no policy lets a client read, sign, overwrite or delete');
SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM pg_class c
     WHERE c.relnamespace = 'public'::regnamespace AND c.relname LIKE 'vsd\_%' AND c.relkind = 'r'
       AND (has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
         OR has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
         OR has_table_privilege('service_role', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
         OR NOT c.relrowsecurity)),
  'V9.7 no client or service role holds any privilege on a vsd_ table, and RLS is on');
SELECT pg_temp.ok(
  (SELECT NOT public AND file_size_limit = 10485760 FROM storage.buckets WHERE id = 'self-declaration-documents')
  AND NOT EXISTS (SELECT 1 FROM public.sp_evidence e WHERE e.storage_path LIKE '5e000000-%')
  AND NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'passport-evidence' AND name LIKE '5e000000-%')
  AND NOT EXISTS (SELECT 1 FROM public.sp_claims WHERE holder_user_id IN (:A, :B)),
  'V9.8 the bucket is private and separate; nothing was written to the Passport');
SELECT pg_temp.ok(
  (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(
     pg_temp.save(:B, 'payment_remarks_none', 'se-remarks-v1', NULL)::jsonb) k)
  = ARRAY['asOfDate', 'authorizationId', 'declaredAt', 'document', 'erasures', 'id', 'jurisdiction', 'kind',
          'pendingUpload', 'provenance', 'retainUntil', 'reviewAvailable', 'revision', 'statementVersion',
          'status', 'withdrawnAt'],
  'V9.9 a statement payload carries exactly its sixteen keys');

-- The real rollback, with rows and a live document present.
\ir ../rollback/20270324090000_vsd_voluntary_self_declarations_rollback.sql
SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relname LIKE 'vsd\_%')
  AND NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname LIKE 'vsd\_%')
  AND (SELECT array_agg(policyname::text) = ARRAY['vsd_documents_closed'] FROM pg_policies
        WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE 'vsd\_%'),
  'V9.10 the rollback removes every vsd_ object and leaves the bucket closed');
SELECT pg_temp.ok(
  pg_temp.put(:A, '5e000000-0000-4000-8000-0000000000a1/5e000000-0000-4000-8000-00000000d0aa.pdf') LIKE 'err:%'
  AND pg_temp.run(:A, 'SELECT count(*)::text FROM storage.objects WHERE bucket_id = ''self-declaration-documents''') = '0'
  AND (SELECT count(*) >= 1 FROM storage.objects WHERE bucket_id = 'self-declaration-documents'),
  'V9.11 after the rollback no client reads or writes the bucket');
\ir ../migrations/20270324090000_vsd_voluntary_self_declarations.sql
SELECT pg_temp.ok(
  to_regclass('public.vsd_declarations') IS NOT NULL
  AND (SELECT count(*) = 0 FROM public.vsd_processing_authorizations)
  AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND policyname = 'vsd_documents_closed'),
  'V9.12 the migration re-applies cleanly after a rollback, closed again');

ROLLBACK;
