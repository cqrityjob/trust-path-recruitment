// Career Journey — the interpretation layer that sits BETWEEN a frozen
// Career Discovery result and the candidate's live professional situation.
//
// ── THE BOUNDARY THIS FILE EXISTS TO HOLD ──────────────────────────────
//
// Four products answer four different questions, and the moment they are
// collapsed into one number the product can no longer say which of them it
// is talking about:
//
//   CAREER DNA          "What kinds of security work fit how I think?"
//   PROFESSIONAL PROFILE "Where am I in my career today?"
//   SECURITY PASSPORT   "What parts of my background have evidence?"
//   CAREER INTELLIGENCE "What paths connect the two?"
//
// Career Journey is the PRESENTATION of the last question. It reads the
// first three; it writes none of them. Specifically:
//
//   * Nothing here is an input to dimension scoring, profession affinity,
//     fit tiers or the Top 3 ranking. Those arrive already frozen, in the
//     order the stored snapshot put them in, and this layer re-buckets that
//     same list without ever re-ordering it.
//   * Passport evidence never raises a readiness category. It can only
//     LIFT a "formal pathway required" claim we would otherwise have to
//     make, and it sets a provenance label. An unverified candidate is
//     never told they are further along than they are; a verified one is
//     never told they are further along than the graph says.
//   * A candidate whose current situation is unknown gets
//     "not_enough_information" for every profession. There is no path
//     through this module that produces "possible next step" while the
//     product is simultaneously saying it does not know where the person
//     stands.
//
// ── WHY NOTHING HERE IS STORED ─────────────────────────────────────────
//
// A Career Discovery report is immutable. A professional profile is not —
// it is the one thing about a candidate that is SUPPOSED to change. If the
// journey were frozen into the snapshot alongside the affinity, then either
// the report would go stale the day someone changed jobs, or updating a
// profile would rewrite history. Computing it at read time is what lets the
// same frozen Career DNA produce a different, honest journey six months
// later without a single stored byte changing.

import type { CurrentStatus, YearsOfExperience } from "@/lib/security-career-profile/types";

/** The profession career levels the Layer 4 catalogue authors. Mirrors
 *  cd_professions.career_stage; declared here rather than imported so the
 *  pure engine has no dependency on the scoring module it must never
 *  influence. */
export type JourneyCareerStage = "entry" | "developing" | "senior";

/** 0 = entry, 1 = developing, 2 = senior. */
export type JourneyStageRank = 0 | 1 | 2;

/**
 * The MVP readiness vocabulary. CATEGORIES, never percentages.
 *
 * A percentage would be a fabricated precision: there is no governed
 * definition of "72% ready" for any profession in this catalogue, and the
 * inputs (a coarse experience band, a catalogued career level, a graph edge
 * that either exists or does not) cannot support one. Each of these words,
 * by contrast, is defensible from the inputs that produced it.
 */
export type ReadinessCategory =
  /** Stage-compatible AND adjacent: the candidate could look at this today. */
  | "explore_now"
  /** One career level ahead, along a real transition or within the area the
   *  candidate already works in. */
  | "possible_next_step"
  /** Stage-compatible or one level ahead, but NOT adjacent — a different
   *  part of the industry, with no published route from where they are.
   *  Real affinity; unproven ground. */
  | "development_needed"
  /** Two or more career levels ahead. */
  | "longer_term_direction"
  /** A regulated profession the candidate has no verified credential for.
   *  Outranks every category above: no amount of fit substitutes for an
   *  authorisation. */
  | "formal_pathway_required"
  /** We do not know enough about this person's situation to say anything.
   *  The honest floor of the whole model. */
  | "not_enough_information";

/** Which of the report's Career Journey sections a category renders in.
 *  Presentation only — the category is the claim. */
export const READINESS_SECTION: Readonly<Record<ReadinessCategory, JourneySectionId>> = {
  explore_now: "explore_now",
  possible_next_step: "possible_next_steps",
  development_needed: "possible_next_steps",
  longer_term_direction: "longer_term",
  formal_pathway_required: "longer_term",
  not_enough_information: "unknown",
};

export type JourneySectionId = "explore_now" | "possible_next_steps" | "longer_term" | "unknown";

/**
 * Where a readiness statement's supporting information came from.
 *
 * This is the entire Passport integration surface, and it is deliberately a
 * LABEL rather than a score. "Supported by verified Passport information"
 * tells a candidate something true and useful; folding verification into a
 * number would let it silently substitute for the evidence it is supposed
 * to point at.
 */
export type ReadinessProvenance =
  /** Everything behind this statement is the candidate's own self-report. */
  | "self_reported"
  /** Self-report, plus at least one verified Passport credential or
   *  verified experience period exists on this holder's Passport. The
   *  Journey never says WHICH — that is the Passport's to disclose. */
  | "self_reported_with_verified_evidence"
  /** No professional profile at all. */
  | "unknown";

/** What the engine is told about the candidate. Every field is
 *  self-reported and the type says so — there is no field here that a
 *  Passport verification could fill. */
export interface JourneyProfileInput {
  readonly currentStatus: CurrentStatus | null;
  readonly currentProfessionSlug: string | null;
  /** The catalogue's own display titles for `currentProfessionSlug`,
   *  resolved by the caller. Null when the slug does not resolve - the
   *  Journey renders the free text or nothing rather than a raw slug. */
  readonly currentProfessionTitleSv: string | null;
  readonly currentProfessionTitleEn: string | null;
  readonly currentProfessionOther: string | null;
  readonly yearsOfExperience: YearsOfExperience | null;
  /** The catalogued career level of `currentProfessionSlug`, when that slug
   *  resolves to a real Layer 4 profession. Null when it does not — an
   *  unrecognised or free-text profession must not be assigned a level. */
  readonly currentProfessionStage: JourneyCareerStage | null;
  /** The career area of `currentProfessionSlug`, for adjacency. */
  readonly currentProfessionAreaId: string | null;
}

