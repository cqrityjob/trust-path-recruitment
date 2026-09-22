// Interview Intelligence — the employer overview.
//
// Shows what is waiting on a person. The counts are process facts (how many
// AI proposals nobody has looked at yet, which cases have no report), never
// anything about a candidate.

import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
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
} from "@/components/employer/interview/InterviewUi";
import { listInterviewCases } from "@/lib/interview-intelligence/runtime.functions";
import {
  CASE_STAGES,
  caseIsInStage,
  type CaseStage,
} from "@/lib/interview-intelligence/case-stage";

// ── WHY THIS LIST TAKES A STAGE FROM THE URL ───────────────────────────
//
// The Overview counts four pieces of interview work and, until now, linked all
// four to this page unfiltered -- while the application and assessment rows
// beside them each carried a filter. A recruiter told "3 interviews ready"
// arrived at every case the organisation has ever had.
//
// The stage is in the URL rather than in component state, so the view is
// shareable, survives a reload, and can be linked to precisely by whoever is
// naming the number. `catch` rather than a hard failure: a stale bookmark
// shows the unfiltered list rather than a validation error, exactly as the
// applications list already behaves.
//
// The stage NAMES the same statuses the counter counted, because both read
// src/lib/interview-intelligence/case-stage.ts. A private copy here is how the
// number and the list eventually disagree.
const searchSchema = z.object({
  stage: z.enum(CASE_STAGES).optional().catch(undefined),
});

/** The chip's own words. Reused from the work-list rows the filter arrives
 *  from, so the label on the row and the label on the filter are one string. */
const STAGE_LABEL: Record<CaseStage, TranslationKey> = {
  inPreparation: "iiu.ix.stage.inPreparation",
  awaitingPlanApproval: "employer.actions.interviewPlansToApprove.other",
  readyToInterview: "employer.actions.interviewsReady.other",
  inEvidenceReview: "employer.actions.interviewEvidenceToReview.other",
  awaitingReport: "employer.actions.interviewReportsToFinalise.other",
  active: "iiu.ix.active",
  done: "iiu.ix.done",
};

export const Route = createFileRoute(
  "/_authenticated/employer/$employerSlug/interview-intelligence/",
)({
  ssr: false,
  component: Page,
  errorComponent: EmployerErrorState,
  validateSearch: (search) => searchSchema.parse(search),
});

