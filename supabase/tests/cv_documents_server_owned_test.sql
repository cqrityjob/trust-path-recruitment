-- cv_documents IS SERVER-OWNED — the negative controls.
--
-- ── WHAT THIS SUITE IS FOR ─────────────────────────────────────────────
--
-- 20261010090000 granted `authenticated` INSERT and UPDATE on cv_documents
-- with row-level security that checked OWNERSHIP and nothing else, while the
-- application layer said, in two file headers, that a client could not supply
-- the facts. The application layer was telling the truth about itself and
-- nothing about the database.
--
-- The consequence was not a private fiction. sp_submit_application_with_cv_
-- source copies a saved CV onto a job application, and job_applications is
-- employer-readable — so an invented employment history written straight to
-- the Data API became an employer-readable document about a candidate's
-- career.
--
-- ── WHY GROUP N REPRODUCES THE DEFECT BEFORE ASSERTING THE FIX ─────────
--
-- Because "the statement is refused" proves nothing on its own. It is what a
-- misspelt table name looks like, what a missing fixture looks like, and what
-- a test asserting the wrong thing looks like. So Group N re-grants the
-- privilege the old migration held, fabricates an employment that never
-- happened, and shows it landing in a row that would have been copied to an
-- employer. Then it revokes and runs the SAME statement again.
--
-- A negative control that has never been seen to fail is a negative control
-- nobody should believe.
--
-- Runs inside one transaction that is rolled back. Every fixture is
-- synthetic; no real data is read or written.

\set ON_ERROR_STOP on
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.ok(cond boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT cond THEN
    RAISE EXCEPTION 'ASSERTION FAILED: %', label;
  END IF;
  RAISE NOTICE 'ok  %', label;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.must_fail(stmt text, needle text, label text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE _msg text;
BEGIN
  BEGIN
    EXECUTE stmt;
  EXCEPTION WHEN OTHERS THEN
    _msg := SQLERRM;
    IF position(needle in _msg) = 0 THEN
      RAISE EXCEPTION 'ASSERTION FAILED: % — expected error containing "%", got "%"', label, needle, _msg;
    END IF;
    RAISE NOTICE 'ok  %', label;
    RETURN;
  END;
  RAISE EXCEPTION 'ASSERTION FAILED: % — statement unexpectedly SUCCEEDED', label;
END $$;

/** Become one signed-in holder. */
CREATE OR REPLACE FUNCTION pg_temp.as_holder(uid uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', uid::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', uid)::text, true);
END $$;

-- ── FIXTURES ───────────────────────────────────────────────────────────
--
-- Karin has a real, ordinary Swedish security career: two employments (one
-- ended), a credential, an education and a language. Bosse has one of his
-- own, so "another holder's id" is a real id and not a made-up one.

INSERT INTO auth.users (id, email) VALUES
  ('50000000-0000-0000-0000-00000000000a', 'karin@example.test'),
  ('50000000-0000-0000-0000-00000000000b', 'bosse@example.test')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, display_name, country, locale) VALUES
  ('50000000-0000-0000-0000-00000000000a', 'Karin Wallin', 'SE', 'sv'),
  ('50000000-0000-0000-0000-00000000000b', 'Bosse Bergman', 'SE', 'sv')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.security_career_profiles
  (user_id, current_status, current_profession_slug, years_of_experience) VALUES
  ('50000000-0000-0000-0000-00000000000a', 'working_in_industry', 'vaktare', '5-10'),
  ('50000000-0000-0000-0000-00000000000b', 'working_in_industry', 'vaktare', '1-3')
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.sp_passport_profiles (holder_user_id, headline, jurisdiction_code) VALUES
  ('50000000-0000-0000-0000-00000000000a', 'Väktare med sex års erfarenhet', 'SE')
ON CONFLICT (holder_user_id) DO NOTHING;

INSERT INTO public.sp_experience_periods
  (id, holder_user_id, employer_name, role_title, started_on, ended_on, assertion_level, lifecycle_state) VALUES
  ('e0000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-00000000000a',
   'Nordic Security AB', 'Väktare', DATE '2022-03-01', NULL, 'verified', 'active'),
  ('e0000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-00000000000a',
   'Stadsvakt i Malmö AB', 'Ordningsvakt', DATE '2019-06-01', DATE '2022-02-28', 'self_declared', 'active'),
  ('e0000000-0000-0000-0000-0000000000b1', '50000000-0000-0000-0000-00000000000b',
   'Bosses Bevakning AB', 'Väktare', DATE '2024-01-01', NULL, 'self_declared', 'active');

-- A verified CLAIM must carry its attribution: sp_claim_verified_is_attributed
-- refuses a `verified` level with nobody behind it, which is the Passport
-- refusing to hold a verification nobody made. (Periods carry no such
-- constraint; their attribution lives in sp_verification_decisions.)

