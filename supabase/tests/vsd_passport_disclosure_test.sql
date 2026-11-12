-- Voluntary self-declarations: the Security Passport bridge -- executed.
--
-- Proves 20270325090000 does what it says, with synthetic fixtures only:
--
--   GROUP D1  closed by default: the migration records no disclosure
--             authorization; a collection authorization alone shares nothing
--             -- no preview, no selection, no recipient payload
--   GROUP D2  the disclosure authorization table: no anonymous audience
--             exists; offence data cannot be disclosed on consent; it needs a
--             current collection; immutable but revocable; no client writes
--   GROUP D3  the holder's Passport read: only current statements, only
--             their own, and a supporting document changes nothing a
--             recipient is given
--   GROUP D4  the choice belongs to the link's creation: one transaction
--             creates the link and seals the choice (also an empty one); an
--             older link, an opened link, a reissued link, a link the
--             Passport created by itself, an application disclosure and
--             somebody else's link can never gain a statement -- not through
--             a function and not through a direct write; a retry changes
--             nothing; a refusal leaves no link; the preview is exactly what
--             a recipient receives
--   GROUP D5  the recipient: signed in AND holding the link's live share
--             session, or nothing; anon, the service role, a signed-out
--             session, another link's session and direct table reads all fail
--   GROUP D6  lifecycle: withdrawal of the selection, the link's revocation
--             and expiry, the statement's withdrawal, renewal, deletion and
--             retention, and revocation of either authorization each end
--             disclosure at once -- and nothing later revives the old row
--   GROUP D7  isolation and privileges: no sp_ function names a vsd_ object;
--             the anonymous Passport read is unchanged; account erasure; the
--             real rollback and a clean re-apply
--
-- Every simulated JWT names a live auth.sessions row. One transaction, rolled
-- back. The suite shares one now(); a row's timestamps are moved to exercise
-- expiry, and savepoints keep the lifecycle cases independent.

\set ON_ERROR_STOP on
SET client_min_messages TO NOTICE;

BEGIN;

-- Each holder's one verified credential (filled with the fixtures).
CREATE TEMP TABLE vsdd_claims (holder uuid PRIMARY KEY, claim_id uuid NOT NULL) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.ok(cond boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF cond IS NOT TRUE THEN RAISE EXCEPTION 'ASSERTION FAILED: %', label; END IF;
  RAISE NOTICE 'ok  %', label;
END $$;

-- One statement as a client role. _role 'authenticated' carries a JWT naming
-- the user's live session (or, with _live = false, one that does not exist).
CREATE OR REPLACE FUNCTION pg_temp.run(_uid uuid, _sql text, _live boolean DEFAULT true,
                                       _role text DEFAULT 'authenticated')
RETURNS text LANGUAGE plpgsql AS $$
DECLARE _r text; _n bigint;
BEGIN
  IF _role = 'authenticated' THEN
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', _uid, 'role', 'authenticated',
                        'session_id', CASE WHEN _live THEN _uid ELSE gen_random_uuid() END)::text, true);
    PERFORM set_config('request.jwt.claim.sub', _uid::text, true);
  ELSE
    PERFORM set_config('request.jwt.claims', json_build_object('role', _role)::text, true);
    PERFORM set_config('request.jwt.claim.sub', '', true);
  END IF;
  EXECUTE format('SET LOCAL ROLE %I', _role);
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

CREATE OR REPLACE FUNCTION pg_temp.save(_uid uuid, _kind text, _version text, _expected integer) RETURNS text
LANGUAGE sql AS $$
  SELECT pg_temp.run(_uid, format(
    'SELECT public.vsd_save_declaration(%L, ''SE'', %L, current_date, true, %s)::text',
    _kind, _version, coalesce(_expected::text, 'NULL')))
$$;

-- The id and current revision of one of a holder's statements.
CREATE OR REPLACE FUNCTION pg_temp.decl(_uid uuid, _kind text) RETURNS public.vsd_declarations
LANGUAGE sql VOLATILE AS $$
  SELECT d FROM public.vsd_declarations d
   WHERE d.holder_user_id = _uid AND d.declaration_kind = _kind AND d.status <> 'deletion_pending'
$$;

CREATE OR REPLACE FUNCTION pg_temp.preview(_uid uuid, _kinds text[]) RETURNS text
LANGUAGE sql VOLATILE AS $$
  SELECT pg_temp.run(_uid, format('SELECT public.vsd_preview_disclosure(%L::uuid[], %L::integer[])::text',
    (SELECT array_agg((pg_temp.decl(_uid, k)).id ORDER BY o) FROM unnest(_kinds) WITH ORDINALITY x(k, o)),
    (SELECT array_agg((pg_temp.decl(_uid, k)).revision ORDER BY o) FROM unnest(_kinds) WITH ORDINALITY x(k, o))))
$$;

-- Create ONE credential link together with a choice of statements, as the
-- holder. The holder's fixture credential is the link's content.
CREATE OR REPLACE FUNCTION pg_temp.share(_uid uuid, _key uuid, _kinds text[], _owner uuid DEFAULT NULL,
                                         _fields text[] DEFAULT '{}')
RETURNS text LANGUAGE sql VOLATILE AS $$
  SELECT pg_temp.run(_uid, format(
    'SELECT public.vsd_create_credential_share(ARRAY[%L]::uuid[], %L::text[], 7, ''sv'', %L, %L::uuid[], %L::integer[])::text',
    (SELECT claim_id FROM vsdd_claims WHERE holder = _uid), _fields, _key,
    coalesce((SELECT array_agg((pg_temp.decl(coalesce(_owner, _uid), k)).id ORDER BY o)
                FROM unnest(_kinds) WITH ORDINALITY x(k, o)), '{}'::uuid[]),
    coalesce((SELECT array_agg((pg_temp.decl(coalesce(_owner, _uid), k)).revision ORDER BY o)
                FROM unnest(_kinds) WITH ORDINALITY x(k, o)), '{}'::integer[])))
$$;

-- A result as jsonb; an error is an empty object, so an assertion names it.
CREATE OR REPLACE FUNCTION pg_temp.j(_r text) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$ SELECT CASE WHEN _r LIKE '{%' THEN _r::jsonb ELSE '{}'::jsonb END $$;

-- A DIRECT write, as the table owner, bypassing every function: seal a
-- choice for a link / add a selection to a link.
CREATE OR REPLACE FUNCTION pg_temp.seal(_link uuid, _holder uuid) RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.vsd_disclosure_choices (disclosure_id, holder_user_id, request_key, choice_count, choice_digest)
  SELECT x.id, _holder, x.request_key, 1, repeat('0', 64) FROM public.sp_disclosures x WHERE x.id = _link;
  IF NOT FOUND THEN RETURN 'err:no link'; END IF;
  RETURN 'ok';
EXCEPTION WHEN OTHERS THEN RETURN 'err:' || SQLERRM;
END $$;
CREATE OR REPLACE FUNCTION pg_temp.attach(_link uuid, _holder uuid, _kind text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE _d public.vsd_declarations := pg_temp.decl(_holder, _kind);
BEGIN
  INSERT INTO public.vsd_disclosure_selections
    (holder_user_id, disclosure_id, declaration_id, declaration_revision, statement_version,
     disclosure_authorization_id, audience)
  SELECT _holder, _link, _d.id, _d.revision, _d.statement_version, da.id, 'signed_in_recipient'
    FROM public.vsd_disclosure_authorizations da
   WHERE da.authorization_id = _d.authorization_id AND da.revoked_at IS NULL;
  IF NOT FOUND THEN RETURN 'err:no authorization'; END IF;
  RETURN 'ok';
EXCEPTION WHEN OTHERS THEN RETURN 'err:' || SQLERRM;
END $$;

-- What a caller is given for a share session secret: the items, as jsonb.
CREATE OR REPLACE FUNCTION pg_temp.given(_uid uuid, _secret text, _live boolean DEFAULT true) RETURNS jsonb
LANGUAGE plpgsql VOLATILE AS $$
DECLARE _r text := pg_temp.run(_uid, format('SELECT public.vsd_read_disclosed(%L)::text', _secret), _live);
BEGIN
  IF _r LIKE 'err:%' THEN RETURN jsonb_build_object('err', _r); END IF;
  RETURN _r::jsonb -> 'items';
END $$;

CREATE OR REPLACE FUNCTION pg_temp.kinds(_items jsonb) RETURNS text
LANGUAGE sql AS $$
  SELECT coalesce(string_agg(e ->> 'kind', ',' ORDER BY e ->> 'kind'), '')
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(_items) = 'array' THEN _items ELSE '[]'::jsonb END) e
$$;

