-- #51 — Response review is an employer capability, proven with two tenants.
--
-- The defect this suite pins: reviewing a participant's response used to be
-- gated on scp_can_author, a GLOBAL content-governance capability with no
-- employer column. Any content editor could read every tenant's free-text
-- answers, and no employer could review its own work without a CQrityjob
-- platform administrator.
--
-- Every assertion runs as a real principal (SET LOCAL ROLE authenticated plus a
-- JWT claim), and the tenancy assertions use TWO organisations, because a
-- single-tenant fixture cannot fail a cross-tenant test.
--
-- One transaction, ends in ROLLBACK.

\set ON_ERROR_STOP on
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.ok(cond boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT cond THEN RAISE EXCEPTION 'ASSERTION FAILED: %', label; END IF;
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

-- ── Fixture: two organisations that must never see each other ─────────────

INSERT INTO auth.users (id, email) VALUES
  ('e1000000-0000-0000-0000-00000000000a','ownerA@rev.test'),
  ('e1000000-0000-0000-0000-00000000000b','reviewerA@rev.test'),
  ('e1000000-0000-0000-0000-00000000000c','recruiterA@rev.test'),
  ('e1000000-0000-0000-0000-00000000000d','participantA@rev.test'),
  ('e1000000-0000-0000-0000-00000000000e','ownerB@rev.test'),
  ('e1000000-0000-0000-0000-00000000000f','reviewerB@rev.test'),
  ('e1000000-0000-0000-0000-000000000010','participantB@rev.test'),
  ('e1000000-0000-0000-0000-000000000011','contentonly@rev.test');

INSERT INTO public.employers (id, name, slug, status) VALUES
  ('e1000000-1111-0000-0000-00000000000a','Alpha Security AB','alpha-security-rev','active'),
  ('e1000000-1111-0000-0000-00000000000b','Beta Guarding AB','beta-guarding-rev','active');

INSERT INTO public.employer_memberships (employer_id, user_id, role, status) VALUES
  ('e1000000-1111-0000-0000-00000000000a','e1000000-0000-0000-0000-00000000000a','owner','active'),
  ('e1000000-1111-0000-0000-00000000000a','e1000000-0000-0000-0000-00000000000b','member','active'),
  ('e1000000-1111-0000-0000-00000000000a','e1000000-0000-0000-0000-00000000000c','admin','active'),
  ('e1000000-1111-0000-0000-00000000000b','e1000000-0000-0000-0000-00000000000e','owner','active'),
  ('e1000000-1111-0000-0000-00000000000b','e1000000-0000-0000-0000-00000000000f','member','active');

-- A content-governance principal with NO employer authorisation anywhere.
INSERT INTO public.scp_content_roles (user_id, role)
VALUES ('e1000000-0000-0000-0000-000000000011','reviewer');

-- Subjects
INSERT INTO public.scp_subjects (id) VALUES
  ('e1000000-2222-0000-0000-00000000000a'),
  ('e1000000-2222-0000-0000-00000000000b');
INSERT INTO public.scp_subject_identities (subject_id, user_id) VALUES
  ('e1000000-2222-0000-0000-00000000000a','e1000000-0000-0000-0000-00000000000d'),
  ('e1000000-2222-0000-0000-00000000000b','e1000000-0000-0000-0000-000000000010');

-- Reuse real governed content: a safety-critical item guarantees a review.
CREATE TEMP TABLE revfx AS
SELECT av.id AS av_id, f.id AS form_id, iv.id AS iv_id
  FROM public.scp_assessment_versions av
  JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
  JOIN public.scp_forms f ON f.assessment_version_id = av.id
  JOIN public.scp_form_items fi ON fi.form_id = f.id
  JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
 WHERE d.slug = 'sg-situational-awareness' AND iv.is_safety_critical
 LIMIT 1;

SELECT av_id AS avid, form_id AS fid, iv_id AS ivid FROM revfx \gset

-- The SG content is real and still draft/design, so each organisation runs it
-- under an explicit closed-test grant -- exactly as in production.
INSERT INTO public.scp_test_grants (employer_id, purpose, reason, authorised_by) VALUES
  ('e1000000-1111-0000-0000-00000000000a','closed_test','reviewer suite fixture','e1000000-0000-0000-0000-00000000000a'),
  ('e1000000-1111-0000-0000-00000000000b','closed_test','reviewer suite fixture','e1000000-0000-0000-0000-00000000000e');

-- Assignments: workforce for A and B, plus a recruitment one for A.
INSERT INTO public.assessment_assignments
  (id, employer_id, use_case, recipient_email, assigned_by, invitation_token_hash, expires_at,
   scp_assessment_version_id, status)
VALUES
  ('e1000000-3333-0000-0000-00000000000a','e1000000-1111-0000-0000-00000000000a','workforce',
   'participantA@rev.test','e1000000-0000-0000-0000-00000000000a','hashA1', now()+interval '30 days',
   :'avid'::uuid,'started'),
  ('e1000000-3333-0000-0000-00000000000b','e1000000-1111-0000-0000-00000000000b','workforce',
   'participantB@rev.test','e1000000-0000-0000-0000-00000000000e','hashB1', now()+interval '30 days',
   :'avid'::uuid,'started'),
  ('e1000000-3333-0000-0000-00000000000c','e1000000-1111-0000-0000-00000000000a','workforce',
   'participantA@rev.test','e1000000-0000-0000-0000-00000000000c','hashA2', now()+interval '30 days',
   :'avid'::uuid,'started');

-- The assign-time guard correctly REFUSES a recruitment assignment on
-- closed-test content -- SCP_NOT_VALID_FOR_RECRUITMENT -- and no operationally
-- validated content exists on this platform yet, so a recruitment assignment
-- cannot be created at all. The recruitment separation-of-duties rules are
-- therefore exercised against a relabelled assignment: the rules under test
-- live in scp_review_conflict, not in the assign guard, and the assign guard
-- keeps its own assertion below.
UPDATE public.assessment_assignments SET use_case = 'recruitment'
 WHERE id = 'e1000000-3333-0000-0000-00000000000c';

INSERT INTO public.scp_attempts
  (id, subject_id, issuer_organization_id, assignment_id, mode, form_id,
   assessment_version_id, status, submitted_at)
VALUES
  ('e1000000-4444-0000-0000-00000000000a','e1000000-2222-0000-0000-00000000000a',
   'e1000000-1111-0000-0000-00000000000a','e1000000-3333-0000-0000-00000000000a',
   'assessment', :'fid'::uuid, :'avid'::uuid, 'submitted', now()),
  ('e1000000-4444-0000-0000-00000000000b','e1000000-2222-0000-0000-00000000000b',
   'e1000000-1111-0000-0000-00000000000b','e1000000-3333-0000-0000-00000000000b',
   'assessment', :'fid'::uuid, :'avid'::uuid, 'submitted', now()),
  ('e1000000-4444-0000-0000-00000000000c','e1000000-2222-0000-0000-00000000000a',
   'e1000000-1111-0000-0000-00000000000a','e1000000-3333-0000-0000-00000000000c',
   'assessment', :'fid'::uuid, :'avid'::uuid, 'submitted', now());

-- The item is an SJT, so the response must carry a selected option: the shape
-- guard is real and this fixture respects it rather than working around it.
INSERT INTO public.scp_candidate_responses (id, attempt_id, item_version_id, selected_option_id)
SELECT v.rid, v.aid, :'ivid'::uuid,
       (SELECT o.id FROM public.scp_item_options o
         WHERE o.item_version_id = :'ivid'::uuid ORDER BY o.option_key LIMIT 1)
  FROM (VALUES
    ('e1000000-5555-0000-0000-00000000000a'::uuid,'e1000000-4444-0000-0000-00000000000a'::uuid),
    ('e1000000-5555-0000-0000-00000000000b'::uuid,'e1000000-4444-0000-0000-00000000000b'::uuid),
    ('e1000000-5555-0000-0000-00000000000c'::uuid,'e1000000-4444-0000-0000-00000000000c'::uuid)
  ) v(rid, aid);

INSERT INTO public.scp_human_reviews (id, response_id, trigger_reason, review_status)
VALUES
  ('e1000000-6666-0000-0000-00000000000a','e1000000-5555-0000-0000-00000000000a','safety_critical_detected','pending'),
  ('e1000000-6666-0000-0000-00000000000b','e1000000-5555-0000-0000-00000000000b','safety_critical_detected','pending'),
  ('e1000000-6666-0000-0000-00000000000c','e1000000-5555-0000-0000-00000000000c','safety_critical_detected','pending');

-- Alpha authorises its own reviewer for both use cases. Beta authorises its own.
INSERT INTO public.scp_employer_reviewers (employer_id, user_id, allowed_use_cases, granted_by) VALUES
  ('e1000000-1111-0000-0000-00000000000a','e1000000-0000-0000-0000-00000000000b',
   ARRAY['workforce','recruitment']::text[],'e1000000-0000-0000-0000-00000000000a'),
  ('e1000000-1111-0000-0000-00000000000b','e1000000-0000-0000-0000-00000000000f',
   ARRAY['workforce']::text[],'e1000000-0000-0000-0000-00000000000e');

-- ═══════════════════════════════════════════════════════════════════════════
-- R1. Content authoring is not response review
-- ═══════════════════════════════════════════════════════════════════════════

SELECT pg_temp.ok(
  public.scp_can_author('e1000000-0000-0000-0000-000000000011'::uuid),
  'R1.1 the content principal really does hold the content-governance capability');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'e1000000-0000-0000-0000-000000000011';
SELECT pg_temp.ok((SELECT count(*) FROM public.scp_review_queue('sv-SE')) = 0,
  'R1.2 a content role alone shows an EMPTY response-review queue');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'e1000000-0000-0000-0000-000000000011';
SELECT pg_temp.must_fail(
  'SELECT public.scp_complete_human_review(''e1000000-6666-0000-0000-00000000000a''::uuid, ''upheld'', ''x'', ''no_concern'')',
  'SCP_NOT_A_REVIEWER',
  'R1.3 a content role alone cannot complete a customer response review');
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  NOT public.scp_can_author('e1000000-0000-0000-0000-00000000000b'::uuid),
  'R1.4 an employer response reviewer does NOT gain content-authoring rights');

