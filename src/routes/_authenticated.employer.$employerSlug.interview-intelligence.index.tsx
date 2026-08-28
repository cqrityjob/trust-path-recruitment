// Interview Intelligence — the employer overview.
//
// Shows what is waiting on a person. The counts are process facts (how many
// AI proposals nobody has looked at yet, which cases have no report), never
// anything about a candidate.

import { createFileRoute, Link } from "@tanstack/react-router";
import { useT } from "@/i18n/context";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { EmployerAppShell } from "@/components/employer/EmployerAppShell";
import { EmployerErrorState } from "@/components/employer/EmployerErrorState";
import { EmployerAccessDenied } from "@/components/employer/EmployerAccessDenied";
import { useEmployerWorkspace } from "@/lib/job-intelligence/use-employer-workspace";
import {
  CaseStatusChip,
  Panel,
  State,
  interviewErrorMessage,
  ValidationChip,
  BUTTON,
} from "@/components/employer/interview/InterviewUi";
import { listInterviewCases } from "@/lib/interview-intelligence/runtime.functions";

export const Route = createFileRoute(
  "/_authenticated/employer/$employerSlug/interview-intelligence/",
)({ ssr: false, component: Page, errorComponent: EmployerErrorState });

function Page() {
  const { employerSlug } = Route.useParams();
  const ws = useEmployerWorkspace(employerSlug);
  const { t } = useT();
  const listFn = useServerFn(listInterviewCases);

  const q = useQuery({
    queryKey: ["ii", "cases", ws.workspace?.employerId],
    queryFn: () => listFn({ data: { employerId: ws.workspace!.employerId } }),
    enabled: Boolean(ws.workspace?.employerId),
  });

  if (ws.isLoading)
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <State kind="loading" />
      </div>
    );
  if (ws.isError || !ws.workspace) return <EmployerAccessDenied workspaces={ws.workspaces} />;

  const cases = q.data?.cases ?? [];
  const awaiting = cases.filter((c) => c.proposalsAwaitingReview > 0);
  const active = cases.filter((c) => !["reported", "cancelled"].includes(c.status));
  const done = cases.filter((c) => c.status === "reported");

  return (
    <EmployerAppShell
      employerSlug={ws.workspace.employerSlug}
      employerName={ws.workspace.employerName}
      role={ws.workspace.role}
      status={ws.workspace.employerStatus}
      activeSection="interviewIntelligence"
      hasMultipleWorkspaces={ws.hasMultipleWorkspaces}
    >
      <header>
        <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">
          Interview Intelligence
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          {t("iiu.ix.lead")}
        </p>
      </header>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Stat label={t("iiu.ix.active")} value={active.length} />
        <Stat label={t("iiu.ix.awaiting")} value={awaiting.length} tone="attention" />
        <Stat label={t("iiu.ix.done")} value={done.length} tone="confirmed" />
      </div>

      <div className="mt-6">
        <Link
          to="/employer/$employerSlug/interview-intelligence/new"
          params={{ employerSlug }}
          search={{ applicationId: undefined, jobId: undefined }}
          className={BUTTON}
        >
          {t("iiu.new.title")}
        </Link>
      </div>

      <section className="mt-8" aria-labelledby="ii-cases-heading">
        <h2 id="ii-cases-heading" className="text-lg font-semibold text-foreground">
          {t("iiu.rail.interview")}
        </h2>

        <div className="mt-4">
          {q.isLoading && <State kind="loading" />}
          {q.isError && <State kind="error" message={interviewErrorMessage(q.error, t)} />}
          {q.isSuccess && cases.length === 0 && <State kind="empty">{t("iiu.ix.empty")}</State>}

          {q.isSuccess && cases.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[760px] text-left text-sm">
                <caption className="sr-only">{t("iiu.ix.caption")}</caption>
                <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-4 py-3">
                      {t("iiu.ix.col.interview")}
                    </th>
                    <th scope="col" className="px-4 py-3">
                      {t("iiu.ix.col.pack")}
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Status
                    </th>
                    <th scope="col" className="px-4 py-3">
                      {t("iiu.ix.col.awaiting")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {cases.map((c) => (
                    <tr key={c.id} className="align-top">
                      <th scope="row" className="px-4 py-3 font-medium text-foreground">
                        <Link
                          to="/employer/$employerSlug/interview-intelligence/$caseId/prepare"
                          params={{ employerSlug, caseId: c.id }}
                          className="text-accent underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                        >
                          {c.title}
                        </Link>
                        <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                          {c.candidateDisplayName}
                        </span>
                      </th>
                      <td className="px-4 py-3">
                        <span className="text-muted-foreground">{c.packName ?? "—"}</span>
                        <span className="mt-1 block">
                          <ValidationChip label={c.validationLabel} />
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <CaseStatusChip status={c.status} />
                      </td>
                      <td className="px-4 py-3 tabular-nums text-muted-foreground">
                        {c.proposalsAwaitingReview > 0
                          ? `${c.proposalsAwaitingReview} ${t("iiu.ix.proposals")}`
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <div className="mt-8 max-w-3xl">
        <Panel tone="work" title={t("iiu.ix.boundary.title")}>
          <p>{t("iiu.ix.boundary.body")}</p>
        </Panel>
      </div>
    </EmployerAppShell>
  );
}

function Stat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "attention" | "confirmed";
}) {
  const border =
    tone === "attention"
      ? "border-amber-600/40"
      : tone === "confirmed"
        ? "border-teal-700/30"
        : "border-border";
  return (
    <div className={`rounded-lg border ${border} bg-muted/20 p-4`}>
      <p className="text-2xl font-semibold tabular-nums text-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
