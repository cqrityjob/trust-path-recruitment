// Security Passport — putting a Passport credential onto a LinkedIn profile.
//
// ── THIS IS NOT SOCIAL SHARING ─────────────────────────────────────────
//
// Posting a link to a feed and adding a credential to the Licenses &
// Certifications section of a profile are different products. The first is
// an announcement that scrolls away; the second is a permanent line on a
// professional record, and it is the one an employer actually reads. The
// share panel therefore keeps them apart.
//
// ── WHY ONLY VERIFIED, ACTIVE CREDENTIALS ARE OFFERED ──────────────────
//
// A LinkedIn entry created here carries the holder's live /p/<token>
// verification URL. That URL resolves to the `public_card` disclosure, which
// contains verified, active content and nothing else. Offering a
// self-reported credential would produce a profile entry whose "verify this"
// link shows a page that does not mention it — the worst possible outcome
// for a trust product. So the eligibility rule here is the same rule the
// disclosure already enforces, read from the same claim fields.
//
// ── WHAT LINKEDIN ACTUALLY DOES WITH THE PARAMETERS ────────────────────
//
// LinkedIn's third-party "Add to Profile" flow no longer reliably prefills
// fields for arbitrary issuers. The parameters below are still sent, because
// the versions of the flow that read them save the holder the typing — but
// nothing in the UI promises they will be applied. That is why every entry
// also exposes its fields as copyable rows: the honest handoff is "here is
// the form, and here are the exact values it asks for".
//
// ── WHAT IS DELIBERATELY NOT SENT ──────────────────────────────────────
//
// The holder's certificate or decision number. It is documented PRIVATE and
// must not travel to a third party. The identifier offered instead is a
// prefix of the SHARE's public token, which is meaningless outside CQrityjob
// and dies with the share.

import type { Claim, ClaimType, PassportHolder } from "./types";
import { effectiveAssertionLevel } from "./provenance";
import type { PassportCopyKey, PassportLang } from "./i18n";

/** Which LinkedIn profile section an entry belongs in. */
export type LinkedInProfileTarget = "certification" | "education";

/** Claim types that belong on a licence/certification line. */
const CERTIFICATION_TYPES: readonly ClaimType[] = [
  "certification",
  "licence",
  "specialisation",
  "professional_membership",
];

/** Claim types that belong on an education line. */
const EDUCATION_TYPES: readonly ClaimType[] = ["training", "education"];

export interface LinkedInProfileField {
  readonly labelKey: PassportCopyKey;
  readonly value: string;
}

export interface LinkedInProfileEntry {
  readonly claimId: string;
  readonly target: LinkedInProfileTarget;
  /** Credential name in the reader's language. */
  readonly name: string;
  /** Issuing organisation / provider. A proper noun; never translated. */
  readonly organisation: string;
  /** ISO dates as held, or null. Formatted for LinkedIn at the edges. */
  readonly issuedOn: string | null;
  readonly validUntil: string | null;
  /** The live verification page. Re-checked on open, revocable. */
  readonly credentialUrl: string;
  /** A prefix of the share's public token. Never a private reference. */
  readonly credentialId: string;
  /** LinkedIn's own add-to-profile entry point, pre-parameterised. */
  readonly addUrl: string;
  /** Exactly what LinkedIn's form asks for, ready to copy. */
  readonly fields: readonly LinkedInProfileField[];
}

/** LinkedIn's forms take a month and a year, not a full date. */
function monthYear(iso: string | null): { month: string; year: string } | null {
  if (!iso) return null;
  const [year, month] = iso.split("-");
  if (!year || !month) return null;
  return { month: String(Number(month)), year };
}

function monthYearLabel(iso: string | null): string {
  const my = monthYear(iso);
  return my ? `${my.month}/${my.year}` : "—";
}

/**
 * LinkedIn's documented static entry point for licences and certifications.
 * Exported because the single-credential panel builds the same URL for one
 * claim, and two implementations would eventually disagree.
 */
