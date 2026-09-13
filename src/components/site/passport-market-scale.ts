// Security Passport — the market scale a PUBLIC page may state.
//
// Lives in components/site/ and NOT in lib/security-passport/, deliberately.
// scripts/passport-separation-check.ts rule 5 forbids a Passport module from
// importing the central dictionary: Passport copy is domain-local, in
// lib/security-passport/i18n.ts. This module is not Passport copy and is not
// a Passport internal — it is the public site chrome naming three markets in
// the site's own two languages, so it belongs beside candidate-app-nav.ts,
// which is shaped the same way and for the same reason.
//
// ── WHY THIS FILE EXISTS, AND WHAT IT DELIBERATELY IS NOT ──────────────
//
// The public homepage has to say, in words, that Security Passport supports
// Sweden, Great Britain and Dubai. It cannot get that from the governed
// read: `PASSPORT_OVERVIEW_MARKETS` lives in credentials.functions.ts, which
// imports `createServerFn` and reaches `sp_market_packs` for a signed-in
// holder. Importing it into a signed-out marketing route would pull the
// server-function machinery — and a per-holder entitlement question — into a
// page that has no holder and needs no database.
//
// So this is a PRESENTATION READ MODEL and nothing else:
//
//   * it names market-pack CODES, which are the same codes the governed
//     overview declares, and scripts/public-homepage-check.tsx fails the
//     build if the two lists ever disagree — the same mirror-and-prove
//     shape identity/market-rules.ts already uses against its migration;
//   * it carries no credential, no entitlement, no activation state and no
//     holder. Nothing here says a market is open TO YOU, because that is a
//     per-holder answer this module has no way to ask and must never guess;
//   * it holds no copy. The names are dictionary keys, so the Swedish and
//     English pages read the same list in their own language.
//
// It changes no market entitlement, no activation, no table and no Passport
// internal. Adding a fourth market pack is still a database and governance
// change; this file only follows one once it has been made.

import type { TranslationKey } from "@/i18n/dictionaries";

/** One market, as a public page names it.
 *
 *  `code` is an `sp_market_packs.code` — the pack's own convention, where a
 *  country whose rules are national is its ISO code ("SE", "GB") and a
 *  country whose rules are authored per region is the region ("AE-DU"). */
export interface PublicMarket {
  readonly code: string;
  readonly labelKey: TranslationKey;
}

/** The three markets the owner has declared as the product's public scale.
 *
 *  THREE, not four: the governed overview also carries "GB-NI", which is
 *  Northern Ireland as its own submarket of Great Britain rather than a
 *  fourth country. A public page that listed it beside Sweden and Dubai
 *  would be describing the pack table instead of the product. Abu Dhabi is
 *  absent for the opposite and stronger reason — it is authored, unreviewed
 *  and closed by owner decision, and a market nobody has opened is not one
 *  of the product's markets. */
export const PUBLIC_MARKET_SCALE: readonly PublicMarket[] = [
  { code: "SE", labelKey: "home.markets.SE" },
  { code: "GB", labelKey: "home.markets.GB" },
  { code: "AE-DU", labelKey: "home.markets.AE-DU" },
] as const;
