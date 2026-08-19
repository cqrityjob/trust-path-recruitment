-- #47 — Training delivery: the assignment carrier, the module link, the progress.
--
-- ── WHY A DEDICATED ASSIGNMENT TABLE, AFTER AUDITING THE EXISTING ONE ───
--
-- assessment_assignments was examined first, as required, and it cannot carry a
-- training assignment without weakening a constraint that currently guards the
-- live pilot:
--
--   assessment_assignments_single_lineage
--     CHECK ((assessment_id IS NOT NULL AND assessment_version_id IS NOT NULL
--             AND profile_id IS NOT NULL AND scp_assessment_version_id IS NULL)
--         OR (assessment_id IS NULL AND assessment_version_id IS NULL
--             AND scp_assessment_version_id IS NOT NULL))
--
-- The constraint permits exactly two lineages and a training assignment is a
-- third: it references a PROGRAMME VERSION, and there is no column for one.
-- Carrying training there would mean relaxing single_lineage, widening
-- use_case, and making every policy and read model written for assessments also
-- answer for training -- during a pilot those policies are protecting.
--
-- The two lifecycles are also genuinely different. An assessment assignment
-- owns one attempt that is submitted, reviewed, scored and released. A training
-- assignment owns N modules, each independently startable, resumable and
-- completable, and produces no report at all.
--
-- So: one new table on the SAME governed spine -- employers, scp_subjects,
-- scp_program_versions, scp_purpose_versions -- not a parallel training
-- database. Nothing here duplicates an existing concept. Programmes, modules,
-- items, forms, attempts, responses, feedback and evidence are all reused
-- exactly as they are.
--
-- ── WHAT THIS ADDS ──────────────────────────────────────────────────────
--
--   scp_module_versions.learning_form_id   the missing module -> knowledge
--                                          check link. Until now
--                                          getLearningFormForModule was
--                                          hard-coded to the literal slug
--                                          'fixture-learning-form', so every
--                                          module served the same two items.
--   scp_training_assignments               employer -> subject -> programme
--                                          VERSION, purpose-bearing
--   scp_training_module_progress           per-module durable progress
--
-- ── ADDITIVE-ONLY ───────────────────────────────────────────────────────
--
-- One nullable column, two new tables, their policies, grants and guards. No
-- existing table, column, constraint, policy or row is altered or dropped, and
-- none of the three migrations from the previous #47 delivery is touched.
--
-- Dependencies, verified present on 62c8058: employers, has_employer_role,
-- scp_subjects, scp_subject_identities, scp_program_versions, scp_module_versions,
-- scp_purpose_versions, scp_attempts, scp_forms, scp_form_items,
-- scp_item_versions, scp_employer_report_decisions, and owner_employer_id from
-- 20260825090000.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. A module can name its own knowledge check
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.scp_module_versions
  ADD COLUMN IF NOT EXISTS learning_form_id uuid NULL
    REFERENCES public.scp_forms(id) ON DELETE RESTRICT;

COMMENT ON COLUMN public.scp_module_versions.learning_form_id IS
  'The learning-mode form delivering this module''s activity, or NULL for a '
  'read-only module. Replaces the hard-coded "fixture-learning-form" lookup, '
  'which served the same two items for every module in the catalogue.';

CREATE INDEX IF NOT EXISTS scp_module_versions_learning_form_idx
  ON public.scp_module_versions (learning_form_id) WHERE learning_form_id IS NOT NULL;

-- A learning form, or nothing. Pointing a module at an assessment form would
-- hand a learner the live item bank together with its feedback.
CREATE OR REPLACE FUNCTION public.scp_guard_module_form_is_learning()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE _mode text;
BEGIN
  IF NEW.learning_form_id IS NULL THEN RETURN NEW; END IF;

  SELECT DISTINCT iv.mode INTO _mode
    FROM public.scp_form_items fi
    JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
   WHERE fi.form_id = NEW.learning_form_id;

  -- A form with no items yet cannot be proven non-learning, and
  -- scp_guard_form_single_mode already stops it becoming mixed later.
  IF _mode IS NOT NULL AND _mode <> 'learning' THEN
    RAISE EXCEPTION
      'SCP_MODULE_FORM_NOT_LEARNING: module version % points at a "%" form. A '
      'module may only deliver learning-mode items.', NEW.id, _mode
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $function$;