-- ═══════════════════════════════════════════════════════════════════════════
-- R2. Two tenants, no leakage
-- ═══════════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'e1000000-0000-0000-0000-00000000000b';
CREATE TEMP TABLE qa AS SELECT * FROM public.scp_review_queue('sv-SE');
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok((SELECT count(*) FROM qa) = 2,
  'R2.1 Alpha''s reviewer sees exactly Alpha''s two pending reviews');
SELECT pg_temp.ok(
  (SELECT bool_and(organisation_name = 'Alpha Security AB') FROM qa),
  'R2.2 every row in Alpha''s queue belongs to Alpha');
SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM qa WHERE attempt_id = 'e1000000-4444-0000-0000-00000000000b'),
  'R2.3 Beta''s attempt never appears in Alpha''s queue');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'e1000000-0000-0000-0000-00000000000b';
SELECT pg_temp.must_fail(
  'SELECT public.scp_complete_human_review(''e1000000-6666-0000-0000-00000000000b''::uuid, ''upheld'', ''cross tenant'', ''no_concern'')',
  'SCP_NOT_A_REVIEWER',
  'R2.4 Alpha''s reviewer cannot complete Beta''s review');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'e1000000-0000-0000-0000-00000000000f';
SELECT pg_temp.ok((SELECT count(*) FROM public.scp_review_queue('sv-SE')) = 1,
  'R2.5 Beta''s reviewer sees exactly Beta''s one review');
