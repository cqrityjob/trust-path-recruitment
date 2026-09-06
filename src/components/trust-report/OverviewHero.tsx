// TRUST Evidence Report — the thirty-second overview.
//
// One dominant card says what the next process step is and why. Three
// columns say where the evidence is clearest, what to verify in the
// interview and where it is thin. No column is numbered, nothing is green,
// and "limited" is typeset as the quietest of the three, never as a failure.

import { ShieldAlert } from "lucide-react";
import { useT } from "@/i18n/context";
import type {
  OverviewLine,
  TrustReportDocument,
} from "@/lib/security-competency/trust-report.types";
import { pick } from "@/lib/security-competency/trust-report.types";
import {
  REASON_KEY,
  STEP_KEY,
  competencyName,
  hasSafetyFollowUp,
  overviewColumns,
} from "@/lib/security-competency/trust-report.presentation";
import { PatternChip, PriorityChip, Section, SufficiencyChip } from "./primitives";

export function OverviewHero({ doc }: { doc: TrustReportDocument }) {
  const { t, lang } = useT();
  const { core, employer } = doc.frozen_report;
  const step = employer.primary_next_step;
  const cols = overviewColumns(doc);
  const byCode = new Map((core.competencies ?? []).map((c) => [c.competency_code, c]));
  const focus = (step?.interview_handoff?.focus_area_codes ?? [])
    .map((code) => byCode.get(code))
    .filter((c): c is NonNullable<typeof c> => Boolean(c));
  const safety = hasSafetyFollowUp(doc);
  const occasion = (core.limitations?.items ?? []).find(
    (l) => l.code === "one_assessment_occasion",
  );

  return (
    <Section
      id="trust-overview"
      title={t("report.trust.overview.heading")}
      printOrder={2}
      className="mt-8"
    >
      {step && (
        <article
          aria-labelledby="trust-next-step-title"
          className="avoid-break relative overflow-hidden rounded-[16px] border border-border bg-card p-6 shadow-[var(--shadow-md)] sm:p-7"
        >
          <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1.5 bg-accent" />
          <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-accent">
            {t("report.trust.overview.nextStep")}
          </p>
          <h3
            id="trust-next-step-title"
            className="mt-1.5 text-[22px] font-semibold leading-tight tracking-tight text-foreground sm:text-[26px]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {t(STEP_KEY[step.step])}
          </h3>
          <p className="mt-3 max-w-[72ch] text-[15px] leading-relaxed text-foreground">
            {pick(step.reason, lang)}
          </p>
          {focus.length > 0 && (
            <ul
              className="mt-4 flex flex-wrap gap-2"
              aria-label={t("report.trust.overview.focusAreas")}
            >
              {focus.map((c) => (
                <li
                  key={c.competency_code}
                  className="inline-flex min-h-[28px] items-center rounded-full border border-border bg-[color:var(--surface-subtle)] px-3 text-[12px] font-semibold text-foreground"
                >
                  {competencyName(c, lang)}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-[13px] text-muted-foreground">
            {t("report.trust.overview.stepIsProcess")}
          </p>
        </article>
      )}

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <Column
          title={t("report.trust.overview.col.support")}
          hint={t("report.trust.overview.col.supportHint")}
          empty={t("report.trust.overview.empty.support")}
          lines={cols.support}
          kind="support"
        />
        <Column
          title={t("report.trust.overview.col.verify")}
          hint={t("report.trust.overview.col.verifyHint")}
          empty={t("report.trust.overview.empty.verify")}
          lines={cols.verify}
          kind="verify"
        />
        <Column
          title={t("report.trust.overview.col.limited")}
          hint={t("report.trust.overview.col.limitedHint")}
          empty={t("report.trust.overview.empty.limited")}
          lines={cols.limited}
          kind="limited"
        />
      </div>

      {safety && (
        <a
          href="#trust-safety"
          className="avoid-break mt-4 flex items-start gap-3 rounded-[12px] border border-[color:var(--gold)]/60 bg-card px-4 py-3 text-[13px] text-foreground hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ShieldAlert
            className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--gold)]"
            aria-hidden="true"
          />
          <span>
            <span className="font-semibold">{t("report.trust.overview.safety")}. </span>
            {t("report.trust.overview.safetyLink")}
          </span>
        </a>
      )}

      <p className="mt-4 max-w-[80ch] text-[13px] leading-relaxed text-muted-foreground">
        <span className="font-semibold text-foreground">
          {t("report.trust.overview.limitationLead")}.{" "}
        </span>
        {[pick(occasion?.statement, lang), pick(employer.context?.standing_limitation, lang)]
          .filter(Boolean)
          .join(" ")}
      </p>
    </Section>
  );
}

function Column({
  title,
  hint,
  empty,
  lines,
  kind,
}: {
  title: string;
  hint: string;
  empty: string;
  lines: OverviewLine[];
  kind: "support" | "verify" | "limited";
}) {
  const { t, lang, tp } = useT();
  const frame =
    kind === "support"
      ? "border-primary/20"
      : kind === "verify"
        ? "border-accent/30"
        : "border-dashed border-border";
  return (
    <section
      aria-label={title}
      className={`avoid-break flex flex-col rounded-[14px] border bg-card p-5 shadow-[var(--shadow-xs)] ${frame}`}
    >
      <h3 className="text-[12px] font-semibold uppercase tracking-[0.1em] text-foreground">
        {title}
      </h3>
      <p className="mt-1 text-[12px] leading-snug text-muted-foreground">{hint}</p>
      {lines.length === 0 ? (
        <p className="mt-4 text-[13px] italic text-muted-foreground">{empty}</p>
      ) : (
        <ul className="mt-4 flex flex-col divide-y divide-border">
          {lines.map((l) => (
            <li key={l.competency_code} className="py-3 first:pt-0 last:pb-0">
              <p className="text-[15px] font-semibold leading-snug text-foreground">
                {competencyName(l, lang)}
              </p>
              <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                {pick(l.line, lang)}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {kind === "support" && (
                  <>
                    <PatternChip value={l.observed_pattern} />
                    <SufficiencyChip value={l.evidence_sufficiency} />
                  </>
                )}
                {kind === "verify" &&
                  (l.verify_reasons.length > 0 ? (
                    l.verify_reasons.map((r) => (
                      <span
                        key={r}
                        className="inline-flex min-h-[24px] items-center rounded-[6px] border border-accent/30 bg-[color:var(--secondary)] px-2 text-[11px] font-semibold text-accent"
                      >
                        {t(REASON_KEY[r])}
                      </span>
                    ))
                  ) : (
                    <PriorityChip value={l.follow_up_priority} />
                  ))}
                {kind === "limited" && (
                  <>
                    <SufficiencyChip value={l.evidence_sufficiency} />
                    <span className="text-[12px] text-muted-foreground">
                      {l.observed_item_count} {tp("report.trust.items", l.observed_item_count)}
                    </span>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
