// The reviewer's way IN to the review queue.
//
// ── HOW THIS IS GATED ─────────────────────────────────────────────────
//
// It is not gated in this component at all, and that is deliberate.
//
// scp_rm_review_queue is a security_invoker view: without the content-review
// capability it returns zero rows, so the card renders nothing. A client-side
// role check would be a second, weaker copy of a rule the database already
// enforces -- and the kind of copy that drifts. Here the capability IS the
// visibility gate, and someone who acquires or loses it sees the card appear
// or disappear with no code change.
//
// Reviewers are CQrityjob staff and are deliberately NOT members of any
// employer organisation, so the employer portal is not a home for this. Every
// signed-in person passes through /my-career, which makes it the one surface
// a reviewer reliably sees.

import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Gavel } from "lucide-react";
import { useT } from "@/i18n/context";
import { listReviewQueue } from "@/lib/security-competency/academy-employer.functions";

export function MyReviewQueueCard() {
  const { t } = useT();
  const queueFn = useServerFn(listReviewQueue);

  const queue = useQuery({
    queryKey: ["academy", "review-queue"],
    queryFn: () => queueFn(),
    // Never let a reviewer-only lookup disturb the career dashboard.
    retry: false,
  });

  const pending = queue.data ?? [];
  if (pending.length === 0) return null;

  return (
    <section className="mt-8 rounded-[14px] border border-border bg-[color:var(--surface-subtle)] p-5">
      <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
        <Gavel className="h-4 w-4 text-accent" aria-hidden="true" />
        {t("academy.myReviews.title")}
      </h2>
      <p className="mt-1.5 max-w-[62ch] text-[13px] leading-relaxed text-muted-foreground">
        {pending.length === 1
          ? t("academy.myReviews.bodyOne")
          : `${pending.length} ${t("academy.myReviews.bodyMany")}`}
      </p>
      <Link
        to="/reviews"
        className="mt-4 inline-flex h-10 items-center rounded-[10px] bg-accent px-4 text-[13px] font-semibold text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {t("academy.myReviews.open")}
      </Link>
    </section>
  );
}
