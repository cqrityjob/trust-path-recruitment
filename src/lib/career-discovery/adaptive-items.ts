// The path-specific adaptive bank — 20 items, 5 paths × 4.
//
// Wording, stable ids and report tags are OWNER-LOCKED, transcribed
// verbatim from the implementation directive §8–§12.
//
// ── THE SCORING BOUNDARY ───────────────────────────────────────────────
//
// Every item here carries `evidenceClass: "contextual_self_report"` and an
// empty `axes` array. That is not decoration — it is the enforcement point.
// `isScoredItem()` derives from the evidence class, so an adaptive answer
// is structurally invisible to anything that reads scoring evidence.
//
// Adaptive answers MAY influence:  report wording · recommended learning ·
//                                  next steps · examples · career guidance
// Adaptive answers MUST NOT influence:  Security Career DNA · Security
//                                  Career Area ranking · report generation
//                                  inputs · the recommendation engine ·
//                                  candidate scoring · confidence · coverage
//
// They are also NOT presented as validated psychometric measures, NOT used
// for employer decisions, and NEVER produce a pass/fail or suitability
// outcome. Path E in particular remains Career Discovery: it is not an
// employer leadership assessment and claims no leadership validation.
//
// The guard script asserts all of this mechanically.

import type { AdaptivePath, DiscoveryItem, ItemOption } from "./types";

/** Four options, each carrying exactly one contextual report tag. */
function tagged(
  entries: Array<{ value: string; sv: string; en: string; tag: string }>,
): ItemOption[] {
  return entries.map((e) => ({
    value: e.value,
    label: { sv: e.sv, en: e.en },
    reportTags: [e.tag],
  }));
}

/** Shared shape for every adaptive item — unscored contextual evidence. */
function adaptive(
  id: string,
  prompt: { sv: string; en: string },
  options: ItemOption[],
): DiscoveryItem {
  return {
    id,
    kind: "adaptive",
    itemVersion: 1,
    evidenceClass: "contextual_self_report",
    axes: [],
    estimatedSeconds: 30,
    prompt,
    options,
  };
}

// =========================================================================
// Path A · exploring_security
// =========================================================================

