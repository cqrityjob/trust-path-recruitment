-- Security Guard v1: the content and governance corrections, before any pilot.
--
-- Five owner decisions, one atomic concern: the SG programme's content and its
-- governance metadata must be right BEFORE a closed test writes evidence,
-- because scp_competency_evidence is append-only and each row binds to a
-- specific behaviour version. Evidence written under a mapping that is later
-- corrected can only be superseded, never fixed.
--
-- The window is open right now and will not reopen: no real pilot evidence
-- exists. Four fixture evidence rows exist, all on proportional_decision_making,
-- and none of them is mutated here -- they simply resolve through the corrected
-- map, which is the behaviour of a graph rather than a defect.
--
-- ── 1. COMPETENCY MAPPINGS ──────────────────────────────────────────────
--
-- Three behaviours are attached to the wrong construct on the SCC spine. The
-- canon is NOT edited to make the current mappings fit; the mappings move.
--
--   de_escalation                -> SCC-07, not SCC-05.
--     SCC-05 is "Emotionell självreglering": the guard's own impulse control
--     when provoked. Items sg-b-09/10/14 assess a technique directed at ANOTHER
--     person -- acknowledge the frustration, lower your voice, create space,
--     remove the audience. That is SCC-07 "Respektfull service och
--     gränshållning": respectful, solution-oriented treatment while upholding
--     security requirements, mandate and equal treatment.
--     This also removes the one place the product contradicted itself in print.
--     The programme's does_not_measure array says it does not measure
--     "emotionell stabilitet", and the report printed a competency line headed
--     "Emotionell självreglering" with evidence under it. does_not_measure is
--     unchanged and stays exactly as authored; the mapping was what was wrong.
--
--   factual_reporting            -> SCC-06, not SCC-11.
--     SCC-06 is defined as the ability to "transfer relevant information
--     clearly, FACTUALLY and appropriately for the recipient -- in speech, in
--     writing and in escalation". The behaviour statement is "Rapporterar det
--     som observerats, skilt från egen tolkning". That is the same sentence
--     twice. SCC-11 is about choosing a proportionate action within mandate,
--     which reporting is not.
--
--   proportional_decision_making -> SCC-11, not SCC-04, FOR THE SG PROGRAMME
--   ONLY, via a new behaviour VERSION.
--     SCC-11 is literally "Professionellt omdöme och PROPORTIONALITET", and is
--     defined as weighing facts, rules, risk, rights and consequences to choose
--     a reasonable and proportionate action within mandate. SCC-04 is about
--     deciding when time, information or room for action is LIMITED, and none of
--     sg-b-03/04/13 puts the participant under time pressure.
--
--     This one CANNOT be remapped globally, and the first attempt to do so was
--     correctly refused by the database. Six PUBLISHED fixture item versions --
--     fixture-e2e-01..04 and fixture-learn-01..02 -- share behaviour version 1
--     of proportional_decision_making, and scp_guard_published_immutable forbids
--     changing competency_id on published content. The whole migration aborted
--     and rolled back, which is the guard doing its job.
--
--     Local replay could not have caught it: 20260808100000 and 20260809100000,
--     which create those fixtures, are on the replay known-failure allowlist, so
--     the published fixture items do not exist in a clean local database at all.
--
--     The fix uses the versioning the platform already has rather than a new
--     taxonomy. Behaviour version 1 stays exactly as it is, still mapped to
--     SCC-04, still carrying the six published fixture items and their four
--     evidence rows. A NEW version 2 of the same behaviour is created, mapped to
--     SCC-11, and only the SG programme's own DRAFT items and module links are
--     moved onto it. Published fixture semantics are untouched by construction:
--     nothing published is in the update's scope.
--
-- SCC-04 and SCC-05 therefore end up unmeasured by this assessment. That is
-- accepted: a role competency does not have to be measured by every
-- instrument, and claiming coverage the items do not provide is the failure
-- this correction exists to avoid. Both stay in the role's competency map,
-- because they remain part of the role; SCC-07 is ADDED to it, because
-- de-escalation is now attached there and the role genuinely requires it.
--
-- ORDER MATTERS. scp_guard_item_behaviour_agrees fires on scp_item_versions and
-- refuses an item whose claimed competency_id is not reachable from its primary
-- behaviour. So the map moves first and the items follow; doing it the other way
-- round aborts on the first item.
--
-- ── 2. sg-b-03 ──────────────────────────────────────────────────────────
--
-- The visible option said "speak calmly and offer a voluntary exit" while the
-- governed rationale rewarded "...and assesses whether care is needed". A
-- participant must not be scored on an action the option they read did not
-- offer. The visible side is raised to match; the rationale is untouched.
--
-- ── 3. BEST/WORST PRESENTATION ORDER ────────────────────────────────────
--
-- All three best/worst items presented BEST as option A in position 1 and WORST
-- as option D in position 4. A participant who noticed after sg-b-13 could
-- answer sg-b-14 and sg-b-15 without reading them.
--
-- Runtime randomisation is deliberately NOT built. scp_form_items.randomise_
-- options exists but is read by nothing -- not by scp_get_attempt_items, not by
-- any TypeScript -- and adding a randomisation mechanism is more machinery than
-- a closed test needs. Only display_order moves, which is the smallest change
-- that removes the shortcut and stays fully deterministic and replayable.
--
-- Option ids, option_key, score_value, is_best_key, is_worst_key, is_preferred,
-- distractor_error_type, rationales and both language labels are ALL unchanged.
-- Labels travel with option_id, so SV/EN pairing is unaffected by definition.
--
-- ── 4. LANGUAGE SCOPE ───────────────────────────────────────────────────
--
-- The version declared {sv-SE} while the runtime served both languages from
-- scp_item_texts. English delivery is intentional and stays. adaptation_status
-- stays 'adaptation_pending' on all 36 texts: declaring which languages are in
-- scope is not the same as declaring the adaptation reviewed, and this
-- migration must not be usable as cover for the second.
--
-- ── 5. LEGAL GOVERNANCE ─────────────────────────────────────────────────
--
-- scp_review_requirements lists swedish_legal as outstanding for six items;
-- scp_item_versions.legal_review_status said 'pending' on three and
-- 'not_required' on the other three. Two registers, two answers. The register
-- is right -- all six rest on a legal or mandate proposition -- so the item
-- columns move to match it.
--
-- This moves gates TOWARDS more review and never away from it. No gate is
-- cleared, no legal conclusion is recorded, and sg-b-04 and sg-b-06 remain the
-- two that a Swedish specialist must answer before a pilot opens.
--
-- Rollback-forward: repoint the three map rows and the affected item
-- competency_id values, restore the two sg-b-03 labels, restore display_order
-- 1/2/3/4 by option_key on the three best/worst items, set language_scope back
-- to {sv-SE}, and set legal_basis_required/legal_review_status back on sg-b-02,
-- sg-b-15 and sg-b-18. All data, all reversible, no schema change.

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 1 — Competency mappings
-- ═══════════════════════════════════════════════════════════════════════════

