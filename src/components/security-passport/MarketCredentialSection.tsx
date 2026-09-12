// The credential entry surface for the market the holder has selected.
//
// ── THE DEFECT THIS COMPONENT REPLACES ─────────────────────────────────
//
// "Mina uppgifter" rendered its credential buttons from a literal:
//
//     (["VU1", "VU2", "OV", "SV"] as const).map(...)
//
// Four Swedish regulated credentials, hard-coded, rendered unconditionally.
// A holder who changed their work country to Dubai or the United Kingdom kept
// looking at them — so the page offered Väktarutbildning 1 as something one
// registers in Dubai. That is a regulatory claim, made by a literal array, on
// behalf of a product whose entire purpose is not to make it.
//
// The governed answer already existed: `getRegulatedCredentialAvailability`
// reads sp_market_packs and returns which regulated credentials this holder may
// register today, and if none, WHY none. It was wired to the credential FORM
// but not to the page that leads there — so the buttons promised what the form
// then refused. This component closes that gap by rendering the four governed
// states and nothing else.
//
// ── THERE IS NO FALLBACK CATALOGUE ─────────────────────────────────────
//
// Three of the four states render no selectable credential at all, and none of
// them substitutes another market's list. "We have not reviewed Dubai's rules"
// and "here are Sweden's credentials" are not near-misses; the second is false.
// An empty list would have been better than the literal and still wrong, which
// is why each closed state says which absence it is.

import { ShieldCheck, RefreshCw } from "lucide-react";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import { formatWorkLocation, workCountrySupportKey } from "@/lib/security-passport/format";
import {
  isOfferableMarketState,
  type CatalogueOption,
} from "@/lib/security-passport/market-catalogue";
import { CredentialCatalogue, type CatalogueStatus } from "./CredentialCatalogue";

/** The four governed states, mirroring `RegulatedMarketState` exactly.
 *
 *  Written structurally rather than imported from `credentials.functions.ts`
 *  so this stays a pure component the fixture harness can render offline —
 *  `passport-separation-check` keeps the component tree free of the server
 *  tier, and the route is the one place that knows how the answer is fetched. */
export type MarketSectionState =
  | "no_work_country"
  | "open"
  /** Open to this holder as a named internal pilot member. Renders the
   *  catalogue AND a market-status line, because a market whose regulatory
   *  content is still under review must not look like a live one. */
  | "open_pilot"
  | "pending_review"
  | "unsupported";

/** One registrable credential, as the market pack describes it. The shared
 *  catalogue shape: `category` is what groups a licence apart from the
 *  training behind it. */
export type MarketCredentialOption = CatalogueOption;

/** How the read of the market rules went. The route owns the read; this
 *  component owns saying so. "loading" and "failed" are drawn as themselves
 *  — a status line, an alert with a retry — and NEVER as one of the four
 *  governed states above: a slow read that rendered as "no work country"
 *  would tell a holder who has named their market that they have not, and a
 *  failed one would do the same while hiding that anything failed. */
export type MarketReadStatus = "loading" | "ready" | "failed";

export interface MarketCredentialSectionProps {
  /** Consulted only when `read` is "ready". */
  readonly state: MarketSectionState;
  readonly read?: MarketReadStatus;
  /** Offered when the read failed. */
  readonly onRetry?: () => void;
  readonly jurisdictionCode: string | null;
  readonly subJurisdictionCode: string | null;
  /** Non-empty only when `state` is "open" or "open_pilot". A caller that
   *  passes options for any other state is passing a catalogue for a market
   *  that is closed, and they are ignored rather than rendered. */
  readonly options: readonly MarketCredentialOption[];
  /** What already exists in this market. Rendered above the entry controls so
   *  the holder sees their own record before they are asked to add to it. */
  readonly children?: React.ReactNode;
  readonly onSelect: (code: string) => void;
  /** Offered only in the "no work country" state, where naming the market is
   *  the action that unblocks everything below it. */
  readonly onSetWorkCountry?: () => void;
}

