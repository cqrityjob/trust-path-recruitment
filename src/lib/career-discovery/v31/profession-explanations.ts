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
import type { ProfessionMatch, ProfessionStage, RecommendationConfidence } from "./professions";
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
    // A saved snapshot's stage is checked like its confidence: an unknown
    // one gets the neutral sentence, never another stage's.
    stageSentence: isProfessionStage(match.stage)
      ? STAGE_SENTENCE[match.stage][locale]
      : STAGE_UNAVAILABLE_SENTENCE[locale],
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

// ── A SAVED STAGE IS DATA, TOO ─────────────────────────────────────────
//
// The same defect as the confidence word below, on the stage: a saved
// snapshot's `match.stage` is whatever the stored JSON says, and indexing
// STAGE_LABEL or STAGE_SENTENCE with a value they do not know — "future",
// `null`, nothing — threw during render and took down the Career Center hub,
// the report view and its staged tier cards.
//
// So every read of a SAVED stage goes through the check below, which accepts
// exactly the keys of STAGE_LABEL. An unknown stage is never mapped onto a
// known one: "explore now" would present a distant profession as something
// to start today, which is precisely what the stage badge exists to prevent.
// The entry itself is kept — profession, rank and rationale are the report's;
// only WHEN is unknown, and the surface says so.

/** Shown in place of the stage word when a saved report's entry has none
 *  this build knows. Neutral: it says the timing is unknown, not that the
 *  profession is near or far. */
export const STAGE_UNAVAILABLE_LABEL: Readonly<Record<Locale, string>> = {
  sv: "Tidsperspektiv saknas",
  en: "Timing unavailable",
};

/** The stage sentence for an entry whose stage is unknown. */
export const STAGE_UNAVAILABLE_SENTENCE: Readonly<Record<Locale, string>> = {
  sv: "Rapporten anger inte när det här yrket är realistiskt utifrån var du är i dag.",
  en: "The report does not say when this profession is realistic from where you are today.",
};

/** Whether `value` is one of the stages this build renders — an OWN key of
 *  STAGE_LABEL, so `"toString"` and friends are not. The one check every
 *  read of a saved report's stage uses. */
export function isProfessionStage(value: unknown): value is ProfessionStage {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(STAGE_LABEL, value);
}

/** A saved report's stage as this build can state it: the report's own
 *  stage when it is a known one, otherwise `null` ("unavailable"). */
export function readProfessionStage(value: unknown): ProfessionStage | null {
  return isProfessionStage(value) ? value : null;
}

/** The words to print for a stage: the approved label for a known value,
 *  exactly as before, and the neutral "unavailable" wording for anything
 *  else. Total — it cannot throw, whatever the saved report holds. */
export function professionStageLabel(value: unknown, locale: Locale): string {
  return isProfessionStage(value) ? STAGE_LABEL[value][locale] : STAGE_UNAVAILABLE_LABEL[locale];
}

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

// ── A SAVED REPORT IS DATA, NOT A TYPE ─────────────────────────────────
//
// A frozen snapshot is JSON read back from the database. Its type says
// `confidence` is one of the three words above; the row can say anything —
// "high" from an older or hand-edited snapshot, `null`, or nothing at all.
// Indexing the label map with such a value returned `undefined`, and reading
// `[locale]` off that threw during render: one unknown word took down the
// whole Career Center hub and the report view, not just its own badge.
//
// So every read of a SAVED confidence goes through the check below, which
// accepts exactly the keys of RECOMMENDATION_CONFIDENCE_LABEL — the list of
// valid values cannot drift from the list of labels. An unknown value is
// never mapped onto a known one: it is not "indicative" (a real, weaker
// claim the report did not make), and it is never a reason to drop the
// entry — the profession, its rank and its rationale are what the report
// said; only the strength word is missing, and the surface says so.

/** Shown in place of the confidence word when a saved report's entry has
 *  none this build knows. Neutral on purpose: it states that the strength
 *  word is unavailable — it is not the weakest word, and it is not a guess. */
export const RECOMMENDATION_CONFIDENCE_UNAVAILABLE_LABEL: Readonly<Record<Locale, string>> = {
  sv: "Bedömningsstyrka saknas",
  en: "Assessment confidence unavailable",
};

/** Whether `value` is one of the confidence words this build renders — an
 *  OWN key of RECOMMENDATION_CONFIDENCE_LABEL, so `"toString"` and friends
 *  are not. The one check every read of a saved report's confidence uses. */
export function isRecommendationConfidence(value: unknown): value is RecommendationConfidence {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(RECOMMENDATION_CONFIDENCE_LABEL, value)
  );
}

/** A saved report's confidence as this build can state it: the report's own
 *  word when it is a known one, otherwise `null` ("unavailable"). */
export function readRecommendationConfidence(value: unknown): RecommendationConfidence | null {
  return isRecommendationConfidence(value) ? value : null;
}

/** The words to print for a confidence: the approved label for a known value,
 *  exactly as before, and the neutral "unavailable" wording for anything
 *  else. Total — it cannot throw, whatever the saved report holds. */
export function recommendationConfidenceLabel(value: unknown, locale: Locale): string {
  return isRecommendationConfidence(value)
    ? RECOMMENDATION_CONFIDENCE_LABEL[value][locale]
    : RECOMMENDATION_CONFIDENCE_UNAVAILABLE_LABEL[locale];
}

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
