// "Viktigast just nu" — the priority workspace: ONE primary action and at
// most two secondary statuses, rendered from the home presentation model.
//
// ── WHY ONE AND NOT THREE ──────────────────────────────────────────────
//
// This surface used to render the ladder's top three as three identical
// cards, each ending in the word "Continue". Three equally weighted cards
// is the same refusal to decide that the seven-card dashboard was, moved up
// the page. So the ranking is expressed rather than merely computed: the
// highest action gets weight, a reason, an outcome and a verb naming what
// it does; beside it sit at most two STATUSES, each saying which of three
// things it is — something that needs the person, something new for them,
// or something happening elsewhere that needs nothing.
//
// ── THE DECISION IS STILL NOT MADE HERE ────────────────────────────────
//
// `computeNextBestActions` ranks; `buildHomePresentation` decides where
// each fact is shown and shows it once. This file only draws the workspace
// slice of that model, in the order it was given — it does not re-rank,
// re-filter or promote.
//
// ── ONE DARK SURFACE ───────────────────────────────────────────────────
//
// The primary card is the only element on the home allowed the navy
// treatment, and only when something is genuinely waiting on or new for
// the person. The calm state — nothing needs attention — is a light card
// carrying the product's one suggestion, so a quiet week never looks like
// an alarm. `data-next-action="primary"` and `data-primary-cta` are the
// seams the guard counts: exactly one of each may ever render.
//
// ── WHY THE COPY LIVES BESIDE THE KINDS ────────────────────────────────
//
// `Record<ActionKind, ...>` rather than a switch: adding a kind to the
// engine without adding its copy stops compiling, which is the only way to
// be sure a new action can never render as a blank row or a bare verb.

import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/context";
import type {
  PriorityWorkspaceModel,
  SecondaryStatus,
} from "@/lib/professional-identity/home-presentation";
import { L, Lf, Lp, type Lang } from "./copy";
import { reasonFor, wordsFor } from "./next-action-copy";
import {
  CLASSIFICATION,
  SECONDARY_BODY,
  SECONDARY_CTA,
  SECONDARY_TITLE,
  WORKSPACE,
} from "./home-copy";

/** One classification, in words. Never colour alone. */
function Chip({ label, onDark }: { label: string; onDark: boolean }) {
  return (
    <p
      className={cn(
        "inline-flex items-center self-start rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em]",
        onDark ? "bg-primary-foreground/15 text-primary-foreground" : "bg-secondary text-accent",
      )}
    >
      {label}
    </p>
  );
}

/** The date an assignment must be done by, in the reader's language. */
function formatDeadline(iso: string, l: Lang): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(l === "sv" ? "sv-SE" : "en-GB", {
    day: "numeric",
    month: "long",
  }).format(d);
}

function SecondaryCard({ status, l }: { status: SecondaryStatus; l: Lang }) {
  const title =
    status.kind === "engine_action" && status.action
      ? L(wordsFor(status.action.kind, status.action.section).title, l)
      : Lp(
          SECONDARY_TITLE[status.kind as Exclude<typeof status.kind, "engine_action">],
          l,
          status.count ?? 1,
        );
  const body =
    status.kind === "engine_action" && status.action
      ? reasonFor(status.action, l)
      : L(SECONDARY_BODY[status.kind as Exclude<typeof status.kind, "engine_action">], l);
  const cta =
    status.kind === "engine_action" && status.action
      ? L(wordsFor(status.action.kind, status.action.section).verb, l)
      : L(SECONDARY_CTA[status.kind as Exclude<typeof status.kind, "engine_action">], l);

  return (
    <article
      data-next-action="secondary"
      data-status-classification={status.classification}
      className="flex flex-col rounded-xl border border-border bg-card p-4"
    >
      <Chip label={L(CLASSIFICATION[status.classification], l)} onDark={false} />
      <h3 className="mt-2 text-base font-semibold tracking-tight text-foreground">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
      <Link
        to={status.href}
        className="mt-auto inline-flex min-h-11 items-center gap-1.5 self-start pt-2 text-sm font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {cta}
        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </article>
  );
}

