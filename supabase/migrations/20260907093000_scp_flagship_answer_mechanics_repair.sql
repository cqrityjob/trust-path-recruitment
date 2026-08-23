-- Flagship answer-mechanics repair.
--
-- ── WHAT THE AUDIT FOUND ────────────────────────────────────────────────────
--
-- Across the 22 keyed scenario items of security-officer-recruitment:
--
--     the preferred option was key "a"          22 / 22
--     the preferred option was displayed first  22 / 22
--     the preferred option was the longest      22 / 22
--
-- A candidate who read nothing and always picked the first option scored full
-- marks on every scenario item on the form. That is not a content nuance; it
-- is the assessment not measuring anything.
--
-- ── WHAT THIS MIGRATION DOES, AND DOES NOT, CHANGE ──────────────────────────
--
-- The audit's other finding was that the SCENARIOS ARE GOOD. They are ordinary
-- Swedish guarding work, they turn on judgement rather than on remembering a
-- statute, and they were worth keeping. So:
--
--   NOT CHANGED  every scenario stem and every prompt, in both languages.
--                All 22 are byte-identical to what 20260830094000 authored.
--                Nothing in this file touches scp_item_texts for them.
--
--   CHANGED      the option mechanics. Each item gains a fourth response
--                strategy scoring 2 -- the credible second-best that the
--                original 3/1/0 key had no room for -- and all four options
--                are rewritten for length balance, re-keyed and re-ordered.
--
--   ADDED        six new observed items: three primarily SCC-07 and three
--                primarily SCC-04, the two competencies the audit found below
--                the evidence threshold at two observed items each.
--
-- ── THE NEW MECHANICS ───────────────────────────────────────────────────────
--
-- Across the 28 scenario items after this migration:
--
--     preferred key            a=7  b=7  c=7  d=7
--     preferred position       1=7  2=7  3=7  4=7
--     preferred strictly longest  4 / 28 sv, 7 / 28 en  (chance is 7)
--     mean preferred length-rank  2.57 sv, 2.23 en      (2.50 = no signal)
--
-- Both figures are the ones scp_form_option_length_report computes, so the
-- claim here and the gate's own measurement cannot drift apart.
--
-- Key and position are assigned from a cyclic schedule, so neither predicts
-- the other: no cell of the 4x4 grid holds more than two items. And from
-- 20260907090000 the displayed order is a per-attempt permutation anyway, so
-- the authored position is now only the fallback for items that are not
-- randomised.
--
-- ── SCORING ─────────────────────────────────────────────────────────────────
--
--   3  the strongest professional response
--   2  reasonable but incomplete, or second-best
--   1  materially weaker judgement
--   0  clearly poor judgement
--
-- No option is absurd. Every one of the 84 distractors is something a real,
-- imperfect security officer might choose under time pressure, which is what
-- makes the choice informative. Each carries the distractor_error_type that
-- names its actual weakness.
--
-- ── WHAT IS STILL TRUE AFTERWARDS ───────────────────────────────────────────
--
-- Every item remains content_status = draft, validation_status = design,
-- authored_by_ai = true, sme_reviewer_count = 0, and all five review
-- requirements outstanding. This migration is not a review and does not claim
-- to be one. Nothing here produces a pass, a fail, a ranking or a suitability
-- statement, and nothing here changes what the assessment is allowed to say.
--
-- Reversible in the sense that matters: docs/audits/assessment-foundation-p0-before.json
-- carries the complete previous content, keyed by slug and option key.

-- ═══════════════════════════════════════════════════════════════════════════
-- 0. Safety: what is about to change, and proof it is disposable
-- ════════════════════════════════════════════════════════════════════════════
--
-- NOTHING IS DELETED HERE, and the platform is right to make that difficult.
--
-- The first draft of this migration replaced each item's options outright.
-- That works on a clean replay, where no attempt exists, and is refused
-- everywhere else -- correctly, by three separate guards:
--
--   scp_guard_evidence_append_only        evidence is never deleted
--   scp_guard_review_immutable_once_done  a review is never deleted
--   scp_guard_snapshot_immutable          an issued report is never deleted
--
-- and a response cannot be deleted while a review points at it, nor an option
-- while a response points at it. So the options are UPDATED in place instead
-- (section 1), which keeps every row identity a stored response depends on.
--
-- What that leaves is an honesty problem rather than a referential one: an
-- internal test response now points at an option whose wording and score have
-- changed, so the evidence computed from it was calculated under a scoring
-- model that no longer exists. Deleting it is not allowed and would be the
-- wrong instinct anyway -- an evidence ledger records what happened. It is
-- RETIRED instead, by setting valid_until, which scp_compute_maturity already
-- honours: expired evidence stops counting towards anybody's maturity while
-- remaining on the record.
--
-- On a clean replay this section touches nothing at all: the canonical
-- migration history creates no attempts.

DO $$
DECLARE
  _ver uuid; _form uuid; _real int; _attempts int; _responses int; _evidence int;
BEGIN
  SELECT av.id INTO _ver
    FROM public.scp_assessment_versions av
    JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
   WHERE d.slug = 'security-officer-recruitment' AND av.version_number = 1;
  SELECT id INTO _form FROM public.scp_forms
   WHERE slug = 'security-officer-recruitment-form-a';

  IF _ver IS NULL OR _form IS NULL THEN
    RAISE EXCEPTION 'SCP_FLAGSHIP_MISSING: security-officer-recruitment is not present.';
  END IF;

  -- The lifecycle rule from 20260907091000, asked directly.
  IF public.scp_version_has_operational_evidence(_ver) THEN
    RAISE EXCEPTION
      'SCP_FLAGSHIP_HAS_REAL_EVIDENCE: this assessment version has produced '
      'pilot or operational evidence and its content is frozen. This repair '
      'must be applied as a NEW assessment version, not in place.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Belt and braces: name anything that is not plainly internal.
  SELECT count(*) INTO _real
    FROM public.scp_attempts a
   WHERE a.form_id = _form
     AND (a.governance_mode IS NULL
       OR a.governance_mode NOT IN ('development', 'closed_test'));
  IF _real > 0 THEN
    RAISE EXCEPTION
      'SCP_FLAGSHIP_NON_INTERNAL_ATTEMPTS: % attempt(s) against this form are '
      'not development or closed_test. Nothing has been changed.', _real
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO _attempts  FROM public.scp_attempts WHERE form_id = _form;
  SELECT count(*) INTO _responses FROM public.scp_candidate_responses r
    JOIN public.scp_attempts a ON a.id = r.attempt_id WHERE a.form_id = _form;
  SELECT count(*) INTO _evidence  FROM public.scp_competency_evidence
   WHERE context_type = 'assessment_form' AND context_ref = _form
     AND superseded_by IS NULL AND valid_until IS NULL;

  RAISE NOTICE 'flagship repair: % internal attempt(s) and % response(s) remain on '
               'the record; % evidence row(s) retired as scored under the old key',
    _attempts, _responses, _evidence;

  -- Retire, do not delete. valid_until is one of the few columns the
  -- append-only guard permits changing, and it is exactly the mechanism for
  -- "this observation no longer counts".
  UPDATE public.scp_competency_evidence
     SET valid_until = now()
   WHERE context_type = 'assessment_form' AND context_ref = _form
     AND superseded_by IS NULL
     AND valid_until IS NULL;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Authoring helpers
-- ═══════════════════════════════════════════════════════════════════════════
--
-- pg_temp, so they exist only for this migration and cannot become an
-- unversioned authoring API -- the same rule 20260830094000 followed.

CREATE OR REPLACE FUNCTION pg_temp.repair_options(_slug text, _opts jsonb)
RETURNS void
LANGUAGE plpgsql AS $fn$
DECLARE
  _iv uuid; _o jsonb; _existing uuid[]; _id uuid; _n int := 0;
BEGIN
  SELECT iv.id INTO _iv
    FROM public.scp_item_versions iv
    JOIN public.scp_items i ON i.id = iv.item_id
   WHERE i.slug = _slug;
  IF _iv IS NULL THEN
    RAISE EXCEPTION 'SCP_REPAIR_ITEM_MISSING: no item version for %', _slug;
  END IF;

  -- Rows are REUSED, never replaced. A stored response points at an option by
  -- id, and scp_candidate_responses.selected_option_id is ON DELETE RESTRICT,
  -- so deleting an option is refused the moment anyone has answered the item.
  -- Updating in place keeps every one of those references valid; the evidence
  -- computed under the old scoring is retired in section 0.
  SELECT array_agg(o.id ORDER BY o.display_order) INTO _existing
    FROM public.scp_item_options o WHERE o.item_version_id = _iv;

  -- Park the key and the order out of range first. Both carry a UNIQUE
  -- constraint per item version, and the rewrite permutes them, so a
  -- single-pass update would collide with rows it had not moved yet.
  UPDATE public.scp_item_options
     SET option_key = 'tmp' || option_key, display_order = display_order + 100
   WHERE item_version_id = _iv;

  FOR _o IN SELECT * FROM jsonb_array_elements(_opts) LOOP
    _n := _n + 1;

    IF _existing IS NOT NULL AND _n <= coalesce(array_length(_existing, 1), 0) THEN
      _id := _existing[_n];
      UPDATE public.scp_item_options
         SET option_key            = _o->>'k',
             display_order         = (_o->>'ord')::int,
             score_value           = (_o->>'score')::int,
             scoring_rationale_sv  = _o->>'rat_sv',
             is_preferred          = (_o->>'pref')::boolean,
             distractor_error_type = nullif(_o->>'err', '')
       WHERE id = _id;
    ELSE
      INSERT INTO public.scp_item_options
        (item_version_id, option_key, display_order, score_value,
         scoring_rationale_sv, is_preferred, distractor_error_type)
      VALUES (_iv, _o->>'k', (_o->>'ord')::int, (_o->>'score')::int,
              _o->>'rat_sv', (_o->>'pref')::boolean, nullif(_o->>'err', ''))
      RETURNING id INTO _id;
    END IF;

    INSERT INTO public.scp_item_option_texts (item_option_id, language, label)
    SELECT _id, l.lang, l.label FROM
      (VALUES ('sv-SE', _o->>'sv'), ('en-GB', _o->>'en')) AS l(lang, label)
    ON CONFLICT (item_option_id, language) DO UPDATE SET label = EXCLUDED.label;
  END LOOP;

  -- An authored set smaller than what is already there would leave parked rows
  -- behind, which would be invisible and wrong. There is no such item, and if
  -- one ever appears this says so rather than silently corrupting the form.
  IF EXISTS (SELECT 1 FROM public.scp_item_options
              WHERE item_version_id = _iv AND option_key LIKE 'tmp%') THEN
    RAISE EXCEPTION
      'SCP_REPAIR_ORPHANED_OPTIONS: % has more existing options than the repair '
      'authors, and an option cannot be deleted once it has been answered.', _slug
      USING ERRCODE = 'check_violation';
  END IF;
END $fn$;

