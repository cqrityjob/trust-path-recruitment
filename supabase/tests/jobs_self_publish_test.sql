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

-- The organisation whose only member is ALSO a platform admin. This is not a
-- hypothetical: on the live database `buller-o-bang` and `cqrityjob` are both
-- shaped exactly like this, and it is the shape that 20260906091000 could not
-- publish. Every fixture in the original suite deliberately kept the employer
-- owner and the platform admin as different people, which is precisely why
-- the defect reached production green.
INSERT INTO auth.users (id, email)
VALUES ('5e1f0000-0000-0000-0000-000000000005','owner-and-admin@selfpub.invalid');
INSERT INTO public.employers (id, name, slug, status)
VALUES ('5e1f0000-1111-0000-0000-000000000005','Publicera Adminägd AB','pub-adminagd','active');
INSERT INTO public.user_roles (user_id, role)
VALUES ('5e1f0000-0000-0000-0000-000000000005','admin');

INSERT INTO public.employer_memberships (employer_id, user_id, role, status, accepted_at) VALUES
  ('5e1f0000-1111-0000-0000-000000000005','5e1f0000-0000-0000-0000-000000000005','owner','active',now()),
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
  -- P14: owned by the organisation whose only member is also a platform admin.
  ('5e1f0000-2222-0000-0000-0000000000e1','5e1f0000-1111-0000-0000-000000000005',
   'pub-adminagd-komplett','pubeee0001','Väktare Sundsvall','En riktig beskrivning av rollen.',
   'draft','internal',NULL,NULL, now() + interval '30 days'),
  -- P15: same organisation, used for the republication rule.
  ('5e1f0000-2222-0000-0000-0000000000e2','5e1f0000-1111-0000-0000-000000000005',
   'pub-adminagd-republ','pubeee0002','Väktare Östersund','En riktig beskrivning av rollen.',
   'draft','internal',NULL,NULL, now() + interval '30 days'),
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
-- REFUSED, not silently discarded. Until 20260906100000 the trigger stamped
-- over a forged value and let the write through; now a non-admin who sends a
-- published_at at all fails the moderation-owned guard. The value never takes
-- effect either way -- a backdated one would silently widen the 90-day
-- display window -- but a hard refusal is the stricter behaviour and does not
-- quietly rewrite what the caller asked for.

DO $$
BEGIN
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub','5e1f0000-0000-0000-0000-000000000001', true);
  -- Backdated by ten days, deliberately, not by three hundred: a large
  -- backdate is refused by the 90-day display-window rule instead, which
  -- runs earlier, and would let this assertion pass without the guard it
  -- is actually meant to be testing ever being reached.
  PERFORM pg_temp.must_fail(
    'UPDATE public.jobs SET status = ''published'', '
    'published_at = now() - interval ''10 days'' '
    'WHERE id = ''5e1f0000-2222-0000-0000-00000000000c''',
    'published_at is a moderation-owned field',
    'S6 an employer-supplied backdated published_at is refused outright');

  -- A wildly backdated one is refused too, just by a different rule: it
  -- breaks the display window before the moderation guard is reached.
  -- Both paths refuse; neither lets the forged value take effect.
  PERFORM pg_temp.must_fail(
    'UPDATE public.jobs SET status = ''published'', '
    'published_at = now() - interval ''300 days'' '
    'WHERE id = ''5e1f0000-2222-0000-0000-00000000000c''',
    'expires_at cannot be more than 90 days after published_at',
    'S6c a heavily backdated published_at is refused by the display-window rule');

  -- And a future-dated one cannot slip through either.
  PERFORM pg_temp.must_fail(
    'UPDATE public.jobs SET status = ''published'', '
    'published_at = now() + interval ''5 days'' '
    'WHERE id = ''5e1f0000-2222-0000-0000-00000000000c''',
    'past or current timestamp',
    'S6d a future-dated published_at is refused');
  EXECUTE 'RESET ROLE';
END $$;

SELECT pg_temp.ok(
  (SELECT status FROM public.jobs WHERE id = '5e1f0000-2222-0000-0000-00000000000c') = 'draft',
  'S6b the forged write changed nothing at all');

-- The same advertisement publishes cleanly once nothing is forged.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '5e1f0000-0000-0000-0000-000000000001';
UPDATE public.jobs SET status = 'published'
 WHERE id = '5e1f0000-2222-0000-0000-00000000000c';
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT status FROM public.jobs WHERE id = '5e1f0000-2222-0000-0000-00000000000c') = 'published',
  'S7 an external application with a valid URL publishes');

SELECT pg_temp.ok(
  (SELECT published_at FROM public.jobs
    WHERE id = '5e1f0000-2222-0000-0000-00000000000c') > now() - interval '1 minute',
  'S7b ...and its published_at is the database''s own stamp, not an old date');

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
-- 8b. The admin-who-is-also-a-member case (regression: 20260906100000)
-- ═══════════════════════════════════════════════════════════════════════════
-- The stamp must key off "did the caller supply a published_at", never off
-- "is the caller a platform admin".

SELECT pg_temp.ok(
  public.is_platform_admin('5e1f0000-0000-0000-0000-000000000005'),
  'X1 the actor really is a platform admin AND an active employer owner');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '5e1f0000-0000-0000-0000-000000000005';

UPDATE public.jobs SET status = 'published'
 WHERE id = '5e1f0000-2222-0000-0000-0000000000e1';

RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT status FROM public.jobs WHERE id = '5e1f0000-2222-0000-0000-0000000000e1') = 'published',
  'X2 an employer member who is ALSO a platform admin can self-publish');

SELECT pg_temp.ok(
  (SELECT published_at FROM public.jobs
    WHERE id = '5e1f0000-2222-0000-0000-0000000000e1')
      BETWEEN now() - interval '1 minute' AND now(),
  'X3 ...and the database stamped published_at, current and not in the future');

SELECT pg_temp.ok(
  (SELECT public.job_is_active(status, published_at, deadline_at, expires_at)
     FROM public.jobs WHERE id = '5e1f0000-2222-0000-0000-0000000000e1'),
  'X4 ...and the advertisement is publicly active');

-- Republication gets a FRESH date, never the old one carried forward.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '5e1f0000-0000-0000-0000-000000000005';
UPDATE public.jobs SET status = 'published'
 WHERE id = '5e1f0000-2222-0000-0000-0000000000e2';
RESET ROLE; RESET request.jwt.claim.sub;

-- Take it down and put it back up: published -> archived -> draft -> published.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '5e1f0000-0000-0000-0000-000000000005';
UPDATE public.jobs SET status = 'archived' WHERE id = '5e1f0000-2222-0000-0000-0000000000e2';
UPDATE public.jobs SET status = 'draft'    WHERE id = '5e1f0000-2222-0000-0000-0000000000e2';
RESET ROLE; RESET request.jwt.claim.sub;

-- Age the stored publication date while the row is a DRAFT. Two constraints
-- shape this, and both are the guards working rather than getting in the way:
--   * it cannot be done while the advert is live, because the published-branch
--     validation re-runs on every write to a published row and would reject a
--     200-day-old published_at against a 30-day expires_at;
--   * it has to be done AS A PLATFORM ADMIN, because published_at is a
--     moderation-owned field for everyone else -- including the table owner,
--     whose auth.uid() is NULL and who is therefore not an admin here.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '5e1f0000-0000-0000-0000-000000000005';
UPDATE public.jobs SET published_at = now() - interval '200 days'
 WHERE id = '5e1f0000-2222-0000-0000-0000000000e2';
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '5e1f0000-0000-0000-0000-000000000005';
UPDATE public.jobs SET status = 'published' WHERE id = '5e1f0000-2222-0000-0000-0000000000e2';
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT published_at FROM public.jobs
    WHERE id = '5e1f0000-2222-0000-0000-0000000000e2') > now() - interval '1 minute',
  'X5 republication stamps a fresh published_at rather than carrying the old one');

-- An ordinary edit to an ALREADY-published advertisement must not move its
-- publication date -- the stamp is for transitions INTO published only.
DO $$
DECLARE _before timestamptz; _after timestamptz;
BEGIN
  SELECT published_at INTO _before FROM public.jobs
   WHERE id = '5e1f0000-2222-0000-0000-0000000000e2';
  PERFORM pg_sleep(0.05);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub','5e1f0000-0000-0000-0000-000000000005', true);
  UPDATE public.jobs SET title_sv = 'Väktare Östersund (uppdaterad)'
   WHERE id = '5e1f0000-2222-0000-0000-0000000000e2';
  EXECUTE 'RESET ROLE';
  SELECT published_at INTO _after FROM public.jobs
   WHERE id = '5e1f0000-2222-0000-0000-0000000000e2';
  IF _before IS DISTINCT FROM _after THEN
    RAISE EXCEPTION 'ASSERTION FAILED: X6 editing a published advert moved its published_at (% -> %)', _before, _after;
  END IF;
  RAISE NOTICE '    ok  X6 editing an already-published advert does not move published_at';
END $$;

-- The admin moderation path -- an explicit published_at from a platform
-- admin -- must still be honoured rather than overwritten by the stamp.
DO $$
DECLARE _chosen timestamptz := now() - interval '3 days'; _got timestamptz;
BEGIN
  INSERT INTO public.jobs (id, employer_id, slug, short_id, title_sv, description_sv,
                           status, application_method, expires_at)
  VALUES ('5e1f0000-2222-0000-0000-0000000000e3','5e1f0000-1111-0000-0000-000000000005',
          'pub-adminagd-modpath','pubeee0003','Väktare Piteå','En riktig beskrivning av rollen.',
          'draft','internal', now() + interval '30 days');

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub','5e1f0000-0000-0000-0000-000000000005', true);
  UPDATE public.jobs SET status = 'published', published_at = _chosen
   WHERE id = '5e1f0000-2222-0000-0000-0000000000e3';
  EXECUTE 'RESET ROLE';

  SELECT published_at INTO _got FROM public.jobs
   WHERE id = '5e1f0000-2222-0000-0000-0000000000e3';
  IF _got IS DISTINCT FROM _chosen THEN
    RAISE EXCEPTION 'ASSERTION FAILED: X7 an admin-supplied published_at was overwritten (wanted %, got %)', _chosen, _got;
  END IF;
  RAISE NOTICE '    ok  X7 an admin-supplied published_at is honoured, not overwritten';
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
                         '5e1f0000-1111-0000-0000-000000000004',
                         '5e1f0000-1111-0000-0000-000000000005');
  IF _n <> 17 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: R8 expected 17 job rows, found %', _n;
  END IF;
  RAISE NOTICE '    ok  R8 no job row was destroyed anywhere in this suite';
END $$;

DO $$ BEGIN RAISE NOTICE '    ok  47 self-publish + requirements assertions passed'; END $$;

ROLLBACK;
