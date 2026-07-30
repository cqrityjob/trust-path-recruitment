// Security Career Areas — Layer 3.
//
// Ten owner-locked areas with per-dimension target profiles, reproduced from
// CQrityjob_Career_Intelligence_Matrix_LOCKED_v0_2.xlsx sheets 02 and 07.
//
// ── AREA RANKING IS BROAD INTERPRETATION, NOT PROFESSION MATCHING ───────
//
// Matching rule PMR004 is explicit: area scores give broad interpretation and
// do not replace profession-level profiles. A candidate is shown where they
// most naturally belong, not which job to apply for. Profession-level
// matching is Layer 4 and needs calibration that does not exist yet.
//
// ── TWO PROPERTIES OF THE LOCKED DATA WORTH KNOWING ─────────────────────
//
// 1. All 160 profile rows carry Importance = "Core". The sheet provides no
//    per-dimension weighting, so every scored dimension weighs equally here.
//    That is the data as locked, not a simplification chosen in code.
//
// 2. CID15's target is 8-10 for all ten areas, which would make it a
//    near-constant even if it were scored. It is excluded regardless, under
//    owner decision A-4.
//
// ── SCORING ────────────────────────────────────────────────────────────
//
// Distance-based, not threshold-based, and asymmetric: exceeding a target is
// never penalised. A candidate more analytical than an area requires is not a
// worse fit for it — matching rule PMR001 says harmless extra strengths are
// not penalised, and that applies here too.

import { MATCHABLE_DIMENSION_IDS, type DimensionId } from "./dimensions";
import type { DimensionResult } from "./scoring";
import type { Bilingual } from "./version";

export const CAREER_AREA_IDS = [
  "SCA01",
  "SCA02",
  "SCA03",
  "SCA04",
  "SCA05",
  "SCA06",
  "SCA07",
  "SCA08",
  "SCA09",
  "SCA10",
] as const;

export type CareerAreaId = (typeof CAREER_AREA_IDS)[number];

export interface CareerArea {
  readonly id: CareerAreaId;
  readonly name: Bilingual;
  readonly description: Bilingual;
  /** Target on the locked 1-10 scale, per dimension. */
  readonly targets: Readonly<Record<DimensionId, number>>;
}

