// Career Readiness — the deterministic rule set.
//
// ── WHY THIS IS RULES AND NOT A MODEL ──────────────────────────────────
//
// The temptation with "how ready is this person" is a learned score. The
// reason there is not one here is not caution about AI; it is that the
// product has to be able to answer "why does it say that" to a candidate
// who is about to make a decision about their life, and a number cannot.
// Every branch below is one sentence long and every input is either a
// catalogued fact (career level, regulated flag, a published graph edge) or
// something the candidate typed about themselves. Nothing is inferred from
// Career DNA, which is the one input that would make the answer circular:
// "you are ready for this because you would enjoy it" is not readiness.
//
// ── THE FOUR INPUTS, AND WHAT EACH MAY DECIDE ──────────────────────────
//
//   1. CAREER LEVEL DISTANCE   how far ahead the profession is
//   2. ADJACENCY               whether a real route connects the two
//   3. REGULATION              whether an authorisation stands in the way
//   4. PASSPORT EVIDENCE       whether (3) may be considered answered, and
//                              nothing else
//
// (1) and (2) are independent, and keeping them independent is what makes
// the Police Officer case come out right without a line of code mentioning
// police officers. An officer with eight years behind them sits at the
// senior baseline, so an entry-level technical-security profession is at or
// BELOW their level — distance alone would call that "explore now" and
// imply a lateral step they have no technical grounding for. Adjacency is
// what catches it: there is no published transition from policing into that
// profession and it is in a different career area, so it comes out as
// "development needed". The same officer's risk-and-crisis matches, which
// the graph DOES connect to policing, come out as a step they can actually
// take. Neither result is written down anywhere; both fall out of the graph.
//
// ── WHAT "NOT ENOUGH INFORMATION" PROTECTS ─────────────────────────────
//
// The failure this module exists to prevent is a report that says "we do
// not know your current situation" in one section and "your possible next
// step" in the next. So the unknown case is not a fallback reached when
// other rules fail — it is the FIRST rule, it covers every profession at
// once, and there is no branch after it that can produce path language.

import {
  READINESS_SECTION,
  READINESS_VERSION,
  type CareerJourney,
  type ComputeJourneyInput,
  type JourneyCareerStage,
  type JourneyEvidenceInput,
  type JourneyProfession,
  type JourneyProfileInput,
  type JourneyStageRank,
  type JourneyTargetInput,
  type ReadinessCategory,
  type ReadinessProvenance,
  type ReadinessReason,
} from "./types";
import type { CurrentStatus, YearsOfExperience } from "@/lib/security-career-profile/types";

const STAGE_RANK: Readonly<Record<JourneyCareerStage, JourneyStageRank>> = {
  entry: 0,
  developing: 1,
  senior: 2,
};

/**
 * The baseline a self-reported STATUS alone can support, used only when no
 * catalogued current profession is available.
 *
 * Deliberately conservative, and deliberately NOT a copy of Career
 * Discovery's own CANDIDATE_STAGE_BASELINE: that map is keyed on C1, an
 * owner-locked assessment item with five values that drives the adaptive
 * question path, and it is not this module's to reuse or to change. This
 * one is keyed on the canonical profile's six statuses and decides nothing
 * except how the JOURNEY talks about a person.
 *
 * `other` is absent on purpose. "Annat" tells us the person did not
 * recognise themselves in any option, which is information about the
 * options, not about their seniority — see hasUsableSituation.
 */
const STATUS_BASELINE: Readonly<Record<Exclude<CurrentStatus, "other">, JourneyStageRank>> = {
  new_to_industry: 0,
  student: 0,
  career_change: 0,
  working_in_industry: 0,
  changing_role: 1,
};

/** What a self-reported experience band can support ON ITS OWN — which is
 *  nothing, until a real catalogued profession is behind it. See
 *  resolveBaseline. */
const EXPERIENCE_RANK: Readonly<Record<YearsOfExperience, JourneyStageRank>> = {
  "<1": 0,
  "1-3": 0,
  "3-5": 1,
  "5-10": 1,
  "10+": 2,
};

