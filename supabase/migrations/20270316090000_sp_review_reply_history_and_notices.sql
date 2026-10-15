-- =============================================================================
-- 20270316090000 -- Security Passport: case-bound clarification reply, decision
-- history, one current review state, and feedback when something waits.
--
-- Canonical forward slot. Schema-first: no application code in the same PR.
--
-- 1. sp_verification_replies + sp_reply_to_clarification
--    A holder can answer a clarification with TEXT, bound to the request and to
--    the version (submitted_at) the clarification was asked on. Answering moves
--    submitted_at exactly like the existing answer-by-editing path
--    (sp_entry_review_on_holder_edit), so the decision stays bound to the
--    content the reviewer saw: a reviewer page opened before the reply is
--    refused with SP_REVIEW_STALE and must reload, now including the reply.
--    No document copy is needed to explain something.
--
-- 2. sp_verification_decisions.holder_message
--    The candidate-facing message was kept only on the request row and was
--    overwritten by the next decision. It is now recorded per decision, so the
--    history shows what was asked, answered and decided, in order.
--
-- 3. sp_verifier_decide (same signature): writes holder_message to the
--    decision row, and an approval of an entry whose earlier verification was
--    revoked returns it to 'active'. Before, the entry stayed 'revoked' after a
--    new approval -- two contradicting facts. Everything else is the body from
--    20270125090000, unchanged.
--
-- 4. sp_entry_review_state / sp_review_thread
--    One unambiguous current state per entry, derived from the append-only
--    decisions (latest wins) and the open request; and the ordered history
--    (requests, decisions, replies). The internal decision_note is returned
--    only to a verifier.
--
-- 5. user_notices: an in-app inbox and an e-mail outbox in one row.
--    Rows are written only by triggers in this database. Recipients read their
--    own rows. E-mail is claimed by the service role, which re-checks that the
--    recipient may still receive the notice at claim time (a reviewer who lost
--    the role is skipped). One row per (recipient, dedupe_key): a decision, a
--    request version or a contact produces at most one notice per person.
--
-- 6. product_metric_events: counts of central events, no person, no content.
--
-- Rollback: supabase/rollback/20270316090000_sp_review_reply_history_and_notices_rollback.sql
-- Suite:    supabase/tests/sp_review_reply_history_and_notices_test.sql
-- =============================================================================
BEGIN;

-- ---------------------------------------------------------------------------
-- 2. Decision history keeps the candidate-facing message.
-- ---------------------------------------------------------------------------
ALTER TABLE public.sp_verification_decisions
  ADD COLUMN IF NOT EXISTS holder_message text
    CHECK (holder_message IS NULL OR char_length(holder_message) <= 2000);
-- decided_at is the transaction time, so two decisions in one transaction
-- (or one clock tick) tie. recorded_at orders them as they were written.
ALTER TABLE public.sp_verification_decisions
  ADD COLUMN IF NOT EXISTS recorded_at timestamptz NOT NULL DEFAULT clock_timestamp();
GRANT SELECT (holder_message, recorded_at) ON public.sp_verification_decisions TO authenticated;
COMMENT ON COLUMN public.sp_verification_decisions.holder_message IS
  'The message the holder was shown with this decision. Unlike '
  'sp_verification_requests.holder_message it is never overwritten.';

-- ---------------------------------------------------------------------------
-- 1. The case-bound text reply.
-- ---------------------------------------------------------------------------
CREATE TABLE public.sp_verification_replies (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id            uuid NOT NULL REFERENCES public.sp_verification_requests(id) ON DELETE CASCADE,
  holder_user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- The request version the clarification was asked on, i.e. what this answers.
  answers_submitted_at  timestamptz NOT NULL,
  -- The version the reply created.
  created_submitted_at  timestamptz NOT NULL,
  body                  text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000),
  created_at            timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (request_id, answers_submitted_at)
);
CREATE INDEX sp_verification_replies_request_idx ON public.sp_verification_replies (request_id, created_at);
CREATE INDEX sp_verification_replies_holder_idx ON public.sp_verification_replies (holder_user_id);

ALTER TABLE public.sp_verification_replies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sp_verification_replies FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.sp_verification_replies TO authenticated;

CREATE POLICY sp_vrep_holder_read ON public.sp_verification_replies
  FOR SELECT TO authenticated USING (holder_user_id = auth.uid());
CREATE POLICY sp_vrep_verifier_read ON public.sp_verification_replies
  FOR SELECT TO authenticated USING (
    public.sp_is_verifier(auth.uid())
    AND EXISTS (SELECT 1 FROM public.sp_verification_requests r
                 WHERE r.id = request_id AND r.request_kind = 'cqrityjob_review'));
