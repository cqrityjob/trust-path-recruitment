-- ============================================================================
-- The Golden Väktare Case — a synthetic, reusable product demonstration
-- ============================================================================
--
-- One complete recruitment interview a person can be walked through end to
-- end: overview, preparation, the conversation, review, assessment, report.
--
-- SYNTHETIC THROUGHOUT. "Marcus Lindqvist" is invented, the employer is
-- invented, the CV is invented, and no row here derives from a real person.
-- The fixture is safe to load into a development or UAT database and must
-- never be loaded into one holding real candidates.
--
-- Idempotent: fixed UUIDs, everything guarded by ON CONFLICT DO NOTHING, so
-- re-running it restores the case rather than duplicating it. Reusable in
-- regression and UAT work; deliberately NOT a hard-coded demo page.
--
-- WHAT THE CASE IS BUILT TO EXERCISE
--
-- The interview notes are written so a reviewer meets every situation the
-- product claims to handle:
--
--   Q1  a strong, detailed example -- situation, own action, result
--   Q2  an incomplete example -- an outcome with no account of what he did
--   Q3  an APPARENT INCONSISTENCY against the CV (2019 vs "three years")
--   Q4  an ambiguity -- "we reported it", with no who
--   Q5  a credential that needs separate verification (väktarlegitimation)
--   Q6  an example needing one neutral clarification
--   Q7  irrelevant information that must not influence the assessment
--   Q8  no note at all, so the empty state is visible
--
-- The inconsistency in Q3 is the point of the whole fixture. It is a date that
-- does not line up. It is NOT evidence of dishonesty, and any surface that
-- turns it into a credibility judgement has failed. A person misremembering
-- which year a job started is the most ordinary thing in an interview.
-- ============================================================================

BEGIN;

-- ---- the people, all invented ---------------------------------------------
-- A complete auth row, not just an id and an email: GoTrue refuses to issue a
-- link for a half-built user, and a fixture nobody can sign in as is not a
-- demonstration of anything.
-- The empty-string token columns are not decoration. GoTrue scans them into
-- Go `string` fields, so a NULL there fails the read with "converting NULL to
-- string is unsupported" and the account becomes unloadable: signing in, and
-- even the admin API, answer 500. The row looks perfectly healthy in psql.
-- The same goes for instance_id -- a NULL one is simply not found -- and for
-- auth.identities.last_sign_in_at.
--
-- Which is to say: this fixture is only a demonstration if somebody can
-- actually sign in as it, and that is exactly what these columns decide.
INSERT INTO auth.users
  (instance_id, id, aud, role, email, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
   confirmation_token, recovery_token, email_change_token_new, email_change,
   email_change_token_current, email_change_confirm_status,
   phone_change, phone_change_token, reauthentication_token,
   is_sso_user, is_anonymous)
VALUES
  ('00000000-0000-0000-0000-000000000000',
   '90140000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'golden.rekryterare@test.local', now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"email_verified":true}'::jsonb, now(), now(),
   '', '', '', '',
   '', 0,
   '', '', '',
   false, false)
ON CONFLICT (id) DO UPDATE
   SET instance_id = EXCLUDED.instance_id,
       aud = EXCLUDED.aud,
       role = EXCLUDED.role,
       email_confirmed_at = coalesce(auth.users.email_confirmed_at, EXCLUDED.email_confirmed_at),
       raw_app_meta_data = EXCLUDED.raw_app_meta_data,
       raw_user_meta_data = EXCLUDED.raw_user_meta_data,
       created_at = coalesce(auth.users.created_at, EXCLUDED.created_at),
       updated_at = EXCLUDED.updated_at,
       confirmation_token = coalesce(auth.users.confirmation_token, ''),
       recovery_token = coalesce(auth.users.recovery_token, ''),
       email_change_token_new = coalesce(auth.users.email_change_token_new, ''),
       email_change = coalesce(auth.users.email_change, ''),
       email_change_token_current = coalesce(auth.users.email_change_token_current, ''),
       email_change_confirm_status = coalesce(auth.users.email_change_confirm_status, 0),
       phone_change = coalesce(auth.users.phone_change, ''),
       phone_change_token = coalesce(auth.users.phone_change_token, ''),
       reauthentication_token = coalesce(auth.users.reauthentication_token, ''),
       is_sso_user = coalesce(auth.users.is_sso_user, false),
       is_anonymous = coalesce(auth.users.is_anonymous, false);

