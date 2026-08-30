// The signed-in candidate's primary navigation, rendered.
//
// One component for both viewports. The desktop bar and the mobile sheet
// differ in layout and in nothing else: same four destinations, same
// order, same labels, same current-location treatment, from the same
// array (CANDIDATE_APP_NAV). The bug this shape rules out is the one the
// previous header actually had — a control that existed at 1440 and
// simply was not there at 375.
//
// ── CURRENT LOCATION IS CARRIED THREE WAYS, NEVER BY COLOUR ALONE ─────
//
//   * aria-current="page"  — for anybody not looking at the pixels
//   * a 2px accent rule    — under the item on desktop, beside it on mobile
//   * font-weight          — medium becomes semibold
//
// Colour is the fourth signal, not the only one. The previous mobile menu
// marked the current page by changing the text from muted-foreground to
// foreground and nothing else, which is a contrast difference of about
// one step and is invisible to a good number of the people this product
// is for.
//
// ── PRESENTATION ONLY ────────────────────────────────────────────────
//
// It receives which item is current and what number to draw. It performs
// no authorization, reads no session and calls nothing. Every destination
// re-verifies its own access server-side.

import { Link } from "@tanstack/react-router";
import { useT } from "@/i18n/context";
import { cn } from "@/lib/utils";
import { CANDIDATE_APP_NAV, type CandidateNavKey } from "./candidate-app-nav";

export function CandidateAppNav({
  variant,
  activeKey,
  badgeFor,
  onNavigate,
}: {
  variant: "desktop" | "mobile";
  activeKey: CandidateNavKey | null;
  /** A number only when something is genuinely waiting for this person.
   *  "You have a thing" is not news; "one thing is waiting" is. */
  badgeFor?: (key: CandidateNavKey) => number | null;
  onNavigate?: () => void;
}) {
  const { t } = useT();
  const mobile = variant === "mobile";

  return (
    <nav
      aria-label={t("appnav.aria")}
      data-candidate-app-nav={variant}
      className={cn(mobile ? "flex flex-col gap-1" : "hidden items-center gap-6 lg:flex xl:gap-8")}
    >
      {CANDIDATE_APP_NAV.map((item) => {
        const current = item.key === activeKey;
        const count = badgeFor?.(item.key) ?? null;
        return (
          <Link
            key={item.key}
            to={item.to}
            onClick={onNavigate}
            // ── WHY exact ──────────────────────────────────────────────
            //
            // <Link> appends its own {"aria-current": "page"} LAST whenever
            // it considers itself active, and TanStack's default is prefix
            // matching — so on /my-career/applications the router marked
            // "Min karriär" current, on top of the "Jobb" this component
            // marks, and a screen reader was told the user was in two
            // places at once. Found in the browser; no source check could
            // have seen it.
            //
            // exact narrows the router's own opinion to "this URL is
            // literally this link", which is the ONE case where it and
            // CANDIDATE_APP_NAV cannot disagree — the guard proves that
            // invariant for every item. Which item is current for every
            // OTHER route stays the config's decision, because the mapping
            // is many-to-one and a per-link prefix cannot express it.
            activeOptions={{ exact: true }}
            aria-current={current ? "page" : undefined}
            data-nav-key={item.key}
            className={cn(
              "transition-colors",
              mobile
                ? "flex min-h-[44px] items-center justify-between gap-2 rounded-md border-l-2 px-2 py-2 text-sm hover:bg-muted"
                : "relative inline-flex items-center gap-1.5 py-1 text-sm",
              current
                ? mobile
                  ? "border-accent font-semibold text-foreground"
                  : "font-semibold text-foreground after:absolute after:-bottom-[22px] after:left-0 after:h-[2px] after:w-full after:bg-accent"
                : mobile
                  ? "border-transparent font-medium text-muted-foreground hover:text-foreground"
                  : "font-medium text-muted-foreground hover:text-foreground",
            )}
          >
            <span>{t(item.labelKey)}</span>
            {count !== null && (
              <span
                className={cn(
                  "inline-flex items-center justify-center rounded-full bg-accent font-bold tabular-nums text-accent-foreground",
                  mobile ? "h-5 min-w-5 px-1.5 text-[11px]" : "h-4 min-w-4 px-1 text-[10px]",
                )}
              >
                {count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
