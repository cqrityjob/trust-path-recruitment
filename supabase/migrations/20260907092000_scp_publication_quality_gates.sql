-- Publication quality gates.
--
-- ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
--
-- The Assessment Foundation audit found that across 102 authored keyed items
-- the preferred option was displayed FIRST 102 times and was the longest
-- option 101 times. Nothing in the platform noticed, because nothing was
-- looking. The item bank was written by an AI assistant against construct
-- rules that say nothing about answer mechanics, and the same assistant will
-- write the next one.
--
-- Documentation cannot fix that. A gate can. These functions compute the
-- diagnostics, and a trigger refuses to move an assessment version into
-- 'approved' or 'published' while any hard gate fails.
--
-- ── WHAT IS GATED, AND WHAT IS ONLY REPORTED ────────────────────────────────
--
-- Hard gates block publication:
--   * answer-key balance and displayed-position balance at FORM level
--   * length balance at FORM level
--   * every required review cleared, on every item
--   * every constructed-response item carrying a published rubric
--
-- Item-level length findings are WARNINGS. One legitimately long reporting
-- option must not be able to block a whole form, and a rule brittle enough to
-- do that gets switched off rather than fixed. The form-level aggregate is
-- what actually detects a systematic tell.
--
-- ── WHAT THIS DOES NOT DO ───────────────────────────────────────────────────
--
-- It does not approve anything, mark any review complete, or raise any
-- validation status. Every gate can only refuse. Clearing a review remains a
-- human act recorded by a human, and nothing in this file writes to
-- scp_review_requirements or to any *_review_status column.
--
-- Reversible: drop the trigger and the four functions.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Which items the balance rules apply to
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Every closed-key scenario item with at least three options. Deliberately
-- excluded:
--
--   constructed_response  -- no options at all
--   biq_frequency         -- self-report on an ordered scale; there is no key
--   sjt_best_worst        -- two keys and an order that carries meaning
--
-- NOT excluded: three-option items. An earlier draft of this gate applied only
-- to four-option items, which would have reported "not applicable" on 97 of
-- the 102 defective items the audit found -- every one of them a three-option
-- item keyed 'a' in first position. A rule that a bank can escape by authoring
-- one fewer option is not a rule. Items are therefore grouped into cohorts by
-- option count and each cohort is balanced across the slots it actually has.

-- `preferred_key_slot` is the preferred option's ORDINAL among the item's own
-- keys in sort order, not the key text. The bank uses three key vocabularies
-- at once -- 'a'-'d', 'A'-'D' and '1'-'4' -- so comparing the literal string
-- across items would silently report every uppercase item as having no key at
-- all. The ordinal asks the question that matters -- "is the answer always the
-- nth choice?" -- in a way no vocabulary change can dodge.

-- Dropped rather than replaced: these are new in this migration, and dropping
-- first keeps the file re-runnable if the OUT parameters are ever revised.
DROP FUNCTION IF EXISTS public.scp_assessment_version_publication_readiness(uuid);
DROP FUNCTION IF EXISTS public.scp_form_option_length_report(uuid);
DROP FUNCTION IF EXISTS public.scp_form_balance_items(uuid);

CREATE OR REPLACE FUNCTION public.scp_form_balance_items(_form_id uuid)
RETURNS TABLE (
  item_version_id    uuid,
  preferred_key      text,
  preferred_key_slot integer,
  preferred_pos      integer,
  option_count       integer
)
LANGUAGE sql
STABLE
AS $$
  SELECT iv.id,
         p.option_key,
         p.key_slot::int,
         p.display_order,
         (SELECT count(*)::int FROM public.scp_item_options o
           WHERE o.item_version_id = iv.id)
    FROM public.scp_form_items fi
    JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
    JOIN LATERAL (
      SELECT s.option_key, s.display_order, s.key_slot
        FROM (SELECT o.option_key, o.display_order, o.is_preferred,
                     row_number() OVER (ORDER BY lower(o.option_key)) AS key_slot
                FROM public.scp_item_options o
               WHERE o.item_version_id = iv.id) s
       WHERE s.is_preferred
       ORDER BY s.display_order LIMIT 1
    ) p ON true
   WHERE fi.form_id = _form_id
     AND iv.item_format IN ('sjt_best_response', 'sjt_rate_effectiveness')
     AND iv.evidence_source_type <> 'self_report'
     AND (SELECT count(*) FROM public.scp_item_options o
           WHERE o.item_version_id = iv.id) >= 3;
