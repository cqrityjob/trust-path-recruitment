// Security Passport — the six profile basics, as a readable state.
//
// ── WHY THIS MODULE EXISTS ─────────────────────────────────────────────
//
// The six questions that build a Passport were only ever askable inside the
// onboarding wizard, and commit 9a150a6 removed the wizard's navigation entry
// on the correct grounds that a permanent tab into a first-run flow gives the
// product two answers to "where does my employment live". Nothing replaced it
// for the PROFILE-LEVEL facts, so a holder who finished onboarding could no
// longer see or correct their own name, headline, profession, country, current
// role or declaration. `WorkCountryCard` rescued exactly one of the six; this
// module is the domain half of rescuing the rest.
//
// ── THE SIX ARE NOT RE-DECLARED HERE ───────────────────────────────────
//
// Everything below is derived from `ONBOARDING_STEPS`. A second hand-written
// list of six would be a second answer to "which questions build a Passport",
// and the first time somebody edited one list the product would quietly hold
// two different sixes. Completeness is computed from each step's own
// `required` flags, so adding a required field to a step makes that step
// incomplete for everyone automatically, with no edit here.
//
// Content and calculation only — no state, no persistence, no rendering.

import { ONBOARDING_STEPS } from "./onboarding";
import type { OnboardingStep } from "./onboarding";

/** The canonical six, in the order they are asked. Re-exported rather than
 *  copied so there is exactly one list in the codebase. */
export const PROFILE_BASICS_STEPS: readonly OnboardingStep[] = ONBOARDING_STEPS;

export const PROFILE_BASICS_COUNT = PROFILE_BASICS_STEPS.length;

/** How an answer is edited, which is not the same for all six.
 *
 *  Two of the questions already have a permanent, canonical editor of their
 *  own on the same page — the work country (`WorkCountryCard`) and employment
 *  (`ExperienceForm`). Giving the basics card its own writer for those would
 *  recreate the very defect the wizard's removal was meant to prevent: two
 *  controls writing one fact, disagreeing the moment either is used. So those
 *  two are SHOWN here and EDITED there, and this type is what tells the
 *  renderer which is which. */
export type BasicsEditMode =
  /** No answer exists to give; the step is explanatory. */
  | "informational"
  /** Edited inline, in the basics card itself. */
  | "inline"
  /** Edited by its own canonical control further down the same page. */
  | "delegated";

export const BASICS_EDIT_MODE: Readonly<Record<string, BasicsEditMode>> = {
  purpose: "informational",
  identity: "inline",
  profession: "inline",
  jurisdiction: "delegated",
  currentRole: "delegated",
  declaration: "inline",
};

/** Reads one stored answer, by the same `stepId.fieldId` key the wizard uses.
 *
 *  A function rather than a record because the six answers do not live in one
 *  place: two are profile columns, one is a confirmed country, one is a real
 *  employment row and one is a timestamp. The caller resolves each from
 *  whatever holds it; this module only asks. */
export type BasicsAnswerReader = (stepId: string, fieldId: string) => string;

/** True when every REQUIRED field of the step has an answer.
 *
 *  `purpose` has no fields at all, so it is vacuously complete — which is the
 *  truth about it: there is nothing for the holder to fill in, only something
 *  to read. The renderer says so in words rather than letting the count look
 *  like an off-by-one. */
export function isStepAnswered(step: OnboardingStep, read: BasicsAnswerReader): boolean {
  return step.fields
    .filter((field) => field.required)
    .every((field) => read(step.id, field.id).trim() !== "");
}

/** How many of the six are answered. Never a percentage and never a bar: this
 *  is a count of questions, not a measurement of a person. */
export function answeredCount(read: BasicsAnswerReader): number {
  return PROFILE_BASICS_STEPS.filter((step) => isStepAnswered(step, read)).length;
}
