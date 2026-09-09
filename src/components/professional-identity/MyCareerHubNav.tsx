// The My Career hub's section navigation, rendered.
//
// ── IT IS THE PASSPORT'S PATTERN, NOT A NEW ONE ───────────────────────
//
// _authenticated.passport.tsx has carried a section strip since the
// Passport became a product shell: a bordered row of tabs under the site
// header, the current one marked with aria-current and a 2px accent rule.
// This is that component's shape, applied to the six areas of My Career,
// because a candidate should not have to learn two navigations inside one
// account. Nothing about the visual system is new here.
//
// ── WHY IT WRAPS RATHER THAN SCROLLS ──────────────────────────────────
//
// Six labels do not fit on one 375px line. The two ways out are a
// horizontally scrolling strip and a wrapping row, and the scrolling strip
// hides destinations behind a gesture that has no affordance — which is
// the exact failure this hub exists to fix, reproduced at a smaller scale.
// It wraps. Every area is visible at every width, and the page never
// scrolls sideways.
//
// ── CURRENT LOCATION IS NEVER COLOUR ALONE ────────────────────────────
//
//   * aria-current="page" — for anybody not looking at the pixels
//   * a 2px accent rule under the tab
//   * font-weight: medium becomes semibold
//
// ── PRESENTATION ONLY ─────────────────────────────────────────────────
//
// It receives which section is current. It performs no authorization,
// reads no session and calls nothing; every destination re-verifies its
// own access server-side.

import { Link } from "@tanstack/react-router";
import { useT } from "@/i18n/context";
import { cn } from "@/lib/utils";
import { MY_CAREER_HUB, type HubSectionKey } from "@/lib/professional-identity/hub-sections";
import { L, type Lang } from "./copy";
import { HUB } from "./home-copy";

export function MyCareerHubNav({ activeKey }: { activeKey: HubSectionKey | null }) {
  const { lang } = useT();
  const l = lang as Lang;

  return (
    <nav aria-label={L(HUB.navAria, l)} data-my-career-hub-nav className="border-b border-border">
      <ul className="-mb-px flex flex-wrap gap-x-1 gap-y-0">
        {MY_CAREER_HUB.map((section) => {
          const current = section.key === activeKey;
          return (
            <li key={section.key}>
              <Link
                to={section.to}
                // ── WHY exact ────────────────────────────────────────
                //
                // <Link> appends its own aria-current="page" LAST whenever
                // it considers itself active, and TanStack matches by
                // PREFIX by default — so on /my-career/cv the router would
                // also mark the Overview tab, and a screen reader would be
                // told the reader is in two places at once. This is the
                // same defect, and the same pin, as CandidateAppNav.
                //
                // `exact` narrows the router's opinion to "this URL is
                // literally this link", the one case where it and
                // MY_CAREER_HUB cannot disagree. Which tab is current for
                // every other route stays the table's decision, because
                // the mapping is many-to-one.
                activeOptions={{ exact: true }}
                aria-current={current ? "page" : undefined}
                data-hub-key={section.key}
                className={cn(
                  "inline-flex h-11 items-center whitespace-nowrap border-b-2 px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  current
                    ? "border-accent font-semibold text-foreground"
                    : "border-transparent font-medium text-muted-foreground hover:text-foreground",
                )}
              >
                {L(HUB.sections[section.key], l)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
