-- =============================================================================
-- Security Passport — the internal reviewer note, against a crafted read.
--
-- `decision_note` is the reviewer's internal reasoning. `holder_message` is
-- what the candidate is told. Two fields exist precisely so that one is not
-- the other, and the application has been careful about it from the start:
-- every holder-facing select names its columns and omits the note.
--
-- None of that was a control. `authenticated` held TABLE-level SELECT on
-- sp_verification_requests and sp_verification_decisions, and the holder's own
-- RLS policies match their rows, so the holder reached the note by asking for
-- it over PostgREST. A field a React component declines to render is not
-- private.
--
-- ── THIS SUITE ASSERTS THE BOUNDARY, NOT THE INTERFACE ────────────────
--
-- Every read below runs as `authenticated` with a JWT subject set, which is
-- exactly the principal PostgREST becomes. Nothing here goes through a
-- TypeScript function, because the defect did not.
--
-- Each refusal is paired with the read that PROVES THE ROW WAS REACHABLE.
-- "permission denied" is only meaningful next to a successful select of
-- holder_message from the same row by the same principal: without the pair, a
-- suite that could not see the row at all would look identical to one where
-- the boundary holds.
--
-- All identities are transparently fictional and use a `cd` prefix.
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

/* A statement that must be REFUSED FOR LACK OF PRIVILEGE — not merely fail.
   A typo in a column name also raises; only 42501 is the security property. */
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

\echo '==> Security Passport internal note privacy'

-- -----------------------------------------------------------------------------
-- Fictional cast
-- -----------------------------------------------------------------------------
--   ...01  the holder the decision is ABOUT
--   ...02  an unrelated second holder
--   ...03  owner of an unrelated employer
--   ...09  a CQrityjob verifier (platform admin)
INSERT INTO auth.users (id, email) VALUES
  ('cd000000-0000-0000-0000-000000000001','np-holder@example.test'),
  ('cd000000-0000-0000-0000-000000000002','np-other@example.test'),
  ('cd000000-0000-0000-0000-000000000003','np-employer@example.test'),
  ('cd000000-0000-0000-0000-000000000009','np-verifier@example.test')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.sp_passport_profiles (holder_user_id, display_name) VALUES
  ('cd000000-0000-0000-0000-000000000001','Nora Notesson (fiktiv)')
