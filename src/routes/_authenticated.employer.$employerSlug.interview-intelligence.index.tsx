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
  NEXT_STEP_LABEL,
  ShortDate,
  uiLabel,
  Panel,
  State,
  interviewErrorMessage,
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
        {/* "Interview Intelligence" is what we call the capability; a
            recruiter opening their week is looking for their interviews. The
            sidebar already says Intervjuer, and the page disagreed with it. */}
        <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">
          {t("iiu.ix.heading")}
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
          {t("iiu.ix.heading")}
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
                    <th scope="col" className="px-4 py-3 font-medium">
                      {t("iiu.ix.col.updated")}
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      {t("iiu.ix.col.next")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {cases.map((c) => (
                    <tr key={c.id} className="align-top">
                      <th scope="row" className="px-4 py-3 font-medium text-foreground">
                        {/* The candidate is the row. The case title is
                            internal bookkeeping, and leading with it made the
                            list read as a list of records rather than of
                            people. The link lands on the overview, so opening
                            a candidate answers "who and what next" before it
                            asks for work. */}
                        <Link
                          to="/employer/$employerSlug/interview-intelligence/$caseId"
                          params={{ employerSlug, caseId: c.id }}
                          className="text-accent underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                        >
                          {c.candidateDisplayName}
                        </Link>
                        <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                          {c.title}
                        </span>
                      </th>
                      <td className="px-4 py-3">
                        <span className="text-muted-foreground">{c.packName ?? "—"}</span>
                      </td>
                      <td className="px-4 py-3">
                        <CaseStatusChip status={c.status} />
                      </td>
                      <td className="px-4 py-3 tabular-nums text-muted-foreground">
                        {c.proposalsAwaitingReview > 0
                          ? `${c.proposalsAwaitingReview} ${t("iiu.ix.proposals")}`
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        <ShortDate iso={c.updatedAt ?? null} />
                      </td>
                      {/* The column that turns a list of records into a work
                          queue. It is derived from the same NEXT_STEP_LABEL
                          the overview's primary button uses, so a case cannot
                          be told one thing here and another when it opens. */}
                      <td className="px-4 py-3 font-medium text-foreground">
                        {uiLabel(NEXT_STEP_LABEL, c.status, t)}
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