-- A read made AFTER a mutation in the same assertion (a plain subquery would
-- run on the statement's own snapshot).
CREATE OR REPLACE FUNCTION pg_temp.q(_sql text) RETURNS boolean
LANGUAGE plpgsql VOLATILE AS $$
DECLARE _r boolean;
BEGIN
  EXECUTE 'SELECT (' || _sql || ')' INTO _r;
  RETURN _r;
END $$;

-- A link that exists WITHOUT having been created through the bridge: its own
-- request key, and (with a secret) a recipient's share session.
CREATE OR REPLACE FUNCTION pg_temp.link(_id uuid, _holder uuid, _secret text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.sp_disclosures (id, holder_user_id, package_code, token_hash, expires_at, request_key)
  VALUES (_id, _holder, 'selected_merits', 'vsd-suite-' || _id::text, now() + interval '7 days', gen_random_uuid());
  IF _secret IS NOT NULL THEN PERFORM pg_temp.session(_id, _secret); END IF;
END $$;
CREATE OR REPLACE FUNCTION pg_temp.session(_id uuid, _secret text) RETURNS void
LANGUAGE sql AS $$
  INSERT INTO public.sp_share_sessions (disclosure_id, session_hash, expires_at)
  VALUES (_id, encode(sha256(convert_to(_secret, 'UTF8')), 'hex'), now() + interval '30 minutes');
$$;

CREATE OR REPLACE FUNCTION pg_temp.disclosure_auth(_kind text, _basis text, _authority text, _audiences text[])
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.vsd_disclosure_authorizations
    (authorization_id, purpose, legal_basis, legal_basis_detail, assessment_reference,
     offence_data_authority, permitted_audiences, approved_by_name, approved_on)
  SELECT a.id, 'SYNTHETIC disclosure purpose for the automated suite only.', _basis,
         'SYNTHETIC disclosure basis for the automated suite only.', 'SYNTHETIC-DISCLOSURE-ASSESSMENT-1',
         _authority, _audiences, 'SYNTHETIC Approver', current_date
    FROM public.vsd_processing_authorizations a
   WHERE a.declaration_kind = _kind AND a.jurisdiction = 'SE' AND a.revoked_at IS NULL;
  IF NOT FOUND THEN RETURN 'err:no collection'; END IF;
  RETURN 'ok';
EXCEPTION WHEN OTHERS THEN RETURN 'err:' || SQLERRM;
END $$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO PUBLIC;

-- ── Fixtures (synthetic) ──────────────────────────────────────────────────
--   d1 holder A   d2 holder B   d3 recipient R   d4 a signed-in stranger

INSERT INTO auth.users (id, email, email_confirmed_at, raw_user_meta_data) VALUES
  ('5d000000-0000-4000-8000-0000000000d1', 'vsdd-holder-a@test.invalid', now(), '{}'),
  ('5d000000-0000-4000-8000-0000000000d2', 'vsdd-holder-b@test.invalid', now(), '{}'),
  ('5d000000-0000-4000-8000-0000000000d3', 'vsdd-recipient@test.invalid', now(), '{}'),
  ('5d000000-0000-4000-8000-0000000000d4', 'vsdd-stranger@test.invalid', now(), '{}');
INSERT INTO auth.sessions (id, user_id)
SELECT id, id FROM auth.users WHERE email LIKE 'vsdd-%@test.invalid';

\set A '''5d000000-0000-4000-8000-0000000000d1'''
\set B '''5d000000-0000-4000-8000-0000000000d2'''
\set R '''5d000000-0000-4000-8000-0000000000d3'''
\set STRANGER '''5d000000-0000-4000-8000-0000000000d4'''
-- Links that exist without the bridge: L2 is A's and in a recipient's hands,
-- LOLD is one A already had, LOPEN one somebody has opened, LB is B's. (L1,
-- the link that carries A's selection, is created in D4 through the bridge.)
\set L2 '''5d000000-0000-4000-8000-000000000012'''
\set LOLD '''5d000000-0000-4000-8000-000000000013'''
\set LB '''5d000000-0000-4000-8000-000000000014'''
\set LAPP '''5d000000-0000-4000-8000-000000000015'''
\set LOPEN '''5d000000-0000-4000-8000-000000000016'''
-- B's, and in nobody's hands: only its holder distinguishes it.
\set LB2 '''5d000000-0000-4000-8000-000000000018'''
-- Creation operations (request keys): K1 A's link with a statement, K2 a link
-- the Passport creates by itself, K3 a reissue, K4 an empty choice, KX
-- attempts that must leave nothing, KB B's.
\set K1 '''5d000000-0000-4000-8000-0000000000a1'''
\set K2 '''5d000000-0000-4000-8000-0000000000a2'''
\set K3 '''5d000000-0000-4000-8000-0000000000a3'''
\set K4 '''5d000000-0000-4000-8000-0000000000a4'''
\set KX '''5d000000-0000-4000-8000-0000000000af'''
\set KB '''5d000000-0000-4000-8000-0000000000ab'''
\set S3 '''5555555555555555555555555555555555555555555555555555555555555555'''
\set S4 '''6666666666666666666666666666666666666666666666666666666666666666'''
\set S1 '''1111111111111111111111111111111111111111111111111111111111111111'''
\set S2 '''2222222222222222222222222222222222222222222222222222222222222222'''
\set SOLD '''3333333333333333333333333333333333333333333333333333333333333333'''
\set SB '''4444444444444444444444444444444444444444444444444444444444444444'''

SELECT pg_temp.link(:L2, :A, :S2);
SELECT pg_temp.link(:LOLD, :A, NULL);
SELECT pg_temp.link(:LOPEN, :A, NULL);
SELECT pg_temp.link(:LB, :B, :SB);
SELECT pg_temp.link(:LB2, :B, NULL);
-- LOLD differs from a link being created only in WHEN it was created (one
-- second is enough: no window is consulted); LOPEN only in having been opened.
UPDATE public.sp_disclosures SET created_at = now() - interval '1 second' WHERE id = :LOLD;
UPDATE public.sp_disclosures SET access_count = 1 WHERE id = :LOPEN;

-- A verified credential each, so the Passport's own function can create a
-- credential link for them.
INSERT INTO public.sp_passport_profiles (holder_user_id, privacy_mode)
VALUES (:A, 'full_name'), (:B, 'full_name') ON CONFLICT DO NOTHING;
INSERT INTO vsdd_claims
SELECT u, pg_temp.run(u, $q$SELECT public.sp_save_international_credential('{"definition_code":"INTL_ASIS_CPP","identifier":"SYNTHETIC-1"}')::text$q$)::uuid
  FROM unnest(ARRAY[:A, :B]::uuid[]) u;

-- ══ GROUP D1 · closed by default ══════════════════════════════════════════

SELECT pg_temp.ok((SELECT count(*) = 0 FROM public.vsd_disclosure_authorizations)
                  AND (SELECT count(*) = 0 FROM public.vsd_processing_authorizations),
  'D1.1 the migration records no authorization of either kind');
SELECT pg_temp.ok(
  (pg_temp.run(:A, 'SELECT public.vsd_my_passport_declarations()::text')::jsonb)
    = '{"open": [], "declarations": []}'::jsonb,
  'D1.2 with nothing authorized the holder''s Passport is given no statement and no open kind');

-- Collection is authorized (synthetic); disclosure is not.
INSERT INTO public.vsd_processing_authorizations
  (declaration_kind, jurisdiction, statement_version, operator_name, operator_registration, purpose,
   legal_basis, legal_basis_detail, assessment_reference, retention_days, permitted_operations,
   permitted_document_types, approved_by_name, approved_on)
VALUES
  ('enforcement_debt_none', 'SE', 'se-enforcement-v1', 'SYNTHETIC Operator AB', 'SYNTHETIC-000000-0000',
   'SYNTHETIC fixture purpose for the automated suite only.', 'consent',
   'SYNTHETIC fixture basis for the automated suite only.', 'SYNTHETIC-ASSESSMENT-1', 180,
   ARRAY['collect_declaration', 'store_document'], ARRAY['enforcement_authority_statement'],
   'SYNTHETIC Approver', current_date),
  ('payment_remarks_none', 'SE', 'se-remarks-v1', 'SYNTHETIC Operator AB', 'SYNTHETIC-000000-0000',
   'SYNTHETIC fixture purpose for the automated suite only.', 'consent',
   'SYNTHETIC fixture basis for the automated suite only.', 'SYNTHETIC-ASSESSMENT-1', 180,
   ARRAY['collect_declaration'], '{}', 'SYNTHETIC Approver', current_date);

SELECT pg_temp.ok(
  pg_temp.save(:A, 'enforcement_debt_none', 'se-enforcement-v1', NULL) NOT LIKE 'err:%'
  AND pg_temp.save(:A, 'payment_remarks_none', 'se-remarks-v1', NULL) NOT LIKE 'err:%'
  AND pg_temp.save(:B, 'payment_remarks_none', 'se-remarks-v1', NULL) NOT LIKE 'err:%',
  'D1.3 fixture: the holders make their statements under a collection authorization');
SELECT pg_temp.ok(
  (SELECT bool_and((e ->> 'shareable')::boolean IS FALSE) AND count(*) = 2
     FROM jsonb_array_elements(
       pg_temp.run(:A, 'SELECT public.vsd_my_passport_declarations()::text')::jsonb -> 'declarations') e),
  'D1.4 a collection authorization alone makes no statement shareable');
SELECT pg_temp.ok(
  pg_temp.preview(:A, ARRAY['enforcement_debt_none']) = 'err:VSD_DISCLOSURE_NOT_AUTHORIZED',
  'D1.5 without a disclosure authorization a preview is refused');
SELECT pg_temp.ok(
  pg_temp.share(:A, :KX, ARRAY['enforcement_debt_none']) = 'err:VSD_DISCLOSURE_NOT_AUTHORIZED'
  AND pg_temp.q('NOT EXISTS (SELECT 1 FROM public.vsd_disclosure_selections)')
  AND pg_temp.q(format('NOT EXISTS (SELECT 1 FROM public.sp_disclosures WHERE request_key = %L)', :KX)),
  'D1.6 without a disclosure authorization no link is created with a statement, and none is left behind');
SELECT pg_temp.ok(
  pg_temp.given(:R, :S2) = '[]'::jsonb,
  'D1.7 without a disclosure authorization a recipient is given nothing');

-- ══ GROUP D2 · the disclosure authorization table ═════════════════════════

SELECT pg_temp.ok(
  pg_temp.disclosure_auth('payment_remarks_none', 'consent', NULL, ARRAY['anonymous_link'])
    LIKE 'err:%vsd_disclosure_auth_audiences_known%'
  AND pg_temp.disclosure_auth('payment_remarks_none', 'consent', NULL, ARRAY['signed_in_recipient', 'public'])
    LIKE 'err:%vsd_disclosure_auth_audiences_known%',
  'D2.1 no anonymous or public audience can be authorized');
SELECT pg_temp.ok(
  pg_temp.disclosure_auth('payment_remarks_none', 'consent', NULL, '{}')
    LIKE 'err:%vsd_disclosure_auth_audiences_known%',
  'D2.2 an authorization must name an audience');

SAVEPOINT d2_criminal;
INSERT INTO public.vsd_processing_authorizations
  (declaration_kind, jurisdiction, statement_version, operator_name, operator_registration, purpose,
   legal_basis, legal_basis_detail, assessment_reference, offence_data_authority, statement_period,
   retention_days, permitted_operations, approved_by_name, approved_on)
VALUES ('criminal_history', 'SE', 'se-criminal-synthetic-v1', 'SYNTHETIC Operator AB', 'SYNTHETIC-000000-0000',
        'SYNTHETIC fixture purpose for the automated suite only.', 'legal_obligation',
        'SYNTHETIC fixture basis for the automated suite only.', 'SYNTHETIC-ASSESSMENT-1',
        'SYNTHETIC national-law authority', 'SYNTHETIC last five years', 180,
        ARRAY['collect_declaration'], 'SYNTHETIC Approver', current_date);
SELECT pg_temp.ok(
  pg_temp.disclosure_auth('criminal_history', 'consent', 'SYNTHETIC national-law authority', ARRAY['signed_in_recipient'])
    = 'err:VSD_DISCLOSURE_CRIMINAL_NEEDS_REVIEWED_BASIS'
  AND pg_temp.disclosure_auth('criminal_history', 'legal_obligation', NULL, ARRAY['signed_in_recipient'])
    = 'err:VSD_DISCLOSURE_CRIMINAL_NEEDS_REVIEWED_BASIS',
  'D2.3 offence data cannot be disclosed on consent or without its Art. 10 authority');
ROLLBACK TO SAVEPOINT d2_criminal;

SELECT pg_temp.ok(
  pg_temp.disclosure_auth('criminal_history', 'legal_obligation', 'SYNTHETIC national-law authority',
                          ARRAY['signed_in_recipient']) = 'err:no collection',
  'D2.4 fixture: there is no collection authorization for criminal history');
SAVEPOINT d2_revoked_collection;
UPDATE public.vsd_processing_authorizations SET revoked_at = now() WHERE declaration_kind = 'payment_remarks_none';
DO $$
BEGIN
  INSERT INTO public.vsd_disclosure_authorizations
    (authorization_id, purpose, legal_basis, legal_basis_detail, assessment_reference,
     permitted_audiences, approved_by_name, approved_on)
  SELECT a.id, 'SYNTHETIC disclosure purpose for the automated suite only.', 'consent',
         'SYNTHETIC disclosure basis for the automated suite only.', 'SYNTHETIC-DISCLOSURE-ASSESSMENT-1',
         ARRAY['signed_in_recipient'], 'SYNTHETIC Approver', current_date
    FROM public.vsd_processing_authorizations a WHERE a.declaration_kind = 'payment_remarks_none';
  RAISE EXCEPTION 'ASSERTION FAILED: D2.5 a disclosure cannot be authorized for a revoked collection';
EXCEPTION WHEN check_violation THEN
  IF SQLERRM <> 'VSD_DISCLOSURE_AUTHORIZATION_NEEDS_COLLECTION' THEN RAISE; END IF;
  RAISE NOTICE 'ok  D2.5 a disclosure cannot be authorized for a revoked collection';
END $$;
ROLLBACK TO SAVEPOINT d2_revoked_collection;

-- The synthetic disclosure authorizations the rest of the suite runs under.
SELECT pg_temp.ok(
  pg_temp.disclosure_auth('enforcement_debt_none', 'consent', NULL, ARRAY['signed_in_recipient']) = 'ok'
  AND pg_temp.disclosure_auth('payment_remarks_none', 'consent', NULL, ARRAY['signed_in_recipient']) = 'ok',
  'D2.6 a complete disclosure authorization is accepted');
SELECT pg_temp.ok(
  pg_temp.disclosure_auth('payment_remarks_none', 'consent', NULL, ARRAY['signed_in_recipient'])
    LIKE 'err:%vsd_disclosure_auth_one_current_idx%',
  'D2.7 one current disclosure authorization per collection');
SELECT pg_temp.ok(
  pg_temp.run(:A, 'UPDATE public.vsd_disclosure_authorizations SET revoked_at = now()') LIKE 'err:%permission denied%'
  AND pg_temp.run(:A, 'SELECT count(*)::text FROM public.vsd_disclosure_authorizations') LIKE 'err:%permission denied%'
  AND pg_temp.run(:A, 'SELECT count(*)::text FROM public.vsd_disclosure_selections') LIKE 'err:%permission denied%'
  AND pg_temp.run(:A, 'SELECT count(*)::text FROM public.vsd_disclosure_accesses') LIKE 'err:%permission denied%'
  AND pg_temp.run(:A, 'SELECT count(*)::text FROM public.vsd_disclosure_choices') LIKE 'err:%permission denied%'
  AND pg_temp.run(NULL, 'SELECT count(*)::text FROM public.vsd_disclosure_choices', true, 'service_role') LIKE 'err:%permission denied%'
  AND pg_temp.run(NULL, 'SELECT count(*)::text FROM public.vsd_disclosure_selections', true, 'anon') LIKE 'err:%permission denied%'
  AND pg_temp.run(NULL, 'SELECT count(*)::text FROM public.vsd_disclosure_selections', true, 'service_role') LIKE 'err:%permission denied%',
  'D2.8 no client or service role reads or writes the disclosure tables');
DO $$
BEGIN
  UPDATE public.vsd_disclosure_authorizations SET permitted_audiences = ARRAY['signed_in_recipient'], purpose = purpose || ' changed';
  RAISE EXCEPTION 'ASSERTION FAILED: D2.9 a disclosure authorization is immutable';
EXCEPTION WHEN check_violation THEN
  IF SQLERRM <> 'VSD_AUTHORIZATION_IMMUTABLE' THEN RAISE; END IF;
  RAISE NOTICE 'ok  D2.9 a disclosure authorization is immutable';
END $$;

-- ══ GROUP D3 · the holder's Passport read ═════════════════════════════════

SELECT pg_temp.ok(
  (SELECT string_agg(e -> 'statement' ->> 'kind', ',' ORDER BY e -> 'statement' ->> 'kind')
          = 'enforcement_debt_none,payment_remarks_none'
      AND bool_and((e ->> 'shareable')::boolean)
      AND bool_and(e ->> 'provenance' = 'self_declared')
     FROM jsonb_array_elements(
       pg_temp.run(:A, 'SELECT public.vsd_my_passport_declarations()::text')::jsonb -> 'declarations') e),
  'D3.1 the holder''s Passport is given their current statements, each self-declared and now shareable');
SELECT pg_temp.ok(
  (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(
     pg_temp.run(:A, 'SELECT public.vsd_my_passport_declarations()::text')::jsonb
       -> 'declarations' -> 0 -> 'statement') k)
  = ARRAY['asOfDate', 'declaredOn', 'jurisdiction', 'kind', 'statementPeriod', 'statementVersion'],
  'D3.2 a statement carries exactly its six keys: no id, document, hash, path, review or provenance');
SELECT pg_temp.ok(
  jsonb_array_length(pg_temp.run(:STRANGER, 'SELECT public.vsd_my_passport_declarations()::text')::jsonb -> 'declarations') = 0
  AND pg_temp.run(:A, 'SELECT public.vsd_my_passport_declarations()::text', false) = 'err:VSD_NOT_AUTHENTICATED'
  AND pg_temp.run(NULL, 'SELECT public.vsd_my_passport_declarations()::text', true, 'anon') LIKE 'err:%permission denied%',
  'D3.3 another user is given none of them, and a signed-out or anonymous caller nothing at all');

-- A supporting document: attached, server-verified, even reviewed. What a
-- recipient would be given must not change by a single byte.
CREATE TEMP TABLE d3_before ON COMMIT DROP AS
  SELECT pg_temp.preview(:A, ARRAY['enforcement_debt_none']) AS preview;
DO $$
DECLARE _d public.vsd_declarations := pg_temp.decl('5d000000-0000-4000-8000-0000000000d1', 'enforcement_debt_none');
BEGIN
  INSERT INTO public.vsd_documents
    (id, holder_user_id, declaration_id, declaration_revision, document_type, jurisdiction, issue_date,
     storage_path, file_name, mime_type, size_bytes, sha256, status, bytes_matched_at)
  VALUES ('5d000000-0000-4000-8000-0000000000f1', _d.holder_user_id, _d.id, _d.revision,
          'enforcement_authority_statement', 'SE', current_date - 3,
          _d.holder_user_id::text || '/5d000000-0000-4000-8000-0000000000f1.pdf', 'SYNTHETIC-fixture.pdf',
          'application/pdf', 1024, repeat('a', 64), 'attached', now());
  INSERT INTO public.vsd_document_reviews (document_id, declaration_id, declaration_revision, outcome)
  VALUES ('5d000000-0000-4000-8000-0000000000f1', _d.id, _d.revision, 'matches_declared_details');
END $$;
SELECT pg_temp.ok(
  (SELECT e ->> 'provenance' = 'document_reviewed'
     FROM jsonb_array_elements(
       pg_temp.run(:A, 'SELECT public.vsd_my_passport_declarations()::text')::jsonb -> 'declarations') e
    WHERE e -> 'statement' ->> 'kind' = 'enforcement_debt_none'),
  'D3.4 fixture: the statement now has a reviewed supporting document');
SELECT pg_temp.ok(
  pg_temp.preview(:A, ARRAY['enforcement_debt_none']) = (SELECT preview FROM d3_before)
  AND pg_temp.preview(:A, ARRAY['enforcement_debt_none']) !~* 'document|review|verified|provenance|sha256|storage|fixture\.pdf',
  'D3.5 a supporting document or its review changes nothing a recipient is given');

-- ══ GROUP D4 · the choice belongs to the link's creation ══════════════════

SELECT pg_temp.ok(
  pg_temp.given(:R, :S2) = '[]'::jsonb AND pg_temp.given(:R, :SB) = '[]'::jsonb
  AND pg_temp.q('NOT EXISTS (SELECT 1 FROM public.vsd_disclosure_selections)'),
  'D4.1 an authorized, shareable statement is on no link until its holder creates a link with it');
SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
               AND p.proname = 'vsd_select_for_disclosure')
  AND (SELECT array_agg(p.proname::text ORDER BY p.proname) FROM pg_proc p
        WHERE p.pronamespace = 'public'::regnamespace
          AND p.prosrc ~* 'insert\s+into\s+public\.vsd_disclosure_(selections|choices)')
      = ARRAY['vsd_create_credential_share'],
  'D4.2 no function takes an existing link: the only writer of a choice or a selection is the one that creates the link');
