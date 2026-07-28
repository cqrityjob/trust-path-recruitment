// Session assembly and progress.
//
// Assembles the 26 questions a candidate answers — 2 context + 20 core + 4
// adaptive — in presentation order, and derives the progress model.
//
// ── THE STABILITY GUARANTEE ────────────────────────────────────────────
//
// `assembleSession()` is a pure function of ONE input: the C1 answer. It
// does not read C2, does not read any core answer, and has no clock or
// randomness. The path is therefore identical on every call for a given
// C1 — which is what makes "refresh does not change the assigned path"
// and "changing C2 does not change the path" true by construction rather
// than by testing.
//
// The path is persisted on the session row at creation (see the migration's
// cd_sessions.adaptive_path, which is immutable after insert). This module
// re-derives the same value; it never overrides the stored one.

import { ADAPTIVE_ITEMS_BY_PATH, ADAPTIVE_ITEMS_PER_SESSION } from "./adaptive-items";
import { CONTEXT_ITEMS, pathForContextStatus } from "./context-items";
import { CORE_ITEMS_BY_ID, CORE_ITEM_COUNT } from "./core-items";
import { DISCOVERY_SECTIONS, SECTION_COUNT } from "./sections";
import type {
  AdaptivePath,
  AssembledSession,
  ContextStatus,
  DiscoverySection,
  DiscoverySectionId,
  SessionItem,
} from "./types";
import { isScoredItem } from "./types";
import {
  CONTENT_VERSION,
  DEFINITION_ID,
  DEFINITION_VERSION,
  SCORING_VERSION,
  TAXONOMY_VERSION,
} from "./version";

/** Assemble the full session for a given C1 answer.
 *
 *  Every candidate receives all 20 core items in the same wording and the
 *  same order. The only thing C1 changes is WHICH four adaptive items are
 *  slotted into sections 1, 2, 4 and 5. */
export function assembleSession(contextStatus: ContextStatus): AssembledSession {
  const adaptivePath = pathForContextStatus(contextStatus);
  const adaptiveItems = ADAPTIVE_ITEMS_BY_PATH[adaptivePath];

  const items: SessionItem[] = [];
  let questionNumber = 0;

  // The two context questions come first, outside any Discovery section.
  // They are assigned to section 1 for progress purposes but are presented
  // before the preparation screen — see the route's stage machine.
  for (const item of CONTEXT_ITEMS) {
    questionNumber += 1;
    items.push({
      item,
      sectionId: "approach",
      indexInSection: 0, // 0 = pre-section; not counted in section progress
      questionNumber,
    });
  }

  // Adaptive items are consumed in bank order as the slotted sections are
  // encountered, so path A's first item always lands in Discovery 1.
  let adaptiveCursor = 0;

  for (const section of DISCOVERY_SECTIONS) {
    let indexInSection = 0;

    for (const coreId of section.coreItemIds) {
      const item = CORE_ITEMS_BY_ID.get(coreId);
      if (!item) {
        // Unreachable unless sections.ts and core-items.ts drift apart.
        // Failing loudly beats silently serving a short instrument.
        throw new Error(
          `CAREER_DISCOVERY_SECTION_REFERENCES_UNKNOWN_ITEM: section '${section.id}' lists core item '${coreId}', which is not in the core bank`,
        );
      }
      questionNumber += 1;
      indexInSection += 1;
      items.push({ item, sectionId: section.id, indexInSection, questionNumber });
    }

    if (section.hasAdaptiveSlot) {
      const adaptiveItem = adaptiveItems[adaptiveCursor];
      if (!adaptiveItem) {
        throw new Error(
          `CAREER_DISCOVERY_ADAPTIVE_BANK_EXHAUSTED: path '${adaptivePath}' has fewer than ${ADAPTIVE_ITEMS_PER_SESSION} items`,
        );
      }
      adaptiveCursor += 1;
      questionNumber += 1;
      indexInSection += 1;
      items.push({
        item: adaptiveItem,
        sectionId: section.id,
        indexInSection,
        questionNumber,
      });
    }
  }

  const counts = {
    context: items.filter((i) => i.item.kind === "context").length,
    core: items.filter((i) => i.item.kind !== "context" && i.item.kind !== "adaptive").length,
    adaptive: items.filter((i) => i.item.kind === "adaptive").length,
    total: items.length,
    scored: items.filter((i) => isScoredItem(i.item)).length,
  };

  return {
    definitionId: DEFINITION_ID,
    definitionVersion: DEFINITION_VERSION,
    contentVersion: CONTENT_VERSION,
    scoringVersion: SCORING_VERSION,
    taxonomyVersion: TAXONOMY_VERSION,
    contextStatus,
    adaptivePath,
    contextItems: [...CONTEXT_ITEMS],
    sections: DISCOVERY_SECTIONS.map((s) => ({ ...s })),
    items,
    counts,
  };
}

