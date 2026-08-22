// Security Passport — controlled disclosure packages.
//
// ── WHY PACKAGES INSTEAD OF A FREE-FORM BUILDER ────────────────────────
//
// A free-form builder makes the holder responsible for the integrity of the
// disclosure, and a holder acting in complete good faith can still assemble
// something technically true and materially misleading: a licence without
// its expiry, a role without its jurisdiction. Packages move that
// responsibility into authored content, where it is reviewed once and
// applied consistently (Product Architecture v1.1 §7).
//
// The holder keeps every choice that is genuinely theirs: whether to share,
// which package, which OPTIONAL items, to whom, for how long, and whether
// to revoke.
//
// ── ASSEMBLED FROM THE CONTRACT, NEVER FILTERED FROM A PROFILE ─────────
//
// `buildDisclosurePayload` walks the PACKAGE's item list and pulls only
// what each item names. It never receives a full holder view and hides part
// of it. That direction of travel is what makes "hidden UI is never access
// control" structurally true rather than aspirational, and it is asserted
// directly in scripts/passport-fixture-check.ts.
//
// Phase 1 is fixture-only: this runs client-side over fixtures, shaped
// exactly as the eventual server response would be, so the contract is
// exercised without a database existing.

import { withoutSelfDeclared } from "./identity/visibility";
import type { ProfessionalIdentity } from "./identity/types";
import type { PassportCopyKey } from "./i18n";
import { totalsByEvidenceLevel, toEpochDay, type ExperienceTotals } from "./experience";
import { recognitionFor, type RecognitionState } from "./recognition";
import type { Claim, ExperiencePeriod, IsoDate, PassportHolder } from "./types";

export type DisclosureItemKind =
  | "identity"
  | "totals"
  | "recognition"
  | "verified_periods"
  | "all_periods"
  | "training"
  | "certifications"
  | "licences"
  | "specialisations"
  | "contact";

export interface DisclosurePackageItem {
  readonly kind: DisclosureItemKind;
  readonly labelKey: PassportCopyKey;
  /** Mandatory items carry the context that makes an entry honest. The UI
   *  offers no control for them and the builder always includes them. */
  readonly isMandatory: boolean;
}

export type DisclosurePackageId = "overview" | "verified" | "training" | "licence" | "employer";

export interface DisclosurePackage {
  readonly id: DisclosurePackageId;
  /** Pinned into each disclosure so a share renders the same way after the
   *  package is later revised. */
  readonly versionNo: number;
  readonly nameKey: PassportCopyKey;
  readonly purposeKey: PassportCopyKey;
  readonly items: readonly DisclosurePackageItem[];
}

const M = (kind: DisclosureItemKind, labelKey: PassportCopyKey): DisclosurePackageItem => ({
  kind,
  labelKey,
  isMandatory: true,
});
const O = (kind: DisclosureItemKind, labelKey: PassportCopyKey): DisclosurePackageItem => ({
  kind,
  labelKey,
  isMandatory: false,
});

/** The five authored packages. Identity is mandatory in every one: a
 *  credential detached from who it belongs to and where it applies is not
 *  evidence of anything. */
export const DISCLOSURE_PACKAGES: readonly DisclosurePackage[] = [
  {
    id: "overview",
    versionNo: 1,
    nameKey: "package.overview.name",
    purposeKey: "package.overview.purpose",
    items: [
      M("identity", "item.identity"),
      M("totals", "item.totals"),
      O("recognition", "item.recognition"),
      O("specialisations", "item.specialisations"),
      O("contact", "item.contact"),
    ],
  },
  {
    id: "verified",
    versionNo: 1,
    nameKey: "package.verified.name",
    purposeKey: "package.verified.purpose",
    items: [
      M("identity", "item.identity"),
      M("verified_periods", "item.verifiedPeriods"),
      O("recognition", "item.recognition"),
    ],
  },
  {
    id: "training",
    versionNo: 1,
    nameKey: "package.training.name",
    purposeKey: "package.training.purpose",
    items: [
      M("identity", "item.identity"),
      M("training", "item.training"),
      M("certifications", "item.certifications"),
      O("specialisations", "item.specialisations"),
    ],
  },
  {
    id: "licence",
    versionNo: 1,
    nameKey: "package.licence.name",
    purposeKey: "package.licence.purpose",
    items: [M("identity", "item.identity"), M("licences", "item.licences")],
  },
  {
    id: "employer",
    versionNo: 1,
    nameKey: "package.employer.name",
    purposeKey: "package.employer.purpose",
    items: [
      M("identity", "item.identity"),
      M("verified_periods", "item.verifiedPeriods"),
      M("licences", "item.licences"),
      O("certifications", "item.certifications"),
      O("training", "item.training"),
      O("totals", "item.totals"),
      O("contact", "item.contact"),
    ],
  },
] as const;

export function packageById(id: DisclosurePackageId): DisclosurePackage {
  const found = DISCLOSURE_PACKAGES.find((p) => p.id === id);
  if (!found) throw new Error(`Unknown disclosure package: ${id}`);
  return found;
}

export type ShareStatus = "active" | "expired" | "revoked";

/** Prototype default. Owner decision: 30 days, subject to later validation. */
export const DEFAULT_EXPIRY_DAYS = 30;
export const ALLOWED_EXPIRY_DAYS: readonly number[] = [7, 14, 30, 90] as const;

