-- Security Competence Academy — Phase 1b: rubrics, attempts and responses.
--
-- ADDITIVE ONLY. Schema only: there is no writer for attempts or responses until
-- the participant experience lands in Phase 3, and no rubric is published.
--
-- Rubrics are the protected content the AI scorer reads. Attempts and responses
-- are the substrate it scores and the human-review queue works over, which is
-- why they land now rather than with the UI -- the architecture has to exist
-- before it can be wired to a provider in Phase 1c.

-- =========================================================================
-- SECTION 1 — Rubrics
-- =========================================================================
--
-- PROTECTED CONTENT. Rubrics, their levels and especially their anchor
-- responses are answer-key equivalents for constructed-response items. They are
-- authoring-only: no participant or employer role may read them, ever.

CREATE TABLE IF NOT EXISTS public.scp_rubrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.scp_rubric_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rubric_id uuid NOT NULL REFERENCES public.scp_rubrics(id) ON DELETE RESTRICT,
  item_version_id uuid REFERENCES public.scp_item_versions(id) ON DELETE RESTRICT,
  version_number integer NOT NULL,
  content_status text NOT NULL DEFAULT 'draft'
    CHECK (content_status IN (
      'draft','expert_review','legal_review','cognitive_review',
      'published','suspended','retired')),
  name_sv text NOT NULL,
  name_en text NOT NULL,
  -- What the scorer must NOT infer. Authored, versioned, and injected into the
  -- prompt rather than living only in prose.
  must_not_infer text[] NOT NULL DEFAULT '{}',
  published_at timestamptz,
  retired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rubric_id, version_number)
);

CREATE TABLE IF NOT EXISTS public.scp_rubric_dimensions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rubric_version_id uuid NOT NULL
    REFERENCES public.scp_rubric_versions(id) ON DELETE CASCADE,
  dimension_key text NOT NULL,
  display_order integer NOT NULL,
  name_sv text NOT NULL,
  name_en text NOT NULL,
  observable_criteria_sv text NOT NULL,
  observable_criteria_en text NOT NULL,
  -- Content quality is scored separately from writing quality, so simple but
  -- correct language is never penalised.
  assesses_writing_quality boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rubric_version_id, dimension_key)
);

CREATE TABLE IF NOT EXISTS public.scp_rubric_levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rubric_dimension_id uuid NOT NULL
    REFERENCES public.scp_rubric_dimensions(id) ON DELETE CASCADE,
  level integer NOT NULL CHECK (level BETWEEN 0 AND 4),
  descriptor_sv text NOT NULL,
  descriptor_en text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rubric_dimension_id, level)
);

CREATE TABLE IF NOT EXISTS public.scp_anchor_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rubric_dimension_id uuid NOT NULL
    REFERENCES public.scp_rubric_dimensions(id) ON DELETE CASCADE,
  anchor_type text NOT NULL CHECK (anchor_type IN (
    'positive','borderline','contraindication','safety_critical_error')),
  level integer CHECK (level IS NULL OR level BETWEEN 0 AND 4),
  language text NOT NULL DEFAULT 'sv-SE' CHECK (language IN ('sv-SE','en-GB')),
  response_text text NOT NULL,
  rationale text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.scp_anchor_responses IS
  'Answer-key equivalent for constructed-response items. Authoring-only: there '
  'is deliberately NO read policy for participant or employer roles, and the '
  'browser must never receive one.';

-- A rubric must carry 3-5 dimensions, each with all five levels, and must name
-- its safety-critical errors before it can be published.
CREATE OR REPLACE FUNCTION public.scp_guard_rubric_complete()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE _dims int; _bad int; _safety int;
BEGIN
  IF NEW.content_status <> 'published' THEN RETURN NEW; END IF;

  SELECT count(*) INTO _dims FROM public.scp_rubric_dimensions
   WHERE rubric_version_id = NEW.id;
  IF _dims < 3 OR _dims > 5 THEN
    RAISE EXCEPTION
      'SCP_RUBRIC_DIMENSION_COUNT: a rubric must carry 3-5 dimensions, found %', _dims
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO _bad FROM public.scp_rubric_dimensions d
   WHERE d.rubric_version_id = NEW.id
     AND (SELECT count(*) FROM public.scp_rubric_levels l
           WHERE l.rubric_dimension_id = d.id) <> 5;
  IF _bad > 0 THEN
    RAISE EXCEPTION
      'SCP_RUBRIC_LEVELS_INCOMPLETE: % dimension(s) do not define all five levels 0-4', _bad
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO _safety FROM public.scp_anchor_responses a
    JOIN public.scp_rubric_dimensions d ON d.id = a.rubric_dimension_id
   WHERE d.rubric_version_id = NEW.id AND a.anchor_type = 'safety_critical_error';
  IF _safety = 0 THEN
    RAISE EXCEPTION
      'SCP_RUBRIC_WITHOUT_SAFETY_ANCHORS: a published rubric must name at least '
      'one safety-critical error.' USING ERRCODE = 'check_violation';
  END IF;

  IF coalesce(array_length(NEW.must_not_infer, 1), 0) = 0 THEN
    RAISE EXCEPTION
      'SCP_RUBRIC_WITHOUT_INFERENCE_LIMITS: a published rubric must state what '
      'the scorer may not infer.' USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END; $$;

