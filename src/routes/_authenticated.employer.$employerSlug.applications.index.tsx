// One paged, server-authoritative application list for the organisation and
// its recruitments. Existing actions remain in CandidateTable; opening a row
// records a reading receipt, never a completed human review.
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useT } from "@/i18n/context";
import {
  EmployerAppShell,
  type EmployerRole,
  type EmployerStatus,
} from "@/components/employer/EmployerAppShell";
import { EmployerErrorState } from "@/components/employer/EmployerErrorState";
import { RecruitmentFlowStrip } from "@/components/employer/RecruitmentFlowStrip";
import { EmployerAccessDenied } from "@/components/employer/EmployerAccessDenied";
import { CandidateTable } from "@/components/recruitment/CandidateTable";
import { listMyEmployerWorkspaces } from "@/lib/job-intelligence/membership.functions";
import { employerPortalEnabled } from "@/lib/job-intelligence/feature-flag";
import {
  listRecruitmentCandidatesPage,
  getRecruitmentOverview,
} from "@/lib/recruitment/recruitment.functions";
import { APPLICATION_STATUS_LABEL_KEY } from "@/lib/job-intelligence/application-status";
import { compactView } from "@/lib/recruitment/definitions";
import { applicationListSearch } from "@/lib/recruitment/application-list-search";
import { useOpenAssessmentApplications } from "@/lib/employer-continuity/open-assessments";

// Preserve old status/sort bookmarks; every new filter/order/page is encoded
// in the same URL contract as the recruitment's own application tab.
export const Route = createFileRoute("/_authenticated/employer/$employerSlug/applications/")({
  ssr: false,
  component: EmployerApplicationsPage,
  errorComponent: EmployerErrorState,
  validateSearch: applicationListSearch,
});
function EmployerApplicationsPage() {
  const { employerSlug } = Route.useParams();
  const { t } = useT();
  const list = useServerFn(listMyEmployerWorkspaces);
  const workspaces = useQuery({
    queryKey: ["employer", "my-workspaces"],
    queryFn: () => list(),
    enabled: employerPortalEnabled(),
  });
  if (!employerPortalEnabled()) return <p className="p-6">{t("employer.comingSoon.body")}</p>;
  if (workspaces.isLoading) return <p className="p-6">{t("employer.loading")}</p>;
  const workspace = workspaces.data?.find((w) => w.employerSlug === employerSlug);
  if (workspaces.isError || !workspace)
    return <EmployerAccessDenied workspaces={workspaces.data} />;
  return (
    <ApplicationsList
      employerId={workspace.employerId}
      employerSlug={employerSlug}
      employerName={workspace.employerName}
      role={workspace.role}
      status={workspace.employerStatus}
      hasMultipleWorkspaces={(workspaces.data?.length ?? 0) > 1}
    />
  );
}
function ApplicationsList(props: {
  employerId: string;
  employerSlug: string;
  employerName: string;
  role: EmployerRole;
  status: EmployerStatus;
  hasMultipleWorkspaces: boolean;
}) {
  const { t, lang } = useT();
  const qc = useQueryClient();
  const view = compactView(Route.useSearch());
  const navigate = Route.useNavigate();
  const pageFn = useServerFn(listRecruitmentCandidatesPage);
  const overviewFn = useServerFn(getRecruitmentOverview);
  const query = useQuery({
    queryKey: ["employer", props.employerId, "candidates", "organisation", view],
    queryFn: () => pageFn({ data: { employerId: props.employerId, jobId: null, view } }),
  });
  const overview = useQuery({
    queryKey: ["employer", props.employerId, "recruitment-overview"],
    queryFn: () => overviewFn({ data: { employerId: props.employerId } }),
  });
  const assessments = useOpenAssessmentApplications(props.employerId, true);
  const changeView = (next: typeof view) => {
    void navigate({ search: compactView(next), replace: true });
  };
  return (
    <EmployerAppShell {...props} activeSection="applications">
      <h1 className="text-2xl font-semibold">{t("employer.applications.heading")}</h1>
      <RecruitmentFlowStrip employerSlug={props.employerSlug} current="applications" className="mt-3" />
      <p className="mt-2 text-sm text-muted-foreground">
        {lang === "sv"
          ? "Kravstatus, rekryteringssteg, teknisk analys och mänsklig granskning visas separat. Grupper och antal beräknas över hela urvalet före sidindelning."
          : "Requirement status, recruitment stage, technical analysis and human review are separate. Groups and counts cover the complete selection before pagination."}
      </p>
      <label className="my-4 block text-sm">
        {lang === "sv" ? "Rekrytering" : "Recruitment"}
        <select
          data-testid="recruitment-filter"
          value={view.job ?? ""}
          onChange={(e) =>
            changeView({ ...view, job: e.target.value || undefined, page: undefined })
          }
          className="ml-2 max-w-full rounded border border-border bg-background p-2"
        >
          <option value="">{lang === "sv" ? "Alla rekryteringar" : "All recruitments"}</option>
          {overview.data?.recruitments.map((r) => (
            <option key={r.jobId} value={r.jobId}>
              {(lang === "sv" ? r.titleSv || r.titleEn : r.titleEn || r.titleSv) ?? r.jobId}
            </option>
          ))}
        </select>
      </label>
      {view.status && (
        <p className="mb-3 text-sm">
          {lang === "sv" ? "Valt rekryteringsstatusfilter" : "Selected recruitment status filter"}:{" "}
          {t(APPLICATION_STATUS_LABEL_KEY[view.status])}{" "}
          <button
            type="button"
            className="ml-2 underline"
            onClick={() => changeView({ ...view, status: undefined, page: undefined })}
          >
            {lang === "sv" ? "Ta bort" : "Clear"}
          </button>
        </p>
      )}
      <CandidateTable
        employerId={props.employerId}
        employerSlug={props.employerSlug}
        employerName={props.employerName}
        jobId={null}
        jobTitle=""
        page={query.data ?? null}
        loading={query.isLoading}
        error={query.isError}
        onRetry={() => void query.refetch()}
        view={view}
        onViewChange={changeView}
        team={overview.data?.team ?? []}
        canManage={props.role === "owner" || props.role === "admin"}
        canAssignTests={props.role === "owner" || props.role === "admin"}
        openAssessmentIds={assessments.ids}
        labelKey="applications"
        onChanged={() => {
          void qc.invalidateQueries({ queryKey: ["employer", props.employerId] });
        }}
      />
    </EmployerAppShell>
  );
}
