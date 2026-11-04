// India entry — which setup step to open, derived from persisted rows.
//
// Same principle as the Passport first run (first-run.ts): no client-side
// "setup done" flag. The step is a function of what the holder has actually
// saved, so a resumed session lands on the first unanswered question, and an
// answer given anywhere else in the product (the Profile page, the Passport)
// counts here. "Done" is the database's own `onboarding_state = 'completed'`,
// written only by sp_passport_complete_setup with the holder's declaration.

import type { IndiaSetupState } from "./setup.functions";

export const SETUP_STEPS = ["name", "location", "destinations", "first", "done"] as const;
export type SetupStep = (typeof SETUP_STEPS)[number];

export function nameStepComplete(s: IndiaSetupState): boolean {
  return (
    (s.displayName?.trim().length ?? 0) >= 2 &&
    Boolean(s.professionSlug || s.professionOther?.trim())
  );
}

export function deriveSetupStep(s: IndiaSetupState): SetupStep {
  // A completed Passport is complete wherever the holder arrives from; the
  // setup shows its number rather than asking a question again.
  if (s.completed) return "done";
  if (!nameStepComplete(s)) return "name";
  if (!s.location) return "location";
  // Destinations are optional, but ANSWERED is a saved row: skipping saves an
  // empty list, so a skipped question is not asked again.
  if (!s.preferences) return "destinations";
  return "first";
}

/** At least one merit sp_passport_complete_setup counts: an active Passport
 *  credential or an active employment. A draft or a CV record is neither. */
export function hasCurrentPassportMerit(s: IndiaSetupState): boolean {
  return s.merits.credentials.length > 0 || s.merits.employments.length > 0;
}

/**
 * What the last step shows.
 *
 *   add        no current merit yet: add a credential or an employment
 *   confirm    the summary, the holder's own declaration and "Complete"
 *   completed  the Passport is complete; its number, and the way to it
 *
 * The SERVER still decides: "confirm" is the screen's reading of the same
 * rows, and a completion it refuses (a merit withdrawn in another tab) is
 * shown as the refusal it is.
 */
export type FinishMode = "add" | "confirm" | "completed";

export function finishMode(s: IndiaSetupState): FinishMode {
  if (s.completed) return "completed";
  return hasCurrentPassportMerit(s) ? "confirm" : "add";
}

/** The step number shown to the holder (1–4); "done" shows as the last step. */
export function stepNumber(step: SetupStep): number {
  return Math.min(SETUP_STEPS.indexOf(step) + 1, 4);
}
