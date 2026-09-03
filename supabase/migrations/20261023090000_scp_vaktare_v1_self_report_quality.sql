-- Väktare – Recruitment Assessment v1: self-report response quality (PR-V4).
--
-- ── WHAT THIS IS ────────────────────────────────────────────────────────
--
-- PR-V3 (20261022090000) reviewed the words of all 50 items. It could not
-- answer a question the human review group then asked on its own: do the 24
-- SELF-REPORT items actually ask about something a candidate can answer on a
-- frequency scale, and does the scale itself say what it means?
--
-- The dedicated self-report review found three defects that wording alone
-- can fix, and one it deliberately does not fix:
--
--   1  the scale's end points were absolutes. "Nästan aldrig" / "Nästan
--      alltid" invite a denial at one end and a boast at the other. The
--      Product Owner accepts the workgroup recommendation: keep FOUR
--      options, relabel them Sällan / Ibland / Ofta / Nästan varje gång
--      (Rarely / Sometimes / Often / Almost every time);
--
--   2  two items (c08, c23) described HAVING a method, not how often a
--      behaviour occurs, so a frequency scale did not fit the sentence they
--      were attached to. Both are rewritten as recurring behaviour with the
--      same intended competency and the same scores;
--
--   3  four items (c09, c12, c20, c21) assumed previous guarding employment
--      -- a shift, an alarm, a working day that ends on site. A candidate
--      who has never guarded could not answer them from experience. They are
--      generalised without losing job relevance; c11, c13, c14, c15, c17 and
--      c22 are reworded to describe a BEHAVIOUR rather than a moral
--      proposition the candidate can simply agree with.
--
-- What it does not fix: cue. The review classified most self-report items as
-- HIGH CUE and this migration does not pretend otherwise. Reducing
-- obviousness is the objective; claiming objectivity is not. Every cue level
-- after revision is recorded in the review pack, honestly, for pilot
-- analysis.
--
-- ── FORCED CHOICE IS NOT TOUCHED ────────────────────────────────────────
--
--   c03, c06, c18 and c24 are two-option forced-choice items, not four-point
--   frequency items. They are absent from this migration's document
--   entirely, so nothing writes to them, and the proof block asserts they
--   still hold two options carrying neither frequency label.
--
-- ── c07 AND c19 STAY METHODOLOGICALLY OPEN ──────────────────────────────
--
--   c07 is reworded to the Product Owner's own direction ("När en kontroll
--   känns välbekant behöver jag aktivt rikta tillbaka uppmärksamheten mot
--   varje moment") -- neutral, and with no "ibland" inside a stem whose
--   scale already supplies the frequency.
--
--   c19's stem is NOT touched. Escalating versus resolving alone depends on
--   risk, mandate, time and instruction, and no wording available here makes
--   its non-monotonic key monotonic without changing score semantics, which
--   this PR may not do. Its scale is relabelled with the rest; its openness
--   is written into scoring_rationale_sv rather than resolved by moving a
--   score.
--
--   Both keep their technical keying, both stay self_report, and neither may
--   independently establish a competency -- proven below.
--
-- ── WHAT CHANGES ────────────────────────────────────────────────────────
--
--   * the sv-SE and en-GB stem on 14 of the 24 self-report items, and the
--     four option labels in both languages on the 20 frequency items;
--   * scoring_rationale_sv where a rewritten stem made the old sentence
--     describe something the option no longer says, and on c07 d and c19 a,
--     where the open keying is now stated in the data instead of only in a
--     review pack;
--   * the self-report section intro, which no longer claims "det finns
--     inget facit" -- the scores technically differ, so that sentence was
--     not true -- and instead tells the candidate to answer from occasions
--     that actually arose, in either language;
--   * the en-GB adaptation note on the 20 revised items.
--
-- ── WHAT DOES NOT CHANGE, AND IS PROVEN NOT TO ──────────────────────────
--
--   No option id, option key, score_value, is_preferred, reverse_scored or
--   display_order. No competency, facet or behaviour mapping. No item
--   format, evidence_source_type (the 24 stay self_report and stay out of
--   maturity), content_status, validation_status or review gate. No item
--   added or removed; 50 = 22 + 24 + 4. No scenario item, no free-text item
--   and no rubric is read or written. The proof block snapshots every
--   identity column before and compares after; a single moved value aborts
--   the transaction.
--
-- ── VERSIONING AND DEPLOY PRECONDITION ──────────────────────────────────
--
--   Same governed path as 20261022090000: all 50 versions are
--   content_status = 'draft', never approved, never published, so draft
--   content is edited in place (scp_guard_published_immutable). And, for the
--   same reason, this migration REFUSES to apply while any attempt on form A
--   is in_progress or submitted: those attempts read item text live and
--   would show wording the candidate did not answer. scored and released
--   attempts carry no item text and are unaffected.
--
-- ── WHAT THIS DOES NOT CLAIM ────────────────────────────────────────────
--
--   No psychometric claim of any kind. Self-report is the candidate's own
--   description of their working style: useful for human review and for
--   structured interview follow-up, and never observed evidence, proof of
--   competence, maturity, suitability or an employment recommendation. All
--   250 review gates (50 x 5) remain outstanding, and the proof block fails
--   if any is not.

DO $$
DECLARE _form uuid; _in_progress int; _submitted int; _scored int; _released int; _abandoned int;
BEGIN
  SELECT id INTO _form FROM public.scp_forms WHERE slug = 'security-officer-recruitment-form-a';
  IF _form IS NULL THEN
    RAISE EXCEPTION 'SCP_V4_FORM_MISSING: security-officer-recruitment-form-a is not authored here.';
  END IF;
  SELECT count(*) FILTER (WHERE status = 'in_progress'),
         count(*) FILTER (WHERE status = 'submitted'),
         count(*) FILTER (WHERE status = 'scored'),
         count(*) FILTER (WHERE status = 'released'),
         count(*) FILTER (WHERE status = 'abandoned')
    INTO _in_progress, _submitted, _scored, _released, _abandoned
    FROM public.scp_attempts WHERE form_id = _form;
  RAISE NOTICE 'vaktare v1 attempts on form A before the self-report review: in_progress=% submitted=% scored=% released=% abandoned=%',
    _in_progress, _submitted, _scored, _released, _abandoned;
  IF _in_progress > 0 OR _submitted > 0 THEN
    RAISE EXCEPTION 'SCP_V4_ATTEMPTS_IN_FLIGHT: % attempt(s) in progress and % awaiting review on form A read item text live. Let them finish or abandon synthetic ones, then re-run. Released and scored attempts are unaffected.',
      _in_progress, _submitted;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- The document. One JSON value, the single source for this review:
