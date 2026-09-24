-- The candidate list read by the database (20261212090000), proved by
-- EXECUTING it as the roles that would really call it, against a vacancy
-- with MORE applications than the old in-memory read could see.
--
--   F · the fixture     5 200 applications on one vacancy; one on another;
--                       one organisation next door
--   C · counts          the stage counts are counted, not sampled
--   P · pages           one page is one page, the last page is the last,
--                       a page past the end is the last, and every row of
--                       the list is on exactly one page
--   S · sorting         stable on every sort, ties on the id, unnamed and
--                       unplanned last, Swedish letters in Swedish order
--   Q · filters         search finds a candidate the old limit hid; stage,
--                       responsible and answer filters narrow the same list
--                       the counts describe; 'no' is not 'anything but yes'
--   N · neighbours      previous/next around any row, across a page edge,
--                       without the rest of the list
--   I · isolation       another organisation, a candidate, a stranger and
--                       anon are refused the same way; a plain member reads
--   V · inputs          a malformed filter is refused, never guessed at
--
-- One transaction, ends in ROLLBACK.

\set ON_ERROR_STOP on
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.ok(cond boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF cond IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: %', label; END IF;
  RAISE NOTICE 'ok  %', label;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.must_fail(stmt text, needle text, label text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE _msg text;
BEGIN
  BEGIN EXECUTE stmt;
  EXCEPTION WHEN OTHERS THEN
    _msg := SQLERRM;
    IF position(needle in _msg) = 0 THEN
      RAISE EXCEPTION 'ASSERTION FAILED: % — expected "%", got "%"', label, needle, _msg;
    END IF;
    RAISE NOTICE 'ok  %', label; RETURN;
  END;
  RAISE EXCEPTION 'ASSERTION FAILED: % — statement unexpectedly SUCCEEDED', label;
END $$;

GRANT EXECUTE ON FUNCTION pg_temp.ok(boolean, text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION pg_temp.must_fail(text, text, text) TO PUBLIC;

DO $$ BEGIN RAISE NOTICE 'GROUP F — the fixture'; END $$;

CREATE TEMP TABLE cv AS
SELECT
  'cf000000-1111-0000-0000-00000000000a'::uuid AS emp_a,
  'cf000000-1111-0000-0000-00000000000b'::uuid AS emp_b,
  'cf000000-0000-0000-0000-00000000000a'::uuid AS owner_a,
  'cf000000-0000-0000-0000-00000000000d'::uuid AS member_a,
  'cf000000-0000-0000-0000-00000000000b'::uuid AS owner_b,
  'cf000000-0000-0000-0000-0000000000ad'::uuid AS moderator,
  'cf000000-0000-0000-0000-000000000c03'::uuid AS stranger,
  'cf000000-2222-0000-0000-000000000001'::uuid AS job_a,
  'cf000000-2222-0000-0000-000000000002'::uuid AS job_a2,
  'cf000000-2222-0000-0000-00000000000b'::uuid AS job_b;
GRANT SELECT ON cv TO PUBLIC;

INSERT INTO auth.users (id, email, email_confirmed_at)
SELECT owner_a,   'owner-a@cv.test',   now() FROM cv UNION ALL
SELECT member_a,  'member-a@cv.test',  now() FROM cv UNION ALL
SELECT owner_b,   'owner-b@cv.test',   now() FROM cv UNION ALL
SELECT moderator, 'moderator@cv.test', now() FROM cv UNION ALL
SELECT stranger,  'stranger@cv.test',  now() FROM cv;
INSERT INTO public.user_roles (user_id, role) SELECT moderator, 'admin' FROM cv;

INSERT INTO public.employers (id, name, slug, status)
SELECT emp_a, 'Kandidatvy A AB', 'kandidatvy-a', 'active' FROM cv UNION ALL
SELECT emp_b, 'Kandidatvy B AB', 'kandidatvy-b', 'active' FROM cv;
INSERT INTO public.employer_memberships (employer_id, user_id, role, status)
SELECT emp_a, owner_a,  'owner',  'active' FROM cv UNION ALL
SELECT emp_a, member_a, 'member', 'active' FROM cv UNION ALL
SELECT emp_b, owner_b,  'owner',  'active' FROM cv;

-- Drafts first, then publication through the moderator seat, as the
-- workspace suite does.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'cf000000-0000-0000-0000-00000000000a';
INSERT INTO public.jobs (id, slug, short_id, employer_id, title_sv, title_en, application_method, status)
SELECT job_a,  'cv-job-a',  'CV00001', emp_a, 'Väktare, Uppsala', 'Security officer, Uppsala', 'internal', 'draft' FROM cv UNION ALL
SELECT job_a2, 'cv-job-a2', 'CV00002', emp_a, 'Väktare, Solna',   'Security officer, Solna',   'internal', 'draft' FROM cv;
RESET ROLE; RESET request.jwt.claim.sub;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'cf000000-0000-0000-0000-00000000000b';
INSERT INTO public.jobs (id, slug, short_id, employer_id, title_sv, title_en, application_method, status)
SELECT job_b, 'cv-job-b', 'CV0000B', emp_b, 'Väktare B', 'Guard B', 'internal', 'draft' FROM cv;
RESET ROLE; RESET request.jwt.claim.sub;

-- Two yes/no questions on job_a, neither required, so the fixture can leave
-- some of them unanswered on purpose.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'cf000000-0000-0000-0000-00000000000a';
SELECT public.rec_save_vacancy_structure(
  (SELECT job_a FROM cv),
  '[{"key":"r1","kind":"mandatory","label_sv":"Väktarutbildning","label_en":"Security officer training"},
    {"key":"r2","kind":"desirable","label_sv":"Körkort B","label_en":"Driving licence B"}]'::jsonb,
  '[{"requirement_key":"r1","prompt_sv":"Har du väktarutbildning?","prompt_en":"Do you hold security officer training?","answer_kind":"yes_no","is_required":false},
    {"requirement_key":"r2","prompt_sv":"Har du körkort B?","prompt_en":"Do you hold a B driving licence?","answer_kind":"yes_no","is_required":false}]'::jsonb);
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'cf000000-0000-0000-0000-0000000000ad';
UPDATE public.jobs SET status = 'published', published_at = now() - interval '1 day',
       expires_at = now() + interval '30 days'
 WHERE id IN (SELECT job_a FROM cv UNION ALL SELECT job_a2 FROM cv UNION ALL SELECT job_b FROM cv);
RESET ROLE; RESET request.jwt.claim.sub;

-- 5 200 applicants, one application each on job_a. The name carries the
-- sequence number, so any one of them can be searched for; the created_at
-- is one minute apart per applicant EXCEPT applicants 100..109, who all
-- applied at the same instant to test the tie-break. Statuses: the first
-- 5 000 submitted, then 150 reviewing, 40 at interview, 8 rejected, 2 hired.
-- Applicant 4999 applied to job_a2 as well; applicant 5200 also applied to
-- organisation B's vacancy.
CREATE TEMP TABLE seq AS SELECT g AS n,
  ('cf00aaaa-0000-4000-8000-' || lpad(to_hex(g), 12, '0'))::uuid AS uid,
  ('cf00bbbb-0000-4000-8000-' || lpad(to_hex(g), 12, '0'))::uuid AS app
  FROM generate_series(1, 5200) g;
GRANT SELECT ON seq TO PUBLIC;

INSERT INTO auth.users (id, email, email_confirmed_at, raw_user_meta_data)
SELECT uid, 'sokande-' || n || '@cv.test', now(),
       jsonb_build_object('display_name',
         CASE
           WHEN n = 5150 THEN 'Örjan Östlund'      -- sorts last in Swedish, not among the O:s
           WHEN n = 5151 THEN 'Åsa Ålund'
           WHEN n = 5152 THEN 'Zara Zetterlund'
           WHEN n = 5153 THEN NULL                 -- no name at all
           ELSE 'Sökande ' || lpad(n::text, 4, '0')
         END)
  FROM seq;
-- Applicant 5153 has a profile row with no name (the trigger falls back to
-- the e-mail's local part; the fixture wants NULL).
UPDATE public.profiles SET display_name = NULL WHERE id = (SELECT uid FROM seq WHERE n = 5153);

INSERT INTO public.job_applications (id, job_id, employer_id, applicant_user_id, status, consent_given_at, created_at)
SELECT app, (SELECT job_a FROM cv), (SELECT emp_a FROM cv), uid,
       CASE WHEN n <= 5000 THEN 'submitted'
            WHEN n <= 5150 THEN 'reviewing'
            WHEN n <= 5190 THEN 'interview'
            WHEN n <= 5198 THEN 'rejected'
            ELSE 'hired' END,
       now(),
       CASE WHEN n BETWEEN 100 AND 109 THEN timestamptz '2026-01-01 10:00:00+00'
            ELSE timestamptz '2026-01-01 00:00:00+00' + (n * interval '1 minute') END
  FROM seq;
INSERT INTO public.job_applications (id, job_id, employer_id, applicant_user_id, status, consent_given_at)
SELECT 'cf00cccc-0000-4000-8000-000000000001', (SELECT job_a2 FROM cv), (SELECT emp_a FROM cv),
       (SELECT uid FROM seq WHERE n = 4999), 'submitted', now();
INSERT INTO public.job_applications (id, job_id, employer_id, applicant_user_id, status, consent_given_at)
SELECT 'cf00cccc-0000-4000-8000-00000000000b', (SELECT job_b FROM cv), (SELECT emp_b FROM cv),
       (SELECT uid FROM seq WHERE n = 5200), 'submitted', now();

-- Answers: q1 answered YES by applicants 1..3000, NO by 3001..5100, and NOT
-- AT ALL by 5101..5200. q2 answered YES by every odd applicant only.
INSERT INTO public.job_application_answers (application_id, question_id, employer_id, answer_kind, answer_bool)
SELECT s.app, q.id, (SELECT emp_a FROM cv), 'yes_no', s.n <= 3000
  FROM seq s, public.recruitment_questions q
 WHERE q.job_id = (SELECT job_a FROM cv) AND q.prompt_sv = 'Har du väktarutbildning?' AND s.n <= 5100;
INSERT INTO public.job_application_answers (application_id, question_id, employer_id, answer_kind, answer_bool)
SELECT s.app, q.id, (SELECT emp_a FROM cv), 'yes_no', true
  FROM seq s, public.recruitment_questions q
 WHERE q.job_id = (SELECT job_a FROM cv) AND q.prompt_sv = 'Har du körkort B?' AND s.n % 2 = 1;

-- Responsible: member_a for applicants 1..10; owner_a for 11..12.
INSERT INTO public.recruitment_application_meta (application_id, job_id, employer_id, responsible_user_id)
SELECT app, (SELECT job_a FROM cv), (SELECT emp_a FROM cv),
       CASE WHEN n <= 10 THEN (SELECT member_a FROM cv) ELSE (SELECT owner_a FROM cv) END
  FROM seq WHERE n <= 12;

-- Bookings: applicant 5160 (at interview) tomorrow 09:00, applicant 5161 the
-- day after; applicant 5199 (hired) also has a leftover booking, which must
-- not count as a next activity; applicant 5162's booking was cancelled.
INSERT INTO public.recruitment_interview_bookings (application_id, job_id, employer_id, starts_at, duration_minutes, timezone, location_kind, location_text, status, invited_at)
SELECT app, (SELECT job_a FROM cv), (SELECT emp_a FROM cv), now() + interval '1 day', 45, 'Europe/Stockholm', 'onsite', 'Kontoret', 'planned', NULL FROM seq WHERE n = 5160 UNION ALL
SELECT app, (SELECT job_a FROM cv), (SELECT emp_a FROM cv), now() + interval '2 days', 45, 'Europe/Stockholm', 'onsite', 'Kontoret', 'invited', now() FROM seq WHERE n = 5161 UNION ALL
SELECT app, (SELECT job_a FROM cv), (SELECT emp_a FROM cv), now() + interval '3 days', 45, 'Europe/Stockholm', 'onsite', 'Kontoret', 'planned', NULL FROM seq WHERE n = 5199 UNION ALL
SELECT app, (SELECT job_a FROM cv), (SELECT emp_a FROM cv), now() + interval '1 day', 45, 'Europe/Stockholm', 'onsite', 'Kontoret', 'cancelled', NULL FROM seq WHERE n = 5162;

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.job_applications WHERE job_id = (SELECT job_a FROM cv)) = 5200,
  'F1 the vacancy holds 5 200 applications -- more than the old read could see');

-- ---------------------------------------------------------------------------
DO $$ BEGIN RAISE NOTICE 'GROUP C — counts are counted'; END $$;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'cf000000-0000-0000-0000-00000000000a';

SELECT pg_temp.ok(
  (SELECT total = 5200 AND new_count = 5000 AND review_count = 150 AND interview_count = 40
          AND hired_count = 2 AND decided_count = 10 AND unresolved_count = 5190
     FROM public.rec_job_counts((SELECT emp_a FROM cv), (SELECT job_a FROM cv))),
  'C1 the vacancy''s stage counts are the whole vacancy, with no hidden limit');
SELECT pg_temp.ok(
  (SELECT count(*) = 2 AND sum(total) = 5201 FROM public.rec_job_counts((SELECT emp_a FROM cv), NULL)),
  'C2 the organisation-wide counts cover every vacancy, one row each');
SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM public.rec_job_counts((SELECT emp_a FROM cv), (SELECT job_b FROM cv))),
  'C3 asked about another organisation''s vacancy, the counts are simply empty');

