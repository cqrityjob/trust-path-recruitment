// The interview overview — the command centre for one candidate interview.
//
// This route did not exist. The list linked straight into /prepare, so a
// recruiter opening a candidate landed inside a work surface whose first
// screenful was the TRUST stage banner: the method's name, which of five
// stages this is, what the stage forbids, and a note about scientific
// validation. Nowhere did it say who the candidate was, what the role needed,
// or what to do next.
//
// So this page answers, in order, the only three questions a recruiter has on
// opening a case:
//
//   Who am I interviewing, and for what?
//   Where in the process am I?
//   What do I do next?
//
// The method has not gone anywhere. It governs every screen underneath, and it
// is available here under "About the method behind it" for anyone who wants
// it. What changed is that it stopped being the first thing between a
// recruiter and their work.

import { createFileRoute, Link } from "@tanstack/react-router";
import { useT } from "@/i18n/context";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { EmployerAppShell } from "@/components/employer/EmployerAppShell";
import { EmployerErrorState } from "@/components/employer/EmployerErrorState";
import { EmployerAccessDenied } from "@/components/employer/EmployerAccessDenied";
import { useEmployerWorkspace } from "@/lib/job-intelligence/use-employer-workspace";
import {
  assessedQuestionCount,
  CaseStatusChip,
  WorkflowNav,
  Chip,
  NEXT_STEP,
  State,
  interviewErrorMessage,
  PRIMARY_BUTTON,
} from "@/components/employer/interview/InterviewUi";
import { getInterviewCase } from "@/lib/interview-intelligence/runtime.functions";
import { getInterviewCaseContext } from "@/lib/interview-intelligence/context.functions";
import { processLinkage } from "@/lib/employer-continuity/process-projection";

export const Route = createFileRoute(
  "/_authenticated/employer/$employerSlug/interview-intelligence/$caseId/",
)({ ssr: false, component: Page, errorComponent: EmployerErrorState });

