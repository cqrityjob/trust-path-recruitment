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
  // Adding a credential is an ACTION on the credentials, not a place: it is
  // the button beneath the Passport, and the form keeps this tab current.
  {
    to: "/passport",
    hash: "merits",
    also: ["/passport/credentials/new"],
    sv: "Meriter",
    en: "Credentials",
  },
  { to: "/passport", hash: "attention", sv: "Granskning", en: "Verification" },
  // The recipient-style Passport lives in exactly one place, and so does
  // everything about who may see it. /passport/card redirects here.
  { to: "/passport/share", also: ["/passport/privacy"], sv: "Dela", en: "Share" },
] as const;

/** What the Share tab absorbed. Both pages keep their address and their
 *  content; this row is how a holder moves between them. */
const SHARE_SECTIONS = [
  { to: "/passport/share", sv: "Förhandsvisa och dela", en: "Preview and share" },
  { to: "/passport/privacy", sv: "Delning och integritet", en: "Sharing & privacy" },
] as const;

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
      <Section className="bg-secondary/30 py-5 md:py-7">
        {firstRun ? null : (
          <nav
            aria-label={pt("card.brand")}
            className="mb-7 overflow-x-auto border-b border-border bg-background/70"
          >
            <ul className="-mb-px flex min-w-max gap-1">
              {NAV.map((item) => {
                const also = "also" in item ? item.also : [];
                const hashOf = "hash" in item ? item.hash : undefined;
                const active = also.some((p) => pathname.startsWith(p))
                  ? true
                  : hashOf
                    ? pathname === item.to && hash === hashOf
                    : item.to === "/passport"
                      ? pathname === "/passport" && !hash
                      : pathname.startsWith(item.to);
                return (
                  <li key={item.to + (hashOf ?? "")}>
                    <Link
                      to={item.to}
                      hash={hashOf}
                      // The router marks a link current by PREFIX and spreads its own
                      // aria-current last; three of these share one path. Exact, with
                      // the hash, is the only case where it cannot disagree with us.
                      activeOptions={{ exact: true, includeHash: true }}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "inline-flex min-h-11 items-center justify-center whitespace-nowrap border-b-2 px-2.5 text-center text-sm font-medium sm:px-3 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
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

        {SHARE_SECTIONS.some((s) => pathname.startsWith(s.to)) ? (
          <nav
            aria-label={lang === "sv" ? "Dela" : "Share"}
            data-passport-share-sections
            className="-mt-3 mb-6"
          >
            <ul className="flex flex-wrap gap-x-5">
              {SHARE_SECTIONS.map((s) => {
                const here = pathname.startsWith(s.to);
                return (
                  <li key={s.to}>
                    <Link
                      to={s.to}
                      activeOptions={{ exact: true }}
                      aria-current={here ? "page" : undefined}
                      className={cn(
                        "inline-flex min-h-11 items-center text-sm underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                        here
                          ? "font-semibold text-foreground"
                          : "text-muted-foreground hover:text-foreground hover:underline",
                      )}
                    >
                      {s[lang]}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        ) : null}

        <Outlet />
        {!firstRun && <PassportOwnership />}
      </Section>
    </SiteLayout>
  );
}
