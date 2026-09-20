// Rapporter — the reports in the organisation's own cases.
//
// Not a report database of its own: a view over the same cases, read under the
// same rules. A reader sees only the cases they may read (a security vetting's
// case only by the appointed security function) and only the BESKT assignments
// they are a party to -- the existence of a sensitive case follows its access
// rules too. The TRUST interview report and the BESKT basis stay two reports;
// nothing here merges them.

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import { EmployerAppShell } from "@/components/employer/EmployerAppShell";
import { EmployerErrorState } from "@/components/employer/EmployerErrorState";
import { EmployerAccessDenied } from "@/components/employer/EmployerAccessDenied";
import { useEmployerWorkspace } from "@/lib/job-intelligence/use-employer-workspace";
import { listInterviewCases } from "@/lib/interview-intelligence/runtime.functions";
import { listBesktAssignments } from "@/lib/beskt/complete.functions";

export const Route = createFileRoute("/_authenticated/employer/$employerSlug/reports")({
  ssr: false,
  component: EmployerReportsPage,
  errorComponent: EmployerErrorState,
});

const REVIEW = ["interview_complete", "evidence_review", "assessed", "reported"];
const STATE: Record<string, TranslationKey> = {
  interview_complete: "reports.state.review",
  evidence_review: "reports.state.review",
  assessed: "reports.state.ready",
  reported: "reports.state.final",
};

function EmployerReportsPage() {
  const { employerSlug } = Route.useParams();
  const { t } = useT();
  const ws = useEmployerWorkspace(employerSlug);
  const casesFn = useServerFn(listInterviewCases);
  const besktFn = useServerFn(listBesktAssignments);
  const employerId = ws.workspace?.employerId;
  const cases = useQuery({
    queryKey: ["ii", "cases", employerId],
    queryFn: () => casesFn({ data: { employerId: employerId! } }),
    enabled: Boolean(employerId),
    retry: false,
  });
  const beskt = useQuery({
    queryKey: ["beskt", "assignments", employerId],
    queryFn: () => besktFn({ data: { employerId: employerId! } }),
    enabled: Boolean(employerId),
    retry: false,
  });

  if (ws.isLoading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <p className="text-sm text-muted-foreground">{t("employer.loading")}</p>
      </div>
    );
  }
  if (ws.isError || !ws.workspace) return <EmployerAccessDenied workspaces={ws.workspaces} />;

  const rows = (cases.data?.cases ?? []).filter((c) => REVIEW.includes(c.status));
  const besktByCase = new Map(
    (beskt.data ?? []).filter((b) => b.caseId).map((b) => [b.caseId as string, b] as const),
  );

  return (
    <EmployerAppShell
      employerSlug={ws.workspace.employerSlug}
      employerName={ws.workspace.employerName}
      role={ws.workspace.role}
      status={ws.workspace.employerStatus}
      activeSection="reports"
      hasMultipleWorkspaces={ws.hasMultipleWorkspaces}
    >
      <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
        {t("reports.title")}
      </h1>
      <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{t("reports.lede")}</p>

      {cases.isError ? (
        <p role="alert" className="mt-6 rounded-md border border-border px-4 py-3 text-sm">
          {t("reports.readFailed")}
        </p>
      ) : cases.isPending ? (
        <p className="mt-6 text-sm text-muted-foreground">{t("employer.loading")}</p>
      ) : rows.length === 0 ? (
        <p
          className="mt-6 rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground"
          data-testid="reports-empty"
        >
          {t("reports.empty")}
        </p>
      ) : (
        <ul
          className="mt-6 divide-y divide-border rounded-lg border border-border"
          data-testid="reports"
        >
          {rows.map((c) => {
            const b = besktByCase.get(c.id);
            return (
              <li
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
                data-testid="reports-row"
              >
                <span className="min-w-0">
                  <span className="block font-medium text-foreground">
                    {c.candidateDisplayName}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {c.packName ?? c.title} · {t(STATE[c.status] ?? "reports.state.review")}
                  </span>
                </span>
                <span className="flex flex-wrap gap-3">
                  <Link
                    to="/employer/$employerSlug/interview-intelligence/$caseId/report"
                    params={{ employerSlug, caseId: c.id }}
                    className="inline-flex min-h-11 items-center text-accent underline-offset-2 hover:underline"
                  >
                    {t("reports.open.trust")}
                  </Link>
                  {b ? (
                    <Link
                      to="/employer/$employerSlug/interview-intelligence/$caseId/beskt"
                      params={{ employerSlug, caseId: c.id }}
                      search={{ view: "report" }}
                      className="inline-flex min-h-11 items-center text-accent underline-offset-2 hover:underline"
                    >
                      {t(b.reportFinalised ? "reports.open.besktFinal" : "reports.open.beskt")}
                    </Link>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </EmployerAppShell>
  );
}
