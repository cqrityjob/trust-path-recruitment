// "Verifierat i andra marknader" — what the holder has earned somewhere else.
//
// ── WHY THIS PANEL IS NOT AN EDIT SURFACE ──────────────────────────────
//
// A holder working in Dubai still owns their Swedish ordningsvaktsförordnande.
// This panel exists so they can SEE that, immediately, on the same screen where
// they just changed country — because the question a country change provokes is
// "did I just lose my Swedish credentials?", and the answer has to be visible
// rather than merely true.
//
// It is deliberately read-only. Every row is a fact about another market; none
// of them is a control. If this panel offered an "add" or "edit" button it
// would become a second route into a Swedish credential form from a Dubai
// context — the exact confusion the selected-market section above it removes.
// Editing a Swedish credential means selecting Sweden, which is one control
// away and unambiguous.
//
// ── COUNTS ARE VERIFIED-ONLY ───────────────────────────────────────────
//
// "4 verifierade" counts credentials that a reviewer verified AND that are
// still current. A lapsed credential is still shown in the expanded list, with
// its own words, because it is still a true fact about the holder — but it is
// not counted in a badge that says "verified", because on a card that number is
// read as a present capability.

import { useState } from "react";
import { ChevronDown, ChevronRight, Globe } from "lucide-react";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import { AssertionChip } from "@/components/security-passport/AssertionChip";
import { LifecycleChip } from "@/components/security-passport/LifecycleChip";
import { marketDisplayName } from "@/lib/security-passport/market-profiles";
import type { MarketProfile, MarketScopedClaim } from "@/lib/security-passport/market-profiles";
import type { AssertionLevel, LifecycleState } from "@/lib/security-passport/types";

/** The minimum a row needs to render. Structural, so a claim entry, a card row
 *  and a fixture persona all satisfy it without conversion. */
export interface OtherMarketClaim extends MarketScopedClaim {
  readonly id: string;
  readonly title: string;
}

export function OtherMarketsPanel({
  profiles,
}: {
  readonly profiles: readonly MarketProfile<OtherMarketClaim>[];
}) {
  const { pt, lang } = usePassportCopy();

  return (
    <section
      className="rounded-xl border border-border bg-card p-5"
      data-testid="other-markets-panel"
    >
      <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight text-foreground">
        <Globe aria-hidden="true" className="h-4 w-4" />
        {pt("market.other.title")}
      </h2>

      {profiles.length === 0 ? (
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          {pt("market.other.none")}
        </p>
      ) : (
        <>
          <p className="mt-1 max-w-[70ch] text-sm leading-relaxed text-muted-foreground">
            {pt("market.other.lead")}
          </p>
          <ul className="mt-4 space-y-2">
            {profiles.map((p) => (
              <MarketRow key={p.marketCode} profile={p} lang={lang} pt={pt} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function MarketRow({
  profile,
  lang,
  pt,
}: {
  readonly profile: MarketProfile<OtherMarketClaim>;
  readonly lang: "sv" | "en";
  readonly pt: ReturnType<typeof usePassportCopy>["pt"];
}) {
  const [open, setOpen] = useState(false);
  const count = profile.verifiedCredentials.length;
  // Everything the holder has in this market, verified first, so an expanded
  // row leads with what the count above it refers to.
  const all = [
    ...profile.verifiedCredentials,
    ...profile.pendingCredentials,
    ...profile.otherClaims,
  ];

  return (
    <li className="rounded-lg border border-border" data-market={profile.marketCode}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 p-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-foreground">
            {marketDisplayName(profile, lang)}
          </span>
          <span className="mt-0.5 block text-xs text-muted-foreground" data-testid="verified-count">
            {count} {count === 1 ? pt("market.verified.one") : pt("market.verified.many")}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground">
          {open ? pt("market.details.hide") : pt("market.details.show")}
          {open ? (
            <ChevronDown aria-hidden="true" className="h-4 w-4" />
          ) : (
            <ChevronRight aria-hidden="true" className="h-4 w-4" />
          )}
        </span>
      </button>

      {open ? (
        <ul className="border-t border-border px-3 py-2">
          {all.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-2 py-1.5">
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">{c.title}</span>
              <AssertionChip level={c.assertionLevel as AssertionLevel} provenance={c} size="sm" />
              {c.lifecycleState === "active" ? null : (
                <LifecycleChip state={c.lifecycleState as LifecycleState} />
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}
