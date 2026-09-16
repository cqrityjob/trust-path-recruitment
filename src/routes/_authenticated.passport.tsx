// Security Passport — the authenticated product shell.
//
// Sits behind the existing `_authenticated` guard, so sign-in, session
// handling, recovery and the redirect-with-query-string behaviour are all
// the ones the rest of the product already uses. Nothing about
// authentication is new here.
//
// The Passport is a separate PRODUCT from Career Card, and this shell is
// where that separation becomes visible to a holder: its own destination,
// its own navigation, its own language — inside the same account and the
// same site chrome, so it never feels like a different company's portal.

import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Section } from "@/components/site/Section";
import { cn } from "@/lib/utils";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import { PassportOwnership } from "@/components/security-passport/PassportOwnership";

export const Route = createFileRoute("/_authenticated/passport")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Security Passport — CQrityjob" },
      // Private by default, and that includes not being indexed. Phase 2 has
      // no public surface at all; this is belt and braces.
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PassportShell,
});

const NAV = [
  { to: "/passport", sv: "Översikt", en: "Overview" },
  { to: "/passport", hash: "merits", sv: "Meriter", en: "Credentials" },
  { to: "/passport/credentials/new", sv: "Lägg till", en: "Add credential" },
  { to: "/passport", hash: "attention", sv: "Granskning", en: "Verification" },
  { to: "/passport/card", sv: "Förhandsvisa och dela", en: "Preview and share" },
  { to: "/passport/privacy", sv: "Delning och integritet", en: "Sharing & privacy" },
];

function PassportShell() {
  const { pt, lang } = usePassportCopy();
  const { pathname, hash } = useLocation();

  // Keep initial setup focused; the product navigation returns afterwards.
  const firstRun = pathname === "/passport/onboarding";

  return (
    <SiteLayout>
      {/* `py-20 md:py-28` is right for a marketing section and wrong for an
          application: it pushed the heading a third of the way down a 1440px
          window, so a holder opening their Passport met a screen of nothing
          before the first word. The whole product shell takes the tighter
          rhythm; the first run, which is a short form, takes it too. */}
      <Section className="py-5 md:py-7">
        {firstRun ? null : (
          <nav
            aria-label={pt("card.brand")}
            className="mb-6 overflow-x-auto border-b border-border"
          >
            <ul className="-mb-px flex min-w-max gap-1">
              {NAV.map((item) => {
                const active = item.hash
                  ? pathname === item.to && hash === item.hash
                  : item.to === "/passport"
                    ? pathname === "/passport" && !hash
                    : pathname.startsWith(item.to);
                return (
                  <li key={item.to + (item.hash ?? "")}>
                    <Link
                      to={item.to}
                      hash={item.hash}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "inline-flex min-h-11 items-center justify-center whitespace-nowrap border-b-2 px-3 text-center text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                        active
                          ? "border-accent text-foreground"
                          : "border-transparent text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {item[lang]}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        )}

        <Outlet />
        {!firstRun && <PassportOwnership />}
      </Section>
    </SiteLayout>
  );
}
