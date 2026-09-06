// The ONE recommended next step.
//
// Exactly one visually primary call to action on the page, with a reason,
// an outcome and a verb naming what it does — and a destination that IS
// the object: the merit, the review, the test, the form. `data-primary-cta`
// is the seam the guard counts.
//
// Three states, because the identity read has three. While it loads this
// is a skeleton. If it fails and no other read produced a required action
// (a test with a deadline, an interview, a reviewer's question — none of
// which need the identity), it is an error with a retry and a way to the
// Passport. A skeleton is never a failure state.

import { Link } from "@tanstack/react-router";
import { ArrowRight, RefreshCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/context";
import type { NextActionModel } from "@/lib/professional-identity/home-presentation";
import { L, Lf, type Lang } from "./copy";
import { reasonFor, secondaryLinkFor, titleFor, wordsFor } from "./next-action-copy";
import { CLASSIFICATION, COMMON, EMPLOYER_WORK, NEXT_ACTION } from "./home-copy";
import { Chip } from "./home-primitives";
import { LINK, formatDay } from "./home-format";

export function NextBestAction({
  next,
  onPrimaryClick,
  onRetry,
  className,
}: {
  next: NextActionModel;
  onPrimaryClick?: (stateKey: string, destination: string) => void;
  onRetry?: () => void;
  className?: string;
}) {
  const { lang } = useT();
  const l = lang as Lang;

  const shell = (
    children: React.ReactNode,
    opts: { dark: boolean; classification: string; stateKey?: string },
  ) => (
    <section aria-labelledby="next-action-heading" data-next-best-action className={className}>
      <h2 id="next-action-heading" className="sr-only">
        {L(NEXT_ACTION.heading, l)}
      </h2>
      <article
        data-next-action="primary"
        data-status-classification={opts.classification}
        data-state-key={opts.stateKey ?? ""}
        className={cn(
          "flex h-full flex-col rounded-xl p-6 md:p-7",
          opts.dark
            ? "bg-primary text-primary-foreground shadow-[var(--shadow-md)]"
            : "border border-border bg-card text-foreground shadow-[var(--shadow-xs)]",
        )}
      >
        {children}
      </article>
    </section>
  );

  if (next.state === "loading") {
    return shell(
      <div role="status" aria-live="polite" data-loading>
        <p className="sr-only">{L(NEXT_ACTION.loading, l)}</p>
        <div className="h-6 w-40 animate-pulse rounded bg-muted motion-reduce:animate-none" />
        <div className="mt-4 h-8 w-3/4 animate-pulse rounded bg-muted motion-reduce:animate-none" />
        <div className="mt-3 h-4 w-full animate-pulse rounded bg-muted motion-reduce:animate-none" />
        <div className="mt-6 h-11 w-48 animate-pulse rounded-md bg-muted motion-reduce:animate-none" />
      </div>,
      { dark: false, classification: "loading" },
    );
  }

  if (next.state === "unavailable") {
    return shell(
      <div role="alert" data-failed>
        <h3
          className="text-2xl font-semibold tracking-tight text-balance md:text-[1.75rem]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {L(NEXT_ACTION.failedTitle, l)}
        </h3>
        <p className="mt-2 max-w-[60ch] text-sm text-muted-foreground">
          {L(NEXT_ACTION.failedBody, l)}
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2">
          {onRetry && (
            <button type="button" onClick={onRetry} className={LINK} data-retry>
              <RefreshCcw className="h-3.5 w-3.5" aria-hidden="true" />
              {L(COMMON.retry, l)}
            </button>
          )}
          <Link to="/passport" className={LINK}>
            {L(NEXT_ACTION.failedPassportLink, l)}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
      </div>,
      { dark: false, classification: "unavailable" },
    );
  }

  const { primary, calm } = next;
  if (!primary) {
    return shell(
      <>
        <Chip label={L(CLASSIFICATION.in_progress_no_action, l)} />
        <h3
          className="mt-3 text-2xl font-semibold tracking-tight text-balance md:text-[1.75rem]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {L(NEXT_ACTION.calmTitle, l)}
        </h3>
        <p className="mt-2 max-w-[60ch] text-sm text-muted-foreground">
          {L(NEXT_ACTION.calmBody, l)} {L(NEXT_ACTION.calmEmpty, l)}
        </p>
      </>,
      { dark: false, classification: "calm" },
    );
  }

  const dark = !calm;
  const words = wordsFor(primary.action.kind, primary.action.section);
  const secondary = secondaryLinkFor(primary.action.kind);
  const meta = primary.meta;
  // Who asked, for which role, and by when. A recruitment test is
  // REQUESTED by an organisation the person applied to; training is
  // ASSIGNED by an employer. Never "your employer" for an applicant.
  const who = meta?.employerName
    ? meta.useCase === "recruitment"
      ? Lf(EMPLOYER_WORK.requestedBy, l, meta.employerName)
      : Lf(EMPLOYER_WORK.assignedBy, l, meta.employerName)
    : null;
  const role = meta ? (l === "sv" ? meta.jobTitleSv : meta.jobTitleEn) : null;
  const what = meta
    ? l === "sv"
      ? (meta.purposeSv ?? meta.titleSv)
      : (meta.purposeEn ?? meta.titleEn)
    : null;
  const deadline = meta?.deadline ? formatDay(meta.deadline, l) : null;
  const metaLine = [
    who,
    role ? Lf(EMPLOYER_WORK.forRole, l, role) : null,
    what,
    deadline ? Lf(NEXT_ACTION.deadline, l, deadline) : null,
  ]
    .filter((p): p is string => Boolean(p))
    .join(" · ");

  return shell(
    <>
      <Chip label={L(CLASSIFICATION[primary.classification], l)} tone={dark ? "dark" : "light"} />
      <h3
        className={cn(
          "mt-3 text-2xl font-semibold tracking-tight text-balance md:text-[1.75rem]",
          dark ? "text-primary-foreground" : "text-foreground",
        )}
        style={{ fontFamily: "var(--font-display)" }}
      >
        {titleFor(primary.action, l)}
      </h3>
      <p
        className={cn(
          "mt-2 max-w-[60ch] text-sm leading-relaxed",
          dark ? "text-primary-foreground/85" : "text-muted-foreground",
        )}
      >
        {reasonFor(primary.action, l)} {L(words.outcome, l)}
      </p>
      {metaLine && (
        <p
          className={cn(
            "mt-3 text-xs font-medium",
            dark ? "text-primary-foreground/70" : "text-muted-foreground",
          )}
          data-primary-meta
        >
          {metaLine}
        </p>
      )}
      <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2">
        <Link
          to={primary.action.href}
          hash={primary.action.hash ?? undefined}
          search={(primary.action.search ?? undefined) as never}
          data-primary-cta
          data-state-key={primary.action.stateKey}
          onClick={() => onPrimaryClick?.(primary.action.stateKey, primary.action.href)}
          className={cn(
            "inline-flex min-h-11 items-center gap-2 rounded-md px-5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
            dark
              ? "bg-primary-foreground text-primary hover:bg-primary-foreground/90 focus-visible:ring-primary-foreground focus-visible:ring-offset-primary"
              : "bg-primary text-primary-foreground hover:bg-[color:var(--primary-hover)] focus-visible:ring-ring",
          )}
        >
          {L(words.verb, l)}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
        {secondary && (
          <Link
            to={secondary.href}
            data-secondary-link
            className={cn(
              "inline-flex min-h-11 items-center text-sm font-semibold underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
              dark
                ? "text-primary-foreground focus-visible:ring-primary-foreground focus-visible:ring-offset-primary"
                : "text-accent focus-visible:ring-ring",
            )}
          >
            {L(secondary.label, l)}
          </Link>
        )}
      </div>
    </>,
    { dark, classification: primary.classification, stateKey: primary.action.stateKey },
  );
}
