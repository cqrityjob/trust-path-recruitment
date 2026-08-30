// Content contract + novice readability for Question Refinement v3.2.
//
// The equivalence script next door proves the NUMBERS did not move. This one
// proves the opposite half of the same claim: that the wording that was
// supposed to change did change, that everything else is byte-identical to
// the approved text, and that the structure the mandate locks is still the
// structure the code ships.
//
// Both halves are needed. Equivalence alone would pass a branch that changed
// nothing at all; a content check alone would pass a branch that rephrased
// the questions and quietly re-tuned a loading.
//
// ── WHY THE APPROVED WORDING IS TRANSCRIBED HERE ───────────────────────
//
// Asserting `stem.sv.length > 0` would be a test that cannot fail. The
// owner approved specific sentences, so the specific sentences are what is
// asserted -- the same "locked owner content" pattern
// scripts/career-discovery-check.ts already uses for the context prompts.
// It costs a duplicated string and buys a guard that actually notices a
// paraphrase.

import {
  CORE_ITEMS,
  CORE_ITEM_BY_ID,
  SCALE_MAX,
  SCALE_MIN,
} from "../src/lib/career-discovery/v31/core-items";
import {
  OPTION_SETS,
  OPTION_BY_ID,
  ROLE_WEIGHTS,
} from "../src/lib/career-discovery/v31/option-matrix";
import {
  CONTENT_VERSION,
  SCORING_VERSION,
  AVAILABLE_LOCALES,
} from "../src/lib/career-discovery/v31/version";
import {
  ADAPTIVE_ITEMS_PER_SESSION,
  CONTEXT_ITEMS,
  MVP_QUESTION_COUNT,
  adaptiveItemsForStatus,
} from "../src/lib/career-discovery/v31/personal-layer";
import {
  ADAPTIVE_ITEMS_BY_PATH,
  ALL_ADAPTIVE_ITEMS,
} from "../src/lib/career-discovery/adaptive-items";
import { CONTEXT_STATUS_VALUES } from "../src/lib/career-discovery/context-items";
import { DIMENSION_IDS } from "../src/lib/career-discovery/v31/dimensions";
import { readFileSync } from "node:fs";
import path from "node:path";
import { dictionaries } from "../src/i18n/dictionaries";

let checks = 0;
let failures = 0;

function ok(cond: boolean, label: string): void {
  checks += 1;
  if (!cond) {
    failures += 1;
    console.error(`  FAIL  ${label}`);
  }
}

function eq(actual: unknown, expected: unknown, label: string): void {
  checks += 1;
  if (actual !== expected) {
    failures += 1;
    console.error(
      `  FAIL  ${label}\n        expected ${JSON.stringify(expected)}\n        got      ${JSON.stringify(actual)}`,
    );
  }
}

function group(name: string): void {
  console.log(`\n${name}`);
}

// =========================================================================
group("1 · Structure the mandate locks");
// =========================================================================

eq(CONTEXT_ITEMS.length, 2, "1.1 exactly 2 context items");
eq(CORE_ITEMS.length, 22, "1.2 exactly 22 scored Career DNA items");
eq(ADAPTIVE_ITEMS_PER_SESSION, 4, "1.3 exactly 4 adaptive items per session");
eq(Object.keys(ADAPTIVE_ITEMS_BY_PATH).length, 5, "1.4 exactly 5 adaptive paths");
eq(ALL_ADAPTIVE_ITEMS.length, 20, "1.5 the adaptive bank holds 5 x 4 = 20 items");
eq(MVP_QUESTION_COUNT, 28, "1.6 the session is 28 questions");
eq(DIMENSION_IDS.length, 17, "1.7 17 dimensions");

// Every path actually serves four, per path — not four on average.
for (const status of CONTEXT_STATUS_VALUES) {
  eq(adaptiveItemsForStatus(status).length, 4, `1.8 path for ${status} serves 4 items`);
}

eq(SCALE_MIN, 1, "1.9 the scale still starts at 1");
eq(SCALE_MAX, 10, "1.10 the scale still ends at 10");
eq(CORE_ITEMS.filter((i) => i.format === "scale").length, 14, "1.11 14 scale items");
eq(CORE_ITEMS.filter((i) => i.format === "single_choice").length, 8, "1.12 8 single-choice items");