DROP TRIGGER IF EXISTS scp_module_versions_form_is_learning ON public.scp_module_versions;
CREATE TRIGGER scp_module_versions_form_is_learning
  BEFORE INSERT OR UPDATE OF learning_form_id ON public.scp_module_versions
  FOR EACH ROW EXECUTE FUNCTION public.scp_guard_module_form_is_learning();

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. The training assignment
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.scp_training_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id uuid NOT NULL REFERENCES public.employers(id) ON DELETE RESTRICT,
  -- Version-pinned, never program_id. Publishing v2 must not change what an
  -- in-flight participant sees or what a completed one did.
  program_version_id uuid NOT NULL
    REFERENCES public.scp_program_versions(id) ON DELETE RESTRICT,
  subject_id uuid NOT NULL REFERENCES public.scp_subjects(id) ON DELETE RESTRICT,
  assigned_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  language text NOT NULL CHECK (language IN ('sv','en')),
  -- Why this organisation may process this person for this. Same governed
  -- vocabulary the assessment path resolves through scp_required_purpose_code.
  purpose_version_id uuid NOT NULL
    REFERENCES public.scp_purpose_versions(id) ON DELETE RESTRICT,
  employer_message text CHECK (employer_message IS NULL OR length(employer_message) <= 2000),
  status text NOT NULL DEFAULT 'assigned'
    CHECK (status IN ('assigned','in_progress','completed','cancelled')),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  due_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  cancellation_reason text,
  -- The Assessment -> Training audit link: which released report caused which
  -- decision caused this assignment.
  source_decision_id uuid
    REFERENCES public.scp_employer_report_decisions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scp_training_assignment_cancellation_complete CHECK (
    (status <> 'cancelled')
    OR (cancelled_at IS NOT NULL AND cancelled_by IS NOT NULL
        AND cancellation_reason IS NOT NULL)),
  CONSTRAINT scp_training_assignment_completion_timestamped CHECK (
    (status <> 'completed') OR completed_at IS NOT NULL)
);

COMMENT ON TABLE public.scp_training_assignments IS
  'An employer asking one person to work through one governed programme '
  'VERSION. Deliberately separate from assessment_assignments: that table''s '
  'single_lineage CHECK permits exactly two lineages and a programme version is '
  'a third, and the two lifecycles differ (one attempt versus N modules). Status '
  'moves only through SECURITY DEFINER RPCs; there is no client write grant.';

-- One live assignment of a programme version per person per employer. Partial,
-- so a cancelled assignment can be reissued.
CREATE UNIQUE INDEX IF NOT EXISTS scp_training_assignment_one_live
  ON public.scp_training_assignments (employer_id, subject_id, program_version_id)
  WHERE status <> 'cancelled';

CREATE INDEX IF NOT EXISTS scp_training_assignments_subject_idx
  ON public.scp_training_assignments (subject_id);
CREATE INDEX IF NOT EXISTS scp_training_assignments_employer_idx
  ON public.scp_training_assignments (employer_id, status);

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Per-module progress, durable
--
-- Progress is a row, not a derived guess from attempt state: a module may have
-- no knowledge check at all, and "opened but not answered" is a real state the
-- participant expects to survive a logout.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.scp_training_module_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL
    REFERENCES public.scp_training_assignments(id) ON DELETE CASCADE,
  module_version_id uuid NOT NULL
    REFERENCES public.scp_module_versions(id) ON DELETE RESTRICT,
  -- The learning run backing this module, when the module has a form. NOT the
  -- assignment's own identity: a module without a knowledge check completes
  -- with no attempt at all, which is why no phantom attempt is ever minted.
  attempt_id uuid REFERENCES public.scp_attempts(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started','in_progress','completed')),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assignment_id, module_version_id),
  CONSTRAINT scp_training_progress_completion_timestamped CHECK (
    (status <> 'completed') OR completed_at IS NOT NULL)
);