-- A language names a controlled type: the Passport refuses free text where a
-- taxonomy exists, so "Engelska" is `lang_en` and its level is a CEFR value.
INSERT INTO public.sp_claims
  (id, holder_user_id, claim_type, title, claimed_issuer_name, issued_on, valid_until,
   skill_code, skill_level,
   assertion_level, verified_by_user_id, verified_at, lifecycle_state) VALUES
  ('c0000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-00000000000a',
   'certification', 'Väktarutbildning VU1', 'BYA', DATE '2019-04-01', DATE '2028-04-01', NULL, NULL,
   'verified', '50000000-0000-0000-0000-00000000000b', now(), 'active'),
  ('c0000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-00000000000a',
   'education', 'Gymnasieexamen', 'Malmö kommun', DATE '2018-06-01', NULL, NULL, NULL,
   'self_declared', NULL, NULL, 'active'),
  ('c0000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-00000000000a',
   'language', 'Engelska', NULL, NULL, NULL, 'lang_en', 'B2',
   'self_declared', NULL, NULL, 'active'),
  -- Unfinished work. The Passport keeps it out of its own lists and it must
  -- never reach a CV.
  ('c0000000-0000-0000-0000-000000000004', '50000000-0000-0000-0000-00000000000a',
   'certification', 'Halvfärdig behörighet', NULL, NULL, NULL, NULL, NULL,
   'self_declared', NULL, NULL, 'draft');

-- Every fact Karin owns, as the honest allowlist most groups start from.
CREATE OR REPLACE FUNCTION pg_temp.karin_ids() RETURNS uuid[] LANGUAGE sql AS $$
  SELECT ARRAY['e0000000-0000-0000-0000-000000000001',
               'e0000000-0000-0000-0000-000000000002',
               'c0000000-0000-0000-0000-000000000001',
               'c0000000-0000-0000-0000-000000000002',
               'c0000000-0000-0000-0000-000000000003']::uuid[];
$$;

CREATE OR REPLACE FUNCTION pg_temp.no_contact() RETURNS jsonb LANGUAGE sql AS $$
  SELECT '{"email":"","phone":"","showEmail":false,"showPhone":false}'::jsonb;
$$;

-- ═════════════════════════════════════════════════════════════════════════
DO $$ BEGIN RAISE NOTICE 'GROUP N — the negative control, seen to fail first'; END $$;
-- ═════════════════════════════════════════════════════════════════════════

-- ── N1. THE OLD DESIGN, RESTORED ───────────────────────────────────────
--
-- Exactly the grant 20261010090000 left in place. Nothing else about the
-- table changes: the same policies, the same RLS, the same owner.
GRANT INSERT, UPDATE ON public.cv_documents TO authenticated;

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_holder('50000000-0000-0000-0000-00000000000a');

-- A career that never happened, written by the holder, owned by the holder,
-- and therefore accepted by every policy on the table.
INSERT INTO public.cv_documents (owner_user_id, title, source_bundle)
VALUES ('50000000-0000-0000-0000-00000000000a', 'Fabricated',
        jsonb_build_object(
          'identity',   jsonb_build_object('displayName', 'Karin Wallin'),
          'employment', jsonb_build_array(jsonb_build_object(
                          'id', 'ffffffff-0000-0000-0000-000000000001',
                          'employerName', 'Säkerhetspolisen',
                          'roleTitle',    'Operativ chef',
                          'startedOn',    '2011-01-01')),
          'education',  '[]'::jsonb));

RESET ROLE;

SELECT pg_temp.ok(
  (SELECT source_bundle #>> '{employment,0,employerName}' FROM public.cv_documents
    WHERE title = 'Fabricated') = 'Säkerhetspolisen',
  'N1 UNDER THE OLD GRANT a holder writes an employment that never happened');

SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM public.sp_experience_periods
               WHERE holder_user_id = '50000000-0000-0000-0000-00000000000a'
                 AND employer_name = 'Säkerhetspolisen'),
  'N2 and the Passport it claims to summarise has no such employment');

-- And it is not inert. This is the shape the submission function copies onto
-- an employer-readable application row.
SELECT pg_temp.ok(
  public.cv_bundle_is_ready(
    (SELECT source_bundle FROM public.cv_documents WHERE title = 'Fabricated')),
  'N3 the fabricated row passes the eligibility rule that gates submission');

DELETE FROM public.cv_documents WHERE title = 'Fabricated';

-- ── N4. THE CORRECTION ─────────────────────────────────────────────────
REVOKE INSERT, UPDATE, DELETE ON public.cv_documents FROM authenticated;

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_holder('50000000-0000-0000-0000-00000000000a');

SELECT pg_temp.must_fail(
  $$INSERT INTO public.cv_documents (owner_user_id, title, source_bundle)
    VALUES ('50000000-0000-0000-0000-00000000000a', 'Fabricated',
            '{"identity":{"displayName":"Karin Wallin"},
              "employment":[{"id":"ffffffff-0000-0000-0000-000000000001",
                             "employerName":"Säkerhetspolisen",
                             "roleTitle":"Operativ chef",
                             "startedOn":"2011-01-01"}]}'::jsonb)$$,
  'permission denied',
  'N4 THE SAME STATEMENT is refused after the correction');

SELECT pg_temp.must_fail(
  $$UPDATE public.cv_documents SET source_bundle = '{}'::jsonb$$,
  'permission denied',
  'N5 and so is editing the facts of a CV that already exists');

RESET ROLE;

