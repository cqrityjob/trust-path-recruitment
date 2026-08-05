CREATE TABLE IF NOT EXISTS public.scp_programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  role_id uuid REFERENCES public.scp_roles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.scp_programs IS
  'A role-specific development programme. Identity only; wording and structure '
  'live in scp_program_versions so a programme can be revised without breaking '
  'evidence, attempts or reports that reference it.';

CREATE TABLE IF NOT EXISTS public.scp_program_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES public.scp_programs(id) ON DELETE RESTRICT,
  version_number integer NOT NULL,
  jurisdiction_id uuid REFERENCES public.scp_jurisdictions(id) ON DELETE RESTRICT,
  content_status text NOT NULL DEFAULT 'draft'
    CHECK (content_status IN (
      'draft','expert_review','legal_review','cognitive_review',
      'published','suspended','retired')),
  validation_status text NOT NULL DEFAULT 'design'
    CHECK (validation_status IN (
      'design','pilot','operational-development','operational-selection','retired')),
  name_sv text NOT NULL,
  name_en text NOT NULL,
  purpose_sv text NOT NULL,
  purpose_en text NOT NULL,
  does_not_measure_sv text[] NOT NULL DEFAULT '{}',
  does_not_measure_en text[] NOT NULL DEFAULT '{}',
  published_at timestamptz,
  retired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (program_id, version_number)
);

CREATE TABLE IF NOT EXISTS public.scp_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.scp_module_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id uuid NOT NULL REFERENCES public.scp_modules(id) ON DELETE RESTRICT,
  program_version_id uuid NOT NULL
    REFERENCES public.scp_program_versions(id) ON DELETE RESTRICT,
  version_number integer NOT NULL,
  display_order integer NOT NULL,
  content_status text NOT NULL DEFAULT 'draft'
    CHECK (content_status IN (
      'draft','expert_review','legal_review','cognitive_review',
      'published','suspended','retired')),
  name_sv text NOT NULL,
  name_en text NOT NULL,
  summary_sv text NOT NULL,
  summary_en text NOT NULL,
  estimated_minutes integer CHECK (estimated_minutes IS NULL OR estimated_minutes > 0),
  published_at timestamptz,
  retired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (module_id, version_number)
);

CREATE TABLE IF NOT EXISTS public.scp_module_behaviour_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_version_id uuid NOT NULL
    REFERENCES public.scp_module_versions(id) ON DELETE RESTRICT,
  behaviour_version_id uuid NOT NULL
    REFERENCES public.scp_behaviour_versions(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (module_version_id, behaviour_version_id)
);
COMMENT ON TABLE public.scp_module_behaviour_map IS
  'Which behaviours a module develops. The join that lets a competency gap '
  'produce a learning recommendation through the graph, so Training never needs '
  'to read an assessment item.';

CREATE TABLE IF NOT EXISTS public.scp_scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.scp_scenario_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id uuid NOT NULL REFERENCES public.scp_scenarios(id) ON DELETE RESTRICT,
  module_version_id uuid REFERENCES public.scp_module_versions(id) ON DELETE RESTRICT,
  version_number integer NOT NULL,
  jurisdiction_id uuid REFERENCES public.scp_jurisdictions(id) ON DELETE RESTRICT,
  content_status text NOT NULL DEFAULT 'draft'
    CHECK (content_status IN (
      'draft','expert_review','legal_review','cognitive_review',
      'published','suspended','retired')),
  mode text NOT NULL CHECK (mode IN ('learning','assessment')),
  situation_sv text NOT NULL,
  situation_en text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scenario_id, version_number)
);

CREATE INDEX IF NOT EXISTS scp_module_versions_program_idx
  ON public.scp_module_versions (program_version_id, display_order);
CREATE INDEX IF NOT EXISTS scp_scenario_versions_module_idx
  ON public.scp_scenario_versions (module_version_id);