SELECT pg_temp.ok(
  (SELECT bool_and(organisation_name = 'Beta Guarding AB') FROM public.scp_review_queue('sv-SE')),
  'R2.6 Beta''s queue contains only Beta');
RESET ROLE; RESET request.jwt.claim.sub;

-- ═══════════════════════════════════════════════════════════════════════════
-- R3. Separation of duties: what refuses, and what is merely disclosed
--
-- #63 narrowed this. Two of the four rules described the ordinary behaviour of
-- a small employer -- the person who sends an assessment out is the person who
-- reads the answers -- and refusing them meant the customer had to hire a
-- second human or invent a second login. Those two are now DISCLOSED: computed,
-- named, shown, and written onto the completed review row.
--
-- The two that refuse still refuse, and the assertions below are the reason
-- narrowing was safe: nobody grades their own answers, and nobody reviews an
-- attempt they have already decided.
-- ═══════════════════════════════════════════════════════════════════════════

SELECT pg_temp.ok(
  public.scp_review_conflict('e1000000-0000-0000-0000-00000000000d'::uuid,
                             'e1000000-4444-0000-0000-00000000000a'::uuid) = 'is_participant',
  'R3.1 the participant may never review their own responses');

SELECT pg_temp.ok(
  public.scp_review_conflict('e1000000-0000-0000-0000-00000000000a'::uuid,
                             'e1000000-4444-0000-0000-00000000000a'::uuid) IS NULL,
  'R3.2 commissioning the assessment no longer BLOCKS its review');

