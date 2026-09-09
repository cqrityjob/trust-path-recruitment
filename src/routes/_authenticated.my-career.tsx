// My Career — the candidate's product shell.
//
// ── WHAT THIS ROUTE BECAME, AND WHY ────────────────────────────────────
//
// It used to be `<Outlet />` and nothing else, and every page under it
// mounted its own <SiteLayout>. That was invisible until the review of the
// candidate pilot journey: with no shell, there was no place to say what
// My Career CONTAINS, so the overview said it instead — by rendering every
// area in full, one below the other, 2838px tall at 1440. The CV was
// 1425px down inside a list called "Karriärverktyg"; sharing was not on
// the page at all.
//
// A shell is the fix. It is the same shape /passport has had since the
// Passport became a product: the site chrome, a section strip naming the
// areas, and the page. Not a new pattern, and not a new route — every
// destination in the strip already existed.
//
// ── THE SHELL OWNS SiteLayout NOW ──────────────────────────────────────
//
// Which is why every child dropped its own. Two <SiteLayout>s nest two
// headers and two footers, so this had to move rather than be added.
// Children keep their own <Container>/<Section> and therefore their own
// widths; the strip sits above all of them at one width, which is what
// makes it read as belonging to the area rather than to the page.
//
// ── IT GRANTS NOTHING ──────────────────────────────────────────────────
//
// `_authenticated` is still the gate, unchanged. Every destination
// re-verifies its own access: the CV and application lists are owner-
// scoped by RLS and the Passport reads the holder's own record. Which tab
// is drawn has never been the boundary.

import { createFileRoute, Outlet, useMatches } from "@tanstack/react-router";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Container } from "@/components/site/Container";
import { MyCareerHubNav } from "@/components/professional-identity/MyCareerHubNav";
import { resolveHubSection } from "@/lib/professional-identity/hub-sections";

export const Route = createFileRoute("/_authenticated/my-career")({
  component: MyCareerShell,
});

function MyCareerShell() {
  // The ROUTER's matched ids, not the pathname. It has already resolved
  // the URL into routes; re-parsing the string here would be a second,
  // worse router — and a substring check is exactly how
  // /passport-attestations once landed under the holder's Passport.
  const matches = useMatches();
  const activeKey = resolveHubSection(matches.map((m) => m.routeId));

  return (
    <SiteLayout>
      <Container className="pt-6">
        <MyCareerHubNav activeKey={activeKey} />
      </Container>
      <Outlet />
    </SiteLayout>
  );
}