CREATE OR REPLACE FUNCTION pg_temp.author_scenario(
  _form uuid, _order int, _block text, _slug text,
  _behaviour uuid, _competency uuid, _facet uuid,
  _difficulty text, _demand text, _construct text, _tests_what text,
  _safety boolean, _observable text, _context_sv text, _guard_sv text,
  _scenario_sv text, _prompt_sv text, _scenario_en text, _prompt_en text,
  _opts jsonb
) RETURNS uuid
LANGUAGE plpgsql AS $fn$
DECLARE _item uuid; _iv uuid; _jur uuid;
BEGIN
  SELECT id INTO _jur FROM public.scp_jurisdictions WHERE code = 'SE';

  INSERT INTO public.scp_items (slug) VALUES (_slug)
  ON CONFLICT (slug) DO UPDATE SET slug = EXCLUDED.slug
  RETURNING id INTO _item;

  IF EXISTS (SELECT 1 FROM public.scp_item_versions WHERE item_id = _item) THEN
    SELECT id INTO _iv FROM public.scp_item_versions WHERE item_id = _item LIMIT 1;
    RETURN _iv;
  END IF;

  INSERT INTO public.scp_item_versions
    (item_id, version_number, content_status, validation_status, item_format,
     competency_id, facet_id, primary_behaviour_id, mode, observable_behavior,
     response_process, legal_basis_required, jurisdiction_id, difficulty,
     cognitive_demand, primary_construct, tests_what, is_safety_critical,
     requires_human_review, work_context_sv, overgeneralisation_guard_sv,
     evidence_source_type, authored_by_ai,
     cognitive_review_status, language_review_status, accessibility_review_status,
     bias_review_status, sme_review_status)
  VALUES
    (_item, 1, 'draft', 'design', 'sjt_best_response', _competency, _facet,
     _behaviour, 'assessment', _observable,
     'Situationsbedömning: deltagaren väljer handling utifrån det som faktiskt går att observera i scenariot.',
     false, _jur, _difficulty, _demand, _construct, _tests_what, _safety,
     false, _context_sv, _guard_sv, 'assessment_response', true,
     'pending','pending','pending','pending','pending')
  RETURNING id INTO _iv;

  INSERT INTO public.scp_item_texts
    (item_version_id, language, adaptation_status, scenario, prompt)
  VALUES (_iv, 'sv-SE', 'adaptation_pending', _scenario_sv, _prompt_sv),
         (_iv, 'en-GB', 'adaptation_pending', _scenario_en, _prompt_en);

  INSERT INTO public.scp_review_requirements (item_version_id, review_type, required, reason, status)
  VALUES
    (_iv,'security_sme',        true,'Operativ riktighet i svensk bevakningskontext.','outstanding'),
    (_iv,'cognitive_interview', true,'Att deltagare tolkar scenariot som avsett.','outstanding'),
    (_iv,'language',            true,'Språklig likvärdighet mellan sv-SE och en-GB.','outstanding'),
    (_iv,'accessibility',       true,'Läsbarhet och kognitiv belastning.','outstanding'),
    (_iv,'pilot',               true,'Empiriska svarsmönster före operativ användning.','outstanding');

  INSERT INTO public.scp_form_items (form_id, item_version_id, block_key, display_order, randomise_options)
  VALUES (_form, _iv, _block, _order, true);

  -- A brand-new item has no options yet, so repair_options inserts all four.
  PERFORM pg_temp.repair_options(_slug, _opts);
  RETURN _iv;
END $fn$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Repair the twenty-two existing scenario items
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Stems untouched. Options replaced. The BEFORE -> AFTER diff for every one of
-- these is in docs/audits/assessment-foundation-p0-item-diff.md.