-- scripts/vaktare-self-report-quality-check.ts reads the same block, so what
-- the guard measures is what the database receives. The 20 frequency items
-- are here; c03, c06, c18 and c24 are deliberately absent.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TEMP TABLE _v4_doc AS
SELECT $vaktare_selfreport$
{
 "en_adaptation": {
  "notes": "2026-09-03 self-report response-quality review: four response options kept, the frequency scale relabelled to Sällan/Ibland/Ofta/Nästan varje gång (Rarely/Sometimes/Often/Almost every time), stems reworded to describe a recurring behaviour rather than a method or a moral proposition, and guarding-employment assumptions removed. Same behaviour, same frequency meaning, same score identity in both languages. CONTENT/LANGUAGE review, not validation: no psychometric equivalence is claimed and the named human language gate stays outstanding.", 
  "reviewed_by": "PR-V4 self-report response review, AI-assisted (Claude) — not a named human language reviewer"
 }, 
 "items": [
  {
   "kind": "selfreport", 
   "sv": {
    "prompt": "Hur ofta stämmer det?", 
    "scenario": "Om en rutin känns onödigt lång och situationen ser okomplicerad ut förenklar jag stegen."
   }, 
   "class": "FREQUENCY — UNCHANGED", 
   "slug": "so-rj-c01", 
   "en": {
    "prompt": "How often is that true?", 
    "scenario": "If a procedure feels unnecessarily long and the situation looks straightforward, I simplify the steps."
   }, 
   "options": [
    {
     "en": "Rarely", 
     "sv": "Sällan", 
     "rat_sv": "Beskriver att genvägen inte tas.", 
     "k": "a"
    }, 
    {
     "en": "Sometimes", 
     "sv": "Ibland", 
     "rat_sv": "", 
     "k": "b"
    }, 
    {
     "en": "Often", 
     "sv": "Ofta", 
     "rat_sv": "", 
     "k": "c"
    }, 
    {
     "en": "Almost every time", 
     "sv": "Nästan varje gång", 
     "rat_sv": "Beskriver att genvägen tas regelmässigt.", 
     "k": "d"
    }
   ], 
   "cue": "HIGH"
  }, 
  {
   "kind": "selfreport", 
   "sv": {
    "prompt": "Hur ofta stämmer det?", 
    "scenario": "När jag avviker från en rutin skriver jag ner varför, även när avvikelsen var uppenbart rimlig."
   }, 
   "class": "FREQUENCY — UNCHANGED", 
   "slug": "so-rj-c02", 
   "en": {
    "prompt": "How often is that true?", 
    "scenario": "When I depart from a procedure I write down why, even when the departure was obviously reasonable."
   }, 
   "options": [
    {
     "en": "Rarely", 
     "sv": "Sällan", 
     "rat_sv": "Beskriver att avsteg inte dokumenteras.", 
     "k": "a"
    }, 
    {
     "en": "Sometimes", 
     "sv": "Ibland", 
     "rat_sv": "", 
     "k": "b"
    }, 
    {
     "en": "Often", 
     "sv": "Ofta", 
     "rat_sv": "", 
     "k": "c"
    }, 
    {
     "en": "Almost every time", 
     "sv": "Nästan varje gång", 
     "rat_sv": "Beskriver att avsteg dokumenteras genomgående.", 
     "k": "d"
    }
   ], 
   "cue": "HIGH"
  }, 
  {
   "kind": "selfreport", 
   "sv": {
    "prompt": "Hur ofta stämmer det?", 
    "scenario": "När jag lägger märke till något litet som avviker nöjer jag mig med att komma ihåg det."
   }, 
   "class": "FREQUENCY — UNCHANGED", 
   "slug": "so-rj-c04", 
   "en": {
    "prompt": "How often is that true?", 
    "scenario": "When I notice something small that is out of place, I rely on remembering it."
   }, 
   "options": [
    {
     "en": "Rarely", 
     "sv": "Sällan", 
     "rat_sv": "Beskriver att iakttagelsen förs vidare.", 
     "k": "a"
    }, 
    {
     "en": "Sometimes", 
     "sv": "Ibland", 
     "rat_sv": "", 
     "k": "b"
    }, 
    {
     "en": "Often", 
     "sv": "Ofta", 
     "rat_sv": "", 
     "k": "c"
    }, 
    {
     "en": "Almost every time", 
     "sv": "Nästan varje gång", 
     "rat_sv": "Beskriver att iakttagelsen stannar i huvudet.", 
     "k": "d"
    }
   ], 
   "cue": "MODERATE"
  }, 
  {
   "kind": "selfreport", 
   "sv": {
    "prompt": "Hur ofta stämmer det?", 
    "scenario": "Jag antecknar tid och plats direkt när jag ser något, inte i efterhand."
   }, 
   "class": "FREQUENCY — UNCHANGED", 
   "slug": "so-rj-c05", 
   "en": {
    "prompt": "How often is that true?", 
    "scenario": "I write down the time and place as soon as I see something, not afterwards."
   }, 
   "options": [
    {
     "en": "Rarely", 
     "sv": "Sällan", 
     "rat_sv": "Beskriver att anteckningen görs i efterhand eller inte alls.", 
     "k": "a"
    }, 
    {
     "en": "Sometimes", 
     "sv": "Ibland", 
     "rat_sv": "", 
     "k": "b"
    }, 
    {
     "en": "Often", 
     "sv": "Ofta", 
     "rat_sv": "", 
     "k": "c"
    }, 
    {
     "en": "Almost every time", 
     "sv": "Nästan varje gång", 
     "rat_sv": "Beskriver att anteckningen görs på plats.", 
     "k": "d"
    }
   ], 
   "cue": "HIGH"
  }, 
  {
   "kind": "selfreport", 
   "sv": {
    "prompt": "Hur ofta stämmer det?", 
    "scenario": "När en kontroll känns välbekant behöver jag aktivt rikta tillbaka uppmärksamheten mot varje moment."
   }, 
   "class": "DESCRIPTIVE / METHODOLOGICALLY OPEN", 
   "slug": "so-rj-c07", 
   "en": {
    "prompt": "How often is that true?", 
    "scenario": "When a check feels very familiar, I need to deliberately refocus my attention on each step."
   }, 
   "options": [
    {
     "en": "Rarely", 
     "sv": "Sällan", 
     "rat_sv": "Att inte känna igen fenomenet alls är i sig något att fråga om — inte ett tecken på uthållighet.", 
     "k": "a"
    }, 
    {
     "en": "Sometimes", 
     "sv": "Ibland", 
     "rat_sv": "", 
     "k": "b"
    }, 
    {
     "en": "Often", 
     "sv": "Ofta", 
     "rat_sv": "Beskriver aktiv självobservation, vilket är det som går att arbeta med.", 
     "k": "c"
    }, 
    {
     "en": "Almost every time", 
     "sv": "Nästan varje gång", 
     "rat_sv": "Högsta frekvens kodas inte högst: samma svar kan beskriva vaksamhet eller osäkerhet. Keyingen är metodologiskt öppen och prövas mot pilotdata, inte mot en antagen ordning.", 
     "k": "d"
    }
   ], 
   "cue": "MODERATE"
  }, 
  {
   "kind": "selfreport", 
   "sv": {
    "prompt": "Hur ofta stämmer det?", 
    "scenario": "När uppmärksamheten börjar svikta gör jag något konkret för att bryta rutinen, till exempel byter ordning eller tar en kort paus."
   }, 
   "class": "FREQUENCY — REVISED", 
   "slug": "so-rj-c08", 
   "en": {
    "prompt": "How often is that true?", 
    "scenario": "When my attention starts to slip, I do something concrete to break the routine — change the order, or take a short break."
   }, 
   "options": [
    {
     "en": "Rarely", 
     "sv": "Sällan", 
     "rat_sv": "Beskriver att inget motmedel används.", 
     "k": "a"
    }, 
    {
     "en": "Sometimes", 
     "sv": "Ibland", 
     "rat_sv": "", 
     "k": "b"
    }, 
    {
     "en": "Often", 
     "sv": "Ofta", 
     "rat_sv": "", 
     "k": "c"
    }, 
    {
     "en": "Almost every time", 
     "sv": "Nästan varje gång", 
     "rat_sv": "Beskriver att ett motmedel används i stunden.", 
     "k": "d"
    }
   ], 
   "cue": "HIGH"
  }, 
  {
   "kind": "selfreport", 
   "sv": {
    "prompt": "Hur ofta stämmer det?", 
    "scenario": "När jag har arbetat länge i sträck gör jag de sista kontrollerna snabbare än de första."
   }, 
   "class": "FREQUENCY — REVISED", 
   "slug": "so-rj-c09", 
   "en": {
    "prompt": "How often is that true?", 
    "scenario": "When I have been working for a long stretch, I do the last checks faster than the first ones."
   }, 
   "options": [
    {
     "en": "Rarely", 
     "sv": "Sällan", 
     "rat_sv": "Beskriver ett jämnt arbetstempo från början till slut.", 
     "k": "a"
    }, 
    {
     "en": "Sometimes", 
     "sv": "Ibland", 
     "rat_sv": "", 
     "k": "b"
    }, 
    {
     "en": "Often", 
     "sv": "Ofta", 
     "rat_sv": "", 
     "k": "c"
    }, 
    {
     "en": "Almost every time", 
     "sv": "Nästan varje gång", 
     "rat_sv": "Beskriver att tempot ökar när uppmärksamheten sannolikt är som lägst.", 
     "k": "d"
    }
   ], 
   "cue": "MODERATE"
  }, 
  {
   "kind": "selfreport", 
   "sv": {
    "prompt": "Hur ofta stämmer det?", 
    "scenario": "Jag berättar om händelser från jobbet för familj eller vänner, utan namn men med detaljer."
   }, 
   "class": "FREQUENCY — UNCHANGED", 
   "slug": "so-rj-c10", 
   "en": {
    "prompt": "How often is that true?", 
    "scenario": "I tell family or friends about things that happen at work — without names, but with detail."
   }, 
   "options": [
    {
     "en": "Rarely", 
     "sv": "Sällan", 
     "rat_sv": "Beskriver att arbetsinformation stannar i arbetet.", 
     "k": "a"
    }, 
    {
     "en": "Sometimes", 
     "sv": "Ibland", 
     "rat_sv": "", 
     "k": "b"
    }, 
    {
     "en": "Often", 
     "sv": "Ofta", 
     "rat_sv": "", 
     "k": "c"
    }, 
    {
     "en": "Almost every time", 
     "sv": "Nästan varje gång", 
     "rat_sv": "Beskriver regelmässigt berättande om händelser utanför arbetet.", 
     "k": "d"
    }
   ], 
   "cue": "MODERATE"
  }, 
  {
   "kind": "selfreport", 
   "sv": {
    "prompt": "Hur ofta stämmer det?", 
    "scenario": "När någon ber om information jag inte får lämna ut säger jag vad jag kan säga och hänvisar vidare, i stället för att bara avvisa frågan."
   }, 
   "class": "FREQUENCY — REVISED", 
   "slug": "so-rj-c11", 
   "en": {
    "prompt": "How often is that true?", 
    "scenario": "When somebody asks for information I am not allowed to share, I say what I can say and point them on, rather than simply refusing."
   }, 
   "options": [
    {
     "en": "Rarely", 
     "sv": "Sällan", 
     "rat_sv": "Beskriver ett avvisande utan väg framåt.", 
     "k": "a"
    }, 
    {
     "en": "Sometimes", 
     "sv": "Ibland", 
     "rat_sv": "", 
     "k": "b"
    }, 
    {
     "en": "Often", 
     "sv": "Ofta", 
     "rat_sv": "", 
     "k": "c"
    }, 
    {
     "en": "Almost every time", 
     "sv": "Nästan varje gång", 
     "rat_sv": "Beskriver att det som går att säga sägs och att frågan förs vidare.", 
     "k": "d"
    }
   ], 
   "cue": "HIGH"
  }, 
  {
   "kind": "selfreport", 
   "sv": {
    "prompt": "Hur ofta stämmer det?", 
    "scenario": "Jag använder min egen telefon för att fotografera eller anteckna sådant jag behöver komma ihåg från arbetet."
   }, 
   "class": "FREQUENCY — REVISED", 
   "slug": "so-rj-c12", 
   "en": {
    "prompt": "How often is that true?", 
    "scenario": "I use my own phone to photograph or note things I need to remember from work."
   }, 
   "options": [
    {
     "en": "Rarely", 
     "sv": "Sällan", 
     "rat_sv": "Beskriver att arbetsmaterial hålls i arbetets egna system.", 
     "k": "a"
    }, 
    {
     "en": "Sometimes", 
     "sv": "Ibland", 
     "rat_sv": "", 
     "k": "b"
    }, 
    {
     "en": "Often", 
     "sv": "Ofta", 
     "rat_sv": "", 
     "k": "c"
    }, 
    {
     "en": "Almost every time", 
     "sv": "Nästan varje gång", 
     "rat_sv": "Beskriver att arbetsmaterial regelmässigt hamnar på privat utrustning.", 
     "k": "d"
    }
   ], 
   "cue": "MODERATE"
  }, 
  {
   "kind": "selfreport", 
   "sv": {
    "prompt": "Hur ofta stämmer det?", 
    "scenario": "När jag hittar ett litet fel som ingen annan verkar ha märkt dokumenterar jag det på samma sätt som ett fel andra redan känner till."
   }, 
   "class": "FREQUENCY — REVISED", 
   "slug": "so-rj-c13", 
   "en": {
    "prompt": "How often is that true?", 
    "scenario": "When I find a small error nobody else appears to have noticed, I record it the same way I would one that others already know about."
   }, 
   "options": [
    {
     "en": "Rarely", 
     "sv": "Sällan", 
     "rat_sv": "Beskriver att felet stannar hos personen.", 
     "k": "a"
    }, 
    {
     "en": "Sometimes", 
     "sv": "Ibland", 
     "rat_sv": "", 
     "k": "b"
    }, 
    {
     "en": "Often", 
     "sv": "Ofta", 
     "rat_sv": "", 
     "k": "c"
    }, 
    {
     "en": "Almost every time", 
     "sv": "Nästan varje gång", 
     "rat_sv": "Beskriver att dokumentationen inte beror på om någon annan sett felet.", 
     "k": "d"
    }
   ], 
   "cue": "HIGH"
  }, 
  {
   "kind": "selfreport", 
   "sv": {
    "prompt": "Hur ofta stämmer det?", 
    "scenario": "När jag hinner rätta till ett eget misstag innan det får någon konsekvens nämner jag det inte för någon."
   }, 
   "class": "FREQUENCY — REVISED", 
   "slug": "so-rj-c14", 
   "en": {
    "prompt": "How often is that true?", 
    "scenario": "When I put right a mistake of my own before it has any consequence, I do not mention it to anybody."
   }, 
   "options": [
    {
     "en": "Rarely", 
     "sv": "Sällan", 
     "rat_sv": "Beskriver att även konsekvenslösa avvikelser förs vidare.", 
     "k": "a"
    }, 
    {
     "en": "Sometimes", 
     "sv": "Ibland", 
     "rat_sv": "", 
     "k": "b"
    }, 
    {
     "en": "Often", 
     "sv": "Ofta", 
     "rat_sv": "", 
     "k": "c"
    }, 
    {
     "en": "Almost every time", 
     "sv": "Nästan varje gång", 
     "rat_sv": "Beskriver att konsekvensen avgör om något förs vidare.", 
     "k": "d"
    }
   ], 
   "cue": "MODERATE"
  }, 
  {
   "kind": "selfreport", 
   "sv": {
    "prompt": "Hur ofta stämmer det?", 
    "scenario": "När jag har gjort ett fel ändrar jag något i hur jag utför uppgiften nästa gång — ordningen, ett kontrollsteg eller en anteckning."
   }, 
   "class": "FREQUENCY — REVISED", 
   "slug": "so-rj-c15", 
   "en": {
    "prompt": "How often is that true?", 
    "scenario": "After making a mistake, I change something in how I carry out the task next time — the order, a check step, or a note."
   }, 
   "options": [
    {
     "en": "Rarely", 
     "sv": "Sällan", 
     "rat_sv": "Beskriver avsikt snarare än förändring.", 
     "k": "a"
    }, 
    {
     "en": "Sometimes", 
     "sv": "Ibland", 
     "rat_sv": "", 
     "k": "b"
    }, 
    {
     "en": "Often", 
     "sv": "Ofta", 
     "rat_sv": "", 
     "k": "c"
    }, 
    {
     "en": "Almost every time", 
     "sv": "Nästan varje gång", 
     "rat_sv": "Beskriver en konkret förändring av arbetssättet.", 
     "k": "d"
    }
   ], 
   "cue": "HIGH"
  }, 
  {
   "kind": "selfreport", 
   "sv": {
    "prompt": "Hur ofta stämmer det?", 
    "scenario": "Det är svårare för mig att säga nej till någon jag känner väl än till en främling."
   }, 
   "class": "FREQUENCY — UNCHANGED", 
   "slug": "so-rj-c16", 
   "en": {
    "prompt": "How often is that true?", 
    "scenario": "It is harder for me to say no to somebody I know well than to a stranger."
   }, 
   "options": [
    {
     "en": "Rarely", 
     "sv": "Sällan", 
     "rat_sv": "Beskriver att gränsen inte förskjuts av bekantskap. Notera att den som inte alls känner detta är ovanlig — frågan är avsedd att utforskas i intervju.", 
     "k": "a"
    }, 
    {
     "en": "Sometimes", 
     "sv": "Ibland", 
     "rat_sv": "", 
     "k": "b"
    }, 
    {
     "en": "Often", 
     "sv": "Ofta", 
     "rat_sv": "", 
     "k": "c"
    }, 
    {
     "en": "Almost every time", 
     "sv": "Nästan varje gång", 
     "rat_sv": "Beskriver att bekantskap gör gränsen svårare att hålla.", 
     "k": "d"
    }
   ], 
   "cue": "MODERATE"
  }, 
  {
   "kind": "selfreport", 
   "sv": {
    "prompt": "Hur ofta stämmer det?", 
    "scenario": "När jag säger nej till någon berättar jag samtidigt vem eller vad som kan hjälpa personen vidare."
   }, 
   "class": "FREQUENCY — REVISED", 
   "slug": "so-rj-c17", 
   "en": {
    "prompt": "How often is that true?", 
    "scenario": "When I say no to somebody, I also tell them who or what can help them get further."
   }, 
   "options": [
    {
     "en": "Rarely", 
     "sv": "Sällan", 
     "rat_sv": "Beskriver ett nej utan väg framåt.", 
     "k": "a"
    }, 
    {
     "en": "Sometimes", 
     "sv": "Ibland", 
     "rat_sv": "", 
     "k": "b"
    }, 
    {
     "en": "Often", 
     "sv": "Ofta", 
     "rat_sv": "", 
     "k": "c"
    }, 
    {
     "en": "Almost every time", 
     "sv": "Nästan varje gång", 
     "rat_sv": "Beskriver ett nej med en anvisad väg.", 
     "k": "d"
    }
   ], 
   "cue": "HIGH"
  }, 
  {
   "kind": "selfreport", 
   "sv": {
    "prompt": "Hur ofta stämmer det?", 
    "scenario": "Jag försöker lösa saker själv först, så att jag inte stör någon i onödan."
   }, 
   "class": "DESCRIPTIVE / METHODOLOGICALLY OPEN", 
   "slug": "so-rj-c19", 
   "en": {
    "prompt": "How often is that true?", 
    "scenario": "I try to sort things out myself first, so as not to disturb anybody unnecessarily."
   }, 
   "options": [
    {
     "en": "Rarely", 
     "sv": "Sällan", 
     "rat_sv": "Frekvensen är inte i sig en ordnad kompetensskala: rätt tröskel beror på risk, mandat, tid och instruktion. Keyingen är metodologiskt öppen och prövas mot pilotdata.", 
     "k": "a"
    }, 
    {
     "en": "Sometimes", 
     "sv": "Ibland", 
     "rat_sv": "Beskriver en tröskel som varken är för hög eller obefintlig.", 
     "k": "b"
    }, 
    {
     "en": "Often", 
     "sv": "Ofta", 
     "rat_sv": "", 
     "k": "c"
    }, 
    {
     "en": "Almost every time", 
     "sv": "Nästan varje gång", 
     "rat_sv": "Beskriver en hög tröskel för att kontakta någon, vilket är den vanligaste orsaken till sen eskalering.", 
     "k": "d"
    }
   ], 
   "cue": "MODERATE"
  }, 
  {
   "kind": "selfreport", 
   "sv": {
    "prompt": "Hur ofta stämmer det?", 
    "scenario": "När jag har kallat in någon annan i onödan tar jag upp det efteråt i stället för att låta det passera."
   }, 
   "class": "FREQUENCY — REVISED", 
   "slug": "so-rj-c20", 
   "en": {
    "prompt": "How often is that true?", 
    "scenario": "When I have brought somebody else in unnecessarily, I raise it afterwards rather than letting it go."
   }, 
   "options": [
    {
     "en": "Rarely", 
     "sv": "Sällan", 
     "rat_sv": "Beskriver att den egna felbedömningen inte tas upp.", 
     "k": "a"
    }, 
    {
     "en": "Sometimes", 
     "sv": "Ibland", 
     "rat_sv": "", 
     "k": "b"
    }, 
    {
     "en": "Often", 
     "sv": "Ofta", 
     "rat_sv": "", 
     "k": "c"
    }, 
    {
     "en": "Almost every time", 
     "sv": "Nästan varje gång", 
     "rat_sv": "Beskriver att den egna felbedömningen tas upp.", 
     "k": "d"
    }
   ], 
   "cue": "HIGH"
  }, 
  {
   "kind": "selfreport", 
   "sv": {
    "prompt": "Hur ofta stämmer det?", 
    "scenario": "När jag lämnar över ansvar till någon annan säger jag uttryckligen vad jag inte hann med, inte bara vad jag gjorde."
   }, 
   "class": "FREQUENCY — REVISED", 
   "slug": "so-rj-c21", 
   "en": {
    "prompt": "How often is that true?", 
    "scenario": "When I hand responsibility over to somebody else, I say explicitly what I did not get to, not only what I did."
   }, 
   "options": [
    {
     "en": "Rarely", 
     "sv": "Sällan", 
     "rat_sv": "Beskriver att det ogjorda inte förs vidare.", 
     "k": "a"
    }, 
    {
     "en": "Sometimes", 
     "sv": "Ibland", 
     "rat_sv": "", 
     "k": "b"
    }, 
    {
     "en": "Often", 
     "sv": "Ofta", 
     "rat_sv": "", 
     "k": "c"
    }, 
    {
     "en": "Almost every time", 
     "sv": "Nästan varje gång", 
     "rat_sv": "Beskriver att det ogjorda förs vidare.", 
     "k": "d"
    }
   ], 
   "cue": "HIGH"
  }, 
  {
   "kind": "selfreport", 
   "sv": {
    "prompt": "Hur ofta stämmer det?", 
    "scenario": "Efter en obehaglig ordväxling är jag kortare i tonen mot nästa person jag möter."
   }, 
   "class": "FREQUENCY — REVISED", 
   "slug": "so-rj-c22", 
   "en": {
    "prompt": "How often is that true?", 
    "scenario": "After an unpleasant exchange, I am shorter with the next person I meet."
   }, 
   "options": [
    {
     "en": "Rarely", 
     "sv": "Sällan", 
     "rat_sv": "Beskriver att bemötandet inte färgas av föregående situation.", 
     "k": "a"
    }, 
    {
     "en": "Sometimes", 
     "sv": "Ibland", 
     "rat_sv": "", 
     "k": "b"
    }, 
    {
     "en": "Often", 
     "sv": "Ofta", 
     "rat_sv": "", 
     "k": "c"
    }, 
    {
     "en": "Almost every time", 
     "sv": "Nästan varje gång", 
     "rat_sv": "Beskriver att bemötandet färgas av föregående situation.", 
     "k": "d"
    }
   ], 
   "cue": "MODERATE"
  }, 
  {
   "kind": "selfreport", 
   "sv": {
    "prompt": "Hur ofta stämmer det?", 
    "scenario": "Efter en pressad situation gör jag medvetet något för att komma tillbaka innan jag går vidare till nästa uppgift."
   }, 
   "class": "FREQUENCY — REVISED", 
   "slug": "so-rj-c23", 
   "en": {
    "prompt": "How often is that true?", 
    "scenario": "After a tense situation, I deliberately do something to steady myself before moving on to the next task."
   }, 
   "options": [
    {
     "en": "Rarely", 
     "sv": "Sällan", 
     "rat_sv": "Beskriver att inget medvetet sätt används.", 
     "k": "a"
    }, 
    {
     "en": "Sometimes", 
     "sv": "Ibland", 
     "rat_sv": "", 
     "k": "b"
    }, 
    {
     "en": "Often", 
     "sv": "Ofta", 
     "rat_sv": "", 
     "k": "c"
    }, 
    {
     "en": "Almost every time", 
     "sv": "Nästan varje gång", 
     "rat_sv": "Beskriver att ett medvetet sätt används i stunden.", 
     "k": "d"
    }
   ], 
   "cue": "HIGH"
  }
 ], 
 "forced_choice_untouched": [
  "so-rj-c03", 
  "so-rj-c06", 
  "so-rj-c18", 
  "so-rj-c24"
 ], 
 "methodologically_open": [
  "so-rj-c07", 
  "so-rj-c19"
 ], 
 "review": "vaktare-v1-self-report-quality-2026-09-03", 
 "scale": {
  "en": [
   "Rarely", 
   "Sometimes", 
   "Often", 
   "Almost every time"
  ], 
  "sv": [
   "Sällan", 
   "Ibland", 
   "Ofta", 
   "Nästan varje gång"
  ]
 }, 
 "blocks": [
  {
   "intro_sv": "Tjugofyra frågor om hur du brukar arbeta. Det här är inte ett personlighetstest. Svara utifrån de tillfällen då situationen faktiskt har uppstått, inte utifrån hur det borde se ut. Har du inte arbetat inom bevakning, utgå från annat arbete, praktik eller studier. Svaren redovisas för arbetsgivaren som din egen beskrivning av ditt arbetssätt, aldrig som något vi har observerat.", 
   "key": "c_behaviour", 
   "intro_en": "Twenty-four questions about how you usually work. This is not a personality test. Answer from the occasions when the situation has actually come up, not from how it ought to look. If you have not worked in security, answer from other work, a placement or studies. Your answers are reported to the employer as your own description of how you work, never as something we observed."
  }
 ]
}
$vaktare_selfreport$::jsonb AS doc;