-- ═════════════════════════════════════════════════════════════════════════
DO $$ BEGIN RAISE NOTICE 'GROUP S — every factual value is derived, never sent'; END $$;
-- ═════════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_holder('50000000-0000-0000-0000-00000000000a');

DO $$
DECLARE _r jsonb;
BEGIN
  -- The presentation carries an invented employer, an invented citation and a
  -- verification claim. None of it is a factual field, which is the point:
  -- the client is trying the only door it has left.
  _r := public.cv_create(
    '0b000000-0000-0000-0000-000000000001'::uuid,
    'Karins CV', 'sv', 'general', NULL, false,
    pg_temp.karin_ids(),
    pg_temp.no_contact(),
    jsonb_build_object(
      'headline', 'Väktare',
      'summary',  'Erfaren väktare.',
      'employerName', 'Säkerhetspolisen',
      'experience', jsonb_build_array(
        jsonb_build_object('sourceId', 'e0000000-0000-0000-0000-000000000001',
                           'bullets', jsonb_build_array('Ronderande bevakning.')),
        jsonb_build_object('sourceId', 'ffffffff-0000-0000-0000-000000000009',
                           'bullets', jsonb_build_array('Ledde nationell insats.'))),
      'emphasisedClaimIds', jsonb_build_array('ffffffff-0000-0000-0000-00000000000a'),
      'authorship', jsonb_build_object('headline', 'ai', 'summary', 'ai')));
  PERFORM set_config('pg_temp.cv', _r ->> 'cv_id', true);
  PERFORM set_config('pg_temp.rev', _r ->> 'updated_at', true);
END $$;

RESET ROLE;

SELECT pg_temp.ok(
  (SELECT source_bundle #>> '{employment,0,employerName}' FROM public.cv_documents
    WHERE id = current_setting('pg_temp.cv')::uuid) = 'Nordic Security AB',
  'S1 the employer on the CV is the one in the caller''s own Passport');

SELECT pg_temp.ok(
  (SELECT source_bundle::text FROM public.cv_documents
    WHERE id = current_setting('pg_temp.cv')::uuid) NOT LIKE '%Säkerhetspolisen%',
  'S2 the invented employer sent in the presentation reached nothing');

SELECT pg_temp.ok(
  (SELECT presentation::text FROM public.cv_documents
    WHERE id = current_setting('pg_temp.cv')::uuid) NOT LIKE '%employerName%',
  'S3 the presentation has no employer field at all — it was rebuilt, not filtered');

SELECT pg_temp.ok(
  (SELECT jsonb_array_length(presentation -> 'experience') FROM public.cv_documents
    WHERE id = current_setting('pg_temp.cv')::uuid) = 1,
  'S4 a bullet citing an employment the person does not have is dropped');

SELECT pg_temp.ok(
  (SELECT jsonb_array_length(presentation -> 'emphasisedClaimIds') FROM public.cv_documents
    WHERE id = current_setting('pg_temp.cv')::uuid) = 0,
  'S5 and so is an emphasis on a credential they do not have');

SELECT pg_temp.ok(
  (SELECT source_bundle::text FROM public.cv_documents
    WHERE id = current_setting('pg_temp.cv')::uuid) NOT LIKE '%Halvfärdig%',
  'S6 an unfinished (draft) merit never reaches a CV');

SELECT pg_temp.ok(
  (SELECT source_bundle -> 'employment' -> 1 ->> 'endedOn' FROM public.cv_documents
    WHERE id = current_setting('pg_temp.cv')::uuid) = '2022-02-28',
  'S7 an ENDED employment does — it is career history, not an archived merit');

-- The KEY, not the word: `assertionLevel: "verified"` is a stored column and
-- belongs on the bundle. What must not exist is a `verified` FLAG -- a frozen
-- display decision with no date on it, which is what a saved CV was still
-- printing after a revocation.
SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM public.cv_documents cv,
      LATERAL jsonb_array_elements(
        coalesce(cv.source_bundle -> 'education',   '[]'::jsonb)
     || coalesce(cv.source_bundle -> 'credentials', '[]'::jsonb)
     || coalesce(cv.source_bundle -> 'skills',      '[]'::jsonb)
     || coalesce(cv.source_bundle -> 'languages',   '[]'::jsonb)) x
     WHERE cv.id = current_setting('pg_temp.cv')::uuid AND x ? 'verified'),
  'S8 no frozen verification flag is stored — trust is derived live, or not at all');

-- ── Another holder's ids ───────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_holder('50000000-0000-0000-0000-00000000000a');

SELECT pg_temp.must_fail(
  $$SELECT public.cv_create(
      '0b000000-0000-0000-0000-000000000002'::uuid, 'Stolen', 'sv', 'general', NULL, false,
      ARRAY['e0000000-0000-0000-0000-0000000000b1']::uuid[],
      '{"email":"","phone":"","showEmail":false,"showPhone":false}'::jsonb, '{}'::jsonb)$$,
  'CV_NOT_READY',
  'S9 selecting ANOTHER holder''s employment adds nothing, so the CV has no history');