CREATE POLICY sp_vrep_employer_read ON public.sp_verification_replies
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.sp_verification_requests r
             WHERE r.id = request_id AND r.request_kind = 'employer_attestation'
               AND public.has_active_employer_role(auth.uid(), r.target_employer_id, ARRAY['owner','admin'])));
CREATE POLICY sp_private_session_read ON public.sp_verification_replies
  AS RESTRICTIVE FOR ALL TO authenticated USING (public.sp_passport_session_active());

CREATE FUNCTION public.sp_verification_replies_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'SP_REPLY_IMMUTABLE: a clarification reply cannot be rewritten' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM auth.users WHERE id = OLD.holder_user_id)
     AND NOT public.account_deletion_releases(OLD.holder_user_id) THEN
    RAISE EXCEPTION 'SP_REPLY_IMMUTABLE: a clarification reply cannot be deleted' USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION public.sp_verification_replies_guard() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER sp_verification_replies_immutable BEFORE UPDATE OR DELETE ON public.sp_verification_replies
  FOR EACH ROW EXECUTE FUNCTION public.sp_verification_replies_guard();
CREATE TRIGGER sp_private_session_write BEFORE INSERT OR UPDATE OR DELETE ON public.sp_verification_replies
  FOR EACH ROW EXECUTE FUNCTION public.sp_passport_session_write_guard();

