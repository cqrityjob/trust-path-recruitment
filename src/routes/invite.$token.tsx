// RETIRED — legacy token-based assessment runner.
//
// ── WHY THIS IS A "LINK NO LONGER IN USE" PAGE ─────────────────────────
//
// /invite/<token> used to run the retired assessment engine's questionnaire
// in the browser against a legacy assessment_assignments row: a second,
// parallel runner next to the governed Academy one, with its own progress
// store in localStorage and its own result view. No product surface has been
// able to issue one of these links since July 2026 -- a BEFORE INSERT trigger
// refuses new legacy assignments, and every legacy definition is retired --
// and the links themselves expired after 14 days by default.
//
// The current journey is the Academy: an assessment is assigned to a person,
// it appears in their own account, and it is delivered by
// /_authenticated/academy/$attemptId under the assigned language and the
// governed delivery function. A token would only be a second, weaker
// credential for a door they can already open.
//
// So this address no longer runs anything. It says so, in the candidate's
// language, and points at the place assessments actually are. Deliberately a
// page rather than a silent redirect: somebody arriving here followed a link
// they were given, and being bounced to a sign-in with no explanation reads
// as the link being broken rather than superseded.
//
// The token is not read, stored or logged. The legacy server functions this
// used (assessment-assignments.functions.ts) stay in place for the historical
// result viewer and the My Career linking step; nothing here calls them.
//
// Guarded by scripts/legacy-assessment-route-guard-check.ts.

import { createFileRoute, Link } from "@tanstack/react-router";
import { Info } from "lucide-react";
import { useT } from "@/i18n/context";
import {
  AssessmentPanel,
  AssessmentShell,
} from "@/components/career-discovery/v31/shell/AssessmentShell";

export const Route = createFileRoute("/invite/$token")({
  component: RetiredInviteLinkPage,
});

function RetiredInviteLinkPage() {
  const { t } = useT();
  return (
    <AssessmentShell>
      <AssessmentPanel>
        <h1 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <Info className="h-5 w-5 text-accent" aria-hidden="true" />
          {t("invite.retired.title")}
        </h1>
        <p className="mt-3 max-w-[56ch] text-sm leading-relaxed text-muted-foreground">
          {t("invite.retired.body")}
        </p>
        <Link
          to="/academy"
          className="mt-6 inline-flex h-12 items-center justify-center rounded-[10px] bg-accent px-7 text-sm font-semibold text-accent-foreground transition-colors hover:bg-[color:var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {t("invite.retired.cta")}
        </Link>
      </AssessmentPanel>
    </AssessmentShell>
  );
}