SELECT pg_temp.must_fail(
  $$SELECT public.cv_create(
      '0b000000-0000-0000-0000-000000000003'::uuid, 'Empty', 'sv', 'general', NULL, false,
      ARRAY['c0000000-0000-0000-0000-000000000003']::uuid[],
      '{"email":"","phone":"","showEmail":false,"showPhone":false}'::jsonb, '{}'::jsonb)$$,
  'CV_NOT_READY',
  'S10 a selection with no employment and no education is refused server-side');

SELECT pg_temp.must_fail(
  $$SELECT public.cv_create(
      '0b000000-0000-0000-0000-000000000004'::uuid, 'Nothing', 'sv', 'general', NULL, false,
      ARRAY[]::uuid[],
      '{"email":"","phone":"","showEmail":false,"showPhone":false}'::jsonb, '{}'::jsonb)$$,
  'CV_NOT_READY',
  'S11 and so is an empty one — the model fails closed, not open');

RESET ROLE;

-- ═════════════════════════════════════════════════════════════════════════
DO $$ BEGIN RAISE NOTICE 'GROUP I — idempotency'; END $$;
-- ═════════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_holder('50000000-0000-0000-0000-00000000000a');

-- The committed-write-plus-lost-response case, as the client experiences it:
-- it never saw the answer, so it sends the identical request again.
DO $$
DECLARE _r jsonb;
BEGIN
  _r := public.cv_create(
    '0b000000-0000-0000-0000-000000000001'::uuid,
    'Karins CV', 'sv', 'general', NULL, false,
    pg_temp.karin_ids(), pg_temp.no_contact(),
    jsonb_build_object('headline', 'Väktare', 'summary', 'Erfaren väktare.',
      'experience', jsonb_build_array(
        jsonb_build_object('sourceId', 'e0000000-0000-0000-0000-000000000001',
                           'bullets', jsonb_build_array('Ronderande bevakning.'))),
      'authorship', jsonb_build_object('headline', 'ai', 'summary', 'ai')));
  PERFORM set_config('pg_temp.replay', _r::text, true);
END $$;

RESET ROLE;

SELECT pg_temp.ok(
  (current_setting('pg_temp.replay')::jsonb ->> 'cv_id') = current_setting('pg_temp.cv'),
  'I1 the retry returns the ORIGINAL cvId');

SELECT pg_temp.ok(
  (current_setting('pg_temp.replay')::jsonb ->> 'replayed')::boolean,
  'I2 and says so, rather than pretending it created something');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cv_documents
    WHERE owner_user_id = '50000000-0000-0000-0000-00000000000a') = 1,
  'I3 exactly one CV exists');

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_holder('50000000-0000-0000-0000-00000000000a');

SELECT pg_temp.must_fail(
  $$SELECT public.cv_create(
      '0b000000-0000-0000-0000-000000000001'::uuid,
      'A DIFFERENT CV', 'sv', 'general', NULL, false,
      ARRAY['e0000000-0000-0000-0000-000000000001']::uuid[],
      '{"email":"","phone":"","showEmail":false,"showPhone":false}'::jsonb, '{}'::jsonb)$$,
  'CV_REQUEST_CONFLICT',
  'I4 the same operation id with different facts is refused, never overwritten');

RESET ROLE;

SELECT pg_temp.ok(
  (SELECT title FROM public.cv_documents
    WHERE id = current_setting('pg_temp.cv')::uuid) = 'Karins CV',
  'I5 and the original document is untouched by the refusal');

-- ── Another holder reusing the id ──────────────────────────────────────
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_holder('50000000-0000-0000-0000-00000000000b');

DO $$
DECLARE _r jsonb;
BEGIN
  _r := public.cv_create(
    '0b000000-0000-0000-0000-000000000001'::uuid,
    'Bosses CV', 'sv', 'general', NULL, false,
    ARRAY['e0000000-0000-0000-0000-0000000000b1']::uuid[],
    pg_temp.no_contact(), '{}'::jsonb);
  PERFORM set_config('pg_temp.bosse', _r ->> 'cv_id', true);
END $$;

RESET ROLE;

SELECT pg_temp.ok(
  current_setting('pg_temp.bosse') <> current_setting('pg_temp.cv'),
  'I6 another holder reusing the operation id gets their OWN document');

SELECT pg_temp.ok(
  (SELECT owner_user_id FROM public.cv_documents
    WHERE id = current_setting('pg_temp.bosse')::uuid)
    = '50000000-0000-0000-0000-00000000000b',
  'I7 owned by them, from auth.uid() and not from anything they sent');

SELECT pg_temp.ok(
  (SELECT source_bundle #>> '{employment,0,employerName}' FROM public.cv_documents
    WHERE id = current_setting('pg_temp.bosse')::uuid) = 'Bosses Bevakning AB',
  'I8 built from THEIR records, never from the first caller''s');

-- The ledger itself is unreachable. A holder who could read it would learn
-- which operation ids exist; one who could write it could pre-claim an id.
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_holder('50000000-0000-0000-0000-00000000000a');
SELECT pg_temp.must_fail(
  'SELECT count(*) FROM public.cv_document_operations',
  'permission denied', 'I9 no holder can read the operations ledger');
