// Översikt — the candidate's product shell.
//
// ── WHAT THIS ROUTE IS, AND WHAT IT STOPPED BEING ──────────────────────
//
// It used to be `<Outlet />` and nothing else, and every page under it
// mounted its own <SiteLayout>. That was invisible until the review of the
// candidate pilot journey: with no shell, there was no place to say what
// this area CONTAINS, so the overview said it instead — by rendering every
// area in full, one below the other, 2838px tall at 1440.
//
// The shell fixed that, and then overshot. It grew a section strip naming
// six areas, the first of which was "Översikt" pointing at /my-career —
// the very URL the primary navigation already offered as "Min karriär".
// One destination, two names, two navigations, one above the other. The
// owner's review named it, and every other entry in the strip turned out
// to belong to a destination the primary navigation already owns or that
// the owner's sketches move elsewhere:
//
//   Security Passport → its own primary destination
//   Sharing           → inside the Passport workspace
//   Career Discovery  → Karriär
//   Ansökningar       → Jobb
//   CV                → contextual, and explicitly never a nav item
//
// So the strip is gone rather than trimmed. Trimming would have left a
// second navigation system with two entries, which is the thing being
// removed. The overview page already carries in-page access to the CV,
// applications, the career analysis and tests through its status grid.
//
// ── THE SHELL STILL OWNS SiteLayout ────────────────────────────────────
//
// Which is why every child still has none of its own. Two <SiteLayout>s
// nest two headers and two footers. Children keep their own
// <Container>/<Section> and therefore their own widths.
//
// ── IT GRANTS NOTHING ──────────────────────────────────────────────────
//
// `_authenticated` is still the gate, unchanged. Every destination
// re-verifies its own access: the CV and application lists are owner-
// scoped by RLS and the Passport reads the holder's own record. Which
// chrome is drawn has never been the boundary.

import { createFileRoute, Outlet } from "@tanstack/react-router";
import { SiteLayout } from "@/components/site/SiteLayout";

export const Route = createFileRoute("/_authenticated/my-career")({
  component: MyCareerShell,
});

function MyCareerShell() {
  // Site chrome and the page. No section strip: the primary navigation is
  // the only navigation a candidate is shown, and it already says where
  // they are.
  return (
    <SiteLayout>
      <Outlet />
    </SiteLayout>
  );
}