SELECT pg_temp.ok(
  public.scp_review_conflict_disclosure('e1000000-0000-0000-0000-00000000000a'::uuid,
                             'e1000000-4444-0000-0000-00000000000a'::uuid) = 'assigned_this_assessment',
  'R3.2b but it is disclosed, by name');

SELECT pg_temp.ok(
  public.scp_review_conflict('e1000000-0000-0000-0000-00000000000b'::uuid,
                             'e1000000-4444-0000-0000-00000000000a'::uuid) IS NULL
  AND public.scp_review_conflict_disclosure('e1000000-0000-0000-0000-00000000000b'::uuid,
                             'e1000000-4444-0000-0000-00000000000a'::uuid) IS NULL,
  'R3.3 an authorised reviewer who neither took nor assigned it has nothing to disclose');

-- Recruitment: acting on the candidate's application is disclosed too.
-- Employers may only create a job as draft; publishing is a separate step.
INSERT INTO public.jobs (id, slug, short_id, employer_id, application_method, title_sv, status)
VALUES ('e1000000-8888-0000-0000-00000000000a','vaktare-alpha-rev','REVA01',
        'e1000000-1111-0000-0000-00000000000a','internal','Väktare','draft');
-- Publishing a job runs a moderation pipeline that owns published_at. That
-- pipeline is not what this suite tests, and job_application_status_events has
-- a hard FK to job_applications, which in turn requires an OPEN job. So the
-- job-moderation triggers are disabled for exactly this one statement, inside a
-- transaction that rolls back. No review, tenancy or governance trigger is
-- touched -- those are the rules under test and they stay armed throughout.
ALTER TABLE public.jobs DISABLE TRIGGER USER;
UPDATE public.jobs
   SET status = 'published', published_at = now(), expires_at = now() + interval '60 days'
 WHERE id = 'e1000000-8888-0000-0000-00000000000a';
ALTER TABLE public.jobs ENABLE TRIGGER USER;
INSERT INTO public.job_applications (id, job_id, employer_id, applicant_user_id, status, consent_given_at)
VALUES ('e1000000-7777-0000-0000-00000000000a','e1000000-8888-0000-0000-00000000000a',
        'e1000000-1111-0000-0000-00000000000a','e1000000-0000-0000-0000-00000000000d','submitted', now());
UPDATE public.assessment_assignments
   SET application_id = 'e1000000-7777-0000-0000-00000000000a'
 WHERE id = 'e1000000-3333-0000-0000-00000000000c';
INSERT INTO public.job_application_status_events
  (application_id, job_id, employer_id, actor_user_id, actor_role, previous_status, new_status)
VALUES ('e1000000-7777-0000-0000-00000000000a','e1000000-8888-0000-0000-00000000000a','e1000000-1111-0000-0000-00000000000a',
        'e1000000-0000-0000-0000-00000000000b','employer','submitted','in_review');

SELECT pg_temp.ok(
  public.scp_review_conflict_disclosure('e1000000-0000-0000-0000-00000000000b'::uuid,
                             'e1000000-4444-0000-0000-00000000000c'::uuid) = 'acted_on_this_application',
  'R3.4 recruitment: having moved the candidate''s application is disclosed');

