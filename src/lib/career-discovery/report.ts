// Structured report generation — the nine sections.
//
// ── STRUCTURED DATA, NOT PROSE ─────────────────────────────────────────
//
// This module returns a structured object. Candidate-facing language is
// rendered from it at display time using versioned content, so a wording
// fix never rewrites history and never silently changes what a stored
// report meant. Nothing here stores rendered prose.
//
// ── WHAT MAY INFLUENCE WHAT ────────────────────────────────────────────
//
// `dna` and `areas` are computed from the 20 core items alone, upstream of
// this file. Context and adaptive answers arrive as `framing` and may only
// influence: report wording · recommended learning · next steps · examples ·
// career guidance. The section builders that receive `framing` are
// deliberately the only ones that do; `buildDnaSection`, `buildTopAreas`,
// `buildWhySection` and `buildAdjacent` do not take it as a parameter, so
// no contextual value can reach a ranking or a score.
//
// ── LANGUAGE RULES ─────────────────────────────────────────────────────
//
// Permitted: "stämmer väl överens med", "kan vara relevant att utforska",
// "din profil delar flera drag med", "ett möjligt nästa steg".
// Forbidden anywhere: suitable · unsuitable · approved · failed ·
// guaranteed match · ideal candidate · should be hired. The first result
// screen must never open with "You are best suited for…". The guard script
// asserts the forbidden vocabulary is absent from every emitted string.

import { AUTHORITY_DISCLAIMER, AREA_PROFILE_VALIDATION_STATUS } from "./career-areas";
import type { AreaProfileValidationStatus } from "./career-areas";
import type { SecurityCareerAreaId } from "./career-areas";
import { CAREER_ORIENTATION_AXES } from "./axes";
import type { AreaRanking, RankingResult } from "./area-ranking";
import { categoryFor } from "./area-ranking";
import type { AreaCategory } from "./area-ranking";
import type { AxisScore, DnaResult } from "./scoring";
import { strongestPatterns } from "./scoring";
import type { Bi, CareerOrientationAxisId, ContextStatus, DiscoveryGoal } from "./types";
import { CONTENT_VERSION, DEFINITION_VERSION, SCORING_VERSION, TAXONOMY_VERSION } from "./version";

export const REPORT_VERSION = "scd-report-v1" as const;

/** Everything contextual that may shape wording. Deliberately a separate
 *  parameter object so its reach is visible in every signature. */
export interface ReportFraming {
  contextStatus: ContextStatus | null;
  discoveryGoal: DiscoveryGoal | null;
  /** Contextual report tags from the four adaptive answers. */
  tags: string[];
}

// -------------------------------------------------------------------------
// Section types
// -------------------------------------------------------------------------

export interface DnaAxisView {
  axis: CareerOrientationAxisId;
  name: Bi;
  position: number | null;
  confidence: AxisScore["confidence"];
  contextDependent: boolean;
  usable: boolean;
  lowEnd: Bi;
  highEnd: Bi;
  neverMeans: Bi;
}

export interface AreaView {
  areaId: SecurityCareerAreaId;
  name: Bi;
  summary: Bi;
  fit: number;
  confidence: AreaRanking["confidence"];
  authorityRoute: boolean;
  authorityDisclaimer: Bi | null;
}

export interface ReasonView {
  areaId: SecurityCareerAreaId;
  areaName: Bi;
  reasons: Array<{ axis: CareerOrientationAxisId; axisName: Bi; statement: Bi }>;
  /** Named uncertainty — what we do not know, and that it is resolvable. */
  unknowns: Array<{ axis: CareerOrientationAxisId; axisName: Bi; statement: Bi }>;
}

export interface DiscoveryReport {
  reportVersion: typeof REPORT_VERSION;
  definitionVersion: typeof DEFINITION_VERSION;
  contentVersion: typeof CONTENT_VERSION;
  scoringVersion: typeof SCORING_VERSION;
  taxonomyVersion: typeof TAXONOMY_VERSION;
  generatedAt: string;

  /** 1 */ dna: { axes: DnaAxisView[]; coverage: number; axisCoverage: number };
  /** 2 */ summary: { opening: Bi; category: AreaCategory; framingKey: ContextStatus | null };
  /** 3 */ strengths: Array<{ axis: CareerOrientationAxisId; axisName: Bi; statement: Bi }>;
  /** 4 */ topAreas: AreaView[];
  /** 5 */ why: ReasonView[];
  /** 6 */ adjacentAreas: AreaView[];
  /** 7 */ development: Array<{ axis: CareerOrientationAxisId; axisName: Bi; statement: Bi }>;
  /** 8 */ nextSteps: Bi[];
  /** 9 */ method: {
    statements: Bi[];
    itemsAnswered: number;
    areaProfileValidationStatus: AreaProfileValidationStatus;
    insufficientEvidence: boolean;
  };
}

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

