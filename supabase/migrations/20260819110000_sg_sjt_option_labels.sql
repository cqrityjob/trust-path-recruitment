-- Security Guard baseline — the missing candidate-facing SJT option labels.
--
-- The three sjt_best_worst items in sg-operational-baseline (sg-b-13, sg-b-14,
-- sg-b-15) each carry four options in scp_item_options with complete scoring
-- semantics, but had NO rows at all in scp_item_option_texts, in either
-- language. They reached the participant with an empty option list, could not
-- be answered, and therefore the whole 18-item assessment could not be
-- submitted by anyone.
--
-- Surfaced by employer_vaktare_journey_test.sql (VJ4.3b) and named by the
-- presence guards F2.8/F2.9 added to the Phase 1F content suite, which existed
-- only to check what a label SAYS and never that one EXISTS.
--
-- ── SCOPE ───────────────────────────────────────────────────────────────
--
-- ADDITIVE ONLY. Twenty-four rows: 12 options x 2 languages. Nothing else is
-- touched. Specifically NOT changed, because the defect was never in any of
-- them: scenarios, prompts, option ids, display_order, score_value,
-- is_best_key, is_worst_key, is_preferred, distractor_error_type,
-- scoring rationales, competencies, behaviours, rubrics, anchors.
--
-- ── GOVERNANCE IS DELIBERATELY UNCHANGED ────────────────────────────────
--
-- The programme stays content_status 'draft', validation_status 'design'. The
-- five review gates on these item versions (sme, bias, cognitive, language,
-- accessibility) stay 'pending'. Authoring the missing labels closes a
-- participant-facing content defect; it does not constitute any of those
-- reviews, and marking them approved here would be exactly the kind of
-- retroactive rubber-stamping the review model exists to prevent.
--
-- The Väktare programme therefore remains runnable ONLY under an explicit
-- closed_test grant, and still can never be used for recruitment.
--
-- ── LABELS ──────────────────────────────────────────────────────────────
--
-- Supplied verbatim by the content owner after review. They are deliberately
-- NOT the scoring rationales: a rationale is internal text explaining why an
-- option scores what it scores, and F6.1 refuses a label that reuses one.
-- They also carry no scoring, preference or error-type language (F6.2).
--
-- Reversible: DELETE the 24 rows by (item_option_id, language). Nothing else
-- is written.

-- Keyed on (item slug, option_key) — NOT on option uuids.
--
-- scp_item_options.id is gen_random_uuid(), so the option ids differ in every
-- database: the ids captured while extracting this content contract exist only
-- in that one replay. Hardcoding them passed locally and failed the clean
-- migration replay on a foreign key, which is exactly the point of that replay.
-- The item slug and the option_key (A-D) are authored and stable everywhere.
INSERT INTO public.scp_item_option_texts (item_option_id, language, label)
SELECT o.id, v.language, v.label
  FROM (VALUES
    ('sg-b-13','A','sv-SE',
     'Behåll uppsikten och ta lugnt kontakt för att fråga om personen behöver hjälp.'),
    ('sg-b-13','A','en-GB',
     'Keep the person under observation and calmly ask whether they need any assistance.'),
    ('sg-b-13','B','sv-SE',
     'Fortsätt observera personen på avstånd utan att ta kontakt.'),
    ('sg-b-13','B','en-GB',
     'Continue observing the person from a distance without making contact.'),
    ('sg-b-13','C','sv-SE',
     'Kontakta larmcentralen och rapportera personens beteende som misstänkt.'),
    ('sg-b-13','C','en-GB',
     'Contact the control room and report the person’s behaviour as suspicious.'),
    ('sg-b-13','D','sv-SE',
     'Gå fram till personen och uppmana hen att lämna platsen direkt.'),
    ('sg-b-13','D','en-GB',
     'Approach the person and tell them to leave the area immediately.'),

    ('sg-b-14','A','sv-SE',
     'Närma dig lugnt, tala med låg röst och föreslå att ni fortsätter samtalet lite avskilt.'),
    ('sg-b-14','A','en-GB',
     'Approach calmly, speak in a low voice and suggest continuing the conversation somewhere more private.'),
    ('sg-b-14','B','sv-SE',
     'Avvakta en stund och se om personen lugnar sig utan att du ingriper.'),
    ('sg-b-14','B','en-GB',
     'Wait for a moment and see whether the person calms down without your intervention.'),
    ('sg-b-14','C','sv-SE',
     'Be personen att lugna ner sig där hen står, inför de andra besökarna.'),
    ('sg-b-14','C','en-GB',
     'Ask the person to calm down where they are, in front of the other visitors.'),
    ('sg-b-14','D','sv-SE',
     'Ta tag i personen och börja föra hen bort från väntrummet.'),
    ('sg-b-14','D','en-GB',
     'Take hold of the person and begin escorting them away from the waiting area.'),

    ('sg-b-15','A','sv-SE',
     'Förklara att uppgiften inte omfattas av din instruktion och kontakta arbetsledningen för besked om hur du ska gå vidare.'),
    ('sg-b-15','A','en-GB',
     'Explain that the task is not covered by your instructions and contact your supervisor for guidance on how to proceed.'),
    ('sg-b-15','B','sv-SE',
     'Avböj uppgiften och planera att ta upp frågan med arbetsledningen efter passet.'),
    ('sg-b-15','B','en-GB',
     'Decline the task and plan to raise the matter with your supervisor after the shift.'),
    ('sg-b-15','C','sv-SE',
     'Avböj uppgiften utan att förklara varför eller ta frågan vidare.'),
    ('sg-b-15','C','en-GB',
     'Decline the task without explaining why or escalating the matter further.'),
    ('sg-b-15','D','sv-SE',
     'Gör det platschefen ber om eftersom hen representerar kunden.'),
    ('sg-b-15','D','en-GB',
     'Carry out the site manager’s request because they represent the client.')
  ) AS v(item_slug, option_key, language, label)
  JOIN public.scp_items i ON i.slug = v.item_slug
  JOIN public.scp_item_versions iv ON iv.item_id = i.id
  JOIN public.scp_item_options o
    ON o.item_version_id = iv.id AND o.option_key = v.option_key
 WHERE iv.item_format = 'sjt_best_worst'
