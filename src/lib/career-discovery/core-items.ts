// The 20 scored core items — S1–S8, T1–T8, B1–B4.
//
// Content transcribed from
// docs/assessment/career-discovery/question-blueprint-v3.0.md §3–§5.
//
// EVERY candidate answers ALL 20, in the same wording, regardless of their
// context answers or adaptive path. That is the whole point: the product
// feels personally adapted while measurement stays comparable across users.
// The guard script asserts it for all five paths.
//
// Loadings are positions in [0,1] on the axis named. Single-axis items map
// their four options to 0.00 / 0.33 / 0.67 / 1.00. Trade-off items load two
// axes inversely within the item, so a `strong_a` answer is 1.00 on the A
// axis and 0.00 on the B axis.
//
// KNOWN LIMITATION, recorded here because it governs how these may be read:
// trade-off items are partly ipsative — they measure relative pull, not
// absolute level. Each axis is anchored by one non-ipsative single-axis
// item so absolute level is recoverable. Flagged for psychometric review;
// see question-blueprint-v3.0.md §4.
//
// Behavioural items (B1–B4) carry NO axis loadings by construction. Their
// `axes` array is empty and their evidence class is `behavioural_signal`,
// so a matching function reading orientation evidence cannot see them.

import type { DiscoveryItem, ItemOption } from "./types";

/** The four positions a single-axis item's options occupy. */
const P = [0.0, 0.33, 0.67, 1.0] as const;

/** Trade-off items share one option set: four degrees of pull between two
 *  framed alternatives. `axisA` gets the descending positions, `axisB` the
 *  ascending ones, so the pair is inversely loaded within the item. */
function tradeOffOptions(
  axisA: DiscoveryItem["axes"][number],
  axisB: DiscoveryItem["axes"][number],
): ItemOption[] {
  return [
    {
      value: "strong_a",
      label: { sv: "Tydligt A", en: "Clearly A" },
      loadings: { [axisA]: 1.0, [axisB]: 0.0 },
    },
    {
      value: "mild_a",
      label: { sv: "Mest A", en: "Mostly A" },
      loadings: { [axisA]: 0.67, [axisB]: 0.33 },
    },
    {
      value: "mild_b",
      label: { sv: "Mest B", en: "Mostly B" },
      loadings: { [axisA]: 0.33, [axisB]: 0.67 },
    },
    {
      value: "strong_b",
      label: { sv: "Tydligt B", en: "Clearly B" },
      loadings: { [axisA]: 0.0, [axisB]: 1.0 },
    },
  ];
}

// =========================================================================
// S1–S8 · Single-axis items
// =========================================================================