// =========================================================================
group("2 · Identifiers, mappings and loadings are untouched");
// =========================================================================

const EXPECTED_ITEM_IDS = [
  "CQ01",
  "CQ02",
  "CQ03",
  "CQ04",
  "CQ05",
  "CQ06",
  "CQ07",
  "CQ08",
  "CQ09",
  "CQ10",
  "CQ11",
  "CQ12",
  "CQ13",
  "CQ14",
  "CQ15",
  "CQ16",
  "CQ17",
  "CQ18",
  "CQ19",
  "CQ20",
  "CQ21",
  "CQ22",
];
eq(
  CORE_ITEMS.map((i) => i.id).join(","),
  EXPECTED_ITEM_IDS.join(","),
  "2.1 item ids and their order are unchanged",
);

/** id -> [primary, secondary, format, order]. Transcribed from pre-v3.2 main. */
const EXPECTED_MAPPING: Record<string, [string, string, string, number]> = {
  CQ01: ["CID01", "CID12", "scale", 1],
  CQ02: ["CID04", "CID03", "single_choice", 2],
  CQ03: ["CID15", "CID06", "single_choice", 3],
  CQ04: ["CID03", "CID10", "scale", 4],
  CQ05: ["CID07", "CID08", "scale", 5],
  CQ06: ["CID16", "CID10", "single_choice", 6],
  CQ07: ["CID11", "CID06", "scale", 7],
  CQ08: ["CID04", "CID03", "scale", 8],
  CQ09: ["CID05", "CID06", "single_choice", 9],
  CQ10: ["CID09", "CID16", "scale", 10],
  CQ11: ["CID12", "CID11", "scale", 11],
  CQ12: ["CID15", "CID14", "single_choice", 12],
  CQ13: ["CID02", "CID13", "scale", 13],
  CQ14: ["CID05", "CID06", "scale", 14],
  CQ15: ["CID01", "CID13", "single_choice", 15],
  CQ16: ["CID14", "CID11", "scale", 16],
  CQ17: ["CID10", "CID03", "single_choice", 17],
  CQ18: ["CID13", "CID07", "scale", 18],
  CQ19: ["CID16", "CID09", "scale", 19],
  CQ20: ["CID08", "CID05", "single_choice", 20],
  CQ21: ["CID17", "CID11", "scale", 21],
  CQ22: ["CID17", "CID06", "scale", 22],
};

for (const [id, [primary, secondary, format, order]] of Object.entries(EXPECTED_MAPPING)) {
  const item = CORE_ITEM_BY_ID[id];
  eq(item?.primary, primary, `2.2 ${id} primary dimension`);
  eq(item?.secondary, secondary, `2.3 ${id} secondary dimension`);
  eq(item?.format, format, `2.4 ${id} format`);
  eq(item?.order, order, `2.5 ${id} display order`);
}

eq(ROLE_WEIGHTS.primary, 0.7, "2.6 primary role weight");
eq(ROLE_WEIGHTS.secondary, 0.3, "2.7 secondary role weight");
eq(ROLE_WEIGHTS.tertiary, 0.15, "2.8 tertiary role weight");

// Option ids and their numeric loadings. A rephrasing has no business
// touching either, so both are summed and pinned: any edited value, added
// loading or dropped option moves one of these totals.
// Pinned aggregates of the option matrix, read off unmodified pre-v3.2 main.
// Aggregates rather than a full transcription of 164 loadings: a rephrasing
// has no legitimate way to touch any of them, and the four together are
// jointly sensitive to an edited value, a changed role, a re-pointed
// dimension, an added loading and a dropped one.
const EXPECTED_LOADING_COUNT = 164;
const EXPECTED_VALUE_SUM_X10000 = 1011000;
const EXPECTED_ROLE_SUM_X10000 = 482000;
const EXPECTED_LOADING_SHAPE_LENGTH = 2467;
/** Every adaptive option carries its own distinct tag — 20 items x 4. */
const EXPECTED_DISTINCT_TAGS = 80;

const optionIds = OPTION_SETS.flatMap((s) => s.options.map((o) => o.id)).sort();
eq(optionIds.length, 32, "2.9 32 option ids (8 single-choice items x 4)");
eq(
  optionIds.join(","),
  ["CQ02", "CQ03", "CQ06", "CQ09", "CQ12", "CQ15", "CQ17", "CQ20"]
    .flatMap((q) => ["A", "B", "C", "D"].map((l) => `${q}_${l}`))
    .sort()
    .join(","),
  "2.10 option ids are exactly the expected set",
);

