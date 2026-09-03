-- Rollback for 20261023090000_scp_vaktare_v1_self_report_quality.sql.
--
-- Restores the 20 four-point self-report items -- stems, the four option
-- labels in both languages and scoring_rationale_sv -- and the self-report
-- section intro exactly as 20261022090000 (PR-V3) left them, including the
-- absolute scale end points ("Nästan aldrig" / "Nästan alltid") that PR-V4
-- replaced, and returns the en-GB adaptation note and reviewer to the V3
-- review's values. This document was generated from that migration's own
-- content document, so the restored state is that file's, not a transcription
-- of it.
--
-- c03, c06, c18 and c24 are absent here for the same reason they are absent
-- from the migration: PR-V4 never wrote to them, so a rollback has nothing to
-- restore. Same applier and the same identity proof in both directions: no
-- score, key, order, preference, reverse flag, mapping, format, evidence type,
-- status or gate moves. The same deploy precondition applies: it refuses while
-- an attempt on form A is in_progress or submitted.

DO $$
DECLARE _form uuid; _in_progress int; _submitted int;
BEGIN
  SELECT id INTO _form FROM public.scp_forms WHERE slug = 'security-officer-recruitment-form-a';
  IF _form IS NULL THEN RETURN; END IF;
  SELECT count(*) FILTER (WHERE status = 'in_progress'), count(*) FILTER (WHERE status = 'submitted')
    INTO _in_progress, _submitted FROM public.scp_attempts WHERE form_id = _form;
  IF _in_progress > 0 OR _submitted > 0 THEN
    RAISE EXCEPTION 'SCP_V4_ATTEMPTS_IN_FLIGHT: % in progress, % awaiting review on form A.', _in_progress, _submitted;
  END IF;
END $$;