INSERT INTO auth.identities
  (id, user_id, provider_id, provider, identity_data, created_at, updated_at, last_sign_in_at)
VALUES (gen_random_uuid(), '90140000-0000-4000-8000-000000000001',
        '90140000-0000-4000-8000-000000000001', 'email',
        '{"sub":"90140000-0000-4000-8000-000000000001","email":"golden.rekryterare@test.local","email_verified":true}'::jsonb,
        now(), now(), now())
ON CONFLICT DO NOTHING;

-- Existing local copies of the fixture predate the columns above, and a
-- DO NOTHING on the identity leaves the old NULL in place.
UPDATE auth.identities
   SET last_sign_in_at = coalesce(last_sign_in_at, now())
 WHERE user_id = '90140000-0000-4000-8000-000000000001';

INSERT INTO public.employers (id, name, slug, status) VALUES
  ('90140000-0000-4000-8000-0000000000aa', 'Nordväkt Bevakning AB', 'nordvakt-bevakning', 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.employer_memberships (user_id, employer_id, role, status) VALUES
  ('90140000-0000-4000-8000-000000000001','90140000-0000-4000-8000-0000000000aa','owner','active')
ON CONFLICT DO NOTHING;

-- Any already-working test identity in this database also gets a seat, so the
-- case is demonstrable without provisioning a new sign-in first. A recruiter
-- belonging to two employers is ordinary SaaS behaviour, and it does not
-- weaken the isolation this fixture is partly here to show: membership is
-- still what grants access, and a user with no seat still sees nothing.
INSERT INTO public.employer_memberships (user_id, employer_id, role, status)
SELECT u.id, '90140000-0000-4000-8000-0000000000aa', 'owner', 'active'
  FROM auth.users u
 WHERE u.email LIKE 'uat.%@test.local'
ON CONFLICT DO NOTHING;

DO $$
DECLARE
  _case   uuid := '90140000-0000-4000-8000-0000000000c1';
  _emp    uuid := '90140000-0000-4000-8000-0000000000aa';
  _user   uuid := '90140000-0000-4000-8000-000000000001';
  _pv     uuid;
  _rv     uuid;
  _method uuid;
  _plan   uuid := '90140000-0000-4000-8000-00000000d1a1'::uuid;
  _sess   uuid := '90140000-0000-4000-8000-00000000d1a2'::uuid;
  _cv     uuid := '90140000-0000-4000-8000-00000000d1a3'::uuid;
  _app    uuid := '90140000-0000-4000-8000-00000000d1a4'::uuid;
  _q      record;
  _note   text;
  _kind   text;
BEGIN
  SELECT id INTO _pv FROM public.scp_interview_pack_versions ORDER BY version_number DESC LIMIT 1;
  SELECT role_version_id INTO _rv FROM public.scp_interview_cases WHERE role_version_id IS NOT NULL LIMIT 1;
  SELECT id INTO _method FROM public.scp_interview_methods LIMIT 1;

  IF _pv IS NULL OR _rv IS NULL THEN
    RAISE EXCEPTION 'GOLDEN: no Väktare pack version or role version in this database. '
                    'Load the interview seed data before this fixture.';
  END IF;

  -- ---- the case ----------------------------------------------------------
  INSERT INTO public.scp_interview_cases
    (id, employer_id, candidate_display_name, candidate_external_ref,
     pack_version_id, role_version_id,
     title, status, purpose_code, created_by, trust_method_id)
  VALUES
    -- An external reference rather than a platform account: this candidate
    -- applied without a CQrityjob login, which is the ordinary case and the
    -- one the constraint requires to be stated explicitly.
    (_case, _emp, 'Marcus Lindqvist', 'GOLDEN-VAKTARE-001', _pv, _rv,
     'Väktare – stationär bevakning, Kista', 'interview_complete',
     'recruitment_interview', _user, _method)
  ON CONFLICT (id) DO NOTHING;

  -- ---- what the recruiter was given -------------------------------------
  -- Candidate-provided, and labelled as such everywhere it is shown. Nothing
  -- in here is a verified fact; that distinction is the product's spine.
  INSERT INTO public.scp_interview_case_sources
    (id, case_id, source_kind, label, content_text, purpose_code, lawful_basis_note, origin, provided_by)
  VALUES
    (_cv, _case, 'candidate_cv', 'CV – Marcus Lindqvist',
     E'ARBETSLIVSERFARENHET\n'
     '2019–2023  Väktare, Trygg Bevakning AB, Stockholm. Stationär bevakning '
     'vid kontorsfastighet. Entrékontroll, ronderin g, larmhantering.\n'
     '2023–2025  Ordningsvakt, evenemang (timanställd).\n\n'
     'UTBILDNING\n'
     'Väktarutbildning grundkurs (VU1). Uppger giltig väktarlegitimation.\n\n'
     'ÖVRIGT\n'
     'Spelar innebandy i korplag. Körkort B.',
     'recruitment_interview',
     'Kandidatens eget underlag, inlämnat för denna rekrytering.',
     'candidate_application', _user),
    (_app, _case, 'application_answers', 'Ansökningssvar',
     E'Varför söker du tjänsten?\n'
     'Jag vill tillbaka till stationär bevakning. Trivdes bäst där.\n\n'
     'Hur länge har du arbetat som väktare?\n'
     'Ungefär tre år.',
     'recruitment_interview',
     'Kandidatens egna svar i ansökan.',
     'candidate_application', _user)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.scp_interview_source_passages (source_id, passage_index, content)
  SELECT s.id, 1, s.content_text FROM public.scp_interview_case_sources s
   WHERE s.id IN (_cv, _app)
     AND NOT EXISTS (SELECT 1 FROM public.scp_interview_source_passages p WHERE p.source_id = s.id);

  -- ---- an approved preparation plan, authored by a human -----------------
  INSERT INTO public.scp_interview_prep_plans
    (id, case_id, version_number, status, role_summary, candidate_summary,
     opening_guidance, closing_guidance, ai_disclosure, ai_disclosure_en, approved_by, approved_at)
  VALUES
    (_plan, _case, 1, 'approved',
     'Stationär bevakning i kontorsfastighet: entrékontroll, rondering, '
     'larmhantering, rapportering och bemötande under press.',
     'Uppger fyra års väktarerfarenhet och giltig legitimation. '
     'Uppgifterna är kandidatens egna och är inte kontrollerade.',
     'Förklara upplägget, att du antecknar, och att han får avbryta.',
     'Sammanfatta, låt honom rätta, och berätta vad som händer sedan.',
     'Ingen AI användes för att ta fram den här planen.',
     'No AI was used to produce this plan.',
     _user, now())
  ON CONFLICT (id) DO NOTHING;

  -- ---- the conversation that took place ----------------------------------
  INSERT INTO public.scp_interview_sessions
    (id, case_id, plan_id, status, peace_stage, interviewer_names, started_at, completed_at, created_by)
  VALUES
    (_sess, _case, _plan, 'completed', 'evaluation',
     ARRAY['Anna Berg'], now() - interval '2 hours', now() - interval '1 hour', _user)
  ON CONFLICT (id) DO NOTHING;

  -- ---- the notes, one per question, each built for a purpose -------------
  FOR _q IN
    SELECT id, code FROM public.scp_interview_core_questions
     WHERE pack_version_id = _pv ORDER BY display_order
  LOOP
    _kind := 'observation';
    _note := CASE _q.code
      -- A complete account: situation, his own action, an observable result.
      WHEN 'Q1' THEN
        'Vid en rond en kväll märkte han att en branddörr mot lastkajen stod '
        'uppställd med en pall. Han kollade att ingen var kvar i utrymmet, tog '
        'bort pallen och stängde dörren, och ringde driftansvarig samma kväll '
        'eftersom larmet på den dörren varit urkopplat i flera dagar. '
        'Skrev avvikelse. Dörren åtgärdades dagen efter.'
      -- An outcome with no account of what he actually did. Incomplete, and
      -- the product should show it as incomplete rather than infer anything.
      WHEN 'Q2' THEN
        'Berättar att en besökare blev högljudd i receptionen och att det '
        'lugnade ner sig till slut. Inga detaljer om vad han själv sa eller '
        'gjorde.'
      -- The apparent inconsistency. His CV says 2019-2023; here he says three
      -- years and 2020. A date that does not line up is a date that does not
      -- line up. It is not a credibility finding.
      WHEN 'Q3' THEN
        'Säger att han började som väktare 2020 och att det blev ungefär tre '
        'år. CV:t anger 2019–2023. Skillnaden är inte utredd i samtalet.'
      -- An ambiguity: a passive "we", with no who.
      WHEN 'Q4' THEN
        'Beskriver en incident med en vattenläcka i ett trapphus. Säger att '
        '"vi rapporterade det vidare". Framgår inte vem som skrev rapporten '
        'eller vad den innehöll.'
      -- A credential that has to be checked somewhere else. This is exactly
      -- what a verification item is for.
      WHEN 'Q5' THEN
        'Uppger att han har giltig väktarlegitimation och att den förnyades '
        'förra året. Handling inte visad vid intervjun.'
      -- Needs one neutral clarification to become usable.
      WHEN 'Q6' THEN
        'En kund ville bli insläppt i ett låst utrymme utan behörighet. Han '
        'säger att han "löste det". Oklart om han nekade, eskalerade eller '
        'ordnade behörighet.'
      -- Irrelevant to the role. Present on purpose: it must not influence
      -- any assessment, and a reviewer should be able to see that it did not.
      WHEN 'Q7' THEN
        'Pratade en stund om innebandylaget och att han är lagkapten. Trevligt, '
        'men utan koppling till frågan.'
      ELSE NULL  -- Q8 deliberately has no note, so the empty state is visible
    END;

    IF _note IS NOT NULL THEN
      INSERT INTO public.scp_interview_session_notes (session_id, question_id, note_kind, body, author_id)
      SELECT _sess, _q.id, _kind, _note, _user
       WHERE NOT EXISTS (
         SELECT 1 FROM public.scp_interview_session_notes n
          WHERE n.session_id = _sess AND n.question_id = _q.id);
    END IF;
  END LOOP;

  -- ---- what the interview left open -------------------------------------
  -- These are the four things a recruiter would carry out of this conversation.
  -- The contradiction is recorded as a discrepancy to clarify, in those words,
  -- because the wording is the safeguard: nothing downstream can turn "needs
  -- clarifying" into "was dishonest" if the record never says the latter.
  INSERT INTO public.scp_interview_findings
    (case_id, finding_kind, statement, claim_class, resolution_state)
  SELECT _case, v.k, v.s, 'governed_content', 'open'
    FROM (VALUES
      ('contradiction',
       'CV:t anger 2019–2023, kandidaten säger 2020 och cirka tre år. Behöver klargöras.'),
      ('verification',
       'Väktarlegitimation uppges giltig och förnyad förra året. Handling ej visad.'),
      ('unclear',
       'Q4: oklart vem som skrev rapporten vid vattenläckan.'),
      ('gap',
       'Q2: ingen redogörelse för vad kandidaten själv gjorde.')
    ) AS v(k, s)
   WHERE NOT EXISTS (SELECT 1 FROM public.scp_interview_findings f WHERE f.case_id = _case);

  RAISE NOTICE 'GOLDEN: Väktare case ready — employer nordvakt-bevakning, case %', _case;
END $$;

COMMIT;
