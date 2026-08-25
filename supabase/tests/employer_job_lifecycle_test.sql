-- Ending a recruitment: what may be deleted, what must only be closed, and
-- what a candidate is told about it.
--
-- Everything that can run as `authenticated` does, with a JWT subject set,
-- because every question here is "may THIS person do THIS to THAT row" and the
-- owner role can do anything.
--
-- The load-bearing assertions are the three refusals in section 2.
-- job_applications.job_id cascades from jobs, so a delete path that is wrong
-- by one condition erases a candidate's own record of having applied, with no
-- error and nothing in the audit trail but the disappearance.

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

-- ── Fixtures ───────────────────────────────────────────────────────────────
--
-- Two organisations, so "another organisation's advertisement" is a real row
-- and not a hypothetical, and one candidate who actually applied.

INSERT INTO auth.users (id, email) VALUES
  ('b1000000-0000-0000-0000-000000000001','owner-a@lifecycle.invalid'),
  ('b1000000-0000-0000-0000-000000000002','owner-b@lifecycle.invalid'),
  ('b1000000-0000-0000-0000-000000000003','kandidat@lifecycle.invalid');

-- A profile row is created by the auth.users trigger, so this states the two
-- fields the notification payload reads rather than creating the row.
INSERT INTO public.profiles (id, display_name, locale)
VALUES ('b1000000-0000-0000-0000-000000000003','Kandidat Karlsson','sv')
ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name,
                               locale = EXCLUDED.locale;

INSERT INTO public.employers (id, name, slug, status) VALUES
  ('b1000000-1111-0000-0000-000000000001','Livscykel A AB','livscykel-a','active'),
  ('b1000000-1111-0000-0000-000000000002','Livscykel B AB','livscykel-b','active');

INSERT INTO public.employer_memberships (employer_id, user_id, role, status, accepted_at) VALUES
  ('b1000000-1111-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001','owner','active',now()),
  ('b1000000-1111-0000-0000-000000000002','b1000000-0000-0000-0000-000000000002','owner','active',now());

INSERT INTO public.jobs
  (id, employer_id, slug, short_id, title_sv, title_en, status, application_method) VALUES
  -- J1  a clean draft that never went anywhere
  ('b1000000-2222-0000-0000-000000000001','b1000000-1111-0000-0000-000000000001',
   'lc-rent-utkast','lcaaa00001','Rent utkast','Clean draft','draft','internal'),
  -- J2  live, and about to receive an application
  ('b1000000-2222-0000-0000-000000000002','b1000000-1111-0000-0000-000000000001',
   'lc-publicerad','lcaaa00002','Publicerad','Published','draft','internal'),
  -- J3  published once, closed, then restored to draft. Status says draft;
  --     published_at says otherwise, and published_at is the one telling the
  --     truth about whether anybody could ever have applied.
  ('b1000000-2222-0000-0000-000000000003','b1000000-1111-0000-0000-000000000001',
   'lc-aterstalld','lcaaa00003','Återställd','Restored','draft','internal'),
  -- J4  belongs to the other organisation
  ('b1000000-2222-0000-0000-000000000004','b1000000-1111-0000-0000-000000000002',
   'lc-annan-org','lcbbb00001','Annan org','Other org','draft','internal');

-- Publishing runs a moderation pipeline that owns published_at, and that
-- pipeline is not what this suite tests. Disabled for exactly these two
-- statements, inside a transaction that rolls back. No RLS policy and no
-- governance trigger is touched -- those are the rules under test.
ALTER TABLE public.jobs DISABLE TRIGGER USER;
UPDATE public.jobs
   SET status = 'published', published_at = now(), expires_at = now() + interval '60 days'
 WHERE id = 'b1000000-2222-0000-0000-000000000002';
UPDATE public.jobs
   SET published_at = now() - interval '30 days', expires_at = now() + interval '30 days'
 WHERE id = 'b1000000-2222-0000-0000-000000000003';
ALTER TABLE public.jobs ENABLE TRIGGER USER;

