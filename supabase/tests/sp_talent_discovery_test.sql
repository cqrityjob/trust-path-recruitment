-- 20270317090000: voluntary discoverability, the holder's half.
--
--   TD-F  fixture: holder A (merits incl. a scoped authorisation and an
--         experience period), holder B, a job application with a Passport
--         disclosure by B.
--   TD1   off by default: no row, private, no account enabled by the migration.
--   TD2   enabling needs an explicit consent version and at least one item;
--         an application disclosure is not consent.
--   TD3   only the holder's own, current entries can be selected; preferences
--         are validated against the platform vocabularies.
--   TD4   the preview is exactly the employer card: no numbers, documents,
--         notes, scope text, employer names, names or contact details;
--         review level wording is document_reviewed, never issuer.
--   TD5   version guard: a stale save is refused.
--   TD6   pausing rotates the reference and keeps the selection; re-enabling
--         gets a new reference; every change is in the consent history.
--   TD7   a correction follows the selection but not the approval.
--   TD8   no client DML, no direct card read, search_ref unreadable.
--
-- Synthetic principals; everything rolls back.

\set ON_ERROR_STOP on
SET client_min_messages TO NOTICE;
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.ok(cond boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF cond IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: %', label; END IF;
  RAISE NOTICE 'ok  %', label;
END $$;
CREATE OR REPLACE FUNCTION pg_temp.as_user(_uid text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', _uid, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _uid)::text, true);
END $$;
CREATE OR REPLACE FUNCTION pg_temp.try_as(_uid text, _sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE _r text := 'ok';
BEGIN
  PERFORM pg_temp.as_user(_uid);
  SET LOCAL ROLE authenticated;
  BEGIN EXECUTE _sql; EXCEPTION WHEN OTHERS THEN _r := 'err:' || split_part(SQLERRM, ':', 1); END;
  RESET ROLE;
  PERFORM pg_temp.as_user('');
  RETURN _r;
END $$;
CREATE OR REPLACE FUNCTION pg_temp.j_as(_uid text, _sql text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE _r jsonb;
BEGIN
  PERFORM pg_temp.as_user(_uid);
  SET LOCAL ROLE authenticated;
  EXECUTE _sql INTO _r;
  RESET ROLE;
  PERFORM pg_temp.as_user('');
  RETURN _r;
END $$;
CREATE OR REPLACE FUNCTION pg_temp.claim(_holder uuid, _code text, _valid_until date, _scope text DEFAULT NULL, _ref text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE d public.sp_approved_credential_catalogue%ROWTYPE; _id uuid;
BEGIN
  SELECT * INTO d FROM public.sp_approved_credential_catalogue WHERE code = _code;
  INSERT INTO public.sp_claims (holder_user_id, claim_type, title, credential_code, claimed_issuer_name,
                                jurisdiction_code, sub_jurisdiction_code, valid_until, authorisation_scope,
                                credential_reference, lifecycle_state, assertion_level)
  VALUES (_holder, d.claim_type, d.name_en, _code, coalesce(d.issuer_name, 'Synthetic issuer'),
          d.country, d.region, _valid_until, _scope, _ref, 'active', 'self_declared')
  RETURNING id INTO _id;
  RETURN _id;
END $$;
CREATE OR REPLACE FUNCTION pg_temp.save_sql(_version int, _vis text, _consent text, _claims uuid[], _periods uuid[], _prefs jsonb) RETURNS text
LANGUAGE sql AS $$
  SELECT format('SELECT public.sp_talent_save_settings(%s, %L, %L, %L::uuid[], %L::uuid[], %L::jsonb)',
                _version, _vis, _consent, _claims, _periods, _prefs);
$$;

CREATE TEMP TABLE f AS SELECT
  'a7170000-0000-4000-8000-00000000000a'::uuid AS a,
  'a7170000-0000-4000-8000-00000000000b'::uuid AS b,
  'a7170000-0000-4000-8000-00000000000c'::uuid AS v,
  'a7170000-1111-4000-8000-000000000001'::uuid AS employer,
  'a7170000-2222-4000-8000-000000000001'::uuid AS job;
GRANT SELECT ON f TO PUBLIC;
INSERT INTO auth.users (id, email) SELECT a, 'td-a@synthetic.invalid' FROM f
  UNION ALL SELECT b, 'td-b@synthetic.invalid' FROM f UNION ALL SELECT v, 'td-v@synthetic.invalid' FROM f;
UPDATE public.profiles SET display_name = 'Anna Syntetisk' WHERE id = (SELECT a FROM f);
INSERT INTO public.user_roles (user_id, role) SELECT v, 'passport_verifier'::public.app_role FROM f;

CREATE TEMP TABLE c AS SELECT
  pg_temp.claim((SELECT a FROM f), 'INTL_ASIS_CPP', current_date + 400, NULL, 'CPP-123456') AS cpp,
  pg_temp.claim((SELECT a FROM f), 'SV', current_date + 30, 'Synthetic protected object Kärnkraftverk X') AS sv,
  pg_temp.claim((SELECT a FROM f), 'VU1', NULL) AS vu1,
  pg_temp.claim((SELECT b FROM f), 'OV', current_date + 200) AS b_ov;
GRANT SELECT ON c TO PUBLIC;
INSERT INTO public.sp_experience_periods (id, holder_user_id, employer_name, role_title, started_on, ended_on, security_relevance)
SELECT 'a7170000-3333-4000-8000-000000000001', a, 'Hemlig Arbetsgivare AB', 'Väktare', current_date - 800, current_date - 100, 'primary' FROM f;
-- A has the CPP approved by document review, through the real RPCs.
SELECT pg_temp.try_as((SELECT a::text FROM f), format('SELECT public.sp_submit_for_verification(%L, NULL, ''cqrityjob_review'', NULL)', (SELECT cpp FROM c)));
SELECT pg_temp.try_as((SELECT v::text FROM f), format(
  'SELECT public.sp_verifier_decide_reviewed(r.id, r.submitted_at, ''approved'', ''document_review'', NULL, NULL, NULL, NULL) FROM public.sp_verification_requests r WHERE r.claim_id = %L',
  (SELECT cpp FROM c)));
SELECT pg_temp.ok((SELECT assertion_level FROM public.sp_claims WHERE id = (SELECT cpp FROM c)) = 'verified', 'TD-F the CPP is approved by document review');

DO $$ BEGIN RAISE NOTICE 'GROUP TD1 — off by default'; END $$;
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM public.sp_talent_profiles WHERE holder_user_id IN (SELECT a FROM f UNION SELECT b FROM f)),
                  'TD1.1 no profile row for an existing account');
SELECT pg_temp.ok(pg_temp.j_as((SELECT a::text FROM f), 'SELECT public.sp_talent_get_settings()') @> '{"visibility":"private","version":0}',
                  'TD1.2 settings read as private');
SELECT pg_temp.ok(pg_temp.j_as((SELECT a::text FROM f), 'SELECT public.sp_talent_preview()') @> '{"searchable":false}',
                  'TD1.3 the preview says: not searchable');

DO $$ BEGIN RAISE NOTICE 'GROUP TD2 — consent is its own act'; END $$;
-- B shares the Passport with an application: still not discoverable.
INSERT INTO public.employers (id, name, slug, status) SELECT employer, 'TD Synthetic AB', 'td-synthetic', 'active' FROM f;
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM public.sp_talent_profiles WHERE holder_user_id = (SELECT b FROM f)),
                  'TD2.1 an organisation existing or an application share never creates discoverability');
SELECT pg_temp.ok(pg_temp.try_as((SELECT a::text FROM f), pg_temp.save_sql(0, 'open', NULL, ARRAY[(SELECT cpp FROM c)], '{}', '{}')) = 'err:SP_TALENT_CONSENT_REQUIRED',
                  'TD2.2 enabling without consent is refused');
SELECT pg_temp.ok(pg_temp.try_as((SELECT a::text FROM f), pg_temp.save_sql(0, 'open', 'talent-v1', '{}', '{}', '{}')) = 'err:SP_TALENT_NOTHING_SELECTED',
                  'TD2.3 enabling with nothing selected is refused');
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM public.sp_talent_profiles WHERE holder_user_id = (SELECT a FROM f)),
                  'TD2.4 a refused save writes nothing');