SELECT pg_temp.must_fail(
  $$INSERT INTO public.cv_document_operations
      (owner_user_id, operation_id, cv_document_id, request_fingerprint)
    VALUES ('50000000-0000-0000-0000-00000000000a', gen_random_uuid(),
            gen_random_uuid(), 'x')$$,
  'permission denied', 'I10 nor claim an operation id in advance');
RESET ROLE;

-- ═════════════════════════════════════════════════════════════════════════
DO $$ BEGIN RAISE NOTICE 'GROUP R — a stale tab writes nothing'; END $$;
-- ═════════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_holder('50000000-0000-0000-0000-00000000000a');

SELECT pg_temp.must_fail(
  format($$SELECT public.cv_save(%L::uuid, %L::timestamptz, 'Renamed')$$,
         current_setting('pg_temp.cv'), '2020-01-01 00:00:00+00'),
  'CV_CHANGED',
  'R1 a save carrying a stale revision is refused');

SELECT pg_temp.must_fail(
  format($$SELECT public.cv_save(%L::uuid, NULL::timestamptz, 'Renamed')$$,
         current_setting('pg_temp.cv')),
  'CV_CHANGED',
  'R2 and so is one carrying no revision at all');

SELECT pg_temp.must_fail(
  format($$SELECT public.cv_delete(%L::uuid, %L::timestamptz)$$,
         current_setting('pg_temp.cv'), '2020-01-01 00:00:00+00'),
  'CV_CHANGED',
  'R3 deleting with a stale revision is refused too');

RESET ROLE;

SELECT pg_temp.ok(
  (SELECT title FROM public.cv_documents
    WHERE id = current_setting('pg_temp.cv')::uuid) = 'Karins CV',
  'R4 and none of the three refusals changed anything');

-- ── THE TWO-TAB CASE ───────────────────────────────────────────────────
--
-- The first writer wins; the second, holding what is now a stale revision, is
-- refused.
--
-- Demonstrating it needs the revision to MOVE, and inside one transaction it
-- cannot: `now()` is fixed at transaction start, so `set_updated_at()` writes
-- the value that is already there and every revision in this suite is the
-- same instant. That is a property of the test harness, not of the feature.
--
-- So the second that passes between two real requests is supplied by hand,
-- as the table owner, and the assertion is then the one that matters: a
-- caller holding the earlier revision is refused. The trigger's own behaviour
-- is asserted separately below, since a frozen clock cannot show it.
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_holder('50000000-0000-0000-0000-00000000000a');

DO $$
BEGIN
  PERFORM public.cv_save(
    current_setting('pg_temp.cv')::uuid,
    current_setting('pg_temp.rev')::timestamptz,
    'Renamed once');
END $$;

RESET ROLE;

-- The trigger has to be stood down for this one statement: it is a BEFORE
-- UPDATE that writes `now()`, and `now()` is the frozen transaction clock, so
-- it would put the timestamp straight back where it was.
ALTER TABLE public.cv_documents DISABLE TRIGGER cv_documents_set_updated_at;
UPDATE public.cv_documents
   SET updated_at = updated_at + interval '1 second'
 WHERE id = current_setting('pg_temp.cv')::uuid;
ALTER TABLE public.cv_documents ENABLE TRIGGER cv_documents_set_updated_at;

SELECT set_config('pg_temp.rev2',
  (SELECT updated_at::text FROM public.cv_documents
    WHERE id = current_setting('pg_temp.cv')::uuid), true);

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_holder('50000000-0000-0000-0000-00000000000a');

SELECT pg_temp.must_fail(
  format($$SELECT public.cv_save(%L::uuid, %L::timestamptz, 'Renamed twice')$$,
         current_setting('pg_temp.cv'), current_setting('pg_temp.rev')),
  'CV_CHANGED',
  'R5 the second writer, still holding the first revision, is refused');

RESET ROLE;

SELECT pg_temp.ok(
  (SELECT title FROM public.cv_documents
    WHERE id = current_setting('pg_temp.cv')::uuid) = 'Renamed once',
  'R6 the first writer''s change stands');

-- What the frozen clock hides: that an UPDATE moves the revision at all. The
-- trigger is asserted by existence and by the function it calls, which is the
-- shared one every table in this schema uses.
SELECT pg_temp.ok(
  EXISTS (SELECT 1 FROM pg_trigger t
           WHERE t.tgrelid = 'public.cv_documents'::regclass
             AND t.tgname = 'cv_documents_set_updated_at'
             AND NOT t.tgisinternal),
  'R6b the revision is advanced by the shared updated_at trigger');

-- ── Not yours is not found ─────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_holder('50000000-0000-0000-0000-00000000000b');

SELECT pg_temp.must_fail(
  format($$SELECT public.cv_save(%L::uuid, %L::timestamptz, 'Stolen')$$,
         current_setting('pg_temp.cv'), current_setting('pg_temp.rev2')),
  'CV_NOT_FOUND',
  'R7 another holder saving over this CV is told only CV_NOT_FOUND');

SELECT pg_temp.must_fail(
  $$SELECT public.cv_save('99999999-9999-4999-8999-999999999999'::uuid, now(), 'x')$$,
  'CV_NOT_FOUND',
  'R8 the same answer a genuinely absent CV gives — no existence oracle');

