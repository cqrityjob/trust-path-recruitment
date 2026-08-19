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
  reason_note     text CHECK (reason_note IS NULL OR length(reason_note) <= 500),
  next_step       text CHECK (next_step IS NULL OR length(next_step) <= 300),
  next_step_owner text CHECK (next_step_owner IS NULL OR length(next_step_owner) <= 120),
  supersedes_id   uuid REFERENCES public.scp_employer_report_decisions(id) ON DELETE RESTRICT,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scp_decision_not_self_superseding CHECK (supersedes_id IS DISTINCT FROM id)
);

CREATE INDEX IF NOT EXISTS scp_employer_report_decisions_attempt_idx
  ON public.scp_employer_report_decisions (attempt_id, decided_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS scp_employer_report_decisions_supersedes_once
  ON public.scp_employer_report_decisions (supersedes_id)
  WHERE supersedes_id IS NOT NULL;

ALTER TABLE public.scp_employer_report_decisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS scp_employer_decisions_member_read ON public.scp_employer_report_decisions;
CREATE POLICY scp_employer_decisions_member_read ON public.scp_employer_report_decisions
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.employer_memberships m
                  WHERE m.employer_id = scp_employer_report_decisions.employer_id
                    AND m.user_id = auth.uid() AND m.status = 'active'));

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

  SELECT m.role INTO _role FROM public.employer_memberships m
   WHERE m.user_id = auth.uid() AND m.employer_id = _a.issuer_organization_id
     AND m.status = 'active';
  IF _role IS NULL OR _role NOT IN ('owner','admin') THEN
    RAISE EXCEPTION
      'SCP_NOT_AUTHORISED_TO_DECIDE: recording an employer decision requires '
      'owner or admin in the commissioning organisation.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

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