DO $$
BEGIN
  PERFORM pg_temp.repair_options('so-rj-a01',
    '[{"k": "a", "ord": 1, "score": 3, "pref": true, "err": "", "sv": "Registrera besöket, ring mötesvärden direkt och säg till personen att det tar ett par minuter.", "en": "Register the visit, call the host straight away, and tell the person it will take a couple of minutes.", "rat_sv": "Följer instruktionen men löser personens problem parallellt. Minst ingripande åtgärd som ändå håller kontrollen."}, {"k": "d", "ord": 2, "score": 0, "pref": false, "err": "poor_proportionality", "sv": "Be personen lämna entrén och boka om mötet en annan dag, eftersom hen inte är anmäld i förväg.", "en": "Ask the person to leave the entrance and rebook the meeting another day, since they were not registered in advance.", "rat_sv": "Att avvisa någon med ett legitimt ärende utan att pröva den enkla vägen är oproportionerligt och skadar uppdragsgivaren."}, {"k": "c", "ord": 3, "score": 1, "pref": false, "err": "excessive_informal_trust", "sv": "Släpp in personen eftersom möteskallelsen styrker ärendet, och notera tid och namn i besöksloggen.", "en": "Let the person through since the invitation supports their errand, and note the time and name in the visitor log.", "rat_sv": "Mejlet visar en kallelse, inte att personen är den som kallats. Behörigheten är fortfarande okontrollerad."}, {"k": "b", "ord": 4, "score": 2, "pref": false, "err": "weak_communication", "sv": "Hänvisa personen till receptionsdisken för anmälan och fortsätt bemanna spärren under rusningen.", "en": "Direct the person to the reception desk to register, and stay on the barrier through the rush.", "rat_sv": "Rätt väg genom instruktionen, men personen lämnas ensam med en tidsbrist som kontrollen själv skapade."}]'::jsonb);
  PERFORM pg_temp.repair_options('so-rj-a02',
    '[{"k": "d", "ord": 1, "score": 0, "pref": false, "err": "premature_escalation", "sv": "Säg till personen att sänka rösten omedelbart, annars får hen lämna köpcentrumet på en gång.", "en": "Tell the person to lower their voice immediately, or they will have to leave the centre right away.", "rat_sv": "Avvisning som första åtgärd mot en arg men laglydig kund är oproportionerligt och gör konflikten större."}, {"k": "b", "ord": 2, "score": 3, "pref": true, "err": "", "sv": "Lyssna färdigt, gå några steg åt sidan från kön och säg vad du kan göra och vad som är butikens beslut.", "en": "Hear them out, step aside from the queue, and say what you can do and what is the shop’s decision.", "rat_sv": "Lyssnar färdigt, flyttar samtalet från publiken, och är tydlig med gränsen utan att avfärda personen."}, {"k": "c", "ord": 3, "score": 1, "pref": false, "err": "outside_mandate", "sv": "Gå in i butiken och be personalen göra ett undantag den här gången så att det löser sig.", "en": "Go into the shop and ask the staff to make an exception this once so the matter is settled.", "rat_sv": "Löser stunden men tar över butikens beslut, vilket varken uppdraget eller butiken har bett om."}, {"k": "a", "ord": 4, "score": 2, "pref": false, "err": "weak_communication", "sv": "Följ med personen till centrumledningens kontor och lämna över ärendet till den som kan besluta.", "en": "Walk the person to the centre management office and hand the matter to somebody who can decide.", "rat_sv": "Rätt adress, och personen lämnas inte ensam — men ärendet lämnas över innan någon har lyssnat färdigt."}]'::jsonb);
  PERFORM pg_temp.repair_options('so-rj-a03',
    '[{"k": "d", "ord": 1, "score": 0, "pref": false, "err": "delayed_escalation", "sv": "Be den anställde fråga personen vad hen gör där, medan du själv åker vidare till dörrlarmet.", "en": "Ask the employee to question the person themselves, while you go on to the door alarm.", "rat_sv": "Lägger uppgiften på fel person och lämnar båda händelserna utan väktare på plats."}, {"k": "b", "ord": 2, "score": 1, "pref": false, "err": "tunnel_vision", "sv": "Åk till dörrlarmet först eftersom det är ett bekräftat larm, och ta personalutrymmet direkt efteråt när du är klar där.", "en": "Go to the door alarm first since it is a confirmed alarm, and take the staff area straight afterwards when you are done there.", "rat_sv": "Larmet är det tydligaste men inte det mest tidskritiska. En okänd person bland anställda hinner försvinna."}, {"k": "c", "ord": 3, "score": 3, "pref": true, "err": "", "sv": "Åk till personalutrymmet först, be den anställde stanna på telefon och meddela larmcentralen om larmet.", "en": "Go to the staff area first, keep the employee on the phone, and tell the alarm centre about the alarm.", "rat_sv": "Går till människorna först, håller kvar den andra händelsen genom observation, och lämnar inget obevakat i tysthet."}, {"k": "a", "ord": 4, "score": 2, "pref": false, "err": "insufficient_information", "sv": "Ring larmcentralen och be om en andra enhet till dörrlarmet medan du själv åker till personalutrymmet.", "en": "Call the alarm centre and ask for a second unit for the door alarm while you go to the staff area yourself.", "rat_sv": "Rätt prioritering och rätt begäran, men bygger på att en andra enhet finns — vilket ingen har sagt att den gör."}]'::jsonb);
  PERFORM pg_temp.repair_options('so-rj-a04',
    '[{"k": "c", "ord": 1, "score": 0, "pref": false, "err": "unsupported_assumption", "sv": "Larma polis om misstänkt rekognosering inför ett inbrott, och håll personen under uppsikt tills de kommer.", "en": "Call the police about suspected reconnaissance ahead of a burglary, and keep the person in sight until they arrive.", "rat_sv": "Att behandla fotograferingen som rekognosering är en slutsats som inte går att dra av det som syns."}, {"k": "b", "ord": 2, "score": 1, "pref": false, "err": "insufficient_information", "sv": "Notera tid, signalement och vad personen gör i loggen, och fortsätt ronden som planerat.", "en": "Note the time, a description and what the person is doing in the log, and continue the round as planned.", "rat_sv": "Att bara notera lämnar frågan obesvarad medan personen fortsätter, och en notering utan kontroll hjälper ingen."}, {"k": "a", "ord": 3, "score": 2, "pref": false, "err": "delayed_escalation", "sv": "Ring terminalansvarig och fråga om entreprenörslistan för veckan innan du går fram och talar med personen på kajen.", "en": "Call the terminal supervisor about this week’s contractor list before you approach and speak to the person on the bay.", "rat_sv": "Kontrollerar mot rätt källa, men personen hinner avsluta och gå medan kontrollen görs på avstånd."}, {"k": "d", "ord": 4, "score": 3, "pref": true, "err": "", "sv": "Presentera dig och fråga vad fotograferingen gäller och vem hen arbetar för — och stäm av med terminalansvarig.", "en": "Introduce yourself and ask what the photography is for and who they work for — then check with the terminal supervisor.", "rat_sv": "Frågar om det som faktiskt avviker, utan att förutsätta ett motiv, och kontrollerar mot den som vet."}]'::jsonb);
  PERFORM pg_temp.repair_options('so-rj-a05',
    '[{"k": "d", "ord": 1, "score": 0, "pref": false, "err": "outside_mandate", "sv": "Kvittera de två punkterna i eget namn så att loggen i alla fall stämmer med verkligheten.", "en": "Sign the two points off in your own name so the log at least matches reality.", "rat_sv": "Att kvittera i kollegans ställe gör dig till en del av avsteget och gör spåret sämre, inte bättre."}, {"k": "a", "ord": 2, "score": 3, "pref": true, "err": "", "sv": "Säg till kollegan att du går punkterna, gör det, och ta upp med arbetsledaren att loggen inte stämmer.", "en": "Tell your colleague you will visit those points, do it, and tell the supervisor the log does not match.", "rat_sv": "Tar upp det med den det gäller, går själv punkterna, och för vidare avsteget som ett rutinfel — inte som en anmälan."}, {"k": "c", "ord": 3, "score": 1, "pref": false, "err": "failure_to_document", "sv": "Gå punkterna själv och låt saken bero den här natten, eftersom du inte är kollegans arbetsledare.", "en": "Visit the points yourself and let it rest for tonight, since you are not your colleague’s supervisor.", "rat_sv": "Att bara göra rätt själv låter en felaktig kvittering ligga kvar i systemet, vilket är den egentliga risken."}, {"k": "b", "ord": 4, "score": 2, "pref": false, "err": "delayed_escalation", "sv": "Gå punkterna själv och be kollegan sluta kvittera det ni inte gjort, utan att ta det vidare den här gången.", "en": "Visit the points yourself and ask your colleague to stop signing off what you have not done, without taking it further this time.", "rat_sv": "Rätt samtal med rätt person, men ett systematiskt avsteg som stannar mellan två väktare rättas sällan."}]'::jsonb);
  PERFORM pg_temp.repair_options('so-rj-a06',
    '[{"k": "d", "ord": 1, "score": 0, "pref": false, "err": "excessive_informal_trust", "sv": "Ta bort noteringen eftersom platschefen är ansvarig på plats, säger att felet redan är åtgärdat och tar ansvaret.", "en": "Remove the entry, since the site manager is responsible on site, says the fault is already dealt with, and takes responsibility.", "rat_sv": "Att ta bort noteringen på muntligt ansvarsövertagande gör spåret oanvändbart och flyttar ansvaret till fel person."}, {"k": "c", "ord": 2, "score": 1, "pref": false, "err": "failure_to_document", "sv": "Säg nej till platschefen och lämna det därhän, eftersom du ändå inte tänker göra det hen ber om.", "en": "Say no to the site manager and leave it there, since you are not going to do what they ask anyway.", "rat_sv": "Rätt svar till platschefen, men en begäran om att ändra en logg är i sig något arbetsledningen behöver veta."}, {"k": "b", "ord": 3, "score": 3, "pref": true, "err": "", "sv": "Säg att loggen inte kan ändras i efterhand, erbjud platschefen att lägga till en egen kommentar, och rapportera begäran.", "en": "Say the log cannot be changed after the fact, offer the site manager their own comment, and report the request onward.", "rat_sv": "Vägrar sakligt, förklarar varför, och tar begäran vidare till den som är ens uppdragsgivare i bevakningsledet."}, {"k": "a", "ord": 4, "score": 2, "pref": false, "err": "delayed_escalation", "sv": "Säg nej och föreslå att platschefen själv tar upp noteringen med din arbetsledare om den skapar problem.", "en": "Say no and suggest the site manager raise the entry with your supervisor themselves if it causes problems.", "rat_sv": "Rätt svar och rätt väg utpekad, men den som fick begäran är den som behöver rapportera att den gjordes."}]'::jsonb);
  PERFORM pg_temp.repair_options('so-rj-a07',
    '[{"k": "d", "ord": 1, "score": 0, "pref": false, "err": "unsupported_assumption", "sv": "Utgå från att det är ett tekniskt fel eftersom dörren är stängd och inget syns, och avsluta ärendet med en notering i loggen.", "en": "Assume it is a technical fault since the door is closed and nothing is visible, and close the job off with a note in the log.", "rat_sv": "Släckt belysning och olåst dörr är två avvikelser samtidigt, vilket är precis det som inte ska avfärdas."}, {"k": "b", "ord": 2, "score": 1, "pref": false, "err": "tunnel_vision", "sv": "Gå in genom ytterdörren och kontrollera trapphuset våning för våning med ficklampa tills du hittar sektionen.", "en": "Go in through the main door and check the stairwell floor by floor with a torch until you find the section.", "rat_sv": "Inte orimligt, men utan sektion, utan ljus och utan att någon vet var du är ger du bort dina egna marginaler."}, {"k": "a", "ord": 3, "score": 2, "pref": false, "err": "insufficient_information", "sv": "Begär sektionsuppgift av larmcentralen och vänta vid ytterdörren tills du har fått den innan du går in.", "en": "Ask the alarm centre for the section and wait at the main door until you have it before going in.", "rat_sv": "Rätt att inte gå in oinformerad, men att stå still vid dörren ger ingen bild av baksidan under tiden."}, {"k": "c", "ord": 4, "score": 3, "pref": true, "err": "", "sv": "Gå ett varv runt fastigheten, meddela larmcentralen vad du ser och begär vilken sektion det gäller innan du går in.", "en": "Walk the perimeter, tell the alarm centre what you can see, and ask which section triggered before going in.", "rat_sv": "Bygger en egen bild utifrån, delar den, och går inte in i en okänd situation utan att någon vet var man är."}]'::jsonb);
  PERFORM pg_temp.repair_options('so-rj-a08',
    '[{"k": "d", "ord": 1, "score": 3, "pref": true, "err": "", "sv": "Stanna hos personen, larma ambulans, håll andra borta från området och lämna pallen där den ligger.", "en": "Stay with the person, call an ambulance, keep others out of the area, and leave the pallet where it is.", "rat_sv": "Person först, plats säkrad, hjälp larmad, och underlaget för utredningen bevarat — i den ordningen."}, {"k": "c", "ord": 2, "score": 0, "pref": false, "err": "delayed_escalation", "sv": "Leta upp närmaste arbetsledare så att företaget själv får avgöra om ambulans behöver larmas.", "en": "Find the nearest supervisor so the company can decide for itself whether an ambulance is needed.", "rat_sv": "Att söka efter en chef innan hjälp larmas fördröjer det enda som faktiskt är tidskritiskt."}, {"k": "b", "ord": 3, "score": 1, "pref": false, "err": "poor_proportionality", "sv": "Hjälp personen upp och in till ett kontor där hen kan sitta ner medan du ringer efter hjälp.", "en": "Help the person up and into an office where they can sit down while you call for help.", "rat_sv": "Att flytta någon som inte kan stödja på benet kan förvärra en skada, och gör platsen svårare att utreda."}, {"k": "a", "ord": 4, "score": 2, "pref": false, "err": "failure_to_document", "sv": "Stanna hos personen och larma ambulans, och flytta undan pallen så att bårvägen in blir fri.", "en": "Stay with the person and call an ambulance, and move the pallet aside so the stretcher route is clear.", "rat_sv": "Rätt i det tidskritiska, men pallen flyttas innan någon dokumenterat hur den låg, och det går inte att återskapa."}]'::jsonb);
  PERFORM pg_temp.repair_options('so-rj-a09',
    '[{"k": "d", "ord": 1, "score": 0, "pref": false, "err": "unsupported_assumption", "sv": "Att personen uppträdde hotfullt och sannolikt var påverkad, och att avvisningen därför var befogad.", "en": "That the person behaved threateningly and was probably under the influence, so the removal was justified.", "rat_sv": "En bedömning av personens sinnestillstånd är en slutsats, inte en iakttagelse, och håller inte om den prövas."}, {"k": "c", "ord": 2, "score": 1, "pref": false, "err": "failure_to_document", "sv": "Att en person avvisats från entrén på begäran av butikspersonalen, med tidpunkt och plats angivna.", "en": "That a person was removed from the entrance at the request of shop staff, with the time and place given.", "rat_sv": "En korrekt men tunn rapport. Utan förloppet går det inte att bedöma om åtgärden var proportionerlig."}, {"k": "a", "ord": 3, "score": 3, "pref": true, "err": "", "sv": "Tid, vad personalen sa, vad du sa och gjorde i ordning, vilka som var där, och personens invändning.", "en": "The time, what staff said, what you said and did in order, who was present, and the person’s objection.", "rat_sv": "Tid, förlopp, närvarande och personens egen invändning — det sista utelämnas oftast och betyder mest efteråt."}, {"k": "b", "ord": 4, "score": 2, "pref": false, "err": "insufficient_information", "sv": "Tidpunkt och plats, vad butikspersonalen begärde, och vad du gjorde i tur och ordning fram till att personen lämnade entrén.", "en": "The time and place, what the shop staff asked for, and what you did in sequence up to the point the person left the entrance.", "rat_sv": "Ett användbart förlopp, men utan personens egen invändning saknas det som en granskning kommer att fråga om."}]'::jsonb);
  PERFORM pg_temp.repair_options('so-rj-a10',
    '[{"k": "d", "ord": 1, "score": 0, "pref": false, "err": "failure_to_document", "sv": "Inget särskilt — allt finns i loggen och nästa pass läser den när de börjar sitt eget pass.", "en": "Nothing in particular — it is all in the log and the next shift reads it when they start.", "rat_sv": "Att lita på att systemet talar för sig innebär att nästa pass upptäcker sakerna först när de blivit problem."}, {"k": "c", "ord": 2, "score": 1, "pref": false, "err": "tunnel_vision", "sv": "Grinden, eftersom det var den enda konkreta avvikelsen — de andra två är noterade i systemet.", "en": "The gate, since it was the only concrete deviation — the other two are recorded in the system.", "rat_sv": "Det åtgärdade är det minst brådskande. Det som fortfarande pågår är det nästa pass faktiskt behöver."}, {"k": "a", "ord": 3, "score": 2, "pref": false, "err": "insufficient_information", "sv": "Grinden och entreprenören, eftersom det är de två sakerna som faktiskt kräver något av nästa pass rent praktiskt.", "en": "The gate and the contractor, since those are the two that actually require something practical of the next shift.", "rat_sv": "Två av tre, men detektorn som löst ut utan orsak är just det som behöver ögon under nästa pass."}, {"k": "b", "ord": 4, "score": 3, "pref": true, "err": "", "sv": "Alla tre, särskilt att detektorn behöver uppsikt och att entreprenören ska tas emot sju.", "en": "All three, especially that the detector needs watching and the contractor is received at seven.", "rat_sv": "Allt tre, med det som pågår markerat. Nästa pass behöver kunna agera, inte bara veta."}]'::jsonb);
  PERFORM pg_temp.repair_options('so-rj-b01',
    '[{"k": "c", "ord": 1, "score": 3, "pref": true, "err": "", "sv": "\"Man, cirka 30–40 år, mörk jacka, stod vid dörren i tre minuter och drog i den två gånger.\"", "en": "\"Male, about 30–40, dark jacket, stood by the door for three minutes and pulled it twice.\"", "rat_sv": "Enbart observerbara uppgifter: ålderspann, klädsel, tid, position och handling. Ingen tolkning av avsikt."}, {"k": "d", "ord": 2, "score": 0, "pref": false, "err": "unsupported_assumption", "sv": "\"Mannen såg misstänkt ut och hade sannolikt för avsikt att ta sig in obehörigt i fastigheten.\"", "en": "\"The man looked suspicious and probably intended to get into the building without authorisation.\"", "rat_sv": "Avsikt går inte att observera, och en rapport som påstår den håller inte om den prövas."}, {"k": "b", "ord": 3, "score": 1, "pref": false, "err": "unsupported_assumption", "sv": "\"En nervös man i mörk jacka höll till vid dörren under en längre stund innan han försvann.\"", "en": "\"A nervous man in a dark jacket hung around by the door for a good while before disappearing.\"", "rat_sv": "\"Nervös\" är en tolkning av ett beteende. Det som faktiskt syntes borde stå i stället."}, {"k": "a", "ord": 4, "score": 2, "pref": false, "err": "insufficient_information", "sv": "\"Man i mörk jacka stod kvar vid dörren en längre stund och verkade vilja komma in, men gick sedan mot parkeringen.\"", "en": "\"Man in a dark jacket stood by the door for a good while and seemed to want to get in, then walked off towards the car park.\"", "rat_sv": "Mest iakttagelse, men \"verkade vilja\" är en tolkning som glider in bland det som faktiskt syntes."}]'::jsonb);
  PERFORM pg_temp.repair_options('so-rj-b02',
    '[{"k": "c", "ord": 1, "score": 0, "pref": false, "err": "unsupported_assumption", "sv": "\"Läckan beror med största sannolikhet på förra veckans rörarbete. Entreprenören bör hållas ansvarig.\"", "en": "\"The leak is almost certainly due to last week’s pipework. The contractor should be held responsible.\"", "rat_sv": "Orsak och ansvar är slutsatser som inte går att dra på plats, och de tränger undan det som observerades."}, {"k": "d", "ord": 2, "score": 3, "pref": true, "err": "", "sv": "\"02.40, teknikutrymme −1. Vatten 2×3 m från genomföring i tak. Jour kontaktad 02.48, på plats 03.20.\"", "en": "\"02:40, plant room −1. Water 2×3 m from a ceiling penetration. On-call contacted 02:48, on site 03:20.\"", "rat_sv": "Tid, plats, omfattning, vidtagen åtgärd och vem som kontaktats. En läsare kan fortsätta arbetet utan att ringa."}, {"k": "b", "ord": 3, "score": 1, "pref": false, "err": "failure_to_document", "sv": "\"Vattenläcka i teknikutrymmet upptäcktes under nattronden. Jouren är kontaktad enligt instruktionen.\"", "en": "\"Water leak in the plant room discovered during the night round. On-call contacted per the instruction.\"", "rat_sv": "Sant men obrukbart. Ingen tid, ingen omfattning, och ingen uppgift om vad som återstår att göra."}, {"k": "a", "ord": 4, "score": 2, "pref": false, "err": "insufficient_information", "sv": "\"02.40, teknikutrymme plan −1. Vatten på golvet, kommer från taket. Jouren är kontaktad och är på väg till platsen.\"", "en": "\"02:40, plant room level −1. Water on the floor, coming from the ceiling. On-call has been contacted and is on the way to site.\"", "rat_sv": "Tid, plats och åtgärd finns. Utan omfattning kan mottagaren ändå inte avgöra hur bråttom det är."}]'::jsonb);
  PERFORM pg_temp.repair_options('so-rj-b03',
    '[{"k": "d", "ord": 1, "score": 0, "pref": false, "err": "unsupported_assumption", "sv": "Hur många cyklar som saknas i rummet, så att omfattningen på stölden går att bedöma direkt.", "en": "How many bikes are missing from the room, so the scale of the theft can be judged straight away.", "rat_sv": "Antalet hör till en slutsats som ännu inte är dragen; ingen har sagt att något är stulet."}, {"k": "c", "ord": 2, "score": 1, "pref": false, "err": "delayed_escalation", "sv": "Om hen har skrivit en notering om det i systemet, så att händelsen finns dokumenterad någonstans.", "en": "Whether they have written a note about it in the system, so the event is documented somewhere.", "rat_sv": "Rimlig fråga, men den säger inget om huruvida något behöver göras nu, vilket är det som avgörs först."}, {"k": "b", "ord": 3, "score": 2, "pref": false, "err": "insufficient_information", "sv": "Om dörren var låst eller uppbruten, så att du vet om det behöver åtgärdas innan objektet lämnas.", "en": "Whether the door was locked or forced, so you know if it needs attention before the site is left.", "rat_sv": "Den viktigaste enskilda uppgiften, men utan tidpunkten går det ändå inte att avgöra hur brådskande det är."}, {"k": "a", "ord": 4, "score": 3, "pref": true, "err": "", "sv": "När hen var där, vad hen faktiskt såg i rummet, och om dörren var låst eller uppbruten när hen kom.", "en": "When they were there, what they actually saw in the room, and whether the door was locked or forced.", "rat_sv": "Tid och det som faktiskt observerats avgör om detta pågår eller är gammalt. Utan det går ingen åtgärd att välja."}]'::jsonb);
  PERFORM pg_temp.repair_options('so-rj-b04',
    '[{"k": "b", "ord": 1, "score": 3, "pref": true, "err": "", "sv": "Vem du är, vilket objekt, att kylan larmat och temperaturen stiger, och vad du behöver att hen gör.", "en": "Who you are, which site, that the refrigeration alarmed and the temperature is rising, and what you need.", "rat_sv": "Vem, var, vad, hur brådskande och vad som behövs — i den ordning en nyvaken person kan ta emot den."}, {"k": "d", "ord": 2, "score": 0, "pref": false, "err": "weak_communication", "sv": "En redogörelse för ronden och vad du sett fram till larmet, så att hen får hela bilden från början.", "en": "An account of the round and what you saw up to the alarm, so they get the whole picture from the start.", "rat_sv": "Bakgrund först gör att den viktiga uppgiften kommer sist, till någon som inte lyssnar färdigt."}, {"k": "c", "ord": 3, "score": 1, "pref": false, "err": "insufficient_information", "sv": "Att det gått ett larm på kylanläggningen och att du ringer i enlighet med den larminstruktion som gäller för objektet.", "en": "That the refrigeration has alarmed and that you are calling in line with the alarm instruction that applies to the site.", "rat_sv": "Korrekt men otillräckligt: personen vet inte var, hur illa det är, eller vad som förväntas av hen."}, {"k": "a", "ord": 4, "score": 2, "pref": false, "err": "weak_communication", "sv": "Vem du är, vilket objekt det gäller, och att kylanläggningen larmat och att temperaturen stiger just nu.", "en": "Who you are, which site it is, and that the refrigeration has alarmed and the temperature is rising now.", "rat_sv": "Rätt uppgifter i rätt ordning, men utan att säga vad som behövs lämnas beslutet till någon som just vaknat."}]'::jsonb);
  PERFORM pg_temp.repair_options('so-rj-b05',
    '[{"k": "d", "ord": 1, "score": 0, "pref": false, "err": "delayed_escalation", "sv": "Nämna det muntligt till nästa pass om du råkar träffa dem innan du lämnar objektet.", "en": "Mention it verbally to the next shift if you happen to run into them before you leave.", "rat_sv": "Att vänta på att någon annan ska upptäcka det gör dig till den som visste och inget gjorde."}, {"k": "c", "ord": 2, "score": 3, "pref": true, "err": "", "sv": "Notera avvikelsen med tid och plats även om inget hände, så att det syns om samma sak upprepas.", "en": "Record the deviation with time and place even though nothing happened, so it shows if the same recurs.", "rat_sv": "Avvikelsen är värd att notera just för att den kan upprepas — mönstret, inte kvällen, är risken."}, {"k": "b", "ord": 3, "score": 1, "pref": false, "err": "failure_to_document", "sv": "Ta bort brandsläckaren, kontrollera att dörren går igen, och gå hem — problemet är därmed löst.", "en": "Remove the extinguisher, check the door closes, and go home — the problem is dealt with.", "rat_sv": "Rätt fysisk åtgärd, men utan notering finns inget mönster att upptäcka nästa gång det händer."}, {"k": "a", "ord": 4, "score": 2, "pref": false, "err": "insufficient_information", "sv": "Notera att dörren stått uppställd, utan tid och plats, eftersom ingen skada skedde den här gången.", "en": "Note that the door was propped open, without time or place, since no harm came of it this time.", "rat_sv": "Noteringen finns, men utan tid och plats går den inte att lägga bredvid nästa och se ett mönster."}]'::jsonb);
  PERFORM pg_temp.repair_options('so-rj-b06',
    '[{"k": "c", "ord": 1, "score": 0, "pref": false, "err": "unsupported_assumption", "sv": "Med det som är relevant för händelsen, utan detaljer som bara skapar oklarhet för en utomstående.", "en": "With what is relevant to the event, leaving out details that only create confusion for an outsider.", "rat_sv": "Att utelämna det som talar emot den egna versionen är det som gör en redogörelse värdelös när den prövas."}, {"k": "b", "ord": 2, "score": 1, "pref": false, "err": "weak_communication", "sv": "Med din egen slutsats först, så att läsaren vet vad det handlar om, och underlaget därefter.", "en": "With your own conclusion first so the reader knows what it is about, and the material after that.", "rat_sv": "Att inleda med slutsatsen färgar allt som följer och gör det svårare att se vad som faktiskt observerades."}, {"k": "d", "ord": 3, "score": 3, "pref": true, "err": "", "sv": "Kronologiskt med klockslag: vad som hände, vad du såg, vad du gjorde — egna bedömningar för sig.", "en": "Chronologically with times: what happened, what you saw, what you did — your own assessments apart.", "rat_sv": "Kronologi med tidsangivelser, sedan iakttagelser och åtgärder, och egna bedömningar tydligt avskilda."}, {"k": "a", "ord": 4, "score": 2, "pref": false, "err": "insufficient_information", "sv": "Kronologiskt med klockslag, med iakttagelser och åtgärder blandade så att förloppet blir lätt att följa.", "en": "Chronologically with times, with observations and actions mixed so the sequence is easy to follow.", "rat_sv": "Kronologin bär, men när iakttagelse och bedömning står i samma mening blir de svåra att skilja åt i efterhand."}]'::jsonb);
  PERFORM pg_temp.repair_options('so-rj-d01',
    '[{"k": "a", "ord": 1, "score": 3, "pref": true, "err": "", "sv": "Gör avstämningen vid varje passbyte, säg det till kollegan, och ta upp rutinen med arbetsledaren.", "en": "Do the reconciliation every shift change, tell your colleague, and raise the procedure with the supervisor.", "rat_sv": "Gör rätt själv, tar upp det med kollegan, och för frågan vidare som en fråga om rutinen — inte om personen."}, {"k": "d", "ord": 2, "score": 0, "pref": false, "err": "excessive_informal_trust", "sv": "Följ kollegans arbetssätt, eftersom hen känner objektet väl och rutinen uppenbarligen har fungerat i sex år utan fel.", "en": "Follow your colleague’s way of working, since they know the site well and the routine has evidently worked for six years without a fault.", "rat_sv": "Sex år utan fel säger något om sannolikheten, inte om konsekvensen. På ett datacenter styr konsekvensen."}, {"k": "c", "ord": 3, "score": 1, "pref": false, "err": "delayed_escalation", "sv": "Gör avstämningen rätt själv utan att säga något, eftersom kollegan är betydligt mer erfaren än du.", "en": "Do the reconciliation properly yourself without saying anything, since your colleague is far more experienced.", "rat_sv": "Att bara göra rätt själv i tysthet lämnar avsteget kvar och gör dig till den enda som vet om det."}, {"k": "b", "ord": 4, "score": 2, "pref": false, "err": "delayed_escalation", "sv": "Gör avstämningen vid varje passbyte och kom överens med kollegan om att ni båda gör den från och med nu.", "en": "Do the reconciliation at every shift change and agree with your colleague that you both do it from now on.", "rat_sv": "Rätt åtgärd och rätt samtal, men en rutin som tillämpas olika på ett datacenter är arbetsledningens fråga."}]'::jsonb);
  PERFORM pg_temp.repair_options('so-rj-d02',
    '[{"k": "d", "ord": 1, "score": 0, "pref": false, "err": "excessive_informal_trust", "sv": "Lås upp avdelningen, eftersom du känner igen personen väl och ärendet i sig verkar helt rimligt.", "en": "Unlock the department, since you recognise the person well and the errand itself seems entirely reasonable.", "rat_sv": "Att öppna på igenkänning är precis det arbetssätt en behörighetsordning finns för att förhindra."}, {"k": "b", "ord": 2, "score": 3, "pref": true, "err": "", "sv": "Säg nej, förklara att din behörighet inte täcker avdelningen, och erbjud att ringa någon som kan.", "en": "Say no, explain your authorisation does not cover that area, and offer to call somebody who can.", "rat_sv": "Behörigheten, inte bekantskapen, avgör. Erbjuder samtidigt en väg som faktiskt kan lösa personens problem."}, {"k": "c", "ord": 3, "score": 1, "pref": false, "err": "outside_mandate", "sv": "Följ med personen in på avdelningen och stå kvar hela tiden medan hen hämtar pärmen, och notera besöket i loggen efteråt.", "en": "Go in to the department with the person and stay there the whole time while they collect the folder, and note the visit afterwards.", "rat_sv": "Att följa med gör inte begäran behörig. Närvaron är en kontroll, inte ett tillstånd."}, {"k": "a", "ord": 4, "score": 2, "pref": false, "err": "weak_communication", "sv": "Säg nej och be personen återkomma i morgon när den som ansvarar för avdelningen är på plats igen.", "en": "Say no and ask the person to come back tomorrow when whoever is responsible for the department is back.", "rat_sv": "Håller gränsen, men skjuter upp ett ärende som kunde ha lösts i kväll om rätt person tillfrågats."}]'::jsonb);
  PERFORM pg_temp.repair_options('so-rj-d03',
    '[{"k": "d", "ord": 1, "score": 0, "pref": false, "err": "failure_to_document", "sv": "Anta att nästa väktares rond fångar upp dörren, eftersom förrådet ändå ingår i den ordinarie ronden.", "en": "Assume the next officer’s round catches the door, since the store room is on the ordinary round anyway.", "rat_sv": "Att lita på nästa rond löser möjligen dörren men lämnar avvikelsen odokumenterad, vilket betyder mest över tid."}, {"k": "b", "ord": 2, "score": 1, "pref": false, "err": "delayed_escalation", "sv": "Ta upp det när du kommer till jobbet nästa gång, så att det i alla fall blir sagt till någon.", "en": "Raise it when you next come in to work, so that it at least gets said to somebody.", "rat_sv": "Att vänta till nästa pass innebär att risken står öppen under tiden, av ren bekvämlighet."}, {"k": "c", "ord": 3, "score": 3, "pref": true, "err": "", "sv": "Ring objektet direkt så att dörren kontrolleras, och skriv en egen avvikelse om att du missade den.", "en": "Call the site straight away so the door gets checked, and write your own deviation report saying you missed it.", "rat_sv": "Åtgärdar risken nu och lämnar spår efter sig. Att någon annan kan upptäcka det är inget skäl att låta bli."}, {"k": "a", "ord": 4, "score": 2, "pref": false, "err": "failure_to_document", "sv": "Ring objektet direkt så att dörren kontrolleras, och nämn missen vid nästa passbyte i stället för att skriva.", "en": "Call the site straight away so the door gets checked, and mention the slip at the next handover rather than writing it.", "rat_sv": "Risken hanteras i tid, men avvikelsen finns bara i ett samtal och kan därmed inte följas upp senare."}]'::jsonb);
  PERFORM pg_temp.repair_options('so-rj-d04',
    '[{"k": "c", "ord": 1, "score": 0, "pref": false, "err": "failure_to_document", "sv": "Redigera rapporten så att bemanningen framgår och texten blir korrekt redan från början.", "en": "Edit the report so the staffing is stated and the text is correct from the start.", "rat_sv": "Att redigera originalet gör rapporten oanvändbar som spår, oavsett hur riktig den blir."}, {"k": "b", "ord": 2, "score": 1, "pref": false, "err": "insufficient_information", "sv": "Nämn det muntligt vid genomgången, utan att ändra eller komplettera något i den rapport som redan är inlämnad.", "en": "Mention it verbally at the review, without changing or supplementing anything in the report that has already been filed.", "rat_sv": "Muntligt håller för mötet men inte för någon som läser rapporten om ett år."}, {"k": "a", "ord": 3, "score": 2, "pref": false, "err": "weak_communication", "sv": "Lägg till en daterad komplettering om bemanningen utan att särskilt nämna den vid genomgången.", "en": "Add a dated addendum about the staffing without specifically mentioning it at the review.", "rat_sv": "Spåret blir rätt, men de som läser rapporten på mötet får inte veta att en väsentlig uppgift saknades."}, {"k": "d", "ord": 4, "score": 3, "pref": true, "err": "", "sv": "Lägg till en daterad komplettering om bemanningen och säg vid genomgången att den tillkommit i efterhand.", "en": "Add a dated addendum about the staffing and say at the review that it was added afterwards.", "rat_sv": "Komplettering i efterhand, daterad och märkt som sådan. Originalet står kvar, vilket är poängen med ett spår."}]'::jsonb);
  PERFORM pg_temp.repair_options('so-rj-d05',
    '[{"k": "d", "ord": 1, "score": 0, "pref": false, "err": "failure_to_document", "sv": "Gå så många punkter du hinner och kvittera resten ändå, så att ronden ser fullständig ut i systemet.", "en": "Do as many points as you can and sign off the rest anyway, so the round looks complete in the system.", "rat_sv": "Att kvittera det som inte gjorts gör loggen osann, vilket är allvarligare än en ogjord rond."}, {"k": "a", "ord": 2, "score": 3, "pref": true, "err": "", "sv": "Gå de tre skyddsvärda punkterna först, kvittera bara det du gått, och skriv resten i överlämningen.", "en": "Do the three protected points first, sign off only what you visited, and put the rest in the handover.", "rat_sv": "Prioriterar efter skyddsvärde, kvitterar bara det som faktiskt gjorts, och lämnar över det som inte hanns med."}, {"k": "c", "ord": 3, "score": 1, "pref": false, "err": "poor_proportionality", "sv": "Gå så många av de tolv punkterna du hinner i tur och ordning, och kvittera bara dem du faktiskt gått.", "en": "Do as many of the twelve points as you can in order, and sign off only the ones you actually visited.", "rat_sv": "Loggen blir sann, men att gå i tur och ordning i tidsbrist betyder att skyddsvärdet inte styrde valet."}, {"k": "b", "ord": 4, "score": 2, "pref": false, "err": "insufficient_information", "sv": "Gå de tre skyddsvärda punkterna och avsluta passet där, och kvittera i systemet bara de punkter du faktiskt har hunnit gå.", "en": "Do the three protected points and end the shift there, signing off in the system only the points you actually managed to visit.", "rat_sv": "Rimlig prioritering och en sann logg, men utan överlämning vet nästa pass inte vad som står okontrollerat."}]'::jsonb);
  PERFORM pg_temp.repair_options('so-rj-d06',
    '[{"k": "d", "ord": 1, "score": 0, "pref": false, "err": "excessive_informal_trust", "sv": "Titta efter i systemet åt personen, eftersom uppgiften är harmlös och hen ändå kan få den av sin egen chef i morgon.", "en": "Look it up in the system for them, since the information is harmless and they could get it from their own manager tomorrow.", "rat_sv": "Att uppgiften är harmlös ändrar inte att den hämtats ur ett system som finns för något annat."}, {"k": "c", "ord": 2, "score": 1, "pref": false, "err": "weak_communication", "sv": "Säg att du inte får göra det och gå vidare med arbetet utan att förklara varför det är så.", "en": "Say that you are not allowed to and get on with your work without explaining why that is.", "rat_sv": "Ett nej utan skäl lämnar intrycket att det är godtycke, och frågan kommer tillbaka till nästa väktare."}, {"k": "b", "ord": 3, "score": 3, "pref": true, "err": "", "sv": "Säg nej, förklara att passerdata bara får användas för säkerhetsändamål, och hänvisa till chefen.", "en": "Say no, explain access data may only be used for security purposes, and refer them to their manager.", "rat_sv": "Nej med skäl, och en anvisning om var frågan hör hemma. Behovet försvinner inte men vägen dit blir den rätta."}, {"k": "a", "ord": 4, "score": 2, "pref": false, "err": "delayed_escalation", "sv": "Säg nej och förklara att passerdata bara får användas för säkerhetsändamål, och lämna det därvid.", "en": "Say no and explain that access data may only be used for security purposes, and leave it at that.", "rat_sv": "Rätt svar med rätt skäl, men utan en väg vidare kommer samma fråga tillbaka till nästa väktare i receptionen."}]'::jsonb);
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Six new observed items
-- ═══════════════════════════════════════════════════════════════════════════
--
-- SCC-07 (de-escalation, service, boundary holding) and SCC-04 (prioritisation
-- and decision under pressure) each carried two observed items. Two
-- observations is enough to reach 'developing_evidence' only if BOTH answers
-- are strong: one weaker answer pulls the weighted mean under the 0.55
-- threshold and the whole competency collapses to 'limited_evidence'. That is
-- a property of the form, not of the candidate, and it is what "structurally
-- forced" means. Five observations each makes the estimate robust to a single
-- imperfect answer.
--
-- No jurisdiction-specific use-of-force content, no police role, and no
-- statutory-power question: every one is an ordinary private-security decision
-- with the relevant rule stated in the scenario.