function Page() {
  const { employerSlug } = Route.useParams();
  const { stage } = Route.useSearch();
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

  const allCases = q.data?.cases ?? [];
  // The three summary numbers describe the ORGANISATION and never the filter:
  // narrowing the list below must not make the totals above it shrink, or the
  // reader is told their interviews disappeared.
  const cases = stage ? allCases.filter((c) => caseIsInStage(c.status, stage)) : allCases;
  const awaiting = allCases.filter((c) => c.proposalsAwaitingReview > 0);
  // `assessed` IS active: a human has assessed and the report still has to be
  // reviewed and locked, which is outstanding work. `reported` never is -- a
  // finalised report is a frozen document, not a case in flight.
  const active = allCases.filter((c) => !["reported", "cancelled"].includes(c.status));
  // Counts `reported`, and only `reported`. A case at `assessed` has report
  // MATERIAL and is not counted here, which is what the corrected label above
  // it now says out loud.
  const done = allCases.filter((c) => c.status === "reported");

  // A NUMBER IS A CLAIM. Three zeros under three labels is a complete,
  // confident statement that this employer has no interviews -- and it was
  // what the page said while the read was still in flight, and what it kept
  // saying if the read failed, because `q.data?.cases ?? []` cannot tell those
  // apart from an empty list. The counts are withheld until they are known.
  const countsKnown = q.isSuccess;

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
        <Stat
          label={t("iiu.ix.active")}
          value={countsKnown ? active.length : null}
          unknown={q.isError ? t("continuity.report.unavailable") : undefined}
        />
        <Stat
          label={t("iiu.ix.awaiting")}
          value={countsKnown ? awaiting.length : null}
          unknown={q.isError ? t("continuity.report.unavailable") : undefined}
          tone="attention"
        />
        <Stat
          label={t("iiu.ix.done")}
          value={countsKnown ? done.length : null}
          unknown={q.isError ? t("continuity.report.unavailable") : undefined}
          tone="confirmed"
        />
      </div>

      {/* The default path, said before the exception is offered. */}
      <p className="mt-6 max-w-3xl text-sm leading-relaxed text-muted-foreground">
        {t("iiu.ix.startFromCandidate")}{" "}
        <Link
          to="/employer/$employerSlug/applications"
          params={{ employerSlug }}
          search={{ job: undefined, status: undefined, q: undefined, sort: undefined }}
          className="font-medium text-accent underline-offset-2 hover:underline"
        >
          {t("iiu.ix.startFromCandidate.cta")}
        </Link>
      </p>

      <div className="mt-3">
        <Link
          to="/employer/$employerSlug/interview-intelligence/new"
          params={{ employerSlug }}
          search={{ applicationId: undefined, jobId: undefined }}
          // SECONDARY, deliberately. A standalone interview is legitimate and
          // stays reachable, but it is the exception: a case created here
          // belongs to no application, so it can appear in no candidate's
          // process spine and no report can be reached from the person it is
          // about. The default path is "Prepare an interview" on a candidate,
          // and the lede beside this button says so.
          className="inline-flex min-h-11 items-center rounded-[10px] border border-border px-4 text-sm font-medium text-foreground hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {t("iiu.new.title")}
        </Link>
        {/* The reports in these same cases, under the same access rules. */}
        <Link
          to="/employer/$employerSlug/reports"
          params={{ employerSlug }}
          className="ml-4 inline-flex min-h-11 items-center text-sm font-medium text-accent underline-offset-2 hover:underline"
          data-testid="ii-reports-link"
        >
          {t("reports.title")}
        </Link>
      </div>

      <section className="mt-8" aria-labelledby="ii-cases-heading">
        <h2 id="ii-cases-heading" className="text-lg font-semibold text-foreground">
          {t("iiu.ix.heading")}
        </h2>

        {/* The filter a work-list row arrived with, named and removable. A
            filtered view that does not say it is filtered is how a recruiter
            concludes their cases have vanished. */}
        {stage && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-[color:var(--surface-subtle)] px-3 py-2 text-sm">
            <span className="text-muted-foreground">{t("iiu.ix.filtered")}</span>
            <span className="font-medium text-foreground">{t(STAGE_LABEL[stage])}</span>
            <span className="tabular-nums text-muted-foreground">({cases.length})</span>
            {/* A link rather than a button: removing a filter is navigation,
                it belongs in the history, and it is middle-clickable. */}
            <Link
              to="/employer/$employerSlug/interview-intelligence"
              params={{ employerSlug }}
              search={{ stage: undefined }}
              replace
              className="ml-auto inline-flex min-h-11 items-center rounded-md px-2 text-xs font-medium text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {t("iiu.ix.clearFilter")}
            </Link>
          </div>
        )}

        <div className="mt-4">
          {q.isLoading && <State kind="loading" />}
          {q.isError && <State kind="error" message={interviewErrorMessage(q.error, t)} />}
          {q.isSuccess && cases.length === 0 && (
            <State kind="empty">{stage ? t("iiu.ix.emptyForFilter") : t("iiu.ix.empty")}</State>
          )}

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

/** One count. `value` is null while the number is genuinely not known -- the
 *  read is in flight or it failed -- and an em dash is drawn instead, because
 *  a zero there is a lie about the employer's own work. */
function Stat({
  label,
  value,
  tone = "neutral",
  unknown,
}: {
  label: string;
  value: number | null;
  tone?: "neutral" | "attention" | "confirmed";
  /** Said under the dash when the read FAILED, so the reader can tell a
   *  loading page from a broken one. */
  unknown?: string;
}) {
  const border =
    tone === "attention"
      ? "border-amber-600/40"
      : tone === "confirmed"
        ? "border-teal-700/30"
        : "border-border";
  return (
    <div className={`rounded-lg border ${border} bg-muted/20 p-4`}>
      <p className="text-2xl font-semibold tabular-nums text-foreground">
        {value === null ? <span aria-hidden="true">—</span> : value}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
      {value === null && unknown && (
        <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-300">{unknown}</p>
      )}
    </div>
  );
}
