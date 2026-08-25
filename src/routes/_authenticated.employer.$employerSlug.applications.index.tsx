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
import { ApplicationAssessmentChip } from "@/components/academy/ApplicationAssessmentPanel";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
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
import { ConfirmAction } from "@/components/employer/ConfirmAction";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, FileText, Search } from "lucide-react";

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

// Three orderings, because a recruiter asks three different questions of the
// same inbox: what just arrived, what has been here longest, and -- the one
// that actually prevents a candidate being forgotten -- who has been waiting
// on US the longest. "waiting" is deliberately NOT just oldest-first: it ranks
// only the applications still in play, so a rejection from March does not sit
// at the top of the list of people owed an answer.
const SORTS = ["newest", "oldest", "waiting"] as const;
type SortKey = (typeof SORTS)[number];

const searchSchema = z.object({
  job: z.string().uuid().optional().catch(undefined),
  status: z.enum(STATUS_FILTERS).optional().catch(undefined),
  q: z.string().trim().max(100).optional().catch(undefined),
  sort: z.enum(SORTS).optional().catch(undefined),
});

/** Still waiting on the employer. Terminal outcomes are settled business. */
const OPEN_STATUSES = new Set(["submitted", "reviewing", "interview"]);

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
  const {
    job: jobFilter,
    status: statusFilter,
    q: searchTerm,
    sort: sortKey,
  } = Route.useSearch();
  const navigate = Route.useNavigate();

  // A terminal transition is confirmed; a progression is not. `hired` and
  // `rejected` are both ends of the line -- set_application_status() offers no
  // transition out of either -- and `hired` additionally creates an employment
  // record through scp_employment_from_application(). Neither should be one
  // stray click away, and neither is worth a dialog when the employer is
  // simply moving somebody from "ny" to "granskas".
  const [pendingStatus, setPendingStatus] = useState<{
    applicationId: string;
    candidate: string;
    newStatus: EmployerSettableStatus;
  } | null>(null);

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

  function setSearch(next: Partial<{ q: string | undefined; sort: SortKey | undefined }>) {
    void navigate({ search: (prev) => ({ ...prev, ...next }), replace: true });
  }

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
  // Search is a plain substring over the two things a recruiter actually
  // remembers -- the person and the vacancy. Deliberately not an ATS query
  // language: the brief asks for a way to find one candidate in a list of
  // twenty, and that is a text box.
  const needle = (searchTerm ?? "").toLocaleLowerCase();
  const rows = allRows
    .filter((r) => {
      const jobMatches = jobFilter === undefined || r.jobId === jobFilter;
      const statusMatches = statusFilter === undefined || r.status === statusFilter;
      const textMatches =
        needle === "" ||
        [r.applicantDisplayName, r.jobTitleSv, r.jobTitleEn]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase()
          .includes(needle);
      return jobMatches && statusMatches && textMatches;
    })
    .sort((a, b) => {
      if (sortKey === "oldest") return a.createdAt.localeCompare(b.createdAt);
      if (sortKey === "waiting") {
        // Open applications first, oldest of those at the top. A settled
        // application is not "waiting" however long ago it was settled.
        const aOpen = OPEN_STATUSES.has(a.status);
        const bOpen = OPEN_STATUSES.has(b.status);
        if (aOpen !== bOpen) return aOpen ? -1 : 1;
        return a.createdAt.localeCompare(b.createdAt);
      }
      return b.createdAt.localeCompare(a.createdAt);
    });
  const filtered =
    jobFilter !== undefined || statusFilter !== undefined || (searchTerm ?? "") !== "";
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

      {/* Search and sort sit with the status chips: one control strip, not a
          toolbar above a second toolbar. */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="relative flex-1 basis-[15rem]">
          <span className="sr-only">{t("employer.applications.searchLabel")}</span>
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            value={searchTerm ?? ""}
            onChange={(e) => setSearch({ q: e.target.value === "" ? undefined : e.target.value })}
            placeholder={t("employer.applications.searchPlaceholder")}
            className="h-9 w-full rounded-md border border-border bg-background pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          {t("employer.applications.sortLabel")}
          <select
            value={sortKey ?? "newest"}
            onChange={(e) =>
              setSearch({ sort: e.target.value === "newest" ? undefined : (e.target.value as SortKey) })
            }
            className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {SORTS.map((sk) => (
              <option key={sk} value={sk}>
                {t(`employer.applications.sort.${sk}` as TranslationKey)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Terminal outcomes are confirmed by name, and the dialog says what the
          outcome DOES -- an employer who marks somebody hired is also creating
          an employment record, and that should not be a surprise. */}
      {pendingStatus && (
        <ConfirmAction
          open
          onOpenChange={(o) => {
            if (!o) setPendingStatus(null);
          }}
          tone={pendingStatus.newStatus === "rejected" ? "destructive" : "default"}
          busy={setStatus.isPending}
          title={`${t(APPLICATION_ACTION_LABEL_KEY[pendingStatus.newStatus])} \u2014 ${pendingStatus.candidate}`}
          consequence={t(
            pendingStatus.newStatus === "hired"
              ? "employer.applications.confirm.hired.body"
              : "employer.applications.confirm.rejected.body",
          )}
          confirmLabel={t(APPLICATION_ACTION_LABEL_KEY[pendingStatus.newStatus])}
          cancelLabel={t("employer.workforce.form.cancel")}
          onConfirm={() => {
            const p = pendingStatus;
            setPendingStatus(null);
            setStatus.mutate({ applicationId: p.applicationId, newStatus: p.newStatus });
          }}
        />
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
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-background">
            {rows.map((r) => {
              const jobTitle =
                (lang === "sv" ? r.jobTitleSv : r.jobTitleEn) ||
                r.jobTitleSv ||
                r.jobTitleEn ||
                "\u2014";
              const nextStatuses = EMPLOYER_NEXT_STATUSES[r.status] ?? [];
              const candidateName =
                r.applicantDisplayName ?? t("employer.applications.anonymousCandidate");
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                  {/* IDENTITY — the person, the vacancy, the date. One block,
                      so the eye runs down a single column of names rather than
                      hunting for each one inside a card. */}
                  <div className="min-w-0 flex-1 basis-[16rem]">
                    <Link
                      to="/employer/$employerSlug/applications/$applicationId"
                      params={{ employerSlug, applicationId: r.id }}
                      className="text-sm font-semibold text-foreground hover:text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      {candidateName}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">
                      {jobTitle}
                      {" \u00b7 "}
                      {formatDate(r.createdAt, lang)}
                    </p>
                  </div>

                  {/* EVIDENCE — what exists, at a glance, and never merged into
                      a single "qualified" verdict. The CV chip says a document
                      is attached; the assessment chip says where the governed
                      run has got to. There is deliberately NO Passport signal
                      here: a disclosure is holder-authorised and
                      application-scoped, and a per-row "shared / not shared"
                      badge would leak whether a Passport exists to a reader who
                      was never given one. See rule 3b/3d in
                      scripts/passport-separation-check.ts -- the applications
                      list is named there as staying closed. */}
                  <div className="flex flex-none flex-wrap items-center gap-1.5">
                    {r.hasCv && (
                      <button
                        type="button"
                        onClick={() => onDownloadCv(r.id)}
                        className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:border-accent/50 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        <FileText className="h-3 w-3" aria-hidden="true" />
                        {t("employer.applications.evidence.cv")}
                      </button>
                    )}
                    <ApplicationAssessmentChip applicationId={r.id} />
                  </div>

                  <span className="inline-flex flex-none rounded-full border border-border px-2 py-0.5 text-xs font-medium">
                    {t(APPLICATION_STATUS_LABEL_KEY[r.status])}
                  </span>

                  {/* ACTION — one primary, everything else behind a menu.
                      "Anställd" and "Inte aktuell" used to sit in this row as
                      plain buttons the same size as "Öppna", which is a
                      terminal, auditable outcome one stray click away. */}
                  <div className="flex flex-none items-center gap-2">
                    <Link
                      to="/employer/$employerSlug/applications/$applicationId"
                      params={{ employerSlug, applicationId: r.id }}
                      className="inline-flex h-8 items-center rounded-md bg-accent px-3 text-xs font-semibold text-accent-foreground hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      {t("employer.candidate.openAction")}
                    </Link>
                    {nextStatuses.length > 0 && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            disabled={setStatus.isPending}
                            className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2.5 text-xs font-medium text-foreground hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
                          >
                            {t("employer.applications.action.changeStage")}
                            <ChevronDown className="h-3 w-3" aria-hidden="true" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                            {t("employer.applications.action.changeStageFor")} {candidateName}
                          </DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          {nextStatuses.map((next) => {
                            const terminal = next === "hired" || next === "rejected";
                            return (
                              <DropdownMenuItem
                                key={next}
                                className={
                                  next === "rejected"
                                    ? "text-destructive focus:text-destructive"
                                    : undefined
                                }
                                onSelect={() => {
                                  setActionError(null);
                                  if (terminal) {
                                    setPendingStatus({
                                      applicationId: r.id,
                                      candidate: candidateName,
                                      newStatus: next,
                                    });
                                  } else {
                                    setStatus.mutate({ applicationId: r.id, newStatus: next });
                                  }
                                }}
                              >
                                {t(APPLICATION_ACTION_LABEL_KEY[next])}
                              </DropdownMenuItem>
                            );
                          })}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>

                  {/* THE CANDIDATE'S OWN WORDS — labelled as theirs, clamped to
                      two lines, and last. It used to render in full at body
                      size directly under the name, which made a long message
                      the most prominent thing about that candidate and pushed
                      the next person off the screen. It is never a quality
                      signal; the full text is on the candidate's page. */}
                  {r.coverNote && (
                    <p className="w-full text-xs text-muted-foreground">
                      <span className="font-medium text-foreground/70">
                        {t("employer.applications.coverNoteLabel")}
                      </span>{" "}
                      <span className="line-clamp-2">{r.coverNote}</span>
                    </p>
                  )}
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
