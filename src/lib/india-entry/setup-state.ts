// India entry — which setup step to open, derived from persisted rows.
//
// Same principle as the Passport first run (first-run.ts): no "setup done"
// flag. The step is a function of what the holder has actually saved, so a
// resumed session lands on the first unanswered question, and an answer given
// anywhere else in the product (the Profile page, the Passport) counts here.

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
  if (!nameStepComplete(s)) return "name";
  if (!s.location) return "location";
  // Destinations are optional, but ANSWERED is a saved row: skipping saves an
  // empty list, so a skipped question is not asked again.
  if (!s.preferences) return "destinations";
  if (s.credentials.length === 0) return "first";
  return "done";
}

/** The step number shown to the holder (1–4); "done" shows as the last step. */
export function stepNumber(step: SetupStep): number {
  return Math.min(SETUP_STEPS.indexOf(step) + 1, 4);
}