COMMENT ON TABLE public.scp_training_module_progress IS
  'Durable per-module progress for one training assignment. Survives reload, '
  'logout and device change because it is a row, not client state.';

CREATE INDEX IF NOT EXISTS scp_training_progress_assignment_idx
  ON public.scp_training_module_progress (assignment_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Guards
-- ═══════════════════════════════════════════════════════════════════════════

-- An assignment may only target a programme version that is published, not
-- retired, and either global or owned by the assigning employer. Enforced here
-- as well as in the RPC: the RPC is the door, this is the wall.
CREATE OR REPLACE FUNCTION public.scp_guard_training_target_assignable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE _status text; _retired timestamptz; _owner uuid;
BEGIN
  SELECT pv.content_status, pv.retired_at, p.owner_employer_id
    INTO _status, _retired, _owner
    FROM public.scp_program_versions pv
    JOIN public.scp_programs p ON p.id = pv.program_id
   WHERE pv.id = NEW.program_version_id;

  IF _status IS DISTINCT FROM 'published' THEN
    RAISE EXCEPTION
      'SCP_TRAINING_NOT_ASSIGNABLE: programme version is "%", not published.',
      coalesce(_status, 'missing') USING ERRCODE = 'check_violation';
  END IF;

  IF _retired IS NOT NULL THEN
    RAISE EXCEPTION
      'SCP_TRAINING_RETIRED: that programme version is retired and cannot '
      'receive new assignments.' USING ERRCODE = 'check_violation';
  END IF;

  IF _owner IS NOT NULL AND _owner <> NEW.employer_id THEN
    RAISE EXCEPTION
      'SCP_TRAINING_CROSS_TENANT: that programme belongs to another '
      'organisation.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END; $function$;

DROP TRIGGER IF EXISTS scp_training_assignments_target_assignable
  ON public.scp_training_assignments;
CREATE TRIGGER scp_training_assignments_target_assignable
  BEFORE INSERT ON public.scp_training_assignments
  FOR EACH ROW EXECUTE FUNCTION public.scp_guard_training_target_assignable();

-- Progress belongs to a module OF the assigned programme version. Without this
-- a caller could record progress against any module in the catalogue.
CREATE OR REPLACE FUNCTION public.scp_guard_training_progress_in_programme()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM public.scp_training_assignments ta
      JOIN public.scp_module_versions mv ON mv.program_version_id = ta.program_version_id
     WHERE ta.id = NEW.assignment_id AND mv.id = NEW.module_version_id
  ) THEN
    RAISE EXCEPTION
      'SCP_TRAINING_MODULE_NOT_IN_PROGRAMME: that module is not part of the '
      'assigned programme version.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $function$;

DROP TRIGGER IF EXISTS scp_training_progress_in_programme
  ON public.scp_training_module_progress;
CREATE TRIGGER scp_training_progress_in_programme
  BEFORE INSERT OR UPDATE OF module_version_id ON public.scp_training_module_progress
  FOR EACH ROW EXECUTE FUNCTION public.scp_guard_training_progress_in_programme();

CREATE OR REPLACE FUNCTION public.scp_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp'
AS $function$ BEGIN NEW.updated_at := now(); RETURN NEW; END $function$;

DROP TRIGGER IF EXISTS scp_training_assignments_touch ON public.scp_training_assignments;
CREATE TRIGGER scp_training_assignments_touch
  BEFORE UPDATE ON public.scp_training_assignments
  FOR EACH ROW EXECUTE FUNCTION public.scp_touch_updated_at();