CREATE TEMP TABLE _v4_rb_doc AS
SELECT $vaktare_selfreport$
{
 "scale": {
  "en": [
   "Almost never", 
   "Sometimes", 
   "Often", 
   "Almost always"
  ], 
  "sv": [
   "Nästan aldrig", 
   "Ibland", 
   "Ofta", 
   "Nästan alltid"
  ]
 }, 
 "review": "rollback-to-v3-20261022090000", 
 "items": [
  {
   "en": {
    "scenario": "If a procedure feels unnecessarily long and the situation looks straightforward, I simplify the steps.", 
    "prompt": "How often is that true?"
   }, 
   "kind": "selfreport", 
   "options": [
    {
     "en": "Almost never", 
     "k": "a", 
     "rat_sv": "Beskriver att genvägen inte tas.", 
     "sv": "Nästan aldrig"
    }, 
    {
     "en": "Sometimes", 
     "k": "b", 
     "rat_sv": "", 
     "sv": "Ibland"
    }, 
    {
     "en": "Often", 
     "k": "c", 
     "rat_sv": "", 
     "sv": "Ofta"
    }, 
    {
     "en": "Almost always", 
     "k": "d", 
     "rat_sv": "Beskriver att genvägen tas regelmässigt.", 
     "sv": "Nästan alltid"
    }
   ], 
   "sv": {
    "scenario": "Om en rutin känns onödigt lång och situationen ser okomplicerad ut förenklar jag stegen.", 
    "prompt": "Hur ofta stämmer det?"
   }, 
   "slug": "so-rj-c01"
  }, 
  {
   "en": {
    "scenario": "When I depart from a procedure I write down why, even when the departure was obviously reasonable.", 
    "prompt": "How often is that true?"
   }, 
   "kind": "selfreport", 
   "options": [
    {
     "en": "Almost never", 
     "k": "a", 
     "rat_sv": "Beskriver att avsteg inte dokumenteras.", 
     "sv": "Nästan aldrig"
    }, 
    {
     "en": "Sometimes", 
     "k": "b", 
     "rat_sv": "", 
     "sv": "Ibland"
    }, 
    {
     "en": "Often", 
     "k": "c", 
     "rat_sv": "", 
     "sv": "Ofta"
    }, 
    {
     "en": "Almost always", 
     "k": "d", 
     "rat_sv": "Beskriver att avsteg dokumenteras genomgående.", 
     "sv": "Nästan alltid"
    }
   ], 
   "sv": {
    "scenario": "När jag avviker från en rutin skriver jag ner varför, även när avvikelsen var uppenbart rimlig.", 
    "prompt": "Hur ofta stämmer det?"
   }, 
   "slug": "so-rj-c02"
  }, 
  {
   "en": {
    "scenario": "When I notice something small that is out of place, I rely on remembering it.", 
    "prompt": "How often is that true?"
   }, 
   "kind": "selfreport", 
   "options": [
    {
     "en": "Almost never", 
     "k": "a", 
     "rat_sv": "Beskriver att iakttagelsen förs vidare.", 
     "sv": "Nästan aldrig"
    }, 
    {
     "en": "Sometimes", 
     "k": "b", 
     "rat_sv": "", 
     "sv": "Ibland"
    }, 
    {
     "en": "Often", 
     "k": "c", 
     "rat_sv": "", 
     "sv": "Ofta"
    }, 
    {
     "en": "Almost always", 
     "k": "d", 
     "rat_sv": "Beskriver att iakttagelsen stannar i huvudet.", 
     "sv": "Nästan alltid"
    }
   ], 
   "sv": {
    "scenario": "När jag lägger märke till något litet som avviker nöjer jag mig med att komma ihåg det.", 
    "prompt": "Hur ofta stämmer det?"
   }, 
   "slug": "so-rj-c04"
  }, 
  {
   "en": {
    "scenario": "I write down the time and place as soon as I see something, not afterwards.", 
    "prompt": "How often is that true?"
   }, 
   "kind": "selfreport", 
   "options": [
    {
     "en": "Almost never", 
     "k": "a", 
     "rat_sv": "Beskriver att anteckningen görs i efterhand eller inte alls.", 
     "sv": "Nästan aldrig"
    }, 
    {
     "en": "Sometimes", 
     "k": "b", 
     "rat_sv": "", 
     "sv": "Ibland"
    }, 
    {
     "en": "Often", 
     "k": "c", 
     "rat_sv": "", 
     "sv": "Ofta"
    }, 
    {
     "en": "Almost always", 
     "k": "d", 
     "rat_sv": "Beskriver att anteckningen görs på plats.", 
     "sv": "Nästan alltid"
    }
   ], 
   "sv": {
    "scenario": "Jag antecknar tid och plats direkt när jag ser något, inte i efterhand.", 
    "prompt": "Hur ofta stämmer det?"
   }, 
   "slug": "so-rj-c05"
  }, 
  {
   "en": {
    "scenario": "After doing the same check many times, I need to remind myself not to go on autopilot.", 
    "prompt": "How often is that true?"
   }, 
   "kind": "selfreport", 
   "options": [
    {
     "en": "Almost never", 
     "k": "a", 
     "rat_sv": "Att aldrig känna igen fenomenet är i sig något att fråga om — inte ett tecken på uthållighet.", 
     "sv": "Nästan aldrig"
    }, 
    {
     "en": "Sometimes", 
     "k": "b", 
     "rat_sv": "", 
     "sv": "Ibland"
    }, 
    {
     "en": "Often", 
     "k": "c", 
     "rat_sv": "Beskriver aktiv självobservation, vilket är det som går att arbeta med.", 
     "sv": "Ofta"
    }, 
    {
     "en": "Almost always", 
     "k": "d", 
     "rat_sv": "", 
     "sv": "Nästan alltid"
    }
   ], 
   "sv": {
    "scenario": "När jag har gjort samma kontroll många gånger behöver jag påminna mig själv om att inte gå på autopilot.", 
    "prompt": "Hur ofta stämmer det?"
   }, 
   "slug": "so-rj-c07"
  }, 
  {
   "en": {
    "scenario": "I have a concrete way of breaking the routine when my attention starts to slip — changing the order, or taking a short break.", 
    "prompt": "How often is that true?"
   }, 
   "kind": "selfreport", 
   "options": [
    {
     "en": "Almost never", 
     "k": "a", 
     "rat_sv": "Beskriver att inget motmedel finns.", 
     "sv": "Nästan aldrig"
    }, 
    {
     "en": "Sometimes", 
     "k": "b", 
     "rat_sv": "", 
     "sv": "Ibland"
    }, 
    {
     "en": "Often", 
     "k": "c", 
     "rat_sv": "", 
     "sv": "Ofta"
    }, 
    {
     "en": "Almost always", 
     "k": "d", 
     "rat_sv": "Beskriver ett etablerat motmedel.", 
     "sv": "Nästan alltid"
    }
   ], 
   "sv": {
    "scenario": "Jag har ett konkret sätt att bryta rutinen när uppmärksamheten börjar svikta, till exempel att byta ordning eller ta en kort paus.", 
    "prompt": "Hur ofta stämmer det?"
   }, 
   "slug": "so-rj-c08"
  }, 
  {
   "en": {
    "scenario": "Towards the end of a long shift I do the last checks faster than the first ones.", 
    "prompt": "How often is that true?"
   }, 
   "kind": "selfreport", 
   "options": [
    {
     "en": "Almost never", 
     "k": "a", 
     "rat_sv": "Beskriver ett jämnt arbetstempo genom passet.", 
     "sv": "Nästan aldrig"
    }, 
    {
     "en": "Sometimes", 
     "k": "b", 
     "rat_sv": "", 
     "sv": "Ibland"
    }, 
    {
     "en": "Often", 
     "k": "c", 
     "rat_sv": "", 
     "sv": "Ofta"
    }, 
    {
     "en": "Almost always", 
     "k": "d", 
     "rat_sv": "Beskriver att tempot ökar när uppmärksamheten sannolikt är som lägst.", 
     "sv": "Nästan alltid"
    }
   ], 
   "sv": {
    "scenario": "Mot slutet av ett långt pass gör jag de sista kontrollerna snabbare än de första.", 
    "prompt": "Hur ofta stämmer det?"
   }, 
   "slug": "so-rj-c09"
  }, 
  {
   "en": {
    "scenario": "I tell family or friends about things that happen at work — without names, but with detail.", 
    "prompt": "How often is that true?"
   }, 
   "kind": "selfreport", 
   "options": [
    {
     "en": "Almost never", 
     "k": "a", 
     "rat_sv": "Beskriver att arbetsinformation stannar i arbetet.", 
     "sv": "Nästan aldrig"
    }, 
    {
     "en": "Sometimes", 
     "k": "b", 
     "rat_sv": "", 
     "sv": "Ibland"
    }, 
    {
     "en": "Often", 
     "k": "c", 
     "rat_sv": "", 
     "sv": "Ofta"
    }, 
    {
     "en": "Almost always", 
     "k": "d", 
     "rat_sv": "Beskriver regelmässigt berättande om händelser utanför arbetet.", 
     "sv": "Nästan alltid"
    }
   ], 
   "sv": {
    "scenario": "Jag berättar om händelser från jobbet för familj eller vänner, utan namn men med detaljer.", 
    "prompt": "Hur ofta stämmer det?"
   }, 
   "slug": "so-rj-c10"
  }, 
  {
   "en": {
    "scenario": "When I cannot share information I explain why, rather than just saying that I cannot.", 
    "prompt": "How often is that true?"
   }, 
   "kind": "selfreport", 
   "options": [
    {
     "en": "Almost never", 
     "k": "a", 
     "rat_sv": "Beskriver ett nej utan skäl.", 
     "sv": "Nästan aldrig"
    }, 
    {
     "en": "Sometimes", 
     "k": "b", 
     "rat_sv": "", 
     "sv": "Ibland"
    }, 
    {
     "en": "Often", 
     "k": "c", 
     "rat_sv": "", 
     "sv": "Ofta"
    }, 
    {
     "en": "Almost always", 
     "k": "d", 
     "rat_sv": "Beskriver att skälet förklaras.", 
     "sv": "Nästan alltid"
    }
   ], 
   "sv": {
    "scenario": "När jag inte kan lämna ut information förklarar jag varför, i stället för att bara säga att det inte går.", 
    "prompt": "Hur ofta stämmer det?"
   }, 
   "slug": "so-rj-c11"
  }, 
  {
   "en": {
    "scenario": "I use my own phone to photograph or note things I need to remember from a shift or working day.", 
    "prompt": "How often is that true?"
   }, 
   "kind": "selfreport", 
   "options": [
    {
     "en": "Almost never", 
     "k": "a", 
     "rat_sv": "Beskriver att arbetsmaterial hålls i arbetets egna system.", 
     "sv": "Nästan aldrig"
    }, 
    {
     "en": "Sometimes", 
     "k": "b", 
     "rat_sv": "", 
     "sv": "Ibland"
    }, 
    {
     "en": "Often", 
     "k": "c", 
     "rat_sv": "", 
     "sv": "Ofta"
    }, 
    {
     "en": "Almost always", 
     "k": "d", 
     "rat_sv": "Beskriver att arbetsmaterial regelmässigt hamnar på privat utrustning.", 
     "sv": "Nästan alltid"
    }
   ], 
   "sv": {
    "scenario": "Jag använder min egen telefon för att fotografera eller anteckna sådant jag behöver komma ihåg från ett arbetspass.", 
    "prompt": "Hur ofta stämmer det?"
   }, 
   "slug": "so-rj-c12"
  }, 
  {
   "en": {
    "scenario": "If I notice a small mistake that nobody else appears to have seen, I still report or document it.", 
    "prompt": "How often is that true?"
   }, 
   "kind": "selfreport", 
   "options": [
    {
     "en": "Almost never", 
     "k": "a", 
     "rat_sv": "Beskriver att felet stannar hos personen.", 
     "sv": "Nästan aldrig"
    }, 
    {
     "en": "Sometimes", 
     "k": "b", 
     "rat_sv": "", 
     "sv": "Ibland"
    }, 
    {
     "en": "Often", 
     "k": "c", 
     "rat_sv": "", 
     "sv": "Ofta"
    }, 
    {
     "en": "Almost always", 
     "k": "d", 
     "rat_sv": "Beskriver att felet rapporteras oavsett upptäcktsrisk.", 
     "sv": "Nästan alltid"
    }
   ], 
   "sv": {
    "scenario": "Om jag upptäcker ett litet fel som ingen annan verkar ha sett rapporterar eller dokumenterar jag det ändå.", 
    "prompt": "Hur ofta stämmer det?"
   }, 
   "slug": "so-rj-c13"
  }, 
  {
   "en": {
    "scenario": "If I put right a mistake of my own that had no consequence, I leave it unreported.", 
    "prompt": "How often is that true?"
   }, 
   "kind": "selfreport", 
   "options": [
    {
     "en": "Almost never", 
     "k": "a", 
     "rat_sv": "Beskriver att även konsekvenslösa avvikelser dokumenteras.", 
     "sv": "Nästan aldrig"
    }, 
    {
     "en": "Sometimes", 
     "k": "b", 
     "rat_sv": "", 
     "sv": "Ibland"
    }, 
    {
     "en": "Often", 
     "k": "c", 
     "rat_sv": "", 
     "sv": "Ofta"
    }, 
    {
     "en": "Almost always", 
     "k": "d", 
     "rat_sv": "Beskriver att konsekvensen avgör om något dokumenteras.", 
     "sv": "Nästan alltid"
    }
   ], 
   "sv": {
    "scenario": "Om jag rättar till ett eget misstag som inte fick någon konsekvens låter jag bli att rapportera det.", 
    "prompt": "Hur ofta stämmer det?"
   }, 
   "slug": "so-rj-c14"
  }, 
  {
   "en": {
    "scenario": "After making a mistake I change something concrete in how I work, not just how careful I intend to be.", 
    "prompt": "How often is that true?"
   }, 
   "kind": "selfreport", 
   "options": [
    {
     "en": "Almost never", 
     "k": "a", 
     "rat_sv": "Beskriver avsikt snarare än förändring.", 
     "sv": "Nästan aldrig"
    }, 
    {
     "en": "Sometimes", 
     "k": "b", 
     "rat_sv": "", 
     "sv": "Ibland"
    }, 
    {
     "en": "Often", 
     "k": "c", 
     "rat_sv": "", 
     "sv": "Ofta"
    }, 
    {
     "en": "Almost always", 
     "k": "d", 
     "rat_sv": "Beskriver en konkret förändring av arbetssättet.", 
     "sv": "Nästan alltid"
    }
   ], 
   "sv": {
    "scenario": "När jag gjort ett fel ändrar jag något konkret i hur jag arbetar, inte bara hur noga jag tänker vara.", 
    "prompt": "Hur ofta stämmer det?"
   }, 
   "slug": "so-rj-c15"
  }, 
  {
   "en": {
    "scenario": "It is harder for me to say no to somebody I know well than to a stranger.", 
    "prompt": "How often is that true?"
   }, 
   "kind": "selfreport", 
   "options": [
    {
     "en": "Almost never", 
     "k": "a", 
     "rat_sv": "Beskriver att gränsen inte förskjuts av bekantskap. Notera att den som aldrig känner detta är ovanlig — frågan är avsedd att utforskas i intervju.", 
     "sv": "Nästan aldrig"
    }, 
    {
     "en": "Sometimes", 
     "k": "b", 
     "rat_sv": "", 
     "sv": "Ibland"
    }, 
    {
     "en": "Often", 
     "k": "c", 
     "rat_sv": "", 
     "sv": "Ofta"
    }, 
    {
     "en": "Almost always", 
     "k": "d", 
     "rat_sv": "Beskriver att bekantskap gör gränsen svårare att hålla.", 
     "sv": "Nästan alltid"
    }
   ], 
   "sv": {
    "scenario": "Det är svårare för mig att säga nej till någon jag känner väl än till en främling.", 
    "prompt": "Hur ofta stämmer det?"
   }, 
   "slug": "so-rj-c16"
  }, 
  {
   "en": {
    "scenario": "When I say no I try at the same time to offer a way for the person to get their business done.", 
    "prompt": "How often is that true?"
   }, 
   "kind": "selfreport", 
   "options": [
    {
     "en": "Almost never", 
     "k": "a", 
     "rat_sv": "Beskriver ett nej utan väg framåt.", 
     "sv": "Nästan aldrig"
    }, 
    {
     "en": "Sometimes", 
     "k": "b", 
     "rat_sv": "", 
     "sv": "Ibland"
    }, 
    {
     "en": "Often", 
     "k": "c", 
     "rat_sv": "", 
     "sv": "Ofta"
    }, 
    {
     "en": "Almost always", 
     "k": "d", 
     "rat_sv": "Beskriver ett nej med en anvisad väg.", 
     "sv": "Nästan alltid"
    }
   ], 
   "sv": {
    "scenario": "När jag säger nej försöker jag samtidigt erbjuda ett sätt för personen att lösa sitt ärende.", 
    "prompt": "Hur ofta stämmer det?"
   }, 
   "slug": "so-rj-c17"
  }, 
  {
   "en": {
    "scenario": "I try to sort things out myself first, so as not to disturb anybody unnecessarily.", 
    "prompt": "How often is that true?"
   }, 
   "kind": "selfreport", 
   "options": [
    {
     "en": "Almost never", 
     "k": "a", 
     "rat_sv": "", 
     "sv": "Nästan aldrig"
    }, 
    {
     "en": "Sometimes", 
     "k": "b", 
     "rat_sv": "Beskriver en tröskel som varken är för hög eller obefintlig.", 
     "sv": "Ibland"
    }, 
    {
     "en": "Often", 
     "k": "c", 
     "rat_sv": "", 
     "sv": "Ofta"
    }, 
    {
     "en": "Almost always", 
     "k": "d", 
     "rat_sv": "Beskriver en hög tröskel för att kontakta någon, vilket är den vanligaste orsaken till sen eskalering.", 
     "sv": "Nästan alltid"
    }
   ], 
   "sv": {
    "scenario": "Jag försöker lösa saker själv först, så att jag inte stör någon i onödan.", 
    "prompt": "Hur ofta stämmer det?"
   }, 
   "slug": "so-rj-c19"
  }, 
  {
   "en": {
    "scenario": "If I have raised an alarm unnecessarily, I bring it up afterwards rather than letting it go.", 
    "prompt": "How often is that true?"
   }, 
   "kind": "selfreport", 
   "options": [
    {
     "en": "Almost never", 
     "k": "a", 
     "rat_sv": "Beskriver att den egna felbedömningen inte tas upp.", 
     "sv": "Nästan aldrig"
    }, 
    {
     "en": "Sometimes", 
     "k": "b", 
     "rat_sv": "", 
     "sv": "Ibland"
    }, 
    {
     "en": "Often", 
     "k": "c", 
     "rat_sv": "", 
     "sv": "Ofta"
    }, 
    {
     "en": "Almost always", 
     "k": "d", 
     "rat_sv": "Beskriver att den egna felbedömningen tas upp.", 
     "sv": "Nästan alltid"
    }
   ], 
   "sv": {
    "scenario": "Om jag har larmat i onödan tar jag upp det efteråt i stället för att låta det passera.", 
    "prompt": "Hur ofta stämmer det?"
   }, 
   "slug": "so-rj-c20"
  }, 
  {
   "en": {
    "scenario": "When I finish for the day I say explicitly what I did not get to, not only what I did.", 
    "prompt": "How often is that true?"
   }, 
   "kind": "selfreport", 
   "options": [
    {
     "en": "Almost never", 
     "k": "a", 
     "rat_sv": "Beskriver att det ogjorda inte förs vidare.", 
     "sv": "Nästan aldrig"
    }, 
    {
     "en": "Sometimes", 
     "k": "b", 
     "rat_sv": "", 
     "sv": "Ibland"
    }, 
    {
     "en": "Often", 
     "k": "c", 
     "rat_sv": "", 
     "sv": "Ofta"
    }, 
    {
     "en": "Almost always", 
     "k": "d", 
     "rat_sv": "Beskriver att det ogjorda förs vidare.", 
     "sv": "Nästan alltid"
    }
   ], 
   "sv": {
    "scenario": "När jag slutar för dagen säger jag uttryckligen vad jag inte hann med, inte bara vad jag gjorde.", 
    "prompt": "Hur ofta stämmer det?"
   }, 
   "slug": "so-rj-c21"
  }, 
  {
   "en": {
    "scenario": "After an unpleasant exchange I notice that I am shorter with the next person I meet.", 
    "prompt": "How often is that true?"
   }, 
   "kind": "selfreport", 
   "options": [
    {
     "en": "Almost never", 
     "k": "a", 
     "rat_sv": "Beskriver att bemötandet inte färgas av föregående situation.", 
     "sv": "Nästan aldrig"
    }, 
    {
     "en": "Sometimes", 
     "k": "b", 
     "rat_sv": "", 
     "sv": "Ibland"
    }, 
    {
     "en": "Often", 
     "k": "c", 
     "rat_sv": "", 
     "sv": "Ofta"
    }, 
    {
     "en": "Almost always", 
     "k": "d", 
     "rat_sv": "Beskriver att bemötandet färgas av föregående situation.", 
     "sv": "Nästan alltid"
    }
   ], 
   "sv": {
    "scenario": "Efter en obehaglig ordväxling märker jag att jag är kortare i tonen mot nästa person jag möter.", 
    "prompt": "Hur ofta stämmer det?"
   }, 
   "slug": "so-rj-c22"
  }, 
  {
   "en": {
    "scenario": "I have something I do deliberately to get back on an even keel after a tense situation.", 
    "prompt": "How often is that true?"
   }, 
   "kind": "selfreport", 
   "options": [
    {
     "en": "Almost never", 
     "k": "a", 
     "rat_sv": "Beskriver att inget medvetet sätt finns.", 
     "sv": "Nästan aldrig"
    }, 
    {
     "en": "Sometimes", 
     "k": "b", 
     "rat_sv": "", 
     "sv": "Ibland"
    }, 
    {
     "en": "Often", 
     "k": "c", 
     "rat_sv": "", 
     "sv": "Ofta"
    }, 
    {
     "en": "Almost always", 
     "k": "d", 
     "rat_sv": "Beskriver ett etablerat sätt att återgå.", 
     "sv": "Nästan alltid"
    }
   ], 
   "sv": {
    "scenario": "Jag har något jag gör medvetet för att komma tillbaka efter en pressad situation.", 
    "prompt": "Hur ofta stämmer det?"
   }, 
   "slug": "so-rj-c23"
  }
 ], 
 "en_adaptation": {
  "notes": "2026-09-03 content/language review: same scenario, same behavioural demand, same key, same option plausibility and no Swedish-specific idiom that changes difficulty. This is a CONTENT/LANGUAGE review, not validation: no psychometric equivalence is claimed and the 'language' review requirement stays outstanding until a named human reviewer clears it.", 
  "reviewed_by": "PR-V3 content review, AI-assisted (Claude) — not a named human language reviewer"
 }, 
 "blocks": [
  {
   "intro_sv": "Tjugofyra frågor om hur du brukar arbeta. Det här är inte ett personlighetstest och det finns inget facit. Svaren redovisas för arbetsgivaren som det du själv beskriver — aldrig som något vi har observerat. Svara som det faktiskt ser ut, inte som det borde se ut. Har du inte arbetat inom bevakning, utgå från annat arbete du har haft.", 
   "intro_en": "Twenty-four questions about how you usually work. This is not a personality test and there is no answer key. Your answers are reported to the employer as what you describe about yourself — never as something we observed. Answer as things actually are, not as they ought to be. If you have not worked in security, answer from other work you have done.", 
   "key": "c_behaviour"
  }
 ]
}
$vaktare_selfreport$::jsonb AS doc;

