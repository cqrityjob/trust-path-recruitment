// Employer Assessment Assignment management — list + filters.

import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import {
  EmployerAppShell,
  type EmployerRole,
  type EmployerStatus,
} from "@/components/employer/EmployerAppShell";
import { EmployerErrorState } from "@/components/employer/EmployerErrorState";
import { EmployerAccessDenied } from "@/components/employer/EmployerAccessDenied";
import { useEmployerWorkspace } from "@/lib/job-intelligence/use-employer-workspace";
import { formatDate } from "@/lib/job-intelligence/date-format";
import {
  listAssignmentsForEmployer,
  cancelAssessmentAssignment,
  type EmployerAssignmentRow,
} from "@/lib/job-intelligence/assessment-assignments.functions";

export const Route = createFileRoute(
  "/_authenticated/employer/$employerSlug/assessments/assignments/",
)({
  ssr: false,
  component: EmployerAssignmentsListPage,
  errorComponent: EmployerErrorState,
});

type FilterKey = "all" | "active" | "completed" | "expired";

function EmployerAssignmentsListPage() {
  const { employerSlug } = Route.useParams();
  const { t } = useT();
  const ws = useEmployerWorkspace(employerSlug);

  if (!ws.portalEnabled) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="text-2xl font-semibold text-foreground">
          {t("employer.comingSoon.heading")}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">{t("employer.comingSoon.body")}</p>
      </div>
    );
  }
  if (ws.isLoading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <p className="text-sm text-muted-foreground">{t("employer.loading")}</p>
      </div>
    );
  }
  if (ws.isError || !ws.workspace) {
    return <EmployerAccessDenied workspaces={ws.workspaces} />;
  }

  return (
    <AssignmentsList
      employerId={ws.workspace.employerId}
      employerSlug={ws.workspace.employerSlug}
      employerName={ws.workspace.employerName}
      role={ws.workspace.role}
      status={ws.workspace.employerStatus}
      hasMultipleWorkspaces={ws.hasMultipleWorkspaces}
    />
  );
}

const FILTERS: FilterKey[] = ["all", "active", "completed", "expired"];

function AssignmentsList({
  employerId,
  employerSlug,
  employerName,
  role,
  status,
  hasMultipleWorkspaces,
}: {
  employerId: string;
  employerSlug: string;
  employerName: string;
  role: EmployerRole;
  status: EmployerStatus;
  hasMultipleWorkspaces: boolean;
}) {
  const { t, lang } = useT();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<FilterKey>("all");
  const listFn = useServerFn(listAssignmentsForEmployer);
  const cancelFn = useServerFn(cancelAssessmentAssignment);

  const query = useQuery({
    queryKey: ["employer", employerId, "assignments", filter],
    queryFn: () => listFn({ data: { employerId, statusFilter: filter } }),
  });

  const cancelMutation = useMutation({
    mutationFn: (assignmentId: string) => cancelFn({ data: { employerId, assignmentId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employer", employerId, "assignments"] }),
  });

  const rows: EmployerAssignmentRow[] = query.data ?? [];

  return (
    <EmployerAppShell
      employerSlug={employerSlug}
      employerName={employerName}
      role={role}
      status={status}
      activeSection="assessments"
      hasMultipleWorkspaces={hasMultipleWorkspaces}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground sm:text-2xl">
            {t("assignment.list.heading")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("assignment.list.subheading")}</p>
        </div>
        <Link
          to="/employer/$employerSlug/assessments/assign"
          params={{ employerSlug }}
          search={{ assessmentId: "security-guard-foundation" }}
          className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          {t("assignment.action.assign")}
        </Link>
      </div>

      <div className="mt-6 inline-flex flex-wrap gap-1 rounded-lg border border-border bg-muted/20 p-1">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={
              "rounded-md px-3 py-1.5 text-sm font-medium " +
              (filter === f
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground")
            }
          >
            {t(`assignment.filter.${f}` as TranslationKey)}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {query.isLoading ? (
          <p className="text-sm text-muted-foreground">{t("employer.loading")}</p>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
            {t("assignment.list.empty")}
          </div>
        ) : (
          <ul className="space-y-3">
            {rows.map((r) => {
              const recipientLabel = r.employeeName ?? r.recipientEmail;
              const assessmentName = lang === "sv" ? r.assessmentNameSv : r.assessmentNameEn;
              const jobTitle =
                (lang === "sv" ? r.jobTitleSv : r.jobTitleEn) || r.jobTitleSv || r.jobTitleEn;
              const cancellable =
                r.status === "invited" || r.status === "opened" || r.status === "started";
              return (
                <li
                  key={r.id}
                  className="rounded-xl border border-border bg-background p-4 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">{recipientLabel}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {assessmentName}
                        {" · "}
                        {t(
                          r.useCase === "recruitment"
                            ? "employer.assessments.useCase.recruitment.title"
                            : "employer.assessments.useCase.development.title",
                        )}
                        {jobTitle ? ` · ${jobTitle}` : ""}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t("assignment.list.invited")}: {formatDate(r.invitedAt, lang)}
                        {" · "}
                        {r.status === "completed"
                          ? `${t("assignment.list.completed")}: ${formatDate(r.completedAt!, lang)}`
                          : `${t("assignment.list.expires")}: ${formatDate(r.expiresAt, lang)}`}
                      </p>
                    </div>
                    <span
                      className={
                        "inline-flex flex-none rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide " +
                        (r.status === "completed"
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                          : r.status === "expired" || r.status === "cancelled"
                            ? "border-border text-muted-foreground"
                            : "border-accent/30 bg-accent/10 text-accent")
                      }
                    >
                      {t(`assignment.status.${r.status}` as TranslationKey)}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {r.status === "completed" && (
                      <Link
                        to="/employer/$employerSlug/assessments/assignments/$assignmentId"
                        params={{ employerSlug, assignmentId: r.id }}
                        className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted/40"
                      >
                        {t("assignment.action.viewResult")}
                      </Link>
                    )}
                    {cancellable && (
                      <button
                        type="button"
                        disabled={cancelMutation.isPending}
                        onClick={() => cancelMutation.mutate(r.id)}
                        className="rounded-md border border-destructive/50 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10"
                      >
                        {t("assignment.action.cancel")}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </EmployerAppShell>
  );
}
