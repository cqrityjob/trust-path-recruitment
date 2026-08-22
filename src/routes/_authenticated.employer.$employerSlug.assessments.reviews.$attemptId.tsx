// Reviewing one candidate's submission, inside the employer workspace.
//
// ── WHY THIS ROUTE EXISTS ─────────────────────────────────────────────
//
// The review form was only reachable at /reviews — a top-level route with no
// employer in its path, no tab strip, and no way back to the assessment the
// work belonged to. Reaching it meant leaving the Assessment Center, and in
// practice it meant signing in as somebody else, because the only accounts
// that had ever been given a reviewer seat were separate ones.
//
// Nothing about the review itself is different here. The cards are the same
// component the standalone route mounts, and the authorisation is the same
// authorisation: scp_review_queue returns the rows this caller may read, and
// scp_complete_human_review re-decides on write. What this route adds is
// PLACE — the employer's own workspace, the attempt it belongs to, and a way
// back to the queue.
//
// ── WHY THE ATTEMPT ID IS NOT A KEY ───────────────────────────────────
//
// It filters a queue the database has already scoped. An attempt belonging to
// another tenant, or to an attempt this person must not review, is not in that
// queue at all, so putting its id in the URL produces the empty state and not
// a single word of anybody's answer. The id is a bookmark, never a claim.

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft } from "lucide-react";
import { useT } from "@/i18n/context";
import { EmployerErrorState } from "@/components/employer/EmployerErrorState";
import { AcademyHeading, AcademyPage } from "@/components/academy/AcademyWorkspace";
import { ReviewQueue } from "@/components/academy/ReviewQueue";
import {
  getEmployerAssessmentPipeline,
  type PipelineRow,
} from "@/lib/security-competency/assessment-lifecycle.functions";

export const Route = createFileRoute(
  "/_authenticated/employer/$employerSlug/assessments/reviews/$attemptId",
)({
  ssr: false,
  component: ReviewAttemptRoute,
  errorComponent: EmployerErrorState,
});

function ReviewAttemptRoute() {
  const { employerSlug, attemptId } = Route.useParams();
  return (
    <AcademyPage employerSlug={employerSlug}>
      {(ws) => (
        <ReviewAttempt
          employerId={ws.employerId}
          employerSlug={ws.employerSlug}
          attemptId={attemptId}
        />
      )}
    </AcademyPage>
  );
}

function ReviewAttempt({
  employerId,
  employerSlug,
  attemptId,
}: {
  employerId: string;
  employerSlug: string;
  attemptId: string;
}) {
  const { t, lang } = useT();
  const pipelineFn = useServerFn(getEmployerAssessmentPipeline);

  // Context only: which assessment, whose, what state. Shared cache with the
  // queue page and Deltagare, so the three surfaces describe one attempt with
  // one set of words.
  const pipeline = useQuery({
    queryKey: ["academy", "participants", employerId],
    queryFn: () => pipelineFn({ data: { employerId } }),
  });
  const attempt: PipelineRow | undefined = (pipeline.data ?? []).find(
    (p) => p.attemptId === attemptId,
  );

  const assessment =
    (lang === "en" ? attempt?.assessmentNameEn : attempt?.assessmentNameSv) ??
    t("academy.reviews.title");
  const who = attempt?.participantName ?? attempt?.participantRef ?? "—";

  return (
    <>
      <Link
        to="/employer/$employerSlug/assessments/reviews"
        params={{ employerSlug }}
        search={{ scope: "mine" as const }}
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {t("academy.reviews.backToQueue")}
      </Link>

      <AcademyHeading
        title={assessment}
        lede={`${t("academy.reviews.participant")}: ${who} · ${t("academy.reviews.lede")}`}
      />

      {/* The empty state here answers a narrower question than the queue page's
          does, because arriving here means a row said this was reviewable. If
          it is empty now, the work is gone -- somebody else took it, or it was
          already completed -- and the honest thing is to say so and point back. */}
      <ReviewQueue
        attemptId={attemptId}
        emptyTitle={t("academy.reviews.attemptEmptyTitle")}
        emptyBody={t("academy.reviews.attemptEmptyBody")}
      />
    </>
  );
}
