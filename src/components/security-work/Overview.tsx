import { Link } from "@tanstack/react-router";
import { ArrowRight, Bell, FileText, Radio, Settings2, ShieldCheck } from "lucide-react";
import { Group } from "@/components/professional-identity/home-primitives";
import { AssistanceStatus } from "./AssistanceStatus";
import { useT } from "@/i18n/context";
import { useSecurityWorkspace } from "./context";
import { usePortfolio, useWorkText, WorkStatus } from "./analysis-ui";
import { LoadingState, PageHeading, WorkButton, WorkError, formatDate, panelClass } from "./ui";

/** The career overview's composition and presentational Group are reused;
 * all information and authorization come from this Security Work workspace. */
export function SecurityOverview() {
  const { lang } = useT();
  const l = useWorkText();
  const { workspace, profile, counts, canEdit } = useSecurityWorkspace();
  const portfolio = usePortfolio();
  const params = { workspaceId: workspace.id };
  const ongoing =
    portfolio.data?.analyses.filter((analysis) =>
      ["draft", "in_review"].includes(analysis.status),
    ) ?? [];
  const actions =
    portfolio.data?.actions
      .filter((action) => ["open", "in_progress", "blocked"].includes(action.status))
      .sort((a, b) => {
        if ((a.status === "blocked") !== (b.status === "blocked"))
          return a.status === "blocked" ? -1 : 1;
        return (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999");
      }) ?? [];
  const reports = portfolio.data?.reports.slice(0, 3) ?? [];
  const firstVisit =
    portfolio.data && portfolio.data.analyses.length === 0 && portfolio.data.reports.length === 0;
  return (
    <>
      <PageHeading
        title={l("Mitt säkerhetsarbete", "My Security Work")}
        body={l(
          "Samla underlag, strukturera bedömningar och följ upp åtgärder för säkerhet, risk och beredskap.",
          "Collect evidence, structure assessments and follow up actions for security, risk and preparedness.",
        )}
      />
      <div
        className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm"
        data-testid="sw-workspace-identity"
      >
        <p className="min-w-0 break-words">
          <span className="text-muted-foreground">{l("Arbetsyta", "Workspace")}: </span>
          <strong>{workspace.name}</strong>
        </p>
        <Link
          to="/security-work"
          search={{ choose: true }}
          className="inline-flex min-h-11 items-center rounded text-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
        >
          {l("Byt arbetsyta", "Switch workspace")}
        </Link>
      </div>
      {ongoing.length > 0 && (
        <a
          href="#sw-continue-heading"
          className="inline-flex min-h-11 items-center gap-2 rounded text-sm font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
        >
          {l("Till mitt pågående arbete", "Go to my work in progress")}
          <ArrowRight className="size-4" aria-hidden="true" />
        </a>
      )}
      <section aria-labelledby="sw-service-heading" className="space-y-4" data-testid="sw-services">
        <h2 id="sw-service-heading" className="font-display text-xl font-semibold">
          {l("Vad vill du arbeta med?", "What would you like to work on?")}
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          {(
            [
              {
                method: "monitoring",
                icon: Radio,
                title: l("Omvärldsbevakning", "Monitoring"),
                body: l(
                  "Samla och bedöm källunderlag utifrån dina bevakningsfrågor. Bygg en omvärldsanalys och briefing som du kan granska och följa upp.",
                  "Collect and assess source material against your monitoring questions. Build a monitoring analysis and briefing that you can review and follow up.",
                ),
                note: l(
                  "Du registrerar själv källor och underlag. Länkar hämtas inte automatiskt.",
                  "You enter sources and evidence yourself. Links are not fetched automatically.",
                ),
                cta: l("Starta omvärldsanalys", "Start monitoring analysis"),
              },
              {
                method: "rsa",
                icon: ShieldCheck,
                title: l("Riskanalys", "Risk analysis"),
                body: l(
                  "Beskriv verksamheten, hoten och sårbarheterna. Arbeta fram en riskbedömning och en åtgärdsplan med tydligt underlag.",
                  "Describe the organisation, threats and vulnerabilities. Develop a risk assessment and action plan with clear supporting evidence.",
                ),
                note: l(
                  "Risknivåerna bygger på angivna skalor och din bedömning. Du granskar och godkänner rapporten.",
                  "Risk ratings depend on defined scales and your assessment. You review and approve the report.",
                ),
                cta: l("Starta riskanalys", "Start risk analysis"),
              },
            ] as const
          ).map((service) => (
            <article
              key={service.method}
              className={`${panelClass} flex min-w-0 flex-col gap-4`}
              data-testid={`sw-service-${service.method}`}
            >
              <div>
                <h3 className="flex items-center gap-2 text-lg font-semibold">
                  <service.icon className="size-5 shrink-0 text-accent" aria-hidden="true" />
                  {service.title}
                </h3>
                {/* MVP text specification §9.1: one sentence pair per
                    service, then what the service does NOT do. */}
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{service.body}</p>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">{service.note}</p>
              <WorkButton asChild className="mt-auto w-full justify-between">
                <Link
                  to="/security-work/$workspaceId/analyses"
                  params={params}
                  search={canEdit ? { new: true, method: service.method } : { new: false }}
                >
                  {canEdit ? service.cta : l("Visa analyser", "View analyses")}
                  <ArrowRight className="shrink-0" aria-hidden="true" />
                </Link>
              </WorkButton>
            </article>
          ))}
        </div>
        <AssistanceStatus />
      </section>
      <WorkError code={portfolio.error?.message} onRetry={() => void portfolio.refetch()} />
      {portfolio.isPending ? (
        <LoadingState />
      ) : (
        portfolio.data && (
          <>
            <div className="grid items-start gap-8 lg:grid-cols-12">
              <Group
                id="sw-continue"
                title={l("Fortsätt där du slutade", "Continue where you left off")}
                className="min-w-0 lg:col-span-7 [&_h2]:scroll-mt-24"
                data-testid="sw-overview-continue"
              >
                {ongoing.length === 0 ? (
                  <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                    {l(
                      "Inga pågående analyser just nu. Du kan öppna tidigare analyser eller börja en ny.",
                      "No analyses in progress right now. Open a previous analysis or start a new one.",
                    )}
                  </p>
                ) : (
                  <ul className="mt-3 divide-y divide-border">
                    {ongoing.slice(0, 4).map((analysis) => (
                      <li key={analysis.id}>
                        <Link
                          to="/security-work/$workspaceId/analyses/$analysisId"
                          params={{ ...params, analysisId: analysis.id }}
                          className="flex min-h-20 items-center justify-between gap-4 rounded-md py-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                        >
                          <span className="min-w-0">
                            <span className="block break-words font-semibold">
                              {analysis.title}
                            </span>
                            <span className="mt-2 flex flex-wrap items-center gap-2">
                              <WorkStatus status={analysis.status} />
                              <span className="text-xs text-muted-foreground">
                                {l("Senast sparad", "Last saved")}{" "}
                                {formatDate(analysis.updated_at, lang)}
                              </span>
                            </span>
                          </span>
                          <ArrowRight className="size-4 shrink-0 text-accent" aria-hidden="true" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
                {!firstVisit && (
                  <WorkButton asChild variant="ghost" className="mt-3 px-0">
                    <Link
                      to="/security-work/$workspaceId/analyses"
                      params={params}
                      search={{ new: false }}
                    >
                      {l("Alla analyser", "All analyses")}
                      <ArrowRight aria-hidden="true" />
                    </Link>
                  </WorkButton>
                )}
              </Group>
              <Group
                id="sw-attention"
                title={l("Behöver din uppmärksamhet", "Needs your attention")}
                icon={<Bell className="size-5" />}
                className="min-w-0 lg:col-span-5"
                data-testid="sw-overview-attention"
              >
                {counts.pending > 0 && (
                  <Link
                    to="/security-work/$workspaceId/monitoring"
                    params={params}
                    className="mt-4 flex min-h-16 items-center justify-between gap-3 rounded-lg border border-border bg-secondary/30 p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    <span className="text-sm font-medium">
                      <span data-testid="sw-pending-count">{counts.pending}</span>{" "}
                      {l("underlag att granska", "items to review")}
                    </span>
                    <ArrowRight className="size-4 shrink-0 text-accent" aria-hidden="true" />
                  </Link>
                )}
                {actions.length > 0 && (
                  <>
                    <ul className="mt-3 divide-y divide-border">
                      {actions.slice(0, 3).map((action) => (
                        <li key={action.id}>
                          <Link
                            to="/security-work/$workspaceId/risks"
                            params={params}
                            className="block min-h-16 rounded-md py-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                          >
                            <span className="block break-words text-sm font-semibold">
                              {action.title}
                            </span>
                            <span className="mt-2 flex flex-wrap items-center gap-2">
                              <WorkStatus status={action.status} />
                              <span className="text-xs text-muted-foreground">
                                {action.due_date
                                  ? `${l("Följs upp", "Follow up")} ${formatDate(action.due_date, lang)}`
                                  : l("Uppföljningsdatum saknas", "Follow-up date not set")}
                              </span>
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                    <WorkButton asChild variant="ghost" className="px-0">
                      <Link to="/security-work/$workspaceId/risks" params={params}>
                        {l("Risker & åtgärder", "Risks & actions")}
                        <ArrowRight aria-hidden="true" />
                      </Link>
                    </WorkButton>
                  </>
                )}
                {counts.pending === 0 && actions.length === 0 && (
                  <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                    {l(
                      "Inget väntar på granskning eller uppföljning just nu.",
                      "Nothing is awaiting review or follow-up right now.",
                    )}
                  </p>
                )}
              </Group>
            </div>
            {reports.length > 0 && (
              <Group
                id="sw-recent-reports"
                title={l("Senaste rapporter", "Recent reports")}
                icon={<FileText className="size-5" />}
                data-testid="sw-overview-reports"
              >
                <ul className="mt-3 divide-y divide-border">
                  {reports.map((report) => (
                    <li key={report.id}>
                      <Link
                        to="/security-work/$workspaceId/reports/$reportId"
                        params={{ ...params, reportId: report.id }}
                        className="flex min-h-20 items-center justify-between gap-4 rounded-md py-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      >
                        <span className="min-w-0">
                          <span className="block break-words font-semibold">{report.title}</span>
                          <span className="mt-2 flex flex-wrap items-center gap-2">
                            <WorkStatus status={report.status} />
                            <span className="text-xs text-muted-foreground">
                              {formatDate(report.approved_at ?? report.updated_at, lang)}
                            </span>
                          </span>
                        </span>
                        <ArrowRight className="size-4 shrink-0 text-accent" aria-hidden="true" />
                      </Link>
                    </li>
                  ))}
                </ul>
                <WorkButton asChild variant="ghost" className="mt-2 px-0">
                  <Link to="/security-work/$workspaceId/reports" params={params}>
                    {l("Alla rapporter", "All reports")}
                    <ArrowRight aria-hidden="true" />
                  </Link>
                </WorkButton>
              </Group>
            )}
          </>
        )
      )}
      <section className="flex flex-col justify-between gap-3 border-t border-border pt-5 sm:flex-row sm:items-center">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Settings2 className="size-4 text-accent" aria-hidden="true" />
            {l("Verksamhetsprofil & inställningar", "Organisation context & settings")}
          </h2>
          <p className="mt-1 break-words text-sm text-muted-foreground">
            {profile?.sector ||
              l(
                "Samla det sammanhang som flera analyser behöver.",
                "Keep the context that several analyses need in one place.",
              )}
          </p>
        </div>
        <WorkButton asChild variant="outline">
          <Link to="/security-work/$workspaceId/settings" params={params}>
            {l("Öppna inställningar", "Open settings")}
          </Link>
        </WorkButton>
      </section>
    </>
  );
}
