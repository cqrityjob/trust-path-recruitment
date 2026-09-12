// Security Passport — the three markets, as product availability.
//
// ── WHAT THESE CARDS SAY, AND WHAT THEY DO NOT ─────────────────────────
//
// One person has one Security Passport and zero or more MARKET PROFILES,
// and until now nothing on the overview let a holder see that the product
// was built that way: a Swedish guard saw a Swedish Passport, and the fact
// that the same Passport can carry a British licence and a Dubai cadre card,
// each under its own regulator, was visible only after they had moved.
//
// These three cards describe PRODUCT AVAILABILITY per market:
//
//   Sweden              Available
//   United Kingdom      Internal pilot · under review   (Northern Ireland
//                       kept as its own submarket, chosen separately)
//   Dubai, UAE          Internal pilot · under review
//
// "Internal pilot" is printed only when the database's pilot_state says
// exactly that. A pack that is neither public nor in internal pilot — closed,
// an unknown state, a database without the column — reads "Not available",
// because "under review" is a governed claim and the column is its evidence.
//
// They describe nothing about the holder. A card that reads "Available"
// does not mean this person holds anything there; a card that reads "under
// review" does not mean this person is under review. The one holder-specific
// line is their access: their current work market, or a pilot entitlement
// they have been granted — and the pilot line says out loud that an
// entitlement permits registration and is not approval, verification, a
// judgement about the person or an authority to work.
//
// ── PURE ───────────────────────────────────────────────────────────────
//
// Given rows the route read through `listPassportMarketOverview`, plus the
// two navigations a card can offer. No server, no router import beyond
// `Link`, so the guard and the dev harness render it from fixtures.

import { Link } from "@tanstack/react-router";
import { ArrowRight, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import { formatWorkLocation } from "@/lib/security-passport/format";
import type { PassportCopyKey } from "@/lib/security-passport/i18n";

/** One market, as `listPassportMarketOverview` describes it. Structural so a
 *  fixture can satisfy it without importing the server tier. */
export interface MarketOverviewRow {
  readonly marketPackCode: string;
  readonly jurisdictionCode: string;
  readonly subJurisdictionCode: string | null;
  readonly availability: "available" | "internal_pilot" | "closed";
  readonly holderAccess: "production" | "pilot" | "closed";
  readonly isCurrentWorkMarket: boolean;
}

export type MarketOverviewState =
  | { readonly status: "loading" }
  | { readonly status: "failed" }
  | { readonly status: "ready"; readonly markets: readonly MarketOverviewRow[] };

const LINK =
  "inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/** The overview draws Northern Ireland INSIDE the United Kingdom card, as
 *  the separate submarket it is, rather than as a fourth peer card. Three
 *  cards is the product's scale; Northern Ireland is a distinct set of rules
 *  within one of them, and it is chosen separately as a work market. */
const PRIMARY_MARKETS = ["SE", "GB", "AE-DU"] as const;

function StatusChip({ availability }: { availability: MarketOverviewRow["availability"] }) {
  const { pt } = usePassportCopy();
  const key: PassportCopyKey =
    availability === "available"
      ? "markets.status.available"
      : availability === "internal_pilot"
        ? "markets.status.pilot"
        : "markets.status.closed";
  return (
    <span
      data-market-availability={availability}
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
        availability === "available"
          ? "border-emerald-700/30 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
          : "border-border bg-secondary/60 text-foreground",
      )}
    >
      {pt(key)}
    </span>
  );
}

