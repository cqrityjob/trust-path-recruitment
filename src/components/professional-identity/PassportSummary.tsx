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
import { ArrowRight, Info } from "lucide-react";
import { useT } from "@/i18n/context";
import type { PassportSummaryModel } from "@/lib/professional-identity/home-presentation";
import { L, Lp, type Lang } from "./copy";
import { PASSPORT } from "./home-copy";
import { Failed, Loading } from "./home-primitives";

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
      className="flex min-w-0 items-baseline justify-between gap-3 py-1.5"
      data-merit-count={testId}
      data-count={value === null ? "unknown" : String(value)}
    >
      <dt className="min-w-0 text-sm text-muted-foreground">
        {label}
        {value === null && (
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {unavailableLabel ?? L(PASSPORT.reviewUnknown, l)}
          </span>
        )}
      </dt>
      <dd
        className={`m-0 shrink-0 text-base font-semibold tabular-nums ${
          value === null ? "text-muted-foreground" : "text-foreground"
        }`}
        style={{ fontFamily: "var(--font-display)" }}
      >
        {value === null ? "—" : value}
      </dd>
    </div>
  );
}

/** The region's ONE action, and therefore a button rather than a text link:
 *  Profile has "Edit Profile", the CV has "Edit CV", and the Passport's way
 *  in has to read as their equal. Filled, because of the three it is the one
 *  that opens a product rather than an editor. */
const OPEN =
  "inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-[color:var(--primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

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
      <article className="flex h-full flex-col rounded-xl border border-border bg-card p-5 md:p-6">
        <h2
          id="passport-summary-heading"
          className="text-sm font-semibold tracking-tight text-foreground"
        >
          {L(PASSPORT.statusHeading, l)}
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
            <dl className="mt-4 divide-y divide-border border-y border-border">
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

        {/* ONE canonical way in. A second "add a credential" action used
            to sit beside this; the Passport page owns adding a merit, and
            repeating it here was the duplication the owner asked to
            remove. (The route is deliberately not named in this file —
            my-career-dashboard-check asserts its absence here.) */}
        <div className="mt-auto pt-5">
          <Link to="/passport" className={OPEN} data-cta="overview-open-passport">
            {L(PASSPORT.open, l)}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
      </article>
    </section>
  );
}
