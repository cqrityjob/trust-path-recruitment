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
          priority: text.optional(),
          completion_evidence: text.optional(),
        })
        .passthrough(),
    ),
    citations: z.array(
      z
        .object({
          id: text,
          source_item_id: text,
          claim: text,
          excerpt: text,
          locator: text,
          risk_id: text.nullable().optional(),
          report_id: text.nullable().optional(),
          assessment_id: text.nullable().optional(),
        })
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
export function reportDate(value: string | null | undefined, language: "sv" | "en") {
  if (!value) return language === "sv" ? "Datum saknas" : "Date unknown";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat(language === "sv" ? "sv-SE" : "en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}
export function reportStatus(value: string, language: "sv" | "en") {
  const labels: Record<string, [string, string]> = {
    open: ["Öppen", "Open"],
    in_progress: ["Pågår", "In progress"],
    blocked: ["Blockerad", "Blocked"],
    completed: ["Slutförd", "Completed"],
    cancelled: ["Avbruten", "Cancelled"],
    approved: ["Godkänd", "Approved"],
    draft: ["Utkast", "Draft"],
    in_review: ["För granskning", "In review"],
    exported: ["Exporterad", "Exported"],
    archived: ["Arkiverad", "Archived"],
  };
  return labels[value]?.[language === "sv" ? 0 : 1] ?? value;
}
export function reportPriority(value: string | undefined, language: "sv" | "en") {
  const labels: Record<string, [string, string]> = {
    low: ["Låg", "Low"],
    medium: ["Medel", "Medium"],
    high: ["Hög", "High"],
    critical: ["Kritisk", "Critical"],
  };
  return value
    ? (labels[value]?.[language === "sv" ? 0 : 1] ?? value)
    : language === "sv"
      ? "Ej angiven"
      : "Not stated";
}
/** Only explicit target links or a complete matching claim establish proximity.
 * Never infer that a citation supports a different claim from similar words. */
export function citationsForText(bundle: ReportBundle, value: string, riskId?: string) {
  const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
  const body = normalize(value);
  return bundle.citations.filter(
    (citation) =>
      (riskId && citation.risk_id === riskId) ||
      (normalize(citation.claim).length > 0 && body.includes(normalize(citation.claim))),
  );
}
export function reportHtml(
  bundle: ReportBundle,
  approval: { approved_at: string; report_version: number; bundle_hash: string },
) {
  const language = bundle.report.language;
  const sv = language === "sv";
  const l = (a: string, b: string) => (sv ? a : b);
  const missing = l("Ej angivet", "Not stated");
  const p = (value: unknown) => `<p>${escape(value || missing)}</p>`;
  const citationHtml = (citation: ReportBundle["citations"][number]) => {
    const source = bundle.sources.find((row) => row.id === citation.source_item_id);
    const n = bundle.citations.findIndex((row) => row.id === citation.id) + 1;
    return `<aside class="citation"><p><strong>[${n}] ${escape(citation.claim)}</strong></p><blockquote>${escape(citation.excerpt)}</blockquote><small>${escape(source?.original_title || l("Källtitel saknas", "Source title missing"))} · ${escape(source?.publisher || l("Utgivare saknas", "Publisher unknown"))} · ${escape(citation.locator || l("Hänvisning saknas", "Locator unknown"))}<br>${l("Publicerad", "Published")}: ${source?.published_at ? `<time datetime="${escape(source.published_at)}">${escape(reportDate(source.published_at, language))}</time>` : l("Publiceringsdatum saknas", "Publication date unknown")}</small></aside>`;
  };
  const used = new Set<string>();
  const nearby = (body: string, riskId?: string) =>
    citationsForText(bundle, body, riskId)
      .map((citation) => {
        used.add(citation.id);
        return citationHtml(citation);
      })
      .join("");
  const sections = frozenReportSections(bundle)
    .map(([key, swedish, english]) => {
      const body = String(bundle.report.sections[key] ?? bundle.report[key] ?? "");
      return `<section><h2>${escape(l(swedish, english))}</h2>${p(body)}${nearby(body)}</section>`;
    })
    .join("");
  const colours = {
    green: l("Grön", "Green"),
    yellow: l("Gul", "Yellow"),
    orange: l("Orange", "Orange"),
    red: l("Röd", "Red"),
  };
  const risks = bundle.risks
    .map((risk) => {
      const colour = frozenRiskColour(bundle, risk.likelihood, risk.consequence);
      const rating =
        bundle.assessment.analysis_type !== "rsa"
          ? l("Kvalitativ bedömning", "Qualitative assessment")
          : `${colour ? colours[colour] : l("Okänt", "Unknown")} · ${sv ? "S" : "L"} ${risk.likelihood ?? "?"} / ${sv ? "K" : "C"} ${risk.consequence ?? "?"}`;
      return `<article><h3>${escape(risk.title)}</h3><p class="rating${colour ? ` ${colour}` : ""}">${escape(rating)}</p>${p(risk.description)}<p><strong>${l("Motivering", "Rationale")}</strong></p>${p(risk.decision_rationale)}<p><strong>${l("Osäkerhet", "Uncertainty")}</strong></p>${p(risk.uncertainty)}${nearby([risk.description, risk.decision_rationale, risk.uncertainty].join("\n"), risk.id)}</article>`;
    })
    .join("");
  const actionRows = bundle.actions
    .map(
      (action, index) =>
        `<tr><th scope="row">${index + 1}. ${escape(action.title)}</th><td>${escape(reportPriority(action.priority, language))}</td><td>${escape(action.assignee_user_id || l("Ej tilldelad", "Unassigned"))}</td><td>${escape(reportDate(action.due_date, language))}</td><td>${escape(reportStatus(action.status, language))}</td></tr>`,
    )
    .join("");
  const actions = bundle.actions
    .map(
      (action, index) =>
        `<article><h3>${index + 1}. ${escape(action.title)}</h3>${p(action.description)}<p><strong>${l("Beslut och uppföljning", "Decision and follow-up")}</strong></p>${p(action.decision_rationale)}${action.completion_evidence ? `<p><strong>${l("Underlag för slutförande", "Completion evidence")}</strong></p>${p(action.completion_evidence)}` : ""}</article>`,
    )
    .join("");
  const remainingCitations = bundle.citations.filter((citation) => !used.has(citation.id));
  const citedSources = bundle.sources.filter((source) =>
    bundle.citations.some((citation) => citation.source_item_id === source.id),
  );
  return `<!doctype html><html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${escape(bundle.report.title)}</title><style>
body{font:15px/1.55 system-ui,sans-serif;color:#172b35;max-width:850px;margin:40px auto;padding:0 24px}h1{font-size:32px;line-height:1.2}h2{font-size:21px;margin-top:28px}h3{font-size:16px;margin-bottom:8px}p,blockquote{white-space:pre-wrap;overflow-wrap:anywhere;orphans:3;widows:3}small{color:#455a64}h2,h3{break-after:avoid}article{margin:22px 0;break-inside:avoid}blockquote{border-left:3px solid #537c83;padding-left:12px;margin:8px 0}.citation{break-inside:avoid;font-size:.9em;margin:12px 0 20px;padding:10px 14px;background:#f3f6f7;border-left:2px solid #537c83}.citation p{margin:0}.meta{padding:14px 0;border-top:1px solid #d4dce0;border-bottom:1px solid #d4dce0}.meta p{margin:4px 0}.rating{display:inline-block;padding:4px 10px;background:#edf1f3;font-weight:600}.green{background:#dcfce7}.yellow{background:#fef3c7}.orange{background:#ffedd5}.red{background:#fee2e2}table{border-collapse:collapse;table-layout:fixed;width:100%;font-size:12px;margin-top:14px}th,td{padding:8px;text-align:left;vertical-align:top;border:1px solid #c6d2d8;overflow-wrap:anywhere}thead{display:table-header-group;background:#edf1f3}tr{break-inside:avoid}thead th:nth-child(1){width:27%}thead th:nth-child(2){width:11%}thead th:nth-child(3){width:25%}thead th:nth-child(4){width:19%}thead th:nth-child(5){width:18%}thead th{overflow-wrap:normal}footer{break-before:avoid;margin-top:20px;border-top:1px solid #b7c6cd;padding-top:12px;font-size:11px;overflow-wrap:anywhere}.source{break-inside:avoid}.source:last-child{break-after:avoid}section{break-inside:auto}@page{size:A4;margin:18mm;@bottom-right{content:counter(page) " / " counter(pages);font-size:9pt;color:#455a64}}@media print{body{margin:0;padding:0;font-size:10.5pt;max-width:none}h1{font-size:25pt}h2{font-size:16pt}h3{font-size:12pt}.print-hint{display:none}table{font-size:8.5pt}.citation,.rating,thead{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body><p class="print-hint">${l("HTML-rapport. Använd webbläsarens Skriv ut och välj Spara som PDF.", "HTML report. Use your browser's Print command and choose Save as PDF.")}</p><small>CQrityjob · ${l("Mitt säkerhetsarbete", "My Security Work")}</small><h1>${escape(bundle.report.title)}</h1><div class="meta"><p><strong>${l("Godkänd version", "Approved version")} ${escape(approval.report_version)}</strong> · ${l("Status", "Status")}: ${l("Godkänd", "Approved")}</p><p>${l("Godkänd", "Approved")}: <time datetime="${escape(approval.approved_at)}">${escape(reportDate(approval.approved_at, language))}</time> (UTC)</p><p>${l("Metod", "Method")}: ${escape(bundle.assessment.method_version_id)} · ${l("Rapportmall", "Report template")}: ${escape(bundle.template.id)}</p><p>${l("Tidshorisont", "Time horizon")}: ${escape(bundle.assessment.horizon || missing)}</p></div><section><h2>${l("Uppdrag", "Assignment")}</h2><p><strong>${l("Syfte", "Purpose")}</strong></p>${p(bundle.assessment.purpose)}<p><strong>${l("Omfattning", "Scope")}</strong></p>${p(bundle.assessment.scope)}</section>${sections}<section><h2>${l("Osäkerhet och kvarstående frågor", "Uncertainty and remaining questions")}</h2>${p(bundle.report.uncertainty)}<p>${l("Saknat underlag innebär inte låg risk. Riskvärden och åtgärder är mänskliga bedömningar i denna godkända version.", "Missing evidence does not mean low risk. Risk ratings and actions are human judgements in this approved version.")}</p></section><section><h2>${l("Risker", "Risks")}</h2>${risks || p(l("Inga riskposter ingår i denna version.", "No risk records are included in this version."))}</section><section><h2>${l("Åtgärder vid godkännandet", "Actions at approval")}</h2>${bundle.actions.length ? `<p>${l("Ansvarig visas som det konto-ID som sparades vid godkännandet. Ingen person eller prioritet har lagts till i efterhand.", "The owner is shown by the account ID saved at approval. No person or priority has been added afterwards.")}</p><table aria-label="${l("Åtgärdsöversikt", "Action overview")}"><thead><tr><th>${l("Åtgärd", "Action")}</th><th>${l("Prioritet", "Priority")}</th><th>${l("Ansvarig (konto-ID)", "Owner (account ID)")}</th><th>${l("Följ upp senast", "Due date")}</th><th>Status</th></tr></thead><tbody>${actionRows}</tbody></table>${actions}` : p(l("Inga åtgärder ingår i denna version.", "No actions are included in this version."))}</section>${remainingCitations.length ? `<section><h2>${l("Övriga källhänvisningar", "Other citations")}</h2><p>${l("Dessa sparade hänvisningar kunde inte kopplas till ett ordagrant påstående i avsnitten ovan. Inget ytterligare källstöd har antagits.", "These saved citations could not be placed beside a verbatim statement above. No additional source support has been inferred.")}</p>${remainingCitations.map(citationHtml).join("")}</section>` : ""}<section><h2>${l("Källförteckning", "Source register")}</h2>${citedSources.map((source) => `<article class="source"><h3>${escape(source.original_title)}</h3><p>${escape(source.publisher || l("Utgivare saknas", "Publisher unknown"))}<br>${l("Publicerad", "Published")}: ${escape(source.published_at ? reportDate(source.published_at, language) : l("Publiceringsdatum saknas", "Publication date unknown"))}${source.retrieved_at ? `<br>${l("Registrerad", "Recorded")}: ${escape(reportDate(source.retrieved_at, language))}` : ""}</p></article>`).join("")}</section><footer>${l("Oföränderlig godkänd rapport. Aktuell åtgärdsstatus kan ha ändrats efter godkännandet.", "Immutable approved report. Current action status may have changed since approval.")}<br>${escape(bundle.report.id)} · SHA-256 ${escape(approval.bundle_hash)}</footer></body></html>`;
}
export function downloadReport(html: string, reportId: string) {
  const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `security-report-${reportId}.html`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
