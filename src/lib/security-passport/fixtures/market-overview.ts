// Fixture rows for the three-market overview cards, offline.
//
// `availability` mirrors what `listPassportMarketOverview` derives with
// `marketAvailabilityOf`: "available" for a public pack, "internal_pilot"
// only when the database's pilot_state says exactly that, "closed" for
// everything else.
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
  market("GB", "GB", null, "internal_pilot", "closed"),
  market("GB-NI", "GB", "GB-NI", "internal_pilot", "closed"),
  market("AE-DU", "AE", "AE-DU", "internal_pilot", "closed"),
];

/** An entitled pilot member working in Great Britain. */
export const FIXTURE_MARKETS_PILOT_GB: readonly MarketOverviewRow[] = [
  market("SE", "SE", null, "available", "production"),
  market("GB", "GB", null, "internal_pilot", "pilot", true),
  market("GB-NI", "GB", "GB-NI", "internal_pilot", "closed"),
  market("AE-DU", "AE", "AE-DU", "internal_pilot", "closed"),
];

/** An entitled pilot member whose work market is Northern Ireland: the
 *  United Kingdom card carries their access and their action, and ordinary
 *  Great Britain stays closed to them. */
export const FIXTURE_MARKETS_PILOT_GB_NI: readonly MarketOverviewRow[] = [
  market("SE", "SE", null, "available", "production"),
  market("GB", "GB", null, "internal_pilot", "closed"),
  market("GB-NI", "GB", "GB-NI", "internal_pilot", "pilot", true),
  market("AE-DU", "AE", "AE-DU", "internal_pilot", "closed"),
];