DO $$
DECLARE
  _form uuid;
  b_serv uuid; c_serv uuid;   -- SCC-07 de-escalation
  b_prop uuid; c_prop uuid;   -- SCC-04 proportional decision making (v1)
  f_resp uuid; f_bound uuid; f_lik uuid; f_los uuid;
  f_prio uuid; f_bal uuid; f_esc uuid;
BEGIN
  SELECT id INTO _form FROM public.scp_forms
   WHERE slug = 'security-officer-recruitment-form-a';

  SELECT bv.id, cv.competency_id INTO b_serv, c_serv
    FROM public.scp_behaviour_versions bv
    JOIN public.scp_observable_behaviours b ON b.id = bv.behaviour_id
    JOIN public.scp_behaviour_competency_map m ON m.behaviour_version_id = bv.id
    JOIN public.scp_competency_versions cv ON cv.id = m.competency_version_id
   WHERE b.slug = 'de_escalation' AND bv.version_number = 1;
  SELECT bv.id, cv.competency_id INTO b_prop, c_prop
    FROM public.scp_behaviour_versions bv
    JOIN public.scp_observable_behaviours b ON b.id = bv.behaviour_id
    JOIN public.scp_behaviour_competency_map m ON m.behaviour_version_id = bv.id
    JOIN public.scp_competency_versions cv ON cv.id = m.competency_version_id
   WHERE b.slug = 'proportional_decision_making' AND bv.version_number = 1;

  IF b_serv IS NULL OR b_prop IS NULL OR _form IS NULL THEN
    RAISE EXCEPTION 'SCP_FLAGSHIP_SPINE_MISSING: form or behaviour graph absent.';
  END IF;

  SELECT id INTO f_resp  FROM public.scp_competency_facets WHERE slug = 'respektfullt-bemotande';
  SELECT id INTO f_bound FROM public.scp_competency_facets WHERE slug = 'granshallning';
  SELECT id INTO f_lik   FROM public.scp_competency_facets WHERE slug = 'likvardighet';
  SELECT id INTO f_los   FROM public.scp_competency_facets WHERE slug = 'losningsorientering';
  SELECT id INTO f_prio  FROM public.scp_competency_facets WHERE slug = 'prioritering';
  SELECT id INTO f_bal   FROM public.scp_competency_facets WHERE slug = 'beslutsbalans';
  SELECT id INTO f_esc   FROM public.scp_competency_facets WHERE slug = 'eskalering';

  PERFORM pg_temp.author_scenario(_form, 101, 'a_judgment', 'so-rj-a11',
    b_serv, c_serv, f_los,
    'intermediate', 'judgement', 'situational_judgement', 'judgement', false,
    'Håller kvar en gräns samtidigt som det verkliga behovet bakom en upprörd begäran tas på allvar.',
    'Reception i kontorshus, tidig kväll, ensam i receptionen.',
    'Ett scenario om en upprörd besökare säger inget om personens allmänna tålamod eller empati.',
    'En person kommer in i receptionen och är tydligt upprörd. Hen säger att hen måste få tag på en anhörig som arbetar i huset, att det gäller något hemma, och att det är bråttom. Personen har ingen legitimation med sig och vill inte säga mer om vad som hänt.',
    'Vad gör du?',
    'A person comes into reception clearly distressed. They say they have to reach a family member who works in the building, that it concerns something at home, and that it is urgent. They have no identification with them and will not say more about what has happened.',
    'What do you do?',
    '[{"k": "d", "ord": 1, "score": 0, "pref": false, "err": "excessive_informal_trust", "sv": "Släpp in personen och visa vägen till avdelningen, eftersom det uppenbarligen är en nödsituation.", "en": "Let the person in and show them to the department, since this is evidently an emergency.", "rat_sv": "Brådskan är personens egen uppgift och ingen har kontrollerat den. Ett obekräftat skäl är inte en behörighet."}, {"k": "b", "ord": 2, "score": 1, "pref": false, "err": "insufficient_information", "sv": "Förklara att du inte får lämna ut uppgifter om anställda, och be personen ringa den anhöriga själv.", "en": "Explain that you may not give out information about employees, and ask the person to call the family member themselves.", "rat_sv": "Korrekt om utlämnande, men personen har redan sagt att hen inte når fram, och behovet lämnas olöst i entrén."}, {"k": "a", "ord": 3, "score": 2, "pref": false, "err": "weak_communication", "sv": "Be personen vänta i receptionen medan du kontaktar den anhöriga och ser om hen vill komma ner.", "en": "Ask the person to wait in reception while you contact the family member and see whether they will come down.", "rat_sv": "Rätt åtgärd och rätt gräns, men personen lämnas att vänta utan att få veta vad som händer eller hur länge."}, {"k": "c", "ord": 4, "score": 3, "pref": true, "err": "", "sv": "Be om namnet på den anhöriga, ring upp hen internt och låt de två tala med varandra i receptionen.", "en": "Ask for the family member’s name, call them internally, and let the two speak in reception.", "rat_sv": "Löser det verkliga behovet — kontakt — utan att släppa in någon okänd. Gränsen hålls utan att avvisa personen."}]'::jsonb);

  PERFORM pg_temp.author_scenario(_form, 102, 'a_judgment', 'so-rj-a12',
    b_serv, c_serv, f_bound,
    'intermediate', 'judgement', 'situational_judgement', 'judgement', false,
    'Står kvar vid ett behörighetsbeslut när det ifrågasätts, utan att göra det till en maktfråga.',
    'Industrikontor, morgon, anställd vid en spärr med begränsad behörighet.',
    'Ett scenario om ett ifrågasättande säger inget om personens allmänna auktoritet eller självförtroende.',
    'En anställd blir stoppad vid en inre spärr eftersom kortet inte öppnar. Hen säger att hen har gått genom den dörren i tre år, att det måste vara ett systemfel, och frågar irriterat om du tänker hindra hen från att göra sitt jobb.',
    'Vad gör du?',
    'An employee is stopped at an inner barrier because their card will not open it. They say they have gone through that door for three years, that it must be a system fault, and ask irritably whether you intend to stop them doing their job.',
    'What do you do?',
    '[{"k": "d", "ord": 1, "score": 3, "pref": true, "err": "", "sv": "Säg att kortet inte öppnar just nu, att du inte kan gå förbi det, och ring den som kan reda ut behörigheten.", "en": "Say the card does not open it right now, that you cannot bypass that, and call whoever can sort the authorisation out.", "rat_sv": "Håller beslutet, gör det till en fråga om systemet snarare än om personen, och startar det som faktiskt kan lösa saken."}, {"k": "c", "ord": 2, "score": 0, "pref": false, "err": "excessive_informal_trust", "sv": "Öppna dörren manuellt den här gången och be den anställde höra av sig till supporten om kortet under dagen.", "en": "Open the door manually this once and ask the employee to contact support about the card during the day.", "rat_sv": "Att öppna manuellt när kortet nekar upphäver hela kontrollen och gör att felet aldrig blir upptäckt."}, {"k": "b", "ord": 3, "score": 1, "pref": false, "err": "weak_communication", "sv": "Förklara att du bara följer instruktionen och att du inte kan göra något åt saken just nu.", "en": "Explain that you are only following the instruction and that there is nothing you can do about it right now.", "rat_sv": "Beslutet står, men \"bara följer instruktionen\" lämnar personen utan väg vidare och trappar oftast upp irritationen."}, {"k": "a", "ord": 4, "score": 2, "pref": false, "err": "delayed_escalation", "sv": "Säg att kortet inte öppnar och be den anställde själv kontakta sin chef för att få behörigheten kontrollerad.", "en": "Say the card does not open it and ask the employee to contact their own manager to get the authorisation checked.", "rat_sv": "Gränsen hålls och vägen vidare pekas ut, men ansvaret för att lösa en spärr på plats läggs på den som stoppades."}]'::jsonb);

  PERFORM pg_temp.author_scenario(_form, 103, 'a_judgment', 'so-rj-a13',
    b_serv, c_serv, f_lik,
    'advanced', 'judgement', 'situational_judgement', 'judgement', false,
    'Upprätthåller en insläppsregel likvärdigt när det finns en kö och en publik som följer beslutet.',
    'Entré till ett publikt evenemang, kö utanför, två insläppsvärdar.',
    'Ett scenario om ett insläpp säger inget om personens allmänna rättvisekänsla.',
    'Vid ett evenemang gäller att väskor större än A4 ska lämnas i garderoben. En besökare i kön har en större väska och säger att hen släpptes in med samma väska förra veckan. Kön bakom har hört samtalet och några börjar kommentera.',
    'Vad gör du?',
    'At an event the rule is that bags larger than A4 must be left in the cloakroom. A visitor in the queue has a larger bag and says they were let in with the same bag last week. The queue behind has heard the exchange and some are starting to comment.',
    'What do you do?',
    '[{"k": "d", "ord": 1, "score": 0, "pref": false, "err": "poor_proportionality", "sv": "Släpp in besökaren med väskan för att lösa situationen, och tillämpa regeln fullt ut på resten av kön.", "en": "Let the visitor in with the bag to resolve the situation, and apply the rule in full to the rest of the queue.", "rat_sv": "Att ge efter för den som protesterar högst gör regeln till en förhandling och drabbar alla som följde den."}, {"k": "c", "ord": 2, "score": 1, "pref": false, "err": "delayed_escalation", "sv": "Be besökaren stiga åt sidan och vänta medan du kontrollerar med arrangören vad som gäller i kväll.", "en": "Ask the visitor to step aside and wait while you check with the organiser what applies tonight.", "rat_sv": "Kontroll är rimlig när något är oklart, men här är regeln känd, och kontrollen läser som ett undantag under prövning."}, {"k": "a", "ord": 3, "score": 3, "pref": true, "err": "", "sv": "Säg att regeln gäller alla i kväll, visa var garderoben är, och håll samma besked mot alla i kön efter.", "en": "Say the rule applies to everyone tonight, show where the cloakroom is, and give the same answer to everybody behind.", "rat_sv": "Likvärdigt besked, en väg som löser besökarens problem, och samma regel för dem som just hörde samtalet."}, {"k": "b", "ord": 4, "score": 2, "pref": false, "err": "weak_communication", "sv": "Säg att regeln gäller i kväll och hänvisa till garderoben, utan att gå in på vad som gällde förra veckan.", "en": "Say the rule applies tonight and point to the cloakroom, without going into what applied last week.", "rat_sv": "Rätt beslut och rätt hänvisning, men invändningen lämnas obesvarad inför en kö som redan har hört den."}]'::jsonb);

  PERFORM pg_temp.author_scenario(_form, 104, 'a_judgment', 'so-rj-a14',
    b_prop, c_prop, f_prio,
    'intermediate', 'prioritisation', 'prioritisation', 'judgement', false,
    'Väljer ordning mellan två samtidiga uppgifter utifrån vad som inte går att ta igen senare.',
    'Köpcentrum, ensam väktare på plats, kvart före stängning.',
    'Prioritering i ett scenario säger inget om personens förmåga att prioritera generellt.',
    'Kvart före stängning får du två saker samtidigt: butikspersonal i ett kassaområde ber om hjälp med en kund som vägrar lämna butiken, och en larmknapp i lastintaget på baksidan har utlöst utan att någon svarar på radio.',
    'Vad gör du?',
    'Fifteen minutes before closing two things arrive at once: staff in a till area ask for help with a customer refusing to leave the shop, and a panic button in the goods intake at the rear has been triggered with nobody answering on the radio.',
    'What do you do?',
    '[{"k": "d", "ord": 1, "score": 0, "pref": false, "err": "delayed_escalation", "sv": "Be butikspersonalen ringa polis om kunden själva, och kontrollera lastintaget när butikerna har stängt för dagen.", "en": "Ask the shop staff to call the police about the customer themselves, and check the goods intake once the shops have closed.", "rat_sv": "Skjuter upp den händelse ingen har kontroll över, och lämnar över en butiksfråga innan den ens är bedömd."}, {"k": "c", "ord": 2, "score": 1, "pref": false, "err": "tunnel_vision", "sv": "Gå till butiken först eftersom där finns människor som väntar, och ta lastintaget så snart det är löst.", "en": "Go to the shop first since there are people waiting there, and take the goods intake as soon as that is resolved.", "rat_sv": "Butiken har personal på plats och överblick. Lastintaget har varken svar eller ögon, vilket gör det mer osäkert."}, {"k": "a", "ord": 3, "score": 2, "pref": false, "err": "insufficient_information", "sv": "Åk till lastintaget först och be butikspersonalen ringa dig igen om kunden fortfarande är kvar.", "en": "Go to the goods intake first and ask the shop staff to call you again if the customer is still there.", "rat_sv": "Rätt ordning, men larmcentralen får inte veta att två saker pågår, vilket är det som kan ge dig hjälp."}, {"k": "b", "ord": 4, "score": 3, "pref": true, "err": "", "sv": "Åk till lastintaget först, be butiken hålla avstånd och återkomma, och meddela larmcentralen båda.", "en": "Go to the goods intake first, ask the shop to keep back and call again, and report both to the alarm centre.", "rat_sv": "En larmknapp utan svar kan betyda att någon inte kan svara. Den obesvarade frågan går före den som redan är under uppsikt."}]'::jsonb);

  PERFORM pg_temp.author_scenario(_form, 105, 'a_judgment', 'so-rj-a15',
    b_prop, c_prop, f_bal,
    'advanced', 'prioritisation', 'prioritisation', 'judgement', false,
    'Fattar ett tillräckligt beslut på ofullständig information i stället för att vänta på fullständig.',
    'Kontorsfastighet med flera hyresgäster, nattpass, ensam.',
    'Ett scenario om osäkerhet säger inget om personens allmänna beslutsförmåga eller stresstålighet.',
    'Klockan 02 känner du svag brandlukt i ett trapphus, men brandlarmet har inte löst ut och du hittar ingen källa. Lukten finns i två plan men inte i de andra. Fastighetsjouren svarar inte. Om du larmar räddningstjänsten kan det bli ett kostsamt onödigt utryck.',
    'Vad gör du?',
    'At 02:00 you notice a faint smell of burning in a stairwell, but the fire alarm has not triggered and you cannot find a source. The smell is on two floors but not the others. The property on-call is not answering. Calling the fire service may mean a costly needless turnout.',
    'What do you do?',
    '[{"k": "c", "ord": 1, "score": 3, "pref": true, "err": "", "sv": "Larma räddningstjänsten, beskriv exakt vad du känner och var, och fortsätt söka källan medan du väntar.", "en": "Call the fire service, describe exactly what you can smell and where, and keep looking for the source while you wait.", "rat_sv": "Brandlukt utan källa är precis den osäkerhet som ska lämnas till den som kan bedöma den. Kostnaden vägs inte mot brand."}, {"k": "d", "ord": 2, "score": 0, "pref": false, "err": "unsupported_assumption", "sv": "Notera lukten i loggen och kontrollera trapphuset igen på nästa rond, eftersom brandlarmet inte har löst ut.", "en": "Note the smell in the log and check the stairwell again on the next round, since the fire alarm has not triggered.", "rat_sv": "Att ett automatlarm är tyst är inget bevis för att det inte brinner; många bränder luktar långt innan de larmar."}, {"k": "b", "ord": 3, "score": 1, "pref": false, "err": "insufficient_information", "sv": "Fortsätt ringa fastighetsjouren tills du får svar, så att beslutet fattas av den som ansvarar för fastigheten.", "en": "Keep calling the property on-call until you get an answer, so the decision is made by whoever is responsible.", "rat_sv": "Jouren äger fastigheten men inte tidsfönstret. Att vänta på rätt beslutsfattare är här samma sak som att vänta."}, {"k": "a", "ord": 4, "score": 2, "pref": false, "err": "delayed_escalation", "sv": "Sök av de två planen systematiskt i tio minuter till, och larma räddningstjänsten om du inte hittar källan.", "en": "Search the two floors systematically for another ten minutes, and call the fire service if you find no source.", "rat_sv": "En bestämd tidsgräns är bättre än obestämd väntan, men tio minuter är lång tid om lukten kommer från något dolt."}]'::jsonb);

  PERFORM pg_temp.author_scenario(_form, 106, 'a_judgment', 'so-rj-a16',
    b_prop, c_prop, f_esc,
    'intermediate', 'prioritisation', 'prioritisation', 'judgement', false,
    'Skiljer en driftstörning från en säkerhetshändelse när båda inträffar samtidigt.',
    'Logistikanläggning, kvällspass, en väktare och en drifttekniker på plats.',
    'Ett scenario om ett strömavbrott säger inget om personens tekniska kunskap.',
    'Ett strömavbrott slår ut belysning och passersystem i halva anläggningen. Dörrarna i den delen står nu olåsta. Drifttekniker arbetar med felet och säger att det tar minst en timme. Kvällsskiftet med ett tjugotal anställda är kvar i den andra halvan.',
    'Vad gör du?',
    'A power cut takes out lighting and the access system in half the site. The doors in that half are now unlocked. Technicians are working on the fault and say it will take at least an hour. The evening shift of about twenty staff is still in the other half.',
    'What do you do?',
    '[{"k": "c", "ord": 1, "score": 0, "pref": false, "err": "delayed_escalation", "sv": "Gå extra ronder i den mörka delen under timmen och notera i loggen att passersystemet varit ur funktion.", "en": "Walk extra rounds in the dark half during the hour and note in the log that the access system was down.", "rat_sv": "Ronder täcker en punkt i taget. En öppen ingång behöver bevakas, inte besökas var tjugonde minut."}, {"k": "d", "ord": 2, "score": 3, "pref": true, "err": "", "sv": "Meddela larmcentralen att passerkontrollen är ur funktion, och bemanna den olåsta delens ingång.", "en": "Tell the alarm centre that access control is down, and staff the entrance to the unlocked half.", "rat_sv": "Ett bortfall av passerkontroll är en säkerhetshändelse i sig. Den ersätts av en person tills tekniken är tillbaka."}, {"k": "b", "ord": 3, "score": 1, "pref": false, "err": "tunnel_vision", "sv": "Följ drifttekniker till felet och hjälp till med belysning, eftersom strömmen är orsaken till alltihop.", "en": "Follow the technicians to the fault and help with lighting, since the power is the cause of all of it.", "rat_sv": "Att arbeta med orsaken är teknikernas uppgift. Konsekvensen — öppna dörrar — är väktarens och lämnas obevakad."}, {"k": "a", "ord": 4, "score": 2, "pref": false, "err": "insufficient_information", "sv": "Bemanna ingången till den olåsta delen och stanna där tills strömmen och passersystemet är tillbaka.", "en": "Staff the entrance to the unlocked half and stay there until the power and access system are back.", "rat_sv": "Rätt åtgärd på plats, men ingen utanför anläggningen vet att kontrollen är borta i minst en timme."}]'::jsonb);

