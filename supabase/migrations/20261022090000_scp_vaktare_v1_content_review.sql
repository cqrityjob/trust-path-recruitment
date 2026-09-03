-- Väktare – Recruitment Assessment v1: content and evidence quality review (PR-V3).
--
-- ── WHAT THIS IS ────────────────────────────────────────────────────────
--
-- The 50 items authored by 20260830094000 were an AI-written draft and said
-- so. The 2026-09-02 baseline audit recorded, beyond the two defects PR-V1 and
-- PR-V2 fixed, that the preferred option was the LONGEST option on all 22
-- scenario items in both languages, and that all 50 English texts were still
-- adaptation_pending. This migration is the content review: wording only.
--
-- ── WHAT CHANGES ────────────────────────────────────────────────────────
--
--   * scenario / prompt text and option labels, sv-SE and en-GB, on the 50
--     item versions of form A (draft, version 1);
--   * scoring_rationale_sv where an option's meaning was sharpened, and
--     distractor_error_type on three distractors whose label did not match
--     the pattern it carried (a10 c, b05 c, d06 b -> weak_communication);
--   * the four free-text items ask for a concrete account in a stated shape
--     (what happened, own role, what you did, how it ended, what you took
--     from it) and their rubric CRITERIA wording follows -- dimension keys,
--     order, style flags and the five levels are untouched;
--   * two section intros (self-report: answer from other work if you have
--     not guarded; reflection: the same account shape);
--   * en-GB texts move adaptation_pending -> adaptation_reviewed with the
--     reviewer and notes recorded on the row. 'adaptation_reviewed' is not
--     'approved': it cannot publish a language (20260727130000 requires
--     source/approved), and the 'language' row in scp_review_requirements
--     stays OUTSTANDING because it requires a named human reviewer.
--
-- ── WHAT DOES NOT CHANGE, AND IS PROVEN NOT TO ──────────────────────────
--
--   No option id, option key, score_value, is_preferred, reverse_scored or
--   display_order. No competency, facet or behaviour mapping. No item format,
--   evidence_source_type (the 24 self-report items stay self_report and stay
--   out of maturity), content_status, validation_status or review gate. No
--   item added or removed; 50 = 22 + 24 + 4. The proof block snapshots every
--   identity column before and compares after; a single moved value aborts
--   the transaction. No report, review, response, attempt or Interview
--   Intelligence object is touched.
--
-- ── VERSIONING DECISION ─────────────────────────────────────────────────
--
--   The platform's own rule, scp_guard_published_immutable (20260727120000):
--   "Draft and in-review content is freely editable; that is the whole point
--   of a draft. Immutability begins the moment content is approved." Every
--   one of these 50 versions is content_status = 'draft', validation_status =
--   'design', never approved, never published, so the governed path is an
--   in-place edit of version 1 -- the same path 20260903120000 took for the
--   sg-reporting rubrics. A version 2 would leave existing responses pointing
--   at a version the form no longer serves, which breaks resume for nothing.
--
--   Released reports are frozen snapshots (scp_report_snapshots) and are not
--   read from item text; they are unaffected. The reviewer workspace and the
--   candidate runner DO read item text live, so an attempt that is still
--   being answered or is awaiting human review would see wording the
--   candidate did not answer. That is not silently accepted:
--
-- ── DEPLOY PRECONDITION ─────────────────────────────────────────────────
--
--   This migration REFUSES to apply while any attempt on form A is
--   in_progress or submitted. Counts are reported in the error. The remedy
--   is operational (let the attempt finish or abandon a synthetic one), never
--   a weaker check. scored and released attempts are compatible: their
--   evidence and snapshots carry no item text.
--
-- ── WHAT THIS DOES NOT CLAIM ────────────────────────────────────────────
--
--   No psychometric claim of any kind: no reliability, no validity, no norm,
--   no empirical difficulty. Content/language REVIEWED by an AI assistant as
--   content preparer, not validated, not SME-approved. All 250 review gates
--   (50 x 5) remain outstanding, and the proof block fails if any is not.

DO $$
DECLARE _form uuid; _in_progress int; _submitted int; _scored int; _released int; _abandoned int;
BEGIN
  SELECT id INTO _form FROM public.scp_forms WHERE slug = 'security-officer-recruitment-form-a';
  IF _form IS NULL THEN
    RAISE EXCEPTION 'SCP_V3_FORM_MISSING: security-officer-recruitment-form-a is not authored here.';
  END IF;
  SELECT count(*) FILTER (WHERE status = 'in_progress'),
         count(*) FILTER (WHERE status = 'submitted'),
         count(*) FILTER (WHERE status = 'scored'),
         count(*) FILTER (WHERE status = 'released'),
         count(*) FILTER (WHERE status = 'abandoned')
    INTO _in_progress, _submitted, _scored, _released, _abandoned
    FROM public.scp_attempts WHERE form_id = _form;
  RAISE NOTICE 'vaktare v1 attempts on form A before the content review: in_progress=% submitted=% scored=% released=% abandoned=%',
    _in_progress, _submitted, _scored, _released, _abandoned;
  IF _in_progress > 0 OR _submitted > 0 THEN
    RAISE EXCEPTION 'SCP_V3_ATTEMPTS_IN_FLIGHT: % attempt(s) in progress and % awaiting review on form A read item text live. Let them finish or abandon synthetic ones, then re-run. Released and scored attempts are unaffected.',
      _in_progress, _submitted;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- The document. One JSON value, the single source for this review:
