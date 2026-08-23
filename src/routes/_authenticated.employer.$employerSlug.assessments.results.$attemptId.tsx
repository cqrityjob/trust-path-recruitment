// A released report, employer view — two audiences, one snapshot.
//
// Maturity levels and the evidence behind them. There is no total, no
// percentage and no overall verdict anywhere on this page — not because they
// are hidden, but because the snapshot contains none and the components that
// render it cannot accept one.
//
// Safety-critical findings render from their own field, above the fold,
// regardless of how strong the rest of the profile is.
//
// ── WHY THE PAGE FORKS ON personContext ───────────────────────────
//
// A candidate report and an employee report answer different questions from the
// same evidence. A recruiter is deciding what the next step in a hiring process
// should be; a manager is deciding what to train and watching a picture move
// across releases. Report V2 restructures the FIRST of those — decision support
// at the top, methodology once at the bottom — and deliberately leaves the
// workforce report exactly as it was, because development recommendations and
// progress over time are not improved by a recruiter's ordering.
//
// The fork is read from the FROZEN context, never from the live employment
// record: an employment that starts later must not retroactively turn a
// candidate's report into an employee's.
//
// A brief-less snapshot (released before the brief existed) always renders the
// legacy layout, whichever audience it is for. History is not rewritten, and a
// page that degrades to what it showed last year is better than one that
// invents the sections it cannot fill.

import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ChevronDown } from "lucide-react";
import { z } from "zod";
import { useT } from "@/i18n/context";
import { EmployerErrorState } from "@/components/employer/EmployerErrorState";
import { AcademyHeading, AcademyPage } from "@/components/academy/AcademyWorkspace";
import { logAcademyError } from "@/lib/security-competency/rpc-errors";
import type { DecisionSupport } from "@/lib/security-competency/decision-support";
import type { ReportBrief } from "@/lib/security-competency/academy-employer.functions";
import { EmployerDecisionPanel } from "@/components/academy/EmployerDecisionPanel";
import { CandidateBrief, InterviewNotesPanel } from "@/components/academy/CandidateBrief";
import { DecisionSummary, ReportContextPanel } from "@/components/academy/ReportContextPanel";
import {
  DecisionSupportSummary,
  RecruitmentActions,
} from "@/components/academy/DecisionSupportSummary";
import {
  CompetencyOverviewSection,
  InterviewGuideSection,
  InterviewQuestions,
  SelfReportedSection,
} from "@/components/academy/RecruitmentReportSections";
import { ReportMethodSection } from "@/components/academy/ReportMethodSection";
import {
  buildDecisionSupport,
  buildDecisionSupportInput,
} from "@/lib/security-competency/decision-support";
import {
  EvidenceCoverage,
  evidenceStateLabelKey,
  EvidenceStateRow,
  NoEvidenceState,
  ReportLimitations,
  SafetyFlagNotice,
} from "@/components/academy/MaturityDisplay";
import {
  getAcademyReport,
  getDevelopmentRecommendations,
  getSubjectProgress,
  resolveParticipantIdentity,
  type ProgressRow,
  type ReportSnapshot,
} from "@/lib/security-competency/academy-employer.functions";

// ── HOW THE REPORT KNOWS WHICH APPLICATION IT BELONGS TO ─────────────
//
// It is told, by whoever linked here. The attempt-to-application edge lives on
// assessment_assignments, and reading it from this page would mean traversing
// scp_attempts — a table an employer member deliberately cannot select, because
// attempts belong to the person who sat them. Rather than open a read model to
// close a navigation gap, the two surfaces that KNOW the application (the
// candidate page and the participants list) pass it, and the report renders the
// way back only when it has one. Arriving without it costs nothing: the page
// still returns to the participants list, which is where it came from.
const searchSchema = z.object({
  // Optional and forgiving: a malformed id in a pasted URL should cost the
  // return link, never the report.
  application: z.string().uuid().optional().catch(undefined),
});

export const Route = createFileRoute(
  "/_authenticated/employer/$employerSlug/assessments/results/$attemptId",
)({
  ssr: false,
  component: ResultsRoute,
  errorComponent: EmployerErrorState,
  validateSearch: (search) => searchSchema.parse(search),
});