DO $$ BEGIN RAISE NOTICE 'GROUP TD3 — own, current entries; validated preferences'; END $$;
SELECT pg_temp.ok(pg_temp.try_as((SELECT a::text FROM f), pg_temp.save_sql(0, 'open', 'talent-v1', ARRAY[(SELECT b_ov FROM c)], '{}', '{}')) = 'err:SP_TALENT_ITEM_NOT_AVAILABLE',
                  'TD3.1 another holder''s merit cannot be selected');
SELECT pg_temp.ok(pg_temp.try_as((SELECT a::text FROM f), pg_temp.save_sql(0, 'open', 'talent-v1', ARRAY[(SELECT cpp FROM c)], '{}', '{"areas":["not_an_area"]}')) = 'err:SP_TALENT_INVALID',
                  'TD3.2 an unknown occupational area is refused');
SELECT pg_temp.ok(pg_temp.try_as((SELECT a::text FROM f), pg_temp.save_sql(0, 'open', 'talent-v1', ARRAY[(SELECT cpp FROM c)], '{}', '{"employmentTypes":["forever"]}')) = 'err:SP_TALENT_INVALID',
                  'TD3.3 an unknown employment type is refused');
SELECT pg_temp.ok(pg_temp.try_as((SELECT a::text FROM f), pg_temp.save_sql(0, 'open', 'talent-v1',
                    ARRAY[(SELECT cpp FROM c), (SELECT sv FROM c)], ARRAY['a7170000-3333-4000-8000-000000000001'::uuid],
                    '{"areas":["corporate_security"],"countries":["se"],"cities":["Stockholm"],"employmentTypes":["full_time"],"workplaceTypes":["onsite"]}')) = 'ok',
                  'TD3.4 A opens discoverability for two merits and one period');
