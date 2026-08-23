// Security Passport — the five live disclosure packages.
//
// ── WHY THIS FILE IS SEPARATE FROM disclosure.ts ───────────────────────
//
// `disclosure.ts` is the Phase 1 fixture prototype's package model: it
// builds a payload client-side from fixtures so the contract could be
// reviewed before a database existed. That is still what the dev-only
// prototype renders, and it is deliberately left alone.
//
// This file is the LIVE contract. The authority for what a package contains
// is `sp_get_disclosure` in the database — assembled server-side from the
// package code. Nothing here filters, hides or assembles anything. It exists
// so the holder can be shown, honestly and in their own language, what they
// are about to hand over BEFORE they hand it over.
//
// If these two ever disagree, the database wins and this is the bug. That is
// why every line below is a description, never a selection.

import type { PassportCopyKey } from "./i18n";

/** Must match the `sp_disclosures.package_code` CHECK exactly. */
export const DISCLOSURE_PACKAGE_CODES = [
  "public_card",
  "verified_qualifications",
  "verified_experience",
  "employer_review",
  "full_verification",
] as const;

export type DisclosurePackageCode = (typeof DISCLOSURE_PACKAGE_CODES)[number];

export interface LivePackage {
  readonly code: DisclosurePackageCode;
  readonly nameKey: PassportCopyKey;
  readonly purposeKey: PassportCopyKey;
  /** What the recipient WILL see. Every line here is always included — a
   *  package has no optional contents, which is the whole point of packages
   *  rather than a builder. */
  readonly includesKeys: readonly PassportCopyKey[];
  /** What the recipient will NOT see. Stated explicitly because a holder
   *  deciding whether to share needs the exclusions more than the
   *  inclusions. */
  readonly excludesKeys: readonly PassportCopyKey[];
  /** Whether this package can carry an unverified entry. None of them can —
   *  the field exists so the answer is written down rather than assumed. */
  readonly verifiedOnly: true;
}

export const LIVE_PACKAGES: readonly LivePackage[] = [
  {
    code: "public_card",
    nameKey: "pkg.public_card.name",
    purposeKey: "pkg.public_card.purpose",
    includesKeys: [
      "pkg.inc.identity",
      "pkg.inc.professionJurisdiction",
      "pkg.inc.verifiedQualifications",
      "pkg.inc.verifiedTenureTotal",
    ],
    excludesKeys: [
      "pkg.exc.employers",
      "pkg.exc.evidence",
      "pkg.exc.selfDeclared",
      "pkg.exc.contact",
      "pkg.exc.internalNotes",
    ],
    verifiedOnly: true,
  },
  {
    code: "verified_qualifications",
    nameKey: "pkg.verified_qualifications.name",
    purposeKey: "pkg.verified_qualifications.purpose",
    includesKeys: [
      "pkg.inc.identity",
      "pkg.inc.professionJurisdiction",
      "pkg.inc.verifiedQualifications",
      "pkg.inc.attribution",
      "pkg.inc.validity",
    ],
    excludesKeys: [
      "pkg.exc.employers",
      "pkg.exc.evidence",
      "pkg.exc.selfDeclared",
      "pkg.exc.contact",
      "pkg.exc.internalNotes",
    ],
    verifiedOnly: true,
  },
  {
    code: "verified_experience",
    nameKey: "pkg.verified_experience.name",
    purposeKey: "pkg.verified_experience.purpose",
    includesKeys: [
      "pkg.inc.identity",
      "pkg.inc.professionJurisdiction",
      "pkg.inc.verifiedEmployment",
      "pkg.inc.verifiedTenureTotal",
    ],
    excludesKeys: [
      "pkg.exc.qualifications",
      "pkg.exc.evidence",
      "pkg.exc.selfDeclared",
      "pkg.exc.contact",
      "pkg.exc.internalNotes",
    ],
    verifiedOnly: true,
  },
  {
    code: "employer_review",
    nameKey: "pkg.employer_review.name",
    purposeKey: "pkg.employer_review.purpose",
    includesKeys: [
      "pkg.inc.identity",
      "pkg.inc.professionJurisdiction",
      "pkg.inc.verifiedQualifications",
      "pkg.inc.verifiedEmployment",
      "pkg.inc.attribution",
      "pkg.inc.validity",
    ],
    excludesKeys: [
      "pkg.exc.evidence",
      "pkg.exc.selfDeclared",
      "pkg.exc.contact",
      "pkg.exc.internalNotes",
    ],
    verifiedOnly: true,
  },
  {
    code: "full_verification",
    nameKey: "pkg.full_verification.name",
    purposeKey: "pkg.full_verification.purpose",
    includesKeys: [
      "pkg.inc.identity",
      "pkg.inc.professionJurisdiction",
      "pkg.inc.verifiedQualifications",
      "pkg.inc.verifiedEmployment",
      "pkg.inc.verifiedTenureTotal",
      "pkg.inc.attribution",
      "pkg.inc.validity",
    ],
    excludesKeys: [
      "pkg.exc.evidence",
      "pkg.exc.selfDeclared",
      "pkg.exc.contact",
      "pkg.exc.internalNotes",
    ],
    verifiedOnly: true,
  },
];