/** One profession the journey has an opinion about. Carried in the ORDER
 *  the frozen snapshot ranked it — this engine never sorts. */
export interface JourneyTargetInput {
  readonly professionId: string;
  readonly cigProfessionSlug: string | null;
  readonly careerAreaId: string;
  readonly titleSv: string;
  readonly titleEn: string;
  readonly careerStage: JourneyCareerStage;
  readonly entryRole: boolean;
  readonly regulated: boolean;
  /** 1-10 from the Career Intelligence Graph, or null when unassessed.
   *  Reported, never arithmetically combined with anything. */
  readonly transitionDifficulty: number | null;
}

/** The Passport's contribution: counts and nothing else.
 *
 *  No titles, no issuers, no dates, no identifiers. The Journey needs to
 *  know THAT evidence exists, never what it says — anything more would put
 *  Passport content on a surface that is not a disclosure. */
export interface JourneyEvidenceInput {
  readonly hasPassport: boolean;
  readonly verifiedCredentialCount: number;
  readonly verifiedExperienceCount: number;
  /**
   * Employment periods on record, verified or not.
   *
   * ── WHY AN UNVERIFIED COUNT EARNS ITS PLACE HERE ───────────────────
   *
   * Every other number in this object is about VERIFICATION, and this one
   * deliberately is not. The pilot found the Journey telling a holder it
   * did not know enough about their background while that holder had a
   * dated employment history, a work country and credentials sitting in
   * their Passport. The claim was false, and it was false because the only
   * thing the Journey ever asked about a background was whether the
   * canonical profile's `current_status` was filled in.
   *
   * A recorded employment is somebody stating where they have worked. That
   * is knowledge of their background. It is not, and must not become,
   * evidence of a career LEVEL: `resolveBaseline` still refuses to place
   * anybody from it, so knowing this cannot promote a readiness category.
   * It answers one question only — "do we know anything about this
   * person's working life" — which is the question the false sentence was
   * an answer to.
   */
  readonly recordedExperienceCount: number;
  /** The holder's stated work country, where they have given one. Presence
   *  only; the code itself is never rendered from here. */
  readonly hasWorkCountry: boolean;
}

export interface ComputeJourneyInput {
  readonly profile: JourneyProfileInput | null;
  readonly targets: readonly JourneyTargetInput[];
  /** cig_professions slugs reachable from the candidate's current
   *  profession by a PUBLISHED cig_career_transitions edge. Empty when the
   *  current profession is unknown or has no published edges — never
   *  guessed. */
  readonly reachableCigSlugs: ReadonlySet<string>;
  readonly evidence: JourneyEvidenceInput | null;
}

/** One profession's journey verdict. */
export interface JourneyProfession {
  readonly professionId: string;
  readonly cigProfessionSlug: string | null;
  readonly titleSv: string;
  readonly titleEn: string;
  readonly category: ReadinessCategory;
  readonly section: JourneySectionId;
  readonly provenance: ReadinessProvenance;
  /** True when this profession is regulated. Surfaced in "what can help you
   *  get there" even when it did not trigger formal_pathway_required. */
  readonly regulated: boolean;
  readonly transitionDifficulty: number | null;
  /** The machine-readable reasons behind `category`, in the order the rules
   *  fired. The renderer turns these into sentences; the engine never
   *  produces prose. */
  readonly reasons: readonly ReadinessReason[];
}

export type ReadinessReason =
  | "no_professional_profile"
  | "situation_unknown"
  | "regulated_without_verified_credential"
  | "stage_at_or_below_baseline"
  | "stage_one_level_ahead"
  | "stage_two_or_more_levels_ahead"
  | "adjacent_via_published_transition"
  | "adjacent_within_current_career_area"
  | "entry_role_open_to_newcomers"
  | "not_adjacent_to_current_work"
  | "verified_evidence_present"
  /** The canonical profile named no situation, but the Passport records a
   *  working history. The journey proceeds from the conservative baseline
   *  rather than declaring the person unknown. */
  | "background_known_from_passport";

/** The whole Career Journey for one report view. */
export interface CareerJourney {
  /** False when there is no usable professional profile. The renderer must
   *  show "we do not know enough" rather than any path language. */
  readonly known: boolean;
  readonly provenance: ReadinessProvenance;
  /** "Where you are today", already resolved for display, or null. */
  readonly whereYouAreToday: {
    readonly currentStatus: CurrentStatus | null;
    readonly professionTitleSv: string | null;
    readonly professionTitleEn: string | null;
    /** Set only when the profession is free text the catalogue does not
     *  know. Never joined to the canonical vocabulary. */
    readonly professionOther: string | null;
    readonly yearsOfExperience: YearsOfExperience | null;
  } | null;
  /** Every ranked profession, in the frozen snapshot's own order. */
  readonly professions: readonly JourneyProfession[];
  /** The version of the readiness rules that produced this. Bumped when a
   *  rule changes, so a screenshot can be explained later. */
  readonly readinessVersion: typeof READINESS_VERSION;
}

export const READINESS_VERSION = "journey-readiness-v2" as const;