export const SINGLE_AXIS_ITEMS: readonly DiscoveryItem[] = [
  {
    id: "S1",
    kind: "single_axis",
    itemVersion: 1,
    evidenceClass: "orientation_self_report",
    axes: ["CDA-01"],
    infoGain: 4,
    estimatedSeconds: 28,
    prompt: {
      sv: "Tänk dig en arbetsdag som skulle kännas riktigt bra. Vilken ligger närmast?",
      en: "Picture a working day that would genuinely suit you. Which is closest?",
    },
    options: [
      {
        value: "remote_analysis",
        label: {
          sv: "Jag arbetar med underlag och information om händelser — jag behöver inte vara på plats",
          en: "I work with information and material about events — I don't need to be there",
        },
        loadings: { "CDA-01": P[0] },
      },
      {
        value: "mixed_planning",
        label: {
          sv: "Jag planerar och följer upp, och är ute ibland när det behövs",
          en: "I plan and follow up, and go out when it's needed",
        },
        loadings: { "CDA-01": P[1] },
      },
      {
        value: "mixed_presence",
        label: {
          sv: "Jag är ofta på plats, men har också tid vid ett skrivbord",
          en: "I'm often on site, but also have desk time",
        },
        loadings: { "CDA-01": P[2] },
      },
      {
        value: "full_presence",
        label: {
          sv: "Jag är där det händer, hela arbetspasset",
          en: "I'm where things happen, for the whole shift",
        },
        loadings: { "CDA-01": P[3] },
      },
    ],
  },
  {
    id: "S2",
    kind: "single_axis",
    itemVersion: 1,
    evidenceClass: "orientation_self_report",
    axes: ["CDA-02"],
    infoGain: 4,
    estimatedSeconds: 28,
    prompt: {
      sv: "Hur mycket vill du att direkt kontakt med människor ska vara en del av jobbet?",
      en: "How much do you want direct contact with people to be part of the job?",
    },
    options: [
      {
        value: "minimal",
        label: {
          sv: "Helst lite — jag vill kunna arbeta ostört",
          en: "Preferably little — I want to work undisturbed",
        },
        loadings: { "CDA-02": P[0] },
      },
      {
        value: "colleagues",
        label: {
          sv: "Med kollegor, ja. Med allmänheten helst inte",
          en: "With colleagues, yes. With the public, preferably not",
        },
        loadings: { "CDA-02": P[1] },
      },
      {
        value: "regular",
        label: {
          sv: "Regelbundet, men det behöver inte vara kärnan",
          en: "Regularly, but it doesn't need to be the core of it",
        },
        loadings: { "CDA-02": P[2] },
      },
      {
        value: "central",
        label: {
          sv: "Det är det jobbet handlar om, även när det är jobbigt",
          en: "It's what the job is about, including when it's hard",
        },
        loadings: { "CDA-02": P[3] },
      },
    ],
  },
  {
    id: "S3",
    kind: "single_axis",
    itemVersion: 1,
    evidenceClass: "orientation_self_report",
    axes: ["CDA-03"],
    infoGain: 4,
    estimatedSeconds: 28,
    prompt: {
      sv: "Vilken typ av uppgift känns mest tillfredsställande att bli klar med?",
      en: "Which kind of task feels most satisfying to finish?",
    },
    options: [
      {
        value: "undefined",
        label: {
          sv: "En där jag själv fick avgöra vad som ens skulle göras",
          en: "One where I decided what should even be done",
        },
        loadings: { "CDA-03": P[0] },
      },
      {
        value: "broad_goal",
        label: {
          sv: "En där målet var givet men vägen var min",
          en: "One where the goal was set but the route was mine",
        },
        loadings: { "CDA-03": P[1] },
      },
      {
        value: "framework",
        label: {
          sv: "En med tydliga ramar och utrymme för egna bedömningar",
          en: "One with clear boundaries and room for judgement",
        },
        loadings: { "CDA-03": P[2] },
      },
      {
        value: "defined",
        label: {
          sv: "En där rutinen var tydlig och jag följde den exakt",
          en: "One where the procedure was clear and I followed it exactly",
        },
        loadings: { "CDA-03": P[3] },
      },
    ],
  },
  {
    id: "S4",
    kind: "single_axis",
    itemVersion: 1,
    evidenceClass: "orientation_self_report",
    axes: ["CDA-04"],
    infoGain: 4,
    estimatedSeconds: 28,
    prompt: {
      sv: "Vilket arbetstempo passar dig bäst över tid?",
      en: "Which working rhythm suits you best over time?",
    },
    options: [
      {
        value: "long_horizon",
        label: {
          sv: "Långa projekt där jag ser resultatet efter månader",
          en: "Long projects where I see the result after months",
        },
        loadings: { "CDA-04": P[0] },
      },
      {
        value: "steady",
        label: {
          sv: "Jämnt tempo med förutsägbara dagar",
          en: "Steady pace with predictable days",
        },
        loadings: { "CDA-04": P[1] },
      },
      {
        value: "variable",
        label: {
          sv: "Mestadels lugnt, men med skarpa lägen ibland",
          en: "Mostly calm, with sharp moments now and then",
        },
        loadings: { "CDA-04": P[2] },
      },
      {
        value: "acute",
        label: {
          sv: "Snabbt och oförutsägbart — jag vill inte veta hur dagen ser ut",
          en: "Fast and unpredictable — I don't want to know how the day will go",
        },
        loadings: { "CDA-04": P[3] },
      },
    ],
  },
  {
    id: "S5",
    kind: "single_axis",
    itemVersion: 1,
    evidenceClass: "orientation_self_report",
    axes: ["CDA-05"],
    infoGain: 4,
    estimatedSeconds: 28,
    prompt: {
      sv: "När teknik är inblandad i en uppgift — hur förhåller du dig till den?",
      en: "When technology is involved in a task — how do you relate to it?",
    },
    options: [
      {
        value: "tool_only",
        label: {
          sv: "Den ska fungera. Jag vill inte behöva tänka på den",
          en: "It should work. I don't want to think about it",
        },
        loadings: { "CDA-05": P[0] },
      },
      {
        value: "competent_user",
        label: {
          sv: "Jag lär mig det jag behöver för att göra jobbet",
          en: "I learn what I need to do the job",
        },
        loadings: { "CDA-05": P[1] },
      },
      {
        value: "interested",
        label: {
          sv: "Jag blir nyfiken på hur den fungerar och hittar ofta bättre sätt",
          en: "I get curious about how it works and often find better ways",
        },
        loadings: { "CDA-05": P[2] },
      },
      {
        value: "object_of_work",
        label: {
          sv: "Tekniken och systemen är det jag helst arbetar med",
          en: "The technology and the systems are what I most want to work on",
        },
        loadings: { "CDA-05": P[3] },
      },
    ],
  },
  {
    id: "S6",
    kind: "single_axis",
    itemVersion: 1,
    evidenceClass: "orientation_self_report",
    axes: ["CDA-06"],
    infoGain: 4,
    estimatedSeconds: 28,
    prompt: {
      sv: "Något har hänt och är åtgärdat. Vad vill du göra sedan?",
      en: "Something has happened and it's been dealt with. What do you want to do next?",
    },
    options: [
      {
        value: "move_on",
        label: { sv: "Gå vidare. Det är löst", en: "Move on. It's resolved" },
        loadings: { "CDA-06": P[0] },
      },
      {
        value: "note_it",
        label: {
          sv: "Notera det kort ifall det återkommer",
          en: "Note it briefly in case it comes back",
        },
        loadings: { "CDA-06": P[1] },
      },
      {
        value: "understand",
        label: {
          sv: "Förstå varför det hände innan jag släpper det",
          en: "Understand why it happened before I let it go",
        },
        loadings: { "CDA-06": P[2] },
      },
      {
        value: "reconstruct",
        label: {
          sv: "Gräva tills jag vet hela förloppet — även det som ingen frågat om",
          en: "Dig until I know the whole sequence — including what nobody asked about",
        },
        loadings: { "CDA-06": P[3] },
      },
    ],
  },
  {
    id: "S7",
    kind: "single_axis",
    itemVersion: 1,
    evidenceClass: "orientation_self_report",
    axes: ["CDA-07"],
    infoGain: 4,
    estimatedSeconds: 30,
    prompt: {
      sv: "Hur ser du på att ha ansvar för andras arbete?",
      en: "How do you feel about being responsible for other people's work?",
    },
    options: [
      {
        value: "own_work",
        label: {
          sv: "Jag vill svara för mitt eget arbete, inte för andras",
          en: "I want to answer for my own work, not other people's",
        },
        loadings: { "CDA-07": P[0] },
      },
      {
        value: "support_no_account",
        label: {
          sv: "Jag hjälper gärna andra, men vill inte vara den som svarar för resultatet",
          en: "I'm glad to help others, but don't want to be the one accountable for the outcome",
        },
        loadings: { "CDA-07": P[1] },
      },
      {
        value: "small_team",
        label: {
          sv: "Jag skulle vilja ha ansvar för ett litet team",
          en: "I'd like responsibility for a small team",
        },
        loadings: { "CDA-07": P[2] },
      },
      {
        value: "accountable",
        label: {
          sv: "Jag vill vara den som svarar för att gruppen levererar",
          en: "I want to be the one who answers for the group delivering",
        },
        loadings: { "CDA-07": P[3] },
      },
    ],
  },
  {
    id: "S8",
    kind: "single_axis",
    itemVersion: 1,
    evidenceClass: "orientation_self_report",
    axes: ["CDA-08"],
    infoGain: 4,
    estimatedSeconds: 30,
    prompt: {
      sv: "Vilken fråga skulle du helst få i uppdrag att lösa?",
      en: "Which question would you most want to be given to solve?",
    },
    options: [
      {
        value: "incident",
        label: {
          sv: "”Det här händer just nu — ta hand om det”",
          en: "“This is happening right now — handle it”",
        },
        loadings: { "CDA-08": P[0] },
      },
      {
        value: "site",
        label: {
          sv: "”Den här platsen fungerar inte bra — få ordning på den”",
          en: "“This site isn't working well — sort it out”",
        },
        loadings: { "CDA-08": P[1] },
      },
      {
        value: "function",
        label: {
          sv: "”Vår rutin för det här håller inte — gör om den”",
          en: "“Our procedure for this doesn't hold — redo it”",
        },
        loadings: { "CDA-08": P[2] },
      },
      {
        value: "organisation",
        label: {
          sv: "”Vi vet inte om vi är rätt skyddade — ta reda på det”",
          en: "“We don't know if we're protected in the right way — find out”",
        },
        loadings: { "CDA-08": P[3] },
      },
    ],
  },
];