function Page() {
  const { employerSlug, caseId } = Route.useParams();
  const ws = useEmployerWorkspace(employerSlug);
  const { t, lang } = useT();

  const getFn = useServerFn(getInterviewCase);
  const q = useQuery({
    queryKey: ["ii", "case", caseId],
    queryFn: () => getFn({ data: { caseId } }),
    retry: false,
  });

  // The ADVERTISED role, from the application this case is bound to.
  //
  // The same governed read the preparation screen makes, on the same cache
  // key, so the two screens cannot name the role differently. It is needed
  // here because the overview used to print the interview GUIDE's name (or,
  // failing that, the case's internal title) under a label reading "Roll" --
  // three different concepts wearing one word. A guide is a governed
  // instrument, an internal title is bookkeeping, and neither is the job the
  // candidate applied for.
  const contextFn = useServerFn(getInterviewCaseContext);
  const contextQ = useQuery({
    queryKey: ["ii", "context", caseId],
    queryFn: () => contextFn({ data: { caseId } }),
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

  // The role, said only when we actually know it. A guide's name and an
  // internal title are NOT fallbacks for it: the honest answer to "which
  // advertised role is this" is sometimes that there is not one.
  const contextRole = contextQ.data
    ? ((lang === "en" ? contextQ.data.roleEn : contextQ.data.roleSv) ?? contextQ.data.roleSv)
    : null;
  const advertisedRole = contextQ.isLoading
    ? t("continuity.assessment.loading")
    : contextQ.isError
      ? t("continuity.report.unavailable")
      : (contextRole ?? t("continuity.role.unknown"));

  // Recruitment-linked, or standalone. One persisted identifier decides it.
  const linkage = processLinkage(d.applicationId);

  // Where the recruiter goes next, in their words rather than the schema's.
  // Read from the same map every other screen uses, so the overview can never
  // send someone somewhere the stage header would not.
  const next = NEXT_STEP[d.status] ?? NEXT_STEP.draft;

  // The four numbers a recruiter actually tracks. Counts, never a percentage
  // or a score: this measures how far the WORK has got, not the candidate.
  const answered = (d.session?.questions ?? []).filter((x) => x.state === "answered").length;
  const awaiting = d.proposals.filter((p) => p.reviewState === "pending").length;
  // DISTINCT questions, because the card beneath it counts questions. See
  // assessedQuestionCount: two assessors on one question is one question.
  const assessed = assessedQuestionCount(d.assessments);
  const openFindings = d.findings.filter((f) => f.resolutionState !== "resolved").length;

  const candidateSources = d.sources.filter((s) => s.kind !== "role_description");

  return shell(
    <>
      {/* THE WAY BACK.
       *
       *  Every work surface under this case breadcrumbs HERE, so this is the
       *  one place the return path to the recruitment record has to exist --
       *  and it did not. A recruiter who came from a candidate could reach the
       *  interview and never get back without the browser's own Back button.
       *  The application id is the case's OWN persisted column, read by the
       *  server; the URL asserts nothing. */}
      <nav aria-label={t("iiu.breadcrumbs")} className="flex flex-wrap gap-4 text-sm">
        {d.applicationId && (
          <Link
            to="/employer/$employerSlug/applications/$applicationId"
            params={{ employerSlug, applicationId: d.applicationId }}
            className="inline-flex min-h-11 items-center text-accent underline-offset-2 hover:underline"
          >
            {t("continuity.backToApplication")}
          </Link>
        )}
        <Link
          to="/employer/$employerSlug/interview-intelligence"
          params={{ employerSlug }}
          className="inline-flex min-h-11 items-center text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          {t("iiu.ov.backtolist")}
        </Link>
      </nav>

      {/* ---- Who, and for what ---------------------------------------- */}
      <header className="mt-3">
        <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">
          {d.candidateDisplayName}
        </h1>

        {/* THREE FACTS, THREE LABELS.
         *
         *  Role is the advert the candidate applied to. The guide is the
         *  governed instrument the interview is run from, pinned to a content
         *  hash. The internal title is the recruiter's own bookkeeping. Printing
         *  any of them under another's name is how an interview ends up filed
         *  against a role nobody advertised. */}
        <dl className="mt-1.5 flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm">
          <div className="flex items-baseline gap-1.5">
            <dt className="text-muted-foreground">{t("continuity.role.advertised")}:</dt>
            <dd className="font-medium text-foreground">{advertisedRole}</dd>
          </div>
          {d.packName && (
            <div className="flex items-baseline gap-1.5">
              <dt className="text-muted-foreground">{t("continuity.role.guide")}:</dt>
              <dd className="text-muted-foreground">{d.packName}</dd>
            </div>
          )}
          <div className="flex items-baseline gap-1.5">
            <dt className="text-muted-foreground">{t("continuity.role.caseTitle")}:</dt>
            <dd className="text-muted-foreground">{d.title}</dd>
          </div>
        </dl>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <CaseStatusChip status={d.status} />
          {/* PROCESS TYPE, on the surface rather than in the reader's head.
           *
           *  Decided from the case's own persisted application_id and from
           *  nothing else -- not the candidate's name, not an address, not the
           *  guide that was chosen. A standalone interview is a first-class,
           *  supported thing; what it must never be is mistakeable for one
           *  bound to an application. */}
          <Chip tone={linkage === "recruitmentLinked" ? "work" : "neutral"}>
            {linkage === "recruitmentLinked"
              ? t("continuity.type.linked")
              : t("continuity.type.standaloneInterview")}
          </Chip>
        </div>
        <p className="mt-2 max-w-[72ch] text-xs leading-relaxed text-muted-foreground">
          {linkage === "recruitmentLinked"
            ? t("continuity.type.linkedBody")
            : t("continuity.type.standaloneBody")}
        </p>
      </header>

      {/* ---- What to do next, and why ---------------------------------
           The primary action, given the weight it has in the recruiter's
           day. One button: there is only ever one sensible next move. */}
      <section className="mt-6 max-w-4xl rounded-lg border border-border bg-muted/30 p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("iiu.ov.nextaction")}
        </p>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-foreground">{t(next.why)}</p>
        <Link to={next.to} params={{ employerSlug, caseId }} className={`${PRIMARY_BUTTON} mt-4`}>
          {t(next.cta)}
        </Link>
      </section>

      {/* ---- Where you are --------------------------------------------- */}
      <section className="mt-8 max-w-4xl" aria-labelledby="s-where">
        <h2 id="s-where" className="text-sm font-semibold text-foreground">
          {t("iiu.ov.whereyouare")}
        </h2>
        <div className="mt-2">
          <WorkflowNav status={d.status} employerSlug={employerSlug} caseId={caseId} />
        </div>

        <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label={t("iiu.ov.card.questions")}
            value={`${answered} ${t("iiu.ov.of")} ${d.questions.length}`}
          />
          <Stat
            label={t("iiu.ov.card.material")}
            value={awaiting > 0 ? String(awaiting) : t("iiu.ov.card.material.none")}
            tone={awaiting > 0 ? "attention" : "calm"}
          />
          <Stat
            label={t("iiu.ov.card.assessed")}
            value={`${assessed} ${t("iiu.ov.of")} ${d.questions.length}`}
          />
          <Stat
            label={t("iiu.ov.card.followup")}
            value={openFindings > 0 ? String(openFindings) : t("iiu.ov.card.followup.none")}
            tone={openFindings > 0 ? "attention" : "calm"}
          />
        </dl>
      </section>

      {/* ---- The two things worth knowing before the conversation ------ */}
      <div className="mt-8 grid max-w-4xl gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-border p-4" aria-labelledby="s-cand">
          <h2 id="s-cand" className="text-sm font-semibold text-foreground">
            {t("iiu.ov.candidate")}
          </h2>
          {candidateSources.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">{t("iiu.ov.candidate.none")}</p>
          ) : (
            <>
              <ul className="mt-2 space-y-1.5">
                {candidateSources.map((s) => (
                  <li key={s.id} className="text-sm text-foreground">
                    {s.label}
                  </li>
                ))}
              </ul>
              {/* The distinction the whole product rests on, said once, in
                  plain words, at the moment it first matters. */}
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                {t("iiu.ov.candidate.note")}
              </p>
            </>
          )}
        </section>

        <section className="rounded-lg border border-border p-4" aria-labelledby="s-role">
          <h2 id="s-role" className="text-sm font-semibold text-foreground">
            {t("iiu.ov.role.title")}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {d.questions.length} {t("iiu.ov.role.count")}
          </p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {d.questions.map((qq) => (
              <li key={qq.id}>
                <Chip tone="work">{qq.code}</Chip>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* ---- The method, available rather than unavoidable -------------
           Everything here used to sit above the fold on every screen. It is
           still true and still governs the work; it is now one disclosure a
           curious or auditing reader opens, instead of the wall a recruiter
           had to read past to reach their job. */}
      <details className="mt-8 max-w-4xl rounded-lg border border-border p-4">
        <summary className="cursor-pointer text-sm font-medium text-foreground">
          {t("iiu.ov.howitworks")}
        </summary>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {t("iiu.ov.howitworks.body")}
        </p>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {t("iiu.cd.hypothesis")}
        </p>
        {/* The guide's name, and only its name. Its content hash used to sit
            beside it: a checksum is an integrity fact for an auditor and lives
            under the report's audit details, not on the recruiter's overview. */}
        {d.packName && (
          <p className="mt-3 text-xs text-muted-foreground">
            {t("iiu.ov.pack")}: {d.packName}
          </p>
        )}
      </details>

      <p className="mt-6 max-w-2xl text-xs leading-relaxed text-muted-foreground">
        {t("iiu.ov.decision")}
      </p>
    </>,
  );
}

/** One tracked number. Deliberately a count with a label — no bar, no ring,
 *  no percentage. A progress bar over an interview reads as a score for the
 *  candidate, which is the one thing this product must never appear to give. */
function Stat({
  label,
  value,
  tone = "calm",
}: {
  label: string;
  value: string;
  tone?: "calm" | "attention";
}) {
  return (
    <div className="rounded-lg border border-border p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={`mt-1 text-lg font-semibold tabular-nums ${
          tone === "attention" ? "text-amber-700 dark:text-amber-300" : "text-foreground"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