function MarketCard({
  row,
  submarket,
}: {
  readonly row: MarketOverviewRow;
  /** Northern Ireland, when this is the United Kingdom card. */
  readonly submarket?: MarketOverviewRow;
}) {
  const { pt, lang } = usePassportCopy();
  const name = formatWorkLocation(row.jurisdictionCode, row.subJurisdictionCode, lang);
  const usable = row.holderAccess === "production" || row.holderAccess === "pilot";
  const holderIsPilot = row.holderAccess === "pilot";
  const submarketUsable =
    submarket !== undefined &&
    (submarket.holderAccess === "production" || submarket.holderAccess === "pilot");

  // Which market, if any, this card's action adds credentials to. Northern
  // Ireland is chosen as a work market in its own right, so a holder whose
  // work market is GB-NI reaches their catalogue from the United Kingdom
  // card exactly as a GB holder does — the card is the country, the action
  // is the submarket they actually work in.
  const addFor: string | null =
    usable && row.isCurrentWorkMarket
      ? row.marketPackCode
      : submarket && submarketUsable && submarket.isCurrentWorkMarket
        ? submarket.marketPackCode
        : null;

  return (
    <li
      data-market-card={row.marketPackCode}
      data-holder-access={row.holderAccess}
      className="flex flex-col rounded-xl border border-border bg-card p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-base font-semibold tracking-tight text-foreground">{name}</h3>
        <StatusChip availability={row.availability} />
      </div>

      {/* ── The one holder-specific line ─────────────────────────────── */}
      <p className="mt-2 text-sm text-muted-foreground">
        {row.isCurrentWorkMarket ? (
          <span className="font-medium text-foreground">{pt("markets.holder.current")}</span>
        ) : null}
        {row.isCurrentWorkMarket && (holderIsPilot || row.availability !== "available")
          ? " · "
          : null}
        {holderIsPilot
          ? pt("markets.holder.pilotMember")
          : row.availability !== "available"
            ? pt("markets.holder.pilotClosed")
            : null}
      </p>

      {/* The pilot warning stays on an entitled card. A usable pilot market
          that stopped saying it was one would read as a live market. */}
      {holderIsPilot ? (
        <p data-market-pilot-note className="mt-2 text-xs leading-relaxed text-muted-foreground">
          {pt("markets.pilot.note")}
        </p>
      ) : null}

      {submarket ? (
        <div
          data-market-submarket={submarket.marketPackCode}
          className="mt-3 rounded-lg border border-dashed border-border p-3"
        >
          <p className="flex flex-wrap items-center justify-between gap-2 text-sm font-medium text-foreground">
            {pt("markets.ni.label")}
            <StatusChip availability={submarket.availability} />
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {pt("markets.ni.note")}
          </p>
          {submarket.isCurrentWorkMarket || submarket.holderAccess === "pilot" ? (
            <p className="mt-1 text-xs font-medium text-foreground">
              {submarket.isCurrentWorkMarket ? pt("markets.holder.current") : null}
              {submarket.isCurrentWorkMarket && submarket.holderAccess === "pilot" ? " · " : null}
              {submarket.holderAccess === "pilot" ? pt("markets.holder.pilotMember") : null}
            </p>
          ) : null}
          {submarket.holderAccess === "pilot" ? (
            <p
              data-market-pilot-note
              className="mt-1 text-xs leading-relaxed text-muted-foreground"
            >
              {pt("markets.pilot.note")}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-auto pt-3">
        {addFor ? (
          <Link
            to="/passport/information"
            hash="sp-market-section"
            data-market-action="add"
            data-market-action-for={addFor}
            className={LINK}
          >
            {pt("markets.action.add")}
            <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
          </Link>
        ) : (
          <Link
            to="/passport/information"
            hash="sp-work-country"
            data-market-action="choose"
            className={LINK}
          >
            {pt("markets.action.choose")}
            <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
    </li>
  );
}

export function MarketOverviewCards({
  state,
  className,
}: {
  readonly state: MarketOverviewState;
  readonly className?: string;
}) {
  const { pt } = usePassportCopy();

  return (
    <section
      aria-labelledby="ws-markets-heading"
      data-market-overview={state.status}
      className={cn("border-t border-border pt-6", className)}
    >
      <h2
        id="ws-markets-heading"
        className="flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground"
        style={{ fontFamily: "var(--font-display)" }}
      >
        <Globe aria-hidden="true" className="h-4 w-4" />
        {pt("markets.title")}
      </h2>
      <p
        className="mt-2 max-w-[62ch] text-base font-medium text-balance text-foreground"
        data-market-headline
      >
        {pt("markets.headline")}
      </p>
      <p className="mt-1 max-w-[70ch] text-sm leading-relaxed text-muted-foreground">
        {pt("markets.lead")}
      </p>

      {state.status === "loading" ? (
        <p role="status" aria-live="polite" className="mt-4 text-sm text-muted-foreground">
          {pt("markets.loading")}
        </p>
      ) : null}
      {state.status === "failed" ? (
        <p role="alert" className="mt-4 text-sm text-foreground">
          {pt("markets.failed")}
        </p>
      ) : null}

      {state.status === "ready" ? (
        <ul className="mt-4 grid gap-3 sm:grid-cols-3" data-market-cards>
          {PRIMARY_MARKETS.map((code) => {
            const row = state.markets.find((m) => m.marketPackCode === code);
            if (!row) return null;
            const submarket =
              code === "GB" ? state.markets.find((m) => m.marketPackCode === "GB-NI") : undefined;
            return <MarketCard key={code} row={row} submarket={submarket} />;
          })}
        </ul>
      ) : null}

      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        {pt("markets.notCredentials")}
      </p>

      {/* ── How it works, in four steps, and what an employer sees ────── */}
      <div className="mt-6 grid gap-6 md:grid-cols-[2fr_1fr]">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{pt("markets.how.title")}</h3>
          <ol className="mt-2 space-y-1.5 text-sm leading-relaxed text-muted-foreground">
            {(["markets.how.1", "markets.how.2", "markets.how.3", "markets.how.4"] as const).map(
              (k, i) => (
                <li key={k} className="flex gap-2">
                  <span className="w-5 shrink-0 tabular-nums text-foreground">{i + 1}.</span>
                  <span>{pt(k)}</span>
                </li>
              ),
            )}
          </ol>
        </div>
        <p
          data-market-employer-line
          className="self-end rounded-lg border border-border bg-secondary/40 p-3 text-sm leading-relaxed text-foreground"
        >
          {pt("markets.employerLine")}
        </p>
      </div>
    </section>
  );
}