SELECT pg_temp.must_fail(
  format($$SELECT public.cv_delete(%L::uuid, %L::timestamptz)$$,
         current_setting('pg_temp.cv'), current_setting('pg_temp.rev2')),
  'CV_NOT_FOUND',
  'R9 and they cannot delete it either');

RESET ROLE;

-- ═════════════════════════════════════════════════════════════════════════
DO $$ BEGIN RAISE NOTICE 'GROUP A — one save, one transaction'; END $$;
-- ═════════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_holder('50000000-0000-0000-0000-00000000000a');

-- Selection, title, locale, contact and wording in ONE call.
DO $$
DECLARE _r jsonb;
BEGIN
  _r := public.cv_save(
    current_setting('pg_temp.cv')::uuid,
    current_setting('pg_temp.rev2')::timestamptz,
    'Engelskt CV', 'en', NULL, NULL, NULL,
    ARRAY['e0000000-0000-0000-0000-000000000001',
          'c0000000-0000-0000-0000-000000000002']::uuid[],
    '{"email":"karin@example.test","phone":"070-123 45 67","showEmail":true,"showPhone":false}'::jsonb,
    jsonb_build_object('headline', 'Security officer', 'summary', 'Six years in guarding.',
      'authorship', jsonb_build_object('headline', 'person', 'summary', 'person')));
  PERFORM set_config('pg_temp.rev3', _r ->> 'updated_at', true);
END $$;

RESET ROLE;

SELECT pg_temp.ok(
  (SELECT title FROM public.cv_documents WHERE id = current_setting('pg_temp.cv')::uuid) = 'Engelskt CV'
  AND (SELECT locale FROM public.cv_documents WHERE id = current_setting('pg_temp.cv')::uuid) = 'en',
  'A1 title and document language changed together');

-- ── THE DIVERGENCE THIS CLOSES ─────────────────────────────────────────
--
-- The column drove the list; `source_bundle.locale` drove what the document
-- actually rendered in. Setting only the column left a CV that said "English"
-- in one place and printed Swedish headings in the other.
SELECT pg_temp.ok(
  (SELECT source_bundle ->> 'locale' FROM public.cv_documents
    WHERE id = current_setting('pg_temp.cv')::uuid) = 'en',
  'A2 and the bundle the renderer reads says English too');

SELECT pg_temp.ok(
  (SELECT jsonb_array_length(source_bundle -> 'employment') FROM public.cv_documents
    WHERE id = current_setting('pg_temp.cv')::uuid) = 1
  AND (SELECT jsonb_array_length(source_bundle -> 'languages') FROM public.cv_documents
        WHERE id = current_setting('pg_temp.cv')::uuid) = 0,
  'A3 the new selection took effect in the same write');

SELECT pg_temp.ok(
  (SELECT source_bundle::text FROM public.cv_documents
    WHERE id = current_setting('pg_temp.cv')::uuid) NOT LIKE '%Stadsvakt%',
  'A4 the deselected employment is ABSENT from the row, not hidden in it');