CREATE TEMP TABLE _v4_rb_before AS
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

DO $$
DECLARE
  _doc jsonb; _form uuid; _it jsonb; _o jsonb; _iv uuid; _status text; _oid uuid;
  _n int; _items int := 0; _b jsonb; _adapt jsonb; _src text;
BEGIN
  SELECT doc INTO _doc FROM _v4_rb_doc;
  SELECT id INTO _form FROM public.scp_forms WHERE slug = 'security-officer-recruitment-form-a';
  IF _form IS NULL THEN RETURN; END IF;
  _adapt := _doc->'en_adaptation';

  FOR _it IN SELECT * FROM jsonb_array_elements(_doc->'items') LOOP
    SELECT iv.id, iv.content_status, iv.evidence_source_type INTO _iv, _status, _src
      FROM public.scp_items i
      JOIN public.scp_item_versions iv ON iv.item_id = i.id AND iv.version_number = 1
     WHERE i.slug = _it->>'slug';
    IF _iv IS NULL THEN RAISE EXCEPTION 'SCP_V4_RB_ITEM_MISSING: %', _it->>'slug'; END IF;
    IF _src <> 'self_report' THEN
      RAISE EXCEPTION 'SCP_V4_RB_NOT_SELF_REPORT: % is "%".', _it->>'slug', _src;
    END IF;
    IF _status <> 'draft' THEN
      RAISE EXCEPTION 'SCP_V4_RB_NOT_DRAFT: % v1 is "%".', _it->>'slug', _status;
    END IF;

    UPDATE public.scp_item_texts
       SET scenario = _it#>>'{sv,scenario}', prompt = _it#>>'{sv,prompt}'
     WHERE item_version_id = _iv AND language = 'sv-SE';
    UPDATE public.scp_item_texts
       SET scenario = _it#>>'{en,scenario}', prompt = _it#>>'{en,prompt}',
           adaptation_status = 'adaptation_reviewed',
           adaptation_notes  = _adapt->>'notes',
           reviewed_by       = _adapt->>'reviewed_by',
           reviewed_at       = now()
     WHERE item_version_id = _iv AND language = 'en-GB';

    FOR _o IN SELECT * FROM jsonb_array_elements(_it->'options') LOOP
      SELECT id INTO _oid FROM public.scp_item_options
       WHERE item_version_id = _iv AND option_key = _o->>'k';
      IF _oid IS NULL THEN RAISE EXCEPTION 'SCP_V4_RB_OPTION_MISSING: % %', _it->>'slug', _o->>'k'; END IF;
      UPDATE public.scp_item_options SET scoring_rationale_sv = _o->>'rat_sv' WHERE id = _oid;
      UPDATE public.scp_item_option_texts SET label = _o->>'sv'
       WHERE item_option_id = _oid AND language = 'sv-SE';
      UPDATE public.scp_item_option_texts SET label = _o->>'en'
       WHERE item_option_id = _oid AND language = 'en-GB';
    END LOOP;
    _items := _items + 1;
  END LOOP;

  FOR _b IN SELECT * FROM jsonb_array_elements(_doc->'blocks') LOOP
    UPDATE public.scp_form_blocks
       SET intro_sv = _b->>'intro_sv', intro_en = _b->>'intro_en'
     WHERE form_id = _form AND block_key = _b->>'key';
    GET DIAGNOSTICS _n = ROW_COUNT;
    IF _n <> 1 THEN RAISE EXCEPTION 'SCP_V4_RB_BLOCK_MISSING: %', _b->>'key'; END IF;
  END LOOP;

  RAISE NOTICE 'vaktare v1 self-report rollback: % items restored to the PR-V3 content review', _items;