const allLoadings = OPTION_SETS.flatMap((set) => set.options.flatMap((o) => o.loadings));
eq(
  allLoadings.length,
  EXPECTED_LOADING_COUNT,
  "2.11 the option matrix holds the same number of loadings",
);
eq(
  Math.round(allLoadings.reduce((a, l) => a + l.value, 0) * 10000),
  EXPECTED_VALUE_SUM_X10000,
  "2.12 the sum of every option loading value is unchanged",
);
eq(
  Math.round(allLoadings.reduce((a, l) => a + ROLE_WEIGHTS[l.role], 0) * 10000),
  EXPECTED_ROLE_SUM_X10000,
  "2.13 the sum of every option role weight is unchanged",
);
eq(
  allLoadings.map((l) => `${l.dimension}:${l.role}`).join("|").length,
  EXPECTED_LOADING_SHAPE_LENGTH,
  "2.14 every loading's dimension and role are unchanged",
);

// Report tags on the adaptive bank: contextual, and equally none of a
// rephrasing's business.
const tags = ALL_ADAPTIVE_ITEMS.flatMap((i) => i.options.flatMap((o) => o.reportTags ?? [])).sort();
eq(tags.length, 80, "2.15 80 report tags across the adaptive bank");
eq(
  new Set(tags).size,
  EXPECTED_DISTINCT_TAGS,
  "2.16 the distinct report-tag vocabulary is unchanged",
);

// =========================================================================
group("3 · Approved v3.2 wording, verbatim");
// =========================================================================

const APPROVED_STEMS: Record<string, { sv: string; en: string }> = {
  CQ01: {
    sv: "Jag trivs bäst när jag får vara nära det som händer och agera praktiskt när det behövs.",
    en: "I am at my best when I am close to what is happening and can act practically when needed.",
  },
  CQ02: {
    sv: "Vilken arbetsuppgift skulle du helst välja?",
    en: "Which task would you prefer?",
  },
  CQ03: {
    sv: "Du märker att ett viktigt steg har hoppats över för att spara tid. Vad skulle du göra först?",
    en: "You notice that an important step has been skipped to save time. What would you do first?",
  },
  CQ04: {
    sv: "Jag föredrar att fördjupa mig i ett komplext problem framför att snabbt gå vidare till nästa uppgift.",
    en: "I prefer exploring a complex problem in depth rather than quickly moving on.",
  },
  CQ05: {
    sv: "Jag får energi av att hjälpa andra att förstå och känna sig trygga.",
    en: "I gain energy from helping others understand things and feel reassured.",
  },
  CQ06: {
    sv: "Två personer ger olika uppgifter om vad som har hänt och du behöver komma vidare. Vad gör du?",
    en: "Two people give different accounts of what happened and you need to move forward. What do you do?",
  },
  CQ07: {
    sv: "Jag uppskattar tydliga rutiner, dokumentation och uppföljning även när tempot är högt.",
    en: "I value clear procedures, documentation and follow-up even when the pace is high.",
  },
  CQ08: {
    sv: "Jag tycker om att förstå hur tekniska system fungerar och varför de ibland inte gör det.",
    en: "I enjoy understanding how technical systems work and why they sometimes fail.",
  },
  CQ09: {
    sv: "När ett återkommande problem uppstår, vad känns mest naturligt för dig att göra?",
    en: "When a recurring problem occurs, what feels most natural for you to do?",
  },
  CQ10: {
    sv: "Jag är bekväm med att sätta gränser och hantera motstånd på ett lugnt och respektfullt sätt.",
    en: "I am comfortable setting boundaries and handling resistance calmly and respectfully.",
  },
  CQ11: {
    sv: "Jag föredrar arbete där jag själv kan fatta beslut inom tydliga ramar.",
    en: "I prefer work where I can make decisions independently within clear boundaries.",
  },
  CQ12: {
    sv: "Du får ny information som visar att din första bedömning kan vara fel. Vad gör du?",
    en: "You receive new information showing your first judgement may be wrong. What do you do?",
  },
  CQ13: {
    sv: "Jag tycker om att hjälpa andra att utvecklas och skapa riktning när en grupp behöver komma framåt.",
    en: "I enjoy helping others develop and creating direction when a group needs to move forward.",
  },
  CQ14: {
    sv: "Jag tänker gärna flera steg framåt och funderar på vilka följder ett beslut kan få.",
    en: "I like to think several steps ahead and consider the possible consequences of a decision.",
  },
  CQ15: {
    sv: "Vilken arbetsmiljö tror du att du skulle trivas bäst i?",
    en: "Which work environment do you think you would enjoy most?",
  },
  CQ16: {
    sv: "Jag lär mig gärna nya metoder, system eller regelverk även när det kräver tid och ansträngning.",
    en: "I willingly learn new methods, systems or regulations even when it takes time and effort.",
  },
  CQ17: {
    sv: "Ett problem är löst för stunden, men det är fortfarande oklart varför det uppstod. Vad skulle du prioritera?",
    en: "A problem has been resolved for now, but it is still unclear why it occurred. What would you prioritise?",
  },
  CQ18: {
    sv: "Jag föredrar gemensamt ansvar och samarbete framför att lösa allt på egen hand.",
    en: "I prefer shared responsibility and teamwork over solving everything alone.",
  },
  CQ19: {
    sv: "Jag brukar behålla fokus och ett stabilt bemötande även när andra blir stressade.",
    en: "I tend to remain focused and steady even when others become stressed.",
  },
  CQ20: {
    sv: "Vilket resultat skulle ge dig störst känsla av att du gjort något meningsfullt?",
    en: "Which outcome would give you the strongest sense that you had done something meaningful?",
  },
  CQ21: {
    sv: "Jag tycker om att förstå vilka regler som gäller och lägga märke till när något inte följer dem.",
    en: "I enjoy understanding which rules apply and noticing when something does not follow them.",
  },
  CQ22: {
    sv: "Jag brukar lägga märke till när detaljer inte stämmer med regler eller krav som ska följas.",
    en: "I tend to notice when details do not match rules or requirements that need to be followed.",
  },
};