/**
 * Is there enough here to say anything at all?
 *
 * A named current profession is enough by itself. A status is enough by
 * itself EXCEPT for `other`, which names no situation. Experience alone is
 * never enough: "8+ years" of unspecified work in an unspecified role
 * places nobody anywhere, and treating it as a baseline is exactly the kind
 * of confident guess this model is built to refuse.
 */
export function hasUsableSituation(profile: JourneyProfileInput | null): boolean {
  if (!profile) return false;
  if (profile.currentProfessionSlug !== null) return true;
  if (profile.currentProfessionOther !== null && profile.currentProfessionOther.trim() !== "")
    return true;
  return profile.currentStatus !== null && profile.currentStatus !== "other";
}

/**
 * Where the candidate stands, most concrete signal first.
 *
 *   1. Their own profession's catalogued career level — a real fact about a
 *      real role, and the only input strong enough to stand alone.
 *   2. Experience band, which may only push that level UP. A self-report is
 *      never allowed to demote somebody below the documented level of the
 *      job they actually hold.
 *   3. Status alone, when no catalogued profession is known.
 *
 * Mirrors the SHAPE of the approved Career Discovery baseline rule
 * deliberately, so the two never disagree about a person for structural
 * reasons — but it is a separate function over separate inputs, and
 * changing it cannot change a single affinity score.
 */
export function resolveBaseline(profile: JourneyProfileInput): JourneyStageRank {
  if (profile.currentProfessionStage !== null) {
    const profRank = STAGE_RANK[profile.currentProfessionStage];
    const expRank = profile.yearsOfExperience ? EXPERIENCE_RANK[profile.yearsOfExperience] : null;
    return expRank !== null ? (Math.max(profRank, expRank) as JourneyStageRank) : profRank;
  }
  if (profile.currentStatus !== null && profile.currentStatus !== "other") {
    return STATUS_BASELINE[profile.currentStatus];
  }
  return 0;
}

/** Verified evidence exists on this holder's Passport — of any kind. The
 *  Journey never learns which, and never asks whether it is the RIGHT
 *  credential for a given profession; see the note on
 *  `formal_pathway_required` below for why that limit is stated rather than
 *  papered over. */
function hasVerifiedEvidence(evidence: JourneyEvidenceInput | null): boolean {
  if (!evidence) return false;
  return evidence.verifiedCredentialCount > 0 || evidence.verifiedExperienceCount > 0;
}

function provenanceFor(
  profile: JourneyProfileInput | null,
  evidence: JourneyEvidenceInput | null,
): ReadinessProvenance {
  if (!hasUsableSituation(profile)) return "unknown";
  return hasVerifiedEvidence(evidence) ? "self_reported_with_verified_evidence" : "self_reported";
}

/**
 * Is this profession connected to where the candidate actually works?
 *
 * Three ways to be adjacent, in descending order of evidence:
 *
 *   * a PUBLISHED transition edge in the Career Intelligence Graph — an
 *     owner-reviewed statement that this move is a real one;
 *   * the same career area the candidate already works in;
 *   * the profession is an entry role and the candidate has no security
 *     profession yet, which is what "entry role" means.
 *
 * Nothing here is inferred from titles, keywords or similarity. A move the
 * graph has not been taught is not adjacent, and the honest consequence is
 * "development needed" rather than a route the product invented.
 */
function adjacency(
  target: JourneyTargetInput,
  profile: JourneyProfileInput,
  reachableCigSlugs: ReadonlySet<string>,
): ReadinessReason | null {
  if (target.cigProfessionSlug !== null && reachableCigSlugs.has(target.cigProfessionSlug)) {
    return "adjacent_via_published_transition";
  }
  if (
    profile.currentProfessionAreaId !== null &&
    profile.currentProfessionAreaId === target.careerAreaId
  ) {
    return "adjacent_within_current_career_area";
  }
  if (profile.currentProfessionSlug === null && target.entryRole) {
    return "entry_role_open_to_newcomers";
  }
  return null;
}

