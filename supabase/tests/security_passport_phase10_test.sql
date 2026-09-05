-- =============================================================================
-- Security Passport — Phase 10 assertions: the verification decision itself
--
-- The production defect that produced this suite: a platform admin submitted a
-- credential on their own account, opened the verification queue and tried to
-- approve it. `sp_verifier_decide` refused with SP_SELF_VERIFICATION_FORBIDDEN
-- (42501) at the self-verification guard, before writing anything, and the UI
-- reported only "could not be saved, try again".
--
-- The refusal was correct. What was missing was any test that ran the REAL RPC
-- end to end and then looked at the rows it left behind — so nothing in the
-- suite could distinguish "the boundary held" from "the transaction is broken".
--
-- Every assertion below therefore does one of two things:
--
--   * runs `sp_verifier_decide` for real and asserts the RESULTING ROWS in
--     `sp_verification_requests`, `sp_verification_decisions`, `sp_claims` /
--     `sp_experience_periods` and `sp_passport_events` — not merely that the
--     call returned; or
--   * attempts a forbidden decision and asserts BOTH the refusal and that the
--     database is byte-for-byte unchanged afterwards.
--
-- All identities are transparently fictional and use a `da` prefix.
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

CREATE OR REPLACE FUNCTION pg_temp.must_fail(stmt text, needle text, label text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE _msg text;
BEGIN
  BEGIN EXECUTE stmt;
  EXCEPTION WHEN OTHERS THEN
    _msg := SQLERRM;
    IF needle <> '' AND position(lower(needle) IN lower(_msg)) = 0 THEN
      RAISE EXCEPTION 'ASSERTION FAILED: % -- wrong error: %', label, _msg;
    END IF;
    RAISE NOTICE 'ok  % (refused: %)', label, left(_msg, 80);
    RETURN;
  END;
  RAISE EXCEPTION 'ASSERTION FAILED: % -- SUCCEEDED but must be refused', label;
END $$;

-- A whole-database fingerprint of everything a decision is allowed to touch,
-- for one holder. Two identical fingerprints across a refused attempt is the
-- only honest way to assert "no partial write": counting rows in one table
-- would miss a decision row written before a later stage failed.
CREATE OR REPLACE FUNCTION pg_temp.trust_fingerprint(_holder uuid)
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT md5(concat_ws('|',
    (SELECT coalesce(string_agg(concat_ws(',', id, status, decided_by, decided_at,
                                          verification_method, valid_from, valid_until),
                                ';' ORDER BY id), '')
       FROM public.sp_verification_requests WHERE holder_user_id = _holder),
    (SELECT coalesce(string_agg(concat_ws(',', id, decision, decided_by, decider_organisation),
                                ';' ORDER BY id), '')
       FROM public.sp_verification_decisions WHERE holder_user_id = _holder),
    (SELECT coalesce(string_agg(concat_ws(',', id, assertion_level, lifecycle_state,
                                          verified_by_user_id, verified_at, valid_from, valid_until),
                                ';' ORDER BY id), '')
       FROM public.sp_claims WHERE holder_user_id = _holder),
    (SELECT coalesce(string_agg(concat_ws(',', id, assertion_level, lifecycle_state),
                                ';' ORDER BY id), '')
       FROM public.sp_experience_periods WHERE holder_user_id = _holder),
    (SELECT coalesce(string_agg(concat_ws(',', id, event_type, subject_id), ';' ORDER BY id), '')
       FROM public.sp_passport_events WHERE holder_user_id = _holder)
  ));
$$;

\echo '==> Security Passport Phase 10'

-- -----------------------------------------------------------------------------
-- Fictional cast
-- -----------------------------------------------------------------------------
--   ...01  holder
--   ...02  a second holder, used for the experience-period approval
--   ...09  verifier (platform admin, and NOT a holder of anything here)
--   ...08  a platform admin who is ALSO the holder — the production defect
--   ...07  an authenticated user who is not a verifier at all
INSERT INTO auth.users (id, email) VALUES
  ('da000000-0000-0000-0000-000000000001','p10-holder@example.test'),
  ('da000000-0000-0000-0000-000000000002','p10-holder2@example.test'),
  ('da000000-0000-0000-0000-000000000007','p10-outsider@example.test'),
  ('da000000-0000-0000-0000-000000000008','p10-admin-holder@example.test'),
  ('da000000-0000-0000-0000-000000000009','p10-verifier@example.test')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.sp_passport_profiles (holder_user_id, display_name) VALUES
  ('da000000-0000-0000-0000-000000000001','Petra Prov (fiktiv)'),
  ('da000000-0000-0000-0000-000000000002','Bo Bevakning (fiktiv)'),
  ('da000000-0000-0000-0000-000000000008','Alva Admin (fiktiv)')
ON CONFLICT (holder_user_id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('da000000-0000-0000-0000-000000000009','admin'),
  ('da000000-0000-0000-0000-000000000008','admin')
ON CONFLICT DO NOTHING;

-- A helper that builds one fresh claim + pending review, so each group starts
-- from a known state instead of inheriting the previous group's decisions.
CREATE OR REPLACE FUNCTION pg_temp.new_claim_request(_holder uuid, _code text DEFAULT 'OV')
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE _claim uuid; _req uuid;
BEGIN
  INSERT INTO public.sp_claims
    (holder_user_id, claim_type, title, credential_code, assertion_level,
     lifecycle_state, claimed_issuer_name, valid_from, valid_until)
  VALUES (_holder, 'licence',
          -- The definition's own name, not the code. A governed credential is
          -- named by its taxonomy row, so a fixture that titles one "OV" is a
          -- row that could not exist.
          (SELECT name_sv FROM public.sp_credential_types WHERE code = _code),
          _code, 'document_provided', 'active',
          'Fiktiv myndighet', DATE '2026-01-01', DATE '2026-12-31')
  RETURNING id INTO _claim;

  INSERT INTO public.sp_verification_requests (holder_user_id, request_kind, status, claim_id)
  VALUES (_holder, 'cqrityjob_review', 'pending', _claim)
  RETURNING id INTO _req;

  RETURN _req;
END $$;


-- =============================================================================
\echo '    GROUP 1 -- approving a credential claim writes all four records'
-- =============================================================================
DO $$
DECLARE
  _h uuid := 'da000000-0000-0000-0000-000000000001';
  _v uuid := 'da000000-0000-0000-0000-000000000009';
  _req uuid; _claim uuid; _r record;
BEGIN
  _req := pg_temp.new_claim_request(_h);
  SELECT claim_id INTO _claim FROM public.sp_verification_requests WHERE id = _req;

  PERFORM set_config('request.jwt.claim.sub', _v::text, true);
  PERFORM public.sp_verifier_decide(_req, 'approved', 'document_review',
    'internal reasoning', 'message to holder', DATE '2026-08-01', DATE '2026-09-24');

  -- 1. approving a credential claim / 8. request status transition
  SELECT * INTO _r FROM public.sp_verification_requests WHERE id = _req;
  PERFORM pg_temp.ok(_r.status = 'approved', '1.1 request status becomes approved');
  PERFORM pg_temp.ok(_r.decided_by = _v, '1.2 request records who decided');
  PERFORM pg_temp.ok(_r.decided_at IS NOT NULL, '1.3 request records when');

  -- 5. approval with document_review / 6. valid-from and valid-until persistence
  PERFORM pg_temp.ok(_r.verification_method = 'document_review',
    '1.4 document_review is stored as the method');
  PERFORM pg_temp.ok(_r.valid_from = DATE '2026-08-01' AND _r.valid_until = DATE '2026-09-24',
    '1.5 the validity period submitted is the validity period stored');

  -- 7. decision attribution / 9. immutable decision log
  SELECT * INTO _r FROM public.sp_verification_decisions WHERE request_id = _req;
  PERFORM pg_temp.ok(_r.decision = 'approved', '1.6 a decision row is written');
  PERFORM pg_temp.ok(_r.decided_by = _v AND _r.decider_organisation = 'CQrityjob',
    '1.7 the decision names the decider and the organisation');
  PERFORM pg_temp.ok(_r.verification_method = 'document_review',
    '1.8 the decision log carries the method');
  PERFORM pg_temp.ok(_r.decision_note = 'internal reasoning',
    '1.9 internal reasoning is stored on the decision, not the request alone');

  -- the trust change on the claim
  SELECT * INTO _r FROM public.sp_claims WHERE id = _claim;
  PERFORM pg_temp.ok(_r.assertion_level = 'verified', '1.10 the claim becomes verified');
  PERFORM pg_temp.ok(_r.verified_by_user_id = _v AND _r.verified_at IS NOT NULL,
    '1.11 the claim carries attribution (sp_claim_verified_is_attributed)');
  PERFORM pg_temp.ok(_r.valid_from = DATE '2026-08-01' AND _r.valid_until = DATE '2026-09-24',
    '1.12 the decided validity is written onto the claim');

  -- 10. correct Passport event
  SELECT * INTO _r FROM public.sp_passport_events
   WHERE subject_id = _claim AND actor_user_id = _v;
  PERFORM pg_temp.ok(_r.event_type = 'verification_decided',
    '1.13 the audit event says verification_decided, not claim_corrected');
  PERFORM pg_temp.ok(_r.detail->>'decision' = 'approved'
                 AND _r.detail->>'method' = 'document_review'
                 AND _r.detail->>'organisation' = 'CQrityjob',
    '1.14 the audit event records what was decided, how and by whom');
END $$;


-- =============================================================================
\echo '    GROUP 2 -- rejection and clarification decide without granting trust'
-- =============================================================================
DO $$
DECLARE
  _h uuid := 'da000000-0000-0000-0000-000000000001';
  _v uuid := 'da000000-0000-0000-0000-000000000009';
  _req uuid; _claim uuid; _r record; _n int;
BEGIN
  -- 2. rejecting a credential claim
  _req := pg_temp.new_claim_request(_h);
  SELECT claim_id INTO _claim FROM public.sp_verification_requests WHERE id = _req;

  PERFORM set_config('request.jwt.claim.sub', _v::text, true);
  PERFORM public.sp_verifier_decide(_req, 'rejected', 'document_review',
    'not enough', 'please resubmit', NULL, NULL);

  SELECT * INTO _r FROM public.sp_verification_requests WHERE id = _req;
  PERFORM pg_temp.ok(_r.status = 'rejected', '2.1 a rejection is recorded as rejected');

  SELECT * INTO _r FROM public.sp_claims WHERE id = _claim;
  PERFORM pg_temp.ok(_r.assertion_level = 'document_provided',
    '2.2 a rejection does NOT raise the claim''s trust');
  PERFORM pg_temp.ok(_r.verified_by_user_id IS NULL AND _r.verified_at IS NULL,
    '2.3 a rejection leaves no verification attribution behind');

  SELECT count(*) INTO _n FROM public.sp_verification_decisions WHERE request_id = _req;
  PERFORM pg_temp.ok(_n = 1, '2.4 a rejection is still written to the decision log');

  -- 3. requesting clarification
  _req := pg_temp.new_claim_request(_h);
  SELECT claim_id INTO _claim FROM public.sp_verification_requests WHERE id = _req;

  PERFORM public.sp_verifier_decide(_req, 'clarification_requested', NULL,
    'need the back page', 'please upload the reverse side', NULL, NULL);

  SELECT * INTO _r FROM public.sp_verification_requests WHERE id = _req;
  PERFORM pg_temp.ok(_r.status = 'clarification_requested',
    '2.5 clarification is recorded as clarification_requested');
  PERFORM pg_temp.ok(_r.holder_message = 'please upload the reverse side',
    '2.6 the holder is told what is missing');

  SELECT * INTO _r FROM public.sp_claims WHERE id = _claim;
  PERFORM pg_temp.ok(_r.assertion_level = 'document_provided',
    '2.7 clarification does not raise trust either');

  -- and a clarified request stays decidable, which is the whole point of it
  PERFORM public.sp_verifier_decide(_req, 'approved', 'document_review',
    'reverse side received', 'approved', DATE '2026-02-01', DATE '2026-11-30');
  SELECT * INTO _r FROM public.sp_verification_requests WHERE id = _req;
  PERFORM pg_temp.ok(_r.status = 'approved',
    '2.8 a clarification_requested review can still be decided afterwards');

  SELECT count(*) INTO _n FROM public.sp_verification_decisions WHERE request_id = _req;
  PERFORM pg_temp.ok(_n = 2,
    '2.9 both decisions survive — the log appends, it does not overwrite');
END $$;


-- =============================================================================
\echo '    GROUP 3 -- approving an experience period'
-- =============================================================================
DO $$
DECLARE
  _h uuid := 'da000000-0000-0000-0000-000000000002';
  _v uuid := 'da000000-0000-0000-0000-000000000009';
  _period uuid; _req uuid; _r record;
BEGIN
  INSERT INTO public.sp_experience_periods
    (holder_user_id, employer_name, role_title, employment_type, fte_fraction,
     security_relevance, security_fraction, started_on, ended_on)
  VALUES (_h, 'P10 Bevakning AB (fiktiv)', 'Väktare', 'full_time', 1.00,
          'primary', 1.00, DATE '2022-03-01', DATE '2024-03-01')
  RETURNING id INTO _period;

  INSERT INTO public.sp_verification_requests (holder_user_id, request_kind, status, period_id)
  VALUES (_h, 'cqrityjob_review', 'pending', _period)
  RETURNING id INTO _req;

  PERFORM set_config('request.jwt.claim.sub', _v::text, true);
  -- document_review, not employer_confirmation: since 20261029090000 a
  -- cqrityjob_review approval may record only the method its decider can
  -- truthfully use. A reviewer who telephoned the employer performed a
  -- CQrityjob review; the employer's own confirmation arrives through the
  -- employer_attestation path. This group is about approving a PERIOD.
  PERFORM public.sp_verifier_decide(_req, 'approved', 'document_review',
    'reviewed the contract', 'employment reviewed', NULL, NULL);

  -- 4. approving an experience period
  SELECT * INTO _r FROM public.sp_experience_periods WHERE id = _period;
  PERFORM pg_temp.ok(_r.assertion_level = 'verified',
    '3.1 an approved employment period becomes verified');

  SELECT * INTO _r FROM public.sp_verification_requests WHERE id = _req;
  PERFORM pg_temp.ok(_r.status = 'approved' AND _r.decided_by = _v,
    '3.2 the period''s request is decided and attributed');

  SELECT * INTO _r FROM public.sp_passport_events
   WHERE subject_id = _period AND actor_user_id = _v;
  PERFORM pg_temp.ok(_r.event_type = 'verification_decided' AND _r.subject_type = 'experience',
    '3.3 the audit event is filed against the experience');
END $$;


-- =============================================================================
\echo '    GROUP 4 -- the holder cannot decide, and nothing moves when they try'
-- =============================================================================
-- This is the exact production failure: the caller is a real platform admin,
-- passes `sp_is_verifier`, and is refused anyway because the request is theirs.
DO $$
DECLARE
  _ah uuid := 'da000000-0000-0000-0000-000000000008';  -- admin AND holder
  _h  uuid := 'da000000-0000-0000-0000-000000000001';
  _req uuid; _before text; _after text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', _ah::text, true);
  PERFORM pg_temp.ok(public.sp_is_verifier(_ah),
    '4.1 the caller genuinely holds the verifier capability');

  _req := pg_temp.new_claim_request(_ah);
  _before := pg_temp.trust_fingerprint(_ah);

  -- 11. holder cannot decide
  PERFORM pg_temp.must_fail(format(
    $q$SELECT public.sp_verifier_decide(%L::uuid,'approved','document_review','OK','OK',
                                        DATE '2026-08-01', DATE '2026-09-24')$q$, _req),
    'SP_SELF_VERIFICATION_FORBIDDEN',
    '4.2 a verifier may not decide their own request');

  -- 14. a failed transaction leaves no partial mutation
  _after := pg_temp.trust_fingerprint(_ah);
  PERFORM pg_temp.ok(_before = _after,
    '4.3 the refused self-decision left no request, decision, trust or event change');

  -- and the queue tells them BEFORE they act, which is the defect being fixed
  PERFORM pg_temp.ok(
    (SELECT bool_or((x->>'is_self')::boolean)
       FROM jsonb_array_elements(public.sp_verifier_queue(NULL)) x
      WHERE x->>'id' = _req::text),
    '4.4 the queue marks the reviewer''s own request is_self');
  PERFORM pg_temp.ok(
    (public.sp_verifier_request_detail(_req)->>'is_self')::boolean,
    '4.5 the review detail marks it too');

  -- and it is NOT marked for a different verifier, who may decide it
  PERFORM set_config('request.jwt.claim.sub', 'da000000-0000-0000-0000-000000000009', true);
  PERFORM pg_temp.ok(
    (public.sp_verifier_request_detail(_req)->>'is_self')::boolean IS FALSE,
    '4.6 the same review is not is_self for another verifier');

  -- the holder-owned request is still there, still pending, still decidable by
  -- somebody else — refusing is not the same as closing
  PERFORM pg_temp.ok(
    (SELECT status FROM public.sp_verification_requests WHERE id = _req) = 'pending',
    '4.7 the refused request remains open for another reviewer');

  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
END $$;


-- =============================================================================
\echo '    GROUP 5 -- a non-verifier cannot decide'
-- =============================================================================
DO $$
DECLARE
  _h uuid := 'da000000-0000-0000-0000-000000000001';
  _o uuid := 'da000000-0000-0000-0000-000000000007';  -- authenticated, not a verifier
  _req uuid; _before text; _after text;
BEGIN
  _req := pg_temp.new_claim_request(_h);
  _before := pg_temp.trust_fingerprint(_h);

  PERFORM set_config('request.jwt.claim.sub', _o::text, true);
  PERFORM pg_temp.ok(NOT public.sp_is_verifier(_o),
    '5.1 the caller does not hold the verifier capability');

  -- 12. non-verifier cannot decide
  PERFORM pg_temp.must_fail(format(
    $q$SELECT public.sp_verifier_decide(%L::uuid,'approved','document_review',NULL,NULL,NULL,NULL)$q$,
    _req), 'SP_NOT_VERIFIER',
    '5.2 a non-verifier is refused');

  _after := pg_temp.trust_fingerprint(_h);
  PERFORM pg_temp.ok(_before = _after,
    '5.3 the refused non-verifier decision left nothing behind');

  -- the queue itself is closed to them, so they never see the request
  PERFORM pg_temp.must_fail(
    'SELECT public.sp_verifier_queue(NULL)', 'SP_NOT_VERIFIER',
    '5.4 a non-verifier cannot read the queue at all');
  PERFORM pg_temp.must_fail(format(
    'SELECT public.sp_verifier_request_detail(%L::uuid)', _req), 'SP_NOT_VERIFIER',
    '5.5 a non-verifier cannot read a review');
END $$;


-- =============================================================================
\echo '    GROUP 6 -- a decided request cannot be decided again'
-- =============================================================================
DO $$
DECLARE
  _h uuid := 'da000000-0000-0000-0000-000000000001';
  _v uuid := 'da000000-0000-0000-0000-000000000009';
  _req uuid; _claim uuid; _before text; _after text; _n int;
BEGIN
  _req := pg_temp.new_claim_request(_h);
  SELECT claim_id INTO _claim FROM public.sp_verification_requests WHERE id = _req;

  PERFORM set_config('request.jwt.claim.sub', _v::text, true);
  -- document_review: the only method a cqrityjob_review approval may record
  -- since 20261029090000 (issuer_confirmation is refused for every kind until
  -- an issuer can act). This group is about deciding TWICE, not the method.
  PERFORM public.sp_verifier_decide(_req, 'approved', 'document_review',
    'first', 'first', DATE '2026-03-01', DATE '2026-10-01');

  _before := pg_temp.trust_fingerprint(_h);

  -- 13. already-decided request cannot be decided again
  PERFORM pg_temp.must_fail(format(
    $q$SELECT public.sp_verifier_decide(%L::uuid,'rejected','document_review','second','second',NULL,NULL)$q$,
    _req), 'SP_REQUEST_ALREADY_DECIDED',
    '6.1 a decided request refuses a second decision');

  _after := pg_temp.trust_fingerprint(_h);
  PERFORM pg_temp.ok(_before = _after,
    '6.2 the refused second decision changed nothing');

  SELECT count(*) INTO _n FROM public.sp_verification_decisions WHERE request_id = _req;
  PERFORM pg_temp.ok(_n = 1, '6.3 exactly one decision remains on the log');

  -- 9. immutable decision log — the row cannot be rewritten or removed
  PERFORM pg_temp.must_fail(format(
    $q$UPDATE public.sp_verification_decisions SET decision = 'rejected' WHERE request_id = %L$q$, _req),
    'SP_DECISIONS_APPEND_ONLY',
    '6.4 a decision row cannot be rewritten');
  PERFORM pg_temp.must_fail(format(
    'DELETE FROM public.sp_verification_decisions WHERE request_id = %L', _req),
    '', '6.5 a decision row cannot be deleted');

  -- a missing request is refused too, and says so distinctly
  PERFORM pg_temp.must_fail(
    $q$SELECT public.sp_verifier_decide('da000000-0000-0000-0000-0000000000ff'::uuid,
        'approved','document_review',NULL,NULL,NULL,NULL)$q$,
    'SP_REQUEST_NOT_FOUND',
    '6.6 a request that does not exist is refused distinctly');
END $$;


-- =============================================================================
\echo '    GROUP 7 -- an invalid validity period aborts the whole transaction'
-- =============================================================================
-- The decision must be atomic: the request update, the decision row, the trust
-- change and the audit event either all land or none do. This proves it by
-- failing the LAST stage that can fail — the claim's own validity rule — and
-- then checking that the three earlier writes were rolled back with it.
DO $$
DECLARE
  _h uuid := 'da000000-0000-0000-0000-000000000001';
  _v uuid := 'da000000-0000-0000-0000-000000000009';
  _req uuid; _claim uuid; _before text; _after text;
BEGIN
  _req := pg_temp.new_claim_request(_h);
  SELECT claim_id INTO _claim FROM public.sp_verification_requests WHERE id = _req;

  PERFORM set_config('request.jwt.claim.sub', _v::text, true);
  _before := pg_temp.trust_fingerprint(_h);

  PERFORM pg_temp.must_fail(format(
    $q$SELECT public.sp_verifier_decide(%L::uuid,'approved','document_review','x','x',
                                        DATE '2026-09-24', DATE '2026-08-01')$q$, _req),
    'sp_claim_validity_ordered',
    '7.1 valid_until before valid_from is refused');

  _after := pg_temp.trust_fingerprint(_h);
  PERFORM pg_temp.ok(_before = _after,
    '7.2 the aborted approval rolled back the request, the decision log, the trust change and the event');

  PERFORM pg_temp.ok(
    (SELECT status FROM public.sp_verification_requests WHERE id = _req) = 'pending',
    '7.3 the request is still pending and can be decided correctly afterwards');
  PERFORM pg_temp.ok(
    (SELECT assertion_level FROM public.sp_claims WHERE id = _claim) = 'document_provided',
    '7.4 the claim was not left verified by a half-finished approval');

  -- and the same review then succeeds with a sane period, proving the refusal
  -- did not poison it
  PERFORM public.sp_verifier_decide(_req, 'approved', 'document_review', 'x', 'x',
                                    DATE '2026-08-01', DATE '2026-09-24');
  PERFORM pg_temp.ok(
    (SELECT assertion_level FROM public.sp_claims WHERE id = _claim) = 'verified',
    '7.5 a correct validity period is accepted on the same review');
END $$;


-- =============================================================================
\echo '    GROUP 8 -- the event-type allowlist matches what the app writes'
-- =============================================================================
-- The other half of the production defect: `saveCredentialDraft` writes
-- `claim_drafted`, the CHECK rejected it with 23514, and the insert's error was
-- discarded — so drafts were created with no audit event at all.
DO $$
DECLARE _h uuid := 'da000000-0000-0000-0000-000000000001'; _n int;
BEGIN
  INSERT INTO public.sp_passport_events
    (holder_user_id, actor_user_id, event_type, subject_type, subject_id, detail)
  VALUES (_h, _h, 'claim_drafted', 'claim', gen_random_uuid(), '{}'::jsonb);

  SELECT count(*) INTO _n FROM public.sp_passport_events
   WHERE holder_user_id = _h AND event_type = 'claim_drafted';
  PERFORM pg_temp.ok(_n = 1, '8.1 claim_drafted is an accepted event type');

  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.sp_passport_events
      WHERE holder_user_id = _h AND event_type = 'verification_decided') > 0,
    '8.2 verification_decided is an accepted event type and is being written');

  -- still fails closed for anything genuinely unknown
  PERFORM pg_temp.must_fail(format(
    $q$INSERT INTO public.sp_passport_events
         (holder_user_id, actor_user_id, event_type, subject_type, subject_id, detail)
       VALUES (%L,%L,'claim_teleported','claim',gen_random_uuid(),'{}'::jsonb)$q$, _h, _h),
    'sp_passport_events_event_type_check',
    '8.3 an event type nobody defined is still refused');

  -- and history stays append-only
  PERFORM pg_temp.must_fail(format(
    $q$UPDATE public.sp_passport_events SET event_type = 'claim_created'
        WHERE holder_user_id = %L AND event_type = 'claim_drafted'$q$, _h),
    '', '8.4 an audit event cannot be rewritten');
