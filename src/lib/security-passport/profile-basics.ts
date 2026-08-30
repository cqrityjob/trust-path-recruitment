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
// two different sixes.
//
// ── WHY THERE IS NO "X OF SIX ANSWERED" ────────────────────────────────
//
// There was, and it lied. Completeness was computed generically as "every
// required field of the step has a value", which is true of `purpose` for the
// empty reason that `purpose` has no fields at all — it is a page of
// explanation, not a question. A brand-new holder who had entered nothing
// therefore read "1 av 6 ifyllda", which states that they had supplied one
// answer. They had supplied none.
//
// The canonical model is still six steps and is not changed. What changed is
// that the six are no longer one countable kind. They are three:
//
//   * ONE informational step the holder reads and cannot answer.
//   * FOUR data-bearing steps, which are the only things a count of "filled
//     in" may ever range over.
//   * ONE declaration, which is an act with a date, not a field — it is
//     reported as given or not given, never as a fraction.
//
// So the count is "N of FOUR", the declaration has its own state, and the
// informational step is labelled as something to read. Nothing can be counted
// as answered that a holder did not answer.

import { ONBOARDING_STEPS } from "./onboarding";
import type { OnboardingStep } from "./onboarding";
import type { PassportCopyKey } from "./i18n";

/** The canonical six, in the order they are asked. Re-exported rather than
 *  copied so there is exactly one list in the codebase. */
export const PROFILE_BASICS_STEPS: readonly OnboardingStep[] = ONBOARDING_STEPS;

export const PROFILE_BASICS_COUNT = PROFILE_BASICS_STEPS.length;

/** What KIND of thing each of the six is, which decides how its status may be
 *  stated. This is the guard against re-introducing a count that ranges over
 *  something a holder cannot answer. */
export type BasicsStepKind =
  /** Explanation. Has no fields, cannot be answered, is never counted. */
  | "informational"
  /** Carries candidate-entered data. The only kind the count ranges over. */
  | "data"
  /** An act with a date. Reported as given or not given, never counted. */
  | "declaration";

export const BASICS_STEP_KIND: Readonly<Record<string, BasicsStepKind>> = {
  purpose: "informational",
  identity: "data",
  profession: "data",
  jurisdiction: "data",
  currentRole: "data",
  declaration: "declaration",
};

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
  // ── WHY PROFESSION MOVED FROM "inline" TO "delegated" ────────────────
  //
  // It was the third question on this card with its own writer, and the
  // only one of the three whose fact ALSO had a writer somewhere else
  // entirely: "Din karriärprofil" on /my-career wrote the same current
  // profession into security_career_profiles, this card wrote it into
  // sp_passport_profiles, and neither knew about the other. A holder who
  // corrected it here still found the old answer on /my-career, and the
  // product had no way to say which one it believed.
  //
  // That is the same defect the wizard's removal was meant to prevent --
  // two controls writing one fact -- except stretched across two pages,
  // where it was invisible. So profession is resolved exactly as
  // jurisdiction and currentRole already are: shown here in full, edited by
  // the one control that owns it. The difference is only that its canonical
  // editor is on another route rather than further down this page, which is
  // why DelegatedAction below now has two shapes.
  profession: "delegated",
  jurisdiction: "delegated",
  currentRole: "delegated",
  declaration: "inline",
};

/** Where a delegated answer is actually edited, and what to call the trip.
 *
 *  ── WHY THE ANCHOR ID LIVES HERE AND NOT IN THE COMPONENT ────────────
 *
 *  It is a contract between two sections of one page: the basics card
 *  promises to send the holder somewhere, and `WorkCountryCard` and the
 *  employment section promise to be there. Split across two files that
 *  promise drifts silently — the button keeps rendering, the scroll goes
 *  nowhere, and nothing fails. Kept together, one check can assert that every
 *  delegated step names a target and that the target exists.
 *
 *  The label is deliberately SPECIFIC. "Ändra längre ned på sidan" told the
 *  holder where the control was rather than what it did, which is the wrong
 *  half: they are looking for their work country, not for a location. */
/** Two shapes, because a canonical editor is not always on this page.
 *
 *  A discriminated union rather than two optional fields: an action must
 *  name exactly one destination, and a type that can express "both" or
 *  "neither" is a type that will eventually hold one. */
export type DelegatedAction =
  /** The editor is further down THIS page. `anchorId` is the id of the
   *  element that receives focus; it must be focusable. */
  | { readonly kind: "anchor"; readonly anchorId: string; readonly labelKey: PassportCopyKey }
  /** The editor is a different route. Used for facts the Passport shows but
   *  does not own -- see `profession` in BASICS_EDIT_MODE above. */
  | { readonly kind: "route"; readonly to: string; readonly labelKey: PassportCopyKey };

/** Where the canonical Professional Profile is edited. Stated once, here,
 *  so the Passport has exactly one place that knows the address. */
export const CAREER_PROFILE_ROUTE = "/my-career" as const;

export const BASICS_DELEGATED_ACTIONS: Readonly<Record<string, DelegatedAction>> = {
  profession: { kind: "route", to: CAREER_PROFILE_ROUTE, labelKey: "basics.editProfession" },
  jurisdiction: { kind: "anchor", anchorId: "sp-work-country", labelKey: "basics.editWorkCountry" },
  currentRole: { kind: "anchor", anchorId: "sp-employment", labelKey: "basics.editCurrentRole" },
};

/** The four steps a holder actually fills in. The ONLY set a "filled in"
 *  count may range over. */
export const DATA_BEARING_STEPS: readonly OnboardingStep[] = PROFILE_BASICS_STEPS.filter(
  (step) => BASICS_STEP_KIND[step.id] === "data",
);

export const DATA_BEARING_COUNT = DATA_BEARING_STEPS.length;

/** Reads one stored answer, by the same `stepId.fieldId` key the wizard uses.
 *
 *  A function rather than a record because the six answers do not live in one
 *  place: two are profile columns, one is a confirmed country, one is a real
 *  employment row and one is a timestamp. The caller resolves each from
 *  whatever holds it; this module only asks. */
export type BasicsAnswerReader = (stepId: string, fieldId: string) => string;

/** True when every REQUIRED field of the step has an answer.
 *
 *  Meaningful only for a data-bearing step. It is deliberately NOT exported as
 *  a way to ask about `purpose`: a step with no fields satisfies "every
 *  required field is filled" vacuously, and treating that as an answer is
 *  precisely the defect this module was corrected for. Callers ask
 *  `BASICS_STEP_KIND` first. */
export function isStepAnswered(step: OnboardingStep, read: BasicsAnswerReader): boolean {
  return step.fields
    .filter((field) => field.required)
    .every((field) => read(step.id, field.id).trim() !== "");
}

/** How many of the FOUR data-bearing steps the holder has filled in.
 *
 *  Never a percentage and never a bar: this is a count of answers given, not a
 *  measurement of a person. A holder who has entered nothing gets 0. */
export function answeredDataCount(read: BasicsAnswerReader): number {
  return DATA_BEARING_STEPS.filter((step) => isStepAnswered(step, read)).length;
}

/** Whether the truthfulness declaration has been given. Its own question,
 *  because it is an act and not a field. */
export function isDeclared(read: BasicsAnswerReader): boolean {
  return read("declaration", "declared").trim() !== "";
}