export function certificationAddUrl(input: {
  readonly name: string;
  readonly organisation: string;
  readonly issuedOn: string | null;
  readonly validUntil: string | null;
  readonly credentialUrl: string;
  readonly credentialId?: string;
}): string {
  const issued = monthYear(input.issuedOn);
  const expires = monthYear(input.validUntil);
  const params = new URLSearchParams({
    startTask: "CERTIFICATION_NAME",
    name: input.name,
    organizationName: input.organisation,
    certUrl: input.credentialUrl,
  });
  if (input.credentialId) params.set("certId", input.credentialId);
  if (issued) {
    params.set("issueYear", issued.year);
    params.set("issueMonth", issued.month);
  }
  if (expires) {
    params.set("expirationYear", expires.year);
    params.set("expirationMonth", expires.month);
  }
  return `https://www.linkedin.com/profile/add?${params.toString()}`;
}

/**
 * LinkedIn's education entry point. Its form is school-shaped, so the
 * provider becomes the school and the course name becomes the field of
 * study — which is what a reader of the finished profile line expects to
 * see, and the closest honest mapping available.
 */
export function educationAddUrl(input: {
  readonly name: string;
  readonly organisation: string;
  readonly issuedOn: string | null;
}): string {
  const issued = monthYear(input.issuedOn);
  const params = new URLSearchParams({
    startTask: "EDUCATION",
    school: input.organisation,
    fieldOfStudy: input.name,
  });
  if (issued) params.set("graduationYear", issued.year);
  return `https://www.linkedin.com/profile/add?${params.toString()}`;
}

function eligible(claim: Claim): boolean {
  // The EFFECTIVE level: a legacy unsupported approval is not offered to
  // LinkedIn as a verified credential.
  return effectiveAssertionLevel(claim) === "verified" && claim.lifecycleState === "active";
}

function targetOf(claim: Claim): LinkedInProfileTarget | null {
  if (CERTIFICATION_TYPES.includes(claim.claimType)) return "certification";
  if (EDUCATION_TYPES.includes(claim.claimType)) return "education";
  return null;
}

/**
 * Every Passport credential the holder can put on their LinkedIn profile,
 * already split by which LinkedIn section takes it.
 *
 * `shareUrl` is the live disclosure link, and it is the only URL that ever
 * appears on a LinkedIn entry: a profile line must point at something that
 * is re-checked on open and stops working when the holder revokes it, not at
 * a static image that would outlive the credential.
 */
export function linkedInProfileEntries(
  holder: PassportHolder,
  shareUrl: string,
  lang: PassportLang,
): readonly LinkedInProfileEntry[] {
  // The share token is the public identifier. Twelve characters is enough to
  // be recognisable in a support conversation and is not the whole secret.
  const credentialId = (shareUrl.split("/p/")[1] ?? "").slice(0, 12);

  return holder.claims.flatMap((claim) => {
    if (!eligible(claim)) return [];
    const target = targetOf(claim);
    if (!target) return [];

    const name = lang === "en" ? claim.titleEn : claim.titleSv;
    const organisation = claim.issuerName || "CQrityjob";
    const issuedOn = claim.issuedOn ?? claim.validFrom;
    const validUntil = target === "certification" ? claim.validUntil : null;

    const fields: readonly LinkedInProfileField[] =
      target === "certification"
        ? [
            { labelKey: "cw.liName", value: name },
            { labelKey: "cw.liOrg", value: organisation },
            { labelKey: "cw.liIssued", value: monthYearLabel(issuedOn) },
            { labelKey: "cw.liExpires", value: monthYearLabel(validUntil) },
            { labelKey: "cw.liId", value: credentialId || "—" },
            { labelKey: "cw.liUrl", value: shareUrl },
          ]
        : [
            { labelKey: "lip.fieldCourse", value: name },
            { labelKey: "lip.fieldProvider", value: organisation },
            { labelKey: "lip.fieldCompleted", value: monthYearLabel(issuedOn) },
            { labelKey: "cw.liUrl", value: shareUrl },
          ];

    return [
      {
        claimId: claim.id,
        target,
        name,
        organisation,
        issuedOn,
        validUntil,
        credentialUrl: shareUrl,
        credentialId,
        addUrl:
          target === "certification"
            ? certificationAddUrl({
                name,
                organisation,
                issuedOn,
                validUntil,
                credentialUrl: shareUrl,
                credentialId: credentialId || undefined,
              })
            : educationAddUrl({ name, organisation, issuedOn }),
        fields,
      },
    ];
  });
}
