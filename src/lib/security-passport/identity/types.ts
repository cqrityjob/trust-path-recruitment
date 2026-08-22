// Security Passport — the professional identity contract.
//
// ── FOUR OUTPUTS, NEVER MERGED ─────────────────────────────────────────
//
// A credential can contribute to four different things, and the whole
// honesty of the Passport depends on never collapsing them:
//
//   educationCompleted      you finished a course. Nothing more is implied.
//   professionalCompetence  you hold the competence a role is built on.
//   localEligibility        an authority currently permits you to work.
//   activeTitles            what you may currently be CALLED.
//
// They are four separate arrays rather than one list with a `kind` field so
// that a consumer has to choose which one it renders. A single array invites
// `.map()` over everything, and the first time somebody does that a completed
// VU1 appears next to an Ordningsvakt appointment as though they were the
// same kind of fact.
//
// ── WHY A TITLE CARRIES ITS SOURCES ────────────────────────────────────
//
// `sourceClaimIds` exists so every derived title is traceable to the claims
// that produced it. A title nobody can trace is a title nobody can dispute,
// correct or withdraw — and correction is a first-class right here, not a
// support ticket.

import type { AssertionLevel, IsoDate } from "../types";

export type TitleOutputKind =
  | "education_completed"
  | "professional_competence"
  | "local_eligibility"
  | "active_title";

/** One row of `sp_professional_titles`, in domain terms.
 *
 *  Structural rather than imported from the generated database types, for the
 *  same reason `CredentialType` is: this module must stay free of any database
 *  dependency so the separation check keeps it out of the server tier. */
export interface TitleRule {
  readonly code: string;
  readonly marketPackCode: string;
  readonly professionFamilyCode: string | null;
  readonly regulatedRoleCode: string | null;
  readonly outputKind: TitleOutputKind;
  /** The legal name in the market's own language. Not a translation target. */
  readonly nameLocal: string;
  /** A safe explanatory English name. Explains; never claims equivalence. */
  readonly nameEn: string;
  /** Null until a competent native/legal reviewer supplies it. */
  readonly nameAr: string | null;
  /** EVERY code must be held. An AND, never an OR — see `derive.ts`. */
  readonly requiresCredentialCodes: readonly string[];
  readonly requiresAssertionLevel: AssertionLevel;
  readonly requiresCurrentValidity: boolean;
  readonly priority: number;
}

/** One derived output. Never stored: recomputed on every read, so a licence
 *  that lapsed overnight has already stopped producing its title by morning. */
export interface DerivedTitle {
  readonly ruleCode: string;
  readonly outputKind: TitleOutputKind;
  readonly nameLocal: string;
  readonly nameEn: string;
  readonly nameAr: string | null;

  /** Where this means something. Always present on a derived title, because a
   *  title without its jurisdiction is the cross-market equivalence claim the
   *  whole product refuses to make. */
  readonly jurisdictionCode: string;
  readonly subJurisdictionCode: string | null;
  readonly marketPackCode: string;
  readonly regulatedRoleCode: string | null;
  readonly professionFamilyCode: string | null;

  /** The claims that satisfied the rule. */
  readonly sourceClaimIds: readonly string[];

  /** The WEAKEST evidence among the sources. A title is only as well backed
   *  as its least-backed input; taking the strongest would let one verified
   *  credential launder a self-declared one standing beside it. */
  readonly evidence: AssertionLevel;

  /** True when the rule's own evidence bar was not met and the title exists
   *  only because a preview was requested. Never true in a public derivation:
   *  `deriveVerifiedIdentity` cannot produce one. */
  readonly selfDeclared: boolean;

  /** Earliest expiry among the sources, if any. What the renewal engine reads. */
  readonly expiresOn: IsoDate | null;

  /** What the authorisation is limited to, when it is limited at all.
   *  Travels with the title: a skyddsvakt approval shown without its scope
   *  reads as a general national licence. */
  readonly scopeRestriction: string | null;
}

export interface ProfessionalIdentity {
  /** Stamped into every disclosure snapshot, so a shared Passport can always
   *  be explained by the rules that were in force when it was shared. */
  readonly engineVersion: string;
  readonly evaluatedOn: IsoDate;
  /** True when self-declared evidence was allowed in. Holder's private view
   *  only — see `visibility.ts`. */
  readonly includesSelfDeclared: boolean;

  readonly educationCompleted: readonly DerivedTitle[];
  readonly professionalCompetence: readonly DerivedTitle[];
  readonly localEligibility: readonly DerivedTitle[];
  readonly activeTitles: readonly DerivedTitle[];
}

/**
 * A derived title reduced to what a stranger may see.
 *
 * ── WHY THIS IS A TYPE AND NOT A FILTER ────────────────────────────────
 *
 * The social card is a PNG that outlives the record it depicts, so it may
 * carry the words and the jurisdiction and nothing else — no dates, no source
 * claim ids, no scope text. The first attempt passed a whole
 * `ProfessionalIdentity` to the social builder and the existing forbidden-key
 * guard immediately caught `expiresOn` reaching an exported image.
 *
 * Filtering at the serialiser would have fixed that instance and left the next
 * one to be caught by the same guard, or not caught at all. A type with no
 * date field on it cannot leak a date whatever the serialiser does.
 */
export interface PublicTitle {
  readonly ruleCode: string;
  readonly outputKind: TitleOutputKind;
  readonly nameLocal: string;
  readonly nameEn: string;
  readonly nameAr: string | null;
  readonly jurisdictionCode: string;
  readonly marketPackCode: string;
}
