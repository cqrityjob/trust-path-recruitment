-- Employer self-publication, and bilingual candidate requirements —
-- behaviour under real RLS.
--
-- Everything that asks "may THIS person do THIS to THAT row" runs as
-- `authenticated` with a JWT subject set, never as the owner, because the
-- owner can do anything and would prove nothing. Same shape as
-- supabase/tests/jobs_archive_test.sql.

\set ON_ERROR_STOP on
SET client_min_messages TO NOTICE;

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.ok(_cond boolean, _label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF NOT _cond THEN
    RAISE EXCEPTION 'ASSERTION FAILED: %', _label;
  END IF;
  RAISE NOTICE '    ok  %', _label;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.must_fail(_sql text, _needle text, _label text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE _msg text;
BEGIN
  BEGIN
    EXECUTE _sql;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS _msg = MESSAGE_TEXT;
    IF _msg NOT LIKE '%' || _needle || '%' THEN
      RAISE EXCEPTION 'ASSERTION FAILED: % -- refused, but with "%"', _label, _msg;
    END IF;
    RAISE NOTICE '    ok  %', _label;
    RETURN;
  END;
  RAISE EXCEPTION 'ASSERTION FAILED: % -- it was allowed', _label;
END $$;

-- ── Four organisations: active, pending, suspended, and a second active ────
-- one so "another tenant's job" is a real row rather than a hypothetical.

INSERT INTO auth.users (id, email) VALUES
  ('5e1f0000-0000-0000-0000-000000000001','owner-active@selfpub.invalid'),
  ('5e1f0000-0000-0000-0000-000000000002','owner-pending@selfpub.invalid'),
  ('5e1f0000-0000-0000-0000-000000000003','owner-suspended@selfpub.invalid'),
  ('5e1f0000-0000-0000-0000-000000000004','owner-other@selfpub.invalid');

INSERT INTO public.employers (id, name, slug, status) VALUES
  ('5e1f0000-1111-0000-0000-000000000001','Publicera Aktiv AB','pub-aktiv','active'),
  ('5e1f0000-1111-0000-0000-000000000002','Publicera Väntar AB','pub-vantar','pending'),
  ('5e1f0000-1111-0000-0000-000000000003','Publicera Stängd AB','pub-stangd','suspended'),
  ('5e1f0000-1111-0000-0000-000000000004','Publicera Annan AB','pub-annan','active');

INSERT INTO public.employer_memberships (employer_id, user_id, role, status, accepted_at) VALUES
  ('5e1f0000-1111-0000-0000-000000000001','5e1f0000-0000-0000-0000-000000000001','owner','active',now()),
  ('5e1f0000-1111-0000-0000-000000000002','5e1f0000-0000-0000-0000-000000000002','owner','active',now()),
  ('5e1f0000-1111-0000-0000-000000000003','5e1f0000-0000-0000-0000-000000000003','owner','active',now()),
  ('5e1f0000-1111-0000-0000-000000000004','5e1f0000-0000-0000-0000-000000000004','owner','active',now());

-- A complete, publication-ready draft for the active employer, plus the
-- deliberately incomplete and deliberately wrong ones.
INSERT INTO public.jobs
  (id, employer_id, slug, short_id, title_sv, description_sv, status,
   application_method, application_url, application_email, expires_at)
VALUES
  -- P1: complete, internal application.
  ('5e1f0000-2222-0000-0000-000000000001','5e1f0000-1111-0000-0000-000000000001',
   'pub-aktiv-komplett','pubaaa0001','Väktare Stockholm','En riktig beskrivning av rollen.',
   'draft','internal',NULL,NULL, now() + interval '30 days'),
  -- P2: no application route chosen at all.
  ('5e1f0000-2222-0000-0000-000000000002','5e1f0000-1111-0000-0000-000000000001',
   'pub-aktiv-ofullstandig','pubaaa0002','Väktare Göteborg','En riktig beskrivning av rollen.',
   'draft','unavailable',NULL,NULL, now() + interval '30 days'),
  -- P3: external, but no URL.
  ('5e1f0000-2222-0000-0000-000000000003','5e1f0000-1111-0000-0000-000000000001',
   'pub-aktiv-extern','pubaaa0003','Väktare Malmö','En riktig beskrivning av rollen.',
   'draft','external',NULL,NULL, now() + interval '30 days'),
  -- P4: email, but a malformed address.
  ('5e1f0000-2222-0000-0000-000000000004','5e1f0000-1111-0000-0000-000000000001',
   'pub-aktiv-epost','pubaaa0004','Väktare Uppsala','En riktig beskrivning av rollen.',
   'draft','email',NULL,'inte-en-adress', now() + interval '30 days'),
  -- P5: complete, but the display window is far too long.
  ('5e1f0000-2222-0000-0000-000000000005','5e1f0000-1111-0000-0000-000000000001',
   'pub-aktiv-forlang','pubaaa0005','Väktare Örebro','En riktig beskrivning av rollen.',
   'draft','internal',NULL,NULL, now() + interval '200 days'),
  -- P6: complete, but no expires_at at all.
  ('5e1f0000-2222-0000-0000-000000000006','5e1f0000-1111-0000-0000-000000000001',
   'pub-aktiv-inget-slut','pubaaa0006','Väktare Umeå','En riktig beskrivning av rollen.',
   'draft','internal',NULL,NULL, NULL),
  -- P7: the pending employer's complete draft.
  ('5e1f0000-2222-0000-0000-000000000007','5e1f0000-1111-0000-0000-000000000002',
   'pub-vantar-komplett','pubbbb0001','Väktare Kalmar','En riktig beskrivning av rollen.',
   'draft','internal',NULL,NULL, now() + interval '30 days'),
  -- P8: the suspended employer's complete draft.
  ('5e1f0000-2222-0000-0000-000000000008','5e1f0000-1111-0000-0000-000000000003',
   'pub-stangd-komplett','pubccc0001','Väktare Visby','En riktig beskrivning av rollen.',
   'draft','internal',NULL,NULL, now() + interval '30 days'),
  -- P9: the OTHER active tenant's complete draft.
  ('5e1f0000-2222-0000-0000-000000000009','5e1f0000-1111-0000-0000-000000000004',
   'pub-annan-komplett','pubddd0001','Väktare Luleå','En riktig beskrivning av rollen.',
   'draft','internal',NULL,NULL, now() + interval '30 days'),
  -- P10: becomes the legacy advertisement sitting in pending_review, a few
  -- lines below. It is inserted as a draft and moved there by the normal
  -- employer transition, because jobs_validate_before_write() has always
  -- refused to let anyone but an admin CREATE a job in any other status --
  -- a rule this change does not touch, and one worth not faking around.
  ('5e1f0000-2222-0000-0000-00000000000a','5e1f0000-1111-0000-0000-000000000001',
   'pub-aktiv-legacy','pubaaa0010','Väktare Borås','En riktig beskrivning av rollen.',
   'draft','internal',NULL,NULL, now() + interval '30 days'),
  -- P11: an incomplete draft that must stay saveable as a draft.
  ('5e1f0000-2222-0000-0000-00000000000b','5e1f0000-1111-0000-0000-000000000001',
   'pub-aktiv-tomt','pubaaa0011',NULL,NULL,
   'draft','unavailable',NULL,NULL, NULL),
  -- P12: external WITH a valid URL — the positive case for that method.
  ('5e1f0000-2222-0000-0000-00000000000c','5e1f0000-1111-0000-0000-000000000001',
   'pub-aktiv-extern-ok','pubaaa0012','Väktare Gävle','En riktig beskrivning av rollen.',
   'draft','external','https://exempel.invalid/ansok',NULL, now() + interval '30 days'),
  -- P13: email WITH a valid address.
  ('5e1f0000-2222-0000-0000-00000000000d','5e1f0000-1111-0000-0000-000000000001',
   'pub-aktiv-epost-ok','pubaaa0013','Väktare Falun','En riktig beskrivning av rollen.',
   'draft','email',NULL,'jobb@exempel.invalid', now() + interval '30 days');

-- P10 takes the moderated route, which is still open, and then stays there
-- for the rest of the suite as the legacy advertisement nobody has cleared.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '5e1f0000-0000-0000-0000-000000000001';
UPDATE public.jobs SET status = 'pending_review'
 WHERE id = '5e1f0000-2222-0000-0000-00000000000a';
RESET ROLE; RESET request.jwt.claim.sub;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. An ACTIVE employer publishes its own valid draft — directly
-- ═══════════════════════════════════════════════════════════════════════════
-- The whole point of the change. No admin, no pending_review, no second actor.

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '5e1f0000-0000-0000-0000-000000000001';

UPDATE public.jobs SET status = 'published'
 WHERE id = '5e1f0000-2222-0000-0000-000000000001';

RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT status FROM public.jobs WHERE id = '5e1f0000-2222-0000-0000-000000000001') = 'published',
  'S1 an active employer publishes its own valid draft directly');

