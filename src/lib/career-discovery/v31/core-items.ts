// The 22 core Career DNA items.
//
// STEM WORDING IS OWNER-APPROVED AT v3.2, NOT WORKBOOK-VERBATIM. Until
// Question Refinement v3.2, CQ01–CQ20's stems were reproduced verbatim from
// CQrityjob_Career_Intelligence_Matrix_LOCKED_v0_2.xlsx, sheet 10. The owner
// then re-approved twelve of them (CQ01, CQ03, CQ05, CQ06, CQ09, CQ13, CQ14,
// CQ15, CQ17, CQ20, CQ21, CQ22) in plainer language, because the workbook
// phrasing assumed the reader already worked in security — it asked about
// "kontroll", "incident", "hela verksamheten" and "transaktioner", which a
// student or career changer cannot answer from experience. The workbook is
// therefore NO LONGER the authority on stem text; the approved v3.2 wording
// transcribed in scripts/career-discovery-v32-content-check.ts is, and that
// guard fails on any paraphrase.
//
// What the workbook still governs is unchanged: the constructs. Every
// declared primary and secondary dimension below, and every item id, format
// and order, is exactly what it was — the refinement rephrased the question
// and never the thing being measured. That is proven per-field, against a
// baseline frozen on pre-refinement main, by
// scripts/career-discovery-v32-equivalence-check.ts.
//
// Fourteen items are 1–10 scales; eight are single-choice, whose options live
// in option-matrix.ts because they carry their own dimension loadings. Option
// text was NOT touched by v3.2 — only stems.
//
// CQ21 and CQ22 are new (Final Autonomous Matching Engine Completion
// Mandate): CID17 (Regulatory & Compliance Orientation) postdates the locked
// workbook and had no scored evidence source at all. Both are scale items,
// like CQ01/CQ04/etc — no option-matrix.ts entry needed; scale items score
// directly off primary/secondary, only single_choice items carry
// option-level loadings.
//
// TWO items, not one: a dimension with a single 0.70-weight primary source
// cannot clear owner decision 6's 0.60 dominance cap (0.70/0.70 = 100%) no
// matter how the rest of the instrument is built — the cap exists precisely
// so one question can never single-handedly decide a whole dimension. CQ21
// and CQ22 measure genuinely distinct expressions of the same construct
// (motivation/preference vs. observed working behaviour) rather than
// restating each other, so together they are real evidence, not statistical
// padding: 0.70/(0.70+0.70) = 50%, comfortably under the cap.
//
// That distinction SURVIVES the v3.2 rephrasing, which is worth stating
// because the two stems now share the phrase "lägga märke till" and look
// more alike than they used to. They are still not the same question: CQ21
// is "jag tycker om att" — what the candidate is drawn to — and CQ22 is "jag
// brukar" — what they actually do. Preference and habit are exactly the two
// expressions this pair was built to separate, and someone can genuinely
// hold one without the other.
//
// Declared primary and secondary dimensions are owner-locked (CQ01–20) or
// declared following the same primary=0.70/secondary=0.30 role-weight
// convention (CQ21, CQ22). These are the part v3.2 explicitly did not touch —
// see the header. Owner decision A-3 permits an OPTION to carry evidence for
// further dimensions, but never changes what is declared here.
//
// ── WHY SCALE MAPPINGS LIVE IN CODE AND OPTIONS LIVE IN THE DATABASE ────
//
// An option loading is a row per (option, dimension) with a written
// rationale, queried at explain time to answer "why did this option
// contribute to this dimension?". A scale item has no options, so it has
// nothing to explain beyond its declared primary and secondary — which the
// locked workbook already fixes. Storing 24 rows to restate the workbook
// would add a table read to every score for no explanatory gain.
//
// The guard script asserts the resulting per-dimension evidence weights
// against exact expected values, so a wrong scale mapping changes those
// numbers and fails CI.

import type { DimensionId } from "./dimensions";
import type { Bilingual } from "./version";

export type ItemFormat = "scale" | "single_choice";

export interface CoreItem {
  readonly id: string;
  readonly format: ItemFormat;
  readonly stem: Bilingual;
  /** Declared primary dimension. Role weight 0.70. */
  readonly primary: DimensionId;
  /** Declared secondary dimension. Role weight 0.30. */
  readonly secondary: DimensionId;
  /** Evidence purpose, from the locked workbook. Documentation only. */
  readonly purpose: string;
  /** Display order within the instrument. */
  readonly order: number;
}

