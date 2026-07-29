// The 20 core Career DNA items.
//
// Stems are owner-locked and reproduced VERBATIM from
// CQrityjob_Career_Intelligence_Matrix_LOCKED_v0_2.xlsx, sheet 10. Twelve are
// 1–10 scales; eight are single-choice, whose options live in
// option-matrix.ts because they carry their own dimension loadings.
//
// Declared primary and secondary dimensions are also owner-locked. Owner
// decision A-3 permits an OPTION to carry evidence for further dimensions,
// but never changes what is declared here.
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
      sv: "Jag trivs bäst när jag får vara nära den praktiska verksamheten och agera direkt när något händer.",
      en: "I prefer being close to operations and acting directly when something happens.",
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
      sv: "Du upptäcker att en viktig kontroll har hoppats över för att spara tid. Vad gör du först?",
      en: "You discover that an important control was skipped to save time. What do you do first?",
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
      sv: "Jag får energi av att förklara, lyssna och skapa trygghet för andra.",
      en: "I gain energy from explaining, listening and creating reassurance for others.",
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
      sv: "Två personer ger motstridiga uppgifter under en pressad situation. Vad gör du?",
      en: "Two people provide conflicting information during a pressured situation. What do you do?",
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
      sv: "När ett återkommande problem uppstår, vad känns mest naturligt?",
      en: "When a recurring problem occurs, what feels most natural?",
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
      sv: "Jag motiveras av att utveckla andra och skapa riktning när flera personer behöver samarbeta.",
      en: "I am motivated by developing others and creating direction when several people must cooperate.",
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
      sv: "Jag tänker gärna flera steg framåt och ser hur beslut påverkar hela verksamheten.",
      en: "I like thinking several steps ahead and seeing how decisions affect the whole organisation.",
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
      sv: "Vilken arbetsmiljö känns mest naturlig för dig?",
      en: "Which work environment feels most natural to you?",
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
      sv: "En incident är löst men orsaken är fortfarande oklar. Vad prioriterar du?",
      en: "An incident is resolved but the cause remains unclear. What do you prioritise?",
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
      sv: "Vilket resultat känns mest meningsfullt efter en arbetsdag?",
      en: "Which outcome feels most meaningful after a working day?",
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