// =========================================================================
// T1–T8 · Trade-off items
// =========================================================================

export const TRADE_OFF_ITEMS: readonly DiscoveryItem[] = [
  {
    id: "T1",
    kind: "trade_off",
    itemVersion: 1,
    evidenceClass: "orientation_self_report",
    axes: ["CDA-01", "CDA-05"],
    infoGain: 5,
    estimatedSeconds: 38,
    prompt: {
      sv: "Två tjänster, samma lön, samma arbetsgivare. Vilken lockar mest?",
      en: "Two roles, same pay, same employer. Which appeals more?",
    },
    stem: {
      a: {
        sv: "Du rör dig i verksamheten, ser vad som händer och agerar på plats.",
        en: "You move through the operation, see what's happening, and act on the spot.",
      },
      b: {
        sv: "Du arbetar med systemen som skyddar verksamheten — larm, behörigheter, teknik.",
        en: "You work on the systems that protect the operation — alarms, access, technology.",
      },
    },
    options: tradeOffOptions("CDA-01", "CDA-05"),
  },
  {
    id: "T2",
    kind: "trade_off",
    itemVersion: 1,
    evidenceClass: "orientation_self_report",
    axes: ["CDA-02", "CDA-06"],
    infoGain: 5,
    estimatedSeconds: 38,
    prompt: {
      sv: "Ett ärende ska följas upp. Vilken del skulle du helst ta?",
      en: "A case needs following up. Which part would you rather take?",
    },
    stem: {
      a: {
        sv: "Prata med de inblandade, förstå vad som hänt genom dem.",
        en: "Talk to the people involved, understand what happened through them.",
      },
      b: {
        sv: "Gå igenom loggar, kameror och dokumentation och lägga pusslet själv.",
        en: "Go through logs, cameras and documentation and piece it together yourself.",
      },
    },
    options: tradeOffOptions("CDA-02", "CDA-06"),
  },
  {
    id: "T3",
    kind: "trade_off",
    itemVersion: 1,
    evidenceClass: "orientation_self_report",
    axes: ["CDA-03", "CDA-04"],
    infoGain: 5,
    estimatedSeconds: 38,
    prompt: {
      sv: "Vilket arbetslag skulle du helst tillhöra?",
      en: "Which team would you rather be part of?",
    },
    stem: {
      a: {
        sv: "Ett lag som gör samma sak varje dag, mycket noggrant, och där avvikelser är sällsynta.",
        en: "A team that does the same thing every day, very precisely, where deviations are rare.",
      },
      b: {
        sv: "Ett lag som rycker ut när något oväntat händer och löser det på plats.",
        en: "A team that turns out when something unexpected happens and solves it on the spot.",
      },
    },
    options: tradeOffOptions("CDA-03", "CDA-04"),
  },
  {
    id: "T4",
    kind: "trade_off",
    itemVersion: 1,
    evidenceClass: "orientation_self_report",
    axes: ["CDA-07", "CDA-08"],
    infoGain: 5,
    estimatedSeconds: 40,
    prompt: {
      sv: "Om du fick välja en av dessa roller om tre år — vilken?",
      en: "If you could have one of these roles in three years — which?",
    },
    stem: {
      a: {
        sv: "Chef för ett team på tolv personer, med ansvar för att de gör ett bra jobb.",
        en: "Manager of a team of twelve, accountable for them doing good work.",
      },
      b: {
        sv: "Specialist som ingen är chef över, men vars analys avgör hur hela organisationen skyddar sig.",
        en: "A specialist nobody reports to, whose analysis decides how the whole organisation protects itself.",
      },
    },
    options: tradeOffOptions("CDA-07", "CDA-08"),
  },
  {
    id: "T5",
    kind: "trade_off",
    itemVersion: 1,
    evidenceClass: "orientation_self_report",
    axes: ["CDA-01", "CDA-08"],
    infoGain: 4,
    estimatedSeconds: 38,
    prompt: {
      sv: "Vilken sorts påverkan vill du helst ha?",
      en: "Which kind of impact would you rather have?",
    },
    stem: {
      a: {
        sv: "Att det du gjorde idag gjorde skillnad för någon, här och nu.",
        en: "That what you did today made a difference for someone, here and now.",
      },
      b: {
        sv: "Att det du beslutar påverkar hur hundratals människor arbetar nästa år.",
        en: "That what you decide shapes how hundreds of people work next year.",
      },
    },
    options: tradeOffOptions("CDA-01", "CDA-08"),
  },
  {
    // Frustration-framed, so the mapping is inverted relative to the
    // appeal-framed items: disliking A (rigid procedure) is HIGH people
    // interface, disliking B (people's reactions) is HIGH procedural
    // structure. One frustration item is deliberate; more would tilt the
    // instrument negative. See blueprint §4 T6.
    id: "T6",
    kind: "trade_off",
    itemVersion: 1,
    evidenceClass: "orientation_self_report",
    axes: ["CDA-02", "CDA-03"],
    infoGain: 4,
    estimatedSeconds: 38,
    prompt: {
      sv: "Vad skulle irritera dig mest i ett jobb?",
      en: "What would frustrate you most in a job?",
    },
    stem: {
      a: {
        sv: "Att behöva följa en rutin som inte passar situationen framför dig.",
        en: "Having to follow a procedure that doesn't fit the situation in front of you.",
      },
      b: {
        sv: "Att behöva hantera människors reaktioner hela dagen.",
        en: "Having to handle people's reactions all day.",
      },
    },
    options: tradeOffOptions("CDA-02", "CDA-03"),
  },
  {
    id: "T7",
    kind: "trade_off",
    itemVersion: 1,
    evidenceClass: "orientation_self_report",
    axes: ["CDA-04", "CDA-06"],
    infoGain: 4,
    estimatedSeconds: 38,
    prompt: {
      sv: "Vilken känsla vill du helst ha när du går hem?",
      en: "Which feeling would you rather have going home?",
    },
    stem: {
      a: {
        sv: "”Det hände mycket idag och jag klarade det.”",
        en: "“A lot happened today and I handled it.”",
      },
      b: {
        sv: "”Jag förstod något idag som ingen annan hade sett.”",
        en: "“I understood something today that nobody else had spotted.”",
      },
    },
    options: tradeOffOptions("CDA-04", "CDA-06"),
  },
  {
    id: "T8",
    kind: "trade_off",
    itemVersion: 1,
    evidenceClass: "orientation_self_report",
    axes: ["CDA-05", "CDA-07"],
    infoGain: 4,
    estimatedSeconds: 40,
    prompt: {
      sv: "Du har blivit riktigt bra på något. Vad vill du göra med det?",
      en: "You've become genuinely good at something. What do you want to do with it?",
    },
    stem: {
      a: {
        sv: "Fördjupa mig ännu mer och bli den som andra frågar.",
        en: "Go deeper still and become the one others come to.",
      },
      b: {
        sv: "Lära upp andra och ansvara för att de blir bra.",
        en: "Teach others and be accountable for them becoming good.",
      },
    },
    options: tradeOffOptions("CDA-05", "CDA-07"),
  },
];