export interface DisclosureRequest {
  readonly packageId: DisclosurePackageId;
  /** Optional item kinds the holder chose to include. Anything not offered
   *  as optional by the package is ignored, not honoured. */
  readonly optionalIncluded: readonly DisclosureItemKind[];
  readonly recipientHint: string | null;
  readonly expiresOn: IsoDate;
  readonly revoked: boolean;
}

export type DisclosureSection =
  | { readonly kind: "identity"; readonly labelKey: PassportCopyKey }
  | {
      readonly kind: "totals";
      readonly labelKey: PassportCopyKey;
      readonly totals: ExperienceTotals;
    }
  | {
      readonly kind: "recognition";
      readonly labelKey: PassportCopyKey;
      readonly recognition: RecognitionState;
    }
  | {
      readonly kind: "periods";
      readonly labelKey: PassportCopyKey;
      readonly periods: readonly ExperiencePeriod[];
    }
  | {
      readonly kind: "claims";
      readonly labelKey: PassportCopyKey;
      readonly claims: readonly Claim[];
    }
  | { readonly kind: "contact"; readonly labelKey: PassportCopyKey };

export interface DisclosurePayload {
  readonly packageId: DisclosurePackageId;
  readonly packageVersionNo: number;
  readonly holderDisplayName: string;
  /** Derived from the holder's verified claims, never stored. Self-declared
   *  titles cannot reach here: the payload is built for somebody else. */
  readonly identity: ProfessionalIdentity;
  readonly jurisdictionCode: string;
  readonly purposeKey: PassportCopyKey;
  readonly packageNameKey: PassportCopyKey;
  readonly recipientHint: string | null;
  readonly expiresOn: IsoDate;
  readonly status: ShareStatus;
  readonly sections: readonly DisclosureSection[];
  /** Which item kinds were included, in package order. Lets the check
   *  script assert that a payload never exceeds its contract. */
  readonly includedKinds: readonly DisclosureItemKind[];
}

export function shareStatus(request: DisclosureRequest, viewedOn: IsoDate): ShareStatus {
  if (request.revoked) return "revoked";
  return toEpochDay(viewedOn) > toEpochDay(request.expiresOn) ? "expired" : "active";
}

function claimsOfType(holder: PassportHolder, types: readonly Claim["claimType"][]): Claim[] {
  return holder.claims.filter((c) => types.includes(c.claimType));
}

/**
 * Build the payload from the package contract.
 *
 * The iteration is over `pkg.items` — never over the holder. An optional
 * item is included only when the holder selected it AND the package offers
 * it as optional; a mandatory item is always included and no caller can
 * suppress it.
 */
export function buildDisclosurePayload(
  holder: PassportHolder,
  request: DisclosureRequest,
  viewedOn: IsoDate,
): DisclosurePayload {
  const pkg = packageById(request.packageId);
  const totals = totalsByEvidenceLevel(holder.periods, viewedOn);

  const sections: DisclosureSection[] = [];
  const includedKinds: DisclosureItemKind[] = [];

  for (const item of pkg.items) {
    const included = item.isMandatory || request.optionalIncluded.includes(item.kind);
    if (!included) continue;
    includedKinds.push(item.kind);

    switch (item.kind) {
      case "identity":
        sections.push({ kind: "identity", labelKey: item.labelKey });
        break;
      case "totals":
        sections.push({ kind: "totals", labelKey: item.labelKey, totals });
        break;
      case "recognition":
        sections.push({
          kind: "recognition",
          labelKey: item.labelKey,
          recognition: recognitionFor(totals),
        });
        break;
      case "verified_periods":
        sections.push({
          kind: "periods",
          labelKey: item.labelKey,
          // The package says "verified", so the payload contains only
          // verified periods. Not a UI filter — they are never assembled.
          periods: holder.periods.filter((p) => p.assertionLevel === "verified"),
        });
        break;
      case "all_periods":
        sections.push({ kind: "periods", labelKey: item.labelKey, periods: holder.periods });
        break;
      case "training":
        sections.push({
          kind: "claims",
          labelKey: item.labelKey,
          claims: claimsOfType(holder, ["training", "education"]),
        });
        break;
      case "certifications":
        sections.push({
          kind: "claims",
          labelKey: item.labelKey,
          claims: claimsOfType(holder, ["certification", "professional_membership"]),
        });
        break;
      case "licences":
        sections.push({
          kind: "claims",
          labelKey: item.labelKey,
          claims: claimsOfType(holder, ["licence"]),
        });
        break;
      case "specialisations":
        sections.push({
          kind: "claims",
          labelKey: item.labelKey,
          claims: claimsOfType(holder, ["specialisation"]),
        });
        break;
      case "contact":
        sections.push({ kind: "contact", labelKey: item.labelKey });
        break;
    }
  }

  return {
    packageId: pkg.id,
    packageVersionNo: pkg.versionNo,
    holderDisplayName: holder.displayName,
    identity: withoutSelfDeclared(holder.identity),
    jurisdictionCode: holder.jurisdictionCode,
    purposeKey: pkg.purposeKey,
    packageNameKey: pkg.nameKey,
    recipientHint: request.recipientHint,
    expiresOn: request.expiresOn,
    status: shareStatus(request, viewedOn),
    sections,
    includedKinds,
  };
}