-- Identity, before. Every column this migration promises not to move, for
-- all 50 items -- not only the 24 -- so a stray write anywhere on form A is
-- caught by the same comparison.
CREATE TEMP TABLE _v4_before AS
SELECT i.slug, iv.id AS item_version_id, iv.item_format, iv.evidence_source_type,
       iv.competency_id, iv.facet_id, iv.primary_behaviour_id, iv.content_status,
       iv.validation_status, fi.block_key, fi.display_order AS item_order, fi.randomise_options,
       o.id AS option_id, o.option_key, o.score_value, o.is_preferred, o.reverse_scored,
       o.display_order AS option_order,
       (SELECT count(*) FROM public.scp_review_requirements rr
         WHERE rr.item_version_id = iv.id AND rr.status = 'outstanding') AS outstanding_gates
  FROM public.scp_form_items fi
  JOIN public.scp_forms f ON f.id = fi.form_id
  JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
  JOIN public.scp_items i ON i.id = iv.item_id
  LEFT JOIN public.scp_item_options o ON o.item_version_id = iv.id
 WHERE f.slug = 'security-officer-recruitment-form-a';

-- The 22 scenario and 4 free-text texts, before, verbatim. This migration is
-- about the self-report block and must be able to prove it never reached the
-- rest of the form.
CREATE TEMP TABLE _v4_other_text_before AS
SELECT i.slug, t.language, t.scenario, t.prompt, t.adaptation_status
  FROM public.scp_form_items fi
  JOIN public.scp_forms f ON f.id = fi.form_id
  JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
  JOIN public.scp_items i ON i.id = iv.item_id
  JOIN public.scp_item_texts t ON t.item_version_id = iv.id
 WHERE f.slug = 'security-officer-recruitment-form-a'
   AND iv.evidence_source_type <> 'self_report';

