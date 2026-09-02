// The post-interview summary: the state of play, then the material.
//
// This screen is no longer a stage of the recruiter's journey. The material
// it shows -- confirmed examples, the requirements they cover and do not,
// what is still open, the recruiter's own assessments -- is what the report
// is built from, and it is now shown on the Report screen itself before the
// report is locked, so a recruiter reads what they are about to lock on the
// screen where they lock it. Two adjacent screens showing the same material
// under two names was one of the things pilot recruiters counted as "too many
// stages".
//
// The route stays. It is linked from older records, it answers a deep link,
// and the seven scannable rows at the top are a useful state-of-play view. It
// renders the same InterviewOutcome the report does, so the two cannot drift.
//
// It generates nothing. Every section is a projection of records a human has
// already made, and with AI switched off it is exactly as complete as it is
// with AI on.

import { createFileRoute, Link } from "@tanstack/react-router";
import { useT } from "@/i18n/context";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { EmployerAppShell } from "@/components/employer/EmployerAppShell";
import { EmployerErrorState } from "@/components/employer/EmployerErrorState";
import { EmployerAccessDenied } from "@/components/employer/EmployerAccessDenied";
import { useEmployerWorkspace } from "@/lib/job-intelligence/use-employer-workspace";
import {
  CaseHeader,
  WorkflowNav,
  State,
  interviewErrorMessage,
  PRIMARY_BUTTON,
} from "@/components/employer/interview/InterviewUi";
import { ScanList, ScanRow, Section } from "@/components/employer/interview/InterviewLayout";
import { InterviewOutcome } from "@/components/employer/interview/InterviewOutcome";
import { getInterviewCase } from "@/lib/interview-intelligence/runtime.functions";

export const Route = createFileRoute(
  "/_authenticated/employer/$employerSlug/interview-intelligence/$caseId/summary",
)({ ssr: false, component: Page, errorComponent: EmployerErrorState });

