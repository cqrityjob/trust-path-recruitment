// TRUST Evidence Report — "Om rapporten": limitations, method and provenance.
//
// The standing statement is always visible. Everything else folds on screen
// and prints open. Version identities and counts only: no manifest id, no
// hash, no answer key. The template's current limitation lines are labelled
// as current explanatory information with their own as_of, because they are
// not part of the frozen report.

import { useT } from "@/i18n/context";
import type { TrustReportDocument } from "@/lib/security-competency/trust-report.types";
import { pick } from "@/lib/security-competency/trust-report.types";
import { formatDateTime } from "@/lib/security-competency/trust-report.presentation";
import { Fold, Meta, Section, Tag } from "./primitives";

export function MethodSection({ doc }: { doc: TrustReportDocument }) {
  const { t, lang } = useT();
  const { core } = doc.frozen_report;
  const prov = core.provenance;
  const cov = core.coverage;
  const hr = core.human_review;
  const def = core.definitions?.evidence_sufficiency;
  const tpl = doc.template_overlay;
  const tplLines = tpl ? ((lang === "en" ? tpl.limitations?.en : tpl.limitations?.sv) ?? []) : [];

  return (
    <Section
      id="trust-method"
      title={t("report.trust.method.heading")}
      lede={t("report.trust.method.sub")}
      printOrder={8}
      subordinate
    >
      <div className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-xs)] sm:p-6">
        <p className="text-[15px] font-medium leading-relaxed text-foreground">
          {pick(core.limitations?.standing_statement, lang)}
        </p>

        <Fold
          openLabel={t("report.trust.method.show")}
          closeLabel={t("report.trust.method.hide")}
          triggerClassName="-ml-2 mt-2"
        >
          <div className="mt-2 flex flex-col gap-6 border-t border-border pt-5">
            <div className="avoid-break" data-print-order={8}>
              <h3 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {t("report.trust.map.limitations")}
              </h3>
              {(core.limitations?.items ?? []).length > 0 ? (
                <ul className="mt-2 list-disc pl-5 text-[14px] leading-relaxed text-foreground">
                  {core.limitations.items.map((l) => (
                    <li key={l.code}>{pick(l.statement, lang)}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-[13px] italic text-muted-foreground">
                  {t("report.trust.notAvailable")}
                </p>
              )}
            </div>

            {tplLines.length > 0 && (
              <div className="avoid-break rounded-[10px] border border-dashed border-border bg-[color:var(--surface-subtle)] p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Tag muted>{t("report.trust.method.templateNow")}</Tag>
                  <span className="text-[12px] text-muted-foreground">
                    {t("report.trust.method.templateAsOf")} {formatDateTime(tpl.as_of, lang)}
                    {tpl.report_template
                      ? ` · ${tpl.report_template.report_key} v${tpl.report_template.version}`
                      : ""}
                  </span>
                </div>
                <ul className="mt-2 list-disc pl-5 text-[13px] leading-relaxed text-muted-foreground">
                  {tplLines.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="avoid-break">
              <h3 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {t("report.trust.method.humanReview")}
              </h3>
              {hr && (
                <p className="mt-2 text-[14px] text-foreground">
                  {hr.reviews_completed} {t("report.trust.of")} {hr.reviews_total}{" "}
                  {t("report.trust.method.reviewsDone")}
                  {hr.free_text
                    ? ` · ${hr.free_text.reviewed} ${t("report.trust.of")} ${hr.free_text.items} ${t("report.trust.map.reviewedWord")}`
                    : ""}
                </p>
              )}
              {pick(hr?.meaning, lang) && (
                <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                  {pick(hr.meaning, lang)}
                </p>
              )}
            </div>

            {def && (
              <div className="avoid-break">
                <h3 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  {t("report.trust.method.sufficiencyRule")}
                </h3>
                <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                  {lang === "en" ? def.en : def.sv}
                  {typeof def.minimum_observed_items === "number"
                    ? ` (${def.rule_version}: ${def.minimum_observed_items})`
                    : ""}
                </p>
              </div>
            )}

            {cov && (
              <div className="avoid-break">
                <h3 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  {t("report.trust.method.coverage")}
                </h3>
                <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">
                  <Meta
                    label={t("report.trust.map.observed")}
                    value={String(cov.observed_items ?? 0)}
                  />
                  <Meta
                    label={t("report.trust.method.selfItems")}
                    value={String(cov.self_report_items ?? 0)}
                  />
                  <Meta
                    label={t("report.trust.map.scope.contexts")}
                    value={String(cov.evidence_contexts ?? 0)}
                  />
                  <Meta
                    label={t("report.trust.method.areasSufficient")}
                    value={String(cov.areas_sufficient ?? 0)}
                  />
                  <Meta
                    label={t("report.trust.method.areasLimited")}
                    value={String(cov.areas_limited ?? 0)}
                  />
                  {cov.composition && (
                    <Meta
                      label={t("report.trust.map.scope.freeText")}
                      value={`${cov.composition.free_text_reviewed} ${t("report.trust.of")} ${cov.composition.free_text_items} ${t("report.trust.map.reviewedWord")}`}
                    />
                  )}
                </dl>
              </div>
            )}

            <div className="avoid-break" data-print-order={9}>
              <h3 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {t("report.trust.method.versions")}
              </h3>
              <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
                <Meta
                  label={t("report.trust.meta.reportId")}
                  value={<span className="font-mono text-[12px]">{doc.report_id}</span>}
                />
                <Meta
                  label={t("report.trust.meta.released")}
                  value={formatDateTime(prov?.released_at ?? core.timestamps?.released_at, lang)}
                />
                <Meta
                  label={t("report.trust.method.calculatedAt")}
                  value={formatDateTime(prov?.calculated_at, lang)}
                />
                <Meta label={t("report.trust.method.core")} value={core.core_version} />
                <Meta
                  label={t("report.trust.method.assessmentVersion")}
                  value={
                    core.assessment
                      ? `${core.assessment.assessment_slug} v${core.assessment.assessment_version}`
                      : ""
                  }
                />
                <Meta
                  label={t("report.trust.method.scoringModel")}
                  value={
                    prov
                      ? [
                          prov.scoring_model_version,
                          prov.signal_version,
                          prov.evidence_state_version,
                        ]
                          .filter(Boolean)
                          .join(" · ")
                      : ""
                  }
                />
                <Meta
                  label={t("report.trust.method.rubric")}
                  value={
                    prov?.rubric_versions?.length
                      ? prov.rubric_versions.map((v) => `v${v}`).join(", ")
                      : ""
                  }
                />
                <Meta
                  label={t("report.trust.method.reportTemplate")}
                  value={
                    prov?.report_template
                      ? `${prov.report_template.report_key} v${prov.report_template.version}`
                      : ""
                  }
                />
                <Meta
                  label={t("report.trust.method.chain")}
                  value={
                    prov
                      ? prov.computation_chain === "verified"
                        ? t("report.trust.method.chain.verified")
                        : t("report.trust.method.chain.legacy")
                      : ""
                  }
                />
                <Meta
                  label={t("report.trust.method.humanReview")}
                  value={
                    hr
                      ? hr.completed
                        ? t("report.trust.humanReviewed")
                        : t("report.trust.humanReviewPending")
                      : ""
                  }
                />
              </dl>
            </div>
          </div>
        </Fold>
      </div>
    </Section>
  );
}