END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Renumber the form and correct the section that grew
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE _form uuid; _n int;
BEGIN
  SELECT id INTO _form FROM public.scp_forms
   WHERE slug = 'security-officer-recruitment-form-a';

  -- Two passes: display_order is UNIQUE per form, so a single UPDATE would
  -- collide with rows it has not moved yet.
  UPDATE public.scp_form_items SET display_order = display_order + 1000
   WHERE form_id = _form;

  WITH ord AS (
    SELECT fi.id,
           row_number() OVER (ORDER BY fb.display_order, i.slug)::int AS n
      FROM public.scp_form_items fi
      JOIN public.scp_form_blocks fb
        ON fb.form_id = fi.form_id AND fb.block_key = fi.block_key
      JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
      JOIN public.scp_items i ON i.id = iv.item_id
     WHERE fi.form_id = _form
  )
  UPDATE public.scp_form_items fi
     SET display_order = ord.n
    FROM ord WHERE fi.id = ord.id;

  SELECT count(*) INTO _n FROM public.scp_form_items WHERE form_id = _form;
  IF _n <> 56 THEN
    RAISE EXCEPTION 'SCP_FLAGSHIP_ITEM_COUNT: expected 56 items, found %', _n;
  END IF;

  -- The section intro states a count, so the count has to be right.
  UPDATE public.scp_form_blocks
     SET intro_sv = 'Sexton situationer ur vanligt bevakningsarbete. Det finns sällan ett '
                    'självklart rätt svar — välj det du faktiskt skulle göra utifrån det '
                    'som står i situationen.',
         intro_en = 'Sixteen situations from ordinary guarding work. There is rarely one '
                    'obvious right answer — choose what you would actually do, based on '
                    'what the situation tells you.'
   WHERE form_id = _form AND block_key = 'a_judgment';

  -- Six more scenario items is roughly five more minutes of work.
  UPDATE public.scp_forms
     SET target_minutes_min = 40, target_minutes_max = 50
   WHERE id = _form;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. The self-report block is not situational judgement