-- ---------------------------------------------------------------------------
DO $$ BEGIN RAISE NOTICE 'GROUP P — one page is one page'; END $$;

CREATE TEMP TABLE p1 ON COMMIT DROP AS
  SELECT * FROM public.rec_candidate_view((SELECT job_a FROM cv), 'all', NULL, NULL, '[]', 'applied', NULL, 1, 25, NULL);
SELECT pg_temp.ok(
  (SELECT count(*) = 25 AND min(rank) = 1 AND max(rank) = 25 AND bool_and(total = 5200) FROM p1),
  'P1 page 1 is 25 rows, ranks 1..25, and every row says the filtered total is 5 200');
SELECT pg_temp.ok(
  (SELECT display_name FROM p1 WHERE rank = 1) = 'Sökande 5200',
  'P2 the default order is newest first, so rank 1 is the last applicant');
SELECT pg_temp.ok(
  (SELECT count(*) = 25 AND min(rank) = 5176 AND max(rank) = 5200
     FROM public.rec_candidate_view((SELECT job_a FROM cv), 'all', NULL, NULL, '[]', 'applied', NULL, 208, 25, NULL)),
  'P3 the last page (208) holds ranks 5 176..5 200');
SELECT pg_temp.ok(
  (SELECT count(*) = 25 AND min(rank) = 5176
     FROM public.rec_candidate_view((SELECT job_a FROM cv), 'all', NULL, NULL, '[]', 'applied', NULL, 999, 25, NULL)),
  'P4 a page past the end is the last page, not an empty one');
