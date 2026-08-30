// Profile completeness — a deterministic count of what has been filled in.
//
// ── WHAT THIS NUMBER IS ALLOWED TO MEAN ────────────────────────────────
//
// It measures ONE thing: how much of the professional profile contains an
// answer. It is not a quality score, not an employability score, not a
// ranking, and it is never compared between people. The wording the
// product uses says so — "Profil komplett till 78 %", never "your profile
// is 78% strong" — and the two are not interchangeable, because the second
// is a judgement about a person that this product does not make.
//
// It is also never shown to an employer. Nothing in the disclosure package,
// the application view or the recruiter surfaces reads it; it exists to
// tell the holder what is still empty.
//
// ── WHY IT IS A PURE FUNCTION AND NOT JSX ──────────────────────────────
//
// Because a percentage scattered across conditional rendering cannot be
// tested, cannot be versioned, and changes meaning every time somebody
// edits a component. This takes plain values and returns a plain result:
// `scripts/professional-identity-check.ts` runs it against fixed inputs and
// asserts the numbers, so a weight cannot move unnoticed.
//
// ── WHY THE VERSION STRING EXISTS ──────────────────────────────────────
//
// A stored 62% and a recomputed 71% are not a bug if the weights changed
// in between, but they ARE a bug if nobody can tell which happened. The
// version travels with the score.

import {
  EDUCATION_CLAIM_TYPES,
  LANGUAGE_CLAIM_TYPES,
  SKILL_CLAIM_TYPES,
  claimsOfType,
  type ProfessionalIdentityV1,
} from "./types";

export const PROFILE_COMPLETENESS_VERSION = "professional-profile-completeness-v1" as const;

/**
 * The sections, in the order the profile editor presents them.
 *
 * `nextBestField` walks this order, so a person is asked for the next thing
 * on the page they are already looking at rather than being sent somewhere
 * else for a lower-weight field.
 */
export type CompletenessSection =
  | "identity"
  | "profession"
  | "experience"
  | "location"
  | "employment"
  | "education"
  | "skills"
  | "languages"
  | "careerDirection";

/**
 * Weights, in percentage points, summing to exactly 100.
 *
 * The high weights are the fields without which nothing downstream works: a
 * CV with no headline and no employment history is not a CV, and a career
 * recommendation with no stated profession or experience band has nothing
 * to reason from. Languages and career direction are genuinely optional to
 * the rest of the product, and are weighted so that leaving them empty
 * cannot make a usable profile look unfinished.
 *
 * Asserted to sum to 100 by the guard script — a weight edit that forgets
 * its counterpart is a silent bug otherwise.
 */
export const COMPLETENESS_WEIGHTS: Readonly<Record<CompletenessSection, number>> = {
  identity: 18,
  profession: 14,
  employment: 20,
  experience: 10,
  location: 10,
  education: 9,
  skills: 9,
  languages: 6,
  careerDirection: 4,
};

export const COMPLETENESS_SECTION_ORDER: readonly CompletenessSection[] = [
  "identity",
  "profession",
  "experience",
  "location",
  "employment",
  "education",
  "skills",
  "languages",
  "careerDirection",
];

export interface ProfileCompleteness {
  /** 0–100, integer. Rounded once, at the end. */
  readonly score: number;
  readonly version: typeof PROFILE_COMPLETENESS_VERSION;
  readonly completedSections: readonly CompletenessSection[];
  readonly missingSections: readonly CompletenessSection[];
  /** The first missing section in presentation order, or null when the
   *  profile is complete. Drives one call to action, never a nag list. */
  readonly nextBestField: CompletenessSection | null;
}

/** Non-empty after trimming. `"   "` is not an answer. */
function filled(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Which sections currently hold an answer.
 *
 * Every predicate reads a value some other product owns, and none of them
 * cares whether it was verified: this counts ANSWERS, and a self-reported
 * answer is an answer. Verification is a separate question with its own
 * separate surface, and conflating the two here would produce a profile
 * that looks incomplete because nobody has reviewed it yet.
 */
export function completedSectionsFor(
  identity: ProfessionalIdentityV1,
): ReadonlySet<CompletenessSection> {
  const done = new Set<CompletenessSection>();

  // Identity needs a name AND something that says what this person does.
  // A name alone is an account, not a professional profile.
  if (filled(identity.displayName) && filled(identity.headline)) done.add("identity");

  if (filled(identity.currentProfessionSlug) || filled(identity.currentProfessionOther)) {
    done.add("profession");
  }

  if (filled(identity.yearsOfExperience)) done.add("experience");

  // Either country answers "where do you work". The Passport's is the more
  // specific of the two (it decides which regulated credentials may even be
  // claimed), so it is preferred, but an account country is still an answer.
  if (filled(identity.workCountry) || filled(identity.accountCountry)) done.add("location");

  if (identity.employment.length > 0) done.add("employment");

  if (claimsOfType(identity.claims, EDUCATION_CLAIM_TYPES).length > 0) done.add("education");
  if (claimsOfType(identity.claims, SKILL_CLAIM_TYPES).length > 0) done.add("skills");
  if (claimsOfType(identity.claims, LANGUAGE_CLAIM_TYPES).length > 0) done.add("languages");

  // Career direction is answered by having completed Career Discovery — the
  // product's own way of establishing where somebody is heading. It is NOT
  // answered by the assessment result being good, or by any property of it.
  if (identity.discovery.hasCompletedReport) done.add("careerDirection");

  return done;
}

export function computeProfileCompleteness(
  identity: ProfessionalIdentityV1,
): ProfileCompleteness {
  const done = completedSectionsFor(identity);

  let earned = 0;
  const completed: CompletenessSection[] = [];
  const missing: CompletenessSection[] = [];

  for (const section of COMPLETENESS_SECTION_ORDER) {
    if (done.has(section)) {
      earned += COMPLETENESS_WEIGHTS[section];
      completed.push(section);
    } else {
      missing.push(section);
    }
  }

  return {
    score: Math.round(earned),
    version: PROFILE_COMPLETENESS_VERSION,
    completedSections: completed,
    missingSections: missing,
    nextBestField: missing[0] ?? null,
  };
}
