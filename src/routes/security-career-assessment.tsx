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
// Access is still gated: while lifecycle_status is `internal_test`, only
// platform admins and allowlisted internal testers can create a session.
// Everyone else sees the approved unavailable state.

import { createFileRoute } from "@tanstack/react-router";
import { DiscoveryLanding } from "@/components/career-discovery/DiscoveryLanding";
import {
  CANONICAL_ASSESSMENT_PATH,
  CANONICAL_HISTORY_PATH,
  CANONICAL_SESSION_PATH,
} from "@/lib/career-discovery/routes";

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
  return (
    <DiscoveryLanding
      sessionPath={CANONICAL_SESSION_PATH}
      returnPath={CANONICAL_ASSESSMENT_PATH}
      historyPath={CANONICAL_HISTORY_PATH}
    />
  );
}
