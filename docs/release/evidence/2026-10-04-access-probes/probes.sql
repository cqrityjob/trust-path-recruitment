-- Access probes for production-test steps 11 and 15, run against owner production
-- (project wrygicdfxwjnrugduxnt) on 2026-10-04 ~06:00-06:12 UTC through the Supabase
-- management connector. Every block ran inside BEGIN ... ROLLBACK. Nothing was
-- committed. Output is booleans and counts only; no identifier, address or report
-- content was printed. The test organisation id and the owner's user id are replaced
-- by <TEST_ORG_ID> and <OWNER_UID> here.
--
-- Why a rollback is safe on this project: no pg_net, http or pg_cron extension is
-- installed; none of the triggers on auth.users, employer_memberships,
-- employer_access_requests or profiles calls anything outside the database.
--
-- Pre-check: no suspended or removed membership exists in production (9 active:
-- 5 owner, 1 admin, 3 member), so step 15 needs a synthetic suspended person.

-- ===== PROBE 1 (step 11): what each REAL active member's access looks like =====
-- principals = every active membership; per principal, as role authenticated with that
-- user's id as the JWT subject: employer_report_access(org), employer_reports_readable(org)
-- and how many rows of three policy-gated tables the principal can see in its own org
-- (compared with the org total counted as the owner of the tables).
BEGIN;
CREATE TEMP TABLE pr AS
  SELECT row_number() OVER (ORDER BY em.role DESC, em.created_at, em.user_id) AS n, em.user_id, em.employer_id, em.role,
         EXISTS (SELECT 1 FROM public.scp_employer_reviewers rv WHERE rv.employer_id = em.employer_id
                   AND rv.user_id = em.user_id AND rv.revoked_at IS NULL) AS live_reviewer_grant,
         (SELECT count(*) FROM public.scp_interview_cases c WHERE c.employer_id = em.employer_id) AS org_cases,
         (SELECT count(*) FROM public.scp_training_assignments t WHERE t.employer_id = em.employer_id) AS org_training,
         (SELECT count(*) FROM public.scp_interview_notes x WHERE x.employer_id = em.employer_id) AS org_notes
    FROM public.employer_memberships em WHERE em.status = 'active';
CREATE TEMP TABLE res(n bigint, role text, live_reviewer_grant boolean, is_member boolean, owner_or_admin boolean,
  use_cases text, reports_readable boolean, org_cases bigint, vis_cases bigint, org_training bigint, vis_training bigint,
  org_notes bigint, vis_notes bigint);
GRANT ALL ON res TO authenticated;
GRANT SELECT ON pr TO authenticated;
DO $$
DECLARE p record; a record; rr boolean; c1 bigint; c2 bigint; c3 bigint;
BEGIN
  FOR p IN SELECT * FROM pr ORDER BY n LOOP
    PERFORM set_config('request.jwt.claim.sub', p.user_id::text, true);
    SET LOCAL ROLE authenticated;
    SELECT * INTO a FROM public.employer_report_access(p.employer_id);
    SELECT public.employer_reports_readable(p.employer_id) INTO rr;
    SELECT count(*) INTO c1 FROM public.scp_interview_cases x WHERE x.employer_id = p.employer_id;
    SELECT count(*) INTO c2 FROM public.scp_training_assignments x WHERE x.employer_id = p.employer_id;
    SELECT count(*) INTO c3 FROM public.scp_interview_notes x WHERE x.employer_id = p.employer_id;
    INSERT INTO res VALUES (p.n, p.role, p.live_reviewer_grant, a.is_member, a.owner_or_admin,
      array_to_string(a.readable_use_cases, ','), rr, p.org_cases, c1, p.org_training, c2, p.org_notes, c3);
    RESET ROLE;
  END LOOP;
END $$;
SELECT * FROM res ORDER BY n;
ROLLBACK;

