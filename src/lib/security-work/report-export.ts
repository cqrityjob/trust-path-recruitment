import { z } from "zod";
import { reportSections, type RiskColour } from "./analysis-model";

const text = z.string();
export const reportBundleSchema = z
  .object({
    formatVersion: z.literal(1),
    method: z
      .object({
        id: text,
        definition: z
          .object({
            matrix: z
              .array(z.array(z.enum(["green", "yellow", "orange", "red"])).length(5))
              .length(5)
              .optional(),
          })
          .passthrough(),
      })
      .passthrough(),
    template: z.object({ id: text, required_sections: z.array(text).min(1).max(20) }).passthrough(),
    report: z
      .object({
        id: text,
        workspace_id: text,
        title: text,
        version: z.number(),
        status: text,
        language: z.enum(["sv", "en"]),
        sections: z.record(text),
        uncertainty: text,
      })
      .passthrough(),
    assessment: z
      .object({
        id: text,
        title: text,
        analysis_type: z.enum(["rsa", "monitoring", "legacy_security"]),
        method_version_id: text,
        horizon: text,
        purpose: text,
        scope: text,
      })
      .passthrough(),
    risks: z.array(
      z
        .object({
          id: text,
          title: text,
          description: text,
          likelihood: z.number().nullable(),
          consequence: z.number().nullable(),
          uncertainty: text,
          decision_rationale: text,
        })
        .passthrough(),
    ),
    actions: z.array(
      z
        .object({
          id: text,
          title: text,
          description: text,
          status: text,
          due_date: text.nullable(),
          assignee_user_id: text.nullable(),
          decision_rationale: text,
        })
        .passthrough(),
    ),
    citations: z.array(
      z
        .object({ id: text, source_item_id: text, claim: text, excerpt: text, locator: text })
        .passthrough(),
    ),
    sources: z.array(
      z
        .object({
          id: text,
          original_title: text,
          publisher: text,
          published_at: text.nullable(),
          retrieved_at: text.nullable().optional(),
          factual_extract: text,
        })
        .passthrough(),
    ),
  })
  .passthrough();
export type ReportBundle = z.infer<typeof reportBundleSchema>;
export function frozenRiskColour(
  bundle: ReportBundle,
  likelihood: number | null,
  consequence: number | null,
): RiskColour | null {
  if (
    bundle.assessment.analysis_type !== "rsa" ||
    likelihood === null ||
    consequence === null ||
    !Number.isInteger(likelihood) ||
    !Number.isInteger(consequence) ||
    likelihood < 1 ||
    likelihood > 5 ||
    consequence < 1 ||
    consequence > 5
  )
    return null;
  return bundle.method.definition.matrix?.[likelihood - 1]?.[consequence - 1] ?? null;
}
export function frozenReportSections(bundle: ReportBundle): [string, string, string][] {
  return bundle.template.required_sections.map((key) => {
    const label = reportSections[bundle.assessment.analysis_type].find(
      (section) => section[0] === key,
    );
    return [key, label?.[1] ?? key, label?.[2] ?? key];
  });
}
const escape = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
export function reportHtml(
  bundle: ReportBundle,
  approval: { approved_at: string; report_version: number; bundle_hash: string },
) {
  const sv = bundle.report.language === "sv";
  const l = (a: string, b: string) => (sv ? a : b);
  const sections = frozenReportSections(bundle)
    .map(
      ([key, swedish, english]) =>
        `<section><h2>${escape(l(swedish, english))}</h2><p>${escape(bundle.report.sections[key] ?? bundle.report[key] ?? "")}</p></section>`,
    )
    .join("");
  return `<!doctype html><html lang="${sv ? "sv" : "en"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${escape(bundle.report.title)}</title><style>body{font:15px/1.6 system-ui,sans-serif;color:#172b35;max-width:850px;margin:40px auto;padding:0 24px}h1{font-size:32px;line-height:1.2}h2{font-size:21px;margin-top:30px}p,blockquote{white-space:pre-wrap;overflow-wrap:anywhere}small{color:#455a64}section{break-inside:auto}h2,h3{break-after:avoid}blockquote{border-left:3px solid #537c83;padding-left:16px}article{margin:20px 0}footer{margin-top:40px;border-top:1px solid #ccc;padding-top:16px;font-size:11px;overflow-wrap:anywhere}@page{size:A4;margin:18mm}@media print{body{margin:0;padding:0;font-size:11pt}.print-hint{display:none}}</style></head><body><p class="print-hint">${l("Använd webbläsarens Skriv ut och välj Spara som PDF.", "Use your browser's Print command and choose Save as PDF.")}</p><small>CQrityjob · ${l("Mitt säkerhetsarbete", "My Security Work")}</small><h1>${escape(bundle.report.title)}</h1><p>${l("Godkänd version", "Approved version")} ${approval.report_version} · ${escape(approval.approved_at)}</p><p>${l("Metod", "Method")}: ${escape(bundle.assessment.method_version_id)}<br>${l("Tidshorisont", "Time horizon")}: ${escape(bundle.assessment.horizon)}</p>${sections}<section><h2>${l("Osäkerhet", "Uncertainty")}</h2><p>${escape(bundle.report.uncertainty)}</p></section><section><h2>${l("Risker", "Risks")}</h2>${bundle.risks.map((r) => `<article><h3>${escape(r.title)}</h3><p>${escape(r.description)}</p><p>${escape(frozenRiskColour(bundle, r.likelihood, r.consequence) ?? l("Okänt", "Unknown"))} · S ${escape(r.likelihood ?? "?")} / K ${escape(r.consequence ?? "?")}</p><p>${escape(r.decision_rationale)}</p><p>${escape(r.uncertainty)}</p></article>`).join("")}</section><section><h2>${l("Åtgärder vid godkännandet", "Actions at approval")}</h2>${bundle.actions.map((a) => `<article><h3>${escape(a.title)}</h3><p>${escape(a.description)}</p><p>${escape(a.status)} · ${escape(a.due_date ?? l("Datum saknas", "No due date"))}</p><p>${escape(a.decision_rationale)}</p></article>`).join("")}</section><section><h2>${l("Källhänvisningar", "Citations")}</h2>${bundle.citations
    .map((c) => {
      const s = bundle.sources.find((source) => source.id === c.source_item_id);
      return `<article><p><strong>${escape(c.claim)}</strong></p><blockquote>${escape(c.excerpt)}</blockquote><small>${escape(s?.original_title)} · ${escape(s?.publisher)} · ${escape(c.locator)} · ${escape(s?.published_at ?? l("Publiceringsdatum saknas", "Publication date unknown"))}</small></article>`;
    })
    .join(
      "",
    )}</section><footer>${l("Oföränderlig godkänd rapport. Aktuell åtgärdsstatus kan ha ändrats efter godkännandet.", "Immutable approved report. Current action status may have changed since approval.")}<br>${escape(bundle.report.id)} · SHA-256 ${escape(approval.bundle_hash)}</footer></body></html>`;
}
export function downloadReport(html: string, reportId: string) {
  const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `security-report-${reportId}.html`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