ON CONFLICT (item_option_id, language) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- Prove it
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  _missing int; _rationale_reuse int; _leak int; _parity int; _gates int;
BEGIN
  -- Every option in the whole item bank now has a label in both languages.
  -- Asserted bank-wide, not just for these three items: that is what F2.8/F2.9
  -- check, and a migration that fixed only its own rows would leave the suite
  -- red for a reason nobody would look for here.
  SELECT count(*) INTO _missing
    FROM public.scp_item_options o
    CROSS JOIN (VALUES ('sv-SE'),('en-GB')) AS l(lang)
   WHERE NOT EXISTS (SELECT 1 FROM public.scp_item_option_texts t
                      WHERE t.item_option_id = o.id AND t.language = l.lang
                        AND btrim(coalesce(t.label,'')) <> '');
  IF _missing > 0 THEN
    RAISE EXCEPTION 'SG_SJT_LABELS: % option/language pair(s) still have no label', _missing;
  END IF;

  -- F6.1: a candidate label may never be its own internal scoring rationale.
  SELECT count(*) INTO _rationale_reuse
    FROM public.scp_item_option_texts t
    JOIN public.scp_item_options o ON o.id = t.item_option_id
   WHERE btrim(t.label) IN (btrim(coalesce(o.scoring_rationale_sv,'~')),
                            btrim(coalesce(o.scoring_rationale_en,'~')));
  IF _rationale_reuse > 0 THEN
    RAISE EXCEPTION 'SG_SJT_LABELS: % label(s) reuse their scoring rationale', _rationale_reuse;
  END IF;

  -- F6.2: no label reveals scoring, preference or the error taxonomy.
  SELECT count(*) INTO _leak
    FROM public.scp_item_option_texts t
   WHERE t.label ILIKE '%rätt:%' OR t.label ILIKE '%correct:%'
      OR t.label ILIKE '%sämst%' OR t.label ILIKE '%worst:%'
      OR t.label ILIKE '%bäst:%' OR t.label ILIKE '%best:%'
      OR t.label ILIKE '%utanför mandat%' OR t.label ILIKE '%outside mandate%';
  IF _leak > 0 THEN
    RAISE EXCEPTION 'SG_SJT_LABELS: % label(s) leak scoring or error-type language', _leak;
  END IF;

  -- SV/EN parity: every option carries exactly one label per language.
  SELECT count(*) INTO _parity
    FROM public.scp_item_options o
   WHERE (SELECT count(*) FROM public.scp_item_option_texts t
           WHERE t.item_option_id = o.id AND t.language = 'sv-SE') <> 1
      OR (SELECT count(*) FROM public.scp_item_option_texts t
           WHERE t.item_option_id = o.id AND t.language = 'en-GB') <> 1;
  IF _parity > 0 THEN
    RAISE EXCEPTION 'SG_SJT_LABELS: % option(s) lack SV/EN parity', _parity;
  END IF;

  -- Governance must be untouched. Authoring labels is not a review.
  SELECT count(*) INTO _gates
    FROM public.scp_item_versions iv
   WHERE iv.id IN ('5b846576-f9ba-4957-b0fd-94d768777d3d',
                   '58ed9d0c-5e54-4c79-85c4-6c81411f68e4',
                   '1ce82514-3e28-4f2c-a2fc-089e403e7418')
     AND (iv.sme_review_status <> 'pending' OR iv.bias_review_status <> 'pending'
       OR iv.cognitive_review_status <> 'pending'
       OR iv.language_review_status <> 'pending'
       OR iv.accessibility_review_status <> 'pending'
       OR iv.content_status <> 'draft' OR iv.validation_status <> 'design');
  IF _gates > 0 THEN
    RAISE EXCEPTION 'SG_SJT_LABELS: a review gate or status moved; labels are not a review';
  END IF;

  -- And the scoring key is exactly as it was: 3/2/1/0 with one best and one
  -- worst per item. Cheap to assert, and the thing that would matter most if
  -- this migration ever grew beyond inserting text.
  IF EXISTS (
    SELECT 1 FROM public.scp_item_versions iv
     WHERE iv.id IN ('5b846576-f9ba-4957-b0fd-94d768777d3d',
                     '58ed9d0c-5e54-4c79-85c4-6c81411f68e4',
                     '1ce82514-3e28-4f2c-a2fc-089e403e7418')
       AND ((SELECT count(*) FROM public.scp_item_options o
              WHERE o.item_version_id = iv.id AND o.is_best_key) <> 1
         OR (SELECT count(*) FROM public.scp_item_options o
              WHERE o.item_version_id = iv.id AND o.is_worst_key) <> 1
         OR (SELECT count(*) FROM public.scp_item_options o
              WHERE o.item_version_id = iv.id) <> 4)
  ) THEN
    RAISE EXCEPTION 'SG_SJT_LABELS: the best/worst scoring key changed';
  END IF;
END $$;
