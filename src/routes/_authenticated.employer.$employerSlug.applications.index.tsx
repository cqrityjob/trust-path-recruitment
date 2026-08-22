// Phase H3.2 — /employer/$employerSlug/applications: employer-scoped
// applications view. Backend it reads from (job_applications table + RLS,
// listApplicationsForEmployer, getApplicationCvSignedUrl) existed before
// H3.2 (Jobs MVP v1 H1, delivered independently). Follows the exact same
// access-resolution pattern as every other employer route: slug is a
// lookup key only, re-verified independently via
// listMyEmployerWorkspaces() on every load.
//
// The assessment step on this page is the governed ApplicationAssessmentPanel
// under each row, and only that.
//
// Each row used to carry its own assessment controls, cross-referenced from
// assessment_assignments: a "Tilldela bedomning" link into the legacy assign
// form with assessmentId=security-guard-foundation hardcoded, a link into the
// legacy EngineResultV1 report, and a status chip. All three are removed.
//
// The assign link was the worst of the three -- that catalogue row is
// employer_visible = false, so a recruiter could open the form, fill it in,
// and only then be refused. The other two were a second, competing account of
// assessment state on the same row, and the report link would open the older
// engine's view even for an attempt that ran through the governed path.
//
// The panel resolves the candidate from the application itself, offers only
// assessments written for recruitment that this organisation may actually run,
// and sends through scp_assign_from_application. One path, governed end to end.
//
// H3.4A — extended with the full status-control model (reviewing /
// interview / rejected / hired), backed by the database-validated,
// atomically-audited set_application_status() RPC (via
// updateApplicationStatusAsEmployer). Only the transitions the RPC's own
// allow-list permits from the current status are ever offered as buttons —
// an employer can never be shown (or send) 'withdrawn'.

import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { NoEvidenceState } from "@/components/academy/MaturityDisplay";
import { ApplicationAssessmentPanel } from "@/components/academy/ApplicationAssessmentPanel";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { useT } from "@/i18n/context";
import {
  EmployerAppShell,
  type EmployerRole,
  type EmployerStatus,
} from "@/components/employer/EmployerAppShell";
import { EmployerErrorState } from "@/components/employer/EmployerErrorState";
import { EmployerAccessDenied } from "@/components/employer/EmployerAccessDenied";
import { listMyEmployerWorkspaces } from "@/lib/job-intelligence/membership.functions";
import { employerPortalEnabled } from "@/lib/job-intelligence/feature-flag";
import { formatDate } from "@/lib/job-intelligence/date-format";
import {
  listApplicationsForEmployer,
  getApplicationCvSignedUrl,
  updateApplicationStatusAsEmployer,
  type EmployerApplicationRow,
} from "@/lib/job-intelligence/applications.functions";
import {
  APPLICATION_ACTION_LABEL_KEY,
  APPLICATION_STATUS_LABEL_KEY,
  EMPLOYER_NEXT_STATUSES,
  type EmployerSettableStatus,
} from "@/lib/job-intelligence/application-status";
import { listEmployerJobs } from "@/lib/job-intelligence/employer-jobs.functions";

// ── WHY THIS LIST TAKES A FILTER FROM THE URL ──────────────────────────
//
// Every surface that counts applications -- the dashboard's "new applications"
// action, the Job Recruitment Hub's candidate list -- used to link HERE, to
// every application this organisation has ever received, and leave the
// employer to find the five the number was about. A count that does not land
// on the rows it counted is a count the reader has to re-derive by hand.
//
// Both filters are in the URL rather than in component state, so the view is
// shareable, survives a reload, and can be linked to precisely by whoever is
// naming the number. `catch` rather than a hard failure: a stale bookmark
// shows the unfiltered list rather than a validation error.
const STATUS_FILTERS = ["submitted", "reviewing", "interview", "hired", "rejected"] as const;

const searchSchema = z.object({
  job: z.string().uuid().optional().catch(undefined),
  status: z.enum(STATUS_FILTERS).optional().catch(undefined),
});

export const Route = createFileRoute("/_authenticated/employer/$employerSlug/applications/")({
  ssr: false,
  component: EmployerApplicationsPage,
  errorComponent: EmployerErrorState,
  validateSearch: (search) => searchSchema.parse(search),
});

function EmployerApplicationsPage() {
  const { employerSlug } = Route.useParams();
  const { t } = useT();
  const listWorkspaces = useServerFn(listMyEmployerWorkspaces);
  const workspacesQuery = useQuery({
    queryKey: ["employer", "my-workspaces"],
    queryFn: () => listWorkspaces(),
    enabled: employerPortalEnabled(),
  });

  if (!employerPortalEnabled()) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="text-2xl font-semibold text-foreground">
          {t("employer.comingSoon.heading")}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">{t("employer.comingSoon.body")}</p>
      </div>
    );
  }

  const workspace = workspacesQuery.data?.find((w) => w.employerSlug === employerSlug);

  if (workspacesQuery.isLoading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <p className="text-sm text-muted-foreground">{t("employer.loading")}</p>
      </div>
    );
  }

  if (workspacesQuery.isError || !workspace) {
    return <EmployerAccessDenied workspaces={workspacesQuery.data} />;
  }

  return (
    <ApplicationsList
      employerId={workspace.employerId}
      employerSlug={workspace.employerSlug}
      employerName={workspace.employerName}
      role={workspace.role}
      status={workspace.employerStatus}
      hasMultipleWorkspaces={(workspacesQuery.data?.length ?? 0) > 1}
    />
  );
}

