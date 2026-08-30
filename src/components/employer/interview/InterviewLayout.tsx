// The visual grammar the six interview work surfaces share.
//
// Everything here is layout and hierarchy. No screen composes its own spacing
// scale, its own panel border or its own section heading any more, because six
// screens each inventing those is how a product ends up looking like six
// products.
//
// Three rules run through it:
//
//   1. A section is a HEADING and its content. It becomes a bordered surface
//      only when it is genuinely a distinct object -- a side panel, one item in
//      a list, a document. Wrapping every section in a card removes the
//      hierarchy the card was supposed to create.
//
//   2. Emphasis is typographic first. Size, weight and space carry the
//      structure; colour and borders only reinforce it.
//
//   3. Nothing here holds copy. Every string is passed in, already resolved
//      through t(), so a component can never be the place a translation is
//      forgotten.

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Page-level composition                                              */
/* ------------------------------------------------------------------ */

/** A work surface with a main column and a context rail.
 *
 *  Roughly 70/30 at desktop. Below `lg` the rail stacks underneath the main
 *  column rather than being squeezed, because a 30% column at tablet width is
 *  narrower than the text it holds. */
export function WorkSplit({
  main,
  rail,
  railFirstOnMobile = false,
}: {
  main: ReactNode;
  rail: ReactNode;
  /** Put the rail above the main column on small screens. Used where the rail
   *  holds the immediate context for what is below it. */
  railFirstOnMobile?: boolean;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-8 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className={cn("min-w-0", railFirstOnMobile && "order-2 lg:order-1")}>{main}</div>
      <div className={cn("min-w-0 space-y-4", railFirstOnMobile && "order-1 lg:order-2")}>
        {rail}
      </div>
    </div>
  );
}

/** The three-zone workspace: navigator, conversation, support.
 *
 *  At desktop the navigator is a narrow fixed column and the support rail is
 *  about a quarter. Below `xl` the navigator collapses out of the grid -- the
 *  screen that uses it renders it as a drawer instead -- and below `lg` the
 *  support rail drops beneath the centre column. */
