// Security Passport — one holder, one Passport, several MARKET PROFILES.
//
// ── THE PRODUCT MODEL THIS FILE ENCODES ────────────────────────────────
//
//   ONE PERSON
//     → ONE SECURITY PASSPORT
//       → ZERO OR MORE MARKET PROFILES
//         → credentials that belong to THAT market's jurisdiction
//
// A holder may hold a Swedish ordningsvaktsförordnande and a Dubai SIRA cadre
// card at the same time. Both are real, both are theirs, both stay in the
// Passport forever — and neither means anything in the other's country.
//
// ── WHY THIS IS DERIVED AND NOT A TABLE ────────────────────────────────
//
// A "market profile" is not a new fact. Every field below is already recorded:
//
//   * the market            — sp_claims.jurisdiction_code + sub_jurisdiction_code
//   * whether it is open    — sp_market_packs.is_active   (via the governed
//                             getRegulatedCredentialAvailability)
//   * the credential itself — sp_claims.title / credential_code
//   * its standing          — sp_claims.assertion_level / lifecycle_state
//
// So this module GROUPS. It adds no storage, no migration and no second source
// of truth. Adding a `sp_market_profiles` table because a card wanted a
// subheading would have created a row that can disagree with the claims it
// summarises — and the first time it did, the product would be asserting a
// market membership nobody granted.
//
// ── WHAT THIS MODULE MUST NEVER DO ─────────────────────────────────────
//
// Decide what a holder may REGISTER. That is the market pack, read by
// getRegulatedCredentialAvailability and enforced by sp_claims_credential_rules.
// This module only describes what a holder ALREADY has, and where it is from.
//
// It also never rewrites a jurisdiction. `marketCodeOf` reads the codes on the
// claim; nothing here writes them. A holder cannot move a Swedish credential to
// Dubai by changing a dropdown, because no code path exists that would.

import type { PassportLang } from "./i18n";
import { effectiveAssertionLevel } from "./provenance";
import { formatWorkLocation } from "./format";
import type { JurisdictionScoped, WorkLocation } from "./jurisdiction-relevance";

/** The market a jurisdiction pair belongs to, in `sp_market_packs.code` form.
 *
 *  The convention is the pack's own: a country whose rules are national is its
 *  ISO code ("SE", "GB"); a country whose rules are authored per region is the
 *  region ("GB-NI", "AE-DU", "AE-AZ"). Deriving the key the same way the packs
 *  are keyed is what lets a profile be matched to its pack without a lookup
 *  table that could drift.
 *
 *  Returns null for a claim with no jurisdiction at all — a language, a driving
 *  licence, a free-text course. Those are portable and belong to no market. */
export function marketCodeOf(
  jurisdictionCode: string | null,
  subJurisdictionCode: string | null,
): string | null {
  if (!jurisdictionCode) return null;
  return subJurisdictionCode ?? jurisdictionCode;
}

/** Whether a claim and a work location name the same market.
 *
 *  Strict on purpose, and stricter than `isRelevantToWorkLocation`: that
 *  function answers "may this credential be read in the country the holder
 *  works in", which is a presentation question and lets a regional credential
 *  count inside its own country. This one answers "is this the SAME market
 *  pack", which is the grouping question — and Abu Dhabi and Dubai are two
 *  packs, two regulators and two answers. */
export function isSameMarket(claim: JurisdictionScoped, work: WorkLocation): boolean {
  const a = marketCodeOf(claim.jurisdictionCode, claim.subJurisdictionCode);
  const b = marketCodeOf(work.jurisdictionCode, work.subJurisdictionCode);
  return a !== null && b !== null && a === b;
}

/** The standing of a credential inside its market profile.
 *
 *  Mirrors the two facts `sp_claims` records — how well evidenced, and whether
 *  still current — collapsed into the three buckets a holder reads. */
export interface MarketScopedClaim extends JurisdictionScoped {
  readonly assertionLevel: string;
  readonly lifecycleState: string;
  /** Provenance, where the caller has it. Lets the buckets read the EFFECTIVE
   *  level: a legacy unsupported approval is not a verified credential. */
  readonly verifierName?: string | null;
  readonly verificationMethod?: string | null;
}

export interface MarketProfile<T extends MarketScopedClaim> {
  /** `sp_market_packs.code` form: "SE", "GB", "GB-NI", "AE-DU", "AE-AZ". */
  readonly marketCode: string;
  readonly jurisdictionCode: string;
  readonly subJurisdictionCode: string | null;
  /** The market the holder currently says they work in. Exactly one profile
   *  can carry this, and it may be none — a holder with a Swedish Passport who
   *  has just moved to Dubai has no Dubai profile until they record something
   *  there, and the Dubai market is reported separately by the caller. */
  readonly isCurrentWorkMarket: boolean;
  /** Verified by a reviewer and still current. The only bucket that may be
   *  counted in a "4 verified" badge. */
  readonly verifiedCredentials: readonly T[];
  /** Submitted or evidenced, not yet verified. */
  readonly pendingCredentials: readonly T[];
  /** Everything else in this market: self-declared, expired, superseded. Kept
   *  and shown — a credential that lapsed is still a fact about the holder. */
  readonly otherClaims: readonly T[];
}

/** Claims that belong to no market: languages, practical capabilities and any
 *  other claim carrying no jurisdiction. They travel with the person, so they
 *  are never filed under a country and never hidden by a country change. */
export interface MarketProfileSplit<T extends MarketScopedClaim> {
  readonly profiles: readonly MarketProfile<T>[];
  readonly portable: readonly T[];
}

function isVerified(c: MarketScopedClaim): boolean {
  return effectiveAssertionLevel(c) === "verified" && c.lifecycleState === "active";
}

