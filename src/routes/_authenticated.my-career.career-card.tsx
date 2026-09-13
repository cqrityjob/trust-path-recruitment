// HIDDEN FOR THE PILOT — /my-career/career-card
//
// ── WHAT HAPPENED TO THE CAREER CARD ───────────────────────────────────
//
// The owner's pilot review decided the Career Card is not part of the
// pilot: it is a shareable export of a career result, and the pilot's job
// is to get one candidate cleanly through Passport, CV, jobs, career and
// tests. A sixth shareable artefact competing with the Passport Card for
// "the thing you show people" is exactly the duplication this pass
// removes.
//
// ── HIDDEN, NOT DELETED ────────────────────────────────────────────────
//
// Nothing about the card is destroyed. The renderer
// (CareerCardCreator), the card rules (career-card.ts), the export and
// the SVG layer all remain in the tree, untouched and unreferenced from
// the pilot UI; no report, no snapshot and no candidate row is altered.
// Bringing the card back is restoring this file's previous contents and
// re-linking it, not rebuilding a feature.
//
// ── WHY A REDIRECT AND NOT A DELETED ROUTE ─────────────────────────────
//
// The card had a route of its own, and the identity header and the
// personal home both linked to it, so the URL is in browser histories and
// may be bookmarked. A deleted route answers those with a 404, which
// reads as "the product broke". A redirect answers with the canonical
// destination the owner's architecture gives the candidate — Översikt —
// so an old link lands somewhere true instead of nowhere.
//
// `replace: true` so the card does not sit in the history stack: a
// candidate pressing Back from Översikt should reach wherever they came
// from, not bounce through a hidden route.

import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/my-career/career-card")({
  beforeLoad: () => {
    throw redirect({ to: "/my-career", replace: true });
  },
});