function Page() {
  const { employerSlug, caseId } = Route.useParams();
  const ws = useEmployerWorkspace(employerSlug);
  const { t } = useT();

  const getFn = useServerFn(getInterviewCase);
  const q = useQuery({
    queryKey: ["ii", "case", caseId],
    queryFn: () => getFn({ data: { caseId } }),
    retry: false,
  });

  if (ws.isLoading)
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <State kind="loading" />
      </div>
    );
  if (ws.isError || !ws.workspace) return <EmployerAccessDenied workspaces={ws.workspaces} />;

  const shell = (children: React.ReactNode) => (
    <EmployerAppShell
      employerSlug={ws.workspace!.employerSlug}
      employerName={ws.workspace!.employerName}
      role={ws.workspace!.role}
      status={ws.workspace!.employerStatus}
      activeSection="interviewIntelligence"
      hasMultipleWorkspaces={ws.hasMultipleWorkspaces}
    >
      {children}
    </EmployerAppShell>
  );

  if (q.isLoading) return shell(<State kind="loading" />);
  if (q.isError) {
    const nf = (q.error as Error).message.includes("NOT_FOUND");
    return shell(
      <State
        kind={nf ? "denied" : "error"}
        message={nf ? undefined : interviewErrorMessage(q.error, t)}
      />,
    );
  }
  const d = q.data;
  if (!d) return shell(<State kind="loading" />);

  // Coverage is reported against the ROLE REQUIREMENTS, not the question
  // numbers. "Q2 has nothing" tells a recruiter which row of a table is empty;
  // "conflict handling has nothing" tells them what they still do not know.
  const questionsWithEvidence = new Set(d.evidence.map((e) => e.questionId));
  const coveredCodes = new Set(
    d.questions
      .filter((qq) => questionsWithEvidence.has(qq.id))
      .flatMap((qq) => qq.competencyCodes.slice(0, 1)),
  );
  const covered = d.competencies.filter((c) => coveredCodes.has(c.code));
  const missing = d.competencies.filter((c) => !coveredCodes.has(c.code));

  const open = d.findings.filter((f) => f.resolutionState !== "resolved");
  const verify = open.filter((f) => f.findingKind === "verification");
  const followUp = open.filter((f) => f.findingKind !== "verification");
  const comments = (d.session?.notes ?? []).filter(
    (n) => n.noteKind === "closing_summary" || n.noteKind === "process",
  );

  const reviewLink = (label: string) => (
    <Link
      to="/employer/$employerSlug/interview-intelligence/$caseId/evidence"
      params={{ employerSlug, caseId }}
      className="text-sm font-medium text-accent underline-offset-2 hover:underline"
    >
      {label}
    </Link>
  );
  const assessLink = (label: string) => (
    <Link
      to="/employer/$employerSlug/interview-intelligence/$caseId/assessment"
      params={{ employerSlug, caseId }}
      className="text-sm font-medium text-accent underline-offset-2 hover:underline"
    >
      {label}
    </Link>
  );

  return shell(
    <>
      <nav aria-label={t("iiu.breadcrumbs")} className="text-sm">
        <Link
          to="/employer/$employerSlug/interview-intelligence/$caseId"
          params={{ employerSlug, caseId }}
          className="inline-flex min-h-11 items-center text-accent underline-offset-2 hover:underline"
        >
          {t("iiu.ov.backtocase")}
        </Link>
      </nav>

      <div className="mt-3">
        <CaseHeader
          candidate={d.candidateDisplayName}
          role={d.packName ?? d.title}
          status={d.status}
          action={
            <Link
              to="/employer/$employerSlug/interview-intelligence/$caseId/report"
              params={{ employerSlug, caseId }}
              className={PRIMARY_BUTTON}
            >
              {t("iiu.sm.toreport")}
            </Link>
          }
        />
      </div>

      <div className="mt-5">
        <WorkflowNav
          status={d.status}
          current="report"
          employerSlug={employerSlug}
          caseId={caseId}
        />
      </div>

      {/* ---- The state of play, in seven rows ---- */}
      <Section
        id="s-state"
        title={t("iiu.sm.state.title")}
        description={t("iiu.sm.state.body")}
        className="mt-8 max-w-4xl"
      >
        <ScanList>
          <ScanRow
            glyph="✓"
            tone={d.evidence.length > 0 ? "confirmed" : "attention"}
            title={t("iiu.sm.row.examples")}
            description={t("iiu.sm.row.examples.body")}
            count={d.evidence.length}
            action={reviewLink(t("iiu.sm.goto"))}
          />
          <ScanRow
            glyph="◍"
            tone={covered.length > 0 ? "confirmed" : "neutral"}
            title={t("iiu.sm.row.explored")}
            description={t("iiu.sm.row.explored.body")}
            count={covered.length}
            countLabel={`${t("iiu.sm.of")} ${d.competencies.length}`}
          />
          <ScanRow
            glyph="○"
            tone={missing.length > 0 ? "attention" : "neutral"}
            title={t("iiu.sm.row.missing")}
            description={t("iiu.sm.row.missing.body")}
            count={missing.length}
          />
          <ScanRow
            glyph="?"
            tone={followUp.length > 0 ? "attention" : "neutral"}
            title={t("iiu.sm.row.followup")}
            description={t("iiu.sm.row.followup.body")}
            count={followUp.length}
          />
          <ScanRow
            glyph="!"
            tone={verify.length > 0 ? "attention" : "neutral"}
            title={t("iiu.sm.row.verify")}
            description={t("iiu.sm.row.verify.body")}
            count={verify.length}
          />
          <ScanRow
            glyph="★"
            tone={d.assessments.length === d.questions.length ? "confirmed" : "attention"}
            title={t("iiu.sm.row.assessed")}
            description={t("iiu.sm.row.assessed.body")}
            count={d.assessments.length}
            countLabel={`${t("iiu.sm.of")} ${d.questions.length}`}
            action={assessLink(t("iiu.sm.goto"))}
          />
          <ScanRow
            glyph="✎"
            title={t("iiu.sm.row.comments")}
            description={t("iiu.sm.row.comments.body")}
            count={comments.length}
          />
        </ScanList>
      </Section>

      {/* ---- The material itself, exactly as the report shows it ---- */}
      <Section
        id="s-detail"
        title={t("iiu.sm.detail")}
        description={t("iiu.sm.lead")}
        className="mt-10 max-w-4xl"
      >
        <InterviewOutcome d={d} employerSlug={employerSlug} caseId={caseId} />
      </Section>

      <div className="mt-10 max-w-4xl">
        <Link
          to="/employer/$employerSlug/interview-intelligence/$caseId/report"
          params={{ employerSlug, caseId }}
          className={PRIMARY_BUTTON}
        >
          {t("iiu.sm.toreport")}
        </Link>
      </div>
    </>,
  );
}
