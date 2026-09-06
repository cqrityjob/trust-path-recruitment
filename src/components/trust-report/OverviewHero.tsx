// TRUST Evidence Report — the thirty-second overview.
//
// One dominant card says what the next process step is and why, in the
// visual register of the Passport action cards: a soft surface, a navy icon
// tile, one obvious action. Three columns say where the evidence is
// clearest, what to verify in the interview and where it is thin. No column
// is numbered, nothing is green, and "limited" is typeset as the quietest
// of the three, never as a failure.

import {
  ArrowRight,
  BadgeCheck,
  ClipboardList,
  FileQuestion,
  FolderSearch,
  MessageCircleQuestion,
  MessagesSquare,
  ShieldAlert,
} from "lucide-react";
import { useT } from "@/i18n/context";
import type {
  OverviewLine,
  ProcessStep,
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
import { IconTile, PatternChip, PriorityLabel, Section, SufficiencyChip } from "./primitives";
import type { TrustReportNav } from "./nav";

const STEP_ICON: Record<ProcessStep, typeof MessagesSquare> = {
  structured_interview: MessagesSquare,
  additional_assessment: ClipboardList,
  request_clarification: MessageCircleQuestion,
  gather_more_evidence: FolderSearch,
};

export function OverviewHero({ doc, nav }: { doc: TrustReportDocument; nav: TrustReportNav }) {
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
  const StepIcon = step ? STEP_ICON[step.step] : MessagesSquare;

  return (
    <Section
      id="trust-overview"
      title={t("report.trust.overview.heading")}
      printOrder={3}
      className="mt-8"
    >
      {step && (
        <article
          aria-labelledby="trust-next-step-title"
          className="avoid-break rounded-xl border border-primary/15 bg-secondary/40 p-5 shadow-[var(--shadow-xs)] sm:p-6"
        >
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 flex-1 gap-4">
              <IconTile>
                <StepIcon className="h-5 w-5" />
              </IconTile>
              <div className="min-w-0 flex-1">
                <p className="text-[10.5px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {t("report.trust.overview.nextStep")}
                </p>
                <h3
                  id="trust-next-step-title"
                  className="mt-1 text-[22px] font-semibold leading-tight tracking-tight text-foreground sm:text-[24px]"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {t(STEP_KEY[step.step])}
                </h3>
                <p className="mt-2 max-w-[72ch] text-[14.5px] leading-relaxed text-foreground">
                  {pick(step.reason, lang)}
                </p>
                {focus.length > 0 && (
                  <ul
                    className="mt-3 flex flex-wrap gap-1.5"
                    aria-label={t("report.trust.overview.focusAreas")}
                  >
                    {focus.map((c) => (
                      <li
                        key={c.competency_code}
                        className="inline-flex h-7 items-center rounded-md border border-border bg-card px-2.5 text-[12px] font-medium text-foreground"
                      >
                        {competencyName(c, lang)}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-3 text-[12.5px] text-muted-foreground">
                  {t("report.trust.overview.stepIsProcess")}
                </p>
              </div>
            </div>
            <a
              href="#trust-plan"
              className="no-print inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-md border border-primary/20 bg-card px-4 text-sm font-semibold text-primary transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none"
            >
              {t("report.trust.action.openPlan")}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>
        </article>
      )}

      <div className="tr-print-cols-3 mt-4 grid gap-4 md:grid-cols-3">
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
          className="avoid-break mt-4 flex items-center gap-3 rounded-xl border border-[color:var(--gold)]/40 bg-[color:var(--gold)]/5 px-4 py-3 text-[13px] text-foreground transition-colors hover:bg-[color:var(--gold)]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
        >
          <ShieldAlert className="h-4 w-4 shrink-0 text-[color:var(--gold)]" aria-hidden="true" />
          <span className="flex-1">
            <span className="font-semibold">{t("report.trust.overview.safety")}. </span>
            {t("report.trust.overview.safetyLink")}
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </a>
      )}

      <p className="mt-4 max-w-[80ch] text-[12.5px] leading-relaxed text-muted-foreground">
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

const COLUMN_ICON = { support: BadgeCheck, verify: MessagesSquare, limited: FileQuestion } as const;

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
  const Icon = COLUMN_ICON[kind];
  const frame = kind === "limited" ? "border-dashed border-border" : "border-border";
  return (
    <section
      aria-label={title}
      className={`avoid-break flex flex-col rounded-xl border bg-card p-5 shadow-[var(--shadow-xs)] ${frame}`}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${
            kind === "support"
              ? "bg-secondary text-primary"
              : kind === "verify"
                ? "bg-accent/10 text-accent"
                : "bg-muted text-muted-foreground"
          }`}
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h3 className="text-[11px] font-semibold uppercase tracking-widest text-foreground">
            {title}
          </h3>
          <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">{hint}</p>
        </div>
      </div>
      {lines.length === 0 ? (
        <p className="mt-4 text-[13px] italic text-muted-foreground">{empty}</p>
      ) : (
        <ul className="mt-4 flex flex-col divide-y divide-border">
          {lines.map((l) => (
            <li key={l.competency_code} className="py-3 first:pt-0 last:pb-0">
              <p className="text-[14.5px] font-semibold leading-snug text-foreground">
                {competencyName(l, lang)}
              </p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
                {pick(l.line, lang)}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
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
                        className="inline-flex h-6 items-center rounded-md border border-accent/30 bg-accent/5 px-2 text-[11.5px] font-semibold text-accent"
                      >
                        {t(REASON_KEY[r])}
                      </span>
                    ))
                  ) : (
                    <PriorityLabel value={l.follow_up_priority} />
                  ))}
                {kind === "limited" && (
                  <span className="text-[12.5px] font-medium text-muted-foreground">
                    {l.observed_item_count} {tp("report.trust.items", l.observed_item_count)}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
