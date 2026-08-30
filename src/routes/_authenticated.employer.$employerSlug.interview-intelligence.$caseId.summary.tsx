// The post-interview summary — the bridge between reviewing and reporting.
//
// A recruiter finishes the review and the assessment holding a lot of small
// decisions and no single view of what they now know. This is that view: what
// was confirmed, which requirements it covered, what was NOT established, what
// still has to be chased, and what they themselves concluded.
//
// It reads as a state of play first and a document second: seven scannable
// rows, each with its own glyph, its own sentence and its own count, and then
// the material itself underneath. The counts are workflow information. A count
// on this screen says how far the RECRUITER has got; there is no number
// anywhere on it that describes Marcus Lindqvist.
//
// It generates nothing. Every section is a projection of records a human has
// already made, and with AI switched off it is exactly as complete as it is
// with AI on. That is deliberate: a summary is the one place where a model
// would be most tempting and most dangerous, because a plausible paragraph
// reads as a conclusion.
//
// It also carries the two sentences this product exists to keep saying. A
// requirement with no material means the question was not answered, not that
// the candidate lacks the ability. Two facts that do not line up mean
// something needs clarifying, not that anyone was dishonest.

import { createFileRoute, Link } from "@tanstack/react-router";
import { useT } from "@/i18n/context";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { EmployerAppShell } from "@/components/employer/EmployerAppShell";
import { EmployerErrorState } from "@/components/employer/EmployerErrorState";
import { EmployerAccessDenied } from "@/components/employer/EmployerAccessDenied";
import { useEmployerWorkspace } from "@/lib/job-intelligence/use-employer-workspace";
import {
  CaseStatusChip,
  WorkflowNav,
  Chip,
  MaterialBadge,
  State,
  interviewErrorMessage,
  uiLabel,
  BUTTON,
  PRIMARY_BUTTON,
} from "@/components/employer/interview/InterviewUi";
import {
  Nothing,
  ScanList,
  ScanRow,
  Section,
  Surface,
} from "@/components/employer/interview/InterviewLayout";
import { getInterviewCase } from "@/lib/interview-intelligence/runtime.functions";
import type { TranslationKey } from "@/i18n/dictionaries";

export const Route = createFileRoute(
  "/_authenticated/employer/$employerSlug/interview-intelligence/$caseId/summary",
)({ ssr: false, component: Page, errorComponent: EmployerErrorState });