// =========================================================================
// B1–B4 · Behavioural items
// =========================================================================
//
// No axis loadings. No option here is right or wrong, and the report must
// never present one as better. `signalNote` records what the option
// describes, in language safe to surface.

export const BEHAVIOURAL_ITEMS: readonly DiscoveryItem[] = [
  {
    id: "B1",
    kind: "behavioural",
    itemVersion: 1,
    evidenceClass: "behavioural_signal",
    axes: [],
    signal: "BS-1",
    estimatedSeconds: 42,
    prompt: {
      sv: "Sista timmen på passet. En kontroll återstår som ingen kommer att fråga efter, och inget har verkat avvikande. Vad gör du i praktiken?",
      en: "Last hour of the shift. One check remains that nobody will ask about, and nothing has seemed unusual. What do you actually do?",
    },
    options: [
      {
        value: "full",
        label: { sv: "Genomför den som vanligt", en: "Complete it as usual" },
        signalNote: {
          sv: "Konsekvent oavsett om någon ser",
          en: "Consistent regardless of observation",
        },
      },
      {
        value: "quick",
        label: {
          sv: "Gör den, men snabbare än vanligt",
          en: "Do it, but faster than usual",
        },
        signalNote: {
          sv: "Slutför, men anpassar insatsen efter upplevd risk",
          en: "Completes, adapts effort to perceived risk",
        },
      },
      {
        value: "defer",
        label: {
          sv: "Noterar att den inte hanns med och tar det imorgon",
          en: "Note it wasn't done and pick it up tomorrow",
        },
        signalNote: {
          sv: "Prioriterar öppenhet framför att bli klar",
          en: "Prioritises transparency over completion",
        },
      },
      {
        value: "skip",
        label: {
          sv: "Hoppar över den — inget tyder på att det behövs",
          en: "Skip it — nothing suggests it's needed",
        },
        signalNote: {
          sv: "Väger signal mot rutin",
          en: "Weighs signal over procedure",
        },
      },
    ],
  },
  {
    id: "B2",
    kind: "behavioural",
    itemVersion: 1,
    evidenceClass: "behavioural_signal",
    axes: [],
    signal: "BS-2",
    estimatedSeconds: 42,
    prompt: {
      sv: "En situation utvecklas som ligger på gränsen till vad du kan hantera själv. Att kalla på hjälp kan visa sig ha varit onödigt. Vad gör du?",
      en: "A situation is developing at the edge of what you can handle alone. Calling for help may turn out to have been unnecessary. What do you do?",
    },
    options: [
      {
        value: "immediate",
        label: {
          sv: "Kallar direkt och låter någon annan avgöra",
          en: "Call immediately and let someone else judge",
        },
      },
      {
        value: "brief_check",
        label: {
          sv: "Skaffar mig snabbt lite mer underlag, sedan kallar jag",
          en: "Get a bit more information quickly, then call",
        },
      },
      {
        value: "handle_inform",
        label: {
          sv: "Hanterar det och informerar efteråt",
          en: "Handle it and inform afterwards",
        },
      },
      {
        value: "handle_alone",
        label: {
          sv: "Löser det själv — det är därför jag är här",
          en: "Solve it myself — that's what I'm here for",
        },
      },
    ],
  },
  {
    id: "B3",
    kind: "behavioural",
    itemVersion: 1,
    evidenceClass: "behavioural_signal",
    axes: [],
    signal: "BS-3",
    estimatedSeconds: 42,
    prompt: {
      sv: "Någon höjer rösten mot dig, framför andra, och har delvis rätt i sin kritik. Vad ligger närmast det du faktiskt gör?",
      en: "Someone raises their voice at you, in front of others, and is partly right in their criticism. What's closest to what you actually do?",
    },
    options: [
      {
        value: "lower_acknowledge",
        label: {
          sv: "Sänker tonläget och erkänner den del som stämmer",
          en: "Lower my tone and acknowledge the part that's right",
        },
      },
      {
        value: "calm_defer",
        label: {
          sv: "Håller mig lugn och tar det senare, inte inför andra",
          en: "Stay calm and take it up later, not in front of others",
        },
      },
      {
        value: "correct_now",
        label: {
          sv: "Rättar det som inte stämmer direkt",
          en: "Correct what's wrong straight away",
        },
      },
      {
        value: "hold_position",
        label: {
          sv: "Står fast — att ge efter inför andra fungerar sällan",
          en: "Hold my position — giving way in front of others rarely works",
        },
      },
    ],
  },
  {
    id: "B4",
    kind: "behavioural",
    itemVersion: 1,
    evidenceClass: "behavioural_signal",
    axes: [],
    signal: "BS-4",
    estimatedSeconds: 40,
    prompt: {
      sv: "Tänk på senaste gången du fick veta att du gjort något fel på jobbet. Vad hände sedan?",
      en: "Think about the last time you were told you'd done something wrong at work. What happened next?",
    },
    options: [
      {
        value: "changed",
        label: {
          sv: "Jag ändrade hur jag gör det, och det sitter kvar",
          en: "I changed how I do it, and it stuck",
        },
      },
      {
        value: "understood",
        label: {
          sv: "Jag förstod poängen, men det gamla sättet återkommer ibland",
          en: "I took the point, but the old way comes back sometimes",
        },
      },
      {
        value: "disagreed_complied",
        label: {
          sv: "Jag höll inte med, men gjorde som det sades",
          en: "I didn't agree, but did as I was told",
        },
      },
      {
        value: "no_recall",
        label: {
          sv: "Jag kommer inte ihåg någon sådan situation",
          en: "I can't recall a situation like that",
        },
        // Treated as MISSING evidence, never as a negative. A common and
        // honest answer early in a working life; reading it as avoidance
        // would be a construct error. See blueprint §5 B4.
        signalNote: {
          sv: "Saknad evidens — inte ett negativt svar",
          en: "Missing evidence — not a negative answer",
        },
      },
    ],
  },
];

// =========================================================================
// The bank
// =========================================================================

export const CORE_ITEMS: readonly DiscoveryItem[] = [
  ...SINGLE_AXIS_ITEMS,
  ...TRADE_OFF_ITEMS,
  ...BEHAVIOURAL_ITEMS,
];

export const CORE_ITEM_COUNT = 20;

export const CORE_ITEMS_BY_ID: ReadonlyMap<string, DiscoveryItem> = new Map(
  CORE_ITEMS.map((i) => [i.id, i]),
);
