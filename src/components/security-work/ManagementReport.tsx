import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Printer } from "lucide-react";
import { useT } from "@/i18n/context";
import {
  REPORT_SECTIONS,
  REPORT_SECTION_TITLES,
  computedSummaryLines,
  narrativeSchema,
  type ReportComputed,
  type ReportDecision,
  type ReportFacts,
  type ReportNarrative,
  type ReportSectionId,
} from "@/lib/security-work/programme/management-report";
import {
  decideSecurityManagementReport,
  saveSecurityManagementReport,
} from "@/lib/security-work/programme/programme.functions";
import { useSecurityWorkspace } from "./context";
import { SaveStatus, WorkStatus, useSavedOperation, useWorkText } from "./analysis-ui";
import { EvidenceLinks, Tag, programmeKey, useProgramme } from "./programme-ui";
import { AssistantButton, useAssistantContext } from "./SecurityAssistant";
import {
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

/**
 * Management report. Three clearly separated layers:
 *   FACTS             frozen records (titles, statuses, dates)
 *   SYSTEM-CALCULATED deterministic values from the programme rules
 *   NARRATIVE         user text, or AI draft approved by the user (marked)
 * Approval requires an approver and an executive position.
 */
export function SecurityManagementReportPage({ reportId }: { reportId: string }) {
  const { t, lang } = useT();
  const l = useWorkText();
  const { workspace, user, canEdit, membership } = useSecurityWorkspace();
  const programme = useProgramme();
  const queryClient = useQueryClient();
  const save = useServerFn(saveSecurityManagementReport);
  const decide = useServerFn(decideSecurityManagementReport);
  const op = useSavedOperation();
  const report = programme.data?.managementReports.find((row) => row.id === reportId) ?? null;
  const [title, setTitle] = useState("");
  const [narrative, setNarrative] = useState<ReportNarrative>({});
  const [decisions, setDecisions] = useState<ReportDecision[]>([]);
  const [loaded, setLoaded] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const clearWarning = useUnsavedWarning(dirty);
  useEffect(() => {
    if (report && report.version !== loaded && !dirty) {
      setTitle(report.title);
      const parsed = narrativeSchema.safeParse(report.narrative);
      setNarrative(parsed.success ? parsed.data : {});
      setDecisions(
        Array.isArray(report.decisions_required)
          ? (report.decisions_required as ReportDecision[])
          : [],
      );
      setLoaded(report.version);
    }
  }, [report, loaded, dirty]);
  useAssistantContext({
    kind: "management_report",
    id: report?.id ?? null,
    title: report?.title ?? l("Ledningsrapport", "Management report"),
    apply: report ? { reportId: report.id, reportVersion: report.version } : undefined,
  });
  if (programme.isPending) return <LoadingState />;
  if (programme.isError || !programme.data)
    return (
      <WorkError
        code={programme.error?.message ?? "SAVE_FAILED"}
        onRetry={() => void programme.refetch()}
      />
    );
  if (!report) return <WorkError code="ACCESS_DENIED" />;
  const refresh = async () => {
    setDirty(false);
    setLoaded(null);
    await queryClient.invalidateQueries({ queryKey: programmeKey(user.id, workspace.id) });
  };
  const editable = canEdit && report.status === "draft";
  const facts = report.facts as unknown as ReportFacts;
  const computed = report.computed as unknown as ReportComputed;
  const persist = async (refreshData: boolean) => {
    const saved = await op.run(() =>
      save({
        data: {
          workspaceId: workspace.id,
          id: report.id,
          version: report.version,
          title,
          narrative,
          decisions_required: decisions,
          refreshData,
        },
      }),
    );
    if (saved) {
      clearWarning();
      await refresh();
    }
  };
  const setSection = (section: ReportSectionId, text: string) => {
    setNarrative((old) => ({ ...old, [section]: { text, origin: "user" } }));
    setDirty(true);
    op.clear();
  };
  const lines = computed.counts ? computedSummaryLines(computed, lang) : [];
  return (
    <>
      <PageHeading
        title={report.title}
        body={`${l("Ledningsrapport", "Management report")} · v${report.version} · ${formatDate(report.approved_at ?? report.updated_at, lang)}`}
        action={
          <div className="flex flex-wrap gap-2">
            <WorkStatus status={report.status} />
            <WorkButton variant="outline" onClick={() => window.print()}>
              <Printer aria-hidden="true" />
              {l("Skriv ut / PDF", "Print / PDF")}
            </WorkButton>
            <AssistantButton />
          </div>
        }
      />
      <Link
        to="/security-work/$workspaceId/reports"
        params={{ workspaceId: workspace.id }}
        className="inline-flex min-h-11 items-center text-sm text-accent underline-offset-4 hover:underline"
      >
        ← {t("sw.prog.nav.reports")}
      </Link>
      <article className="space-y-6 print:space-y-4" data-testid="sw-management-report">
        {editable && (
          <TextField
            label={l("Titel", "Title")}
            value={title}
            maxLength={500}
            onChange={(e) => {
              setTitle(e.target.value);
              setDirty(true);
            }}
          />
        )}
        <section className={`${panelClass} space-y-2`} data-testid="sw-report-computed">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
            {l("Systemberäknat", "System-calculated")} <Tag>{l("fasta regler", "fixed rules")}</Tag>
          </h2>
          {lines.length ? (
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              {l("Inga beräknade värden än.", "No calculated values yet.")}
            </p>
          )}
          {computed.top_risks?.length > 0 && (
            <p className="text-sm">
              <span className="font-semibold">
                {l("Största risker (S × K)", "Top risks (L × C)")}:{" "}
              </span>
              {computed.top_risks
                .map((risk) => `${risk.title}${risk.score !== null ? ` (${risk.score})` : ""}`)
                .join(" · ")}
            </p>
          )}
          {editable && (
            <WorkButton
              variant="outline"
              className="min-h-10"
              disabled={op.state === "saving"}
              onClick={() => void persist(true)}
            >
              {l("Uppdatera fakta och beräkningar", "Refresh facts and calculations")}
            </WorkButton>
          )}
        </section>
        <section className={`${panelClass} space-y-3`} data-testid="sw-report-facts">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
            {l("Fakta", "Facts")} <Tag>{l("frysta poster", "frozen records")}</Tag>
          </h2>
          <p className="text-xs text-muted-foreground">
            {l("Ögonblicksbild", "Snapshot")}:{" "}
            {facts.generated_at ? formatDate(facts.generated_at, lang, true) : "—"}
          </p>
          <div className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <h3 className="font-semibold">
                {l("Risker", "Risks")} ({facts.risks?.length ?? 0})
              </h3>
              <ul className="list-disc pl-5">
                {(facts.risks ?? []).slice(0, 10).map((risk) => (
                  <li key={risk.id}>
                    {risk.title} · {risk.status}
                    {risk.likelihood !== null &&
                      risk.consequence !== null &&
                      ` · S${risk.likelihood}/K${risk.consequence}`}
                    {!risk.owner && ` · ${t("sw.prog.owner.unassigned")}`}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="font-semibold">
                {l("Öppna åtgärder", "Open actions")} ({facts.actions?.length ?? 0})
              </h3>
              <ul className="list-disc pl-5">
                {(facts.actions ?? []).slice(0, 10).map((action) => (
                  <li key={action.id}>
                    {action.title} · {action.priority} · {action.due_date ?? "—"}
                    {action.overdue && ` · ${l("försenad", "overdue")}`}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="font-semibold">
                {l("Öppna gap", "Open gaps")} ({facts.gaps?.length ?? 0})
              </h3>
              <ul className="list-disc pl-5">
                {(facts.gaps ?? []).slice(0, 10).map((gap) => (
                  <li key={gap.id}>
                    {gap.title} · {gap.impact}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="font-semibold">
                {l("Skyddsvärden", "Protected assets")} ({facts.assets?.length ?? 0})
              </h3>
              <p className="text-muted-foreground">
                {l("Bevakning", "Monitoring")}: {facts.monitoring?.pending_items ?? 0}{" "}
                {l("obedömda underlag", "unassessed findings")}
              </p>
            </div>
          </div>
        </section>
        <section className="space-y-4" data-testid="sw-report-narrative">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
            {l("Berättelse", "Narrative")}{" "}
            <Tag tone="warn">
              {l(
                "skriven av människa eller AI-utkast som du godkänt",
                "written by a human or an AI draft you approved",
              )}
            </Tag>
          </h2>
          {REPORT_SECTIONS.map((section) => {
            const value = narrative[section];
            return (
              <div key={section} className="space-y-1">
                {editable ? (
                  <TextAreaField
                    label={`${REPORT_SECTION_TITLES[section][lang]}${section === "executive_position" ? " *" : ""}`}
                    hint={
                      value?.origin === "ai"
                        ? l(
                            "AI-utkast godkänt av dig. Redigera för att göra det till din text.",
                            "AI draft approved by you. Edit to make it your own text.",
                          )
                        : undefined
                    }
                    value={value?.text ?? ""}
                    maxLength={16000}
                    onChange={(e) => setSection(section, e.target.value)}
                  />
                ) : (
                  <section>
                    <h3 className="font-semibold">
                      {REPORT_SECTION_TITLES[section][lang]}{" "}
                      {value?.origin === "ai" && (
                        <Tag tone="warn">{l("AI-utkast", "AI draft")}</Tag>
                      )}
                    </h3>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">
                      {value?.text || "—"}
                    </p>
                  </section>
                )}
              </div>
            );
          })}
        </section>
        <section className={`${panelClass} space-y-3`} data-testid="sw-report-decisions">
          <h2 className="font-display text-lg font-semibold">
            {REPORT_SECTION_TITLES.decisions_required[lang]}
          </h2>
          {decisions.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {l("Inga beslut registrerade.", "No decisions recorded.")}
            </p>
          )}
          <ul className="space-y-3">
            {decisions.map((decision, index) => (
              <li key={decision.id} className="space-y-2 rounded-lg border border-border p-3">
                {editable ? (
                  <>
                    <TextField
                      label={`${l("Beslut", "Decision")} ${index + 1}`}
                      value={decision.title}
                      maxLength={500}
                      onChange={(e) => {
                        setDecisions((old) =>
                          old.map((row, i) =>
                            i === index ? { ...row, title: e.target.value } : row,
                          ),
                        );
                        setDirty(true);
                      }}
                    />
                    <TextAreaField
                      label={l("Motivering", "Rationale")}
                      value={decision.rationale}
                      maxLength={4000}
                      onChange={(e) => {
                        setDecisions((old) =>
                          old.map((row, i) =>
                            i === index ? { ...row, rationale: e.target.value } : row,
                          ),
                        );
                        setDirty(true);
                      }}
                    />
                    <WorkButton
                      variant="ghost"
                      className="min-h-10"
                      onClick={() => {
                        setDecisions((old) => old.filter((_, i) => i !== index));
                        setDirty(true);
                      }}
                    >
                      {l("Ta bort", "Remove")}
                    </WorkButton>
                  </>
                ) : (
                  <>
                    <p className="font-semibold">{decision.title}</p>
                    <p className="text-sm text-muted-foreground">{decision.rationale}</p>
                  </>
                )}
              </li>
            ))}
          </ul>
          {editable && (
            <WorkButton
              variant="outline"
              className="min-h-10"
              onClick={() => {
                setDecisions((old) => [
                  ...old,
                  { id: crypto.randomUUID(), title: "", rationale: "", status: "open" },
                ]);
                setDirty(true);
              }}
            >
              {l("Lägg till beslut", "Add decision")}
            </WorkButton>
          )}
        </section>
        <EvidenceLinks
          targetKind="management_report"
          targetId={report.id}
          links={programme.data.evidenceLinks}
          onChanged={() => void refresh()}
        />
      </article>
      <WorkError
        code={op.error}
        onRetry={op.error === "CONFLICT" ? () => window.location.reload() : undefined}
      />
      {canEdit && (
        <div className="flex flex-wrap items-center gap-3 print:hidden">
          {editable && (
            <WorkButton
              disabled={op.state === "saving" || !dirty}
              onClick={() => void persist(false)}
            >
              {l("Spara utkast", "Save draft")}
            </WorkButton>
          )}
          {editable && membership.can_approve && (
            <WorkButton
              variant="outline"
              disabled={op.state === "saving" || dirty || !narrative.executive_position?.text}
              onClick={async () => {
                const saved = await op.run(() =>
                  decide({
                    data: {
                      workspaceId: workspace.id,
                      id: report.id,
                      version: report.version,
                      status: "approved",
                    },
                  }),
                );
                if (saved) await refresh();
              }}
              data-testid="sw-report-approve"
            >
              {l("Godkänn rapporten", "Approve the report")}
            </WorkButton>
          )}
          {report.status === "approved" && membership.can_approve && (
            <WorkButton
              variant="ghost"
              disabled={op.state === "saving"}
              onClick={async () => {
                const saved = await op.run(() =>
                  decide({
                    data: {
                      workspaceId: workspace.id,
                      id: report.id,
                      version: report.version,
                      status: "archived",
                    },
                  }),
                );
                if (saved) await refresh();
              }}
            >
              {l("Arkivera", "Archive")}
            </WorkButton>
          )}
          <SaveStatus state={op.state} />
          {editable && !membership.can_approve && (
            <span className="text-sm text-muted-foreground">
              {l(
                "Godkännande kräver godkännanderätt i arbetsytan.",
                "Approval requires the approver right in the workspace.",
              )}
            </span>
          )}
        </div>
      )}
    </>
  );
}
