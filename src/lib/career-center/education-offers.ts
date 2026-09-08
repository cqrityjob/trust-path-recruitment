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
//   Layer 1  WHAT the reader needs        derived from the profession guide
//   Layer 2  WHICH ORDER it is shown in   derived from Layer 1 alone
//   Layer 3  WHO delivers it              a placement, attached afterwards
//
// Layer 2 is computed by `educationOrderKey`, whose input type does not
// contain a placement field at all. Not "does not read it" — cannot. A future
// edit that wanted ranking to notice money would have to change a type
// signature, which is a review event rather than a one-line diff. The guard
// (`career-center:check`) additionally proves the property empirically: it
// marks every offer sponsored, recomputes, and requires a byte-identical
// order and an identical set.
//
// ── WHAT THIS PILOT DELIBERATELY DOES NOT BUILD ────────────────────────
//
// No payment, no invoicing, no commission accounting, no provider
// self-service, and no sponsored placement in the shipped data:
// `EDUCATION_PROVIDER_PLACEMENTS` is empty. What exists is the shape a
// placement must have in order to be addable at all — a named provider, a
// jurisdiction, a disclosure label, and its own measurement channel — plus
// the proof that adding one cannot move anything.
//
// ── DISCLOSURE IS NOT OPTIONAL AND NOT A STYLE CHOICE ──────────────────
//
// `placement: "sponsored"` forces the "Sponsrad utbildningsanordnare" label
// at render time; there is no flag that suppresses it. Organic and sponsored
// carry different analytics `placement` values so the two can be measured
// separately without inferring anything from a URL.
//
// ── AND WHAT IS NOT SHOWN AT ALL ───────────────────────────────────────
//
// The same rule the profession guides live under: content that has no source,
// no jurisdiction and no review date is not presented as though it had them.
// Eight of the education records in this dataset are structural placeholders.
// They are counted and named as under review, never carded.

import type { Bi, Certification, Education, Profession, Region } from "./types";
import { getEducation } from "./education";
import { getCertification } from "./certifications";

// ---------------------------------------------------------------------------
// Layer 1 — relevance
// ---------------------------------------------------------------------------

/**
 * Why this appears for this profession.
 *
 *   formal_requirement      Something an authority or a regulation requires
 *                           before a person may hold the role.
 *   recommended_development Development that strengthens the profile. Useful,
 *                           never mandatory.
 *
 * Kept as exactly two values on purpose. "Utbildning", "godkännande" and
 * "förordnande" are three different things, and a surface that blurs them is
 * the specific failure this product is not allowed to have. The distinction
 * a reader must never lose is *must* versus *may*, so that is the
 * distinction the type encodes.
 */
export type EducationRelevance = "formal_requirement" | "recommended_development";

export type OfferKind = "education" | "certification";

export type OfferPlacement = "organic" | "sponsored";