const PATH_A: DiscoveryItem[] = [
  adaptive(
    "ADAPT_EXPLORE_01",
    {
      sv: "Vilken typ av arbetsuppgift väcker mest nyfikenhet hos dig?",
      en: "Which type of work makes you most curious?",
    },
    tagged([
      {
        value: "a",
        sv: "Att vara närvarande där något händer och hjälpa till direkt",
        en: "Being present where something is happening and helping directly",
        tag: "operational_interest",
      },
      {
        value: "b",
        sv: "Att förstå vad som har hänt genom information och detaljer",
        en: "Understanding what happened through information and details",
        tag: "investigative_interest",
      },
      {
        value: "c",
        sv: "Att hitta risker och förebygga problem innan de uppstår",
        en: "Identifying risks and preventing problems before they occur",
        tag: "preventive_interest",
      },
      {
        value: "d",
        sv: "Att arbeta med teknik, system eller digitala miljöer",
        en: "Working with technology, systems or digital environments",
        tag: "technology_interest",
      },
    ]),
  ),
  adaptive(
    "ADAPT_EXPLORE_02",
    {
      sv: "I vilken situation tror du att du skulle trivas bäst?",
      en: "In which situation do you think you would thrive most?",
    },
    tagged([
      {
        value: "a",
        sv: "I nära kontakt med människor under en varierad arbetsdag",
        en: "In close contact with people during a varied working day",
        tag: "high_people_contact",
      },
      {
        value: "b",
        sv: "I ett mindre team med tydligt gemensamt ansvar",
        en: "In a smaller team with clear shared responsibility",
        tag: "team_orientation",
      },
      {
        value: "c",
        sv: "Självständigt med tid att koncentrera mig",
        en: "Working independently with time to concentrate",
        tag: "independent_focus",
      },
      {
        value: "d",
        sv: "I en roll där jag växlar mellan människor, analys och planering",
        en: "In a role that combines people, analysis and planning",
        tag: "mixed_work_style",
      },
    ]),
  ),
  adaptive(
    "ADAPT_EXPLORE_03",
    {
      sv: "Vilken typ av ansvar känns mest meningsfullt för dig?",
      en: "Which type of responsibility feels most meaningful to you?",
    },
    tagged([
      {
        value: "a",
        sv: "Att människor känner sig trygga här och nu",
        en: "Helping people feel safe here and now",
        tag: "immediate_protection",
      },
      {
        value: "b",
        sv: "Att rätt information kommer fram",
        en: "Making sure the right information comes to light",
        tag: "truth_information",
      },
      {
        value: "c",
        sv: "Att rutiner och skydd fungerar som de ska",
        en: "Ensuring procedures and protective measures work as intended",
        tag: "assurance_structure",
      },
      {
        value: "d",
        sv: "Att organisationen är bättre förberedd inför framtiden",
        en: "Helping an organisation become better prepared for the future",
        tag: "strategic_resilience",
      },
    ]),
  ),
  adaptive(
    "ADAPT_EXPLORE_04",
    {
      sv: "Vad skulle du helst vilja få möjlighet att utveckla först?",
      en: "What would you most like the opportunity to develop first?",
    },
    tagged([
      {
        value: "a",
        sv: "Min förmåga att agera tryggt i praktiska situationer",
        en: "My ability to act confidently in practical situations",
        tag: "practical_development",
      },
      {
        value: "b",
        sv: "Min förmåga att analysera och dra slutsatser",
        en: "My ability to analyse and draw conclusions",
        tag: "analytical_development",
      },
      {
        value: "c",
        sv: "Min kunskap om regler, risker och säkerhetsarbete",
        en: "My knowledge of rules, risks and security work",
        tag: "governance_development",
      },
      {
        value: "d",
        sv: "Min tekniska eller digitala kompetens",
        en: "My technical or digital skills",
        tag: "technical_development",
      },
    ]),
  ),
];

// =========================================================================
// Path B · working_in_security
// =========================================================================

