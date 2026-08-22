// The reviewer's way IN to the review queue.
//
// ── HOW THIS IS GATED ─────────────────────────────────────────────────
//
// It is not gated in this component at all, and that is deliberate.
//
// scp_review_queue returns only what its caller is authorised to review, so
// without an authorisation the card renders nothing. A client-side role check
// would be a second, weaker copy of a rule the database already enforces --
// and the kind of copy that drifts. Here the capability IS the visibility
// gate, and someone who acquires or loses it sees the card appear or disappear
// with no code change.
//
// ── WHY IT STILL POINTS AT /reviews ───────────────────────────────────
//
// Review is an EMPLOYER capability now (#51), and the workspace it belongs to
// is Employer > Bedomningar > Granskningar (#63). This card cannot link there,
// because it renders on the personal dashboard and does not know which of the
// caller's organisations the waiting work belongs to -- the queue can span
// more than one. So it keeps the tenant-neutral route, which exists for
// exactly this case and is no longer anybody's primary way in.

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
