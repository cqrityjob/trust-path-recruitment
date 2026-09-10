-- E2 — the employer reads the document the CANDIDATE received.
--
-- 20261105090000 adds one read and one predicate. This suite walks a real
-- released Väktare-family attempt and asserts the four things that make the
-- addition safe, plus the one that makes it useful:
--
--   P0  the fixture, and the contract it is added on top of
--   P1  USEFUL: an issuer owner reads the participant document, and reads
--       EXACTLY what the participant reads -- not a re-rendering of it
--   P2  MINIMAL: no severity, no mean, no spread, no derivation input, no
--       employer-only section reaches it
--   P3  AUTHORITY: an ordinary member, a reviewer seat and an admin are
--       distinguished -- release authority and nothing looser
--   P4  ISOLATION: another tenant, the participant themselves and anon get
--       nothing through the new door
--   P5  UNCHANGED: every pre-existing audience rule still holds exactly
--
-- One transaction, ends in ROLLBACK. Every fixture is synthetic.

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

CREATE OR REPLACE FUNCTION pg_temp.fixture_rubric_levels(_ivid uuid, _fmt text)
RETURNS jsonb LANGUAGE sql AS $fn$
  SELECT CASE WHEN _fmt <> 'constructed_response' THEN NULL ELSE (
    SELECT jsonb_object_agg(d.dimension_key,
             CASE WHEN d.assesses_writing_quality THEN 0 ELSE 4 END)
      FROM public.scp_rubric_dimensions d
      JOIN public.scp_rubric_versions rv ON rv.id = d.rubric_version_id
     WHERE rv.item_version_id = _ivid) END;
$fn$;

-- ═════════════════════════════════════════════════════════════════════════
DO $$ BEGIN RAISE NOTICE 'GROUP P0 — the contract, and the fixture'; END $$;
-- ═════════════════════════════════════════════════════════════════════════

SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('scp_participant_report_for_issuer','scp_report_issuer_admin')
      AND p.prosecdef
      AND array_to_string(p.proconfig, ',') LIKE '%search_path%') = 2,
  'P0.1 both new functions are SECURITY DEFINER with a pinned search_path');

SELECT pg_temp.ok(
  NOT has_function_privilege('anon',
        'public.scp_participant_report_for_issuer(uuid)'::regprocedure, 'EXECUTE')
  AND NOT has_function_privilege('anon',
        'public.scp_report_issuer_admin(uuid)'::regprocedure, 'EXECUTE'),
  'P0.2 anon may execute neither');

-- The load-bearing shape property. Copying a projection is only safe while it
-- stays a copy: if scp_participant_report is later corrected and this one is
-- not, the employer verifies a document the candidate is no longer being
-- shown. Both must keep the template-continuity LEFT JOIN and the '[]'
-- safety-flag literal.
SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('scp_participant_report','scp_participant_report_for_issuer')
      AND p.prosrc LIKE '%LEFT JOIN public.scp_report_versions%'
      AND p.prosrc LIKE '%''[]''::jsonb%'
      AND p.prosrc LIKE '%audience = ''participant''%') = 2,
  'P0.3 the issuer read is still a copy of the participant read: same join, same empty flags, same audience pin');

CREATE TEMP TABLE xp AS
SELECT
  'e2100000-0000-0000-0000-000000000001'::uuid AS employer,
  'e2100000-0000-0000-0000-000000000002'::uuid AS owner_user,
  'e2100000-0000-0000-0000-000000000003'::uuid AS participant,
  'e2100000-0000-0000-0000-000000000004'::uuid AS other_employer,
  'e2100000-0000-0000-0000-000000000005'::uuid AS other_owner,
  'e2100000-0000-0000-0000-000000000006'::uuid AS reviewer_user,
  'e2100000-0000-0000-0000-000000000007'::uuid AS plain_member,
  'e2100000-0000-0000-0000-000000000008'::uuid AS admin_user,
  'e2100000-0000-0000-0000-000000000009'::uuid AS suspended_admin,
  'e2100000-0000-0000-0000-00000000000a'::uuid AS stranger;

