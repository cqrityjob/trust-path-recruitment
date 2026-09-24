-- Recruitment workspace fixture: the synthetic world e2e/recruitment-workspace.spec.ts
-- walks, reproducible on an EMPTY local stack and a no-op on one that already
-- holds it (every insert is ON CONFLICT DO NOTHING on its own key).
--
-- Generated from the isolated rec-uat stack's rows on 2026-09-24 so the
-- browser evidence in artifacts/recruitment-case-varbi and the CI walk read
-- the same people, the same vacancy and the same 32 applications. Then one
-- more vacancy, "Väktare, Norrköping", with 5 050 applications -- more than
-- the old in-memory read could see -- for the paging, search and
-- previous/next proofs.
--
--   anna.agare@nordvakt.test       owner, Nordvakt Säkerhet AB
--   mats.medlem / rita.rekryterare members of Nordvakt
--   olle.agare@vaktbolaget.test    owner of Vaktbolaget Syd AB (isolation)
--   kim.kandidat@test.local        a candidate
--   kandidat01..32@test.local      the Uppsala applicants
--   sokande-0001..5050@test.local  the Norrköping applicants
--
-- Sign-in in the walk goes through the LOCAL Auth admin API (a magic-link
-- OTP); the password below exists so a person can sign in by hand too. Every
-- token column is '' rather than NULL, which GoTrue requires.
--
-- Runs only against a local database; refuses anything that looks hosted.

\set ON_ERROR_STOP on
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin')
     AND current_database() NOT IN ('postgres', 'scp_ci_test') THEN
    RAISE EXCEPTION 'REC_FIXTURE_WRONG_DATABASE: this fixture writes applications and runs only against a local database (got "%").', current_database();
  END IF;
END $$;

BEGIN;

