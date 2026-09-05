// The Security Passport, summarised — three counts that cannot be confused.
//
// ── WHY THREE NUMBERS AND NOT ONE ──────────────────────────────────────
//
// The home used to print one figure, "0 verifierade", for four genuinely
// different states: nothing recorded, recorded and unreviewed, under review,
// and unreadable. A holder with eight credentials in their Passport read
// "0 verifierade" and reasonably concluded the Passport was empty.
//
// So the three counts the brief names are shown side by side, each labelled
// in full words: what you recorded, what is being verified, and what has
// been verified. They come from `countMerits`, which is also what the
// Passport itself uses, so the two surfaces cannot disagree.
//
// ── WHAT IS DELIBERATELY ABSENT ────────────────────────────────────────
//
// No percentage, no completeness bar, no trust score, no ratio of verified
// to recorded. A person is not verified — individual merits are, one at a
// time, by somebody named, on a date — and any single figure summarising a
// human being's professional standing would say otherwise.
//
// ── UNKNOWN IS NOT ZERO ────────────────────────────────────────────────
//
// A failed read renders one sentence saying the merits could not be read.
// It never renders zeroes: a confident zero about somebody's professional
// standing is the most damaging false statement this product can make.

import { Link } from "@tanstack/react-router";
import { ArrowRight, IdCard, Info } from "lucide-react";
import { useT } from "@/i18n/context";
import type { PassportSummaryModel } from "@/lib/professional-identity/home-presentation";
import { L, Lp, type Lang } from "./copy";
import { PASSPORT } from "./home-copy";

/** One count, with its label spelled out. The number is large; the label is
 *  the thing that makes it mean something, so both are always rendered. */
function Count({ value, label, testId }: { value: number | null; label: string; testId: string }) {
  const { lang } = useT();
  const l = lang as Lang;
  return (
    <div className="min-w-0" data-merit-count={testId}>
      <p
        className="text-2xl font-semibold tabular-nums text-foreground"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {/* Null is "we could not read it", and it says so in words rather
            than printing a zero somebody would read as a fact. */}
        {value === null ? (
          <span className="text-base italic font-normal text-muted-foreground">
            {L(PASSPORT.reviewUnknown, l)}
          </span>
        ) : (
          value
        )}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

export function PassportSummary({
  passport,
  className,
}: {
  passport: PassportSummaryModel;
  className?: string;
}) {
  const { lang } = useT();
  const l = lang as Lang;

  return (
    <section
      aria-labelledby="passport-summary-heading"
      data-passport-summary
      data-passport-state={passport.state}
      className={className}
    >
      <article className="flex h-full flex-col rounded-xl border border-border bg-card p-6 md:p-7">
        <h2
          id="passport-summary-heading"
          className="flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground"
          style={{ fontFamily: "var(--font-display)" }}
        >
          <span className="text-accent" aria-hidden="true">
            <IdCard className="h-5 w-5" />
          </span>
          {L(PASSPORT.heading, l)}
        </h2>

        {passport.state === "loading" ? (
          <div role="status" aria-live="polite" className="mt-4">
            <p className="sr-only">{L(PASSPORT.loading, l)}</p>
            <div className="h-16 animate-pulse rounded-md bg-muted motion-reduce:animate-none" />
          </div>
        ) : passport.state === "unavailable" ? (
          <p role="status" className="mt-3 text-sm italic text-muted-foreground">
            {L(PASSPORT.unreadable, l)}
          </p>
        ) : passport.state === "not_opened" ? (
          <>
            <p className="mt-3 text-sm text-foreground">{L(PASSPORT.notOpened, l)}</p>
            <p className="mt-1 max-w-[52ch] text-sm text-muted-foreground">
              {L(PASSPORT.notOpenedBody, l)}
            </p>
          </>
        ) : (
          <>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3">
              <Count
                value={passport.counts.addedCount}
                label={L(PASSPORT.registered, l)}
                testId="registered"
              />
              <Count
                value={passport.counts.pendingCount}
                label={L(PASSPORT.underReview, l)}
                testId="under-review"
              />
              <Count
                value={passport.counts.verifiedCount}
                label={L(PASSPORT.verified, l)}
                testId="verified"
              />
              {/* Shown only when non-zero. A lapsed credential is not a
                  current one and must never sit inside "verified"; an
                  empty row for it would be noise. */}
              {passport.counts.expiredCount > 0 && (
                <Count
                  value={passport.counts.expiredCount}
                  label={L(PASSPORT.expired, l)}
                  testId="expired"
                />
              )}
              {passport.counts.draftCount > 0 && (
                <Count
                  value={passport.counts.draftCount}
                  label={L(PASSPORT.drafts, l)}
                  testId="drafts"
                />
              )}
            </dl>

            {passport.counts.clarificationCount > 0 && (
              <p className="mt-4 inline-flex self-start rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">
                {Lp(PASSPORT.clarification, l, passport.counts.clarificationCount)}
              </p>
            )}

            {/* The sentence that keeps "added" and "verified" apart. It is
                not a footnote: without it three numbers are three numbers. */}
            <p className="mt-4 flex max-w-[56ch] gap-2 text-xs leading-relaxed text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{L(PASSPORT.explanation, l)}</span>
            </p>
          </>
        )}

        <div className="mt-auto flex flex-wrap items-center gap-x-5 gap-y-2 pt-5">
          <Link
            to="/passport"
            className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {L(PASSPORT.open, l)}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
          <Link
            to="/passport/credentials/new"
            className="inline-flex min-h-11 items-center text-sm font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {L(PASSPORT.add, l)}
          </Link>
        </div>
      </article>
    </section>
  );
}