const axisDef = (id: CareerOrientationAxisId) => CAREER_ORIENTATION_AXES.find((a) => a.id === id)!;

/** Describe where a person sits on an axis, in the axis's own vocabulary.
 *  Never a value judgement: both ends are legitimate, so the wording
 *  describes a leaning and never a level. */
function leaning(axis: AxisScore): Bi {
  const def = axisDef(axis.axis);
  if (axis.contextDependent) {
    return {
      sv: `Dina svar tyder på att det här beror på situationen för dig — ett verkligt mönster, och det påverkar vilka miljöer som passar.`,
      en: `Your answers suggest this depends on the situation for you — a real pattern, and it matters for which environments suit you.`,
    };
  }
  const p = axis.position ?? 0.5;
  if (p >= 0.67) return def.highEnd;
  if (p <= 0.33) return def.lowEnd;
  return {
    sv: `Du rör dig mellan båda ändarna här.`,
    en: `You move between both ends here.`,
  };
}

// -------------------------------------------------------------------------
// 1 · DNA — no framing parameter, by design
// -------------------------------------------------------------------------

function buildDnaSection(dna: DnaResult): DiscoveryReport["dna"] {
  return {
    axes: dna.axes.map((a) => {
      const def = axisDef(a.axis);
      return {
        axis: a.axis,
        name: def.name,
        position: a.position,
        confidence: a.confidence,
        contextDependent: a.contextDependent,
        usable: a.usableForMatching,
        lowEnd: def.lowEnd,
        highEnd: def.highEnd,
        neverMeans: def.neverMeans,
      };
    }),
    coverage: dna.coverage,
    axisCoverage: dna.axisCoverage,
  };
}

// -------------------------------------------------------------------------
// 2 · Summary — framing is permitted here
// -------------------------------------------------------------------------

const OPENING_BY_GOAL: Record<DiscoveryGoal, Bi> = {
  find_direction: {
    sv: "Du ville hitta rätt yrkesinriktning. Här är vad dina svar pekar mot.",
    en: "You wanted to find the right career direction. Here is what your answers point toward.",
  },
  confirm_direction: {
    sv: "Du ville bekräfta din nuvarande riktning. Här är hur din profil förhåller sig till den.",
    en: "You wanted to confirm your current direction. Here is how your profile relates to it.",
  },
  discover_opportunities: {
    sv: "Du ville upptäcka nya möjligheter. Här är områden som kan vara relevanta att utforska.",
    en: "You wanted to discover new opportunities. Here are areas that may be relevant to explore.",
  },
  understand_strengths: {
    sv: "Du ville förstå dina styrkor. Här är de mönster som framträder tydligast.",
    en: "You wanted to understand your strengths. Here are the patterns that stand out most clearly.",
  },
  curious: {
    sv: "Du var mest nyfiken. Här är vad dina svar säger — utan krav på att du gör något med det.",
    en: "You were mostly curious. Here is what your answers say — with no expectation that you act on it.",
  },
};

function buildSummary(dna: DnaResult, framing: ReportFraming): DiscoveryReport["summary"] {
  return {
    opening: framing.discoveryGoal
      ? OPENING_BY_GOAL[framing.discoveryGoal]
      : {
          sv: "Din profil visar hur du föredrar att arbeta, tänka, samarbeta och ta ansvar i olika typer av säkerhetsarbete.",
          en: "Your profile reflects how you prefer to work, think, collaborate and take responsibility across different types of security work.",
        },
    category: categoryFor(dna),
    framingKey: framing.contextStatus,
  };
}

// -------------------------------------------------------------------------
// 3 · Strengths — patterns, never scores
// -------------------------------------------------------------------------

function buildStrengths(dna: DnaResult): DiscoveryReport["strengths"] {
  return strongestPatterns(dna, 3).map((a) => ({
    axis: a.axis,
    axisName: axisDef(a.axis).name,
    statement: leaning(a),
  }));
}

// -------------------------------------------------------------------------
// 4 / 6 · Areas — no framing parameter, by design
// -------------------------------------------------------------------------

function toAreaView(r: AreaRanking): AreaView {
  return {
    areaId: r.areaId,
    name: r.area.name,
    summary: r.area.summary,
    fit: r.fit,
    confidence: r.confidence,
    authorityRoute: r.area.authorityRoute,
    authorityDisclaimer: r.area.authorityRoute ? AUTHORITY_DISCLAIMER : null,
  };
}

// -------------------------------------------------------------------------
// 5 · Why — every recommendation is explained, or it is withheld
// -------------------------------------------------------------------------

