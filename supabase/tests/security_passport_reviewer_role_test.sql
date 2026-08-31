-- =============================================================================
-- Security Passport — the dedicated reviewer capability, and least privilege.
--
-- Two questions, both asked of the database rather than of the interface.
--
-- (1) CAN THE RIGHT PERSON REVIEW, AND ONLY REVIEW?
--     sp_is_verifier() used to be `SELECT is_platform_admin(_user_id)`, so
--     hiring somebody to check guard licences meant granting them user
--     administration, employer administration and account deletion. The
--     dedicated `passport_verifier` role separates the two. The interesting
--     assertion is not that a reviewer can review -- it is that a reviewer
--     is NOT an admin, which is the property the old model could not have.
--
-- (2) WHAT CAN `authenticated` DO TO THE TRUST TABLES?
--     This project's hosted database grants every new public table in full
--     to anon and authenticated. Six of those seven privileges are bounded
--     by RLS. TRUNCATE is not bounded by anything -- row-level security does
--     not apply to it at all. So these tests EXECUTE the statement rather
--     than reading pg_policies: a policy listing cannot tell you whether the
--     append-only decision log can be emptied.
--
-- Every principal below is reached the way PostgREST reaches it -- SET ROLE
-- authenticated with a JWT subject -- never as the table owner, for whom
-- every one of these statements would trivially succeed.
--
-- All identities are transparently fictional and use an `ac` prefix.
-- =============================================================================

\set ON_ERROR_STOP on
SET client_min_messages TO NOTICE;
SET search_path = public, extensions;

