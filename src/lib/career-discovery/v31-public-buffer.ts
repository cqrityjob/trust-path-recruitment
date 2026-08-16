// The public assessment buffer.
//
// ── WHY THIS EXISTS, AND WHY IT IS NOT ANONYMOUS SESSIONS ──────────────
//
// Before commit 15949db the assessment was a public route that held answers in
// sessionStorage and never touched the database until the candidate had a
// result. The v3 cutover replaced it with a database-backed flow behind
// `_authenticated`, and the public capability went with it — while /assessment
// still advertises "Inget konto krävs" / "No account required".
//
// This restores the old mechanism, not a new one. Answers live in the browser
// until the candidate signs in; only then are they written, through the normal
// authenticated v3.1 pipeline, owned by a real user_id from the first insert.
//
// That distinction is the whole security argument:
//
//   * no anonymous database grants — `anon` still holds nothing on any cd_
//     table, and PR1's assertion V9.6 stays intact;
//   * no anonymous RLS policies — nothing is keyed on a browser-held token;
//   * no anonymous report ownership — a report cannot exist before an owner
//     does, so there is no orphan row to claim, leak or garbage-collect.
//
// A bearer token in web storage that grants database read access would have
// been the alternative. This has no such token, because there is nothing in the
// database to read yet.
//
// ── sessionStorage, DELIBERATELY ───────────────────────────────────────
//
// Not localStorage. Progress should survive a refresh — which the old flow also
// did — but must not outlive the tab. An abandoned half-finished assessment
// resurfacing days later on a shared computer is a privacy problem, and the
// answers are about how someone wants to work.

import { CORE_ITEMS } from "./v31/core-items";
import {
  adaptiveItemsForStatus,
  CONTEXT_ITEMS,
  CONTEXT_STATUS_ITEM_ID,
  isContextStatus,
  isValidPersonalAnswer,
  type ContextStatus,
} from "./v31/personal-layer";
import { CONTENT_VERSION, DEFINITION_VERSION, type Locale } from "./v31/version";

/** Buffer format version. Bumped when the stored SHAPE changes, so a stale
 *  buffer from an older build is discarded rather than misread.
 *
 *  v1 → v2: the buffer gained the personal layer (2 context + 4 adaptive
 *  answers alongside the Career DNA answers, then 20 of them, now 22 with
 *  CQ21/CQ22 — see v31/personal-layer.ts's MVP_QUESTION_COUNT). A v1 buffer
 *  holds a Career-DNA-only run with no personal layer at all and is
 *  discarded rather than replayed as a full run, because completing it
 *  would silently produce a session with no context_status and therefore
 *  no Discovery Path. */
const BUFFER_VERSION = 2;

const KEY = "cqj:discovery:v31:public-buffer:v1";

/** One buffered answer.
 *
 *  `scale` and `single_choice` are the scored Career DNA formats and mirror
 *  the domain `Answer` union, kept structural so the buffer never depends on a
 *  domain value import.
 *
 *  `personal` covers both context and adaptive items: each is a pick from an
 *  authored option list, identified by the option's stable `value`. It is a
 *  separate variant precisely so it can never be mistaken for a scored answer
 *  — nothing that reads Career DNA accepts this shape. */
export type BufferedAnswer =
  | { readonly itemId: string; readonly format: "scale"; readonly value: number }
  | { readonly itemId: string; readonly format: "single_choice"; readonly optionId: string }
  | { readonly itemId: string; readonly format: "personal"; readonly value: string };

