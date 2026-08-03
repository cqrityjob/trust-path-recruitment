// The human-review queue, shared by the two surfaces that show it.
//
// ── WHY THIS IS A COMPONENT AND NOT A ROUTE ───────────────────────────
//
// Reviews are performed by CQrityjob reviewers, who hold the content-review
// capability and are deliberately NOT members of any employer organisation —
// an employer must never adjudicate its own candidate.
//
// That means the queue has to be reachable from the admin surface, while the
// employer surface shows the same area with an empty queue and a count. One
// implementation, two mount points: a second copy would drift, and the copy
// that drifted would be the one handling somebody's competence record.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import { NoEvidenceState } from "@/components/academy/MaturityDisplay";
import {
  completeReview,
  listReviewQueue,
} from "@/lib/security-competency/academy-employer.functions";

export type ReviewQueueRow = {
  reviewId: string;
  triggerReason: string;
  openedAt: string;
  responseText: string | null;
  subjectId: string;
};

/** The queue itself. Renders nothing but an explanation when RLS returns no
 *  rows — which is exactly what an employer without the capability sees. */
export function ReviewQueue({ emptyTitle, emptyBody }: { emptyTitle: string; emptyBody: string }) {
  const queueFn = useServerFn(listReviewQueue);
  const queue = useQuery({ queryKey: ["academy", "review-queue"], queryFn: () => queueFn() });
  const rows = (queue.data ?? []) as ReviewQueueRow[];

  if (rows.length === 0) {
    return <NoEvidenceState title={emptyTitle} body={emptyBody} />;
  }
  return (
    <div className="space-y-4">
      {rows.map((r) => (
        <ReviewCard key={r.reviewId} review={r} />
      ))}
    </div>
  );
}

// Explicit maps rather than string concatenation: a key built at runtime is a
// key the dictionary-parity check cannot see, and a missing translation would
// then reach a reviewer as a raw identifier.

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

export function ReviewCard({ review }: { review: ReviewQueueRow }) {
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
        <p className="font-mono text-xs text-muted-foreground">{review.subjectId.slice(0, 8)}</p>
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
