-- The audit vocabulary has to contain the words the application writes.
--
-- ── WHAT WENT WRONG ─────────────────────────────────────────────────────
--
-- 20260814090000 rebuilt job_audit_events_action_check from a fixed list plus
-- whatever DISTINCT actions happened to be in the table when it ran:
--
--     SELECT array_agg(DISTINCT action) INTO _actions FROM public.job_audit_events;
--     _actions := coalesce(_actions,'{}') || ARRAY['created','updated',...];
--
-- The fixed list does not include 'closed' or 'duplicated_from', which
-- closeEmployerJob and duplicateEmployerJob have both written since long
-- before that migration. So whether those two are legal depends on whether a
-- row already carried them in the database being migrated -- true on hosted,
-- false on a fresh replay. An environment-dependent CHECK constraint is not a
-- constraint, it is a coin toss.
--
-- It has been invisible because writeAudit() swallows every failure by design:
-- the employer's action already succeeded and an audit insert must never undo
-- it. The cost of that correct decision is that a rejected audit row is
-- silent, and silence is exactly what an audit trail must not have.
--
-- ── WHY IT MATTERS NOW ──────────────────────────────────────────────────
--
-- 20260909090000 introduces the first action in this product that destroys a
-- row: jobs_delete_draft(). deleteEmployerJob writes action = 'deleted', and
-- 'deleted' is in neither list. The one event where the audit row is the only
-- remaining evidence that the advertisement ever existed is the one event the
-- constraint would reject.
--
-- ── WHAT THIS DOES ──────────────────────────────────────────────────────
--
-- Names the full vocabulary explicitly, and keeps every value already present
-- so no existing row is invalidated. No column, policy or row is changed.
--
-- Forward-only. Remediation: re-run 20260814090000's DO block.

DO $$
DECLARE _actions text[];
BEGIN
  -- Everything already recorded stays legal: this migration must never turn a
  -- historical row into a constraint violation.
  SELECT coalesce(array_agg(DISTINCT action), '{}') INTO _actions
    FROM public.job_audit_events;

  _actions := _actions || ARRAY[
    -- Creation and editing
    'created','updated','duplicated','duplicated_from',
    -- Moderation
    'submitted','approved','rejected','published',
    -- Ending a recruitment, and the two ways an advertisement leaves the list
    'closed','archived','restored','expired',
    -- The only destructive one. jobs_delete_draft() permits it solely for a
    -- draft that was never published and has nothing depending on it.
    'deleted'
  ];

  -- ── ASSERTIONS ─────────────────────────────────────────────────────────
  --
  -- Against the array rather than against pg_get_constraintdef(): format('%L')
  -- renders a text[] as one quoted literal, '{created,updated,...}', so the
  -- individual values do not appear as quoted tokens in the constraint text
  -- and a LIKE over it silently matches nothing. Asserting on the value that
  -- is about to become the constraint is both simpler and exact.
  --
  -- These three are what the application actually writes and the previous
  -- definition did not name.
  IF NOT ('deleted' = ANY (_actions)) THEN
    RAISE EXCEPTION 'JOB_AUDIT_VOCABULARY: a permanent delete cannot be recorded';
  END IF;
  IF NOT ('closed' = ANY (_actions)) THEN
    RAISE EXCEPTION 'JOB_AUDIT_VOCABULARY: closing an advertisement cannot be recorded';
  END IF;
  IF NOT ('duplicated_from' = ANY (_actions)) THEN
    RAISE EXCEPTION 'JOB_AUDIT_VOCABULARY: duplication cannot be recorded';
  END IF;

  ALTER TABLE public.job_audit_events
    DROP CONSTRAINT IF EXISTS job_audit_events_action_check;

  EXECUTE format(
    'ALTER TABLE public.job_audit_events ADD CONSTRAINT job_audit_events_action_check '
    'CHECK (action = ANY (%L))', _actions);
END $$;

-- The constraint exists and is the one just written. A DROP that succeeded
-- while the ADD did not would leave the column unconstrained, which is a
-- quieter failure than either.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = 'public'
       AND t.relname = 'job_audit_events'
       AND c.conname = 'job_audit_events_action_check'
       AND c.contype = 'c'
  ) THEN
    RAISE EXCEPTION 'JOB_AUDIT_VOCABULARY: the action CHECK is missing entirely';
  END IF;
END $$;
