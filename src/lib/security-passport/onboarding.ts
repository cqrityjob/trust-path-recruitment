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

/**
 * The wizard, after Phase 8.
 *
 * ── WHY IT IS SIX STEPS AND NOT THIRTEEN ───────────────────────────────
 *
 * Seven of the original steps — previous employment, authorisations,
 * education, courses, certifications, specialisations and languages —
 * rendered a heading, an explanation and a Continue button, with no fields
 * and nothing to store. They were list-shaped content in a question-shaped
 * container: a wizard asks each thing once, but a career is five jobs and
 * four courses, added over weeks.
 *
 * Those seven are now sections on /passport/information, where a holder can
 * add, edit and remove as many entries as they have, into the real tables.
 * What remains here is exactly the profile-level facts that ARE asked once.
 */
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
    // ── WHERE YOU WORK IS NOT WHICH CREDENTIALS WE SUPPORT ──────────────
    //
    // This select used to offer Sweden and nothing else, because it was built
    // from the ACTIVE market packs. That silently conflated two independent
    // facts, and the conflation was not harmless: a holder working in Dubai
    // had no way to say so, `sp_passport_profiles.jurisdiction_code` kept its
    // `DEFAULT 'SE'`, and their Passport Card then told every reader they were
    // in Sweden. The product asserted a false country about a real person.
    //
    // The two questions are now answered separately:
    //
    //   * THIS step asks the person's country of work. Its options are the
    //     countries in `sp_jurisdictions` — SE, GB and AE — which the profile
    //     column's foreign key already accepts, so no schema change is needed.
    //
    //   * CREDENTIAL availability stays exactly where it was: the credential
    //     form still builds its own jurisdiction select from the ACTIVE market
    //     packs alone, so choosing GB or AE here grants nothing. A closed
    //     market is still closed, and no unsupported regulated claim can be
    //     recorded.
    //
    // The body copy states that split rather than implying the country list
    // is a list of open markets.
    bodyKey: "jurisdiction.workCountryAvailability",
    required: true,
    createsClaim: false,
    fields: [
      {
        id: "jurisdiction",
        labelKey: "onboarding.jurisdiction.field",
        type: "select",
        required: true,
        // Mirrors sp_jurisdictions. Sub-jurisdictions (AE-DU) are deliberately
        // absent: the profile column is a country FK, and naming the emirate
        // would need a column that does not exist yet. "United Arab Emirates"
        // is true for a Dubai worker; "Sweden" was not.
        options: [
          { value: "SE", label: "Sverige / Sweden" },
          { value: "GB", label: "Storbritannien / United Kingdom" },
          { value: "AE", label: "Förenade Arabemiraten / United Arab Emirates" },
        ],
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