END $$;


-- =============================================================================
\echo '    GROUP 10 -- a refusal must say why (candidate-facing reason)'
-- =============================================================================
-- The defect: `sp_verifier_decide` accepted 'rejected' and
-- 'clarification_requested' with `_holder_message` NULL. The holder then read
-- a state and nothing else — "Avslagen", or the worse "Komplettering begärd",
-- which demands an action it does not describe. A person cannot correct a
-- document nobody told them was wrong.
--
-- The reviewer form and the TypeScript server function refuse this too, and
-- neither is the control: this function is EXECUTE-granted to `authenticated`,
-- so a signed-in verifier can call it directly through PostgREST and never
-- touch a line of application code. These assertions run the RPC the way such
-- a crafted call would, and check the rows afterwards — a refusal that left a
-- half-written decision behind would be no better than no refusal.
DO $$
DECLARE
  _h uuid := 'da000000-0000-0000-0000-000000000001';
  _v uuid := 'da000000-0000-0000-0000-000000000009';
  _req uuid; _before text; _r record; _n int;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', _v::text, true);

  -- ── rejection with NO message ────────────────────────────────────────
  _req := pg_temp.new_claim_request(_h);
  _before := pg_temp.trust_fingerprint(_h);

  PERFORM pg_temp.must_fail(format(
    $q$SELECT public.sp_verifier_decide(%L,'rejected','document_review','internal only',NULL,NULL,NULL)$q$,
    _req),
    'SP_DECISION_REQUIRES_HOLDER_MESSAGE',
    '10.1 a rejection with no candidate-facing reason is refused');

  PERFORM pg_temp.ok(pg_temp.trust_fingerprint(_h) = _before,
    '10.2 the refused rejection left the database byte-for-byte unchanged');

  SELECT * INTO _r FROM public.sp_verification_requests WHERE id = _req;
  PERFORM pg_temp.ok(_r.status = 'pending',
    '10.3 the request is still pending, not half-decided');

  -- ── rejection with a WHITESPACE message ──────────────────────────────
  -- A space is not a reason. Without btrim this rule would be one a caller
  -- passes by pressing the space bar.
  PERFORM pg_temp.must_fail(format(
    $q$SELECT public.sp_verifier_decide(%L,'rejected','document_review',NULL,'   ',NULL,NULL)$q$,
    _req),
    'SP_DECISION_REQUIRES_HOLDER_MESSAGE',
    '10.4 a rejection whose reason is only whitespace is refused');

  -- ── clarification with NO message ────────────────────────────────────
  PERFORM pg_temp.must_fail(format(
    $q$SELECT public.sp_verifier_decide(%L,'clarification_requested',NULL,'internal only',NULL,NULL,NULL)$q$,
    _req),
    'SP_DECISION_REQUIRES_HOLDER_MESSAGE',
    '10.5 a clarification request with no explanation is refused');

  PERFORM pg_temp.must_fail(format(
    $q$SELECT public.sp_verifier_decide(%L,'clarification_requested',NULL,NULL,E'\t\n ',NULL,NULL)$q$,
    _req),
    'SP_DECISION_REQUIRES_HOLDER_MESSAGE',
    '10.6 a clarification request explained only by whitespace is refused');

  -- ── the same decisions WITH a reason still go through ────────────────
  -- The guard must refuse the reasonless call and nothing else. A rule that
  -- also broke the legitimate path would be a regression wearing a fix.
  PERFORM public.sp_verifier_decide(_req, 'rejected', 'document_review',
    'internal: scan is illegible', 'The uploaded certificate does not show the required training level.',
    NULL, NULL);

  SELECT * INTO _r FROM public.sp_verification_requests WHERE id = _req;
  PERFORM pg_temp.ok(_r.status = 'rejected',
    '10.7 a rejection that carries a reason is still accepted');
  PERFORM pg_temp.ok(
    _r.holder_message = 'The uploaded certificate does not show the required training level.',
    '10.8 the candidate-facing reason is what was stored');
  PERFORM pg_temp.ok(_r.decision_note = 'internal: scan is illegible',
    '10.9 the internal note is stored separately and is not the holder message');

  -- ── the internal note stays OPTIONAL ─────────────────────────────────
  -- Requiring a candidate-facing reason must say nothing about the reviewer's
  -- private reasoning. Two fields, two rules.
  _req := pg_temp.new_claim_request(_h);
  PERFORM public.sp_verifier_decide(_req, 'clarification_requested', NULL,
    NULL, 'Please upload the page showing the certificate number.', NULL, NULL);

  SELECT * INTO _r FROM public.sp_verification_requests WHERE id = _req;
  PERFORM pg_temp.ok(_r.status = 'clarification_requested' AND _r.decision_note IS NULL,
    '10.10 decision_note is still optional — only the holder message is required');

  -- ── approval behaviour is UNCHANGED ──────────────────────────────────
  -- What an approval owes the holder is the METHOD, which is enforced in the
  -- server function exactly as before. This migration did not touch it, and an
  -- approval with no holder message is still a perfectly good approval.
  _req := pg_temp.new_claim_request(_h);
  PERFORM public.sp_verifier_decide(_req, 'approved', 'document_review',
    NULL, NULL, DATE '2026-02-01', DATE '2026-11-30');

  SELECT * INTO _r FROM public.sp_verification_requests WHERE id = _req;
  PERFORM pg_temp.ok(_r.status = 'approved' AND _r.holder_message IS NULL,
    '10.11 an approval with no holder message is unaffected by the new rule');

  SELECT count(*) INTO _n FROM public.sp_verification_decisions WHERE request_id = _req;
  PERFORM pg_temp.ok(_n = 1, '10.12 the approval still wrote exactly one decision record');

  -- ── the guard is not a way past the other guards ─────────────────────
  -- Ordering matters: a holder deciding their own request must still be
  -- refused for SELF-VERIFICATION, not told to write a nicer message. A guard
  -- that fires first would tell an unauthorised caller which field to fix.
  _req := pg_temp.new_claim_request(_h);
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  PERFORM pg_temp.must_fail(format(
    $q$SELECT public.sp_verifier_decide(%L,'rejected',NULL,NULL,NULL,NULL,NULL)$q$, _req),
    'SP_SELF_VERIFICATION_FORBIDDEN',
    '10.13 self-verification is still refused before the message rule is reached');

  PERFORM set_config('request.jwt.claim.sub', _v::text, true);
