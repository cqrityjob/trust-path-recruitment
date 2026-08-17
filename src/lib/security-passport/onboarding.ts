// Security Passport — the progressive onboarding definition.
//
// One question group per step, in the order a Väktare would actually think
// about their career: who you are, what you do and where, then what you
// have done, then what backs it up, then a declaration.
//
// Every step carries its own "why we ask" copy. That is not decoration:
// asking a person for their employment history without saying what it is
// for is how a product loses trust in its first thirty seconds.
//
// `createsClaim` marks the steps whose answers become SELF_DECLARED entries.
// The UI states that at the point of creation rather than explaining it
// later in a legend (Product Architecture v1.1 §10).
//
// Content only — no state, no persistence, no rendering.

import type { PassportCopyKey } from "./i18n";

export interface OnboardingField {
  readonly id: string;
  readonly labelKey: PassportCopyKey;
  readonly type: "text" | "date" | "select" | "checkbox";
  readonly required: boolean;
  /** Fixed options for `select`, as copy keys or literal display values. */
  readonly options?: readonly { readonly value: string; readonly label: string }[];
}

export interface OnboardingStep {
  readonly id: string;
  readonly titleKey: PassportCopyKey;
  readonly whyKey: PassportCopyKey;
  readonly bodyKey?: PassportCopyKey;
  readonly required: boolean;
  /** True when completing this step would create a SELF_DECLARED entry. */
  readonly createsClaim: boolean;
  readonly fields: readonly OnboardingField[];
}

export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  {
    id: "purpose",
    titleKey: "onboarding.purpose.title",
    whyKey: "onboarding.purpose.why",
    bodyKey: "onboarding.purpose.body",
    required: true,
    createsClaim: false,
    fields: [],
  },
  {
    id: "identity",
    titleKey: "onboarding.identity.title",
    whyKey: "onboarding.identity.why",
    required: true,
    createsClaim: false,
    fields: [
      { id: "displayName", labelKey: "onboarding.identity.name", type: "text", required: true },
      { id: "headline", labelKey: "onboarding.identity.headline", type: "text", required: false },
    ],
  },
  {
    id: "profession",
    titleKey: "onboarding.profession.title",
    whyKey: "onboarding.profession.why",
    required: true,
    createsClaim: false,
    fields: [
      {
        id: "profession",
        labelKey: "onboarding.profession.field",
        type: "select",
        required: true,
        options: [
          { value: "vaktare", label: "Väktare / Security Officer" },
          { value: "ordningsvakt", label: "Ordningsvakt / Public Order Guard" },
          { value: "skyddsvakt", label: "Skyddsvakt / Protective Security Guard" },
        ],
      },
    ],
  },
  {
    id: "jurisdiction",
    titleKey: "onboarding.jurisdiction.title",
    whyKey: "onboarding.jurisdiction.why",
    required: true,
    createsClaim: false,
    fields: [
      {
        id: "jurisdiction",
        labelKey: "onboarding.jurisdiction.field",
        type: "select",
        required: true,
        options: [{ value: "SE", label: "Sverige / Sweden" }],
      },
    ],
  },
  {
    id: "currentRole",
    titleKey: "onboarding.currentRole.title",
    whyKey: "onboarding.currentRole.why",
    required: true,
    createsClaim: true,
    fields: [
      { id: "employer", labelKey: "onboarding.currentRole.employer", type: "text", required: true },
      { id: "role", labelKey: "onboarding.currentRole.role", type: "text", required: true },
      {
        id: "startedOn",
        labelKey: "onboarding.currentRole.startedOn",
        type: "date",
        required: true,
      },
    ],
  },
  {
    id: "history",
    titleKey: "onboarding.history.title",
    whyKey: "onboarding.history.why",
    bodyKey: "onboarding.history.body",
    required: false,
    createsClaim: true,
    fields: [],
  },
  {
    id: "licence",
    titleKey: "onboarding.licence.title",
    whyKey: "onboarding.licence.why",
    bodyKey: "onboarding.licence.body",
    required: false,
    createsClaim: true,
    fields: [],
  },
  {
    id: "education",
    titleKey: "onboarding.education.title",
    whyKey: "onboarding.education.why",
    required: false,
    createsClaim: true,
    fields: [],
  },
  {
    id: "training",
    titleKey: "onboarding.training.title",
    whyKey: "onboarding.training.why",
    required: false,
    createsClaim: true,
    fields: [],
  },
  {
    id: "certification",
    titleKey: "onboarding.certification.title",
    whyKey: "onboarding.certification.why",
    required: false,
    createsClaim: true,
    fields: [],
  },
  {
    id: "specialisation",
    titleKey: "onboarding.specialisation.title",
    whyKey: "onboarding.specialisation.why",
    bodyKey: "onboarding.specialisation.body",
    required: false,
    createsClaim: true,
    fields: [],
  },
  {
    id: "languages",
    titleKey: "onboarding.languages.title",
    whyKey: "onboarding.languages.why",
    required: false,
    createsClaim: false,
    fields: [],
  },
  {
    id: "declaration",
    titleKey: "onboarding.declaration.title",
    whyKey: "onboarding.declaration.why",
    bodyKey: "onboarding.declaration.body",
    required: true,
    createsClaim: false,
    fields: [
      {
        id: "declared",
        labelKey: "onboarding.declaration.checkbox",
        type: "checkbox",
        required: true,
      },
    ],
  },
] as const;

export const ONBOARDING_STEP_COUNT = ONBOARDING_STEPS.length;