-- 1a. The two behaviours no published content touches: remapped in place.
--
-- Verified before writing this: de_escalation carries 6 item versions and
-- factual_reporting 4, and every one of them is content_status = 'draft'. No
-- published row is in scope, so scp_guard_published_immutable has nothing to
-- refuse and version 1 can simply move.
UPDATE public.scp_behaviour_competency_map m
   SET competency_version_id = target.cv_id
  FROM (
    SELECT bv.id AS behaviour_version_id, cv.id AS cv_id
      FROM (VALUES
        ('de_escalation',     'SCC-07'),
        ('factual_reporting', 'SCC-06')
      ) AS v(behaviour_slug, competency_code)
      JOIN public.scp_observable_behaviours b ON b.slug = v.behaviour_slug
      JOIN public.scp_behaviour_versions bv ON bv.behaviour_id = b.id AND bv.version_number = 1
      JOIN public.scp_competencies c ON c.code = v.competency_code
      JOIN public.scp_competency_versions cv ON cv.competency_id = c.id AND cv.version_number = 1
  ) AS target
 WHERE m.behaviour_version_id = target.behaviour_version_id;

UPDATE public.scp_item_versions iv
   SET competency_id = target.competency_id
  FROM (
    SELECT bv.id AS behaviour_version_id, c.id AS competency_id
      FROM (VALUES
        ('de_escalation',     'SCC-07'),
        ('factual_reporting', 'SCC-06')
      ) AS v(behaviour_slug, competency_code)
      JOIN public.scp_observable_behaviours b ON b.slug = v.behaviour_slug
      JOIN public.scp_behaviour_versions bv ON bv.behaviour_id = b.id AND bv.version_number = 1
      JOIN public.scp_competencies c ON c.code = v.competency_code
  ) AS target
 WHERE iv.primary_behaviour_id = target.behaviour_version_id
   AND iv.competency_id IS DISTINCT FROM target.competency_id;

-- 1b. proportional_decision_making: a new VERSION, not a moved mapping.
--
-- Version 1 is shared with six PUBLISHED fixture item versions and their four
-- evidence rows. It is left completely alone -- same row, same SCC-04 mapping,
-- same items, same evidence. Version 2 is the SG programme's reading of the
-- same behaviour, and it is the only thing that maps to SCC-11.
--
-- Copied field-for-field from version 1 rather than re-authored: the behaviour
-- STATEMENT has not changed and should not drift. What changed is which
-- construct the SG programme attaches it to.
INSERT INTO public.scp_behaviour_versions
  (behaviour_id, version_number, content_status, statement_sv, statement_en,
   positive_indicators_sv, contraindications_sv, is_safety_critical)