END $$;

DO $$
DECLARE
  _n int;
  FREQ_SV constant text[] := ARRAY['Nästan aldrig', 'Ibland', 'Ofta', 'Nästan alltid'];
  FREQ_EN constant text[] := ARRAY['Almost never', 'Sometimes', 'Often', 'Almost always'];
BEGIN
  -- Identity is immutable in this direction too.
  SELECT count(*) INTO _n FROM (
    (SELECT * FROM _v4_rb_before EXCEPT
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
     EXCEPT SELECT * FROM _v4_rb_before)
  ) d;
  IF _n > 0 THEN
    RAISE EXCEPTION 'SCP_V4_RB_IDENTITY_MOVED: % identity row(s) differ after the rollback.', _n;
  END IF;

  -- The PR-V3 scale is back on all 20, and the PR-V4 scale is gone.
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
    RAISE EXCEPTION 'SCP_V4_RB_SCALE: % of 20 four-point self-report items carry the PR-V3 scale again.', _n;
  END IF;

  -- Still 24 self-report items, still out of maturity, still four pairs.
  SELECT count(*) INTO _n
    FROM public.scp_form_items fi JOIN public.scp_forms f ON f.id = fi.form_id
    JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
   WHERE f.slug = 'security-officer-recruitment-form-a'
     AND iv.evidence_source_type = 'self_report' AND iv.item_format = 'biq_frequency';
  IF _n <> 24 THEN
    RAISE EXCEPTION 'SCP_V4_RB_SELF_REPORT: expected 24 self_report items, found %.', _n;
  END IF;

  RAISE NOTICE 'vaktare v1 self-report rollback proven: identity unchanged, the PR-V3 scale restored on 20 items, 24 self_report intact';
END $$;

DROP TABLE IF EXISTS _v4_rb_before;
DROP TABLE IF EXISTS _v4_rb_doc;
