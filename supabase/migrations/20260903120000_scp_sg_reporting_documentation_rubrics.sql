-- #65 — The three rubrics Rapportering & dokumentation was authored without.
--
-- ── THE DEFECT ──────────────────────────────────────────────────────────
--
-- 20260828092000 authored eleven items, three of them constructed_response
-- with requires_human_review = true, and said so in its own header:
--
--     "They therefore have no options and no deterministic score. They route
--      to the existing human review workflow, and the reviewer scores them
--      against the governed rubric"
--
-- There is no governed rubric. The migration writes zero rows into
-- scp_rubrics, scp_rubric_versions, scp_rubric_dimensions and
-- scp_rubric_levels. The sentence describes an intention that was never
-- authored, and nothing checked it, because the only thing that consults a
-- rubric is scp_complete_human_review -- which is reached long after content
-- authoring, by a different person, on a different day.
--
-- So the failure surfaced where it always does: a reviewer who had read a
-- candidate's written escalation, chosen a severity and a finding, typed their
-- reasoning, and pressed Slutför granskning, was told
--
--     SCP_NO_RUBRIC: this constructed response has no rubric, so no governed
--     contribution can be derived for it.
--
-- The refusal is correct and stays. A constructed response with no rubric has
-- no governed way to become a number, and inventing one -- a default level, a
-- reviewer-chosen weight, a fixed 0.5 -- would put a fabricated measurement on
-- somebody's competence record. The content is what is missing, so the content
-- is what this migration adds.
--
-- ── SCOPE, MEASURED RATHER THAN ASSUMED ─────────────────────────────────
--
-- Every constructed_response item on every form was checked against its
-- rubric. Exactly one assessment is affected:
--
--   sg-reporting-documentation   3 of 3 constructed responses have no rubric
--   security-officer-recruitment 4 of 4 have one   (the flagship is fine)
--   sg-operational-baseline      3 of 3 have one
--   fixture-delivery-e2e         1 of 1 has one
--
-- This is canonical library content, not smoke-test data: the assessment is
-- assignable under a closed-test grant, and a real submitted attempt is stuck
-- behind it right now.
--
-- ── WHY THE EXISTING ITEM VERSIONS, AND NOT NEW ONES ────────────────────
--
-- The rubric attaches to scp_item_versions row 1 of each item -- the same row
-- the already-submitted responses point at. Authoring a version 2 would leave
-- every submitted response pointing at a version that still has no rubric, so
-- the attempt that prompted this would stay stuck and the repair would only
-- help future runs. Nothing about the items themselves changes: no prompt, no
-- scenario, no format, no governance status, and not one candidate response.
--
-- ── WHAT A RUBRIC HERE IS ALLOWED TO MEASURE ────────────────────────────
--
-- Four dimensions each, following the pattern established by the recruitment
-- assessment's reflection items. One of the four is writing quality, marked
-- assesses_writing_quality so that it is shown to the reviewer and excluded
-- from the derived contribution: a guard who writes plainly about what they saw
-- must not score below one who writes elegantly about nothing. must_not_infer
-- records, in data, the readings a reviewer may not take from a piece of prose.
--
-- The other three dimensions are the same three facts in every case, because
-- that is what these items actually ask for and what the scenario text already
-- names: what was observed, what was done, and what the reader is expected to
-- do next. They are deliberately about the TEXT, never about the person.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. The rubrics
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO public.scp_rubrics (slug) VALUES
  ('sg-rd-04-observation-note'),
  ('sg-rd-08-shift-handover'),
  ('sg-rd-11-escalation')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.scp_rubric_versions
  (rubric_id, item_version_id, version_number, content_status, name_sv, name_en, must_not_infer)
SELECT r.id, iv.id, 1, 'draft', v.sv, v.en,
  -- The same prohibition list the recruitment rubrics carry, minus the entries
  -- that only make sense about an autobiographical answer. These items are
  -- scenario responses: the text is evidence about writing a report, and about
  -- nothing else the reader might be tempted to read into it.
  ARRAY['personlighet','ärlighet som egenskap','motivation','känsloläge','avsikt',
        'intelligens','psykisk hälsa','framtida arbetsprestation',
        'lämplighet för anställning','skyddade personliga egenskaper',
        'språklig elegans','modersmål']
