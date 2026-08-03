// The reviewer's workspace.
//
// ── THE GATE IS THE CAPABILITY, NOT A SHELL ───────────────────────────
//
// Two earlier placements were wrong for the same underlying reason: they gated
// on the wrong thing.
//
//   * Under /employer/$employerSlug — gated on employer membership. A CQrityjob
//     reviewer is deliberately NOT a member of any employer, because that
//     separation is what stops an employer adjudicating its own candidate. They
//     got "Åtkomst ej tillgänglig".
//   * Under /admin — gated on platform admin. A reviewer holds the
//     content-review capability, which is not the same privilege and should not
//     have to be. They got "Åtkomst nekad".
//
// So this route gates on nothing at all, and that is deliberate. The queue is
// scp_rm_review_queue, a security_invoker view: without the capability it
// returns zero rows, and the page shows an empty state. Completing a review is
// enforced by scp_complete_human_review, which checks scp_can_author() itself.
//
// Reaching this URL therefore grants nothing. The authorisation lives where it
// can actually be enforced, and the route stops being a third place that has an
// opinion about who a reviewer is.
//
// It sits beside /academy rather than inside Assessment Center: a reviewer is
// its own role, like a participant, and neither belongs in the employer's
// workspace.

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useT } from "@/i18n/context";
import {
  AssessmentShell,
  AssessmentPanel,
} from "@/components/career-discovery/v31/shell/AssessmentShell";
import { ReviewQueue } from "@/components/academy/ReviewQueue";
import { listReviewQueue } from "@/lib/security-competency/academy-employer.functions";

export const Route = createFileRoute("/_authenticated/reviews")({
  ssr: false,
  component: ReviewerWorkspace,
});

function ReviewerWorkspace() {
  const { t } = useT();
  const queueFn = useServerFn(listReviewQueue);
  const queue = useQuery({ queryKey: ["academy", "review-queue"], queryFn: () => queueFn() });

  return (
    <AssessmentShell wide>
      <header className="mb-6">
        <h1
          className="text-[1.5rem] font-semibold leading-tight tracking-tight text-foreground"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {t("academy.reviews.title")}
        </h1>
        <p className="mt-2 max-w-[68ch] text-sm leading-relaxed text-muted-foreground">
          {t("academy.reviews.adminLede")}
        </p>
      </header>

      {queue.isLoading ? (
        <AssessmentPanel>
          <p className="text-sm text-muted-foreground">{t("academy.loading")}</p>
        </AssessmentPanel>
      ) : (
        <ReviewQueue
          emptyTitle={t("academy.reviews.adminEmptyTitle")}
          emptyBody={t("academy.reviews.adminEmptyBody")}
        />
      )}
    </AssessmentShell>
  );
}
