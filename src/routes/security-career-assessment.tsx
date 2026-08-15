// CANONICAL public route for the candidate assessment journey.
//
// ── CUTOVER ────────────────────────────────────────────────────────────
// This path used to render the legacy 16-question instrument
// (`public-career-assessment`, v2.1). It now renders Security Career
// Discovery v3.
//
// The URL is deliberately unchanged: it is in the sitemap, it is indexed,
// and roughly a dozen CTAs across the site already point here. Keeping it
// means every one of those CTAs leads to v3 with no edit, and no SEO equity
// is discarded.
//
// The legacy instrument is NOT deleted. Its component, engine, mappings and
// stored reports remain intact so historical runs stay readable and exactly
// reproducible at /my-career/reports/$runId — see
// src/lib/career-discovery/legacy-retirement.ts and the accompanying
// migration, which stop new legacy runs at the database layer rather than
// by hiding links.
//
// Access is gated independently of lifecycle_status (which is `active` —
// the content is ready): only platform admins and allowlisted internal
// testers (cd_internal_testers, granted via cd_grant_internal_tester()) may
// save and view a real report, enforced server-side in
// src/lib/career-discovery/v31-public.functions.ts. Everyone else sees the
// same "not open yet" state. This keeps the assessment usable by a named
// test group ahead of the Career Intelligence recommendation layer's
// completion, without weakening or re-gating the lifecycle machinery
// itself — corrected 2026-08-14, see that file's header for the full
// account of why this was previously unenforced despite this comment.

import { createFileRoute } from "@tanstack/react-router";
import { PublicAssessmentFlow } from "@/components/career-discovery/v31/PublicAssessmentFlow";

export const Route = createFileRoute("/security-career-assessment")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Din karriär inom säkerhet — CQrityjob" },
      {
        name: "description",
        content:
          "Security Career Discovery — career guidance for the security industry. Not a test, and not a judgement about employability.",
      },
      // Not indexable while the instrument is in internal test. Removed at
      // public launch, which is a separate, owner-approved change.
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: CanonicalAssessmentRoute,
});

function CanonicalAssessmentRoute() {
  // The public v3.1 flow is the ONLY assessment this route serves. When v3.1
  // is not administrable it shows an explicit v3.1 unavailable state.
  //
  // The v3.0 fallback was removed deliberately: silently routing a candidate
  // into the old assessment means they answer a different instrument from the
  // one the page describes, and their result is scored by a model this product
  // has retired. An honest "not open yet" is better than a working page that
  // measures the wrong thing.
  return <PublicAssessmentFlow />;
}
