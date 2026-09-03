// Active work — only what is genuinely in progress, and nothing when there
// is nothing.
//
// An assessment somebody has started, an interview that is being held for
// them, a reviewer's open question, a decision they still have a choice
// about. Each is real work with a place to go. What is deliberately NOT
// here: a submitted assessment awaiting release (a status, shown once in
// the workspace), and anything the primary card already owns.
//
// With no items and no extra content the section does not render. A
// permanent "nothing in progress" panel would make an ordinary state look
// like a shortfall.

import { Link } from "@tanstack/react-router";
import { AlertCircle, ArrowRight, ClipboardCheck, Info, MessageSquare } from "lucide-react";
import { useT } from "@/i18n/context";
import type { ActiveWorkItem } from "@/lib/professional-identity/home-presentation";
import { L, Lf, type Lang } from "./copy";
import { ACTIVE_WORK, INTERVIEW_STATUS } from "./home-copy";

function formatDate(iso: string, l: Lang): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(l === "sv" ? "sv-SE" : "en-GB", {
    day: "numeric",
    month: "long",
  }).format(d);
}

function Row({
  item,
  titleOf,
  l,
}: {
  item: ActiveWorkItem;
  titleOf: (subject: { kind: "claim" | "experience"; id: string }) => string;
  l: Lang;
}) {
  const name = l === "sv" ? item.titleSv : item.titleEn;
  let icon: React.ReactNode;
  let title: string;
  let detail: string | null;
  let cta: string;

  switch (item.kind) {
    case "assessment_in_progress":
      icon = <ClipboardCheck className="h-4 w-4 text-accent" aria-hidden="true" />;
      title = name ?? "—";
      detail = [
        item.employerName,
        item.progress
          ? Lf(ACTIVE_WORK.progress, l, `${item.progress.answered}/${item.progress.total}`)
          : null,
        item.deadline ? Lf(ACTIVE_WORK.deadline, l, formatDate(item.deadline, l)) : null,
      ]
        .filter((p): p is string => Boolean(p))
        .join(" · ");
      cta = L(ACTIVE_WORK.openAssessment, l);
      break;
    case "interview":
      icon = <MessageSquare className="h-4 w-4 text-accent" aria-hidden="true" />;
      title = [name, item.employerName].filter(Boolean).join(" · ") || "—";
      detail = item.interviewStatus ? L(INTERVIEW_STATUS[item.interviewStatus], l) : null;
      cta = L(ACTIVE_WORK.aboutInterview, l);
      break;
    case "verification_action_required":
      icon = <AlertCircle className="h-4 w-4 text-amber-500" aria-hidden="true" />;
      title = L(ACTIVE_WORK.clarificationTitle, l);
      detail = item.subject ? titleOf(item.subject) : null;
      cta = L(ACTIVE_WORK.openEntry, l);
      break;
    case "verification_outcome":
      icon = <Info className="h-4 w-4 text-amber-500" aria-hidden="true" />;
      title = L(ACTIVE_WORK.outcomeTitle, l);
      detail = item.subject ? titleOf(item.subject) : null;
      cta = L(ACTIVE_WORK.openEntry, l);
      break;
  }

  return (
    <li
      data-active-work={item.kind}
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3"
    >
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-sm font-medium text-foreground">
          {icon}
          {title}
        </p>
        {detail && <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>}
      </div>
      <Link
        to={item.href}
        className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {cta}
        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </li>
  );
}

export function ActiveWork({
  items,
  titleOf,
  children,
  className,
}: {
  items: readonly ActiveWorkItem[];
  /** The Passport entry's own title, resolved by the surface that has the
   *  rows. Never invented here. */
  titleOf: (subject: { kind: "claim" | "experience"; id: string }) => string;
  /** Extra in-progress content the route owns (linking an earlier result). */
  children?: React.ReactNode;
  className?: string;
}) {
  const { lang } = useT();
  const l = lang as Lang;

  if (items.length === 0 && !children) return null;

  return (
    <section aria-labelledby="active-work-heading" className={className} data-active-work-section>
      <h2
        id="active-work-heading"
        className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground"
      >
        {L(ACTIVE_WORK.heading, l)}
      </h2>
      {items.length > 0 && (
        <ul className="mt-2 divide-y divide-border border-t border-border">
          {items.map((item) => (
            <Row key={item.id} item={item} titleOf={titleOf} l={l} />
          ))}
        </ul>
      )}
      {children}
    </section>
  );
}
