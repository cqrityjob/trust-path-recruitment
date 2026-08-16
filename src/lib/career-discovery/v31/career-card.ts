// Career Card — data shaping only. No rendering here; see
// components/career-discovery/v31/CareerCard.tsx for the SVG.
//
// ── THE ONE RULE (Execution Mandate §19, §22) ────────────────────────────
//
// A card is built FROM a ProfessionMatch that already exists in the frozen
// snapshot's professions.matches — never a new calculation, never a
// profession the candidate was not actually recommended. And every
// indicator shown is either a qualitative label or a bar driven by the
// candidate's own normalized [0,1] dimension score — never a percentage,
// never an "overall rating", never anything that could be read as job
// fit, suitability, competence or employability.

import { DIMENSIONS, type DimensionId } from "./dimensions";
import type { ProfessionFitTier, ProfessionMatch, ProfessionStage } from "./professions";
import { STAGE_LABEL } from "./profession-explanations";
import type { Locale } from "./version";

/** Short, card-sized labels for the dimensions that actually appear as
 *  "aligned" evidence — a card is small; "Structure & Documentation" does
 *  not fit a chip. Every id here is a REAL v3.1 dimension name, shortened
 *  for layout, never renamed to mean something else. */
const SHORT_DIMENSION_LABEL: Readonly<Record<DimensionId, Record<Locale, string>>> = {
  CID01: { sv: "Operativ", en: "Operational" },
  CID02: { sv: "Ledarskap", en: "Leadership" },
  CID03: { sv: "Analytisk", en: "Analytical" },
  CID04: { sv: "Teknisk", en: "Technical" },
  CID05: { sv: "Strategisk", en: "Strategic" },
  CID06: { sv: "Riskmedveten", en: "Risk-aware" },
  CID07: { sv: "Kommunikation", en: "Communication" },
  CID08: { sv: "Service", en: "People" },
  CID09: { sv: "Konflikthantering", en: "Conflict handling" },
  CID10: { sv: "Utredande", en: "Investigation" },
  CID11: { sv: "Struktur", en: "Structure" },
  CID12: { sv: "Beslutsam", en: "Decisive" },
  CID13: { sv: "Samarbete", en: "Collaboration" },
  CID14: { sv: "Lärande", en: "Learning" },
  CID15: { sv: "", en: "" }, // never rendered — matchingWeight 0, owner decision A-4
  CID16: { sv: "Lugn under press", en: "Composure" },
  CID17: { sv: "Regelefterlevnad", en: "Compliance" },
};

export interface CareerCardIndicator {
  readonly dimensionId: DimensionId;
  readonly label: string;
  /** [0,1], the candidate's own normalized score — a bar width, never a
   *  printed number. */
  readonly value: number;
}

export interface CareerCardData {
  readonly professionTitle: string;
  readonly stageLabel: string;
  readonly stage: ProfessionStage;
  readonly fitTier: ProfessionFitTier;
  /** "One of my career directions" framing text — see buildCareerCardData. */
  readonly framingLine: string;
  readonly indicators: readonly CareerCardIndicator[];
  readonly firstName: string | null;
  readonly locale: Locale;
  readonly definitionVersion: string;
  readonly generatedAt: string;
}

export interface BuildCareerCardInput {
  readonly match: ProfessionMatch;
  /** outputA.dimensions from the SAME frozen snapshot the match came from —
   *  the source of the bar values, never recomputed. */
  readonly dimensionScores: Readonly<Record<DimensionId, number | null>>;
  readonly locale: Locale;
  readonly definitionVersion: string;
  readonly generatedAt: string;
  /** Explicit opt-in only (Execution Mandate §9/§26) — never defaulted from
   *  an account name. */
  readonly firstName?: string | null;
  /** Explicit opt-in (Execution Mandate §16) — off shows stage + title only. */
  readonly showIndicators?: boolean;
}

const FRAMING_LINE: Readonly<Record<Locale, string>> = {
  sv: "En av mina karriärriktningar",
  en: "One of my career directions",
};

/**
 * Shapes a ProfessionMatch (already computed, already in the frozen
 * snapshot) into card display data. Pure — no randomness, no clock read
 * beyond what the caller supplies.
 */
export function buildCareerCardData(input: BuildCareerCardInput): CareerCardData {
  const { match, dimensionScores, locale, definitionVersion, generatedAt } = input;
  const showIndicators = input.showIndicators ?? true;

  const indicators: CareerCardIndicator[] = showIndicators
    ? match.alignedDimensions
        .filter((id) => id !== "CID15")
        .map((id) => {
          const value = dimensionScores[id];
          return {
            dimensionId: id,
            label: SHORT_DIMENSION_LABEL[id][locale],
            value: value ?? 0,
          };
        })
        .filter((i) => i.label.length > 0)
        .slice(0, 4)
    : [];

  return {
    professionTitle: locale === "sv" ? match.titleSv : match.titleEn,
    stageLabel: STAGE_LABEL[match.stage][locale],
    stage: match.stage,
    fitTier: match.fitTier,
    framingLine: FRAMING_LINE[locale],
    indicators,
    firstName: input.firstName?.trim() ? input.firstName.trim().slice(0, 40) : null,
    locale,
    definitionVersion,
    generatedAt,
  };
}

export type CareerCardFormat = "story" | "square" | "linkedin";

export const CARD_DIMENSIONS: Readonly<
  Record<CareerCardFormat, { width: number; height: number }>
> = {
  story: { width: 1080, height: 1920 },
  square: { width: 1080, height: 1080 },
  linkedin: { width: 1200, height: 627 },
};

export const DISCOVER_URL_PATH = "/security-career-assessment";