const FINDING_LABEL: Record<string, TranslationKey> = {
  gap: "iiu.find.gap",
  unclear: "iiu.find.unclear",
  contradiction: "iiu.find.contradiction",
  verification: "iiu.find.verification",
};

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

  const codeOf = (id: string) => d.questions.find((x) => x.id === id)?.code ?? "—";
  const reqName = (c: { nameSv: string; nameEn: string | null }) =>
    (lang === "en" ? c.nameEn : c.nameSv) ?? c.nameSv;

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
          className="text-accent underline-offset-2 hover:underline"
        >
          {t("iiu.ov.backtocase")}
        </Link>
      </nav>

      <header className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {d.candidateDisplayName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{d.title}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <CaseStatusChip status={d.status} />
            <Chip>{d.packName ?? "—"}</Chip>
          </div>
        </div>
        <Link
          to="/employer/$employerSlug/interview-intelligence/$caseId/report"
          params={{ employerSlug, caseId }}
          className={`${PRIMARY_BUTTON} shrink-0`}
        >
          {t("iiu.sm.toreport")}
        </Link>
      </header>

      <div className="mt-5">
        <WorkflowNav
          status={d.status}
          current="summary"
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

      {/* ---- The material itself ---- */}
      <Section
        id="s-detail"
        title={t("iiu.sm.detail")}
        description={t("iiu.sm.lead")}
        className="mt-10 max-w-4xl"
      >
        <div className="space-y-8">
          {/* What was confirmed */}
          <section aria-labelledby="s-ex">
            <h3 id="s-ex" className="text-sm font-semibold text-foreground">
              {t("iiu.sm.examples")}
            </h3>
            {d.evidence.length === 0 ? (
              <div className="mt-2 space-y-3">
                <Nothing>{t("iiu.sm.examples.none")}</Nothing>
                <Link
                  to="/employer/$employerSlug/interview-intelligence/$caseId/evidence"
                  params={{ employerSlug, caseId }}
                  className={BUTTON}
                >
                  {t("iiu.ov.cta.review")}
                </Link>
              </div>
            ) : (
              <ul className="mt-3 space-y-2">
                {d.evidence.map((e) => (
                  <Surface as="li" key={e.id} padded={false} className="px-3.5 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Chip tone="work">{codeOf(e.questionId)}</Chip>
                      <MaterialBadge state="confirmed" />
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-foreground">{e.excerpt}</p>
                  </Surface>
                ))}
              </ul>
            )}
          </section>

          {/* Covered, and not */}
          <div className="grid gap-6 sm:grid-cols-2">
            <section aria-labelledby="s-cov">
              <h3 id="s-cov" className="text-sm font-semibold text-foreground">
                {t("iiu.sm.explored")}
              </h3>
              {covered.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">{t("iiu.sm.explored.none")}</p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {covered.map((c) => (
                    <li key={c.id} className="flex gap-2 text-sm">
                      <span aria-hidden="true" className="text-teal-700 dark:text-teal-300">
                        ✓
                      </span>
                      <span className="leading-snug text-foreground">{reqName(c)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-labelledby="s-miss">
              <h3 id="s-miss" className="text-sm font-semibold text-foreground">
                {t("iiu.sm.missing")}
              </h3>
              {missing.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">{t("iiu.sm.missing.none")}</p>
              ) : (
                <>
                  <ul className="mt-2 space-y-1.5">
                    {missing.map((c) => (
                      <li key={c.id} className="flex gap-2 text-sm">
                        <span aria-hidden="true" className="text-amber-700 dark:text-amber-300">
                          ○
                        </span>
                        <span className="leading-snug text-foreground">{reqName(c)}</span>
                      </li>
                    ))}
                  </ul>
                  {/* The sentence that keeps an absence from being read as a finding. */}
                  <p className="mt-3 max-w-[60ch] text-xs leading-relaxed text-muted-foreground">
                    {t("iiu.sm.missing.body")}
                  </p>
                </>
              )}
            </section>
          </div>

          {/* Still to chase */}
          <div className="grid gap-6 sm:grid-cols-2">
            <section aria-labelledby="s-fu">
              <h3 id="s-fu" className="text-sm font-semibold text-foreground">
                {t("iiu.sm.followup")}
              </h3>
              {followUp.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">{t("iiu.sm.followup.none")}</p>
              ) : (
                <>
                  <ul className="mt-2 space-y-2.5">
                    {followUp.map((f) => (
                      <li key={f.id} className="text-sm leading-relaxed">
                        <Chip tone="attention">{uiLabel(FINDING_LABEL, f.findingKind, t)}</Chip>{" "}
                        <span className="text-foreground">{f.statement}</span>
                      </li>
                    ))}
                  </ul>
                  {followUp.some((f) => f.findingKind === "contradiction") && (
                    // Said where a contradiction is actually on screen, not in a
                    // policy document nobody opens.
                    <p className="mt-3 max-w-[60ch] text-xs leading-relaxed text-muted-foreground">
                      {t("iiu.find.contradiction.note")}
                    </p>
                  )}
                </>
              )}
            </section>

            <section aria-labelledby="s-ver">
              <h3 id="s-ver" className="text-sm font-semibold text-foreground">
                {t("iiu.sm.verify")}
              </h3>
              {verify.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">{t("iiu.sm.verify.none")}</p>
              ) : (
                <>
                  <ul className="mt-2 space-y-2.5">
                    {verify.map((f) => (
                      <li key={f.id} className="text-sm leading-relaxed">
                        <MaterialBadge state="verify" />{" "}
                        <span className="text-foreground">{f.statement}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 max-w-[60ch] text-xs leading-relaxed text-muted-foreground">
                    {t("iiu.sm.verify.body")}
                  </p>
                </>
              )}
            </section>
          </div>

          {/* What the recruiter concluded */}
          <section aria-labelledby="s-as">
            <h3
              id="s-as"
              className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground"
            >
              {t("iiu.sm.assessments")}
              <MaterialBadge state="assessment" />
            </h3>
            {d.assessments.length === 0 ? (
              <div className="mt-2 space-y-3">
                <Nothing>{t("iiu.sm.assessments.none")}</Nothing>
                <Link
                  to="/employer/$employerSlug/interview-intelligence/$caseId/assessment"
                  params={{ employerSlug, caseId }}
                  className={BUTTON}
                >
                  {t("iiu.sm.assessments.cta")}
                </Link>
              </div>
            ) : (
              <ul className="mt-3 space-y-2">
                {d.assessments.map((a) => (
                  <Surface as="li" key={a.id} padded={false} className="px-3.5 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Chip tone="work">{codeOf(a.questionId)}</Chip>
                      <Chip tone={a.level === 0 ? "attention" : "confirmed"}>
                        {t("iiu.ev.level")} {a.level}
                      </Chip>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-foreground">{a.rationale}</p>
                  </Surface>
                ))}
              </ul>
            )}
          </section>

          {/* The interviewer's own comments */}
          <section aria-labelledby="s-com">
            <h3 id="s-com" className="text-sm font-semibold text-foreground">
              {t("iiu.sm.comments")}
            </h3>
            {comments.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">{t("iiu.sm.comments.none")}</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {comments.map((n) => (
                  <Surface as="li" key={n.id} padded={false} className="px-3.5 py-3">
                    <MaterialBadge state="note" />
                    <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-foreground">
                      {n.body}
                    </p>
                  </Surface>
                ))}
              </ul>
            )}
          </section>
        </div>
      </Section>

      <div className="mt-10 max-w-4xl rounded-lg border border-border bg-muted/30 p-5">
        <p className="max-w-[70ch] text-sm leading-relaxed text-muted-foreground">
          {t("iiu.sm.nodecision")}
        </p>
        <Link
          to="/employer/$employerSlug/interview-intelligence/$caseId/report"
          params={{ employerSlug, caseId }}
          className={`${PRIMARY_BUTTON} mt-3`}
        >
          {t("iiu.sm.toreport")}
        </Link>
      </div>
    </>,
  );
}
