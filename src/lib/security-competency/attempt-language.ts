// The language an assessment attempt is delivered in.
//
// ── THE CONTRACT ────────────────────────────────────────────────────────
//
//   ASSIGNED LANGUAGE        assessment_assignments.language, chosen by the
//                            employer when the assessment was assigned
//     = INITIAL RUNNER LANGUAGE   what the candidate sees on first open
//     = ACTUAL DELIVERY LANGUAGE  what every item and section is served in
//     = REPORT CONTEXT LANGUAGE   what scp_release_attempt_report freezes
//                                 into the report's context from the same
//                                 assignment row
//
// The four are one value on purpose. The runner used to read the site-wide
// language toggle (localStorage "cqrityjob.lang") instead, so an employer who
// assigned English to an English-speaking candidate saw that candidate open
// the assessment in Swedish in a fresh browser -- and the released report then
// stated "Language: en" about a run that was never delivered in English.
//
// Delivery is therefore LOCKED to the assigned language for the whole attempt.
// The site toggle is not offered inside a run: SV and EN share the same item
// identities, option ids and scoring, so a switch would not corrupt the
// answers, but nothing records which language an answer was given in, and a
// report that names a language nobody used is the defect this file closes.
//
// The site language is only ever the FALLBACK, for an attempt whose assignment
// carries no language (rows that predate the column, or an attempt with no
// assignment at all). It never overrides an assignment that has one.

import type { Lang } from "@/i18n/dictionaries";

/** What the assignment stored. Anything else is treated as "not stated". */
export type AssignedLanguage = "sv" | "en" | null;

/** Normalise the raw assignment value. The column is CHECK-constrained to
 *  'sv' | 'en', but this is read over the wire and defended anyway. */
export function normaliseAssignedLanguage(raw: unknown): AssignedLanguage {
  return raw === "sv" || raw === "en" ? raw : null;
}

/** The language THIS attempt is delivered in.
 *
 *  The assignment wins whenever it states one. The site preference is used
 *  only when it does not -- it is never allowed to override the employer's
 *  choice on first load, and because the result is fixed for the attempt it
 *  cannot override it later either. */
export function resolveAttemptLanguage(assigned: AssignedLanguage, siteLang: Lang): Lang {
  return assigned ?? siteLang;
}