SELECT pg_temp.ok(
  pg_temp.seal(:LOLD, :A) = 'err:VSD_DISCLOSURE_CHOICE_SEALED'
  AND pg_temp.attach(:LOLD, :A, 'enforcement_debt_none') = 'err:VSD_DISCLOSURE_CHOICE_SEALED'
  AND pg_temp.q('NOT EXISTS (SELECT 1 FROM public.vsd_disclosure_selections)'),
  'D4.3 a link that already existed cannot gain a statement, even by a direct write, however recent it is');
SELECT pg_temp.ok(
  pg_temp.seal(:LOPEN, :A) = 'err:VSD_DISCLOSURE_CHOICE_SEALED'
  AND pg_temp.seal(:L2, :A) = 'err:VSD_DISCLOSURE_CHOICE_SEALED'
  AND pg_temp.attach(:L2, :A, 'enforcement_debt_none') = 'err:VSD_DISCLOSURE_CHOICE_SEALED'
  AND pg_temp.given(:R, :S2) = '[]'::jsonb,
  'D4.4 a link a recipient has opened, or holds a session for, cannot gain a statement');
SELECT pg_temp.ok(
  pg_temp.seal(:LB2, :A) = 'err:VSD_DISCLOSURE_CHOICE_SEALED'
  AND pg_temp.share(:B, :KB, ARRAY['enforcement_debt_none'], :A) = 'err:VSD_DECLARATION_NOT_FOUND'
  AND pg_temp.q(format('NOT EXISTS (SELECT 1 FROM public.sp_disclosures WHERE request_key = %L)', :KB))
  AND pg_temp.run(:B, format('SELECT public.vsd_preview_disclosure(ARRAY[%L]::uuid[], ARRAY[1])::text',
        (pg_temp.decl(:A, 'enforcement_debt_none')).id)) = 'err:VSD_DECLARATION_NOT_FOUND',
  'D4.5 a choice cannot be sealed for somebody else''s link, and nobody shares or previews somebody else''s statement');
