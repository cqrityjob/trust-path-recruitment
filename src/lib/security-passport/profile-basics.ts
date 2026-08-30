// Security Passport — the six profile basics, as a readable state.
//
// The canonical six are derived from ONBOARDING_STEPS. This module also owns
// the delegation contract for facts whose editor lives somewhere else.

import { ONBOARDING_STEPS } from "./onboarding";
import type { OnboardingStep } from "./onboarding";
import type { PassportCopyKey } from "./i18n";

export const PROFILE_BASICS_STEPS: readonly OnboardingStep[] = ONBOARDING_STEPS;
export const PROFILE_BASICS_COUNT = PROFILE_BASICS_STEPS.length;

export type BasicsStepKind = "informational" | "data" | "declaration";

export const BASICS_STEP_KIND: Readonly<Record<string, BasicsStepKind>> = {
  purpose: "informational",
  identity: "data",
  profession: "data",
  jurisdiction: "data",
  currentRole: "data",
  declaration: "declaration",
};

export type BasicsEditMode = "informational" | "inline" | "delegated";

export const BASICS_EDIT_MODE: Readonly<Record<string, BasicsEditMode>> = {
  purpose: "informational",
  identity: "inline",
  profession: "delegated",
  jurisdiction: "delegated",
  currentRole: "delegated",
  declaration: "inline",
};

export type DelegatedAction =
  | { readonly kind: "anchor"; readonly anchorId: string; readonly labelKey: PassportCopyKey }
  | { readonly kind: "route"; readonly to: string; readonly labelKey: PassportCopyKey };

/** Canonical route for the Professional Profile. */
export const CAREER_PROFILE_ROUTE = "/my-career" as const;

/**
 * Passport does not own current profession. This URL carries an explicit edit
 * intent to the canonical Career Profile editor and a return origin. Keeping
 * it here makes the Passport-side href and the receiving UI one contract.
 */
export const CAREER_PROFILE_PROFESSION_EDIT_HREF =
  "/my-career?edit=profession&from=passport#career-profile" as const;

export const BASICS_DELEGATED_ACTIONS: Readonly<Record<string, DelegatedAction>> = {
  profession: {
    kind: "route",
    to: CAREER_PROFILE_PROFESSION_EDIT_HREF,
    labelKey: "basics.editProfession",
  },
  jurisdiction: {
    kind: "anchor",
    anchorId: "sp-work-country",
    labelKey: "basics.editWorkCountry",
  },
  currentRole: {
    kind: "anchor",
    anchorId: "sp-employment",
    labelKey: "basics.editCurrentRole",
  },
};

export const DATA_BEARING_STEPS: readonly OnboardingStep[] = PROFILE_BASICS_STEPS.filter(
  (step) => BASICS_STEP_KIND[step.id] === "data",
);

export const DATA_BEARING_COUNT = DATA_BEARING_STEPS.length;

export type BasicsAnswerReader = (stepId: string, fieldId: string) => string;

export function isStepAnswered(step: OnboardingStep, read: BasicsAnswerReader): boolean {
  return step.fields
    .filter((field) => field.required)
    .every((field) => read(step.id, field.id).trim() !== "");
}

export function answeredDataCount(read: BasicsAnswerReader): number {
  return DATA_BEARING_STEPS.filter((step) => isStepAnswered(step, read)).length;
}

export function isDeclared(read: BasicsAnswerReader): boolean {
  return read("declaration", "declared").trim() !== "";
}
