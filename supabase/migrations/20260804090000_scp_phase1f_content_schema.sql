-- Phase 1F-a — the schema content authoring needs. ADDITIVE ONLY.
--
-- PR-A already provides legal_basis_required / legal_review_status /
-- legal_source, bias_review_status, sme_review_status and authored_by_ai. Those
-- are REUSED. Only what is genuinely missing is added here.

-- =========================================================================
-- 1. Item-level scenario metadata
-- =========================================================================

ALTER TABLE public.scp_item_versions
  ADD COLUMN IF NOT EXISTS difficulty text
    CHECK (difficulty IS NULL OR difficulty IN ('foundational','intermediate','advanced')),
  ADD COLUMN IF NOT EXISTS cognitive_demand text
    CHECK (cognitive_demand IS NULL OR cognitive_demand IN
      ('recognition','judgement','prioritisation','synthesis')),
  -- What the participant can see, and what is deliberately withheld. Authored
  -- explicitly so no item can depend on information it never provided.
  ADD COLUMN IF NOT EXISTS information_available_sv text,
  ADD COLUMN IF NOT EXISTS information_withheld_sv text,
  ADD COLUMN IF NOT EXISTS work_context_sv text,
  ADD COLUMN IF NOT EXISTS is_safety_critical boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS requires_human_review boolean NOT NULL DEFAULT false,
  -- The Learning Mode analogue. A SEPARATE item version -- never the same row.
  ADD COLUMN IF NOT EXISTS learning_counterpart_id uuid
    REFERENCES public.scp_item_versions(id) ON DELETE SET NULL,
  -- The three review types PR-A does not already model.
  ADD COLUMN IF NOT EXISTS cognitive_review_status text NOT NULL DEFAULT 'pending'
    CHECK (cognitive_review_status IN ('not_required','pending','in_review','passed')),
  ADD COLUMN IF NOT EXISTS language_review_status text NOT NULL DEFAULT 'pending'
    CHECK (language_review_status IN ('not_required','pending','in_review','passed')),
  ADD COLUMN IF NOT EXISTS accessibility_review_status text NOT NULL DEFAULT 'pending'
    CHECK (accessibility_review_status IN ('not_required','pending','in_review','passed')),
  ADD COLUMN IF NOT EXISTS jurisdiction_id uuid
    REFERENCES public.scp_jurisdictions(id) ON DELETE RESTRICT;

COMMENT ON COLUMN public.scp_item_versions.learning_counterpart_id IS
  'A SEPARATE Learning Mode item version that teaches the same behaviour. Never '
  'the same row: mode disjointness is enforced by scp_guard_item_mode_disjoint '
  'and by the form-composition guard.';

-- A learning counterpart must actually be a learning item, and an item may not
-- point at itself.
CREATE OR REPLACE FUNCTION public.scp_guard_learning_counterpart()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE _mode text;
BEGIN
  IF NEW.learning_counterpart_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.learning_counterpart_id = NEW.id THEN
    RAISE EXCEPTION 'SCP_COUNTERPART_SELF: an item cannot be its own learning counterpart.'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT mode INTO _mode FROM public.scp_item_versions WHERE id = NEW.learning_counterpart_id;
  IF _mode IS DISTINCT FROM 'learning' THEN
    RAISE EXCEPTION
      'SCP_COUNTERPART_NOT_LEARNING: the counterpart of an assessment item must '
      'be a learning-mode item.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER scp_item_versions_learning_counterpart
  BEFORE INSERT OR UPDATE ON public.scp_item_versions
  FOR EACH ROW EXECUTE FUNCTION public.scp_guard_learning_counterpart();

-- =========================================================================
-- 2. Option-level scoring detail
-- =========================================================================

