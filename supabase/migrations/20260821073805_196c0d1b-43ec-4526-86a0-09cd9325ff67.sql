-- A form can say what its SECTIONS are, and tell the participant what each one asks.
--
-- ── WHY ─────────────────────────────────────────────────────────────────
--
-- scp_form_items has carried block_key since A1 ("order may be randomised
-- within controlled blocks only") but nothing has ever named a block. With
-- eighteen items in one run that was survivable. A fifty-item recruitment
-- assessment presented as one undifferentiated list of fifty questions is not:
-- the participant cannot tell where they are, and — more importantly — cannot
-- tell that the questions have changed KIND.
--
-- That second point is not cosmetic, it is the honesty requirement. A scenario
-- asks "what would you do here" and the answer is observed. A work-behaviour
-- item asks "how do you usually work" and the answer is a self-description. A
-- reflection asks the person to describe something that happened to them. Those
-- three are treated differently by the evidence model (20260830090000) and are
-- reported to the employer in separate sections, so the participant is entitled
-- to know which one they are answering at the time they answer it.
--
-- ── WHAT THIS IS NOT ────────────────────────────────────────────────────
--
-- Not a second delivery engine, not adaptive routing, not a per-block score.
-- A block has a name, an order, an introduction and a declaration of what it
-- asks. Nothing here scores, branches or gates. scp_get_attempt_items still
-- returns every item on the form in one ordered list; the block key travels
-- beside each item so a surface can group them, and grouping is the whole
-- feature.
--
-- ── SCOPE ───────────────────────────────────────────────────────────────
--
-- Additive. One table, one guard, one CREATE OR REPLACE that WIDENS
-- scp_get_attempt_items' return type by one column, one new read RPC. Forms
-- that declare no blocks are untouched and behave exactly as before — the guard
-- only engages once a form declares its first block, so no existing content is
-- retrospectively invalid.
--
-- Remediation: restore scp_get_attempt_items from 20260808090000, drop the new
-- table, function and guard.
--
-- Dependencies, verified present: public.scp_forms, public.scp_form_items,
-- public.scp_attempts, public.scp_get_attempt_items(uuid, text).

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. The section
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.scp_form_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES public.scp_forms(id) ON DELETE CASCADE,
  block_key text NOT NULL,
  display_order integer NOT NULL,
  name_sv text NOT NULL,
  name_en text NOT NULL,
  intro_sv text NOT NULL,
  intro_en text NOT NULL,
  -- What the participant is actually being asked to do. Three values, because
  -- there are three honest things an item can ask and they are read
  -- differently afterwards. Stated on the block rather than inferred from the
  -- items so the introduction and the evidence model cannot drift apart.
  asks text NOT NULL CHECK (asks IN (
    'what_you_would_do',    -- a scenario; the choice is observed
    'how_you_usually_work', -- self-description; never observed competence
    'your_own_experience'   -- free recollection; a person reads it
  )),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (form_id, block_key),
  UNIQUE (form_id, display_order)
);

COMMENT ON TABLE public.scp_form_blocks IS
  'Named sections of a form. Presentation and participant information only: no '
  'block carries a score, a weight, a gate or a branch. `asks` states which of '
  'the three kinds of question the section contains, so the participant is told '
  'at answering time what their answer will be read as.';

COMMENT ON COLUMN public.scp_form_blocks.asks IS
  'what_you_would_do = scenario, answer is observed. how_you_usually_work = '
  'self-description, never presented as observed competence. '
  'your_own_experience = free recollection, read by a person. Must agree with '
  'the evidence_source_type of the items in the block -- enforced by '
  'scp_guard_block_asks_agrees.';

ALTER TABLE public.scp_form_blocks ENABLE ROW LEVEL SECURITY;

-- Section names and introductions are catalogue content, not test material:
-- they name no item, no option, no key and no rationale. Readable by any
-- authenticated principal, like the rest of the content catalogue; writable
-- only by an authoring principal (no INSERT/UPDATE/DELETE policy exists, so
-- only definer functions and the service role can write).
DROP POLICY IF EXISTS scp_form_blocks_read ON public.scp_form_blocks;
CREATE POLICY scp_form_blocks_read ON public.scp_form_blocks
  FOR SELECT TO authenticated USING (true);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. A declared section must tell the truth about its items