SELECT bv.behaviour_id, 2, 'draft', bv.statement_sv, bv.statement_en,
       bv.positive_indicators_sv, bv.contraindications_sv, bv.is_safety_critical
  FROM public.scp_behaviour_versions bv
  JOIN public.scp_observable_behaviours b ON b.id = bv.behaviour_id
 WHERE b.slug = 'proportional_decision_making' AND bv.version_number = 1
ON CONFLICT (behaviour_id, version_number) DO NOTHING;

-- The map row for version 2. Version 1's row is untouched and still says
-- SCC-04, so no behaviour version has two competencies and nothing is ambiguous.
INSERT INTO public.scp_behaviour_competency_map
  (behaviour_version_id, competency_version_id, weight, is_primary)
SELECT bv.id, cv.id, 1.000, true
  FROM public.scp_observable_behaviours b
  JOIN public.scp_behaviour_versions bv ON bv.behaviour_id = b.id AND bv.version_number = 2
  JOIN public.scp_competencies c ON c.code = 'SCC-11'
  JOIN public.scp_competency_versions cv ON cv.competency_id = c.id AND cv.version_number = 1
 WHERE b.slug = 'proportional_decision_making'
ON CONFLICT (behaviour_version_id, competency_version_id) DO NOTHING;

-- Only the SG programme's own DRAFT items move. `i.slug LIKE 'sg-%'` excludes
-- every fixture by construction, and `content_status = 'draft'` is a second,
-- independent guard against touching published content -- belt and braces on
-- the exact thing that aborted the first attempt.
--
-- primary_behaviour_id and competency_id move together in ONE statement, so
-- scp_guard_item_behaviour_agrees sees a consistent NEW row: version 2 reaches
-- SCC-11, which is what the item now claims.
UPDATE public.scp_item_versions iv
   SET primary_behaviour_id = v2.id,
       competency_id        = c11.id
  FROM public.scp_observable_behaviours b
  JOIN public.scp_behaviour_versions v1 ON v1.behaviour_id = b.id AND v1.version_number = 1
  JOIN public.scp_behaviour_versions v2 ON v2.behaviour_id = b.id AND v2.version_number = 2
  CROSS JOIN public.scp_competencies c11
 WHERE b.slug = 'proportional_decision_making'
   AND c11.code = 'SCC-11'
   AND iv.primary_behaviour_id = v1.id
   AND iv.content_status = 'draft'
   -- The slug test is a correlated EXISTS rather than a join: an UPDATE ... FROM
   -- may not reference its own target inside a FROM-list JOIN condition.
   AND EXISTS (SELECT 1 FROM public.scp_items i
                WHERE i.id = iv.item_id AND i.slug LIKE 'sg-%');

-- The SG module links follow their items. The fixture module link
-- (fixture-module-documentation, published) stays on version 1.
UPDATE public.scp_module_behaviour_map mb
   SET behaviour_version_id = v2.id
  FROM public.scp_observable_behaviours b
  JOIN public.scp_behaviour_versions v1 ON v1.behaviour_id = b.id AND v1.version_number = 1
  JOIN public.scp_behaviour_versions v2 ON v2.behaviour_id = b.id AND v2.version_number = 2
 WHERE b.slug = 'proportional_decision_making'
   AND mb.behaviour_version_id = v1.id
   AND EXISTS (SELECT 1 FROM public.scp_module_versions mv
                 JOIN public.scp_modules m ON m.id = mv.module_id
                WHERE mv.id = mb.module_version_id AND m.slug LIKE 'sg-%');

-- SCC-07 joins the väktare role's competency map. SCC-04 and SCC-05 stay: they
-- are part of the role even though this instrument no longer evidences them.
INSERT INTO public.scp_role_competency_map (role_version_id, competency_version_id, criticality)
SELECT rv.id, cv.id, 'core'
  FROM public.scp_role_versions rv
  JOIN public.scp_roles r ON r.id = rv.role_id AND r.slug = 'security-guard-se'
  JOIN public.scp_competencies c ON c.code = 'SCC-07'
  JOIN public.scp_competency_versions cv ON cv.competency_id = c.id AND cv.version_number = 1
 WHERE rv.version_number = 1
