// RETIRED — /journey
//
// ── WHAT THIS PAGE WAS ─────────────────────────────────────────────────
//
// An English-only list of saved assessment results and a "target profession",
// from before My Career existed. It promised "a shareable Career Card", which
// the owner's pilot review hid (see my-career.career-card.tsx), and told a
// Swedish reader nothing in Swedish. Nothing in the candidate navigation links
// to it; the navigation resolves /journey to Karriär only so that destination
// stays lit.
//
// ── WHY A REDIRECT AND NOT A DELETED ROUTE ─────────────────────────────
//
// The URL is in browser histories and may be bookmarked. A deleted route
// answers it with a 404, which reads as "the product broke"; the candidate's
// real home for everything this page showed (their analyses, their profile) is
// My Career. `replace: true` so the retired address does not sit in the history
// stack and Back goes to where the person came from.
//
// ── THE CHILD ROUTE KEEPS WORKING ──────────────────────────────────────
//
// /journey/$targetId is a CHILD of this route, so this route's beforeLoad runs
// for it too, and an unconditional redirect would have broken it. The redirect
// fires only for /journey itself. A route with no component renders its child
// through <Outlet /> by default, which is also what the page that used to live
// here never did: it rendered the old list in place of the child, so the
// child's own page was never reached.
//
// Nothing is deleted: the server functions behind the old page are still used
// by the child route, and the page's markup is in the history of this file.

import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/journey")({
  beforeLoad: ({ location }) => {
    if (location.pathname.replace(/\/+$/, "") === "/journey") {
      throw redirect({ to: "/my-career", replace: true });
    }
  },
});