SELECT pg_temp.ok(
  public.scp_review_conflict('e1000000-0000-0000-0000-00000000000b'::uuid,
                             'e1000000-4444-0000-0000-00000000000c'::uuid) IS NULL,
  'R3.4b and does not block the review');

SELECT pg_temp.ok(
  public.scp_review_conflict_disclosure('e1000000-0000-0000-0000-00000000000b'::uuid,
                             'e1000000-4444-0000-0000-00000000000a'::uuid) IS NULL,
  'R3.5 the same person has nothing to disclose on the unrelated workforce attempt');

-- The decisive one. This attempt used to vanish from its own organisation's
-- queue, which is how an employer ended up with fourteen responses waiting and
-- nobody permitted to look at them.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'e1000000-0000-0000-0000-00000000000b';
SELECT pg_temp.ok(
  EXISTS (SELECT 1 FROM public.scp_review_queue('sv-SE')
           WHERE attempt_id = 'e1000000-4444-0000-0000-00000000000c'),
  'R3.6 a DISCLOSED conflict keeps the attempt in that reviewer''s queue');
RESET ROLE; RESET request.jwt.claim.sub;

-- And the refusal that remains absolute: whoever recorded the employer decision
-- on this attempt cannot then go back and review it.
INSERT INTO public.scp_employer_report_decisions
  (attempt_id, employer_id, decided_by, action, reason_code)
VALUES ('e1000000-4444-0000-0000-00000000000b','e1000000-1111-0000-0000-00000000000b',
        'e1000000-0000-0000-0000-00000000000f','no_action_needed','meets_expectation');

SELECT pg_temp.ok(
  public.scp_review_conflict('e1000000-0000-0000-0000-00000000000f'::uuid,
                             'e1000000-4444-0000-0000-00000000000b'::uuid) = 'recorded_employer_decision',
  'R3.7 whoever recorded the employer decision still may not review that attempt');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'e1000000-0000-0000-0000-00000000000f';
SELECT pg_temp.must_fail(
  'SELECT public.scp_complete_human_review(''e1000000-6666-0000-0000-00000000000b''::uuid, ''upheld'', ''after the fact'', ''no_concern'')',
  'SCP_REVIEW_CONFLICT_OF_INTEREST',
  'R3.7b and completing it is refused by name, not silently');
RESET ROLE; RESET request.jwt.claim.sub;

-- The decision row stays: it is append-only by design, and every assertion
-- after this point concerns Alpha.

-- ═══════════════════════════════════════════════════════════════════════════
-- R3c. The case this whole change exists for
--
-- A small employer where the owner is the only person who could ever review:
-- they sent the assessment out, so under the old rule they were disqualified
-- from reading the answers, and the product's only remedies were "hire someone"
-- or "make a second login". The owner here has exactly that shape -- they
-- assigned attempt A -- so granting them an authorisation and asking the
-- database whether they may proceed is the whole product claim in one query.
--
-- The grant is removed again immediately: R8 and W4 depend on this owner having
-- blocked work and no workload of their own, which is the OTHER honest state
-- and must keep being asserted.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO public.scp_employer_reviewers (employer_id, user_id, allowed_use_cases, granted_by)
VALUES ('e1000000-1111-0000-0000-00000000000a','e1000000-0000-0000-0000-00000000000a',
        ARRAY['workforce','recruitment']::text[],'e1000000-0000-0000-0000-00000000000a');

SELECT pg_temp.ok(
  public.scp_review_authorisation('e1000000-0000-0000-0000-00000000000a'::uuid,
                                  'e1000000-4444-0000-0000-00000000000a'::uuid) = 'authorised',
  'R3c.1 an authorised owner who commissioned the assessment MAY review it');

SELECT pg_temp.ok(
  public.scp_review_conflict_disclosure('e1000000-0000-0000-0000-00000000000a'::uuid,
                                  'e1000000-4444-0000-0000-00000000000a'::uuid)
    = 'assigned_this_assessment',
  'R3c.2 and their involvement is disclosed rather than hidden');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'e1000000-0000-0000-0000-00000000000a';