-- scripts/vaktare-content-quality-check.ts reads the same block, so what the
-- guard measures is what the database receives.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TEMP TABLE _v3_doc AS
SELECT $vaktare_content${
 "review": "vaktare-v1-content-review-2026-09-03",
 "items": [
  {
   "slug": "so-rj-a01",
   "kind": "scenario",
   "decision": "EDIT",
   "sv": {
    "scenario": "Det är morgon och kö vid spärrarna. En person utan passerkort säger att hen ska till ett möte på plan 6, är sen, och visar ett mejl med möteskallelsen på telefonen. Enligt instruktionen ska besökare anmälas i receptionen och hämtas av den de ska träffa.",
    "prompt": "Vad gör du?"
   },
   "en": {
    "scenario": "It is morning and there is a queue at the barriers. A person with no access card says they are going to a meeting on floor 6, that they are late, and shows a meeting invitation on their phone. The site instruction says visitors are registered at reception and collected by the person they are meeting.",
    "prompt": "What do you do?"
   },
   "options": [
    {
     "k": "a",
     "sv": "Anmäl besöket i receptionen, ring mötesvärden så att hen hämtar personen, och be personen vänta ett par minuter.",
     "en": "Register the visit at reception, call the host so they can collect the person, and ask the person to wait a couple of minutes.",
     "rat_sv": "Följer instruktionen men löser personens problem parallellt. Minst ingripande åtgärd som ändå håller kontrollen.",
     "err": null
    },
    {
     "k": "b",
     "sv": "Släpp in personen — kallelsen på telefonen visar att mötet finns — och skriv in besöket i loggen i efterhand så att det finns spårbart.",
     "en": "Let the person through — the invitation on their phone shows the meeting is real — and enter the visit in the log afterwards so there is a record.",
     "rat_sv": "Mejlet visar en kallelse, inte att personen är den som kallats. Behörigheten är fortfarande okontrollerad.",
     "err": "excessive_informal_trust"
    },
    {
     "k": "c",
     "sv": "Förklara att oanmälda besökare inte släpps in, och be personen boka om mötet.",
     "en": "Explain that unregistered visitors are not admitted, and ask the person to rebook the meeting.",
     "rat_sv": "Att avvisa någon med ett legitimt ärende utan att pröva den enkla vägen är oproportionerligt och gör onödig skada för uppdragsgivaren.",
     "err": "poor_proportionality"
    }
   ]
  },
  {
   "slug": "so-rj-a02",
   "kind": "scenario",
   "decision": "EDIT",
   "sv": {
    "scenario": "En kund höjer rösten mot dig i entrén till ett köpcentrum. Hen är arg över att en butik nekat en retur och menar att du som väktare ska \"göra något åt det\". Ett par personer har stannat och tittar.",
    "prompt": "Vad gör du först?"
   },
   "en": {
    "scenario": "A customer raises their voice at you in the entrance to a shopping centre. They are angry that a shop refused a return and say that you as a security officer should \"do something about it\". A couple of people have stopped to watch.",
    "prompt": "What do you do first?"
   },
   "options": [
    {
     "k": "a",
     "sv": "Lyssna klart, gå några steg bort från kön och säg vad du kan hjälpa till med — och vad butiken avgör.",
     "en": "Hear them out, move a few steps away from the queue and say what you can help with — and what the shop decides.",
     "rat_sv": "Lyssnar färdigt, flyttar samtalet från publiken och är tydlig med vad som ligger utanför uppdraget utan att avfärda personen.",
     "err": null
    },
    {
     "k": "b",
     "sv": "Säg direkt att returer inte är din sak som väktare och hänvisa personen till centrumledningen, så att du kan fortsätta ditt arbete.",
     "en": "Say straight away that returns are not a security matter and refer the person to centre management, so that you can get on with your work.",
     "rat_sv": "Att hänvisa vidare direkt är korrekt i sak men lämnar personen mitt i sin frustration, vilket ofta trappar upp.",
     "err": "weak_communication"
    },
    {
     "k": "c",
     "sv": "Säg lugnt men bestämt att personen måste sänka rösten — annars får hen lämna centrumet. De som tittar behöver se att du har kontroll.",
     "en": "Say calmly but firmly that the person has to lower their voice — otherwise they will have to leave the centre. The onlookers need to see you are in control.",
     "rat_sv": "Avvisning som första åtgärd mot en arg men laglydig kund är oproportionerligt och gör konflikten större.",
     "err": "premature_escalation"
    }
   ]
  },
  {
   "slug": "so-rj-a03",
   "kind": "scenario",
   "decision": "EDIT",
   "sv": {
    "scenario": "Du är ensam väktare på ett industriområde. Samtidigt får du två saker: ett dörrlarm på ett kallförråd i utkanten, och ett samtal från en anställd som säger att en person hen inte känner igen står inne i personalutrymmet vid omklädningsrummen.",
    "prompt": "Vad gör du?"
   },
   "en": {
    "scenario": "You are the only officer on an industrial site. Two things arrive at once: a door alarm on a cold store at the edge of the site, and a call from an employee saying an unfamiliar person is standing inside the staff area by the changing rooms.",
    "prompt": "What do you do?"
   },
   "options": [
    {
     "k": "a",
     "sv": "Åk till personalutrymmet först, be den anställde stanna kvar i telefon och meddela larmcentralen att dörrlarmet inte är kontrollerat.",
     "en": "Go to the staff area first, ask the employee to stay on the phone, and tell the alarm centre the door alarm has not been checked.",
     "rat_sv": "Går till människorna först, håller kvar den andra händelsen genom att be om observation, och lämnar inte något obevakat utan att någon vet om det.",
     "err": null
    },
    {
     "k": "b",
     "sv": "Åk till dörrlarmet först — det är ett bekräftat larm på skalskyddet — och ta personalutrymmet direkt efteråt.",
     "en": "Go to the door alarm first — it is a confirmed alarm on the perimeter — and take the staff area straight afterwards.",
     "rat_sv": "Larmet är det tydligaste men inte det mest tidskritiska. En okänd person bland anställda är både en risk och något som hinner försvinna.",
     "err": "tunnel_vision"
    },
    {
     "k": "c",
     "sv": "Be den anställde fråga personen vad hen gör där och ringa dig igen, medan du kontrollerar dörrlarmet.",
     "en": "Ask the employee to ask the person what they are doing there and call you back, while you check the door alarm.",
     "rat_sv": "Att be den anställde själv hantera en okänd person lägger uppgiften på fel person och lämnar båda händelserna utan väktare.",
     "err": "delayed_escalation"
    }
   ]
  },
  {
   "slug": "so-rj-a04",
   "kind": "scenario",
   "decision": "EDIT",
   "sv": {
    "scenario": "På en logistikterminal ser du en person i arbetskläder utan synlig ID-bricka gå längs lastkajen och fotografera portnummer och lastluckor med sin telefon. Terminalen har entreprenörer på plats den här veckan.",
    "prompt": "Vad gör du?"
   },
   "en": {
    "scenario": "At a logistics terminal you see a person in work clothes with no visible ID badge walking along the loading bay photographing gate numbers and loading doors with their phone. The terminal has contractors on site this week.",
    "prompt": "What do you do?"
   },
   "options": [
    {
     "k": "a",
     "sv": "Gå fram, presentera dig och fråga vad bilderna är till och vem hen arbetar för — och stäm av svaret med terminalansvarig.",
     "en": "Approach, introduce yourself and ask what the photographs are for and who they work for — then check the answer with the terminal supervisor.",
     "rat_sv": "Frågar om det som faktiskt avviker — aktiviteten och den saknade brickan — utan att förutsätta ett motiv, och kontrollerar mot den som vet.",
     "err": null
    },
    {
     "k": "b",
     "sv": "Anteckna tid, signalement och vad personen gör, och ta upp det med terminalansvarig efter ronden — hen kan vara en av veckans entreprenörer.",
     "en": "Note the time, a description and what the person is doing, and raise it with the terminal supervisor after the round — they may be one of this week's contractors.",
     "rat_sv": "Att bara notera lämnar frågan obesvarad medan personen fortsätter, och en notering utan kontroll hjälper ingen.",
     "err": "insufficient_information"
    },
    {
     "k": "c",
     "sv": "Ring polisen om misstänkt rekognosering — fotografering av portar och lastluckor är ett känt mönster inför inbrott.",
     "en": "Call the police about suspected reconnaissance — photographing gates and loading doors is a known pattern before a burglary.",
     "rat_sv": "Att behandla fotograferingen som rekognosering inför ett brott är en slutsats som inte går att dra av det som syns.",
     "err": "unsupported_assumption"
    }
   ]
  },
  {
   "slug": "so-rj-a05",
   "kind": "scenario",
   "decision": "EDIT",
   "sv": {
    "scenario": "Du går nattpass med en mer erfaren kollega. På tredje ronden märker du att hen kvitterar kontrollpunkter i systemet utan att gå till två av dem. Kollegan säger att \"de punkterna är alltid låsta, det är slöseri med tid\".",
    "prompt": "Vad gör du?"
   },
   "en": {
    "scenario": "You are working a night shift with a more experienced colleague. On the third round you notice they are signing off checkpoints in the system without visiting two of them. Your colleague says \"those points are always locked, it is a waste of time\".",
    "prompt": "What do you do?"
   },
   "options": [
    {
     "k": "a",
     "sv": "Säg till kollegan att du går de två punkterna, gör det, och ta upp med arbetsledaren att kvitteringarna inte stämmer.",
     "en": "Tell your colleague you are going to the two points, do it, and raise with the supervisor that the sign-offs do not match.",
     "rat_sv": "Tar upp det direkt med den det gäller, går själv till punkterna, och för vidare det som är ett systematiskt avsteg — inte som en anmälan av personen.",
     "err": null
    },
    {
     "k": "b",
     "sv": "Gå de två punkterna själv utan att göra någon sak av det — det är inte din uppgift att kontrollera kollegan.",
     "en": "Visit the two points yourself without making an issue of it — it is not your job to check up on your colleague.",
     "rat_sv": "Att bara göra rätt själv låter en felaktig kvittering ligga kvar i systemet, vilket är den egentliga risken.",
     "err": "failure_to_document"
    },
    {
     "k": "c",
     "sv": "Kvittera de två punkterna i ditt eget namn i stället, så att det inte blir en fråga om hens kvitteringar.",
     "en": "Sign the two points off in your own name instead, so that their sign-offs are not questioned.",
     "rat_sv": "Att kvittera i kollegans ställe gör dig till en del av avsteget — loggen är fortfarande osann, nu i ditt namn.",
     "err": "outside_mandate"
    }
   ]
  },
  {
   "slug": "so-rj-a06",
   "kind": "scenario",
   "decision": "EDIT",
   "sv": {
    "scenario": "Uppdragsgivarens platschef ber dig ta bort en notering ur incidentloggen. Noteringen gäller att en dörr till serverrummet stått uppställd i två timmar. Platschefen säger att det redan är åtgärdat, att noteringen \"bara skapar problem i revisionen\" och att hen tar ansvar för beslutet.",
    "prompt": "Vad gör du?"
   },
   "en": {
    "scenario": "The client's site manager asks you to remove an entry from the incident log. The entry records that a door to the server room stood propped open for two hours. The site manager says it has already been dealt with, that the entry \"just creates problems in the audit\", and that they take responsibility for the decision.",
    "prompt": "What do you do?"
   },
   "options": [
    {
     "k": "a",
     "sv": "Säg nej, föreslå att platschefen skriver en egen kommentar om åtgärden, och informera din arbetsledare om begäran.",
     "en": "Say no, suggest the site manager adds a comment of their own about the remedy, and tell your supervisor about the request.",
     "rat_sv": "Vägrar sakligt, förklarar varför, och tar begäran vidare till den som faktiskt är ens uppdragsgivare i bevakningsledet.",
     "err": null
    },
    {
     "k": "b",
     "sv": "Säg vänligt men bestämt nej till platschefen och låt saken bero — du tänker ändå inte ändra något, och relationen till uppdragsgivaren är viktig.",
     "en": "Say a polite but firm no to the site manager and leave it there — you are not going to change anything anyway, and the client relationship matters.",
     "rat_sv": "Rätt svar till platschefen, men en begäran om att ändra en logg är i sig något arbetsledningen behöver känna till.",
     "err": "delayed_escalation"
    },
    {
     "k": "c",
     "sv": "Ta bort noteringen — dörren är åtgärdad och platschefen har uttryckligen tagit på sig beslutet.",
     "en": "Remove the entry — the door has been dealt with and the site manager has explicitly taken on the decision.",
     "rat_sv": "Att ta bort noteringen på muntligt ansvarsövertagande gör spåret oanvändbart och flyttar ansvaret till fel person.",
     "err": "excessive_informal_trust"
    }
   ]
  },
  {
   "slug": "so-rj-a07",
   "kind": "scenario",
   "decision": "EDIT",
   "sv": {
    "scenario": "Du åker på ett inbrottslarm i en fastighet med flera hyresgäster. Larmcentralen kan bara säga att en sektion har löst ut, inte vilken. När du kommer fram står ytterdörren olåst men stängd, och belysningen i trapphuset är släckt trots att den ska vara på nattetid.",
    "prompt": "Vad gör du först?"
   },
   "en": {
    "scenario": "You respond to an intruder alarm in a building with several tenants. The alarm centre can only say that one section has triggered, not which. On arrival the main door is unlocked but closed, and the stairwell lighting is off although it should be on at night.",
    "prompt": "What do you do first?"
   },
   "options": [
    {
     "k": "a",
     "sv": "Gå ett varv runt fastigheten först, meddela larmcentralen vad du ser och be dem ta reda på vilken sektion som löst ut.",
     "en": "Walk round the building first, tell the alarm centre what you can see, and ask them to find out which section triggered.",
     "rat_sv": "Bygger en egen bild utifrån, delar den, och går inte in i en okänd situation utan att någon vet var man är.",
     "err": null
    },
    {
     "k": "b",
     "sv": "Gå in genom ytterdörren och kontrollera trapphuset våning för våning — larmet har troligen löst ut inne i huset och varje minut räknas.",
     "en": "Go in through the main door and check the stairwell floor by floor — the alarm has probably triggered inside the building and every minute counts.",
     "rat_sv": "Att gå in direkt är inte orimligt, men att göra det utan att veta sektion, utan ljus och utan att någon vet var man är är att ge bort sina egna marginaler.",
     "err": "insufficient_information"
    },
    {
     "k": "c",
     "sv": "Bedöm det som ett troligt tekniskt fel — dörren är stängd och ingen syns till — notera det och låt fastighetsskötaren kontrollera belysningen i morgon.",
     "en": "Treat it as a probable technical fault — the door is closed and nobody is in sight — note it and leave the lighting for the caretaker to check tomorrow.",
     "rat_sv": "Släckt belysning och olåst dörr är två avvikelser samtidigt, vilket är precis det som inte ska avfärdas som tekniskt fel.",
     "err": "unsupported_assumption"
    }
   ]
  },
  {
   "slug": "so-rj-a08",
   "kind": "scenario",
   "decision": "EDIT",
   "sv": {
    "scenario": "Under en rond i en lagerbyggnad hör du ett brak och hittar en person som ligger på golvet vid en pallställning. Personen är vaken, svarar på tilltal men säger att hen inte kan stödja på ena benet. En pall ligger tippad intill.",
    "prompt": "Vad gör du?"
   },
   "en": {
    "scenario": "During a round in a warehouse you hear a crash and find a person on the floor by a pallet rack. They are conscious, responsive, but say they cannot put weight on one leg. A tipped pallet is lying next to them.",
    "prompt": "What do you do?"
   },
   "options": [
    {
     "k": "a",
     "sv": "Stanna hos personen, larma ambulans, håll andra borta och låt pallen ligga kvar.",
     "en": "Stay with the person, call an ambulance, keep others away and leave the pallet where it is.",
     "rat_sv": "Person först, plats säkrad, hjälp larmad, och underlaget för utredningen bevarat — i den ordningen.",
     "err": null
    },
    {
     "k": "b",
     "sv": "Hjälp personen upp och in på närmaste kontor så att hen får sitta ner i lugn och ro, och ring sedan efter hjälp därifrån.",
     "en": "Help the person up and into the nearest office so they can sit down in peace, and then call for help from there.",
     "rat_sv": "Att flytta någon som inte kan stödja på benet kan förvärra en skada, och gör dessutom platsen svårare att utreda.",
     "err": "poor_proportionality"
    },
    {
     "k": "c",
     "sv": "Hämta närmaste arbetsledare på företaget så att de själva kan avgöra om ambulans behövs — det är deras anställda och deras lokal.",
     "en": "Fetch the nearest supervisor at the company so they can decide for themselves whether an ambulance is needed — it is their employee and their premises.",
     "rat_sv": "Att söka efter en chef innan hjälp larmas fördröjer det enda som är tidskritiskt.",
     "err": "delayed_escalation"
    }
   ]
  },
  {
   "slug": "so-rj-a09",
   "kind": "scenario",
   "decision": "EDIT",
   "sv": {
    "scenario": "Du har avvisat en person från en butiksentré efter att butikspersonal påkallat din hjälp. Personen gick frivilligt men var upprörd och sa att hen skulle anmäla dig. Du ska nu skriva händelserapporten.",
    "prompt": "Vilket är viktigast att få med?"
   },
   "en": {
    "scenario": "You have removed a person from a shop entrance after staff called for your help. They left voluntarily but were upset and said they would report you. You are now writing the incident report.",
    "prompt": "What matters most to include?"
   },
   "options": [
    {
     "k": "a",
     "sv": "Tidpunkt, vad butikspersonalen sa, vad du själv sa och gjorde i ordning, vilka som var där — och att personen sa att hen skulle anmäla dig.",
     "en": "The time, what the shop staff said, what you said and did in order, who was there — and that the person said they would report you.",
     "rat_sv": "Tid, vad som sagts och gjorts i ordning, vem som var där, och personens egen invändning — det sista är det som brukar utelämnas och det som betyder mest efteråt.",
     "err": null
    },
    {
     "k": "b",
     "sv": "Att en person avvisades från entrén på butikspersonalens begäran, med tidpunkt — kort och sakligt, utan onödiga detaljer.",
     "en": "That a person was removed from the entrance at the request of shop staff, with the time — brief, factual, no unnecessary detail.",
     "rat_sv": "En korrekt men tunn rapport. Utan förloppet går det inte att bedöma om åtgärden var proportionerlig.",
     "err": "insufficient_information"
    },
    {
     "k": "c",
     "sv": "Att personen uppträdde hotfullt och sannolikt var påverkad, och att avvisningen därför var befogad.",
     "en": "That the person behaved threateningly and was probably under the influence, and that the removal was therefore justified.",
     "rat_sv": "En bedömning av personens sinnestillstånd är en slutsats, inte en iakttagelse, och håller inte om rapporten prövas.",
     "err": "unsupported_assumption"
    }
   ]
  },
  {
   "slug": "so-rj-a10",
   "kind": "scenario",
   "decision": "EDIT",
   "sv": {
    "scenario": "Ditt pass går mot slut. Under natten har du: hittat en olåst grind mot lastgården som du låst, noterat att en rörelsedetektor i garaget löst ut tre gånger utan att du sett något, och tagit emot ett meddelande om att en entreprenör kommer klockan sju för att arbeta på taket.",
    "prompt": "Vad tar du upp vid överlämningen?"
   },
   "en": {
    "scenario": "Your shift is ending. During the night you have: found an unlocked gate to the loading yard and locked it, noted that a motion detector in the garage triggered three times with nothing visible, and received a message that a contractor is arriving at seven to work on the roof.",
    "prompt": "What do you raise at the handover?"
   },
   "options": [
    {
     "k": "a",
     "sv": "Alla tre — och särskilt att garagedetektorn behöver bevakas och att entreprenören ska tas emot klockan sju.",
     "en": "All three — and in particular that the garage detector needs watching and that the contractor is to be received at seven.",
     "rat_sv": "Allt tre, med det som pågår markerat. Nästa pass behöver kunna agera, inte bara veta.",
     "err": null
    },
    {
     "k": "b",
     "sv": "Grinden mot lastgården, eftersom det är den enda konkreta avvikelsen — detektorn och entreprenören är redan noterade i systemet.",
     "en": "The gate to the loading yard, since it is the only concrete deviation — the detector and the contractor are already recorded in the system.",
     "rat_sv": "Det åtgärdade är det minst brådskande. Det som fortfarande pågår är det som nästa pass faktiskt behöver.",
     "err": "insufficient_information"
    },
    {
     "k": "c",
     "sv": "Inget särskilt — allt är noterat i loggen och nästa pass läser den vid start.",
     "en": "Nothing in particular — it is all in the log and the next shift reads it when they start.",
     "rat_sv": "Att lita på att loggen talar för sig är ingen överlämning. Det som pågår — detektorn, entreprenören — behöver sägas, inte bara finnas.",
     "err": "weak_communication"
    }
   ]
  },
  {
   "slug": "so-rj-b01",
   "kind": "scenario",
   "decision": "EDIT",
   "sv": {
    "scenario": "Tre formuleringar om samma person i en entré. Alla tre är skrivna av väktare.",
    "prompt": "Vilken av dem är en iakttagelse och inte en slutsats?"
   },
   "en": {
    "scenario": "Three ways of describing the same person in an entrance hall, all written by security officers.",
    "prompt": "Which of them is an observation rather than a conclusion?"
   },
   "options": [
    {
     "k": "a",
     "sv": "\"Man, uppskattningsvis 30–40 år, mörk jacka, stod vid dörren i ungefär tre minuter och försökte öppna den två gånger.\"",
     "en": "\"Male, approximately 30–40 years old, dark jacket, stood by the door for about three minutes and tried to open it twice.\"",
     "rat_sv": "Enbart observerbara uppgifter: ålderspann, klädsel, tid, position och handling. Ingen tolkning av avsikt.",
     "err": null
    },
    {
     "k": "b",
     "sv": "\"En nervös man i mörk jacka, kanske 35 år, höll till vid dörren en längre stund och verkade vänta på att någon skulle släppa in honom.\"",
     "en": "\"A nervous man in a dark jacket, maybe 35, hung around by the door for quite a while and seemed to be waiting for somebody to let him in.\"",
     "rat_sv": "\"Nervös\" och \"verkade vänta\" är tolkningar av ett beteende. Det som faktiskt syntes borde stå i stället.",
     "err": "unsupported_assumption"
    },
    {
     "k": "c",
     "sv": "\"Mannen såg misstänkt ut, hade sannolikt för avsikt att ta sig in obehörigt och bör rapporteras till polisen om han återkommer.\"",
     "en": "\"The man looked suspicious, probably intended to get in without authorisation, and should be reported to the police if he comes back.\"",
     "rat_sv": "Avsikt går inte att observera, och en rapport som påstår den håller inte om den prövas.",
     "err": "unsupported_assumption"
    }
   ]
  },
  {
   "slug": "so-rj-b02",
   "kind": "scenario",
   "decision": "EDIT",
   "sv": {
    "scenario": "Tre rapporter om samma händelse: en vattenläcka upptäckt i ett teknikutrymme klockan 02.40 under nattrond.",
    "prompt": "Vilken rapport går det att arbeta vidare från?"
   },
   "en": {
    "scenario": "Three reports of the same event: a water leak found in a plant room at 02:40 during a night round.",
    "prompt": "Which report can somebody actually work from?"
   },
   "options": [
    {
     "k": "a",
     "sv": "\"02.40, teknikutrymme plan −1. Vatten på golvet ca 2×3 m, rinner från rörgenomföring i taket. Huvudkran ej åtkomlig. Jour kontaktad 02.48, på plats 03.20. Golvbrunn fri, ingen el i vattnet.\"",
     "en": "\"02:40, plant room level −1. Water on the floor roughly 2×3 m, running from a pipe penetration in the ceiling. Main stopcock not accessible. On-call contacted 02:48, on site 03:20. Floor drain clear, no electrical equipment in the water.\"",
     "rat_sv": "Tid, plats, omfattning, vidtagen åtgärd, vem som kontaktats och vad som återstår. En läsare kan fortsätta arbetet.",
     "err": null
    },
    {
     "k": "b",
     "sv": "\"Under nattronden upptäcktes en vattenläcka i teknikutrymmet. Situationen är under kontroll. Jouren är kontaktad och åtgärder vidtagna i avvaktan på fastighetsskötaren.\"",
     "en": "\"During the night round a water leak was discovered in the plant room. The situation is under control. On-call has been contacted and measures taken pending the caretaker.\"",
     "rat_sv": "Låter komplett men är obrukbar: ingen tid, ingen omfattning, ingen uppgift om vilka åtgärder som vidtagits eller vad som återstår.",
     "err": "insufficient_information"
    },
    {
     "k": "c",
     "sv": "\"02.40 vatten i teknikutrymmet plan −1. Läckan beror med största sannolikhet på det slarviga rörarbetet förra veckan; fastighetsägaren bör hålla entreprenören ansvarig. Jour kontaktad.\"",
     "en": "\"02:40, water in the plant room, level −1. The leak is almost certainly due to the sloppy pipework last week; the property owner should hold the contractor responsible. On-call contacted.\"",
     "rat_sv": "Orsak och ansvar är slutsatser som inte går att dra på plats, och de tränger undan det som faktiskt observerades.",
     "err": "unsupported_assumption"
    }
   ]
  },
  {
   "slug": "so-rj-b03",
   "kind": "scenario",
   "decision": "EDIT",
   "sv": {
    "scenario": "En kollega ringer och säger: \"Det är någon som har varit i cykelrummet, det ser rörigt ut därinne. Jag åker vidare till nästa objekt nu.\"",
    "prompt": "Vad behöver du veta först?"
   },
   "en": {
    "scenario": "A colleague calls and says: \"Somebody has been in the bike store, it looks messy in there. I am moving on to the next site now.\"",
    "prompt": "What do you need to know first?"
   },
   "options": [
    {
     "k": "a",
     "sv": "När hen var där, vad hen faktiskt såg och om dörren var låst eller uppbruten.",
     "en": "When they were there, what they actually saw, and whether the door was locked or forced.",
     "rat_sv": "Tid och det som faktiskt observerats avgör om detta är en pågående händelse eller en gammal. Utan det går det inte att välja åtgärd.",
     "err": null
    },
    {
     "k": "b",
     "sv": "Om hen har skrivit en notering i systemet, så att det finns dokumenterat innan hen lämnar objektet.",
     "en": "Whether they have written a note in the system, so that it is documented before they leave the site.",
     "rat_sv": "Rimlig fråga, men den säger inget om huruvida något behöver göras nu.",
     "err": "insufficient_information"
    },
    {
     "k": "c",
     "sv": "Hur många cyklar som saknas och ungefär vilket värde det rör sig om, så att du vet om det är en polissak.",
     "en": "How many bikes are missing and roughly what value is involved, so that you know whether it is a police matter.",
     "rat_sv": "Antal och värde är detaljer i en slutsats som ännu inte är dragen; ingen har sagt att något är stulet.",
     "err": "unsupported_assumption"
    }
   ]
  },
  {
   "slug": "so-rj-b04",
   "kind": "scenario",
   "decision": "EDIT",
   "sv": {
    "scenario": "Klockan 03.15 måste du väcka uppdragsgivarens jourhavande. En kylanläggning i en livsmedelslokal har larmat och temperaturen stiger. Du har tio sekunder innan personen är riktigt vaken.",
    "prompt": "Vad säger du först?"
   },
   "en": {
    "scenario": "At 03:15 you have to wake the client's on-call manager. A refrigeration unit in a food premises has alarmed and the temperature is rising. You have ten seconds before they are properly awake.",
    "prompt": "What do you say first?"
   },
   "options": [
    {
     "k": "a",
     "sv": "Vem du är, vilket objekt det gäller, att kylan larmat och temperaturen stiger — och vad du behöver att hen gör.",
     "en": "Who you are, which site it is, that the refrigeration has alarmed and the temperature is rising — and what you need them to do.",
     "rat_sv": "Vem, var, vad, hur brådskande och vad som behövs — i den ordning en nyvaken person kan ta emot den.",
     "err": null
    },
    {
     "k": "b",
     "sv": "Att det gått ett larm på kylanläggningen och att du ringer enligt instruktionen.",
     "en": "That an alarm has gone off on the refrigeration unit and that you are calling in line with the instruction.",
     "rat_sv": "Korrekt men otillräckligt: personen vet inte var, hur illa det är, eller vad som förväntas av hen.",
     "err": "insufficient_information"
    },
    {
     "k": "c",
     "sv": "En kort redogörelse för ronden och vad du sett fram till larmet, så att hen får hela bilden.",
     "en": "A short account of the round and what you saw up to the alarm, so they have the whole picture.",
     "rat_sv": "Bakgrund först är det som gör att den viktiga uppgiften kommer sist till någon som inte lyssnar färdigt.",
     "err": "weak_communication"
    }
   ]
  },
  {
   "slug": "so-rj-b05",
   "kind": "scenario",
   "decision": "EDIT",
   "sv": {
    "scenario": "I slutet av passet upptäcker du att en brandcellsdörr stått uppställd med en brandsläckare hela kvällen. Du tar bort släckaren och dörren stängs. Ingen har varit i utrymmet och inget har hänt.",
    "prompt": "Vad gör du?"
   },
   "en": {
    "scenario": "At the end of your shift you find that a fire door has been propped open with a fire extinguisher all evening. You remove the extinguisher and the door closes. Nobody has been in the space and nothing has happened.",
    "prompt": "What do you do?"
   },
   "options": [
    {
     "k": "a",
     "sv": "Notera avvikelsen i loggen med tid och plats, även om inget hände i kväll.",
     "en": "Record the deviation in the log with time and place, even though nothing happened tonight.",
     "rat_sv": "Avvikelsen är värd att notera just för att den upprepas — det är mönstret, inte kvällen, som är risken.",
     "err": null
    },
    {
     "k": "b",
     "sv": "Ställ tillbaka släckaren och gå hem — dörren är stängd och problemet är löst.",
     "en": "Put the extinguisher back where it was and go home — the door is closed and the problem is solved.",
     "rat_sv": "Rätt fysisk åtgärd, men utan notering finns inget mönster att upptäcka nästa gång.",
     "err": "failure_to_document"
    },
    {
     "k": "c",
     "sv": "Nämn det muntligt för nästa pass om du träffar dem vid bytet, så att de kan hålla ett öga på dörren.",
     "en": "Mention it verbally to the next shift if you see them at the changeover, so that they can keep an eye on the door.",
     "rat_sv": "Muntligt och villkorat — om ni råkas — är ingen överlämning. Avvikelsen lämnar inget spår som går att följa upp.",
     "err": "weak_communication"
    }
   ]
  },
  {
   "slug": "so-rj-b06",
   "kind": "scenario",
   "decision": "EDIT",
   "sv": {
    "scenario": "Du ska skriva en redogörelse om en händelse under ditt pass. Den kan komma att läsas av polis och av uppdragsgivarens försäkringsbolag.",
    "prompt": "Hur bygger du upp den?"
   },
   "en": {
    "scenario": "You are writing an account of an incident during your shift. It may be read by the police and by the client's insurer.",
    "prompt": "How do you structure it?"
   },
   "options": [
    {
     "k": "a",
     "sv": "Kronologiskt med klockslag — vad som hände, vad du såg, vad du gjorde — och dina egna bedömningar tydligt avskilda.",
     "en": "Chronologically with times — what happened, what you saw, what you did — with your own assessments clearly kept separate.",
     "rat_sv": "Kronologi med tidsangivelser, sedan iakttagelser, sedan åtgärder — och egna bedömningar tydligt avskilda i slutet.",
     "err": null
    },
    {
     "k": "b",
     "sv": "Med din slutsats först, så att läsaren direkt förstår vad det handlar om, och underlaget efter.",
     "en": "With your conclusion first, so the reader immediately understands what it is about, and the material after.",
     "rat_sv": "Att inleda med slutsatsen färgar allt som följer och gör det svårare att se vad som faktiskt observerades.",
     "err": "weak_communication"
    },
    {
     "k": "c",
     "sv": "Med det som är relevant för händelsen och inget annat — detaljer som kan verka motsägelsefulla skapar bara oklarhet för läsaren.",
     "en": "With what is relevant to the incident and nothing else — details that might seem contradictory only create confusion for the reader.",
     "rat_sv": "Att utelämna det som talar emot den egna versionen är det som gör en redogörelse värdelös när den prövas.",
     "err": "unsupported_assumption"
    }
   ]
  },
  {
   "slug": "so-rj-d01",
   "kind": "scenario",
   "decision": "EDIT",
   "sv": {
    "scenario": "På ett datacenter ska besökslistan stämmas av mot faktiska besök vid varje passbyte. Din kollega, som arbetat där i sex år, gör avstämningen en gång i veckan i stället och säger att det aldrig har blivit fel på sex år.",
    "prompt": "Vad gör du?"
   },
   "en": {
    "scenario": "At a data centre the visitor list is to be reconciled against actual visits at every shift change. Your colleague, who has worked there for six years, does the reconciliation once a week instead and says nothing has ever gone wrong in six years.",
    "prompt": "What do you do?"
   },
   "options": [
    {
     "k": "a",
     "sv": "Gör avstämningen vid varje passbyte, säg det till kollegan, och ta upp med arbetsledaren att rutinen tillämpas olika.",
     "en": "Do the reconciliation at every shift change, tell your colleague you are doing it, and raise with the supervisor that the procedure is applied differently.",
     "rat_sv": "Gör rätt själv, tar upp det med kollegan, och för frågan vidare som en fråga om rutinen snarare än om personen.",
     "err": null
    },
    {
     "k": "b",
     "sv": "Följ kollegans arbetssätt — hen känner objektet, och sex år utan fel talar för sig.",
     "en": "Follow your colleague's way of working — they know the site, and six years without a fault speaks for itself.",
     "rat_sv": "Sex år utan fel säger något om sannolikheten, inte om konsekvensen. På ett datacenter är det konsekvensen som styr.",
     "err": "excessive_informal_trust"
    },
    {
     "k": "c",
     "sv": "Gör avstämningen vid varje passbyte själv utan att säga något — kollegan är mer erfaren än du.",
     "en": "Do the reconciliation at every shift change yourself without saying anything — your colleague is more experienced than you.",
     "rat_sv": "Att bara göra rätt själv i tysthet lämnar avsteget kvar och gör dig till den enda som vet om det.",
     "err": "delayed_escalation"
    }
   ]
  },
  {
   "slug": "so-rj-d02",
   "kind": "scenario",
   "decision": "EDIT",
   "sv": {
    "scenario": "Klockan 22 kommer en anställd du känner igen väl — hen jobbar sent varje vecka och brukar prata med dig. Hen har glömt sitt passerkort och ber dig låsa upp till en avdelning där hen inte normalt har behörighet, för att hämta en pärm åt en kollega.",
    "prompt": "Vad gör du?"
   },
   "en": {
    "scenario": "At 22:00 an employee you recognise well arrives — they work late every week and usually chat with you. They have forgotten their access card and ask you to unlock a department where they do not normally have authorisation, to collect a folder for a colleague.",
    "prompt": "What do you do?"
   },
   "options": [
    {
     "k": "a",
     "sv": "Säg nej till just den avdelningen, förklara att din behörighet inte räcker, och erbjud dig att ringa någon som kan ge tillstånd.",
     "en": "Say no to that particular department, explain that your authorisation does not cover it, and offer to call somebody who can give permission.",
     "rat_sv": "Behörigheten, inte bekantskapen, avgör. Erbjuder samtidigt en väg som faktiskt kan lösa personens problem.",
     "err": null
    },
    {
     "k": "b",
     "sv": "Följ med in och stå kvar medan hen hämtar pärmen, och skriv in det i loggen med tid och namn — då finns det spårbart om någon frågar.",
     "en": "Go in with them and stand there while they collect the folder, and enter it in the log with time and name — then there is a record if anybody ever asks.",
     "rat_sv": "Att följa med gör inte begäran behörig. Närvaron är en kontroll, inte ett tillstånd.",
     "err": "outside_mandate"
    },
    {
     "k": "c",
     "sv": "Lås upp — du vet vem personen är, ärendet är rimligt, och att hämta en pärm åt en kollega är knappast en säkerhetsrisk.",
     "en": "Unlock it — you know who the person is, the errand is reasonable, and collecting a folder for a colleague is hardly a security risk.",
     "rat_sv": "Att öppna på igenkänning är precis det arbetssätt en behörighetsordning finns för att förhindra.",
     "err": "excessive_informal_trust"
    }
   ]
  },
  {
   "slug": "so-rj-d03",
   "kind": "scenario",
   "decision": "EDIT",
   "sv": {
    "scenario": "När du kommit hem inser du att du glömde låsa en dörr till ett förråd vid sista ronden. Passet är slut, nästa väktare är på plats, och ingen har sagt något.",
    "prompt": "Vad gör du?"
   },
   "en": {
    "scenario": "After you get home you realise you forgot to lock a store room door on your last round. Your shift is over, the next officer is on site, and nobody has said anything.",
    "prompt": "What do you do?"
   },
   "options": [
    {
     "k": "a",
     "sv": "Ring objektet direkt så att dörren kontrolleras, och skriv en egen avvikelse om att du missade den.",
     "en": "Call the site straight away so the door gets checked, and write your own deviation report saying you missed it.",
     "rat_sv": "Åtgärdar risken nu och lämnar spår efter sig. Att någon annan kan ha upptäckt det är inte ett skäl att låta bli.",
     "err": null
    },
    {
     "k": "b",
     "sv": "Ta upp det med arbetsledaren nästa gång du är på jobbet, så att det blir sagt och dokumenterat på rätt sätt.",
     "en": "Raise it with the supervisor the next time you are at work, so that it is said and documented in the proper way.",
     "rat_sv": "Att vänta till nästa pass innebär att risken står öppen under tiden, av bekvämlighetsskäl.",
     "err": "delayed_escalation"
    },
    {
     "k": "c",
     "sv": "Lita på att nästa väktares rond fångar upp det — förrådet ingår i rondslingan och kontrolleras inom några timmar.",
     "en": "Trust the next officer's round to catch it — the store room is on the round and will be checked within a few hours.",
     "rat_sv": "Att lita på nästa rond löser möjligen dörren men lämnar avvikelsen odokumenterad, vilket är den del som betyder något över tid.",
     "err": "failure_to_document"
    }
   ]
  },
  {
   "slug": "so-rj-d04",
   "kind": "scenario",
   "decision": "EDIT",
   "sv": {
    "scenario": "Inför en genomgång läser du din egen rapport från förra veckan och ser att du utelämnat att du var ensam på objektet när händelsen inträffade. Rapporten är i övrigt korrekt.",
    "prompt": "Vad gör du?"
   },
   "en": {
    "scenario": "Ahead of a review you read your own report from last week and see that you left out the fact that you were alone on site when the incident happened. The report is otherwise correct.",
    "prompt": "What do you do?"
   },
   "options": [
    {
     "k": "a",
     "sv": "Lägg till en daterad komplettering om bemanningen och säg vid genomgången att den är tillagd i efterhand.",
     "en": "Add a dated addendum about the staffing and say at the review that it was added afterwards.",
     "rat_sv": "Komplettering i efterhand, daterad och märkt som sådan. Originalet står kvar, vilket är hela poängen med ett spår.",
     "err": null
    },
    {
     "k": "b",
     "sv": "Nämn det muntligt vid genomgången utan att röra rapporten — den är korrekt i sak, och en ändring i efterhand kan se konstig ut.",
     "en": "Mention it verbally at the review without touching the report — it is correct in substance, and a change afterwards could look odd.",
     "rat_sv": "Muntligt håller för mötet men inte för någon som läser rapporten om ett år.",
     "err": "insufficient_information"
    },
    {
     "k": "c",
     "sv": "Redigera rapporten så att bemanningen finns med från början — det var ju så det var.",
     "en": "Edit the report so that the staffing is there from the start — that is how it was.",
     "rat_sv": "Att redigera originalet gör rapporten oanvändbar som spår, oavsett hur riktig den blir.",
     "err": "failure_to_document"
    }
   ]
  },
  {
   "slug": "so-rj-d05",
   "kind": "scenario",
   "decision": "EDIT",
   "sv": {
    "scenario": "Ett larm har tagit fyrtio minuter av ditt pass. Du har trettio minuter kvar och en rond som normalt tar femtio. Ronden omfattar tolv kontrollpunkter, varav tre är utrymmen med skyddsvärde och nio är allmänna utrymmen.",
    "prompt": "Vad gör du?"
   },
   "en": {
    "scenario": "An alarm has taken forty minutes of your shift. You have thirty minutes left and a round that normally takes fifty. The round covers twelve checkpoints, three of which are areas with protective value and nine of which are general areas.",
    "prompt": "What do you do?"
   },
   "options": [
    {
     "k": "a",
     "sv": "Gå de tre skyddsvärda punkterna först och så många övriga du hinner, kvittera bara det du gått och skriv i överlämningen vad som återstår.",
     "en": "Do the three protected points first and as many of the others as you can, sign off only what you visited, and record in the handover what remains.",
     "rat_sv": "Prioriterar efter skyddsvärde, kvitterar bara det som faktiskt gjorts, och lämnar över det som inte hanns med.",
     "err": null
    },
    {
     "k": "b",
     "sv": "Gå de tre skyddsvärda punkterna, kvittera dem och avsluta passet — de allmänna utrymmena är lågrisk.",
     "en": "Do the three protected points, sign them off and end the shift — the general areas are low risk.",
     "rat_sv": "Rimlig prioritering, men utan överlämning vet nästa pass inte vad som är okontrollerat.",
     "err": "insufficient_information"
    },
    {
     "k": "c",
     "sv": "Gå så många punkter du hinner och kvittera resten, så att ronden ser fullständig ut i systemet.",
     "en": "Do as many points as you can and sign off the rest, so that the round looks complete in the system.",
     "rat_sv": "Att kvittera det som inte gjorts gör loggen osann, vilket är allvarligare än en ogjord rond.",
     "err": "failure_to_document"
    }
   ]
  },
  {
   "slug": "so-rj-d06",
   "kind": "scenario",
   "decision": "EDIT",
   "sv": {
    "scenario": "En anställd hos uppdragsgivaren frågar om du kan kolla i passersystemet vilken tid en viss kollega gick hem i går. Hen säger att det gäller en diskussion om vem som lämnade kaffemaskinen påslagen.",
    "prompt": "Vad gör du?"
   },
   "en": {
    "scenario": "An employee of the client asks whether you can check in the access system what time a particular colleague went home yesterday. They say it concerns an argument about who left the coffee machine on.",
    "prompt": "What do you do?"
   },
   "options": [
    {
     "k": "a",
     "sv": "Säg nej, förklara att passerdata bara får användas för säkerhetsändamål, och hänvisa frågan till personens chef.",
     "en": "Say no, explain that access data may only be used for security purposes, and refer the question to the person's manager.",
     "rat_sv": "Nej med skäl, och en anvisning om var frågan hör hemma. Behovet försvinner inte men vägen dit blir den rätta.",
     "err": null
    },
    {
     "k": "b",
     "sv": "Säg att du inte får göra det och gå vidare — du behöver inte förklara dig, och ju mindre du diskuterar det desto bättre.",
     "en": "Say that you are not allowed to and move on — you do not need to explain yourself, and the less you discuss it the better.",
     "rat_sv": "Ett nej utan skäl lämnar personen med intrycket att det är godtycke, och frågan kommer tillbaka till nästa väktare.",
     "err": "weak_communication"
    },
    {
     "k": "c",
     "sv": "Titta efter — uppgiften är harmlös och personen kan ändå fråga sin chef.",
     "en": "Look it up — the information is harmless and the person could ask their manager anyway.",
     "rat_sv": "Att uppgiften är harmlös ändrar inte att den hämtats ur ett system som finns för något annat.",
     "err": "excessive_informal_trust"
    }
   ]
  },
  {
   "slug": "so-rj-c01",
   "kind": "selfreport",
   "decision": "EDIT",
   "sv": {
    "scenario": "Om en rutin känns onödigt lång och situationen ser okomplicerad ut förenklar jag stegen.",
    "prompt": "Hur ofta stämmer det?"
   },
   "en": {
    "scenario": "If a procedure feels unnecessarily long and the situation looks straightforward, I simplify the steps.",
    "prompt": "How often is that true?"
   },
   "options": [
    {
     "k": "a",
     "sv": "Nästan aldrig",
     "en": "Almost never",
     "rat_sv": "Beskriver att genvägen inte tas."
    },
    {
     "k": "b",
     "sv": "Ibland",
     "en": "Sometimes",
     "rat_sv": ""
    },
    {
     "k": "c",
     "sv": "Ofta",
     "en": "Often",
     "rat_sv": ""
    },
    {
     "k": "d",
     "sv": "Nästan alltid",
     "en": "Almost always",
     "rat_sv": "Beskriver att genvägen tas regelmässigt."
    }
   ]
  },
  {
   "slug": "so-rj-c02",
   "kind": "selfreport",
   "decision": "KEEP",
   "sv": {
    "scenario": "När jag avviker från en rutin skriver jag ner varför, även när avvikelsen var uppenbart rimlig.",
    "prompt": "Hur ofta stämmer det?"
   },
   "en": {
    "scenario": "When I depart from a procedure I write down why, even when the departure was obviously reasonable.",
    "prompt": "How often is that true?"
   },
   "options": [
    {
     "k": "a",
     "sv": "Nästan aldrig",
     "en": "Almost never",
     "rat_sv": "Beskriver att avsteg inte dokumenteras."
    },
    {
     "k": "b",
     "sv": "Ibland",
     "en": "Sometimes",
     "rat_sv": ""
    },
    {
     "k": "c",
     "sv": "Ofta",
     "en": "Often",
     "rat_sv": ""
    },
    {
     "k": "d",
     "sv": "Nästan alltid",
     "en": "Almost always",
     "rat_sv": "Beskriver att avsteg dokumenteras genomgående."
    }
   ]
  },
  {
   "slug": "so-rj-c03",
   "kind": "selfreport",
   "decision": "KEEP",
   "sv": {
    "scenario": "Två sätt att arbeta. Inget av dem är fel.",
    "prompt": "Vilket liknar dig mest?"
   },
   "en": {
    "scenario": "Two ways of working. Neither is wrong.",
    "prompt": "Which is more like you?"
   },
   "options": [
    {
     "k": "a",
     "sv": "Jag löser hellre ett problem direkt när jag tror att jag förstått situationen.",
     "en": "I prefer to deal with a problem straight away once I believe I understand the situation.",
     "rat_sv": "Beskriver handlingsinriktning framför kontroll."
    },
    {
     "k": "b",
     "sv": "Jag kontrollerar hellre uppgiften en gång till innan jag agerar.",
     "en": "I prefer to check the information once more before I act.",
     "rat_sv": "Beskriver kontroll framför handlingsinriktning. I bevakningsarbete är verifiering det mer hållbara arbetssättet, men båda svaren är rimliga beskrivningar av en person."
    }
   ]
  },
  {
   "slug": "so-rj-c04",
   "kind": "selfreport",
   "decision": "EDIT",
   "sv": {
    "scenario": "När jag lägger märke till något litet som avviker nöjer jag mig med att komma ihåg det.",
    "prompt": "Hur ofta stämmer det?"
   },
   "en": {
    "scenario": "When I notice something small that is out of place, I settle for remembering it.",
    "prompt": "How often is that true?"
   },
   "options": [
    {
     "k": "a",
     "sv": "Nästan aldrig",
     "en": "Almost never",
     "rat_sv": "Beskriver att iakttagelsen förs vidare."
    },
    {
     "k": "b",
     "sv": "Ibland",
     "en": "Sometimes",
     "rat_sv": ""
    },
    {
     "k": "c",
     "sv": "Ofta",
     "en": "Often",
     "rat_sv": ""
    },
    {
     "k": "d",
     "sv": "Nästan alltid",
     "en": "Almost always",
     "rat_sv": "Beskriver att iakttagelsen stannar i huvudet."
    }
   ]
  },
  {
   "slug": "so-rj-c05",
   "kind": "selfreport",
   "decision": "KEEP",
   "sv": {
    "scenario": "Jag antecknar tid och plats direkt när jag ser något, inte i efterhand.",
    "prompt": "Hur ofta stämmer det?"
   },
   "en": {
    "scenario": "I write down the time and place as soon as I see something, not afterwards.",
    "prompt": "How often is that true?"
   },
   "options": [
    {
     "k": "a",
     "sv": "Nästan aldrig",
     "en": "Almost never",
     "rat_sv": "Beskriver att anteckningen görs i efterhand eller inte alls."
    },
    {
     "k": "b",
     "sv": "Ibland",
     "en": "Sometimes",
     "rat_sv": ""
    },
    {
     "k": "c",
     "sv": "Ofta",
     "en": "Often",
     "rat_sv": ""
    },
    {
     "k": "d",
     "sv": "Nästan alltid",
     "en": "Almost always",
     "rat_sv": "Beskriver att anteckningen görs på plats."
    }
   ]
  },
  {
   "slug": "so-rj-c06",
   "kind": "selfreport",
   "decision": "KEEP",
   "sv": {
    "scenario": "Två sätt att gå en rond. Inget av dem är fel.",
    "prompt": "Vilket liknar dig mest?"
   },
   "en": {
    "scenario": "Two ways of walking a round. Neither is wrong.",
    "prompt": "Which is more like you?"
   },
   "options": [
    {
     "k": "a",
     "sv": "Jag skaffar mig en överblick och litar på att avvikelser sticker ut.",
     "en": "I take in the overall picture and trust that anything out of place will stand out.",
     "rat_sv": "Beskriver överblick framför systematik."
    },
    {
     "k": "b",
     "sv": "Jag går igenom samma punkter i samma ordning varje gång.",
     "en": "I go through the same points in the same order every time.",
     "rat_sv": "Beskriver systematik framför överblick. Båda är rimliga; systematiken är den som håller när uppmärksamheten sviktar."
    }
   ]
  },
  {
   "slug": "so-rj-c07",
   "kind": "selfreport",
   "decision": "KEEP",
   "sv": {
    "scenario": "När jag har gjort samma kontroll många gånger behöver jag påminna mig själv om att inte gå på autopilot.",
    "prompt": "Hur ofta stämmer det?"
   },
   "en": {
    "scenario": "After doing the same check many times, I need to remind myself not to go on autopilot.",
    "prompt": "How often is that true?"
   },
   "options": [
    {
     "k": "a",
     "sv": "Nästan aldrig",
     "en": "Almost never",
     "rat_sv": "Att aldrig känna igen fenomenet är i sig något att fråga om — inte ett tecken på uthållighet."
    },
    {
     "k": "b",
     "sv": "Ibland",
     "en": "Sometimes",
     "rat_sv": ""
    },
    {
     "k": "c",
     "sv": "Ofta",
     "en": "Often",
     "rat_sv": "Beskriver aktiv självobservation, vilket är det som går att arbeta med."
    },
    {
     "k": "d",
     "sv": "Nästan alltid",
     "en": "Almost always",
     "rat_sv": ""
    }
   ]
  },
  {
   "slug": "so-rj-c08",
   "kind": "selfreport",
   "decision": "KEEP",
   "sv": {
    "scenario": "Jag har ett konkret sätt att bryta rutinen när uppmärksamheten börjar svikta, till exempel att byta ordning eller ta en kort paus.",
    "prompt": "Hur ofta stämmer det?"
   },
   "en": {
    "scenario": "I have a concrete way of breaking the routine when my attention starts to slip — changing the order, or taking a short break.",
    "prompt": "How often is that true?"
   },
   "options": [
    {
     "k": "a",
     "sv": "Nästan aldrig",
     "en": "Almost never",
     "rat_sv": "Beskriver att inget motmedel finns."
    },
    {
     "k": "b",
     "sv": "Ibland",
     "en": "Sometimes",
     "rat_sv": ""
    },
    {
     "k": "c",
     "sv": "Ofta",
     "en": "Often",
     "rat_sv": ""
    },
    {
     "k": "d",
     "sv": "Nästan alltid",
     "en": "Almost always",
     "rat_sv": "Beskriver ett etablerat motmedel."
    }
   ]
  },
  {
   "slug": "so-rj-c09",
   "kind": "selfreport",
   "decision": "EDIT",
   "sv": {
    "scenario": "Mot slutet av ett långt pass går jag igenom kontrollpunkterna snabbare än i början av passet.",
    "prompt": "Hur ofta stämmer det?"
   },
   "en": {
    "scenario": "Towards the end of a long shift I go through the checkpoints faster than at the start of the shift.",
    "prompt": "How often is that true?"
   },
   "options": [
    {
     "k": "a",
     "sv": "Nästan aldrig",
     "en": "Almost never",
     "rat_sv": "Beskriver ett jämnt arbetstempo genom passet."
    },
    {
     "k": "b",
     "sv": "Ibland",
     "en": "Sometimes",
     "rat_sv": ""
    },
    {
     "k": "c",
     "sv": "Ofta",
     "en": "Often",
     "rat_sv": ""
    },
    {
     "k": "d",
     "sv": "Nästan alltid",
     "en": "Almost always",
     "rat_sv": "Beskriver att tempot ökar när uppmärksamheten sannolikt är som lägst."
    }
   ]
  },
  {
   "slug": "so-rj-c10",
   "kind": "selfreport",
   "decision": "KEEP",
   "sv": {
    "scenario": "Jag berättar om händelser från jobbet för familj eller vänner, utan namn men med detaljer.",
    "prompt": "Hur ofta stämmer det?"
   },
   "en": {
    "scenario": "I tell family or friends about things that happen at work — without names, but with detail.",
    "prompt": "How often is that true?"
   },
   "options": [
    {
     "k": "a",
     "sv": "Nästan aldrig",
     "en": "Almost never",
     "rat_sv": "Beskriver att arbetsinformation stannar i arbetet."
    },
    {
     "k": "b",
     "sv": "Ibland",
     "en": "Sometimes",
     "rat_sv": ""
    },
    {
     "k": "c",
     "sv": "Ofta",
     "en": "Often",
     "rat_sv": ""
    },
    {
     "k": "d",
     "sv": "Nästan alltid",
     "en": "Almost always",
     "rat_sv": "Beskriver regelmässigt berättande om händelser utanför arbetet."
    }
   ]
  },
  {
   "slug": "so-rj-c11",
   "kind": "selfreport",
   "decision": "KEEP",
   "sv": {
    "scenario": "När jag inte kan lämna ut information förklarar jag varför, i stället för att bara säga att det inte går.",
    "prompt": "Hur ofta stämmer det?"
   },
   "en": {
    "scenario": "When I cannot share information I explain why, rather than just saying that I cannot.",
    "prompt": "How often is that true?"
   },
   "options": [
    {
     "k": "a",
     "sv": "Nästan aldrig",
     "en": "Almost never",
     "rat_sv": "Beskriver ett nej utan skäl."
    },
    {
     "k": "b",
     "sv": "Ibland",
     "en": "Sometimes",
     "rat_sv": ""
    },
    {
     "k": "c",
     "sv": "Ofta",
     "en": "Often",
     "rat_sv": ""
    },
    {
     "k": "d",
     "sv": "Nästan alltid",
     "en": "Almost always",
     "rat_sv": "Beskriver att skälet förklaras."
    }
   ]
  },
  {
   "slug": "so-rj-c12",
   "kind": "selfreport",
   "decision": "KEEP",
   "sv": {
    "scenario": "Jag använder min egen telefon för att fotografera eller anteckna sådant jag behöver komma ihåg från passet.",
    "prompt": "Hur ofta stämmer det?"
   },
   "en": {
    "scenario": "I use my own phone to photograph or note things I need to remember from a shift.",
    "prompt": "How often is that true?"
   },
   "options": [
    {
     "k": "a",
     "sv": "Nästan aldrig",
     "en": "Almost never",
     "rat_sv": "Beskriver att arbetsmaterial hålls i arbetets egna system."
    },
    {
     "k": "b",
     "sv": "Ibland",
     "en": "Sometimes",
     "rat_sv": ""
    },
    {
     "k": "c",
     "sv": "Ofta",
     "en": "Often",
     "rat_sv": ""
    },
    {
     "k": "d",
     "sv": "Nästan alltid",
     "en": "Almost always",
     "rat_sv": "Beskriver att arbetsmaterial regelmässigt hamnar på privat utrustning."
    }
   ]
  },
  {
   "slug": "so-rj-c13",
   "kind": "selfreport",
   "decision": "KEEP",
   "sv": {
    "scenario": "Om jag upptäcker ett litet fel som ingen annan verkar ha sett rapporterar eller dokumenterar jag det ändå.",
    "prompt": "Hur ofta stämmer det?"
   },
   "en": {
    "scenario": "If I notice a small mistake that nobody else appears to have seen, I still report or document it.",
    "prompt": "How often is that true?"
   },
   "options": [
    {
     "k": "a",
     "sv": "Nästan aldrig",
     "en": "Almost never",
     "rat_sv": "Beskriver att felet stannar hos personen."
    },
    {
     "k": "b",
     "sv": "Ibland",
     "en": "Sometimes",
     "rat_sv": ""
    },
    {
     "k": "c",
     "sv": "Ofta",
     "en": "Often",
     "rat_sv": ""
    },
    {
     "k": "d",
     "sv": "Nästan alltid",
     "en": "Almost always",
     "rat_sv": "Beskriver att felet rapporteras oavsett upptäcktsrisk."
    }
   ]
  },
  {
   "slug": "so-rj-c14",
   "kind": "selfreport",
   "decision": "EDIT",
   "sv": {
    "scenario": "Om ett misstag inte fick någon konsekvens nöjer jag mig med att rätta till det.",
    "prompt": "Hur ofta stämmer det?"
   },
   "en": {
    "scenario": "If a mistake had no consequence, I settle for putting it right.",
    "prompt": "How often is that true?"
   },
   "options": [
    {
     "k": "a",
     "sv": "Nästan aldrig",
     "en": "Almost never",
     "rat_sv": "Beskriver att även konsekvenslösa avvikelser dokumenteras."
    },
    {
     "k": "b",
     "sv": "Ibland",
     "en": "Sometimes",
     "rat_sv": ""
    },
    {
     "k": "c",
     "sv": "Ofta",
     "en": "Often",
     "rat_sv": ""
    },
    {
     "k": "d",
     "sv": "Nästan alltid",
     "en": "Almost always",
     "rat_sv": "Beskriver att konsekvensen avgör om något dokumenteras."
    }
   ]
  },
  {
   "slug": "so-rj-c15",
   "kind": "selfreport",
   "decision": "KEEP",
   "sv": {
    "scenario": "När jag gjort ett fel ändrar jag något konkret i hur jag arbetar, inte bara hur noga jag tänker vara.",
    "prompt": "Hur ofta stämmer det?"
   },
   "en": {
    "scenario": "After making a mistake I change something concrete in how I work, not just how careful I intend to be.",
    "prompt": "How often is that true?"
   },
   "options": [
    {
     "k": "a",
     "sv": "Nästan aldrig",
     "en": "Almost never",
     "rat_sv": "Beskriver avsikt snarare än förändring."
    },
    {
     "k": "b",
     "sv": "Ibland",
     "en": "Sometimes",
     "rat_sv": ""
    },
    {
     "k": "c",
     "sv": "Ofta",
     "en": "Often",
     "rat_sv": ""
    },
    {
     "k": "d",
     "sv": "Nästan alltid",
     "en": "Almost always",
     "rat_sv": "Beskriver en konkret förändring av arbetssättet."
    }
   ]
  },
  {
   "slug": "so-rj-c16",
   "kind": "selfreport",
   "decision": "EDIT",
   "sv": {
    "scenario": "Det är svårare för mig att säga nej till någon jag känner väl än till en främling.",
    "prompt": "Hur ofta stämmer det?"
   },
   "en": {
    "scenario": "It is harder for me to say no to somebody I know well than to a stranger.",
    "prompt": "How often is that true?"
   },
   "options": [
    {
     "k": "a",
     "sv": "Nästan aldrig",
     "en": "Almost never",
     "rat_sv": "Beskriver att gränsen inte förskjuts av bekantskap. Notera att den som aldrig känner detta är ovanlig — frågan är avsedd att utforskas i intervju."
    },
    {
     "k": "b",
     "sv": "Ibland",
     "en": "Sometimes",
     "rat_sv": ""
    },
    {
     "k": "c",
     "sv": "Ofta",
     "en": "Often",
     "rat_sv": ""
    },
    {
     "k": "d",
     "sv": "Nästan alltid",
     "en": "Almost always",
     "rat_sv": "Beskriver att bekantskap gör gränsen svårare att hålla."
    }
   ]
  },
  {
   "slug": "so-rj-c17",
   "kind": "selfreport",
   "decision": "KEEP",
   "sv": {
    "scenario": "När jag säger nej försöker jag samtidigt erbjuda ett sätt för personen att lösa sitt ärende.",
    "prompt": "Hur ofta stämmer det?"
   },
   "en": {
    "scenario": "When I say no I try at the same time to offer a way for the person to get their business done.",
    "prompt": "How often is that true?"
   },
   "options": [
    {
     "k": "a",
     "sv": "Nästan aldrig",
     "en": "Almost never",
     "rat_sv": "Beskriver ett nej utan väg framåt."
    },
    {
     "k": "b",
     "sv": "Ibland",
     "en": "Sometimes",
     "rat_sv": ""
    },
    {
     "k": "c",
     "sv": "Ofta",
     "en": "Often",
     "rat_sv": ""
    },
    {
     "k": "d",
     "sv": "Nästan alltid",
     "en": "Almost always",
     "rat_sv": "Beskriver ett nej med en anvisad väg."
    }
   ]
  },
  {
   "slug": "so-rj-c18",
   "kind": "selfreport",
   "decision": "KEEP",
   "sv": {
    "scenario": "Två sätt att hantera att någon fortsätter tjata efter ett nej. Inget av dem är fel.",
    "prompt": "Vilket liknar dig mest?"
   },
   "en": {
    "scenario": "Two ways of handling somebody who keeps pushing after a no. Neither is wrong.",
    "prompt": "Which is more like you?"
   },
   "options": [
    {
     "k": "a",
     "sv": "Jag upprepar mitt svar och står kvar tills personen ger sig.",
     "en": "I repeat my answer and stand my ground until they give up.",
     "rat_sv": "Beskriver uthållighet i egen sak."
    },
    {
     "k": "b",
     "sv": "Jag kopplar in någon annan som kan ta beslutet, hellre än att bara stå emot.",
     "en": "I bring in somebody who can make the decision, rather than just holding out.",
     "rat_sv": "Beskriver att frågan lyfts. Båda är rimliga; att koppla in någon annan är det som håller över ett helt pass."
    }
   ]
  },
  {
   "slug": "so-rj-c19",
   "kind": "selfreport",
   "decision": "KEEP",
   "sv": {
    "scenario": "Jag försöker lösa saker själv först, så att jag inte stör någon i onödan.",
    "prompt": "Hur ofta stämmer det?"
   },
   "en": {
    "scenario": "I try to sort things out myself first, so as not to disturb anybody unnecessarily.",
    "prompt": "How often is that true?"
   },
   "options": [
    {
     "k": "a",
     "sv": "Nästan aldrig",
     "en": "Almost never",
     "rat_sv": ""
    },
    {
     "k": "b",
     "sv": "Ibland",
     "en": "Sometimes",
     "rat_sv": "Beskriver en tröskel som varken är för hög eller obefintlig."
    },
    {
     "k": "c",
     "sv": "Ofta",
     "en": "Often",
     "rat_sv": ""
    },
    {
     "k": "d",
     "sv": "Nästan alltid",
     "en": "Almost always",
     "rat_sv": "Beskriver en hög tröskel för att kontakta någon, vilket är den vanligaste orsaken till sen eskalering."
    }
   ]
  },
  {
   "slug": "so-rj-c20",
   "kind": "selfreport",
   "decision": "EDIT",
   "sv": {
    "scenario": "Om jag larmat i onödan tar jag upp det efteråt i stället för att låta det passera.",
    "prompt": "Hur ofta stämmer det?"
   },
   "en": {
    "scenario": "If I have escalated unnecessarily, I raise it afterwards rather than letting it go.",
    "prompt": "How often is that true?"
   },
   "options": [
    {
     "k": "a",
     "sv": "Nästan aldrig",
     "en": "Almost never",
     "rat_sv": "Beskriver att den egna felbedömningen inte tas upp."
    },
    {
     "k": "b",
     "sv": "Ibland",
     "en": "Sometimes",
     "rat_sv": ""
    },
    {
     "k": "c",
     "sv": "Ofta",
     "en": "Often",
     "rat_sv": ""
    },
    {
     "k": "d",
     "sv": "Nästan alltid",
     "en": "Almost always",
     "rat_sv": "Beskriver att den egna felbedömningen tas upp."
    }
   ]
  },
  {
   "slug": "so-rj-c21",
   "kind": "selfreport",
   "decision": "KEEP",
   "sv": {
    "scenario": "Vid passets slut säger jag uttryckligen vad jag inte hann med, inte bara vad jag gjorde.",
    "prompt": "Hur ofta stämmer det?"
   },
   "en": {
    "scenario": "At the end of a shift I say explicitly what I did not get to, not only what I did.",
    "prompt": "How often is that true?"
   },
   "options": [
    {
     "k": "a",
     "sv": "Nästan aldrig",
     "en": "Almost never",
     "rat_sv": "Beskriver att det ogjorda inte förs vidare."
    },
    {
     "k": "b",
     "sv": "Ibland",
     "en": "Sometimes",
     "rat_sv": ""
    },
    {
     "k": "c",
     "sv": "Ofta",
     "en": "Often",
     "rat_sv": ""
    },
    {
     "k": "d",
     "sv": "Nästan alltid",
     "en": "Almost always",
     "rat_sv": "Beskriver att det ogjorda förs vidare."
    }
   ]
  },
  {
   "slug": "so-rj-c22",
   "kind": "selfreport",
   "decision": "KEEP",
   "sv": {
    "scenario": "Efter en obehaglig ordväxling märker jag att jag är kortare i tonen mot nästa person jag möter.",
    "prompt": "Hur ofta stämmer det?"
   },
   "en": {
    "scenario": "After an unpleasant exchange I notice that I am shorter with the next person I meet.",
    "prompt": "How often is that true?"
   },
   "options": [
    {
     "k": "a",
     "sv": "Nästan aldrig",
     "en": "Almost never",
     "rat_sv": "Beskriver att bemötandet inte färgas av föregående situation."
    },
    {
     "k": "b",
     "sv": "Ibland",
     "en": "Sometimes",
     "rat_sv": ""
    },
    {
     "k": "c",
     "sv": "Ofta",
     "en": "Often",
     "rat_sv": ""
    },
    {
     "k": "d",
     "sv": "Nästan alltid",
     "en": "Almost always",
     "rat_sv": "Beskriver att bemötandet färgas av föregående situation."
    }
   ]
  },
  {
   "slug": "so-rj-c23",
   "kind": "selfreport",
   "decision": "KEEP",
   "sv": {
    "scenario": "Jag har något jag gör medvetet för att komma tillbaka efter en pressad situation.",
    "prompt": "Hur ofta stämmer det?"
   },
   "en": {
    "scenario": "I have something I do deliberately to get back on an even keel after a tense situation.",
    "prompt": "How often is that true?"
   },
   "options": [
    {
     "k": "a",
     "sv": "Nästan aldrig",
     "en": "Almost never",
     "rat_sv": "Beskriver att inget medvetet sätt finns."
    },
    {
     "k": "b",
     "sv": "Ibland",
     "en": "Sometimes",
     "rat_sv": ""
    },
    {
     "k": "c",
     "sv": "Ofta",
     "en": "Often",
     "rat_sv": ""
    },
    {
     "k": "d",
     "sv": "Nästan alltid",
     "en": "Almost always",
     "rat_sv": "Beskriver ett etablerat sätt att återgå."
    }
   ]
  },
  {
   "slug": "so-rj-c24",
   "kind": "selfreport",
   "decision": "KEEP",
   "sv": {
    "scenario": "Två sätt att hantera ett samtal som håller på att gå överstyr. Inget av dem är fel.",
    "prompt": "Vilket liknar dig mest?"
   },
   "en": {
    "scenario": "Two ways of handling a conversation that is getting out of hand. Neither is wrong.",
    "prompt": "Which is more like you?"
   },
   "options": [
    {
     "k": "a",
     "sv": "Jag fortsätter förklara tills personen förstår varför beslutet är som det är.",
     "en": "I keep explaining until the person understands why the decision is what it is.",
     "rat_sv": "Beskriver uthållighet i samtalet."
    },
    {
     "k": "b",
     "sv": "Jag avslutar samtalet i tid och hänvisar vidare, hellre än att fortsätta.",
     "en": "I end the conversation in good time and refer them on, rather than continuing.",
     "rat_sv": "Beskriver att samtalet avslutas i tid. Båda är rimliga; att avsluta är oftare det som håller nivån nere."
    }
   ]
  },
  {
   "slug": "so-rj-e01",
   "kind": "reflection",
   "decision": "EDIT",
   "sv": {
    "scenario": "Den här frågan har inget rätt svar, och en människa läser ditt svar. Berätta gärna vad som hände, vad som var din uppgift, vad du själv gjorde, hur det slutade och vad du tog med dig. Några meningar räcker.",
    "prompt": "Beskriv en situation där du gjorde ett misstag på jobbet. Vad gjorde du efteråt?"
   },
   "en": {
    "scenario": "This question has no right answer, and a person reads what you write. Tell us what happened, what your role was, what you yourself did, how it ended and what you took from it. A few sentences is enough.",
    "prompt": "Describe a situation where you made a mistake at work. What did you do afterwards?"
   },
   "options": []
  },
  {
   "slug": "so-rj-e02",
   "kind": "reflection",
   "decision": "EDIT",
   "sv": {
    "scenario": "Den här frågan har inget rätt svar, och en människa läser ditt svar. Berätta gärna vad som hände, vad som var din uppgift, vad du själv sa och gjorde, hur det slutade och vad du tog med dig. Några meningar räcker.",
    "prompt": "Beskriv en situation där du behövde säga nej till någon trots att det var socialt obekvämt."
   },
   "en": {
    "scenario": "This question has no right answer, and a person reads what you write. Tell us what happened, what your role was, what you yourself said and did, how it ended and what you took from it. A few sentences is enough.",
    "prompt": "Describe a situation where you had to say no to somebody even though it was socially uncomfortable."
   },
   "options": []
  },
  {
   "slug": "so-rj-e03",
   "kind": "reflection",
   "decision": "EDIT",
   "sv": {
    "scenario": "Den här frågan har inget rätt svar, och en människa läser ditt svar. Arbetet behöver inte ha varit inom säkerhet. Berätta gärna vad arbetet var, vad som var din uppgift, vad du gjorde för att hålla koncentrationen, hur det gick och vad du tog med dig. Några meningar räcker.",
    "prompt": "Beskriv en situation där du behövde hålla koncentrationen uppe under upprepat arbete. Hur gjorde du?"
   },
   "en": {
    "scenario": "This question has no right answer, and a person reads what you write. The work does not have to have been in security. Tell us what the work was, what your role was, what you did to keep your concentration, how it went and what you took from it. A few sentences is enough.",
    "prompt": "Describe a situation where you had to maintain concentration during repetitive work. How did you do it?"
   },
   "options": []
  },
  {
   "slug": "so-rj-e04",
   "kind": "reflection",
   "decision": "EDIT",
   "sv": {
    "scenario": "Den här frågan har inget rätt svar, och en människa läser ditt svar. Berätta gärna vad uppgiften gällde, vad som var din roll, hur du upptäckte felet och vad du gjorde, hur det slutade och vad du tog med dig. Några meningar räcker.",
    "prompt": "Beskriv en situation där information du fick från början visade sig vara felaktig. Vad gjorde du då?"
   },
   "en": {
    "scenario": "This question has no right answer, and a person reads what you write. Tell us what the information concerned, what your role was, how you discovered the error and what you did, how it ended and what you took from it. A few sentences is enough.",
    "prompt": "Describe a situation where information you were given initially turned out to be wrong. What did you do then?"
   },
   "options": []
  }
 ],
 "blocks": [
  {
   "key": "c_behaviour",
   "intro_sv": "Tjugofyra frågor om hur du brukar arbeta. Det här är inte ett personlighetstest och det finns inget facit. Svaren redovisas för arbetsgivaren som det du själv beskriver — aldrig som något vi har observerat. Svara som det faktiskt ser ut, inte som det borde se ut. Har du inte arbetat inom bevakning, utgå från annat arbete du har haft.",
   "intro_en": "Twenty-four questions about how you usually work. This is not a personality test and there is no answer key. Your answers are reported to the employer as what you describe about yourself — never as something we observed. Answer as things actually are, not as they ought to be. If you have not worked in security, answer from other work you have done."
  },
  {
   "key": "e_reflection",
   "intro_sv": "Fyra frågor om egna erfarenheter. Berätta vad som hände, vad som var din roll, vad du gjorde, hur det slutade och vad du lärde dig. Svaren läses av en människa, inte av en modell. Några meningar räcker.",
   "intro_en": "Four questions about your own experience. Say what happened, what your role was, what you did, how it ended and what you learned. A person reads these, not a model. A few sentences is enough."
  }
 ],
 "rubrics": [
  {
   "slug": "so-rj-e01-own-mistake",
   "dimensions": [
    {
     "key": "concrete_situation",
     "sv": "En verklig, avgränsad händelse beskrivs — inte en princip eller en styrka i förklädnad — och personens egen roll i den framgår.",
     "en": "A real, bounded event is described — not a principle or a strength in disguise — and the person's own role in it is clear."
    },
    {
     "key": "what_was_done",
     "sv": "Det framgår vad personen faktiskt gjorde efteråt, vem som fick veta och vad det ledde till.",
     "en": "What the person actually did afterwards, who was told, and what came of it, is stated."
    },
    {
     "key": "ownership",
     "sv": "Ansvaret placeras hos personen själv snarare än hos förutsättningarna, och personen kan säga vad hen gör annorlunda i dag.",
     "en": "Responsibility is located with the person rather than with the circumstances, and the person can say what they do differently now."
    }
   ]
  },
  {
   "slug": "so-rj-e02-saying-no",
   "dimensions": [
    {
     "key": "concrete_situation",
     "sv": "En verklig situation med en identifierbar motpart beskrivs, och personens egen roll i den framgår.",
     "en": "A real situation with an identifiable other party is described, and the person's own role in it is clear."
    },
    {
     "key": "held_the_line",
     "sv": "Det framgår vad personen sa och gjorde och hur det slutade — om gränsen höll, eller varför den inte gjorde det.",
     "en": "What the person said and did is stated, and how it ended — whether the line held, or why it did not."
    }
   ]
  },
  {
   "slug": "so-rj-e03-sustained-attention",
   "dimensions": [
    {
     "key": "self_observation",
     "sv": "Personen kan beskriva hur hen märker att uppmärksamheten sviktar, och vad hen tagit med sig av det.",
     "en": "The person can describe how they notice their attention slipping, and what they have taken from it."
    }
   ]
  },
  {
   "slug": "so-rj-e04-wrong-information",
   "dimensions": [
    {
     "key": "correction_forward",
     "sv": "De som agerat på den felaktiga uppgiften informerades, eller så framgår varför inte — och det framgår vad personen tar med sig.",
     "en": "Those who had acted on the wrong information were told, or it is clear why not — and what the person takes from it is stated."
    }
   ]
  }
 ],
 "en_adaptation": {
  "reviewed_by": "PR-V3 content review, AI-assisted (Claude) — not a named human language reviewer",
  "notes": "2026-09-03 content/language review: same scenario, same behavioural demand, same key, same option plausibility and no Swedish-specific idiom that changes difficulty. This is a CONTENT/LANGUAGE review, not validation: no psychometric equivalence is claimed and the 'language' review requirement stays outstanding until a named human reviewer clears it."
 }
}$vaktare_content$::jsonb AS doc;

