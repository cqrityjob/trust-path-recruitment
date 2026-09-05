// Recent activity — the last few things that happened to this person, once.
//
// One shared feed rather than one per product: a report release, a
// verification decision, an interview and an application are all "something
// happened about you", and a person should not need to know which product
// to open to find out. At most three rows, newest first, each linking to
// the thing itself.
//
// ── WHAT IT DOES NOT REPEAT ────────────────────────────────────────────
//
// The presentation model has already removed every event the primary card
// claimed. If the released report IS the most important thing on the page,
// it is announced there and not again here.
//
// ── EMPTY IS INVISIBLE, FAILED IS NOT ──────────────────────────────────
//
// With nothing to say the section is not rendered at all -- a card that
// exists to say "nothing here" is the premium space this page refuses to
// spend. A source that FAILED is different: then a single quiet line says
// so, because "no activity" and "we could not check" are not the same
// sentence about somebody's week.

import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useT } from "@/i18n/context";
import type { ActivityItem, ActivityModel } from "@/lib/professional-identity/home-presentation";
import { L, Lf, type Lang } from "./copy";
import { ACTIVITY, ACTIVITY_LINE } from "./home-copy";

/** "idag", "igår", or the day and month. */
function formatActivityDay(iso: string, l: Lang, now: Date): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(d)) / 86_400_000);
  if (days === 0) return L(ACTIVITY.today, l);
  if (days === 1) return L(ACTIVITY.yesterday, l);
  return new Intl.DateTimeFormat(l === "sv" ? "sv-SE" : "en-GB", {
    day: "numeric",
    month: "long",
  }).format(d);
}

function lineFor(item: ActivityItem, l: Lang): string {
  const copy = ACTIVITY_LINE[item.kind];
  const subject =
    item.kind === "application_submitted"
      ? l === "sv"
        ? item.titleSv
        : item.titleEn
      : item.employerName;
  return subject ? Lf(copy.with, l, subject) : L(copy.without, l);
}

export function RecentActivity({
  activity,
  now = new Date(),
  className,
}: {
  activity: ActivityModel;
  now?: Date;
  className?: string;
}) {
  const { lang } = useT();
  const l = lang as Lang;
  // "Show all activity" reveals the rest IN PLACE. There is no
  // all-activity route in this product, and a link to a page that does not
  // exist is worse than not offering one at all.
  const [showAll, setShowAll] = useState(false);

  if (activity.items.length === 0 && !activity.partial) return null;

  const rows = showAll ? activity.all : activity.items;

  return (
    <section aria-labelledby="activity-heading" className={className} data-recent-activity>
      <h2
        id="activity-heading"
        className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground"
      >
        {L(ACTIVITY.heading, l)}
      </h2>
      {rows.length > 0 && (
        <ul className="mt-2 divide-y divide-border border-t border-border">
          {rows.map((item) => (
            <li key={item.id}>
              <Link
                to={item.href}
                data-activity-kind={item.kind}
                className="group flex min-h-11 flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="text-sm font-medium text-foreground group-hover:underline">
                  {lineFor(item, l)}
                </span>
                <time dateTime={item.at} className="text-xs text-muted-foreground">
                  {formatActivityDay(item.at, l, now)}
                </time>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {activity.hasMore && !showAll && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          data-show-all-activity
          aria-expanded={false}
          className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {L(ACTIVITY.all, l)}
        </button>
      )}
      {activity.partial && (
        <p role="status" className="mt-2 text-xs text-muted-foreground">
          {L(activity.unavailable ? ACTIVITY.unavailable : ACTIVITY.partial, l)}
        </p>
      )}
    </section>
  );
}