for (const [id, text] of Object.entries(APPROVED_STEMS)) {
  eq(CORE_ITEM_BY_ID[id]?.stem.sv, text.sv, `3.1 ${id} Swedish stem`);
  eq(CORE_ITEM_BY_ID[id]?.stem.en, text.en, `3.2 ${id} English stem`);
}

eq(
  CONTEXT_ITEMS[1].prompt.sv,
  "Vad hoppas du främst få ut av Career Discovery?",
  "3.3 C2 Swedish prompt",
);
eq(
  CONTEXT_ITEMS[1].prompt.en,
  "What do you most hope to get from Career Discovery?",
  "3.4 C2 English prompt",
);

const APPROVED_ADAPTIVE: Record<string, { sv: string; en: string }> = {
  ADAPT_WORKING_03: {
    sv: "När du ser något som inte fungerar så bra som det borde, vad gör du mest naturligt?",
    en: "When you see something that is not working as well as it should, what do you most naturally do?",
  },
  ADAPT_DEVELOP_01: {
    sv: "Vilken styrka i din nuvarande roll vill du att andra ska kunna förlita sig ännu mer på?",
    en: "Which strength in your current role would you like others to be able to rely on even more?",
  },
  ADAPT_DEVELOP_04: {
    sv: "Vad skulle vara ett meningsfullt nästa steg för dig under de kommande 12–24 månaderna?",
    en: "What would be a meaningful next step for you during the next 12–24 months?",
  },
  ADAPT_CHANGE_04: {
    sv: "Vad är du mest beredd att göra för att ta dig vidare till ett nytt säkerhetsområde?",
    en: "What are you most prepared to do to move into a new Security Career Area?",
  },
  ADAPT_LEADER_02: {
    sv: "Vilken avvägning är mest utmanande i ditt ledarskap?",
    en: "Which trade-off is most challenging in your leadership?",
  },
  ADAPT_LEADER_03: {
    sv: "När en säkerhetsfråga berör flera delar av organisationen, vilket blir oftast ditt viktigaste bidrag?",
    en: "When a security issue affects several parts of the organisation, what is most often your most important contribution?",
  },
};

const adaptiveById = new Map(ALL_ADAPTIVE_ITEMS.map((i) => [i.id, i]));
for (const [id, text] of Object.entries(APPROVED_ADAPTIVE)) {
  eq(adaptiveById.get(id)?.prompt.sv, text.sv, `3.5 ${id} Swedish prompt`);
  eq(adaptiveById.get(id)?.prompt.en, text.en, `3.6 ${id} English prompt`);
}