SELECT pg_temp.ok(
  pg_temp.run(:A, format(
    'SELECT public.vsd_create_credential_share(ARRAY[%L]::uuid[], ''{}'', 7, ''sv'', %L, ARRAY[%L]::uuid[], ARRAY[%s])::text',
    (SELECT claim_id FROM vsdd_claims WHERE holder = :A), :KX, (pg_temp.decl(:A, 'enforcement_debt_none')).id,
    (pg_temp.decl(:A, 'enforcement_debt_none')).revision + 1)) = 'err:VSD_STALE_REVISION'
  AND pg_temp.run(:A, format(
    'SELECT public.vsd_create_credential_share(ARRAY[%L]::uuid[], ''{}'', 7, ''sv'', %L, ARRAY[%L, %L]::uuid[], ARRAY[1, 1])::text',
    (SELECT claim_id FROM vsdd_claims WHERE holder = :A), :KX, (pg_temp.decl(:A, 'enforcement_debt_none')).id,
    (pg_temp.decl(:A, 'enforcement_debt_none')).id)) = 'err:VSD_INVALID_INPUT'
  AND pg_temp.run(:A, format(
    'SELECT public.vsd_create_credential_share(ARRAY[%L]::uuid[], ''{}'', 7, ''sv'', %L, ARRAY[%L]::uuid[], ''{}'')::text',
    (SELECT claim_id FROM vsdd_claims WHERE holder = :A), :KX, (pg_temp.decl(:A, 'enforcement_debt_none')).id))
    = 'err:VSD_INVALID_INPUT'
  AND pg_temp.run(:A, format(
    'SELECT public.vsd_create_credential_share(ARRAY[%L]::uuid[], ''{}'', 7, ''sv'', NULL, ''{}'', ''{}'')::text',
    (SELECT claim_id FROM vsdd_claims WHERE holder = :A))) = 'err:VSD_INVALID_INPUT'
  AND pg_temp.q(format('NOT EXISTS (SELECT 1 FROM public.sp_disclosures WHERE request_key = %L)', :KX)),
  'D4.6 a refused choice -- a stale revision, a repeated statement, no operation key -- creates no link at all');