CREATE FUNCTION public.sp_reply_to_clarification(
  _request_id uuid, _reviewed_submitted_at timestamptz, _body text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE _r public.sp_verification_requests%ROWTYPE; _existing public.sp_verification_replies%ROWTYPE;
        _now timestamptz; _text text := btrim(coalesce(_body, ''));
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'SP_NOT_AUTHENTICATED' USING ERRCODE = 'insufficient_privilege'; END IF;
  IF char_length(_text) NOT BETWEEN 1 AND 2000 THEN
    RAISE EXCEPTION 'SP_REPLY_INVALID: 1-2000 characters' USING ERRCODE = 'check_violation';
  END IF;
  IF _reviewed_submitted_at IS NULL THEN
    RAISE EXCEPTION 'SP_REVIEW_STALE: say which version of the request is answered' USING ERRCODE = 'check_violation';
  END IF;

  -- The same row lock the reviewer's decision takes: a reply and a decision serialise.
  SELECT * INTO _r FROM public.sp_verification_requests WHERE id = _request_id FOR UPDATE;
  -- Someone else's request reads exactly like a missing one.
  IF NOT FOUND OR _r.holder_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'SP_REQUEST_NOT_FOUND' USING ERRCODE = 'no_data_found';
  END IF;

  -- A repeated submission of the same answer (double click, retry after a lost
  -- response) returns the reply it already created.
  SELECT * INTO _existing FROM public.sp_verification_replies
   WHERE request_id = _r.id AND answers_submitted_at = _reviewed_submitted_at;
  IF FOUND THEN
    IF _existing.body = _text THEN
      RETURN jsonb_build_object('status', 'already_answered', 'replyId', _existing.id,
                                'submittedAt', _existing.created_submitted_at);
    END IF;
    RAISE EXCEPTION 'SP_REVIEW_STALE: this clarification has already been answered' USING ERRCODE = 'check_violation';
  END IF;

  IF _r.status <> 'clarification_requested' THEN
    RAISE EXCEPTION 'SP_REQUEST_NOT_AWAITING_REPLY' USING ERRCODE = 'check_violation';
  END IF;
  IF _r.submitted_at IS DISTINCT FROM _reviewed_submitted_at THEN
    RAISE EXCEPTION 'SP_REVIEW_STALE: the request changed after it was opened; reload it' USING ERRCODE = 'check_violation';
  END IF;

  _now := clock_timestamp();
  INSERT INTO public.sp_verification_replies (request_id, holder_user_id, answers_submitted_at, created_submitted_at, body)
  VALUES (_r.id, _r.holder_user_id, _r.submitted_at, _now, _text)
  RETURNING * INTO _existing;

  -- Same transition as sp_entry_review_on_holder_edit: back to the reviewer,
  -- with a new content epoch, so a decision on the old page is refused.
  UPDATE public.sp_verification_requests
     SET status = 'pending', submitted_at = _now, answered_at = _now
   WHERE id = _r.id;

  INSERT INTO public.sp_passport_events (holder_user_id, actor_user_id, event_type, subject_type, subject_id, detail)
  VALUES (_r.holder_user_id, auth.uid(), 'claim_corrected',
          CASE WHEN _r.claim_id IS NOT NULL THEN 'claim' ELSE 'experience' END,
          coalesce(_r.claim_id, _r.period_id),
          jsonb_build_object('action', 'clarification_answered', 'request_id', _r.id));

  RETURN jsonb_build_object('status', 'answered', 'replyId', _existing.id, 'submittedAt', _now);
END $$;
REVOKE ALL ON FUNCTION public.sp_reply_to_clarification(uuid, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_reply_to_clarification(uuid, timestamptz, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. sp_verifier_decide: history message, and a new approval is the current
--    state after a revocation. Body otherwise verbatim from 20270125090000.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sp_verifier_decide(_request_id uuid, _decision text, _method text, _decision_note text, _holder_message text, _valid_from date, _valid_until date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _r public.sp_verification_requests%ROWTYPE; _org text; _seen text;
BEGIN
  SELECT * INTO _r FROM public.sp_verification_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SP_REQUEST_NOT_FOUND' USING ERRCODE='no_data_found'; END IF;

  IF _r.holder_user_id = auth.uid() THEN
    RAISE EXCEPTION 'SP_SELF_VERIFICATION_FORBIDDEN' USING ERRCODE='insufficient_privilege';
  END IF;

  IF _r.request_kind = 'cqrityjob_review' THEN
    IF NOT public.sp_is_verifier(auth.uid()) THEN
      RAISE EXCEPTION 'SP_NOT_VERIFIER' USING ERRCODE='insufficient_privilege';
    END IF;
    _org := 'CQrityjob';
  ELSE
    -- 20270112090000: an active owner/admin of an ACTIVE organisation
    IF NOT public.has_active_employer_role(auth.uid(), _r.target_employer_id, ARRAY['owner','admin']) THEN
      RAISE EXCEPTION 'SP_NOT_EMPLOYER_REPRESENTATIVE' USING ERRCODE='insufficient_privilege';
    END IF;

    IF _r.period_id IS NULL OR _r.claim_id IS NOT NULL THEN
      RAISE EXCEPTION 'SP_EMPLOYER_ATTESTATION_EMPLOYMENT_ONLY' USING ERRCODE='insufficient_privilege';
    END IF;

    SELECT name INTO _org FROM public.employers WHERE id = _r.target_employer_id;
  END IF;

  IF _r.status NOT IN ('pending','clarification_requested') THEN
    RAISE EXCEPTION 'SP_REQUEST_ALREADY_DECIDED' USING ERRCODE='check_violation';
  END IF;

  -- 20270125090000: the decision is bound to the content the decider saw.
  _seen := nullif(current_setting('sp.reviewed_submitted_at', true), '');
  PERFORM set_config('sp.reviewed_submitted_at', '', true);
  IF _seen IS NOT NULL THEN
    IF _seen::timestamptz IS DISTINCT FROM _r.submitted_at THEN
      RAISE EXCEPTION 'SP_REVIEW_STALE: the entry changed after it was opened; reload it and decide again'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF _r.answered_at IS NOT NULL THEN
    RAISE EXCEPTION 'SP_REVIEW_STALE: this request was answered after a clarification; reload it and decide on what it now says'
      USING ERRCODE = 'check_violation';
  END IF;

  IF _decision = 'approved'
     AND (_method IS NULL OR _method !~ '[^[:space:]]') THEN
    RAISE EXCEPTION 'SP_APPROVAL_REQUIRES_METHOD' USING ERRCODE='check_violation';
  END IF;

  IF _decision = 'approved' THEN
    IF _method = 'issuer_confirmation' THEN
      RAISE EXCEPTION 'SP_ISSUER_CONFIRMATION_NOT_AVAILABLE' USING ERRCODE='check_violation';
    END IF;
    IF _r.request_kind = 'cqrityjob_review' AND _method <> 'document_review' THEN
      RAISE EXCEPTION 'SP_CQRITYJOB_REVIEW_REQUIRES_DOCUMENT_REVIEW' USING ERRCODE='check_violation';
    END IF;
    IF _r.request_kind = 'employer_attestation' AND _method <> 'employer_confirmation' THEN
      RAISE EXCEPTION 'SP_EMPLOYER_ATTESTATION_REQUIRES_EMPLOYER_CONFIRMATION' USING ERRCODE='check_violation';
    END IF;
  END IF;

  IF _decision IN ('rejected','clarification_requested')
     AND (_holder_message IS NULL OR _holder_message !~ '[^[:space:]]') THEN
    RAISE EXCEPTION 'SP_DECISION_REQUIRES_HOLDER_MESSAGE' USING ERRCODE='check_violation';
  END IF;

  UPDATE public.sp_verification_requests
     SET status = _decision, decided_at = now(), decided_by = auth.uid(),
         verification_method = _method, decision_note = _decision_note,
         holder_message = _holder_message, valid_from = _valid_from, valid_until = _valid_until
   WHERE id = _request_id;

  -- 20270316090000: the candidate-facing message is kept per decision.
  INSERT INTO public.sp_verification_decisions (
    request_id, holder_user_id, decided_by, decider_organisation, decision,
    verification_method, decision_note, valid_from, valid_until, holder_message)
  VALUES (_request_id, _r.holder_user_id, auth.uid(), _org, _decision,
          _method, _decision_note, _valid_from, _valid_until, _holder_message);

  IF _decision = 'approved' THEN
    PERFORM set_config('sp.verification_context', 'on', true);
    -- 20270316090000: an approval after a revocation is the current state.
    -- Only 'revoked' returns to 'active'; withdrawn, superseded and the rest
    -- stay what the holder or the history made them.
    IF _r.claim_id IS NOT NULL THEN
      UPDATE public.sp_claims
         SET assertion_level = 'verified', verified_by_user_id = auth.uid(), verified_at = now(),
             valid_from = coalesce(_valid_from, valid_from), valid_until = coalesce(_valid_until, valid_until),
             lifecycle_state = CASE WHEN lifecycle_state = 'revoked' THEN 'active' ELSE lifecycle_state END
       WHERE id = _r.claim_id;
    ELSE
      UPDATE public.sp_experience_periods
         SET assertion_level = 'verified',
             lifecycle_state = CASE WHEN lifecycle_state = 'revoked' THEN 'active' ELSE lifecycle_state END
       WHERE id = _r.period_id;
    END IF;
    PERFORM set_config('sp.verification_context', 'off', true);
  END IF;

  INSERT INTO public.sp_passport_events (holder_user_id, actor_user_id, event_type, subject_type, subject_id, detail)
  VALUES (_r.holder_user_id, auth.uid(), 'verification_decided',
          CASE WHEN _r.claim_id IS NOT NULL THEN 'claim' ELSE 'experience' END,
          coalesce(_r.claim_id, _r.period_id),
          jsonb_build_object('decision', _decision, 'method', _method, 'organisation', _org));
END; $function$;
REVOKE ALL ON FUNCTION public.sp_verifier_decide(uuid,text,text,text,text,date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_verifier_decide(uuid,text,text,text,text,date,date) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. One current state, and the history behind it.
-- ---------------------------------------------------------------------------
-- Who may read an entry's review: its holder, or a verifier (CQrityjob
-- reviews). The employer-attestation side keeps its own queue.
CREATE FUNCTION public.sp_review_reader(_claim_id uuid, _period_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE _holder uuid;
BEGIN
  IF num_nonnulls(_claim_id, _period_id) <> 1 OR auth.uid() IS NULL THEN RETURN NULL; END IF;
  IF _claim_id IS NOT NULL THEN SELECT holder_user_id INTO _holder FROM public.sp_claims WHERE id = _claim_id;
  ELSE SELECT holder_user_id INTO _holder FROM public.sp_experience_periods WHERE id = _period_id; END IF;
  IF _holder IS NULL THEN RETURN NULL; END IF;
  IF _holder = auth.uid() THEN RETURN 'holder'; END IF;
  IF public.sp_is_verifier(auth.uid()) THEN RETURN 'verifier'; END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.sp_review_reader(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- The current state is the open request if there is one, otherwise the
-- latest decision on any request for this entry. Values:
--   none | pending | clarification_requested | approved | rejected | revoked | withdrawn
CREATE FUNCTION public.sp_entry_review_state_core(_claim_id uuid, _period_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH reqs AS (
    SELECT * FROM public.sp_verification_requests r
     WHERE (_claim_id IS NOT NULL AND r.claim_id = _claim_id)
        OR (_period_id IS NOT NULL AND r.period_id = _period_id)),
  open_req AS (
    SELECT * FROM reqs WHERE status IN ('pending','clarification_requested')
     ORDER BY submitted_at DESC LIMIT 1),
  last_dec AS (
    SELECT d.* FROM public.sp_verification_decisions d JOIN reqs r ON r.id = d.request_id
     ORDER BY d.recorded_at DESC LIMIT 1),
  last_withdrawn AS (
    SELECT * FROM reqs WHERE status = 'withdrawn' ORDER BY submitted_at DESC LIMIT 1)
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM open_req) THEN
      (SELECT jsonb_build_object('state', o.status, 'requestId', o.id, 'requestKind', o.request_kind,
              'since', CASE WHEN o.status = 'pending' THEN o.submitted_at ELSE o.decided_at END,
              'submittedAt', o.submitted_at, 'answeredAt', o.answered_at,
              'holderMessage', CASE WHEN o.status = 'clarification_requested' THEN o.holder_message END)
         FROM open_req o)
    WHEN EXISTS (SELECT 1 FROM last_dec)
         AND NOT EXISTS (SELECT 1 FROM last_withdrawn w, last_dec d WHERE w.submitted_at > d.decided_at) THEN
      (SELECT jsonb_build_object('state', d.decision, 'requestId', d.request_id,
              'since', d.decided_at, 'method', d.verification_method, 'organisation', d.decider_organisation,
              'validFrom', d.valid_from, 'validUntil', d.valid_until, 'holderMessage', d.holder_message)
         FROM last_dec d)
    WHEN EXISTS (SELECT 1 FROM last_withdrawn) THEN
      (SELECT jsonb_build_object('state', 'withdrawn', 'requestId', w.id, 'since', w.submitted_at) FROM last_withdrawn w)
    ELSE jsonb_build_object('state', 'none')
  END;
$$;
REVOKE ALL ON FUNCTION public.sp_entry_review_state_core(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.sp_entry_review_state(_claim_id uuid, _period_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF public.sp_review_reader(_claim_id, _period_id) IS NULL THEN
    RAISE EXCEPTION 'SP_TARGET_NOT_FOUND' USING ERRCODE = 'no_data_found';
  END IF;
  RETURN public.sp_entry_review_state_core(_claim_id, _period_id);
END $$;
REVOKE ALL ON FUNCTION public.sp_entry_review_state(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_entry_review_state(uuid, uuid) TO authenticated;

-- Ordered history: requests submitted, decisions (with the holder message;
-- the internal note only for a verifier), clarification replies.
CREATE FUNCTION public.sp_review_thread(_claim_id uuid, _period_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE _reader text := public.sp_review_reader(_claim_id, _period_id);
BEGIN
  IF _reader IS NULL THEN RAISE EXCEPTION 'SP_TARGET_NOT_FOUND' USING ERRCODE = 'no_data_found'; END IF;
  RETURN jsonb_build_object(
    'current', public.sp_entry_review_state_core(_claim_id, _period_id),
    'events', coalesce((
      SELECT jsonb_agg(e - 'seq' ORDER BY (e->>'seq')::timestamptz)
        FROM (
          SELECT jsonb_build_object('type', 'decision', 'at', d.decided_at, 'seq', d.recorded_at, 'requestId', d.request_id,
                   'decision', d.decision, 'method', d.verification_method, 'organisation', d.decider_organisation,
                   'validFrom', d.valid_from, 'validUntil', d.valid_until, 'holderMessage', d.holder_message,
                   'internalNote', CASE WHEN _reader = 'verifier' THEN d.decision_note END) AS e
            FROM public.sp_verification_decisions d
            JOIN public.sp_verification_requests r ON r.id = d.request_id
           WHERE (_claim_id IS NOT NULL AND r.claim_id = _claim_id) OR (_period_id IS NOT NULL AND r.period_id = _period_id)
          UNION ALL
          SELECT jsonb_build_object('type', 'reply', 'at', p.created_at, 'seq', p.created_at, 'requestId', p.request_id,
                   'body', p.body, 'answersSubmittedAt', p.answers_submitted_at)
            FROM public.sp_verification_replies p
            JOIN public.sp_verification_requests r ON r.id = p.request_id
           WHERE (_claim_id IS NOT NULL AND r.claim_id = _claim_id) OR (_period_id IS NOT NULL AND r.period_id = _period_id)
        ) x), '[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.sp_review_thread(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_review_thread(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Inbox and e-mail outbox.
-- ---------------------------------------------------------------------------
CREATE TABLE public.user_notices (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  audience           text NOT NULL CHECK (audience IN ('holder', 'reviewer', 'recruiter')),
  kind               text NOT NULL CHECK (kind IN (
                       'passport_review_requested', 'passport_clarification_answered',
                       'passport_clarification_requested', 'passport_decision_approved',
                       'passport_decision_rejected', 'passport_verification_revoked')),
  -- What the notice is about. Ids only; the reader resolves names under its own rules.
  subject_type       text NOT NULL CHECK (subject_type IN ('claim', 'experience', 'request')),
  subject_id         uuid NOT NULL,
  request_id         uuid,
  dedupe_key         text NOT NULL CHECK (char_length(dedupe_key) BETWEEN 1 AND 200),
  created_at         timestamptz NOT NULL DEFAULT now(),
  read_at            timestamptz,
  email_status       text NOT NULL DEFAULT 'pending'
                       CHECK (email_status IN ('pending', 'claimed', 'sent', 'failed', 'skipped', 'not_configured')),
  email_attempts     integer NOT NULL DEFAULT 0 CHECK (email_attempts BETWEEN 0 AND 20),
  email_claimed_at   timestamptz,
  email_claim_token  uuid,
  email_sent_at      timestamptz,
  email_error_code   text CHECK (email_error_code IS NULL OR char_length(email_error_code) <= 80),
  UNIQUE (recipient_user_id, dedupe_key)
);
CREATE INDEX user_notices_recipient_idx ON public.user_notices (recipient_user_id, created_at DESC);
CREATE INDEX user_notices_email_due_idx ON public.user_notices (created_at) WHERE email_status IN ('pending', 'claimed', 'failed');

ALTER TABLE public.user_notices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_notices FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, recipient_user_id, audience, kind, subject_type, subject_id, request_id, created_at, read_at)
  ON public.user_notices TO authenticated;
CREATE POLICY user_notices_own_read ON public.user_notices
  FOR SELECT TO authenticated USING (recipient_user_id = auth.uid());

-- Inbox read for the signed-in user, newest first, with the facts each kind needs.
CREATE FUNCTION public.user_notices_inbox(_limit integer DEFAULT 30)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = 'insufficient_privilege'; END IF;
  RETURN jsonb_build_object(
    'unread', (SELECT count(*) FROM public.user_notices WHERE recipient_user_id = auth.uid() AND read_at IS NULL),
    'items', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', n.id, 'audience', n.audience, 'kind', n.kind, 'subjectType', n.subject_type,
               'subjectId', n.subject_id, 'requestId', n.request_id, 'createdAt', n.created_at, 'readAt', n.read_at,
               -- For the holder: the merit's own name. For a reviewer: the catalogue name only.
               'credentialCode', c.credential_code,
               'title', CASE WHEN n.audience = 'holder' THEN coalesce(c.title, p.role_title) END)
             ORDER BY n.created_at DESC)
        FROM (SELECT * FROM public.user_notices WHERE recipient_user_id = auth.uid()
               ORDER BY created_at DESC LIMIT greatest(1, least(coalesce(_limit, 30), 100))) n
        LEFT JOIN public.sp_claims c ON n.subject_type = 'claim' AND c.id = n.subject_id
        LEFT JOIN public.sp_experience_periods p ON n.subject_type = 'experience' AND p.id = n.subject_id), '[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.user_notices_inbox(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_notices_inbox(integer) TO authenticated;

CREATE FUNCTION public.user_notices_mark_read(_ids uuid[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE _n integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = 'insufficient_privilege'; END IF;
  UPDATE public.user_notices SET read_at = now()
   WHERE recipient_user_id = auth.uid() AND read_at IS NULL
     AND (_ids IS NULL OR id = ANY (_ids));
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END $$;
REVOKE ALL ON FUNCTION public.user_notices_mark_read(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_notices_mark_read(uuid[]) TO authenticated;

-- Writer used by the triggers below. Never callable by a client.
CREATE FUNCTION public.user_notices_enqueue(
  _recipient uuid, _audience text, _kind text, _subject_type text, _subject_id uuid,
  _request_id uuid, _dedupe_key text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  INSERT INTO public.user_notices (recipient_user_id, audience, kind, subject_type, subject_id, request_id, dedupe_key)
  SELECT _recipient, _audience, _kind, _subject_type, _subject_id, _request_id, _dedupe_key
   WHERE _recipient IS NOT NULL
  ON CONFLICT (recipient_user_id, dedupe_key) DO NOTHING;
$$;
REVOKE ALL ON FUNCTION public.user_notices_enqueue(uuid, text, text, text, uuid, uuid, text) FROM PUBLIC, anon, authenticated;

-- Reviewers who receive passport notices: explicit passport_verifier holders.
-- Platform administrators are not mailed by default; they see the queue.
CREATE FUNCTION public.sp_notice_reviewers()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT DISTINCT ur.user_id FROM public.user_roles ur
   WHERE ur.role = 'passport_verifier'::public.app_role
   ORDER BY ur.user_id LIMIT 20;
$$;
REVOKE ALL ON FUNCTION public.sp_notice_reviewers() FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.sp_notice_on_request() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE _subject_type text := CASE WHEN NEW.claim_id IS NOT NULL THEN 'claim' ELSE 'experience' END;
        _reviewer uuid; _kind text;
BEGIN
  IF NEW.request_kind <> 'cqrityjob_review' OR NEW.status <> 'pending' THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN _kind := 'passport_review_requested';
  ELSIF OLD.status = 'clarification_requested' THEN _kind := 'passport_clarification_answered';
  ELSE RETURN NEW; END IF;
  FOR _reviewer IN SELECT public.sp_notice_reviewers() LOOP
    CONTINUE WHEN _reviewer = NEW.holder_user_id;
    PERFORM public.user_notices_enqueue(_reviewer, 'reviewer', _kind, _subject_type,
              coalesce(NEW.claim_id, NEW.period_id), NEW.id,
              'review:' || NEW.id || ':' || to_char(NEW.submitted_at AT TIME ZONE 'UTC', 'YYYYMMDDHH24MISSUS'));
  END LOOP;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.sp_notice_on_request() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER sp_notice_on_request AFTER INSERT OR UPDATE OF status, submitted_at ON public.sp_verification_requests
  FOR EACH ROW EXECUTE FUNCTION public.sp_notice_on_request();

CREATE FUNCTION public.sp_notice_on_decision() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE _r public.sp_verification_requests%ROWTYPE; _kind text;
BEGIN
  SELECT * INTO _r FROM public.sp_verification_requests WHERE id = NEW.request_id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  _kind := CASE NEW.decision
             WHEN 'approved' THEN 'passport_decision_approved'
             WHEN 'rejected' THEN 'passport_decision_rejected'
             WHEN 'clarification_requested' THEN 'passport_clarification_requested'
             WHEN 'revoked' THEN 'passport_verification_revoked' END;
  IF _kind IS NULL THEN RETURN NEW; END IF;
  PERFORM public.user_notices_enqueue(NEW.holder_user_id, 'holder', _kind,
            CASE WHEN _r.claim_id IS NOT NULL THEN 'claim' ELSE 'experience' END,
            coalesce(_r.claim_id, _r.period_id), _r.id, 'decision:' || NEW.id);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.sp_notice_on_decision() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER sp_notice_on_decision AFTER INSERT ON public.sp_verification_decisions
  FOR EACH ROW EXECUTE FUNCTION public.sp_notice_on_decision();

-- E-mail worker (service role only). Claims due rows under a 3-minute lease,
-- re-checks that the recipient may still receive the notice, and returns the
-- address and locale read at claim time. Rows the recipient may no longer
-- receive are settled 'skipped' here and never returned.
CREATE FUNCTION public.user_notices_still_allowed(_n public.user_notices)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT CASE _n.audience
    WHEN 'reviewer' THEN EXISTS (SELECT 1 FROM public.user_roles ur
                                  WHERE ur.user_id = _n.recipient_user_id AND ur.role = 'passport_verifier'::public.app_role)
    WHEN 'holder' THEN true
    ELSE false
  END;
$$;
REVOKE ALL ON FUNCTION public.user_notices_still_allowed(public.user_notices) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.user_notices_claim_emails(_limit integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE _token uuid := gen_random_uuid(); _out jsonb;
BEGIN
  UPDATE public.user_notices n SET email_status = 'skipped', email_error_code = 'recipient_not_allowed'
   WHERE n.email_status IN ('pending', 'failed') AND NOT public.user_notices_still_allowed(n);

  WITH due AS (
    SELECT n.id FROM public.user_notices n
     WHERE (n.email_status = 'pending'
         OR (n.email_status = 'failed' AND n.email_attempts < 5
             AND n.email_claimed_at < now() - make_interval(mins => 5 * n.email_attempts))
         OR (n.email_status = 'claimed' AND n.email_claimed_at < now() - interval '3 minutes'))
       AND n.created_at > now() - interval '7 days'
     ORDER BY n.created_at
     LIMIT greatest(1, least(coalesce(_limit, 20), 50))
     FOR UPDATE SKIP LOCKED),
  claimed AS (
    UPDATE public.user_notices n
       SET email_status = 'claimed', email_claimed_at = now(), email_claim_token = _token,
           email_attempts = n.email_attempts + 1
      FROM due WHERE n.id = due.id
    RETURNING n.*)
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id, 'claimToken', c.email_claim_token, 'kind', c.kind, 'audience', c.audience,
           'subjectType', c.subject_type, 'subjectId', c.subject_id, 'requestId', c.request_id,
           'email', u.email, 'locale', coalesce(pr.locale, 'sv'),
           'credentialCode', cl.credential_code)), '[]'::jsonb)
    INTO _out
    FROM claimed c
    JOIN auth.users u ON u.id = c.recipient_user_id
    LEFT JOIN public.profiles pr ON pr.id = c.recipient_user_id
    LEFT JOIN public.sp_claims cl ON c.subject_type = 'claim' AND cl.id = c.subject_id;
  RETURN _out;
END $$;
REVOKE ALL ON FUNCTION public.user_notices_claim_emails(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.user_notices_claim_emails(integer) TO service_role;

CREATE FUNCTION public.user_notices_settle_email(_id uuid, _claim_token uuid, _outcome text, _error_code text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE _n integer;
BEGIN
  IF _outcome NOT IN ('sent', 'failed', 'skipped', 'not_configured') THEN
    RAISE EXCEPTION 'NOTICE_OUTCOME_INVALID' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.user_notices
     SET email_status = _outcome,
         email_sent_at = CASE WHEN _outcome = 'sent' THEN now() END,
         email_error_code = left(_error_code, 80)
   WHERE id = _id AND email_status = 'claimed' AND email_claim_token = _claim_token;
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n = 1;
END $$;
REVOKE ALL ON FUNCTION public.user_notices_settle_email(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.user_notices_settle_email(uuid, uuid, text, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 6. Product metrics: what happened and when. No person, no content.
-- ---------------------------------------------------------------------------
CREATE TABLE public.product_metric_events (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_name  text NOT NULL CHECK (event_name IN (
                'passport_first_merit_saved', 'passport_review_requested',
                'talent_visibility_enabled', 'talent_contact_requested', 'talent_contact_accepted')),
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX product_metric_events_name_idx ON public.product_metric_events (event_name, occurred_at);
ALTER TABLE public.product_metric_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.product_metric_events FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.product_metric_record(_event text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  INSERT INTO public.product_metric_events (event_name) VALUES (_event);
$$;
REVOKE ALL ON FUNCTION public.product_metric_record(text) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.product_metric_counts(_from date, _to date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'NOT_AUTHORISED' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN coalesce((SELECT jsonb_object_agg(event_name, n) FROM (
    SELECT event_name, count(*) AS n FROM public.product_metric_events
     WHERE occurred_at >= coalesce(_from, '-infinity'::date) AND occurred_at < coalesce(_to, 'infinity'::date) + 1
     GROUP BY event_name) x), '{}'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.product_metric_counts(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.product_metric_counts(date, date) TO authenticated;

CREATE FUNCTION public.sp_metric_on_claim() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.supersedes_id IS NULL AND public.sp_is_passport_credential(NEW.claim_type, NEW.credential_code)
     AND NOT EXISTS (SELECT 1 FROM public.sp_claims c
                      WHERE c.holder_user_id = NEW.holder_user_id AND c.id <> NEW.id
                        AND public.sp_is_passport_credential(c.claim_type, c.credential_code)) THEN
    PERFORM public.product_metric_record('passport_first_merit_saved');
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.sp_metric_on_claim() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER sp_metric_on_claim AFTER INSERT ON public.sp_claims
  FOR EACH ROW EXECUTE FUNCTION public.sp_metric_on_claim();

CREATE FUNCTION public.sp_metric_on_request() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.product_metric_record('passport_review_requested');
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.sp_metric_on_request() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER sp_metric_on_request AFTER INSERT ON public.sp_verification_requests
  FOR EACH ROW EXECUTE FUNCTION public.sp_metric_on_request();

-- ---------------------------------------------------------------------------
-- Postflight.
-- ---------------------------------------------------------------------------
DO $$
DECLARE f text;
BEGIN
  IF position('SP_REVIEW_STALE' IN (SELECT prosrc FROM pg_proc
       WHERE oid = 'public.sp_verifier_decide(uuid,text,text,text,text,date,date)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'SP_REPLY_HISTORY_PROOF: sp_verifier_decide lost the reviewed-content binding';
  END IF;
  FOREACH f IN ARRAY ARRAY[
    'public.sp_reply_to_clarification(uuid,timestamptz,text)',
    'public.sp_entry_review_state(uuid,uuid)', 'public.sp_review_thread(uuid,uuid)',
    'public.user_notices_inbox(integer)', 'public.user_notices_mark_read(uuid[])',
    'public.user_notices_claim_emails(integer)', 'public.user_notices_settle_email(uuid,uuid,text,text)',
    'public.product_metric_counts(date,date)', 'public.user_notices_enqueue(uuid,text,text,text,uuid,uuid,text)',
    'public.product_metric_record(text)'] LOOP
    IF has_function_privilege('anon', f, 'EXECUTE') THEN
      RAISE EXCEPTION 'SP_REPLY_HISTORY_PROOF: anon may execute %', f;
    END IF;
  END LOOP;
  FOREACH f IN ARRAY ARRAY['public.user_notices_claim_emails(integer)', 'public.user_notices_settle_email(uuid,uuid,text,text)',
                           'public.user_notices_enqueue(uuid,text,text,text,uuid,uuid,text)', 'public.product_metric_record(text)'] LOOP
    IF has_function_privilege('authenticated', f, 'EXECUTE') THEN
      RAISE EXCEPTION 'SP_REPLY_HISTORY_PROOF: authenticated may execute %', f;
    END IF;
  END LOOP;
  RAISE NOTICE 'SP_REPLY_HISTORY_PROOF ok';
END $$;

COMMIT;
