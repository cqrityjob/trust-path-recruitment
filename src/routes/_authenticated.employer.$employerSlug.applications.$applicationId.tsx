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

import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowLeft, ClipboardList, FileText, MessagesSquare } from "lucide-react";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import { EmployerErrorState } from "@/components/employer/EmployerErrorState";
import { RecruitmentPage } from "@/components/academy/AcademyWorkspace";
import { ApplicationAssessmentPanel } from "@/components/academy/ApplicationAssessmentPanel";
import { ApplicationPassportPanel } from "@/components/employer/ApplicationPassportPanel";
import { formatDate } from "@/lib/job-intelligence/date-format";
import {
  getApplicationCvSignedUrl,
  updateApplicationStatusAsEmployer,
} from "@/lib/job-intelligence/applications.functions";
import {
  APPLICATION_ACTION_LABEL_KEY,
  APPLICATION_STATUS_LABEL_KEY,
  EMPLOYER_NEXT_STATUSES,
  asApplicationStatus,
  type EmployerSettableStatus,
} from "@/lib/job-intelligence/application-status";
import {
  getApplicationCandidate,
  type ApplicationCandidate,
} from "@/lib/security-competency/academy-employer.functions";

export const Route = createFileRoute(
  "/_authenticated/employer/$employerSlug/applications/$applicationId",
)({
  ssr: false,
  component: CandidateRoute,
  errorComponent: EmployerErrorState,
});

function CandidateRoute() {
  const { employerSlug, applicationId } = Route.useParams();
  return (
    <RecruitmentPage employerSlug={employerSlug}>
      {(ws) => (
        <Candidate360
          employerId={ws.employerId}
          employerSlug={employerSlug}
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
  applicationId,
  canAssign,
}: {
  employerId: string;
  employerSlug: string;
  applicationId: string;
  canAssign: boolean;
}) {
  const { t, lang } = useT();
  const qc = useQueryClient();
  const candidateFn = useServerFn(getApplicationCandidate);
  const signCvFn = useServerFn(getApplicationCvSignedUrl);
  const setStatusFn = useServerFn(updateApplicationStatusAsEmployer);
  const [actionError, setActionError] = useState<string | null>(null);

  const candidateKey = ["employer", employerId, "application", applicationId, "candidate"];

  const query = useQuery({
    queryKey: candidateKey,
    queryFn: () => candidateFn({ data: { applicationId } }),
  });

  const setStatus = useMutation({
    mutationFn: (newStatus: EmployerSettableStatus) =>
      setStatusFn({ data: { applicationId, newStatus } }),
    onSuccess: () => {
      setActionError(null);
      qc.invalidateQueries({ queryKey: candidateKey });
      // The list this page was opened from shows the same status.
      qc.invalidateQueries({ queryKey: ["employer", employerId, "applications"] });
    },
    onError: () => setActionError(t("employer.applications.error.statusUpdate")),
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

  const backLink = (
    <Link
      to="/employer/$employerSlug/applications"
      params={{ employerSlug }}
      className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      {t("employer.candidate.backToApplications")}
    </Link>
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
  const nextStatuses = status ? (EMPLOYER_NEXT_STATUSES[status] ?? []) : [];
  const jobTitle = pickTitle(c.jobTitleSv, c.jobTitleEn, lang) ?? t("employer.candidate.noJob");
  const name = c.displayName ?? t("employer.applications.anonymousCandidate");

  const interviewNotes = c.timeline.filter((r) => r.rowKind === "interview_note");
  const otherApplications = c.timeline.filter(
    (r) => r.rowKind === "application" && r.rowId !== c.applicationId,
  );

  return (
    <div className="mx-auto w-full max-w-4xl">
      {backLink}

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
          <span className="inline-flex rounded-full border border-border bg-card px-2.5 py-0.5 text-xs font-medium text-foreground">
            {status ? t(APPLICATION_STATUS_LABEL_KEY[status]) : c.applicationStatus}
          </span>
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
      </header>

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
          canAssign={canAssign}
        />
      </section>

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
        {nextStatuses.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            {t("employer.candidate.decision.closed")}
          </p>
        ) : (
          <div className="mt-4 flex flex-wrap gap-2">
            {nextStatuses.map((next) => (
              <button
                key={next}
                type="button"
                disabled={setStatus.isPending}
                onClick={() => setStatus.mutate(next)}
                className="inline-flex min-h-[36px] items-center rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60"
              >
                {t(APPLICATION_ACTION_LABEL_KEY[next])}
              </button>
            ))}
          </div>
        )}
      </section>

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