INSERT INTO auth.users (id, email) VALUES
  ((SELECT owner_user      FROM xp), 'owner@e2-preview.test'),
  ((SELECT participant     FROM xp), 'participant@e2-preview.test'),
  ((SELECT other_owner     FROM xp), 'other-owner@e2-preview.test'),
  ((SELECT reviewer_user   FROM xp), 'reviewer@e2-preview.test'),
  ((SELECT plain_member    FROM xp), 'member@e2-preview.test'),
  ((SELECT admin_user      FROM xp), 'admin@e2-preview.test'),
  ((SELECT suspended_admin FROM xp), 'suspended@e2-preview.test'),
  ((SELECT stranger        FROM xp), 'stranger@e2-preview.test');

INSERT INTO public.employers (id, name, slug, status)
SELECT employer, 'Preview AB', 'preview-ab-e2', 'active' FROM xp
UNION ALL
SELECT other_employer, 'Annan Preview AB', 'annan-preview-e2', 'active' FROM xp;

INSERT INTO public.employer_memberships (employer_id, user_id, role, status)
SELECT employer, owner_user,      'owner',  'active'   FROM xp
UNION ALL
SELECT employer, admin_user,      'admin',  'active'   FROM xp
UNION ALL
SELECT employer, plain_member,    'member', 'active'   FROM xp
UNION ALL
SELECT employer, reviewer_user,   'member', 'active'   FROM xp
-- An admin whose seat is not active. `status = 'active'` is in the predicate
-- for a reason and this is the row that proves it is doing work.
UNION ALL
SELECT employer, suspended_admin, 'admin',  'suspended' FROM xp
UNION ALL
SELECT other_employer, other_owner, 'owner', 'active'   FROM xp;

INSERT INTO public.scp_content_roles (user_id, role, granted_by)
SELECT reviewer_user, 'reviewer', owner_user FROM xp;

INSERT INTO public.scp_employer_reviewers
  (employer_id, user_id, allowed_use_cases, granted_by)
SELECT employer, reviewer_user, ARRAY['workforce','recruitment']::text[], owner_user FROM xp;

CREATE TEMP TABLE xpv AS
SELECT av.id AS version_id, av.definition_id
  FROM public.scp_assessment_versions av
  JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
 WHERE d.slug = 'sg-operational-baseline'
 ORDER BY av.version_number DESC LIMIT 1;

INSERT INTO public.scp_test_grants
  (employer_id, purpose, definition_id, reason, authorised_by, expires_at)
SELECT employer, 'closed_test', (SELECT definition_id FROM xpv),
       'E2 issuer preview suite', owner_user, now() + interval '30 days' FROM xp;

GRANT SELECT ON xp, xpv TO authenticated, anon;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'e2100000-0000-0000-0000-000000000002';
CREATE TEMP TABLE prun AS
SELECT * FROM public.scp_employer_assign(
  (SELECT employer FROM xp), (SELECT version_id FROM xpv),
  'participant@e2-preview.test', NULL, 'sv', 'workforce', NULL, NULL);
RESET ROLE; RESET request.jwt.claim.sub;
GRANT SELECT ON prun TO authenticated, anon;

CREATE TEMP TABLE pitems AS
SELECT fi.display_order, iv.id AS ivid, iv.item_format,
       (SELECT o.id FROM public.scp_item_options o
         WHERE o.item_version_id = iv.id ORDER BY o.display_order LIMIT 1)      AS first_option,
       (SELECT o.id FROM public.scp_item_options o
         WHERE o.item_version_id = iv.id ORDER BY o.display_order DESC LIMIT 1) AS last_option
  FROM public.scp_form_items fi
  JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
 WHERE fi.form_id = (SELECT a.form_id FROM public.scp_attempts a
                      WHERE a.id = (SELECT attempt_id FROM prun));
GRANT SELECT ON pitems TO authenticated;

