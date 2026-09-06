// TRUST Evidence Report — technical traceability.
//
// Version identities and the report id, kept out of the reader's flow: a
// recruitment manager never needs them, and an auditor must always be able to
// find them. Folded on screen, printed at the back of the evidence appendix.
// Counts and version identities only -- no manifest id, no hash.

import { useT } from "@/i18n/context";
import type { TrustReportDocument } from "@/lib/security-competency/trust-report.types";
import { formatDateTime } from "@/lib/security-competency/trust-report.presentation";
import { Fold, Meta, Section } from "./primitives";

export function ProvenanceSection({
  doc,
  printOrder,
}: {
  doc: TrustReportDocument;
  printOrder: number;
}) {
  const { t, lang } = useT();
  const { core } = doc.frozen_report;
  const prov = core.provenance;
  const def = core.definitions?.evidence_sufficiency;

  return (
    <Section
      id="trust-provenance"
      title={t("report.trust.provenance.heading")}
      lede={t("report.trust.provenance.lede")}
      printOrder={printOrder}
      subordinate
    >
      <div className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-xs)]">
        <Fold
          openLabel={t("report.trust.method.show")}
          closeLabel={t("report.trust.method.hide")}
          triggerClassName="-ml-2"
        >
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-border pt-4 sm:grid-cols-3 lg:grid-cols-4">
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
                  ? [prov.scoring_model_version, prov.signal_version, prov.evidence_state_version]
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
              label={t("report.trust.method.sufficiencyRule")}
              value={def?.rule_version ?? ""}
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
          </dl>
        </Fold>
      </div>
    </Section>
  );
}
