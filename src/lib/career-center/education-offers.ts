// The education surface, and the boundary a paid placement may never cross.
//
// ── THE COMMERCIAL PROBLEM, STATED BEFORE THE CODE ─────────────────────
//
// CQrityjob intends to earn money from training providers. The moment that is
// true, every recommendation on this site acquires a second possible reading:
// "is this here because it is right for me, or because somebody paid?".
// A career service that cannot answer that question has nothing to sell,
// because the recommendation is the product.
//
// So the commercial model is prepared here as a SEPARATE LAYER that is
// structurally incapable of touching relevance:
//
//   Layer 1  WHAT the reader needs        an authored profession->offer link
//   Layer 2  WHICH ORDER it is shown in   derived from Layer 1 alone
//   Layer 3  WHO delivers it              a placement, attached afterwards
//
// Layer 1 is a TABLE, not an inference — see `education-links.ts` for why a
// legal claim needs an author.
//
// Layer 2 is computed by `educationOrderKey`, whose input type does not
// contain a placement field at all. Not "does not read it" — cannot. A future
// edit that wanted ranking to notice money would have to change a type
// signature, which is a review event rather than a one-line diff. The guard
// re-orders every offer with a sponsored placement attached and requires a
// byte-identical sequence.
//
// ── WHAT PROVES NEUTRALITY, AND WHAT DOES NOT ──────────────────────────
//
// The type signature and the guard prove it. TELEMETRY DOES NOT. An earlier
// revision of this module claimed that an analytics event with an
// organic/sponsored dimension made ranking neutrality "checkable"; it does
// not. Counting clicks measures engagement. Ordering is a property of the
// code, and the code is what is asserted. The event, and the hosted schema
// change it needed, were removed.
//
// ── WHAT THIS PILOT DELIBERATELY DOES NOT BUILD ────────────────────────
//
// No payment, no invoicing, no commission accounting, no provider
// self-service, and no placement in the shipped data:
// `EDUCATION_PROVIDER_PLACEMENTS` is empty. What exists is the shape a
// placement must have in order to be addable at all, plus the proof that
// adding one cannot move anything. The requirements the first real placement
// must satisfy are recorded in docs/career-center/career-center-pilot.md and
// are deliberately NOT implemented here.

import type { Bi, Certification, Education, Profession, Region, SourceRef } from "./types";
import { getEducation } from "./education";
import { getCertification } from "./certifications";
import {
  educationLinksFor,
  type EducationRelevance,
  type OfferKind,
  type ProfessionEducationLink,
} from "./education-links";

export type { EducationRelevance, OfferKind, ProfessionEducationLink };

// ---------------------------------------------------------------------------
// Layer 3 — placements
// ---------------------------------------------------------------------------

export type OfferPlacement = "organic" | "sponsored";

export interface EducationProviderPlacement {
  /** Stable identifier for the placement itself, so a click, an impression
   *  and an invoice can all name the same row without matching on a URL. */
  readonly placementId: string;
  readonly offerId: string;
  readonly kind: OfferKind;
  readonly providerName: string;
  /** HTTPS only — enforced by `placementIsWellFormed`, not by convention. */
  readonly url: string;
  /** Where this provider actually delivers. A placement is never shown
   *  outside the jurisdiction the reader is looking at. */
  readonly countries: readonly Region[];
  readonly placement: OfferPlacement;
}

/**
 * Paid and manually-added provider placements.
 *
 * EMPTY IN THE PILOT, deliberately. The pilot ships the mechanism and no
 * placement; adding the first one is a commercial release with its own
 * review, not a side effect of this one.
 */
export const EDUCATION_PROVIDER_PLACEMENTS: readonly EducationProviderPlacement[] = [];

/** At most this many providers per offer, sponsored and organic together.
 *  A cap is part of the contract rather than a styling decision: an offer
 *  that can carry unbounded placements is an auction wearing a card. */
export const MAX_PLACEMENTS_PER_OFFER = 3;