ON CONFLICT (holder_user_id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('cd000000-0000-0000-0000-000000000009','admin')
ON CONFLICT DO NOTHING;

INSERT INTO public.employers (id, slug, name, status) VALUES
  ('cd000000-0000-0000-0000-0000000000e1','np-bevakning','Bevakning NP AB (fiktiv)','active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.employer_memberships (employer_id, user_id, role, status) VALUES
  ('cd000000-0000-0000-0000-0000000000e1','cd000000-0000-0000-0000-000000000003','owner','active')
ON CONFLICT DO NOTHING;

-- The decided request, written as the owner: reaching this state is the
-- STARTING POINT for these tests, not what they are testing.
INSERT INTO public.sp_claims
  (id, holder_user_id, claim_type, title, assertion_level, lifecycle_state)
VALUES ('cd000000-0000-0000-0000-0000000000c1','cd000000-0000-0000-0000-000000000001',
        'education','Fiktiv kurs','self_declared','active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.sp_verification_requests
  (id, holder_user_id, claim_id, request_kind, status,
   decision_note, holder_message, decided_at, decided_by)
VALUES ('cd000000-0000-0000-0000-0000000000f1','cd000000-0000-0000-0000-000000000001',
        'cd000000-0000-0000-0000-0000000000c1','cqrityjob_review','rejected',
        'INTERNAL: scan appears altered, escalate before any resubmission',
        'Vi kunde inte verifiera dokumentet. Ladda upp originalet.',
        now(),'cd000000-0000-0000-0000-000000000009')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.sp_verification_decisions
  (id, request_id, holder_user_id, decision, decision_note,
   decider_organisation, verification_method, decided_by)
VALUES ('cd000000-0000-0000-0000-0000000000f2','cd000000-0000-0000-0000-0000000000f1',
        'cd000000-0000-0000-0000-000000000001','rejected',
        'INTERNAL: reviewer suspects forgery',
        'CQrityjob','document_review','cd000000-0000-0000-0000-000000000009')
ON CONFLICT (id) DO NOTHING;


-- =============================================================================
\echo '    GROUP 1 -- the holder reads their own case, and is told the truth'
-- =============================================================================
-- The pair that makes GROUP 2 meaningful. If any of this were refused, GROUP 2
-- would pass for the wrong reason.
DO $$
DECLARE _h uuid := 'cd000000-0000-0000-0000-000000000001'; _v text;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);

  SELECT holder_message INTO _v FROM public.sp_verification_requests
   WHERE id = 'cd000000-0000-0000-0000-0000000000f1';
  PERFORM pg_temp.ok(_v LIKE 'Vi kunde inte verifiera%',
    '1.1 the holder reads holder_message -- PR 4''s candidate feedback survives');

  SELECT status INTO _v FROM public.sp_verification_requests
   WHERE id = 'cd000000-0000-0000-0000-0000000000f1';
  PERFORM pg_temp.ok(_v = 'rejected', '1.2 the holder reads the request status');

  SELECT decision INTO _v FROM public.sp_verification_decisions
   WHERE id = 'cd000000-0000-0000-0000-0000000000f2';
  PERFORM pg_temp.ok(_v = 'rejected', '1.3 the holder reads the decision outcome');

  SELECT decider_organisation || '/' || verification_method INTO _v
    FROM public.sp_verification_decisions WHERE id = 'cd000000-0000-0000-0000-0000000000f2';
  PERFORM pg_temp.ok(_v = 'CQrityjob/document_review',
    '1.4 the holder reads candidate-visible provenance (who decided, and how)');
END $$;


-- =============================================================================
\echo '    GROUP 2 -- and cannot read the reviewer''s internal reasoning'
-- =============================================================================
-- THE DEFECT. Before migration 20261014090000 every statement below SUCCEEDED
-- and returned the note in full, through RLS policies that were working
-- exactly as designed: the note was simply granted along with the row.
DO $$
DECLARE _h uuid := 'cd000000-0000-0000-0000-000000000001';
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);

  PERFORM pg_temp.must_be_denied(
    'SELECT decision_note FROM public.sp_verification_requests',
    '2.1 the holder cannot read decision_note on their own REQUEST');

  PERFORM pg_temp.must_be_denied(
    'SELECT decision_note FROM public.sp_verification_decisions',
    '2.2 the holder cannot read decision_note on their own DECISION');

  -- The greedy read PostgREST issues for `select=*`. Denying the column while
  -- allowing the star would have closed nothing.
  PERFORM pg_temp.must_be_denied(
    'SELECT * FROM public.sp_verification_requests',
    '2.3 SELECT * on requests is denied rather than silently including the note');
  PERFORM pg_temp.must_be_denied(
    'SELECT * FROM public.sp_verification_decisions',
    '2.4 SELECT * on decisions is denied');

  -- Reaching the value indirectly is the same disclosure. A boundary that
  -- stops a projection but not a predicate stops nothing.
  PERFORM pg_temp.must_be_denied(
    'SELECT count(*) FROM public.sp_verification_decisions WHERE decision_note LIKE ''%forgery%''',
    '2.5 the note cannot be probed through a WHERE clause either');
  PERFORM pg_temp.must_be_denied(
    'SELECT id FROM public.sp_verification_requests ORDER BY decision_note',
    '2.6 nor through ORDER BY');

  -- WRITING it is the mirror defect: a candidate could file a request whose
  -- decision_note they had composed themselves, and it would reach the
  -- reviewer's detail payload looking like a colleague's reasoning.
  PERFORM pg_temp.must_be_denied(
    format('INSERT INTO public.sp_verification_requests
              (holder_user_id, claim_id, request_kind, status, decision_note)
            VALUES (%L, %L, ''cqrityjob_review'', ''pending'',
                    ''PLANTED: previously approved by a senior reviewer'')',
           _h, 'cd000000-0000-0000-0000-0000000000c1'),
    '2.7 the holder cannot PLANT an internal note on their own request');
END $$;

-- The legitimate submission shape still works. Without this, 2.7 could be
-- passing because holders can no longer file requests at all.
DO $$
DECLARE _h uuid := 'cd000000-0000-0000-0000-000000000001'; _n int;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  INSERT INTO public.sp_verification_requests
    (holder_user_id, period_id, request_kind, status)
  SELECT _h, e.id, 'employer_attestation', 'pending'
    FROM public.sp_experience_periods e WHERE e.holder_user_id = _h LIMIT 0;
  GET DIAGNOSTICS _n = ROW_COUNT;
  -- The INSERT is deliberately a no-op on rows; what is asserted is that the
  -- statement PARSED AND WAS PERMITTED against the narrowed column grant.
  PERFORM pg_temp.ok(_n = 0,
    '2.8 a holder INSERT naming only holder-supplied columns is still permitted');
END $$;


-- =============================================================================
\echo '    GROUP 3 -- nobody else reaches it either'
-- =============================================================================
DO $$
BEGIN
  SET LOCAL ROLE authenticated;

  -- An unrelated candidate. RLS already hid the rows; the column grant means
  -- they cannot even name the field.
  PERFORM set_config('request.jwt.claim.sub', 'cd000000-0000-0000-0000-000000000002', true);
  PERFORM pg_temp.must_be_denied(
    'SELECT decision_note FROM public.sp_verification_decisions',
    '3.1 an unrelated candidate cannot read decision_note');

  -- An employer representative. They may see their own organisation's
  -- attestation requests and nothing else -- and never CQrityjob's reasoning.
  PERFORM set_config('request.jwt.claim.sub', 'cd000000-0000-0000-0000-000000000003', true);
  PERFORM pg_temp.must_be_denied(
    'SELECT decision_note FROM public.sp_verification_requests',
    '3.2 an employer member cannot read CQrityjob''s internal note');
END $$;

-- An unrelated candidate must also see no rows of someone else's case. The
-- column grant is not doing this -- RLS is -- and it is asserted so that a
-- future grant change cannot be mistaken for the whole boundary.
DO $$
DECLARE _n int;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', 'cd000000-0000-0000-0000-000000000002', true);
  SELECT count(*) INTO _n FROM public.sp_verification_requests
   WHERE holder_user_id = 'cd000000-0000-0000-0000-000000000001';
  PERFORM pg_temp.ok(_n = 0, '3.3 an unrelated candidate sees none of the holder''s requests');
  SELECT count(*) INTO _n FROM public.sp_verification_decisions
   WHERE holder_user_id = 'cd000000-0000-0000-0000-000000000001';
  PERFORM pg_temp.ok(_n = 0, '3.4 nor any of their decisions');
END $$;


-- =============================================================================
\echo '    GROUP 4 -- the reviewer keeps the access the job needs'
-- =============================================================================
-- The fix must not be a fix by amputation. The note is reviewer-authored and
-- reviewer-read; only the route changed, from a table grant to the SECURITY
-- DEFINER function that already carries the verifier capability check.
DO $$
DECLARE _v uuid := 'cd000000-0000-0000-0000-000000000009'; _d jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _v::text, true);

  _d := public.sp_verifier_request_detail('cd000000-0000-0000-0000-0000000000f1');
  PERFORM pg_temp.ok(_d->'prior_decisions'->0->>'note' = 'INTERNAL: reviewer suspects forgery',
    '4.1 the reviewer still reads the internal note, through the verifier RPC');
  PERFORM pg_temp.ok(_d->>'holder_name' = 'Nora Notesson (fiktiv)',
    '4.2 and the rest of the review payload is intact');
