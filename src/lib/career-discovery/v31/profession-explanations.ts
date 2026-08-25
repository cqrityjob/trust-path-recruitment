// "Why this direction" — turns a ProfessionMatch's structured reason codes
// into candidate-facing sentences, in both locales.
//
// Pure. No I/O, no lookups outside this module and ./dimensions. Two layers:
//
//   1. The profession's own inclusionRationale (authored per profession,
//      already written in the "your answers show..." register the mandate's
//      §9 example uses) — the STATIC layer, frozen with the profession.
//   2. A STAGE sentence, derived from ProfessionMatch.stage — dynamic,
//      because the same profession is "explore now" for one candidate and
//      "longer-term" for another, and the reason for that gap (career stage,
//      not fit) needs to be said, not left implicit.
//
// Never exposes a weight, a score or a percentage — only dimension NAMES
// (already resolved strings in the candidate's locale) and qualitative
// stage/fit language, exactly as StoredArea.alignedWith already does for
// Career Areas.

import { DIMENSIONS, type DimensionId } from "./dimensions";
import type {
  ProfessionMatch,
  ProfessionStage,
  RecommendationConfidence,
} from "./professions";
import type { Locale } from "./version";

const STAGE_SENTENCE: Readonly<Record<ProfessionStage, Record<Locale, string>>> = {
  explore_now: {
    sv: "Det här är en riktning du kan börja utforska direkt.",
    en: "This is a direction you can start exploring right away.",
  },
  possible_next_step: {
    sv: "Det här är en möjlig nästa steg utifrån var du är idag — inte något att hoppa rakt in i, men värt att ha som mål.",
    en: "This is a possible next step from where you are today — not something to jump straight into, but worth having as a goal.",
  },
  longer_term: {
    sv: "Det här är en längre sikt-riktning. Den passar din profil, men vägen dit går normalt via mer erfarenhet eller andra roller först.",
    en: "This is a longer-term direction. It fits your profile, but the path there normally runs through more experience or other roles first.",
  },
  career_pivot: {
    sv: "Det här visar en verklig koppling till din profil, men det är inte nästa steg utifrån var du är idag -- snarare en annan riktning värd att ha i åtanke om du någon gång vill byta spår.",
    en: "This shows a genuine affinity with your profile, but it isn't the natural next step from where you are today -- more an alternative direction, worth knowing about if you ever want to change track.",
  },
};

const ALIGNED_INTRO: Readonly<Record<Locale, string>> = {
  sv: "Det som sticker ut mest i dina svar:",
  en: "What stands out most in your answers:",
};

/** Master Completion Mandate item 6: shown only when
 *  ProfessionMatch.contextCorroborated is true — the candidate's own
 *  Discovery Path answers (contextual self-report) also point toward this
 *  direction. Deliberately generic (no per-tag wording) so it stays true
 *  regardless of which specific tag corroborated it, and deliberately
 *  modest — "also" corroborating evidence, not a claim of its own. */
const CONTEXT_CORROBORATION_SENTENCE: Readonly<Record<Locale, string>> = {
  sv: "Dina svar om vad du hoppas jobba med pekar också mot den här typen av riktning.",
  en: "What you said you're hoping to work toward also points toward this kind of direction.",
};

export interface ProfessionExplanation {
  /** The authored, per-profession "why" text — unchanged from the profile. */
  readonly rationale: string;
  /** One sentence explaining the stage label itself. */
  readonly stageSentence: string;
  /** Dimension names the candidate aligned most strongly with, resolved to
   *  display strings — never ids, never scores. */
  readonly alignedDimensionNames: readonly string[];
  readonly alignedIntro: string;
  /** The optional caveat authored with the profession, if any. */
  readonly limitationNote: string | null;
  /** Set only when the candidate's Discovery Path answers corroborate this
   *  direction (see contextCorroborated). Explanation-only — never implies
   *  a different fit or stage. */
  readonly contextCorroborationSentence: string | null;
}

export function explainMatch(match: ProfessionMatch, locale: Locale): ProfessionExplanation {
  return {
    rationale: locale === "sv" ? match.inclusionRationaleSv : match.inclusionRationaleEn,
    stageSentence: STAGE_SENTENCE[match.stage][locale],
    alignedDimensionNames: match.alignedDimensions.map(
      (d: DimensionId) => DIMENSIONS[d].name[locale],
    ),
    alignedIntro: ALIGNED_INTRO[locale],
    contextCorroborationSentence: match.contextCorroborated
      ? CONTEXT_CORROBORATION_SENTENCE[locale]
      : null,
    limitationNote: (locale === "sv" ? match.limitationNoteSv : match.limitationNoteEn) ?? null,
  };
}

export const STAGE_LABEL: Readonly<Record<ProfessionStage, Record<Locale, string>>> = {
  explore_now: { sv: "Utforska nu", en: "Explore now" },
  possible_next_step: { sv: "Möjligt nästa steg", en: "Possible next step" },
  longer_term: { sv: "Långsiktig riktning", en: "Longer-term direction" },
  career_pivot: { sv: "Alternativ riktning", en: "Alternative direction" },
};

export const FIT_LABEL: Readonly<Record<"strong" | "moderate", Record<Locale, string>>> = {
  strong: { sv: "Stark matchning", en: "Strong match" },
  moderate: { sv: "Värd att utforska", en: "Worth exploring" },
};

/** The word attached to one entry of the always-present recommendation.
 *
 *  "strong" / "moderate" are FIT_LABEL's own words, because such an entry
 *  cleared the same gates a tier card clears and has earned the same claim.
 *  "indicative" deliberately does NOT reuse them: that entry is the closest
 *  profession to these answers out of the calibrated catalogue, which is a
 *  statement about ORDER and not about fit. Saying "worth exploring" there
 *  would quietly promote an ordering into a match. See
 *  professions.ts's RankedProfession. */
export const RECOMMENDATION_CONFIDENCE_LABEL: Readonly<
  Record<RecommendationConfidence, Record<Locale, string>>
> = {
  strong: FIT_LABEL.strong,
  moderate: FIT_LABEL.moderate,
  indicative: { sv: "Närmast dina svar", en: "Closest to your answers" },
};

export const TIER_HEADING: Readonly<
  Record<"strongest" | "alsoWorth" | "longerTerm" | "careerPivot", Record<Locale, string>>
> = {
  strongest: {
    sv: "Dina starkaste riktningar att utforska",
    en: "Your strongest directions to explore",
  },
  alsoWorth: { sv: "Också värt att utforska", en: "Also worth exploring" },
  longerTerm: { sv: "Långsiktiga möjligheter", en: "Longer-term possibilities" },
  careerPivot: { sv: "Alternativa riktningar", en: "Alternative directions" },
};