CREATE OR REPLACE FUNCTION public.scp_guard_programme_states_limits()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.content_status = 'published'
     AND coalesce(array_length(NEW.does_not_measure_sv, 1), 0) = 0 THEN
    RAISE EXCEPTION
      'SCP_PROGRAMME_WITHOUT_LIMITS: programme version % cannot be published '
      'without stating what it does not measure.',
      NEW.id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS scp_program_versions_require_limits ON public.scp_program_versions;
CREATE TRIGGER scp_program_versions_require_limits
  BEFORE INSERT OR UPDATE ON public.scp_program_versions
  FOR EACH ROW EXECUTE FUNCTION public.scp_guard_programme_states_limits();

ALTER TABLE public.scp_item_versions
  ADD COLUMN IF NOT EXISTS primary_behaviour_id uuid
    REFERENCES public.scp_behaviour_versions(id) ON DELETE RESTRICT;

COMMENT ON COLUMN public.scp_item_versions.primary_behaviour_id IS
  'The AUTHORITATIVE graph link: every Academy item maps to exactly one '
  'observable behaviour. competency_id is retained from PR-A and kept in '
  'agreement by scp_guard_item_behaviour_agrees(), so the two can never drift.';

ALTER TABLE public.scp_item_versions
  ADD COLUMN IF NOT EXISTS mode text
    CHECK (mode IS NULL OR mode IN ('learning','assessment'));

COMMENT ON COLUMN public.scp_item_versions.mode IS
  'Learning or assessment -- never both. Enforced by '
  'scp_guard_item_mode_disjoint(): an item may not change mode once authored, '
  'and a form may not mix modes. NULL only for PR-A rows that predate the '
  'Academy.';

ALTER TABLE public.scp_item_versions
  DROP CONSTRAINT IF EXISTS scp_item_versions_item_format_check;
ALTER TABLE public.scp_item_versions
  ADD CONSTRAINT scp_item_versions_item_format_check
  CHECK (item_format IN (
    'sjt_best_response', 'sjt_rate_effectiveness', 'biq_frequency',
    'sjt_best_worst', 'constructed_response'));

ALTER TABLE public.scp_item_versions
  DROP CONSTRAINT IF EXISTS scp_item_versions_content_status_check;
ALTER TABLE public.scp_item_versions
  ADD CONSTRAINT scp_item_versions_content_status_check
  CHECK (content_status IN (
    'draft','expert_review','legal_review','cognitive_review',
    'in_review','approved','published','suspended','retired'));

CREATE OR REPLACE FUNCTION public.scp_guard_item_behaviour_agrees()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE _matches boolean;
BEGIN
  IF NEW.primary_behaviour_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM public.scp_behaviour_competency_map m
      JOIN public.scp_competency_versions cv ON cv.id = m.competency_version_id
     WHERE m.behaviour_version_id = NEW.primary_behaviour_id
       AND cv.competency_id = NEW.competency_id)
    INTO _matches;

  IF NOT _matches THEN
    RAISE EXCEPTION
      'SCP_ITEM_BEHAVIOUR_COMPETENCY_MISMATCH: item version % claims competency '
      '%, but its primary behaviour does not map to that competency. The graph '
      'and the item bank must agree.',
      NEW.id, NEW.competency_id USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS scp_item_versions_behaviour_agrees ON public.scp_item_versions;
CREATE TRIGGER scp_item_versions_behaviour_agrees
  BEFORE INSERT OR UPDATE ON public.scp_item_versions
  FOR EACH ROW EXECUTE FUNCTION public.scp_guard_item_behaviour_agrees();

CREATE OR REPLACE FUNCTION public.scp_guard_item_mode_disjoint()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.mode IS NOT NULL AND NEW.mode IS DISTINCT FROM OLD.mode THEN
    RAISE EXCEPTION
      'SCP_ITEM_MODE_IMMUTABLE: item version % is a "%" item and cannot be moved '
      'to "%". Learning and assessment content are separate by construction.',
      OLD.id, OLD.mode, NEW.mode USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS scp_item_versions_mode_disjoint ON public.scp_item_versions;
CREATE TRIGGER scp_item_versions_mode_disjoint
  BEFORE UPDATE ON public.scp_item_versions
  FOR EACH ROW EXECUTE FUNCTION public.scp_guard_item_mode_disjoint();