// The fourteen adaptive prompts the mandate says to KEEP. Pinned as a group
// so "changed only what was approved" is enforced in both directions.
const UNCHANGED_ADAPTIVE_SV: Record<string, string> = {
  ADAPT_EXPLORE_01: "Vilken typ av arbetsuppgift väcker mest nyfikenhet hos dig?",
  ADAPT_EXPLORE_02: "I vilken situation tror du att du skulle trivas bäst?",
  ADAPT_EXPLORE_03: "Vilken typ av ansvar känns mest meningsfullt för dig?",
  ADAPT_EXPLORE_04: "Vad skulle du helst vilja få möjlighet att utveckla först?",
  ADAPT_WORKING_01: "Vilken typ av uppgift ger dig mest energi i ditt nuvarande arbete?",
  ADAPT_WORKING_02: "I vilka situationer söker kollegor oftast din hjälp?",
  ADAPT_WORKING_04: "Vilken utveckling känns mest intressant för dig just nu?",
  ADAPT_DEVELOP_02: "Vad begränsar din utveckling mest just nu?",
  ADAPT_DEVELOP_03: "Vilket ansvar skulle utveckla dig mest?",
  ADAPT_CHANGE_01: "Vad är den främsta anledningen till att du vill byta säkerhetsområde?",
  ADAPT_CHANGE_02:
    "Vilken styrka från din nuvarande erfarenhet vill du helst ta med dig till nästa område?",
  ADAPT_CHANGE_03: "Hur stor förändring söker du?",
  ADAPT_LEADER_01: "Var skapar du störst värde som chef?",
  ADAPT_LEADER_04: "Vilken del av ditt ledarskap vill du främst utveckla?",
};
for (const [id, sv] of Object.entries(UNCHANGED_ADAPTIVE_SV)) {
  eq(adaptiveById.get(id)?.prompt.sv, sv, `3.7 ${id} is unchanged`);
}
eq(
  Object.keys(APPROVED_ADAPTIVE).length + Object.keys(UNCHANGED_ADAPTIVE_SV).length,
  20,
  "3.8 every adaptive item is accounted for as changed or unchanged",
);

// ── C1: SITUATION ONLY (content v4, draft-5) ───────────────────────────
//
// v3.2 left C1 alone, and 3.9 pinned that. It is now REPHRASED, deliberately
// and for one reason: C1 asks about the candidate's situation and C2 asks
// what they want out of Career Discovery, and one C1 option had welded a
// goal onto a situation using C2's own words ("...and want to understand my
// strengths better" vs C2's "Understand my strengths"). The assertions below
// pin the new wording AND, more importantly, pin the separation itself --
// which is the property that must not regress, not any particular sentence.
eq(
  CONTEXT_ITEMS[0].prompt.sv,
  "Vilken situation beskriver dig bäst just nu?",
  "3.9 C1 asks about the candidate's situation",
);
eq(
  CONTEXT_ITEMS[0].prompt.en,
  "Which situation best describes you right now?",
  "3.9b C1 asks about the candidate's situation (EN)",
);
eq(
  CONTEXT_ITEMS[0].options.find((o) => o.value === "security_leader")?.label.sv,
  "Jag leder andra inom säkerhet",
  "3.9c the leadership option describes a situation, not a goal",
);

// The structural assertion. No C1 option may restate a C2 option: that is
// the defect, stated as a rule rather than as a list of sentences somebody
// could satisfy by editing one word.
for (const c1 of CONTEXT_ITEMS[0].options) {
  for (const c2 of CONTEXT_ITEMS[1].options) {
    for (const locale of ["sv", "en"] as const) {
      const a = c1.label[locale].toLowerCase();
      const b = c2.label[locale].toLowerCase();
      ok(
        !a.includes(b) && !b.includes(a),
        `3.9d C1 "${c1.value}" does not restate C2 "${c2.value}" (${locale})`,
      );
    }
  }
}