ON CONFLICT (role_version_id, competency_version_id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 2 — sg-b-03 option A says what it is scored for
-- ═══════════════════════════════════════════════════════════════════════════
--
-- "bedöm om vård behöver tillkallas" rather than "bedöm vårdbehovet": the
-- item's own overgeneralisation_guard_sv states that this is not a medical
-- assessment but a question of calling for help, and the visible option now
-- says the same thing. No diagnosis is implied in either language.

UPDATE public.scp_item_option_texts t
   SET label = v.label
  FROM (VALUES
    ('sv-SE', 'Tala lugnt med personen, erbjud att hen lämnar frivilligt och bedöm om vård behöver tillkallas.'),
    ('en-GB', 'Speak calmly, offer the person a voluntary exit, and judge whether medical help needs to be called.')
  ) AS v(language, label),
       public.scp_item_options o
  JOIN public.scp_item_versions iv ON iv.id = o.item_version_id
  JOIN public.scp_items i ON i.id = iv.item_id
 WHERE t.item_option_id = o.id
   AND t.language = v.language
   AND o.option_key = 'A'
   AND i.slug = 'sg-b-03';

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 3 — Best/worst presentation order
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Target positions, chosen so the best is never first, the worst is never in
-- the same place twice, and no two items share a (best position, worst
-- position) pair:
--
--   sg-b-13:  D B A C   -> best at 3, worst at 1
--   sg-b-14:  C A B D   -> best at 2, worst at 4
--   sg-b-15:  B D C A   -> best at 4, worst at 2
--
-- UNIQUE (item_version_id, display_order) is checked per row, so the values are
-- parked out of range first and then written. A single CASE update would
-- collide with itself halfway through.

UPDATE public.scp_item_options o
   SET display_order = o.display_order + 100
  FROM public.scp_item_versions iv
  JOIN public.scp_items i ON i.id = iv.item_id
 WHERE o.item_version_id = iv.id
   AND i.slug IN ('sg-b-13','sg-b-14','sg-b-15')
   AND iv.item_format = 'sjt_best_worst';

UPDATE public.scp_item_options o
   SET display_order = v.pos
  FROM (VALUES
    ('sg-b-13','A',3), ('sg-b-13','B',2), ('sg-b-13','C',4), ('sg-b-13','D',1),
    ('sg-b-14','A',2), ('sg-b-14','B',3), ('sg-b-14','C',1), ('sg-b-14','D',4),
    ('sg-b-15','A',4), ('sg-b-15','B',1), ('sg-b-15','C',3), ('sg-b-15','D',2)
  ) AS v(slug, option_key, pos),
       public.scp_item_versions iv
  JOIN public.scp_items i ON i.id = iv.item_id
 WHERE o.item_version_id = iv.id
   AND i.slug = v.slug
   AND o.option_key = v.option_key
   AND iv.item_format = 'sjt_best_worst';

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 4 — Language scope
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE public.scp_assessment_versions av
   SET language_scope = ARRAY['sv-SE','en-GB']
  FROM public.scp_assessment_definitions d
 WHERE d.id = av.definition_id
   AND d.slug = 'sg-operational-baseline'
   AND av.version_number = 1;

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 5 — Legal governance, one coherent answer
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE public.scp_item_versions iv
   SET legal_basis_required = true,
       legal_review_status  = 'pending'
  FROM public.scp_items i
 WHERE i.id = iv.item_id
   AND i.slug IN ('sg-b-02','sg-b-04','sg-b-05','sg-b-06','sg-b-15','sg-b-18')
   AND iv.legal_review_status <> 'approved';

-- ═══════════════════════════════════════════════════════════════════════════
-- Prove it
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE _n int; _pattern int;
BEGIN
  -- Version 1 of all eight behaviours. proportional_decision_making STAYS on
  -- SCC-04 here: that is the version the published fixtures use, and leaving it
  -- alone is the entire point of the version-safe fix.
  SELECT count(*) INTO _n
    FROM (VALUES
      ('de_escalation','SCC-07'), ('factual_reporting','SCC-06'),
      ('proportional_decision_making','SCC-04'),
      ('situational_judgement','SCC-03'), ('mandate_and_escalation','SCC-09'),
      ('operational_communication','SCC-06'), ('operational_coordination','SCC-08'),
      ('integrity_and_information_handling','SCC-01')
    ) AS v(behaviour_slug, competency_code)
    JOIN public.scp_observable_behaviours b ON b.slug = v.behaviour_slug
    JOIN public.scp_behaviour_versions bv ON bv.behaviour_id = b.id AND bv.version_number = 1
    JOIN public.scp_behaviour_competency_map m ON m.behaviour_version_id = bv.id
    JOIN public.scp_competency_versions cv ON cv.id = m.competency_version_id
    JOIN public.scp_competencies c ON c.id = cv.competency_id AND c.code = v.competency_code;
  IF _n <> 8 THEN
    RAISE EXCEPTION 'SCP_SGC_MAPPINGS: expected all 8 version-1 mappings, found %', _n;
  END IF;

  -- Version 2 exists, is draft, and is the only thing reaching SCC-11 for this
  -- behaviour.
  SELECT count(*) INTO _n
    FROM public.scp_observable_behaviours b
    JOIN public.scp_behaviour_versions bv ON bv.behaviour_id = b.id AND bv.version_number = 2
    JOIN public.scp_behaviour_competency_map m ON m.behaviour_version_id = bv.id
    JOIN public.scp_competency_versions cv ON cv.id = m.competency_version_id
    JOIN public.scp_competencies c ON c.id = cv.competency_id
   WHERE b.slug = 'proportional_decision_making' AND c.code = 'SCC-11'
     AND bv.content_status = 'draft';
  IF _n <> 1 THEN
    RAISE EXCEPTION 'SCP_SGC_V2_MAPPING: expected one draft version-2 mapping to SCC-11, found %', _n;
  END IF;

  -- THE INVARIANT THE FIRST ATTEMPT VIOLATED.
  --
  -- Stated as an ABSENCE, not as a count. Hosted has six published fixture item
  -- versions on this behaviour; a clean local replay has none, because the two
  -- migrations that create those fixtures are on the replay known-failure
  -- allowlist. An exact count would be an assertion about the environment and
  -- would abort the migration in whichever environment it was not written for.
  -- What must hold in BOTH is that no published item on this behaviour moved off
  -- version 1 or off SCC-04.
  SELECT count(*) INTO _n
    FROM public.scp_item_versions iv
    JOIN public.scp_behaviour_versions bv ON bv.id = iv.primary_behaviour_id
    JOIN public.scp_observable_behaviours b ON b.id = bv.behaviour_id
    JOIN public.scp_competencies c ON c.id = iv.competency_id
   WHERE b.slug = 'proportional_decision_making'
     AND iv.content_status = 'published'
     AND (bv.version_number <> 1 OR c.code <> 'SCC-04');
  IF _n > 0 THEN
    RAISE EXCEPTION 'SCP_SGC_FIXTURE_MOVED: % published item(s) left version 1 / '
      'SCC-04; published content must not move', _n;
  END IF;

  -- Nothing published sits on the new version at all.
  IF EXISTS (
    SELECT 1 FROM public.scp_item_versions iv
      JOIN public.scp_behaviour_versions bv ON bv.id = iv.primary_behaviour_id
      JOIN public.scp_observable_behaviours b ON b.id = bv.behaviour_id
     WHERE b.slug = 'proportional_decision_making'
       AND bv.version_number = 2 AND iv.content_status <> 'draft')
  THEN
    RAISE EXCEPTION 'SCP_SGC_PUBLISHED_ON_V2: only draft SG content may use the '
      'new behaviour version';
  END IF;

  -- And no published item version anywhere claims a competency its behaviour
  -- version does not reach -- i.e. nothing published was quietly rewritten.
  IF EXISTS (
    SELECT 1 FROM public.scp_item_versions iv
     WHERE iv.content_status = 'published'
       AND iv.primary_behaviour_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.scp_behaviour_competency_map m
           JOIN public.scp_competency_versions cv ON cv.id = m.competency_version_id
          WHERE m.behaviour_version_id = iv.primary_behaviour_id
            AND cv.competency_id = iv.competency_id))
  THEN
    RAISE EXCEPTION 'SCP_SGC_PUBLISHED_GRAPH_BROKEN: a published item no longer '
      'agrees with its behaviour version';
  END IF;

  -- The three SG items the owner named resolve through version 2 to SCC-11.
  SELECT count(*) INTO _n
    FROM public.scp_item_versions iv
    JOIN public.scp_items i ON i.id = iv.item_id
    JOIN public.scp_behaviour_versions bv ON bv.id = iv.primary_behaviour_id
    JOIN public.scp_observable_behaviours b ON b.id = bv.behaviour_id
    JOIN public.scp_behaviour_competency_map m ON m.behaviour_version_id = bv.id
    JOIN public.scp_competency_versions cv ON cv.id = m.competency_version_id
    JOIN public.scp_competencies c ON c.id = cv.competency_id
   WHERE i.slug IN ('sg-b-03','sg-b-04','sg-b-13')
     AND b.slug = 'proportional_decision_making'
     AND bv.version_number = 2 AND c.code = 'SCC-11';
  IF _n <> 3 THEN
    RAISE EXCEPTION 'SCP_SGC_SG_NOT_ON_V2: expected sg-b-03/04/13 on version 2 -> '
      'SCC-11, found %', _n;
  END IF;

  -- No orphan: every behaviour version reaches exactly one competency, so there
  -- is no ambiguity and nothing unreadable.
  SELECT count(*) INTO _n FROM public.scp_behaviour_versions bv
   WHERE (SELECT count(*) FROM public.scp_behaviour_competency_map m
           WHERE m.behaviour_version_id = bv.id) <> 1;
  IF _n > 0 THEN
    RAISE EXCEPTION 'SCP_SGC_AMBIGUOUS_OR_ORPHAN: % behaviour version(s) map to '
      'other than exactly one competency', _n;
  END IF;

  -- Existing evidence is not rewritten. This migration issues no UPDATE against
  -- scp_competency_evidence at all, and the append-only guard would refuse one;
  -- what is asserted here is the observable consequence -- nothing has been
  -- moved onto the new version, so every existing row still resolves exactly
  -- where it did. Again an absence, so it holds with four evidence rows hosted
  -- or none locally.
  IF EXISTS (SELECT 1 FROM public.scp_competency_evidence e
               JOIN public.scp_behaviour_versions bv ON bv.id = e.behaviour_version_id
               JOIN public.scp_observable_behaviours b ON b.id = bv.behaviour_id
              WHERE b.slug = 'proportional_decision_making' AND bv.version_number = 2)
  THEN
    RAISE EXCEPTION 'SCP_SGC_EVIDENCE_ON_V2: no existing evidence may have been '
      'moved onto the new behaviour version';
  END IF;

  -- Nothing in this programme reaches SCC-05 any more, which is the whole point:
  -- the report can no longer print "Emotionell självreglering" over evidence
  -- while does_not_measure excludes emotional stability.
  IF EXISTS (
    SELECT 1 FROM public.scp_items i
      JOIN public.scp_item_versions iv ON iv.item_id = i.id
      JOIN public.scp_behaviour_competency_map m ON m.behaviour_version_id = iv.primary_behaviour_id
      JOIN public.scp_competency_versions cv ON cv.id = m.competency_version_id
      JOIN public.scp_competencies c ON c.id = cv.competency_id
     WHERE i.slug LIKE 'sg-b-%' AND c.code = 'SCC-05')
  THEN
    RAISE EXCEPTION 'SCP_SGC_STILL_SCC05: an SG item still reaches SCC-05';
  END IF;

  -- does_not_measure is untouched and still excludes emotional stability.
  IF NOT EXISTS (
    SELECT 1 FROM public.scp_program_versions pv
      JOIN public.scp_programs p ON p.id = pv.program_id
     WHERE p.slug = 'security-guard-operational-development'
       AND 'emotionell stabilitet' = ANY (pv.does_not_measure_sv))
  THEN
    RAISE EXCEPTION 'SCP_SGC_BOUNDARY_WEAKENED: does_not_measure no longer excludes '
      'emotional stability';
  END IF;

  -- Item and graph agree, for every item that moved.
  IF EXISTS (
    SELECT 1 FROM public.scp_item_versions iv
     WHERE iv.primary_behaviour_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.scp_behaviour_competency_map m
           JOIN public.scp_competency_versions cv ON cv.id = m.competency_version_id
          WHERE m.behaviour_version_id = iv.primary_behaviour_id
            AND cv.competency_id = iv.competency_id))
  THEN
    RAISE EXCEPTION 'SCP_SGC_ITEM_GRAPH_DISAGREE: an item claims a competency its '
      'behaviour does not reach';
  END IF;

  -- Every competency this programme now evidences has a follow-up prompt for
  -- both audiences, so no report line can dead-end.
  SELECT count(*) INTO _n
    FROM (SELECT DISTINCT cv.competency_id
            FROM public.scp_items i
            JOIN public.scp_item_versions iv ON iv.item_id = i.id
            JOIN public.scp_behaviour_competency_map m ON m.behaviour_version_id = iv.primary_behaviour_id
            JOIN public.scp_competency_versions cv ON cv.id = m.competency_version_id
           WHERE i.slug LIKE 'sg-b-%') reached
   WHERE NOT EXISTS (
     SELECT 1 FROM public.scp_followup_prompts fp
      WHERE fp.competency_id = reached.competency_id
        AND fp.audience = 'employer' AND fp.content_status = 'published')
      OR NOT EXISTS (
     SELECT 1 FROM public.scp_followup_prompts fp
      WHERE fp.competency_id = reached.competency_id
        AND fp.audience = 'participant' AND fp.content_status = 'published');
  IF _n > 0 THEN
    RAISE EXCEPTION 'SCP_SGC_PROMPT_DEAD_END: % competency/ies have no follow-up prompt', _n;
  END IF;

  -- SCC-07 is in the role map; SCC-04 and SCC-05 are still there too.
  SELECT count(*) INTO _n
    FROM public.scp_role_versions rv
    JOIN public.scp_roles r ON r.id = rv.role_id AND r.slug = 'security-guard-se'
    JOIN public.scp_role_competency_map rcm ON rcm.role_version_id = rv.id
    JOIN public.scp_competency_versions cv ON cv.id = rcm.competency_version_id
    JOIN public.scp_competencies c ON c.id = cv.competency_id
   WHERE rv.version_number = 1 AND c.code IN ('SCC-04','SCC-05','SCC-07');
  IF _n <> 3 THEN
    RAISE EXCEPTION 'SCP_SGC_ROLE_MAP: expected SCC-04, SCC-05 and SCC-07 on the role, found %', _n;
  END IF;

  -- sg-b-03 option A now names the care assessment, in both languages.
  SELECT count(*) INTO _n
    FROM public.scp_item_option_texts t
    JOIN public.scp_item_options o ON o.id = t.item_option_id
    JOIN public.scp_item_versions iv ON iv.id = o.item_version_id
    JOIN public.scp_items i ON i.id = iv.item_id
   WHERE i.slug = 'sg-b-03' AND o.option_key = 'A'
     AND (t.label ILIKE '%vård%' OR t.label ILIKE '%medical help%');
  IF _n <> 2 THEN
    RAISE EXCEPTION 'SCP_SGC_SGB03: expected the care element in both languages, found %', _n;
  END IF;

  -- And it is still not the rationale, and still leaks nothing.
  IF EXISTS (
    SELECT 1 FROM public.scp_item_option_texts t
      JOIN public.scp_item_options o ON o.id = t.item_option_id
     WHERE btrim(t.label) IN (btrim(coalesce(o.scoring_rationale_sv,'~')),
                              btrim(coalesce(o.scoring_rationale_en,'~'))))
  THEN
    RAISE EXCEPTION 'SCP_SGC_LABEL_IS_RATIONALE: a label reuses its scoring rationale';
  END IF;

  -- Best is never presented first, and no two items share a best/worst pattern.
  -- Scoped to the three items this migration reorders. The delivery fixture
  -- also contains a best/worst item, and it is internal development content
  -- that no participant is assessed on.
  SELECT count(*) INTO _n
    FROM public.scp_item_options o
    JOIN public.scp_item_versions iv ON iv.id = o.item_version_id
    JOIN public.scp_items i ON i.id = iv.item_id
   WHERE i.slug IN ('sg-b-13','sg-b-14','sg-b-15')
     AND o.is_best_key AND o.display_order = 1;
  IF _n > 0 THEN
    RAISE EXCEPTION 'SCP_SGC_BEST_FIRST: % best option(s) are still shown first', _n;
  END IF;

  SELECT count(DISTINCT pattern) INTO _pattern
    FROM (
      SELECT o.item_version_id,
             max(o.display_order) FILTER (WHERE o.is_best_key) * 10
           + max(o.display_order) FILTER (WHERE o.is_worst_key) AS pattern
        FROM public.scp_item_options o
        JOIN public.scp_item_versions iv ON iv.id = o.item_version_id
        JOIN public.scp_items i ON i.id = iv.item_id
       WHERE i.slug IN ('sg-b-13','sg-b-14','sg-b-15')
       GROUP BY o.item_version_id) p;
  IF _pattern <> 3 THEN
    RAISE EXCEPTION 'SCP_SGC_SHARED_PATTERN: the three best/worst items show % distinct '
      'presentation pattern(s), expected 3', _pattern;
  END IF;

  -- The keys themselves did not move.
  IF EXISTS (
    SELECT 1 FROM public.scp_item_versions iv
      JOIN public.scp_items i ON i.id = iv.item_id
     WHERE i.slug IN ('sg-b-13','sg-b-14','sg-b-15')
       AND ((SELECT count(*) FROM public.scp_item_options o
              WHERE o.item_version_id = iv.id) <> 4
         OR (SELECT count(*) FROM public.scp_item_options o
              WHERE o.item_version_id = iv.id AND o.is_best_key) <> 1
         OR (SELECT count(*) FROM public.scp_item_options o
              WHERE o.item_version_id = iv.id AND o.is_worst_key) <> 1
         OR (SELECT count(DISTINCT o.display_order) FROM public.scp_item_options o
              WHERE o.item_version_id = iv.id) <> 4))
  THEN
    RAISE EXCEPTION 'SCP_SGC_KEYS_MOVED: a best/worst item lost its key shape';
  END IF;

  -- Every option still carries exactly one label per language.
  SELECT count(*) INTO _n
    FROM public.scp_item_options o
    JOIN public.scp_item_versions iv ON iv.id = o.item_version_id
    JOIN public.scp_items i ON i.id = iv.item_id
   WHERE i.slug LIKE 'sg-b-%'
     AND ((SELECT count(*) FROM public.scp_item_option_texts t
            WHERE t.item_option_id = o.id AND t.language = 'sv-SE') <> 1
       OR (SELECT count(*) FROM public.scp_item_option_texts t
            WHERE t.item_option_id = o.id AND t.language = 'en-GB') <> 1);
  IF _n > 0 THEN
    RAISE EXCEPTION 'SCP_SGC_LABEL_PARITY: % option(s) lost SV/EN parity', _n;
  END IF;

  -- Language scope declares both, and the adaptation gate is untouched.
  IF NOT EXISTS (
    SELECT 1 FROM public.scp_assessment_versions av
      JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
     WHERE d.slug = 'sg-operational-baseline' AND av.version_number = 1
       AND av.language_scope @> ARRAY['sv-SE','en-GB']
       AND array_length(av.language_scope, 1) = 2)
  THEN
    RAISE EXCEPTION 'SCP_SGC_LANGUAGE_SCOPE: the version does not declare sv-SE and en-GB';
  END IF;

  SELECT count(*) INTO _n
    FROM public.scp_item_texts t
    JOIN public.scp_item_versions iv ON iv.id = t.item_version_id
    JOIN public.scp_items i ON i.id = iv.item_id
   WHERE i.slug LIKE 'sg-b-%' AND t.adaptation_status <> 'adaptation_pending';
  IF _n > 0 THEN
    RAISE EXCEPTION 'SCP_SGC_ADAPTATION_CLEARED: % text(s) left adaptation_pending', _n;
  END IF;

  -- The six legal subjects agree across both registers, and none is approved.
  SELECT count(*) INTO _n
    FROM public.scp_items i
    JOIN public.scp_item_versions iv ON iv.item_id = i.id
   WHERE i.slug IN ('sg-b-02','sg-b-04','sg-b-05','sg-b-06','sg-b-15','sg-b-18')
     AND iv.legal_basis_required AND iv.legal_review_status = 'pending';
  IF _n <> 6 THEN
    RAISE EXCEPTION 'SCP_SGC_LEGAL_PENDING: expected 6 items legally pending, found %', _n;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.scp_review_requirements rr
      JOIN public.scp_item_versions iv ON iv.id = rr.item_version_id
      JOIN public.scp_items i ON i.id = iv.item_id
     WHERE i.slug LIKE 'sg-b-%' AND rr.review_type = 'swedish_legal'
       AND iv.legal_review_status = 'not_required')
  THEN
    RAISE EXCEPTION 'SCP_SGC_LEGAL_DISAGREE: the register and the item column still disagree';
  END IF;

  -- NOTHING was approved. Not one gate, on any item, in this programme.
  SELECT count(*) INTO _n
    FROM public.scp_item_versions iv
    JOIN public.scp_items i ON i.id = iv.item_id
   WHERE i.slug LIKE 'sg-b-%'
     AND (iv.sme_review_status = 'approved' OR iv.bias_review_status = 'approved'
       OR iv.cognitive_review_status = 'passed' OR iv.language_review_status = 'passed'
       OR iv.accessibility_review_status = 'passed'
       OR iv.legal_review_status = 'approved');
  IF _n > 0 THEN
    RAISE EXCEPTION 'SCP_SGC_GATE_APPROVED: % item(s) had a review gate cleared', _n;
  END IF;

  SELECT count(*) INTO _n FROM public.scp_review_requirements WHERE status <> 'outstanding';
  IF _n > 0 THEN
    RAISE EXCEPTION 'SCP_SGC_REQUIREMENT_CLEARED: % review requirement(s) cleared', _n;
  END IF;

  -- Still draft, still ungranted, still no external provider.
  IF EXISTS (SELECT 1 FROM public.scp_item_versions iv JOIN public.scp_items i ON i.id = iv.item_id
              WHERE i.slug LIKE 'sg-b-%' AND (iv.content_status <> 'draft'
                                           OR iv.validation_status <> 'design'))
     OR EXISTS (SELECT 1 FROM public.scp_test_grants
                 WHERE purpose = 'closed_test' AND revoked_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.scp_ai_providers
                 WHERE is_enabled AND code <> 'null_provider')
  THEN
    RAISE EXCEPTION 'SCP_SGC_BOUNDARY_BREACHED';
  END IF;
