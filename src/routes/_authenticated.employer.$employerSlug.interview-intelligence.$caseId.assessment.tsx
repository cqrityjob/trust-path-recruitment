// Assess — the recruiter interprets confirmed material against the role.
//
// This lived at the bottom of the review screen, which made Review and Assess
// two names for one page: the workflow said they were different steps and
// clicking either opened the same scroll. They are different cognitive jobs.
// Review decides what counts as material. Assessment decides what the material
// means against a requirement. Running them together encourages the thing the
// product exists to prevent -- forming a judgement while still deciding what
// the evidence is.
//
// No new data model. Same recordAssessment and markAssessed, same governed
// anchors, same levels. This is an information-architecture separation.

import { createFileRoute, Link } from "@tanstack/react-router";
import { useT } from "@/i18n/context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { EmployerAppShell } from "@/components/employer/EmployerAppShell";
import { EmployerErrorState } from "@/components/employer/EmployerErrorState";
import { EmployerAccessDenied } from "@/components/employer/EmployerAccessDenied";
import { useEmployerWorkspace } from "@/lib/job-intelligence/use-employer-workspace";
import {
  CaseHeader,
  Chip,
  LevelZeroNote,
  MaterialBadge,
  Panel,
  State,
  WorkflowNav,
  interviewErrorMessage,
  BUTTON,
  FIELD,
  PRIMARY_BUTTON,
} from "@/components/employer/interview/InterviewUi";
import {
  getInterviewCase,
  markAssessed,
  recordAssessment,
} from "@/lib/interview-intelligence/runtime.functions";

export const Route = createFileRoute(
  "/_authenticated/employer/$employerSlug/interview-intelligence/$caseId/assessment",
)({ ssr: false, component: Page, errorComponent: EmployerErrorState });