function ResultsRoute() {
  const { employerSlug, attemptId } = Route.useParams();
  const { application } = Route.useSearch();
  return (
    <AcademyPage employerSlug={employerSlug}>
      {(ws) => (
        <Report
          attemptId={attemptId}
          employerSlug={employerSlug}
          employerId={ws.employerId}
          applicationId={application ?? null}
          canDecide={ws.role === "owner" || ws.role === "admin"}
        />
      )}
    </AcademyPage>
  );
}

function Report({
  attemptId,
  employerSlug,
  employerId,
  applicationId,
  canDecide,
}: {
  attemptId: string;
  employerSlug: string;
  employerId: string;
  applicationId: string | null;
  canDecide: boolean;
}) {
  const { t, lang } = useT();
  const reportFn = useServerFn(getAcademyReport);
  const recsFn = useServerFn(getDevelopmentRecommendations);
  const progressFn = useServerFn(getSubjectProgress);
  const resolveFn = useServerFn(resolveParticipantIdentity);
  const [identity, setIdentity] = useState<string | null>(null);

  const report = useQuery({
    queryKey: ["academy", "report", attemptId, "employer"],
    queryFn: () => reportFn({ data: { attemptId, audience: "employer" as const } }),
  });

  const subjectId = report.data?.subjectId;
  const recs = useQuery({
    queryKey: ["academy", "recs", subjectId],
    queryFn: () => recsFn({ data: { subjectId: subjectId! } }),
    enabled: Boolean(subjectId),
  });
  const progress = useQuery({
    queryKey: ["academy", "progress", subjectId],
    queryFn: () => progressFn({ data: { subjectId: subjectId! } }),
    enabled: Boolean(subjectId),
  });

  if (report.isLoading) {
    return <p className="text-sm text-muted-foreground">{t("employer.loading")}</p>;
  }
  // A FAILED request and a report that simply is not released yet are different
  // situations, and saying "not released" for both would have an employer wait
  // for something that was never coming. getAcademyReport returns null for a
  // genuine no-row, so isError is the only signal that something broke.
  if (report.isError) {
    const { kind } = logAcademyError("assessments/results", report.error);
    return (
      <div
        role="alert"
        className="rounded-[12px] border border-border bg-[color:var(--surface-subtle)] p-6"
      >
        <p className="text-sm font-semibold text-foreground">
          {t(
            kind === "backend_unavailable"
              ? "academy.error.unavailableTitle"
              : "academy.error.failedTitle",
          )}
        </p>
        <p className="mt-2 max-w-[62ch] text-[13px] leading-relaxed text-muted-foreground">
          {t(
            kind === "backend_unavailable"
              ? "academy.error.unavailableBody"
              : "academy.error.failedBody",
          )}
        </p>
      </div>
    );
  }
  if (!report.data) {
    return (
      <NoEvidenceState
        title={t("academy.results.notReleasedTitle")}
        body={t("academy.results.notReleasedBody")}
      />
    );
  }

  const r = report.data;
  const limitations = lang === "en" ? r.limitationsEn : r.limitationsSv;
  const releases = new Set((progress.data ?? []).map((p: { releasedAt: string }) => p.releasedAt));
  // Read from the frozen context, not from the live employment record: what
  // this report is about was decided when it was released, and an employment
  // that starts later must not retroactively turn a candidate's report into an
  // employee's.
  const isCandidate = r.context?.personContext === "candidate";

  // Report V2 needs a brief to build from. A candidate snapshot without one
  // predates the brief and takes the legacy path with everybody else.
  if (isCandidate && r.brief) {
    const support = buildDecisionSupport(buildDecisionSupportInput(r.brief, r.safetyFlags.length));
    return (
      <CandidateDecisionSupportReport
        report={r}
        support={support}
        limitations={limitations}
        attemptId={attemptId}
        employerSlug={employerSlug}
        employerId={employerId}
        applicationId={applicationId}
        canDecide={canDecide}
        identity={identity}
        onResolveIdentity={() =>
          void resolveFn({ data: { employerId, subjectId: r.subjectId } }).then((x) =>
            setIdentity(x?.email ?? t("academy.participants.identityRefused")),
          )
        }
      />
    );
  }

  return (
    <>
      <Link
        to="/employer/$employerSlug/assessments/participants"
        params={{ employerSlug }}
        className="no-print mb-4 inline-flex min-h-[44px] items-center gap-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {t("academy.results.back")}
      </Link>

      <AcademyHeading
        title={t("academy.results.title")}
        lede={`${t("academy.results.releasedOn")} ${new Date(r.releasedAt).toLocaleDateString(
          lang === "en" ? "en-GB" : "sv-SE",
        )}`}
      />

      <ReportContextPanel
        context={r.context}
        reportId={r.id}
        releasedAt={r.releasedAt}
        identityAction={
          identity ? (
            <p className="text-[13px] text-foreground">{identity}</p>
          ) : (
            <button
              type="button"
              onClick={() =>
                void resolveFn({ data: { employerId, subjectId: r.subjectId } }).then((x) =>
                  setIdentity(x?.email ?? t("academy.participants.identityRefused")),
                )
              }
              className="inline-flex min-h-[44px] items-center rounded-[8px] border border-border px-3 text-[13px] font-medium text-foreground hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {t("academy.participants.showIdentity")}
            </button>
          )
        }
      />

      <DecisionSummary lines={r.lines} context={r.context} safetyCount={r.safetyFlags.length} />

      <SafetyFlagNotice count={r.safetyFlags.length} />

      {/* The brief comes FIRST, ahead of the competency lines, because those two
          sections answer different questions and the recruiter's question is the
          brief's. Reports released before the brief existed carry none, and the
          page degrades to exactly what it showed before. */}
      {r.brief && <CandidateBrief brief={r.brief} attemptId={attemptId} canRecord={canDecide} />}

      <EvidenceCoverage
        observations={
          r.context?.evidenceObservations ?? r.lines.reduce((n, l) => n + l.observations, 0)
        }
        contexts={r.context?.evidenceContexts ?? 1}
        bodyKey="academy.coverage.employerBody"
      />

      {/* Detailed evidence. Kept, and kept below: this is the maturity axis —
          how much evidence exists across occasions — which every single-occasion
          run answers the same way. It is the honest denominator under the brief,
          not the thing a recruiter reads first. */}
      <section className="mt-6 rounded-[14px] border border-border bg-card p-5">
        <h2 className="mb-2 text-sm font-semibold text-foreground">
          {t("academy.results.competencies")}
        </h2>
        {r.lines.length === 0 ? (
          <NoEvidenceState
            title={t("academy.results.noEvidenceTitle")}
            body={t("academy.results.noEvidenceBody")}
          />
        ) : (
          r.lines.map((l) => (
            <EvidenceStateRow
              key={l.competencyCode}
              name={lang === "en" ? l.competencyNameEn : l.competencyNameSv}
              state={l.evidenceState}
              observations={l.observations}
              prompt={lang === "en" ? l.followupEn : l.followupSv}
            />
          ))
        )}
      </section>

      {/* Development recommendations and the progress table are about somebody
          the organisation employs: what to train next, and how the picture has
          moved across releases. Neither question exists for a candidate -- they
          have no history here and no development plan with us, and offering one
          would read as planning the career of a person nobody has hired. Both
          sections are therefore for employees only. */}
      {!isCandidate && (recs.data?.length ?? 0) > 0 && (
        <section className="mt-6 rounded-[14px] border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground">
            {t("academy.results.recommendations")}
          </h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
            {t("academy.results.recommendationsLede")}
          </p>
          <ul className="mt-4 space-y-3">
            {(recs.data ?? []).map((m) => (
              <li key={m.moduleVersionId} className="rounded-[10px] border border-border p-4">
                <p className="text-sm font-semibold text-foreground">
                  {lang === "en" ? m.nameEn : m.nameSv}
                </p>
                <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                  {lang === "en" ? m.summaryEn : m.summarySv}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {t("academy.results.addresses")} {lang === "en" ? m.addressesEn : m.addressesSv}
                  {m.estimatedMinutes ? ` · ${m.estimatedMinutes} min` : ""}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Progress needs at least two releases to mean anything, and says so
          rather than drawing a one-point trend line. */}
      {!isCandidate && (
        <section className="mt-6 rounded-[14px] border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground">{t("academy.results.progress")}</h2>
          {releases.size < 2 ? (
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
              {t("academy.results.progressNeedsTwo")}
            </p>
          ) : (
            <ProgressTable rows={progress.data ?? []} />
          )}
        </section>
      )}

      {/* Interview evidence last, after the brief and the detailed evidence:
          what the conversation gave is recorded once the recruiter has read
          everything the assessment gave. */}
      {r.brief && (
        <InterviewNotesPanel
          attemptId={attemptId}
          canRecord={canDecide}
          areas={r.brief.observed.map((o) => ({
            code: o.areaCode,
            label: lang === "en" ? o.areaEn : o.areaSv,
          }))}
        />
      )}

      <EmployerDecisionPanel attemptId={attemptId} canDecide={canDecide} />

      <ReportLimitations items={limitations} />
    </>
  );
}

function ProgressTable({ rows }: { rows: ProgressRow[] }) {
  const { t, lang } = useT();
  const dates = Array.from(new Set(rows.map((r) => r.releasedAt))).sort();
  const comps = Array.from(new Set(rows.map((r) => r.competencyCode)));
  const at = (c: string, d: string) =>
    rows.find((r) => r.competencyCode === c && r.releasedAt === d);

  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[32rem] text-left text-[13px]">
        <caption className="sr-only">{t("academy.results.progress")}</caption>
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className="pb-2 pr-4 font-medium text-muted-foreground">
              {t("academy.results.competency")}
            </th>
            {dates.map((d) => (
              <th key={d} scope="col" className="pb-2 pr-4 font-medium text-muted-foreground">
                {new Date(d).toLocaleDateString(lang === "en" ? "en-GB" : "sv-SE")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {comps.map((c) => {
            const first = rows.find((r) => r.competencyCode === c);
            return (
              <tr key={c} className="border-b border-border last:border-b-0">
                <th scope="row" className="py-2.5 pr-4 font-medium text-foreground">
                  {lang === "en" ? first?.competencyNameEn : first?.competencyNameSv}
                </th>
                {dates.map((d) => {
                  const cell = at(c, d);
                  return (
                    <td key={d} className="py-2.5 pr-4 text-muted-foreground">
                      {cell ? t(evidenceStateLabelKey(cell.evidenceState)) : "—"}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Report V2 — the candidate decision-support report.
 *
 * Order is the argument this component makes. Section 1 answers "what do I do
 * next and why" before anything else is on screen; sections 2 to 4 give the
 * evidence in the order a recruiter needs it; section 5 states the method once,
 * in full, at the bottom, where it belongs on a document somebody has already
 * decided to trust or not.
 *
 * Everything rendered here comes from the frozen snapshot. Nothing on this page
 * scores, ranks, compares or concludes: `support` carries four possible PROCESS
 * steps and no other verdict exists in the types it is built from.
 */
function CandidateDecisionSupportReport({
  report,
  support,
  limitations,
  attemptId,
  employerSlug,
  applicationId,
  canDecide,
  identity,
  onResolveIdentity,
}: {
  report: ReportSnapshot;
  support: ReturnType<typeof buildDecisionSupport>;
  limitations: string[];
  attemptId: string;
  employerSlug: string;
  employerId: string;
  applicationId: string | null;
  canDecide: boolean;
  identity: string | null;
  onResolveIdentity: () => void;
}) {
  const { t, lang } = useT();
  const sv = lang !== "en";
  const r = report;
  const brief = r.brief!;

  return (
    <>
      <Link
        to="/employer/$employerSlug/assessments/participants"
        params={{ employerSlug }}
        className="no-print mb-4 inline-flex min-h-[44px] items-center gap-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {t("academy.results.back")}
      </Link>

      {/* "Kompetensprofil" is the workforce document. What a recruiter is
          holding is the material behind one candidate, and calling it what it
          is stops the page from promising a durable profile that one assessment
          occasion cannot support. */}
      <AcademyHeading
        title={t("decision.reportTitle")}
        lede={`${t("academy.report.completed")} ${new Date(
          r.context?.submittedAt ?? r.releasedAt,
        ).toLocaleDateString(sv ? "sv-SE" : "en-GB")}`}
      />

      {/* ── THE FIRST SCREEN ──────────────────────────────────────────────
       *
       *  A customer read this brief and could not tell us what the candidate
       *  was like. Not because anything was missing -- everything was there,
       *  in eleven thousand characters, opening with a five-sentence paragraph
       *  and reaching the interview questions four scrolls down.
       *
       *  What a recruiter has before an interview is about thirty seconds, and
       *  five questions:
       *
       *    what did they demonstrate?      strongest-evidence panel
       *    what needs following up?        follow-up panel
       *    is anything safety-critical?    the panel, or one calm line
       *    what do I ask?                  InterviewQuestions, right here
       *    what happens next?              the recommended-step card
       *
       *  All five are now above the fold and nothing was deleted to do it. The
       *  competency cards, the self-report detail and the full guide moved
       *  behind one disclosure; methodology and provenance were already folded.
       */}
      <DecisionSupportSummary support={support} context={r.context} sv={sv} />

      <InterviewQuestions entries={brief.interviewGuide} sv={sv} />

      <RecruitmentActions employerSlug={employerSlug} applicationId={applicationId} />

      {/* Everything above answers "what should I know before the interview".
          Everything below answers "show me how you got there", which is a
          different question asked by a different reader on a different day. */}
      <BriefDetail support={support} brief={brief} sv={sv} />

      {/* What the conversation gave, recorded after the material it is about. */}
      <InterviewNotesPanel
        attemptId={attemptId}
        canRecord={canDecide}
        areas={brief.observed.map((o) => ({
          code: o.areaCode,
          label: sv ? o.areaSv : o.areaEn,
        }))}
      />

      {/* No EmployerDecisionPanel here, deliberately.
       *
       *  It offers "Tilldela utvecklingsinsats" and "Sakerhetsuppfoljning" --
       *  things an organisation does for somebody it employs. On a candidate
       *  it invited a development decision about a person who does not work
       *  here, beside the recruitment decision that actually applies, and the
       *  customer read the two as one confused step. The workforce report
       *  above still renders it, where those actions mean what they say. */}

      <ReportMethodSection
        observations={r.context?.evidenceObservations ?? 0}
        contexts={r.context?.evidenceContexts ?? 1}
        selfReportObservations={r.context?.selfReportObservations ?? 0}
        reviewsTotal={r.context?.reviewsTotal ?? 0}
        reviewsCompleted={r.context?.reviewsCompleted ?? 0}
        pace={brief.pace}
        limitations={limitations}
      />

      {/* Provenance and lineage last, and the audited identity reveal with it.
          Both are what the document is, rather than what it says. */}
      <ReportContextPanel
        context={r.context}
        reportId={r.id}
        releasedAt={r.releasedAt}
        identityAction={
          identity ? (
            <p className="text-[13px] text-foreground">{identity}</p>
          ) : (
            <button
              type="button"
              onClick={onResolveIdentity}
              className="inline-flex min-h-[44px] items-center rounded-[8px] border border-border px-3 text-[13px] font-medium text-foreground hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {t("academy.participants.showIdentity")}
            </button>
          )
        }
      />
    </>
  );
}

/** The detail, one fold below the brief.
 *
 *  Same three sections, same components, same data — the only change is that
 *  they no longer stand between a recruiter and the interview questions.
 *
 *  The fold is `.screen-fold`, whose hiding rule lives inside `@media screen`.
 *  Everything stays in the DOM and print has no rule that hides it, so a
 *  printed brief still carries every competency card, the self-report detail
 *  and the full guide whether or not the section is open on screen. That
 *  matters beyond tidiness: this document is evidence, and a fold that
 *  silently shortened the printed version would make two different documents
 *  out of one report. */
function BriefDetail({
  support,
  brief,
  sv,
}: {
  support: DecisionSupport;
  brief: ReportBrief;
  sv: boolean;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);

  return (
    <section className="mt-6">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="no-print inline-flex min-h-[44px] items-center gap-1.5 text-[13px] font-medium text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <ChevronDown
          className={`h-4 w-4 transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
        {t(open ? "decision.detail.hide" : "decision.detail.show")}
      </button>
      {!open && (
        <p className="no-print mt-1 max-w-[74ch] text-[12px] leading-relaxed text-muted-foreground">
          {t("decision.detail.lede")}
        </p>
      )}

      <div className="screen-fold" data-open={open ? "true" : "false"}>
        <CompetencyOverviewSection
          support={support}
          modules={brief.modules}
          interviewGuide={brief.interviewGuide}
          sv={sv}
        />
        <SelfReportedSection areas={brief.selfReported} sv={sv} />
        <InterviewGuideSection entries={brief.interviewGuide} sv={sv} />
      </div>
    </section>
  );
}