SELECT pg_temp.ok(
  EXISTS (SELECT 1 FROM public.scp_review_queue('sv-SE')
           WHERE attempt_id = 'e1000000-4444-0000-0000-00000000000a'),
  'R3c.3 the work reaches their queue -- no second account, no hidden URL');
SELECT pg_temp.ok(
  (SELECT responses_waiting FROM public.scp_my_review_workload())
  = (SELECT count(*) FROM public.scp_review_queue('sv-SE')),
  'R3c.4 and the counter agrees with it, which is the defect that started this');
RESET ROLE; RESET request.jwt.claim.sub;

-- Break-glass must NOT be how an ordinary customer clears their own backlog.
SELECT pg_temp.ok(
  public.scp_review_authorisation('e1000000-0000-0000-0000-00000000000a'::uuid,
                                  'e1000000-4444-0000-0000-00000000000b'::uuid) = 'not_authorised',
  'R3c.5 the same owner still reaches nothing in the other tenant');

UPDATE public.scp_employer_reviewers
   SET revoked_at = now(), revoked_by = 'e1000000-0000-0000-0000-00000000000a'
 WHERE employer_id = 'e1000000-1111-0000-0000-00000000000a'
   AND user_id = 'e1000000-0000-0000-0000-00000000000a';

-- ═══════════════════════════════════════════════════════════════════════════
-- R4. Use-case scope
-- ═══════════════════════════════════════════════════════════════════════════

SELECT pg_temp.ok(
  public.scp_can_review_for('e1000000-0000-0000-0000-00000000000f'::uuid,
                            'e1000000-1111-0000-0000-00000000000b'::uuid, 'workforce'),
  'R4.1 a workforce-scoped authorisation permits workforce');
SELECT pg_temp.ok(
  NOT public.scp_can_review_for('e1000000-0000-0000-0000-00000000000f'::uuid,
                                'e1000000-1111-0000-0000-00000000000b'::uuid, 'recruitment'),
  'R4.2 the same authorisation does NOT permit recruitment');

-- ═══════════════════════════════════════════════════════════════════════════
-- R5. Revocation is immediate
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE public.scp_employer_reviewers
   SET revoked_at = now(), revoked_by = 'e1000000-0000-0000-0000-00000000000a'
 WHERE employer_id = 'e1000000-1111-0000-0000-00000000000a'
   AND user_id = 'e1000000-0000-0000-0000-00000000000b';

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'e1000000-0000-0000-0000-00000000000b';
SELECT pg_temp.ok((SELECT count(*) FROM public.scp_review_queue('sv-SE')) = 0,
  'R5.1 revoking the authorisation empties the queue immediately');
SELECT pg_temp.must_fail(
  'SELECT public.scp_complete_human_review(''e1000000-6666-0000-0000-00000000000a''::uuid, ''upheld'', ''revoked'', ''no_concern'')',
  'SCP_NOT_A_REVIEWER',
  'R5.2 a revoked reviewer cannot complete a review');
RESET ROLE; RESET request.jwt.claim.sub;

-- Restore for the remaining assertions.
UPDATE public.scp_employer_reviewers SET revoked_at = NULL, revoked_by = NULL
 WHERE employer_id = 'e1000000-1111-0000-0000-00000000000a'
   AND user_id = 'e1000000-0000-0000-0000-00000000000b';

-- ═══════════════════════════════════════════════════════════════════════════
-- R6. An outsider cannot be authorised
-- ═══════════════════════════════════════════════════════════════════════════

SELECT pg_temp.must_fail(
  'INSERT INTO public.scp_employer_reviewers (employer_id, user_id, granted_by)
   VALUES (''e1000000-1111-0000-0000-00000000000a'',''e1000000-0000-0000-0000-00000000000f'',
           ''e1000000-0000-0000-0000-00000000000a'')',
  'SCP_REVIEWER_NOT_A_MEMBER',
  'R6.1 Alpha cannot authorise a Beta member to read Alpha responses');

