// Human Reviews.
//
// ── WHY AN EMPLOYER USUALLY SEES A NUMBER HERE, NOT A QUEUE ───────────
//
// Completing a review requires the content-review capability, because an
// employer must never adjudicate its own candidate's evidence. That is enforced
// by scp_complete_human_review, and the queue itself is a security_invoker view
// an employer cannot read.
//
// So this page has two honest faces. A reviewer works the queue. An employer
// without the capability sees how many responses are waiting and how many
// results that blocks — enough to know why a report has not arrived, and not a
// single word of the material under review.
//
// Neither face is produced by filtering in this file: the employer's queue is
// empty because RLS returns nothing.

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Clock, UserCheck } from "lucide-react";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import { EmployerErrorState } from "@/components/employer/EmployerErrorState";
import { AcademyHeading, AcademyPage } from "@/components/academy/AcademyWorkspace";
import { NoEvidenceState } from "@/components/academy/MaturityDisplay";
import { getAcademyReviewPressure } from "@/lib/security-competency/academy-employer.functions";
import { ReviewQueue } from "@/components/academy/ReviewQueue";

export const Route = createFileRoute(
  "/_authenticated/employer/$employerSlug/assessments/reviews",
)({
  ssr: false,
  component: ReviewsRoute,
  errorComponent: EmployerErrorState,
});

function ReviewsRoute() {
  const { employerSlug } = Route.useParams();
  return (
    <AcademyPage employerSlug={employerSlug}>
      {(ws) => <Reviews employerId={ws.employerId} />}
    </AcademyPage>
  );
}

function Reviews({ employerId }: { employerId: string }) {
  const { t } = useT();
  const pressureFn = useServerFn(getAcademyReviewPressure);

  const pressure = useQuery({
    queryKey: ["academy", "review-pressure", employerId],
    queryFn: () => pressureFn({ data: { employerId } }),
  });


  return (
    <>
      <AcademyHeading title={t("academy.reviews.title")} lede={t("academy.reviews.lede")} />

      <section className="mb-8 grid gap-4 sm:grid-cols-2">
        <Metric
          icon={Clock}
          label={t("academy.reviews.awaiting")}
          value={pressure.data?.awaitingReview ?? 0}
        />
        <Metric
          icon={UserCheck}
          label={t("academy.reviews.blocked")}
          value={pressure.data?.attemptsBlocked ?? 0}
        />
      </section>

      {/* Same component the admin surface mounts. An employer without the
          content-review capability sees the empty state because RLS returns
          no rows — not because this page filters them out. */}
      <ReviewQueue
        emptyTitle={t("academy.reviews.notReviewerTitle")}
        emptyBody={t("academy.reviews.notReviewerBody")}
      />
    </>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Clock;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-[14px] border border-border bg-card p-5">
      <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
        <Icon className="h-4 w-4 text-accent" aria-hidden="true" />
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