SELECT pg_temp.ok(
  (SELECT published_at FROM public.jobs
    WHERE id = '5e1f0000-2222-0000-0000-000000000001') IS NOT NULL,
  'S2 published_at was set');

-- Stamped by the trigger, not supplied by the caller: it must be *now*,
-- which no client value would coincidentally be.
SELECT pg_temp.ok(
  (SELECT published_at FROM public.jobs
    WHERE id = '5e1f0000-2222-0000-0000-000000000001') BETWEEN now() - interval '1 minute' AND now(),
  'S3 published_at was stamped by the database, not accepted from the caller');

-- And the advertisement is genuinely visible to the public predicate.
SELECT pg_temp.ok(
  (SELECT public.job_is_active(status, published_at, deadline_at, expires_at)
     FROM public.jobs WHERE id = '5e1f0000-2222-0000-0000-000000000001'),
  'S4 the published advertisement is publicly active');

SELECT pg_temp.ok(
  public.employer_is_active_status('5e1f0000-1111-0000-0000-000000000001'),
  'S5 ...and its employer passes the public-visibility employer gate');

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. A caller cannot choose its own published_at
-- ═══════════════════════════════════════════════════════════════════════════
-- The forged value is DISCARDED, not honoured and not merely refused: a
-- backdated published_at would silently widen the 90-day display window.

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '5e1f0000-0000-0000-0000-000000000001';

