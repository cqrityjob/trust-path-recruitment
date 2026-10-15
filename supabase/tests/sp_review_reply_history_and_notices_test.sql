-- 20270316090000: case-bound clarification reply, decision history, one
-- current review state, notices and metrics.
--
--   RH-F  fixture: holder A, holder B, verifier V (passport_verifier),
--         signed-in non-verifier N, platform admin P.
--   RH1   a request notifies the reviewer once; first merit and review request
--         are counted without any person in the metric row.
--   RH2   a clarification is recorded with its message on the DECISION row and
--         notifies the holder.
--   RH3   the holder answers with text, bound to the version: the request
--         returns to review with a new version, the reply is readable by the
--         holder and the reviewer, and the reviewer is notified once.
--   RH4   double click / retry returns the same reply; a different text for the
--         same version, another holder, and a request not awaiting a reply are
--         refused.
--   RH5   the reviewer's page opened before the reply is refused (SP_REVIEW_STALE);
--         after reload the approval goes through.
--   RH6   approval -> revocation -> new approval: one current state each time,
--         the entry is active and verified at the end, history in order.
--   RH7   rejection keeps its message in history; a new request is the current state.
--   RH8   who may read: the internal note only for the reviewer; a non-verifier
--         and another holder read nothing.
--   RH9   inbox: own notices only, mark read; e-mail claim is service-role only,
--         re-checks the reviewer role at claim time and settles idempotently.
--   RH10  a material correction of a reviewed merit starts as self-declared.
--   RH11  grants: anon executes nothing; workers are not client-callable;
--         metrics are readable by a platform admin only.
--
-- Synthetic principals; everything rolls back.