CREATE OR REPLACE FUNCTION public.scp_guard_form_single_mode()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE _new_mode text; _existing text;
BEGIN
  SELECT mode INTO _new_mode FROM public.scp_item_versions WHERE id = NEW.item_version_id;

  SELECT DISTINCT iv.mode INTO _existing
    FROM public.scp_form_items fi
    JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
   WHERE fi.form_id = NEW.form_id
     AND fi.id <> NEW.id
     AND iv.mode IS NOT NULL
   LIMIT 1;

  IF _existing IS NOT NULL AND _new_mode IS NOT NULL AND _existing <> _new_mode THEN
    RAISE EXCEPTION
      'SCP_FORM_MIXES_MODES: form % already contains "%" items and cannot also '
      'contain a "%" item.', NEW.form_id, _existing, _new_mode
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS scp_form_items_single_mode ON public.scp_form_items;
CREATE TRIGGER scp_form_items_single_mode
  BEFORE INSERT OR UPDATE ON public.scp_form_items
  FOR EACH ROW EXECUTE FUNCTION public.scp_guard_form_single_mode();

ALTER TABLE public.scp_programs              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scp_program_versions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scp_modules               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scp_module_versions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scp_module_behaviour_map  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scp_scenarios             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scp_scenario_versions     ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'scp_programs','scp_program_versions','scp_modules','scp_module_versions',
    'scp_module_behaviour_map','scp_scenarios','scp_scenario_versions'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_read', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)',
      t || '_read', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_author_write', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated '
      'USING (public.scp_can_author(auth.uid())) '
      'WITH CHECK (public.scp_can_author(auth.uid()))',
      t || '_author_write', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
  END LOOP;
END $$;

DO $$
DECLARE _n int;
BEGIN
  SELECT count(*) INTO _n FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name IN (
     'scp_programs','scp_program_versions','scp_modules','scp_module_versions',
     'scp_module_behaviour_map','scp_scenarios','scp_scenario_versions');
  IF _n <> 7 THEN
    RAISE EXCEPTION 'SCP_P1A_INCOMPLETE: expected 7 programme tables, found %', _n;
  END IF;

  SELECT count(*) INTO _n FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'scp_item_versions'
     AND column_name IN ('primary_behaviour_id','mode');
  IF _n <> 2 THEN
    RAISE EXCEPTION 'SCP_P1A_ITEM_COLUMNS_MISSING: found % of 2', _n;
  END IF;

  SELECT count(*) INTO _n FROM public.scp_item_versions
   WHERE item_format NOT IN (
     'sjt_best_response','sjt_rate_effectiveness','biq_frequency',
     'sjt_best_worst','constructed_response');
  IF _n > 0 THEN
    RAISE EXCEPTION 'SCP_P1A_ITEM_FORMAT_INVALID: % rows outside the vocabulary', _n;
  END IF;

  IF EXISTS (SELECT 1 FROM public.scp_program_versions WHERE content_status <> 'draft') THEN
    RAISE EXCEPTION 'SCP_P1A_PROGRAMME_PUBLISHED: Phase 1 authors to draft only';
  END IF;
  IF EXISTS (SELECT 1 FROM public.assessments
              WHERE id = 'security-guard-foundation' AND employer_visible) THEN
    RAISE EXCEPTION 'SCP_P1A_LEGACY_RESURFACED';
  END IF;
END $$;

INSERT INTO public.scp_content_events (subject_type, subject_ref, action, reason, metadata)
VALUES (
  'assessment_version', 'scp-phase1a-programmes', 'created',
  'Phase 1a: programme/module/scenario domain attached to the Competency Graph, and Learning/Assessment mode separation enforced on the existing item bank. Additive; no content published.',
  jsonb_build_object(
    'migration', '20260803090000_scp_phase1a_programmes_and_modes',
    'new_tables', 7,
    'item_bank', 'extended, not replaced',
    'overlap_resolved', 'primary_behaviour_id is authoritative; competency_id kept in agreement by trigger'));