export function MarketCredentialSection({
  state,
  jurisdictionCode,
  subJurisdictionCode,
  options,
  read = "ready",
  onRetry,
  children,
  onSelect,
  onSetWorkCountry,
}: MarketCredentialSectionProps) {
  const { pt, lang } = usePassportCopy();
  const marketName = formatWorkLocation(jurisdictionCode, subJurisdictionCode, lang);
  // Both states offer a catalogue. They differ only in what the surface must
  // SAY about the market, never in what it may refuse — the database decides
  // that, and it decided before this component was rendered. The rule is the
  // shared one, so this section and the route feeding it cannot disagree.
  const isOpen = read === "ready" && isOfferableMarketState(state);
  // While the rules are being read, or after the read failed, nothing below
  // may be drawn from `state` or `options`: both belong to the previous
  // answer, and the previous answer may be another market's.
  const settled = read === "ready";
  const catalogueStatus: CatalogueStatus = read === "ready" ? "ready" : read;

  // The heading names the market in every state. That is what lets one set of
  // copy strings serve every market: the sentences below never contain a
  // country, so adding a market pack needs no new copy.
  const heading = !settled
    ? jurisdictionCode
      ? `${pt("market.section.credentialsFor")} ${marketName}`
      : pt("market.noWorkCountry.heading")
    : isOpen
      ? `${pt("market.section.credentialsFor")} ${marketName}`
      : state === "pending_review"
        ? `${marketName} ${pt("market.pending.headingSuffix")}`
        : state === "unsupported"
          ? pt("market.unsupported.heading")
          : pt("market.noWorkCountry.heading");

  return (
    <section
      // An anchor, so the overview's market card can send the holder straight
      // to the catalogue for the market they chose. Focusable only as a target.
      id="sp-market-section"
      tabIndex={-1}
      className="scroll-mt-24 rounded-xl border border-border bg-card p-5 outline-none"
      data-testid="market-credential-section"
      data-market-state={settled ? state : read}
      data-market-read={read}
      data-market={subJurisdictionCode ?? jurisdictionCode ?? ""}
    >
      <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight text-foreground">
        <ShieldCheck aria-hidden="true" className="h-4 w-4" />
        {heading}
      </h2>

      {isOpen ? (
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          {pt("market.section.lead")}
        </p>
      ) : null}

      {/* ── The market status line ────────────────────────────────────
          One line, in the page's own register, immediately under the heading
          that names the market. Not a red alert repeated on every screen:
          that trains a tester to dismiss it. It states a fact about the
          market, which is exactly what stops an unreviewed market from
          reading as a live one. */}
      {state === "open_pilot" ? (
        <div
          data-testid="market-pilot-status"
          className="mt-3 rounded-lg border border-border bg-secondary/40 p-3"
        >
          <p className="text-sm font-medium text-foreground">{pt("market.pilot.status")}</p>
          <p className="mt-1 max-w-[70ch] text-sm leading-relaxed text-muted-foreground">
            {pt("market.pilot.body")}
          </p>
        </div>
      ) : null}

      {children ? <div className="mt-4">{children}</div> : null}

      {!settled ? (
        // ── NOT SETTLED. Say which, offer the way out, draw nothing else. ──
        read === "loading" ? (
          <p
            role="status"
            aria-live="polite"
            data-testid="market-read-loading"
            className="mt-4 text-sm text-muted-foreground"
          >
            {pt("market.read.loading")}
          </p>
        ) : (
          <div
            role="alert"
            data-testid="market-read-failed"
            className="mt-4 rounded-lg border border-border bg-secondary/40 p-4"
          >
            <p className="max-w-[70ch] text-sm leading-relaxed text-foreground">
              {pt("market.read.failed")}
            </p>
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                data-testid="market-read-retry"
                className="mt-3 inline-flex h-11 items-center gap-2 rounded-md border border-input px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <RefreshCw aria-hidden="true" className="h-4 w-4" />
                {pt("market.read.retry")}
              </button>
            ) : null}
          </div>
        )
      ) : isOpen ? (
        // ── OPEN. The shared catalogue, grouped by meaning. ─────────────
        //
        // Not a flat row of buttons any more: Dubai's thirty choices need
        // a search and two headings to be readable at all, and Sweden's
        // eight are clearer for the same headings. The catalogue decides the
        // presentation; this section decided only that there IS one.
        <div className="mt-4" data-testid="market-credential-options">
          <CredentialCatalogue
            mode="action"
            options={options}
            status={catalogueStatus}
            onRetry={onRetry}
            onSelect={onSelect}
            idPrefix="sp-market-catalogue"
          />
        </div>
      ) : (
        // ── CLOSED. Which absence, in the market's own name. ───────────
        <div
          className="mt-4 rounded-lg border border-border bg-secondary/40 p-4"
          data-testid="market-closed-notice"
        >
          <p className="max-w-[70ch] text-sm leading-relaxed text-foreground">
            {state === "no_work_country"
              ? pt("cred.market.noWorkCountry")
              : state === "pending_review"
                ? pt("market.pending.body")
                : pt("market.unsupported.body")}
          </p>

          {/* A pack that exists but has not been reviewed gets the market's own
              sentence as well — the same string the work-country panel and the
              credential form print, so the three surfaces cannot disagree about
              the same closed market. */}
          {state === "pending_review" ? (
            <p className="mt-2 max-w-[70ch] text-sm leading-relaxed text-muted-foreground">
              {pt(workCountrySupportKey(jurisdictionCode, subJurisdictionCode))}
            </p>
          ) : null}

          {/* Said in every closed state, because the fear this creates is
              specific and immediate: that changing country threw away what the
              holder had already earned. It did not, and the sentence is here
              rather than two screens away. */}
          <p className="mt-2 max-w-[70ch] text-sm leading-relaxed text-muted-foreground">
            {pt("cred.market.keepsExisting")}
          </p>

          {state === "no_work_country" && onSetWorkCountry ? (
            <button
              type="button"
              onClick={onSetWorkCountry}
              className="mt-3 inline-flex h-11 items-center rounded-md border border-input px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {pt("cred.market.setWorkCountry")}
            </button>
          ) : null}
        </div>
      )}
    </section>
  );
}