-- ── BEFORE RELEASE ─────────────────────────────────────────────────────
-- The read exists and the document does not. This is the state the employer
-- screen has to distinguish from "shared", and the entry point answers it the
-- only honest way: zero rows.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'e2100000-0000-0000-0000-000000000002';
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_participant_report_for_issuer(
     (SELECT attempt_id FROM prun))) = 0,
  'P0.4 before release the issuer read returns nothing — a report that has not been written cannot be previewed');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'e2100000-0000-0000-0000-000000000003';
DO $$
DECLARE _att uuid; _it record;
BEGIN
  SELECT attempt_id INTO _att FROM prun;
  FOR _it IN SELECT * FROM pitems ORDER BY display_order LOOP
    IF _it.item_format = 'constructed_response' THEN
      PERFORM public.scp_save_response(_att, _it.ivid, NULL, NULL, NULL,
        'Jag följer instruktionen, håller avstånd, larmar och dokumenterar.');
    ELSIF _it.item_format = 'sjt_best_worst' THEN
      PERFORM public.scp_save_response(_att, _it.ivid, NULL, _it.first_option, _it.last_option, NULL);
    ELSE
      PERFORM public.scp_save_response(_att, _it.ivid, _it.first_option, NULL, NULL, NULL);
    END IF;
  END LOOP;
  PERFORM public.scp_submit_attempt(_att);
END $$;
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'e2100000-0000-0000-0000-000000000006';
DO $$
DECLARE _att uuid; _rv record;
BEGIN
  SELECT attempt_id INTO _att FROM prun;
  FOR _rv IN
    SELECT hr.id, iv.is_safety_critical, iv.id AS item_version_id, iv.item_format, i.slug
      FROM public.scp_human_reviews hr
      JOIN public.scp_candidate_responses r ON r.id = hr.response_id
      JOIN public.scp_item_versions iv ON iv.id = r.item_version_id
      JOIN public.scp_items i ON i.id = iv.item_id
     WHERE r.attempt_id = _att AND hr.review_status = 'pending'
  LOOP
    -- One genuine HIGH finding, so P2 is asserted against a document that
    -- really does have a severity to leak rather than one that has none.
    PERFORM public.scp_complete_human_review(_rv.id, 'upheld',
      'Inom mandatet, prioriterar säkerhet, dokumenterar åtgärden.',
      CASE WHEN NOT _rv.is_safety_critical THEN NULL
           WHEN _rv.slug = 'sg-b-10' THEN 'high'
           ELSE 'no_concern' END,
      pg_temp.fixture_rubric_levels(_rv.item_version_id, _rv.item_format));
  END LOOP;
END $$;
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'e2100000-0000-0000-0000-000000000002';
DO $$ DECLARE _att uuid; BEGIN
  SELECT attempt_id INTO _att FROM prun;
  PERFORM public.scp_release_attempt_report(_att);
END $$;
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_report_snapshots
    WHERE attempt_id = (SELECT attempt_id FROM prun)) = 2,
  'P0.5 the fixture released one snapshot per audience');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_report_snapshots s
    WHERE s.attempt_id = (SELECT attempt_id FROM prun)
      AND s.audience = 'employer'
      AND s.safety_flags::text LIKE '%high%') = 1,
  'P0.6 the employer document really does carry a HIGH severity — P2 has something to leak');

-- ═════════════════════════════════════════════════════════════════════════
DO $$ BEGIN RAISE NOTICE 'GROUP P1 — the issuer owner reads what the candidate reads'; END $$;
-- ═════════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'e2100000-0000-0000-0000-000000000003';
CREATE TEMP TABLE p_as_candidate AS
SELECT to_jsonb(p) AS d FROM public.scp_participant_report((SELECT attempt_id FROM prun)) p;
RESET ROLE; RESET request.jwt.claim.sub;
GRANT SELECT ON p_as_candidate TO authenticated;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'e2100000-0000-0000-0000-000000000002';
CREATE TEMP TABLE p_as_owner AS
SELECT to_jsonb(p) AS d FROM public.scp_participant_report_for_issuer((SELECT attempt_id FROM prun)) p;