DROP TRIGGER IF EXISTS scp_training_progress_touch ON public.scp_training_module_progress;
CREATE TRIGGER scp_training_progress_touch
  BEFORE UPDATE ON public.scp_training_module_progress
  FOR EACH ROW EXECUTE FUNCTION public.scp_touch_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. RLS
--
-- SELECT only. Every state transition happens inside a SECURITY DEFINER RPC
-- that re-verifies membership or subject identity for itself, following the
-- boundary 20260821090000 established when it made the author policies
-- read-only.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.scp_training_assignments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scp_training_module_progress  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS scp_training_assignments_read ON public.scp_training_assignments;
CREATE POLICY scp_training_assignments_read ON public.scp_training_assignments
  FOR SELECT TO authenticated
  USING (
    -- The commissioning organisation. Any active role: reading the training
    -- status list is a normal member activity, and assigning is not.
    public.has_employer_role(auth.uid(), employer_id, NULL)
    -- Or the person it is about.
    OR EXISTS (SELECT 1 FROM public.scp_subject_identities si
                WHERE si.subject_id = scp_training_assignments.subject_id
                  AND si.user_id = auth.uid())
  );

DROP POLICY IF EXISTS scp_training_progress_read ON public.scp_training_module_progress;
CREATE POLICY scp_training_progress_read ON public.scp_training_module_progress
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.scp_training_assignments ta
       WHERE ta.id = scp_training_module_progress.assignment_id
         AND (public.has_employer_role(auth.uid(), ta.employer_id, NULL)
              OR EXISTS (SELECT 1 FROM public.scp_subject_identities si
                          WHERE si.subject_id = ta.subject_id
                            AND si.user_id = auth.uid()))
    )
  );

REVOKE ALL ON public.scp_training_assignments      FROM PUBLIC, anon;
REVOKE ALL ON public.scp_training_module_progress  FROM PUBLIC, anon;
GRANT SELECT ON public.scp_training_assignments      TO authenticated;
GRANT SELECT ON public.scp_training_module_progress  TO authenticated;
GRANT ALL    ON public.scp_training_assignments      TO service_role;
GRANT ALL    ON public.scp_training_module_progress  TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Prove it
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE _n int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'scp_module_versions'
                    AND column_name = 'learning_form_id') THEN
    RAISE EXCEPTION 'SCP_TRAINING_NO_FORM_LINK: scp_module_versions.learning_form_id missing';
  END IF;

  FOR _n IN SELECT 1 FROM (VALUES ('scp_training_assignments'),('scp_training_module_progress')) v(t)
             WHERE NOT EXISTS (SELECT 1 FROM information_schema.tables
                                WHERE table_schema='public' AND table_name = v.t) LOOP
    RAISE EXCEPTION 'SCP_TRAINING_TABLE_MISSING';
  END LOOP;

  -- RLS on, and no client write policy anywhere on either table.
  SELECT count(*) INTO _n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public'
     AND c.relname IN ('scp_training_assignments','scp_training_module_progress')
     AND c.relrowsecurity;
  IF _n <> 2 THEN
    RAISE EXCEPTION 'SCP_TRAINING_RLS_OFF: expected RLS on 2 tables, found %', _n;
  END IF;

  SELECT count(*) INTO _n FROM pg_policies
   WHERE schemaname='public'
     AND tablename IN ('scp_training_assignments','scp_training_module_progress')
     AND cmd <> 'SELECT';
  IF _n > 0 THEN
    RAISE EXCEPTION 'SCP_TRAINING_CLIENT_WRITE: % non-SELECT policy(ies) exist; state '
      'transitions must run only through SECURITY DEFINER RPCs', _n;
  END IF;

  -- anon holds nothing.
  IF has_table_privilege('anon','public.scp_training_assignments','SELECT')
     OR has_table_privilege('anon','public.scp_training_module_progress','SELECT') THEN
    RAISE EXCEPTION 'SCP_TRAINING_ANON_READ: anon can read a training table';
  END IF;
END $$;
