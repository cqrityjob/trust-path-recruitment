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
// ── AND IT ASKS THE SAME TWO QUESTIONS THE DOOR ASKS ───────────────────
//
// The assessment is gated (v31-public.functions.ts), and offering a link
// the product will refuse is worse than offering none. So this renders
// nothing at all unless availability AND the tester gate both say yes —
// `undefined` while the queries are in flight renders nothing either, which
// is the honest state of "we have not asked yet".

import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useT } from "@/i18n/context";
import {
  getV31Availability,
  getV31TesterStatus,
} from "@/lib/career-discovery/v31-public.functions";

export function RetakeAnalysisLink({ className }: { className?: string }) {
  const { t } = useT();
  const checkAvailability = useServerFn(getV31Availability);
  const checkTesterStatus = useServerFn(getV31TesterStatus);
  const openQ = useQuery({
    queryKey: ["my-career", "assessment-open"],
    queryFn: async () => {
      const availability = await checkAvailability({});
      if (!availability.available) return false;
      const status = await checkTesterStatus({});
      return status.allowed;
    },
    staleTime: 60_000,
  });

  if (openQ.data !== true) return null;

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