CREATE OR REPLACE FUNCTION pg_temp.ok(cond boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT cond THEN RAISE EXCEPTION 'ASSERTION FAILED: %', label; END IF;
  RAISE NOTICE 'ok  %', label;
END $$;

/* Refused FOR LACK OF PRIVILEGE — not merely failed. A typo raises too;
   only 42501 is the security property. */
CREATE OR REPLACE FUNCTION pg_temp.must_be_denied(stmt text, label text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE _msg text; _state text;
BEGIN
  BEGIN EXECUTE stmt;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS _state = RETURNED_SQLSTATE, _msg = MESSAGE_TEXT;
    IF _state <> '42501' THEN
      RAISE EXCEPTION 'ASSERTION FAILED: % -- refused, but with % (%) rather than '
                      'insufficient_privilege', label, _state, left(_msg, 60);
    END IF;
    RAISE NOTICE 'ok  % (denied: %)', label, left(_msg, 60);
    RETURN;
  END;
  RAISE EXCEPTION 'ASSERTION FAILED: % -- SUCCEEDED but must be denied', label;
END $$;

/* Refused for ANY reason, with the reason reported. Used where the refusal
   is raised by a function guard (RAISE EXCEPTION) rather than by privilege. */
CREATE OR REPLACE FUNCTION pg_temp.must_raise(stmt text, label text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE _msg text;
BEGIN
  BEGIN EXECUTE stmt;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS _msg = MESSAGE_TEXT;
    RAISE NOTICE 'ok  % (refused: %)', label, left(_msg, 70);
    RETURN;
  END;
  RAISE EXCEPTION 'ASSERTION FAILED: % -- SUCCEEDED but must be refused', label;
END $$;

\echo '==> Security Passport dedicated reviewer role and least privilege'

-- -----------------------------------------------------------------------------
-- Fictional cast
-- -----------------------------------------------------------------------------
--   ...01  an ordinary candidate (holder of the credential under review)
--   ...02  a dedicated Passport reviewer -- passport_verifier ONLY
--   ...03  a platform admin (the pre-existing reviewer path)
--   ...04  a candidate who is ALSO a reviewer (dual role, self-verification)
--   ...05  an employer owner
--   ...06  a reviewer whose capability is granted then revoked
--   ...07  a superadmin, to exercise the grant/revoke path itself
INSERT INTO auth.users (id, email) VALUES
  ('ac000000-0000-0000-0000-000000000001','rc-candidate@example.test'),
  ('ac000000-0000-0000-0000-000000000002','rc-reviewer@example.test'),
  ('ac000000-0000-0000-0000-000000000003','rc-admin@example.test'),
  ('ac000000-0000-0000-0000-000000000004','rc-dual@example.test'),
  ('ac000000-0000-0000-0000-000000000005','rc-employer@example.test'),
  ('ac000000-0000-0000-0000-000000000006','rc-revoked@example.test'),
  ('ac000000-0000-0000-0000-000000000007','rc-superadmin@example.test')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.sp_passport_profiles (holder_user_id, display_name) VALUES
  ('ac000000-0000-0000-0000-000000000001','Rita Recension (fiktiv)'),
  ('ac000000-0000-0000-0000-000000000004','Douglas Dubbel (fiktiv)')
ON CONFLICT (holder_user_id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('ac000000-0000-0000-0000-000000000002','passport_verifier'),
  ('ac000000-0000-0000-0000-000000000003','admin'),
  ('ac000000-0000-0000-0000-000000000004','passport_verifier'),
  ('ac000000-0000-0000-0000-000000000006','passport_verifier'),
  ('ac000000-0000-0000-0000-000000000007','superadmin')
ON CONFLICT DO NOTHING;

INSERT INTO public.employers (id, slug, name, status) VALUES
  ('ac000000-0000-0000-0000-0000000000e1','rc-bevakning','Bevakning RC AB (fiktiv)','active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.employer_memberships (employer_id, user_id, role, status) VALUES
  ('ac000000-0000-0000-0000-0000000000e1','ac000000-0000-0000-0000-000000000005','owner','active')
ON CONFLICT DO NOTHING;

-- The candidate's claim and its OPEN review request. Written as owner:
-- reaching this state is the starting point, not what is under test.
INSERT INTO public.sp_claims
  (id, holder_user_id, claim_type, title, assertion_level, lifecycle_state)
VALUES ('ac000000-0000-0000-0000-0000000000c1','ac000000-0000-0000-0000-000000000001',
        'education','Fiktiv utbildning','self_declared','active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.sp_verification_requests
  (id, holder_user_id, claim_id, request_kind, status)
VALUES ('ac000000-0000-0000-0000-0000000000f1','ac000000-0000-0000-0000-000000000001',
        'ac000000-0000-0000-0000-0000000000c1','cqrityjob_review','pending')
ON CONFLICT (id) DO NOTHING;

-- The dual-role user's OWN claim and OWN open request: the self-verification case.
INSERT INTO public.sp_claims
  (id, holder_user_id, claim_type, title, assertion_level, lifecycle_state)
VALUES ('ac000000-0000-0000-0000-0000000000c4','ac000000-0000-0000-0000-000000000004',
        'education','Egen fiktiv utbildning','self_declared','active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.sp_verification_requests
  (id, holder_user_id, claim_id, request_kind, status)
VALUES ('ac000000-0000-0000-0000-0000000000f4','ac000000-0000-0000-0000-000000000004',
        'ac000000-0000-0000-0000-0000000000c4','cqrityjob_review','pending')
ON CONFLICT (id) DO NOTHING;

-- Evidence attached to the candidate's claim, for the evidence-boundary group.
INSERT INTO public.sp_evidence
  (id, holder_user_id, claim_id, storage_path, file_name, mime_type, size_bytes)
VALUES ('ac000000-0000-0000-0000-0000000000d1','ac000000-0000-0000-0000-000000000001',
        'ac000000-0000-0000-0000-0000000000c1','sp-evidence/rc1/fiktiv.pdf',
        'fiktiv.pdf','application/pdf', 1024)
ON CONFLICT (id) DO NOTHING;


-- =============================================================================
\echo '    GROUP 1 -- who is a verifier, and who is not'
-- =============================================================================
-- The whole point of the change: two of these four were previously
-- IMPOSSIBLE to distinguish, because sp_is_verifier WAS is_platform_admin.
DO $$
BEGIN
  PERFORM pg_temp.ok(
    public.sp_is_verifier('ac000000-0000-0000-0000-000000000001') IS FALSE,
    '1.1 an ordinary candidate is NOT a verifier');

  PERFORM pg_temp.ok(
    public.sp_is_verifier('ac000000-0000-0000-0000-000000000002') IS TRUE,
    '1.2 a dedicated passport_verifier IS a verifier');

  PERFORM pg_temp.ok(
    public.sp_is_verifier('ac000000-0000-0000-0000-000000000003') IS TRUE,
    '1.3 a platform admin IS still a verifier (backwards compatibility)');

  -- THE ONE-DIRECTIONAL PROPERTY. If this ever fails, the separation is gone
  -- and the dedicated role has silently become a second admin role.
  PERFORM pg_temp.ok(
    public.is_platform_admin('ac000000-0000-0000-0000-000000000002') IS FALSE,
    '1.4 a dedicated reviewer is NOT a platform admin');

  PERFORM pg_temp.ok(
    public.is_superadmin('ac000000-0000-0000-0000-000000000002') IS FALSE,
    '1.5 a dedicated reviewer is NOT a superadmin');

  PERFORM pg_temp.ok(
    public.has_role('ac000000-0000-0000-0000-000000000002','admin') IS FALSE
    AND public.has_role('ac000000-0000-0000-0000-000000000002','superadmin') IS FALSE,
    '1.6 the reviewer holds neither admin nor superadmin in user_roles');
END $$;


-- =============================================================================
\echo '    GROUP 2 -- granting and revoking the capability'
-- =============================================================================
-- Explicit, reversible, audited, and superadmin-only. Run through the
-- existing admin_set_platform_role() rather than a new mechanism.
DO $$
DECLARE _audit_before int; _audit_after int;
BEGIN
  SELECT count(*) INTO _audit_before FROM public.audit_logs
   WHERE action IN ('platform_role_granted','platform_role_revoked');

  -- Revoke ...06's capability, as the superadmin, through the real path.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub','ac000000-0000-0000-0000-000000000007', true);

  PERFORM pg_temp.ok(
    public.sp_is_verifier('ac000000-0000-0000-0000-000000000006') IS TRUE,
    '2.1 the capability is in force before revocation');

  PERFORM public.admin_set_platform_role(
    'ac000000-0000-0000-0000-000000000006','passport_verifier', false);

  PERFORM pg_temp.ok(
    public.sp_is_verifier('ac000000-0000-0000-0000-000000000006') IS FALSE,
    '2.2 revoking the role removes verifier capability immediately');

  -- ...and grant it back, so revocation is proved reversible.
  PERFORM public.admin_set_platform_role(
    'ac000000-0000-0000-0000-000000000006','passport_verifier', true);
  PERFORM pg_temp.ok(
    public.sp_is_verifier('ac000000-0000-0000-0000-000000000006') IS TRUE,
    '2.3 the grant is reversible -- capability restored');

  RESET ROLE;
  SELECT count(*) INTO _audit_after FROM public.audit_logs
   WHERE action IN ('platform_role_granted','platform_role_revoked');
  PERFORM pg_temp.ok(_audit_after = _audit_before + 2,
    '2.4 each grant/revoke writes one attributable audit_logs row');

  PERFORM pg_temp.ok(EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = 'ac000000-0000-0000-0000-000000000006'
       AND role = 'passport_verifier'
       AND granted_by = 'ac000000-0000-0000-0000-000000000007'),
    '2.5 the role row records WHO granted it');
END $$;

-- A reviewer cannot grant the capability to anybody -- least privilege would
-- be meaningless if the role could propagate itself.
DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub','ac000000-0000-0000-0000-000000000002', true);
  PERFORM pg_temp.must_raise(
    'SELECT public.admin_set_platform_role(''ac000000-0000-0000-0000-000000000001'',''passport_verifier'',true)',
    '2.6 a reviewer cannot grant the reviewer role (not superadmin)');
  PERFORM pg_temp.must_raise(
    'SELECT public.admin_set_platform_role(''ac000000-0000-0000-0000-000000000001'',''admin'',true)',
    '2.7 a reviewer cannot make anybody a platform admin');
END $$;


-- =============================================================================
\echo '    GROUP 3 -- the reviewer can actually do the job'
-- =============================================================================
DO $$
DECLARE _n int; _detail jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub','ac000000-0000-0000-0000-000000000002', true);

  SELECT count(*) INTO _n FROM public.sp_verifier_queue(NULL);
  PERFORM pg_temp.ok(_n >= 1, '3.1 a dedicated reviewer can list the verification queue');

  SELECT public.sp_verifier_request_detail('ac000000-0000-0000-0000-0000000000f1') INTO _detail;
  PERFORM pg_temp.ok(_detail IS NOT NULL,
    '3.2 a dedicated reviewer can open a legitimate request detail');

  -- The decision itself, through the real trust path.
  PERFORM public.sp_verifier_decide(
    'ac000000-0000-0000-0000-0000000000f1', 'approved', 'document_review',
    'INTERNAL: jamfort mot uppvisat original.', 'Din utbildning ar verifierad.',
    NULL, NULL);
  PERFORM pg_temp.ok(EXISTS (
    SELECT 1 FROM public.sp_verification_decisions
     WHERE request_id = 'ac000000-0000-0000-0000-0000000000f1' AND decision = 'approved'),
    '3.3 a dedicated reviewer can decide a legitimate request');
END $$;

-- An ordinary candidate calling the very same RPCs directly -- the crafted
-- call that a hidden navigation link would not stop.
DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub','ac000000-0000-0000-0000-000000000001', true);

  PERFORM pg_temp.must_raise(
    'SELECT * FROM public.sp_verifier_queue(NULL)',
    '3.4 an ordinary candidate calling sp_verifier_queue directly is refused');
  PERFORM pg_temp.must_raise(
    'SELECT public.sp_verifier_request_detail(''ac000000-0000-0000-0000-0000000000f4'')',
    '3.5 an ordinary candidate calling sp_verifier_request_detail is refused');
  PERFORM pg_temp.must_raise(
    'SELECT public.sp_verifier_decide(''ac000000-0000-0000-0000-0000000000f4'',''approved'',''document_review'',''n'',''m'',NULL,NULL)',
    '3.6 an ordinary candidate calling sp_verifier_decide is refused');
END $$;

-- An employer is not a reviewer either.
DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub','ac000000-0000-0000-0000-000000000005', true);
  PERFORM pg_temp.ok(
    public.sp_is_verifier('ac000000-0000-0000-0000-000000000005') IS FALSE,
    '3.7 an employer owner is not a verifier');
  PERFORM pg_temp.must_raise(
    'SELECT * FROM public.sp_verifier_queue(NULL)',
    '3.8 an employer calling the reviewer queue is refused');
END $$;

-- A REVOKED reviewer loses the ability to act, not just the ability to see.
DO $$
BEGIN
  -- Revoke ...06 for real this time, as owner, then act as them.
  DELETE FROM public.user_roles
   WHERE user_id = 'ac000000-0000-0000-0000-000000000006' AND role = 'passport_verifier';

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub','ac000000-0000-0000-0000-000000000006', true);
  PERFORM pg_temp.must_raise(
    'SELECT * FROM public.sp_verifier_queue(NULL)',
    '3.9 a revoked reviewer can no longer list the queue');
  PERFORM pg_temp.must_raise(
    'SELECT public.sp_verifier_decide(''ac000000-0000-0000-0000-0000000000f4'',''approved'',''document_review'',''n'',''m'',NULL,NULL)',
    '3.10 a revoked reviewer can no longer decide');
END $$;

-- Revocation does not rewrite history: the decision made in 3.3 stands.
DO $$
BEGIN
  PERFORM pg_temp.ok(EXISTS (
    SELECT 1 FROM public.sp_verification_decisions
     WHERE request_id = 'ac000000-0000-0000-0000-0000000000f1'
       AND decided_by = 'ac000000-0000-0000-0000-000000000002'),
    '3.11 historical decisions keep decided_by after capability changes');
END $$;


-- =============================================================================
\echo '    GROUP 4 -- the reviewer role does not weaken self-verification'
-- =============================================================================
-- The dual-role user holds passport_verifier AND is the holder of ...f4.
-- If the capability check were the only gate, they would approve themselves.
DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub','ac000000-0000-0000-0000-000000000004', true);

  PERFORM pg_temp.ok(
    public.sp_is_verifier('ac000000-0000-0000-0000-000000000004') IS TRUE,
    '4.1 the dual-role user genuinely holds the reviewer capability');

  PERFORM pg_temp.must_raise(
    'SELECT public.sp_verifier_decide(''ac000000-0000-0000-0000-0000000000f4'',''approved'',''document_review'',''n'',''m'',NULL,NULL)',
    '4.2 ...and still cannot approve their OWN request');

  PERFORM pg_temp.ok(NOT EXISTS (
    SELECT 1 FROM public.sp_verification_decisions
     WHERE request_id = 'ac000000-0000-0000-0000-0000000000f4'),
    '4.3 the refusal wrote nothing -- no decision row exists');
END $$;


-- =============================================================================
\echo '    GROUP 5 -- a reviewer is not an admin ANYWHERE'
-- =============================================================================
-- Group 1 asserts the helper returns false. This group asserts that the
-- helper being false actually costs the reviewer the admin surfaces --
-- otherwise "not an admin" would be a claim about a boolean, not about
-- authorization.
DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub','ac000000-0000-0000-0000-000000000002', true);

  PERFORM pg_temp.must_raise(
    'SELECT public.admin_set_platform_role(''ac000000-0000-0000-0000-000000000001'',''admin'',true)',
    '5.1 a reviewer cannot administer platform roles');

  -- The reviewer sees only their OWN role row: user_roles_admin_select is
  -- gated on is_platform_admin, and user_roles_self_select on auth.uid().
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.user_roles
      WHERE user_id <> 'ac000000-0000-0000-0000-000000000002') = 0,
    '5.2 a reviewer cannot read other users'' platform roles');
END $$;


-- =============================================================================
\echo '    GROUP 6 -- evidence access is still bounded by the review, not the role'
-- =============================================================================
-- The dedicated role must not turn into "all reviewers may browse all
-- candidate files". The condition stays capability AND a legitimate request.
DO $$
DECLARE _n int;
BEGIN
  SET LOCAL ROLE authenticated;

  -- An ordinary, unrelated candidate: no evidence at all.
  PERFORM set_config('request.jwt.claim.sub','ac000000-0000-0000-0000-000000000004', true);
  SELECT count(*) INTO _n FROM public.sp_evidence
   WHERE id = 'ac000000-0000-0000-0000-0000000000d1';
  PERFORM pg_temp.ok(_n = 0, '6.1 an unrelated candidate sees no evidence of another holder');

  -- The employer: not a reviewer, no evidence.
  PERFORM set_config('request.jwt.claim.sub','ac000000-0000-0000-0000-000000000005', true);
  SELECT count(*) INTO _n FROM public.sp_evidence
   WHERE id = 'ac000000-0000-0000-0000-0000000000d1';
  PERFORM pg_temp.ok(_n = 0, '6.2 an employer sees no candidate evidence');

  -- The holder sees their own.
  PERFORM set_config('request.jwt.claim.sub','ac000000-0000-0000-0000-000000000001', true);
  SELECT count(*) INTO _n FROM public.sp_evidence
   WHERE id = 'ac000000-0000-0000-0000-0000000000d1';
  PERFORM pg_temp.ok(_n = 1, '6.3 the holder still sees their own evidence');
END $$;


-- =============================================================================
\echo '    GROUP 7 -- TRUNCATE: the privilege RLS does not bound'
-- =============================================================================
-- Executed, not inspected. Before this PR every statement in this group
-- SUCCEEDED as `authenticated` -- the append-only decision log, the request
-- log, the evidence register and the claim register could each be emptied by
-- any signed-in user, through no policy failure at all: the grant simply
-- arrived with the table and RLS never applied to the verb.
DO $$
DECLARE _t text;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub','ac000000-0000-0000-0000-000000000001', true);

  FOREACH _t IN ARRAY ARRAY[
    'sp_verification_decisions','sp_verification_requests','sp_evidence',
    'sp_claims','sp_experience_periods','sp_passport_events','sp_disclosures'
  ] LOOP
    PERFORM pg_temp.must_be_denied(
      format('TRUNCATE public.%I', _t),
      format('7.x authenticated cannot TRUNCATE %s', _t));
  END LOOP;
END $$;

-- Not one Passport table anywhere may retain the accidental grants.
DO $$
DECLARE _leaked text;
BEGIN
  SELECT string_agg(DISTINCT table_name || ':' || grantee || ':' || privilege_type, ', ')
    INTO _leaked
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public' AND table_name LIKE 'sp\_%'
    AND grantee IN ('anon','authenticated')
    AND privilege_type IN ('TRUNCATE','REFERENCES','TRIGGER');
  PERFORM pg_temp.ok(_leaked IS NULL,
    '7.8 no sp_ table grants TRUNCATE/REFERENCES/TRIGGER to anon or authenticated');
END $$;

-- The append-only guarantee as a privilege, and the privileges the product
-- genuinely needs, still present.
DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub','ac000000-0000-0000-0000-000000000001', true);

  PERFORM pg_temp.must_be_denied(
    'UPDATE public.sp_verification_decisions SET decision = ''approved''',
    '7.9 authenticated cannot UPDATE the decision log');
  PERFORM pg_temp.must_be_denied(
    'UPDATE public.sp_verification_requests SET status = ''approved''',
    '7.10 authenticated cannot UPDATE verification requests');
  PERFORM pg_temp.must_be_denied(
    'INSERT INTO public.sp_verification_decisions (request_id, holder_user_id, decision) '
    'VALUES (''ac000000-0000-0000-0000-0000000000f1'',''ac000000-0000-0000-0000-000000000001'',''approved'')',
    '7.11 authenticated cannot INSERT a decision directly');
END $$;

DO $$
DECLARE _n int;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub','ac000000-0000-0000-0000-000000000001', true);
  SELECT count(*) INTO _n FROM public.sp_verification_requests
   WHERE holder_user_id = 'ac000000-0000-0000-0000-000000000001';
  PERFORM pg_temp.ok(_n >= 1,
    '7.12 the holder can still READ their own requests -- the cleanup broke nothing');
END $$;


-- =============================================================================
\echo '    GROUP 8 -- decided_by is internal; the ORGANISATION is what the candidate is told'
-- =============================================================================
DO $$
DECLARE _v text;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub','ac000000-0000-0000-0000-000000000001', true);

  -- Paired with the successful reads below: without them a suite that could
  -- not see the row at all would look identical to one where this holds.
  PERFORM pg_temp.must_be_denied(
    'SELECT decided_by FROM public.sp_verification_decisions',
    '8.1 the holder cannot read the individual reviewer id on their DECISION');
  PERFORM pg_temp.must_be_denied(
    'SELECT decided_by FROM public.sp_verification_requests',
    '8.2 the holder cannot read the individual reviewer id on their REQUEST');
  PERFORM pg_temp.must_be_denied(
    'SELECT * FROM public.sp_verification_decisions',
    '8.3 SELECT * does not smuggle it out either');

  SELECT decider_organisation INTO _v FROM public.sp_verification_decisions
   WHERE request_id = 'ac000000-0000-0000-0000-0000000000f1';
  PERFORM pg_temp.ok(_v IS NOT NULL,
    '8.4 the holder DOES read who verified them, organisationally');

  SELECT decision INTO _v FROM public.sp_verification_decisions
   WHERE request_id = 'ac000000-0000-0000-0000-0000000000f1';
  PERFORM pg_temp.ok(_v = 'approved', '8.5 the holder still reads the outcome');

  SELECT holder_message INTO _v FROM public.sp_verification_requests
   WHERE id = 'ac000000-0000-0000-0000-0000000000f1';
  PERFORM pg_temp.ok(_v IS NOT NULL,
    '8.6 PR 4 candidate feedback survives the privilege cleanup');
END $$;

-- The internal audit trail keeps it. Restricting a grant must not have been
-- quietly implemented as dropping the data.
DO $$
BEGIN
  PERFORM pg_temp.ok(EXISTS (
    SELECT 1 FROM public.sp_verification_decisions
     WHERE request_id = 'ac000000-0000-0000-0000-0000000000f1'
       AND decided_by IS NOT NULL),
    '8.7 decided_by is RETAINED in storage for internal audit');

  PERFORM pg_temp.ok(EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='sp_verification_decisions'
       AND column_name='decided_by'),
    '8.8 the decided_by column still exists -- privilege change, not a drop');
END $$;


-- =============================================================================
\echo '    GROUP 9 -- PR 6 internal-note privacy has not regressed'
-- =============================================================================
DO $$
DECLARE _leaked text;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub','ac000000-0000-0000-0000-000000000001', true);

  PERFORM pg_temp.must_be_denied(
    'SELECT decision_note FROM public.sp_verification_requests',
    '9.1 the holder still cannot READ the internal note on a request');
  PERFORM pg_temp.must_be_denied(
    'SELECT decision_note FROM public.sp_verification_decisions',
    '9.2 the holder still cannot READ the internal note on a decision');
  PERFORM pg_temp.must_be_denied(
    'UPDATE public.sp_verification_requests SET decision_note = ''planted''',
    '9.3 the holder cannot WRITE an internal note');

  RESET ROLE;
  SELECT string_agg(DISTINCT table_name || ':' || grantee || ':' || privilege_type, ', ')
    INTO _leaked
  FROM information_schema.column_privileges
  WHERE grantee IN ('anon','authenticated') AND table_schema='public'
    AND table_name IN ('sp_verification_requests','sp_verification_decisions')
    AND column_name = 'decision_note';
  PERFORM pg_temp.ok(_leaked IS NULL,
    '9.4 no privilege of any kind on decision_note remains for anon/authenticated');
END $$;

-- The reviewer, however, still gets the note through the authorized function.
DO $$
DECLARE _detail jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub','ac000000-0000-0000-0000-000000000002', true);
  SELECT public.sp_verifier_request_detail('ac000000-0000-0000-0000-0000000000f1') INTO _detail;
  PERFORM pg_temp.ok(_detail IS NOT NULL,
    '9.5 the reviewer still reaches the review detail through the authorized function');
END $$;

RESET ROLE;
\echo '==> Security Passport reviewer role and least-privilege suite complete'
