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
// ── WHY IT COUNTS ONLY QUESTIONS THIS PERSON WAS ASKED ─────────────────
//
// v1 scored every section against every person, and that produced the
// defect this version exists to remove. `SecurityCareerProfileForm` reveals
// the profession and experience questions ONLY to somebody whose stated
// situation is "working in security" or "changing role"
// (`isAlreadyWorkingInSecurity`); for a career-changer, a student or a
// newcomer those fields are not merely unanswered, they are not rendered,
// and selecting that status actively clears them. A career-changer was
// therefore scored against 24 points of questions the product refuses to
// ask them, could not move the number from the page the product sent them
// to, and sat near 0% no matter what they did.
//
// So a section is now either APPLICABLE to this person or it is not, and
// the percentage is earned-over-applicable. A question nobody asked cannot
// count against the person who was not asked it. This is the same principle
// the rest of the file already held — it counts ANSWERS — extended to the
// prior question of which answers were ever possible.
//
// The sections stay whole regardless of who OWNS them: employment lives in
// the Passport and education lives in `sp_claims`, and both are still real
// questions this person can go and answer. "Owned elsewhere" is a routing
// fact, handled by `next-best-action.ts`, not a reason to stop counting.
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

import { isAlreadyWorkingInSecurity } from "@/lib/security-career-profile/types";
import {
  EDUCATION_CLAIM_TYPES,
  LANGUAGE_CLAIM_TYPES,
  SKILL_CLAIM_TYPES,
  claimsOfType,
  type ProfessionalIdentityV1,
} from "./types";

export const PROFILE_COMPLETENESS_VERSION = "professional-profile-completeness-v2" as const;

/**
 * The sections, in the order the profile editor presents them.
 *
 * `nextBestField` walks this order, so a person is asked for the next thing
 * on the page they are already looking at rather than being sent somewhere
 * else for a lower-weight field.
 */
export type CompletenessSection =
  /** The stated current situation — the first question the editor asks, and
   *  for somebody outside the industry the only one it asks. It scored
   *  nothing at all in v1, which is why a career-changer who answered
   *  everything put to them still read as an empty profile. */
  | "situation"
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
 * They sum to 100 across ALL sections; the score divides by the applicable
 * subset, so the total is a denominator rather than a target. Asserted to
 * sum to 100 by the guard script — a weight edit that forgets its
 * counterpart is a silent bug otherwise.
 */
export const COMPLETENESS_WEIGHTS: Readonly<Record<CompletenessSection, number>> = {
  situation: 8,
  identity: 16,
  profession: 12,
  experience: 8,
  location: 10,
  employment: 18,
  education: 8,
  skills: 8,
  languages: 6,
  careerDirection: 6,
};

export const COMPLETENESS_SECTION_ORDER: readonly CompletenessSection[] = [
  "situation",
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
  /** 0–100, integer. Earned over APPLICABLE weight, rounded once at the end. */
  readonly score: number;
  readonly version: typeof PROFILE_COMPLETENESS_VERSION;
  readonly completedSections: readonly CompletenessSection[];
  /** Applicable to this person, and still empty. Never contains a section
   *  the product would not ask them for. */
  readonly missingSections: readonly CompletenessSection[];
  /** Every section this person can actually be asked, in presentation
   *  order. The profile page renders exactly these. */
  readonly applicableSections: readonly CompletenessSection[];
  /** Sections the product does not ask THIS person — the profession and
   *  experience follow-ups for somebody who does not work in security.
   *  Carried so a surface can omit them rather than draw them as failures. */
  readonly notApplicableSections: readonly CompletenessSection[];
  /** The first missing applicable section in presentation order, or null
   *  when everything applicable is answered. Drives one call to action,
   *  never a nag list. */
  readonly nextBestField: CompletenessSection | null;
}

/** Non-empty after trimming. `"   "` is not an answer. */
function filled(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Which sections this person is actually asked for.
 *
 * Only two sections are ever withheld, and for one reason: the editor does
 * not render them. `isAlreadyWorkingInSecurity` is the SAME predicate
 * `SecurityCareerProfileForm` gates the profession and experience questions
 * on, imported rather than restated so the form and the score cannot drift
 * into disagreeing about which questions exist.
 *
 * A value already on record keeps its section applicable even when the
 * current status would not reveal it. Somebody who answered as a serving
 * guard and later marks themselves a career-changer keeps the credit for
 * what they told us; the score is not a trap that springs on a status
 * change.
 */
export function applicableSectionsFor(
  identity: ProfessionalIdentityV1,
): ReadonlySet<CompletenessSection> {
  const asksFollowUps = isAlreadyWorkingInSecurity(identity.currentStatus);
  const hasProfession =
    filled(identity.currentProfessionSlug) || filled(identity.currentProfessionOther);
  const hasExperience = filled(identity.yearsOfExperience);

  // Built by selection rather than by removal from a full set. The guard
  // script scans this directory for `.delete(` as a table write, and a Set
  // that happens to share a method name with a mutation is not a reason to
  // loosen a check that exists to keep these engines pure.
  return new Set<CompletenessSection>(
    COMPLETENESS_SECTION_ORDER.filter((section) => {
      if (section === "profession") return asksFollowUps || hasProfession;
      if (section === "experience") return asksFollowUps || hasExperience;
      return true;
    }),
  );
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

  // The situation question, answered. `other` counts: the person answered
  // what was put to them, and "Annat" is information about the options
  // rather than a refusal. What `other` may not do is place somebody on a
  // career ladder, which is career-journey/readiness.ts's rule, not this
  // file's.
  if (filled(identity.currentStatus)) done.add("situation");

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

export function computeProfileCompleteness(identity: ProfessionalIdentityV1): ProfileCompleteness {
  const done = completedSectionsFor(identity);
  const applicable = applicableSectionsFor(identity);

  let earned = 0;
  let possible = 0;
  const completed: CompletenessSection[] = [];
  const missing: CompletenessSection[] = [];
  const applicableOrdered: CompletenessSection[] = [];
  const notApplicable: CompletenessSection[] = [];

  for (const section of COMPLETENESS_SECTION_ORDER) {
    if (!applicable.has(section)) {
      notApplicable.push(section);
      continue;
    }
    applicableOrdered.push(section);
    possible += COMPLETENESS_WEIGHTS[section];

    if (done.has(section)) {
      earned += COMPLETENESS_WEIGHTS[section];
      completed.push(section);
    } else {
      missing.push(section);
    }
  }

  return {
    // `possible` cannot reach 0 while any section is unconditional, but a
    // division that CAN produce NaN has no business shipping next to a
    // person's own profile.
    score: possible > 0 ? Math.round((earned / possible) * 100) : 0,
    version: PROFILE_COMPLETENESS_VERSION,
    completedSections: completed,
    missingSections: missing,
    applicableSections: applicableOrdered,
    notApplicableSections: notApplicable,
    nextBestField: missing[0] ?? null,
  };
}