-- The four forced-choice items' labels, before. They are absent from the
-- document; this proves nothing reached them anyway.
CREATE TEMP TABLE _v4_forced_before AS
SELECT i.slug, o.option_key, ot.language, ot.label
  FROM public.scp_items i
  JOIN public.scp_item_versions iv ON iv.item_id = i.id AND iv.version_number = 1
  JOIN public.scp_item_options o ON o.item_version_id = iv.id
  JOIN public.scp_item_option_texts ot ON ot.item_option_id = o.id
 WHERE i.slug IN ('so-rj-c03', 'so-rj-c06', 'so-rj-c18', 'so-rj-c24');

-- ═══════════════════════════════════════════════════════════════════════════
-- Apply. Text, labels, rationale and the section intro. Nothing else is in
-- any UPDATE in this file.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  _doc jsonb; _form uuid; _it jsonb; _o jsonb; _iv uuid; _status text; _oid uuid;
  _n int; _items int := 0; _opts int := 0; _b jsonb; _adapt jsonb; _src text;
BEGIN
  SELECT doc INTO _doc FROM _v4_doc;
  SELECT id INTO _form FROM public.scp_forms WHERE slug = 'security-officer-recruitment-form-a';
  IF _form IS NULL THEN
    RAISE EXCEPTION 'SCP_V4_FORM_MISSING: security-officer-recruitment-form-a is not authored here.';
  END IF;
  _adapt := _doc->'en_adaptation';

  IF jsonb_array_length(_doc->'items') <> 20 THEN
    RAISE EXCEPTION 'SCP_V4_DOC_SHAPE: the document carries % item(s); the 20 frequency items are expected and the 4 forced-choice items must be absent.',
      jsonb_array_length(_doc->'items');
  END IF;

  FOR _it IN SELECT * FROM jsonb_array_elements(_doc->'items') LOOP
    SELECT iv.id, iv.content_status, iv.evidence_source_type INTO _iv, _status, _src
      FROM public.scp_items i
      JOIN public.scp_item_versions iv ON iv.item_id = i.id AND iv.version_number = 1
     WHERE i.slug = _it->>'slug';
    IF _iv IS NULL THEN
      RAISE EXCEPTION 'SCP_V4_ITEM_MISSING: % has no version 1.', _it->>'slug';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.scp_form_items WHERE form_id = _form AND item_version_id = _iv) THEN
      RAISE EXCEPTION 'SCP_V4_ITEM_NOT_ON_FORM: % v1 is not on form A.', _it->>'slug';
    END IF;
    -- This migration may only ever touch self-report. Say so at the row.
    IF _src <> 'self_report' THEN
      RAISE EXCEPTION 'SCP_V4_NOT_SELF_REPORT: % is "%"; this migration edits self-report items only.', _it->>'slug', _src;
    END IF;
    IF _status <> 'draft' THEN
      RAISE EXCEPTION 'SCP_V4_NOT_DRAFT: % v1 is "%"; edit a new version instead.', _it->>'slug', _status;
    END IF;

    UPDATE public.scp_item_texts
       SET scenario = _it#>>'{sv,scenario}', prompt = _it#>>'{sv,prompt}'
     WHERE item_version_id = _iv AND language = 'sv-SE';
    GET DIAGNOSTICS _n = ROW_COUNT;
    IF _n <> 1 THEN RAISE EXCEPTION 'SCP_V4_TEXT_MISSING: % sv-SE', _it->>'slug'; END IF;

    UPDATE public.scp_item_texts
       SET scenario = _it#>>'{en,scenario}', prompt = _it#>>'{en,prompt}',
           adaptation_status = 'adaptation_reviewed',
           adaptation_notes  = _adapt->>'notes',
           reviewed_by       = _adapt->>'reviewed_by',
           reviewed_at       = now()
     WHERE item_version_id = _iv AND language = 'en-GB';
    GET DIAGNOSTICS _n = ROW_COUNT;
    IF _n <> 1 THEN RAISE EXCEPTION 'SCP_V4_TEXT_MISSING: % en-GB', _it->>'slug'; END IF;

    SELECT count(*) INTO _n FROM public.scp_item_options WHERE item_version_id = _iv;
    IF _n <> 4 OR jsonb_array_length(_it->'options') <> 4 THEN
      RAISE EXCEPTION 'SCP_V4_OPTION_COUNT: % has % option(s) in the database and % in the document; four are expected.',
        _it->>'slug', _n, jsonb_array_length(_it->'options');
    END IF;

    FOR _o IN SELECT * FROM jsonb_array_elements(_it->'options') LOOP
      SELECT id INTO _oid FROM public.scp_item_options
       WHERE item_version_id = _iv AND option_key = _o->>'k';
      IF _oid IS NULL THEN
        RAISE EXCEPTION 'SCP_V4_OPTION_MISSING: % option %', _it->>'slug', _o->>'k';
      END IF;
      -- Rationale only. score_value, is_preferred, reverse_scored,
      -- display_order and distractor_error_type are deliberately absent.
      UPDATE public.scp_item_options
         SET scoring_rationale_sv = _o->>'rat_sv'
       WHERE id = _oid;
      UPDATE public.scp_item_option_texts SET label = _o->>'sv'
       WHERE item_option_id = _oid AND language = 'sv-SE';
      GET DIAGNOSTICS _n = ROW_COUNT;
      IF _n <> 1 THEN RAISE EXCEPTION 'SCP_V4_LABEL_MISSING: % % sv-SE', _it->>'slug', _o->>'k'; END IF;
      UPDATE public.scp_item_option_texts SET label = _o->>'en'
       WHERE item_option_id = _oid AND language = 'en-GB';
      GET DIAGNOSTICS _n = ROW_COUNT;
      IF _n <> 1 THEN RAISE EXCEPTION 'SCP_V4_LABEL_MISSING: % % en-GB', _it->>'slug', _o->>'k'; END IF;
      _opts := _opts + 1;
    END LOOP;
    _items := _items + 1;
  END LOOP;

  FOR _b IN SELECT * FROM jsonb_array_elements(_doc->'blocks') LOOP
    IF _b->>'key' <> 'c_behaviour' THEN
      RAISE EXCEPTION 'SCP_V4_BLOCK_SCOPE: % is not the self-report block.', _b->>'key';
    END IF;
    UPDATE public.scp_form_blocks
       SET intro_sv = _b->>'intro_sv', intro_en = _b->>'intro_en'
     WHERE form_id = _form AND block_key = _b->>'key';
    GET DIAGNOSTICS _n = ROW_COUNT;
    IF _n <> 1 THEN RAISE EXCEPTION 'SCP_V4_BLOCK_MISSING: %', _b->>'key'; END IF;
  END LOOP;

  RAISE NOTICE 'vaktare v1 self-report review: % items, % option labels rewritten in both languages', _items, _opts;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Proof. Any failure aborts the transaction and nothing is applied.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  _n int; _m int; _sr int; _sjt int; _cr int; _doc jsonb;
  FREQ_SV constant text[] := ARRAY['Sällan', 'Ibland', 'Ofta', 'Nästan varje gång'];
  FREQ_EN constant text[] := ARRAY['Rarely', 'Sometimes', 'Often', 'Almost every time'];