export const CAREER_AREAS: Readonly<Record<CareerAreaId, CareerArea>> = {
  SCA01: {
    id: "SCA01",
    name: { sv: "Bevakning och operativt skydd", en: "Guarding & Operational Protection" },
    description: {
      sv: "Operativ närvaro, bevakning, tillträdeskontroll, incidenthantering och skydd av människor, egendom och verksamhet.",
      en: "Operational presence, guarding, access control, incident response and protection of people, property and operations.",
    },
    targets: {
      CID01: 8,
      CID02: 4,
      CID03: 5,
      CID04: 4,
      CID05: 3,
      CID06: 8,
      CID07: 7,
      CID08: 7,
      CID09: 7,
      CID10: 4,
      CID11: 7,
      CID12: 7,
      CID13: 7,
      CID14: 6,
      CID15: 9,
      CID16: 8,
    },
  },
  SCA02: {
    id: "SCA02",
    name: {
      sv: "Ordningshållning, försvar och samhällsskydd",
      en: "Public Order, Defence & Public Safety",
    },
    description: {
      sv: "Roller inom ordningshållning, myndighetsutövning, försvar, beredskap och samhällsskydd.",
      en: "Roles in public order, authority-based work, defence, preparedness and public safety.",
    },
    targets: {
      CID01: 9,
      CID02: 5,
      CID03: 6,
      CID04: 3,
      CID05: 4,
      CID06: 9,
      CID07: 8,
      CID08: 5,
      CID09: 9,
      CID10: 5,
      CID11: 7,
      CID12: 9,
      CID13: 8,
      CID14: 7,
      CID15: 9,
      CID16: 9,
    },
  },
  SCA03: {
    id: "SCA03",
    name: {
      sv: "Säkerhetsteknik och fysisk säkerhet",
      en: "Security Technology & Physical Security",
    },
    description: {
      sv: "Tekniska säkerhetssystem, fysisk säkerhetsdesign, installation, integration, drift och projektledning.",
      en: "Security systems, physical security design, installation, integration, operations and project management.",
    },
    targets: {
      CID01: 6,
      CID02: 4,
      CID03: 8,
      CID04: 9,
      CID05: 5,
      CID06: 8,
      CID07: 6,
      CID08: 6,
      CID09: 3,
      CID10: 5,
      CID11: 9,
      CID12: 7,
      CID13: 7,
      CID14: 9,
      CID15: 8,
      CID16: 7,
    },
  },
  SCA04: {
    id: "SCA04",
    name: { sv: "Säkerhetsledning och samordning", en: "Security Leadership & Coordination" },
    description: {
      sv: "Samordning, styrning, ledarskap, säkerhetsprogram, budget, leverantörer och organisationsövergripande ansvar.",
      en: "Coordination, governance, leadership, security programmes, budgets, suppliers and enterprise responsibility.",
    },
    targets: {
      CID01: 5,
      CID02: 9,
      CID03: 8,
      CID04: 6,
      CID05: 9,
      CID06: 9,
      CID07: 9,
      CID08: 6,
      CID09: 7,
      CID10: 5,
      CID11: 9,
      CID12: 8,
      CID13: 9,
      CID14: 8,
      CID15: 9,
      CID16: 8,
    },
  },
  SCA05: {
    id: "SCA05",
    name: {
      sv: "Risk, krisberedskap och kontinuitet",
      en: "Risk, Crisis Preparedness & Resilience",
    },
    description: {
      sv: "Riskhantering, krisberedskap, kontinuitetsplanering, övning och organisatorisk motståndskraft.",
      en: "Risk management, crisis preparedness, business continuity, exercises and organisational resilience.",
    },
    targets: {
      CID01: 5,
      CID02: 7,
      CID03: 9,
      CID04: 6,
      CID05: 9,
      CID06: 9,
      CID07: 9,
      CID08: 5,
      CID09: 6,
      CID10: 6,
      CID11: 9,
      CID12: 8,
      CID13: 9,
      CID14: 9,
      CID15: 9,
      CID16: 9,
    },
  },
  SCA06: {
    id: "SCA06",
    name: {
      sv: "Utredning, underrättelse och analys",
      en: "Investigations, Intelligence & Analysis",
    },
    description: {
      sv: "Utredning, informationsinhämtning, underrättelse, OSINT, analys och brottsförebyggande arbete.",
      en: "Investigations, information collection, intelligence, OSINT, analysis and crime prevention.",
    },
    targets: {
      CID01: 4,
      CID02: 5,
      CID03: 10,
      CID04: 6,
      CID05: 7,
      CID06: 8,
      CID07: 8,
      CID08: 4,
      CID09: 5,
      CID10: 10,
      CID11: 10,
      CID12: 8,
      CID13: 7,
      CID14: 9,
      CID15: 10,
      CID16: 8,
    },
  },
  SCA07: {
    id: "SCA07",
    name: {
      sv: "Finansiell brottsprevention och regelefterlevnad",
      en: "Financial Crime Prevention & Compliance",
    },
    description: {
      sv: "KYC, AML, bedrägeri, transaktionsövervakning, regelefterlevnad och finansiell riskanalys.",
      en: "KYC, AML, fraud, transaction monitoring, compliance and financial risk analysis.",
    },
    targets: {
      CID01: 3,
      CID02: 5,
      CID03: 10,
      CID04: 7,
      CID05: 7,
      CID06: 10,
      CID07: 7,
      CID08: 4,
      CID09: 4,
      CID10: 10,
      CID11: 10,
      CID12: 8,
      CID13: 7,
      CID14: 9,
      CID15: 10,
      CID16: 8,
    },
  },
  SCA08: {
    id: "SCA08",
    name: {
      sv: "Datacenter och kritisk infrastruktur",
      en: "Data Centres & Critical Infrastructure",
    },
    description: {
      sv: "Skydd av datacenter, energianläggningar, transporter och annan samhällsviktig eller kritisk verksamhet.",
      en: "Protection of data centres, energy, transport and other essential or critical operations.",
    },
    targets: {
      CID01: 7,
      CID02: 6,
      CID03: 8,
      CID04: 8,
      CID05: 6,
      CID06: 10,
      CID07: 7,
      CID08: 5,
      CID09: 5,
      CID10: 6,
      CID11: 10,
      CID12: 8,
      CID13: 9,
      CID14: 9,
      CID15: 10,
      CID16: 9,
    },
  },
  SCA09: {
    id: "SCA09",
    name: { sv: "Cyber- och informationssäkerhet", en: "Cyber & Information Security" },
    description: {
      sv: "SOC, informationssäkerhet, GRC, incidenthantering, säkerhetsteknik och cyberrisk.",
      en: "SOC, information security, GRC, incident response, security engineering and cyber risk.",
    },
    targets: {
      CID01: 4,
      CID02: 5,
      CID03: 10,
      CID04: 10,
      CID05: 7,
      CID06: 9,
      CID07: 7,
      CID08: 4,
      CID09: 3,
      CID10: 9,
      CID11: 9,
      CID12: 8,
      CID13: 8,
      CID14: 10,
      CID15: 10,
      CID16: 8,
    },
  },
  SCA10: {
    id: "SCA10",
    name: {
      sv: "Säkerhetsrådgivning och specialiststöd",
      en: "Security Advisory & Specialist Services",
    },
    description: {
      sv: "Konsultstöd, säkerhetsskydd, resesäkerhet, utbildning, specialiststöd och interimslösningar.",
      en: "Consulting, protective security, travel security, training, specialist support and interim solutions.",
    },
    targets: {
      CID01: 5,
      CID02: 8,
      CID03: 9,
      CID04: 7,
      CID05: 9,
      CID06: 8,
      CID07: 10,
      CID08: 7,
      CID09: 7,
      CID10: 8,
      CID11: 9,
      CID12: 9,
      CID13: 9,
      CID14: 10,
      CID15: 10,
      CID16: 8,
    },
  },
};

