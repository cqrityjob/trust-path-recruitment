// Career Card — data shaping only. No rendering here; see
// components/career-discovery/v31/CareerCard.tsx for the SVG.
//
// ── WHAT A CARD IS ──────────────────────────────────────────────────────
//
// The shareable representation of the candidate's OWN Career Discovery
// result: their canonical Top 3, in the canonical order, with the three
// dimensions they actually scored highest on. It is not a profession
// picker, and it is not a second opinion about their career.
//
// ── THE ONE RULE (Execution Mandate §19, §22) ────────────────────────────
//
// A card is built FROM the frozen snapshot's `professions.ranked` — never a
// new calculation, never a profession the candidate was not actually
// recommended, and never a profession they chose from a list. `ranked` is
// the same array `RecommendedProfessions` renders in the report, so the card
// and the report cannot disagree about who is #1.
//
// Until 2026-08-29 the card took a single `ProfessionMatch` chosen from a
// picker in the creator modal ("Välj riktning"). That let a candidate build
// a card announcing a direction the engine had ranked third, which is a
// claim the result does not support — and it made the card the one surface
// that could contradict the report. The picker is gone; rank order is the
// card.
//
// ── NO PERCENTAGES, EVER ────────────────────────────────────────────────
//
// Every strength shown is either a qualitative label or the candidate's own
// normalized [0,1] dimension score — never a percentage, never an "overall
// rating", never anything that could be read as job fit, suitability,
// competence or employability. `fitScore` exists inside professions.ts for
// sorting and stays there (see that file's own "NO PERCENTAGES, EVER"
// section, and PMR006). The strength of each recommendation is carried by
// the approved `RecommendationConfidence` label — the SAME string the report
// prints — which is what a "match" means in this product.

import { DIMENSIONS, type DimensionId } from "./dimensions";
import type { RankedProfession } from "./professions";
import { RECOMMENDATION_CONFIDENCE_LABEL, STAGE_LABEL } from "./profession-explanations";
import type { Locale } from "./version";

/** Short, card-sized labels for the dimensions that can appear as a
 *  strength. A card is small; "Structure & Documentation" does not fit a
 *  chip. Every id here is a REAL v3.1 dimension name, shortened for layout,
 *  never renamed to mean something else. */
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

/** The only part of a stored dimension the card reads.
 *
 *  Structurally satisfied by the snapshot's own `StoredDimension`, which is
 *  what every production caller passes. Narrowing it to these three fields
 *  keeps the card from quietly growing a dependency on the rest of the
 *  snapshot, and lets the owner/dev preview harnesses feed a persona's raw
 *  scores without fabricating a whole snapshot around them. */
export interface CardDimensionScore {
  readonly id: DimensionId;
  readonly score: number | null;
  /** Whether this dimension contributed to matching under the scoring
   *  version in force at completion. False for CID15 (owner decision A-4). */
  readonly usedForMatching: boolean;
}

/** How many strengths the card names. Three is the brief, and it is also
 *  what fits: a fourth pushes the strengths line past the card edge on
 *  LinkedIn's 627px canvas. */
export const CARD_STRENGTH_COUNT = 3;

/** How many professions the card names. Mirrors the report's own ranked
 *  recommendation exactly — a card that showed four would be a different
 *  claim from the report's. */
export const CARD_RANK_COUNT = 3;

export interface CareerCardEntry {
  readonly rank: number;
  readonly professionId: string;
  readonly title: string;
  /** The approved qualitative claim for this rank — "Stark matchning" /
   *  "Strong match" / "Närmast dina svar". The card's answer to "how good a
   *  match", and deliberately not a number (see the file header). */
  readonly confidenceLabel: string;
  /** "Utforska nu" / "Möjligt nästa steg" / … — WHEN, not how strongly. */
  readonly stageLabel: string;
}

export interface CareerCardData {
  /** Rank 1 first. Always the canonical order; never re-sorted, never
   *  filtered, never chosen. */
  readonly entries: readonly CareerCardEntry[];
  /** The candidate's own strongest dimensions, most-first — short labels
   *  only, no scores printed. */
  readonly strengths: readonly string[];
  readonly firstName: string | null;
  // ── THE TRUST LINE ─────────────────────────────────────────────────
  //
  // One short, already-composed sentence, or null. Null is the normal case
  // and renders nothing: a candidate with nothing verified gets a card that
  // says nothing about verification, not a card that says they have none.
  //
  // Composed by `careerCardTrustLine` from the Passport's own counts. The
  // card never receives claims, periods, decisions, organisations or dates
  // -- §13: this is a shareable professional identity, not a mini Passport
  // ledger, and the way to keep it one is to give the renderer a string it
  // cannot decompose rather than a record it could start itemising.
  readonly trustLine: string | null;
  readonly locale: Locale;
  readonly definitionVersion: string;
  readonly generatedAt: string;
}

