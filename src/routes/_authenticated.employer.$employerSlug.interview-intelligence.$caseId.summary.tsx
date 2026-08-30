// The post-interview summary — the bridge between reviewing and reporting.
//
// A recruiter finishes the review and the assessment holding a lot of small
// decisions and no single view of what they now know. This is that view: what
// was confirmed, which requirements it covered, what was NOT established, what
// still has to be chased, and what they themselves concluded.
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

  const codeOf = (id: string) => d.questions.find((x) => x.id === id)?.code ?? "—";
  const covered = d.questions.filter((qq) => d.evidence.some((e) => e.questionId === qq.id));
  const missing = d.questions.filter((qq) => !d.evidence.some((e) => e.questionId === qq.id));
  const open = d.findings.filter((f) => f.resolutionState !== "resolved");
  const verify = open.filter((f) => f.findingKind === "verification");
  const followUp = open.filter((f) => f.findingKind !== "verification");
  const comments = (d.session?.notes ?? []).filter(
    (n) => n.noteKind === "closing_summary" || n.noteKind === "process",
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

      <header className="mt-3">
        <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">
          {d.candidateDisplayName}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{d.title}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <CaseStatusChip status={d.status} />
          <Chip>{d.packName ?? "—"}</Chip>
        </div>
      </header>

      <div className="mt-6">
        <WorkflowNav
          status={d.status}
          current="summary"
          employerSlug={employerSlug}
          caseId={caseId}
        />
      </div>

      <section className="mt-8 max-w-4xl" aria-labelledby="s-sum">
        <h2 id="s-sum" className="text-lg font-semibold text-foreground">
          {t("iiu.sm.title")}
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("iiu.sm.lead")}</p>
      </section>

      {/* ---- What was confirmed ---------------------------------------- */}
      <section className="mt-8 max-w-4xl" aria-labelledby="s-ex">
        <h2 id="s-ex" className="text-base font-semibold text-foreground">
          {t("iiu.sm.examples")}
        </h2>
        {d.evidence.length === 0 ? (
          <div className="mt-3">
            <State kind="empty">{t("iiu.sm.examples.none")}</State>
            <Link
              to="/employer/$employerSlug/interview-intelligence/$caseId/evidence"
              params={{ employerSlug, caseId }}
              className={`${BUTTON} mt-3`}
            >
              {t("iiu.ov.cta.review")}
            </Link>
          </div>
        ) : (
          <ul className="mt-3 space-y-2">
            {d.evidence.map((e) => (
              <li key={e.id} className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Chip tone="work">{codeOf(e.questionId)}</Chip>
                  <MaterialBadge state="confirmed" />
                </div>
                <p className="mt-2 text-sm leading-relaxed text-foreground">{e.excerpt}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---- Covered, and not ------------------------------------------ */}
      <div className="mt-8 grid max-w-4xl gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-border p-4" aria-labelledby="s-cov">
          <h2 id="s-cov" className="text-sm font-semibold text-foreground">
            {t("iiu.sm.explored")}
          </h2>
          {covered.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">{t("iiu.sm.explored.none")}</p>
          ) : (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {covered.map((qq) => (
                <li key={qq.id}>
                  <Chip tone="confirmed">{qq.code}</Chip>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-border p-4" aria-labelledby="s-miss">
          <h2 id="s-miss" className="text-sm font-semibold text-foreground">
            {t("iiu.sm.missing")}
          </h2>
          {missing.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">{t("iiu.sm.missing.none")}</p>
          ) : (
            <>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {missing.map((qq) => (
                  <li key={qq.id}>
                    <Chip tone="attention">{qq.code}</Chip>
                  </li>
                ))}
              </ul>
              {/* The sentence that keeps an absence from being read as a finding. */}
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                {t("iiu.sm.missing.body")}
              </p>
            </>
          )}
        </section>
      </div>

      {/* ---- Still to chase --------------------------------------------- */}
      <div className="mt-4 grid max-w-4xl gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-border p-4" aria-labelledby="s-fu">
          <h2 id="s-fu" className="text-sm font-semibold text-foreground">
            {t("iiu.sm.followup")}
          </h2>
          {followUp.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">{t("iiu.sm.followup.none")}</p>
          ) : (
            <>
              <ul className="mt-2 space-y-2">
                {followUp.map((f) => (
                  <li key={f.id} className="text-sm">
                    <Chip tone="attention">{uiLabel(FINDING_LABEL, f.findingKind, t)}</Chip>{" "}
                    <span className="text-foreground">{f.statement}</span>
                  </li>
                ))}
              </ul>
              {followUp.some((f) => f.findingKind === "contradiction") && (
                // Said where a contradiction is actually on screen, not in a
                // policy document nobody opens.
                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                  {t("iiu.find.contradiction.note")}
                </p>
              )}
            </>
          )}
        </section>

        <section className="rounded-lg border border-border p-4" aria-labelledby="s-ver">
          <h2 id="s-ver" className="text-sm font-semibold text-foreground">
            {t("iiu.sm.verify")}
          </h2>
          {verify.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">{t("iiu.sm.verify.none")}</p>
          ) : (
            <>
              <ul className="mt-2 space-y-2">
                {verify.map((f) => (
                  <li key={f.id} className="text-sm">
                    <MaterialBadge state="verify" />{" "}
                    <span className="text-foreground">{f.statement}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                {t("iiu.sm.verify.body")}
              </p>
            </>
          )}
        </section>
      </div>

      {/* ---- What the recruiter concluded ------------------------------- */}
      <section className="mt-8 max-w-4xl" aria-labelledby="s-as">
        <h2 id="s-as" className="text-base font-semibold text-foreground">
          {t("iiu.sm.assessments")}
        </h2>
        <p className="mt-1">
          <MaterialBadge state="assessment" />
        </p>
        {d.assessments.length === 0 ? (
          <div className="mt-3">
            <State kind="empty">{t("iiu.sm.assessments.none")}</State>
            <Link
              to="/employer/$employerSlug/interview-intelligence/$caseId/evidence"
              params={{ employerSlug, caseId }}
              className={`${BUTTON} mt-3`}
            >
              {t("iiu.sm.assessments.cta")}
            </Link>
          </div>
        ) : (
          <ul className="mt-3 space-y-2">
            {d.assessments.map((a) => (
              <li key={a.id} className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Chip tone="work">{codeOf(a.questionId)}</Chip>
                  <Chip tone={a.level === 0 ? "attention" : "confirmed"}>{a.level}</Chip>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-foreground">{a.rationale}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---- The interviewer's own comments ------------------------------ */}
      <section className="mt-8 max-w-4xl" aria-labelledby="s-com">
        <h2 id="s-com" className="text-base font-semibold text-foreground">
          {t("iiu.sm.comments")}
        </h2>
        {comments.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{t("iiu.sm.comments.none")}</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {comments.map((n) => (
              <li key={n.id} className="rounded-lg border border-border p-3">
                <MaterialBadge state="note" />
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-foreground">
                  {n.body}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-8 max-w-4xl rounded-lg border border-border bg-muted/30 p-5">
        <p className="text-sm text-muted-foreground">{t("iiu.sm.nodecision")}</p>
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