const PATH_B: DiscoveryItem[] = [
  adaptive(
    "ADAPT_WORKING_01",
    {
      sv: "Vilken typ av uppgift ger dig mest energi i ditt nuvarande arbete?",
      en: "Which type of task gives you the most energy in your current work?",
    },
    tagged([
      {
        value: "a",
        sv: "Att lösa något direkt i den operativa verksamheten",
        en: "Solving something directly in operational work",
        tag: "operational_energy",
      },
      {
        value: "b",
        sv: "Att förstå ett problem på djupet",
        en: "Understanding a problem in depth",
        tag: "investigative_energy",
      },
      {
        value: "c",
        sv: "Att förbättra en rutin, process eller säkerhetsåtgärd",
        en: "Improving a procedure, process or security measure",
        tag: "improvement_energy",
      },
      {
        value: "d",
        sv: "Att stödja eller samordna andra",
        en: "Supporting or coordinating others",
        tag: "coordination_energy",
      },
    ]),
  ),
  adaptive(
    "ADAPT_WORKING_02",
    {
      sv: "I vilka situationer söker kollegor oftast din hjälp?",
      en: "In which situations do colleagues most often seek your help?",
    },
    tagged([
      {
        value: "a",
        sv: "När något måste hanteras lugnt och praktiskt",
        en: "When something needs to be handled calmly and practically",
        tag: "trusted_operator",
      },
      {
        value: "b",
        sv: "När information behöver granskas eller förstås",
        en: "When information needs to be reviewed or understood",
        tag: "trusted_analyst",
      },
      {
        value: "c",
        sv: "När regler, rutiner eller krav behöver tolkas",
        en: "When rules, procedures or requirements need interpretation",
        tag: "trusted_adviser",
      },
      {
        value: "d",
        sv: "När flera personer behöver samordnas eller få riktning",
        en: "When several people need coordination or direction",
        tag: "trusted_coordinator",
      },
    ]),
  ),
  adaptive(
    "ADAPT_WORKING_03",
    {
      sv: "När du ser något som inte fungerar tillräckligt bra, vad faller sig mest naturligt?",
      en: "When you notice something that is not working well enough, what feels most natural?",
    },
    tagged([
      {
        value: "a",
        sv: "Jag rättar till problemet direkt om jag kan",
        en: "I correct the problem immediately if I can",
        tag: "immediate_correction",
      },
      {
        value: "b",
        sv: "Jag tar reda på varför det uppstod",
        en: "I investigate why it occurred",
        tag: "root_cause",
      },
      {
        value: "c",
        sv: "Jag föreslår en tydligare rutin eller kontroll",
        en: "I suggest a clearer procedure or control",
        tag: "process_improvement",
      },
      {
        value: "d",
        sv: "Jag samlar berörda och driver frågan tills den är löst",
        en: "I bring the relevant people together and drive it to resolution",
        tag: "stakeholder_leadership",
      },
    ]),
  ),
  adaptive(
    "ADAPT_WORKING_04",
    {
      sv: "Vilken utveckling känns mest intressant för dig just nu?",
      en: "Which development direction interests you most right now?",
    },
    tagged([
      {
        value: "a",
        sv: "Bli ännu skickligare inom det operativa arbetet",
        en: "Becoming even stronger in operational work",
        tag: "operational_mastery",
      },
      {
        value: "b",
        sv: "Specialisera mig inom ett tydligt expertområde",
        en: "Specialising in a defined area of expertise",
        tag: "specialist_path",
      },
      {
        value: "c",
        sv: "Ta större ansvar för planering, kvalitet eller utveckling",
        en: "Taking greater responsibility for planning, quality or development",
        tag: "governance_path",
      },
      {
        value: "d",
        sv: "Leda människor, verksamhet eller större säkerhetsfrågor",
        en: "Leading people, operations or broader security matters",
        tag: "leadership_path",
      },
    ]),
  ),
];

// =========================================================================
// Path C · developing_current_role
// =========================================================================

