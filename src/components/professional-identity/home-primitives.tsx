// The few building blocks every section of the career home shares.
//
// ── WHY THESE ARE SHARED ───────────────────────────────────────────────
//
// Every section has the same three non-content states — loading, failed,
// empty — and the review found them handled seven different ways: two
// skeletons that never resolved, three failures with no way out, one empty
// panel with a border and nothing in it. One set of primitives makes the
// rule enforceable: a skeleton is announced and temporary; a failure names
// what failed and offers a retry AND a canonical destination; an empty
// state is a sentence, never a box.
//
// ── FLAT, NOT A CARD WALL ──────────────────────────────────────────────
//
// Only two things on the page are cards: the one recommended step and the
// Passport. Everything else is a titled group of rows under a hairline, in
// the product's own display face for the title, so the page reads as one
// document rather than a grid of equal boxes competing for attention.

import { Link } from "@tanstack/react-router";
import { ArrowRight, RefreshCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/context";
import { L, type Lang } from "./copy";
import { COMMON } from "./home-copy";
import { LINK } from "./home-format";

/** A titled group. `id` names the section for aria-labelledby. */
export function Group({
  id,
  title,
  eyebrow,
  icon,
  children,
  className,
  ...rest
}: {
  id: string;
  title: string;
  eyebrow?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
} & Record<`data-${string}`, string | undefined>) {
  return (
    <section
      aria-labelledby={`${id}-heading`}
      className={cn("border-t border-border pt-6", className)}
      {...rest}
    >
      {eyebrow && (
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {eyebrow}
        </p>
      )}
      <h2
        id={`${id}-heading`}
        className="mt-0.5 flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {icon && (
          <span className="text-accent" aria-hidden="true">
            {icon}
          </span>
        )}
        {title}
      </h2>
      {children}
    </section>
  );
}

/** A sub-heading inside a group: the two halves of "employer processes". */
export function SubHeading({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <h3 id={id} className="text-base font-semibold text-foreground">
      {children}
    </h3>
  );
}

/** A loading state. Announced, and never left behind: the caller renders
 *  it only while its query is pending. */
export function Loading({ label, className }: { label: string; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={className} data-loading>
      <p className="sr-only">{label}</p>
      <div className="h-16 animate-pulse rounded-md bg-muted motion-reduce:animate-none" />
    </div>
  );
}

/**
 * A read that failed. Says so, and offers TWO ways out: run the read again,
 * and go to the canonical page for the thing — which has its own retry and
 * its own fuller error. A failure with no way out is a dead end.
 */
export function Failed({
  message,
  onRetry,
  href,
  hrefLabel,
  className,
}: {
  message: string;
  onRetry?: () => void;
  href?: string;
  hrefLabel?: string;
  className?: string;
}) {
  const { lang } = useT();
  const l = lang as Lang;
  return (
    <div role="alert" className={cn("text-sm", className)} data-failed>
      <p className="italic text-muted-foreground">{message}</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1">
        {onRetry && (
          <button type="button" onClick={onRetry} className={LINK} data-retry>
            <RefreshCcw className="h-3.5 w-3.5" aria-hidden="true" />
            {L(COMMON.retry, l)}
          </button>
        )}
        {href && hrefLabel && (
          <Link to={href} className={LINK}>
            {hrefLabel}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        )}
      </div>
    </div>
  );
}

/** A word for the state, so nothing depends on seeing a colour. */
export function Chip({ label, tone = "light" }: { label: string; tone?: "light" | "dark" }) {
  return (
    <p
      className={cn(
        "inline-flex items-center self-start rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em]",
        tone === "dark"
          ? "bg-primary-foreground/15 text-primary-foreground"
          : "bg-secondary text-accent",
      )}
    >
      {label}
    </p>
  );
}