SELECT pg_temp.ok(
  (SELECT count(*) = 25 AND min(rank) = 5176 AND max(rank) = 5200
     FROM public.rec_candidate_view((SELECT job_a FROM cv), 'all', NULL, NULL, '[]', 'applied', NULL, 208, 25, NULL))
  AND (SELECT display_name FROM public.rec_candidate_view((SELECT job_a FROM cv), 'all', NULL, NULL, '[]', 'applied', NULL, 208, 25, NULL) WHERE rank = 5200) = 'Sökande 0001',
  'P5 the oldest applicant is the last row of the last page');

-- Every row of the list is on exactly one page: walk all 208 pages of the
-- name sort and compare the union with the vacancy.
CREATE TEMP TABLE walked (application_id uuid, rank bigint, page integer) ON COMMIT DROP;
DO $walk$
DECLARE _p integer;
BEGIN
  FOR _p IN 1..208 LOOP
    INSERT INTO walked
      SELECT v.application_id, v.rank, _p
        FROM public.rec_candidate_view((SELECT job_a FROM cv), 'all', NULL, NULL, '[]', 'name', 'asc', _p, 25, NULL) v;
  END LOOP;
END $walk$;
SELECT pg_temp.ok(
  (SELECT count(*) FROM walked) = 5200
  AND (SELECT count(DISTINCT application_id) FROM walked) = 5200
  AND (SELECT count(DISTINCT rank) FROM walked) = 5200
  AND NOT EXISTS (SELECT 1 FROM public.job_applications a WHERE a.job_id = (SELECT job_a FROM cv)
                     AND a.id NOT IN (SELECT application_id FROM walked)),
  'P6 walking every page of the name sort visits every application once, no row twice, none lost');