ALTER TABLE public.scp_item_options
  ADD COLUMN IF NOT EXISTS is_preferred boolean NOT NULL DEFAULT false,
  -- Best/worst keys. Separate from is_preferred because a best/worst item has
  -- two keys, not one.
  ADD COLUMN IF NOT EXISTS is_best_key boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_worst_key boolean NOT NULL DEFAULT false,
  -- The professional error this distractor represents. Authored, not inferred.
  ADD COLUMN IF NOT EXISTS distractor_error_type text
    CHECK (distractor_error_type IS NULL OR distractor_error_type IN (
      'premature_escalation','delayed_escalation','poor_proportionality',
      'insufficient_information','excessive_informal_trust','weak_communication',
      'tunnel_vision','failure_to_document','unsupported_assumption',
      'outside_mandate')),
  -- Learning Mode only. NEVER delivered in Assessment Mode.
  ADD COLUMN IF NOT EXISTS learning_feedback_sv text,
  ADD COLUMN IF NOT EXISTS learning_feedback_en text;

COMMENT ON COLUMN public.scp_item_options.learning_feedback_sv IS
  'Learning Mode only. Assessment Mode delivery must never include this, '
  'score_value, scoring_rationale, is_preferred or either key.';

-- A best/worst item needs exactly one best and one worst, and they must differ.
CREATE OR REPLACE FUNCTION public.scp_guard_best_worst_keys()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE _fmt text; _best int; _worst int;
BEGIN
  SELECT item_format INTO _fmt FROM public.scp_item_versions WHERE id = NEW.item_version_id;
  IF _fmt <> 'sjt_best_worst' THEN
    IF NEW.is_best_key OR NEW.is_worst_key THEN
      RAISE EXCEPTION
        'SCP_BEST_WORST_ON_WRONG_FORMAT: only a best/worst item carries best or worst keys.'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.is_best_key AND NEW.is_worst_key THEN
    RAISE EXCEPTION 'SCP_BEST_IS_WORST: one option cannot be both the best and the worst.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER scp_item_options_best_worst
  BEFORE INSERT OR UPDATE ON public.scp_item_options
  FOR EACH ROW EXECUTE FUNCTION public.scp_guard_best_worst_keys();

-- =========================================================================
-- 3. Review-readiness register
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.scp_review_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_version_id uuid NOT NULL
    REFERENCES public.scp_item_versions(id) ON DELETE CASCADE,
  review_type text NOT NULL CHECK (review_type IN (
    'security_sme','swedish_legal','cognitive_interview','language','accessibility','pilot')),
  required boolean NOT NULL DEFAULT true,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'outstanding'
    CHECK (status IN ('outstanding','in_progress','cleared','waived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_version_id, review_type)
);

COMMENT ON TABLE public.scp_review_requirements IS
  'Which reviews each authored item still needs before it could be published. '
  'A register, not an approval: every row starts outstanding, and Phase 1F '
  'clears none of them.';

ALTER TABLE public.scp_review_requirements ENABLE ROW LEVEL SECURITY;
CREATE POLICY scp_review_requirements_author_only ON public.scp_review_requirements
  FOR ALL TO authenticated
  USING (public.scp_can_author(auth.uid()))
  WITH CHECK (public.scp_can_author(auth.uid()));
GRANT SELECT ON public.scp_review_requirements TO authenticated;
GRANT ALL    ON public.scp_review_requirements TO service_role;
REVOKE ALL   ON public.scp_review_requirements FROM anon;

DO $$
DECLARE _n int;
BEGIN
  SELECT count(*) INTO _n FROM information_schema.columns
   WHERE table_schema='public' AND table_name='scp_item_versions'
     AND column_name IN ('difficulty','cognitive_demand','information_available_sv',
       'information_withheld_sv','work_context_sv','is_safety_critical',
       'requires_human_review','learning_counterpart_id','cognitive_review_status',
       'language_review_status','accessibility_review_status','jurisdiction_id');
  IF _n <> 12 THEN RAISE EXCEPTION 'SCP_P1F_ITEM_COLUMNS: found % of 12', _n; END IF;

  SELECT count(*) INTO _n FROM information_schema.columns
   WHERE table_schema='public' AND table_name='scp_item_options'
     AND column_name IN ('is_preferred','is_best_key','is_worst_key',
       'distractor_error_type','learning_feedback_sv','learning_feedback_en');
  IF _n <> 6 THEN RAISE EXCEPTION 'SCP_P1F_OPTION_COLUMNS: found % of 6', _n; END IF;
END $$;
