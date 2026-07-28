// Security Career Discovery v3.0 — instrument types.
//
// This namespace holds the *versioned instrument definition* for the
// candidate-facing Security Career Discovery product ("Din karriär inom
// säkerhet"). It is deliberately separate from src/lib/career-assessment/
// and src/lib/career-intelligence-engine/, which implement the live,
// frozen v2.1 `public-career-assessment` and must not be touched by it.
//
// Construct vocabulary comes from
// docs/architecture/adr-career-discovery-construct-model.md: Career
// Orientation axes (CDA-01…CDA-08) measure career direction and fit, and
// are NOT the Security Competency Core (SCC-01…SCC-12) constructs, which
// measure occupational competence for the employer product.

import type { Bi } from "@/lib/career-center/types";

export type { Bi };

// -------------------------------------------------------------------------
// Constructs
// -------------------------------------------------------------------------

/** The eight bipolar Career Orientation axes. Both ends of every axis are
 *  legitimate professional orientations — never a scale from worse to
 *  better. See docs/assessment/career-discovery/security-career-dna-model-v3.0.md §3. */
export type CareerOrientationAxisId =
  | "CDA-01"
  | "CDA-02"
  | "CDA-03"
  | "CDA-04"
  | "CDA-05"
  | "CDA-06"
  | "CDA-07"
  | "CDA-08";

/** The four Behavioural Signals. These frame report *language* only. They
 *  never enter matching, never gate, never rank, never exclude. */
export type BehaviouralSignalId = "BS-1" | "BS-2" | "BS-3" | "BS-4";

export interface CareerOrientationAxis {
  id: CareerOrientationAxisId;
  /** Stable machine key, locale-independent. */
  key: string;
  name: Bi;
  lowEnd: Bi;
  highEnd: Bi;
  /** Recorded so report language can never imply a hierarchy on the axis. */
  neverMeans: Bi;
}

export interface BehaviouralSignal {
  id: BehaviouralSignalId;
  key: string;
  name: Bi;
  observes: Bi;
  reportUse: Bi;
}

// -------------------------------------------------------------------------
// Evidence classes
// -------------------------------------------------------------------------

/** What kind of evidence an answer produces, and therefore what it is
 *  permitted to influence.
 *
 *  - `orientation_self_report` — scored. Feeds Security Career DNA axes.
 *  - `behavioural_signal`      — scored into signals only; never matching.
 *  - `contextual_self_report`  — NOT scored. Report framing, action planning
 *                                and example selection only. Both the two
 *                                context questions and all adaptive items
 *                                produce this class.
 *
 *  The boundary is enforced structurally: `isScored` is derived from this
 *  field, and the scoring surface only ever reads the first two classes. */
export type EvidenceClass =
  | "orientation_self_report"
  | "behavioural_signal"
  | "contextual_self_report";

/** Contextual evidence is never scored. This is the single place the rule
 *  is expressed; everything else derives from it. */
export function isScoredEvidenceClass(cls: EvidenceClass): boolean {
  return cls !== "contextual_self_report";
}

// -------------------------------------------------------------------------
// Items
// -------------------------------------------------------------------------

export type ItemKind =
  | "context" // C1, C2 — routing and framing, unscored
  | "single_axis" // S1–S8 — one axis each
  | "trade_off" // T1–T8 — two axes, inversely loaded within the item
  | "behavioural" // B1–B4 — behavioural signals only
  | "adaptive"; // path-specific, unscored contextual evidence

/** One selectable answer. `value` is the stable, language-independent
 *  identifier that is persisted — never the displayed label. */
export interface ItemOption {
  value: string;
  label: Bi;
  /** Axis loadings in [0,1]. Empty for unscored items. */
  loadings?: Partial<Record<CareerOrientationAxisId, number>>;
  /** Behavioural-signal reading. Descriptive, never right-or-wrong. */
  signalNote?: Bi;
  /** Contextual report tags. Adaptive items only. Influence report wording,
   *  recommended learning, next steps, examples and career guidance —
   *  nothing else. */
  reportTags?: string[];
}

