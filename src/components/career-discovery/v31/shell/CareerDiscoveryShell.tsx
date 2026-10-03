// The shell, as Career Discovery uses it.
//
// AssessmentShell is shared with employer-assigned assessments and the
// Academy's training and practice runs, so it carries no wording about any one
// product (see its header). What is specific to Career Discovery lives here and
// is imported by exactly one caller, the Career Discovery flow:
//
//   · the standing note at the foot of the page, and
//   · the way out of a run in progress, which is the career centre.
//
// ── WHAT THE NOTE SAYS, AND WHY IT SAYS THAT ───────────────────────────
//
// It used to open "Intern testversion". The instrument is not internal: the
// analysis is open to anybody who visits, signed out. What is true is that its
// content is authored but has not been reviewed by specialists. The note says
// that, and says what the analysis is for, rather than naming an audience it
// no longer has. See careerDiscovery.dashboard.internalTestNote (the key name
// predates the wording and is kept so the v3.0 components that also read it do
// not move).
//
// Guarded by scripts/candidate-journey-launch-check.ts.

import type { ComponentProps } from "react";
import { useT } from "@/i18n/context";
import { AssessmentShell } from "@/components/career-discovery/v31/shell/AssessmentShell";

export function CareerDiscoveryShell({
  showExit = false,
  showNote = true,
  ...rest
}: Omit<ComponentProps<typeof AssessmentShell>, "exit" | "footerNote"> & {
  /** Only once a run is in progress — there is nothing to leave before that. */
  showExit?: boolean;
  /** False where the page already carries the same sentence in its own body
   *  (the result screen: V31ReportView opens with it), so it is said once. */
  showNote?: boolean;
}) {
  const { t } = useT();
  return (
    <AssessmentShell
      {...rest}
      exit={showExit ? { to: "/career-center", label: t("cd.public.exit") } : undefined}
      footerNote={showNote ? t("careerDiscovery.dashboard.internalTestNote") : undefined}
    />
  );
}