export interface PublicBuffer {
  readonly bufferVersion: number;
  /** The definition and content the answers were given against. A buffer from
   *  a different version is discarded: replaying answers into a changed
   *  instrument would silently produce a report the candidate never took. */
  readonly definitionVersion: string;
  readonly contentVersion: string;
  readonly locale: Locale;
  readonly answers: readonly BufferedAnswer[];
  readonly startedAt: string;
  /** Set once, by markComplete, the moment the final answer is recorded.
   *  Absent on an in-progress buffer. Frozen rather than recomputed on every
   *  render so the client-computed result (see PublicAssessmentFlow) reports
   *  the same completion time across a reload, and so the same timestamp is
   *  later handed to buildValidatedSnapshot again at claim time — the
   *  anonymous view and the claimed report describe the same event. */
  readonly completedAt?: string;
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

/** Reads the buffer, discarding anything stale, foreign or malformed.
 *
 *  Never throws and never returns a partially-trusted object: a buffer that
 *  cannot be fully validated is treated as absent, because replaying half of
 *  someone's answers is worse than asking them to start again. */
export function readBuffer(): PublicBuffer | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PublicBuffer;

    if (parsed.bufferVersion !== BUFFER_VERSION) return null;
    if (parsed.definitionVersion !== DEFINITION_VERSION) return null;
    if (parsed.contentVersion !== CONTENT_VERSION) return null;
    if (parsed.locale !== "sv" && parsed.locale !== "en") return null;
    if (!Array.isArray(parsed.answers)) return null;

    const coreItemIds = new Set(CORE_ITEMS.map((i) => i.id));
    for (const a of parsed.answers) {
      if (!a || typeof a.itemId !== "string") return null;
      if (a.format === "personal") {
        // Validated against the authored option list, so a hand-edited buffer
        // cannot introduce a value the instrument never offered.
        if (typeof a.value !== "string" || !isValidPersonalAnswer(a.itemId, a.value)) return null;
      } else if (!coreItemIds.has(a.itemId)) {
        return null;
      } else if (a.format === "scale") {
        if (!Number.isFinite(a.value) || a.value < 1 || a.value > 10) return null;
      } else if (a.format === "single_choice") {
        if (typeof a.optionId !== "string" || !a.optionId.startsWith(`${a.itemId}_`)) return null;
      } else {
        return null;
      }
    }

    // An adaptive answer from a path the candidate is not on means the buffer
    // has been edited or the bank has changed under it. Either way the run is
    // no longer coherent, and the database would refuse the evidence anyway.
    const status = contextStatusOf(parsed);
    const servedIds = new Set(sessionItemIds(status));
    if (parsed.answers.some((a) => a.format === "personal" && !servedIds.has(a.itemId))) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

/** Creates or replaces the buffer for a fresh run. */
export function startBuffer(locale: Locale, startedAt: string): PublicBuffer {
  const buffer: PublicBuffer = {
    bufferVersion: BUFFER_VERSION,
    definitionVersion: DEFINITION_VERSION,
    contentVersion: CONTENT_VERSION,
    locale,
    answers: [],
    startedAt,
  };
  writeBuffer(buffer);
  return buffer;
}

function writeBuffer(buffer: PublicBuffer): void {
  if (!isBrowser()) return;
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(buffer));
  } catch {
    // Storage full or disabled. The run continues in memory; the candidate
    // loses progress on refresh, which is strictly better than blocking them.
  }
}

/** Records an answer, replacing any previous answer to the same item.
 *
 *  Replacing rather than appending is what makes going back and changing an
 *  answer behave the way a candidate expects, and keeps exactly one answer per
 *  item — which the completion path requires. */
export function recordAnswer(buffer: PublicBuffer, answer: BufferedAnswer): PublicBuffer {
  let kept = buffer.answers.filter((a) => a.itemId !== answer.itemId);

  // Changing C1 changes the Discovery Path, which makes any adaptive answer
  // already given belong to a path this run is no longer on. Those answers are
  // dropped here rather than left to fail validation later, because `readBuffer`
  // discards a buffer it cannot fully trust — which would throw away all 20
  // Career DNA answers over a corrected first question.
  //
  // Career DNA answers are never dropped: the same 20 items are asked on every
  // path, so none of them is invalidated by a routing change.
  if (answer.itemId === CONTEXT_STATUS_ITEM_ID) {
    const previous = contextStatusOf(buffer);
    const next =
      answer.format === "personal" && isContextStatus(answer.value) ? answer.value : null;
    if (previous !== next) {
      const stillServed = new Set(sessionItemIds(next));
      kept = kept.filter((a) => a.format !== "personal" || stillServed.has(a.itemId));
    }
  }

  const nextBuffer: PublicBuffer = { ...buffer, answers: kept.concat(answer) };
  writeBuffer(nextBuffer);
  return nextBuffer;
}

