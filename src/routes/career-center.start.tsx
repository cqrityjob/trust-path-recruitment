import { createFileRoute, redirect } from "@tanstack/react-router";

// /career-center/start is retired — it now redirects to the hub.
//
// ── WHY IT IS GONE RATHER THAN FIXED ───────────────────────────────────
//
// The page asked "Beskriv dig själv" and offered six audience buttons. The
// selection did exactly one thing: it revealed three profession cards from a
// hard-coded list, under a heading ("Föreslagna nästa steg") that a second,
// unconditional section further down the same page used verbatim. Everything
// else on the page — the five "next step" cards, the fourteen profession
// family tiles — was identical for all six audiences, and four of those five
// cards linked to the same `/career-center#browse` anchor. So the answer
// changed a third of one section and nothing else.
//
// The rest of the page duplicated the hub: same hero component, same family
// list, same assessment CTA. Two pages competing to be the front door of the
// Career Center, one of which asked a question before it would show anything.
//
// The hub now does this job properly. Its three entry paths take a visitor to
// genuinely different destinations — the explorer pre-filtered to entry-level
// roles, the explorer pre-filtered to mid and senior roles, and the employer
// product — because the explorer's state lives in the URL and a link can
// therefore express a filtered view. An extra page that asks a question first
// and then shows the same catalogue is a step, not a service.
//
// The route survives as a redirect rather than being deleted: it has been
// linked from the hub and is in the sitemap, and a 404 for a URL we published
// is worse than one hop. `replace` keeps it out of the back-button history.

export const Route = createFileRoute("/career-center/start")({
  beforeLoad: () => {
    throw redirect({ to: "/career-center", replace: true });
  },
  component: () => null,
});
