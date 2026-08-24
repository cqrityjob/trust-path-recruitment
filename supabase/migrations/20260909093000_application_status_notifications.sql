-- Knowing whether a candidate was actually told.
--
-- ── WHY NOT A NEW TABLE ─────────────────────────────────────────────────
--
-- A customer asked for the obvious thing: when an employer marks a candidate
-- as no longer progressing, or calls them to interview, the candidate should
-- hear about it. Sending is the easy half. The hard half is being able to
-- answer, later, "was she told, and did it work?" -- without which the feature
-- is a hope rather than a process.
--
-- The instinct is an outbox table. There already is one, in everything but
-- name: job_application_status_events has exactly one row per employer
-- transition, is already RLS-scoped to the applicant and the employer, and is
-- already the audit trail both sides read. A separate notifications table
-- would duplicate its keys, its policies and its lifecycle, and would then
-- need reconciling against it whenever the two disagreed.
--
-- So the event row carries the delivery outcome. Three consequences fall out
-- for free rather than being designed:
--
--   deduplication   one event, one row, one notified_at. A second send is
--                   impossible to record, so the code that checks it cannot
--                   be the only thing preventing a duplicate.
--   retry safety    notified_at IS NULL AND notify_attempts < N is the whole
--                   retry query. No cursor, no queue, no lock.
--   auditability    a timestamp, or a reason, on the row describing the
--                   transition it belongs to.
--
-- ── WHAT IS DELIBERATELY NOT STORED ─────────────────────────────────────
--
-- Not the message. A candidate-facing email in this product carries no score,
-- no assessment content and no reason for the employer's decision, so there is
-- nothing in the body worth keeping that the event row does not already say --
-- and storing rendered messages about people would be a copy of personal data
-- with no purpose to justify it.
--
-- notify_error holds a provider status like "HTTP 422", never a body: those can
-- carry recipient detail, and this column is readable by the employer.
--
-- Additive, forward-only, all NULLable or defaulted. Every existing row means
-- "not notified", which is true. Remediation:
--   ALTER TABLE public.job_application_status_events
--     DROP COLUMN notified_at, DROP COLUMN notify_error,
--     DROP COLUMN notify_attempts;

ALTER TABLE public.job_application_status_events
  ADD COLUMN IF NOT EXISTS notified_at     timestamptz,
  ADD COLUMN IF NOT EXISTS notify_error    text,
  ADD COLUMN IF NOT EXISTS notify_attempts integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.job_application_status_events.notified_at IS
  'When the candidate was successfully told about this transition. NULL means '
  'not sent -- either not a candidate-facing status, not yet attempted, or '
  'failed. One row per transition, so this is also the deduplication key.';
COMMENT ON COLUMN public.job_application_status_events.notify_error IS
  'Why the last attempt failed, as a provider status code. Never a provider '
  'response body: those can carry recipient detail and this column is readable '
  'by the employer.';
COMMENT ON COLUMN public.job_application_status_events.notify_attempts IS
  'Attempts made, so a permanently failing address stops being retried instead '
  'of being retried forever.';

-- Sent and failed are different states and must not both be recordable at once.
ALTER TABLE public.job_application_status_events
  DROP CONSTRAINT IF EXISTS jase_notified_xor_error;
ALTER TABLE public.job_application_status_events
  ADD CONSTRAINT jase_notified_xor_error
  CHECK (notified_at IS NULL OR notify_error IS NULL);

-- The retry query's index. Partial, because the rows that matter are the few
-- still owed a message, not the history.
CREATE INDEX IF NOT EXISTS jase_pending_notification_idx
  ON public.job_application_status_events (created_at)
  WHERE notified_at IS NULL;

-- ---------------------------------------------------------------------------
-- Recording the outcome
-- ---------------------------------------------------------------------------
--
-- SECURITY DEFINER because the sender runs after set_application_status() has
-- returned and needs to write one column on a row whose UPDATE policy is
-- deliberately narrow. The function writes nothing else, cannot move a status,
-- and refuses an event belonging to another organisation.

CREATE OR REPLACE FUNCTION public.jase_record_notification(
  _event_id uuid,
  _ok       boolean,
  _error    text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE _employer uuid;
BEGIN
  SELECT a.employer_id INTO _employer
    FROM public.job_application_status_events e
    JOIN public.job_applications a ON a.id = e.application_id
   WHERE e.id = _event_id;

  IF _employer IS NULL THEN
    RAISE EXCEPTION 'JASE_EVENT_NOT_FOUND: no such status event.'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.employer_memberships m
     WHERE m.user_id = auth.uid() AND m.employer_id = _employer AND m.status = 'active'
  ) THEN
    RAISE EXCEPTION 'JASE_NOT_AUTHORISED: not an active member of this organisation.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Idempotent: an event already delivered stays delivered. Without this, a
  -- retry that raced a success would overwrite the timestamp with an error.
  UPDATE public.job_application_status_events
     SET notified_at     = CASE WHEN _ok THEN now() ELSE NULL END,
         notify_error    = CASE WHEN _ok THEN NULL ELSE left(coalesce(_error, 'UNKNOWN'), 200) END,
         notify_attempts = notify_attempts + 1
   WHERE id = _event_id
     AND notified_at IS NULL;
END; $function$;

REVOKE ALL ON FUNCTION public.jase_record_notification(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.jase_record_notification(uuid, boolean, text) TO authenticated;

COMMENT ON FUNCTION public.jase_record_notification(uuid, boolean, text) IS
  'Records whether the candidate notification for one status transition was '
  'delivered. Idempotent: a delivered event stays delivered, so a racing retry '
  'cannot overwrite success with a failure.';