END $$;

-- A verifier reading the TABLE directly is denied the column like anyone
-- else. That is deliberate and not a regression: the capability check lives
-- in the function, and a table grant would hand the note to every
-- authenticated principal the policy admits, which is how this started.
DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', 'cd000000-0000-0000-0000-000000000009', true);
  PERFORM pg_temp.must_be_denied(
    'SELECT decision_note FROM public.sp_verification_decisions',
    '4.3 even a verifier reads the note through the RPC, not off the table');
END $$;


-- =============================================================================
\echo '    GROUP 5 -- the reviewer detail carries the facts a decision needs'
-- =============================================================================
DO $$
DECLARE _v uuid := 'cd000000-0000-0000-0000-000000000009'; _d jsonb; _c uuid;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _v::text, true);

  UPDATE public.sp_claims
     SET credential_reference = 'VU1-2026-001',
         claimed_issuer_name  = 'BYA',
         jurisdiction_code    = 'SE',
         issued_on            = DATE '2026-01-20',
         authorisation_scope  = 'Endast fiktiv uppdragsgivare'
   WHERE id = 'cd000000-0000-0000-0000-0000000000c1';

  _d := public.sp_verifier_request_detail('cd000000-0000-0000-0000-0000000000f1');

  PERFORM pg_temp.ok(_d->'claim'->>'credential_reference' = 'VU1-2026-001',
    '5.1 the credential reference reaches the reviewer');
  PERFORM pg_temp.ok(_d->'claim'->>'issuer' = 'BYA',
    '5.2 the claimed issuer reaches the reviewer');
  PERFORM pg_temp.ok(_d->'claim'->>'jurisdiction' = 'SE',
    '5.3 the jurisdiction reaches the reviewer');
  PERFORM pg_temp.ok(_d->'claim' ? 'sub_jurisdiction',
    '5.4 the sub-jurisdiction is carried -- a Dubai licence is not UAE-wide');
  PERFORM pg_temp.ok(_d->'claim'->>'authorisation_scope' = 'Endast fiktiv uppdragsgivare',
    '5.5 a scoped authorisation carries its limit');
  PERFORM pg_temp.ok(_d->'claim'->>'issued_on' = '2026-01-20',
    '5.6 the claimed issue date reaches the reviewer');
  PERFORM pg_temp.ok(_d->'claim' ? 'valid_from' AND _d->'claim' ? 'valid_until',
    '5.7 both ends of the claimed validity window are carried');

  -- Additive: everything Phase 10 returned is still returned.
  PERFORM pg_temp.ok(
    _d ? 'id' AND _d ? 'status' AND _d ? 'submitted_at' AND _d ? 'subject_type'
     AND _d ? 'is_self' AND _d ? 'holder_name' AND _d ? 'evidence'
     AND _d ? 'previous_versions' AND _d ? 'prior_decisions',
    '5.8 every key the Phase 10 payload carried is still present');