-- ═══════════════════════════════════════════════════════════════════════════
-- Identity snapshot: everything that carries scoring or competency identity,
-- captured before a single text is touched and compared after.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TEMP TABLE _v3_before AS
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
  _n int; _items int := 0; _opts int := 0; _b jsonb; _r jsonb; _d jsonb; _rv uuid;
  _adapt jsonb; _kind text;
BEGIN
  SELECT doc INTO _doc FROM _v3_doc;
  SELECT id INTO _form FROM public.scp_forms WHERE slug = 'security-officer-recruitment-form-a';
  IF _form IS NULL THEN
    RAISE EXCEPTION 'SCP_V3_FORM_MISSING: security-officer-recruitment-form-a is not authored here.';
  END IF;
  _adapt := _doc->'en_adaptation';

  FOR _it IN SELECT * FROM jsonb_array_elements(_doc->'items') LOOP
    _kind := _it->>'kind';
    SELECT iv.id, iv.content_status INTO _iv, _status
      FROM public.scp_items i
      JOIN public.scp_item_versions iv ON iv.item_id = i.id AND iv.version_number = 1
     WHERE i.slug = _it->>'slug';
    IF _iv IS NULL THEN
      RAISE EXCEPTION 'SCP_V3_ITEM_MISSING: % has no version 1.', _it->>'slug';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.scp_form_items WHERE form_id = _form AND item_version_id = _iv) THEN
      RAISE EXCEPTION 'SCP_V3_ITEM_NOT_ON_FORM: % v1 is not on form A.', _it->>'slug';
    END IF;
    -- The platform's own rule (scp_guard_published_immutable): draft content is
    -- editable in place, immutability begins at approval. Say so explicitly
    -- rather than letting the trigger say it for us.
    IF _status <> 'draft' THEN
      RAISE EXCEPTION 'SCP_V3_NOT_DRAFT: % v1 is "%"; edit a new version instead.', _it->>'slug', _status;
    END IF;

    UPDATE public.scp_item_texts
       SET scenario = _it#>>'{sv,scenario}', prompt = _it#>>'{sv,prompt}'
     WHERE item_version_id = _iv AND language = 'sv-SE';
    GET DIAGNOSTICS _n = ROW_COUNT;
    IF _n <> 1 THEN RAISE EXCEPTION 'SCP_V3_TEXT_MISSING: % sv-SE', _it->>'slug'; END IF;

    UPDATE public.scp_item_texts
       SET scenario = _it#>>'{en,scenario}', prompt = _it#>>'{en,prompt}',
           adaptation_status = CASE WHEN _adapt IS NULL OR _adapt = 'null'::jsonb
                                    THEN 'adaptation_pending' ELSE 'adaptation_reviewed' END,
           adaptation_notes  = CASE WHEN _adapt IS NULL OR _adapt = 'null'::jsonb
                                    THEN NULL ELSE _adapt->>'notes' END,
           reviewed_by       = CASE WHEN _adapt IS NULL OR _adapt = 'null'::jsonb
                                    THEN NULL ELSE _adapt->>'reviewed_by' END,
           reviewed_at       = CASE WHEN _adapt IS NULL OR _adapt = 'null'::jsonb
                                    THEN NULL ELSE now() END
     WHERE item_version_id = _iv AND language = 'en-GB';
    GET DIAGNOSTICS _n = ROW_COUNT;
    IF _n <> 1 THEN RAISE EXCEPTION 'SCP_V3_TEXT_MISSING: % en-GB', _it->>'slug'; END IF;

    SELECT count(*) INTO _n FROM public.scp_item_options WHERE item_version_id = _iv;
    IF _n <> jsonb_array_length(_it->'options') THEN
      RAISE EXCEPTION 'SCP_V3_OPTION_COUNT: % has % options in the database and % in the document.',
        _it->>'slug', _n, jsonb_array_length(_it->'options');
    END IF;

    FOR _o IN SELECT * FROM jsonb_array_elements(_it->'options') LOOP
      SELECT id INTO _oid FROM public.scp_item_options
       WHERE item_version_id = _iv AND option_key = _o->>'k';
      IF _oid IS NULL THEN
        RAISE EXCEPTION 'SCP_V3_OPTION_MISSING: % option %', _it->>'slug', _o->>'k';
      END IF;
      -- Rationale and error-pattern label only. score_value, is_preferred,
      -- reverse_scored and display_order are deliberately not in this UPDATE.
      IF _kind = 'scenario' THEN
        UPDATE public.scp_item_options
           SET scoring_rationale_sv = _o->>'rat_sv',
               distractor_error_type = nullif(_o->>'err', '')
         WHERE id = _oid;
      ELSE
        UPDATE public.scp_item_options
           SET scoring_rationale_sv = _o->>'rat_sv'
         WHERE id = _oid;
      END IF;
      UPDATE public.scp_item_option_texts SET label = _o->>'sv'
       WHERE item_option_id = _oid AND language = 'sv-SE';
      GET DIAGNOSTICS _n = ROW_COUNT;
      IF _n <> 1 THEN RAISE EXCEPTION 'SCP_V3_LABEL_MISSING: % % sv-SE', _it->>'slug', _o->>'k'; END IF;
      UPDATE public.scp_item_option_texts SET label = _o->>'en'
       WHERE item_option_id = _oid AND language = 'en-GB';
      GET DIAGNOSTICS _n = ROW_COUNT;
      IF _n <> 1 THEN RAISE EXCEPTION 'SCP_V3_LABEL_MISSING: % % en-GB', _it->>'slug', _o->>'k'; END IF;
      _opts := _opts + 1;
    END LOOP;
    _items := _items + 1;
  END LOOP;

  FOR _b IN SELECT * FROM jsonb_array_elements(_doc->'blocks') LOOP
    UPDATE public.scp_form_blocks
       SET intro_sv = _b->>'intro_sv', intro_en = _b->>'intro_en'
     WHERE form_id = _form AND block_key = _b->>'key';
    GET DIAGNOSTICS _n = ROW_COUNT;
    IF _n <> 1 THEN RAISE EXCEPTION 'SCP_V3_BLOCK_MISSING: %', _b->>'key'; END IF;
  END LOOP;

  FOR _r IN SELECT * FROM jsonb_array_elements(_doc->'rubrics') LOOP
    SELECT rv.id, rv.content_status INTO _rv, _status
      FROM public.scp_rubrics r
      JOIN public.scp_rubric_versions rv ON rv.rubric_id = r.id AND rv.version_number = 1
     WHERE r.slug = _r->>'slug';
    IF _rv IS NULL THEN RAISE EXCEPTION 'SCP_V3_RUBRIC_MISSING: %', _r->>'slug'; END IF;
    IF _status <> 'draft' THEN
      RAISE EXCEPTION 'SCP_V3_RUBRIC_NOT_DRAFT: % v1 is "%".', _r->>'slug', _status;
    END IF;
    FOR _d IN SELECT * FROM jsonb_array_elements(_r->'dimensions') LOOP
      -- Criteria wording only: dimension keys, display order, the style flag
      -- and the five levels are untouched, so the derived contribution is
      -- computed exactly as before.
      UPDATE public.scp_rubric_dimensions
         SET observable_criteria_sv = _d->>'sv', observable_criteria_en = _d->>'en'
       WHERE rubric_version_id = _rv AND dimension_key = _d->>'key';
      GET DIAGNOSTICS _n = ROW_COUNT;
      IF _n <> 1 THEN RAISE EXCEPTION 'SCP_V3_DIMENSION_MISSING: % %', _r->>'slug', _d->>'key'; END IF;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'vaktare v1 content review: % items, % option labels rewritten in both languages', _items, _opts;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Proof. Identity first, then the content-quality facts this migration is