export interface EducationProviderPlacement {
  /** The education or certification this provider delivers. */
  readonly offerId: string;
  readonly kind: OfferKind;
  readonly providerName: string;
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
 * placement; adding the first one is a content decision with a disclosure
 * obligation attached, not a side effect of this release.
 */
export const EDUCATION_PROVIDER_PLACEMENTS: readonly EducationProviderPlacement[] = [];

export interface EducationOffer {
  readonly id: string;
  readonly kind: OfferKind;
  readonly name: Bi;
  readonly provider?: Bi;
  readonly relevance: EducationRelevance;
  /** The jurisdictions this offer is being presented FOR: the overlap between
   *  what the offer scopes and what the guide claims, so a Swedish reader is
   *  never shown an international programme labelled "gäller i Sverige". */
  readonly countries: readonly Region[];
  readonly source?: { readonly label: Bi; readonly publisher?: string; readonly url?: string };
  readonly lastVerified: string;
  readonly notes?: Bi;
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

/**
 * Whether a profession's own education pathways are formal requirements.
 *
 * ── THE RULE, AND ITS LIMIT ────────────────────────────────────────────
 *
 * An education attached to a REGULATED profession that states personal
 * formal requirements is the training those requirements name — that is why
 * the pathway is attached to that guide — and is marked `formal_requirement`.
 * Everything else is `recommended_development`.
 *
 * Two qualifications keep it honest:
 *
 *   * A profession regulated as an ACTIVITY rather than as a personal licence
 *     records `regulatoryNotes` and no `formalRequirements` (AML is the case
 *     in this dataset: the Act binds the firm, not the analyst). It has no
 *     personal requirement, so its pathways are recommended.
 *
 *   * The offer must scope a jurisdiction the guide actually claims. An
 *     international programme is never a Swedish legal requirement.
 *
 * The limit is real and worth stating: this cannot express "optional pathway
 * into a regulated role". No such case exists in the dataset today; the first
 * one needs a field on the profession, not a cleverer inference here.
 */
function relevanceOf(p: Profession, scope: readonly Region[]): EducationRelevance {
  const personallyRegulated = p.regulated && (p.formalRequirements?.length ?? 0) > 0;
  if (!personallyRegulated) return "recommended_development";
  const overlaps = scope.some((r) => p.countries.includes(r));
  return overlaps ? "formal_requirement" : "recommended_development";
}

function jurisdictionFor(p: Profession, scope: readonly Region[]): readonly Region[] {
  const overlap = scope.filter((r) => p.countries.includes(r));
  return overlap.length > 0 ? overlap : scope;
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
// Layer 3 — placements, attached after ordering
// ---------------------------------------------------------------------------

function placementsFor(offerId: string, kind: OfferKind, countries: readonly Region[]) {
  return EDUCATION_PROVIDER_PLACEMENTS.filter(
    (pl) =>
      pl.offerId === offerId && pl.kind === kind && pl.countries.some((c) => countries.includes(c)),
  );
}

export interface ProfessionEducation {
  readonly offers: readonly EducationOffer[];
  /** Names of pathways and certificates attached to this guide that are not
   *  presentable yet. Counted and named, never carded — the same treatment
   *  unfinished profession guides get. */
  readonly underReview: readonly Bi[];
}

function fromEducation(p: Profession, e: Education): EducationOffer {
  const countries = jurisdictionFor(p, e.scope);
  return {
    id: e.id,
    kind: "education",
    name: e.name,
    provider: e.provider,
    relevance: relevanceOf(p, e.scope),
    countries,
    source: e.officialSource,
    lastVerified: e.lastVerified!,
    notes: e.notes,
    placements: placementsFor(e.id, "education", countries),
  };
}

function fromCertification(p: Profession, c: Certification): EducationOffer {
  const countries = jurisdictionFor(p, c.scope);
  return {
    id: c.id,
    kind: "certification",
    name: c.shortName
      ? { sv: `${c.shortName} — ${c.fullName.sv}`, en: `${c.shortName} — ${c.fullName.en}` }
      : c.fullName,
    provider: c.issuer,
    // A certificate is a formal requirement only where its own sources say
    // so. Nothing in this catalogue does, and none is inferred: a voluntary
    // industry certificate presented as a legal requirement would be the
    // most damaging sentence on the page.
    relevance: c.mandatory === true ? "formal_requirement" : "recommended_development",
    countries,
    source: c.officialSource,
    lastVerified: c.lastVerified!,
    placements: placementsFor(c.id, "certification", countries),
  };
}

/**
 * Everything a profession guide may show under "Utbildning och behörighet".
 *
 * Order is Layer 2's, computed before any placement is attached.
 */
export function professionEducation(p: Profession): ProfessionEducation {
  const offers: EducationOffer[] = [];
  const underReview: Bi[] = [];

  for (const id of p.educationPathways ?? []) {
    const e = getEducation(id);
    if (!e) continue;
    if (offerPresentable(e)) offers.push(fromEducation(p, e));
    else underReview.push(e.name);
  }

  for (const id of p.certifications ?? []) {
    const c = getCertification(id);
    if (!c) continue;
    if (
      offerPresentable({
        name: c.fullName,
        scope: c.scope,
        officialSource: c.officialSource,
        lastVerified: c.lastVerified,
        status: c.status,
      })
    ) {
      offers.push(fromCertification(p, c));
    } else {
      underReview.push(c.fullName);
    }
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
