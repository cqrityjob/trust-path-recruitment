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
import { CONTENT_VERSION, DEFINITION_VERSION, type Locale } from "./v31/version";

/** Buffer format version. Bumped when the stored SHAPE changes, so a stale
 *  buffer from an older build is discarded rather than misread. */
const BUFFER_VERSION = 1;

const KEY = "cqj:discovery:v31:public-buffer:v1";

/** One buffered answer. Mirrors the domain `Answer` union, but kept structural
 *  so the buffer never depends on a domain value import. */
export type BufferedAnswer =
  | { readonly itemId: string; readonly format: "scale"; readonly value: number }
  | { readonly itemId: string; readonly format: "single_choice"; readonly optionId: string };

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

    const validItemIds = new Set(CORE_ITEMS.map((i) => i.id));
    for (const a of parsed.answers) {
      if (!a || typeof a.itemId !== "string" || !validItemIds.has(a.itemId)) return null;
      if (a.format === "scale") {
        if (!Number.isFinite(a.value) || a.value < 1 || a.value > 10) return null;
      } else if (a.format === "single_choice") {
        if (typeof a.optionId !== "string" || !a.optionId.startsWith(`${a.itemId}_`)) return null;
      } else {
        return null;
      }
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
  const answers = buffer.answers.filter((a) => a.itemId !== answer.itemId).concat(answer);
  const next: PublicBuffer = { ...buffer, answers };
  writeBuffer(next);
  return next;
}

/** True when every core item has an answer. */
export function isComplete(buffer: PublicBuffer | null): boolean {
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

/** Items still unanswered, in display order. Drives "resume where you left off". */
export function remainingItemIds(buffer: PublicBuffer | null): string[] {
  const answered = new Set((buffer?.answers ?? []).map((a) => a.itemId));
  return CORE_ITEMS.filter((i) => !answered.has(i.id)).map((i) => i.id);
}