-- ===== PROBE 2 (step 11): why an owner can read fewer cases than the organisation holds =====
-- per membership x case in its own organisation: is the person the case's subject, its
-- creator, may it read it (scp_iv_can_read_case) and does the row show through RLS.
BEGIN;
CREATE TEMP TABLE pc AS SELECT row_number() OVER (ORDER BY c.employer_id, c.created_at) AS case_n, c.id AS case_id,
  c.employer_id, c.candidate_user_id, c.created_by FROM public.scp_interview_cases c;
CREATE TEMP TABLE pm AS SELECT em.user_id, em.employer_id, em.role FROM public.employer_memberships em WHERE em.status = 'active';
CREATE TEMP TABLE res(role text, is_subject boolean, is_creator boolean, can_read_fn boolean, row_visible boolean, n bigint);
GRANT ALL ON res TO authenticated; GRANT SELECT ON pc TO authenticated; GRANT SELECT ON pm TO authenticated;
DO $$
DECLARE m record; k record; cr boolean; vis boolean;
BEGIN
  FOR m IN SELECT * FROM pm LOOP
    FOR k IN SELECT * FROM pc WHERE employer_id = m.employer_id LOOP
      PERFORM set_config('request.jwt.claim.sub', m.user_id::text, true);
      SET LOCAL ROLE authenticated;
      SELECT public.scp_iv_can_read_case(k.case_id) INTO cr;
      SELECT EXISTS (SELECT 1 FROM public.scp_interview_cases x WHERE x.id = k.case_id) INTO vis;
      INSERT INTO res VALUES (m.role, k.candidate_user_id = m.user_id, k.created_by = m.user_id, cr, vis, 1);
      RESET ROLE;
    END LOOP;
  END LOOP;
END $$;
SELECT role, is_subject, is_creator, can_read_fn, row_visible, count(*) AS cases FROM res GROUP BY 1,2,3,4,5 ORDER BY 1,2,3,4,5;
ROLLBACK;

-- ===== PROBE 3 (step 15): a suspended or removed person, a pending request, an approval =====
-- Synthetic users (e5150000-... ids, @synthetic.invalid) exist only inside the transaction.
BEGIN;
CREATE TEMP TABLE res(n int, step text, result text);
GRANT ALL ON res TO authenticated;
DO $$
DECLARE E uuid := '<TEST_ORG_ID>'; O uuid := '<OWNER_UID>';
  u1 uuid := 'e5150000-0000-4000-8000-000000000001'; u2 uuid := 'e5150000-0000-4000-8000-000000000002';
  u3 uuid := 'e5150000-0000-4000-8000-000000000003'; u4 uuid := 'e5150000-0000-4000-8000-000000000004';
  req uuid; a record; msg text; st text; rr boolean; revoked boolean; nreq int;