export function WorkspaceGrid({
  navigator,
  centre,
  support,
}: {
  navigator: ReactNode;
  centre: ReactNode;
  support: ReactNode;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem] xl:grid-cols-[14rem_minmax(0,1fr)_20rem] xl:gap-7">
      {navigator ? <div className="hidden min-w-0 xl:block">{navigator}</div> : null}
      <div className="min-w-0">{centre}</div>
      <div className="min-w-0">{support}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sections                                                            */
/* ------------------------------------------------------------------ */

/** A titled section of a work surface.
 *
 *  A heading, an optional one-line explanation, an optional action on the same
 *  baseline, and the content. No border: the heading is the boundary. */
export function Section({
  id,
  title,
  description,
  action,
  level = 2,
  children,
  className,
}: {
  id: string;
  title: string;
  description?: string;
  action?: ReactNode;
  level?: 2 | 3;
  children: ReactNode;
  className?: string;
}) {
  const Heading = level === 2 ? "h2" : "h3";
  return (
    <section aria-labelledby={id} className={className}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <Heading
          id={id}
          className={cn(
            "font-semibold tracking-tight text-foreground",
            level === 2 ? "text-base sm:text-[1.0625rem]" : "text-sm",
          )}
        >
          {title}
        </Heading>
        {action}
      </div>
      {description && (
        <p className="mt-1 max-w-[68ch] text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** A hairline between two sections of the same surface. */
export function Rule({ className }: { className?: string }) {
  return <hr className={cn("my-8 border-t border-border", className)} />;
}

/** A small uppercase label above a group. Used inside panels and documents,
 *  where a full section heading would be too loud. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
      {children}
    </p>
  );
}

/* ------------------------------------------------------------------ */
/* Surfaces                                                            */
/* ------------------------------------------------------------------ */

/** A bordered surface: a side panel, a document, one item in a list. */
export function Surface({
  children,
  className,
  padded = true,
  muted = false,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
  muted?: boolean;
  as?: "div" | "article" | "li" | "aside";
}) {
  return (
    <Tag
      className={cn(
        "rounded-lg border border-border",
        muted ? "bg-muted/30" : "bg-card",
        padded && "p-4",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

/** A panel on the context rail: a small heading, then its content. */
export function RailPanel({
  id,
  title,
  note,
  children,
  className,
}: {
  id: string;
  title: string;
  note?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-labelledby={id}
      className={cn("rounded-lg border border-border bg-card p-4", className)}
    >
      <h2 id={id} className="text-sm font-semibold tracking-tight text-foreground">
        {title}
      </h2>
      {note && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{note}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** Methodology, provenance and other secondary reading: present, never first.
 *
 *  A disclosure rather than a panel, styled quietly enough that a page full of
 *  them still reads as one page. */
export function Disclosure({
  summary,
  children,
  defaultOpen = false,
  className,
}: {
  summary: string;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  return (
    <details
      open={defaultOpen}
      className={cn(
        "group rounded-lg border border-border bg-card px-4 py-3 [&_summary::-webkit-details-marker]:hidden",
        className,
      )}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
        <span
          aria-hidden="true"
          className="text-xs text-muted-foreground transition-transform group-open:rotate-90"
        >
          ▸
        </span>
        {summary}
      </summary>
      <div className="mt-3 border-t border-border pt-3">{children}</div>
    </details>
  );
}

/* ------------------------------------------------------------------ */
/* Small pieces                                                        */
/* ------------------------------------------------------------------ */

/** A labelled value. `wide` lets a long value use the full column. */
export function Field({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={cn(wide && "sm:col-span-2")}>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-sm leading-relaxed text-foreground">{children}</dd>
    </div>
  );
}

/** The header strip of a document or a work surface: several short facts,
 *  read across rather than down. */
export function FactRow({ children }: { children: ReactNode }) {
  return <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">{children}</dl>;
}

/** An empty state that reads as a deliberate state rather than a hole.
 *
 *  Never a large dashed box: a section with nothing in it yet is a small,
 *  quiet line, and the explanation of what it means matters more than the
 *  space it occupies. */
export function Nothing({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-2.5">
      <p className="text-sm text-muted-foreground">{children}</p>
      {hint && <p className="mt-1 text-xs leading-relaxed text-muted-foreground/80">{hint}</p>}
    </div>
  );
}

/** A count beside a label. Workflow information only -- never a measurement of
 *  a person, which is why there is no bar, ring or percentage variant. */
export function Tally({
  value,
  label,
  tone = "neutral",
}: {
  value: string | number;
  label: string;
  tone?: "neutral" | "attention";
}) {
  return (
    <div>
      <p
        className={cn(
          "text-xl font-semibold tabular-nums tracking-tight",
          tone === "attention" ? "text-amber-800 dark:text-amber-200" : "text-foreground",
        )}
      >
        {value}
      </p>
      <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{label}</p>
    </div>
  );
}

/** One scannable row in a list of work items: an icon, a heading, a line of
 *  explanation, an optional count and an optional destination. */
export function ScanRow({
  glyph,
  title,
  description,
  count,
  countLabel,
  tone = "neutral",
  action,
}: {
  glyph: string;
  title: string;
  description: string;
  count?: number;
  countLabel?: string;
  tone?: "neutral" | "confirmed" | "attention";
  action?: ReactNode;
}) {
  const ring =
    tone === "confirmed"
      ? "border-teal-700/30 bg-teal-700/5 text-teal-900 dark:text-teal-200"
      : tone === "attention"
        ? "border-amber-600/40 bg-amber-500/5 text-amber-900 dark:text-amber-200"
        : "border-border bg-muted/40 text-muted-foreground";
  return (
    <div className="flex items-start gap-3 py-3.5">
      <span
        aria-hidden="true"
        className={cn(
          "mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border font-mono text-xs",
          ring,
        )}
      >
        {glyph}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          {count !== undefined && (
            <p className="text-sm tabular-nums text-muted-foreground">
              <span className="sr-only"> · </span>
              {count}
              {countLabel ? ` ${countLabel}` : ""}
            </p>
          )}
        </div>
        <p className="mt-0.5 max-w-[72ch] text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
}

/** A list of ScanRows, separated by hairlines rather than by gaps. */
export function ScanList({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-border border-y border-border">{children}</div>;
}