\set ON_ERROR_STOP on
SET client_min_messages TO NOTICE;
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.ok(cond boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF cond IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: %', label; END IF;
  RAISE NOTICE 'ok  %', label;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.as_user(_uid text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', _uid, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _uid)::text, true);
END $$;

-- Run _sql as _uid; returns 'ok' or 'err:<first part of the message>'.
CREATE OR REPLACE FUNCTION pg_temp.try_as(_uid text, _sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE _r text := 'ok';
BEGIN
  PERFORM pg_temp.as_user(_uid);
  SET LOCAL ROLE authenticated;
  BEGIN EXECUTE _sql; EXCEPTION WHEN OTHERS THEN _r := 'err:' || split_part(SQLERRM, ':', 1); END;
  RESET ROLE;
  PERFORM pg_temp.as_user('');
  RETURN _r;
END $$;

-- Evaluate a jsonb expression as _uid.
CREATE OR REPLACE FUNCTION pg_temp.j_as(_uid text, _sql text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE _r jsonb;
BEGIN
  PERFORM pg_temp.as_user(_uid);
  SET LOCAL ROLE authenticated;
  EXECUTE _sql INTO _r;
  RESET ROLE;
  PERFORM pg_temp.as_user('');
  RETURN _r;
END $$;

-- A governed catalogue claim, as the save RPC would write it.
CREATE OR REPLACE FUNCTION pg_temp.claim(_holder uuid, _code text, _valid_until date, _scope text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE d public.sp_approved_credential_catalogue%ROWTYPE; _id uuid;
BEGIN
  SELECT * INTO d FROM public.sp_approved_credential_catalogue WHERE code = _code;
  INSERT INTO public.sp_claims (holder_user_id, claim_type, title, credential_code, claimed_issuer_name,
                                jurisdiction_code, sub_jurisdiction_code, valid_until, authorisation_scope,
                                lifecycle_state, assertion_level)
  VALUES (_holder, d.claim_type, d.name_en, _code, coalesce(d.issuer_name, 'Synthetic issuer'),
          d.country, d.region, _valid_until, _scope, 'active', 'self_declared')
  RETURNING id INTO _id;
  RETURN _id;
END $$;

CREATE TEMP TABLE f AS SELECT
  'a7160000-0000-4000-8000-00000000000a'::uuid AS a,
  'a7160000-0000-4000-8000-00000000000b'::uuid AS b,
  'a7160000-0000-4000-8000-00000000000c'::uuid AS v,
  'a7160000-0000-4000-8000-00000000000d'::uuid AS n,
  'a7160000-0000-4000-8000-00000000000e'::uuid AS p;
GRANT SELECT ON f TO PUBLIC;

INSERT INTO auth.users (id, email) SELECT a, 'rh-holder-a@synthetic.invalid' FROM f
  UNION ALL SELECT b, 'rh-holder-b@synthetic.invalid' FROM f
  UNION ALL SELECT v, 'rh-verifier@synthetic.invalid' FROM f
  UNION ALL SELECT n, 'rh-member@synthetic.invalid' FROM f
  UNION ALL SELECT p, 'rh-admin@synthetic.invalid' FROM f;
INSERT INTO public.user_roles (user_id, role) SELECT v, 'passport_verifier'::public.app_role FROM f UNION ALL SELECT p, 'superadmin'::public.app_role FROM f;

DO $$ BEGIN RAISE NOTICE 'GROUP RH1 — request notifies the reviewer; metrics hold no person'; END $$;
CREATE TEMP TABLE metric_before AS SELECT event_name, count(*) n FROM public.product_metric_events GROUP BY 1;
CREATE TEMP TABLE c AS SELECT pg_temp.claim((SELECT a FROM f), 'INTL_ASIS_CPP', current_date + 400) AS cpp,
                             pg_temp.claim((SELECT a FROM f), 'VU1', NULL) AS vu1;
GRANT SELECT ON c TO PUBLIC;
CREATE TEMP TABLE r AS SELECT (pg_temp.j_as((SELECT a::text FROM f),
  format('SELECT to_jsonb(public.sp_submit_for_verification(%L, NULL, ''cqrityjob_review'', NULL))', (SELECT cpp FROM c)))#>>'{}')::uuid AS req;
GRANT SELECT ON r TO PUBLIC;
SELECT pg_temp.ok((SELECT count(*) FROM public.user_notices WHERE kind = 'passport_review_requested'
                     AND recipient_user_id = (SELECT v FROM f) AND request_id = (SELECT req FROM r)) = 1,
                  'RH1.1 the verifier receives one review-requested notice');
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM public.user_notices WHERE recipient_user_id IN (SELECT a FROM f UNION SELECT p FROM f UNION SELECT n FROM f)),
                  'RH1.2 nobody else is notified (platform admins see the queue, not mail)');
SELECT pg_temp.ok((SELECT count(*) FROM public.product_metric_events WHERE event_name = 'passport_first_merit_saved')
                    = coalesce((SELECT n FROM metric_before WHERE event_name = 'passport_first_merit_saved'), 0) + 1,
                  'RH1.3 the first merit is counted once, the second is not');
SELECT pg_temp.ok((SELECT count(*) FROM public.product_metric_events WHERE event_name = 'passport_review_requested')
                    = coalesce((SELECT n FROM metric_before WHERE event_name = 'passport_review_requested'), 0) + 1,
                  'RH1.4 the review request is counted');
SELECT pg_temp.ok((SELECT array_agg(column_name::text ORDER BY column_name) FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'product_metric_events') = ARRAY['event_name','id','occurred_at'],
                  'RH1.5 a metric row has no person, no content');

DO $$ BEGIN RAISE NOTICE 'GROUP RH2 — clarification recorded per decision'; END $$;
CREATE TEMP TABLE seen1 AS SELECT submitted_at s FROM public.sp_verification_requests WHERE id = (SELECT req FROM r);
GRANT SELECT ON seen1 TO PUBLIC;
SELECT pg_temp.ok(pg_temp.try_as((SELECT v::text FROM f), format(
  'SELECT public.sp_verifier_decide_reviewed(%L, %L, ''clarification_requested'', NULL, ''Intern: kolla datum'', ''Vilket år tog du examen?'', NULL, NULL)',
  (SELECT req FROM r), (SELECT s FROM seen1))) = 'ok', 'RH2.1 the verifier asks for a clarification');
SELECT pg_temp.ok((SELECT holder_message FROM public.sp_verification_decisions WHERE request_id = (SELECT req FROM r)
                    AND decision = 'clarification_requested') = 'Vilket år tog du examen?',
                  'RH2.2 the candidate-facing message is kept on the decision row');
SELECT pg_temp.ok((SELECT count(*) FROM public.user_notices WHERE recipient_user_id = (SELECT a FROM f)
                    AND kind = 'passport_clarification_requested') = 1, 'RH2.3 the holder is notified once');
SELECT pg_temp.ok(pg_temp.j_as((SELECT a::text FROM f), format('SELECT public.sp_entry_review_state(%L, NULL)', (SELECT cpp FROM c)))->>'state'
                    = 'clarification_requested', 'RH2.4 current state: clarification requested');

DO $$ BEGIN RAISE NOTICE 'GROUP RH3 — the holder answers with text, bound to the version'; END $$;
CREATE TEMP TABLE rep AS SELECT pg_temp.j_as((SELECT a::text FROM f), format(
  'SELECT public.sp_reply_to_clarification(%L, %L, %L)', (SELECT req FROM r), (SELECT s FROM seen1), 'Examen 2019, intyget visar fel år.')) AS j;
GRANT SELECT ON rep TO PUBLIC;
SELECT pg_temp.ok((SELECT j->>'status' FROM rep) = 'answered', 'RH3.1 the reply is accepted');
SELECT pg_temp.ok((SELECT status = 'pending' AND submitted_at > (SELECT s FROM seen1) AND answered_at IS NOT NULL
                     FROM public.sp_verification_requests WHERE id = (SELECT req FROM r)),
                  'RH3.2 the request is back in review with a new version');
SELECT pg_temp.ok((SELECT count(*) FROM public.user_notices WHERE recipient_user_id = (SELECT v FROM f)
                    AND kind = 'passport_clarification_answered') = 1, 'RH3.3 the reviewer is notified once');
SELECT pg_temp.ok((SELECT count(*) FROM public.sp_verification_replies) = 1
                  AND pg_temp.j_as((SELECT v::text FROM f), format('SELECT public.sp_review_thread(%L, NULL)', (SELECT cpp FROM c)))
                      @> '{"events":[{"type":"reply","body":"Examen 2019, intyget visar fel år."}]}',
                  'RH3.4 the reviewer reads the reply in the case thread');
SELECT pg_temp.ok(pg_temp.j_as((SELECT a::text FROM f), 'SELECT to_jsonb(count(*)) FROM public.sp_verification_replies')::int = 1
                  AND pg_temp.j_as((SELECT b::text FROM f), 'SELECT to_jsonb(count(*)) FROM public.sp_verification_replies')::int = 0
                  AND pg_temp.j_as((SELECT n::text FROM f), 'SELECT to_jsonb(count(*)) FROM public.sp_verification_replies')::int = 0,
                  'RH3.5 RLS: the holder reads the reply; another holder and a non-verifier read nothing');

DO $$ BEGIN RAISE NOTICE 'GROUP RH4 — retries and refusals'; END $$;
SELECT pg_temp.ok(pg_temp.j_as((SELECT a::text FROM f), format('SELECT public.sp_reply_to_clarification(%L, %L, %L)',
                    (SELECT req FROM r), (SELECT s FROM seen1), 'Examen 2019, intyget visar fel år.'))->>'status' = 'already_answered',
                  'RH4.1 the same answer again (double click) returns the existing reply');
SELECT pg_temp.ok((SELECT count(*) FROM public.sp_verification_replies) = 1, 'RH4.2 still exactly one reply');
SELECT pg_temp.ok(pg_temp.try_as((SELECT a::text FROM f), format('SELECT public.sp_reply_to_clarification(%L, %L, %L)',
                    (SELECT req FROM r), (SELECT s FROM seen1), 'Ett annat svar')) = 'err:SP_REVIEW_STALE',
                  'RH4.3 a different answer to the already answered version is stale');
SELECT pg_temp.ok(pg_temp.try_as((SELECT b::text FROM f), format('SELECT public.sp_reply_to_clarification(%L, %L, %L)',
                    (SELECT req FROM r), (SELECT submitted_at FROM public.sp_verification_requests WHERE id = (SELECT req FROM r)), 'Hej')) = 'err:SP_REQUEST_NOT_FOUND',
                  'RH4.4 another holder cannot answer, and learns nothing');
SELECT pg_temp.ok(pg_temp.try_as((SELECT a::text FROM f), format('SELECT public.sp_reply_to_clarification(%L, %L, %L)',
                    (SELECT req FROM r), (SELECT submitted_at FROM public.sp_verification_requests WHERE id = (SELECT req FROM r)), 'Nytt')) = 'err:SP_REQUEST_NOT_AWAITING_REPLY',
                  'RH4.5 a request in review cannot be answered');
SELECT pg_temp.ok(pg_temp.try_as((SELECT a::text FROM f), format('SELECT public.sp_reply_to_clarification(%L, %L, %L)',
                    (SELECT req FROM r), (SELECT s FROM seen1), '   ')) = 'err:SP_REPLY_INVALID',
                  'RH4.6 an empty reply is refused');
SELECT pg_temp.ok(pg_temp.try_as((SELECT a::text FROM f), 'UPDATE public.sp_verification_replies SET body = ''x''') LIKE 'err:%'
                  AND pg_temp.try_as((SELECT a::text FROM f), 'DELETE FROM public.sp_verification_replies') LIKE 'err:%'
                  AND (SELECT count(*) FROM public.sp_verification_replies) = 1,
                  'RH4.7 a reply cannot be rewritten or deleted by a client');

DO $$ BEGIN RAISE NOTICE 'GROUP RH5 — the old review page is refused'; END $$;
SELECT pg_temp.ok(pg_temp.try_as((SELECT v::text FROM f), format(
  'SELECT public.sp_verifier_decide_reviewed(%L, %L, ''approved'', ''document_review'', NULL, NULL, NULL, NULL)',
  (SELECT req FROM r), (SELECT s FROM seen1))) = 'err:SP_REVIEW_STALE', 'RH5.1 approval from the page opened before the reply is refused');
SELECT pg_temp.ok((SELECT assertion_level FROM public.sp_claims WHERE id = (SELECT cpp FROM c)) = 'self_declared',
                  'RH5.2 nothing was approved');
SELECT pg_temp.ok(pg_temp.try_as((SELECT v::text FROM f), format(
  'SELECT public.sp_verifier_decide_reviewed(%L, %L, ''approved'', ''document_review'', ''Kontrollerat mot intyg'', NULL, NULL, NULL)',
  (SELECT req FROM r), (SELECT submitted_at FROM public.sp_verification_requests WHERE id = (SELECT req FROM r)))) = 'ok',
                  'RH5.3 after reload the approval goes through');
SELECT pg_temp.ok(pg_temp.try_as((SELECT v::text FROM f), format(
  'SELECT public.sp_verifier_decide_reviewed(%L, %L, ''approved'', ''document_review'', NULL, NULL, NULL, NULL)',
  (SELECT req FROM r), (SELECT submitted_at FROM public.sp_verification_requests WHERE id = (SELECT req FROM r)))) = 'err:SP_REQUEST_ALREADY_DECIDED',
                  'RH5.4 a second click on approve is refused, not recorded twice');
SELECT pg_temp.ok((SELECT count(*) FROM public.sp_verification_decisions WHERE request_id = (SELECT req FROM r) AND decision = 'approved') = 1,
                  'RH5.5 exactly one approval');

DO $$ BEGIN RAISE NOTICE 'GROUP RH6 — approval, revocation, new approval: one current state'; END $$;
SELECT pg_temp.ok(pg_temp.j_as((SELECT a::text FROM f), format('SELECT public.sp_entry_review_state(%L, NULL)', (SELECT cpp FROM c)))
                    @> '{"state":"approved","method":"document_review","organisation":"CQrityjob"}', 'RH6.1 current: approved by document review');
SELECT pg_temp.ok(pg_temp.try_as((SELECT v::text FROM f), format('SELECT public.sp_verifier_revoke(%L, NULL, ''Intyget återkallat av utfärdaren'')',
                    (SELECT cpp FROM c))) = 'ok', 'RH6.2 the verifier revokes');
SELECT pg_temp.ok(pg_temp.j_as((SELECT a::text FROM f), format('SELECT public.sp_entry_review_state(%L, NULL)', (SELECT cpp FROM c)))->>'state' = 'revoked'
                  AND (SELECT lifecycle_state FROM public.sp_claims WHERE id = (SELECT cpp FROM c)) = 'revoked',
                  'RH6.3 current: revoked, and the entry says so');
SELECT pg_temp.ok((SELECT count(*) FROM public.user_notices WHERE recipient_user_id = (SELECT a FROM f) AND kind = 'passport_verification_revoked') = 1,
                  'RH6.4 the holder is told about the revocation');
CREATE TEMP TABLE r2 AS SELECT (pg_temp.j_as((SELECT a::text FROM f),
  format('SELECT to_jsonb(public.sp_submit_for_verification(%L, NULL, ''cqrityjob_review'', NULL))', (SELECT cpp FROM c)))#>>'{}')::uuid AS req;
GRANT SELECT ON r2 TO PUBLIC;
SELECT pg_temp.ok(pg_temp.j_as((SELECT a::text FROM f), format('SELECT public.sp_entry_review_state(%L, NULL)', (SELECT cpp FROM c)))->>'state' = 'pending',
                  'RH6.5 a new request is the current state after a revocation');
SELECT pg_temp.ok(pg_temp.try_as((SELECT v::text FROM f), format(
  'SELECT public.sp_verifier_decide_reviewed(%L, %L, ''approved'', ''document_review'', NULL, ''Nytt intyg granskat.'', NULL, NULL)',
  (SELECT req FROM r2), (SELECT submitted_at FROM public.sp_verification_requests WHERE id = (SELECT req FROM r2)))) = 'ok',
                  'RH6.6 the new request is approved');
SELECT pg_temp.ok((SELECT lifecycle_state = 'active' AND assertion_level = 'verified' FROM public.sp_claims WHERE id = (SELECT cpp FROM c))
                  AND pg_temp.j_as((SELECT a::text FROM f), format('SELECT public.sp_entry_review_state(%L, NULL)', (SELECT cpp FROM c)))->>'state' = 'approved',
                  'RH6.7 after the new approval the entry is active and verified: no contradiction left');
SELECT pg_temp.ok((SELECT array_agg(e->>'decision' ORDER BY ord) FROM jsonb_array_elements(
                     pg_temp.j_as((SELECT a::text FROM f), format('SELECT public.sp_review_thread(%L, NULL)', (SELECT cpp FROM c)))->'events')
                     WITH ORDINALITY x(e, ord) WHERE e->>'type' = 'decision')
                    = ARRAY['clarification_requested', 'approved', 'revoked', 'approved'],
                  'RH6.8 history shows every decision in order');

DO $$ BEGIN RAISE NOTICE 'GROUP RH7 — rejection keeps its message; a new request is current'; END $$;
CREATE TEMP TABLE r3 AS SELECT (pg_temp.j_as((SELECT a::text FROM f),
  format('SELECT to_jsonb(public.sp_submit_for_verification(%L, NULL, ''cqrityjob_review'', NULL))', (SELECT vu1 FROM c)))#>>'{}')::uuid AS req;
GRANT SELECT ON r3 TO PUBLIC;
SELECT pg_temp.ok(pg_temp.try_as((SELECT v::text FROM f), format(
  'SELECT public.sp_verifier_decide_reviewed(%L, %L, ''rejected'', NULL, NULL, ''Underlaget är oläsligt.'', NULL, NULL)',
  (SELECT req FROM r3), (SELECT submitted_at FROM public.sp_verification_requests WHERE id = (SELECT req FROM r3)))) = 'ok', 'RH7.1 rejected');
SELECT pg_temp.ok(pg_temp.j_as((SELECT a::text FROM f), format('SELECT public.sp_entry_review_state(%L, NULL)', (SELECT vu1 FROM c)))
                    @> '{"state":"rejected","holderMessage":"Underlaget är oläsligt."}', 'RH7.2 current: rejected, with the message');
SELECT pg_temp.ok(pg_temp.try_as((SELECT a::text FROM f), format('SELECT public.sp_submit_for_verification(%L, NULL, ''cqrityjob_review'', NULL)',
                    (SELECT vu1 FROM c))) = 'ok'
                  AND pg_temp.j_as((SELECT a::text FROM f), format('SELECT public.sp_entry_review_state(%L, NULL)', (SELECT vu1 FROM c)))->>'state' = 'pending'
                  AND pg_temp.j_as((SELECT a::text FROM f), format('SELECT public.sp_review_thread(%L, NULL)', (SELECT vu1 FROM c)))
                      @> '{"events":[{"type":"decision","decision":"rejected","holderMessage":"Underlaget är oläsligt."}]}',
                  'RH7.3 a new request is current; the rejection stays in history with its message');

DO $$ BEGIN RAISE NOTICE 'GROUP RH8 — who may read the case'; END $$;
SELECT pg_temp.ok(pg_temp.j_as((SELECT v::text FROM f), format('SELECT public.sp_review_thread(%L, NULL)', (SELECT cpp FROM c)))
                    @> '{"events":[{"type":"decision","internalNote":"Intern: kolla datum"}]}', 'RH8.1 the reviewer sees the internal note');
SELECT pg_temp.ok(NOT (pg_temp.j_as((SELECT a::text FROM f), format('SELECT public.sp_review_thread(%L, NULL)', (SELECT cpp FROM c)))::text
                    LIKE '%Intern: kolla datum%'), 'RH8.2 the holder never receives the internal note');
SELECT pg_temp.ok(pg_temp.try_as((SELECT n::text FROM f), format('SELECT public.sp_review_thread(%L, NULL)', (SELECT cpp FROM c))) = 'err:SP_TARGET_NOT_FOUND'
                  AND pg_temp.try_as((SELECT b::text FROM f), format('SELECT public.sp_entry_review_state(%L, NULL)', (SELECT cpp FROM c))) = 'err:SP_TARGET_NOT_FOUND',
                  'RH8.3 a non-verifier and another holder read nothing');
SELECT pg_temp.ok(pg_temp.j_as((SELECT a::text FROM f), 'SELECT to_jsonb(count(*)) FROM public.sp_verification_decisions WHERE holder_message IS NOT NULL')::int >= 3,
                  'RH8.4 the holder reads the decision messages directly (column grant)');

DO $$ BEGIN RAISE NOTICE 'GROUP RH9 — inbox and e-mail outbox'; END $$;
SELECT pg_temp.ok((pg_temp.j_as((SELECT a::text FROM f), 'SELECT public.user_notices_inbox(50)')->>'unread')::int
                    = (SELECT count(*) FROM public.user_notices WHERE recipient_user_id = (SELECT a FROM f))
                  AND (pg_temp.j_as((SELECT b::text FROM f), 'SELECT public.user_notices_inbox(50)')->>'unread')::int = 0,
                  'RH9.1 each person sees only their own notices');
SELECT pg_temp.ok(NOT (pg_temp.j_as((SELECT v::text FROM f), 'SELECT public.user_notices_inbox(50)')::text LIKE '%Certified Protection%')
                  AND pg_temp.j_as((SELECT v::text FROM f), 'SELECT public.user_notices_inbox(50)') @> '{"items":[{"credentialCode":"INTL_ASIS_CPP"}]}',
                  'RH9.2 a reviewer notice names the catalogue code, not the holder''s own text');
SELECT pg_temp.ok((pg_temp.j_as((SELECT a::text FROM f), 'SELECT to_jsonb(public.user_notices_mark_read(NULL))'))::int >= 3
                  AND (pg_temp.j_as((SELECT a::text FROM f), 'SELECT public.user_notices_inbox(50)')->>'unread')::int = 0,
                  'RH9.3 mark read');
SELECT pg_temp.ok(pg_temp.try_as((SELECT a::text FROM f), 'SELECT public.user_notices_claim_emails(10)') LIKE 'err:permission denied%'
                  AND pg_temp.try_as((SELECT a::text FROM f), 'UPDATE public.user_notices SET read_at = NULL') LIKE 'err:permission denied%',
                  'RH9.4 a client can neither claim e-mail nor write a notice');
-- The verifier loses the role before the worker runs: their pending mail is skipped.
DELETE FROM public.user_roles WHERE user_id = (SELECT n FROM f);
INSERT INTO public.user_notices (recipient_user_id, audience, kind, subject_type, subject_id, request_id, dedupe_key)
  SELECT n, 'reviewer', 'passport_review_requested', 'claim', (SELECT cpp FROM c), (SELECT req FROM r), 'probe:former-reviewer' FROM f;
SET LOCAL ROLE service_role;
CREATE TEMP TABLE claimed AS SELECT public.user_notices_claim_emails(50) AS j;
RESET ROLE;
SELECT pg_temp.ok((SELECT email_status FROM public.user_notices WHERE dedupe_key = 'probe:former-reviewer') = 'skipped'
                  AND NOT (SELECT j::text FROM claimed) LIKE '%rh-member@%',
                  'RH9.5 a recipient who may no longer receive the notice is skipped at claim time');
SELECT pg_temp.ok(jsonb_array_length((SELECT j FROM claimed)) >= 4
                  AND (SELECT bool_and(x ? 'email' AND x ? 'claimToken' AND NOT x ? 'body') FROM jsonb_array_elements((SELECT j FROM claimed)) x),
                  'RH9.6 the worker gets address, kind and ids, never document content');
SET LOCAL ROLE service_role;
SELECT pg_temp.ok(public.user_notices_settle_email(((SELECT j FROM claimed)->0->>'id')::uuid, ((SELECT j FROM claimed)->0->>'claimToken')::uuid, 'sent')
                  AND NOT public.user_notices_settle_email(((SELECT j FROM claimed)->0->>'id')::uuid, ((SELECT j FROM claimed)->0->>'claimToken')::uuid, 'sent'),
                  'RH9.7 settling is idempotent: the second settle changes nothing');
SELECT pg_temp.ok(jsonb_array_length(public.user_notices_claim_emails(50)) = 0, 'RH9.8 a claimed notice is not claimed again inside its lease');
RESET ROLE;

DO $$ BEGIN RAISE NOTICE 'GROUP RH10 — a changed merit does not inherit an approval'; END $$;
CREATE TEMP TABLE corr AS SELECT (pg_temp.j_as((SELECT a::text FROM f), format(
  'SELECT to_jsonb(public.sp_correct_claim(%L, c.title, c.claimed_issuer_name, c.jurisdiction_code, c.issued_on, c.valid_from, %L::date, ''Förnyad'', c.credential_code, c.credential_reference, c.holder_note)) FROM public.sp_claims c WHERE c.id = %L',
  (SELECT cpp FROM c), current_date + 900, (SELECT cpp FROM c)))#>>'{}')::uuid AS id;
SELECT pg_temp.ok((SELECT assertion_level FROM public.sp_claims WHERE id = (SELECT id FROM corr)) = 'self_declared'
                  AND (SELECT lifecycle_state FROM public.sp_claims WHERE id = (SELECT cpp FROM c)) = 'superseded',
                  'RH10.1 a new validity date makes a new version that starts as self-declared');
SELECT pg_temp.ok(pg_temp.j_as((SELECT a::text FROM f), format('SELECT public.sp_entry_review_state(%L, NULL)', (SELECT id FROM corr)))->>'state' = 'none',
                  'RH10.2 the new version has no review of its own yet');

DO $$ BEGIN RAISE NOTICE 'GROUP RH11 — grants'; END $$;
SELECT pg_temp.ok(NOT has_function_privilege('anon', 'public.sp_reply_to_clarification(uuid,timestamptz,text)', 'EXECUTE')
                  AND NOT has_function_privilege('anon', 'public.sp_review_thread(uuid,uuid)', 'EXECUTE')
                  AND NOT has_function_privilege('anon', 'public.user_notices_inbox(integer)', 'EXECUTE')
                  AND NOT has_function_privilege('authenticated', 'public.user_notices_enqueue(uuid,text,text,text,uuid,uuid,text)', 'EXECUTE')
                  AND NOT has_function_privilege('authenticated', 'public.product_metric_record(text)', 'EXECUTE')
                  AND NOT has_table_privilege('authenticated', 'public.product_metric_events', 'SELECT'),
                  'RH11.1 anon executes nothing; writers and metrics are not client-reachable');
SELECT pg_temp.ok(pg_temp.try_as((SELECT a::text FROM f), 'SELECT public.product_metric_counts(NULL, NULL)') = 'err:NOT_AUTHORISED'
                  AND (pg_temp.j_as((SELECT p::text FROM f), 'SELECT public.product_metric_counts(NULL, NULL)') ? 'passport_review_requested'),
                  'RH11.2 metric counts: platform admin only');

ROLLBACK;