const PATH_C: DiscoveryItem[] = [
  adaptive(
    "ADAPT_DEVELOP_01",
    {
      sv: "Vilken del av din nuvarande roll vill du att andra ska kunna förlita sig ännu mer på?",
      en: "Which part of your current role would you like others to rely on even more?",
    },
    tagged([
      {
        value: "a",
        sv: "Att jag agerar stabilt när något händer",
        en: "That I act steadily when something happens",
        tag: "operational_reliability",
      },
      {
        value: "b",
        sv: "Att jag upptäcker sådant andra missar",
        en: "That I notice things others miss",
        tag: "analytical_reliability",
      },
      {
        value: "c",
        sv: "Att jag skapar struktur och kvalitet",
        en: "That I create structure and quality",
        tag: "quality_reliability",
      },
      {
        value: "d",
        sv: "Att jag hjälper andra att lyckas",
        en: "That I help others succeed",
        tag: "people_reliability",
      },
    ]),
  ),
  adaptive(
    "ADAPT_DEVELOP_02",
    {
      sv: "Vad begränsar din utveckling mest just nu?",
      en: "What is limiting your development most right now?",
    },
    tagged([
      {
        value: "a",
        sv: "Jag behöver mer praktisk erfarenhet",
        en: "I need more practical experience",
        tag: "experience_gap",
      },
      {
        value: "b",
        sv: "Jag behöver fördjupa min specialistkunskap",
        en: "I need deeper specialist knowledge",
        tag: "knowledge_gap",
      },
      {
        value: "c",
        sv: "Jag behöver större mandat eller mer ansvar",
        en: "I need greater authority or responsibility",
        tag: "responsibility_gap",
      },
      {
        value: "d",
        sv: "Jag behöver en tydligare bild av nästa steg",
        en: "I need a clearer picture of my next step",
        tag: "direction_gap",
      },
    ]),
  ),
  adaptive(
    "ADAPT_DEVELOP_03",
    {
      sv: "Vilket ansvar skulle utveckla dig mest?",
      en: "Which responsibility would develop you the most?",
    },
    tagged([
      {
        value: "a",
        sv: "Hantera mer krävande operativa situationer",
        en: "Handling more demanding operational situations",
        tag: "advanced_operations",
      },
      {
        value: "b",
        sv: "Genomföra mer avancerade analyser eller utredningar",
        en: "Conducting more advanced analysis or investigations",
        tag: "advanced_analysis",
      },
      {
        value: "c",
        sv: "Ansvara för en process, funktion eller säkerhetsnivå",
        en: "Owning a process, function or level of security",
        tag: "functional_ownership",
      },
      {
        value: "d",
        sv: "Leda andra genom ett uppdrag eller en förändring",
        en: "Leading others through an assignment or change",
        tag: "change_leadership",
      },
    ]),
  ),
  adaptive(
    "ADAPT_DEVELOP_04",
    {
      sv: "Vad skulle vara ett meningsfullt nästa steg under de kommande 12–24 månaderna?",
      en: "What would be a meaningful next step during the next 12–24 months?",
    },
    tagged([
      {
        value: "a",
        sv: "Ett bredare eller mer kvalificerat uppdrag i min nuvarande inriktning",
        en: "A broader or more advanced assignment in my current direction",
        tag: "expanded_role",
      },
      {
        value: "b",
        sv: "En tydlig specialistroll",
        en: "A defined specialist role",
        tag: "specialist_role",
      },
      {
        value: "c",
        sv: "Ett samordnande eller strategiskt ansvar",
        en: "Coordinating or strategic responsibility",
        tag: "strategic_role",
      },
      {
        value: "d",
        sv: "Ett formellt ledaransvar",
        en: "Formal leadership responsibility",
        tag: "formal_leadership",
      },
    ]),
  ),
];

// =========================================================================
// Path D · changing_career_area
// =========================================================================

const PATH_D: DiscoveryItem[] = [
  adaptive(
    "ADAPT_CHANGE_01",
    {
      sv: "Vad är den främsta anledningen till att du vill byta säkerhetsområde?",
      en: "What is the main reason you want to move into another Security Career Area?",
    },
    tagged([
      {
        value: "a",
        sv: "Jag vill ha en annan typ av arbetsvardag",
        en: "I want a different type of working day",
        tag: "work_environment_change",
      },
      {
        value: "b",
        sv: "Jag vill använda andra styrkor än jag gör idag",
        en: "I want to use different strengths than I use today",
        tag: "strengths_change",
      },
      {
        value: "c",
        sv: "Jag vill ha bättre utvecklingsmöjligheter",
        en: "I want better development opportunities",
        tag: "progression_change",
      },
      {
        value: "d",
        sv: "Jag vill arbeta med frågor som känns mer meningsfulla för mig",
        en: "I want to work on matters that feel more meaningful to me",
        tag: "purpose_change",
      },
    ]),
  ),
  adaptive(
    "ADAPT_CHANGE_02",
    {
      sv: "Vilken styrka från din nuvarande erfarenhet vill du helst ta med dig till nästa område?",
      en: "Which strength from your current experience would you most like to carry into your next area?",
    },
    tagged([
      {
        value: "a",
        sv: "Min praktiska erfarenhet och förmåga att agera",
        en: "My practical experience and ability to act",
        tag: "transferable_operations",
      },
      {
        value: "b",
        sv: "Min människokännedom och kommunikation",
        en: "My understanding of people and communication",
        tag: "transferable_people",
      },
      {
        value: "c",
        sv: "Min analytiska förmåga och noggrannhet",
        en: "My analytical ability and attention to detail",
        tag: "transferable_analysis",
      },
      {
        value: "d",
        sv: "Min förståelse för ansvar, regler och verksamhet",
        en: "My understanding of responsibility, rules and operations",
        tag: "transferable_governance",
      },
    ]),
  ),
  adaptive(
    "ADAPT_CHANGE_03",
    {
      sv: "Hur stor förändring söker du?",
      en: "How significant a change are you seeking?",
    },
    tagged([
      {
        value: "a",
        sv: "En liknande roll i en ny miljö",
        en: "A similar role in a new environment",
        tag: "adjacent_move",
      },
      {
        value: "b",
        sv: "En ny inriktning där mycket av min erfarenhet fortfarande är relevant",
        en: "A new direction where much of my experience remains relevant",
        tag: "transferable_move",
      },
      {
        value: "c",
        sv: "Ett tydligt karriärbyte inom säkerhetsbranschen",
        en: "A clear career change within the security industry",
        tag: "substantial_move",
      },
      {
        value: "d",
        sv: "Jag är öppen och vill först förstå alternativen",
        en: "I am open and first want to understand the options",
        tag: "open_exploration",
      },
    ]),
  ),
  adaptive(
    "ADAPT_CHANGE_04",
    {
      sv: "Vad är du mest beredd att göra för att nå ett nytt säkerhetsområde?",
      en: "What are you most prepared to do to enter a new Security Career Area?",
    },
    tagged([
      {
        value: "a",
        sv: "Söka en roll där jag kan lära mig under arbetet",
        en: "Seek a role where I can learn on the job",
        tag: "learn_on_job",
      },
      {
        value: "b",
        sv: "Komplettera med en kortare utbildning eller certifiering",
        en: "Complete shorter training or certification",
        tag: "targeted_training",
      },
      {
        value: "c",
        sv: "Göra en större kompetensförflyttning över tid",
        en: "Make a larger skills transition over time",
        tag: "substantial_reskilling",
      },
      {
        value: "d",
        sv: "Börja med att prova området genom projekt, praktik eller sidouppdrag",
        en: "First explore the area through projects, placements or additional assignments",
        tag: "low_risk_exploration",
      },
    ]),
  ),
];