/** Structural validity of a placement row. Applied by the guard, so a
 *  malformed placement fails the build rather than rendering. */
export function placementIsWellFormed(p: EducationProviderPlacement): boolean {
  if (!p.placementId.trim() || !p.providerName.trim()) return false;
  if (!p.url.startsWith("https://")) return false;
  return p.countries.length > 0;
}

/**
 * Provider order within one offer.
 *
 * Deterministic and price-blind: alphabetical by provider name, then by
 * placement id. Sponsored placements are NOT hoisted, and the sort function
 * cannot see a price because no price exists in this type. A paid provider
 * that wanted to be first would have to be renamed, which is not a pricing
 * lever.
 */
export function orderPlacements(
  placements: readonly EducationProviderPlacement[],
): EducationProviderPlacement[] {
  return [...placements]
    .sort(
      (a, b) =>
        a.providerName.localeCompare(b.providerName) || a.placementId.localeCompare(b.placementId),
    )
    .slice(0, MAX_PLACEMENTS_PER_OFFER);
}

// ---------------------------------------------------------------------------
// Layer 1 — what the reader needs
// ---------------------------------------------------------------------------

export interface EducationOffer {
  readonly id: string;
  readonly kind: OfferKind;
  readonly name: Bi;
  readonly provider?: Bi;
  readonly relevance: EducationRelevance;
  /** Which part of the requirement this satisfies, and what it does not.
   *  Authored on the link, never derived. */
  readonly supports: Bi;
  /** The jurisdiction the relevance statement is made in. */
  readonly countries: readonly Region[];
  /** The authority behind the relevance statement (from the link), falling
   *  back to the offer's own official source. */
  readonly source?: SourceRef;
  readonly lastVerified: string;
  readonly notes?: Bi;
  /** True when this record is a published STANDARD rather than a credential a
   *  person can hold. The surface must never call one a certificate. */
  readonly isStandard: boolean;
  /** Attached after ordering. Presentation only. */
  readonly placements: readonly EducationProviderPlacement[];
}

/** An offer may be presented only when it carries what a reader needs in
 *  order to check it: a name in both languages, a jurisdiction, a citable
 *  source and a review date. Same shape of rule as `professionPublishability`,
 *  and for the same reason. */
export function offerPresentable(
  e: Pick<Education, "name" | "scope" | "officialSource" | "lastVerified" | "status">,
): boolean {
  if (e.status === "placeholder") return false;
  if (!e.name?.sv?.trim() || !e.name?.en?.trim()) return false;
  if ((e.scope?.length ?? 0) === 0) return false;
  if (!e.lastVerified) return false;
  const s = e.officialSource;
  if (!s) return false;
  return Boolean(s.label?.sv?.trim() && s.label?.en?.trim() && (s.url || s.publisher));
}

// ---------------------------------------------------------------------------
// Layer 2 — order, computed from relevance alone
// ---------------------------------------------------------------------------

/** Everything the ordering is allowed to see. A placement is not in it. */
export interface OrderableOffer {
  readonly id: string;
  readonly kind: OfferKind;
  readonly relevance: EducationRelevance;
}

const RELEVANCE_RANK: Readonly<Record<EducationRelevance, number>> = {
  formal_requirement: 0,
  recommended_development: 1,
};

const KIND_RANK: Readonly<Record<OfferKind, number>> = {
  education: 0,
  certification: 1,
};

/**
 * The sort key. Total, deterministic, and structurally blind to money: the
 * parameter type carries no placement field, so no future edit can make
 * ranking read one without changing this signature.
 */
export function educationOrderKey(o: OrderableOffer): readonly [number, number, string] {
  return [RELEVANCE_RANK[o.relevance], KIND_RANK[o.kind], o.id];
}