export interface BuildCareerCardInput {
  /** `professions.ranked` from the SAME frozen snapshot the report renders.
   *  Not `matches`, not `strongestDirections` — `ranked` is the always-present
   *  canonical top 3 and the only list that carries a stated `rank`. */
  readonly ranked: readonly RankedProfession[];
  /** `outputA.dimensions` from that same snapshot — the source of the
   *  strengths, never recomputed and never re-read from the live dimension
   *  module. */
  readonly dimensions: readonly CardDimensionScore[];
  readonly locale: Locale;
  readonly definitionVersion: string;
  readonly generatedAt: string;
  /** Explicit opt-in only (Execution Mandate §9/§26). May be prefilled from
   *  the account's own first name, and must always be removable. */
  readonly firstName?: string | null;
  /** From `careerCardTrustLine`. Absent on any caller that has no identity
   *  in hand, which renders a card with no trust line -- the pre-existing
   *  behaviour, and the safe one. */
  readonly trustLine?: string | null;
}

/**
 * The candidate's three strongest indicators, from their own frozen scores.
 *
 * Only dimensions that actually contributed to matching under the scoring
 * version in force at completion (`usedForMatching`, which is false for
 * CID15 by owner decision A-4) and that have a real score. Sorted by score,
 * ties broken by dimension id, so the same snapshot always yields the same
 * three in the same order — a card regenerated tomorrow is the card shared
 * today.
 *
 * Nothing is invented: a snapshot with fewer than three scored, matchable
 * dimensions returns fewer than three labels rather than padding the list.
 */
export function strongestIndicators(
  dimensions: readonly CardDimensionScore[],
  locale: Locale,
): string[] {
  return [...dimensions]
    .filter((d) => d.usedForMatching && d.score !== null)
    .sort((a, b) => (b.score as number) - (a.score as number) || a.id.localeCompare(b.id))
    .map((d) => SHORT_DIMENSION_LABEL[d.id]?.[locale] ?? DIMENSIONS[d.id].name[locale])
    .filter((label) => label.length > 0)
    .slice(0, CARD_STRENGTH_COUNT);
}

/**
 * Shape a frozen snapshot's ranked recommendation into card display data.
 *
 * Pure — no randomness, no clock read beyond what the caller supplies, and
 * no access to anything outside the snapshot it is given.
 */
export function buildCareerCardData(input: BuildCareerCardInput): CareerCardData {
  const { ranked, dimensions, locale, definitionVersion, generatedAt } = input;

  const entries: CareerCardEntry[] = ranked.slice(0, CARD_RANK_COUNT).map((r) => ({
    rank: r.rank,
    professionId: r.match.professionId,
    title: locale === "sv" ? r.match.titleSv : r.match.titleEn,
    confidenceLabel: RECOMMENDATION_CONFIDENCE_LABEL[r.confidence][locale],
    stageLabel: STAGE_LABEL[r.match.stage][locale],
  }));

  return {
    entries,
    strengths: strongestIndicators(dimensions, locale),
    firstName: input.firstName?.trim() ? input.firstName.trim().slice(0, 40) : null,
    trustLine: input.trustLine ?? null,
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

/* ------------------------------------------------------------------ */
/* The trust line                                                      */
/* ------------------------------------------------------------------ */

/**
 * The card's whole statement about verification, in one line — or null.
 *
 * ── WHAT IT MAY SAY, AND WHY SO LITTLE ─────────────────────────────────
 *
 * A Career Card is the most widely shared thing this product makes. It is
 * screenshotted, posted, and read by people who will never see the Passport
 * it came from and cannot click through to check anything. Everything on it
 * therefore has to be true with no context available to qualify it.
 *
 * So the line carries COUNTS and nothing else:
 *
 *   "2 verified credentials · Employment confirmed"
 *
 * It never names the verifying organisation, never names an employer, never
 * carries a date, a method, a decision or an id. Partly that is §20's data
 * minimisation — proving verification does not require publishing who the
 * candidate worked for. Mostly it is that a name on a shareable asset reads
 * as an endorsement by that name, and no employer confirming a start and end
 * date has endorsed anybody.
 *
 * ── AND WHAT IT MUST NOT IMPLY ─────────────────────────────────────────
 *
 * "Verified" here is a statement about an act of checking, never about where
 * a credential authorises work. There is deliberately no wording available
 * to this function that could read as "qualified", "licensed", "approved" or
 * valid in any particular market: a VU1 verified in Sweden says nothing
 * about Dubai, and the card has no room to explain the difference, so it
 * does not raise the subject. Jurisdiction is the Passport's to present,
 * where the relevance model and the space to be precise both exist.
 *
 * Returns null when nothing is verified AND when the counts could not be
 * read. A card that silently omits this line is the correct failure: it is
 * simply the card as it was before this line existed.
 */
export function careerCardTrustLine(
  summary: {
    readonly verifiedClaims: number;
    readonly employerConfirmedEmployment: number;
    readonly known: boolean;
  },
  locale: Locale,
): string | null {
  if (!summary.known) return null;

  const parts: string[] = [];

  if (summary.verifiedClaims > 0) {
    const n = summary.verifiedClaims;
    parts.push(
      locale === "sv"
        ? `${n} ${n === 1 ? "verifierat intyg" : "verifierade intyg"}`
        : `${n} ${n === 1 ? "verified credential" : "verified credentials"}`,
    );
  }

  if (summary.employerConfirmedEmployment > 0) {
    // Unnumbered on purpose. "1 employment confirmed" invites the reader to
    // wonder about the others; "Employment confirmed" states the fact that
    // an employer has confirmed employment, which is what is true and all
    // that a card of this size can defend.
    parts.push(locale === "sv" ? "Anställning bekräftad" : "Employment confirmed");
  }

  return parts.length > 0 ? parts.join(" · ") : null;
}