// =========================================================================
// Path E · security_leader
// =========================================================================
//
// Career Discovery, not an employer leadership assessment. Nothing derived
// from these items may claim that leadership effectiveness has been
// measured or validated.

const PATH_E: DiscoveryItem[] = [
  adaptive(
    "ADAPT_LEADER_01",
    {
      sv: "Var skapar du störst värde som chef?",
      en: "Where do you create the greatest value as a manager?",
    },
    tagged([
      {
        value: "a",
        sv: "När jag skapar trygghet och riktning i det dagliga arbetet",
        en: "Creating stability and direction in daily work",
        tag: "operational_leadership",
      },
      {
        value: "b",
        sv: "När jag fattar beslut i komplexa eller pressade situationer",
        en: "Making decisions in complex or pressured situations",
        tag: "decision_leadership",
      },
      {
        value: "c",
        sv: "När jag bygger struktur, kvalitet och långsiktig förmåga",
        en: "Building structure, quality and long-term capability",
        tag: "systems_leadership",
      },
      {
        value: "d",
        sv: "När jag utvecklar människor och skapar en stark kultur",
        en: "Developing people and creating a strong culture",
        tag: "people_leadership",
      },
    ]),
  ),
  adaptive(
    "ADAPT_LEADER_02",
    {
      sv: "Vilken avvägning är mest krävande i ditt ledarskap?",
      en: "Which balance is most demanding in your leadership?",
    },
    tagged([
      {
        value: "a",
        sv: "Snabba beslut mot behovet av mer information",
        en: "Fast decisions versus the need for more information",
        tag: "speed_information_tension",
      },
      {
        value: "b",
        sv: "Tydliga krav mot individuell anpassning",
        en: "Clear expectations versus individual adaptation",
        tag: "standards_adaptation_tension",
      },
      {
        value: "c",
        sv: "Kortsiktig leverans mot långsiktig säkerhetsförmåga",
        en: "Short-term delivery versus long-term security capability",
        tag: "delivery_resilience_tension",
      },
      {
        value: "d",
        sv: "Eget ansvar mot att ge andra mandat",
        en: "Personal accountability versus giving others authority",
        tag: "control_delegation_tension",
      },
    ]),
  ),
  adaptive(
    "ADAPT_LEADER_03",
    {
      sv: "När en säkerhetsfråga berör flera delar av organisationen, vad blir normalt ditt viktigaste bidrag?",
      en: "When a security issue affects several parts of the organisation, what is normally your most important contribution?",
    },
    tagged([
      {
        value: "a",
        sv: "Klargöra vad som måste göras här och nu",
        en: "Clarifying what must be done immediately",
        tag: "incident_direction",
      },
      {
        value: "b",
        sv: "Skapa en gemensam lägesbild",
        en: "Creating a shared understanding of the situation",
        tag: "shared_awareness",
      },
      {
        value: "c",
        sv: "Fördela ansvar och följa upp genomförandet",
        en: "Assigning responsibility and following up delivery",
        tag: "execution_governance",
      },
      {
        value: "d",
        sv: "Förankra riktningen hos ledning och andra intressenter",
        en: "Securing alignment with senior management and other stakeholders",
        tag: "executive_alignment",
      },
    ]),
  ),
  adaptive(
    "ADAPT_LEADER_04",
    {
      sv: "Vilken del av ditt ledarskap vill du främst utveckla?",
      en: "Which part of your leadership would you most like to develop?",
    },
    tagged([
      {
        value: "a",
        sv: "Min förmåga att leda under press",
        en: "My ability to lead under pressure",
        tag: "pressure_leadership_development",
      },
      {
        value: "b",
        sv: "Min förmåga att fatta strategiska beslut",
        en: "My ability to make strategic decisions",
        tag: "strategic_decision_development",
      },
      {
        value: "c",
        sv: "Min förmåga att bygga organisationens säkerhetsförmåga",
        en: "My ability to build organisational security capability",
        tag: "capability_building_development",
      },
      {
        value: "d",
        sv: "Min förmåga att utveckla människor och framtida ledare",
        en: "My ability to develop people and future leaders",
        tag: "people_development",
      },
    ]),
  ),
];