SELECT pg_temp.ok(
  pg_temp.run(:A, format(
    'SELECT public.vsd_create_credential_share(ARRAY[%L]::uuid[], ''{}'', 7, ''sv'', %L, ''{}'', ''{}'')::text',
    gen_random_uuid(), :KX)) LIKE 'err:SP_%'
  AND pg_temp.q(format('NOT EXISTS (SELECT 1 FROM public.sp_disclosures WHERE request_key = %L)', :KX))
  AND pg_temp.q(format('NOT EXISTS (SELECT 1 FROM public.vsd_disclosure_choices WHERE request_key = %L)', :KX)),
  'D4.7 a share the Passport itself refuses seals nothing');

SAVEPOINT d4_application;
-- A synthetic application address: the foreign key is dropped, and the
-- verified-content trigger disabled, inside this savepoint only, so no job,
-- employer or credential fixture is needed.
DO $$
DECLARE _c text;
BEGIN
  SELECT conname INTO STRICT _c FROM pg_constraint
   WHERE conrelid = 'public.sp_disclosures'::regclass AND contype = 'f'
     AND confrelid = 'public.job_applications'::regclass;
  EXECUTE format('ALTER TABLE public.sp_disclosures DROP CONSTRAINT %I', _c);
END $$;
ALTER TABLE public.sp_disclosures DISABLE TRIGGER sp_application_verified_content;
INSERT INTO public.sp_disclosures (id, holder_user_id, package_code, token_hash, application_id, expires_at, request_key)
VALUES (:LAPP, :A, 'employer_review', NULL, gen_random_uuid(), now() + interval '7 days', gen_random_uuid());
SELECT pg_temp.ok(
  pg_temp.seal(:LAPP, :A) = 'err:VSD_DISCLOSURE_CHOICE_SEALED',
  'D4.8 an application disclosure cannot carry a statement');
ROLLBACK TO SAVEPOINT d4_application;

CREATE TEMP TABLE d4_preview ON COMMIT DROP AS
  SELECT pg_temp.preview(:A, ARRAY['enforcement_debt_none'])::jsonb AS preview;
CREATE TEMP TABLE d4_created ON COMMIT DROP AS
  SELECT pg_temp.j(pg_temp.share(:A, :K1, ARRAY['enforcement_debt_none'])) AS r;
SELECT quote_literal(coalesce((SELECT r ->> 'disclosure_id' FROM d4_created), '00000000-0000-4000-8000-000000000000')) AS "L1" \gset
SELECT pg_temp.ok(
  (SELECT r ->> 'status' = 'created' AND r ->> 'declarations' = '1' AND length(r ->> 'token') > 20 FROM d4_created)
  AND (SELECT count(*) = 1 FROM public.sp_disclosures WHERE id = :L1 AND holder_user_id = :A AND request_key = :K1)
  AND (SELECT count(*) = 1 FROM public.vsd_disclosure_choices
        WHERE disclosure_id = :L1 AND request_key = :K1 AND choice_count = 1)
  AND (SELECT count(*) = 1 FROM public.vsd_disclosure_selections WHERE disclosure_id = :L1),
  'D4.9 one call creates the link, seals the choice and records the one chosen statement');
SELECT pg_temp.session(:L1, :S1);
SELECT pg_temp.ok(
  pg_temp.given(:R, :S1) = (SELECT preview -> 'items' FROM d4_preview)
  AND pg_temp.kinds(pg_temp.given(:R, :S1)) = 'enforcement_debt_none',
  'D4.10 the recipient is given exactly what the holder previewed, and only the selected statement');
SELECT pg_temp.ok(
  pg_temp.given(:R, :S2) = '[]'::jsonb AND pg_temp.given(:R, :SB) = '[]'::jsonb,
  'D4.11 the holder''s other links, and every other link, still carry nothing');
SELECT pg_temp.ok(
  (SELECT r ->> 'status' = 'already_created' AND r ->> 'declarations' = '1' AND NOT (r ? 'token')
          AND r ->> 'disclosure_id' = :L1
     FROM (SELECT pg_temp.j(pg_temp.share(:A, :K1, ARRAY['enforcement_debt_none'])) AS r) x)
  AND (SELECT r ->> 'status' = 'already_created'
     FROM (SELECT pg_temp.j(pg_temp.share(:A, :K1, ARRAY['enforcement_debt_none'])) AS r) x)
  AND pg_temp.q(format('(SELECT count(*) = 1 FROM public.vsd_disclosure_selections WHERE disclosure_id = %L)', :L1))
  AND pg_temp.q(format('(SELECT count(*) = 1 FROM public.sp_disclosures WHERE request_key = %L)', :K1))
  AND pg_temp.kinds(pg_temp.given(:R, :S1)) = 'enforcement_debt_none',
  'D4.12 a retry of the same operation, repeated, creates no second link, changes nothing and returns no address');
SELECT pg_temp.ok(
  pg_temp.share(:A, :K1, ARRAY['enforcement_debt_none', 'payment_remarks_none']) = 'err:VSD_DISCLOSURE_CHOICE_SEALED'
  AND pg_temp.share(:A, :K1, ARRAY['payment_remarks_none']) = 'err:VSD_DISCLOSURE_CHOICE_SEALED'
  AND pg_temp.share(:A, :K1, '{}') = 'err:VSD_DISCLOSURE_CHOICE_SEALED'
  AND pg_temp.attach(:L1, :A, 'payment_remarks_none') = 'err:VSD_DISCLOSURE_CHOICE_SEALED'
  AND pg_temp.kinds(pg_temp.given(:R, :S1)) = 'enforcement_debt_none',
  'D4.13 the sealed choice cannot be widened, swapped or emptied -- by a retry or by a direct write');
SELECT pg_temp.ok(
  pg_temp.share(:A, :K1, ARRAY['enforcement_debt_none'], NULL, ARRAY['holder_name']) LIKE 'err:SP_REQUEST_KEY_CONFLICT%'
  AND pg_temp.kinds(pg_temp.given(:R, :S1)) = 'enforcement_debt_none',
  'D4.14 the same key for a different share is refused by the Passport, and nothing changes');
DO $$
BEGIN
  UPDATE public.vsd_disclosure_selections SET declaration_revision = declaration_revision + 1;
  RAISE EXCEPTION 'ASSERTION FAILED: D4.15 a selection cannot be re-pointed at another revision';
EXCEPTION WHEN check_violation THEN
  IF SQLERRM <> 'VSD_DISCLOSURE_SELECTION_IMMUTABLE' THEN RAISE; END IF;
  RAISE NOTICE 'ok  D4.15 a selection cannot be re-pointed at another revision';
END $$;
DO $$
BEGIN
  UPDATE public.vsd_disclosure_choices SET choice_count = 3;
  RAISE EXCEPTION 'ASSERTION FAILED: D4.16 a sealed choice cannot be changed';
EXCEPTION WHEN check_violation THEN
  IF SQLERRM <> 'VSD_DISCLOSURE_CHOICE_SEALED' THEN RAISE; END IF;
  RAISE NOTICE 'ok  D4.16 a sealed choice cannot be changed';
END $$;

-- An EMPTY choice is sealed too: that link never carries a statement.
CREATE TEMP TABLE d4_empty ON COMMIT DROP AS
  SELECT pg_temp.j(pg_temp.share(:A, :K4, '{}')) AS r;
SELECT quote_literal(coalesce((SELECT r ->> 'disclosure_id' FROM d4_empty), '00000000-0000-4000-8000-000000000000')) AS "L4" \gset
SELECT pg_temp.session(:L4, :S4) WHERE EXISTS (SELECT 1 FROM public.sp_disclosures WHERE id = :L4);
SELECT pg_temp.ok(
  (SELECT r ->> 'status' = 'created' AND r ->> 'declarations' = '0' AND length(r ->> 'token') > 20 FROM d4_empty)
  AND (SELECT count(*) = 1 FROM public.vsd_disclosure_choices WHERE disclosure_id = :L4 AND choice_count = 0)
  AND pg_temp.j(pg_temp.share(:A, :K4, '{}')) ->> 'status' = 'already_created'
  AND pg_temp.share(:A, :K4, ARRAY['enforcement_debt_none']) = 'err:VSD_DISCLOSURE_CHOICE_SEALED'
  AND pg_temp.attach(:L4, :A, 'enforcement_debt_none') = 'err:VSD_DISCLOSURE_CHOICE_SEALED'
  AND pg_temp.q(format('NOT EXISTS (SELECT 1 FROM public.vsd_disclosure_selections WHERE disclosure_id = %L)', :L4))
  AND pg_temp.given(:R, :S4) = '[]'::jsonb,
  'D4.17 an empty choice is sealed: a link created without statements can never gain one');