SELECT pg_temp.ok(
  (SELECT bool_and(rank BETWEEN (page - 1) * 25 + 1 AND page * 25) FROM walked),
  'P7 and each rank sits on the page its number says');
SELECT pg_temp.ok(
  (SELECT count(*) = 10 AND bool_and(total = 10) AND max(rank) = 10
     FROM public.rec_candidate_view((SELECT job_a FROM cv), 'decided', NULL, NULL, '[]', 'applied', NULL, 1, 100, NULL)),
  'P8 a page larger than the filtered list is the whole filtered list (10 decided)');
SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM public.rec_candidate_view((SELECT job_a2 FROM cv), 'decided', NULL, NULL, '[]', 'applied', NULL, 1, 25, NULL)),
  'P9 an empty filtered list is an empty page, not an error');

-- ---------------------------------------------------------------------------
DO $$ BEGIN RAISE NOTICE 'GROUP S — stable sorting'; END $$;

-- Applicants 100..109 applied at the same instant as applicant 600 (minute
-- 600 = 10:00): eleven rows with one timestamp, at ranks 590..600 of the
-- ascending applied order (page 24) and 4 601..4 611 descending (page 185).
-- Their relative order is by id, the same on every call and the same
-- whichever direction.
SELECT pg_temp.ok(
  (SELECT array_agg(application_id ORDER BY rank)
     FROM public.rec_candidate_view((SELECT job_a FROM cv), 'all', NULL, NULL, '[]', 'applied', 'asc', 24, 25, NULL)
    WHERE application_id IN (SELECT app FROM seq WHERE n BETWEEN 100 AND 109 OR n = 600))
  = (SELECT array_agg(app ORDER BY app) FROM seq WHERE n BETWEEN 100 AND 109 OR n = 600)
  AND (SELECT count(*) FROM public.rec_candidate_view((SELECT job_a FROM cv), 'all', NULL, NULL, '[]', 'applied', 'asc', 24, 25, NULL)
        WHERE application_id IN (SELECT app FROM seq WHERE n BETWEEN 100 AND 109 OR n = 600)) = 11,
  'S1 eleven applications with one and the same timestamp are ordered by id, ascending');
