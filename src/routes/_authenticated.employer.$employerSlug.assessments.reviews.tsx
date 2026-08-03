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

import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Clock, UserCheck } from "lucide-react";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import { EmployerErrorState } from "@/components/employer/EmployerErrorState";
import { AcademyHeading, AcademyPage } from "@/components/academy/AcademyWorkspace";
import { NoEvidenceState } from "@/components/academy/MaturityDisplay";
import {
  completeReview,
  getAcademyReviewPressure,
  listReviewQueue,
} from "@/lib/security-competency/academy-employer.functions";

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
  const queueFn = useServerFn(listReviewQueue);

  const pressure = useQuery({
    queryKey: ["academy", "review-pressure", employerId],
    queryFn: () => pressureFn({ data: { employerId } }),
  });
  const queue = useQuery({
    queryKey: ["academy", "review-queue"],
    queryFn: () => queueFn(),
  });

  const isReviewer = (queue.data?.length ?? 0) > 0;

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

      {!isReviewer ? (
        <NoEvidenceState
          title={t("academy.reviews.notReviewerTitle")}
          body={t("academy.reviews.notReviewerBody")}
        />
      ) : (
        <div className="space-y-4">
          {(queue.data ?? []).map((r: ReviewQueueRow) => (
            <ReviewCard key={r.reviewId} review={r} />
          ))}
        </div>
      )}
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

// Explicit maps rather than string concatenation: a key built at runtime is a
// key the dictionary-parity check cannot see, and a missing translation would
// then reach a reviewer as a raw identifier.
type ReviewQueueRow = {
  reviewId: string;
  triggerReason: string;
  openedAt: string;
  responseText: string | null;
  subjectId: string;
};

const TRIGGER_LABEL: Record<string, TranslationKey> = {
  no_provider_available: "academy.reviews.triggerNoProvider",
  safety_critical_detected: "academy.reviews.triggerSafety",
  participant_requested: "academy.reviews.triggerRequested",
};

const OUTCOME_LABEL: Record<"upheld" | "adjusted" | "overturned", TranslationKey> = {
  upheld: "academy.reviews.outcomeUpheld",
  adjusted: "academy.reviews.outcomeAdjusted",
  overturned: "academy.reviews.outcomeOverturned",
};

function ReviewCard({ review }: { review: ReviewQueueRow }) {
  const { t } = useT();
  const qc = useQueryClient();
  const complete = useServerFn(completeReview);
  const [rationale, setRationale] = useState("");
  const [outcome, setOutcome] = useState<"upheld" | "adjusted" | "overturned">("adjusted");
  const [error, setError] = useState<string | null>(null);

  const m = useMutation({
    mutationFn: () =>
      complete({ data: { reviewId: review.reviewId, outcome, rationale, contribution: 0.5 } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["academy", "review-queue"] });
      void qc.invalidateQueries({ queryKey: ["academy", "participants"] });
    },
    onError: (e: unknown) => {
      const code = (e as { code?: string }).code ?? "";
      setError(
        code === "SCP_NOT_A_REVIEWER"
          ? t("academy.reviews.notAuthorised")
          : code === "SCP_REVIEW_WITHOUT_RATIONALE"
            ? t("academy.reviews.needRationale")
            : t("academy.reviews.failed"),
      );
    },
  });

  return (
    <article className="rounded-[14px] border border-border bg-card p-5 shadow-[var(--shadow-xs)]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">
          {t(TRIGGER_LABEL[review.triggerReason] ?? "academy.reviews.triggerOther")}
        </h2>
        <p className="font-mono text-xs text-muted-foreground">
          {review.subjectId.slice(0, 8)}
        </p>
      </div>

      {/* Untrusted candidate text. Rendered as text, never as markup. */}
      <blockquote className="mt-3 whitespace-pre-wrap rounded-[10px] bg-[color:var(--surface-subtle)] p-4 text-[13px] leading-relaxed text-foreground">
        {review.responseText ?? t("academy.reviews.noText")}
      </blockquote>

      <form
        className="mt-4 space-y-3"
        onSubmit={(ev) => {
          ev.preventDefault();
          m.mutate();
        }}
      >
        <fieldset>
          <legend className="mb-2 text-xs font-medium text-foreground">
            {t("academy.reviews.outcome")}
          </legend>
          <div className="flex flex-wrap gap-2">
            {(["upheld", "adjusted", "overturned"] as const).map((o) => (
              <label
                key={o}
                className="inline-flex cursor-pointer items-center gap-2 rounded-[10px] border border-border px-3 py-2 text-[13px] text-foreground has-[:checked]:border-accent has-[:checked]:bg-[color:var(--secondary)] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
              >
                <input
                  type="radio"
                  name={`outcome-${review.reviewId}`}
                  className="sr-only"
                  checked={outcome === o}
                  onChange={() => setOutcome(o)}
                />
                {t(OUTCOME_LABEL[o])}
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label
            htmlFor={`rationale-${review.reviewId}`}
            className="mb-1.5 block text-xs font-medium text-foreground"
          >
            {t("academy.reviews.rationale")}
          </label>
          <textarea
            id={`rationale-${review.reviewId}`}
            rows={3}
            required
            value={rationale}
            onChange={(ev) => setRationale(ev.target.value)}
            className="w-full rounded-[10px] border border-border bg-card px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </div>

        {error && (
          <p role="alert" className="text-[13px] text-foreground">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={m.isPending}
          className="inline-flex h-11 items-center rounded-[10px] bg-accent px-5 text-sm font-semibold text-accent-foreground disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {m.isPending ? t("academy.reviews.saving") : t("academy.reviews.complete")}
        </button>
      </form>
    </article>
  );
}