-- A link the Passport created by itself, under a key the bridge never saw.
CREATE TEMP TABLE d4_plain ON COMMIT DROP AS
  SELECT pg_temp.j(pg_temp.run(:A, format(
    'SELECT public.sp_create_credential_disclosure_v2(ARRAY[%L]::uuid[], ''{}'', 7, NULL, NULL, ''sv'', %L)::text',
    (SELECT claim_id FROM vsdd_claims WHERE holder = :A), :K2))) AS r;
SELECT pg_temp.ok(
  (SELECT r ->> 'status' = 'created' FROM d4_plain)
  AND pg_temp.share(:A, :K2, ARRAY['enforcement_debt_none']) = 'err:VSD_DISCLOSURE_CHOICE_SEALED'
  AND pg_temp.share(:A, :K2, '{}') = 'err:VSD_DISCLOSURE_CHOICE_SEALED'
  AND pg_temp.q(format('NOT EXISTS (SELECT 1 FROM public.vsd_disclosure_choices WHERE request_key = %L)', :K2))
  AND pg_temp.q(format('(SELECT count(*) = 1 FROM public.sp_disclosures WHERE request_key = %L)', :K2)),
  'D4.18 a link created without the bridge cannot be claimed afterwards by replaying its own key');

-- A REISSUED copy of the link that carries the statement.
CREATE TEMP TABLE d4_reissue ON COMMIT DROP AS
  SELECT pg_temp.j(pg_temp.run(:A, format(
    'SELECT public.sp_replace_selected_disclosure(%L, false, %L)::text', :L1, :K3))) AS r;
SELECT quote_literal(coalesce((SELECT r ->> 'disclosure_id' FROM d4_reissue), '00000000-0000-4000-8000-000000000000')) AS "L3" \gset
SELECT pg_temp.session(:L3, :S3) WHERE EXISTS (SELECT 1 FROM public.sp_disclosures WHERE id = :L3);
SELECT pg_temp.ok(
  (SELECT r ->> 'status' = 'created' FROM d4_reissue) AND :L3 <> :L1
  AND pg_temp.given(:R, :S3) = '[]'::jsonb
  AND pg_temp.share(:A, :K3, ARRAY['enforcement_debt_none']) = 'err:VSD_DISCLOSURE_CHOICE_SEALED'
  AND pg_temp.q(format('NOT EXISTS (SELECT 1 FROM public.vsd_disclosure_selections WHERE disclosure_id = %L)', :L3))
  AND pg_temp.q(format('NOT EXISTS (SELECT 1 FROM public.vsd_disclosure_choices WHERE disclosure_id = %L)', :L3))
  AND pg_temp.kinds(pg_temp.given(:R, :S1)) = 'enforcement_debt_none',
  'D4.19 a reissued link carries no statement and cannot gain one; the original is unchanged');

SELECT pg_temp.ok(
  pg_temp.j(pg_temp.run(:A, format('SELECT public.vsd_share_operation(%L)::text', :K1)))
    @> jsonb_build_object('status', 'sealed', 'declarations', 1, 'disclosure_id', :L1)
  AND pg_temp.j(pg_temp.run(:A, format('SELECT public.vsd_share_operation(%L)::text', :K4)))
    @> '{"status": "sealed", "declarations": 0}'::jsonb
  AND pg_temp.j(pg_temp.run(:A, format('SELECT public.vsd_share_operation(%L)::text', :K2)))
    @> '{"status": "unsealed", "declarations": 0}'::jsonb
  AND pg_temp.j(pg_temp.run(:A, format('SELECT public.vsd_share_operation(%L)::text', :KX))) = '{"status": "none"}'::jsonb
  AND pg_temp.j(pg_temp.run(:B, format('SELECT public.vsd_share_operation(%L)::text', :K1))) = '{"status": "none"}'::jsonb
  AND pg_temp.run(NULL, format('SELECT public.vsd_share_operation(%L)::text', :K1), true, 'anon') LIKE 'err:%permission denied%'
  AND pg_temp.run(:A, format('SELECT public.vsd_share_operation(%L)::text', :K1)) !~* 'token|5d000000-0000-4000-8000-0000000000d',
  'D4.20 the holder can ask what one operation really committed -- sealed, unsealed or nothing -- and nobody else can');

-- ══ GROUP D5 · the recipient ══════════════════════════════════════════════

SELECT pg_temp.ok(
  (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(pg_temp.given(:R, :S1) -> 0) k)
    = ARRAY['asOfDate', 'declaredOn', 'jurisdiction', 'kind', 'statementPeriod', 'statementVersion']
  AND pg_temp.given(:R, :S1) -> 0 ->> 'asOfDate' = current_date::text
  AND pg_temp.given(:R, :S1) -> 0 ->> 'statementVersion' = 'se-enforcement-v1'
  AND pg_temp.given(:R, :S1)::text !~* '5d000000|document|review|verified|provenance|sha256|storage',
  'D5.1 a signed-in recipient holding the link is given the subject, the date and the wording version, and nothing else');
SELECT pg_temp.ok(
  pg_temp.run(NULL, format('SELECT public.vsd_read_disclosed(%L)::text', :S1), true, 'anon')
    LIKE 'err:%permission denied%',
  'D5.2 an anonymous holder of the link is refused');
SELECT pg_temp.ok(
  pg_temp.run(NULL, format('SELECT public.vsd_read_disclosed(%L)::text', :S1), true, 'service_role')
    LIKE 'err:%permission denied%',
  'D5.3 the service role, which serves the anonymous Passport, cannot read a statement');
SELECT pg_temp.ok(
  pg_temp.given(:R, :S1, false) = jsonb_build_object('err', 'err:VSD_NOT_AUTHENTICATED'),
  'D5.4 a recipient whose own session has ended is refused');
SELECT pg_temp.ok(
  pg_temp.given(:R, repeat('9', 64)) = '[]'::jsonb
  AND pg_temp.given(:R, '') = '[]'::jsonb
  AND pg_temp.given(:R, (SELECT token_hash FROM public.sp_disclosures WHERE id = :L1)) = '[]'::jsonb
  AND pg_temp.given(:R, (SELECT session_hash FROM public.sp_share_sessions WHERE disclosure_id = :L1)) = '[]'::jsonb,
  'D5.5 being signed in reaches nothing without the link''s own share session: not a guess, the token hash or the stored hash');
SELECT pg_temp.ok(
  pg_temp.given(:R, :S2) = '[]'::jsonb AND pg_temp.given(:R, :SB) = '[]'::jsonb,
  'D5.6 another link''s share session does not open this link''s statement');

SAVEPOINT d5_session_expired;
UPDATE public.sp_share_sessions SET created_at = now() - interval '1 hour', expires_at = now() - interval '31 minutes'
 WHERE disclosure_id = :L1;
SELECT pg_temp.ok(pg_temp.given(:R, :S1) = '[]'::jsonb,
  'D5.7 an expired share session opens nothing');
ROLLBACK TO SAVEPOINT d5_session_expired;

SELECT pg_temp.ok(
  pg_temp.q(format('(SELECT count(*) > 0 AND bool_and(recipient_user_id = %L) FROM public.vsd_disclosure_accesses)', :R)),
  'D5.8 every read that gave a recipient a statement is recorded against that recipient');
SAVEPOINT d5_holder_read;
DELETE FROM public.vsd_disclosure_accesses;
SELECT pg_temp.ok(
  pg_temp.kinds(pg_temp.given(:A, :S1)) = 'enforcement_debt_none'
  AND pg_temp.q('NOT EXISTS (SELECT 1 FROM public.vsd_disclosure_accesses)')
  AND pg_temp.given(:R, repeat('9', 64)) = '[]'::jsonb
  AND pg_temp.q('NOT EXISTS (SELECT 1 FROM public.vsd_disclosure_accesses)'),
  'D5.9 the holder opening their own link, and a read that gave nothing, record no disclosure');