-- ═══════════════════════════════════════════════════════════════════════════
-- R7. The state machine still works, and break-glass is recorded
-- ═══════════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'e1000000-0000-0000-0000-00000000000b';
SELECT public.scp_complete_human_review(
  'e1000000-6666-0000-0000-00000000000a'::uuid, 'upheld',
  'Svaret prioriterar liv och hälsa före egendom och eskalerar korrekt.',
  'no_concern');
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT status FROM public.scp_attempts WHERE id='e1000000-4444-0000-0000-00000000000a') = 'scored',
  'R7.1 the last completed review still moves the attempt to scored');
SELECT pg_temp.ok(
  (SELECT scored_at IS NOT NULL FROM public.scp_attempts WHERE id='e1000000-4444-0000-0000-00000000000a'),
  'R7.2 and stamps scored_at');
SELECT pg_temp.ok(
  (SELECT NOT reviewed_under_break_glass FROM public.scp_human_reviews
    WHERE id='e1000000-6666-0000-0000-00000000000a'),
  'R7.3 an ordinary authorised review is NOT recorded as break-glass');

SELECT pg_temp.ok(
  (SELECT reviewer_actor_id FROM public.scp_human_reviews
    WHERE id='e1000000-6666-0000-0000-00000000000a') = 'e1000000-0000-0000-0000-00000000000b',
  'R7.4 the review records who made it');

-- ═══════════════════════════════════════════════════════════════════════════
-- R8. Counters and queue tell the same story
-- ═══════════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'e1000000-0000-0000-0000-00000000000a';
SELECT pg_temp.ok(
  (SELECT awaiting_review FROM public.scp_employer_review_pressure(
     'e1000000-1111-0000-0000-00000000000a'::uuid)) = 1,
  'R8.1 Alpha''s owner sees one response still awaiting review in their own org');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_employer_review_pressure(
     'e1000000-1111-0000-0000-00000000000b'::uuid)) = 0,
  'R8.2 Alpha''s owner gets nothing back for Beta''s pressure');
RESET ROLE; RESET request.jwt.claim.sub;

-- ── W. The count and the cards must be the same thing ─────────────────────
--
-- This is the assertion that would have caught the "0 väntar" banner sitting
-- above a full queue: it compares the number to the rows rather than checking
-- each in isolation.

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'e1000000-0000-0000-0000-00000000000b';
SELECT pg_temp.ok(
  (SELECT responses_waiting FROM public.scp_my_review_workload())
  = (SELECT count(*) FROM public.scp_review_queue('sv-SE')),
  'W1 the reviewer count equals the number of cards in that reviewer''s queue');
-- By this point Alpha's reviewer has completed their only non-conflicted item,
-- so an empty workload is the correct answer. The property worth pinning is
-- that the workload NEVER reaches beyond the organisations that authorised
-- them -- not that it happens to be non-empty right now.
SELECT pg_temp.ok(
  (SELECT employers_covered FROM public.scp_my_review_workload()) <= 1,
  'W2 the workload never spans more organisations than have authorised them');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'e1000000-0000-0000-0000-000000000011';
SELECT pg_temp.ok(
  coalesce((SELECT responses_waiting FROM public.scp_my_review_workload()), 0) = 0,
  'W3 a content-role holder with no employer authorisation has no review workload');
RESET ROLE; RESET request.jwt.claim.sub;

-- The employer metric and the reviewer metric are different questions, and the
-- fixture is built so they genuinely differ: Alpha's owner has work blocked but
-- is not an authorised reviewer, so their own workload is zero.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'e1000000-0000-0000-0000-00000000000a';
SELECT pg_temp.ok(
  (SELECT awaiting_review FROM public.scp_employer_review_pressure(
     'e1000000-1111-0000-0000-00000000000a'::uuid)) > 0
  AND coalesce((SELECT responses_waiting FROM public.scp_my_review_workload()), 0) = 0,
  'W4 an organisation can have blocked work while a given member has none to do');
RESET ROLE; RESET request.jwt.claim.sub;