// =========================================================================
// The bank, keyed by path
// =========================================================================

/** Exactly four items per path. The order here is the order they are
 *  slotted into Discovery sections 1, 2, 4 and 5. */
export const ADAPTIVE_ITEMS_BY_PATH: Readonly<Record<AdaptivePath, readonly DiscoveryItem[]>> = {
  A: PATH_A,
  B: PATH_B,
  C: PATH_C,
  D: PATH_D,
  E: PATH_E,
};

export const ADAPTIVE_ITEMS_PER_SESSION = 4;

export const ALL_ADAPTIVE_ITEMS: readonly DiscoveryItem[] = [
  ...PATH_A,
  ...PATH_B,
  ...PATH_C,
  ...PATH_D,
  ...PATH_E,
];

export const ADAPTIVE_ITEMS_BY_ID: ReadonlyMap<string, DiscoveryItem> = new Map(
  ALL_ADAPTIVE_ITEMS.map((i) => [i.id, i]),
);

/** Which path an adaptive item belongs to. Used by the guard script to
 *  prove no session is ever served an item from another path. */
export const PATH_BY_ADAPTIVE_ITEM_ID: ReadonlyMap<string, AdaptivePath> = new Map(
  (
    Object.entries(ADAPTIVE_ITEMS_BY_PATH) as Array<[AdaptivePath, readonly DiscoveryItem[]]>
  ).flatMap(([path, items]) => items.map((i) => [i.id, path] as const)),
);

/** Every contextual report tag the adaptive bank can emit. These are the
 *  ONLY tags permitted on a report snapshot's contextual layer. */
export const ALL_REPORT_TAGS: readonly string[] = Array.from(
  new Set(ALL_ADAPTIVE_ITEMS.flatMap((i) => i.options.flatMap((o) => o.reportTags ?? []))),
).sort();