-- ═══════════════════════════════════════════════════════════════════════════
--
-- All 24 items of block c_behaviour carried primary_construct =
-- 'situational_judgement'. They are behavioural self-report: the participant
-- describes their own usual way of working and there is no right answer. The
-- label was wrong, and it was wrong in the one direction that matters -- it
-- made a self-description look, in the metadata, like an observation of
-- judgement.
--
-- The vocabulary gains one value rather than the field being nulled, because
-- "we do not know what this measures" is a different and less honest statement
-- than "this is a self-description".

ALTER TABLE public.scp_item_versions
  DROP CONSTRAINT IF EXISTS scp_item_versions_primary_construct_check;
ALTER TABLE public.scp_item_versions
  ADD CONSTRAINT scp_item_versions_primary_construct_check
  CHECK (primary_construct IS NULL OR primary_construct = ANY (ARRAY[
    'situational_judgement', 'procedural_knowledge', 'factual_reporting',
    'operational_communication', 'prioritisation', 'mandate_and_escalation',
    'self_reported_work_behaviour']));

UPDATE public.scp_item_versions
   SET primary_construct = 'self_reported_work_behaviour'
 WHERE evidence_source_type = 'self_report';

-- Structural, not editorial: the two fields now have to agree, in both
-- directions, for every item written from here on.
CREATE OR REPLACE FUNCTION public.scp_guard_self_report_construct()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.evidence_source_type = 'self_report'
     AND NEW.primary_construct IS DISTINCT FROM 'self_reported_work_behaviour' THEN
    RAISE EXCEPTION
      'SCP_SELF_REPORT_CONSTRUCT: item version % records self-reported work '
      'behaviour, so primary_construct must be ''self_reported_work_behaviour'', '
      'not ''%''. A description of how somebody usually works is not an '
      'observation of their judgement.', NEW.id, NEW.primary_construct
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.primary_construct = 'self_reported_work_behaviour'
     AND NEW.evidence_source_type <> 'self_report' THEN
    RAISE EXCEPTION
      'SCP_SELF_REPORT_SOURCE: item version % declares the self-report '
      'construct, so its evidence_source_type must be ''self_report'', not ''%''.',
      NEW.id, NEW.evidence_source_type
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.scp_guard_self_report_construct() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS scp_item_versions_self_report_construct ON public.scp_item_versions;
CREATE TRIGGER scp_item_versions_self_report_construct
  BEFORE INSERT OR UPDATE ON public.scp_item_versions
  FOR EACH ROW EXECUTE FUNCTION public.scp_guard_self_report_construct();

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. so-rj-c07 and so-rj-c19: deliberate ideal-point scoring
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Both items score non-monotonically across their frequency scale:
--
--   c07  "När jag har gjort samma kontroll många gånger behöver jag påminna
--         mig själv om att inte gå på autopilot."
--        Nästan aldrig 0 | Ibland 2 | Ofta 3 | Nästan alltid 2
--
--   c19  "Jag försöker lösa saker själv först, så att jag inte stör någon i
--         onödan."
--        Nästan aldrig 2 | Ibland 3 | Ofta 1 | Nästan alltid 0
--
-- The audit asked whether this is deliberate ideal-point scoring or accidental
-- key drift. It is deliberate, and the evidence is in the authored data
-- itself: on both items the author wrote a scoring rationale explaining
-- exactly why the extreme is not the good answer. On c07, "Att aldrig känna
-- igen fenomenet är i sig något att fråga om -- inte ett tecken på uthållighet";
-- on c19, the peak is described as "en tröskel som varken är för hög eller
-- obefintlig". Neither of those is what key drift looks like.
--
-- What WAS defective is that the rationale existed on only two of the four
-- options on each item, which is precisely why an ideal-point key reads as
-- drift on inspection. The shoulders are filled in here so the intent is
-- legible on every option, and 20260907095000 adds a regression test that
-- fails if either profile is ever silently flattened into a monotonic key.
--
-- Note on reverse_scored: it is descriptive metadata and is read by nothing --
-- scp_submit_attempt scores from score_value alone. On an ideal-point item it
-- cannot mean anything, because there is no single direction to reverse. It is
-- left as authored rather than cleared, since clearing it would imply a
-- scoring change that is not happening.