SELECT pg_temp.ok(
  (SELECT array_agg(application_id ORDER BY rank)
     FROM public.rec_candidate_view((SELECT job_a FROM cv), 'all', NULL, NULL, '[]', 'applied', 'desc', 185, 25, NULL)
    WHERE application_id IN (SELECT app FROM seq WHERE n BETWEEN 100 AND 109 OR n = 600))
  = (SELECT array_agg(app ORDER BY app) FROM seq WHERE n BETWEEN 100 AND 109 OR n = 600)
  AND (SELECT count(*) FROM public.rec_candidate_view((SELECT job_a FROM cv), 'all', NULL, NULL, '[]', 'applied', 'desc', 185, 25, NULL)
        WHERE application_id IN (SELECT app FROM seq WHERE n BETWEEN 100 AND 109 OR n = 600)) = 11,
  'S2 and by id ascending when the sort is descending too -- the tie-break never flips');
SELECT pg_temp.ok(
  (SELECT array_agg(display_name ORDER BY rank)
     FROM public.rec_candidate_view((SELECT job_a FROM cv), 'all', NULL, NULL, '[]', 'name', 'desc', 1, 4, NULL))
  = ARRAY['Örjan Östlund', 'Åsa Ålund', 'Zara Zetterlund', 'Sökande 5200'],
  'S3 names sort in Swedish order: Ö after Å after Z, not among the O:s and A:s');
SELECT pg_temp.ok(
  (SELECT display_name IS NULL
     FROM public.rec_candidate_view((SELECT job_a FROM cv), 'all', NULL, NULL, '[]', 'name', 'asc', 208, 25, NULL)
    WHERE rank = 5200)
  AND (SELECT display_name IS NULL
     FROM public.rec_candidate_view((SELECT job_a FROM cv), 'all', NULL, NULL, '[]', 'name', 'desc', 208, 25, NULL)
    WHERE rank = 5200),
  'S4 an unnamed candidate sorts last whichever way the names are sorted');
SELECT pg_temp.ok(
  (SELECT array_agg(status ORDER BY rank)
     FROM public.rec_candidate_view((SELECT job_a FROM cv), 'all', NULL, NULL, '[]', 'stage', 'desc', 1, 12, NULL))
  = ARRAY['rejected','rejected','rejected','rejected','rejected','rejected','rejected','rejected','hired','hired','interview','interview'],
  'S5 the stage sort runs the process backwards when descending: rejected, hired, interview');
SELECT pg_temp.ok(
  (SELECT array_agg(display_name ORDER BY rank)
     FROM public.rec_candidate_view((SELECT job_a FROM cv), 'all', NULL, NULL, '[]', 'activity', 'asc', 1, 2, NULL))
  = ARRAY['Sökande 5160', 'Sökande 5161']
  AND (SELECT array_agg(display_name ORDER BY rank)
     FROM public.rec_candidate_view((SELECT job_a FROM cv), 'all', NULL, NULL, '[]', 'activity', 'desc', 1, 2, NULL))
  = ARRAY['Sökande 5161', 'Sökande 5160'],
  'S6 the activity sort puts the planned interviews first either way, and the cancelled one is not planned');
SELECT pg_temp.ok(
  (SELECT next_activity_at IS NULL
     FROM public.rec_candidate_view((SELECT job_a FROM cv), 'all', NULL, 'Sökande 5199', '[]', 'applied', NULL, 1, 25, NULL)),
  'S7 a hired candidate''s leftover booking is not a next activity');