--
-- The guard is on scp_form_items, because that is where the association is
-- made. It engages ONLY when the form has declared at least one block, so
-- every existing form -- all of which use the default 'default' key and declare
-- nothing -- is unaffected.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.scp_guard_block_asks_agrees()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE _asks text; _src text; _fmt text; _declares boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.scp_form_blocks b WHERE b.form_id = NEW.form_id)
    INTO _declares;
  IF NOT _declares THEN RETURN NEW; END IF;

  SELECT b.asks INTO _asks
    FROM public.scp_form_blocks b
   WHERE b.form_id = NEW.form_id AND b.block_key = NEW.block_key;

  IF _asks IS NULL THEN
    RAISE EXCEPTION
      'SCP_BLOCK_NOT_DECLARED: this form declares its sections, but "%" is not '
      'one of them. Declare the section before placing an item in it.',
      NEW.block_key USING ERRCODE = 'check_violation';
  END IF;

  SELECT iv.evidence_source_type, iv.item_format INTO _src, _fmt
    FROM public.scp_item_versions iv WHERE iv.id = NEW.item_version_id;

  IF _asks = 'how_you_usually_work' AND _src <> 'self_report' THEN
    RAISE EXCEPTION
      'SCP_BLOCK_ASKS_MISMATCH: section "%" tells the participant it is asking '
      'how they usually work, so every item in it must be declared '
      'self_report. This one is "%".', NEW.block_key, _src
      USING ERRCODE = 'check_violation';
  END IF;

  IF _asks <> 'how_you_usually_work' AND _src = 'self_report' THEN
    RAISE EXCEPTION
      'SCP_BLOCK_ASKS_MISMATCH: section "%" does not tell the participant it is '
      'collecting a self-description, so it may not contain a self_report item.',
      NEW.block_key USING ERRCODE = 'check_violation';
  END IF;

  IF _asks = 'your_own_experience' AND _fmt <> 'constructed_response' THEN
    RAISE EXCEPTION
      'SCP_BLOCK_ASKS_MISMATCH: section "%" asks for the participant''s own '
      'experience in their own words, so every item in it must be a '
      'constructed_response. This one is "%".', NEW.block_key, _fmt
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS scp_form_items_block_asks_agrees ON public.scp_form_items;
CREATE TRIGGER scp_form_items_block_asks_agrees
  BEFORE INSERT OR UPDATE ON public.scp_form_items
  FOR EACH ROW EXECUTE FUNCTION public.scp_guard_block_asks_agrees();

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Delivery carries the block key
--
-- Return type widens by one column, so this is a DROP and CREATE and the ACL
-- has to be restated. Body is otherwise byte-identical to 20260808090000:
-- still no score, no key, no rationale, no preference flag, no learning
-- feedback -- those columns remain absent from the return type, which is what
-- makes leaking one structurally impossible rather than merely unintended.
-- ═══════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.scp_get_attempt_items(uuid, text);

CREATE OR REPLACE FUNCTION public.scp_get_attempt_items(
  _attempt_id uuid,
  _language   text DEFAULT 'sv-SE'
)
RETURNS TABLE (
  item_version_id uuid,
  display_order   integer,
  block_key       text,
  item_format     text,
  scenario        text,
  prompt          text,
  is_safety_critical boolean,
  options         jsonb,
  saved_option_id uuid,
  saved_best_id   uuid,
  saved_worst_id  uuid,
  saved_text      text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE _form_id uuid;
BEGIN
  -- The attempt must belong to the caller. Not "an" attempt -- THIS caller's.
  SELECT a.form_id INTO _form_id
    FROM public.scp_attempts a
    JOIN public.scp_subject_identities si ON si.subject_id = a.subject_id
   WHERE a.id = _attempt_id
     AND si.user_id = auth.uid();
  IF _form_id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT
    iv.id,
    fi.display_order,
    fi.block_key,
    iv.item_format,
    it.scenario,
    it.prompt,
    iv.is_safety_critical,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
                'option_id', o.id,
                'option_key', o.option_key,
                'label', ot.label)
              ORDER BY o.display_order)
         FROM public.scp_item_options o
         JOIN public.scp_item_option_texts ot
           ON ot.item_option_id = o.id AND ot.language = _language
        WHERE o.item_version_id = iv.id),
      '[]'::jsonb),
    r.selected_option_id,
    r.best_option_id,
    r.worst_option_id,
    r.response_text
  FROM public.scp_form_items fi
  JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
  JOIN public.scp_item_texts it
    ON it.item_version_id = iv.id AND it.language = _language
  LEFT JOIN public.scp_candidate_responses r
    ON r.attempt_id = _attempt_id AND r.item_version_id = iv.id
  WHERE fi.form_id = _form_id
  ORDER BY fi.display_order;