DO $$
DECLARE _c07 uuid; _c19 uuid;
BEGIN
  SELECT iv.id INTO _c07 FROM public.scp_item_versions iv
    JOIN public.scp_items i ON i.id = iv.item_id WHERE i.slug = 'so-rj-c07';
  SELECT iv.id INTO _c19 FROM public.scp_item_versions iv
    JOIN public.scp_items i ON i.id = iv.item_id WHERE i.slug = 'so-rj-c19';

  UPDATE public.scp_item_options SET scoring_rationale_sv =
    'Idealpunkt: beskriver att fenomenet känns igen ibland. Rimligt, men mindre '
    'aktiv självobservation än det som ligger i mitten av skalan.'
   WHERE item_version_id = _c07 AND option_key = 'b';
  UPDATE public.scp_item_options SET scoring_rationale_sv =
    'Idealpunkt: att alltid behöva påminna sig själv beskriver en ständig kamp '
    'snarare än ett arbetssätt som håller. Inte sämre än "ibland", men inte bättre.'
   WHERE item_version_id = _c07 AND option_key = 'd';

  UPDATE public.scp_item_options SET scoring_rationale_sv =
    'Idealpunkt: att nästan aldrig försöka själv först beskriver en mycket låg '
    'tröskel för att koppla in andra. Bättre än sen eskalering, men inte målet.'
   WHERE item_version_id = _c19 AND option_key = 'a';
  UPDATE public.scp_item_options SET scoring_rationale_sv =
    'Idealpunkt: en tröskel som börjar bli hög. Beskriver att andra kopplas in '
    'senare än vad situationen ofta hinner med.'
   WHERE item_version_id = _c19 AND option_key = 'c';

  IF EXISTS (
    SELECT 1 FROM public.scp_item_options
     WHERE item_version_id IN (_c07, _c19) AND btrim(scoring_rationale_sv) = ''
  ) THEN
    RAISE EXCEPTION 'SCP_IDEAL_POINT_RATIONALE_MISSING: an ideal-point option '
      'still has no rationale, which is what made the key look like drift.';
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. Prove it
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  _form uuid; _ver uuid; _n int; _min int; _max int; _longest int; _rank numeric;
BEGIN
  SELECT id INTO _form FROM public.scp_forms
   WHERE slug = 'security-officer-recruitment-form-a';
  SELECT av.id INTO _ver FROM public.scp_assessment_versions av
    JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
   WHERE d.slug = 'security-officer-recruitment';

  -- ---- shape ------------------------------------------------------------
  SELECT count(*) INTO _n FROM public.scp_form_items fi
    JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
   WHERE fi.form_id = _form AND iv.item_format = 'sjt_best_response';
  IF _n <> 28 THEN RAISE EXCEPTION 'SCP_REPAIR_SJT_COUNT: expected 28, found %', _n; END IF;

  SELECT count(*) INTO _n FROM public.scp_form_items fi
    JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
   WHERE fi.form_id = _form AND iv.item_format = 'sjt_best_response'
     AND (SELECT count(*) FROM public.scp_item_options o
           WHERE o.item_version_id = iv.id) <> 4;
  IF _n <> 0 THEN RAISE EXCEPTION 'SCP_REPAIR_OPTION_COUNT: % item(s) are not on four options', _n; END IF;

  -- Every item scores 3/2/1/0, exactly once each.
  SELECT count(*) INTO _n FROM public.scp_form_items fi
    JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
   WHERE fi.form_id = _form AND iv.item_format = 'sjt_best_response'
     AND (SELECT array_agg(o.score_value ORDER BY o.score_value)
            FROM public.scp_item_options o WHERE o.item_version_id = iv.id)
         <> ARRAY[0,1,2,3]::numeric[];
  IF _n <> 0 THEN RAISE EXCEPTION 'SCP_REPAIR_SCORING: % item(s) do not score 3/2/1/0', _n; END IF;

  -- Exactly one preferred option each, and it is the 3.
  SELECT count(*) INTO _n FROM public.scp_form_items fi
    JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
   WHERE fi.form_id = _form AND iv.item_format = 'sjt_best_response'
     AND (SELECT count(*) FROM public.scp_item_options o
           WHERE o.item_version_id = iv.id AND o.is_preferred AND o.score_value = 3) <> 1;
  IF _n <> 0 THEN RAISE EXCEPTION 'SCP_REPAIR_PREFERRED: % item(s) have no single preferred 3-point option', _n; END IF;

  -- Every distractor names the weakness it represents; the preferred names none.
  SELECT count(*) INTO _n FROM public.scp_form_items fi
    JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
    JOIN public.scp_item_options o ON o.item_version_id = iv.id
   WHERE fi.form_id = _form AND iv.item_format = 'sjt_best_response'
     AND ((NOT o.is_preferred AND o.distractor_error_type IS NULL)
       OR (o.is_preferred AND o.distractor_error_type IS NOT NULL));
  IF _n <> 0 THEN RAISE EXCEPTION 'SCP_REPAIR_TAXONOMY: % option(s) have the wrong error-type shape', _n; END IF;

  -- Both languages on every option.
  SELECT count(*) INTO _n FROM public.scp_form_items fi
    JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
    JOIN public.scp_item_options o ON o.item_version_id = iv.id
   WHERE fi.form_id = _form
     AND (SELECT count(*) FROM public.scp_item_option_texts ot
           WHERE ot.item_option_id = o.id) <> 2;
  IF _n <> 0 THEN RAISE EXCEPTION 'SCP_REPAIR_I18N: % option(s) do not carry both languages', _n; END IF;

  -- ---- balance ----------------------------------------------------------
  SELECT min(c), max(c) INTO _min, _max FROM (
    SELECT count(*)::int AS c FROM public.scp_form_balance_items(_form)
     GROUP BY preferred_key_slot) s;
  IF _min <> 7 OR _max <> 7 THEN
    RAISE EXCEPTION 'SCP_REPAIR_KEY_BALANCE: preferred key counts run %..%, expected 7..7', _min, _max;
  END IF;

  SELECT min(c), max(c) INTO _min, _max FROM (
    SELECT count(*)::int AS c FROM public.scp_form_balance_items(_form)
     GROUP BY preferred_pos) s;
  IF _min <> 7 OR _max <> 7 THEN
    RAISE EXCEPTION 'SCP_REPAIR_POSITION_BALANCE: preferred position counts run %..%, expected 7..7', _min, _max;
  END IF;

  -- No cell of the key x position grid may hold more than two items, or the
  -- key would predict the position.
  SELECT max(c) INTO _max FROM (
    SELECT count(*)::int AS c FROM public.scp_form_balance_items(_form)
     GROUP BY preferred_key_slot, preferred_pos) s;
  IF _max > 2 THEN
    RAISE EXCEPTION 'SCP_REPAIR_KEY_POSITION_CORRELATED: one key/position cell holds % items', _max;
  END IF;

  -- ---- the gates agree --------------------------------------------------
  SELECT count(*) INTO _n
    FROM public.scp_assessment_version_publication_readiness(_ver)
   WHERE gate IN ('answer_key_balance', 'answer_position_balance', 'option_length_balance')
     AND status = 'fail';
  IF _n <> 0 THEN
    RAISE EXCEPTION 'SCP_REPAIR_GATE_STILL_FAILS: % balance gate(s) still report a failure', _n;
  END IF;

  -- ---- coverage ---------------------------------------------------------
  FOR _n IN
    SELECT count(*) FROM public.scp_form_items fi
      JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
      JOIN public.scp_competencies c ON c.id = iv.competency_id
     WHERE fi.form_id = _form AND iv.evidence_source_type = 'assessment_response'
       AND c.code = 'SCC-07'
  LOOP
    IF _n < 5 THEN RAISE EXCEPTION 'SCP_REPAIR_SCC07_COVERAGE: % observed items, expected at least 5', _n; END IF;
  END LOOP;

  FOR _n IN
    SELECT count(*) FROM public.scp_form_items fi
      JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
      JOIN public.scp_competencies c ON c.id = iv.competency_id
     WHERE fi.form_id = _form AND iv.evidence_source_type = 'assessment_response'
       AND c.code = 'SCC-04'
  LOOP
    IF _n < 5 THEN RAISE EXCEPTION 'SCP_REPAIR_SCC04_COVERAGE: % observed items, expected at least 5', _n; END IF;
  END LOOP;

  -- ---- separation and honesty -------------------------------------------
  SELECT count(*) INTO _n FROM public.scp_form_items fi
    JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
   WHERE fi.form_id = _form AND iv.evidence_source_type = 'self_report'
     AND iv.primary_construct <> 'self_reported_work_behaviour';
  IF _n <> 0 THEN RAISE EXCEPTION 'SCP_REPAIR_SELF_REPORT_CONSTRUCT: % item(s) still mislabelled', _n; END IF;

  SELECT count(*) INTO _n FROM public.scp_form_items fi
    JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
   WHERE fi.form_id = _form
     AND (iv.content_status <> 'draft' OR iv.validation_status <> 'design'
       OR NOT iv.authored_by_ai OR iv.sme_reviewer_count <> 0
       OR iv.sme_review_status <> 'pending');
  IF _n <> 0 THEN
    RAISE EXCEPTION 'SCP_REPAIR_CLAIM_DRIFT: % item(s) no longer read as unreviewed '
      'AI-authored draft content. This migration must not have promoted anything.', _n;
  END IF;

  SELECT count(*) INTO _n FROM public.scp_assessment_versions
   WHERE id = _ver AND content_status = 'draft' AND validation_status = 'design';
  IF _n <> 1 THEN
    RAISE EXCEPTION 'SCP_REPAIR_VERSION_CLAIM_DRIFT: the assessment version is no longer draft/design.';
  END IF;

  RAISE NOTICE 'flagship repaired: 56 items, 28 scenario items on four balanced options';
END $$;

INSERT INTO public.scp_content_events (subject_type, subject_ref, action, reason, metadata)
VALUES (
  'assessment_version', 'security-officer-recruitment', 'updated',
  'Answer mechanics repaired. Scenario stems unchanged; options rewritten to '
  'four strategies scoring 3/2/1/0, keys and positions balanced, length tell '
  'removed. Six observed items added for SCC-07 and SCC-04. Self-report '
  'construct corrected. Still draft/design, AI-authored, zero SME review.',
  jsonb_build_object(
    'migration', '20260907093000_scp_flagship_answer_mechanics_repair',
    'items_before', 50, 'items_after', 56,
    'scenario_items_before', 22, 'scenario_items_after', 28,
    'stems_changed', 0,
    'preferred_key_before', 'a on 22 of 22', 'preferred_key_after', '7 each of a/b/c/d',
    'preferred_position_before', 'first on 22 of 22', 'preferred_position_after', '7 each of 1/2/3/4',
    'before_snapshot', 'docs/audits/assessment-foundation-p0-before.json')
);