INSERT INTO public.job_applications
  (id, job_id, employer_id, applicant_user_id, status, consent_given_at) VALUES
  ('b1000000-3333-0000-0000-000000000001','b1000000-2222-0000-0000-000000000002',
   'b1000000-1111-0000-0000-000000000001','b1000000-0000-0000-0000-000000000003',
   'submitted', now());

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. A draft that never went live can be discarded
-- ═══════════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'b1000000-0000-0000-0000-000000000001';

SELECT public.jobs_delete_draft(
  'b1000000-1111-0000-0000-000000000001','b1000000-2222-0000-0000-000000000001');

RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM public.jobs WHERE id = 'b1000000-2222-0000-0000-000000000001'),
  'L1 a never-published draft with nothing attached is deleted');

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Everything else is refused, and nothing of anyone else's goes with it
-- ═══════════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'b1000000-0000-0000-0000-000000000001';

-- A live advertisement. Status alone would have caught this one.
SELECT pg_temp.must_fail(
  $$SELECT public.jobs_delete_draft(
      'b1000000-1111-0000-0000-000000000001','b1000000-2222-0000-0000-000000000002')$$,
  'JOB_NOT_DELETABLE',
  'L2 a published advertisement cannot be deleted');

-- THE one that status alone would have got wrong. restoreEmployerJob puts a
-- closed advertisement back at status='draft' while published_at stays set,
-- so "it is a draft" is not the same statement as "nobody could ever have
-- applied to it".
SELECT pg_temp.must_fail(
  $$SELECT public.jobs_delete_draft(
      'b1000000-1111-0000-0000-000000000001','b1000000-2222-0000-0000-000000000003')$$,
  'JOB_NOT_DELETABLE',
  'L3 a draft that WAS published once cannot be deleted');

-- Another organisation's advertisement is not found rather than forbidden:
-- the id is loaded with employer_id in the WHERE clause, so a row from
-- elsewhere never enters the function at all.
SELECT pg_temp.must_fail(
  $$SELECT public.jobs_delete_draft(
      'b1000000-1111-0000-0000-000000000001','b1000000-2222-0000-0000-000000000004')$$,
  'JOB_NOT_FOUND',
  'L4 another organisation''s advertisement is not reachable');

RESET ROLE; RESET request.jwt.claim.sub;

-- Someone with no membership at all.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'b1000000-0000-0000-0000-000000000003';
SELECT pg_temp.must_fail(
  $$SELECT public.jobs_delete_draft(
      'b1000000-1111-0000-0000-000000000001','b1000000-2222-0000-0000-000000000003')$$,
  'JOB_NOT_AUTHORISED',
  'L5 a non-member cannot delete anything');
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.jobs
    WHERE employer_id = 'b1000000-1111-0000-0000-000000000001') = 2,
  'L6 every refused advertisement is still there');

-- ── THE CASCADE ────────────────────────────────────────────────────────────
--
-- Force the dangerous shape directly: an advertisement sitting at
-- status='draft' with published_at NULL and an application attached. It should
-- not be reachable through the product, and the status test would stop it
-- first -- which is exactly why the applications test has to be proven
-- separately rather than assumed to be unreachable.

ALTER TABLE public.jobs DISABLE TRIGGER USER;
UPDATE public.jobs SET status = 'draft', published_at = NULL, expires_at = NULL
 WHERE id = 'b1000000-2222-0000-0000-000000000002';
ALTER TABLE public.jobs ENABLE TRIGGER USER;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'b1000000-0000-0000-0000-000000000001';
SELECT pg_temp.must_fail(
  $$SELECT public.jobs_delete_draft(
      'b1000000-1111-0000-0000-000000000001','b1000000-2222-0000-0000-000000000002')$$,
  'JOB_HAS_APPLICATIONS',
  'L7 a draft carrying an application is refused by name');
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  EXISTS (SELECT 1 FROM public.job_applications
           WHERE id = 'b1000000-3333-0000-0000-000000000001'),
  'L8 and the candidate''s application is still there');

-- ── REACH ──────────────────────────────────────────────────────────────────

