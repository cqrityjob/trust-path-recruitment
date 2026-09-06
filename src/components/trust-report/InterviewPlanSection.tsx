// TRUST Evidence Report — the TRUST Interview Plan.
//
// "Från evidens till en bättre intervju." At most three priority areas, each
// with what we know, what is unclear, the main question and what to listen
// for; the conversation structure (Situation, Egen roll, Agerande, Resultat,
// Reflektion) folds open per area. The plan is never called by another
// method's name, and the letters are not spelled out.

import { ArrowRight } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useT } from "@/i18n/context";
import type { TrustReportDocument } from "@/lib/security-competency/trust-report.types";
import { pick } from "@/lib/security-competency/trust-report.types";
import { UNCLEAR_KEY, planPriorities } from "@/lib/security-competency/trust-report.presentation";
import { Fold, PatternChip, Section, SufficiencyChip, Tag } from "./primitives";
import type { TrustReportNav } from "./nav";

export function InterviewPlanSection({
  doc,
  nav,
}: {
  doc: TrustReportDocument;
  nav: TrustReportNav;
}) {
  const { t, lang, tp } = useT();
  const plan = doc.frozen_report.employer.trust_plan;
  const priorities = planPriorities(doc);

  return (
    <Section
      id="trust-plan"
      title={pick(plan?.heading, lang) || t("report.trust.plan.heading")}
      lede={pick(plan?.subheading, lang) || t("report.trust.plan.subheading")}
      printOrder={6}
      aside={
        nav.applicationId ? (
          <Link
            to="/employer/$employerSlug/interview-intelligence/new"
            params={{ employerSlug: nav.employerSlug }}
            search={{ applicationId: nav.applicationId, jobId: nav.jobId ?? undefined }}
            className="no-print inline-flex min-h-[44px] items-center gap-2 rounded-[10px] bg-accent px-4 text-[13px] font-semibold text-accent-foreground hover:bg-[color:var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {t("report.trust.action.startInterview")}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        ) : undefined
      }
    >
      {priorities.length === 0 ? (
        <p className="rounded-[12px] border border-border bg-[color:var(--surface-subtle)] p-5 text-[13px] text-muted-foreground">
          {t("report.trust.plan.empty")}
        </p>
      ) : (
        <ol className="flex flex-col gap-4">
          {priorities.map((p, i) => {
            const name = lang === "en" ? p.target.area_en : p.target.area_sv;
            const listen = lang === "en" ? p.tell.listen_for.en : p.tell.listen_for.sv;
            const unclear = p.ready.limitation
              ? lang === "en"
                ? p.ready.limitation.en
                : p.ready.limitation.sv
              : t(UNCLEAR_KEY[p.target.focus]);
            return (
              <li key={`${p.order}-${p.competency_code}`}>
                <article
                  aria-labelledby={`trust-plan-${p.competency_code}`}
                  className="tr-card rounded-[14px] border border-border bg-card p-5 shadow-[var(--shadow-xs)] sm:p-6"
                >
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-full bg-primary px-2 text-[13px] font-semibold text-primary-foreground">
                      {i + 1}
                    </span>
                    <h3
                      id={`trust-plan-${p.competency_code}`}
                      className="text-[18px] font-semibold leading-snug tracking-tight text-foreground"
                      style={{ fontFamily: "var(--font-display)" }}
                    >
                      {name}
                    </h3>
                    <Tag muted>
                      {p.target.evidence_type === "self_reported"
                        ? t("report.trust.map.selfReportTag")
                        : t("report.trust.observedLabel")}
                    </Tag>
                  </div>

                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <div className="rounded-[10px] bg-[color:var(--surface-subtle)] p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                        {t("report.trust.plan.know")}
                      </p>
                      <p className="mt-1.5 text-[14px] leading-relaxed text-foreground">
                        {pick(p.ready.existing_evidence, lang)}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                          {t("report.trust.observedLabel")}:
                        </span>
                        <PatternChip value={p.ready.observed_pattern} />
                        <SufficiencyChip value={p.ready.evidence_sufficiency} />
                        <span className="text-[12px] text-muted-foreground">
                          {p.ready.observed_item_count}{" "}
                          {tp("report.trust.items", p.ready.observed_item_count)}
                        </span>
                      </div>
                    </div>
                    <div className="rounded-[10px] bg-[color:var(--surface-subtle)] p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                        {t("report.trust.plan.unclear")}
                      </p>
                      <p className="mt-1.5 text-[14px] leading-relaxed text-foreground">
                        {unclear}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 border-l-[3px] border-accent pl-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-accent">
                      {t("report.trust.plan.question")}
                    </p>
                    <p className="mt-1 text-[17px] font-medium leading-relaxed text-foreground">
                      {pick(p.understand.question, lang)}
                    </p>
                  </div>

                  {listen.length > 0 && (
                    <div className="mt-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                        {t("report.trust.plan.listen")}
                      </p>
                      <ul className="mt-1.5 grid gap-1.5 text-[14px] leading-relaxed text-foreground sm:grid-cols-2">
                        {listen.map((x) => (
                          <li key={x} className="flex gap-2">
                            <span
                              aria-hidden="true"
                              className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                            />
                            <span>{x}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="mt-3">
                    <Fold
                      openLabel={t("report.trust.plan.showStructure")}
                      closeLabel={t("report.trust.plan.hideStructure")}
                      triggerClassName="-ml-2"
                    >
                      <div className="mt-2 rounded-[10px] border border-border p-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                          {t("report.trust.plan.structure")}
                        </p>
                        <ol className="mt-2 flex flex-wrap gap-2">
                          {p.structure.steps.map((s, j) => (
                            <li
                              key={s.key}
                              className="inline-flex min-h-[32px] items-center gap-2 rounded-full border border-border bg-card px-3 text-[13px] font-medium text-foreground"
                            >
                              <span className="text-[11px] font-semibold text-muted-foreground">
                                {j + 1}
                              </span>
                              {lang === "en" ? s.en : s.sv}
                            </li>
                          ))}
                        </ol>
                        {pick(p.structure.followup, lang) && (
                          <p className="mt-3 text-[14px] leading-relaxed text-foreground">
                            <span className="font-semibold">
                              {t("report.trust.map.followup")}:{" "}
                            </span>
                            {pick(p.structure.followup, lang)}
                          </p>
                        )}
                        {pick(p.tell.document, lang) && (
                          <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                            <span className="font-semibold text-foreground">
                              {t("report.trust.plan.document")}:{" "}
                            </span>
                            {pick(p.tell.document, lang)}
                          </p>
                        )}
                      </div>
                    </Fold>
                  </div>
                </article>
              </li>
            );
          })}
        </ol>
      )}
      {plan && priorities.length > 0 && (
        <p className="mt-3 text-[12px] text-muted-foreground">
          {plan.question_count} {t("report.trust.plan.questionsWord")}
        </p>
      )}
    </Section>
  );
}