CREATE TRIGGER scp_rubric_versions_complete
  BEFORE INSERT OR UPDATE ON public.scp_rubric_versions
  FOR EACH ROW EXECUTE FUNCTION public.scp_guard_rubric_complete();

-- =========================================================================
-- SECTION 2 — Attempts
-- =========================================================================
--
-- An attempt pins EXACTLY what it was taken against, so a historical result
-- stays reproducible even after every version below it has moved on.

CREATE TABLE IF NOT EXISTS public.scp_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  subject_id uuid NOT NULL REFERENCES public.scp_subjects(id) ON DELETE RESTRICT,
  -- The employer whose assignment produced this attempt. Also the
  -- cross-organisation boundary.
  issuer_organization_id uuid REFERENCES public.employers(id) ON DELETE RESTRICT,
  -- The existing assignment table is REUSED, not replaced.
  assignment_id uuid REFERENCES public.assessment_assignments(id) ON DELETE RESTRICT,

  mode text NOT NULL CHECK (mode IN ('learning','assessment')),

  -- The exact content and rules in force. Every one of these is pinned, never
  -- looked up at read time.
  form_id uuid NOT NULL REFERENCES public.scp_forms(id) ON DELETE RESTRICT,
  assessment_version_id uuid REFERENCES public.scp_assessment_versions(id) ON DELETE RESTRICT,
  program_version_id uuid REFERENCES public.scp_program_versions(id) ON DELETE RESTRICT,
  role_version_id uuid REFERENCES public.scp_role_versions(id) ON DELETE RESTRICT,
  jurisdiction_id uuid REFERENCES public.scp_jurisdictions(id) ON DELETE RESTRICT,
  purpose_version_id uuid REFERENCES public.scp_purpose_versions(id) ON DELETE RESTRICT,
  scoring_model_version text,

  status text NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress','submitted','scored','released','abandoned')),
  -- Accessibility accommodation, recorded as a fact about the attempt. No
  -- diagnosis, no health data -- only that an adjustment was granted.
  accommodation_granted boolean NOT NULL DEFAULT false,
  accommodation_note text,

  started_at   timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  scored_at    timestamptz,
  released_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT scp_attempt_release_after_scoring CHECK (
    released_at IS NULL OR scored_at IS NOT NULL)
);

COMMENT ON TABLE public.scp_attempts IS
  'One sitting. Pins the exact form, assessment version, programme, role, '
  'jurisdiction, purpose and scoring model it ran under, so a historical result '
  'stays reproducible forever. Schema only in Phase 1 -- no writer until the '
  'participant experience lands in Phase 3.';

-- An assessment-mode attempt may only run a form built from assessment items.
CREATE OR REPLACE FUNCTION public.scp_guard_attempt_mode_matches_form()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE _form_mode text;
BEGIN
  SELECT DISTINCT iv.mode INTO _form_mode
    FROM public.scp_form_items fi
    JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
   WHERE fi.form_id = NEW.form_id AND iv.mode IS NOT NULL
   LIMIT 1;

  IF _form_mode IS NOT NULL AND _form_mode <> NEW.mode THEN
    RAISE EXCEPTION
      'SCP_ATTEMPT_MODE_MISMATCH: attempt is "%" but its form contains "%" items.',
      NEW.mode, _form_mode USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER scp_attempts_mode_matches_form
  BEFORE INSERT OR UPDATE ON public.scp_attempts
  FOR EACH ROW EXECUTE FUNCTION public.scp_guard_attempt_mode_matches_form();

-- =========================================================================
-- SECTION 3 — Candidate responses
-- =========================================================================
--
-- UNTRUSTED INPUT. Free text here is written by a candidate and is never
-- treated as instructions by any scorer or agent. The AI pipeline wraps it in
-- an isolation envelope; nothing in the database interprets it.