function ApplicationsList({
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
  const listFn = useServerFn(listApplicationsForEmployer);
  const signCvFn = useServerFn(getApplicationCvSignedUrl);
  const setStatusFn = useServerFn(updateApplicationStatusAsEmployer);
  const listJobsFn = useServerFn(listEmployerJobs);
  const [actionError, setActionError] = useState<string | null>(null);
  const { job: jobFilter, status: statusFilter } = Route.useSearch();
  const navigate = Route.useNavigate();

  const query = useQuery({
    queryKey: ["employer", employerId, "applications"],
    queryFn: () => listFn({ data: { employerId } }),
  });

  // Only to name the vacancy in the filter banner. Shares the cache key the
  // job list and the dashboard already use, so it costs nothing extra, and the
  // page renders perfectly well before it resolves.
  const jobsQuery = useQuery({
    queryKey: ["employer", employerId, "jobs"],
    queryFn: () => listJobsFn({ data: { employerId } }),
    enabled: jobFilter !== undefined,
  });

  const setStatus = useMutation({
    mutationFn: (vars: { applicationId: string; newStatus: EmployerSettableStatus }) =>
      setStatusFn({ data: { applicationId: vars.applicationId, newStatus: vars.newStatus } }),
    onSuccess: () => {
      setActionError(null);
      qc.invalidateQueries({ queryKey: ["employer", employerId, "applications"] });
    },
    onError: () => setActionError(t("employer.applications.error.statusUpdate")),
  });

  async function onDownloadCv(applicationId: string) {
    setActionError(null);
    try {
      const result = await signCvFn({ data: { applicationId } });
      window.open(result.url, "_blank", "noopener,noreferrer");
    } catch {
      setActionError(t("employer.applications.error.cvDownload"));
    }
  }

  // Filtered in the browser rather than re-fetched: this page shares its cache
  // key with the dashboard, which already holds the same rows, and every row in
  // it is already RLS-scoped to this organisation server-side. The filter is a
  // view over authorised data, never a substitute for the authorisation.
  const allRows: EmployerApplicationRow[] = query.data ?? [];
  const rows = allRows.filter(
    (r) =>
      (jobFilter === undefined || r.jobId === jobFilter) &&
      (statusFilter === undefined || r.status === statusFilter),
  );
  const filtered = jobFilter !== undefined || statusFilter !== undefined;
  const filteredJobTitle = jobFilter
    ? (() => {
        const j = (jobsQuery.data ?? []).find((row) => row.id === jobFilter);
        if (!j) return null;
        return (lang === "en" ? j.title_en : j.title_sv) || j.title_sv || j.title_en || null;
      })()
    : null;

  return (
    <EmployerAppShell
      employerSlug={employerSlug}
      employerName={employerName}
      role={role}
      status={status}
      activeSection="applications"
      hasMultipleWorkspaces={hasMultipleWorkspaces}
    >
      <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">
        {t("employer.applications.heading")}
      </h1>

      {/* The filter is shown, not just applied. Arriving from a dashboard
          action and seeing a short list is only reassuring if the page says
          why it is short -- and offers the way back out. */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <FilterChip
          label={t("employer.applications.filter.all")}
          active={statusFilter === undefined}
          onSelect={() =>
            void navigate({ search: (prev) => ({ ...prev, status: undefined }), replace: true })
          }
        />
        {STATUS_FILTERS.map((sf) => (
          <FilterChip
            key={sf}
            label={t(APPLICATION_STATUS_LABEL_KEY[sf])}
            active={statusFilter === sf}
            onSelect={() =>
              void navigate({ search: (prev) => ({ ...prev, status: sf }), replace: true })
            }
          />
        ))}
      </div>

      {jobFilter !== undefined && (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
          <span className="text-muted-foreground">
            {t("employer.applications.filter.forJob")}{" "}
            <span className="font-medium text-foreground">
              {filteredJobTitle ?? t("employer.jobs.list.untitled")}
            </span>
          </span>
          <Link
            to="/employer/$employerSlug/jobs/$jobId"
            params={{ employerSlug, jobId: jobFilter }}
            className="text-xs font-medium text-accent hover:underline"
          >
            {t("employer.jobHub.openJob")}
          </Link>
          <button
            type="button"
            onClick={() =>
              void navigate({ search: (prev) => ({ ...prev, job: undefined }), replace: true })
            }
            className="text-xs font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            {t("employer.applications.filter.clearJob")}
          </button>
        </div>
      )}

      {actionError && (
        <div className="mt-4 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {actionError}
        </div>
      )}

      <div className="mt-6">
        {query.isLoading ? (
          <p className="text-sm text-muted-foreground">{t("employer.loading")}</p>
        ) : query.isError ? (
          <p className="text-sm text-destructive">{t("employer.applications.error.load")}</p>
        ) : rows.length === 0 && filtered ? (
          // A filter that matches nothing is not an empty inbox. Telling an
          // employer with forty applications that they have none, because they
          // clicked "Anstalld", would be false.
          <NoEvidenceState
            title={t("employer.applications.filter.emptyTitle")}
            body={t("employer.applications.filter.emptyBody")}
            action={
              <button
                type="button"
                onClick={() => void navigate({ search: {}, replace: true })}
                className="inline-flex h-10 items-center rounded-[10px] border border-border px-4 text-[13px] font-medium text-foreground hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {t("employer.applications.filter.showAll")}
              </button>
            }
          />
        ) : rows.length === 0 ? (
          // Applications only ever arrive from a published advertisement, so
          // the empty state says where they come from and offers the way
          // there — rather than stating the absence and stopping.
          <NoEvidenceState
            title={t("employer.applications.empty")}
            body={t("employer.applications.emptyBody")}
            action={
              <Link
                to="/employer/$employerSlug/jobs"
                params={{ employerSlug }}
                className="inline-flex h-10 items-center rounded-[10px] bg-accent px-4 text-[13px] font-semibold text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {t("employer.applications.emptyAction")}
              </Link>
            }
          />
        ) : (
          <ul className="space-y-3">
            {rows.map((r) => {
              const jobTitle =
                (lang === "sv" ? r.jobTitleSv : r.jobTitleEn) ||
                r.jobTitleSv ||
                r.jobTitleEn ||
                "—";
              return (
                <li key={r.id} className="rounded-lg border border-border bg-background p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    {/* The candidate is the subject of the row, and the way
                        into their own page. The job and the date stay as the
                        context underneath: a recruiter is triaging people, and
                        clicking a person should open that person. */}
                    <div className="min-w-0">
                      <Link
                        to="/employer/$employerSlug/applications/$applicationId"
                        params={{ employerSlug, applicationId: r.id }}
                        className="text-sm font-semibold text-foreground hover:text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        {r.applicantDisplayName ?? t("employer.applications.anonymousCandidate")}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {jobTitle}
                        {" · "}
                        {formatDate(r.createdAt, lang)}
                      </p>
                    </div>
                    <span className="inline-flex rounded-full border border-border px-2 py-0.5 text-xs font-medium">
                      {t(APPLICATION_STATUS_LABEL_KEY[r.status])}
                    </span>
                  </div>
                  {r.coverNote && <p className="mt-3 text-sm text-foreground">{r.coverNote}</p>}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link
                      to="/employer/$employerSlug/applications/$applicationId"
                      params={{ employerSlug, applicationId: r.id }}
                      className="inline-flex min-h-[32px] items-center rounded-md border border-accent/50 px-2 py-1 text-xs font-medium text-accent hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      {t("employer.candidate.openAction")}
                    </Link>
                    {(EMPLOYER_NEXT_STATUSES[r.status] ?? []).map((next) => (
                      <button
                        key={next}
                        type="button"
                        disabled={setStatus.isPending}
                        onClick={() => setStatus.mutate({ applicationId: r.id, newStatus: next })}
                        className="rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-muted/40"
                      >
                        {t(APPLICATION_ACTION_LABEL_KEY[next])}
                      </button>
                    ))}
                    {r.hasCv && (
                      <button
                        type="button"
                        onClick={() => onDownloadCv(r.id)}
                        className="rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-muted/40"
                      >
                        {t("employer.applications.action.downloadCv")}
                      </button>
                    )}
                  </div>

                  {/* The recruitment assessment step, in the application it
                      belongs to. It resolves the candidate from the
                      application, so nobody retypes an address — and it is
                      also the way back to the released brief. */}
                  <ApplicationAssessmentPanel
                    employerId={employerId}
                    employerSlug={employerSlug}
                    applicationId={r.id}
                    canAssign={role === "owner" || role === "admin"}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </EmployerAppShell>
  );
}

/** One status filter. A button rather than a link because the destination is
 *  this page: the filter is written to the URL so the view is shareable, but
 *  the click is not navigation and should not read as it. `aria-pressed` says
 *  which one is on, because the border alone does not reach a screen reader. */
function FilterChip({
  label,
  active,
  onSelect,
}: {
  label: string;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onSelect}
      className={
        active
          ? "rounded-full border border-accent bg-accent/10 px-3 py-1 text-xs font-semibold text-accent"
          : "rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted/40 hover:text-foreground"
      }
    >
      {label}
    </button>
  );
}