function isPending(c: MarketScopedClaim): boolean {
  const level: string = effectiveAssertionLevel(c);
  return (
    level !== "verified" &&
    c.lifecycleState === "active" &&
    (level === "submitted" || level === "evidenced")
  );
}

/** Group a holder's claims into one profile per market.
 *
 *  ── DETERMINISM IS A REQUIREMENT, NOT A NICETY ───────────────────────
 *
 *  The Passport Card, the compact card and the employer disclosure all render
 *  this list, and a holder who sees Sweden first on one surface and Dubai first
 *  on another has been shown two different documents about themselves. The
 *  order is therefore total and content-derived — never insertion order, never
 *  `Object.keys`:
 *
 *    1. the current work market first, when the holder has a profile there;
 *    2. then by verified count, descending — the strongest evidence leads;
 *    3. then by market code, ascending, which breaks every remaining tie
 *       because market codes are unique.
 *
 *  Claims WITHIN a profile keep the order they arrived in, which is the
 *  caller's `created_at DESC`.
 */
export function deriveMarketProfiles<T extends MarketScopedClaim>(
  claims: readonly T[],
  work: WorkLocation,
): MarketProfileSplit<T> {
  const workMarket = marketCodeOf(work.jurisdictionCode, work.subJurisdictionCode);
  const byMarket = new Map<string, T[]>();
  const portable: T[] = [];

  for (const claim of claims) {
    const code = marketCodeOf(claim.jurisdictionCode, claim.subJurisdictionCode);
    if (code === null) {
      portable.push(claim);
      continue;
    }
    const bucket = byMarket.get(code);
    if (bucket) bucket.push(claim);
    else byMarket.set(code, [claim]);
  }

  const profiles: MarketProfile<T>[] = [];
  for (const [marketCode, group] of byMarket) {
    const first = group[0];
    profiles.push({
      marketCode,
      jurisdictionCode: first.jurisdictionCode as string,
      subJurisdictionCode: first.subJurisdictionCode,
      isCurrentWorkMarket: workMarket !== null && marketCode === workMarket,
      verifiedCredentials: group.filter(isVerified),
      pendingCredentials: group.filter(isPending),
      otherClaims: group.filter((c) => !isVerified(c) && !isPending(c)),
    });
  }

  profiles.sort((a, b) => {
    if (a.isCurrentWorkMarket !== b.isCurrentWorkMarket) return a.isCurrentWorkMarket ? -1 : 1;
    const byVerified = b.verifiedCredentials.length - a.verifiedCredentials.length;
    if (byVerified !== 0) return byVerified;
    return a.marketCode < b.marketCode ? -1 : a.marketCode > b.marketCode ? 1 : 0;
  });

  return { profiles, portable };
}

/** The profiles that are NOT the holder's current work market.
 *
 *  This is the "Verifierat i andra marknader" list. It is informative and it is
 *  never an edit surface: a holder working in Dubai must not be able to reach a
 *  Swedish credential form through a panel that exists to tell them their
 *  Swedish credentials are safe. */
export function otherMarkets<T extends MarketScopedClaim>(
  profiles: readonly MarketProfile<T>[],
): readonly MarketProfile<T>[] {
  return profiles.filter((p) => !p.isCurrentWorkMarket);
}

/** The holder's profile for the market they work in, when they have one. */
export function currentMarket<T extends MarketScopedClaim>(
  profiles: readonly MarketProfile<T>[],
): MarketProfile<T> | null {
  return profiles.find((p) => p.isCurrentWorkMarket) ?? null;
}

/** The market's name, spoken the way the rest of the Passport speaks it.
 *
 *  Delegates to `formatWorkLocation` so a profile heading and the work-country
 *  panel cannot render the same market differently. In particular a Dubai
 *  profile reads "Dubai, Förenade Arabemiraten" and never the bare "Förenade
 *  Arabemiraten", which would be the UAE-wide claim the market packs exist to
 *  refuse. */
export function marketDisplayName(
  profile: { readonly jurisdictionCode: string; readonly subJurisdictionCode: string | null },
  lang: PassportLang,
): string {
  return formatWorkLocation(profile.jurisdictionCode, profile.subJurisdictionCode, lang);
}

/** The short badge a compact card prints: `Sverige · 4`, `Dubai · 2`.
 *
 *  `marketCode` is the KEY, not the caption. It is what `data-market` and the
 *  guards key on, and `MarketBadgeRow` resolves it through `formatJurisdiction`
 *  so the summary says the market's name rather than its code — the same name
 *  `marketDisplayName` gives the expanded card. A code with no reviewed name
 *  falls back to itself there, deliberately.
 *
 *  ── WHY THE MARKET CODE AND NOT THE CREDENTIAL ───────────────────────
 *
 *  The compact card used to print credential codes — "OV · SV · Dubai" — which
 *  reads as three items of one kind and invited exactly the inference this work
 *  exists to remove. A badge names a MARKET and counts what is verified in it.
 *
 *  "SV" is deliberately never a market code here: in this product's Swedish
 *  vocabulary SV is Skyddsvakt, and reusing it for Sverige would collide a
 *  credential with a country on the one surface with the least room to
 *  disambiguate. Sweden is "SE". */
export interface MarketBadge {
  readonly marketCode: string;
  readonly verifiedCount: number;
}

export function marketBadges<T extends MarketScopedClaim>(
  profiles: readonly MarketProfile<T>[],
): readonly MarketBadge[] {
  return profiles.map((p) => ({
    marketCode: p.marketCode,
    verifiedCount: p.verifiedCredentials.length,
  }));
}
