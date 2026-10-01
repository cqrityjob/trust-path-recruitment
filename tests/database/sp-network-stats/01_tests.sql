-- Behavioural tests for public.sp_network_stats() and its controls.
\set ON_ERROR_STOP on
CREATE TEMP TABLE results (n int, label text, ok boolean);
GRANT ALL ON results TO PUBLIC;
CREATE FUNCTION pg_temp.t(_label text, _ok boolean) RETURNS void LANGUAGE plpgsql AS
$$ BEGIN INSERT INTO results SELECT coalesce((SELECT max(n) FROM results),0)+1, _label, coalesce(_ok,false); END $$;

-- helpers (owner-side): a user, optionally with a profile
CREATE FUNCTION pg_temp.mk(_state text DEFAULT 'completed', _cc text DEFAULT NULL,
                           _confirmed boolean DEFAULT true) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE u uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users(id, email) VALUES (u, u || '@example.invalid');
  INSERT INTO public.sp_passport_profiles(holder_user_id, onboarding_state, declared_accurate_at,
      jurisdiction_code, work_location_confirmed_at)
  VALUES (u, _state, CASE WHEN _state='completed' THEN now() END, _cc,
          CASE WHEN _confirmed AND _cc IS NOT NULL THEN now() END);
  RETURN u;
END $$;
CREATE FUNCTION pg_temp.stats() RETURNS jsonb LANGUAGE sql AS $$ SELECT public.sp_network_stats() $$;

-- ── 1. Seeded hidden: no number at all, even once data exists ────────────
SELECT pg_temp.mk();
SET ROLE anon;
SELECT pg_temp.t('1 seeded policy publishes nothing, not even zero', public.sp_network_stats() = '{"display":"hidden"}'::jsonb);
RESET ROLE;

UPDATE public.sp_network_stats_policy SET display='public';
DELETE FROM auth.users;   -- clean slate

-- ── 2. Definition: only completed + declared Passports count ─────────────
SELECT pg_temp.mk('not_started');          -- opened /passport, row auto-created
SELECT pg_temp.mk('in_progress');          -- mid-onboarding
SELECT pg_temp.mk('completed');            -- the one real Passport
SELECT pg_temp.t('2 page-view and in-progress rows are not Passports',
  (pg_temp.stats()->>'passports')::int = 1);

-- ── 3. Repeated reads, shares and edits cannot move it ──────────────────
SELECT pg_temp.t('3 repeated reads do not increase the counter',
  pg_temp.stats() = pg_temp.stats() AND pg_temp.stats() = pg_temp.stats());
-- ensureMyPassport() twice for the same holder: ON CONFLICT DO NOTHING
INSERT INTO public.sp_passport_profiles(holder_user_id)
  SELECT holder_user_id FROM public.sp_passport_profiles WHERE onboarding_state='completed'
  ON CONFLICT DO NOTHING;
UPDATE public.sp_passport_profiles SET display_name='Edited' WHERE onboarding_state='completed';
SELECT pg_temp.t('3b re-creating / editing the same holder does not add a Passport',
  (pg_temp.stats()->>'passports')::int = 1);

-- ── 4. Credentials: active only; corrections and drafts do not add ───────
DO $$ DECLARE h uuid := (SELECT holder_user_id FROM public.sp_passport_profiles WHERE onboarding_state='completed');
              c uuid; BEGIN
  INSERT INTO public.sp_claims(holder_user_id,title) VALUES (h,'A') RETURNING id INTO c;
  INSERT INTO public.sp_claims(holder_user_id,title,lifecycle_state) VALUES
    (h,'draft','draft'),(h,'revoked','revoked'),(h,'withdrawn','withdrawn'),(h,'expired','expired');
  -- a correction: old row superseded, one new active row
  UPDATE public.sp_claims SET lifecycle_state='superseded' WHERE id=c;
  INSERT INTO public.sp_claims(holder_user_id,title) VALUES (h,'A (corrected)');
END $$;
SELECT pg_temp.t('4 credentials = active claims only; a correction does not add one',
  (pg_temp.stats()->>'credentials')::int = 1 AND (pg_temp.stats()->>'passports')::int = 1);
-- claims of an uncounted holder never count
INSERT INTO public.sp_claims(holder_user_id,title)
  SELECT holder_user_id,'x' FROM public.sp_passport_profiles WHERE onboarding_state='in_progress';
SELECT pg_temp.t('4b a holder who has not finished contributes no credentials',
  (pg_temp.stats()->>'credentials')::int = 1);

-- ── 5. Demo / test / staff exclusion ────────────────────────────────────
DO $$ DECLARE s uuid := pg_temp.mk(); x uuid := pg_temp.mk(); BEGIN
  INSERT INTO public.user_roles(user_id, role) VALUES (s, 'support');
  INSERT INTO public.sp_claims(holder_user_id,title) VALUES (s,'staff claim'),(x,'excluded claim');
  PERFORM set_config('t.excl', x::text, false);
END $$;
SELECT pg_temp.t('5 a staff account (any user_roles row) is not counted, nor its credentials',
  (pg_temp.stats()->>'passports')::int = 2 AND (pg_temp.stats()->>'credentials')::int = 2);
INSERT INTO public.sp_statistics_exclusions(holder_user_id, reason)
  VALUES (current_setting('t.excl')::uuid, 'UAT account');
SELECT pg_temp.t('5b a listed test account is not counted, nor its credentials',
  (pg_temp.stats()->>'passports')::int = 1 AND (pg_temp.stats()->>'credentials')::int = 1);