BEGIN
  SELECT doc INTO _doc FROM _v4_doc;

  -- 1. Identity: not one snapshotted column moved, and not one row appeared
  --    or disappeared.
  SELECT count(*) INTO _n FROM (
    (SELECT * FROM _v4_before EXCEPT
     SELECT i.slug, iv.id, iv.item_format, iv.evidence_source_type, iv.competency_id, iv.facet_id,
            iv.primary_behaviour_id, iv.content_status, iv.validation_status, fi.block_key,
            fi.display_order, fi.randomise_options, o.id, o.option_key, o.score_value,
            o.is_preferred, o.reverse_scored, o.display_order,
            (SELECT count(*) FROM public.scp_review_requirements rr
              WHERE rr.item_version_id = iv.id AND rr.status = 'outstanding')
       FROM public.scp_form_items fi
       JOIN public.scp_forms f ON f.id = fi.form_id
       JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
       JOIN public.scp_items i ON i.id = iv.item_id
       LEFT JOIN public.scp_item_options o ON o.item_version_id = iv.id
      WHERE f.slug = 'security-officer-recruitment-form-a')
    UNION ALL
    (SELECT i.slug, iv.id, iv.item_format, iv.evidence_source_type, iv.competency_id, iv.facet_id,
            iv.primary_behaviour_id, iv.content_status, iv.validation_status, fi.block_key,
            fi.display_order, fi.randomise_options, o.id, o.option_key, o.score_value,
            o.is_preferred, o.reverse_scored, o.display_order,
            (SELECT count(*) FROM public.scp_review_requirements rr
              WHERE rr.item_version_id = iv.id AND rr.status = 'outstanding')
       FROM public.scp_form_items fi
       JOIN public.scp_forms f ON f.id = fi.form_id
       JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
       JOIN public.scp_items i ON i.id = iv.item_id
       LEFT JOIN public.scp_item_options o ON o.item_version_id = iv.id
      WHERE f.slug = 'security-officer-recruitment-form-a'
     EXCEPT SELECT * FROM _v4_before)
  ) d;
  IF _n > 0 THEN
    RAISE EXCEPTION 'SCP_V4_IDENTITY_MOVED: % identity row(s) differ after the edit. Scores, keys, order, competency, facet, behaviour, format, evidence type, status and gates must be byte-identical.', _n;
  END IF;

  -- 2. Scope: no scenario or free-text item was touched, in either language.
  SELECT count(*) INTO _n FROM (
    (SELECT * FROM _v4_other_text_before EXCEPT
     SELECT i.slug, t.language, t.scenario, t.prompt, t.adaptation_status
       FROM public.scp_form_items fi
       JOIN public.scp_forms f ON f.id = fi.form_id
       JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
       JOIN public.scp_items i ON i.id = iv.item_id
       JOIN public.scp_item_texts t ON t.item_version_id = iv.id
      WHERE f.slug = 'security-officer-recruitment-form-a'
        AND iv.evidence_source_type <> 'self_report')
    UNION ALL
    (SELECT i.slug, t.language, t.scenario, t.prompt, t.adaptation_status
       FROM public.scp_form_items fi
       JOIN public.scp_forms f ON f.id = fi.form_id
       JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
       JOIN public.scp_items i ON i.id = iv.item_id
       JOIN public.scp_item_texts t ON t.item_version_id = iv.id
      WHERE f.slug = 'security-officer-recruitment-form-a'
        AND iv.evidence_source_type <> 'self_report'
     EXCEPT SELECT * FROM _v4_other_text_before)
  ) d;
  IF _n > 0 THEN
    RAISE EXCEPTION 'SCP_V4_SCOPE: % non-self-report text row(s) changed. This migration edits the self-report block only.', _n;
  END IF;

  -- 3. Forced choice: c03, c06, c18, c24 are byte-identical, still two
  --    options each, and carry neither frequency label in either language.
  SELECT count(*) INTO _n FROM (
    (SELECT * FROM _v4_forced_before EXCEPT
     SELECT i.slug, o.option_key, ot.language, ot.label
       FROM public.scp_items i
       JOIN public.scp_item_versions iv ON iv.item_id = i.id AND iv.version_number = 1
       JOIN public.scp_item_options o ON o.item_version_id = iv.id
       JOIN public.scp_item_option_texts ot ON ot.item_option_id = o.id
      WHERE i.slug IN ('so-rj-c03', 'so-rj-c06', 'so-rj-c18', 'so-rj-c24'))
    UNION ALL
    (SELECT i.slug, o.option_key, ot.language, ot.label
       FROM public.scp_items i
       JOIN public.scp_item_versions iv ON iv.item_id = i.id AND iv.version_number = 1
       JOIN public.scp_item_options o ON o.item_version_id = iv.id
       JOIN public.scp_item_option_texts ot ON ot.item_option_id = o.id
      WHERE i.slug IN ('so-rj-c03', 'so-rj-c06', 'so-rj-c18', 'so-rj-c24')
     EXCEPT SELECT * FROM _v4_forced_before)
  ) d;
  IF _n > 0 THEN
    RAISE EXCEPTION 'SCP_V4_FORCED_CHOICE_MOVED: % label row(s) on c03/c06/c18/c24 changed. Forced-choice items are not four-point frequency items and this review does not touch them.', _n;
  END IF;
  SELECT count(*) INTO _n
    FROM public.scp_items i
    JOIN public.scp_item_versions iv ON iv.item_id = i.id AND iv.version_number = 1
   WHERE i.slug IN ('so-rj-c03', 'so-rj-c06', 'so-rj-c18', 'so-rj-c24')
     AND (SELECT count(*) FROM public.scp_item_options o WHERE o.item_version_id = iv.id) = 2;
  IF _n <> 4 THEN
    RAISE EXCEPTION 'SCP_V4_FORCED_CHOICE_SHAPE: % of 4 forced-choice items still hold exactly two options.', _n;
  END IF;
  SELECT count(*) INTO _n
    FROM public.scp_items i
    JOIN public.scp_item_versions iv ON iv.item_id = i.id AND iv.version_number = 1
    JOIN public.scp_item_options o ON o.item_version_id = iv.id
    JOIN public.scp_item_option_texts ot ON ot.item_option_id = o.id
   WHERE i.slug IN ('so-rj-c03', 'so-rj-c06', 'so-rj-c18', 'so-rj-c24')
     AND (ot.label = ANY (FREQ_SV) OR ot.label = ANY (FREQ_EN));
  IF _n > 0 THEN
    RAISE EXCEPTION 'SCP_V4_FORCED_CHOICE_LABELLED: % forced-choice option(s) now carry a frequency label.', _n;
  END IF;

  -- 4. Shape: still 50 = 22 + 24 + 4, still 24 self-report in authored order.
  SELECT count(*),
         count(*) FILTER (WHERE iv.item_format = 'sjt_best_response'),
         count(*) FILTER (WHERE iv.item_format = 'biq_frequency'),
         count(*) FILTER (WHERE iv.item_format = 'constructed_response')
    INTO _n, _sjt, _sr, _cr
    FROM public.scp_form_items fi JOIN public.scp_forms f ON f.id = fi.form_id
    JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
   WHERE f.slug = 'security-officer-recruitment-form-a';
  IF _n <> 50 OR _sjt <> 22 OR _sr <> 24 OR _cr <> 4 THEN
    RAISE EXCEPTION 'SCP_V4_SHAPE: expected 50 = 22 scenario + 24 self-report + 4 free text, found % = % + % + %.', _n, _sjt, _sr, _cr;
  END IF;

  -- 5. All 24 are self_report, and self_report does not count toward
  --    maturity. No self-report answer can create an evidence level.
  SELECT count(*) INTO _n
    FROM public.scp_form_items fi JOIN public.scp_forms f ON f.id = fi.form_id
    JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
   WHERE f.slug = 'security-officer-recruitment-form-a'
     AND iv.item_format = 'biq_frequency'
     AND iv.evidence_source_type = 'self_report'
     AND NOT fi.randomise_options;
  IF _n <> 24 THEN
    RAISE EXCEPTION 'SCP_V4_SELF_REPORT: expected 24 self_report items in authored (unrandomised) order, found %.', _n;
  END IF;
  SELECT count(*) INTO _n
    FROM public.scp_evidence_source_types
   WHERE code = 'self_report' AND NOT counts_toward_maturity;
  IF _n <> 1 THEN
    RAISE EXCEPTION 'SCP_V4_MATURITY: self_report no longer carries counts_toward_maturity = false.';
  END IF;

  -- 6. The scale: the 20 frequency items carry exactly the four approved
  --    labels, in authored option order, in both languages.
  SELECT count(*) INTO _n
    FROM public.scp_form_items fi JOIN public.scp_forms f ON f.id = fi.form_id
    JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
   WHERE f.slug = 'security-officer-recruitment-form-a'
     AND iv.evidence_source_type = 'self_report'
     AND (SELECT count(*) FROM public.scp_item_options o WHERE o.item_version_id = iv.id) = 4
     AND (SELECT array_agg(ot.label ORDER BY o.display_order)
            FROM public.scp_item_options o
            JOIN public.scp_item_option_texts ot ON ot.item_option_id = o.id AND ot.language = 'sv-SE'
           WHERE o.item_version_id = iv.id) = FREQ_SV
     AND (SELECT array_agg(ot.label ORDER BY o.display_order)
            FROM public.scp_item_options o
            JOIN public.scp_item_option_texts ot ON ot.item_option_id = o.id AND ot.language = 'en-GB'
           WHERE o.item_version_id = iv.id) = FREQ_EN;
  IF _n <> 20 THEN
    RAISE EXCEPTION 'SCP_V4_SCALE: % of 20 four-point self-report items carry the approved scale in both languages, in order.', _n;
  END IF;

  -- 7. c07 and c19: self_report, non-maturity, and their technical keying is
  --    exactly what it was authored as. Both are methodologically open by
  --    Product Owner decision; open means documented, not rescored.
  SELECT count(*) INTO _n
    FROM public.scp_items i JOIN public.scp_item_versions iv ON iv.item_id = i.id AND iv.version_number = 1
   WHERE i.slug IN ('so-rj-c07', 'so-rj-c19')
     AND iv.evidence_source_type = 'self_report' AND iv.item_format = 'biq_frequency'
     AND EXISTS (SELECT 1 FROM public.scp_evidence_source_types t
                  WHERE t.code = iv.evidence_source_type AND NOT t.counts_toward_maturity);
  IF _n <> 2 THEN
    RAISE EXCEPTION 'SCP_V4_C07_C19: expected c07 and c19 to be self_report (non-maturity) frequency items, found %.', _n;
  END IF;
  SELECT count(*) INTO _n
    FROM public.scp_items i JOIN public.scp_item_versions iv ON iv.item_id = i.id AND iv.version_number = 1
   WHERE (i.slug = 'so-rj-c07'
          AND (SELECT array_agg(o.score_value ORDER BY o.display_order)
                 FROM public.scp_item_options o WHERE o.item_version_id = iv.id) = ARRAY[0, 2, 3, 2]::numeric[]
          AND NOT EXISTS (SELECT 1 FROM public.scp_item_options o
                           WHERE o.item_version_id = iv.id AND (o.reverse_scored OR o.is_preferred)))
      OR (i.slug = 'so-rj-c19'
          AND (SELECT array_agg(o.score_value ORDER BY o.display_order)
                 FROM public.scp_item_options o WHERE o.item_version_id = iv.id) = ARRAY[2, 3, 1, 0]::numeric[]
          AND NOT EXISTS (SELECT 1 FROM public.scp_item_options o
                           WHERE o.item_version_id = iv.id AND NOT o.reverse_scored));
  IF _n <> 2 THEN
    RAISE EXCEPTION 'SCP_V4_C07_C19_KEYING: c07 must key 0/2/3/2 (not reverse-scored) and c19 2/3/1/0 (reverse-scored) in display order; found % of 2 intact.', _n;
  END IF;

  -- 8. Both languages on every self-report item and label, no empty text.
  SELECT count(*) INTO _n
    FROM public.scp_form_items fi JOIN public.scp_forms f ON f.id = fi.form_id
    JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
   WHERE f.slug = 'security-officer-recruitment-form-a'
     AND iv.evidence_source_type = 'self_report'
     AND (SELECT count(*) FROM public.scp_item_texts t
           WHERE t.item_version_id = iv.id AND t.language IN ('sv-SE','en-GB')
             AND length(trim(t.scenario)) > 0 AND length(trim(t.prompt)) > 0) <> 2;
  IF _n > 0 THEN RAISE EXCEPTION 'SCP_V4_LANGUAGE_GAP: % self-report item(s) lack a complete sv-SE + en-GB text.', _n; END IF;
  SELECT count(*) INTO _n
    FROM public.scp_form_items fi JOIN public.scp_forms f ON f.id = fi.form_id
    JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
    JOIN public.scp_item_options o ON o.item_version_id = iv.id
   WHERE f.slug = 'security-officer-recruitment-form-a'
     AND iv.evidence_source_type = 'self_report'
     AND (SELECT count(*) FROM public.scp_item_option_texts ot
           WHERE ot.item_option_id = o.id AND ot.language IN ('sv-SE','en-GB')
             AND length(trim(ot.label)) > 0) <> 2;
  IF _n > 0 THEN RAISE EXCEPTION 'SCP_V4_OPTION_LANGUAGE_GAP: % self-report option(s) lack a complete sv-SE + en-GB label.', _n; END IF;

  -- 9. Governance honesty is unchanged: draft/design, AI-authored, five gates
  --    outstanding on every item, and no adaptation status raised to
  --    approved/source. 'adaptation_reviewed' is not 'approved'.
  SELECT count(*) INTO _n
    FROM public.scp_form_items fi JOIN public.scp_forms f ON f.id = fi.form_id
    JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
   WHERE f.slug = 'security-officer-recruitment-form-a'
     AND (iv.content_status <> 'draft' OR iv.validation_status <> 'design' OR NOT iv.authored_by_ai
       OR iv.sme_review_status <> 'pending' OR iv.language_review_status <> 'pending'
       OR iv.cognitive_review_status <> 'pending' OR iv.accessibility_review_status <> 'pending'
       OR iv.bias_review_status <> 'pending'
       OR (SELECT count(*) FROM public.scp_review_requirements rr
            WHERE rr.item_version_id = iv.id AND rr.status = 'outstanding') <> 5);
  IF _n > 0 THEN RAISE EXCEPTION 'SCP_V4_GOVERNANCE_CLAIM: % item(s) claim review they have not had.', _n; END IF;
  SELECT count(*) INTO _n
    FROM public.scp_form_items fi JOIN public.scp_forms f ON f.id = fi.form_id
    JOIN public.scp_item_texts t ON t.item_version_id = fi.item_version_id
   WHERE f.slug = 'security-officer-recruitment-form-a'
     AND t.adaptation_status IN ('approved', 'source');
  IF _n > 0 THEN RAISE EXCEPTION 'SCP_V4_ADAPTATION_OVERCLAIM: % text(s) claim approved/source status.', _n; END IF;

  -- 10. The section intro says what self-report is, and no longer claims
  --     there is no answer key while the scores differ.
  SELECT count(*) INTO _n
    FROM public.scp_form_blocks b JOIN public.scp_forms f ON f.id = b.form_id
   WHERE f.slug = 'security-officer-recruitment-form-a' AND b.block_key = 'c_behaviour'
     AND b.intro_sv NOT LIKE '%facit%' AND b.intro_en NOT LIKE '%answer key%'
     AND b.intro_sv LIKE '%faktiskt har uppstått%' AND b.intro_en LIKE '%actually come up%'
     AND b.intro_sv LIKE '%aldrig som något vi har observerat%'
     AND b.intro_en LIKE '%never as something we observed%';
  IF _n <> 1 THEN
    RAISE EXCEPTION 'SCP_V4_INTRO: the self-report section intro must tell the candidate to answer from occasions that arose and that answers are never reported as observed, and must not claim there is no answer key.';
  END IF;

  RAISE NOTICE 'vaktare v1 self-report proven: identity unchanged, 50 = 22 + 24 + 4, 24 self_report out of maturity, 20 items on the approved four-point scale, c03/c06/c18/c24 untouched, c07/c19 keying intact';
END $$;

DROP TABLE IF EXISTS _v4_before;
DROP TABLE IF EXISTS _v4_other_text_before;
DROP TABLE IF EXISTS _v4_forced_before;
DROP TABLE IF EXISTS _v4_doc;
