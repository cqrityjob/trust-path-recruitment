// The v3.1 personal layer — the 2 context questions and the 4 adaptive
// Discovery Path questions that bracket the 20 Career DNA items.
//
// ── THIS MODULE AUTHORS NOTHING ────────────────────────────────────────
//
// Every question here is imported, not written. The two context questions
// come from ../context-items.ts and the adaptive bank from ../adaptive-items.ts,
// both owner-locked and both already registered for v3.0. This module only
// binds them to the v3.1 flow and states the frozen MVP order:
//
//     2 Context  →  20 Career DNA  →  4 Discovery Path
//
// Owner decision (MVP v1.0): the adaptive bank already implemented in this
// repository is canonical. The Career Intelligence Excel is the Career
// Intelligence Engine applied AFTER the assessment — profession profiles,
// weighting, matching, career stage — and is NOT the question bank. Its
// sheet-12 wording is deliberately not used.
//
// ── WHY THERE IS NO SECOND ADAPTIVE ENGINE ─────────────────────────────
//
// Path selection is `pathForContextStatus`, re-exported below, which is the
// same function v3.0 uses and which the database mirrors in
// `cd_derive_adaptive_path()`. The database assigns rather than accepts the
// path, so a client that lied about it would still persist the derived value.
// Nothing here re-implements that decision; it only reads it.
//
// ── THE SCORING BOUNDARY ───────────────────────────────────────────────
//
// Every item exposed here is `contextual_self_report` with an empty `axes`
// array, so it cannot reach scoring even by mistake: the registry marks it
// unscored under a CHECK constraint, and `cd_v31_validate_session_evidence`
// counts only `is_scored AND item_kind IN ('scale','single_choice')`. The
// Career DNA snapshot is built from the 20 core answers alone — see
// `buildValidatedSnapshot` in ./snapshot.ts, which this module never calls.

import {
  ADAPTIVE_ITEMS_BY_ID,
  ADAPTIVE_ITEMS_BY_PATH,
  ADAPTIVE_ITEMS_PER_SESSION,
  ALL_ADAPTIVE_ITEMS,
} from "../adaptive-items";
import {
  CONTEXT_ITEMS,
  CONTEXT_STATUS_ITEM_ID,
  DISCOVERY_GOAL_ITEM_ID,
  isContextStatus,
  pathForContextStatus,
} from "../context-items";
import type { AdaptivePath, ContextStatus, DiscoveryItem } from "../types";
import { CORE_ITEMS } from "./core-items";

export {
  ADAPTIVE_ITEMS_PER_SESSION,
  CONTEXT_ITEMS,
  CONTEXT_STATUS_ITEM_ID,
  DISCOVERY_GOAL_ITEM_ID,
  isContextStatus,
  pathForContextStatus,
};

export type { AdaptivePath, ContextStatus, DiscoveryItem };

/** The frozen MVP length. Asserted below rather than trusted, because a
 *  drifting bank would otherwise shorten the assessment silently. */
export const MVP_QUESTION_COUNT = 26;

/** Every personal-layer item id, across all five paths. The registry
 *  migration seeds exactly this set for v3.1. */
export const PERSONAL_LAYER_ITEM_IDS: readonly string[] = [
  ...CONTEXT_ITEMS.map((i) => i.id),
  ...ALL_ADAPTIVE_ITEMS.map((i) => i.id),
];

const PERSONAL_ITEM_BY_ID: ReadonlyMap<string, DiscoveryItem> = new Map(
  [...CONTEXT_ITEMS, ...ALL_ADAPTIVE_ITEMS].map((i) => [i.id, i]),
);

/** True for a context or adaptive item — never for a Career DNA item. */
export function isPersonalItemId(itemId: string): boolean {
  return PERSONAL_ITEM_BY_ID.has(itemId);
}

export function personalItem(itemId: string): DiscoveryItem | undefined {
  return PERSONAL_ITEM_BY_ID.get(itemId);
}

export function isAdaptiveItemId(itemId: string): boolean {
  return ADAPTIVE_ITEMS_BY_ID.has(itemId);
}

/** The four Discovery Path questions this candidate is served, in order.
 *
 *  Derived from C1 only. C2 is deliberately not an input — it shapes report
 *  framing, never routing — which is why this takes a single argument, the
 *  same shape `assembleSession()` uses and the guard script asserts. */
export function adaptiveItemsForStatus(status: ContextStatus): readonly DiscoveryItem[] {
  return ADAPTIVE_ITEMS_BY_PATH[pathForContextStatus(status)];
}

/** Is `value` a real option of `itemId`?
 *
 *  Used by the buffer and by the server before anything is written. An answer
 *  that is not an authored option is rejected rather than stored, so a tampered
 *  buffer cannot put an invented value into evidence. */
export function isValidPersonalAnswer(itemId: string, value: string): boolean {
  const item = PERSONAL_ITEM_BY_ID.get(itemId);
  return item !== undefined && item.options.some((o) => o.value === value);
}

/** The Career Context Signals an adaptive answer produces.
 *
 *  These are the structured tags the Career Intelligence Engine consumes
 *  after the assessment. They are stored on the evidence row and are what the
 *  Excel matching model reads — they never touch Career DNA. Empty for
 *  context items, which carry no tags. */
export function reportTagsFor(itemId: string, value: string): string[] {
  if (!ADAPTIVE_ITEMS_BY_ID.has(itemId)) return [];
  const option = ADAPTIVE_ITEMS_BY_ID.get(itemId)?.options.find((o) => o.value === value);
  return option?.reportTags ? [...option.reportTags] : [];
}

// -------------------------------------------------------------------------
// Load-time assertions
// -------------------------------------------------------------------------
//
// A short instrument is the failure this whole module exists to prevent, and
// it is invisible at a glance: a path with three items would simply serve 25
// questions. These run once at import and fail the build's first render
// rather than a candidate's session.

if (CONTEXT_ITEMS.length !== 2) {
  throw new Error(`CD_V31_PERSONAL_LAYER: expected 2 context items, got ${CONTEXT_ITEMS.length}`);
}

for (const path of Object.keys(ADAPTIVE_ITEMS_BY_PATH) as AdaptivePath[]) {
  const n = ADAPTIVE_ITEMS_BY_PATH[path].length;
  if (n !== ADAPTIVE_ITEMS_PER_SESSION) {
    throw new Error(
      `CD_V31_PERSONAL_LAYER: path ${path} has ${n} items, expected ${ADAPTIVE_ITEMS_PER_SESSION}`,
    );
  }
}

if (CONTEXT_ITEMS.length + CORE_ITEMS.length + ADAPTIVE_ITEMS_PER_SESSION !== MVP_QUESTION_COUNT) {
  throw new Error(
    `CD_V31_PERSONAL_LAYER: the session is ${
      CONTEXT_ITEMS.length + CORE_ITEMS.length + ADAPTIVE_ITEMS_PER_SESSION
    } questions, expected ${MVP_QUESTION_COUNT}`,
  );
}