-- ── 6. Markets: threshold, no counts, no reconstruction ─────────────────
DELETE FROM auth.users;
SELECT pg_temp.mk('completed','SE') FROM generate_series(1,5);
SELECT pg_temp.mk('completed','GB') FROM generate_series(1,6);
SELECT pg_temp.mk('completed','AE') FROM generate_series(1,4);     -- below threshold
SELECT pg_temp.mk('completed','US');                               -- a single holder
SELECT pg_temp.mk('completed','FR', false) FROM generate_series(1,9); -- country NOT confirmed
SELECT pg_temp.mk('in_progress','DE') FROM generate_series(1,9);   -- not a Passport
SELECT pg_temp.t('6 only markets with >= 5 confirmed holders are named',
  pg_temp.stats()->'markets' = '["GB","SE"]'::jsonb);
SELECT pg_temp.t('6b smaller markets are only "other", as a boolean',
  pg_temp.stats()->'otherMarkets' = 'true'::jsonb);
SELECT pg_temp.t('6c unconfirmed or unfinished holders never form or join a market',
  NOT (pg_temp.stats()::text ~ 'FR|DE'));
SELECT pg_temp.t('6d the response has exactly the approved keys, no per-market count',
  (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(pg_temp.stats()) k)
    = ARRAY['credentials','display','markets','otherMarkets','passports']);
SELECT pg_temp.t('6e the total counts every real Passport (5+6+4+1+9)',
  (pg_temp.stats()->>'passports')::int = 25);
SELECT pg_temp.mk('completed','AE');                               -- AE reaches 5
SELECT pg_temp.t('6f a market appears once it reaches the threshold',
  pg_temp.stats()->'markets' = '["AE","GB","SE"]'::jsonb);

-- ── 7. Owner controls ───────────────────────────────────────────────────
DO $$ BEGIN
  BEGIN UPDATE public.sp_network_stats_policy SET min_group_size = 4;
        PERFORM pg_temp.t('7 min_group_size cannot go below 5', false);
  EXCEPTION WHEN check_violation THEN PERFORM pg_temp.t('7 min_group_size cannot go below 5', true); END;
END $$;
UPDATE public.sp_network_stats_policy SET display='passport_page';
SELECT pg_temp.t('7b passport_page state still returns the figures',
  pg_temp.stats()->>'display' = 'passport_page' AND (pg_temp.stats()->>'passports')::int = 26);
DELETE FROM public.sp_network_stats_policy;
SELECT pg_temp.t('7c a missing policy row fails closed (hidden)',
  pg_temp.stats() = '{"display":"hidden"}'::jsonb);
INSERT INTO public.sp_network_stats_policy(singleton, display) VALUES (true,'public');

-- ── 8. Public caller: aggregates only, no enumeration, RLS unchanged ────
SET ROLE anon;
SELECT pg_temp.t('8 anon receives the aggregate', (public.sp_network_stats()->>'passports')::int = 26);
DO $$ DECLARE t text; ok boolean; BEGIN
  FOREACH t IN ARRAY ARRAY['sp_passport_profiles','sp_claims','sp_network_stats_policy',
                           'sp_statistics_exclusions'] LOOP
    ok := false;
    BEGIN EXECUTE format('SELECT 1 FROM public.%I LIMIT 1', t);
    EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
    PERFORM pg_temp.t('8b anon cannot SELECT '||t||' (no enumeration)', ok);
  END LOOP;
  ok := false;
  BEGIN PERFORM public.sp_set_network_stats_display('public');
  EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  PERFORM pg_temp.t('8c anon cannot change what is published', ok);
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', (SELECT holder_user_id::text FROM public.sp_passport_profiles LIMIT 1), false);
SET ROLE authenticated;
SELECT pg_temp.t('8d RLS unchanged: a signed-in holder still sees only their own Passport row',
  (SELECT count(*) FROM public.sp_passport_profiles) = 1);
DO $$ DECLARE ok boolean := false; BEGIN
  BEGIN PERFORM public.sp_set_network_stats_display('public');
  EXCEPTION WHEN OTHERS THEN ok := SQLERRM LIKE 'SP_STATS_REQUIRES_ADMIN%'; END;
  PERFORM pg_temp.t('8e a non-admin holder cannot change what is published', ok);
  BEGIN PERFORM 1 FROM public.sp_statistics_exclusions;
        PERFORM pg_temp.t('8f authenticated cannot read the exclusion list', false);
  EXCEPTION WHEN insufficient_privilege THEN PERFORM pg_temp.t('8f authenticated cannot read the exclusion list', true); END;
END $$;
RESET ROLE;

-- ── 9. Delete / recreate cannot inflate ─────────────────────────────────
DELETE FROM auth.users WHERE id = (SELECT holder_user_id FROM public.sp_passport_profiles
                                   WHERE jurisdiction_code='SE' LIMIT 1);
SELECT pg_temp.t('9 deleting a holder removes their Passport from the count (never double)',
  (pg_temp.stats()->>'passports')::int = 25);

-- ── 10. Admin switch works for an admin ─────────────────────────────────
INSERT INTO auth.users(id,email) VALUES ('00000000-0000-0000-0000-0000000000aa','a@example.invalid');
INSERT INTO public.user_roles(user_id,role) VALUES ('00000000-0000-0000-0000-0000000000aa','admin');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000aa',false);
SELECT public.sp_set_network_stats_display('hidden','test');
RESET ROLE;
SELECT pg_temp.t('10 an admin can set the publication state', pg_temp.stats() = '{"display":"hidden"}'::jsonb);

SELECT format('%s %s', CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END, label) FROM results ORDER BY n;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM results WHERE NOT ok) THEN RAISE EXCEPTION 'sp_network_stats tests FAILED'; END IF; END $$;
SELECT count(*) || ' checks passed' FROM results;
