// Professional recognition — the only badge in the product.
//
// ── FORM CARRIES THE MEANING ───────────────────────────────────────────
//
// This is the one place a sealed, enclosed, attributed badge appears. Every
// other number in the Passport is a sentence with a figure (see
// ExperienceTotals). That contrast is deliberate: a reader who glances at
// this screen should be able to tell earned verified time from self-reported
// time without reading a word (Product Architecture v1.1 §6.3).
//
// ── MIXED EVIDENCE IS EXPLAINED, NOT SILENTLY ABSENT ───────────────────
//
// The most likely confusion in the whole product is "I have eight years,
// where is my badge?". Leaving the badge simply missing answers that
// question with nothing. So when reported time clears a threshold and
// verified time does not, that exact situation is named.
//
// ── NOT GAMIFICATION ───────────────────────────────────────────────────
//
// No points, streaks, ranks, progress bars, comparisons or encouragement.
// The remaining time is stated once, as a fact.

import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import { formatDuration } from "@/lib/security-passport/format";
import {
  isTopThreshold,
  mayShowBadge,
  type RecognitionState,
} from "@/lib/security-passport/recognition";

/** The sealed badge. Rendered only when the whole threshold is verified. */
export function RecognitionBadge({ years, className }: { years: number; className?: string }) {
  const { pt } = usePassportCopy();
  return (
    <div
      className={cn(
        "inline-flex items-center gap-3 rounded-lg border-2 border-primary bg-primary px-4 py-3 text-primary-foreground",
        className,
      )}
    >
      <ShieldCheck aria-hidden="true" className="h-6 w-6 shrink-0" />
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] opacity-80">
          {pt("recognition.badgePrefix")}
        </p>
        <p className="text-lg font-semibold leading-tight tracking-tight">
          {years} {isTopThreshold(years) ? pt("recognition.yearsPlus") : pt("recognition.years")}
        </p>
      </div>
    </div>
  );
}

export function RecognitionPanel({
  recognition,
  className,
}: {
  recognition: RecognitionState;
  className?: string;
}) {
  const { pt, lang } = usePassportCopy();
  const earned = mayShowBadge(recognition);

  return (
    <section className={cn("rounded-xl border border-border bg-card p-5", className)}>
      <h3 className="text-base font-semibold tracking-tight text-foreground">
        {pt("recognition.title")}
      </h3>

      {earned ? (
        <div className="mt-4">
          <RecognitionBadge years={recognition.earnedYears as number} />
        </div>
      ) : (
        <div className="mt-4 rounded-lg border border-dashed border-border p-4">
          <p className="text-sm font-medium text-foreground">{pt("recognition.noneTitle")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{pt("recognition.noneBody")}</p>
        </div>
      )}

      {recognition.blockedByMixedEvidence ? (
        <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/30">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            {pt("recognition.mixedTitle")}
          </p>
          <p className="mt-1 text-sm text-amber-900/90 dark:text-amber-200/90">
            {pt("recognition.mixedBody")}
          </p>
        </div>
      ) : null}

      {recognition.nextYears !== null ? (
        <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-3 border-t border-border pt-4">
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              {pt("recognition.nextTitle")}
            </dt>
            <dd className="mt-0.5 text-sm tabular-nums text-foreground">
              {recognition.nextYears}{" "}
              {isTopThreshold(recognition.nextYears)
                ? pt("recognition.yearsPlus")
                : pt("recognition.years")}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              {pt("recognition.remaining")}
            </dt>
            <dd className="mt-0.5 text-sm tabular-nums text-foreground">
              {formatDuration(recognition.remainingVerifiedDays, lang)}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              {pt("totals.verified")}
            </dt>
            <dd className="mt-0.5 text-sm tabular-nums text-foreground">
              {formatDuration(recognition.verifiedDays, lang)}
            </dd>
          </div>
        </dl>
      ) : null}

      <p className="mt-4 text-[11px] text-muted-foreground">
        {pt("recognition.policy")}: <span className="font-mono">{recognition.policyVersion}</span>
      </p>
    </section>
  );
}