FROM (VALUES
 ('sg-rd-04-observation-note','sg-rd-04',
  'Notering som skiljer iakttagelse från tolkning',
  'A note that separates observation from interpretation'),
 ('sg-rd-08-shift-handover','sg-rd-08',
  'Överlämning vid skiftbyte',
  'Shift handover'),
 ('sg-rd-11-escalation','sg-rd-11',
  'Eskalering med underlag för beslut',
  'Escalation with a basis for decision')
) AS v(rslug,islug,sv,en)
JOIN public.scp_rubrics r ON r.slug = v.rslug
JOIN public.scp_items i ON i.slug = v.islug
JOIN public.scp_item_versions iv ON iv.item_id = i.id AND iv.version_number = 1
ON CONFLICT (rubric_id, version_number) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Dimensions
--
-- Each criterion is written so a reviewer can point at the text and say yes or
-- no. "Visar gott omdöme" would be unobservable and would invite exactly the
-- inference must_not_infer forbids; "tid och plats framgår" can be checked.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO public.scp_rubric_dimensions
  (rubric_version_id, dimension_key, display_order, name_sv, name_en,
   observable_criteria_sv, observable_criteria_en, assesses_writing_quality)
SELECT rv.id, v.k, v.ord, v.sv, v.en, v.csv, v.cen, v.style
FROM (VALUES
 -- Item 4 — the note. Tid 13:40, obevakad väska, sex minuter, personen återvänder.
 ('sg-rd-04-observation-note','observable_facts',1,
  'Konkreta iakttagelser','Observable facts',
  'Tid, plats och det som faktiskt skedde framgår, i den ordning det skedde.',
  'Time, place and what actually happened are stated, in the order it happened.',false),
 ('sg-rd-04-observation-note','interpretation_marked',2,
  'Tolkning märkt som tolkning','Interpretation marked as interpretation',
  'Om en tolkning görs är den utpekad som sådan och hålls skild från iakttagelsen. Ingen tolkning alls är ett fullgott svar.',
  'If an interpretation is offered it is labelled as one and kept apart from the observation. No interpretation at all is a perfectly good answer.',false),
 ('sg-rd-04-observation-note','usable_by_reader',3,
  'Användbar för mottagaren','Usable by the reader',
  'Noteringen innehåller det en kollega behöver för att känna igen situationen om den återkommer.',
  'The note carries what a colleague would need to recognise the situation if it recurs.',false),
 ('sg-rd-04-observation-note','clarity',4,
  'Tydlighet','Clarity',
  'Noteringen går att följa. Enkelt språk bedöms likvärdigt med polerat.',
  'The note can be followed. Simple language is judged equal to polished.',true),

 -- Item 8 — the handover. Hiss mellan våningar, två personer, räddningstjänst
 -- på väg, hissjour har inte återkommit, passet slut om fem minuter.
 ('sg-rd-08-shift-handover','current_status',1,
  'Nuläge','Current status',
  'Vad som pågår just nu framgår, inklusive att personer är kvar i hissen.',
  'What is happening right now is stated, including that people are still in the lift.',false),
 ('sg-rd-08-shift-handover','actions_taken',2,
  'Vad som redan gjorts','What has already been done',
  'De åtgärder som vidtagits framgår, med vem som kontaktats och vad de svarat.',
  'The actions taken are stated, with who has been contacted and what they answered.',false),
 ('sg-rd-08-shift-handover','what_remains',3,
  'Vad som återstår','What remains',
  'Det som nästa väktare behöver ta vid framgår, inklusive den uteblivna återkopplingen.',
  'What the next guard has to pick up is stated, including the callback that has not come.',false),
 ('sg-rd-08-shift-handover','clarity',4,
  'Tydlighet','Clarity',
  'Överlämningen går att arbeta vidare från utan att fråga. Enkelt språk bedöms likvärdigt med polerat.',
  'The handover can be worked from without asking follow-up questions. Simple language is judged equal to polished.',true),

 -- Item 11 — the escalation. Nio tillfällen på sex veckor, i snitt 40 minuter,
 -- felanmält varje gång.
 ('sg-rd-11-escalation','observed_pattern',1,
  'Observerat mönster','Observed pattern',
  'Det återkommande framgår som ett mönster, med antal tillfällen och tidsomfattning, inte som en enskild händelse.',
  'The recurrence is presented as a pattern, with the number of occasions and the duration involved, not as a single incident.',false),
 ('sg-rd-11-escalation','actions_already_taken',2,
  'Vad som redan gjorts','What has already been done',
  'Det framgår att felanmälan gjorts varje gång, så att mottagaren ser att den vanliga kanalen är prövad.',
  'That the fault was reported every time is stated, so the reader can see the ordinary channel has been tried.',false),
 ('sg-rd-11-escalation','decision_requested',3,
  'Begärt beslut','Decision requested',
  'Det framgår vad mottagaren ombeds besluta om. En eskalering utan en fråga är en notering.',
  'What the reader is being asked to decide is stated. An escalation with no question in it is a note.',false),
 ('sg-rd-11-escalation','clarity',4,
  'Tydlighet','Clarity',
  'Eskaleringen går att fatta beslut utifrån. Enkelt språk bedöms likvärdigt med polerat.',
  'The escalation can be decided on as written. Simple language is judged equal to polished.',true)
) AS v(rslug,k,ord,sv,en,csv,cen,style)
JOIN public.scp_rubrics r ON r.slug = v.rslug
JOIN public.scp_rubric_versions rv ON rv.rubric_id = r.id AND rv.version_number = 1
ON CONFLICT (rubric_version_id, dimension_key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Levels
--
-- The same five anchors the recruitment rubrics use. They are deliberately
-- dimension-agnostic: what varies between dimensions is the observable
-- criterion above, not the meaning of "partly met".
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO public.scp_rubric_levels (rubric_dimension_id, level, descriptor_sv, descriptor_en)
SELECT d.id, l.lvl, l.sv, l.en
FROM public.scp_rubric_dimensions d
JOIN public.scp_rubric_versions rv ON rv.id = d.rubric_version_id
JOIN public.scp_rubrics r ON r.id = rv.rubric_id
CROSS JOIN (VALUES
 (0,'Inget underlag i svaret för denna dimension.','No evidence in the response for this dimension.'),
 (1,'Enstaka relevant inslag, men väsentligt saknas.','An isolated relevant element, but essentials are missing.'),
 (2,'Delvis uppfyllt; minst en väsentlig brist kvarstår.','Partly met; at least one material gap remains.'),
 (3,'Uppfyllt i allt väsentligt utan allvarliga brister.','Met in all essentials with no serious gaps.'),
 (4,'Uppfyllt genomgående och konkret.','Met throughout, and concretely.')
) AS l(lvl,sv,en)
WHERE r.slug IN ('sg-rd-04-observation-note','sg-rd-08-shift-handover','sg-rd-11-escalation')
ON CONFLICT (rubric_dimension_id, level) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Prove it
--
-- 4a-4c prove the repair. 4d is the assertion whose absence caused this: it
-- checks EVERY constructed response on EVERY form, so the next assessment
-- authored without a rubric fails here rather than in front of a reviewer who
-- has already done the work.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE _n int; _bad int; _rec record;
BEGIN
  -- 4a. Three rubrics, attached to the item versions the submitted responses
  --     already point at.
  SELECT count(*) INTO _n
    FROM public.scp_rubric_versions rv
    JOIN public.scp_rubrics r ON r.id = rv.rubric_id
    JOIN public.scp_item_versions iv ON iv.id = rv.item_version_id
    JOIN public.scp_items i ON i.id = iv.item_id
   WHERE r.slug IN ('sg-rd-04-observation-note','sg-rd-08-shift-handover','sg-rd-11-escalation')
     AND i.slug IN ('sg-rd-04','sg-rd-08','sg-rd-11')
     AND iv.version_number = 1;
  IF _n <> 3 THEN
    RAISE EXCEPTION 'SCP_RD_RUBRIC_COUNT: expected 3 rubric versions on the '
      'existing item versions, found %.', _n;
  END IF;

  -- 4b. Four dimensions each, exactly one of them writing quality, and five
  --     levels on every dimension. A dimension with no levels is a control the
  --     reviewer cannot answer, which fails at exactly the same moment.
  FOR _rec IN
    SELECT r.slug,
           count(DISTINCT d.id) AS dims,
           count(DISTINCT d.id) FILTER (WHERE d.assesses_writing_quality) AS style_dims,
           count(l.id) AS levels
      FROM public.scp_rubrics r
      JOIN public.scp_rubric_versions rv ON rv.rubric_id = r.id
      JOIN public.scp_rubric_dimensions d ON d.rubric_version_id = rv.id
      LEFT JOIN public.scp_rubric_levels l ON l.rubric_dimension_id = d.id
     WHERE r.slug IN ('sg-rd-04-observation-note','sg-rd-08-shift-handover','sg-rd-11-escalation')
     GROUP BY r.slug
  LOOP
    IF _rec.dims <> 4 THEN
      RAISE EXCEPTION 'SCP_RD_RUBRIC_DIMENSIONS: % has % dimension(s), expected 4.',
        _rec.slug, _rec.dims;
    END IF;
    IF _rec.style_dims <> 1 THEN
      RAISE EXCEPTION 'SCP_RD_RUBRIC_STYLE: % has % writing-quality dimension(s), '
        'expected exactly 1 -- writing must be visible to the reviewer and '
        'excluded from the contribution.', _rec.slug, _rec.style_dims;
    END IF;
    IF _rec.levels <> 20 THEN
      RAISE EXCEPTION 'SCP_RD_RUBRIC_LEVELS: % has % level(s), expected 20 '
        '(4 dimensions x 5).', _rec.slug, _rec.levels;
    END IF;
  END LOOP;

  -- 4c. Bilingual, in both directions. A rubric shown to a reviewer in the
  --     wrong language is a rubric they will not apply.
  SELECT count(*) INTO _bad
    FROM public.scp_rubric_versions rv
    JOIN public.scp_rubrics r ON r.id = rv.rubric_id
    JOIN public.scp_rubric_dimensions d ON d.rubric_version_id = rv.id
    LEFT JOIN public.scp_rubric_levels l ON l.rubric_dimension_id = d.id
   WHERE r.slug IN ('sg-rd-04-observation-note','sg-rd-08-shift-handover','sg-rd-11-escalation')
     AND (coalesce(btrim(rv.name_sv),'') = '' OR coalesce(btrim(rv.name_en),'') = ''
       OR coalesce(btrim(d.name_sv),'') = '' OR coalesce(btrim(d.name_en),'') = ''
       OR coalesce(btrim(d.observable_criteria_sv),'') = ''
       OR coalesce(btrim(d.observable_criteria_en),'') = ''
       OR coalesce(btrim(l.descriptor_sv),'') = '' OR coalesce(btrim(l.descriptor_en),'') = '');
  IF _bad > 0 THEN
    RAISE EXCEPTION 'SCP_RD_RUBRIC_LANGUAGE_GAP: % rubric row(s) are missing '
      'text in one of the two languages.', _bad;
  END IF;

  -- 4d. The invariant the library never had: no constructed response on any
  --     form may exist without a rubric. This is the check whose absence let a
  --     documented promise ship unauthored.
  SELECT count(*) INTO _bad
    FROM public.scp_form_items fi
    JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
   WHERE iv.item_format = 'constructed_response'
     AND NOT EXISTS (SELECT 1 FROM public.scp_rubric_versions rv
                      WHERE rv.item_version_id = iv.id);
  IF _bad > 0 THEN
    RAISE EXCEPTION 'SCP_CONSTRUCTED_RESPONSE_WITHOUT_RUBRIC: % constructed '
      'response item(s) on forms still have no rubric. A reviewer reaching one '
      'is refused by SCP_NO_RUBRIC after doing the work.', _bad;
  END IF;

  RAISE NOTICE 'sg-reporting-documentation: 3 rubrics, 12 dimensions, 60 levels; '
    'no constructed response on any form is now without a rubric';
END $$;
