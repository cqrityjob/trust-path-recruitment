// Fixture rows for the three-market overview cards, offline.
//
// The shape `listPassportMarketOverview` returns, for two holders: a public
// holder working in Sweden, and an entitled pilot member working in Great
// Britain. Product availability is what the database says today — Sweden
// active, GB / GB-NI / AE-DU under review — and nothing here opens a market.

import type { MarketOverviewRow } from "@/components/security-passport/MarketOverviewCards";

function market(
  code: string,
  jurisdictionCode: string,
  subJurisdictionCode: string | null,
  availability: MarketOverviewRow["availability"],
  holderAccess: MarketOverviewRow["holderAccess"],
  isCurrentWorkMarket = false,
): MarketOverviewRow {
  return {
    marketPackCode: code,
    jurisdictionCode,
    subJurisdictionCode,
    availability,
    holderAccess,
    isCurrentWorkMarket,
  };
}

/** A public holder working in Sweden: Sweden available, the two pilot
 *  markets visibly under review and closed to them. */
export const FIXTURE_MARKETS_PUBLIC: readonly MarketOverviewRow[] = [
  market("SE", "SE", null, "available", "production", true),
  market("GB", "GB", null, "under_review", "closed"),
  market("GB-NI", "GB", "GB-NI", "under_review", "closed"),
  market("AE-DU", "AE", "AE-DU", "under_review", "closed"),
];

/** An entitled pilot member working in Great Britain. */
export const FIXTURE_MARKETS_PILOT_GB: readonly MarketOverviewRow[] = [
  market("SE", "SE", null, "available", "production"),
  market("GB", "GB", null, "under_review", "pilot", true),
  market("GB-NI", "GB", "GB-NI", "under_review", "closed"),
  market("AE-DU", "AE", "AE-DU", "under_review", "closed"),
];
