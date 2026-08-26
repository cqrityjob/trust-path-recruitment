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

import { ShieldCheck } from "lucide-react";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import { formatWorkLocation, workCountrySupportKey } from "@/lib/security-passport/format";
import { CredentialSymbol } from "@/components/security-passport/CredentialSymbol";

/** The four governed states, mirroring `RegulatedMarketState` exactly.
 *
 *  Written structurally rather than imported from `credentials.functions.ts`
 *  so this stays a pure component the fixture harness can render offline —
 *  `passport-separation-check` keeps the component tree free of the server
 *  tier, and the route is the one place that knows how the answer is fetched. */
export type MarketSectionState = "no_work_country" | "open" | "pending_review" | "unsupported";

/** One registrable credential, as the market pack describes it. */
export interface MarketCredentialOption {
  readonly code: string;
  readonly nameSv: string;
  readonly nameEn: string;
  readonly symbolLabel: string | null;
}

export interface MarketCredentialSectionProps {
  readonly state: MarketSectionState;
  readonly jurisdictionCode: string | null;
  readonly subJurisdictionCode: string | null;
  /** Non-empty only when `state` is "open". A caller that passes options for
   *  any other state is passing a catalogue for a market that is closed, and
   *  they are ignored rather than rendered. */
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
  children,
  onSelect,
  onSetWorkCountry,
}: MarketCredentialSectionProps) {
  const { pt, lang } = usePassportCopy();
  const marketName = formatWorkLocation(jurisdictionCode, subJurisdictionCode, lang);

  // The heading names the market in every state. That is what lets one set of
  // copy strings serve every market: the sentences below never contain a
  // country, so adding a market pack needs no new copy.
  const heading =
    state === "open"
      ? `${pt("market.section.credentialsFor")} ${marketName}`
      : state === "pending_review"
        ? `${marketName} ${pt("market.pending.headingSuffix")}`
        : state === "unsupported"
          ? pt("market.unsupported.heading")
          : pt("market.noWorkCountry.heading");

  return (
    <section
      className="rounded-xl border border-border bg-card p-5"
      data-testid="market-credential-section"
      data-market-state={state}
      data-market={subJurisdictionCode ?? jurisdictionCode ?? ""}
    >
      <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight text-foreground">
        <ShieldCheck aria-hidden="true" className="h-4 w-4" />
        {heading}
      </h2>

      {state === "open" ? (
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          {pt("market.section.lead")}
        </p>
      ) : null}

      {children ? <div className="mt-4">{children}</div> : null}

      {state === "open" ? (
        <div className="mt-4 flex flex-wrap gap-2" data-testid="market-credential-options">
          {options.map((o) => {
            const name = lang === "sv" ? o.nameSv : o.nameEn;
            return (
              <button
                key={o.code}
                type="button"
                onClick={() => onSelect(o.code)}
                data-credential-code={o.code}
                className="inline-flex h-auto min-h-11 w-full max-w-full items-center gap-2 rounded-md border border-input px-3 py-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:w-[calc(50%-0.25rem)] lg:w-[calc(33.333%-0.334rem)]"
              >
                <CredentialSymbol
                  code={o.code}
                  state="self_declared"
                  symbolLabel={o.symbolLabel ?? undefined}
                  name={name}
                  size={28}
                  decorative
                  className="shrink-0"
                />
                {/* Regulated credential names are long single words in
                    Swedish - "Ordningsvaktsforordnande" has no break
                    opportunity - and without this they ran past the card
                    edge. */}
                <span className="min-w-0 break-words leading-tight">{name}</span>
              </button>
            );
          })}
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