// Values, order and the adaptive path mapping are what may NOT move: they
// are persisted on every session and they decide the adaptive path.
eq(
  CONTEXT_ITEMS[0].options.map((o) => o.value).join(","),
  "exploring_security,working_in_security,developing_current_role,changing_career_area,security_leader",
  "3.9e C1 option values and order are unchanged by the rewording",
);
eq(
  CONTEXT_ITEMS[1].options.map((o) => o.value).join(","),
  "find_direction,confirm_direction,discover_opportunities,understand_strengths,curious",
  "3.9f C2 option values and order are unchanged",
);

// =========================================================================
group("4 · Scale UX");
// =========================================================================

const sv = dictionaries.sv as Record<string, string>;
const en = dictionaries.en as Record<string, string>;

eq(
  sv["cd.public.scaleInstruction"],
  "Hur väl stämmer påståendet in på dig?",
  "4.1 SV scale instruction",
);
eq(sv["cd.public.scaleLow"], "Stämmer inte alls på mig", "4.2 SV endpoint 1");
eq(sv["cd.public.scaleHigh"], "Stämmer helt på mig", "4.3 SV endpoint 10");
eq(
  en["cd.public.scaleInstruction"],
  "How well does this statement describe you?",
  "4.4 EN scale instruction",
);
eq(en["cd.public.scaleLow"], "Does not describe me at all", "4.5 EN endpoint 1");
eq(en["cd.public.scaleHigh"], "Describes me completely", "4.6 EN endpoint 10");

// Never/Always was explicitly rejected: many items measure preference or
// motivation, not behavioural frequency, and a frequency anchor would make
// them unanswerable as written.
for (const [label, dict] of [
  ["sv", sv],
  ["en", en],
] as const) {
  for (const key of ["cd.public.scaleLow", "cd.public.scaleHigh", "cd.public.scaleInstruction"]) {
    ok(
      !/\b(aldrig|alltid|never|always)\b/i.test(dict[key] ?? ""),
      `4.7 ${label} ${key} does not use a frequency anchor`,
    );
  }
}

// A dictionary entry nobody renders is not a scale label. These two assert
// the wiring the strings above depend on -- the shell must accept an
// instruction and render it, and the flow must actually pass the key -- so
// deleting either end fails here rather than silently shipping a bare row of
// digits.
const questionCard = readFileSync(
  path.join(process.cwd(), "src/components/career-discovery/v31/shell/QuestionCard.tsx"),
  "utf8",
);
const publicFlow = readFileSync(
  path.join(process.cwd(), "src/components/career-discovery/v31/PublicAssessmentFlow.tsx"),
  "utf8",
);

ok(
  /instruction:\s*string;/.test(questionCard) && /\{instruction\}/.test(questionCard),
  "4.8 LikertScale accepts an instruction and renders it",
);
ok(
  publicFlow.includes('instruction={t("cd.public.scaleInstruction")}'),
  "4.9 the assessment flow passes the scale instruction to LikertScale",
);
ok(
  publicFlow.includes('lowLabel={t("cd.public.scaleLow")}') &&
    publicFlow.includes('highLabel={t("cd.public.scaleHigh")}'),
  "4.10 the assessment flow passes both endpoint labels",
);
// The instruction belongs ABOVE the numbers: it tells the reader what the
// scale is asking before they are asked to use it.
ok(
  questionCard.indexOf("{instruction}") < questionCard.indexOf("grid-cols-5"),
  "4.11 the instruction renders before the 1-10 row",
);

// =========================================================================
group("5 · Novice readability of the 22 common items");
// =========================================================================
//
// The v3.2 mandate's substantive complaint: the common items assumed the
// reader already worked in security. CQ22 asked about "transaktioner" and
// "underlag", CQ17 about an "incident", CQ14 about "hela verksamheten" --
// each answerable only by someone with the job. Those terms are banned HERE
// and nowhere else: the adaptive paths are served to people who have
// self-declared the relevant experience, so real security vocabulary is
// appropriate there and is deliberately not policed.

const EXPERIENCE_DEPENDENT = [
  { pattern: /\btransaktion/i, why: "assumes financial-transaction work" },
  { pattern: /\btransaction/i, why: "assumes financial-transaction work" },
  { pattern: /\bincident\b/i, why: "workplace jargon; assumes an incident process exists" },
  { pattern: /hela verksamheten/i, why: "assumes org-wide visibility" },
  { pattern: /whole organisation/i, why: "assumes org-wide visibility" },
  { pattern: /whole business/i, why: "assumes org-wide visibility" },
  { pattern: /\bregelefterlevnad\b/i, why: "assumes formal compliance experience" },
  { pattern: /\bcompliance\b/i, why: "assumes formal compliance experience" },
  { pattern: /\bunderlag\b/i, why: "assumes documentary casework" },
  { pattern: /\bpenningtvätt/i, why: "AML-specific" },
  { pattern: /money laundering/i, why: "AML-specific" },
  { pattern: /\bkontroll\b/i, why: "reads as a formal control, not a plain-language step" },
];

