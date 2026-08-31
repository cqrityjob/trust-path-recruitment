// The experience timeline.
//
// ── A CHRONOLOGY, NOT A CHART ──────────────────────────────────────────
//
// Deliberately a dated list rather than proportional bars. Two reasons.
// First, bars are Career Card's visual language for guidance indicators and
// must not appear in the Trust product (Product Architecture v1.1 §B8).
// Second, a proportional bar at 375 px turns a three-month contract into a
// sliver — precisely the entries a reader needs to check.
//
// ── THE CALCULATION MUST BE LEGIBLE FROM THIS SCREEN ───────────────────
//
// Overlap, part-time, partial security relevance, career breaks and
// excluded periods are each labelled in words where they occur, so a holder
// or a verifier can reconstruct the totals by reading down the list. A
// number nobody can reconstruct is a number nobody should trust.

import { cn } from "@/lib/utils";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import {
  formatDuration,
  formatPeriodRange,
  verifierAttributionKey,
} from "@/lib/security-passport/format";
import { toEpochDay, DAYS_PER_MONTH } from "@/lib/security-passport/experience";
import { countsTowardExperience, type ExperiencePeriod } from "@/lib/security-passport/types";
import { AssertionChip } from "./AssertionChip";
import { LifecycleChip, LifecycleNote } from "./LifecycleChip";

function Marker({ children }: { children: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
      {children}
    </span>
  );
}

function overlapsAny(
  period: ExperiencePeriod,
  all: readonly ExperiencePeriod[],
  evaluationOn: string,
): boolean {
  const end = (p: ExperiencePeriod) =>
    p.endedOn === null ? toEpochDay(evaluationOn) : toEpochDay(p.endedOn);
  const aStart = toEpochDay(period.startedOn);
  const aEnd = end(period);
  return all.some((b) => b.id !== period.id && toEpochDay(b.startedOn) < aEnd && end(b) > aStart);
}

export function ExperienceTimeline({
  periods,
  evaluationOn,
  className,
}: {
  periods: readonly ExperiencePeriod[];
  evaluationOn: string;
  className?: string;
}) {
  const { pt, lang } = usePassportCopy();

  if (periods.length === 0) {
    return (
      <section className={cn("rounded-xl border border-border bg-card p-5", className)}>
        <h3 className="text-base font-semibold tracking-tight text-foreground">
          {pt("timeline.title")}
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">{pt("timeline.empty")}</p>
      </section>
    );
  }

  const sorted = [...periods].sort((a, b) => toEpochDay(b.startedOn) - toEpochDay(a.startedOn));

  return (
    <section className={cn("rounded-xl border border-border bg-card p-5", className)}>
      <h3 className="text-base font-semibold tracking-tight text-foreground">
        {pt("timeline.title")}
      </h3>

      <ol className="mt-4 space-y-3">
        {sorted.map((p, index) => {
          const counted = countsTowardExperience(p.lifecycleState);
          const overlaps = overlapsAny(p, periods, evaluationOn);

          // A gap to the NEXT (older) entry, i.e. a career break. Only
          // reported when it is more than a month, so month-boundary
          // rounding never invents one.
          const older = sorted[index + 1];
          const gapDays = older
            ? toEpochDay(p.startedOn) -
              (older.endedOn === null ? toEpochDay(evaluationOn) : toEpochDay(older.endedOn))
            : 0;
          const hasBreak = gapDays > DAYS_PER_MONTH;

          return (
            <li key={p.id}>
              <article
                className={cn(
                  "rounded-lg border p-4",
                  counted ? "border-border" : "border-dashed border-amber-400/70",
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold tracking-tight text-foreground">
                      {p.roleTitle}
                    </p>
                    <p className="text-sm text-muted-foreground">{p.employerName}</p>
                    <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                      {formatPeriodRange(p.startedOn, p.endedOn, lang)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <AssertionChip level={p.assertionLevel} size="sm" />
                    <LifecycleChip state={p.lifecycleState} />
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Marker>{pt(`timeline.employmentType.${p.employmentType}` as const)}</Marker>
                  {p.endedOn === null ? <Marker>{pt("timeline.current")}</Marker> : null}
                  {overlaps ? <Marker>{pt("timeline.overlapBadge")}</Marker> : null}
                  {p.fteFraction < 1 ? (
                    <Marker>{`${pt("totals.fteLabel")} ${Math.round(p.fteFraction * 100)}%`}</Marker>
                  ) : null}
                  {p.securityRelevance === "partial" ? (
                    <Marker>{pt("timeline.partialSecurity")}</Marker>
                  ) : null}
                  {!counted ? <Marker>{pt("timeline.excluded")}</Marker> : null}
                </div>

                {/* An employer confirming that someone worked for them has
                    done something real and quite unlike CQrityjob reading a
                    certificate. Printing "Verified by" over both flattened
                    the distinction; the recorded method now picks the words,
                    so an attested period reads "Confirmed by Bevakning AB". */}
                {p.verifierName ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {pt(verifierAttributionKey(p.verificationMethod))}: {p.verifierName}
                    {p.verifiedOn ? ` · ${p.verifiedOn}` : ""}
                  </p>
                ) : null}

                <LifecycleNote state={p.lifecycleState} />
              </article>

              {hasBreak ? (
                <p className="mt-3 pl-4 text-xs text-muted-foreground">
                  {pt("timeline.break")} · {formatDuration(gapDays, lang)}
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