BEGIN
  INSERT INTO auth.users(id, email) VALUES (u1,'rb1@synthetic.invalid'),(u2,'rb2@synthetic.invalid'),(u3,'rb3@synthetic.invalid'),(u4,'rb4@synthetic.invalid');
  -- A: a suspended member asks again
  INSERT INTO public.employer_memberships(employer_id,user_id,role,status) VALUES (E,u1,'member','suspended');
  BEGIN
    PERFORM set_config('request.jwt.claim.sub', u1::text, true); SET LOCAL ROLE authenticated;
    INSERT INTO public.employer_access_requests(employer_id, requester_user_id, status) VALUES (E,u1,'pending');
    RESET ROLE; INSERT INTO res VALUES (1,'A suspended member requests access','NOT BLOCKED (unexpected)');
  EXCEPTION WHEN OTHERS THEN RESET ROLE; GET STACKED DIAGNOSTICS msg = MESSAGE_TEXT, st = RETURNED_SQLSTATE;
    INSERT INTO res VALUES (1,'A suspended member requests access', left(msg,42)||' / '||st);
  END;
  SELECT count(*) INTO nreq FROM public.employer_access_requests WHERE requester_user_id = u1;
  INSERT INTO res VALUES (2,'A no request row was created', nreq::text);
  -- B: a removed member asks again
  INSERT INTO public.employer_memberships(employer_id,user_id,role,status) VALUES (E,u4,'member','removed');
  BEGIN
    PERFORM set_config('request.jwt.claim.sub', u4::text, true); SET LOCAL ROLE authenticated;
    INSERT INTO public.employer_access_requests(employer_id, requester_user_id, status) VALUES (E,u4,'pending');
    RESET ROLE; INSERT INTO res VALUES (3,'B removed member requests access','NOT BLOCKED (unexpected)');
  EXCEPTION WHEN OTHERS THEN RESET ROLE; GET STACKED DIAGNOSTICS msg = MESSAGE_TEXT, st = RETURNED_SQLSTATE;
    INSERT INTO res VALUES (3,'B removed member requests access', left(msg,42)||' / '||st);
  END;
  -- C: a pending request exists, the person is suspended, an owner tries to approve
  PERFORM set_config('request.jwt.claim.sub', u2::text, true); SET LOCAL ROLE authenticated;
  INSERT INTO public.employer_access_requests(employer_id, requester_user_id, status) VALUES (E,u2,'pending') RETURNING id INTO req;
  RESET ROLE;
  INSERT INTO res VALUES (4,'C pending request created before suspension','ok');
  INSERT INTO public.employer_memberships(employer_id,user_id,role,status) VALUES (E,u2,'member','suspended');
  BEGIN
    PERFORM set_config('request.jwt.claim.sub', O::text, true); SET LOCAL ROLE authenticated;
    PERFORM public.approve_access_request(req, 'approved', 'member');
    RESET ROLE; INSERT INTO res VALUES (5,'C owner approves request of a suspended person','NOT REFUSED (unexpected)');
  EXCEPTION WHEN OTHERS THEN RESET ROLE; GET STACKED DIAGNOSTICS msg = MESSAGE_TEXT, st = RETURNED_SQLSTATE;
    INSERT INTO res VALUES (5,'C owner approves request of a suspended person', left(msg,46)||' / '||st);
  END;
  SELECT m.status INTO st FROM public.employer_memberships m WHERE m.employer_id = E AND m.user_id = u2;
  INSERT INTO res VALUES (6,'C membership after the attempt', st);
  -- D: a reviewer grant ends with the suspension
  INSERT INTO public.employer_memberships(employer_id,user_id,role,status) VALUES (E,u3,'member','active');
  INSERT INTO public.scp_employer_reviewers(employer_id,user_id,allowed_use_cases,granted_by) VALUES (E,u3,array['recruitment'],O);
  PERFORM set_config('request.jwt.claim.sub', u3::text, true); SET LOCAL ROLE authenticated;
  SELECT * INTO a FROM public.employer_report_access(E); RESET ROLE;
  INSERT INTO res VALUES (7,'D reviewer before suspension: member / use_cases', a.is_member::text||' / '||coalesce(array_to_string(a.readable_use_cases,','),''));
  UPDATE public.employer_memberships SET status = 'suspended' WHERE employer_id = E AND user_id = u3;
  SELECT (r.revoked_at IS NOT NULL) INTO revoked FROM public.scp_employer_reviewers r WHERE r.employer_id = E AND r.user_id = u3;
  INSERT INTO res VALUES (8,'D grant revoked by the suspension', revoked::text);
  PERFORM set_config('request.jwt.claim.sub', u3::text, true); SET LOCAL ROLE authenticated;
  SELECT * INTO a FROM public.employer_report_access(E); SELECT public.employer_reports_readable(E) INTO rr; RESET ROLE;
  INSERT INTO res VALUES (9,'D suspended person: member / owner_admin / use_cases / readable',
    a.is_member::text||' / '||a.owner_or_admin::text||' / '||coalesce(array_to_string(a.readable_use_cases,''),'')||' / '||rr::text);
END $$;
SELECT n, step, result FROM res ORDER BY n;
ROLLBACK;

