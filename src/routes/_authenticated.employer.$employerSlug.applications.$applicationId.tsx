// Candidate 360 — one application, one person, one page.
//
// ── WHY THIS PAGE EXISTS ────────────────────────────────────────────────
//
// The recruitment chain the platform already models is
//
//     Job -> Application -> Candidate -> Assessment -> Report -> Interview
//         -> human decision
//
// and until now the middle of it was a list row. An employer could see that
// somebody had applied, and separately that an assessment existed, and
// separately again that a report had been released — three surfaces, and the
// recruiter holding the person together in their head. This is the one place
// where they are the same person, because in the database they always were.
//
// ── HOW THE PERSON IS RESOLVED ──────────────────────────────────────────
//
// Not by an email address, and not by anything the browser holds. The route
// carries an application id; getApplicationCandidate resolves
//
//     application -> applicant_user_id -> scp_subject_identities -> subject
//
// inside the database and returns a CANDIDATE. The applicant's auth id, their
// address and the subject id never reach this page, because this page has no
// use for any of them: the assessment step passes the application, the CV
// action passes the application, and the status action passes the application.
//
// The read models behind it are the existing ones — scp_application_candidate
// for who, scp_employer_person_overview for what happened, and
// scp_application_assessments for the assessments on this application — each
// re-verifying membership for itself. Nothing is re-derived here.
//
// ── WHAT IS DELIBERATELY ABSENT ─────────────────────────────────────────
//
// No Security Passport that the holder did not hand over. An application is
// consent to be considered for a job; it is not consent to disclose a
// Passport, and the two are still not the same click. A Passport reaches this
// page only through a disclosure its holder created naming THIS application,
// read back through one membership-checked function that answers "nothing"
// identically for a non-member, an unknown application, a revoked share, an
// expired one and a candidate who shared nothing. The section renders for
// every candidate either way, so its presence says nothing about the person.
//
// No ranking, no score, no recommendation, and no composite "candidate
// status". The application lifecycle and the assessment lifecycle are two
// lifecycles, shown side by side and never merged: `job_applications.status`
// says where the employer's process has got to, and the assessment stage says
// where the assessment has got to. A single blended badge would be a judgement
// the platform does not make.

import { PrepareInterviewButton } from "@/components/library/PrepareInterviewButton";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileText,
  Lock,
  MessagesSquare,
  Send,
  UserCheck,
} from "lucide-react";
import { ConfirmAction } from "@/components/employer/ConfirmAction";
import {
  AnswersPanel,
  BookingsPanel,
  CommunicationPanel,
  HistoryPanel,
  InternalNotesPanel,
  PanelSection,
  ResponsiblePicker,
} from "@/components/recruitment/ApplicationPanels";
import { StageBadge } from "@/components/recruitment/RecruitmentStatus";
import { recruitmentErrorKey } from "@/components/recruitment/errors";
import {
  getApplicationWorkspace,
  getCandidateNeighbours,
  markApplicationViewed,
} from "@/lib/recruitment/recruitment.functions";
import { isUnresolved } from "@/lib/recruitment/definitions";
import {
  markReturning,
  readListContext,
  recallListKeyFor,
  type ListContext,
} from "@/lib/recruitment/list-context";
import { formatStamp } from "@/lib/recruitment/format";
import type { MessageKind } from "@/lib/recruitment/message-templates";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import { EmployerErrorState } from "@/components/employer/EmployerErrorState";
import { RecruitmentPage } from "@/components/academy/AcademyWorkspace";
import { ApplicationAssessmentPanel } from "@/components/academy/ApplicationAssessmentPanel";
import { BesktApplicationPanel } from "@/components/beskt/BesktApplicationPanel";
import { ApplicationPassportPanel } from "@/components/employer/ApplicationPassportPanel";
import { listInterviewCasesForApplication } from "@/lib/interview-intelligence/runtime.functions";
import { CaseStatusChip } from "@/components/employer/interview/InterviewUi";
import { formatDate } from "@/lib/job-intelligence/date-format";
import {
  getApplicationCvSignedUrl,
  getApplicationSubmittedCv,
  getHiredEmployeeForApplication,
  updateApplicationStatusAsEmployer,
} from "@/lib/job-intelligence/applications.functions";
import { CvDocumentView } from "@/components/professional-identity/CvDocumentView";
import {
  APPLICATION_ACTION_LABEL_KEY,
  APPLICATION_STATUS_LABEL_KEY,
  EMPLOYER_NEXT_STATUSES,
  asApplicationStatus,
  type EmployerSettableStatus,
} from "@/lib/job-intelligence/application-status";
import {
  getApplicationCandidate,
  getEmployerReviewBoard,
  getMyReviewCapability,
  listApplicationAssessments,
  type ApplicationCandidate,
} from "@/lib/security-competency/academy-employer.functions";
import { ProcessContinuityStrip } from "@/components/employer/ProcessContinuityStrip";
import {
  projectAssessmentTrack,
  projectDecisionTrack,
  projectInterviewTrack,
  projectProcess,
  projectReportTrack,
  type TrackRead,
} from "@/lib/employer-continuity/process-projection";

export const Route = createFileRoute(
  "/_authenticated/employer/$employerSlug/applications/$applicationId",
)({
  ssr: false,
  component: CandidateRoute,
  errorComponent: EmployerErrorState,
  // `list` names the candidate list this application was opened from, so the
  // page can offer previous/next and return to the same filters and position.
  // A pasted link has none and still works; see lib/recruitment/list-context.
  validateSearch: (search) =>
    z.object({ list: z.string().max(20).optional().catch(undefined) }).parse(search),
});

function CandidateRoute() {
  const { employerSlug, applicationId } = Route.useParams();
  return (
    <RecruitmentPage employerSlug={employerSlug}>
      {(ws) => (
        <Candidate360
          key={applicationId}
          employerId={ws.employerId}
          employerSlug={employerSlug}
          employerName={ws.employerName}
          applicationId={applicationId}
          canAssign={ws.role === "owner" || ws.role === "admin"}
        />
      )}
    </RecruitmentPage>
  );
}