function buildWhySection(ranking: RankingResult, dna: DnaResult): ReasonView[] {
  return (
    ranking.top
      // No unexplainable recommendation is shown. Not softened — withheld.
      .filter((r) => r.topReasons.length > 0)
      .map((r) => ({
        areaId: r.areaId,
        areaName: r.area.name,
        reasons: r.topReasons.map((c) => {
          const axis = dna.axes.find((a) => a.axis === c.axis)!;
          return {
            axis: c.axis,
            axisName: axisDef(c.axis).name,
            statement: {
              sv: `Din profil stämmer väl överens med det här området när det gäller ${axisDef(c.axis).name.sv.toLowerCase()}: ${leaning(axis).sv}`,
              en: `Your profile aligns closely with this area on ${axisDef(c.axis).name.en.toLowerCase()}: ${leaning(axis).en}`,
            },
          };
        }),
        unknowns: r.unevaluatedAxes.map((ax) => ({
          axis: ax,
          axisName: axisDef(ax).name,
          statement: {
            sv: `Vi har ännu ingen tydlig bild av ${axisDef(ax).name.sv.toLowerCase()}. Fler svar skulle klargöra det.`,
            en: `We don't yet have a clear read on ${axisDef(ax).name.en.toLowerCase()}. More answers would resolve it.`,
          },
        })),
      }))
  );
}

// -------------------------------------------------------------------------
// 7 · Development — from gaps and behavioural signals, never a deficit score
// -------------------------------------------------------------------------

function buildDevelopment(ranking: RankingResult, dna: DnaResult): DiscoveryReport["development"] {
  const seen = new Set<CareerOrientationAxisId>();
  const out: DiscoveryReport["development"] = [];

  for (const area of ranking.top) {
    for (const gap of area.gaps) {
      if (seen.has(gap.axis)) continue;
      seen.add(gap.axis);
      out.push({
        axis: gap.axis,
        axisName: axisDef(gap.axis).name,
        statement: {
          sv: `${area.area.name.sv} lutar åt ett annat håll än du när det gäller ${axisDef(gap.axis).name.sv.toLowerCase()}. Det är inte ett hinder — det är något att vara medveten om.`,
          en: `${area.area.name.en} leans differently from you on ${axisDef(gap.axis).name.en.toLowerCase()}. That is not a barrier — it is something to be aware of.`,
        },
      });
    }
  }

  for (const ax of dna.emergingAxes.slice(0, 2)) {
    if (seen.has(ax)) continue;
    seen.add(ax);
    out.push({
      axis: ax,
      axisName: axisDef(ax).name,
      statement: {
        sv: `Vi har en tidig bild av ${axisDef(ax).name.sv.toLowerCase()} — inte tillräckligt för att luta sig mot ännu.`,
        en: `We have an early read on ${axisDef(ax).name.en.toLowerCase()} — not enough to lean on yet.`,
      },
    });
  }

  return out.slice(0, 4);
}

// -------------------------------------------------------------------------
// 8 · Next steps — framing IS permitted, and is the point of it
// -------------------------------------------------------------------------

const NEXT_STEPS_BY_STATUS: Record<ContextStatus, Bi[]> = {
  exploring_security: [
    {
      sv: "Läs om de områden ovan som du inte kände till sedan tidigare — flera av dem kräver ingen tidigare erfarenhet av säkerhet.",
      en: "Read about the areas above that were new to you — several require no prior security experience.",
    },
    {
      sv: "Ett möjligt nästa steg är att titta på vilka roller som finns som ingångar inom det område som stämmer bäst.",
      en: "A possible next step is to look at which roles serve as entry points into the area that fits best.",
    },
  ],
  working_in_security: [
    {
      sv: "Jämför din profil med det du gör idag — det som stämmer väl överens är ofta det du redan är känd för.",
      en: "Compare your profile with what you do today — what aligns closely is often what you are already known for.",
    },
    {
      sv: "Ett möjligt nästa steg är att utforska ett angränsande område där mycket av din erfarenhet fortfarande är relevant.",
      en: "A possible next step is to explore an adjacent area where much of your experience remains relevant.",
    },
  ],
  developing_current_role: [
    {
      sv: "Titta på utvecklingsavsnittet ovan och välj ett område att arbeta med under de kommande 12–24 månaderna.",
      en: "Look at the development section above and choose one area to work on over the next 12–24 months.",
    },
    {
      sv: "Ett möjligt nästa steg är att söka ett ansvar som ligger strax utanför din nuvarande roll.",
      en: "A possible next step is to seek a responsibility just outside your current role.",
    },
  ],
  changing_career_area: [
    {
      sv: "Notera vilka av dina styrkor som är överförbara — de följer med dig oavsett vilket område du väljer.",
      en: "Note which of your strengths are transferable — they come with you whichever area you choose.",
    },
    {
      sv: "Ett möjligt nästa steg är att prova ett nytt område med låg risk, genom projekt eller sidouppdrag, innan du byter helt.",
      en: "A possible next step is to try a new area at low risk, through a project or additional assignment, before changing fully.",
    },
  ],
  security_leader: [
    {
      sv: "Jämför din ledarskapsorientering med den räckvidd du har idag — skillnaden är ofta det mest användbara.",
      en: "Compare your leadership orientation with the scope you have today — the difference is often the most useful part.",
    },
    {
      sv: "Ett möjligt nästa steg är att bygga organisationens förmåga inom det område där din profil är starkast.",
      en: "A possible next step is to build organisational capability in the area where your profile is strongest.",
    },
  ],
};