-- ── People ──────────────────────────────────────────────────────────────
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token)
VALUES
  ('00000000-0000-0000-0000-000000000000', 'd016a3c5-f43b-4452-aabc-1ff7f7d3672c', 'authenticated', 'authenticated', 'anna.agare@nordvakt.test', crypt('LocalJourney!2026', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('display_name', 'Anna Ågren'), now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a5000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'kandidat01@test.local', crypt('LocalJourney!2026', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('display_name', 'Alva Berg'), now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a5000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'kandidat02@test.local', crypt('LocalJourney!2026', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('display_name', 'Bo Ek'), now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a5000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'kandidat03@test.local', crypt('LocalJourney!2026', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('display_name', 'Cecilia Dahl'), now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a5000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'kandidat04@test.local', crypt('LocalJourney!2026', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('display_name', 'David Falk'), now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a5000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'kandidat05@test.local', crypt('LocalJourney!2026', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('display_name', 'Elin Holm'), now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a5000000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'kandidat06@test.local', crypt('LocalJourney!2026', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('display_name', 'Filip Isak'), now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a5000000-0000-4000-8000-000000000007', 'authenticated', 'authenticated', 'kandidat07@test.local', crypt('LocalJourney!2026', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('display_name', 'Greta Jonsson'), now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a5000000-0000-4000-8000-000000000008', 'authenticated', 'authenticated', 'kandidat08@test.local', crypt('LocalJourney!2026', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('display_name', 'Hugo Karlsson'), now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a5000000-0000-4000-8000-000000000009', 'authenticated', 'authenticated', 'kandidat09@test.local', crypt('LocalJourney!2026', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('display_name', 'Ida Lund'), now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a5000000-0000-4000-8000-000000000010', 'authenticated', 'authenticated', 'kandidat10@test.local', crypt('LocalJourney!2026', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('display_name', 'Jonas Malm'), now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a5000000-0000-4000-8000-000000000011', 'authenticated', 'authenticated', 'kandidat11@test.local', crypt('LocalJourney!2026', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('display_name', 'Klara Nyberg'), now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a5000000-0000-4000-8000-000000000012', 'authenticated', 'authenticated', 'kandidat12@test.local', crypt('LocalJourney!2026', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('display_name', 'Leo Oskarsson'), now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a5000000-0000-4000-8000-000000000013', 'authenticated', 'authenticated', 'kandidat13@test.local', crypt('LocalJourney!2026', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('display_name', 'Maja Persson'), now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a5000000-0000-4000-8000-000000000014', 'authenticated', 'authenticated', 'kandidat14@test.local', crypt('LocalJourney!2026', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('display_name', 'Nils Qvist'), now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a5000000-0000-4000-8000-000000000015', 'authenticated', 'authenticated', 'kandidat15@test.local', crypt('LocalJourney!2026', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('display_name', 'Olivia Rask'), now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a5000000-0000-4000-8000-000000000016', 'authenticated', 'authenticated', 'kandidat16@test.local', crypt('LocalJourney!2026', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('display_name', 'Petter Sund'), now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a5000000-0000-4000-8000-000000000017', 'authenticated', 'authenticated', 'kandidat17@test.local', crypt('LocalJourney!2026', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('display_name', 'Rebecka Toll'), now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a5000000-0000-4000-8000-000000000018', 'authenticated', 'authenticated', 'kandidat18@test.local', crypt('LocalJourney!2026', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('display_name', 'Samuel Uddén'), now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a5000000-0000-4000-8000-000000000019', 'authenticated', 'authenticated', 'kandidat19@test.local', crypt('LocalJourney!2026', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('display_name', 'Tove Vall'), now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a5000000-0000-4000-8000-000000000020', 'authenticated', 'authenticated', 'kandidat20@test.local', crypt('LocalJourney!2026', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('display_name', 'Ulf Wiklund'), now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a5000000-0000-4000-8000-000000000021', 'authenticated', 'authenticated', 'kandidat21@test.local', crypt('LocalJourney!2026', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('display_name', 'Vera Åberg'), now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a5000000-0000-4000-8000-000000000022', 'authenticated', 'authenticated', 'kandidat22@test.local', crypt('LocalJourney!2026', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('display_name', 'William Öst'), now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a5000000-0000-4000-8000-000000000023', 'authenticated', 'authenticated', 'kandidat23@test.local', crypt('LocalJourney!2026', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('display_name', 'Ylva Ahl'), now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a5000000-0000-4000-8000-000000000024', 'authenticated', 'authenticated', 'kandidat24@test.local', crypt('LocalJourney!2026', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('display_name', 'Zack Björk'), now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a5000000-0000-4000-8000-000000000025', 'authenticated', 'authenticated', 'kandidat25@test.local', crypt('LocalJourney!2026', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('display_name', 'Agnes Cato'), now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a5000000-0000-4000-8000-000000000026', 'authenticated', 'authenticated', 'kandidat26@test.local', crypt('LocalJourney!2026', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('display_name', 'Bertil Dag'), now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a5000000-0000-4000-8000-000000000027', 'authenticated', 'authenticated', 'kandidat27@test.local', crypt('LocalJourney!2026', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('display_name', 'Clara Ehn'), now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a5000000-0000-4000-8000-000000000028', 'authenticated', 'authenticated', 'kandidat28@test.local', crypt('LocalJourney!2026', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('display_name', 'Dan Frid'), now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a5000000-0000-4000-8000-000000000029', 'authenticated', 'authenticated', 'kandidat29@test.local', crypt('LocalJourney!2026', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('display_name', 'Ebba Gran'), now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a5000000-0000-4000-8000-000000000030', 'authenticated', 'authenticated', 'kandidat30@test.local', crypt('LocalJourney!2026', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('display_name', 'Frans Hård'), now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a5000000-0000-4000-8000-000000000031', 'authenticated', 'authenticated', 'kandidat31@test.local', crypt('LocalJourney!2026', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('display_name', 'Gun Ivarsson'), now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a5000000-0000-4000-8000-000000000032', 'authenticated', 'authenticated', 'kandidat32@test.local', crypt('LocalJourney!2026', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('display_name', 'Hans Jern'), now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'c6870581-2d53-4b7e-98b8-fd4ef795e29f', 'authenticated', 'authenticated', 'kim.kandidat@test.local', crypt('LocalJourney!2026', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('display_name', 'Kim Kandidat'), now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'de80b530-a9a3-4c22-bc4a-e7a3d6ffb5bd', 'authenticated', 'authenticated', 'mats.medlem@nordvakt.test', crypt('LocalJourney!2026', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('display_name', 'Mats Medlem'), now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '5f68b881-c6b0-452b-bcbe-7dee0633bbf9', 'authenticated', 'authenticated', 'olle.agare@vaktbolaget.test', crypt('LocalJourney!2026', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('display_name', 'Olle Öberg'), now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'dfe3bbec-acae-402f-8961-217575a105b0', 'authenticated', 'authenticated', 'rita.rekryterare@nordvakt.test', crypt('LocalJourney!2026', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('display_name', 'Rita Rekryterare'), now(), now(), '', '', '', '', '', '', '', '')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, display_name) VALUES
  ('d016a3c5-f43b-4452-aabc-1ff7f7d3672c', 'Anna Ågren'),
  ('a5000000-0000-4000-8000-000000000001', 'Alva Berg'),
  ('a5000000-0000-4000-8000-000000000002', 'Bo Ek'),
  ('a5000000-0000-4000-8000-000000000003', 'Cecilia Dahl'),
  ('a5000000-0000-4000-8000-000000000004', 'David Falk'),
  ('a5000000-0000-4000-8000-000000000005', 'Elin Holm'),
  ('a5000000-0000-4000-8000-000000000006', 'Filip Isak'),
  ('a5000000-0000-4000-8000-000000000007', 'Greta Jonsson'),
  ('a5000000-0000-4000-8000-000000000008', 'Hugo Karlsson'),
  ('a5000000-0000-4000-8000-000000000009', 'Ida Lund'),
  ('a5000000-0000-4000-8000-000000000010', 'Jonas Malm'),
  ('a5000000-0000-4000-8000-000000000011', 'Klara Nyberg'),
  ('a5000000-0000-4000-8000-000000000012', 'Leo Oskarsson'),
  ('a5000000-0000-4000-8000-000000000013', 'Maja Persson'),
  ('a5000000-0000-4000-8000-000000000014', 'Nils Qvist'),
  ('a5000000-0000-4000-8000-000000000015', 'Olivia Rask'),
  ('a5000000-0000-4000-8000-000000000016', 'Petter Sund'),
  ('a5000000-0000-4000-8000-000000000017', 'Rebecka Toll'),
  ('a5000000-0000-4000-8000-000000000018', 'Samuel Uddén'),
  ('a5000000-0000-4000-8000-000000000019', 'Tove Vall'),
  ('a5000000-0000-4000-8000-000000000020', 'Ulf Wiklund'),
  ('a5000000-0000-4000-8000-000000000021', 'Vera Åberg'),
  ('a5000000-0000-4000-8000-000000000022', 'William Öst'),
  ('a5000000-0000-4000-8000-000000000023', 'Ylva Ahl'),
  ('a5000000-0000-4000-8000-000000000024', 'Zack Björk'),
  ('a5000000-0000-4000-8000-000000000025', 'Agnes Cato'),
  ('a5000000-0000-4000-8000-000000000026', 'Bertil Dag'),
  ('a5000000-0000-4000-8000-000000000027', 'Clara Ehn'),
  ('a5000000-0000-4000-8000-000000000028', 'Dan Frid'),
  ('a5000000-0000-4000-8000-000000000029', 'Ebba Gran'),
  ('a5000000-0000-4000-8000-000000000030', 'Frans Hård'),
  ('a5000000-0000-4000-8000-000000000031', 'Gun Ivarsson'),
  ('a5000000-0000-4000-8000-000000000032', 'Hans Jern'),
  ('c6870581-2d53-4b7e-98b8-fd4ef795e29f', 'Kim Kandidat'),
  ('de80b530-a9a3-4c22-bc4a-e7a3d6ffb5bd', 'Mats Medlem'),
  ('5f68b881-c6b0-452b-bcbe-7dee0633bbf9', 'Olle Öberg'),
  ('dfe3bbec-acae-402f-8961-217575a105b0', 'Rita Rekryterare')
ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name;


-- ── Organisations ───────────────────────────────────────────────────────
INSERT INTO public.employers (id, name, slug, status) VALUES
  ('11111111-aaaa-4000-8000-000000000001', 'Nordvakt Säkerhet AB', 'nordvakt-sakerhet', 'active'),
  ('11111111-aaaa-4000-8000-000000000002', 'Vaktbolaget Syd AB', 'vaktbolaget-syd', 'active')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.employer_memberships (employer_id, user_id, role, status) VALUES
  ('11111111-aaaa-4000-8000-000000000001', 'd016a3c5-f43b-4452-aabc-1ff7f7d3672c', 'owner', 'active'),
  ('11111111-aaaa-4000-8000-000000000001', 'de80b530-a9a3-4c22-bc4a-e7a3d6ffb5bd', 'member', 'active'),
  ('11111111-aaaa-4000-8000-000000000001', 'dfe3bbec-acae-402f-8961-217575a105b0', 'member', 'active'),
  ('11111111-aaaa-4000-8000-000000000002', '5f68b881-c6b0-452b-bcbe-7dee0633bbf9', 'owner', 'active')
ON CONFLICT DO NOTHING;

-- ── Väktare, Uppsala: the case the evidence walks ───────────────────────
INSERT INTO public.jobs (id, slug, short_id, employer_id, title_sv, title_en, description_sv, requirements_sv,
                         country, city, workplace_type, application_method, status, deadline_at, expires_at)
VALUES ('44444444-dddd-4000-8000-000000000004', 'nordvakt-vaktare-uppsala-uat4', 'uatjob0004', '11111111-aaaa-4000-8000-000000000001',
        'Väktare, Uppsala', 'Security officer, Uppsala',
        'Nordvakt Säkerhet AB söker väktare till uppdrag i Uppsala. Rondering, larmutryckning och stationär bevakning.',
        'Väktarutbildning. Körkort B. God svenska i tal och skrift.',
        'SE', 'Uppsala', 'onsite', 'internal', 'draft', now() + interval '25 days', now() + interval '40 days')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.recruitment_requirements (id, job_id, employer_id, kind, label_sv, label_en, position) VALUES
  ('2615ed53-9f8a-4e6e-a636-c107180d5487', '44444444-dddd-4000-8000-000000000004', '11111111-aaaa-4000-8000-000000000001', 'mandatory', 'Godkänd väktarutbildning', 'Completed security officer training', 0),
  ('2a76fb03-bdb4-430f-b1d8-fe6f1596f8ff', '44444444-dddd-4000-8000-000000000004', '11111111-aaaa-4000-8000-000000000001', 'mandatory', 'Körkort B', 'Driving licence B', 1),
  ('d69d0196-2f59-4bb6-a29d-4c3d1e33441a', '44444444-dddd-4000-8000-000000000004', '11111111-aaaa-4000-8000-000000000001', 'desirable', 'Erfarenhet av rondering', 'Experience of patrol work', 2)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.recruitment_questions (id, job_id, employer_id, requirement_id, prompt_sv, prompt_en, answer_kind, is_required, position) VALUES
  ('c13d6cd4-331c-4345-a6ff-5c079dbebe3b', '44444444-dddd-4000-8000-000000000004', '11111111-aaaa-4000-8000-000000000001', '2615ed53-9f8a-4e6e-a636-c107180d5487', 'Har du genomgått godkänd väktarutbildning?', 'Have you completed security officer training?', 'yes_no', true, 0),
  ('df0aea43-156c-4965-9b6d-2b1250f51af9', '44444444-dddd-4000-8000-000000000004', '11111111-aaaa-4000-8000-000000000001', '2a76fb03-bdb4-430f-b1d8-fe6f1596f8ff', 'Har du körkort B?', 'Do you hold a B driving licence?', 'yes_no', true, 1)
ON CONFLICT (id) DO NOTHING;

-- Published as the E1 fixture publishes: status first, moderation fields
-- untouched. A stack that already holds it published is left alone.
UPDATE public.jobs SET status = 'published', expires_at = now() + interval '40 days', deadline_at = now() + interval '25 days'
 WHERE id = '44444444-dddd-4000-8000-000000000004' AND status <> 'published';

INSERT INTO public.job_applications (id, job_id, employer_id, applicant_user_id, status, cv_storage_path, cv_source, cover_note, consent_given_at, created_at) VALUES
  ('a6000000-0000-4000-8000-000000000032', '44444444-dddd-4000-8000-000000000004', '11111111-aaaa-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000032', 'rejected', 'x/cv32.pdf', 'upload', NULL, now(), '2026-09-23T05:42:24.053197+00:00'),
  ('a6000000-0000-4000-8000-000000000031', '44444444-dddd-4000-8000-000000000004', '11111111-aaaa-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000031', 'rejected', 'x/cv31.pdf', 'upload', NULL, now(), '2026-09-23T06:42:24.053197+00:00'),
  ('a6000000-0000-4000-8000-000000000030', '44444444-dddd-4000-8000-000000000004', '11111111-aaaa-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000030', 'interview', NULL, 'upload', NULL, now(), '2026-09-23T07:42:24.053197+00:00'),
  ('a6000000-0000-4000-8000-000000000029', '44444444-dddd-4000-8000-000000000004', '11111111-aaaa-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000029', 'interview', 'x/cv29.pdf', 'upload', NULL, now(), '2026-09-23T08:42:24.053197+00:00'),
  ('a6000000-0000-4000-8000-000000000028', '44444444-dddd-4000-8000-000000000004', '11111111-aaaa-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000028', 'interview', 'x/cv28.pdf', 'upload', NULL, now(), '2026-09-23T09:42:24.053197+00:00'),
  ('a6000000-0000-4000-8000-000000000027', '44444444-dddd-4000-8000-000000000004', '11111111-aaaa-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000027', 'reviewing', NULL, 'upload', NULL, now(), '2026-09-23T10:42:24.053197+00:00'),
  ('a6000000-0000-4000-8000-000000000026', '44444444-dddd-4000-8000-000000000004', '11111111-aaaa-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000026', 'reviewing', 'x/cv26.pdf', 'upload', NULL, now(), '2026-09-23T11:42:24.053197+00:00'),
  ('a6000000-0000-4000-8000-000000000025', '44444444-dddd-4000-8000-000000000004', '11111111-aaaa-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000025', 'reviewing', 'x/cv25.pdf', 'upload', NULL, now(), '2026-09-23T12:42:24.053197+00:00'),
  ('a6000000-0000-4000-8000-000000000024', '44444444-dddd-4000-8000-000000000004', '11111111-aaaa-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000024', 'reviewing', NULL, 'upload', NULL, now(), '2026-09-23T13:42:24.053197+00:00'),
  ('a6000000-0000-4000-8000-000000000023', '44444444-dddd-4000-8000-000000000004', '11111111-aaaa-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000023', 'reviewing', 'x/cv23.pdf', 'upload', NULL, now(), '2026-09-23T14:42:24.053197+00:00'),
  ('a6000000-0000-4000-8000-000000000022', '44444444-dddd-4000-8000-000000000004', '11111111-aaaa-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000022', 'reviewing', 'x/cv22.pdf', 'upload', NULL, now(), '2026-09-23T15:42:24.053197+00:00'),
  ('a6000000-0000-4000-8000-000000000021', '44444444-dddd-4000-8000-000000000004', '11111111-aaaa-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000021', 'reviewing', NULL, 'upload', NULL, now(), '2026-09-23T16:42:24.053197+00:00'),
  ('a6000000-0000-4000-8000-000000000020', '44444444-dddd-4000-8000-000000000004', '11111111-aaaa-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000020', 'submitted', 'x/cv20.pdf', 'upload', NULL, now(), '2026-09-23T17:42:24.053197+00:00'),
  ('a6000000-0000-4000-8000-000000000019', '44444444-dddd-4000-8000-000000000004', '11111111-aaaa-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000019', 'submitted', 'x/cv19.pdf', 'upload', NULL, now(), '2026-09-23T18:42:24.053197+00:00'),
  ('a6000000-0000-4000-8000-000000000018', '44444444-dddd-4000-8000-000000000004', '11111111-aaaa-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000018', 'submitted', NULL, 'upload', NULL, now(), '2026-09-23T19:42:24.053197+00:00'),
  ('a6000000-0000-4000-8000-000000000017', '44444444-dddd-4000-8000-000000000004', '11111111-aaaa-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000017', 'submitted', 'x/cv17.pdf', 'upload', NULL, now(), '2026-09-23T20:42:24.053197+00:00'),
  ('a6000000-0000-4000-8000-000000000016', '44444444-dddd-4000-8000-000000000004', '11111111-aaaa-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000016', 'submitted', 'x/cv16.pdf', 'upload', NULL, now(), '2026-09-23T21:42:24.053197+00:00'),
  ('a6000000-0000-4000-8000-000000000015', '44444444-dddd-4000-8000-000000000004', '11111111-aaaa-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000015', 'submitted', NULL, 'upload', NULL, now(), '2026-09-23T22:42:24.053197+00:00'),
  ('a6000000-0000-4000-8000-000000000014', '44444444-dddd-4000-8000-000000000004', '11111111-aaaa-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000014', 'submitted', 'x/cv14.pdf', 'upload', NULL, now(), '2026-09-23T23:42:24.053197+00:00'),
  ('a6000000-0000-4000-8000-000000000013', '44444444-dddd-4000-8000-000000000004', '11111111-aaaa-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000013', 'submitted', 'x/cv13.pdf', 'upload', NULL, now(), '2026-09-24T00:42:24.053197+00:00'),
  ('a6000000-0000-4000-8000-000000000012', '44444444-dddd-4000-8000-000000000004', '11111111-aaaa-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000012', 'submitted', NULL, 'upload', NULL, now(), '2026-09-24T01:42:24.053197+00:00'),
  ('a6000000-0000-4000-8000-000000000011', '44444444-dddd-4000-8000-000000000004', '11111111-aaaa-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000011', 'submitted', 'x/cv11.pdf', 'upload', NULL, now(), '2026-09-24T02:42:24.053197+00:00'),
  ('a6000000-0000-4000-8000-000000000010', '44444444-dddd-4000-8000-000000000004', '11111111-aaaa-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000010', 'submitted', 'x/cv10.pdf', 'upload', NULL, now(), '2026-09-24T03:42:24.053197+00:00'),
  ('a6000000-0000-4000-8000-000000000009', '44444444-dddd-4000-8000-000000000004', '11111111-aaaa-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000009', 'submitted', NULL, 'upload', NULL, now(), '2026-09-24T04:42:24.053197+00:00'),
  ('a6000000-0000-4000-8000-000000000008', '44444444-dddd-4000-8000-000000000004', '11111111-aaaa-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000008', 'submitted', 'x/cv8.pdf', 'upload', NULL, now(), '2026-09-24T05:42:24.053197+00:00'),
  ('a6000000-0000-4000-8000-000000000007', '44444444-dddd-4000-8000-000000000004', '11111111-aaaa-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000007', 'reviewing', 'x/cv7.pdf', 'upload', NULL, now(), '2026-09-24T06:42:24.053197+00:00'),
  ('a6000000-0000-4000-8000-000000000006', '44444444-dddd-4000-8000-000000000004', '11111111-aaaa-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000006', 'reviewing', NULL, 'upload', NULL, now(), '2026-09-24T07:42:24.053197+00:00'),
  ('a6000000-0000-4000-8000-000000000005', '44444444-dddd-4000-8000-000000000004', '11111111-aaaa-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000005', 'reviewing', 'x/cv5.pdf', 'upload', NULL, now(), '2026-09-24T08:42:24.053197+00:00'),
  ('a6000000-0000-4000-8000-000000000004', '44444444-dddd-4000-8000-000000000004', '11111111-aaaa-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000004', 'reviewing', 'x/cv4.pdf', 'upload', NULL, now(), '2026-09-24T09:42:24.053197+00:00'),
  ('a6000000-0000-4000-8000-000000000003', '44444444-dddd-4000-8000-000000000004', '11111111-aaaa-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000003', 'reviewing', NULL, 'upload', NULL, now(), '2026-09-24T10:42:24.053197+00:00'),
  ('a6000000-0000-4000-8000-000000000002', '44444444-dddd-4000-8000-000000000004', '11111111-aaaa-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000002', 'reviewing', 'x/cv2.pdf', 'upload', NULL, now(), '2026-09-24T11:42:24.053197+00:00'),
  ('a6000000-0000-4000-8000-000000000001', '44444444-dddd-4000-8000-000000000004', '11111111-aaaa-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000001', 'reviewing', 'x/cv1.pdf', 'upload', NULL, now(), '2026-09-24T12:42:24.053197+00:00')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.job_application_answers (application_id, question_id, employer_id, answer_kind, answer_bool, answer_text) VALUES
  ('a6000000-0000-4000-8000-000000000001', 'c13d6cd4-331c-4345-a6ff-5c079dbebe3b', '11111111-aaaa-4000-8000-000000000001', 'yes_no', true, NULL),
  ('a6000000-0000-4000-8000-000000000001', 'df0aea43-156c-4965-9b6d-2b1250f51af9', '11111111-aaaa-4000-8000-000000000001', 'yes_no', true, NULL),
  ('a6000000-0000-4000-8000-000000000002', 'c13d6cd4-331c-4345-a6ff-5c079dbebe3b', '11111111-aaaa-4000-8000-000000000001', 'yes_no', true, NULL),
  ('a6000000-0000-4000-8000-000000000002', 'df0aea43-156c-4965-9b6d-2b1250f51af9', '11111111-aaaa-4000-8000-000000000001', 'yes_no', true, NULL),
  ('a6000000-0000-4000-8000-000000000003', 'c13d6cd4-331c-4345-a6ff-5c079dbebe3b', '11111111-aaaa-4000-8000-000000000001', 'yes_no', true, NULL),
  ('a6000000-0000-4000-8000-000000000003', 'df0aea43-156c-4965-9b6d-2b1250f51af9', '11111111-aaaa-4000-8000-000000000001', 'yes_no', true, NULL),
  ('a6000000-0000-4000-8000-000000000004', 'c13d6cd4-331c-4345-a6ff-5c079dbebe3b', '11111111-aaaa-4000-8000-000000000001', 'yes_no', false, NULL),
  ('a6000000-0000-4000-8000-000000000004', 'df0aea43-156c-4965-9b6d-2b1250f51af9', '11111111-aaaa-4000-8000-000000000001', 'yes_no', true, NULL),
  ('a6000000-0000-4000-8000-000000000005', 'c13d6cd4-331c-4345-a6ff-5c079dbebe3b', '11111111-aaaa-4000-8000-000000000001', 'yes_no', true, NULL),
  ('a6000000-0000-4000-8000-000000000005', 'df0aea43-156c-4965-9b6d-2b1250f51af9', '11111111-aaaa-4000-8000-000000000001', 'yes_no', false, NULL),
  ('a6000000-0000-4000-8000-000000000006', 'c13d6cd4-331c-4345-a6ff-5c079dbebe3b', '11111111-aaaa-4000-8000-000000000001', 'yes_no', true, NULL),
  ('a6000000-0000-4000-8000-000000000006', 'df0aea43-156c-4965-9b6d-2b1250f51af9', '11111111-aaaa-4000-8000-000000000001', 'yes_no', true, NULL),
  ('a6000000-0000-4000-8000-000000000007', 'c13d6cd4-331c-4345-a6ff-5c079dbebe3b', '11111111-aaaa-4000-8000-000000000001', 'yes_no', true, NULL),
  ('a6000000-0000-4000-8000-000000000007', 'df0aea43-156c-4965-9b6d-2b1250f51af9', '11111111-aaaa-4000-8000-000000000001', 'yes_no', true, NULL),
  ('a6000000-0000-4000-8000-000000000008', 'c13d6cd4-331c-4345-a6ff-5c079dbebe3b', '11111111-aaaa-4000-8000-000000000001', 'yes_no', false, NULL),
  ('a6000000-0000-4000-8000-000000000008', 'df0aea43-156c-4965-9b6d-2b1250f51af9', '11111111-aaaa-4000-8000-000000000001', 'yes_no', true, NULL),
  ('a6000000-0000-4000-8000-000000000009', 'c13d6cd4-331c-4345-a6ff-5c079dbebe3b', '11111111-aaaa-4000-8000-000000000001', 'yes_no', true, NULL),
  ('a6000000-0000-4000-8000-000000000009', 'df0aea43-156c-4965-9b6d-2b1250f51af9', '11111111-aaaa-4000-8000-000000000001', 'yes_no', true, NULL),
  ('a6000000-0000-4000-8000-000000000010', 'c13d6cd4-331c-4345-a6ff-5c079dbebe3b', '11111111-aaaa-4000-8000-000000000001', 'yes_no', true, NULL),
  ('a6000000-0000-4000-8000-000000000010', 'df0aea43-156c-4965-9b6d-2b1250f51af9', '11111111-aaaa-4000-8000-000000000001', 'yes_no', false, NULL),
  ('a6000000-0000-4000-8000-000000000011', 'c13d6cd4-331c-4345-a6ff-5c079dbebe3b', '11111111-aaaa-4000-8000-000000000001', 'yes_no', true, NULL),
  ('a6000000-0000-4000-8000-000000000011', 'df0aea43-156c-4965-9b6d-2b1250f51af9', '11111111-aaaa-4000-8000-000000000001', 'yes_no', true, NULL),
  ('a6000000-0000-4000-8000-000000000012', 'c13d6cd4-331c-4345-a6ff-5c079dbebe3b', '11111111-aaaa-4000-8000-000000000001', 'yes_no', false, NULL),
  ('a6000000-0000-4000-8000-000000000012', 'df0aea43-156c-4965-9b6d-2b1250f51af9', '11111111-aaaa-4000-8000-000000000001', 'yes_no', true, NULL),
  ('a6000000-0000-4000-8000-000000000013', 'c13d6cd4-331c-4345-a6ff-5c079dbebe3b', '11111111-aaaa-4000-8000-000000000001', 'yes_no', true, NULL),
  ('a6000000-0000-4000-8000-000000000013', 'df0aea43-156c-4965-9b6d-2b1250f51af9', '11111111-aaaa-4000-8000-000000000001', 'yes_no', true, NULL),
  ('a6000000-0000-4000-8000-000000000014', 'c13d6cd4-331c-4345-a6ff-5c079dbebe3b', '11111111-aaaa-4000-8000-000000000001', 'yes_no', true, NULL),
  ('a6000000-0000-4000-8000-000000000014', 'df0aea43-156c-4965-9b6d-2b1250f51af9', '11111111-aaaa-4000-8000-000000000001', 'yes_no', true, NULL),
  ('a6000000-0000-4000-8000-000000000015', 'c13d6cd4-331c-4345-a6ff-5c079dbebe3b', '11111111-aaaa-4000-8000-000000000001', 'yes_no', true, NULL),
  ('a6000000-0000-4000-8000-000000000015', 'df0aea43-156c-4965-9b6d-2b1250f51af9', '11111111-aaaa-4000-8000-000000000001', 'yes_no', false, NULL),
  ('a6000000-0000-4000-8000-000000000016', 'c13d6cd4-331c-4345-a6ff-5c079dbebe3b', '11111111-aaaa-4000-8000-000000000001', 'yes_no', false, NULL),
  ('a6000000-0000-4000-8000-000000000016', 'df0aea43-156c-4965-9b6d-2b1250f51af9', '11111111-aaaa-4000-8000-000000000001', 'yes_no', true, NULL),
  ('a6000000-0000-4000-8000-000000000017', 'c13d6cd4-331c-4345-a6ff-5c079dbebe3b', '11111111-aaaa-4000-8000-000000000001', 'yes_no', true, NULL),
  ('a6000000-0000-4000-8000-000000000017', 'df0aea43-156c-4965-9b6d-2b1250f51af9', '11111111-aaaa-4000-8000-000000000001', 'yes_no', true, NULL),
  ('a6000000-0000-4000-8000-000000000018', 'c13d6cd4-331c-4345-a6ff-5c079dbebe3b', '11111111-aaaa-4000-8000-000000000001', 'yes_no', true, NULL),
  ('a6000000-0000-4000-8000-000000000018', 'df0aea43-156c-4965-9b6d-2b1250f51af9', '11111111-aaaa-4000-8000-000000000001', 'yes_no', true, NULL),
  ('a6000000-0000-4000-8000-000000000019', 'c13d6cd4-331c-4345-a6ff-5c079dbebe3b', '11111111-aaaa-4000-8000-000000000001', 'yes_no', true, NULL),
  ('a6000000-0000-4000-8000-000000000019', 'df0aea43-156c-4965-9b6d-2b1250f51af9', '11111111-aaaa-4000-8000-000000000001', 'yes_no', true, NULL),
  ('a6000000-0000-4000-8000-000000000020', 'c13d6cd4-331c-4345-a6ff-5c079dbebe3b', '11111111-aaaa-4000-8000-000000000001', 'yes_no', false, NULL),
  ('a6000000-0000-4000-8000-000000000020', 'df0aea43-156c-4965-9b6d-2b1250f51af9', '11111111-aaaa-4000-8000-000000000001', 'yes_no', false, NULL),
  ('a6000000-0000-4000-8000-000000000021', 'c13d6cd4-331c-4345-a6ff-5c079dbebe3b', '11111111-aaaa-4000-8000-000000000001', 'yes_no', true, NULL),
  ('a6000000-0000-4000-8000-000000000021', 'df0aea43-156c-4965-9b6d-2b1250f51af9', '11111111-aaaa-4000-8000-000000000001', 'yes_no', true, NULL),
  ('a6000000-0000-4000-8000-000000000022', 'c13d6cd4-331c-4345-a6ff-5c079dbebe3b', '11111111-aaaa-4000-8000-000000000001', 'yes_no', true, NULL),
  ('a6000000-0000-4000-8000-000000000022', 'df0aea43-156c-4965-9b6d-2b1250f51af9', '11111111-aaaa-4000-8000-000000000001', 'yes_no', true, NULL),
  ('a6000000-0000-4000-8000-000000000023', 'c13d6cd4-331c-4345-a6ff-5c079dbebe3b', '11111111-aaaa-4000-8000-000000000001', 'yes_no', true, NULL),
  ('a6000000-0000-4000-8000-000000000023', 'df0aea43-156c-4965-9b6d-2b1250f51af9', '11111111-aaaa-4000-8000-000000000001', 'yes_no', true, NULL),
  ('a6000000-0000-4000-8000-000000000024', 'c13d6cd4-331c-4345-a6ff-5c079dbebe3b', '11111111-aaaa-4000-8000-000000000001', 'yes_no', false, NULL),
  ('a6000000-0000-4000-8000-000000000024', 'df0aea43-156c-4965-9b6d-2b1250f51af9', '11111111-aaaa-4000-8000-000000000001', 'yes_no', true, NULL),
  ('a6000000-0000-4000-8000-000000000025', 'c13d6cd4-331c-4345-a6ff-5c079dbebe3b', '11111111-aaaa-4000-8000-000000000001', 'yes_no', true, NULL),
  ('a6000000-0000-4000-8000-000000000025', 'df0aea43-156c-4965-9b6d-2b1250f51af9', '11111111-aaaa-4000-8000-000000000001', 'yes_no', false, NULL),
  ('a6000000-0000-4000-8000-000000000026', 'c13d6cd4-331c-4345-a6ff-5c079dbebe3b', '11111111-aaaa-4000-8000-000000000001', 'yes_no', true, NULL),
  ('a6000000-0000-4000-8000-000000000026', 'df0aea43-156c-4965-9b6d-2b1250f51af9', '11111111-aaaa-4000-8000-000000000001', 'yes_no', true, NULL),
  ('a6000000-0000-4000-8000-000000000027', 'c13d6cd4-331c-4345-a6ff-5c079dbebe3b', '11111111-aaaa-4000-8000-000000000001', 'yes_no', true, NULL),
  ('a6000000-0000-4000-8000-000000000027', 'df0aea43-156c-4965-9b6d-2b1250f51af9', '11111111-aaaa-4000-8000-000000000001', 'yes_no', true, NULL),
  ('a6000000-0000-4000-8000-000000000028', 'c13d6cd4-331c-4345-a6ff-5c079dbebe3b', '11111111-aaaa-4000-8000-000000000001', 'yes_no', false, NULL),
  ('a6000000-0000-4000-8000-000000000028', 'df0aea43-156c-4965-9b6d-2b1250f51af9', '11111111-aaaa-4000-8000-000000000001', 'yes_no', true, NULL),
  ('a6000000-0000-4000-8000-000000000029', 'c13d6cd4-331c-4345-a6ff-5c079dbebe3b', '11111111-aaaa-4000-8000-000000000001', 'yes_no', true, NULL),
  ('a6000000-0000-4000-8000-000000000029', 'df0aea43-156c-4965-9b6d-2b1250f51af9', '11111111-aaaa-4000-8000-000000000001', 'yes_no', true, NULL),
  ('a6000000-0000-4000-8000-000000000030', 'c13d6cd4-331c-4345-a6ff-5c079dbebe3b', '11111111-aaaa-4000-8000-000000000001', 'yes_no', true, NULL),
  ('a6000000-0000-4000-8000-000000000030', 'df0aea43-156c-4965-9b6d-2b1250f51af9', '11111111-aaaa-4000-8000-000000000001', 'yes_no', false, NULL),
  ('a6000000-0000-4000-8000-000000000031', 'c13d6cd4-331c-4345-a6ff-5c079dbebe3b', '11111111-aaaa-4000-8000-000000000001', 'yes_no', true, NULL),
  ('a6000000-0000-4000-8000-000000000031', 'df0aea43-156c-4965-9b6d-2b1250f51af9', '11111111-aaaa-4000-8000-000000000001', 'yes_no', true, NULL),
  ('a6000000-0000-4000-8000-000000000032', 'c13d6cd4-331c-4345-a6ff-5c079dbebe3b', '11111111-aaaa-4000-8000-000000000001', 'yes_no', false, NULL),
  ('a6000000-0000-4000-8000-000000000032', 'df0aea43-156c-4965-9b6d-2b1250f51af9', '11111111-aaaa-4000-8000-000000000001', 'yes_no', true, NULL)
ON CONFLICT DO NOTHING;

-- ── Väktare, Norrköping: 5 050 applications ─────────────────────────────
-- One applicant per application, named by number so any one of them can be
-- searched for. The first 5 000 are new, then 40 in review and 10 at
-- interview; odd-numbered applicants answered the licence question yes,
-- even-numbered no. created_at runs one minute per applicant from 1 Sep
-- 2026, so "newest first" is 5050 down to 0001 -- and the OLDEST fifty are
-- the ones the old 5 000-row read never showed.
INSERT INTO public.jobs (id, slug, short_id, employer_id, title_sv, title_en, description_sv, requirements_sv,
                         country, city, workplace_type, application_method, status, deadline_at, expires_at)
VALUES ('55555555-eeee-4000-8000-000000000005', 'nordvakt-vaktare-norrkoping-uat5', 'uatjob0005', '11111111-aaaa-4000-8000-000000000001',
        'Väktare, Norrköping', 'Security officer, Norrköping',
        'Nordvakt Säkerhet AB söker väktare till uppdrag i Norrköping.',
        'Väktarutbildning. Körkort B.',
        'SE', 'Norrköping', 'onsite', 'internal', 'draft', now() + interval '25 days', now() + interval '40 days')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.recruitment_questions (id, job_id, employer_id, requirement_id, prompt_sv, prompt_en, answer_kind, is_required, position)
VALUES ('55555555-eeee-4000-8000-0000000000a1', '55555555-eeee-4000-8000-000000000005', '11111111-aaaa-4000-8000-000000000001', NULL, 'Har du körkort B?', 'Do you hold a B driving licence?', 'yes_no', false, 0)
ON CONFLICT (id) DO NOTHING;
UPDATE public.jobs SET status = 'published', expires_at = now() + interval '40 days', deadline_at = now() + interval '25 days'
 WHERE id = '55555555-eeee-4000-8000-000000000005' AND status <> 'published';

CREATE TEMP TABLE rec_big ON COMMIT DROP AS
SELECT g AS n,
       ('a8000000-0000-4000-8000-' || lpad(to_hex(g), 12, '0'))::uuid AS uid,
       ('a7000000-0000-4000-8000-' || lpad(to_hex(g), 12, '0'))::uuid AS app,
       'Sökande ' || lpad(g::text, 4, '0') AS name
  FROM generate_series(1, 5050) g;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token)
SELECT '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
       'sokande-' || lpad(n::text, 4, '0') || '@test.local', '', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('display_name', name), now(), now(),
       '', '', '', '', '', '', '', ''
  FROM rec_big
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.profiles (id, display_name) SELECT uid, name FROM rec_big
ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name;
INSERT INTO public.job_applications (id, job_id, employer_id, applicant_user_id, status, cv_storage_path, cv_source, consent_given_at, created_at)
SELECT app, '55555555-eeee-4000-8000-000000000005', '11111111-aaaa-4000-8000-000000000001', uid,
       CASE WHEN n <= 5000 THEN 'submitted' WHEN n <= 5040 THEN 'reviewing' ELSE 'interview' END,
       CASE WHEN n % 3 = 0 THEN NULL ELSE 'x/cv-' || n || '.pdf' END, 'upload', now(),
       timestamptz '2026-09-01 00:00:00+00' + (n * interval '1 minute')
  FROM rec_big
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.job_application_answers (application_id, question_id, employer_id, answer_kind, answer_bool)
SELECT app, '55555555-eeee-4000-8000-0000000000a1', '11111111-aaaa-4000-8000-000000000001', 'yes_no', n % 2 = 1
  FROM rec_big
ON CONFLICT DO NOTHING;

COMMIT;