function Candidate360({
  employerId,
  employerSlug,
  employerName,
  applicationId,
  canAssign,
}: {
  employerId: string;
  employerSlug: string;
  employerName: string;
  applicationId: string;
  canAssign: boolean;
}) {
  const { t, tp, lang } = useT();
  const qc = useQueryClient();
  const candidateFn = useServerFn(getApplicationCandidate);
  const signCvFn = useServerFn(getApplicationCvSignedUrl);
  const setStatusFn = useServerFn(updateApplicationStatusAsEmployer);
  const hiredEmployeeFn = useServerFn(getHiredEmployeeForApplication);
  const submittedCvFn = useServerFn(getApplicationSubmittedCv);
  const interviewCasesFn = useServerFn(listInterviewCasesForApplication);
  const [actionError, setActionError] = useState<string | null>(null);
  const router = useRouter();
  const { list: listParam } = Route.useSearch();
  // The list key in the URL, or -- on the way back from a report or an
  // interview, which do not carry it -- the list this tab opened this
  // candidate from. Resolved on the client, where sessionStorage lives.
  const [listKey, setListKey] = useState<string | undefined>(listParam);
  const workspaceFn = useServerFn(getApplicationWorkspace);
  const viewedFn = useServerFn(markApplicationViewed);
  const [listCtx, setListCtx] = useState<ListContext | null>(null);
  const [pendingDecision, setPendingDecision] = useState<EmployerSettableStatus | null>(null);
  const [composeRequest, setComposeRequest] = useState<{
    kind: MessageKind;
    bookingId: string | null;
    nonce: number;
  } | null>(null);

  const candidateKey = ["employer", employerId, "application", applicationId, "candidate"];
  const recruitmentKey = ["employer", employerId, "application", applicationId, "recruitment"];

  // The recruitment half: answers, responsible person, bookings, messages,
  // internal notes and the stage history. One read, membership-checked.
  const workspaceQuery = useQuery({
    queryKey: recruitmentKey,
    queryFn: () => workspaceFn({ data: { employerId, applicationId } }),
  });
  const rw = workspaceQuery.data ?? null;

  // Opening the application is recorded as having been opened -- once, and
  // never as a stage change. The list shows "unopened" from this, and the
  // stage stays exactly where a person last put it.
  const viewedOnce = useRef(false);
  useEffect(() => {
    if (viewedOnce.current) return;
    viewedOnce.current = true;
    viewedFn({ data: { applicationId } })
      .then(() => {
        void qc.invalidateQueries({ queryKey: ["employer", employerId, "candidates"] });
      })
      .catch(() => {
        /* a missed receipt is not worth an error on the page */
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicationId]);

  function refreshRecruitment() {
    void qc.invalidateQueries({ queryKey: recruitmentKey });
    void qc.invalidateQueries({ queryKey: ["employer", employerId, "candidates"] });
    void qc.invalidateQueries({ queryKey: ["employer", employerId, "recruitment-overview"] });
  }

  const query = useQuery({
    queryKey: candidateKey,
    queryFn: () => candidateFn({ data: { applicationId } }),
  });

  // The list this was opened from, read once on the client. Without a key
  // in the URL, the list this tab last opened is recalled -- but only once
  // the application's own vacancy is known, so a recruitment list of
  // another vacancy is never taken for this one.
  const listJobId = query.data?.jobId ?? rw?.jobId ?? null;
  useEffect(() => {
    const key = listParam ?? recallListKeyFor(applicationId, listJobId);
    setListKey(key);
    setListCtx(readListContext(key));
  }, [listParam, applicationId, listJobId]);

  // Where this candidate sits in that list, from the server's own ordering.
  // Asked only for a paged recruitment list; a whole-read list (the
  // applications page) answers from the ids it stored.
  const neighboursFn = useServerFn(getCandidateNeighbours);
  const listQuery = listCtx?.query ?? null;
  const neighboursQuery = useQuery({
    queryKey: ["employer", employerId, "candidates", "neighbours", applicationId, listQuery],
    queryFn: () =>
      neighboursFn({
        data: { employerId, jobId: listQuery!.jobId, applicationId, view: listQuery!.view },
      }),
    enabled: listQuery !== null,
  });

  // A link to a section (the overview's upcoming interview opens
  // #candidate-bookings) lands before the sections exist, so the browser's own
  // jump finds nothing. Scroll once the page has rendered them.
  const hashScrolled = useRef(false);
  useEffect(() => {
    if (hashScrolled.current || !query.data || !rw) return;
    const id = window.location.hash.slice(1);
    if (!id) return;
    hashScrolled.current = true;
    window.requestAnimationFrame(() =>
      document.getElementById(id)?.scrollIntoView({ block: "start" }),
    );
  }, [query.data, rw]);

  // ── THE CV THE CANDIDATE ACTUALLY SUBMITTED ────────────────────────
  //
  // Reads the COPY stored on this application, never cv_documents -- there
  // is no employer read policy on that table and this page does not become
  // the exception. What comes back is the document as it stood when the
  // application was sent, so an edit the candidate made afterwards does not
  // change what this employer is looking at.
  //
  // Its own query rather than a field on the candidate read: a CV is the
  // largest payload on this page and the smallest number of people need it,
  // and scp_application_candidate is shared with surfaces that must not
  // start carrying one.
  // `hasCv` is true for an UPLOADED file and only for one, so an application
  // that has it cannot also carry a CQrityjob CV -- the table forbids both at
  // once. Skipping the read there is not an optimisation for its own sake: it
  // keeps the largest payload on this page off every request that could not
  // possibly need it.
  const submittedCvQuery = useQuery({
    queryKey: ["employer", employerId, "application", applicationId, "submitted-cv"],
    queryFn: () => submittedCvFn({ data: { applicationId } }),
    enabled: query.data ? !query.data.hasCv : false,
  });
  const submittedCv = submittedCvQuery.data ?? null;

  // Interview Intelligence cases for THIS application.
  //
  // scp_interview_cases.application_id has existed since the runtime migration;
  // nothing read it, so the application view and the interview workspace never
  // met. A recruiter had to know both existed and navigate between them by
  // hand, which is the gap the reuse audit was looking for.
  const interviewCasesQuery = useQuery({
    queryKey: ["interview-intelligence", "application", applicationId],
    queryFn: () => interviewCasesFn({ data: { employerId, applicationId } }),
  });
  const interviewCases = interviewCasesQuery.data?.cases ?? [];

  // ── THE PROCESS SPINE ───────────────────────────────────────────────
  //
  // Three reads, and not one of them new: every query below shares its cache
  // key with the panel or the section further down this page that already
  // made it, so the strip costs zero additional fetches and cannot disagree
  // with the sections it summarises.
  //
  // What the strip adds is the ANSWER a recruiter opens this page for -- where
  // are the four processes, and what is the one thing to do -- computed by a
  // pure projection that writes nothing, stores nothing and derives no track
  // from another.
  const assessmentsFn = useServerFn(listApplicationAssessments);
  const boardFn = useServerFn(getEmployerReviewBoard);
  const capabilityFn = useServerFn(getMyReviewCapability);

  const assessmentsQuery = useQuery({
    queryKey: ["employer", employerId, "application", applicationId, "assessments"],
    queryFn: () => assessmentsFn({ data: { applicationId } }),
  });
  const reviewBoardQuery = useQuery({
    queryKey: ["academy", "review-board", employerId],
    queryFn: () => boardFn({ data: { employerId } }),
  });
  const reviewCapabilityQuery = useQuery({
    queryKey: ["academy", "my-review-capability", employerId],
    queryFn: () => capabilityFn({ data: { employerId } }),
  });

  // How a read WENT, kept apart from what it found. `refused` is not inferred:
  // there is no client-side way to tell a policy refusal from any other
  // failure here, and guessing would be the same lie in the other direction.
  // Both are reported as "could not be read", which is what we actually know.
  const readOf = (q: { isLoading: boolean; isError: boolean }): TrackRead =>
    q.isLoading ? "loading" : q.isError ? "failed" : "ready";

  const assessmentTrack = projectAssessmentTrack(
    readOf(assessmentsQuery),
    assessmentsQuery.data ?? [],
  );
  const interviewTrack = projectInterviewTrack(readOf(interviewCasesQuery), interviewCases);
  const reportTrack = projectReportTrack(readOf(interviewCasesQuery), interviewCases);

  // ── WHERE THE HIRED PERSON NOW LIVES ──────────────────────────────────
  //
  // Queried, not just remembered from the mutation. An employer who hires and
  // then comes back tomorrow gets the same door as the one who hired thirty
  // seconds ago -- otherwise the only way from an application to the employee
  // it produced is to re-type the name, which is how one human becomes two
  // records. `hiredNow` is the mutation's own answer, used until the query
  // catches up so the link appears the instant the hire lands.
  const [hiredNow, setHiredNow] = useState<string | null>(null);
  const hiredEmployeeQuery = useQuery({
    queryKey: ["employer", employerId, "application", applicationId, "hired-employee"],
    queryFn: () => hiredEmployeeFn({ data: { applicationId } }),
    enabled: query.data?.applicationStatus === "hired",
  });
  const hiredEmployeeId = hiredNow ?? hiredEmployeeQuery.data?.employeeId ?? null;

  const setStatus = useMutation({
    // From the stage this page SHOWED: if a colleague moved the candidate in
    // the meantime the move is refused and the page reloads, rather than
    // silently applying over their change.
    mutationFn: (newStatus: EmployerSettableStatus) =>
      setStatusFn({
        data: {
          applicationId,
          newStatus,
          expectedStatus: (query.data?.applicationStatus ?? undefined) as
            | "submitted"
            | "reviewing"
            | "interview"
            | undefined,
        },
      }),
    onSuccess: (r) => {
      setActionError(null);
      setHiredNow(r.employeeId ?? null);
      refreshRecruitment();
      qc.invalidateQueries({ queryKey: candidateKey });
      // The list this page was opened from shows the same status.
      qc.invalidateQueries({ queryKey: ["employer", employerId, "applications"] });
      // Medarbetare has one more person in it, and Översikt counts them.
      qc.invalidateQueries({ queryKey: ["employer", employerId, "employees"] });
      qc.invalidateQueries({ queryKey: ["employer", employerId, "workforce-summary"] });
      qc.invalidateQueries({
        queryKey: ["employer", employerId, "application", applicationId, "hired-employee"],
      });
    },
    onError: (e: unknown) => {
      const code = (e as { message?: string })?.message ?? "";
      setActionError(
        code === "STATUS_UPDATE_FAILED" || code === ""
          ? t("employer.applications.error.statusUpdate")
          : t(recruitmentErrorKey(code)),
      );
      qc.invalidateQueries({ queryKey: candidateKey });
      refreshRecruitment();
    },
  });

  async function onDownloadCv() {
    setActionError(null);
    try {
      // The same short-lived signed URL the applications list uses. The path
      // is never held here; the server signs it for five minutes.
      const result = await signCvFn({ data: { applicationId } });
      window.open(result.url, "_blank", "noopener,noreferrer");
    } catch {
      setActionError(t("employer.applications.error.cvDownload"));
    }
  }

  // ── BACK TO THE SAME LIST ─────────────────────────────────────────────
  //
  // With a list context: to exactly the address the recruiter came from --
  // same filters, same sorting -- and the list scrolls back to where they
  // were. Without one (a pasted link, a new tab): to this recruitment's
  // candidate list, which is always a correct place to land.
  const jobIdForBack = query.data?.jobId ?? rw?.jobId ?? null;
  const backCls =
    "inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
  const backLink = listCtx ? (
    <button
      type="button"
      className={backCls}
      onClick={() => {
        if (listKey) markReturning(listKey);
        router.history.push(listCtx.href);
      }}
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      {t("rec.candidate.backToList")}
    </button>
  ) : jobIdForBack ? (
    <Link
      to="/employer/$employerSlug/jobs/$jobId"
      params={{ employerSlug, jobId: jobIdForBack }}
      className={backCls}
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      {t("rec.candidate.backToRecruitment")}
    </Link>
  ) : (
    <Link to="/employer/$employerSlug/applications" params={{ employerSlug }} className={backCls}>
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      {t("employer.candidate.backToApplications")}
    </Link>
  );

  const listNav = listCtx?.query
    ? (neighboursQuery.data ?? null)
    : listCtx?.ids
      ? (() => {
          const ids = listCtx.ids;
          const i = ids.indexOf(applicationId);
          return {
            position: i + 1,
            total: ids.length,
            previousId: i > 0 ? ids[i - 1] : null,
            nextId: i >= 0 && i < ids.length - 1 ? ids[i + 1] : null,
          };
        })()
      : null;
  // `position` is 0-based here, -1 when this candidate is not in the list.
  const position = listNav ? listNav.position - 1 : -1;
  const previousId = position >= 0 ? (listNav?.previousId ?? null) : null;
  const nextId = position >= 0 ? (listNav?.nextId ?? null) : null;
  const listTotal = listNav?.total ?? 0;
  const stepCls =
    "inline-flex min-h-9 items-center gap-1 rounded-md border border-border px-2.5 text-sm hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
  const topBar = (
    <nav
      aria-label={t("rec.candidate.navigation")}
      className="flex flex-wrap items-center justify-between gap-2"
    >
      {backLink}
      {listCtx && position >= 0 && (
        <span className="flex items-center gap-2">
          {previousId ? (
            <Link
              to="/employer/$employerSlug/applications/$applicationId"
              params={{ employerSlug, applicationId: previousId }}
              search={{ list: listKey }}
              className={stepCls}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              {t("rec.candidate.previous")}
            </Link>
          ) : (
            <span className={`${stepCls} opacity-40`} aria-disabled="true">
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              {t("rec.candidate.previous")}
            </span>
          )}
          <span className="text-xs tabular-nums text-muted-foreground">
            {t("rec.candidate.position")
              .replace("{n}", String(position + 1))
              .replace("{total}", String(listTotal))}
          </span>
          {nextId ? (
            <Link
              to="/employer/$employerSlug/applications/$applicationId"
              params={{ employerSlug, applicationId: nextId }}
              search={{ list: listKey }}
              className={stepCls}
            >
              {t("rec.candidate.next")}
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          ) : (
            <span className={`${stepCls} opacity-40`} aria-disabled="true">
              {t("rec.candidate.next")}
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </span>
          )}
        </span>
      )}
    </nav>
  );

  if (query.isLoading) {
    return (
      <div className="mx-auto w-full max-w-4xl">
        {backLink}
        <p className="mt-6 text-sm text-muted-foreground">{t("employer.loading")}</p>
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="mx-auto w-full max-w-4xl">
        {backLink}
        <p className="mt-6 text-sm text-destructive">{t("employer.candidate.error.load")}</p>
      </div>
    );
  }

  // Null covers both "no such application" and "not this organisation's",
  // because the read model deliberately does not tell them apart.
  if (!query.data) {
    return (
      <div className="mx-auto w-full max-w-4xl">
        {backLink}
        <h1 className="mt-4 text-2xl font-semibold text-foreground">
          {t("employer.candidate.notFound")}
        </h1>
        <p className="mt-2 max-w-[60ch] text-sm text-muted-foreground">
          {t("employer.candidate.notFoundBody")}
        </p>
      </div>
    );
  }

  const c: ApplicationCandidate = query.data;
  const status = asApplicationStatus(c.applicationStatus);

  // ── THE PROJECTION ──────────────────────────────────────────────────
  //
  // Every capability is read from the contract that governs ITS OWN action,
  // never from one role label standing in for four different rules:
  //
  //   review responses        a reviewer seat AND no conflict, per attempt,
  //                           from the same board the review workspace uses
  //   share a scored brief    scp_employer_assessment_pipeline computes
  //                           can_release as scored AND not yet released AND
  //                           owner/admin -- so for a brief_ready attempt this
  //                           is exactly the owner/admin half
  //
  // TWO, not four. Assigning an assessment (owner/admin) and planning an
  // interview (any active member) are also capability-gated, but not HERE:
  // the projection proposes neither as a next step, because neither process is
  // required and naming one would make the spine a funnel. Their controls are
  // gated at their own call sites -- `canAssign` on the assessment panel
  // below, and the interview section's own start link -- which is where a
  // control's permission belongs. Passing them in anyway would have read as a
  // permission check that was happening when nothing consulted it.
  //
  // None of this is enforcement; each destination and each write re-decides.
  // What it buys is a page that does not offer work the database will refuse.
  // THE BASIS FOR THE ATTEMPT THE ACTION WOULD OPEN.
  //
  // `scp_employer_review_board` answers per ATTEMPT -- an owner may review one
  // and be conflicted out of another, because they sat that one themselves. So
  // the basis has to be read for the attempt the review action actually
  // targets, which is `reviewAttemptId`: the attempt with responses
  // outstanding. It used to be read for a general "lead" attempt, which on an
  // application with several attempts could be a different one entirely --
  // answering "may you review THAT?" about a question nobody asked.
  const reviewBasis = assessmentTrack.reviewAttemptId
    ? ((reviewBoardQuery.data ?? []).find((b) => b.attemptId === assessmentTrack.reviewAttemptId)
        ?.basis ?? null)
    : null;

  // ── THE DECISION, DERIVED FROM THE APPLICATION AND NOTHING ELSE ─────
  //
  // Same read as the application row, because it is the same read: the status
  // this page already loaded. It is built here rather than inside
  // `projectProcess` for the reason every other track is -- the projection
  // performs no I/O and must be handed what the page already has.
  //
  // The employment record is passed in too. `hiredNow` is the mutation's own
  // answer so the door appears the instant a hire lands; the query catches up
  // on the next visit and gives the same answer to somebody returning
  // tomorrow.
  const decisionTrack = projectDecisionTrack("ready", c.applicationStatus, hiredEmployeeId);

  const projection = projectProcess({
    application: { read: "ready", status: c.applicationStatus },
    assessment: assessmentTrack,
    interview: interviewTrack,
    report: reportTrack,
    decision: decisionTrack,
    capabilities: {
      canReviewAssessment: reviewBasis === "authorised" || reviewBasis === "break_glass",
      canShareAssessmentBrief: canAssign,
    },
  });
  const nextStatuses = status ? (EMPLOYER_NEXT_STATUSES[status] ?? []) : [];
  const jobTitle = pickTitle(c.jobTitleSv, c.jobTitleEn, lang) ?? t("employer.candidate.noJob");
  const name = c.displayName ?? t("employer.applications.anonymousCandidate");

  // The person overview is per PERSON: its interview notes cover every
  // assessment this organisation ran for them. Only the notes on THIS
  // application's own attempts belong on this page -- a note from the same
  // candidate's other application is not evidence about this one.
  const ownAttempts = new Set(
    c.timeline
      .filter((r) => r.rowKind === "assessment" && r.applicationId === c.applicationId)
      .map((r) => r.attemptId),
  );
  const interviewNotes = c.timeline.filter(
    (r) => r.rowKind === "interview_note" && r.attemptId !== null && ownAttempts.has(r.attemptId),
  );
  const otherApplications = c.timeline.filter(
    (r) => r.rowKind === "application" && r.rowId !== c.applicationId,
  );

  const completed = rw ? rw.completionState !== "open" : false;
  const canDecide = rw?.canManage ?? false;
  const decisionNext = nextStatuses.filter((n) => canDecide || (n !== "hired" && n !== "rejected"));
  const sectionLinks: [string, TranslationKey][] = [
    ["candidate-application", "rec.section.application"],
    ["candidate-assessment", "rec.section.tests"],
    ["candidate-bookings", "rec.section.interviews"],
    ["candidate-passport", "employer.candidate.passport.heading"],
    ["candidate-decision", "rec.section.decision"],
    ["candidate-communication", "rec.section.communication"],
    ["candidate-notes", "rec.section.notes"],
    ["candidate-timeline", "rec.section.history"],
  ];

  return (
    <div className="mx-auto w-full max-w-4xl">
      {topBar}

      {/* ── Who, and for what ───────────────────────────────────────── */}
      <header className="mt-4">
        {/* The page is named for what it actually contains: this application,
            and what this organisation has done about it. Not a professional
            profile -- the employer holds no authorised access to one, and a
            heading that promised one would be describing data that is not
            there. */}
        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          {t("employer.candidate.overview")}
        </p>
        <h1
          className="mt-1 text-[1.5rem] font-semibold leading-tight tracking-tight text-foreground sm:text-3xl"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {name}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {jobTitle}
          {" · "}
          {t("employer.candidate.appliedOn")} {formatDate(c.appliedAt, lang)}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {/* Stage and decision in the one vocabulary every recruitment list
              uses, as text with an icon. */}
          <StageBadge status={c.applicationStatus} />
          {/* The vacancy itself, not the list it is somewhere in. This link
              used to land on Mina annonser and leave the recruiter to find the
              job again by name -- and a published job had no page to land on
              at all. `jobSlug` is no longer required: the hub is addressed by
              id and exists for every status, including the drafts and archived
              advertisements that have no public slug. */}
          {c.jobId && (
            <Link
              to="/employer/$employerSlug/jobs/$jobId"
              params={{ employerSlug, jobId: c.jobId }}
              className="text-xs font-medium text-accent hover:underline"
            >
              {t("employer.candidate.openJob")}
            </Link>
          )}
        </div>
        {/* Stage, responsible person and whether it has been opened: three
            different facts, each said once. */}
        {rw && (
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                {t("rec.col.responsible")}
              </dt>
              <dd className="mt-1">
                <ResponsiblePicker ws={rw} onChanged={refreshRecruitment} />
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                {t("rec.candidate.firstOpened")}
              </dt>
              <dd className="mt-1 text-muted-foreground">
                {rw.meta.firstViewedAt
                  ? formatStamp(rw.meta.firstViewedAt, lang)
                  : t("rec.candidate.openedNow")}
              </dd>
            </div>
          </dl>
        )}
        {workspaceQuery.isError && (
          <p
            role="alert"
            className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm"
          >
            {t("rec.candidate.recruitmentUnavailable")}{" "}
            <button
              type="button"
              className="font-medium underline"
              onClick={() => void workspaceQuery.refetch()}
            >
              {t("continuity.next.retry")}
            </button>
          </p>
        )}
        {completed && (
          <p className="mt-3 flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
            <Lock className="h-4 w-4" aria-hidden="true" />
            {t("rec.candidate.completedNotice")}
          </p>
        )}
      </header>

      {/* Jump to a section: the page is long because a recruitment is, and
          every part of it belongs to this one application. */}
      <nav
        aria-label={t("rec.candidate.sections")}
        className="sticky top-0 z-10 -mx-1 mt-4 flex gap-1 overflow-x-auto bg-background/95 px-1 py-2 backdrop-blur"
      >
        {sectionLinks.map(([id, key]) => (
          <a
            key={id}
            href={`#${id}`}
            className="whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t(key)}
          </a>
        ))}
      </nav>

      {/* ── The process, before anything long ────────────────────────
          Candidate, role, application status and the one next step are all
          above the fold at 1440px and on a 375px phone. The method, the CV,
          the Passport boundary and the governance notes are all still on this
          page, below, where a reader who wants them will look. */}
      <ProcessContinuityStrip
        projection={projection}
        employerSlug={employerSlug}
        applicationId={applicationId}
        onRetry={() => {
          // Re-runs only the reads that failed, and stays on this route: a
          // retry must never cost the recruiter their place.
          if (assessmentsQuery.isError) void assessmentsQuery.refetch();
          if (interviewCasesQuery.isError) void interviewCasesQuery.refetch();
        }}
      />

      {actionError && (
        <div
          role="alert"
          className="mt-4 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {actionError}
        </div>
      )}

      {/* ── The application itself ──────────────────────────────────── */}
      <section className="mt-8" aria-labelledby="candidate-application">
        <h2 id="candidate-application" className="text-lg font-semibold text-foreground">
          {t("employer.candidate.application.heading")}
        </h2>

        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-3">
          <Fact label={t("employer.candidate.fact.status")}>
            {status ? t(APPLICATION_STATUS_LABEL_KEY[status]) : c.applicationStatus}
          </Fact>
          <Fact label={t("employer.candidate.fact.applied")}>{formatDate(c.appliedAt, lang)}</Fact>
          <Fact label={t("employer.candidate.fact.updated")}>{formatDate(c.updatedAt, lang)}</Fact>
          {c.phone && (
            <Fact label={t("employer.candidate.fact.phone")}>
              <a href={`tel:${c.phone}`} className="text-accent hover:underline">
                {c.phone}
              </a>
            </Fact>
          )}
        </dl>

        {c.coverNote && (
          <div className="mt-6">
            <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              {t("employer.candidate.coverNote")}
            </h3>
            <p className="mt-2 max-w-[68ch] whitespace-pre-line text-sm leading-relaxed text-foreground">
              {c.coverNote}
            </p>
          </div>
        )}

        {/* The candidate's answers to this vacancy's questions, each beside the
            requirement it asks about. A "no" to a mandatory requirement is
            shown as what it is -- the candidate's own answer -- and never
            removes anybody from the list: the decision stays a person's. */}
        <div className="mt-6">
          <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            {t("rec.answers.heading")}
          </h3>
          <div className="mt-2">
            {rw ? (
              <AnswersPanel answers={rw.answers} />
            ) : workspaceQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">{t("employer.loading")}</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t("rec.candidate.recruitmentUnavailable")}
              </p>
            )}
          </div>
        </div>

        {/* An UPLOADED CV is a file, and a file is downloaded. Unchanged. */}
        {c.hasCv && (
          <button
            type="button"
            onClick={() => void onDownloadCv()}
            className="mt-6 inline-flex min-h-[36px] items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <FileText className="h-4 w-4" aria-hidden="true" />
            {t("employer.applications.action.downloadCv")}
          </button>
        )}

        {/* ── A CQRITYJOB CV IS NOT A FILE ─────────────────────────────
            So it is not offered as a download. It is rendered, by the same
            component the candidate saw when they chose it, from the copy
            this application stored. The heading says what it is in words --
            "CQrityjob CV" -- and never an id, a snapshot version or a
            document reference.

            No verifier attribution appears on it, deliberately and by
            construction: verification provenance is never stored, so this
            copy has none to show. Verified standing reaches this page the
            one way it is permitted to, through the Passport section below,
            which the candidate authorised separately. */}
        {submittedCv?.source === "cqrityjob_cv" && (
          <div className="mt-6">
            <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              {t("employer.candidate.cv.heading")}
            </h3>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                <FileText className="h-4 w-4 shrink-0" aria-hidden="true" />
                {t("employer.candidate.cv.cqrityjob")}
              </span>
              <span>
                {t("employer.candidate.cv.submittedOn").replace(
                  "{date}",
                  formatDate(submittedCv.submittedAt, lang),
                )}
              </span>
            </p>
            {submittedCv.unreadable ? (
              // Unknown is not none. The candidate DID send a CV; failing to
              // render it is our problem to report, never their omission to
              // imply.
              <p
                role="status"
                className="mt-3 rounded-lg border border-dashed border-border px-4 py-5 text-sm text-muted-foreground"
              >
                {t("employer.candidate.cv.unreadable")}
              </p>
            ) : submittedCv.document ? (
              <>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("employer.candidate.cv.snapshotNote")}
                </p>
                <div className="mt-3">
                  {/* Dated by the day the database last VERIFIED these facts
                      against the candidate's records, which is the moment of
                      submission -- never by today. This copy is a historical
                      artefact, and every expiry line on it is judged against
                      the same date, so a credential that lapsed after the
                      application was sent is not shown to the employer as
                      though the candidate had submitted a dead one. */}
                  <CvDocumentView
                    document={submittedCv.document}
                    renderedOn={submittedCv.checkedAt.slice(0, 10)}
                  />
                </div>
              </>
            ) : null}
          </div>
        )}
      </section>

      {/* ── The assessment step ─────────────────────────────────────── */}
      {/*  The same governed panel the applications list carries: it passes the
          APPLICATION, and the database resolves the candidate from it. There is
          one assignment path and this is it. */}
      <section className="mt-10" aria-labelledby="candidate-assessment">
        <h2 id="candidate-assessment" className="text-lg font-semibold text-foreground">
          {t("employer.candidate.assessment.heading")}
        </h2>
        <p className="mt-1 max-w-[68ch] text-sm text-muted-foreground">
          {t("employer.candidate.assessment.lede")}
        </p>
        <ApplicationAssessmentPanel
          employerId={employerId}
          employerSlug={employerSlug}
          applicationId={applicationId}
          // A test is for a candidate still in the process: not for one who
          // has been decided on or has withdrawn, and not in a completed
          // recruitment. What was already sent stays visible either way.
          canAssign={canAssign && !completed && status !== null && isUnresolved(status)}
          prepareInterview
        />
      </section>

      {/* ── Interview times ─────────────────────────────────────────── */}
      <div className="mt-10">
        <PanelSection
          id="candidate-bookings"
          title={t("rec.booking.heading")}
          lede={t("rec.booking.lede")}
        >
          {rw ? (
            <BookingsPanel
              ws={rw}
              employerId={employerId}
              candidateName={c.displayName}
              employerName={employerName}
              jobTitle={jobTitle}
              onChanged={refreshRecruitment}
              onInvite={(bookingId) => {
                setComposeRequest({ kind: "interview_invitation", bookingId, nonce: Date.now() });
                window.setTimeout(
                  () =>
                    document
                      .getElementById("candidate-communication")
                      ?.scrollIntoView({ behavior: "smooth" }),
                  50,
                );
              }}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              {workspaceQuery.isLoading
                ? t("employer.loading")
                : t("rec.candidate.recruitmentUnavailable")}
            </p>
          )}
        </PanelSection>
      </div>

      {/* ── Interview ───────────────────────────────────────────────── */}
      <section className="mt-10" aria-labelledby="candidate-interview">
        <h2 id="candidate-interview" className="text-lg font-semibold text-foreground">
          {t("employer.candidate.interview.heading")}
        </h2>
        <p className="mt-1 max-w-[68ch] text-sm text-muted-foreground">
          {t("employer.candidate.interview.lede")}
        </p>
        {interviewNotes.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
            {t("employer.candidate.interview.empty")}
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {interviewNotes.map((n) => (
              <li
                key={n.rowId}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border bg-background p-3"
              >
                <MessagesSquare
                  className="h-4 w-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <span className="text-sm font-medium text-foreground">
                  {n.titleSv ?? n.titleEn ?? "—"}
                </span>
                {n.status && (
                  <span className="text-xs text-muted-foreground">
                    {t(interviewOutcomeKey(n.status))}
                  </span>
                )}
                <span className="text-xs tabular-nums text-muted-foreground">
                  {formatDate(n.occurredAt, lang)}
                </span>
                {n.attemptId && (
                  <Link
                    to="/employer/$employerSlug/assessments/results/$attemptId"
                    params={{ employerSlug, attemptId: n.attemptId }}
                    className="text-xs font-medium text-accent hover:underline"
                  >
                    {t("employer.candidate.interview.open")}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Structured interview (Interview Intelligence) ───────────── */}
      {/*  A SEPARATE block from the notes above, not a replacement.
       *
       *  Phase 1's coexistence decision holds: scp_interview_notes is the
       *  assessment-era record of "an interview happened and here is what was
       *  written down", and it keeps working exactly as before. Interview
       *  Intelligence is a different thing -- a governed pack, pinned to a
       *  content hash, with evidence a human confirmed one item at a time --
       *  and blending the two into one list would tell a recruiter they are the
       *  same kind of record when they are not.
       *
       *  What this shows is PROCESS: which stage the case is at, whether a
       *  human still owes it a review, and whether the report is final. No
       *  level, no evidence, no assessment. The application page links into the
       *  interview; it does not restate it. */}
      <section className="mt-10" aria-labelledby="candidate-structured-interview">
        <h2 id="candidate-structured-interview" className="text-lg font-semibold text-foreground">
          {t("employer.candidate.structuredInterview.heading")}
        </h2>
        <p className="mt-1 max-w-[68ch] text-sm text-muted-foreground">
          {t("employer.candidate.structuredInterview.lede")}
        </p>

        {interviewCasesQuery.isLoading ? (
          <p role="status" className="mt-4 text-sm text-muted-foreground">
            {t("employer.candidate.structuredInterview.loading")}
          </p>
        ) : interviewCasesQuery.isError ? (
          /* A failed read is reported as a failed read.
           *
           *  This branch did not exist: the list came from `data?.cases ?? []`,
           *  so an error fell into the empty state below and told the recruiter
           *  that no interview had been planned -- under a button offering to
           *  plan one. Starting a second interview for a candidate who already
           *  has one is a real harm, and it was one keystroke away. */
          <div className="mt-4 rounded-lg border border-dashed border-border px-4 py-6">
            <p role="alert" className="text-sm text-foreground">
              {t("employer.candidate.structuredInterview.unavailable")}
            </p>
            <button
              type="button"
              onClick={() => void interviewCasesQuery.refetch()}
              className="mt-3 inline-flex min-h-11 items-center rounded-md border border-border px-3 text-sm font-medium hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {t("continuity.next.retry")}
            </button>
          </div>
        ) : interviewCases.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-border px-4 py-6">
            <p className="text-sm text-muted-foreground">
              {t("employer.candidate.structuredInterview.empty")}
            </p>
            {/* An interview before any test: the button asks for an
             *  explicitly chosen setup (there is no default role), and the
             *  database start (scp_iv_start_interview) binds this
             *  application's own candidate and job -- nothing about either is
             *  taken from the URL or the browser. After a test, the button
             *  sits on that test in the assessment panel instead. */}
            <PrepareInterviewButton
              employerId={employerId}
              employerSlug={employerSlug}
              applicationId={applicationId}
              assessmentAssignmentId={null}
            />
          </div>
        ) : (
          <ul className="mt-4 space-y-2">
            {interviewCases.map((ic) => (
              <li
                key={ic.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border bg-background p-3"
              >
                <MessagesSquare
                  className="h-4 w-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <span className="text-sm font-medium text-foreground">{ic.title}</span>
                {/* Workflow status only. The guide's validation label is
                    governance metadata: it is disclosed where the guide is
                    chosen and in the report's audit details, not on the row
                    a recruiter scans to find their next interview. */}
                <CaseStatusChip status={ic.status} />
                {ic.proposalsAwaitingReview > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {tp(
                      "employer.candidate.structuredInterview.pending",
                      ic.proposalsAwaitingReview,
                    )}
                  </span>
                )}
                <Link
                  to={
                    ic.reportFinalised
                      ? "/employer/$employerSlug/interview-intelligence/$caseId/report"
                      : "/employer/$employerSlug/interview-intelligence/$caseId/prepare"
                  }
                  params={{ employerSlug, caseId: ic.id }}
                  className="ml-auto inline-flex min-h-11 items-center text-xs font-medium text-accent hover:underline"
                >
                  {ic.reportFinalised
                    ? t("employer.candidate.structuredInterview.openReport")
                    : t("employer.candidate.structuredInterview.open")}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── BESKT preparation ───────────────────────────────────────── */}
      {/*  Metodstöd för rekrytering, on the one surface where the method has
       *  a real employer, job, application and candidate to attach to. The
       *  panel starts the preparation and later reads back what the candidate
       *  submitted; it never shows a draft, and it interprets nothing.
       *
       *  It renders for every application, and says "not available to you
       *  yet" when no governed method has been published and admitted --
       *  which, until the five human review gates are passed, is always. */}
      <section className="mt-10" aria-labelledby="candidate-beskt">
        <h2 id="candidate-beskt" className="sr-only">
          {t("beskt.start.title")}
        </h2>
        <BesktApplicationPanel
          employerId={employerId}
          employerSlug={employerSlug}
          applicationId={applicationId}
        />
      </section>

      {/* ── Security Passport ───────────────────────────────────────── */}
      {/*  The section this page has always had, and the same guarantee.
       *
       *  A recruiter looking at a candidate will reasonably wonder where the
       *  Security Passport fits, and silence is the worst answer: it invites
       *  the assumption that the platform is withholding something, or that a
       *  Passport can be obtained by asking support. So the product says where
       *  it fits and shows only what the holder gave it.
       *
       *  The section renders for EVERY candidate on the platform, exactly as
       *  it did when it could show nothing at all. That is the property worth
       *  protecting: a section that appeared only for holders would disclose
       *  precisely the fact an employer is not entitled to. Its heading and
       *  its lede are unconditional, and the panel below renders the pinned
       *  "nothing has been shared with your organisation" sentence for every
       *  case that is not an explicit, live, holder-created disclosure naming
       *  THIS application -- including loading, error, revoked and expired.
       *
       *  Applying for a job is still not consent. What changed is that the
       *  holder now has a way to give consent deliberately, per application,
       *  and to withdraw it; see the panel's own header and rules 3b/3d of
       *  scripts/passport-separation-check.ts, which permit this one
       *  integration and still close every other recruitment surface. */}
      <section className="mt-10" aria-labelledby="candidate-passport">
        <h2 id="candidate-passport" className="text-lg font-semibold text-foreground">
          {t("employer.candidate.passport.heading")}
        </h2>
        <ApplicationPassportPanel applicationId={applicationId} />
        <p className="mt-2 max-w-[68ch] text-sm text-muted-foreground">
          {t("employer.candidate.passport.lede")}
        </p>
      </section>

      {/* ── The decision, which stays a person's ────────────────────── */}
      <section className="mt-10" aria-labelledby="candidate-decision">
        <h2 id="candidate-decision" className="text-lg font-semibold text-foreground">
          {t("employer.candidate.decision.heading")}
        </h2>
        <p className="mt-1 max-w-[68ch] text-sm text-muted-foreground">
          {t("employer.candidate.decision.lede")}
        </p>
        {/* The interview report, referenced rather than restated.
         *
         *  §12's requirement, and the reason it is a reference: the decision is
         *  taken here, and the evidence behind it is a finalised, immutable
         *  document with its own content hash. Copying its contents into this
         *  page would create a second version that could drift; naming the hash
         *  means the person deciding, and anybody reviewing the decision later,
         *  can tell exactly which document informed it.
         *
         *  Every section above keeps its own source identity -- application,
         *  assessment observations, Passport-verified facts, human-confirmed
         *  interview evidence -- and nothing is blended into a total. There is
         *  no overall score anywhere on this page, and this block adds none. */}
        {interviewCases
          .filter((ic) => ic.reportFinalised)
          .map((ic) => (
            <div
              key={ic.id}
              className="mt-4 rounded-lg border border-border bg-[color:var(--surface-subtle)] p-3 text-sm"
            >
              <p className="font-medium text-foreground">
                {t("employer.candidate.decision.interviewReport")}
              </p>
              <p className="mt-1 text-muted-foreground">
                {t("employer.candidate.decision.interviewReportNote")}
              </p>
              {ic.reportContentHash && (
                <p className="mt-2 font-mono text-xs text-muted-foreground">
                  {ic.reportContentHash.slice(0, 16)}
                </p>
              )}
              <Link
                to="/employer/$employerSlug/interview-intelligence/$caseId/report"
                params={{ employerSlug, caseId: ic.id }}
                className="mt-2 inline-flex min-h-11 items-center text-xs font-medium text-accent hover:underline"
              >
                {t("employer.candidate.structuredInterview.openReport")}
              </Link>
            </div>
          ))}

        {nextStatuses.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            {t("employer.candidate.decision.closed")}
          </p>
        ) : (
          <div className="mt-4 flex flex-wrap gap-2">
            {decisionNext.map((next) => (
              <button
                key={next}
                type="button"
                disabled={setStatus.isPending || completed}
                onClick={() =>
                  next === "hired" || next === "rejected"
                    ? setPendingDecision(next)
                    : setStatus.mutate(next)
                }
                className="inline-flex min-h-[36px] items-center rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60"
              >
                {t(APPLICATION_ACTION_LABEL_KEY[next])}
              </button>
            ))}
          </div>
        )}
        {/* Restricted seats see why the decision buttons are absent, rather
            than wondering where they went. The database refuses the act for
            them either way. */}
        {rw && !canDecide && nextStatuses.some((n) => n === "hired" || n === "rejected") && (
          <p className="mt-2 text-xs text-muted-foreground">{t("rec.decision.restricted")}</p>
        )}
        <p className="mt-2 text-xs text-muted-foreground">{t("rec.decision.noAutoMessage")}</p>
        {/* After an outcome is recorded, telling the candidate is one click
            away -- and still a separate, reviewed act. */}
        {(c.applicationStatus === "rejected" || c.applicationStatus === "hired") && canDecide && (
          <button
            type="button"
            onClick={() => {
              setComposeRequest({
                kind: c.applicationStatus === "rejected" ? "rejection" : "offer",
                bookingId: null,
                nonce: Date.now(),
              });
              window.setTimeout(
                () =>
                  document
                    .getElementById("candidate-communication")
                    ?.scrollIntoView({ behavior: "smooth" }),
                50,
              );
            }}
            className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium hover:bg-muted/40"
          >
            <Send className="h-4 w-4" aria-hidden="true" />
            {t("rec.decision.tellCandidate")}
          </button>
        )}
        {pendingDecision && (
          <ConfirmAction
            open
            onOpenChange={(o) => !o && setPendingDecision(null)}
            tone={pendingDecision === "rejected" ? "destructive" : "default"}
            busy={setStatus.isPending}
            title={`${t(APPLICATION_ACTION_LABEL_KEY[pendingDecision])} \u2014 ${name}`}
            consequence={t(
              pendingDecision === "hired"
                ? "rec.decision.confirmHired"
                : "rec.decision.confirmRejected",
            )}
            confirmLabel={t(APPLICATION_ACTION_LABEL_KEY[pendingDecision])}
            cancelLabel={t("rec.common.cancel")}
            onConfirm={() => {
              const d = pendingDecision;
              setPendingDecision(null);
              setStatus.mutate(d);
            }}
          />
        )}

        {/* Hiring used to end here, with a status and nowhere to go. The same
            person is now in Medarbetare, so the page says so and offers the
            door -- otherwise an employer's next move is to re-type the name
            into the employee form and create a second record of one human. */}
        {hiredEmployeeId && (
          <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-border bg-[color:var(--surface-subtle)] p-3 text-sm text-foreground">
            <UserCheck className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
            {t("employer.candidate.decision.nowEmployee")}
            <Link
              to="/employer/$employerSlug/workforce/$personId"
              params={{ employerSlug, personId: hiredEmployeeId }}
              className="font-medium text-accent underline-offset-2 hover:underline"
            >
              {t("employer.candidate.decision.openEmployee")}
            </Link>
          </p>
        )}
      </section>

      {/* ── Communication with the candidate ───────────────────────── */}
      <div className="mt-10 space-y-6">
        <PanelSection
          id="candidate-communication"
          title={t("rec.message.heading")}
          lede={t("rec.message.lede")}
        >
          {rw ? (
            <CommunicationPanel
              ws={rw}
              employerId={employerId}
              candidateName={c.displayName}
              employerName={employerName}
              jobTitle={jobTitle}
              composeRequest={composeRequest}
              onComposeHandled={() => setComposeRequest(null)}
              onChanged={refreshRecruitment}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              {workspaceQuery.isLoading
                ? t("employer.loading")
                : t("rec.candidate.recruitmentUnavailable")}
            </p>
          )}
        </PanelSection>

        {/* ── Internal notes: the team's, never the candidate's ────────── */}
        <PanelSection
          id="candidate-notes"
          title={t("rec.notes.heading")}
          lede={t("rec.notes.lede")}
        >
          {rw ? <InternalNotesPanel ws={rw} onChanged={refreshRecruitment} /> : null}
        </PanelSection>

        <PanelSection
          id="candidate-timeline"
          title={t("rec.history.heading")}
          lede={t("rec.history.lede")}
        >
          {rw ? <HistoryPanel ws={rw} /> : null}
        </PanelSection>
      </div>

      {/* ── The rest of this person's history with THIS organisation ── */}
      {otherApplications.length > 0 && (
        <section className="mt-10 pb-4" aria-labelledby="candidate-history">
          <h2 id="candidate-history" className="text-lg font-semibold text-foreground">
            {t("employer.candidate.history.heading")}
          </h2>
          <p className="mt-1 max-w-[68ch] text-sm text-muted-foreground">
            {t("employer.candidate.history.lede")}
          </p>
          <ul className="mt-4 space-y-2">
            {otherApplications.map((a) => (
              <li
                key={a.rowId}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border bg-background p-3"
              >
                <ClipboardList
                  className="h-4 w-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <Link
                  to="/employer/$employerSlug/applications/$applicationId"
                  params={{ employerSlug, applicationId: a.rowId }}
                  className="text-sm font-medium text-foreground hover:text-accent hover:underline"
                >
                  {pickTitle(a.titleSv, a.titleEn, lang) ?? t("employer.candidate.noJob")}
                </Link>
                <HistoryStatus value={a.status} />
                <span className="text-xs tabular-nums text-muted-foreground">
                  {formatDate(a.occurredAt, lang)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function HistoryStatus({ value }: { value: string | null }) {
  const { t } = useT();
  if (!value) return null;
  const status = asApplicationStatus(value);
  return (
    <span className="inline-flex rounded-full border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground">
      {status ? t(APPLICATION_STATUS_LABEL_KEY[status]) : value}
    </span>
  );
}

/** The three outcomes an interview note can carry. Anything else renders as
 *  the neutral one rather than as a raw identifier. */
function interviewOutcomeKey(outcome: string): TranslationKey {
  switch (outcome) {
    case "evidence_confirmed":
      return "employer.candidate.interview.outcome.confirmed";
    case "evidence_not_confirmed":
      return "employer.candidate.interview.outcome.notConfirmed";
    default:
      return "employer.candidate.interview.outcome.context";
  }
}

function pickTitle(sv: string | null, en: string | null, lang: string): string | null {
  return (lang === "en" ? (en ?? sv) : (sv ?? en)) || null;
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-foreground">{children}</dd>
    </div>
  );
}