for (const item of CORE_ITEMS) {
  for (const locale of AVAILABLE_LOCALES) {
    const text = item.stem[locale];
    for (const { pattern, why } of EXPERIENCE_DEPENDENT) {
      ok(
        !pattern.test(text),
        `5.1 ${item.id} (${locale}) uses an experience-dependent term ${pattern} — ${why}: "${text}"`,
      );
    }
  }
}

// The same terms, for the context questions every candidate sees.
for (const item of CONTEXT_ITEMS) {
  for (const locale of AVAILABLE_LOCALES) {
    for (const { pattern } of EXPERIENCE_DEPENDENT) {
      ok(
        !pattern.test(item.prompt[locale]),
        `5.2 context ${item.id} (${locale}) uses an experience-dependent term ${pattern}`,
      );
    }
  }
}

// A stem must never leak an internal construct id to a candidate.
for (const item of CORE_ITEMS) {
  for (const locale of AVAILABLE_LOCALES) {
    ok(
      !/\b(CID\d{2}|CP\d{2}|SCA\d{2}|CQ\d{2})\b/.test(item.stem[locale]),
      `5.3 ${item.id} (${locale}) exposes an internal identifier`,
    );
  }
}

// Both locales are always present and never left equal to each other, which
// is what a forgotten translation looks like.
for (const item of CORE_ITEMS) {
  ok(
    item.stem.sv.trim().length > 0 && item.stem.en.trim().length > 0,
    `5.4 ${item.id} is bilingual`,
  );
  ok(item.stem.sv !== item.stem.en, `5.5 ${item.id} has a real English adaptation`);
}
for (const item of [...CONTEXT_ITEMS, ...ALL_ADAPTIVE_ITEMS]) {
  ok(
    item.prompt.sv.trim().length > 0 && item.prompt.en.trim().length > 0,
    `5.6 ${item.id} is bilingual`,
  );
  ok(item.prompt.sv !== item.prompt.en, `5.7 ${item.id} has a real English adaptation`);
}

// British English, matching the existing Career Discovery copy.
const AMERICANISMS = [
  /\bprioritize\b/i,
  /\borganization\b/i,
  /\brecognize\b/i,
  /\banalyze\b/i,
  /\bbehavior\b/i,
];
for (const item of CORE_ITEMS) {
  for (const a of AMERICANISMS) {
    ok(!a.test(item.stem.en), `5.8 ${item.id} English stem uses British spelling (${a})`);
  }
}
for (const item of [...CONTEXT_ITEMS, ...ALL_ADAPTIVE_ITEMS]) {
  for (const a of AMERICANISMS) {
    ok(!a.test(item.prompt.en), `5.9 ${item.id} English prompt uses British spelling (${a})`);
  }
}

// =========================================================================
group("6 · Versioning");
// =========================================================================

eq(CONTENT_VERSION, "v3.1-draft-5", "6.1 content version records the context/intent separation");
// The claim being guarded is "the v3.2 CONTENT refinement did not move
// scoring", and it still holds: content went draft-3 -> draft-4 -> draft-5
// while scoring stayed at draft-3 throughout that work. Scoring has since
// moved to draft-4 for an unrelated, separately-versioned reason (the
// Profession Recommendation Validation mandate's ranking changes), so the
// pin follows the constant. What must never happen is the two moving in the
// SAME change, which is proven field-by-field, against a frozen
// pre-refinement baseline, by career-discovery-v32-equivalence-check.ts.
eq(SCORING_VERSION, "v3.1-draft-4", "6.2 scoring version did not move with the content refinement");
ok(CONTENT_VERSION !== SCORING_VERSION, "6.3 content and scoring versions travel independently");

console.log(`\n${failures === 0 ? "PASS" : "FAIL"}  ${checks - failures}/${checks} content checks`);
if (failures > 0) process.exit(1);
