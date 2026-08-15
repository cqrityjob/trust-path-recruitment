// Minimal current-career context (Master Completion Mandate item 2).
//
// C1 ("I already work in security") is too coarse a baseline on its own —
// `working_in_security` cannot mean the same thing for a Väktare and a
// Security Coordinator. This captures a very small, optional, POST-
// assessment self-report — current profession + experience band — collected
// after the 26 scored questions and before the final report renders.
//
// ── STRICTLY SEPARATE FROM CAREER DNA ────────────────────────────────────
//
// This has its own sessionStorage key, its own type, and is never merged
// into PublicBuffer (v31-public-buffer.ts) or read by anything in
// v31/scoring.ts. It exists purely as contextual self-report for
// Recommendation Priority and stage/pathway interpretation (see
// professions.ts) — never for Career DNA / Profession Affinity, which stay
// driven only by the 20 scored Career DNA answers.
//
// ── ONLY SHOWN WHEN RELEVANT ─────────────────────────────────────────────
//
// A candidate who is not yet working in security at all
// (context_status = 'exploring_security') has no "current profession" to
// report — the step is skipped entirely for them, not shown-then-skippable.

import type { ContextStatus } from "./v31/personal-layer";

export type ExperienceBand = "under_1y" | "1_3y" | "4_7y" | "8_plus_y";

export const EXPERIENCE_BAND_VALUES: readonly ExperienceBand[] = [
  "under_1y",
  "1_3y",
  "4_7y",
  "8_plus_y",
];

export const EXPERIENCE_BAND_LABEL: Readonly<Record<ExperienceBand, Record<"sv" | "en", string>>> = {
  under_1y: { sv: "Mindre än 1 år", en: "Under 1 year" },
  "1_3y": { sv: "1-3 år", en: "1-3 years" },
  "4_7y": { sv: "4-7 år", en: "4-7 years" },
  "8_plus_y": { sv: "8+ år", en: "8+ years" },
};

export type CurrentProfessionStatus = "selected" | "not_listed" | "prefer_not_to_say";

export interface CareerContext {
  readonly currentProfessionStatus: CurrentProfessionStatus | null;
  /** Set only when currentProfessionStatus === "selected". A cig_professions
   *  slug — the canonical cross-product profession identity (see the
   *  SP-ID-reconciliation note in v31-layer4-implementation-state.md). */
  readonly currentProfessionSlug: string | null;
  readonly experienceBand: ExperienceBand | null;
}

export const EMPTY_CAREER_CONTEXT: CareerContext = {
  currentProfessionStatus: null,
  currentProfessionSlug: null,
  experienceBand: null,
};

/** Statuses for which "what do you currently do in security" is a
 *  meaningful question. Exhaustive over ContextStatus by construction —
 *  the compiler enforces that a new status cannot be added without an
 *  explicit answer here. */
const RELEVANT_STATUSES: Readonly<Record<ContextStatus, boolean>> = {
  exploring_security: false,
  working_in_security: true,
  developing_current_role: true,
  changing_career_area: true,
  security_leader: true,
};

export function shouldCollectCareerContext(status: ContextStatus | null): boolean {
  return status !== null && RELEVANT_STATUSES[status];
}

export function isCareerContextComplete(ctx: CareerContext): boolean {
  return ctx.currentProfessionStatus !== null;
}

// -------------------------------------------------------------------------
// sessionStorage — separate key, separate lifecycle from PublicBuffer.
// Cleared together with the buffer at claim time (see clearCareerContext),
// never persisted longer than the assessment buffer it accompanies.
// -------------------------------------------------------------------------

const KEY = "cqj:discovery:v31:career-context:v1";

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

function isExperienceBand(v: unknown): v is ExperienceBand {
  return typeof v === "string" && (EXPERIENCE_BAND_VALUES as string[]).includes(v);
}

function isCurrentProfessionStatus(v: unknown): v is CurrentProfessionStatus {
  return v === "selected" || v === "not_listed" || v === "prefer_not_to_say";
}

export function readCareerContext(): CareerContext {
  if (!isBrowser()) return EMPTY_CAREER_CONTEXT;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return EMPTY_CAREER_CONTEXT;
    const parsed = JSON.parse(raw) as Partial<CareerContext>;
    const status = isCurrentProfessionStatus(parsed.currentProfessionStatus)
      ? parsed.currentProfessionStatus
      : null;
    return {
      currentProfessionStatus: status,
      currentProfessionSlug:
        status === "selected" && typeof parsed.currentProfessionSlug === "string"
          ? parsed.currentProfessionSlug
          : null,
      experienceBand: isExperienceBand(parsed.experienceBand) ? parsed.experienceBand : null,
    };
  } catch {
    return EMPTY_CAREER_CONTEXT;
  }
}

export function writeCareerContext(ctx: CareerContext): void {
  if (!isBrowser()) return;
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(ctx));
  } catch {
    // Storage full or disabled — the candidate loses this optional context,
    // never the assessment result itself.
  }
}

export function clearCareerContext(): void {
  if (!isBrowser()) return;
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}
