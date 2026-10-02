import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Bell,
  BookOpen,
  ClipboardList,
  FileText,
  ListChecks,
  Radio,
  Settings2,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { Group } from "@/components/professional-identity/home-primitives";
import { useT } from "@/i18n/context";
import {
  PROGRAMME_AREAS,
  attentionItems,
  programmeStatus,
  recommendedNextAction,
} from "@/lib/security-work/programme/rules";
import type { ProgrammeAreaId } from "@/lib/security-work/programme/types";
import { useSecurityWorkspace } from "./context";
import { usePortfolio, useWorkText, WorkStatus } from "./analysis-ui";
import { AREA_ROUTES, AreaStatus, useProgramme } from "./programme-ui";
import { AssistantButton, useAssistantContext } from "./SecurityAssistant";
import { LoadingState, PageHeading, WorkButton, WorkError, formatDate, panelClass } from "./ui";

/**
 * The Security Command Center. Answers, in order: where are we now
 * (programme status), what requires attention, what to do next and why, what
 * was I doing, and where can I work directly. Every number comes from the
 * deterministic rules; AI only appears as an assistant you can open.
 */
export function SecurityOverview() {
  const { t, lang } = useT();
  const l = useWorkText();
  const { workspace, canEdit, counts } = useSecurityWorkspace();
  const programme = useProgramme();
  const portfolio = usePortfolio();
  useAssistantContext({ kind: "workspace", id: null, title: workspace.name });
  const params = { workspaceId: workspace.id };
  const facts = programme.data;
  const status = facts ? programmeStatus(facts) : null;
  const attention = facts ? attentionItems(facts) : [];
  const next = facts ? recommendedNextAction(facts) : null;
  const ongoing =
    portfolio.data?.analyses.filter((analysis) =>
      ["draft", "in_review"].includes(analysis.status),
    ) ?? [];
  const draftReports = facts?.managementReports.filter((report) => report.status === "draft") ?? [];
  const ctaFor = (area: ProgrammeAreaId, id: string) => {
    if (id === "monitoring_pending")
      return {
        to: "/security-work/$workspaceId/monitoring",
        label: t("sw.prog.attention.cta.monitoring"),
      };
    if (id === "analyses_in_review")
      return {
        to: "/security-work/$workspaceId/analyses",
        label: t("sw.prog.attention.cta.analyses"),
      };
    if (["overdue_actions", "high_priority_actions", "actions_without_owner"].includes(id))
      return { to: "/security-work/$workspaceId/risks", label: t("sw.prog.attention.cta.actions") };
    if (["gaps_without_action", "high_impact_gaps"].includes(id))
      return { to: "/security-work/$workspaceId/gaps", label: t("sw.prog.attention.cta.gaps") };
    const labels: Record<ProgrammeAreaId, string> = {
      mandate: t("sw.prog.attention.cta.mandate"),
      assets: t("sw.prog.attention.cta.assets"),
      risks: t("sw.prog.attention.cta.risks"),
      baseline: t("sw.prog.attention.cta.baseline"),
      actions: t("sw.prog.attention.cta.actions"),
      reporting: t("sw.prog.attention.cta.reporting"),
    };
    return { to: AREA_ROUTES[area], label: labels[area] };
  };
  const modules = [
    {
      to: "/security-work/$workspaceId/monitoring",
      icon: Radio,
      title: t("sw.nav.monitoring"),
      body: l(
        "Bevakningsfrågor, källor och underlag att ta ställning till.",
        "Monitoring questions, sources and findings to assess.",
      ),
      count: counts.pending,
    },
    {
      to: "/security-work/$workspaceId/analyses",
      icon: ClipboardList,
      title: t("sw.prog.nav.analyses"),
      body: l(
        "Riskanalyser och omvärldsanalyser med underlag och godkännande.",
        "Risk and monitoring analyses with evidence and approval.",
      ),
      count: ongoing.length,
    },
    {
      to: "/security-work/$workspaceId/risks",
      icon: ListChecks,
      title: t("sw.prog.nav.risks"),
      body: l(
        "Riskregistret och alla åtgärder, oavsett var de kommer ifrån.",
        "The risk register and every action, whatever its source.",
      ),
      count: facts
        ? facts.actions.filter((action) =>
            ["open", "in_progress", "blocked"].includes(action.status),
          ).length
        : 0,
    },
    {
      to: "/security-work/$workspaceId/gaps",
      icon: TriangleAlert,
      title: t("sw.prog.nav.gaps"),
      body: l(
        "Gap från nuläge, risker, bevakning och incidenter – och vad ni gör åt dem.",
        "Gaps from the baseline, risks, monitoring and incidents, and what you do about them.",
      ),
      count: facts
        ? facts.gaps.filter((gap) => ["open", "in_progress"].includes(gap.status)).length
        : 0,
    },
    {
      to: "/security-work/$workspaceId/reports",
      icon: FileText,
      title: t("sw.prog.nav.reports"),
      body: l("Ledningsrapporter och analysrapporter.", "Management reports and analysis reports."),
      count: draftReports.length,
    },
    {
      to: "/security-work/$workspaceId/sources",
      icon: BookOpen,
      title: t("sw.prog.nav.evidence"),
      body: l(
        "Policyer, avtal, foton, incidentrapporter och andra underlag.",
        "Policies, contracts, photos, incident reports and other evidence.",
      ),
      count: 0,
    },
  ] as const;
  return (
    <>
      <PageHeading
        title={t("sw.prog.title")}
        body={t("sw.prog.subtitle")}
        action={<AssistantButton />}
      />
      <div
        className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm"
        data-testid="sw-workspace-identity"
      >
        <p className="min-w-0 break-words">
          <span className="text-muted-foreground">{l("Organisation", "Organisation")}: </span>
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
      <WorkError code={programme.error?.message} onRetry={() => void programme.refetch()} />
      {programme.isPending || !facts || !status || !next ? (
        <LoadingState />
      ) : (
        <>
          <section
            aria-labelledby="sw-status-heading"
            className="space-y-3"
            data-testid="sw-programme-status"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="sw-status-heading" className="font-display text-xl font-semibold">
                {t("sw.prog.status.heading")}
              </h2>
              <p className="text-xs text-muted-foreground">{t("sw.prog.status.rule")}</p>
            </div>
            <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
              {PROGRAMME_AREAS.map((area, index) => (
                <li key={area}>
                  <Link
                    to={AREA_ROUTES[area]}
                    params={params}
                    data-testid={`sw-area-${area}`}
                    data-status={status[area]}
                    className="flex min-h-24 flex-col justify-between gap-2 rounded-xl border border-border bg-card p-3 hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    <span className="text-xs text-muted-foreground">{index + 1}</span>
                    <span className="text-sm font-semibold leading-tight">
                      {t(`sw.prog.area.${area}`)}
                    </span>
                    <AreaStatus status={status[area]} />
                  </Link>
                </li>
              ))}
            </ol>
          </section>
          <div className="grid items-start gap-6 lg:grid-cols-12">
            <section
              aria-labelledby="sw-attention-heading"
              className="space-y-3 lg:col-span-7"
              data-testid="sw-overview-attention"
            >
              <h2
                id="sw-attention-heading"
                className="flex items-center gap-2 font-display text-xl font-semibold"
              >
                <Bell className="size-5 text-accent" aria-hidden="true" />
                {t("sw.prog.attention.heading")}
              </h2>
              {attention.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border bg-secondary/30 p-5 text-sm text-muted-foreground">
                  {t("sw.prog.attention.empty")}
                </p>
              ) : (
                <ul className="space-y-2">
                  {attention.slice(0, 6).map((item) => {
                    const cta = ctaFor(item.area, item.id);
                    return (
                      <li
                        key={item.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4"
                        data-testid={`sw-attention-${item.id}`}
                        data-severity={item.severity}
                      >
                        <span className="flex min-w-0 items-center gap-3 text-sm font-medium">
                          <span
                            className={
                              item.severity === "high"
                                ? "size-2.5 shrink-0 rounded-full bg-red-600"
                                : item.severity === "medium"
                                  ? "size-2.5 shrink-0 rounded-full bg-amber-500"
                                  : "size-2.5 shrink-0 rounded-full bg-sky-500"
                            }
                            aria-hidden="true"
                          />
                          {t(`sw.prog.attention.${item.id}`).replace("{count}", String(item.count))}
                        </span>
                        <WorkButton asChild variant="outline" className="min-h-10">
                          <Link to={cta.to} params={params}>
                            {cta.label}
                            <ArrowRight aria-hidden="true" />
                          </Link>
                        </WorkButton>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
            <section
              aria-labelledby="sw-next-heading"
              className={`${panelClass} space-y-3 lg:col-span-5`}
              data-testid="sw-next-action"
              data-next={next.id}
            >
              <h2
                id="sw-next-heading"
                className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground"
              >
                {t("sw.prog.next.heading")}
              </h2>
              <p className="font-display text-lg font-semibold leading-snug">
                {t(`sw.prog.next.${next.id}`)}
              </p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {t(`sw.prog.next.${next.id}.why`)}
              </p>
              {next.prerequisite && (
                <p className="text-xs text-muted-foreground">{t("sw.prog.next.prerequisite")}</p>
              )}
              <div className="flex flex-wrap gap-2">
                <WorkButton asChild>
                  <Link to={AREA_ROUTES[next.area]} params={params}>
                    {t("sw.prog.next.open")}
                    <ArrowRight aria-hidden="true" />
                  </Link>
                </WorkButton>
                <AssistantButton label={l("Förklara", "Explain")} />
              </div>
            </section>
          </div>
          {canEdit && (!facts.plan || facts.plan.status === "active") && (
            <section
              className="flex flex-col justify-between gap-3 rounded-xl border border-border bg-secondary/30 p-5 sm:flex-row sm:items-center"
              data-testid="sw-plan-cta"
            >
              <div>
                <h2 className="flex items-center gap-2 font-semibold">
                  <Sparkles className="size-4 text-accent" aria-hidden="true" />
                  {facts.plan ? t("sw.prog.nav.plan") : t("sw.prog.plan.cta.title")}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {facts.plan
                    ? `${facts.plan.completed_task_ids.length} ${l("uppgifter klara", "tasks done")} · ${l("startad", "started")} ${formatDate(facts.plan.started_on, lang)}`
                    : t("sw.prog.plan.cta.body")}
                </p>
              </div>
              <WorkButton asChild variant={facts.plan ? "outline" : "default"}>
                <Link to="/security-work/$workspaceId/plan" params={params}>
                  {facts.plan ? t("sw.prog.plan.cta.open") : t("sw.prog.plan.cta.start")}
                </Link>
              </WorkButton>
            </section>
          )}
          {ongoing.length > 0 && (
            <Group
              id="sw-continue"
              title={l("Fortsätt där du slutade", "Continue where you left off")}
              className="min-w-0"
              data-testid="sw-overview-continue"
            >
              <ul className="mt-3 divide-y divide-border">
                {ongoing.slice(0, 4).map((analysis) => (
                  <li key={analysis.id}>
                    <Link
                      to="/security-work/$workspaceId/analyses/$analysisId"
                      params={{ ...params, analysisId: analysis.id }}
                      className="flex min-h-16 items-center justify-between gap-4 rounded-md py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      <span className="min-w-0">
                        <span className="block break-words font-semibold">{analysis.title}</span>
                        <span className="mt-1 flex flex-wrap items-center gap-2">
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
            </Group>
          )}
          <Group id="sw-work" title={t("sw.prog.work.heading")} data-testid="sw-services">
            <p className="mt-1 text-sm text-muted-foreground">{t("sw.prog.work.body")}</p>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {modules.map((module) => (
                <li key={module.to}>
                  <Link
                    to={module.to}
                    params={params}
                    className="flex min-h-28 flex-col gap-2 rounded-xl border border-border bg-card p-4 hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 font-semibold">
                        <module.icon className="size-4 text-accent" aria-hidden="true" />
                        {module.title}
                      </span>
                      {module.count > 0 && (
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold">
                          {module.count}
                        </span>
                      )}
                    </span>
                    <span className="text-sm leading-relaxed text-muted-foreground">
                      {module.body}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Group>
        </>
      )}
      <section className="flex flex-col justify-between gap-3 border-t border-border pt-5 sm:flex-row sm:items-center">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Settings2 className="size-4 text-accent" aria-hidden="true" />
            {l("Bevakningsprofil & inställningar", "Monitoring profile & settings")}
          </h2>
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