export function orderOffers<T extends OrderableOffer>(offers: readonly T[]): T[] {
  return [...offers].sort((a, b) => {
    const ka = educationOrderKey(a);
    const kb = educationOrderKey(b);
    return ka[0] - kb[0] || ka[1] - kb[1] || ka[2].localeCompare(kb[2]);
  });
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

function placementsFor(offerId: string, kind: OfferKind, countries: readonly Region[]) {
  return orderPlacements(
    EDUCATION_PROVIDER_PLACEMENTS.filter(
      (pl) =>
        pl.offerId === offerId &&
        pl.kind === kind &&
        pl.countries.some((c) => countries.includes(c)),
    ),
  );
}

export interface ProfessionEducation {
  readonly offers: readonly EducationOffer[];
  /** Offers linked to this guide that are not presentable yet. Counted and
   *  named, never carded — the same treatment unfinished profession guides
   *  get. */
  readonly underReview: readonly Bi[];
}

function fromLink(
  link: ProfessionEducationLink,
  record: { name: Bi; provider?: Bi; source?: SourceRef; notes?: Bi; isStandard: boolean },
): EducationOffer {
  return {
    id: link.offerId,
    kind: link.kind,
    name: record.name,
    provider: record.provider,
    relevance: link.relevance,
    supports: link.supports,
    countries: link.countries,
    // The AUTHORITY behind the relevance claim first: that is the statement a
    // reader most needs to check. The offer's own page is a fallback.
    source: link.authority ?? record.source,
    lastVerified: link.lastVerified,
    notes: record.notes,
    isStandard: record.isStandard,
    placements: placementsFor(link.offerId, link.kind, link.countries),
  };
}

function educationRecord(e: Education) {
  return {
    name: e.name,
    provider: e.provider,
    source: e.officialSource,
    notes: e.notes,
    isStandard: false,
  };
}

function certificationRecord(c: Certification) {
  return {
    name: c.shortName
      ? { sv: c.shortName + " — " + c.fullName.sv, en: c.shortName + " — " + c.fullName.en }
      : c.fullName,
    provider: c.issuer,
    source: c.officialSource,
    notes: undefined,
    isStandard: c.credentialType === "standard",
  };
}

/**
 * Everything a profession guide may show under "Utbildning och behörighet".
 *
 * Driven entirely by the authored link table. A record that exists in the
 * catalogue but has no link to this profession is not shown: the relationship
 * is the claim, and an unauthored relationship is not one.
 */
export function professionEducation(p: Profession): ProfessionEducation {
  const offers: EducationOffer[] = [];
  const underReview: Bi[] = [];

  for (const link of educationLinksFor(p.id)) {
    if (link.kind === "education") {
      const e = getEducation(link.offerId);
      if (!e) continue;
      if (offerPresentable(e)) offers.push(fromLink(link, educationRecord(e)));
      else underReview.push(e.name);
      continue;
    }
    const c = getCertification(link.offerId);
    if (!c) continue;
    const presentable = offerPresentable({
      name: c.fullName,
      scope: c.scope,
      officialSource: c.officialSource,
      lastVerified: c.lastVerified,
      status: c.status,
    });
    if (presentable) offers.push(fromLink(link, certificationRecord(c)));
    else underReview.push(c.fullName);
  }

  return { offers: orderOffers(offers), underReview };
}

/**
 * Proof, runnable, that money cannot move anything.
 *
 * Marks every offer sponsored and re-orders. Returns true when the resulting
 * id sequence is identical. Exported rather than kept in the guard so the
 * property travels with the module it constrains.
 */
export function orderIsPlacementBlind(offers: readonly EducationOffer[]): boolean {
  const before = orderOffers(offers).map((o) => o.id);
  const sponsoredEverything = offers.map((o) => ({
    ...o,
    placements: [
      {
        placementId: "probe-" + o.id,
        offerId: o.id,
        kind: o.kind,
        providerName: "Placement neutrality probe",
        url: "https://example.invalid/probe",
        countries: o.countries,
        placement: "sponsored" as const,
      },
    ],
  }));
  const after = orderOffers(sponsoredEverything).map((o) => o.id);
  return before.length === after.length && before.every((id, i) => id === after[i]);
}