SELECT pg_temp.ok((SELECT count(*) FROM p_as_owner) = 1
  AND (SELECT d ->> 'audience' FROM p_as_owner) = 'participant',
  'P1.1 the issuer owner gets exactly one row, and it is the participant document');

-- THE ASSERTION THIS WHOLE UNIT RESTS ON. Not "similar", not "contains the
-- same sections": identical. An employer who previews a re-rendering has
-- previewed something else.
SELECT pg_temp.ok(
  (SELECT d FROM p_as_owner) = (SELECT d FROM p_as_candidate),
  'P1.2 it is byte-for-byte the document the candidate reads, every column');

SELECT pg_temp.ok(
  (SELECT (d ->> 'released_at') IS NOT NULL AND (d ->> 'released_at') <> '' FROM p_as_owner),
  'P1.3 it carries the release moment, so the screen can say when rather than that');
RESET ROLE; RESET request.jwt.claim.sub;

-- An admin, not only the owner: the same authority scp_release_attempt_report
-- accepts, and the screen offers the preview beside the release control.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'e2100000-0000-0000-0000-000000000008';
SELECT pg_temp.ok(
  (SELECT to_jsonb(p) FROM public.scp_participant_report_for_issuer(
     (SELECT attempt_id FROM prun)) p) = (SELECT d FROM p_as_candidate),
  'P1.4 an admin reads the same document — release authority, not ownership');
RESET ROLE; RESET request.jwt.claim.sub;

-- ═════════════════════════════════════════════════════════════════════════
DO $$ BEGIN RAISE NOTICE 'GROUP P2 — and nothing more than the candidate reads'; END $$;
-- ═════════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'e2100000-0000-0000-0000-000000000002';

SELECT pg_temp.ok(
  (SELECT d -> 'safety_flags' = '[]'::jsonb FROM p_as_owner),
  'P2.1 no safety flag reaches it, although the employer document beside it carries a HIGH one');
SELECT pg_temp.ok(
  (SELECT NOT (d ? 'derivation_input') FROM p_as_owner),
  'P2.2 no derivation input');
SELECT pg_temp.ok(
  (SELECT d::text NOT LIKE '%"mean"%' AND d::text NOT LIKE '%"spread"%' FROM p_as_owner),
  'P2.3 no mean and no spread — scp_audience_brief ran, exactly as for the candidate');
SELECT pg_temp.ok(
  (SELECT NOT (d -> 'brief' ? 'observed') AND NOT (d -> 'brief' ? 'interview_guide') FROM p_as_owner),
  'P2.4 no observed ordering and no interview guide — the employer sections stay in the employer document');
SELECT pg_temp.ok(
  (SELECT d ->> 'payload' NOT LIKE '%severity%'
      AND d ->> 'payload' NOT LIKE '%reviewer_rationale%'
      AND d ->> 'payload' NOT LIKE '%score_value%'
      AND d ->> 'payload' NOT LIKE '%is_preferred%'
      AND d::text NOT LIKE '%maturity_level%'
     FROM p_as_owner),
  'P2.5 no severity, no reviewer rationale, no answer key, no maturity level');

-- The product-level invariant, asserted on the document itself rather than on
-- the copy that describes it: a candidate result is not a score.
SELECT pg_temp.ok(
  (SELECT d::text NOT LIKE '%total_score%' AND d::text NOT LIKE '%"rank"%'
      AND d::text NOT LIKE '%percentile%' AND d::text NOT LIKE '%pass_fail%'
      AND d::text NOT LIKE '%"passed"%' AND d::text NOT LIKE '%recommend%'
     FROM p_as_owner),
  'P2.6 no total, no rank, no percentile, no pass/fail, no recommendation');
RESET ROLE; RESET request.jwt.claim.sub;