UPDATE public.jobs
   SET status = 'published', published_at = now() - interval '300 days'
 WHERE id = '5e1f0000-2222-0000-0000-00000000000c';

RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT published_at FROM public.jobs
    WHERE id = '5e1f0000-2222-0000-0000-00000000000c') > now() - interval '1 minute',
  'S6 a client-supplied backdated published_at is discarded and replaced with now()');

SELECT pg_temp.ok(
  (SELECT status FROM public.jobs WHERE id = '5e1f0000-2222-0000-0000-00000000000c') = 'published',
  'S7 an external application with a valid URL publishes');

-- An email application with a valid address publishes too.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '5e1f0000-0000-0000-0000-000000000001';
UPDATE public.jobs SET status = 'published'
 WHERE id = '5e1f0000-2222-0000-0000-00000000000d';
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT status FROM public.jobs WHERE id = '5e1f0000-2222-0000-0000-00000000000d') = 'published',
  'S8 an email application with a valid address publishes');

-- published_at stays moderation-owned on every OTHER employer update.
DO $$
BEGIN
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub','5e1f0000-0000-0000-0000-000000000001', true);
  PERFORM pg_temp.must_fail(
    'UPDATE public.jobs SET published_at = now() - interval ''10 days'' '
    'WHERE id = ''5e1f0000-2222-0000-0000-000000000001''',
    'published_at is a moderation-owned field',
    'S9 published_at is still moderation-owned on an ordinary employer update');
  EXECUTE 'RESET ROLE';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. The publication quality gate — every check still bites
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub','5e1f0000-0000-0000-0000-000000000001', true);

  PERFORM pg_temp.must_fail(
    'UPDATE public.jobs SET status = ''published'' '
    'WHERE id = ''5e1f0000-2222-0000-0000-000000000002''',
    'application_method=unavailable',
    'S10 an advert with no chosen application route cannot publish');

  PERFORM pg_temp.must_fail(
    'UPDATE public.jobs SET status = ''published'' '
    'WHERE id = ''5e1f0000-2222-0000-0000-000000000003''',
    'requires a non-empty application_url',
    'S11 an external application with no URL cannot publish');

  PERFORM pg_temp.must_fail(
    'UPDATE public.jobs SET status = ''published'' '
    'WHERE id = ''5e1f0000-2222-0000-0000-000000000004''',
    'requires a valid application_email',
    'S12 an email application with a malformed address cannot publish');

  PERFORM pg_temp.must_fail(
    'UPDATE public.jobs SET status = ''published'' '
    'WHERE id = ''5e1f0000-2222-0000-0000-000000000005''',
    'more than 90 days',
    'S13 the maximum publication window is still enforced');

  PERFORM pg_temp.must_fail(
    'UPDATE public.jobs SET status = ''published'' '
    'WHERE id = ''5e1f0000-2222-0000-0000-000000000006''',
    'requires expires_at to be set',
    'S14 an advert with no last display day cannot publish');

  EXECUTE 'RESET ROLE';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Employer approval still means something
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub','5e1f0000-0000-0000-0000-000000000002', true);
  PERFORM pg_temp.must_fail(
    'UPDATE public.jobs SET status = ''published'' '
    'WHERE id = ''5e1f0000-2222-0000-0000-000000000007''',
    'employer organisation is not approved',
    'S15 a PENDING employer cannot publish');
  EXECUTE 'RESET ROLE';