export const CORE_ITEMS: readonly CoreItem[] = [
  {
    id: "CQ01",
    format: "scale",
    primary: "CID01",
    secondary: "CID12",
    order: 1,
    purpose: "Core DNA",
    stem: {
      sv: "Jag trivs bäst när jag får vara nära det som händer och agera praktiskt när det behövs.",
      en: "I am at my best when I am close to what is happening and can act practically when needed.",
    },
  },
  {
    id: "CQ02",
    format: "single_choice",
    primary: "CID04",
    secondary: "CID03",
    order: 2,
    purpose: "Differentiation",
    stem: {
      sv: "Vilken arbetsuppgift skulle du helst välja?",
      en: "Which task would you prefer?",
    },
  },
  {
    id: "CQ03",
    format: "single_choice",
    primary: "CID15",
    secondary: "CID06",
    order: 3,
    purpose: "Judgement",
    stem: {
      sv: "Du märker att ett viktigt steg har hoppats över för att spara tid. Vad skulle du göra först?",
      en: "You notice that an important step has been skipped to save time. What would you do first?",
    },
  },
  {
    id: "CQ04",
    format: "scale",
    primary: "CID03",
    secondary: "CID10",
    order: 4,
    purpose: "Core DNA",
    stem: {
      sv: "Jag föredrar att fördjupa mig i ett komplext problem framför att snabbt gå vidare till nästa uppgift.",
      en: "I prefer exploring a complex problem in depth rather than quickly moving on.",
    },
  },
  {
    id: "CQ05",
    format: "scale",
    primary: "CID07",
    secondary: "CID08",
    order: 5,
    purpose: "Core DNA",
    stem: {
      sv: "Jag får energi av att hjälpa andra att förstå och känna sig trygga.",
      en: "I gain energy from helping others understand things and feel reassured.",
    },
  },
  {
    id: "CQ06",
    format: "single_choice",
    primary: "CID16",
    secondary: "CID10",
    order: 6,
    purpose: "Pressure and investigation",
    stem: {
      sv: "Två personer ger olika uppgifter om vad som har hänt och du behöver komma vidare. Vad gör du?",
      en: "Two people give different accounts of what happened and you need to move forward. What do you do?",
    },
  },
  {
    id: "CQ07",
    format: "scale",
    primary: "CID11",
    secondary: "CID06",
    order: 7,
    purpose: "Core DNA",
    stem: {
      sv: "Jag uppskattar tydliga rutiner, dokumentation och uppföljning även när tempot är högt.",
      en: "I value clear procedures, documentation and follow-up even when the pace is high.",
    },
  },
  {
    id: "CQ08",
    format: "scale",
    primary: "CID04",
    secondary: "CID03",
    order: 8,
    purpose: "Core DNA",
    stem: {
      sv: "Jag tycker om att förstå hur tekniska system fungerar och varför de ibland inte gör det.",
      en: "I enjoy understanding how technical systems work and why they sometimes fail.",
    },
  },
  {
    id: "CQ09",
    format: "single_choice",
    primary: "CID05",
    secondary: "CID06",
    order: 9,
    purpose: "Work orientation",
    stem: {
      sv: "När ett återkommande problem uppstår, vad känns mest naturligt för dig att göra?",
      en: "When a recurring problem occurs, what feels most natural for you to do?",
    },
  },
  {
    id: "CQ10",
    format: "scale",
    primary: "CID09",
    secondary: "CID16",
    order: 10,
    purpose: "Core DNA",
    stem: {
      sv: "Jag är bekväm med att sätta gränser och hantera motstånd på ett lugnt och respektfullt sätt.",
      en: "I am comfortable setting boundaries and handling resistance calmly and respectfully.",
    },
  },
  {
    id: "CQ11",
    format: "scale",
    primary: "CID12",
    secondary: "CID11",
    order: 11,
    purpose: "Core DNA",
    stem: {
      sv: "Jag föredrar arbete där jag själv kan fatta beslut inom tydliga ramar.",
      en: "I prefer work where I can make decisions independently within clear boundaries.",
    },
  },
  {
    id: "CQ12",
    format: "single_choice",
    primary: "CID15",
    secondary: "CID14",
    order: 12,
    purpose: "Judgement and learning",
    stem: {
      sv: "Du får ny information som visar att din första bedömning kan vara fel. Vad gör du?",
      en: "You receive new information showing your first judgement may be wrong. What do you do?",
    },
  },
  {
    id: "CQ13",
    format: "scale",
    primary: "CID02",
    secondary: "CID13",
    order: 13,
    purpose: "Core DNA",
    stem: {
      sv: "Jag tycker om att hjälpa andra att utvecklas och skapa riktning när en grupp behöver komma framåt.",
      en: "I enjoy helping others develop and creating direction when a group needs to move forward.",
    },
  },
  {
    id: "CQ14",
    format: "scale",
    primary: "CID05",
    secondary: "CID06",
    order: 14,
    purpose: "Core DNA",
    stem: {
      sv: "Jag tänker gärna flera steg framåt och funderar på vilka följder ett beslut kan få.",
      en: "I like to think several steps ahead and consider the possible consequences of a decision.",
    },
  },
  {
    id: "CQ15",
    format: "single_choice",
    primary: "CID01",
    secondary: "CID13",
    order: 15,
    purpose: "Environment preference",
    stem: {
      sv: "Vilken arbetsmiljö tror du att du skulle trivas bäst i?",
      en: "Which work environment do you think you would enjoy most?",
    },
  },
  {
    id: "CQ16",
    format: "scale",
    primary: "CID14",
    secondary: "CID11",
    order: 16,
    purpose: "Core DNA",
    stem: {
      sv: "Jag lär mig gärna nya metoder, system eller regelverk även när det kräver tid och ansträngning.",
      en: "I willingly learn new methods, systems or regulations even when it takes time and effort.",
    },
  },
  {
    id: "CQ17",
    format: "single_choice",
    primary: "CID10",
    secondary: "CID03",
    order: 17,
    purpose: "Investigation",
    stem: {
      sv: "Ett problem är löst för stunden, men det är fortfarande oklart varför det uppstod. Vad skulle du prioritera?",
      en: "A problem has been resolved for now, but it is still unclear why it occurred. What would you prioritise?",
    },
  },
  {
    id: "CQ18",
    format: "scale",
    primary: "CID13",
    secondary: "CID07",
    order: 18,
    purpose: "Core DNA",
    stem: {
      sv: "Jag föredrar gemensamt ansvar och samarbete framför att lösa allt på egen hand.",
      en: "I prefer shared responsibility and teamwork over solving everything alone.",
    },
  },
  {
    id: "CQ19",
    format: "scale",
    primary: "CID16",
    secondary: "CID09",
    order: 19,
    purpose: "Core DNA",
    stem: {
      sv: "Jag brukar behålla fokus och ett stabilt bemötande även när andra blir stressade.",
      en: "I tend to remain focused and steady even when others become stressed.",
    },
  },
  {
    id: "CQ20",
    format: "single_choice",
    primary: "CID08",
    secondary: "CID05",
    order: 20,
    purpose: "Motivation",
    stem: {
      sv: "Vilket resultat skulle ge dig störst känsla av att du gjort något meningsfullt?",
      en: "Which outcome would give you the strongest sense that you had done something meaningful?",
    },
  },
  {
    id: "CQ21",
    format: "scale",
    primary: "CID17",
    secondary: "CID11",
    order: 21,
    purpose: "Core DNA",
    stem: {
      sv: "Jag tycker om att förstå vilka regler som gäller och lägga märke till när något inte följer dem.",
      en: "I enjoy understanding which rules apply and noticing when something does not follow them.",
    },
  },
  {
    id: "CQ22",
    format: "scale",
    primary: "CID17",
    secondary: "CID06",
    order: 22,
    purpose: "Core DNA",
    stem: {
      sv: "Jag brukar lägga märke till när detaljer inte stämmer med regler eller krav som ska följas.",
      en: "I tend to notice when details do not match rules or requirements that need to be followed.",
    },
  },
];

export const CORE_ITEM_IDS: readonly string[] = CORE_ITEMS.map((i) => i.id);

export const CORE_ITEM_BY_ID: Readonly<Record<string, CoreItem>> = Object.fromEntries(
  CORE_ITEMS.map((i) => [i.id, i]),
);

export const SCALE_ITEMS = CORE_ITEMS.filter((i) => i.format === "scale");
export const SINGLE_CHOICE_ITEMS = CORE_ITEMS.filter((i) => i.format === "single_choice");

/** Scale response range, inclusive. */
export const SCALE_MIN = 1;
export const SCALE_MAX = 10;

/** Normalise a raw 1–10 response to [0,1]. */
export function normaliseScale(raw: number): number {
  return (raw - SCALE_MIN) / (SCALE_MAX - SCALE_MIN);
}
