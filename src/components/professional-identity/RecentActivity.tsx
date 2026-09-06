// Recent activity — the last few things that happened to this person, once.
//
// Each line names its object: the merit that was verified, the employer
// whose result arrived, the job applied for. An approval whose merit has
// since been archived says so, so this feed can never contradict a
// Passport summary that counts current merits. "Show all" reveals the rest
// in place — there is no all-activity route, and a link to a page that
// does not exist is worse than none.

import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useT } from "@/i18n/context";
import type { ActivityItem, ActivityModel } from "@/lib/professional-identity/home-presentation";
import { L, Lf, type Lang } from "./copy";
import { ACTIVITY, ACTIVITY_LINE } from "./home-copy";
import { Group } from "./home-primitives";
import { LINK } from "./home-format";

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
  const subject = l === "sv" ? item.subjectSv : item.subjectEn;
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
  const [showAll, setShowAll] = useState(false);
  if (activity.items.length === 0 && !activity.partial) return null;
  const rows = showAll ? activity.all : activity.items;

  return (
    <Group
      id="activity"
      title={L(ACTIVITY.heading, l)}
      className={className}
      data-recent-activity=""
    >
      {rows.length > 0 && (
        <ul className="mt-1 divide-y divide-border">
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
          className={`${LINK} mt-1`}
        >
          {L(ACTIVITY.all, l)}
        </button>
      )}
      {activity.partial && (
        <p role="status" className="mt-2 text-xs text-muted-foreground">
          {L(activity.unavailable ? ACTIVITY.unavailable : ACTIVITY.partial, l)}
        </p>
      )}
    </Group>
  );
}