END $$;

-- A suspended employer is stopped even earlier: employer_members_can_edit()
-- excludes 'suspended', so the update policy never reaches the row at all.
-- Zero rows affected IS the refusal, so the row is what gets asserted.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '5e1f0000-0000-0000-0000-000000000003';

UPDATE public.jobs SET status = 'published'
 WHERE id = '5e1f0000-2222-0000-0000-000000000008';

RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT status FROM public.jobs WHERE id = '5e1f0000-2222-0000-0000-000000000008') = 'draft',
  'S16 a SUSPENDED employer cannot publish');

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Tenant isolation is untouched
-- ═══════════════════════════════════════════════════════════════════════════
-- The single most important thing self-publication must not have loosened.

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '5e1f0000-0000-0000-0000-000000000001';

UPDATE public.jobs SET status = 'published'
 WHERE id = '5e1f0000-2222-0000-0000-000000000009';

RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT status FROM public.jobs WHERE id = '5e1f0000-2222-0000-0000-000000000009') = 'draft',
  'S17 an employer cannot publish another tenant''s job');

SELECT pg_temp.ok(
  (SELECT published_at FROM public.jobs
    WHERE id = '5e1f0000-2222-0000-0000-000000000009') IS NULL,
  'S18 ...and the other tenant''s row was not touched at all');

-- Nor can it even READ the other tenant's rows.
DO $$
DECLARE _n int;
BEGIN
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub','5e1f0000-0000-0000-0000-000000000001', true);
  SELECT count(*) INTO _n FROM public.jobs
   WHERE employer_id = '5e1f0000-1111-0000-0000-000000000004';
  EXECUTE 'RESET ROLE';
  IF _n <> 0 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: S19 cross-tenant leakage -- % foreign job rows were visible', _n;
  END IF;
  RAISE NOTICE '    ok  S19 no cross-tenant leakage on read';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Drafts, and legacy pending_review, still behave
-- ═══════════════════════════════════════════════════════════════════════════

-- An incomplete draft still saves. Nothing about publication made drafting
-- stricter -- this is the promise the four-step form makes on every screen.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '5e1f0000-0000-0000-0000-000000000001';

UPDATE public.jobs
   SET title_sv = 'Halvfärdig rubrik', updated_at = now()
 WHERE id = '5e1f0000-2222-0000-0000-00000000000b';

RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT title_sv FROM public.jobs
    WHERE id = '5e1f0000-2222-0000-0000-00000000000b') = 'Halvfärdig rubrik',
  'S20 an incomplete draft still saves, with no application route and no dates');