SELECT pg_temp.ok(
  NOT has_function_privilege('anon',
    'public.jobs_delete_draft(uuid,uuid)', 'EXECUTE'),
  'L9 anon cannot execute the delete function');

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. A previously published advertisement can still be CLOSED
-- ═══════════════════════════════════════════════════════════════════════════
--
-- The other half of L3. If the database refuses to delete it and also refuses
-- to close it, the one advertisement with a recruitment history behind it is
-- the one with no way to end it.

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'b1000000-0000-0000-0000-000000000001';
UPDATE public.jobs SET status = 'archived'
 WHERE id = 'b1000000-2222-0000-0000-000000000003';
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT status FROM public.jobs
    WHERE id = 'b1000000-2222-0000-0000-000000000003') = 'archived',
  'L10 a previously published draft can be closed');

SELECT pg_temp.ok(
  (SELECT archived_at FROM public.jobs
    WHERE id = 'b1000000-2222-0000-0000-000000000003') IS NOT NULL,
  'L11 and archived_at was stamped by the trigger');

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. The audit trail can record the one destructive action
-- ═══════════════════════════════════════════════════════════════════════════
--
-- writeAudit() swallows every failure by design, so a rejected audit row is
-- silent. That is survivable for 'updated'; it is not survivable for the event
-- whose whole purpose is to be the last remaining trace of the row.

INSERT INTO public.job_audit_events (job_id, job_slug_snapshot, actor_id, action)
VALUES ('b1000000-2222-0000-0000-000000000003','lc-aterstalld',
        'b1000000-0000-0000-0000-000000000001','deleted');
SELECT pg_temp.ok(true, 'L12 an audit row with action=deleted is accepted');

INSERT INTO public.job_audit_events (job_id, job_slug_snapshot, actor_id, action)
VALUES ('b1000000-2222-0000-0000-000000000003','lc-aterstalld',
        'b1000000-0000-0000-0000-000000000001','closed');
SELECT pg_temp.ok(true, 'L13 and one with action=closed, which the code has always written');

SELECT pg_temp.must_fail(
  $$INSERT INTO public.job_audit_events (job_id, job_slug_snapshot, actor_id, action)
    VALUES ('b1000000-2222-0000-0000-000000000003','lc-aterstalld',
            'b1000000-0000-0000-0000-000000000001','obliterated')$$,
  'job_audit_events_action_check',
  'L14 the vocabulary is still closed to anything else');

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. "Annat" is a different answer from "Ej angivet"
-- ═══════════════════════════════════════════════════════════════════════════

SELECT pg_temp.ok(
  (SELECT family_other FROM public.jobs
    WHERE id = 'b1000000-2222-0000-0000-000000000002') = false,
  'O1 an existing advertisement reads as "not Annat", which is what it is');

SELECT pg_temp.must_fail(
  $$UPDATE public.jobs SET family_other = true, family_id = 'protective_operations'
     WHERE id = 'b1000000-2222-0000-0000-000000000002'$$,
  'jobs_family_other_excludes_id',
  'O2 Annat and a canonical family id are contradictory answers');

SELECT pg_temp.must_fail(
  $$UPDATE public.jobs SET family_other_text = 'Säkerhetsteknik för sjukvård'
     WHERE id = 'b1000000-2222-0000-0000-000000000002'$$,
  'jobs_family_other_text_needs_choice',
  'O3 free text cannot exist without the choice it belongs to');

SELECT pg_temp.must_fail(
  $$UPDATE public.jobs
       SET profession_other = true, profession_other_text = repeat('x', 121)
     WHERE id = 'b1000000-2222-0000-0000-000000000002'$$,
  'jobs_profession_other_text_length',
  'O4 the employer''s own words are bounded like every other free-text field');

UPDATE public.jobs
   SET family_other = true, family_id = NULL,
       family_other_text = 'Säkerhetsteknik för sjukvård'
 WHERE id = 'b1000000-2222-0000-0000-000000000002';