CREATE TABLE IF NOT EXISTS public.scp_candidate_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES public.scp_attempts(id) ON DELETE CASCADE,
  item_version_id uuid NOT NULL REFERENCES public.scp_item_versions(id) ON DELETE RESTRICT,

  -- Exactly one of these, by format.
  selected_option_id uuid REFERENCES public.scp_item_options(id) ON DELETE RESTRICT,
  best_option_id     uuid REFERENCES public.scp_item_options(id) ON DELETE RESTRICT,
  worst_option_id    uuid REFERENCES public.scp_item_options(id) ON DELETE RESTRICT,
  response_text text,

  -- The position the chosen option was rendered at, for exposure analysis.
  display_order integer,
  responded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (attempt_id, item_version_id),
  CONSTRAINT scp_response_best_worst_differ CHECK (
    best_option_id IS NULL OR worst_option_id IS NULL
    OR best_option_id <> worst_option_id)
);

COMMENT ON TABLE public.scp_candidate_responses IS
  'UNTRUSTED INPUT. response_text is candidate-authored free text and is never '
  'followed as instructions by any scorer or agent. Employers never read this '
  'table; they read competence through the graph projection.';

-- The response shape must match the item format. A constructed response with no
-- text, or a scale answer carrying an option, is a scoring bug waiting to happen.
CREATE OR REPLACE FUNCTION public.scp_guard_response_matches_format()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE _fmt text;
BEGIN
  SELECT item_format INTO _fmt FROM public.scp_item_versions WHERE id = NEW.item_version_id;

  IF _fmt = 'constructed_response' THEN
    IF NEW.response_text IS NULL OR length(btrim(NEW.response_text)) = 0 THEN
      RAISE EXCEPTION 'SCP_RESPONSE_SHAPE: a constructed response requires text.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.selected_option_id IS NOT NULL OR NEW.best_option_id IS NOT NULL THEN
      RAISE EXCEPTION 'SCP_RESPONSE_SHAPE: a constructed response carries no option.'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF _fmt = 'sjt_best_worst' THEN
    IF NEW.best_option_id IS NULL OR NEW.worst_option_id IS NULL THEN
      RAISE EXCEPTION 'SCP_RESPONSE_SHAPE: a best/worst item requires both choices.'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    IF NEW.selected_option_id IS NULL THEN
      RAISE EXCEPTION 'SCP_RESPONSE_SHAPE: item format "%" requires a selected option.', _fmt
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END; $$;

CREATE TRIGGER scp_candidate_responses_shape
  BEFORE INSERT OR UPDATE ON public.scp_candidate_responses
  FOR EACH ROW EXECUTE FUNCTION public.scp_guard_response_matches_format();

CREATE INDEX IF NOT EXISTS scp_attempts_subject_idx ON public.scp_attempts (subject_id);
CREATE INDEX IF NOT EXISTS scp_attempts_org_idx     ON public.scp_attempts (issuer_organization_id);
CREATE INDEX IF NOT EXISTS scp_responses_attempt_idx
  ON public.scp_candidate_responses (attempt_id);

-- =========================================================================
-- SECTION 4 — Item exposure and integrity
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.scp_item_exposure (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_version_id uuid NOT NULL REFERENCES public.scp_item_versions(id) ON DELETE RESTRICT,
  exposed_at timestamptz NOT NULL DEFAULT now(),
  attempt_id uuid REFERENCES public.scp_attempts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.scp_item_exposure IS
  'How often a protected item has been served. Supports retiring or suspending '
  'an over-exposed or leaked item before it stops discriminating.';

CREATE TABLE IF NOT EXISTS public.scp_integrity_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES public.scp_attempts(id) ON DELETE CASCADE,
  flag_type text NOT NULL CHECK (flag_type IN (
    'implausible_timing','duplicate_text','item_leak_suspected','other')),
  detail text,
  raised_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.scp_integrity_flags IS
  'Behavioural integrity signals only. Deliberately supports NO webcam, facial, '
  'voice-emotion or biometric proctoring -- those are excluded by design.';

-- =========================================================================
-- SECTION 5 — RLS
-- =========================================================================

ALTER TABLE public.scp_rubrics             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scp_rubric_versions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scp_rubric_dimensions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scp_rubric_levels       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scp_anchor_responses    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scp_attempts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scp_candidate_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scp_item_exposure       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scp_integrity_flags     ENABLE ROW LEVEL SECURITY;

-- Rubrics, levels and anchors: AUTHORING ONLY. No read policy for anyone else --
-- an absent policy, not a hidden column.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'scp_rubrics','scp_rubric_versions','scp_rubric_dimensions',
    'scp_rubric_levels','scp_anchor_responses','scp_item_exposure'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated '
      'USING (public.scp_can_author(auth.uid())) '
      'WITH CHECK (public.scp_can_author(auth.uid()))',
      t || '_author_only', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
  END LOOP;
END $$;

-- Attempts and responses: the subject sees their own; authors see all.
-- Employers are DELIBERATELY absent here. Identity resolution and any
-- employer-facing view must go through a purpose-scoped server function that
-- verifies organisation membership, role, employment relationship, assignment
-- purpose, disclosure class and report-release state -- never a direct policy.
CREATE POLICY scp_attempts_own_select ON public.scp_attempts
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.scp_subject_identities i
             WHERE i.subject_id = scp_attempts.subject_id AND i.user_id = auth.uid())
    OR public.scp_can_author(auth.uid()));