-- ═════════════════════════════════════════════════════════════════════════
DO $$ BEGIN RAISE NOTICE 'GROUP P3 — release authority, and nothing looser'; END $$;
-- ═════════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'e2100000-0000-0000-0000-000000000007';
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_participant_report_for_issuer(
     (SELECT attempt_id FROM prun))) = 0,
  'P3.1 an ordinary active member gets nothing — they cannot share the result, so they do not read what sharing would produce');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_employer_report((SELECT attempt_id FROM prun))) = 1,
  'P3.2 and the member''s existing employer read is untouched');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'e2100000-0000-0000-0000-000000000006';
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_participant_report_for_issuer(
     (SELECT attempt_id FROM prun))) = 0,
  'P3.3 a reviewer seat is not release authority: a reviewer gets nothing');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'e2100000-0000-0000-0000-000000000009';
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_participant_report_for_issuer(
     (SELECT attempt_id FROM prun))) = 0,
  'P3.4 a SUSPENDED admin gets nothing — the membership status is in the predicate and it is doing work');
RESET ROLE; RESET request.jwt.claim.sub;

-- ═════════════════════════════════════════════════════════════════════════
DO $$ BEGIN RAISE NOTICE 'GROUP P4 — isolation across every other principal'; END $$;
-- ═════════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'e2100000-0000-0000-0000-000000000005';
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_participant_report_for_issuer(
     (SELECT attempt_id FROM prun))) = 0,
  'P4.1 the owner of ANOTHER employer gets nothing, although they are an owner somewhere');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'e2100000-0000-0000-0000-00000000000a';
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_participant_report_for_issuer(
     (SELECT attempt_id FROM prun))) = 0,
  'P4.2 a signed-in stranger with no membership anywhere gets nothing');
RESET ROLE; RESET request.jwt.claim.sub;

-- The participant is not an issuer admin, so the NEW door gives them nothing.
-- Their own door is untouched, which P5 asserts.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'e2100000-0000-0000-0000-000000000003';
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_participant_report_for_issuer(
     (SELECT attempt_id FROM prun))) = 0,
  'P4.3 the participant themselves gets nothing through the ISSUER door — it is not a second route to their own report');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE anon;
SELECT pg_temp.must_fail(
  'SELECT count(*) FROM public.scp_participant_report_for_issuer('''
    || (SELECT attempt_id FROM prun) || '''::uuid)',
  'permission denied', 'P4.4 anon cannot execute the read at all');
SELECT pg_temp.must_fail(
  'SELECT public.scp_report_issuer_admin('''
    || (SELECT employer FROM xp) || '''::uuid)',
  'permission denied', 'P4.5 anon cannot execute the predicate either');
RESET ROLE;

-- ═════════════════════════════════════════════════════════════════════════
DO $$ BEGIN RAISE NOTICE 'GROUP P5 — every pre-existing rule still holds'; END $$;
-- ═════════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'e2100000-0000-0000-0000-000000000003';
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_participant_report((SELECT attempt_id FROM prun))) = 1,
  'P5.1 the participant still reads their own document through their own entry point');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_employer_report((SELECT attempt_id FROM prun))) = 0,
  'P5.2 and still cannot read the employer document');
SELECT pg_temp.must_fail('SELECT count(*) FROM public.scp_report_snapshots',
  'permission denied', 'P5.3 the snapshot table is still refused outright');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'e2100000-0000-0000-0000-000000000005';
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_employer_report((SELECT attempt_id FROM prun))) = 0,
  'P5.4 cross-tenant employer reads are still nothing');
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_policies WHERE tablename = 'scp_report_snapshots'
     AND qual LIKE '%scp_report_snapshot_readable%') = 2,
  'P5.5 both row policies still evaluate the canonical audience predicate — this migration re-pointed neither');

SELECT pg_temp.ok(
  (SELECT prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'scp_report_snapshot_readable')
    NOT LIKE '%owner%',
  'P5.6 scp_report_snapshot_readable was not widened to admit an issuer admin — the new authority lives in its own predicate');

ROLLBACK;