-- ===== PROBE 4 (contract 20270207090000): the scoped flag path for REAL non-admin readers =====
-- For every active ordinary member: is the person a platform administrator, does the person hold a live reviewer grant, and for
-- every case in the own organisation the person may read: scp_iv_case_capabilities (the two flags) and how many rows of
-- scp_interview_ai_config the person can read directly (the contract makes that 0 for a non-admin).
BEGIN;
SET LOCAL statement_timeout = '30s';
CREATE TEMP TABLE res(n int, probe text, result text);
GRANT ALL ON res TO authenticated;
CREATE TEMP TABLE pm AS
  SELECT row_number() OVER (ORDER BY em.created_at, em.user_id) AS k, em.user_id, em.employer_id, em.role,
         public.is_platform_admin(em.user_id) AS is_pa,
         EXISTS (SELECT 1 FROM public.scp_employer_reviewers rv WHERE rv.employer_id = em.employer_id
                   AND rv.user_id = em.user_id AND rv.revoked_at IS NULL) AS grant_live
    FROM public.employer_memberships em WHERE em.status = 'active' AND em.role = 'member';
CREATE TEMP TABLE pc AS SELECT c.id AS case_id, c.employer_id, c.created_by FROM public.scp_interview_cases c;
GRANT SELECT ON pm TO authenticated; GRANT SELECT ON pc TO authenticated;
DO $$
DECLARE m record; k record; cap record; msg text; st text; can boolean; c1 bigint;
BEGIN
  FOR m IN SELECT * FROM pm ORDER BY k LOOP
    SELECT count(*) INTO c1 FROM pc WHERE employer_id = m.employer_id;
    INSERT INTO res VALUES (m.k::int*10, 'member '||m.k||': platform_admin='||m.is_pa::text||' live_reviewer_grant='||m.grant_live::text||' org_cases='||c1::text, '');
    FOR k IN SELECT * FROM pc WHERE employer_id = m.employer_id LOOP
      PERFORM set_config('request.jwt.claim.sub', m.user_id::text, true); SET LOCAL ROLE authenticated;
      SELECT public.scp_iv_can_read_case(k.case_id) INTO can;
      IF can THEN
        BEGIN
          SELECT * INTO cap FROM public.scp_iv_case_capabilities(k.case_id);
          SELECT count(*) INTO c1 FROM public.scp_interview_ai_config;
          RESET ROLE;
          INSERT INTO res VALUES (m.k::int*10 + 1, '   -> reads a case it did not create ('||(k.created_by IS DISTINCT FROM m.user_id)::text||'): capabilities (ai, transcript) / direct config rows',
                                  cap.ai_enabled::text||', '||cap.transcript_enabled::text||' / '||c1::text);
        EXCEPTION WHEN OTHERS THEN RESET ROLE; GET STACKED DIAGNOSTICS msg = MESSAGE_TEXT, st = RETURNED_SQLSTATE;
          INSERT INTO res VALUES (m.k::int*10 + 1, '   -> can read but capabilities failed', left(msg,40)||' / '||st);
        END;
      ELSE RESET ROLE; END IF;
    END LOOP;
  END LOOP;
END $$;
SELECT n, probe, result FROM res ORDER BY n;
ROLLBACK;

-- ===== AFTER: nothing left behind =====
SELECT (SELECT count(*) FROM auth.users WHERE email LIKE '%@synthetic.invalid') AS synthetic_users_left,
       (SELECT count(*) FROM public.employer_memberships WHERE user_id::text LIKE 'e5150000-%') AS synthetic_memberships_left,
       (SELECT count(*) FROM public.employer_access_requests WHERE requester_user_id::text LIKE 'e5150000-%') AS synthetic_requests_left,
       (SELECT count(*) FROM public.scp_employer_reviewers WHERE user_id::text LIKE 'e5150000-%') AS synthetic_grants_left,
       (SELECT count(*) FROM public.profiles WHERE id::text LIKE 'e5150000-%') AS synthetic_profiles_left,
       (SELECT count(*) FROM public.employer_memberships) AS memberships_total;