CREATE POLICY scp_attempts_author_write ON public.scp_attempts
  FOR ALL TO authenticated
  USING (public.scp_can_author(auth.uid()))
  WITH CHECK (public.scp_can_author(auth.uid()));

CREATE POLICY scp_responses_own_select ON public.scp_candidate_responses
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.scp_attempts a
             JOIN public.scp_subject_identities i ON i.subject_id = a.subject_id
            WHERE a.id = scp_candidate_responses.attempt_id AND i.user_id = auth.uid())
    OR public.scp_can_author(auth.uid()));
CREATE POLICY scp_responses_author_write ON public.scp_candidate_responses
  FOR ALL TO authenticated
  USING (public.scp_can_author(auth.uid()))
  WITH CHECK (public.scp_can_author(auth.uid()));

CREATE POLICY scp_integrity_flags_author_only ON public.scp_integrity_flags
  FOR ALL TO authenticated
  USING (public.scp_can_author(auth.uid()))
  WITH CHECK (public.scp_can_author(auth.uid()));

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'scp_attempts','scp_candidate_responses','scp_integrity_flags'
  ] LOOP
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
  END LOOP;
END $$;

-- =========================================================================
-- SECTION 6 — Prove it
-- =========================================================================

DO $$
DECLARE _n int;
BEGIN
  SELECT count(*) INTO _n FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name IN (
     'scp_rubrics','scp_rubric_versions','scp_rubric_dimensions','scp_rubric_levels',
     'scp_anchor_responses','scp_attempts','scp_candidate_responses',
     'scp_item_exposure','scp_integrity_flags');
  IF _n <> 9 THEN
    RAISE EXCEPTION 'SCP_P1B_INCOMPLETE: expected 9 tables, found %', _n;
  END IF;

  -- Protected content must have NO non-authoring read policy.
  SELECT count(*) INTO _n FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('scp_rubric_versions','scp_rubric_levels','scp_anchor_responses')
     AND cmd IN ('SELECT','ALL')
     AND coalesce(qual,'') IN ('true','(true)');
  IF _n > 0 THEN
    RAISE EXCEPTION 'SCP_P1B_RUBRICS_READABLE: % unconditional read policies on protected content', _n;
  END IF;

  -- Nothing published, nothing written.
  IF EXISTS (SELECT 1 FROM public.scp_rubric_versions WHERE content_status <> 'draft') THEN
    RAISE EXCEPTION 'SCP_P1B_RUBRIC_PUBLISHED';
  END IF;
  IF EXISTS (SELECT 1 FROM public.scp_attempts) THEN
    RAISE EXCEPTION 'SCP_P1B_ATTEMPTS_SEEDED: Phase 1 creates schema, not data';
  END IF;
END $$;

INSERT INTO public.scp_content_events (subject_type, subject_ref, action, reason, metadata)
VALUES (
  'assessment_version', 'scp-phase1b-rubrics-attempts', 'created',
  'Phase 1b: rubric model (3-5 dimensions, levels 0-4, anchors incl. safety-critical errors), attempts pinning exact content and scoring versions, candidate responses isolated as untrusted input, item exposure and integrity flags. Schema only; no writer until Phase 3.',
  jsonb_build_object(
    'migration', '20260803100000_scp_phase1b_rubrics_attempts_responses',
    'new_tables', 9,
    'rubrics', 'authoring-only, no read policy for participant or employer',
    'proctoring', 'no webcam, facial, voice-emotion or biometric — excluded by design'));