$$;

COMMENT ON FUNCTION public.scp_form_balance_items(uuid) IS
  'The single-key scenario items on a form with three or more options -- the '
  'population the answer-position and length rules apply to. option_count is '
  'returned so the caller can balance each cohort across the slots it has.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Length diagnostics
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Reported per item and per language, so a reviewer can see WHICH item leans
-- and in which translation.
--
-- `preferred_rank` is the preferred option's place in the length ordering,
-- 1 = longest, and it is a MIDRANK: ties share the average of the places they
-- occupy. That matters more than it looks. Four options of identical length
-- carry no length signal whatsoever -- it is the ideal case -- but under a
-- naive "1 + how many are strictly longer" the preferred option would score 1,
-- the worst possible value, and a perfectly balanced item would be reported as
-- the most biased one there is. With midranks, four equal lengths give
-- 1 + 0 + 3/2 = 2.5, which is exactly the no-signal value.

CREATE OR REPLACE FUNCTION public.scp_form_option_length_report(_form_id uuid)
RETURNS TABLE (
  item_version_id     uuid,
  item_slug           text,
  language            text,
  preferred_len       integer,
  longest_len         integer,
  shortest_len        integer,
  preferred_rank      numeric,
  strictly_longest    boolean,
  length_ratio        numeric,
  finding             text
)
LANGUAGE sql
STABLE
AS $$
  WITH lens AS (
    SELECT b.item_version_id, i.slug, ot.language,
           length(ot.label) AS len,
           o.is_preferred
      FROM public.scp_form_balance_items(_form_id) b
      JOIN public.scp_item_versions iv ON iv.id = b.item_version_id
      JOIN public.scp_items i ON i.id = iv.item_id
      JOIN public.scp_item_options o ON o.item_version_id = b.item_version_id
      JOIN public.scp_item_option_texts ot ON ot.item_option_id = o.id
  ),
  agg AS (
    SELECT item_version_id, slug, language,
           max(len) FILTER (WHERE is_preferred)     AS pref_len,
           max(len)                                 AS max_len,
           min(len)                                 AS min_len
      FROM lens
     GROUP BY item_version_id, slug, language
  )
  SELECT a.item_version_id, a.slug, a.language,
         a.pref_len, a.max_len, a.min_len,
         -- Midrank: strictly longer options count 1 each, equally long ones
         -- count a half, because a tie is half a place either way.
         (SELECT 1 + count(*) FILTER (WHERE l.len > a.pref_len)
                   + count(*) FILTER (WHERE l.len = a.pref_len) / 2.0
            FROM lens l
           WHERE l.item_version_id = a.item_version_id
             AND l.language = a.language
             AND NOT l.is_preferred) AS preferred_rank,
         -- Strictly: an option tied for longest is not a tell, because a
         -- reader picking "the longest" cannot tell which one that is.
         (a.pref_len > (SELECT max(l.len) FROM lens l
                         WHERE l.item_version_id = a.item_version_id
                           AND l.language = a.language
                           AND NOT l.is_preferred)) AS strictly_longest,
         round(a.max_len::numeric / nullif(a.min_len, 0), 2) AS length_ratio,
         CASE
           WHEN a.pref_len >= a.max_len
                AND a.max_len::numeric / nullif(a.min_len, 0) > 1.5
             THEN 'preferred_longest_and_wide_spread'
           WHEN a.pref_len >= a.max_len THEN 'preferred_longest'
           WHEN a.max_len::numeric / nullif(a.min_len, 0) > 1.6
             THEN 'wide_spread'
           ELSE 'ok'
         END AS finding
    FROM agg a;