function Page() {
  const { employerSlug, caseId } = Route.useParams();
  const ws = useEmployerWorkspace(employerSlug);
  const { t, lang } = useT();
  const qc = useQueryClient();

  const getFn = useServerFn(getInterviewCase);
  const assessFn = useServerFn(recordAssessment);
  const doneFn = useServerFn(markAssessed);

  const q = useQuery({
    queryKey: ["ii", "case", caseId],
    queryFn: () => getFn({ data: { caseId } }),
    retry: false,
  });
  const refresh = () => void qc.invalidateQueries({ queryKey: ["ii"] });

  const [levels, setLevels] = useState<Record<string, number>>({});
  const [rationales, setRationales] = useState<Record<string, string>>({});
  // Which half of the form is still missing, per requirement, so the message
  // names the actual gap instead of a generic "fill in the fields".
  const [assessHint, setAssessHint] = useState<Record<string, "level" | "rationale" | null>>({});

  const assess = useMutation({
    mutationFn: (v: { questionId: string; level: number; rationale: string }) =>
      assessFn({
        data: { caseId, questionId: v.questionId, level: v.level, rationale: v.rationale },
      }),
    onSuccess: refresh,
  });
  const finishAssessing = useMutation({
    mutationFn: () => doneFn({ data: { caseId } }),
    onSuccess: refresh,
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

  // Work completion, never performance. "5 of 8 assessed" says how far the
  // recruiter has got; it says nothing whatever about Marcus Lindqvist.
  const done = d.assessments.length;
  const total = d.questions.length;
  const openItems = d.findings.filter((f) => f.resolutionState !== "resolved");

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

      <div className="mt-3">
        <CaseHeader
          candidate={d.candidateDisplayName}
          role={d.packName ?? d.title}
          status={d.status}
          action={
            done > 0 ? (
              <Link
                to="/employer/$employerSlug/interview-intelligence/$caseId/summary"
                params={{ employerSlug, caseId }}
                className={PRIMARY_BUTTON}
              >
                {t("iiu.as.tosummary")}
              </Link>
            ) : undefined
          }
        />
      </div>

      <div className="mt-5">
        <WorkflowNav
          status={d.status}
          current="assess"
          employerSlug={employerSlug}
          caseId={caseId}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{t("iiu.ev.s3.body")}</p>
          <p className="mt-2">
            <MaterialBadge state="assessment" />
          </p>
          <div className="mt-3">
            <LevelZeroNote />
          </div>
          <section className="mt-6" aria-labelledby="s-assess">
            <h2 id="s-assess" className="sr-only">
              {t("iiu.ev.s3.title")}
            </h2>
            <ul className="mt-4 space-y-3">
              {d.questions.map((qq) => {
                const existing = d.assessments.find((a) => a.questionId === qq.id);
                const evidenceCount = d.evidence.filter((e) => e.questionId === qq.id).length;
                return (
                  <li key={qq.id} className="rounded-lg border border-border p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Chip tone="work">{qq.code}</Chip>
                      {evidenceCount > 0 ? (
                        <Chip tone="confirmed">
                          {evidenceCount} {t("iiu.ev.confirmedcount")}
                        </Chip>
                      ) : (
                        <Chip tone="attention">{t("iiu.ev.noconfirmed")}</Chip>
                      )}
                      {existing && (
                        <Chip
                          tone={existing.level === 0 ? "attention" : "confirmed"}
                          srPrefix={t("iiu.ev.level.srprefix")}
                        >
                          {t("iiu.ev.level")} {existing.level}
                        </Chip>
                      )}
                    </div>
                    <p className="mt-2 text-sm text-foreground">{qq.promptSv}</p>

                    {existing ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        <span className="font-medium">{t("iiu.ev.motivering")}</span>
                        {existing.rationale}
                      </p>
                    ) : (
                      <form
                        className="mt-3 space-y-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const lvl = levels[qq.id];
                          const rat = rationales[qq.id] ?? "";
                          // Silent returns taught the interviewer nothing about
                          // why the button did nothing. Say it instead.
                          if (lvl === undefined) {
                            setAssessHint((st) => ({ ...st, [qq.id]: "level" }));
                            return;
                          }
                          if (rat.trim() === "") {
                            setAssessHint((st) => ({ ...st, [qq.id]: "rationale" }));
                            return;
                          }
                          setAssessHint((st) => ({ ...st, [qq.id]: null }));
                          assess.mutate({ questionId: qq.id, level: lvl, rationale: rat });
                        }}
                      >
                        {/* The database refuses a level above 0 without confirmed
                        evidence, and rightly so. Saying that AFTER the save
                        button is a bad way to teach a rule the interviewer
                        could have been told up front — which is exactly how
                        the owner met it in UAT. So the rule is shown here,
                        in the same place the choice is made. */}
                        {evidenceCount === 0 && (
                          <Panel tone="attention" title={t("iiu.ev.needevidence.title")}>
                            <p>{t("iiu.ev.needevidence.body")}</p>
                            <p className="mt-2 flex flex-wrap gap-2">
                              <a
                                href="#s-author"
                                className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                              >
                                {t("iiu.ev.needevidence.cta.evidence")}
                              </a>
                              <button
                                type="button"
                                className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                                onClick={() => setLevels((st) => ({ ...st, [qq.id]: 0 }))}
                              >
                                {t("iiu.ev.needevidence.cta.zero")}
                              </button>
                            </p>
                          </Panel>
                        )}

                        <fieldset>
                          <legend className="text-xs font-medium text-foreground">
                            {t("iiu.ev.level")}
                          </legend>
                          <div className="mt-1 flex flex-wrap gap-2">
                            {[...qq.anchors]
                              .sort((a, b) => a.level - b.level)
                              .map((a) => {
                                // Levels 1-4 are unreachable until evidence exists.
                                // Disabled rather than hidden: the interviewer
                                // should see the scale they are working within.
                                const locked = a.level > 0 && evidenceCount === 0;
                                return (
                                  <label
                                    key={a.id}
                                    title={locked ? t("iiu.ev.needevidence.locked") : undefined}
                                    className={`rounded-md border px-3 py-1.5 text-xs ${
                                      locked
                                        ? "cursor-not-allowed border-border opacity-50"
                                        : "cursor-pointer"
                                    } ${
                                      levels[qq.id] === a.level
                                        ? "border-accent font-semibold"
                                        : "border-border"
                                    } ${a.level === 0 ? "bg-amber-500/5" : ""}`}
                                  >
                                    <input
                                      type="radio"
                                      name={`lvl-${qq.id}`}
                                      value={a.level}
                                      className="sr-only"
                                      disabled={locked}
                                      checked={levels[qq.id] === a.level}
                                      onChange={() =>
                                        setLevels((st) => ({ ...st, [qq.id]: a.level }))
                                      }
                                    />
                                    {a.level} —{" "}
                                    {(lang === "en" ? a.labelEn : a.labelSv) ?? a.labelSv}
                                    {locked && (
                                      <span className="sr-only">
                                        {" "}
                                        ({t("iiu.ev.needevidence.locked")})
                                      </span>
                                    )}
                                  </label>
                                );
                              })}
                          </div>
                        </fieldset>
                        <div>
                          <label
                            htmlFor={`rat-${qq.id}`}
                            className="text-xs font-medium text-foreground"
                          >
                            {t("iiu.ev.rationale")}
                          </label>
                          <textarea
                            id={`rat-${qq.id}`}
                            rows={2}
                            className={FIELD}
                            value={rationales[qq.id] ?? ""}
                            onChange={(e) =>
                              setRationales((s) => ({ ...s, [qq.id]: e.target.value }))
                            }
                          />
                        </div>
                        {/* Three different situations, three different messages.
                        Reusing the evidence guidance when a level simply had
                        not been picked told the interviewer to go and find
                        evidence they already had. */}
                        {assessHint[qq.id] === "level" && (
                          <p role="alert" className="text-xs text-destructive">
                            {evidenceCount === 0
                              ? t("iiu.ev.needevidence.body")
                              : t("iiu.ev.hint.level")}
                          </p>
                        )}
                        {assessHint[qq.id] === "rationale" && (
                          <p role="alert" className="text-xs text-destructive">
                            {t("iiu.ev.rationale.missing")}
                          </p>
                        )}
                        <button type="submit" className={BUTTON} disabled={assess.isPending}>
                          {t("iiu.ev.save")}
                        </button>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>

            {assess.isError && (
              <div className="mt-3">
                <Panel tone="governance" role="alert" title={t("iiu.ev.savefailed")}>
                  <p className="whitespace-pre-line">{interviewErrorMessage(assess.error, t)}</p>
                </Panel>
              </div>
            )}

            {d.status === "evidence_review" && d.assessments.length === d.questions.length && (
              <button
                type="button"
                className={`${PRIMARY_BUTTON} mt-4`}
                onClick={() => finishAssessing.mutate()}
                disabled={finishAssessing.isPending}
              >
                {t("iiu.ev.done")}
              </button>
            )}
          </section>
        </div>

        {/* Workflow completion, and what is still open. Deliberately counts
            and a plain fraction: a ring or a percentage here would be read as
            how well the candidate did, which is exactly the reading this
            product must never invite. */}
        <aside className="lg:sticky lg:top-4 lg:self-start" aria-labelledby="s-progress">
          <div className="rounded-lg border border-border p-4">
            <h2 id="s-progress" className="text-sm font-semibold text-foreground">
              {t("iiu.as.done")}
            </h2>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">
              {done} {t("iiu.ov.of")} {total}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{t("iiu.as.done.note")}</p>

            {openItems.length > 0 && (
              <>
                <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("iiu.as.open")}
                </h3>
                <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                  {openItems.slice(0, 5).map((f) => (
                    <li key={f.id}>{f.statement}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </aside>
      </div>
    </>,
  );
}