SELECT pg_temp.ok(
  (SELECT next_activity_at IS NULL
     FROM public.rec_candidate_view((SELECT job_a FROM cv), 'all', NULL, 'Sökande 5162', '[]', 'applied', NULL, 1, 25, NULL)),
  'S8 nor is a cancelled one');

-- ---------------------------------------------------------------------------
DO $$ BEGIN RAISE NOTICE 'GROUP Q — filters narrow the same list the counts describe'; END $$;

SELECT pg_temp.ok(
  (SELECT count(*) = 1 AND bool_and(total = 1) AND bool_and(rank = 1) AND bool_and(display_name = 'Sökande 5140')
     FROM public.rec_candidate_view((SELECT job_a FROM cv), 'all', NULL, 'sökande 5140', '[]', 'applied', NULL, 1, 25, NULL)),
  'Q1 search finds applicant 5 140 -- past the old limit -- as the one hit, rank 1 of 1');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.rec_candidate_view((SELECT job_a FROM cv), 'all', NULL, '100%', '[]', 'applied', NULL, 1, 25, NULL)) = 0
  AND (SELECT count(*) FROM public.rec_candidate_view((SELECT job_a FROM cv), 'all', NULL, 'Sökande 51_0', '[]', 'applied', NULL, 1, 25, NULL)) = 0,
  'Q2 a search is a plain substring: % and _ are letters, not wildcards');
SELECT pg_temp.ok(
  (SELECT bool_and(total = 150) AND bool_and(status = 'reviewing')
     FROM public.rec_candidate_view((SELECT job_a FROM cv), 'review', NULL, NULL, '[]', 'applied', NULL, 1, 25, NULL))
  AND (SELECT bool_and(total = 5190)
     FROM public.rec_candidate_view((SELECT job_a FROM cv), 'open', NULL, NULL, '[]', 'applied', NULL, 1, 25, NULL)),
  'Q3 the stage filters give exactly the counts rec_job_counts gave');
SELECT pg_temp.ok(
  (SELECT bool_and(total = 10)
     FROM public.rec_candidate_view((SELECT job_a FROM cv), 'all', (SELECT member_a::text FROM cv), NULL, '[]', 'applied', NULL, 1, 25, NULL))
  AND (SELECT bool_and(total = 5188)
     FROM public.rec_candidate_view((SELECT job_a FROM cv), 'all', 'none', NULL, '[]', 'applied', NULL, 1, 25, NULL)),
  'Q4 the responsible filter: ten for the member, and ''none'' is everyone without one');
SELECT pg_temp.ok(
  (SELECT bool_and(total = 3000)
     FROM public.rec_candidate_view((SELECT job_a FROM cv), 'all', NULL, NULL,
       jsonb_build_array(jsonb_build_object('question_id', (SELECT id FROM public.recruitment_questions WHERE job_id = (SELECT job_a FROM cv) AND prompt_sv = 'Har du väktarutbildning?'), 'value', true)),
       'applied', NULL, 1, 25, NULL)),
  'Q5 ''yes'' on the training question is the 3 000 who answered yes');
SELECT pg_temp.ok(
  (SELECT bool_and(total = 2100)
     FROM public.rec_candidate_view((SELECT job_a FROM cv), 'all', NULL, NULL,
       jsonb_build_array(jsonb_build_object('question_id', (SELECT id FROM public.recruitment_questions WHERE job_id = (SELECT job_a FROM cv) AND prompt_sv = 'Har du väktarutbildning?'), 'value', false)),
       'applied', NULL, 1, 25, NULL)),
  'Q6 ''no'' is the 2 100 who answered no -- the 100 who never answered match neither');
SELECT pg_temp.ok(
  (SELECT bool_and(total = 1500)
     FROM public.rec_candidate_view((SELECT job_a FROM cv), 'all', NULL, NULL,
       jsonb_build_array(
         jsonb_build_object('question_id', (SELECT id FROM public.recruitment_questions WHERE job_id = (SELECT job_a FROM cv) AND prompt_sv = 'Har du väktarutbildning?'), 'value', true),
         jsonb_build_object('question_id', (SELECT id FROM public.recruitment_questions WHERE job_id = (SELECT job_a FROM cv) AND prompt_sv = 'Har du körkort B?'), 'value', true)),
       'applied', NULL, 1, 25, NULL)),
  'Q7 two answer filters are both required: the 1 500 odd applicants among the first 3 000');
SELECT pg_temp.ok(
  (SELECT count(*) = 7 AND bool_and(total = 7) AND bool_and(status = 'submitted') AND bool_and(responsible_user_id IS NULL)
     FROM public.rec_candidate_view((SELECT job_a FROM cv), 'new', 'none', 'Sökande 001', '[]', 'applied', NULL, 1, 25, NULL)),
  'Q8 stage, responsible and search combine: of Sökande 0010..0019, the seven new ones nobody is responsible for');

