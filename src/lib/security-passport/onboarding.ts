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
  /** Fixed options for `select`.
   *
   *  `labelKey` is preferred and `label` is the legacy literal. The two exist
   *  side by side because they answer different questions:
   *
   *    * A COUNTRY is not a legal term. "Sweden" and "Sverige" are the same
   *      place, so a reader should see it once, in their own language, and the
   *      option carries a `labelKey`.
   *
   *    * A PROFESSION is a legal term. "Väktare" is what the Swedish
   *      authorisation is called, and rendering it as "Security Officer" alone
   *      would drop the word that appears on the credential — so those options
   *      keep the bilingual literal on purpose, matching `labelFor` in
   *      identity/presentation.ts.
   *
   *  A renderer prefers `labelKey` and falls back to `label`. */
  readonly options?: readonly {
    readonly value: string;
    readonly label?: string;
    readonly labelKey?: PassportCopyKey;
  }[];
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
    //   * THIS step asks where the person works: the countries in
    //     `sp_jurisdictions`, plus Dubai, which is a sub-jurisdiction and gets
    //     its own answer so an emirate is never flattened into its country.
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
        // The countries in `sp_jurisdictions`, plus Dubai as its own answer.
        //
        // Dubai is listed separately rather than folded into "United Arab
        // Emirates" because SIRA licenses the emirate and not the country, and
        // a product that records a Dubai worker as "UAE" has already made the
        // UAE-wide claim its market pack exists to refuse. The value carries
        // the sub-jurisdiction code; `splitWorkCountry` below turns it into the
        // country and emirate the profile stores in separate columns.
        //
        // Copy keys, not literals. These read as "Sverige / Sweden" in one
        // option, which asked a Swedish reader to skip past English and an
        // English reader to skip past Swedish. A country is not a legal term
        // that has to be shown in its original — see the note on the type.
        options: [
          { value: "SE", labelKey: "jurisdiction.SE" },
          { value: "GB", labelKey: "jurisdiction.GB" },
          { value: "AE-DU", labelKey: "jurisdiction.option.AE-DU" },
          { value: "AE", labelKey: "jurisdiction.option.AE" },
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

/**
 * One onboarding answer → the two columns the profile stores.
 *
 * The country step offers Dubai as its own option because SIRA licenses the
 * emirate and not the country, so "AE-DU" has to be a thing a holder can
 * actually say. The profile keeps country and sub-jurisdiction apart —
 * `sp_profile_sub_matches_country` enforces that they agree — so the answer is
 * split here, in one place, rather than at each call site.
 *
 * An empty answer stays empty: a holder who has not chosen has no country, and
 * inventing one is the whole defect this replaced.
 */
export function splitWorkCountry(answer: string | null | undefined): {
  readonly jurisdictionCode: string | null;
  readonly subJurisdictionCode: string | null;
} {
  const value = (answer ?? "").trim();
  if (!value) return { jurisdictionCode: null, subJurisdictionCode: null };
  // "AE-DU" -> country AE, emirate AE-DU. A bare country has no emirate.
  const dash = value.indexOf("-");
  if (dash === -1) return { jurisdictionCode: value, subJurisdictionCode: null };
  return { jurisdictionCode: value.slice(0, dash), subJurisdictionCode: value };
}

/** A holder's work location, as it may be SHOWN to anyone.
 *
 * Reading `jurisdiction_code` directly is the bug this exists to prevent. The
 * column carries two different facts that look identical: a country the holder
 * chose, and the `DEFAULT 'SE'` that was written before they were ever asked.
 * `work_location_confirmed_at` is what separates them, and every surface has to
 * respect it or the old false assertion simply reappears one layer up.
 *
 * Unconfirmed reads as "not stated" — the same as a brand-new Passport — while
 * the stored value stays on the profile for the holder to confirm or correct.
 */
export function confirmedWorkLocation(
  profile: {
    readonly jurisdictionCode: string | null;
    readonly subJurisdictionCode: string | null;
    readonly workLocationConfirmedAt: string | null;
  } | null,
): { readonly jurisdictionCode: string | null; readonly subJurisdictionCode: string | null } {
  if (!profile?.workLocationConfirmedAt || !profile.jurisdictionCode) {
    return { jurisdictionCode: null, subJurisdictionCode: null };
  }
  return {
    jurisdictionCode: profile.jurisdictionCode,
    subJurisdictionCode: profile.subJurisdictionCode,
  };
}

/** True when the holder should be asked where they work.
 *
 *  Covers both the new Passport with no country and the legacy row whose 'SE'
 *  nobody chose — deliberately the same prompt, because they are the same
 *  question. */
export function needsWorkLocationConfirmation(
  profile: { readonly workLocationConfirmedAt: string | null } | null,
): boolean {
  return !profile?.workLocationConfirmedAt;
}