-- responsible for. Any failure aborts the transaction and nothing is applied.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE _n int; _m int; _sv_long int; _en_long int; _sv_short int; _en_short int;
        _sv_r1 int; _sv_r2 int; _sv_r3 int; _en_r1 int; _en_r2 int; _en_r3 int;
BEGIN
  -- Identity: the same rows, with the same scoring and competency values.
  WITH after AS (
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
     WHERE f.slug = 'security-officer-recruitment-form-a')
  SELECT (SELECT count(*) FROM (SELECT * FROM _v3_before EXCEPT SELECT * FROM after) x)
       + (SELECT count(*) FROM (SELECT * FROM after EXCEPT SELECT * FROM _v3_before) x),
         (SELECT count(*) FROM after)
    INTO _n, _m;
  IF _n <> 0 THEN
    RAISE EXCEPTION 'SCP_V3_IDENTITY_CHANGED: % identity row(s) differ from the snapshot -- an option id, score, key, order, competency, facet, behaviour, evidence type, status or review gate moved.', _n;
  END IF;
  IF _m <> (SELECT count(*) FROM _v3_before) THEN
    RAISE EXCEPTION 'SCP_V3_IDENTITY_COUNT: % rows before, % after.', (SELECT count(*) FROM _v3_before), _m;
  END IF;

  -- Shape: 50 = 22 + 24 + 4, 26 observed + 24 self-reported, 5 sections.
  SELECT count(*),
         count(*) FILTER (WHERE iv.item_format = 'sjt_best_response'),
         count(*) FILTER (WHERE iv.item_format = 'biq_frequency'),
         count(*) FILTER (WHERE iv.item_format = 'constructed_response')
    INTO _n, _sv_r1, _sv_r2, _sv_r3
    FROM public.scp_form_items fi JOIN public.scp_forms f ON f.id = fi.form_id
    JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
   WHERE f.slug = 'security-officer-recruitment-form-a';
  IF _n <> 50 OR _sv_r1 <> 22 OR _sv_r2 <> 24 OR _sv_r3 <> 4 THEN
    RAISE EXCEPTION 'SCP_V3_SHAPE: expected 50 = 22 scenario + 24 self-report + 4 free text, found % = % + % + %.', _n, _sv_r1, _sv_r2, _sv_r3;
  END IF;
  SELECT count(*) FILTER (WHERE iv.evidence_source_type = 'self_report' AND iv.item_format = 'biq_frequency' AND NOT fi.randomise_options)
    INTO _n
    FROM public.scp_form_items fi JOIN public.scp_forms f ON f.id = fi.form_id
    JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
   WHERE f.slug = 'security-officer-recruitment-form-a';
  IF _n <> 24 THEN
    RAISE EXCEPTION 'SCP_V3_SELF_REPORT: expected 24 self_report items in authored (unrandomised) order, found %.', _n;
  END IF;

  -- Both languages on every item and every option, no empty text.
  SELECT count(*) INTO _n
    FROM public.scp_form_items fi JOIN public.scp_forms f ON f.id = fi.form_id
   WHERE f.slug = 'security-officer-recruitment-form-a'
     AND (SELECT count(*) FROM public.scp_item_texts t
           WHERE t.item_version_id = fi.item_version_id
             AND t.language IN ('sv-SE','en-GB')
             AND length(trim(t.scenario)) > 0 AND length(trim(t.prompt)) > 0) <> 2;
  IF _n > 0 THEN RAISE EXCEPTION 'SCP_V3_LANGUAGE_GAP: % item(s) lack a complete sv-SE + en-GB text.', _n; END IF;
  SELECT count(*) INTO _n
    FROM public.scp_form_items fi JOIN public.scp_forms f ON f.id = fi.form_id
    JOIN public.scp_item_options o ON o.item_version_id = fi.item_version_id
   WHERE f.slug = 'security-officer-recruitment-form-a'
     AND (SELECT count(*) FROM public.scp_item_option_texts ot
           WHERE ot.item_option_id = o.id AND ot.language IN ('sv-SE','en-GB')
             AND length(trim(ot.label)) > 0) <> 2;
  IF _n > 0 THEN RAISE EXCEPTION 'SCP_V3_OPTION_LANGUAGE_GAP: % option(s) lack a complete sv-SE + en-GB label.', _n; END IF;

  -- Governance honesty is unchanged: draft/design, AI-authored, five gates
  -- outstanding, every review_status column still pending. This migration
  -- clears NO gate; the en-GB text status is the only status it moves, and
  -- 'adaptation_reviewed' is not 'approved'.
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
  IF _n > 0 THEN RAISE EXCEPTION 'SCP_V3_GOVERNANCE_CLAIM: % item(s) claim review they have not had.', _n; END IF;
  SELECT count(*) INTO _n
    FROM public.scp_form_items fi JOIN public.scp_forms f ON f.id = fi.form_id
    JOIN public.scp_item_texts t ON t.item_version_id = fi.item_version_id
   WHERE f.slug = 'security-officer-recruitment-form-a'
     AND t.adaptation_status IN ('approved', 'source');
  IF _n > 0 THEN RAISE EXCEPTION 'SCP_V3_ADAPTATION_OVERCLAIM: % text(s) claim approved/source status.', _n; END IF;

  -- Option-length balance over the 22 scenario items, per language: the
  -- preferred option must not be the longest, or the shortest, on a majority
  -- of items, and every length rank must be represented. Form must not
  -- reveal the key.
  WITH ranked AS (
    SELECT o.item_version_id, t.language, o.is_preferred,
           rank() OVER (PARTITION BY o.item_version_id, t.language ORDER BY length(t.label) DESC) AS len_rank,
           count(*) OVER (PARTITION BY o.item_version_id, t.language) AS n_opts
      FROM public.scp_item_options o
      JOIN public.scp_item_option_texts t ON t.item_option_id = o.id
      JOIN public.scp_form_items fi ON fi.item_version_id = o.item_version_id
      JOIN public.scp_forms f ON f.id = fi.form_id
      JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
     WHERE f.slug = 'security-officer-recruitment-form-a' AND iv.item_format = 'sjt_best_response')
  SELECT count(*) FILTER (WHERE language = 'sv-SE' AND len_rank = 1),
         count(*) FILTER (WHERE language = 'en-GB' AND len_rank = 1),
         count(*) FILTER (WHERE language = 'sv-SE' AND len_rank = n_opts),
         count(*) FILTER (WHERE language = 'en-GB' AND len_rank = n_opts),
         count(*) FILTER (WHERE language = 'sv-SE' AND len_rank = 2),
         count(*) FILTER (WHERE language = 'en-GB' AND len_rank = 2)
    INTO _sv_long, _en_long, _sv_short, _en_short, _sv_r2, _en_r2
    FROM ranked WHERE is_preferred;
  IF (_sv_long > 11 OR _en_long > 11) THEN
    RAISE EXCEPTION 'SCP_V3_LENGTH_BIAS: the preferred option is the longest on %/22 (sv) and %/22 (en) scenario items.', _sv_long, _en_long;
  END IF;
  IF (_sv_short > 11 OR _en_short > 11) THEN
    RAISE EXCEPTION 'SCP_V3_LENGTH_BIAS: the preferred option is the shortest on %/22 (sv) and %/22 (en) scenario items.', _sv_short, _en_short;
  END IF;
  IF least(_sv_long, _sv_short, _sv_r2, _en_long, _en_short, _en_r2) < 3 THEN
    RAISE EXCEPTION 'SCP_V3_LENGTH_BIAS: a length rank is nearly absent for the preferred option (sv %/%/%, en %/%/%).',
      _sv_long, _sv_r2, _sv_short, _en_long, _en_r2, _en_short;
  END IF;

  -- Every scenario distractor carries an error pattern, the preferred option none.
  SELECT count(*) INTO _n
    FROM public.scp_item_options o
    JOIN public.scp_form_items fi ON fi.item_version_id = o.item_version_id
    JOIN public.scp_forms f ON f.id = fi.form_id
    JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
   WHERE f.slug = 'security-officer-recruitment-form-a' AND iv.item_format = 'sjt_best_response'
     AND ((o.is_preferred AND o.distractor_error_type IS NOT NULL)
       OR (NOT o.is_preferred AND (o.distractor_error_type IS NULL OR length(trim(o.scoring_rationale_sv)) = 0)));
  IF _n > 0 THEN RAISE EXCEPTION 'SCP_V3_DISTRACTOR_PATTERN: % scenario option(s) lack an error pattern or rationale where one is required.', _n; END IF;

  RAISE NOTICE 'vaktare v1 content proven: identity unchanged, 50 = 22 + 24 + 4, bilingual, gates untouched, preferred-longest sv %/22 en %/22, preferred-shortest sv %/22 en %/22',
    _sv_long, _en_long, _sv_short, _en_short;
END $$;

DROP TABLE IF EXISTS _v3_before;
DROP TABLE IF EXISTS _v3_doc;