export interface DiscoveryItem {
  /** Stable identifier, persisted with every answer. Never reused across
   *  versions with different meaning. */
  id: string;
  kind: ItemKind;
  /** Version of this item's content. Bumped when wording changes. */
  itemVersion: number;
  evidenceClass: EvidenceClass;
  prompt: Bi;
  /** Optional framing shown above the options (trade-off items use it to
   *  present the two roles being weighed). */
  stem?: { a: Bi; b: Bi };
  options: ItemOption[];
  /** Axes this item loads on. Empty for unscored items. */
  axes: CareerOrientationAxisId[];
  /** Signal this item observes. Behavioural items only. */
  signal?: BehaviouralSignalId;
  /** Authored estimate of information gain, 1–5. An authoring judgement,
   *  never a measurement, never shown to candidates, never affects
   *  scoring — it exists to drive adaptive selection at [V1]. */
  infoGain?: number;
  /** Estimated seconds to answer. Drives the session-length estimate only. */
  estimatedSeconds: number;
}

/** Derived, never authored by hand: an item is scored iff its evidence
 *  class is a scoring class. */
export function isScoredItem(item: DiscoveryItem): boolean {
  return isScoredEvidenceClass(item.evidenceClass);
}

// -------------------------------------------------------------------------
// Context routing
// -------------------------------------------------------------------------

/** C1 answer. Locked by the owner. Controls the adaptive path, report
 *  framing, suggested next steps and candidate-facing examples. It must
 *  never change the scoring scale of the 20 core items. */
export type ContextStatus =
  | "exploring_security"
  | "working_in_security"
  | "developing_current_role"
  | "changing_career_area"
  | "security_leader";

/** C2 answer. Locked by the owner. Controls the report opening, action-plan
 *  emphasis, call-to-action ordering, and tone. Never scored, and never
 *  affects the adaptive path. */
export type DiscoveryGoal =
  | "find_direction"
  | "confirm_direction"
  | "discover_opportunities"
  | "understand_strengths"
  | "curious";

/** The five adaptive paths, one per ContextStatus. */
export type AdaptivePath = "A" | "B" | "C" | "D" | "E";

// -------------------------------------------------------------------------
// Sections
// -------------------------------------------------------------------------

export type DiscoverySectionId =
  | "approach" // Discovery 1 — How you approach situations
  | "others" // Discovery 2 — How you work with others
  | "decisions" // Discovery 3 — How you make decisions
  | "responsibility" // Discovery 4 — How you handle responsibility
  | "development"; // Discovery 5 — How you want to develop

export interface DiscoverySection {
  id: DiscoverySectionId;
  /** 1-based position, used by the primary progress display. */
  ordinal: number;
  title: Bi;
  description: Bi;
  /** Core item ids assigned to this section, in presentation order. */
  coreItemIds: string[];
  /** Whether an adaptive item is placed in this section. */
  hasAdaptiveSlot: boolean;
  /** Shown after the section completes. Absent on the final section. */
  transition?: Bi;
}

// -------------------------------------------------------------------------
// Assembled session
// -------------------------------------------------------------------------

/** One item as it appears in an assembled session, with its position. */
export interface SessionItem {
  item: DiscoveryItem;
  sectionId: DiscoverySectionId;
  /** 1-based index within the section. */
  indexInSection: number;
  /** 1-based index across all 26 questions. Transition screens and the
   *  preparation screen are not questions and carry no index. */
  questionNumber: number;
}

export interface AssembledSession {
  definitionId: string;
  definitionVersion: string;
  contentVersion: string;
  scoringVersion: string;
  taxonomyVersion: string;
  contextStatus: ContextStatus;
  adaptivePath: AdaptivePath;
  /** The two context items, always first and always the same for everyone. */
  contextItems: DiscoveryItem[];
  /** The five sections with their core and adaptive items interleaved. */
  sections: DiscoverySection[];
  /** Every question in presentation order: 2 context + 20 core + 4 adaptive. */
  items: SessionItem[];
  /** Convenience counts, asserted by the guard script. */
  counts: {
    context: number;
    core: number;
    adaptive: number;
    total: number;
    scored: number;
  };
}