// -------------------------------------------------------------------------
// Progress
// -------------------------------------------------------------------------

/** Progress as the candidate sees it. Primary display is the section
 *  ("Discovery 2 of 5"); the within-section counter is secondary. Per
 *  directive §14, a bare "Question X of 26" is never the primary display. */
export interface DiscoveryProgress {
  sectionOrdinal: number;
  sectionCount: number;
  /** 1-based position within the section, and how many it holds. */
  itemInSection: number;
  itemsInSection: number;
  /** Kept for the secondary/aria description only. */
  questionNumber: number;
  totalQuestions: number;
}

export function itemsInSection(
  session: AssembledSession,
  sectionId: DiscoverySectionId,
): SessionItem[] {
  return session.items.filter((i) => i.sectionId === sectionId && i.indexInSection > 0);
}

export function progressFor(session: AssembledSession, questionNumber: number): DiscoveryProgress {
  const current = session.items.find((i) => i.questionNumber === questionNumber);
  if (!current) {
    throw new Error(`CAREER_DISCOVERY_UNKNOWN_QUESTION_NUMBER: ${questionNumber}`);
  }
  const section = session.sections.find((s) => s.id === current.sectionId) as DiscoverySection;
  const inSection = itemsInSection(session, current.sectionId);
  return {
    sectionOrdinal: section.ordinal,
    sectionCount: SECTION_COUNT,
    itemInSection: current.indexInSection,
    itemsInSection: inSection.length,
    questionNumber: current.questionNumber,
    totalQuestions: session.items.length,
  };
}

// -------------------------------------------------------------------------
// Completion
// -------------------------------------------------------------------------

/** Which item ids must be answered before a result may be generated.
 *
 *  ONLY the 20 core items. Adaptive answers are contextual evidence and are
 *  deliberately NOT required — a result is generatable without them, which
 *  is the structural expression of "adaptive items must not become required
 *  inputs for DNA, ranking, report generation, scoring, confidence or
 *  coverage". Context answers are likewise not required for scoring, though
 *  C1 is required to assemble the session at all. */
export function requiredItemIdsForResult(session: AssembledSession): string[] {
  return session.items.filter((i) => isScoredItem(i.item)).map((i) => i.item.id);
}

export interface CompletionState {
  canGenerateResult: boolean;
  missingCoreItemIds: string[];
  answeredCoreCount: number;
  requiredCoreCount: number;
  /** Informational only — never blocks result generation. */
  missingAdaptiveItemIds: string[];
}

export function completionState(
  session: AssembledSession,
  answeredItemIds: Iterable<string>,
): CompletionState {
  const answered = new Set(answeredItemIds);
  const required = requiredItemIdsForResult(session);
  const missingCoreItemIds = required.filter((id) => !answered.has(id));
  const missingAdaptiveItemIds = session.items
    .filter((i) => i.item.kind === "adaptive" && !answered.has(i.item.id))
    .map((i) => i.item.id);

  return {
    canGenerateResult: missingCoreItemIds.length === 0,
    missingCoreItemIds,
    answeredCoreCount: required.length - missingCoreItemIds.length,
    requiredCoreCount: required.length,
    missingAdaptiveItemIds,
  };
}

/** Estimated session length, from authored per-item estimates. Used for the
 *  "about 12–15 minutes" claim on the preparation screen — the guard script
 *  asserts the estimate actually lands in that range. */
export function estimatedMinutes(session: AssembledSession): number {
  const seconds = session.items.reduce((sum, i) => sum + i.item.estimatedSeconds, 0);
  return Math.round((seconds / 60) * 10) / 10;
}

export const EXPECTED_TOTAL_QUESTIONS = 2 + CORE_ITEM_COUNT + ADAPTIVE_ITEMS_PER_SESSION; // 26

export type { AdaptivePath };