SELECT pg_temp.ok((SELECT visibility = 'open' AND countries = ARRAY['SE'] AND consent_text_version = 'talent-v1' AND consented_at IS NOT NULL
                     FROM public.sp_talent_profiles WHERE holder_user_id = (SELECT a FROM f)),
                  'TD3.5 stored: open, consent recorded, country normalised');
SELECT pg_temp.ok((SELECT count(*) FROM public.sp_talent_items WHERE holder_user_id = (SELECT a FROM f)) = 3
                  AND NOT EXISTS (SELECT 1 FROM public.sp_talent_items WHERE claim_id = (SELECT vu1 FROM c)),
                  'TD3.6 exactly the chosen items are searchable; VU1 is not');

DO $$ BEGIN RAISE NOTICE 'GROUP TD4 — the preview is the employer card, minimised'; END $$;
CREATE TEMP TABLE pv AS SELECT pg_temp.j_as((SELECT a::text FROM f), 'SELECT public.sp_talent_preview()') AS j;
GRANT SELECT ON pv TO PUBLIC;
SELECT pg_temp.ok((SELECT j->>'searchable' FROM pv) = 'true' AND jsonb_array_length((SELECT j#>'{card,merits}' FROM pv)) = 2
                  AND jsonb_array_length((SELECT j#>'{card,experience}' FROM pv)) = 1, 'TD4.1 searchable; two merits and one period shown');
SELECT pg_temp.ok((SELECT j::text FROM pv) NOT LIKE '%CPP-123456%' AND (SELECT j::text FROM pv) NOT LIKE '%Kärnkraftverk%'
                  AND (SELECT j::text FROM pv) NOT LIKE '%Hemlig Arbetsgivare%' AND (SELECT j::text FROM pv) NOT LIKE '%Anna%'
                  AND (SELECT j::text FROM pv) NOT LIKE '%td-a@%' AND (SELECT j::text FROM pv) NOT LIKE '%storage%',
                  'TD4.2 no credential number, scope text, employer name, person name, address or document');
SELECT pg_temp.ok((SELECT j#>'{card,merits}' FROM pv) @> '[{"code":"INTL_ASIS_CPP","abbreviation":"CPP","level":"document_reviewed","requirementClass":"certification"}]'
                  AND (SELECT j#>'{card,merits}' FROM pv) @> '[{"code":"SV","requirementClass":"regulated_authorisation","hasScopeLimitation":true,"validity":"expiring_soon","level":"self_declared"}]',
                  'TD4.3 full name + abbreviation, class, level and validity; a limitation is flagged without its text');
SELECT pg_temp.ok(NOT ((SELECT j::text FROM pv) LIKE '%issuer_confirmed%' OR (SELECT j::text FROM pv) LIKE '%source_confirmed%'),
                  'TD4.4 an administrator approval is never presented as an issuer confirmation');
SELECT pg_temp.ok(NOT ((SELECT j->'card' FROM pv) ? 'ref'), 'TD4.5 the holder preview carries no reference');
SELECT pg_temp.ok((SELECT (j#>>'{card,totalSecurityMonths}')::int FROM pv) BETWEEN 22 AND 24, 'TD4.6 security experience months from the union of periods');

DO $$ BEGIN RAISE NOTICE 'GROUP TD5 — version guard'; END $$;
SELECT pg_temp.ok(pg_temp.try_as((SELECT a::text FROM f), pg_temp.save_sql(0, 'active', 'talent-v1', ARRAY[(SELECT cpp FROM c)], '{}', '{}')) = 'err:SP_TALENT_STALE',
                  'TD5.1 a save from an old page is refused');

DO $$ BEGIN RAISE NOTICE 'GROUP TD6 — pause rotates, history records'; END $$;
CREATE TEMP TABLE ref1 AS SELECT search_ref FROM public.sp_talent_profiles WHERE holder_user_id = (SELECT a FROM f);
SELECT pg_temp.ok(pg_temp.j_as((SELECT a::text FROM f), 'SELECT public.sp_talent_pause()') @> '{"visibility":"private"}',
                  'TD6.1 one-click pause');
SELECT pg_temp.ok((SELECT search_ref FROM public.sp_talent_profiles WHERE holder_user_id = (SELECT a FROM f)) <> (SELECT search_ref FROM ref1)
                  AND (SELECT count(*) FROM public.sp_talent_items WHERE holder_user_id = (SELECT a FROM f)) = 3,
                  'TD6.2 the reference is rotated; the selection is kept');
SELECT pg_temp.ok(pg_temp.j_as((SELECT a::text FROM f), 'SELECT public.sp_talent_pause()') @> '{"visibility":"private"}'
                  AND (SELECT count(*) FROM public.sp_talent_consent_events WHERE holder_user_id = (SELECT a FROM f)) = 2,
                  'TD6.3 pausing twice is harmless and recorded once');
SELECT pg_temp.ok(pg_temp.try_as((SELECT a::text FROM f), pg_temp.save_sql(
                    (SELECT version FROM public.sp_talent_profiles WHERE holder_user_id = (SELECT a FROM f)),
                    'active', 'talent-v1', ARRAY[(SELECT cpp FROM c)], '{}', '{"areas":["corporate_security"]}')) = 'ok',
                  'TD6.4 re-enabled as actively looking');
SELECT pg_temp.ok((SELECT visibility FROM public.sp_talent_profiles WHERE holder_user_id = (SELECT a FROM f)) = 'active'
                  AND (SELECT count(*) FROM public.sp_talent_items WHERE holder_user_id = (SELECT a FROM f)) = 1,
                  'TD6.5 active, with a narrower selection');
SELECT pg_temp.ok((SELECT array_agg(from_visibility || '>' || to_visibility ORDER BY created_at) FROM public.sp_talent_consent_events
                    WHERE holder_user_id = (SELECT a FROM f)) = ARRAY['private>open', 'open>private', 'private>active'],
                  'TD6.6 the consent history is complete');

DO $$ BEGIN RAISE NOTICE 'GROUP TD7 — a correction keeps the selection, not the approval'; END $$;
CREATE TEMP TABLE corr AS SELECT (pg_temp.j_as((SELECT a::text FROM f), format(
  'SELECT to_jsonb(public.sp_correct_claim(%L, c.title, c.claimed_issuer_name, c.jurisdiction_code, c.issued_on, c.valid_from, %L::date, ''Förnyad'', c.credential_code, c.credential_reference, c.holder_note)) FROM public.sp_claims c WHERE c.id = %L',
  (SELECT cpp FROM c), current_date + 1000, (SELECT cpp FROM c)))#>>'{}')::uuid AS id;
GRANT SELECT ON corr TO PUBLIC;
SELECT pg_temp.ok(EXISTS (SELECT 1 FROM public.sp_talent_items WHERE claim_id = (SELECT id FROM corr)),
                  'TD7.1 the corrected version is searchable because the old one was');
SELECT pg_temp.ok(pg_temp.j_as((SELECT a::text FROM f), 'SELECT public.sp_talent_preview()')#>'{card,merits}'
                    @> '[{"code":"INTL_ASIS_CPP","level":"self_declared"}]'
                  AND jsonb_array_length(pg_temp.j_as((SELECT a::text FROM f), 'SELECT public.sp_talent_preview()')#>'{card,merits}') = 1,
                  'TD7.2 the preview shows the new version once, as self-declared');

DO $$ BEGIN RAISE NOTICE 'GROUP TD8 — no direct access'; END $$;
SELECT pg_temp.ok(pg_temp.try_as((SELECT a::text FROM f), 'UPDATE public.sp_talent_profiles SET visibility = ''active''') LIKE 'err:permission denied%'
                  AND pg_temp.try_as((SELECT a::text FROM f), format('INSERT INTO public.sp_talent_items (holder_user_id, claim_id) VALUES (%L, %L)', (SELECT a FROM f), (SELECT vu1 FROM c))) LIKE 'err:permission denied%',
                  'TD8.1 no client writes');
SELECT pg_temp.ok(pg_temp.try_as((SELECT a::text FROM f), 'SELECT search_ref FROM public.sp_talent_profiles') LIKE 'err:permission denied%',
                  'TD8.2 the reference is not readable, even by the holder');
SELECT pg_temp.ok(pg_temp.try_as((SELECT b::text FROM f), format('SELECT public.sp_talent_card(%L)', (SELECT a FROM f))) LIKE 'err:permission denied%'
                  AND pg_temp.j_as((SELECT b::text FROM f), 'SELECT to_jsonb(count(*)) FROM public.sp_talent_profiles')::int = 0,
                  'TD8.3 another user cannot read a card or a profile row');
SELECT pg_temp.ok(NOT has_function_privilege('anon', 'public.sp_talent_save_settings(integer,text,text,uuid[],uuid[],jsonb)', 'EXECUTE')
                  AND NOT has_function_privilege('anon', 'public.sp_talent_preview()', 'EXECUTE'), 'TD8.4 anon executes nothing');

ROLLBACK;
