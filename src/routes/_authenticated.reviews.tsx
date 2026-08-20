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
//   * Under /admin — gated on platform admin. A response reviewer is authorised
//     by an employer (#51), which is not the same privilege and should not have
//     to be. They got "Åtkomst nekad".
//
// So this route gates on nothing at all, and that is deliberate. The queue is
// scoped in the database to the employers that have authorised this caller:
// without an authorisation it returns zero rows, and the page shows an empty
// state. Completing a review is
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
import { useT } from "@/i18n/context";
import { AssessmentShell } from "@/components/career-discovery/v31/shell/AssessmentShell";
import { ReviewQueue } from "@/components/academy/ReviewQueue";

export const Route = createFileRoute("/_authenticated/reviews")({
  ssr: false,
  component: ReviewerWorkspace,
});

function ReviewerWorkspace() {
  const { t } = useT();

  // The queue owns its own fetch, loading and empty state. This route used to
  // run a SECOND query against the same endpoint purely to read isLoading,
  // under a different query key — two requests, two caches, and a window where
  // the page and the list disagreed about whether there was work.
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

      <ReviewQueue
        emptyTitle={t("academy.reviews.adminEmptyTitle")}
        emptyBody={t("academy.reviews.adminEmptyBody")}
      />
    </AssessmentShell>
  );
}
