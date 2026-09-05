// The three experience totals, and the form that keeps them apart.
//
// ── SENTENCE, NOT BADGE ────────────────────────────────────────────────
//
// Reported and documented totals are rendered as a labelled number in a
// plain row. A verified recognition is rendered as an enclosed, sealed
// badge (see RecognitionBadges). The difference is FORM, not colour or
// wording — because form is what a reader recognises at a glance, and a
// glance is all most readers give (Product Architecture v1.1 §6.3).
//
// ── ELAPSED AND FTE, SIDE BY SIDE ──────────────────────────────────────
//
// Never one converted into the other. A 50% Väktare for four years worked
// in the profession for four years; the FTE figure is context, not a
// correction.
//
// ── NO BARS, NO METERS, NO PERCENTAGES ─────────────────────────────────
//
// Those belong to Career Card's guidance language. Reusing them here would
// imply measurement where there is attestation.

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import { formatDuration, formatPeriodRange } from "@/lib/security-passport/format";
import type { ExperienceTotals as Totals } from "@/lib/security-passport/experience";
import type { ExperiencePeriod } from "@/lib/security-passport/types";
import { AssertionChip } from "./AssertionChip";

function TotalRow({
  label,
  hint,
  days,
  emphasis,
}: {
  label: string;
  hint: string;
  days: number;
  emphasis: boolean;
}) {
  const { pt, lang } = usePassportCopy();
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border py-3 last:border-b-0">
      <div className="min-w-0">
        <p
          className={cn("text-sm", emphasis ? "font-semibold text-foreground" : "text-foreground")}
        >
          {label}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      </div>
      <p
        className={cn(
          "shrink-0 tabular-nums",
          emphasis ? "text-lg font-semibold text-foreground" : "text-base text-foreground",
        )}
      >
        {days > 0 ? formatDuration(days, lang) : pt("totals.none")}
      </p>
    </div>
  );
}

export function ExperienceTotalsPanel({
  totals,
  periods,
  className,
}: {
  totals: Totals;
  periods: readonly ExperiencePeriod[];
  className?: string;
}) {
  const { pt, lang } = usePassportCopy();
  const [openBasis, setOpenBasis] = useState(false);

  const contributing = periods.filter((p) => totals.reported.contributingPeriodIds.includes(p.id));

  return (
    <section className={cn("rounded-xl border border-border bg-card p-5", className)}>
      <h3 className="text-base font-semibold tracking-tight text-foreground">
        {pt("totals.title")}
      </h3>

      <div className="mt-3">
        <TotalRow
          label={pt("totals.reported")}
          hint={pt("totals.reportedHint")}
          days={totals.reported.elapsedDays}
          emphasis={false}
        />
        <TotalRow
          label={pt("totals.documented")}
          hint={pt("totals.documentedHint")}
          days={totals.documented.elapsedDays}
          emphasis={false}
        />
        <TotalRow
          label={pt("totals.verified")}
          hint={pt("totals.verifiedHint")}
          days={totals.verified.elapsedDays}
          emphasis
        />
      </div>

      <div className="mt-4 rounded-lg bg-secondary/50 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          {pt("totals.fteTitle")}
        </p>
        <div className="mt-2 flex flex-wrap gap-x-8 gap-y-2">
          <div>
            <p className="text-xs text-muted-foreground">{pt("totals.elapsedLabel")}</p>
            <p className="text-sm font-medium tabular-nums text-foreground">
              {formatDuration(totals.reported.elapsedDays, lang)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{pt("totals.fteLabel")}</p>
            <p className="text-sm font-medium tabular-nums text-foreground">
              {formatDuration(totals.reported.fteWeightedDays, lang)}
            </p>
          </div>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{pt("totals.fteNote")}</p>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
        {pt("totals.overlapNote")}
      </p>

      {contributing.length > 0 ? (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setOpenBasis((v) => !v)}
            aria-expanded={openBasis}
            // min-h-11 (44px): this is the control that reveals how a
            // recognition was calculated, so it has to be comfortably
            // tappable on a phone. -ml-2 px-2 keeps the enlarged hit area
            // from visually indenting the text.
            className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <ChevronDown
              aria-hidden="true"
              className={cn("h-4 w-4 transition-transform", openBasis && "rotate-180")}
            />
            {openBasis ? pt("totals.basisHide") : pt("totals.basis")}
          </button>

          {openBasis ? (
            <ul className="mt-3 space-y-2">
              {contributing.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-md border border-border px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-foreground">
                      {p.employerName} — {p.roleTitle}
                    </p>
                    <p className="text-xs tabular-nums text-muted-foreground">
                      {formatPeriodRange(p.startedOn, p.endedOn, lang)}
                      {p.securityRelevance === "partial"
                        ? ` · ${pt("timeline.partialSecurity")}`
                        : ""}
                    </p>
                  </div>
                  <AssertionChip
                    level={p.assertionLevel}
                    provenance={{ ...p, subjectKind: "employment" }}
                    size="sm"
                  />
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