END; $$;

COMMENT ON FUNCTION public.scp_get_attempt_items(uuid, text) IS
  'The ONLY delivery path. Returns item text, section key and option LABELS for '
  'an attempt the caller owns, plus any answers already saved so a run can be '
  'resumed. Structurally incapable of returning a score, key, rationale, '
  'preference flag or learning feedback: those columns are absent from the '
  'return type.';

REVOKE ALL     ON FUNCTION public.scp_get_attempt_items(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_get_attempt_items(uuid, text) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. The sections themselves
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.scp_get_attempt_blocks(
  _attempt_id uuid,
  _language   text DEFAULT 'sv-SE'
)
RETURNS TABLE (
  block_key     text,
  display_order integer,
  name          text,
  intro         text,
  asks          text,
  item_count    integer,
  answered      integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE _form_id uuid;
BEGIN
  SELECT a.form_id INTO _form_id
    FROM public.scp_attempts a
    JOIN public.scp_subject_identities si ON si.subject_id = a.subject_id
   WHERE a.id = _attempt_id AND si.user_id = auth.uid();
  IF _form_id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT b.block_key, b.display_order,
         CASE WHEN _language = 'en-GB' THEN b.name_en  ELSE b.name_sv  END,
         CASE WHEN _language = 'en-GB' THEN b.intro_en ELSE b.intro_sv END,
         b.asks,
         (SELECT count(*)::int FROM public.scp_form_items fi
           WHERE fi.form_id = _form_id AND fi.block_key = b.block_key),
         (SELECT count(*)::int FROM public.scp_form_items fi
             JOIN public.scp_candidate_responses r
               ON r.item_version_id = fi.item_version_id
              AND r.attempt_id = _attempt_id
           WHERE fi.form_id = _form_id AND fi.block_key = b.block_key)
    FROM public.scp_form_blocks b
   WHERE b.form_id = _form_id
   ORDER BY b.display_order;
END; $$;

COMMENT ON FUNCTION public.scp_get_attempt_blocks(uuid, text) IS
  'The sections of the form behind an attempt the caller owns, in one language, '
  'with progress. Names and introductions only -- nothing about scoring, and '
  'nothing about any other participant.';

REVOKE ALL     ON FUNCTION public.scp_get_attempt_blocks(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_get_attempt_blocks(uuid, text) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Proof
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE _cols int;
BEGIN
  SELECT count(*) INTO _cols
    FROM unnest(string_to_array(
           pg_get_function_result('public.scp_get_attempt_items(uuid, text)'::regprocedure),
           ',')) AS c(t)
   WHERE t ILIKE '%score%' OR t ILIKE '%is_preferred%' OR t ILIKE '%rationale%'
      OR t ILIKE '%is_best_key%' OR t ILIKE '%is_worst_key%'
      OR t ILIKE '%learning_feedback%' OR t ILIKE '%distractor%';
  IF _cols > 0 THEN
    RAISE EXCEPTION
      'SCP_DELIVERY_LEAKS_KEY: the widened delivery signature exposes scoring '
      'information. The block key was meant to be the only addition.';
  END IF;

  IF pg_get_function_result('public.scp_get_attempt_items(uuid, text)'::regprocedure)
       NOT ILIKE '%block_key%' THEN
    RAISE EXCEPTION 'SCP_DELIVERY_MISSING_BLOCK: block_key did not land.';
  END IF;

  RAISE NOTICE 'delivery signature proven: block_key added, no scoring column present';
END $$;