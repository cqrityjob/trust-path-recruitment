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
      {/* With a review filter in the URL this list IS the requirement-review
          station (the strip's own link lands here with review=remaining); the
          marker follows the URL, never a candidate's progress. */}
      <RecruitmentFlowStrip
        employerSlug={props.employerSlug}
        current={view.review ? "review" : "applications"}
        className="mt-3"
      />
      <p className="mt-2 text-sm text-muted-foreground">
        {lang === "sv"
          ? "Aktiva ansökningar är arbetslistan: vad gör jag nu? Kravstatus, rekryteringssteg och mänsklig granskning visas separat, och antalen beräknas över hela urvalet före sidindelning."
          : "Active applications are the working list: what do I do now? Requirement status, recruitment stage and human review are separate, and counts cover the complete selection before pagination."}
      </p>
      <p className="mb-3 mt-1 text-xs text-muted-foreground">{t("rec.filters.simpleHint")}</p>
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
        recruitments={(overview.data?.recruitments ?? []).map((r) => ({
          jobId: r.jobId,
          title: (lang === "sv" ? r.titleSv || r.titleEn : r.titleEn || r.titleSv) ?? r.jobId,
        }))}
        labelKey="applications"
        onChanged={() => {
          void qc.invalidateQueries({ queryKey: ["employer", props.employerId] });
        }}
      />
    </EmployerAppShell>
  );
}
