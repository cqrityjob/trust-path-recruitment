// "Do the career analysis again" — on the RESULT, never on the home.
//
// ── WHY IT MOVED ───────────────────────────────────────────────────────
//
// The personal home used to carry a retake as a feature card of the same
// weight as taking the analysis for the first time. That put a candidate
// who had just completed it one click from replacing the result they came
// to read, and it spent a card of the home's premium space on an errand
// almost nobody has. A retake is something you decide AFTER reading your
// result, so it lives where the result is, as a quiet third link under the
// two that matter.
//
// ── AND IT ASKS THE SAME QUESTION THE DOOR ASKS ────────────────────────
//
// The assessment is gated (v31-public.functions.ts), and offering a link
// the product will refuse is worse than offering none. So this renders
// nothing at all unless the one availability hook says the analysis is open
// to this reader — `undefined` while the query is in flight renders nothing
// either, which is the honest state of "we have not asked yet". It used to
// carry a private copy of that query; it reads the shared hook now, so a
// state change reaches it exactly when it reaches every other surface.

import { Link } from "@tanstack/react-router";
import { useT } from "@/i18n/context";
import { useCareerAnalysisOpen } from "@/components/career-discovery/use-career-analysis-open";

export function RetakeAnalysisLink({ className }: { className?: string }) {
  const { t } = useT();
  // Rendered only on an owner-scoped, signed-in page.
  const open = useCareerAnalysisOpen(true);

  if (open !== true) return null;

  return (
    <Link
      to="/security-career-assessment"
      data-retake-analysis
      className={
        className ??
        "inline-flex min-h-11 items-center text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      }
    >
      {t("careerDiscovery.report.actions.retake")}
    </Link>
  );
}