SELECT pg_temp.ok(
  (SELECT family_id FROM public.jobs
    WHERE id = 'b1000000-2222-0000-0000-000000000002') IS NULL
  AND (SELECT family_other FROM public.jobs
        WHERE id = 'b1000000-2222-0000-0000-000000000002') = true,
  'O5 an Annat advertisement leaves the canonical column NULL, so no filter claims it');

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. What the candidate is told, and what they are not
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO public.job_application_status_events
  (id, application_id, job_id, employer_id, actor_user_id, actor_role,
   previous_status, new_status) VALUES
  -- Internal: somebody opened the application.
  ('b1000000-4444-0000-0000-000000000001','b1000000-3333-0000-0000-000000000001',
   'b1000000-2222-0000-0000-000000000002','b1000000-1111-0000-0000-000000000001',
   'b1000000-0000-0000-0000-000000000001','employer','submitted','reviewing'),
  -- Candidate-facing.
  ('b1000000-4444-0000-0000-000000000002','b1000000-3333-0000-0000-000000000001',
   'b1000000-2222-0000-0000-000000000002','b1000000-1111-0000-0000-000000000001',
   'b1000000-0000-0000-0000-000000000001','employer','reviewing','rejected');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'b1000000-0000-0000-0000-000000000001';

SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM public.jase_notification_payload(
    'b1000000-4444-0000-0000-000000000001')),
  'N1 an internal "under review" transition yields no message, even when asked for one');

SELECT pg_temp.ok(
  (SELECT recipient_email FROM public.jase_notification_payload(
    'b1000000-4444-0000-0000-000000000002')) = 'kandidat@lifecycle.invalid',
  'N2 a rejection yields the candidate''s address, to the server');

SELECT pg_temp.ok(
  (SELECT language FROM public.jase_notification_payload(
    'b1000000-4444-0000-0000-000000000002')) = 'sv',
  'N3 in the candidate''s own language, not the employer''s');

SELECT public.jase_record_notification('b1000000-4444-0000-0000-000000000002', true, NULL);
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT notified_at FROM public.job_application_status_events
    WHERE id = 'b1000000-4444-0000-0000-000000000002') IS NOT NULL,
  'N4 a delivered message is recorded on the transition it belongs to');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'b1000000-0000-0000-0000-000000000001';

SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM public.jase_notification_payload(
    'b1000000-4444-0000-0000-000000000002')),
  'N5 an already-notified transition yields nothing, so a retry cannot send twice');

-- A retry that raced a success must not overwrite the success.
SELECT public.jase_record_notification(
  'b1000000-4444-0000-0000-000000000002', false, 'HTTP 422');
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT notified_at FROM public.job_application_status_events
    WHERE id = 'b1000000-4444-0000-0000-000000000002') IS NOT NULL
  AND (SELECT notify_error FROM public.job_application_status_events
        WHERE id = 'b1000000-4444-0000-0000-000000000002') IS NULL,
  'N6 a delivered event stays delivered');

-- Tenant isolation: the other organisation's owner asks about an event that is
-- not theirs. No row, and no address.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'b1000000-0000-0000-0000-000000000002';
SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM public.jase_notification_payload(
    'b1000000-4444-0000-0000-000000000001')),
  'N7 another organisation gets no payload and no address');
SELECT pg_temp.must_fail(
  $$SELECT public.jase_record_notification(
      'b1000000-4444-0000-0000-000000000001', true, NULL)$$,
  'JASE_NOT_AUTHORISED',
  'N8 and cannot record a delivery on it either');
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.must_fail(
  $$UPDATE public.job_application_status_events
       SET notify_error = 'HTTP 500'
     WHERE id = 'b1000000-4444-0000-0000-000000000002'$$,
  'jase_notified_xor_error',
  'N9 sent and failed cannot both be recorded at once');

SELECT pg_temp.ok(
  NOT has_function_privilege('anon', 'public.jase_notification_payload(uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon',
    'public.jase_record_notification(uuid,boolean,text)', 'EXECUTE'),
  'N10 anon can execute neither notification function');

ROLLBACK;