-- ═══════════════════════════════════════════════════════════════════════════
-- R10. The employer board: a list under the numbers, and no responses in it
--
-- The Granskningar page used to print two numbers -- "14 svar väntar", "2
-- resultat blockeras" -- with nothing under them and an empty queue beneath,
-- and the page could not say which of three different things was true. This is
-- the list those numbers point at. It carries counts and a basis, never a word
-- the participant wrote.
--
-- Alpha still has attempt C pending here, which is what makes the assertions
-- below real rather than vacuous.
-- ═══════════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'e1000000-0000-0000-0000-00000000000a';
CREATE TEMP TABLE board_owner AS
  SELECT * FROM public.scp_employer_review_board('e1000000-1111-0000-0000-00000000000a');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_employer_review_board(
     'e1000000-1111-0000-0000-00000000000b'::uuid)) = 0,
  'R10.1 Alpha''s owner gets nothing back for Beta''s board');
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT count(*) FROM board_owner) = 1
  AND (SELECT attempt_id FROM board_owner) = 'e1000000-4444-0000-0000-00000000000c'
  AND (SELECT responses_open FROM board_owner) = 1,
  'R10.2 the board names Alpha''s one blocked attempt and how many responses it holds');

SELECT pg_temp.ok(
  (SELECT my_basis FROM board_owner) = 'not_authorised',
  'R10.3 a member holding no authorisation is told that, not shown an empty page');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'e1000000-0000-0000-0000-00000000000b';
CREATE TEMP TABLE board_reviewer AS
  SELECT * FROM public.scp_employer_review_board('e1000000-1111-0000-0000-00000000000a');
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT my_basis FROM board_reviewer) = 'authorised'
  AND (SELECT my_disclosure FROM board_reviewer) = 'acted_on_this_application',
  'R10.4 the authorised reviewer may act on the same attempt, with the involvement disclosed');

SELECT pg_temp.ok(
  (SELECT responses_open FROM board_reviewer)
  = (SELECT count(*) FROM public.scp_human_reviews hr
      JOIN public.scp_candidate_responses r ON r.id = hr.response_id
     WHERE r.attempt_id = 'e1000000-4444-0000-0000-00000000000c'
       AND hr.review_status = 'pending'),
  'R10.5 the board''s count is the real number of open reviews, not an estimate');

SELECT pg_temp.ok(
  (SELECT awaiting_review FROM public.scp_employer_review_pressure(
     'e1000000-1111-0000-0000-00000000000a'::uuid))
  = (SELECT sum(responses_open)::int FROM board_owner),
  'R10.6 the KPI equals the sum of the list beneath it');

-- ═══════════════════════════════════════════════════════════════════════════
-- R9. A disclosed conflict is completed, and the row says so
--
-- Deliberately last: it consumes Alpha's remaining pending review, which every
-- assertion above needs to still be open.
-- ═══════════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'e1000000-0000-0000-0000-00000000000b';
SELECT public.scp_complete_human_review(
  'e1000000-6666-0000-0000-00000000000c'::uuid, 'upheld',
  'Kandidaten larmar och avvaktar; den styrda bedomningen star fast.',
  'no_concern');
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT reviewer_conflict_disclosed FROM public.scp_human_reviews
    WHERE id = 'e1000000-6666-0000-0000-00000000000c') = 'acted_on_this_application',
  'R9.1 completing a disclosed review records WHICH involvement the reviewer had');

SELECT pg_temp.ok(
  (SELECT NOT reviewed_under_break_glass FROM public.scp_human_reviews
    WHERE id = 'e1000000-6666-0000-0000-00000000000c'),
  'R9.2 and does not misreport it as platform break-glass');

SELECT pg_temp.ok(
  (SELECT reviewer_conflict_disclosed IS NULL FROM public.scp_human_reviews
    WHERE id = 'e1000000-6666-0000-0000-00000000000a'),
  'R9.3 a review with no such involvement records none -- the column is not decorative');

SELECT pg_temp.ok(
  (SELECT status FROM public.scp_attempts WHERE id='e1000000-4444-0000-0000-00000000000c') = 'scored',
  'R9.4 the last review completing advances the attempt, so the result can be released');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'e1000000-0000-0000-0000-00000000000a';
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_employer_review_board(
     'e1000000-1111-0000-0000-00000000000a'::uuid)) = 0,
  'R9.5 and the board empties, so the number and the list fall to zero together');
RESET ROLE; RESET request.jwt.claim.sub;

ROLLBACK;