$$;

COMMENT ON FUNCTION public.scp_form_option_length_report(uuid) IS
  'Per-item, per-language option length diagnostics. Item-level findings are '
  'advisory; the form-level aggregate in scp_assessment_version_publication_readiness '
  'is what blocks publication.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Readiness
-- ═══════════════════════════════════════════════════════════════════════════
--
-- One row per gate, with a status a person can act on. `blocking` says whether
-- a failure refuses publication. Callable on a draft, which is the point: an
-- author should be able to see what is still wrong before they try.

CREATE OR REPLACE FUNCTION public.scp_assessment_version_publication_readiness(
  _assessment_version_id uuid
)
RETURNS TABLE (
  gate     text,
  status   text,
  blocking boolean,
  detail   text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _form record;
  _n int; _min int; _max int; _lo int; _hi int;
  _longest int; _rank numeric; _applicable int;
  _pending int; _outstanding int; _norubric int;
  _keydetail text; _posdetail text;
BEGIN
  -- ---- A. answer key and displayed position, per form and cohort ---------
  --
  -- A cohort is one form's items that share an option count, because items
  -- with three options and items with four cannot be balanced against the
  -- same set of slots. Cohorts smaller than the option count are too small to
  -- judge a distribution on, and are only failed for the degenerate case --
  -- every item on the same key, or every item in the same position -- which is
  -- precisely the defect the audit found.
  FOR _form IN
    SELECT f.id AS id, f.slug AS slug, b.option_count AS option_count,
           count(*)::int AS applicable
      FROM public.scp_forms f
      JOIN public.scp_form_balance_items(f.id) b ON true
     WHERE f.assessment_version_id = _assessment_version_id
     GROUP BY f.id, f.slug, b.option_count
     ORDER BY f.slug, b.option_count
  LOOP
    _applicable := _form.applicable;

    -- Ideal is _applicable/option_count per slot; the rule allows one either
    -- side of it. Below one full round the only failure is total collapse.
    IF _applicable < _form.option_count THEN
      _lo := 0;
      _hi := greatest(1, _applicable - 1);
    ELSE
      _lo := greatest(0, (_applicable / _form.option_count) - 1);
      _hi := ((_applicable + _form.option_count - 1) / _form.option_count) + 1;
    END IF;

    SELECT min(c), max(c), string_agg(chr(96 + k) || '=' || c, ' ' ORDER BY k)
      INTO _min, _max, _keydetail
      FROM (
        SELECT k.k, count(b.preferred_key_slot)::int AS c
          FROM generate_series(1, _form.option_count) k(k)
          LEFT JOIN public.scp_form_balance_items(_form.id) b
                 ON b.preferred_key_slot = k.k AND b.option_count = _form.option_count
         GROUP BY k.k) s;

    RETURN QUERY SELECT 'answer_key_balance',
      CASE WHEN _min >= _lo AND _max <= _hi THEN 'pass' ELSE 'fail' END, true,
      format('%s, %s-option items: %s across %s items (allowed %s-%s per key).',
             _form.slug, _form.option_count, _keydetail, _applicable, _lo, _hi);

    SELECT min(c), max(c), string_agg(p::text || '=' || c, ' ' ORDER BY p)
      INTO _min, _max, _posdetail
      FROM (
        SELECT p.p, count(b.preferred_pos)::int AS c
          FROM generate_series(1, _form.option_count) p(p)
          LEFT JOIN public.scp_form_balance_items(_form.id) b
                 ON b.preferred_pos = p.p AND b.option_count = _form.option_count
         GROUP BY p.p) s;

    RETURN QUERY SELECT 'answer_position_balance',
      CASE WHEN _min >= _lo AND _max <= _hi THEN 'pass' ELSE 'fail' END, true,
      format('%s, %s-option items: %s across %s items (allowed %s-%s per position).',
             _form.slug, _form.option_count, _posdetail, _applicable, _lo, _hi);
  END LOOP;

  -- ---- B. length balance, per form ---------------------------------------
  FOR _form IN
    SELECT f.id AS id, f.slug AS slug FROM public.scp_forms f
     WHERE f.assessment_version_id = _assessment_version_id
     ORDER BY f.slug
  LOOP
    SELECT count(*) FILTER (WHERE r.strictly_longest),
           avg(r.preferred_rank),
           count(*)
      INTO _longest, _rank, _n
      FROM public.scp_form_option_length_report(_form.id) r;

    RETURN QUERY SELECT 'option_length_balance',
      CASE WHEN _n = 0 THEN 'not_applicable'
           WHEN _longest::numeric / _n <= 0.40 AND _rank >= 2.0 THEN 'pass'
           ELSE 'fail' END,
      true,
      format('%s: preferred is strictly longest in %s of %s item-languages (%s%%, limit 40%%); '
             'mean preferred length-rank %s (floor 2.00, 2.50 = no signal).',
             _form.slug, _longest, _n,
             round(100.0 * _longest / nullif(_n, 0)), round(_rank, 2));
  END LOOP;

  -- ---- C. review gates ---------------------------------------------------
  SELECT count(*) INTO _pending
    FROM public.scp_forms f
    JOIN public.scp_form_items fi ON fi.form_id = f.id
    JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
   WHERE f.assessment_version_id = _assessment_version_id
     AND (iv.sme_review_status <> 'approved'
       OR iv.bias_review_status <> 'approved'
       OR iv.cognitive_review_status NOT IN ('passed', 'not_required')
       OR iv.language_review_status NOT IN ('passed', 'not_required')
       OR iv.accessibility_review_status NOT IN ('passed', 'not_required')
       OR (iv.legal_basis_required AND iv.legal_review_status <> 'approved'));

  RETURN QUERY SELECT 'item_review_gates',
    CASE WHEN _pending = 0 THEN 'pass' ELSE 'fail' END, true,
    format('%s item(s) still have an SME, bias, cognitive, language, accessibility '
           'or legal review outstanding.', _pending);

  SELECT count(*) INTO _outstanding
    FROM public.scp_forms f
    JOIN public.scp_form_items fi ON fi.form_id = f.id
    JOIN public.scp_review_requirements rr ON rr.item_version_id = fi.item_version_id
   WHERE f.assessment_version_id = _assessment_version_id
     AND rr.required AND rr.status NOT IN ('cleared', 'waived');

  RETURN QUERY SELECT 'declared_review_requirements',
    CASE WHEN _outstanding = 0 THEN 'pass' ELSE 'fail' END, true,
    format('%s declared review requirement(s) are still outstanding.', _outstanding);

  -- ---- D. rubric gate ----------------------------------------------------
  SELECT count(*) INTO _norubric
    FROM public.scp_forms f
    JOIN public.scp_form_items fi ON fi.form_id = f.id
    JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
   WHERE f.assessment_version_id = _assessment_version_id
     AND iv.item_format = 'constructed_response'
     AND NOT EXISTS (
       SELECT 1 FROM public.scp_rubric_versions rv
        WHERE rv.item_version_id = iv.id AND rv.content_status = 'published');

  RETURN QUERY SELECT 'constructed_response_rubrics',
    CASE WHEN _norubric = 0 THEN 'pass' ELSE 'fail' END, true,
    format('%s constructed-response item(s) have no published rubric.', _norubric);
END $$;

COMMENT ON FUNCTION public.scp_assessment_version_publication_readiness(uuid) IS
  'One row per publication gate. Callable on a draft so an author can see what '
  'is still wrong. Refuses only; never approves, clears a review or raises a '
  'validation status.';

REVOKE ALL     ON FUNCTION public.scp_assessment_version_publication_readiness(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_assessment_version_publication_readiness(uuid) TO authenticated;
REVOKE ALL     ON FUNCTION public.scp_form_balance_items(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_form_balance_items(uuid) TO authenticated;
REVOKE ALL     ON FUNCTION public.scp_form_option_length_report(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_form_option_length_report(uuid) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. The gate itself
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.scp_guard_publication_quality()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE _failed text;
BEGIN
  -- Only the transition INTO an approved/published state is gated. Drafting
  -- and reviewing an unbalanced form is explicitly allowed: that is what
  -- drafting is.
  IF NEW.content_status NOT IN ('approved', 'published') THEN
    RETURN NEW;
  END IF;
  IF OLD.content_status IN ('approved', 'published') THEN
    RETURN NEW;  -- already past the gate; the immutability trigger owns it now
  END IF;

  SELECT string_agg(format('%s (%s)', gate, detail), E'\n  ' ORDER BY gate)
    INTO _failed
    FROM public.scp_assessment_version_publication_readiness(NEW.id)
   WHERE blocking AND status = 'fail';

  IF _failed IS NOT NULL THEN
    RAISE EXCEPTION
      'SCP_PUBLICATION_QUALITY_GATE: assessment version % cannot be % while '
      'these gates fail: %',
      NEW.id, NEW.content_status, _failed
      USING ERRCODE = 'check_violation',
            HINT = 'Run scp_assessment_version_publication_readiness() for the full report.';
  END IF;

  RETURN NEW;
END $$;

COMMENT ON FUNCTION public.scp_guard_publication_quality() IS
  'Refuses to publish or approve an assessment version while any blocking '
  'quality or review gate fails.';

REVOKE ALL ON FUNCTION public.scp_guard_publication_quality() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS scp_assessment_versions_quality_gate ON public.scp_assessment_versions;
CREATE TRIGGER scp_assessment_versions_quality_gate
  BEFORE UPDATE ON public.scp_assessment_versions
  FOR EACH ROW EXECUTE FUNCTION public.scp_guard_publication_quality();

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Prove it
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE _n int; _v uuid;
BEGIN
  SELECT count(*) INTO _n FROM pg_trigger
   WHERE NOT tgisinternal AND tgname = 'scp_assessment_versions_quality_gate';
  IF _n <> 1 THEN RAISE EXCEPTION 'SCP_QUALITY_GATE_TRIGGER_MISSING'; END IF;

  -- The flagship is draft, AI-authored and entirely unreviewed, so every
  -- review gate must currently read fail. A readiness function that reports
  -- "pass" on content with zero human review would be worse than none.
  SELECT av.id INTO _v
    FROM public.scp_assessment_versions av
    JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
   WHERE d.slug = 'security-officer-recruitment';

  IF _v IS NOT NULL THEN
    SELECT count(*) INTO _n
      FROM public.scp_assessment_version_publication_readiness(_v)
     WHERE gate IN ('item_review_gates', 'declared_review_requirements')
       AND status = 'fail';
    IF _n <> 2 THEN
      RAISE EXCEPTION 'SCP_QUALITY_GATE_REVIEW_BLIND: the flagship has no human '
        'review of any kind, but only % of the 2 review gates report a failure.', _n;
    END IF;
  END IF;
END $$;

INSERT INTO public.scp_content_events (subject_type, subject_ref, action, reason, metadata)
VALUES (
  'assessment_version', 'scp-publication-quality-gates', 'created',
  'Answer-key balance, displayed-position balance, option-length balance, '
  'review completion and constructed-response rubrics now block the transition '
  'to approved/published. The gates refuse only; nothing here approves anything.',
  jsonb_build_object(
    'migration', '20260907092000_scp_publication_quality_gates',
    'hard_gates', jsonb_build_array('answer_key_balance', 'answer_position_balance',
      'option_length_balance', 'item_review_gates', 'declared_review_requirements',
      'constructed_response_rubrics'),
    'length_limits', jsonb_build_object('max_preferred_longest_share', 0.40,
                                        'min_mean_preferred_rank', 2.0))
);