SELECT pg_temp.ok(
  (SELECT status FROM public.jobs WHERE id = '5e1f0000-2222-0000-0000-00000000000b') = 'draft',
  'S21 ...and stays a draft');

-- The route into moderation is retained, not deleted.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '5e1f0000-0000-0000-0000-000000000001';
UPDATE public.jobs SET status = 'pending_review'
 WHERE id = '5e1f0000-2222-0000-0000-000000000003';
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT status FROM public.jobs WHERE id = '5e1f0000-2222-0000-0000-000000000003') = 'pending_review',
  'S22 draft -> pending_review is retained for the exceptional advert');

-- A legacy advertisement sitting in pending_review is still readable and
-- still the moderator's: the employer cannot pull it out from under them.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.jobs
    WHERE status = 'pending_review'
      AND employer_id = '5e1f0000-1111-0000-0000-000000000001') = 2,
  'S23 legacy pending_review advertisements remain readable');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '5e1f0000-0000-0000-0000-000000000001';
UPDATE public.jobs SET status = 'published'
 WHERE id = '5e1f0000-2222-0000-0000-00000000000a';
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT status FROM public.jobs WHERE id = '5e1f0000-2222-0000-0000-00000000000a') = 'pending_review',
  'S24 an advert in moderation cannot be self-published out from under the moderator');

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. Admin intervention still works
-- ═══════════════════════════════════════════════════════════════════════════
-- Self-publication removes admin from the NORMAL path. It must not remove
-- admin's reach when something is reported or wrong.

INSERT INTO auth.users (id, email)
VALUES ('5e1f0000-0000-0000-0000-0000000000ad','admin@selfpub.invalid');
INSERT INTO public.user_roles (user_id, role)
VALUES ('5e1f0000-0000-0000-0000-0000000000ad','admin');

-- Admin can see every tenant's advertisement, published or not.
DO $$
DECLARE _n int;
BEGIN
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub','5e1f0000-0000-0000-0000-0000000000ad', true);
  SELECT count(*) INTO _n FROM public.jobs
   WHERE employer_id IN ('5e1f0000-1111-0000-0000-000000000001',
                         '5e1f0000-1111-0000-0000-000000000004');
  EXECUTE 'RESET ROLE';
  IF _n < 10 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: S25 admin cannot see employer jobs (saw % rows)', _n;
  END IF;
  RAISE NOTICE '    ok  S25 admin can still view every employer''s advertisements';
END $$;

-- Admin can take down a self-published advertisement.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '5e1f0000-0000-0000-0000-0000000000ad';

UPDATE public.jobs SET status = 'archived'
 WHERE id = '5e1f0000-2222-0000-0000-00000000000d';

RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT status FROM public.jobs WHERE id = '5e1f0000-2222-0000-0000-00000000000d') = 'archived',
  'S26 admin can archive an advertisement the employer published itself');

SELECT pg_temp.ok(
  NOT (SELECT public.job_is_active(status, published_at, deadline_at, expires_at)
         FROM public.jobs WHERE id = '5e1f0000-2222-0000-0000-00000000000d'),
  'S27 ...and it stops being publicly visible immediately');

-- Admin can also push one back to pending_review, which no employer may do.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '5e1f0000-0000-0000-0000-0000000000ad';
UPDATE public.jobs SET status = 'pending_review'
 WHERE id = '5e1f0000-2222-0000-0000-00000000000c';
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT status FROM public.jobs WHERE id = '5e1f0000-2222-0000-0000-00000000000c') = 'pending_review',
  'S28 admin can pull a published advertisement back into moderation');

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. Bilingual candidate requirements
-- ═══════════════════════════════════════════════════════════════════════════

-- Optional in both languages: the complete advert published in S1 without
-- either column set, which is the only proof that matters for "requirements
-- are not incorrectly required".
SELECT pg_temp.ok(
  (SELECT requirements_sv IS NULL AND requirements_en IS NULL
     FROM public.jobs WHERE id = '5e1f0000-2222-0000-0000-000000000001'),
  'R1 an advertisement published successfully with no requirements at all');