ROLLBACK TO SAVEPOINT d5_holder_read;
SELECT pg_temp.ok(
  (SELECT (e ->> 'disclosable')::boolean AND (e ->> 'accessCount')::int > 0 AND e ->> 'kind' = 'enforcement_debt_none'
          AND e::text NOT LIKE '%5d000000-0000-4000-8000-0000000000d3%'
     FROM jsonb_array_elements(pg_temp.run(:A, 'SELECT public.vsd_my_disclosure_selections()::text')::jsonb) e)
  AND pg_temp.run(:B, 'SELECT public.vsd_my_disclosure_selections()::text') = '[]',
  'D5.10 the holder sees that and how often it was read, never by whom; nobody else sees the selection');

-- ══ GROUP D6 · lifecycle ══════════════════════════════════════════════════

SAVEPOINT d6;
SELECT pg_temp.ok(
  pg_temp.run(:B, format('SELECT public.vsd_withdraw_disclosure_selection(%L)::text',
     (SELECT id FROM public.vsd_disclosure_selections WHERE disclosure_id = :L1))) = 'err:VSD_DISCLOSURE_NOT_FOUND'
  AND pg_temp.kinds(pg_temp.given(:R, :S1)) = 'enforcement_debt_none',
  'D6.1 nobody but the holder can withdraw a selection');
SELECT pg_temp.ok(
  pg_temp.run(:A, format('SELECT public.vsd_withdraw_disclosure_selection(%L)::text',
     (SELECT id FROM public.vsd_disclosure_selections WHERE disclosure_id = :L1)))::jsonb = '{"withdrawn": true}'::jsonb
  AND pg_temp.given(:R, :S1) = '[]'::jsonb
  AND pg_temp.q(format('(SELECT revoked_at IS NULL FROM public.sp_disclosures WHERE id = %L)', :L1)),
  'D6.2 the holder stops sharing one statement: the next read gives nothing, and the link itself still stands');
SELECT pg_temp.ok(
  pg_temp.j(pg_temp.share(:A, :K1, ARRAY['enforcement_debt_none'])) ->> 'status' = 'already_created'
  AND pg_temp.attach(:L1, :A, 'enforcement_debt_none') LIKE 'err:%'
  AND pg_temp.given(:R, :S1) = '[]'::jsonb,
  'D6.3 a withdrawn selection is not revived by repeating the operation, nor replaced by a direct write');
DO $$
BEGIN
  UPDATE public.vsd_disclosure_selections SET withdrawn_at = NULL WHERE withdrawn_at IS NOT NULL;
  RAISE EXCEPTION 'ASSERTION FAILED: D6.3b a withdrawal cannot be undone';
EXCEPTION WHEN check_violation THEN
  IF SQLERRM <> 'VSD_DISCLOSURE_SELECTION_IMMUTABLE' THEN RAISE; END IF;
  RAISE NOTICE 'ok  D6.3b a withdrawal cannot be undone';
END $$;
ROLLBACK TO SAVEPOINT d6;

SAVEPOINT d6;
SELECT pg_temp.ok(
  pg_temp.run(:A, format('SELECT public.sp_revoke_disclosure(%L)', :L1)) NOT LIKE 'err:%'
  AND pg_temp.given(:R, :S1) = '[]'::jsonb,
  'D6.4 revoking the link ends disclosure at once');
ROLLBACK TO SAVEPOINT d6;

SAVEPOINT d6;
UPDATE public.sp_disclosures SET expires_at = now() - interval '1 second' WHERE id = :L1;
SELECT pg_temp.ok(pg_temp.given(:R, :S1) = '[]'::jsonb,
  'D6.5 an expired link discloses nothing');
ROLLBACK TO SAVEPOINT d6;

SAVEPOINT d6;
SELECT pg_temp.ok(
  pg_temp.run(:A, format('SELECT public.vsd_withdraw_declaration(%L)::text',
     (pg_temp.decl(:A, 'enforcement_debt_none')).id)) NOT LIKE 'err:%'
  AND pg_temp.given(:R, :S1) = '[]'::jsonb,
  'D6.6 withdrawing the statement ends disclosure at once');
SELECT pg_temp.ok(
  pg_temp.save(:A, 'enforcement_debt_none', 'se-enforcement-v1', (pg_temp.decl(:A, 'enforcement_debt_none')).revision)
    NOT LIKE 'err:%'
  AND pg_temp.q(format('(SELECT status = ''active'' FROM public.vsd_declarations WHERE holder_user_id = %L AND declaration_kind = ''enforcement_debt_none'')', :A))
  AND pg_temp.given(:R, :S1) = '[]'::jsonb,
  'D6.7 making the statement again does not put it back on the old link');
ROLLBACK TO SAVEPOINT d6;

SAVEPOINT d6;
SELECT pg_temp.ok(
  pg_temp.save(:A, 'enforcement_debt_none', 'se-enforcement-v1', (pg_temp.decl(:A, 'enforcement_debt_none')).revision)
    NOT LIKE 'err:%'
  AND pg_temp.given(:R, :S1) = '[]'::jsonb,
  'D6.8 a changed or renewed statement is a new revision: the link stops disclosing the old one and never gains the new');
ROLLBACK TO SAVEPOINT d6;

SAVEPOINT d6;
SELECT pg_temp.ok(
  pg_temp.run(:A, format('SELECT public.vsd_delete_declaration(%L)::text',
     (pg_temp.decl(:A, 'enforcement_debt_none')).id)) NOT LIKE 'err:%'
  AND pg_temp.given(:R, :S1) = '[]'::jsonb,
  'D6.9 deleting the statement ends disclosure at once, whether or not its file is erased yet');
ROLLBACK TO SAVEPOINT d6;

SAVEPOINT d6;
UPDATE public.vsd_declarations SET retain_until = now() - interval '1 second'
 WHERE holder_user_id = :A AND declaration_kind = 'enforcement_debt_none';
SELECT pg_temp.ok(
  pg_temp.given(:R, :S1) = '[]'::jsonb
  AND pg_temp.q(format('(SELECT status = ''active'' FROM public.vsd_declarations WHERE holder_user_id = %L AND declaration_kind = ''enforcement_debt_none'')', :A))
  AND (SELECT count(*) = 1 FROM jsonb_array_elements(
         pg_temp.run(:A, 'SELECT public.vsd_my_passport_declarations()::text')::jsonb -> 'declarations')),
  'D6.10 past retention the recipient is given nothing and the holder''s Passport no shield, before any reconciliation');
ROLLBACK TO SAVEPOINT d6;

SAVEPOINT d6;
UPDATE public.vsd_disclosure_authorizations da SET revoked_at = now()
  FROM public.vsd_processing_authorizations a
 WHERE a.id = da.authorization_id AND a.declaration_kind = 'enforcement_debt_none';
SELECT pg_temp.ok(
  pg_temp.given(:R, :S1) = '[]'::jsonb
  AND pg_temp.preview(:A, ARRAY['enforcement_debt_none']) = 'err:VSD_DISCLOSURE_NOT_AUTHORIZED'
  AND (SELECT (e ->> 'shareable')::boolean IS FALSE
         FROM jsonb_array_elements(
           pg_temp.run(:A, 'SELECT public.vsd_my_passport_declarations()::text')::jsonb -> 'declarations') e
        WHERE e -> 'statement' ->> 'kind' = 'enforcement_debt_none'),
  'D6.11 revoking the disclosure authorization ends disclosure at once; the holder keeps their own statement');
SELECT pg_temp.ok(
  pg_temp.disclosure_auth('enforcement_debt_none', 'consent', NULL, ARRAY['signed_in_recipient']) = 'ok'
  AND pg_temp.preview(:A, ARRAY['enforcement_debt_none']) NOT LIKE 'err:%'
  AND pg_temp.given(:R, :S1) = '[]'::jsonb,
  'D6.12 a later disclosure authorization does not revive a selection made under the revoked one');
ROLLBACK TO SAVEPOINT d6;

SAVEPOINT d6;
UPDATE public.vsd_processing_authorizations SET revoked_at = now() WHERE declaration_kind = 'enforcement_debt_none';
SELECT pg_temp.ok(
  pg_temp.given(:R, :S1) = '[]'::jsonb
  AND pg_temp.q(format('(SELECT count(*) = 1 FROM public.vsd_declarations WHERE holder_user_id = %L AND declaration_kind = ''enforcement_debt_none'')', :A))
  AND (SELECT count(*) = 1 FROM jsonb_array_elements(
         pg_temp.run(:A, 'SELECT public.vsd_my_passport_declarations()::text')::jsonb -> 'declarations')),
  'D6.13 revoking the collection authorization ends disclosure and the holder''s shield at once, before any reconciliation');
ROLLBACK TO SAVEPOINT d6;

