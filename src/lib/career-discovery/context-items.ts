// The two context questions. The stable VALUES are OWNER-LOCKED — they are
// the adaptive path (C1) and the report framing (C2), they are persisted on
// every session, and nothing here may change them.
//
// ── CONTEXT AND INTENT ARE DIFFERENT QUESTIONS (v3.2 wording, C1) ──────
//
// C1 asks about the candidate's SITUATION. C2 asks what they want out of
// Career Discovery. One option had drifted across that line: C1's
// `security_leader` read "I am a manager and want to understand my strengths
// better", which is a situation and a goal welded together — and the goal
// half was, word for word, one of C2's own options ("Understand my
// strengths"). A candidate met the same statement twice, two questions
// apart, and could reasonably conclude the instrument was not listening.
//
// The fix is WORDING ONLY. `security_leader` now describes the situation and
// nothing else, and `exploring_security` says plainly that arriving from
// another industry counts, which is the transition case people were reading
// past. Every option VALUE, the option order, the adaptive path mapping and
// the scoring independence of both questions are untouched — the labels are
// the only thing that moved, which is why this is a CONTENT_VERSION bump
// (v3.1-draft-4 -> v3.1-draft-5) and nothing else. Neither question has ever
// been scored and neither is scored now.
//
// Neither is scored. Together they carry the entire personalisation surface
// of the product:
//
//   C1 → adaptive path, report framing, suggested next steps, examples.
//        It must NOT change the scoring scale of the 20 core items. Every
//        candidate answers the same 20 core items regardless of C1.
//   C2 → report opening, action-plan emphasis, call-to-action ordering,
//        tone and level of direction. It must NOT affect the adaptive path.
//
// This supersedes the C1/C2/C3 block drafted in question-blueprint-v3.0.md
// §2 (three questions, different wording and values). The blueprint's
// version was never administered; nothing is migrated. See the ADR.

import type { AdaptivePath, ContextStatus, DiscoveryGoal, DiscoveryItem } from "./types";

export const CONTEXT_STATUS_ITEM_ID = "CTX_CURRENT_STATUS" as const;
export const DISCOVERY_GOAL_ITEM_ID = "CTX_DISCOVERY_GOAL" as const;

/** C1 → adaptive path. This is the ONLY input to path selection.
 *  Exhaustive over ContextStatus by construction — the compiler enforces
 *  that a new status cannot be added without giving it a path. */
export const PATH_BY_CONTEXT_STATUS: Readonly<Record<ContextStatus, AdaptivePath>> = {
  exploring_security: "A",
  working_in_security: "B",
  developing_current_role: "C",
  changing_career_area: "D",
  security_leader: "E",
};

export const CONTEXT_STATUS_VALUES = Object.keys(PATH_BY_CONTEXT_STATUS) as ContextStatus[];

export const DISCOVERY_GOAL_VALUES: readonly DiscoveryGoal[] = [
  "find_direction",
  "confirm_direction",
  "discover_opportunities",
  "understand_strengths",
  "curious",
];

// -------------------------------------------------------------------------
// C1 — current status (locked)
// -------------------------------------------------------------------------

export const CONTEXT_STATUS_ITEM: DiscoveryItem = {
  id: CONTEXT_STATUS_ITEM_ID,
  kind: "context",
  itemVersion: 1,
  evidenceClass: "contextual_self_report",
  prompt: {
    // "Situation", not "statement": the question is about where the
    // candidate IS, and saying so is what keeps it out of C2's territory.
    sv: "Vilken situation beskriver dig bäst just nu?",
    en: "Which situation best describes you right now?",
  },
  axes: [],
  estimatedSeconds: 15,
  options: [
    {
      value: "exploring_security",
      label: {
        sv: "Jag är på väg in i säkerhetsbranschen — ny, eller på väg från en annan bransch",
        en: "I am moving into the security industry — new to it, or coming from another industry",
      },
    },
    {
      value: "working_in_security",
      label: {
        sv: "Jag arbetar redan inom säkerhet",
        en: "I already work in security",
      },
    },
    {
      value: "developing_current_role",
      label: {
        sv: "Jag vill utvecklas inom min nuvarande roll",
        en: "I want to develop within my current role",
      },
    },
    {
      value: "changing_career_area",
      label: {
        sv: "Jag vill byta säkerhetsområde",
        en: "I want to move into another Security Career Area",
      },
    },
    {
      value: "security_leader",
      label: {
        // Situation only. The old wording ("...and want to understand my
        // strengths better") repeated C2's own `understand_strengths` option.
        sv: "Jag leder andra inom säkerhet",
        en: "I lead others within security",
      },
    },
  ],
};

// -------------------------------------------------------------------------
// C2 — discovery goal (locked)
// -------------------------------------------------------------------------

export const DISCOVERY_GOAL_ITEM: DiscoveryItem = {
  id: DISCOVERY_GOAL_ITEM_ID,
  kind: "context",
  itemVersion: 1,
  evidenceClass: "contextual_self_report",
  prompt: {
    // Unchanged. C2 was always the outcome question; it was C1 that had
    // drifted into it.
    sv: "Vad hoppas du främst få ut av Career Discovery?",
    en: "What do you most hope to get from Career Discovery?",
  },
  axes: [],
  estimatedSeconds: 15,
  options: [
    {
      value: "find_direction",
      label: { sv: "Hitta rätt yrkesinriktning", en: "Find the right career direction" },
    },
    {
      value: "confirm_direction",
      label: { sv: "Bekräfta min nuvarande riktning", en: "Confirm my current direction" },
    },
    {
      value: "discover_opportunities",
      label: { sv: "Upptäcka nya möjligheter", en: "Discover new opportunities" },
    },
    {
      value: "understand_strengths",
      label: { sv: "Förstå mina styrkor", en: "Understand my strengths" },
    },
    {
      value: "curious",
      label: { sv: "Jag är mest nyfiken", en: "I am mostly curious" },
    },
  ],
};

export const CONTEXT_ITEMS: readonly DiscoveryItem[] = [CONTEXT_STATUS_ITEM, DISCOVERY_GOAL_ITEM];

/** Resolve the adaptive path from C1. Called once, at session creation.
 *  The result is persisted on the session row and never recomputed — see
 *  session.ts and the directive's §14 stability requirement. */
export function pathForContextStatus(status: ContextStatus): AdaptivePath {
  return PATH_BY_CONTEXT_STATUS[status];
}

export function isContextStatus(value: unknown): value is ContextStatus {
  return typeof value === "string" && (CONTEXT_STATUS_VALUES as string[]).includes(value);
}

export function isDiscoveryGoal(value: unknown): value is DiscoveryGoal {
  return typeof value === "string" && (DISCOVERY_GOAL_VALUES as string[]).includes(value);
}