END $$;

INSERT INTO public.scp_content_events (subject_type, subject_ref, action, reason, metadata)
VALUES (
  'assessment_version', 'scp-sg-v1-content-governance-corrections', 'updated',
  'Security Guard v1 corrections, applied before any pilot evidence exists. Three behaviours were attached to the wrong SCC construct and were moved without editing the canon: de_escalation to SCC-07 (the items assess treatment of another person, not the guard''s own impulse control, and the old mapping contradicted the programme''s own does_not_measure statement about emotional stability), factual_reporting to SCC-06 (whose definition is the behaviour statement verbatim), and proportional_decision_making onto a NEW behaviour version 2 mapped to SCC-11 (which is named for proportionality, where SCC-04 is about time pressure the scenarios do not contain). That last one could not be remapped in place: version 1 is shared with six PUBLISHED fixture item versions and scp_guard_published_immutable correctly refused the first attempt, aborting the whole migration. Version 1 and its four evidence rows are left exactly as they were on SCC-04; only the SG programme''s own draft items and module links move to version 2. SCC-04 and SCC-05 are consequently not evidenced by this instrument, which is accepted; both remain on the role and SCC-07 joins it. sg-b-03 option A now names the care assessment its rationale already rewarded. The three best/worst items no longer share one BEST-first/WORST-last presentation. language_scope declares the two languages actually delivered, with adaptation_status untouched. All six legally sensitive items are consistently marked legal review required and pending. No review gate was cleared and no legal conclusion recorded.',
  jsonb_build_object(
    'migration', '20260823100000_scp_sg_v1_content_governance_corrections',
    'behaviour_remaps', jsonb_build_object(
      'de_escalation', 'v1 remapped SCC-05->SCC-07',
      'factual_reporting', 'v1 remapped SCC-11->SCC-06',
      'proportional_decision_making',
        'v1 unchanged on SCC-04 for six published fixture items; new v2 -> SCC-11 '
        'carries the SG programme''s draft items and module links'),
    'published_content_modified', false,
    'evidence_rows_modified', 0,
    'gates_cleared', 0,
    'legal_review_pending_items', 6,
    'content_status', 'draft',
    'closed_test_granted', false));