function classifyOne(
  target: JourneyTargetInput,
  profile: JourneyProfileInput,
  baseline: JourneyStageRank,
  reachableCigSlugs: ReadonlySet<string>,
  evidence: JourneyEvidenceInput | null,
): { category: ReadinessCategory; reasons: ReadinessReason[] } {
  const reasons: ReadinessReason[] = [];

  // ── REGULATION FIRST ──────────────────────────────────────────────
  //
  // A regulated profession is one a person may not simply take up, however
  // well it fits and however senior they are. Saying "explore now" about it
  // while they hold no authorisation would be the single most actionable
  // untruth this report could tell.
  //
  // The lift is narrow and its limit is stated rather than hidden: verified
  // Passport evidence removes the HEADLINE claim, because we can no longer
  // assert the pathway is unaddressed — but it never asserts the reverse.
  // We do not know whether the credential they hold is the one this
  // profession needs; matching a specific credential to a specific
  // profession's requirements is Passport/market-pack governance, not
  // readiness. So the regulated flag stays on the result either way and the
  // requirement is still surfaced under "what can help you get there".
  if (target.regulated && !hasVerifiedEvidence(evidence)) {
    reasons.push("regulated_without_verified_credential");
    return { category: "formal_pathway_required", reasons };
  }

  const distance = STAGE_RANK[target.careerStage] - baseline;
  const adjacent = adjacency(target, profile, reachableCigSlugs);

  if (distance >= 2) {
    reasons.push("stage_two_or_more_levels_ahead");
    if (adjacent) reasons.push(adjacent);
    return { category: "longer_term_direction", reasons };
  }

  reasons.push(distance <= 0 ? "stage_at_or_below_baseline" : "stage_one_level_ahead");

  if (!adjacent) {
    reasons.push("not_adjacent_to_current_work");
    return { category: "development_needed", reasons };
  }

  reasons.push(adjacent);
  return {
    category: distance <= 0 ? "explore_now" : "possible_next_step",
    reasons,
  };
}

/**
 * The whole Career Journey for one report view.
 *
 * Pure: same inputs, same output, no clock, no I/O, no randomness. The
 * order of `targets` is preserved exactly — this function has no opinion
 * about which profession fits best, because that opinion was already formed
 * by the assessment and frozen.
 */
export function computeCareerJourney(input: ComputeJourneyInput): CareerJourney {
  const { profile, targets, reachableCigSlugs, evidence } = input;
  const provenance = provenanceFor(profile, evidence);

  // ── THE UNKNOWN CASE, FIRST AND WHOLESALE ─────────────────────────
  //
  // Not a per-profession fallback: one branch, covering every profession,
  // placed before any rule that could produce path language. That is what
  // makes "we do not know your situation" and "your possible next step"
  // structurally unable to appear on the same page.
  if (!profile || !hasUsableSituation(profile)) {
    return {
      known: false,
      provenance,
      whereYouAreToday: null,
      professions: targets.map((t) => ({
        professionId: t.professionId,
        cigProfessionSlug: t.cigProfessionSlug,
        titleSv: t.titleSv,
        titleEn: t.titleEn,
        category: "not_enough_information" as const,
        section: READINESS_SECTION.not_enough_information,
        provenance,
        regulated: t.regulated,
        transitionDifficulty: t.transitionDifficulty,
        reasons: [profile ? "situation_unknown" : "no_professional_profile"] as ReadinessReason[],
      })),
      readinessVersion: READINESS_VERSION,
    };
  }

  const baseline = resolveBaseline(profile);
  const verified = hasVerifiedEvidence(evidence);

  const professions: JourneyProfession[] = targets.map((t) => {
    const { category, reasons } = classifyOne(t, profile, baseline, reachableCigSlugs, evidence);
    return {
      professionId: t.professionId,
      cigProfessionSlug: t.cigProfessionSlug,
      titleSv: t.titleSv,
      titleEn: t.titleEn,
      category,
      section: READINESS_SECTION[category],
      provenance,
      regulated: t.regulated,
      transitionDifficulty: t.transitionDifficulty,
      reasons: verified ? [...reasons, "verified_evidence_present"] : reasons,
    };
  });

  return {
    known: true,
    provenance,
    whereYouAreToday: {
      currentStatus: profile.currentStatus,
      professionTitleSv: profile.currentProfessionTitleSv,
      professionTitleEn: profile.currentProfessionTitleEn,
      professionOther: profile.currentProfessionOther,
      yearsOfExperience: profile.yearsOfExperience,
    },
    professions,
    readinessVersion: READINESS_VERSION,
  };
}