SELECT pg_temp.ok(
  (SELECT presentation #>> '{contact,phone}' FROM public.cv_documents
    WHERE id = current_setting('pg_temp.cv')::uuid) = '070-123 45 67'
  AND NOT (SELECT (presentation #>> '{contact,showPhone}')::boolean FROM public.cv_documents
            WHERE id = current_setting('pg_temp.cv')::uuid),
  'A5 a switched-off number is KEPT on the holder''s own row so they need not retype it');

-- ── A refusal leaves everything ────────────────────────────────────────
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_holder('50000000-0000-0000-0000-00000000000a');

SELECT pg_temp.must_fail(
  format($$SELECT public.cv_save(%L::uuid, %L::timestamptz, 'Broken', 'sv', NULL, NULL, NULL,
            NULL, '{"email":"not-an-address","phone":"","showEmail":true,"showPhone":false}'::jsonb)$$,
         current_setting('pg_temp.cv'), current_setting('pg_temp.rev3')),
  'CV_CONTACT_INVALID',
  'A6 an unusable address that is switched ON is refused');

RESET ROLE;

SELECT pg_temp.ok(
  (SELECT title  FROM public.cv_documents WHERE id = current_setting('pg_temp.cv')::uuid) = 'Engelskt CV'
  AND (SELECT locale FROM public.cv_documents WHERE id = current_setting('pg_temp.cv')::uuid) = 'en'
  AND (SELECT presentation #>> '{contact,email}' FROM public.cv_documents
        WHERE id = current_setting('pg_temp.cv')::uuid) = 'karin@example.test',
  'A7 and NOTHING changed — not the title, not the language, not the contact block');

-- ── Refresh adds nothing ───────────────────────────────────────────────
INSERT INTO public.sp_experience_periods
  (id, holder_user_id, employer_name, role_title, started_on, assertion_level, lifecycle_state)
VALUES ('e0000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-00000000000a',
        'Alldeles Ny Bevakning AB', 'Skyddsvakt', DATE '2026-01-01', 'self_declared', 'active');

UPDATE public.sp_experience_periods SET employer_name = 'Nordic Security Group AB'
 WHERE id = 'e0000000-0000-0000-0000-000000000001';

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_holder('50000000-0000-0000-0000-00000000000a');
DO $$
DECLARE _r jsonb;
BEGIN
  _r := public.cv_refresh_from_profile(
    current_setting('pg_temp.cv')::uuid, current_setting('pg_temp.rev3')::timestamptz);
  PERFORM set_config('pg_temp.rev4', _r ->> 'updated_at', true);
END $$;
RESET ROLE;

SELECT pg_temp.ok(
  (SELECT source_bundle #>> '{employment,0,employerName}' FROM public.cv_documents
    WHERE id = current_setting('pg_temp.cv')::uuid) = 'Nordic Security Group AB',
  'A8 update-from-profile takes the corrected employer name');

SELECT pg_temp.ok(
  (SELECT jsonb_array_length(source_bundle -> 'employment') FROM public.cv_documents
    WHERE id = current_setting('pg_temp.cv')::uuid) = 1,
  'A9 but does NOT add the employment recorded since — that is a suggestion, not an act');

-- ═════════════════════════════════════════════════════════════════════════
DO $$ BEGIN RAISE NOTICE 'GROUP E — the employer''s copy'; END $$;
-- ═════════════════════════════════════════════════════════════════════════
--
-- All four switch combinations, asserted against the RAW JSON an employer can
-- select — not against a rendered document, which is where the leak was
-- invisible in the first place.

CREATE OR REPLACE FUNCTION pg_temp.snapshot_with(_show_email boolean, _show_phone boolean)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE _cv public.cv_documents%ROWTYPE;
BEGIN
  SELECT * INTO _cv FROM public.cv_documents WHERE id = current_setting('pg_temp.cv')::uuid;
  _cv.presentation := jsonb_set(_cv.presentation, '{contact}', jsonb_build_object(
    'email', 'karin@example.test', 'phone', '070-123 45 67',
    'showEmail', _show_email, 'showPhone', _show_phone));
  RETURN public.cv_application_snapshot(_cv, now());
END $$;

SELECT pg_temp.ok(
  pg_temp.snapshot_with(false, false)::text NOT LIKE '%karin@example.test%'
  AND pg_temp.snapshot_with(false, false)::text NOT LIKE '%070-123%',
  'E1 both switched off: neither value exists anywhere in the employer''s JSON');

SELECT pg_temp.ok(
  pg_temp.snapshot_with(true, false)::text LIKE '%karin@example.test%'
  AND pg_temp.snapshot_with(true, false)::text NOT LIKE '%070-123%',
  'E2 email on, telephone off: only the address travels');

SELECT pg_temp.ok(
  pg_temp.snapshot_with(false, true)::text NOT LIKE '%karin@example.test%'
  AND pg_temp.snapshot_with(false, true)::text LIKE '%070-123%',
  'E3 telephone on, email off: only the number travels');

SELECT pg_temp.ok(
  pg_temp.snapshot_with(true, true)::text LIKE '%karin@example.test%'
  AND pg_temp.snapshot_with(true, true)::text LIKE '%070-123%',
  'E4 both on: both travel, because the person said so');

-- Absent, not blanked. `"phone": ""` in an employer's payload is still a
-- statement, and it invites somebody to wonder what was removed.
SELECT pg_temp.ok(
  NOT (pg_temp.snapshot_with(false, false) #> '{presentation,contact}' ? 'phone')
  AND NOT (pg_temp.snapshot_with(false, false) #> '{presentation,contact}' ? 'email'),
  'E5 a hidden field has its KEY removed, not its value emptied');

-- ── Internal identifiers ───────────────────────────────────────────────
SELECT pg_temp.ok(
  pg_temp.snapshot_with(true, true)::text NOT LIKE '%e0000000-0000-0000-0000-%'
  AND pg_temp.snapshot_with(true, true)::text NOT LIKE '%c0000000-0000-0000-0000-%',
  'E6 no sp_experience_periods or sp_claims uuid reaches the employer');

SELECT pg_temp.ok(
  (pg_temp.snapshot_with(true, true) #>> '{source_bundle,employment,0,id}') = 'e1',
  'E7 references are snapshot-local keys instead');

SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(
      coalesce(pg_temp.snapshot_with(true, true) #> '{source_bundle,education}',   '[]'::jsonb)
   || coalesce(pg_temp.snapshot_with(true, true) #> '{source_bundle,credentials}', '[]'::jsonb)
   || coalesce(pg_temp.snapshot_with(true, true) #> '{source_bundle,skills}',      '[]'::jsonb)
   || coalesce(pg_temp.snapshot_with(true, true) #> '{source_bundle,languages}',   '[]'::jsonb)) x
     WHERE x ? 'verified'),
  'E8 the frozen verification flag is not sent — a stale trust claim with no date is worse than none');

SELECT pg_temp.ok(
  (pg_temp.snapshot_with(true, true) ->> 'checked_at') IS NOT NULL,
  'E9 the copy is dated, so an expiry on it can be judged against something');

-- ═════════════════════════════════════════════════════════════════════════
DO $$ BEGIN RAISE NOTICE 'GROUP L — current, not merely saved'; END $$;
-- ═════════════════════════════════════════════════════════════════════════

-- The credential this CV carries is WITHDRAWN after it was saved. Sending it
-- would put a retracted qualification in front of an employer with nothing
-- anywhere to say so.
--
-- `withdrawn` rather than `revoked` because the Passport's own transition
-- rules allow the holder to withdraw and reserve revocation for the
-- verification workflow -- which is the correct rule, and the submission
-- boundary treats every non-active state the same way regardless of which
-- door it came through.
UPDATE public.sp_claims SET lifecycle_state = 'withdrawn'
 WHERE id = 'c0000000-0000-0000-0000-000000000002';

INSERT INTO public.employers (id, name, slug, country, status)
VALUES ('ef000009-0000-0000-0000-000000000009', 'Org L', 'org-l-cvtest', 'SE', 'active')
ON CONFLICT (id) DO NOTHING;

-- Run as the owner: the readiness and id helpers are internal and hold no
-- EXECUTE grant for `authenticated`, which is asserted in Group P. The holder
-- identity still comes from the session GUC, so `auth.uid()` below is Karin
-- exactly as it would be inside the submission function.
SELECT pg_temp.as_holder('50000000-0000-0000-0000-00000000000a');

SELECT pg_temp.ok(
  NOT public.cv_bundle_is_ready(
    (SELECT source_bundle FROM public.cv_documents
      WHERE id = current_setting('pg_temp.cv')::uuid) - 'employment' - 'education'),
  'L1 the readiness rule is the one the submission boundary applies');

DO $$
DECLARE _ids uuid[];
        _live integer;
BEGIN
  _ids := public.cv_bundle_ids(
    (SELECT source_bundle FROM public.cv_documents
      WHERE id = current_setting('pg_temp.cv')::uuid));
  SELECT count(*) INTO _live FROM (
    SELECT ep.id FROM public.sp_experience_periods ep
     WHERE ep.holder_user_id = auth.uid() AND ep.lifecycle_state = 'active' AND ep.id = ANY(_ids)
    UNION ALL
    SELECT cl.id FROM public.sp_claims cl
     WHERE cl.holder_user_id = auth.uid() AND cl.lifecycle_state = 'active' AND cl.id = ANY(_ids)) s;
  PERFORM pg_temp.ok(_live < array_length(_ids, 1),
    'L2 a withdrawn credential is detected by the submission-boundary re-check');
END $$;

-- ═════════════════════════════════════════════════════════════════════════
DO $$ BEGIN RAISE NOTICE 'GROUP P — privileges'; END $$;
-- ═════════════════════════════════════════════════════════════════════════

SELECT pg_temp.ok(
  NOT has_table_privilege('authenticated', 'public.cv_documents', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.cv_documents', 'UPDATE')
  AND NOT has_table_privilege('authenticated', 'public.cv_documents', 'DELETE')
  AND NOT has_table_privilege('authenticated', 'public.cv_documents', 'TRUNCATE'),
  'P1 authenticated holds no write privilege on cv_documents');

SELECT pg_temp.ok(
  has_table_privilege('authenticated', 'public.cv_documents', 'SELECT'),
  'P2 but still reads its own rows, under the owner-only policy');

SELECT pg_temp.ok(
  NOT has_table_privilege('anon', 'public.cv_documents', 'SELECT')
  AND NOT has_table_privilege('anon', 'public.cv_documents', 'INSERT'),
  'P3 anon holds nothing at all');

SELECT pg_temp.ok(
  NOT has_table_privilege('authenticated', 'public.cv_document_operations', 'SELECT')
  AND NOT has_table_privilege('anon', 'public.cv_document_operations', 'SELECT'),
  'P4 nobody but service_role can reach the operations ledger');

SELECT pg_temp.ok(
  (SELECT relrowsecurity FROM pg_class
    WHERE oid = 'public.cv_documents'::regclass)
  AND (SELECT relrowsecurity FROM pg_class
        WHERE oid = 'public.cv_document_operations'::regclass),
  'P5 row-level security is enabled on both tables');

SELECT pg_temp.ok(
  NOT has_function_privilege('anon',
    'public.cv_create(uuid,text,text,text,text,boolean,uuid[],jsonb,jsonb,text,text)', 'EXECUTE')
  AND NOT has_function_privilege('anon',
    'public.cv_save(uuid,timestamptz,text,text,text,text,boolean,uuid[],jsonb,jsonb,boolean,text,text)', 'EXECUTE')
  AND NOT has_function_privilege('anon',
    'public.cv_delete(uuid,timestamptz)', 'EXECUTE'),
  'P6 no anonymous visitor may execute a CV write function');

SELECT pg_temp.ok(
  NOT has_function_privilege('authenticated',
    'public.cv_source_bundle(uuid[],text,boolean,text)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated',
    'public.cv_application_snapshot(public.cv_documents,timestamptz)', 'EXECUTE'),
  'P7 and the internal builders are not a client-reachable surface either');

DO $$ BEGIN RAISE NOTICE 'PASS — cv_documents_server_owned_test'; END $$;

ROLLBACK;
