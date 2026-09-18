// Security Passport — WHY a researched definition is, or is not, selectable.
//
// The approved catalogue answers a holder with a list and no reasons: a
// definition that is inactive, in a closed market, without a resolvable issuer
// or deprecated simply is not there. That is right for a holder and useless
// for an administrator, who has to know WHICH decision is outstanding.
//
// This module restates the catalogue view's predicate
// (sp_approved_credential_catalogue, 20261126090000) as named reasons, one pure
// function, so the administration page and the coverage matrix in
// docs/passport/catalogue-coverage-matrix.md are the same answer. It decides
// nothing and changes nothing: approval remains a reviewed migration by an
// authorised catalogue administrator (docs/passport/closed-catalogue-governance.md).
//
// Three separate questions, never merged:
//   DEFINITION APPROVAL  — sp_credential_types.is_active (per definition)
//   MARKET ENTITLEMENT   — the pack is active, or internal_pilot + a member row
//   HOLDER VERIFICATION  — not a catalogue question at all, and absent here.

export type DiagnosticReason =
  /** The definition itself is not approved (`is_active = false`). */
  | "definition_not_approved"
  /** The market pack is neither active nor in internal pilot. */
  | "market_closed"
  /** The pack is in internal pilot: only a named pilot member is offered it. */
  | "market_pilot_members_only"
  /**
   * ROUTE A (owner decision 2026-09-18): the definition is internal_pilot in an
   * internal_pilot pack, so the owner's recorded pilot authorisation admits it
   * for a valid member of THAT pack. It is NOT approved for the public
   * (is_active stays false) and is published to nobody by a pack activation.
   */
  | "pilot_authorised_not_public"
  /** No governed issuer and no document-stated issuer under a governed regulator. */
  | "issuer_unresolved"
  | "deprecated"
  | "jurisdiction_inactive"
  /** No source-backed review row: no professional area, no recorded source. */
  | "source_review_missing";

export type CatalogueAvailability =
  /** Offered to every holder. */
  | "selectable"
  /** Offered to valid pilot members of the definition's own market only. */
  | "selectable_pilot_members"
  /** Everything is in place except the owner's per-definition approval. */
  | "awaiting_definition_approval"
  /** The market is closed by owner decision. */
  | "market_closed"
  /** Something governed is missing; approval alone would not make it selectable. */
  | "blocked";

export interface DiagnosticDefinition {
  readonly code: string;
  readonly nameSv: string;
  readonly nameEn: string;
  readonly claimType: string;
  readonly category: string;
  readonly scopeCode: string | null;
  readonly marketPackCode: string | null;
  readonly jurisdictionCode: string | null;
  readonly subJurisdictionCode: string | null;
  readonly isActive: boolean;
  readonly pilotState: string | null;
  readonly legalReviewState: string | null;
  readonly requiresScope: boolean;
  readonly deprecated: boolean;
  /** `sp_credential_types.authority_id` resolves to an ACTIVE authority. */
  readonly governedAuthority: string | null;
  /** The certification definition's ACTIVE issuer (international). */
  readonly governedCertificationIssuer: string | null;
  readonly regulator: string | null;
  readonly issuerStatedOnDocument: boolean;
  readonly trainingProviderStatedOnDocument: boolean;
  readonly jurisdictionActive: boolean;
  readonly packIsActive: boolean | null;
  readonly packPilotState: string | null;
  readonly review: { readonly sourceUrl: string; readonly checkedOn: string } | null;
}

export interface DefinitionDiagnosis {
  readonly availability: CatalogueAvailability;
  readonly reasons: readonly DiagnosticReason[];
  /** What the holder must supply beyond dates: never a blocker, always a contract. */
  readonly holderMustState: readonly ("authorisation_scope" | "issuer_name")[];
}

export function diagnoseDefinition(d: DiagnosticDefinition): DefinitionDiagnosis {
  const reasons: DiagnosticReason[] = [];
  const global = d.scopeCode === "global_professional";

  const issuerResolved = global
    ? d.governedCertificationIssuer !== null
    : d.governedAuthority !== null || (d.issuerStatedOnDocument && d.regulator !== null);
  if (!issuerResolved) reasons.push("issuer_unresolved");
  if (d.deprecated) reasons.push("deprecated");
  if (!global && !d.jurisdictionActive) reasons.push("jurisdiction_inactive");
  if (!d.review) reasons.push("source_review_missing");

  const marketOpen = global || d.packIsActive === true;
  const marketPilot = !global && d.packIsActive !== true && d.packPilotState === "internal_pilot";
  if (!marketOpen && !marketPilot) reasons.push("market_closed");
  if (marketPilot) reasons.push("market_pilot_members_only");
  // The SAME rule as sp_approved_credential_catalogue (20261126090000): the
  // definition is internal_pilot AND its own pack is internal_pilot and not active.
  const pilotRoute = !global && !d.isActive && d.pilotState === "internal_pilot" && marketPilot;
  if (pilotRoute) reasons.push("pilot_authorised_not_public");
  else if (!d.isActive) reasons.push("definition_not_approved");

  const structural = reasons.some(
    (r) => r === "issuer_unresolved" || r === "deprecated" || r === "jurisdiction_inactive",
  );
  // A CLOSED market is the decisive answer: nothing else about the definition
  // matters until the owner opens it, so it outranks a structural gap.
  const availability: CatalogueAvailability = reasons.includes("market_closed")
    ? "market_closed"
    : structural
      ? "blocked"
      : pilotRoute || (d.isActive && marketPilot)
        ? "selectable_pilot_members"
        : !d.isActive
          ? "awaiting_definition_approval"
          : "selectable";

  const holderMustState: ("authorisation_scope" | "issuer_name")[] = [];
  if (d.requiresScope) holderMustState.push("authorisation_scope");
  if (!global && d.governedAuthority === null && d.issuerStatedOnDocument)
    holderMustState.push("issuer_name");
  return { availability, reasons, holderMustState };
}