export function livePackage(code: DisclosurePackageCode): LivePackage {
  const found = LIVE_PACKAGES.find((p) => p.code === code);
  if (!found) throw new Error(`Unknown disclosure package: ${code}`);
  return found;
}

/* ------------------------------------------------------------------ */
/* The recipient payload                                               */
/* ------------------------------------------------------------------ */

/** Exactly the shape `sp_get_disclosure` returns. Typed here so the public
 *  page cannot read a field the function does not produce, and so adding a
 *  field to the payload is a deliberate, reviewable change in both places. */
export interface RecipientClaim {
  readonly id: string;
  readonly type: string;
  readonly title: string;
  /** Supported-credential taxonomy code (VU1 / VU2 / OV / SV), or null for a
   *  free-text credential. Phase 7.
   *
   *  This is the ONLY thing the public page may derive a credential symbol
   *  from. It is server-authored and FK-constrained, unlike `title`, which
   *  the holder types — deriving a symbol from the title would let a holder
   *  choose the mark a stranger sees. */
  readonly credential_code: string | null;
  readonly issuer: string | null;
  readonly jurisdiction: string | null;
  /** The emirate or region, where the regulator is sub-national. Provenance,
   *  not private detail — a Dubai credential shown without it invites the
   *  UAE-wide reading the market pack refuses. Emitted to every package. */
  readonly sub_jurisdiction?: string | null;
  /** Whether the approval has boundaries at all. Emitted to EVERY package,
   *  including the public card: telling a stranger "limited, details withheld"
   *  is narrower and honester than telling them nothing and letting them
   *  assume the approval is unlimited. */
  readonly scope_limited?: boolean;
  /** The protected object, employer or principal itself. Present only for an
   *  application-scoped disclosure or an employer_review / full_verification
   *  package — never on a public card, and never in any social or marketing
   *  export. `sp_disclosure_payload` decides; this is only the shape. */
  readonly authorisation_scope?: string | null;
  readonly issued_on: string | null;
  readonly valid_until: string | null;
  readonly assertion: string;
  readonly lifecycle: string;
  readonly verified_at: string | null;
  readonly verifier_organisation: string | null;
  readonly verification_method: string | null;
}

export interface RecipientPeriod {
  readonly id: string;
  readonly employer: string;
  readonly role: string;
  readonly started_on: string;
  readonly ended_on: string | null;
  readonly jurisdiction: string | null;
  readonly assertion: string;
  readonly lifecycle: string;
}

export interface RecipientPayloadActive {
  readonly status: "active";
  readonly package: DisclosurePackageCode;
  /** Whether this share is the whole Passport or one credential. Emitted by
   *  the server (Phase 9) so the page never has to infer intent from how
   *  many claims happen to be in the array.
   *
   *  Optional because a payload produced before Phase 9 reached the database
   *  will not carry it; the reader defaults to "passport", which is what
   *  every pre-Phase-9 share was. */
  readonly focus?: "passport" | "credential";
  readonly purpose: string | null;
  readonly expires_at: string | null;
  /** When the holder authorised this disclosure. Added by
   *  20260904090000; older payloads may not carry it. */
  readonly authorised_at?: string | null;
  readonly last_updated: string;
  readonly holder: string | null;
  readonly privacy_mode: string;
  readonly profession_slug: string | null;
  readonly jurisdiction: string;
  readonly verified_claims: readonly RecipientClaim[];
  readonly verified_experience: readonly RecipientPeriod[];
  readonly verified_experience_days: number;
}

/** Revoked, expired, never-existed and rate-limited all arrive here, and
 *  they are indistinguishable on purpose: any difference between them is an
 *  oracle telling a stranger whether a token was ever real. */
export interface RecipientPayloadUnavailable {
  readonly status: "unavailable";
}

export type RecipientPayload = RecipientPayloadActive | RecipientPayloadUnavailable;