/** The candidate's C1 answer, or null before they have given one.
 *
 *  This is the run's routing state: until it exists there is no Discovery
 *  Path, and therefore no way to know which four adaptive items to serve. */
export function contextStatusOf(buffer: PublicBuffer | null): ContextStatus | null {
  const a = buffer?.answers.find((x) => x.itemId === CONTEXT_STATUS_ITEM_ID);
  if (!a || a.format !== "personal") return null;
  return isContextStatus(a.value) ? a.value : null;
}

/** The full 28-question sequence for this run, in the frozen MVP order:
 *  2 Context → 22 Career DNA → 4 Discovery Path.
 *
 *  Ids rather than items, because the three stages are different shapes and
 *  the caller resolves each against its own bank. Before C1 is answered the
 *  tail is not yet knowable, so this returns the 24 ids that are — which is
 *  exactly what the flow can render at that point. */
export function sessionItemIds(status: ContextStatus | null): readonly string[] {
  return [
    ...CONTEXT_ITEMS.map((i) => i.id),
    ...CORE_ITEMS.map((i) => i.id),
    ...(status ? adaptiveItemsForStatus(status).map((i) => i.id) : []),
  ];
}

/** True when every question in the run has an answer.
 *
 *  Deliberately includes the personal layer: a run missing C1 has no
 *  Discovery Path, and one missing an adaptive answer is one question short.
 *  Either would be persisted as complete if this only counted core items. */
export function isComplete(buffer: PublicBuffer | null): boolean {
  if (!buffer) return false;
  const status = contextStatusOf(buffer);
  if (!status) return false;
  const answered = new Set(buffer.answers.map((a) => a.itemId));
  return sessionItemIds(status).every((id) => answered.has(id));
}

/** Freezes completedAt the first time the buffer is complete. Idempotent: a
 *  buffer that already has one keeps it, so re-entering the result view
 *  never shifts the completion time forward. */
export function markComplete(buffer: PublicBuffer, completedAt: string): PublicBuffer {
  if (buffer.completedAt) return buffer;
  const next: PublicBuffer = { ...buffer, completedAt };
  writeBuffer(next);
  return next;
}

/** True when every scored Career DNA item has an answer. Separate from
 *  `isComplete` because the two are asked at different points and only this
 *  one bears on whether a report can be produced. */
export function isCoreComplete(buffer: PublicBuffer | null): boolean {
  if (!buffer) return false;
  const answered = new Set(buffer.answers.map((a) => a.itemId));
  return CORE_ITEMS.every((i) => answered.has(i.id));
}

/**
 * Clears the buffer.
 *
 * Call this ONLY after persistence has succeeded. Clearing on failure would
 * destroy the candidate's answers with nothing stored in exchange — the one
 * outcome this whole design exists to avoid.
 */
export function clearBuffer(): void {
  if (!isBrowser()) return;
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}

/** Items still unanswered, in display order. Drives "resume where you left off".
 *
 *  Spans all 26 questions. Before C1 is answered the adaptive tail is unknown
 *  and simply absent — it appears as soon as the path is decided. */
export function remainingItemIds(buffer: PublicBuffer | null): string[] {
  const answered = new Set((buffer?.answers ?? []).map((a) => a.itemId));
  return sessionItemIds(contextStatusOf(buffer)).filter((id) => !answered.has(id));
}