export function NextActions({ workspace }: { workspace: PriorityWorkspaceModel }) {
  const { lang } = useT();
  const l = lang as Lang;
  const { primary, calm, secondary } = workspace;
  const words = primary ? wordsFor(primary.action.kind, primary.action.section) : null;
  const dark = Boolean(primary) && !calm;

  // Metadata worth stating beside a released report or an assignment: who
  // asked, and what kind of assessment it was. Read from the row the server
  // already sent, never invented.
  const metaLine = primary?.meta
    ? [
        primary.meta.employerName,
        l === "sv"
          ? (primary.meta.purposeSv ?? primary.meta.titleSv)
          : (primary.meta.purposeEn ?? primary.meta.titleEn),
      ]
        .filter((part): part is string => Boolean(part))
        .join(" · ")
    : "";
  const deadline = primary?.meta?.deadline ? formatDeadline(primary.meta.deadline, l) : "";

  return (
    <section aria-labelledby="priority-heading" data-priority-workspace>
      <h2
        id="priority-heading"
        className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground"
      >
        {L(WORKSPACE.heading, l)}
      </h2>

      <div className="mt-3 grid items-start gap-4 lg:grid-cols-12">
        {/* ── The one thing ────────────────────────────────────────────
            The only navy surface on the page, and only when something is
            waiting on or new for the person. `data-primary-cta` marks the
            single dominant call to action. */}
        <article
          data-next-action="primary"
          data-status-classification={primary?.classification ?? "calm"}
          className={cn(
            "flex flex-col rounded-xl p-6 md:p-7",
            secondary.length > 0 ? "lg:col-span-7" : "lg:col-span-12",
            dark
              ? "bg-primary text-primary-foreground shadow-[var(--shadow-md)]"
              : "border border-border bg-card text-foreground shadow-[var(--shadow-xs)]",
          )}
        >
          {primary && words ? (
            <>
              <Chip label={L(CLASSIFICATION[primary.classification], l)} onDark={dark} />
              {calm ? (
                <>
                  <h3
                    className="mt-3 text-2xl font-semibold tracking-tight text-balance text-foreground md:text-[1.75rem]"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    {L(WORKSPACE.calmTitle, l)}
                  </h3>
                  <p className="mt-2 max-w-[60ch] text-sm text-muted-foreground">
                    {L(WORKSPACE.calmBody, l)} {L(WORKSPACE.calmSuggestion, l)}
                  </p>
                  <p className="mt-3 text-base font-semibold text-foreground">
                    {L(words.title, l)}
                  </p>
                  <p className="mt-1 max-w-[60ch] text-sm text-muted-foreground">
                    {reasonFor(primary.action, l)} {L(words.outcome, l)}
                  </p>
                </>
              ) : (
                <>
                  <h3
                    className={cn(
                      "mt-3 text-2xl font-semibold tracking-tight text-balance md:text-[1.75rem]",
                      dark ? "text-primary-foreground" : "text-foreground",
                    )}
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    {L(words.title, l)}
                  </h3>
                  <p
                    className={cn(
                      "mt-2 max-w-[60ch] text-sm leading-relaxed",
                      dark ? "text-primary-foreground/85" : "text-muted-foreground",
                    )}
                  >
                    {reasonFor(primary.action, l)} {L(words.outcome, l)}
                  </p>
                  {(metaLine || deadline) && (
                    <p
                      className={cn(
                        "mt-3 text-xs font-medium",
                        dark ? "text-primary-foreground/70" : "text-muted-foreground",
                      )}
                    >
                      {[metaLine, deadline ? Lf(WORKSPACE.deadline, l, deadline) : ""]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}
                </>
              )}
              <Link
                to={primary.action.href}
                data-primary-cta
                className={cn(
                  "mt-5 inline-flex min-h-11 items-center gap-2 self-start rounded-md px-5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
                  dark
                    ? "bg-primary-foreground text-primary hover:bg-primary-foreground/90 focus-visible:ring-primary-foreground focus-visible:ring-offset-primary"
                    : "bg-primary text-primary-foreground hover:bg-[color:var(--primary-hover)] focus-visible:ring-ring",
                )}
              >
                {L(words.verb, l)}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </>
          ) : (
            <>
              <Chip label={L(CLASSIFICATION.in_progress_no_action, l)} onDark={false} />
              <h3
                className="mt-3 text-2xl font-semibold tracking-tight text-balance md:text-[1.75rem]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {L(WORKSPACE.calmTitle, l)}
              </h3>
              <p className="mt-2 max-w-[60ch] text-sm text-muted-foreground">
                {L(WORKSPACE.calmBody, l)} {L(WORKSPACE.calmEmpty, l)}
              </p>
            </>
          )}
        </article>

        {/* ── At most two statuses, never a second dark surface ────────── */}
        {secondary.length > 0 && (
          <div className="grid gap-3 lg:col-span-5">
            {secondary.map((status) => (
              <SecondaryCard key={status.id} status={status} l={l} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
