// Security Passport — prototype-only autosave and resume.
//
// ── sessionStorage, NOT localStorage ───────────────────────────────────
//
// Same reasoning as the Career Discovery public buffer
// (src/lib/career-discovery/v31-public-buffer.ts): progress should survive
// a refresh but must not outlive the tab. A half-finished onboarding
// resurfacing days later on a shared computer is a privacy problem, and
// here it would also make a review session start in whatever state the
// previous reviewer left behind.
//
// ── PROTOTYPE ONLY ─────────────────────────────────────────────────────
//
// This is a demonstration of autosave/resume behaviour, not a persistence
// design. It stores step position and a handful of fictional field values
// typed by a reviewer. It must never be used for real personal data, and
// the Phase 1 UI never asks for any. The key is namespaced and versioned so
// a stale shape is discarded rather than misread, and a visible reset
// action clears it.

const KEY = "cqj:sp:proto:v1";
const STATE_VERSION = 1;

export interface PrototypeState {
  readonly stateVersion: number;
  readonly stepIndex: number;
  /** Fictional reviewer input, keyed by `${stepId}.${fieldId}`. */
  readonly answers: Readonly<Record<string, string>>;
  readonly skipped: readonly string[];
  readonly startedAt: string;
  readonly savedAt: string;
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

export function emptyState(): PrototypeState {
  const now = new Date().toISOString();
  return {
    stateVersion: STATE_VERSION,
    stepIndex: 0,
    answers: {},
    skipped: [],
    startedAt: now,
    savedAt: now,
  };
}

/** Reads saved progress, discarding anything stale or malformed.
 *
 *  Never throws and never returns a half-trusted object: a state that
 *  cannot be fully validated is treated as absent, because resuming into a
 *  partially-understood step is worse than starting again. */
export function readState(): PrototypeState | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PrototypeState;
    if (parsed.stateVersion !== STATE_VERSION) return null;
    if (typeof parsed.stepIndex !== "number" || parsed.stepIndex < 0) return null;
    if (typeof parsed.answers !== "object" || parsed.answers === null) return null;
    if (!Array.isArray(parsed.skipped)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeState(state: PrototypeState): PrototypeState {
  const next: PrototypeState = { ...state, savedAt: new Date().toISOString() };
  if (!isBrowser()) return next;
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage disabled or full. The review session continues in memory —
    // strictly better than blocking the reviewer over a demo convenience.
  }
  return next;
}

export function recordAnswer(
  state: PrototypeState,
  stepId: string,
  fieldId: string,
  value: string,
): PrototypeState {
  return writeState({
    ...state,
    answers: { ...state.answers, [`${stepId}.${fieldId}`]: value },
  });
}

export function goToStep(state: PrototypeState, stepIndex: number): PrototypeState {
  return writeState({ ...state, stepIndex: Math.max(0, stepIndex) });
}

export function markSkipped(state: PrototypeState, stepId: string): PrototypeState {
  if (state.skipped.includes(stepId)) return state;
  return writeState({ ...state, skipped: [...state.skipped, stepId] });
}

/** Clears saved progress. Wired to a visible control so a reviewer can
 *  always get back to a known starting point. */
export function clearState(): void {
  if (!isBrowser()) return;
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}