/** Minimum share of scored dimensions that must be observed before an area
 *  may be ranked at all. Versioned configuration, provisional until pilot. */
export const AREA_MIN_COVERAGE = 0.6;

/** Minimum separation between consecutive areas before they are presented as
 *  a group rather than a ranking. Provisional. */
export const AREA_MIN_SEPARATION = 3;

export interface AreaScore {
  readonly areaId: CareerAreaId;
  /** 0-100 fit. Internal: the candidate sees a band, never a number
   *  (matching rule PMR006). */
  readonly score: number;
  readonly rank: number;
  /** Dimensions where the candidate sits at or above the area's target, most
   *  aligned first. The report's "why this area" evidence. */
  readonly alignedDimensions: readonly DimensionId[];
  /** Share of scored dimensions actually observed for this candidate. */
  readonly coverage: number;
}

export interface AreaResult {
  /** Ranked areas, or empty when coverage was too thin to rank honestly. */
  readonly ranked: readonly AreaScore[];
  /** True when the top areas are too close to separate; the report then
   *  presents them together rather than implying an order that isn't there. */
  readonly grouped: boolean;
  readonly sufficientEvidence: boolean;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Rank the ten Career Areas against a candidate's dimension scores.
 *
 * Pure. CID15 is excluded because it carries matchingWeight 0 (owner
 * decision A-4), so this reads MATCHABLE_DIMENSION_IDS rather than hardcoding
 * an exception it would be easy to forget.
 */
export function rankCareerAreas(dims: DimensionResult): AreaResult {
  const observed = MATCHABLE_DIMENSION_IDS.filter((d) => dims.dimensions[d].score !== null);
  const coverage = observed.length / MATCHABLE_DIMENSION_IDS.length;

  if (coverage < AREA_MIN_COVERAGE) {
    return { ranked: [], grouped: false, sufficientEvidence: false };
  }

  const scored = CAREER_AREA_IDS.map((areaId) => {
    const area = CAREER_AREAS[areaId];
    let penalty = 0;
    const aligned: { dimension: DimensionId; margin: number }[] = [];

    for (const d of observed) {
      const target = area.targets[d] / 10;
      const actual = dims.dimensions[d].score!;
      if (actual >= target) {
        aligned.push({ dimension: d, margin: actual - target });
      } else {
        // Only shortfalls count. Exceeding a target is never a penalty.
        penalty += target - actual;
      }
    }

    return {
      areaId,
      score: round1(Math.max(0, 100 * (1 - penalty / observed.length))),
      rank: 0,
      alignedDimensions: aligned
        .sort((a, b) => b.margin - a.margin || a.dimension.localeCompare(b.dimension))
        .slice(0, 4)
        .map((a) => a.dimension),
      coverage: round1(coverage * 100) / 100,
    };
  });

  // Ties broken by area id so the ordering is deterministic.
  scored.sort((a, b) => b.score - a.score || a.areaId.localeCompare(b.areaId));
  const ranked = scored.map((s, i) => ({ ...s, rank: i + 1 }));

  return {
    ranked,
    grouped: ranked[0].score - ranked[1].score < AREA_MIN_SEPARATION,
    sufficientEvidence: true,
  };
}