-- ---------------------------------------------------------------------------
DO $$ BEGIN RAISE NOTICE 'GROUP N — previous and next, without the list'; END $$;

-- Rank 26 (applied desc) is applicant 5175: the first row of page 2.
SELECT pg_temp.ok(
  (SELECT array_agg(rank ORDER BY rank) = ARRAY[25, 26, 27]::bigint[] AND bool_and(total = 5200)
     FROM public.rec_candidate_view((SELECT job_a FROM cv), 'all', NULL, NULL, '[]', 'applied', NULL, 1, 25,
                                    (SELECT app FROM seq WHERE n = 5175))),
  'N1 around the first row of page 2: the last row of page 1, itself, and the next -- three rows, ranks 25..27');
SELECT pg_temp.ok(
  (SELECT count(*) = 2 AND min(rank) = 1
     FROM public.rec_candidate_view((SELECT job_a FROM cv), 'all', NULL, NULL, '[]', 'applied', NULL, 1, 25,
                                    (SELECT app FROM seq WHERE n = 5200))),
  'N2 around the first row of the list: itself and the next, no previous');
SELECT pg_temp.ok(
  (SELECT count(*) = 2 AND max(rank) = 5200
     FROM public.rec_candidate_view((SELECT job_a FROM cv), 'all', NULL, NULL, '[]', 'applied', NULL, 1, 25,
                                    (SELECT app FROM seq WHERE n = 1))),
  'N3 around the last row of the list: the previous and itself, no next');
SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM public.rec_candidate_view((SELECT job_a FROM cv), 'review', NULL, NULL, '[]', 'applied', NULL, 1, 25,
                                    (SELECT app FROM seq WHERE n = 1))),
  'N4 a candidate outside the filtered list has no neighbours in it');
SELECT pg_temp.ok(
  (SELECT count(*) = 1 AND bool_and(rank = 1) AND bool_and(total = 1)
     FROM public.rec_candidate_view((SELECT job_a FROM cv), 'all', NULL, 'Sökande 5140', '[]', 'applied', NULL, 1, 25,
                                    (SELECT app FROM seq WHERE n = 5140))),
  'N5 a list of one has the one, rank 1 of 1');
SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM public.rec_candidate_view((SELECT job_a FROM cv), 'all', NULL, NULL, '[]', 'applied', NULL, 1, 25,
                                    'cf00cccc-0000-4000-8000-000000000001')),
  'N6 the same person''s application to ANOTHER vacancy is not in this list');
RESET ROLE; RESET request.jwt.claim.sub;

-- ---------------------------------------------------------------------------
DO $$ BEGIN RAISE NOTICE 'GROUP I — isolation'; END $$;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'cf000000-0000-0000-0000-00000000000d';
SELECT pg_temp.ok(
  (SELECT count(*) = 25 FROM public.rec_candidate_view((SELECT job_a FROM cv), 'all', NULL, NULL, '[]', 'applied', NULL, 1, 25, NULL))
  AND (SELECT total = 5200 FROM public.rec_job_counts((SELECT emp_a FROM cv), (SELECT job_a FROM cv))),
  'I1 a plain member of the organisation reads the list and the counts');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'cf000000-0000-0000-0000-00000000000b';
SELECT pg_temp.must_fail(format($f$SELECT count(*) FROM public.rec_candidate_view(%L, 'all', NULL, NULL, '[]', 'applied', NULL, 1, 25, NULL)$f$, (SELECT job_a FROM cv)),
  'RECRUITMENT_NOT_PERMITTED', 'I2 another organisation''s owner is refused the list');
SELECT pg_temp.must_fail(format($f$SELECT count(*) FROM public.rec_candidate_view(%L, 'all', NULL, NULL, '[]', 'applied', NULL, 1, 25, NULL)$f$, 'cf000000-2222-0000-0000-0000000000ff'),
  'RECRUITMENT_NOT_PERMITTED', 'I3 and a vacancy that does not exist is refused in the same words, so the read is no oracle');
SELECT pg_temp.must_fail(format($f$SELECT count(*) FROM public.rec_job_counts(%L, NULL)$f$, (SELECT emp_a FROM cv)),
  'RECRUITMENT_NOT_PERMITTED', 'I4 nor may they count the other organisation''s applications');