function buildNextSteps(framing: ReportFraming): Bi[] {
  const base = framing.contextStatus
    ? NEXT_STEPS_BY_STATUS[framing.contextStatus]
    : [
        {
          sv: "Ett möjligt nästa steg är att läsa mer om de områden som stämmer bäst med din profil.",
          en: "A possible next step is to read more about the areas that best match your profile.",
        },
      ];
  return [...base];
}

// -------------------------------------------------------------------------
// 9 · Method — honest limitation disclosure is an ethical duty
// -------------------------------------------------------------------------

function buildMethod(dna: DnaResult, ranking: RankingResult): DiscoveryReport["method"] {
  const statements: Bi[] = [
    {
      sv: "Det här är karriärvägledning, inte ett prov. Det finns inga rätt eller fel svar, och ingenting här är ett utlåtande om anställningsbarhet.",
      en: "This is career guidance, not a test. There are no right or wrong answers, and nothing here is a judgement about employability.",
    },
    {
      sv: `Resultatet bygger på dina svar på ${dna.answeredCoreItemCount} kärnfrågor. De två inledande frågorna och de fyra anpassade frågorna påverkar hur rapporten är formulerad — aldrig vad den räknar fram.`,
      en: `The result is based on your answers to ${dna.answeredCoreItemCount} core questions. The two opening questions and the four adapted questions shape how the report is worded — never what it computes.`,
    },
    {
      sv: "Beräkningen är deterministisk. Samma svar ger alltid samma resultat, och ingen AI är inblandad i poängsättningen.",
      en: "The computation is deterministic. The same answers always give the same result, and no AI is involved in the scoring.",
    },
  ];

  if (AREA_PROFILE_VALIDATION_STATUS !== "reviewed") {
    statements.push({
      sv: "Kravprofilerna för yrkesområdena är framtagna men ännu inte granskade av en oberoende sakkunnig. Behandla rangordningen som en utgångspunkt för samtal, inte som ett facit.",
      en: "The requirement profiles for the career areas are authored but not yet reviewed by an independent specialist. Treat the ranking as a starting point for a conversation, not as a verdict.",
    });
  }

  if (dna.emergingAxes.length > 0) {
    statements.push({
      sv: `Vi har ännu ingen säker bild av ${dna.emergingAxes.length} av åtta dimensioner. De har lämnats utanför rangordningen helt, i stället för att räknas med svagt.`,
      en: `We do not yet have a confident read on ${dna.emergingAxes.length} of eight dimensions. They were left out of the ranking entirely, rather than counted weakly.`,
    });
  }

  return {
    statements,
    itemsAnswered: dna.answeredCoreItemCount,
    areaProfileValidationStatus: AREA_PROFILE_VALIDATION_STATUS,
    insufficientEvidence: ranking.insufficientEvidence,
  };
}

// -------------------------------------------------------------------------
// Assembly
// -------------------------------------------------------------------------

export function buildReport(
  dna: DnaResult,
  ranking: RankingResult,
  framing: ReportFraming,
  now: () => string = () => new Date().toISOString(),
): DiscoveryReport {
  return {
    reportVersion: REPORT_VERSION,
    definitionVersion: DEFINITION_VERSION,
    contentVersion: CONTENT_VERSION,
    scoringVersion: SCORING_VERSION,
    taxonomyVersion: TAXONOMY_VERSION,
    generatedAt: now(),

    dna: buildDnaSection(dna),
    summary: buildSummary(dna, framing),
    strengths: buildStrengths(dna),
    topAreas: ranking.top.map(toAreaView),
    why: buildWhySection(ranking, dna),
    adjacentAreas: ranking.adjacent.map(toAreaView),
    development: buildDevelopment(ranking, dna),
    nextSteps: buildNextSteps(framing),
    method: buildMethod(dna, ranking),
  };
}

/** Vocabulary that must never appear in a candidate-facing string. The
 *  guard script walks every emitted Bi and fails on any of these. */
export const FORBIDDEN_REPORT_PHRASES = [
  "you are suitable",
  "you are unsuitable",
  "best suited for",
  "approved",
  "failed",
  "guaranteed match",
  "ideal candidate",
  "should be hired",
  "lämplig för anställning",
  "olämplig",
  "godkänd",
  "underkänd",
  "garanterad matchning",
  "bör anställas",
] as const;