-- Swedish only.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '5e1f0000-0000-0000-0000-000000000001';
UPDATE public.jobs SET requirements_sv = 'Godkänd väktarutbildning och B-körkort.'
 WHERE id = '5e1f0000-2222-0000-0000-00000000000b';
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT requirements_sv FROM public.jobs
    WHERE id = '5e1f0000-2222-0000-0000-00000000000b')
      = 'Godkänd väktarutbildning och B-körkort.',
  'R2 a Swedish-only requirements text saves and reads back');

SELECT pg_temp.ok(
  (SELECT requirements_en FROM public.jobs
    WHERE id = '5e1f0000-2222-0000-0000-00000000000b') IS NULL,
  'R3 ...leaving English empty, which is allowed');

-- English only, on a different advertisement.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '5e1f0000-0000-0000-0000-000000000001';
UPDATE public.jobs SET requirements_en = 'Approved security officer training and a driving licence.'
 WHERE id = '5e1f0000-2222-0000-0000-000000000002';
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT requirements_en FROM public.jobs
    WHERE id = '5e1f0000-2222-0000-0000-000000000002')
      = 'Approved security officer training and a driving licence.'
  AND (SELECT requirements_sv FROM public.jobs
        WHERE id = '5e1f0000-2222-0000-0000-000000000002') IS NULL,
  'R4 an English-only requirements text saves and reads back');

-- The legacy monolingual jsonb column is untouched and still holds its data.
INSERT INTO public.jobs
  (id, employer_id, slug, short_id, title_sv, description_sv, status,
   application_method, expires_at, requirements)
VALUES
  ('5e1f0000-2222-0000-0000-0000000000ff','5e1f0000-1111-0000-0000-000000000001',
   'pub-aktiv-legacy-krav','pubaaa0099','Gammal annons','Beskrivning.',
   'draft','internal', now() + interval '30 days',
   '["Godkänd väktarutbildning (BYA GK1)","B-körkort"]'::jsonb);

SELECT pg_temp.ok(
  (SELECT jsonb_array_length(requirements) FROM public.jobs
    WHERE id = '5e1f0000-2222-0000-0000-0000000000ff') = 2,
  'R5 a legacy monolingual requirements array is preserved verbatim');

-- And such an advertisement still publishes: the new columns are not a
-- new precondition for anything.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '5e1f0000-0000-0000-0000-000000000001';
UPDATE public.jobs SET status = 'published'
 WHERE id = '5e1f0000-2222-0000-0000-0000000000ff';
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT status FROM public.jobs WHERE id = '5e1f0000-2222-0000-0000-0000000000ff') = 'published'
  AND (SELECT requirements FROM public.jobs
        WHERE id = '5e1f0000-2222-0000-0000-0000000000ff') IS NOT NULL,
  'R6 an advertisement carrying only LEGACY requirements publishes, and keeps them');

-- Requirements cannot be rewritten while closing a live advertisement.
DO $$
BEGIN
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub','5e1f0000-0000-0000-0000-000000000001', true);
  PERFORM pg_temp.must_fail(
    'UPDATE public.jobs SET status = ''archived'', requirements_sv = ''Något helt annat'' '
    'WHERE id = ''5e1f0000-2222-0000-0000-0000000000ff''',
    'Only status may change when archiving',
    'R7 requirements cannot be changed in the same breath as closing a live advert');
  EXECUTE 'RESET ROLE';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. Nothing was destroyed
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE _n int;
BEGIN
  SELECT count(*) INTO _n FROM public.jobs
   WHERE employer_id IN ('5e1f0000-1111-0000-0000-000000000001',
                         '5e1f0000-1111-0000-0000-000000000002',
                         '5e1f0000-1111-0000-0000-000000000003',
                         '5e1f0000-1111-0000-0000-000000000004');
  IF _n <> 14 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: R8 expected 14 job rows, found %', _n;
  END IF;
  RAISE NOTICE '    ok  R8 no job row was destroyed anywhere in this suite';
END $$;

DO $$ BEGIN RAISE NOTICE '    ok  36 self-publish + requirements assertions passed'; END $$;

ROLLBACK;