END $$;

-- Previous versions for an employment PERIOD, which the old function computed
-- for claims only -- so a period corrected after a rejection reached the
-- reviewer looking like a first submission.
DO $$
DECLARE _h uuid := 'cd000000-0000-0000-0000-000000000001';
        _old uuid; _new uuid; _req uuid; _d jsonb;
BEGIN
  INSERT INTO public.sp_experience_periods
    (holder_user_id, employer_name, role_title, employment_type, fte_fraction,
     security_relevance, security_fraction, started_on, ended_on, lifecycle_state)
  VALUES (_h,'Company X (fiktiv)','Security Officer','full_time',1.00,
          'primary',1.00, DATE '2024-01-01', DATE '2025-12-31','superseded')
  RETURNING id INTO _old;

  INSERT INTO public.sp_experience_periods
    (holder_user_id, employer_name, role_title, employment_type, fte_fraction,
     security_relevance, security_fraction, started_on, ended_on, supersedes_id, version_no)
  VALUES (_h,'Company X (fiktiv)','Security Officer','full_time',1.00,
          'primary',1.00, DATE '2024-01-01', DATE '2025-12-31', _old, 2)
  RETURNING id INTO _new;

  INSERT INTO public.sp_verification_requests
    (holder_user_id, period_id, request_kind, status)
  VALUES (_h, _new, 'cqrityjob_review', 'pending')
  RETURNING id INTO _req;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', 'cd000000-0000-0000-0000-000000000009', true);
  _d := public.sp_verifier_request_detail(_req);

  PERFORM pg_temp.ok(_d->>'subject_type' = 'experience',
    '5.9 an employment review is identified as one');
  PERFORM pg_temp.ok(_d->'period'->>'employer' = 'Company X (fiktiv)',
    '5.10 the employment facts reach the reviewer');
  PERFORM pg_temp.ok(_d->'period'->>'security_relevance' = 'primary',
    '5.11 security relevance -- which decides how much of it counts -- is carried');
  PERFORM pg_temp.ok(jsonb_array_length(_d->'previous_versions') = 1,
    '5.12 a corrected PERIOD shows its previous version, not an empty history');
  PERFORM pg_temp.ok(_d->'previous_versions'->0->>'id' = _old::text,
    '5.13 and it is the superseded row, named exactly');
END $$;


\echo '==> Security Passport internal note privacy: done'
