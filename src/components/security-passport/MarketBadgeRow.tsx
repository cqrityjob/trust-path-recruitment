// Market badges for the compact surfaces — `SE · 4`, `AE-DU · 2`.
//
// ── WHAT A BADGE IS ALLOWED TO SAY ─────────────────────────────────────
//
// A badge names a MARKET and counts what is verified and current in it. It
// never names a credential. The compact card previously read as a run of
// middot-separated tokens — "OV · SV · Dubai" — in which two Swedish
// credential codes and one emirate sat at the same visual rank, so the row
// invited exactly one reading: that these are the holder's Dubai credentials.
// They are not; OV and SV are granted under Swedish law and mean nothing to
// SIRA.
//
// ── WHY SWEDEN IS "SE" AND NEVER "SV" ──────────────────────────────────
//
// In this product's Swedish vocabulary SV is Skyddsvakt — a regulated
// appointment with its own symbol, its own plate and its own row on the very
// surfaces this component appears on. Reusing SV as a country code would
// collide a credential with a market in the one place with the least room to
// disambiguate. Market codes here are always the `sp_market_packs` codes:
// SE, GB, GB-NI, AE-DU, AE-AZ.
//
// The full market name and the credential titles belong to the expanded card,
// which has room for them. This row is the summary, and it stays a summary.

import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import type { MarketBadge } from "@/lib/security-passport/market-profiles";

export function MarketBadgeRow({
  badges,
  className,
  onNavy = false,
}: {
  readonly badges: readonly MarketBadge[];
  readonly className?: string;
  /** The compact Passport summary sits on the dark primary surface, where the
   *  muted tokens tuned for a light card go unreadable. */
  readonly onNavy?: boolean;
}) {
  const { pt } = usePassportCopy();
  if (badges.length === 0) return null;

  const shell = onNavy
    ? "border-primary-foreground/25 text-primary-foreground"
    : "border-border text-foreground";
  const label = onNavy ? "text-primary-foreground/60" : "text-muted-foreground";
  const count = onNavy ? "text-primary-foreground/70" : "text-muted-foreground";

  return (
    <div className={className} data-testid="market-badge-row">
      <p className={`text-[10px] uppercase tracking-[0.18em] ${label}`}>
        {pt("card.verifiedMarkets")}
      </p>
      <ul className="mt-1.5 flex flex-wrap gap-1.5">
        {badges.map((b) => (
          <li
            key={b.marketCode}
            data-market={b.marketCode}
            className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium ${shell}`}
          >
            {/* The market code, verbatim from sp_market_packs. Never a
                credential code, never a flag alone — a flag cannot distinguish
                Dubai from Abu Dhabi, and those are two regulators. */}
            <span className="font-semibold tracking-wide">{b.marketCode}</span>
            <span aria-hidden="true" className={count}>
              ·
            </span>
            <span className={`tabular-nums ${count}`}>{b.verifiedCount}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