END $$;


-- =============================================================================
\echo '    GROUP 9 -- cleanup'
-- =============================================================================
-- The append-only guards permit deletion only once the holder no longer exists
-- in `auth.users` — that is the account-deletion path, and it is the only way
-- history may leave. So the fictional users go first and the rest follows them,
-- which also exercises that the guard lets a real erasure through.
DO $$
DECLARE _ids uuid[] := ARRAY[
  'da000000-0000-0000-0000-000000000001','da000000-0000-0000-0000-000000000002',
  'da000000-0000-0000-0000-000000000007','da000000-0000-0000-0000-000000000008',
  'da000000-0000-0000-0000-000000000009']::uuid[];
  _left int;
BEGIN
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);

  DELETE FROM auth.users WHERE id = ANY(_ids);

  DELETE FROM public.sp_passport_events        WHERE holder_user_id = ANY(_ids);
  DELETE FROM public.sp_verification_decisions WHERE holder_user_id = ANY(_ids);
  DELETE FROM public.sp_verification_requests  WHERE holder_user_id = ANY(_ids);
  DELETE FROM public.sp_claims                 WHERE holder_user_id = ANY(_ids);
  DELETE FROM public.sp_experience_periods     WHERE holder_user_id = ANY(_ids);
  DELETE FROM public.sp_passport_profiles      WHERE holder_user_id = ANY(_ids);
  DELETE FROM public.user_roles                WHERE user_id = ANY(_ids);

  SELECT (SELECT count(*) FROM public.sp_claims WHERE holder_user_id = ANY(_ids))
       + (SELECT count(*) FROM public.sp_verification_requests WHERE holder_user_id = ANY(_ids))
       + (SELECT count(*) FROM public.sp_verification_decisions WHERE holder_user_id = ANY(_ids))
       + (SELECT count(*) FROM public.sp_passport_events WHERE holder_user_id = ANY(_ids))
       + (SELECT count(*) FROM public.sp_experience_periods WHERE holder_user_id = ANY(_ids))
       + (SELECT count(*) FROM auth.users WHERE id = ANY(_ids))
    INTO _left;
  PERFORM pg_temp.ok(_left = 0, '9.1 every fictional Phase 10 record is gone');
END $$;

\echo '==> Security Passport Phase 10 OK'
