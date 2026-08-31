// How long Security Career Discovery v3.1 actually takes.
//
// ── WHY THIS IS A MODULE AND NOT A NUMBER IN COPY ──────────────────────
//
// Because it was a number in copy, in five places, and they did not agree.
// One 28-question instrument was advertised as "about 5 minutes" on the
// Career Center hub and the profession guides, "about 12–15 minutes" on the
// Discovery landing and preparation screens, and "about 15 minutes" on the
// Career Card — and the Discovery landing page managed to say 5 in its own
// meta description and 12–15 in its own fact list.
//
// Two of those are not roundings of each other. Somebody told they were five
// minutes from a career direction, and then asked twenty-eight questions,
// has been misled about the product before it has told them anything — and
// the same page then asks them to trust its recommendation.
//
// So the figure is DERIVED from the instrument and stated once. Changing the
// instrument moves the estimate; the guard below fails the build if the
// claim and the estimate ever part company again, exactly the way
// MVP_QUESTION_COUNT already refuses to let the question count drift.
//
// ── WHERE THE SECONDS COME FROM ────────────────────────────────────────
//
// The v3.0 instrument authored a per-item `estimatedSeconds` and its
// preparation screen has claimed 12–15 minutes off those numbers since it
// shipped (see ../session.ts's `estimatedMinutes`, whose range assertion
// lives in scripts/career-discovery-check.ts). v3.1 reuses v3.0's context
// and adaptive items verbatim, and its 22 Career DNA items are the same two
// formats answered the same way, so the same authored values apply. They are
// restated here per FORMAT rather than copied onto 28 item definitions:
// adding a field to every item would move CONTENT_VERSION, and a rephrasing
// version is not what "we measured how long it takes" means.
//
// These are estimates of reading-and-answering time. They are not a promise,
// which is why every surface says "about".

import { ADAPTIVE_ITEMS_PER_SESSION, CONTEXT_ITEMS, MVP_QUESTION_COUNT } from "./personal-layer";
import { CORE_ITEMS } from "./core-items";
import type { Bilingual } from "./version";

/** Authored per-item answering time, by the role the item plays in the
 *  session. Same values ../context-items.ts, ../core-items.ts and
 *  ../adaptive-items.ts carry for v3.0's identically-formatted items. */
export const ESTIMATED_SECONDS_BY_ROLE = {
  /** C1/C2 — short, closed, no reflection required. */
  context: 15,
  /** CQ01–CQ22 — a 1–10 scale or one of five options, with a stem to read. */
  careerDna: 28,
  /** The four Discovery Path items — longer stems, free-er choices. */
  adaptive: 30,
} as const;

export const ESTIMATED_SECONDS =
  CONTEXT_ITEMS.length * ESTIMATED_SECONDS_BY_ROLE.context +
  CORE_ITEMS.length * ESTIMATED_SECONDS_BY_ROLE.careerDna +
  ADAPTIVE_ITEMS_PER_SESSION * ESTIMATED_SECONDS_BY_ROLE.adaptive;

/** One decimal, so a small content change is visible rather than rounded
 *  away before the range assertion below can see it. */
export const ESTIMATED_MINUTES = Math.round((ESTIMATED_SECONDS / 60) * 10) / 10;

/** The ONE duration any candidate-facing surface may state, as a range,
 *  because a single number would be a precision the estimate does not have.
 *
 *  Every surface that mentions how long Discovery takes renders this — the
 *  landing page, the preparation screen, the Career Center hub, the
 *  profession guides and the Career Card's empty state. There is no second
 *  copy of it in the i18n dictionaries. */
export const DURATION_CLAIM_MINUTES = { low: 12, high: 15 } as const;

export const DURATION_CLAIM: Bilingual = {
  sv: `Cirka ${DURATION_CLAIM_MINUTES.low}–${DURATION_CLAIM_MINUTES.high} minuter`,
  en: `About ${DURATION_CLAIM_MINUTES.low}–${DURATION_CLAIM_MINUTES.high} minutes`,
};

/** Sentence form, for copy that runs the claim into prose rather than
 *  listing it as a fact. Lower-cased lead so it reads inside a sentence. */
export const DURATION_CLAIM_SENTENCE: Bilingual = {
  sv: `Det tar ungefär ${DURATION_CLAIM_MINUTES.low}–${DURATION_CLAIM_MINUTES.high} minuter.`,
  en: `It takes approximately ${DURATION_CLAIM_MINUTES.low}–${DURATION_CLAIM_MINUTES.high} minutes.`,
};

// ── THE CLAIM MUST CONTAIN THE ESTIMATE ─────────────────────────────────
//
// Import-time, like MVP_QUESTION_COUNT's own assertion two files over, so a
// content change that lengthens the instrument past its advertised range
// fails the moment anything loads the module rather than in review. One
// minute of slack on each side: the estimate is per-item answering time and
// does not model the preparation screen or a reader who pauses.
if (
  ESTIMATED_MINUTES < DURATION_CLAIM_MINUTES.low - 1 ||
  ESTIMATED_MINUTES > DURATION_CLAIM_MINUTES.high + 1
) {
  throw new Error(
    `career-discovery v3.1: estimated session length ${ESTIMATED_MINUTES} min is outside the ` +
      `advertised ${DURATION_CLAIM_MINUTES.low}-${DURATION_CLAIM_MINUTES.high} min claim. ` +
      `Update DURATION_CLAIM_MINUTES and every surface follows, or shorten the instrument.`,
  );
}

if (CONTEXT_ITEMS.length + CORE_ITEMS.length + ADAPTIVE_ITEMS_PER_SESSION !== MVP_QUESTION_COUNT) {
  throw new Error(
    "career-discovery v3.1: the duration estimate does not cover every question in the session",
  );
}
