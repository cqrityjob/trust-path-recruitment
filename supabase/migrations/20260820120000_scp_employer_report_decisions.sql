-- Part F: the employer's decision, recorded beside the report and never inside it.
--
-- ── WHY THIS CANNOT LIVE IN THE SNAPSHOT ────────────────────────────────
--
-- scp_report_snapshots is UNIQUE (attempt_id, audience) and
-- scp_guard_snapshot_immutable blocks UPDATE and DELETE. That is deliberate: a
-- released report is evidence, and evidence that can be edited after the fact
-- is not evidence.
--
-- But the employer decides LATER, sometimes days later, and may revise the
-- decision after a conversation. Writing that into the snapshot would mean
-- either making the report mutable or pretending the decision was known at
-- release. So the decision is a separate, append-only record that the surfaces
-- COMPOSE with the report while keeping both identities and timestamps visible.
-- A reader can always tell what the assessment said from what the employer
-- concluded, and when each happened.
--
-- ── WHY CORRECTION IS A NEW ROW ─────────────────────────────────────────
--
-- There is no UPDATE and no DELETE. A revised decision inserts a new row that
-- points at the one it supersedes, so the history of what was decided, by whom
-- and when survives the revision. An employment decision that could be quietly
-- rewritten afterwards would be worth very little to the person it was about.
--
-- ── WHAT THE VOCABULARY DELIBERATELY EXCLUDES ───────────────────────────
--
-- The action list contains no "hire", "reject", "suitable" or "unsuitable", and
-- the reason list contains no ranking or scoring term. The Source of Truth
-- forbids the product from producing an employment verdict, and a controlled
-- vocabulary that offered one would put that verdict in the product's mouth
-- even though a person clicked it. What is recorded is the follow-up the
-- employer chose; the employment decision itself stays outside this system.
--
-- Nothing here converts a candidate into an employee. That remains an explicit,
-- separate, audited act.
--
-- Forward-only. Remediation: DROP TABLE public.scp_employer_report_decisions
-- CASCADE and DROP FUNCTION public.scp_record_employer_decision(...). No
-- existing row in any other table is read or written by this migration.

CREATE TABLE IF NOT EXISTS public.scp_employer_report_decisions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id      uuid NOT NULL REFERENCES public.scp_attempts(id) ON DELETE RESTRICT,
  employer_id     uuid NOT NULL REFERENCES public.employers(id) ON DELETE RESTRICT,
  decided_by      uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  decided_at      timestamptz NOT NULL DEFAULT now(),
  action          text NOT NULL CHECK (action IN (
                     'follow_up_conversation',
                     'assign_development',
                     'gather_more_evidence',
                     'safety_follow_up',
                     'no_action_needed')),
  reason_code     text NOT NULL CHECK (reason_code IN (
                     'evidence_thin',
                     'safety_observation',
                     'competency_gap',
                     'meets_expectation',
                     'other')),
  -- Bounded on purpose. IMY is explicit that free text about a person carries
  -- extra risk, so this is a short factual note beside a controlled field, not
  -- an open assessment box.
  reason_note     text CHECK (reason_note IS NULL OR length(reason_note) <= 500),
  next_step       text CHECK (next_step IS NULL OR length(next_step) <= 300),
  next_step_owner text CHECK (next_step_owner IS NULL OR length(next_step_owner) <= 120),
  supersedes_id   uuid REFERENCES public.scp_employer_report_decisions(id) ON DELETE RESTRICT,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scp_decision_not_self_superseding CHECK (supersedes_id IS DISTINCT FROM id)
);

CREATE INDEX IF NOT EXISTS scp_employer_report_decisions_attempt_idx
  ON public.scp_employer_report_decisions (attempt_id, decided_at DESC);

-- A decision may be superseded once. Without this, two corrections could both
-- claim to replace the same record and "current" would be ambiguous.
CREATE UNIQUE INDEX IF NOT EXISTS scp_employer_report_decisions_supersedes_once
  ON public.scp_employer_report_decisions (supersedes_id)
  WHERE supersedes_id IS NOT NULL;

ALTER TABLE public.scp_employer_report_decisions ENABLE ROW LEVEL SECURITY;

-- Readable by the commissioning organisation's members. Deliberately NOT by the
-- participant: Part F is the employer's own reasoning about a follow-up, and
-- §10 keeps employer decision material out of the participant's report.
DROP POLICY IF EXISTS scp_employer_decisions_member_read ON public.scp_employer_report_decisions;
CREATE POLICY scp_employer_decisions_member_read ON public.scp_employer_report_decisions
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.employer_memberships m
                  WHERE m.employer_id = scp_employer_report_decisions.employer_id
                    AND m.user_id = auth.uid() AND m.status = 'active'));

-- No INSERT, UPDATE or DELETE policy exists. Every write goes through
-- scp_record_employer_decision, which is where the owner/admin check lives.
-- A member can read the decision and cannot make one.

