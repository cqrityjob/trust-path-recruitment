// Which of a holder's credentials are relevant to the country they work in.
//
// ── WHAT THIS IS, AND WHAT IT IS EMPHATICALLY NOT ──────────────────────
//
// A holder may legitimately own credentials from several jurisdictions: a
// Swedish ordningsvaktsförordnande and a Dubai SIRA cadre card are both real,
// both theirs, and both stay in the Passport forever. What is NOT true is that
// either one means anything in the other's country.
//
// The primary Passport surfaces therefore lead with the credentials that
// belong to the holder's stated WORK location, and present the rest as what
// they are — credentials from somewhere else. This module decides that split
// once, so the card, the dashboard summary and any future primary surface
// cannot each invent their own opinion of "relevant".
//
// This is PRESENTATION. It filters a view. It does not:
//
//   * delete, archive, withdraw or supersede a claim,
//   * rewrite a claim's jurisdiction when the holder moves country,
//   * decide what a disclosure contains (that is buildDisclosurePayload),
//   * decide what the holder may ADD (that is the market-pack gate in
//     sp_claims_credential_rules, which is a database constraint, not a view).
//
// A Swedish credential stays jurisdiction = SE after the holder starts working
// in Dubai. It simply stops being the first thing their Dubai-facing card
// talks about.

/** The jurisdiction fields this module needs. Structural on purpose: `Claim`,
 *  a card row and a disclosure row all satisfy it without being converted. */
export interface JurisdictionScoped {
  readonly jurisdictionCode: string | null;
  readonly subJurisdictionCode: string | null;
}

/** Where the holder has stated they work. Both null when unconfirmed — which
 *  is a real and common state, not an error (see `confirmedWorkLocation`). */
export interface WorkLocation {
  readonly jurisdictionCode: string | null;
  readonly subJurisdictionCode: string | null;
}

export interface RelevanceSplit<T> {
  /** Credentials that belong to the holder's stated work location. */
  readonly here: readonly T[];
  /** Credentials from another jurisdiction. Kept, shown, never implied to
   *  transfer. Empty when the holder works where all their evidence is. */
  readonly elsewhere: readonly T[];
  /** Credentials that carry no jurisdiction at all — a language, a practical
   *  capability, a free-text training record. These are not regulated
   *  authorisations and travel with the person, so they are never filed under
   *  "elsewhere" and never hidden by a country change. */
  readonly portable: readonly T[];
}

/** True when a claim belongs to the given work location.
 *
 *  The country must match. Below the country:
 *
 *    * a claim with no sub-jurisdiction is national, so it is relevant
 *      anywhere in its country;
 *    * a work location with no sub-jurisdiction is a country-level statement,
 *      so a regional credential inside that country still counts — the row
 *      prints its own region, so nothing is flattened;
 *    * two DIFFERENT sub-jurisdictions never match. This is the case the
 *      module exists for: an Abu Dhabi licence is not a Dubai licence, and
 *      SIRA's writ does not run in Abu Dhabi.
 */
export function isRelevantToWorkLocation(claim: JurisdictionScoped, work: WorkLocation): boolean {
  if (!claim.jurisdictionCode || !work.jurisdictionCode) return false;
  if (claim.jurisdictionCode !== work.jurisdictionCode) return false;
  if (!claim.subJurisdictionCode || !work.subJurisdictionCode) return true;
  return claim.subJurisdictionCode === work.subJurisdictionCode;
}

/** Split a holder's claims into "here", "elsewhere" and "portable".
 *
 *  When the work location is UNCONFIRMED every jurisdiction-bearing claim
 *  lands in `here`. That is deliberate: with no stated work country there is
 *  no country for anything to be foreign TO, and demoting a holder's entire
 *  Passport to "other credentials" because they have not answered a question
 *  would be a worse lie than the one this module prevents. The caller decides
 *  how to label an unconfirmed location; `formatWorkLocation` already renders
 *  it as "not stated".
 */
export function splitByWorkLocation<T extends JurisdictionScoped>(
  claims: readonly T[],
  work: WorkLocation,
): RelevanceSplit<T> {
  const here: T[] = [];
  const elsewhere: T[] = [];
  const portable: T[] = [];

  for (const claim of claims) {
    if (!claim.jurisdictionCode) {
      portable.push(claim);
    } else if (!work.jurisdictionCode || isRelevantToWorkLocation(claim, work)) {
      here.push(claim);
    } else {
      elsewhere.push(claim);
    }
  }

  return { here, elsewhere, portable };
}

/** The distinct countries represented in a set of claims, in first-seen order.
 *  Used to say "3 credentials from Sweden" without the caller grouping by hand. */
export function countriesOf(claims: readonly JurisdictionScoped[]): readonly string[] {
  const seen: string[] = [];
  for (const c of claims) {
    if (c.jurisdictionCode && !seen.includes(c.jurisdictionCode)) seen.push(c.jurisdictionCode);
  }
  return seen;
}
