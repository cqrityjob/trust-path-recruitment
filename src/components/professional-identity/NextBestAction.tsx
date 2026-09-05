// The ONE recommended next step.
//
// ── WHY ONE AND NOT THREE ──────────────────────────────────────────────
//
// This surface used to render the ladder's top three as three identical
// cards, each ending in the word "Continue". Three equally weighted cards
// is the same refusal to decide that the seven-card dashboard was, moved up
// the page. So the ranking is expressed rather than merely computed: the
// page shows exactly one visually primary call to action, with a reason, an
// outcome and a verb naming what it does. Everything else on the page is a
// SECTION with its own quiet link — never a competing button.
//
// `data-next-action="primary"` and `data-primary-cta` are the seams the
// guard counts: exactly one of each may ever render on this page.
//
// ── A PASSIVE STATE CAN NEVER APPEAR HERE ──────────────────────────────
//
// Not by convention — structurally. The engine emits no rule for "waiting
// for the employer", so there is no value of `action.kind` this component
// could receive that means "nothing to do". Passive statuses live in the
// sections they belong to and say outright that nothing is required.
//
// ── ONE DARK SURFACE ───────────────────────────────────────────────────
//
// The card is the only element on the home allowed the navy treatment, and
// only when something is genuinely waiting on or new for the person. The
// calm state -- the product's own recommendation -- is a light card, so a
// quiet week never looks like an alarm.

import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/context";
import type { PrimaryAction } from "@/lib/professional-identity/home-presentation";
import { L, Lf, type Lang } from "./copy";
import { reasonFor, secondaryLinkFor, titleFor, wordsFor } from "./next-action-copy";
import { CLASSIFICATION, NEXT_ACTION } from "./home-copy";

/** The date an assignment must be done by, in the reader's language. */
function formatDeadline(iso: string, l: Lang): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(l === "sv" ? "sv-SE" : "en-GB", {
    day: "numeric",
    month: "long",
  }).format(d);
}

export function NextBestAction({
  next,
  calm,
  onPrimaryClick,
  className,
}: {
  next: PrimaryAction | null;
  calm: boolean;
  /** Called with the state key and destination when the one primary CTA is
   *  followed. Measurement only — it never gates or delays the navigation. */
  onPrimaryClick?: (stateKey: string, destination: string) => void;
  className?: string;
}) {
  const { lang } = useT();
  const l = lang as Lang;
  const words = next ? wordsFor(next.action.kind, next.action.section) : null;
  const dark = Boolean(next) && !calm;
  const secondary = next ? secondaryLinkFor(next.action.kind) : null;

  // Metadata worth stating beside a released result or an assignment: who
  // asked, and what kind of assessment it was. Read from the row the server
  // already sent, never invented.
  const metaLine = next?.meta
    ? [
        next.meta.employerName,
        l === "sv"
          ? (next.meta.purposeSv ?? next.meta.titleSv)
          : (next.meta.purposeEn ?? next.meta.titleEn),
      ]
        .filter((part): part is string => Boolean(part))
        .join(" · ")
    : "";
  const deadline = next?.meta?.deadline ? formatDeadline(next.meta.deadline, l) : "";

  return (
    <section aria-labelledby="next-action-heading" data-next-best-action className={className}>
      <h2 id="next-action-heading" className="sr-only">
        {L(NEXT_ACTION.heading, l)}
      </h2>

      <article
        data-next-action="primary"
        data-status-classification={next?.classification ?? "calm"}
        data-state-key={next?.action.stateKey ?? ""}
        className={cn(
          "flex h-full flex-col rounded-xl p-6 md:p-7",
          dark
            ? "bg-primary text-primary-foreground shadow-[var(--shadow-md)]"
            : "border border-border bg-card text-foreground shadow-[var(--shadow-xs)]",
        )}
      >
        {next && words ? (
          <>
            {/* The classification, in words. Never colour alone. */}
            <p
              className={cn(
                "inline-flex items-center self-start rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em]",
                dark
                  ? "bg-primary-foreground/15 text-primary-foreground"
                  : "bg-secondary text-accent",
              )}
            >
              {L(CLASSIFICATION[next.classification], l)}
            </p>

            <h3
              className={cn(
                "mt-3 text-2xl font-semibold tracking-tight text-balance md:text-[1.75rem]",
                dark ? "text-primary-foreground" : "text-foreground",
              )}
              style={{ fontFamily: "var(--font-display)" }}
            >
              {titleFor(next.action, l)}
            </h3>
            <p
              className={cn(
                "mt-2 max-w-[60ch] text-sm leading-relaxed",
                dark ? "text-primary-foreground/85" : "text-muted-foreground",
              )}
            >
              {reasonFor(next.action, l)} {L(words.outcome, l)}
            </p>
            {(metaLine || deadline) && (
              <p
                className={cn(
                  "mt-3 text-xs font-medium",
                  dark ? "text-primary-foreground/70" : "text-muted-foreground",
                )}
              >
                {[metaLine, deadline ? Lf(NEXT_ACTION.deadline, l, deadline) : ""]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2">
              <Link
                to={next.action.href}
                data-primary-cta
                onClick={() => onPrimaryClick?.(next.action.stateKey, next.action.href)}
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
              {/* A text link, never a second button: one primary CTA. */}
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
          </>
        ) : (
          <>
            <p className="inline-flex items-center self-start rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">
              {L(CLASSIFICATION.in_progress_no_action, l)}
            </p>
            <h3
              className="mt-3 text-2xl font-semibold tracking-tight text-balance md:text-[1.75rem]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {L(NEXT_ACTION.calmTitle, l)}
            </h3>
            <p className="mt-2 max-w-[60ch] text-sm text-muted-foreground">
              {L(NEXT_ACTION.calmBody, l)} {L(NEXT_ACTION.calmEmpty, l)}
            </p>
          </>
        )}
      </article>
    </section>
  );
}