SELECT pg_temp.ok(
  pg_temp.kinds(pg_temp.given(:R, :S1)) = 'enforcement_debt_none',
  'D6.14 with none of that done, the statement is still disclosed');

-- ══ GROUP D7 · isolation, privileges, erasure, rollback ═══════════════════

SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg_temp%'
       AND p.proname NOT LIKE 'vsd\_%' AND p.prokind IN ('f', 'p')
       AND p.prosrc ~* '\mvsd_')
  AND NOT EXISTS (SELECT 1 FROM pg_views WHERE schemaname NOT IN ('pg_catalog', 'information_schema') AND definition ~* '\mvsd_')
  AND NOT EXISTS (SELECT 1 FROM pg_matviews WHERE definition ~* '\mvsd_'),
  'D7.1 no Passport, share, talent, application or other function or view names a vsd_ object');
SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.contype = 'f' AND c.confrelid::regclass::text LIKE 'vsd\_%'
       AND c.conrelid::regclass::text NOT LIKE 'vsd\_%')
  AND NOT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
     WHERE NOT t.tgisinternal AND p.proname LIKE 'vsd\_%' AND t.tgrelid::regclass::text NOT LIKE 'vsd\_%'),
  'D7.2 no other table references, or is triggered by, a vsd_ object');
SELECT pg_temp.ok(
  public.sp_get_disclosure_session(:S1)::text !~* 'enforcement|statementVersion|se-enforcement|asOfDate'
  AND public.sp_get_disclosure('vsd-suite-none')::text !~* 'enforcement|statementVersion',
  'D7.3 the anonymous Passport read of the very same link carries no trace of the statement');
SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace AND p.proname LIKE 'vsd\_%'
       AND (has_function_privilege('anon', p.oid, 'EXECUTE')
            OR EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a WHERE a.grantee = 0))),
  'D7.4 anon and PUBLIC execute no vsd_ function');
SELECT pg_temp.ok(
  (SELECT array_agg(p.proname::text ORDER BY p.proname) FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND (p.proname LIKE 'vsd\_%disclos%' OR p.proname LIKE 'vsd\_%share%' OR p.proname LIKE 'vsd\_choice%'
           OR p.proname = 'vsd_my_passport_declarations')
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE'))
  = ARRAY['vsd_create_credential_share', 'vsd_my_disclosure_selections', 'vsd_my_passport_declarations',
          'vsd_preview_disclosure', 'vsd_read_disclosed', 'vsd_share_operation',
          'vsd_withdraw_disclosure_selection']
  AND NOT EXISTS (
    SELECT 1 FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace
       AND (p.proname LIKE 'vsd\_%disclos%' OR p.proname LIKE 'vsd\_%share%' OR p.proname LIKE 'vsd\_choice%'
            OR p.proname = 'vsd_my_passport_declarations')
       AND has_function_privilege('service_role', p.oid, 'EXECUTE')),
  'D7.5 a signed-in user executes exactly the seven bridge functions, and the service role none');
SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM pg_class c
     WHERE c.relnamespace = 'public'::regnamespace AND c.relname LIKE 'vsd\_disclosure\_%' AND c.relkind = 'r'
       AND (has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
         OR has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
         OR has_table_privilege('service_role', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
         OR NOT c.relrowsecurity))
  AND (SELECT count(*) = 4 FROM pg_class c
        WHERE c.relnamespace = 'public'::regnamespace AND c.relname LIKE 'vsd\_disclosure\_%' AND c.relkind = 'r'),
  'D7.6 no client or service role holds any privilege on the four disclosure tables, and RLS is on');
SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name LIKE 'vsd\_disclosure\_%'
       AND column_name ~* '(score|rank|rating|risk|suitab|decision|verified|clean|amount|creditor|offen[cs]e_(type|detail)|explanation|note|comment|personnummer|identity_number|national_id|token|path|sha|hash)'),
  'D7.7 no disclosure column can hold a verdict, an explanation, an identity number, a token, a path or a hash');

SAVEPOINT d7_erasure;
-- A holder with nothing but a statement on a link, so that deleting the
-- account exercises the bridge's own cascades and nothing of the Passport's.
-- The direct writes are accepted here because they ARE the link's creation:
-- the same transaction, the link's own key, nobody holding it yet.
INSERT INTO auth.users (id, email, email_confirmed_at, raw_user_meta_data)
VALUES ('5d000000-0000-4000-8000-0000000000d5', 'vsdd-holder-e@test.invalid', now(), '{}');
INSERT INTO auth.sessions (id, user_id)
VALUES ('5d000000-0000-4000-8000-0000000000d5', '5d000000-0000-4000-8000-0000000000d5');
\set E '''5d000000-0000-4000-8000-0000000000d5'''
\set LE '''5d000000-0000-4000-8000-000000000017'''
\set SE '''7777777777777777777777777777777777777777777777777777777777777777'''
SELECT pg_temp.link(:LE, :E, NULL);
CREATE TEMP TABLE d7_direct ON COMMIT DROP AS
  SELECT pg_temp.save(:E, 'payment_remarks_none', 'se-remarks-v1', NULL) AS saved, NULL::text AS sealed,
         NULL::text AS first, NULL::text AS second;
UPDATE d7_direct SET sealed = pg_temp.seal(:LE, :E);
UPDATE d7_direct SET first = pg_temp.attach(:LE, :E, 'payment_remarks_none');
UPDATE d7_direct SET second = pg_temp.attach(:LE, :E, 'payment_remarks_none');
SELECT pg_temp.session(:LE, :SE);
SELECT pg_temp.ok(
  (SELECT saved NOT LIKE 'err:%' AND sealed = 'ok' AND first = 'ok' AND second LIKE 'err:%' FROM d7_direct)
  AND pg_temp.kinds(pg_temp.given(:R, :SE)) = 'payment_remarks_none',
  'D7.8 fixture: a choice sealed while its link is created is accepted, once, and disclosed');
DELETE FROM auth.users WHERE id = :R;
SELECT pg_temp.ok(
  (SELECT count(*) > 0 AND bool_and(recipient_user_id IS NULL) FROM public.vsd_disclosure_accesses),
  'D7.9 erasing a recipient''s account keeps the event and removes who it was');
DELETE FROM auth.users WHERE id = :E;
SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM public.vsd_disclosure_selections WHERE holder_user_id = :E)
  AND NOT EXISTS (SELECT 1 FROM public.vsd_disclosure_choices WHERE holder_user_id = :E)
  AND NOT EXISTS (SELECT 1 FROM public.vsd_disclosure_accesses a
                   WHERE NOT EXISTS (SELECT 1 FROM public.vsd_disclosure_selections s WHERE s.id = a.selection_id))
  AND NOT EXISTS (SELECT 1 FROM public.vsd_declarations WHERE holder_user_id = :E)
  AND (SELECT count(*) = 2 FROM pg_constraint c
        WHERE c.contype = 'f' AND c.confrelid = 'auth.users'::regclass AND c.confdeltype = 'c'
          AND c.conrelid IN ('public.vsd_disclosure_selections'::regclass, 'public.vsd_disclosure_choices'::regclass)),
  'D7.10 erasing a holder''s account removes their sealed choices, selections and every record of their reads');
ROLLBACK TO SAVEPOINT d7_erasure;

-- The real rollback, with selections and read records present.
\ir ../rollback/20270325090000_vsd_passport_disclosure_rollback.sql
SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relname LIKE 'vsd\_disclosure\_%')
  AND NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
                     AND (p.proname LIKE 'vsd\_%disclos%' OR p.proname LIKE 'vsd\_%share%' OR p.proname LIKE 'vsd\_choice%'
                          OR p.proname = 'vsd_my_passport_declarations'))
  AND (SELECT count(*) = 30 FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname LIKE 'vsd\_%')
  AND (SELECT count(*) = 2 FROM public.vsd_declarations WHERE holder_user_id = :A)
  AND obj_description('public.vsd_declarations'::regclass) LIKE '%never shared.',
  'D7.11 the rollback removes the bridge and leaves the thirty collection functions and every statement as they were');
\ir ../migrations/20270325090000_vsd_passport_disclosure.sql
SELECT pg_temp.ok(
  to_regclass('public.vsd_disclosure_selections') IS NOT NULL
  AND (SELECT count(*) = 0 FROM public.vsd_disclosure_authorizations)
  AND pg_temp.given(:R, :S1) = '[]'::jsonb
  AND pg_temp.preview(:A, ARRAY['enforcement_debt_none']) = 'err:VSD_DISCLOSURE_NOT_AUTHORIZED',
  'D7.12 the migration re-applies cleanly after a rollback, closed again');

ROLLBACK;
