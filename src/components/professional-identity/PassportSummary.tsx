// The Security Passport, summarised — three counts that cannot be confused.
//
// The permanent product anchor of the page, and one of only two cards on
// it. Three labelled counts from the ONE merit counter the Passport itself
// uses, so the two surfaces cannot disagree; "validity has expired" and
// "unfinished" are shown apart, only when non-zero. No percentage, no
// trust score, no single figure for a human being.
//
// A failed read says so and offers a retry and the Passport itself. A read
// still in flight is a skeleton, never a zero and never "could not read".

import { Link } from "@tanstack/react-router";
import { meritFigures } from "@/lib/professional-identity/merit-figures";
import type { MeritCounts } from "@/lib/professional-identity/passport-merits";
import { ArrowRight, IdCard, Info } from "lucide-react";
import { useT } from "@/i18n/context";
import type { PassportSummaryModel } from "@/lib/professional-identity/home-presentation";
import { L, Lp, type Lang } from "./copy";
import { PASSPORT } from "./home-copy";
import { Failed, Loading } from "./home-primitives";
import { LINK } from "./home-format";

function Count({
  value,
  label,
  unavailableLabel,
  testId,
}: {
  value: number | null;
  label: string;
  /** Said INSTEAD of the figure, never instead of the label: two figures
   *  whose headings were both replaced by "kunde inte läsas" left a reader
   *  unable to tell which number was missing. */
  unavailableLabel?: string;
  testId: string;
}) {
  const { lang } = useT();
  const l = lang as Lang;
  return (
    <div
      className="min-w-0"
      data-merit-count={testId}
      data-count={value === null ? "unknown" : String(value)}
    >
      <dd
        className={`m-0 text-2xl font-semibold tabular-nums ${
          value === null ? "text-muted-foreground" : "text-foreground"
        }`}
        style={{ fontFamily: "var(--font-display)" }}
      >
        {value === null ? "—" : value}
      </dd>
      <dt className="mt-0.5 text-xs text-muted-foreground">{label}</dt>
      {value === null && (
        <p className="mt-0.5 text-xs text-muted-foreground">
          {unavailableLabel ?? L(PASSPORT.reviewUnknown, l)}
        </p>
      )}
    </div>
  );
}

/** Zeroes for the branches that render no figures at all. `meritFigures` is
 *  total, so the call is unconditional and the render is not. */
const EMPTY_COUNTS: MeritCounts = {
  addedCount: 0,
  selfReportedCount: 0,
  documentProvidedCount: 0,
  documentedCount: 0,
  pendingCount: 0,
  verifiedCount: 0,
  expiredCount: 0,
  draftCount: 0,
  archivedCount: 0,
  clarificationCount: 0,
  known: false,
};

export function PassportSummary({
  passport,
  onRetry,
  className,
}: {
  passport: PassportSummaryModel;
  onRetry?: () => void;
  className?: string;
}) {
  const { lang } = useT();
  const l = lang as Lang;
  const figures = meritFigures(passport.state === "counts" ? passport.counts : EMPTY_COUNTS);

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
          <Loading label={L(PASSPORT.loading, l)} className="mt-4" />
        ) : passport.state === "unavailable" ? (
          <Failed message={L(PASSPORT.unreadable, l)} onRetry={onRetry} className="mt-3" />
        ) : passport.state === "not_opened" ? (
          <>
            <p className="mt-3 text-sm text-foreground">{L(PASSPORT.notOpened, l)}</p>
            <p className="mt-1 max-w-[52ch] text-sm text-muted-foreground">
              {L(PASSPORT.notOpenedBody, l)}
            </p>
          </>
        ) : (
          <>
            {/* ── THE SHARED FIGURES ────────────────────────────────
                From `meritFigures`, which the Security Passport workspace
                prints from too. Five mutually exclusive rungs and one figure
                that is NAMED as a total, so the same merit cannot be
                described one way here and another way there, and two
                categories cannot silently overlap. */}
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3">
              <Count
                value={figures.totalCurrent}
                label={L(PASSPORT.total, l)}
                testId="total-current"
              />
              <Count
                value={figures.selfReported}
                label={L(PASSPORT.registered, l)}
                unavailableLabel={L(PASSPORT.figureUnavailable, l)}
                testId="registered"
              />
              <Count
                value={figures.openCases}
                label={L(PASSPORT.underReview, l)}
                unavailableLabel={L(PASSPORT.figureUnavailable, l)}
                testId="under-review"
              />
              <Count
                value={figures.sourceConfirmed}
                label={L(PASSPORT.verified, l)}
                testId="verified"
              />
              {figures.documented > 0 && (
                <Count
                  value={figures.documented}
                  label={L(PASSPORT.documented, l)}
                  testId="documented"
                />
              )}
              {figures.lapsed > 0 && (
                <Count value={figures.lapsed} label={L(PASSPORT.expired, l)} testId="expired" />
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
            <p className="mt-4 flex max-w-[56ch] gap-2 text-xs leading-relaxed text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{L(PASSPORT.explanation, l)}</span>
            </p>
          </>
        )}

        <div className="mt-auto flex flex-wrap items-center gap-x-5 gap-y-2 pt-5">
          <Link to="/passport" className={LINK}>
            {L(PASSPORT.open, l)}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
          {passport.state !== "unavailable" && (
            <Link to="/passport/credentials/new" className={LINK}>
              {L(PASSPORT.addCredential, l)}
            </Link>
          )}
        </div>
      </article>
    </section>
  );
}