CREATE OR REPLACE FUNCTION public.scp_guard_decision_append_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RAISE EXCEPTION
    'SCP_DECISION_APPEND_ONLY: an employer decision cannot be edited or removed. '
    'Record a new decision that supersedes it.'
    USING ERRCODE = 'check_violation';
END;
$function$;

DROP TRIGGER IF EXISTS scp_employer_decisions_append_only ON public.scp_employer_report_decisions;
CREATE TRIGGER scp_employer_decisions_append_only
  BEFORE UPDATE OR DELETE ON public.scp_employer_report_decisions
  FOR EACH ROW EXECUTE FUNCTION public.scp_guard_decision_append_only();

-- ═══════════════════════════════════════════════════════════════════════════
-- Recording a decision
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.scp_record_employer_decision(
  _attempt_id uuid,
  _action text,
  _reason_code text,
  _reason_note text DEFAULT NULL,
  _next_step text DEFAULT NULL,
  _next_step_owner text DEFAULT NULL,
  _supersedes_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE _a public.scp_attempts%ROWTYPE; _role text; _id uuid;
BEGIN
  SELECT a.* INTO _a FROM public.scp_attempts a WHERE a.id = _attempt_id;
  IF _a.id IS NULL THEN
    RAISE EXCEPTION 'SCP_ATTEMPT_NOT_FOUND: no such attempt.'
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Same bar as releasing. Recording what an organisation concluded about a
  -- person is not an ordinary member's act.
  SELECT m.role INTO _role FROM public.employer_memberships m
   WHERE m.user_id = auth.uid() AND m.employer_id = _a.issuer_organization_id
     AND m.status = 'active';
  IF _role IS NULL OR _role NOT IN ('owner','admin') THEN
    RAISE EXCEPTION
      'SCP_NOT_AUTHORISED_TO_DECIDE: recording an employer decision requires '
      'owner or admin in the commissioning organisation.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- A decision needs something to be about. Deciding before the report exists
  -- would mean deciding without the evidence.
  IF _a.released_at IS NULL THEN
    RAISE EXCEPTION
      'SCP_DECISION_BEFORE_RELEASE: a decision can only be recorded once the '
      'report has been released.' USING ERRCODE = 'check_violation';
  END IF;

  IF _supersedes_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.scp_employer_report_decisions d
                    WHERE d.id = _supersedes_id AND d.attempt_id = _attempt_id) THEN
      RAISE EXCEPTION
        'SCP_DECISION_SUPERSEDES_FOREIGN: a correction must supersede a decision '
        'on the same attempt.' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  INSERT INTO public.scp_employer_report_decisions
    (attempt_id, employer_id, decided_by, action, reason_code, reason_note,
     next_step, next_step_owner, supersedes_id)
  VALUES
    (_attempt_id, _a.issuer_organization_id, auth.uid(), _action, _reason_code,
     nullif(btrim(coalesce(_reason_note,'')), ''),
     nullif(btrim(coalesce(_next_step,'')), ''),
     nullif(btrim(coalesce(_next_step_owner,'')), ''),
     _supersedes_id)
  RETURNING id INTO _id;

  RETURN _id;
END;
$function$;

REVOKE ALL ON FUNCTION public.scp_record_employer_decision(uuid, text, text, text, text, text, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_record_employer_decision(uuid, text, text, text, text, text, uuid)
  TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- Reading the history
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Returns every decision, newest first, with a flag for the one that is
-- current. Superseded rows are returned rather than hidden: the point of an
-- append-only record is that the earlier decision remains legible.

CREATE OR REPLACE FUNCTION public.scp_employer_decisions(_attempt_id uuid)
RETURNS TABLE(id uuid, decided_at timestamptz, decided_by_email text,
              action text, reason_code text, reason_note text,
              next_step text, next_step_owner text,
              supersedes_id uuid, is_current boolean)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE _emp uuid;
BEGIN
  SELECT a.issuer_organization_id INTO _emp
    FROM public.scp_attempts a WHERE a.id = _attempt_id;
  IF _emp IS NULL THEN RETURN; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.employer_memberships m
                  WHERE m.employer_id = _emp AND m.user_id = auth.uid()
                    AND m.status = 'active') THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT d.id, d.decided_at, u.email::text, d.action, d.reason_code, d.reason_note,
         d.next_step, d.next_step_owner, d.supersedes_id,
         -- Current means nothing supersedes it.
         NOT EXISTS (SELECT 1 FROM public.scp_employer_report_decisions s
                      WHERE s.supersedes_id = d.id)
    FROM public.scp_employer_report_decisions d
    JOIN auth.users u ON u.id = d.decided_by
   WHERE d.attempt_id = _attempt_id
   ORDER BY d.decided_at DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.scp_employer_decisions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_employer_decisions(uuid) TO authenticated;