SELECT pg_temp.ok(
  (SELECT total = 1 FROM public.rec_job_counts((SELECT emp_b FROM cv), NULL)),
  'I5 while their own organisation counts as usual');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'cf00aaaa-0000-4000-8000-000000001420';  -- applicant 5152, a candidate
SELECT pg_temp.must_fail(format($f$SELECT count(*) FROM public.rec_candidate_view(%L, 'all', NULL, NULL, '[]', 'applied', NULL, 1, 25, NULL)$f$, (SELECT job_a FROM cv)),
  'RECRUITMENT_NOT_PERMITTED', 'I6 a candidate cannot read the list they are on');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'cf000000-0000-0000-0000-000000000c03';
SELECT pg_temp.must_fail(format($f$SELECT count(*) FROM public.rec_candidate_view(%L, 'all', NULL, NULL, '[]', 'applied', NULL, 1, 25, NULL)$f$, (SELECT job_a FROM cv)),
  'RECRUITMENT_NOT_PERMITTED', 'I7 a signed-in stranger is refused');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE anon;
SELECT pg_temp.must_fail(format($f$SELECT count(*) FROM public.rec_candidate_view(%L, 'all', NULL, NULL, '[]', 'applied', NULL, 1, 25, NULL)$f$, (SELECT job_a FROM cv)),
  'permission denied', 'I8 anon cannot execute the list read at all');
SELECT pg_temp.must_fail(format($f$SELECT count(*) FROM public.rec_job_counts(%L, NULL)$f$, (SELECT emp_a FROM cv)),
  'permission denied', 'I9 nor the counts');
RESET ROLE;

-- ---------------------------------------------------------------------------
DO $$ BEGIN RAISE NOTICE 'GROUP V — a malformed view is refused, never guessed at'; END $$;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'cf000000-0000-0000-0000-00000000000a';
SELECT pg_temp.must_fail(format($f$SELECT count(*) FROM public.rec_candidate_view(%L, 'everything', NULL, NULL, '[]', 'applied', NULL, 1, 25, NULL)$f$, (SELECT job_a FROM cv)),
  'CANDIDATE_VIEW_INVALID', 'V1 an unknown stage');
SELECT pg_temp.must_fail(format($f$SELECT count(*) FROM public.rec_candidate_view(%L, 'all', NULL, NULL, '[]', 'score', NULL, 1, 25, NULL)$f$, (SELECT job_a FROM cv)),
  'CANDIDATE_VIEW_INVALID', 'V2 an unknown sort');
SELECT pg_temp.must_fail(format($f$SELECT count(*) FROM public.rec_candidate_view(%L, 'all', NULL, NULL, '[]', 'applied', NULL, 1, 0, NULL)$f$, (SELECT job_a FROM cv)),
  'CANDIDATE_VIEW_INVALID', 'V3 a page of zero rows');
SELECT pg_temp.must_fail(format($f$SELECT count(*) FROM public.rec_candidate_view(%L, 'all', NULL, NULL, '[]', 'applied', NULL, 1, 101, NULL)$f$, (SELECT job_a FROM cv)),
  'CANDIDATE_VIEW_INVALID', 'V4 a page of more than a hundred rows');
SELECT pg_temp.must_fail(format($f$SELECT count(*) FROM public.rec_candidate_view(%L, 'all', 'anna', NULL, '[]', 'applied', NULL, 1, 25, NULL)$f$, (SELECT job_a FROM cv)),
  'CANDIDATE_VIEW_INVALID', 'V5 a responsible that is neither ''none'' nor an id');
SELECT pg_temp.must_fail(format($f$SELECT count(*) FROM public.rec_candidate_view(%L, 'all', NULL, NULL, '[{"question_id":"not-an-id","value":true}]', 'applied', NULL, 1, 25, NULL)$f$, (SELECT job_a FROM cv)),
  'CANDIDATE_VIEW_INVALID', 'V6 an answer filter with no question id');
SELECT pg_temp.must_fail(format($f$SELECT count(*) FROM public.rec_candidate_view(%L, 'all', NULL, NULL, '[{"question_id":"cf000000-2222-0000-0000-000000000001","value":"yes"}]', 'applied', NULL, 1, 25, NULL)$f$, (SELECT job_a FROM cv)),
  'CANDIDATE_VIEW_INVALID', 'V7 an answer filter whose value is not a boolean');
SELECT pg_temp.ok(
  (SELECT count(*) = 25 FROM public.rec_candidate_view((SELECT job_a FROM cv), 'all', NULL, NULL, '[]', 'applied', NULL, 0, 25, NULL)),
  'V8 page 0 is page 1');
RESET ROLE; RESET request.jwt.claim.sub;

ROLLBACK;
