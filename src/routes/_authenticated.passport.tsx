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
import type { PassportCopyKey } from "@/lib/security-passport/i18n";

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

const NAV: readonly { to: string; labelKey: PassportCopyKey }[] = [
  { to: "/passport", labelKey: "nav.overview" },
  { to: "/passport/onboarding", labelKey: "nav.onboarding" },
  // Adding a credential is the main thing a holder comes here to do, so it
  // is reachable from every Passport page, not only from the overview.
  { to: "/passport/credentials/new", labelKey: "nav.credentials" },
  { to: "/passport/card", labelKey: "nav.card" },
  { to: "/passport/share", labelKey: "sc.title" },
  { to: "/passport/privacy", labelKey: "nav.privacy" },
];

function PassportShell() {
  const { pt } = usePassportCopy();
  const { pathname } = useLocation();

  return (
    <SiteLayout>
      <Section>
        <nav aria-label={pt("card.brand")} className="mb-6 border-b border-border">
          <ul className="-mb-px flex flex-wrap gap-1">
            {NAV.map((item) => {
              const active =
                item.to === "/passport" ? pathname === "/passport" : pathname.startsWith(item.to);
              return (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "inline-flex h-11 items-center border-b-2 px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                      active
                        ? "border-accent text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {pt(item.labelKey)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <Outlet />
      </Section>
    </SiteLayout>
  );
}
