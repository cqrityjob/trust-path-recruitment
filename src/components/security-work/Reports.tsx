import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useT } from "@/i18n/context";
import {
  approveWorkReport,
  exportWorkReport,
  getWorkReport,
  previewWorkReport,
  saveWorkReport,
} from "@/lib/security-work/analysis.functions";
import { reportSections } from "@/lib/security-work/analysis-model";
import {
  downloadReport,
  frozenRiskColour,
  frozenReportSections,
  reportBundleSchema,
  reportHtml,
  type ReportBundle,
} from "@/lib/security-work/report-export";
import { securityWorkKeys } from "@/lib/security-work/query-keys";
import { useSecurityWorkspace } from "./context";
import {
  EmptyState,
  LoadingState,
  PageHeading,
  TextAreaField,
  TextField,
  WorkButton,
  WorkError,
  formatDate,
  panelClass,
  useUnsavedWarning,
} from "./ui";
import {
  RiskRating,
  SaveStatus,
  WorkStatus,
  usePortfolio,
  useSavedOperation,
  useWorkText,
} from "./analysis-ui";
import { CitationEditor } from "./Citations";

export function SecurityReports() {
  const l = useWorkText();
  const { lang } = useT();
  const { workspace } = useSecurityWorkspace();
  const query = usePortfolio();
  return (
    <>
      <PageHeading
        title={l("Rapporter", "Reports")}
        body={l(
          "Utkast och godkända versioner, samlade med sina analyser.",
          "Drafts and approved versions, linked to their analyses.",
        )}
      />
      {query.isPending ? (
        <LoadingState />
      ) : query.isError ? (
        <WorkError code={query.error.message} onRetry={() => void query.refetch()} />
      ) : !query.data?.reports.length ? (
        <EmptyState
          title={l(
            "Din första rapport börjar med en analys",
            "Your first report starts with an analysis",
          )}
          body={l(
            "Granska underlaget och skriv bedömningen. Rapporten får en disposition som följer vald metod.",
            "Review the evidence and write the assessment. The report structure follows your chosen method.",
          )}
        >
          <WorkButton asChild>
            <Link to="/security-work/$workspaceId/analyses" params={{ workspaceId: workspace.id }}>
              {l("Öppna Analyser", "Open Analyses")}
            </Link>
          </WorkButton>
        </EmptyState>
      ) : (
        <section className={panelClass}>
          <ul className="divide-y divide-border">
            {query.data.reports.map((report) => (
              <li
                key={report.id}
                className="flex flex-wrap items-center justify-between gap-3 py-4"
              >
                <div>
                  <Link
                    to="/security-work/$workspaceId/reports/$reportId"
                    params={{ workspaceId: workspace.id, reportId: report.id }}
                    className="inline-flex min-h-11 items-center font-semibold text-accent"
                  >
                    {report.title}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    v{report.version} · {formatDate(report.updated_at, lang)}
                  </p>
                </div>
                <WorkStatus status={report.status} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
function BundleView({ bundle }: { bundle: ReportBundle }) {
  const l = useWorkText();
  const { lang } = useT();
  return (
    <article className={`${panelClass} space-y-7`} data-testid="sw-report-content">
      <header>
        <p className="text-sm text-muted-foreground">
          {bundle.assessment.method_version_id} · {bundle.assessment.horizon}
        </p>
        <h2 className="mt-2 font-display text-2xl font-semibold">{bundle.report.title}</h2>
        <p className="mt-3 whitespace-pre-wrap text-sm">{bundle.assessment.purpose}</p>
      </header>
      {frozenReportSections(bundle).map(([key, sv, en]) => (
        <section key={key}>
          <h3 className="font-display text-xl font-semibold">{lang === "sv" ? sv : en}</h3>
          <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed">
            {String(bundle.report.sections[key] ?? bundle.report[key] ?? "")}
          </p>
        </section>
      ))}
      <section>
        <h3 className="text-lg font-semibold">{l("Osäkerhet", "Uncertainty")}</h3>
        <p className="mt-3 whitespace-pre-wrap text-sm">
          {bundle.report.uncertainty || l("Ingen osäkerhet angiven", "No uncertainty stated")}
        </p>
      </section>
      <section>
        <h3 className="text-lg font-semibold">{l("Bedömda risker", "Assessed risks")}</h3>
        {bundle.risks.map((risk) => (
          <div key={risk.id} className="mt-4 space-y-2">
            <h4 className="font-semibold">{risk.title}</h4>
            <RiskRating
              likelihood={risk.likelihood}
              consequence={risk.consequence}
              colourOverride={frozenRiskColour(bundle, risk.likelihood, risk.consequence)}
            />
            <p className="whitespace-pre-wrap text-sm">{risk.description}</p>
            <p className="whitespace-pre-wrap text-sm">{risk.decision_rationale}</p>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">{risk.uncertainty}</p>
          </div>
        ))}
      </section>
      <section>
        <h3 className="text-lg font-semibold">
          {l("Åtgärder i denna version", "Actions in this version")}
        </h3>
        {bundle.actions.map((action) => (
          <div key={action.id} className="mt-4 space-y-2">
            <h4 className="font-semibold">{action.title}</h4>
            <p className="whitespace-pre-wrap text-sm">{action.description}</p>
            <WorkStatus status={action.status} />
            <p className="text-sm">{action.due_date ?? l("Datum saknas", "No due date")}</p>
            <p className="text-sm">{action.decision_rationale}</p>
          </div>
        ))}
      </section>
      <section>
        <h3 className="text-lg font-semibold">{l("Källhänvisningar", "Citations")}</h3>
        {bundle.citations.map((citation) => (
          <div key={citation.id} className="mt-5 border-l-2 border-border pl-4">
            <p className="font-medium">{citation.claim}</p>
            <blockquote className="mt-2 whitespace-pre-wrap break-words text-sm">
              {citation.excerpt}
            </blockquote>
            <p className="mt-2 text-xs text-muted-foreground">
              {
                bundle.sources.find((source) => source.id === citation.source_item_id)
                  ?.original_title
              }{" "}
              · {citation.locator}
            </p>
          </div>
        ))}
      </section>
      <details>
        <summary className="min-h-11 cursor-pointer py-3 font-semibold">
          {l("Granska sparade underlag", "Inspect saved evidence")}
        </summary>
        {bundle.sources.map((source) => (
          <article key={source.id} className="mt-4">
            <h4 className="font-semibold">{source.original_title}</h4>
            <p className="text-xs text-muted-foreground">
              {source.publisher} ·{" "}
              {source.published_at ?? l("Publiceringsdatum saknas", "Publication date unknown")}
            </p>
            <p className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words text-sm">
              {source.factual_extract}
            </p>
          </article>
        ))}
      </details>
    </article>
  );
}
export function SecurityReportDetail({ reportId }: { reportId: string }) {
  const l = useWorkText();
  const { lang } = useT();
  const { workspace, user, canEdit, membership, deny } = useSecurityWorkspace();
  const read = useServerFn(getWorkReport);
  const save = useServerFn(saveWorkReport);
  const preview = useServerFn(previewWorkReport);
  const approve = useServerFn(approveWorkReport);
  const exportReport = useServerFn(exportWorkReport);
  const op = useSavedOperation();
  const query = useQuery({
    queryKey: [...securityWorkKeys.workspace(user.id, workspace.id), "report", reportId],
    retry: false,
    queryFn: async () => {
      const r = await read({ data: { workspaceId: workspace.id, id: reportId } });
      if (!r.ok) throw new Error(r.code);
      return r.data;
    },
  });
  const [title, setTitle] = useState("");
  const [sections, setSections] = useState<Record<string, string>>({});
  const [uncertainty, setUncertainty] = useState("");
  const [dirty, setDirty] = useState(false);
  const [baseVersion, setBaseVersion] = useState<number | null>(null);
  const [previewed, setPreviewed] = useState<{ bundle: ReportBundle; hash: string } | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [exportId, setExportId] = useState(() => crypto.randomUUID());
  useUnsavedWarning(dirty);
  useEffect(() => {
    if (query.data && !dirty) {
      const r = query.data.report;
      setBaseVersion(r.version);
      setTitle(r.title);
      setSections(r.sections as Record<string, string>);
      setUncertainty(r.uncertainty);
    }
  }, [query.data, dirty]);
  useEffect(() => {
    if (query.error?.message === "ACCESS_DENIED") deny();
  }, [query.error]);
  if (query.isPending) return <LoadingState />;
  if ((!query.data && query.isError) || !query.data || query.error?.message === "ACCESS_DENIED")
    return (
      <WorkError
        code={query.error?.message ?? "SAVE_FAILED"}
        onRetry={() => void query.refetch()}
      />
    );
  const { report, detail, approval, citations } = query.data;
  const type = detail.analysis.analysis_type as keyof typeof reportSections;
  const editable = canEdit && report.status === "draft";
  const approvedBundle = approval ? reportBundleSchema.safeParse(approval.bundle) : null;
  const changed = () => {
    setDirty(true);
    setPreviewed(null);
    setConfirmed(false);
    op.clear();
  };
  return (
    <>
      <PageHeading
        title={report.title}
        body={`${l("Version", "Version")} ${report.version} · ${formatDate(report.updated_at, lang)}`}
        action={<WorkStatus status={report.status} />}
      />
      <WorkButton asChild variant="outline">
        <Link
          to="/security-work/$workspaceId/analyses/$analysisId"
          params={{ workspaceId: workspace.id, analysisId: report.assessment_id }}
        >
          {l("Till analysen", "Back to analysis")}
        </Link>
      </WorkButton>
      <WorkError
        code={op.error}
        onRetry={
          op.error === "CONFLICT"
            ? () => {
                setPreviewed(null);
                setConfirmed(false);
                setDirty(false);
                void query.refetch();
              }
            : undefined
        }
      />
      {approval && approvedBundle?.success ? (
        <>
          <p role="status" className="rounded-lg bg-secondary p-4 text-sm">
            {l(
              "Denna godkända version är oföränderlig. Skapa ett nytt revisionsutkast från analysen om något behöver ändras.",
              "This approved version is immutable. Create a new revision draft from the analysis to make changes.",
            )}{" "}
            · {formatDate(approval.approved_at, lang, true)}
          </p>
          <WorkButton
            disabled={op.state === "saving"}
            onClick={async () => {
              const receipt = await op.run(() =>
                exportReport({
                  data: {
                    workspaceId: workspace.id,
                    id: reportId,
                    approvalId: approval.id,
                    requestId: exportId,
                  },
                }),
              );
              if (receipt) {
                const bundle = reportBundleSchema.parse(receipt.bundle);
                downloadReport(reportHtml(bundle, receipt), reportId);
                setExportId(crypto.randomUUID());
              }
            }}
          >
            {l(
              "Exportera rapport (HTML / skriv ut till PDF)",
              "Export report (HTML / print to PDF)",
            )}
          </WorkButton>
          <BundleView bundle={approvedBundle.data} />
        </>
      ) : approval ? (
        <WorkError code="INVALID_INPUT" />
      ) : (
        <>
          {editable && (
            <form
              className={`${panelClass} space-y-5`}
              onSubmit={async (e) => {
                e.preventDefault();
                const result = await op.run(() =>
                  save({
                    data: {
                      workspaceId: workspace.id,
                      id: reportId,
                      assessmentId: report.assessment_id,
                      version: baseVersion,
                      title,
                      language: report.language as "sv" | "en",
                      sections,
                      uncertainty,
                    },
                  }),
                );
                if (result) {
                  setBaseVersion(result.version);
                  setDirty(false);
                  setPreviewed(null);
                  setConfirmed(false);
                }
              }}
            >
              <TextField
                label={l("Rapportens titel", "Report title")}
                value={title}
                required
                maxLength={500}
                onChange={(e) => {
                  setTitle(e.target.value);
                  changed();
                }}
              />
              {reportSections[type].map(([key, sv, en]) => (
                <TextAreaField
                  key={key}
                  label={lang === "sv" ? sv : en}
                  value={sections[key] ?? ""}
                  maxLength={16000}
                  onChange={(e) => {
                    setSections((old) => ({ ...old, [key]: e.target.value }));
                    changed();
                  }}
                />
              ))}
              <TextAreaField
                label={l("Osäkerhet och kvarstående frågor", "Uncertainty and remaining questions")}
                value={uncertainty}
                maxLength={16000}
                onChange={(e) => {
                  setUncertainty(e.target.value);
                  changed();
                }}
              />
              <div className="flex flex-wrap items-center gap-3">
                <WorkButton type="submit" disabled={!dirty || op.state === "saving"}>
                  {l("Spara rapportutkast", "Save report draft")}
                </WorkButton>
                <SaveStatus state={op.state} />
              </div>
            </form>
          )}
          <section className={panelClass}>
            <h2 className="text-xl font-semibold">
              {l("Rapportens källhänvisningar", "Report citations")}
            </h2>
            {citations.map((citation) => (
              <article key={citation.id} className="mt-4">
                <p className="font-medium">{citation.claim}</p>
                <blockquote className="mt-2 whitespace-pre-wrap text-sm">
                  {citation.excerpt}
                </blockquote>
                <p className="text-xs text-muted-foreground">{citation.locator}</p>
              </article>
            ))}
          </section>
          {editable && (
            <CitationEditor
              targetId={reportId}
              targetType="report"
              sources={detail.sourceItems.filter((source) =>
                detail.inputs.some(
                  (input) =>
                    input.source_item_id === source.id && input.review_status === "accepted",
                ),
              )}
            />
          )}
          <WorkButton
            variant="outline"
            disabled={dirty || op.state === "saving"}
            onClick={async () => {
              const result = await op.run(() =>
                preview({
                  data: { workspaceId: workspace.id, id: reportId, version: report.version },
                }),
              );
              if (
                result &&
                typeof result === "object" &&
                !Array.isArray(result) &&
                "bundle" in result &&
                "bundle_hash" in result
              ) {
                setPreviewed({
                  bundle: reportBundleSchema.parse(result.bundle),
                  hash: String(result.bundle_hash),
                });
                setConfirmed(false);
              }
            }}
          >
            {l("Granska version inför godkännande", "Review version for approval")}
          </WorkButton>
          {previewed && (
            <>
              <BundleView bundle={previewed.bundle} />
              {editable && membership.can_approve && (
                <section className={`${panelClass} space-y-4`}>
                  <h2 className="text-xl font-semibold">
                    {l("Godkänn exakt denna version", "Approve this exact version")}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {l(
                      "Rapport, analys, underlag, risker, åtgärder och metodversion låses tillsammans. Om någon ändrat underlaget behöver du granska igen.",
                      "The report, analysis, evidence, risks, actions and method version are frozen together. If evidence changes, you must review again.",
                    )}
                  </p>
                  <label className="flex min-h-11 items-start gap-3 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1 size-5 shrink-0"
                      checked={confirmed}
                      onChange={(e) => setConfirmed(e.target.checked)}
                    />
                    {l(
                      "Jag har granskat rapporten och dess underlag och tar ansvar för bedömningen.",
                      "I have reviewed the report and its evidence and take responsibility for the assessment.",
                    )}
                  </label>
                  <WorkButton
                    disabled={!confirmed || op.state === "saving"}
                    onClick={async () => {
                      const result = await op.run(() =>
                        approve({
                          data: {
                            workspaceId: workspace.id,
                            id: reportId,
                            version: report.version,
                            bundleHash: previewed.hash,
                          },
                        }),
                      );
                      if (result) {
                        setPreviewed(null);
                        setConfirmed(false);
                      }
                    }}
                  >
                    {l("Godkänn rapportversion", "Approve report version")}
                  </WorkButton>
                </section>
              )}
            </>
          )}
        </>
      )}
    </>
  );
}
