-- Disposable test fixture derived from the existing recruitment journey suite.
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

-- ---------------------------------------------------------------------------
-- Fixture: two guarding companies, one job, one applicant with an account, one
-- invitee without one, and a stranger organisation that must see nothing.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE rj AS
SELECT
  'ea000000-1111-0000-0000-000000000001'::uuid AS employer,
  'ea000000-0000-0000-0000-000000000001'::uuid AS owner_user,
  'ea000000-0000-0000-0000-000000000002'::uuid AS anna,       -- has an account, applied
  'ea000000-0000-0000-0000-000000000003'::uuid AS bo,         -- account, no application
  'ea000000-0000-0000-0000-000000000004'::uuid AS cecilia,    -- NO account at invite time
  'ea000000-1111-0000-0000-000000000009'::uuid AS other_employer,
  'ea000000-0000-0000-0000-000000000009'::uuid AS other_owner,
  'ea000000-2222-0000-0000-000000000001'::uuid AS job,
  'ea000000-3333-0000-0000-000000000001'::uuid AS application;

INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
  ((SELECT owner_user  FROM rj), 'owner@journey.test',   now()),
  ((SELECT anna        FROM rj), 'anna@journey.test',    now()),
  ((SELECT bo          FROM rj), 'bo@journey.test',      now()),
  ((SELECT other_owner FROM rj), 'other@journey.test',   now());

INSERT INTO public.employers (id, name, slug, status)
SELECT employer, 'Nordvakt Bevakning AB', 'nordvakt-journey', 'active' FROM rj
UNION ALL
SELECT other_employer, 'Annan Bevakning AB', 'annan-journey', 'active' FROM rj;

INSERT INTO public.employer_memberships (employer_id, user_id, role, status)
SELECT employer, owner_user, 'owner', 'active' FROM rj
UNION ALL
SELECT other_employer, other_owner, 'owner', 'active' FROM rj;

-- A live internal posting, created the way the product actually creates one:
-- publishing is moderation-owned, so the insert runs as a platform admin. Going
-- round the guard by inserting a draft and calling it published would make the
-- application below pass a check the real flow has to satisfy.
INSERT INTO auth.users (id, email, email_confirmed_at)
VALUES ('ea000000-0000-0000-0000-0000000000ad', 'moderator@journey.test', now());
INSERT INTO public.user_roles (user_id, role)
VALUES ('ea000000-0000-0000-0000-0000000000ad', 'admin');

GRANT SELECT ON rj TO authenticated;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ea000000-0000-0000-0000-0000000000ad';
INSERT INTO public.jobs (id, slug, short_id, employer_id, title_sv, title_en,
                         application_method, status, published_at, expires_at)
SELECT job, 'vaktare-stockholm-journey', 'RJ0001', employer,
       'Väktare, Stockholm', 'Security Officer, Stockholm', 'internal', 'published',
       now() - interval '1 day', now() + interval '30 days'
  FROM rj;
RESET ROLE; RESET request.jwt.claim.sub;

INSERT INTO public.job_applications (id, job_id, employer_id, applicant_user_id,
                                     status, consent_given_at)
SELECT application, job, employer, anna, 'submitted', now() FROM rj;

CREATE TEMP TABLE rjv AS
SELECT av.id AS version_id, av.definition_id
  FROM public.scp_assessment_versions av
  JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
 WHERE d.slug = 'security-officer-recruitment'
 ORDER BY av.version_number DESC LIMIT 1;

INSERT INTO public.scp_test_grants
  (employer_id, purpose, definition_id, reason, authorised_by, expires_at)
SELECT employer, 'closed_test'::public.scp_governance_mode, (SELECT definition_id FROM rjv),
       'Recruitment journey suite', owner_user, now() + interval '30 days' FROM rj
UNION ALL
SELECT other_employer, 'closed_test'::public.scp_governance_mode, (SELECT definition_id FROM rjv),
       'Recruitment journey suite — second tenant', other_owner, now() + interval '30 days' FROM rj;

GRANT SELECT ON rj, rjv TO authenticated;
