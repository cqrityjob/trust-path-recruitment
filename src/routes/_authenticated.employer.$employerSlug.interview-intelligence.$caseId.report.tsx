// The Candidate Interview Report: a document an employer can keep in the
// recruitment record, and — underneath it, collapsed — everything an auditor
// needs to prove how it was made.
//
// The report is built ONLY from confirmed evidence and recorded human
// assessments. It states that the employment decision belongs to the employer
// and records no outcome, because this engine does not make or store one.
//
// The separation is the whole design of this screen. A hiring manager reading
// six sections of plain prose is reading the product. A checksum, a model id,
// a run identifier and an event ledger belong to a different reader with a
// different question, and every one of them used to sit between the manager
// and the candidate's own material.

import { createFileRoute, Link } from "@tanstack/react-router";
import type { TranslationKey } from "@/i18n/dictionaries";
import { useT } from "@/i18n/context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo } from "react";
import { EmployerAppShell } from "@/components/employer/EmployerAppShell";
import { EmployerErrorState } from "@/components/employer/EmployerErrorState";
import { EmployerAccessDenied } from "@/components/employer/EmployerAccessDenied";
import { useEmployerWorkspace } from "@/lib/job-intelligence/use-employer-workspace";
import { canFinaliseInterviewReport } from "@/lib/interview-intelligence/capability";
import { ReportFinalisation } from "@/components/employer/interview/ReportFinalisation";
import { InterviewOutcome } from "@/components/employer/interview/InterviewOutcome";
import {
  CaseStatusChip,
  WorkflowNav,
  Chip,
  LevelZeroNote,
  MaterialBadge,
  Panel,
  ShortDate,
  State,
  blockerMessage,
  interviewErrorMessage,
  uiLabel,
  GovernedGuidance,
  ProviderModeNote,
  WithheldPanel,
  BUTTON,
} from "@/components/employer/interview/InterviewUi";
import {
  Disclosure,
  Eyebrow,
  Field,
  FactRow,
  Nothing,
  Section,
  Surface,
  Tally,
} from "@/components/employer/interview/InterviewLayout";
import {
  finaliseReport,
  getInterviewCase,
  getProcessQuality,
  runReportDraft,
} from "@/lib/interview-intelligence/runtime.functions";
import { singleFlight } from "@/lib/interview-intelligence/single-flight";

export const Route = createFileRoute(
  "/_authenticated/employer/$employerSlug/interview-intelligence/$caseId/report",
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
  const qc = useQueryClient();

  const getFn = useServerFn(getInterviewCase);
  const qualityFn = useServerFn(getProcessQuality);
  const finaliseFn = useServerFn(finaliseReport);
  const draftFn = useServerFn(runReportDraft);
  // Locking is irreversible and one click. A second click in the same frame
  // returns the in-flight request; the database, for its part, returns the
  // report it already made if nothing changed.
  const finaliseOnce = useMemo(
    () =>
      singleFlight((v: { caseId: string; draftRunId: string | null }) => finaliseFn({ data: v })),
    [finaliseFn],
  );

  const q = useQuery({
    queryKey: ["ii", "case", caseId],
    queryFn: () => getFn({ data: { caseId } }),
    retry: false,
  });
  const quality = useQuery({
    queryKey: ["ii", "quality", caseId],
    queryFn: () => qualityFn({ data: { caseId } }),
    retry: false,
  });
  const draft = useMutation({
    mutationFn: () => draftFn({ data: { caseId } }),
  });
  // The draft run travels with the finalisation as provenance. It contributes
  // no text: what is published is assembled from confirmed evidence and the
  // recorded human assessments, exactly as it is without a draft.
  const finalise = useMutation({
    mutationFn: () =>
      finaliseOnce({
        caseId,
        draftRunId: draft.data?.status === "succeeded" ? draft.data.runId : null,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["ii"] });
    },
  });

  if (ws.isLoading)
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <State kind="loading" />
      </div>
    );
  if (ws.isError || !ws.workspace) return <EmployerAccessDenied workspaces={ws.workspaces} />;

  // Whether THIS person may lock the report, from their own active membership
  // of this employer — the same row and the same two roles
  // scp_iv_finalise_report checks. Not inferred from being able to see the
  // page, from owning the case, or from having done the assessments.
  //
  // A courtesy, not a boundary: the database refuses a member either way.
  const canFinalise = canFinaliseInterviewReport(ws.workspace.role);

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

  const report = d.report;
  const isFinal = report?.status === "final";
  const payload = (report?.payload ?? null) as null | Record<string, unknown>;
  const qual = quality.data?.quality ?? null;

  // Header facts, taken from the record rather than invented. The session
  // itself carries when the conversation happened and who held it; the ledger
  // is the fallback, because a fixture can be seeded without events. Neither
  // field is printed unless the record actually holds it -- a report saying
  // "Interviewer: —" claims to know something it does not.
  const unassessed = d.blockers
    .filter((b) => b.code === "QUESTION_NOT_ASSESSED")
    .map((b) => /\b(Q\d+)\b/.exec(b.message)?.[1])
    .filter((c): c is string => Boolean(c));

  const eventAt = (name: string) => d.events.find((e) => e.event === name)?.at ?? null;
  const interviewDate =
    d.session?.completedAt ??
    d.session?.startedAt ??
    eventAt("interview_completed") ??
    eventAt("interview_started");
  const interviewers = (d.session?.interviewerNames ?? "").trim();

  const questionByCode = new Map(d.questions.map((qq) => [qq.code, qq]));
  const requirementByCode = new Map(d.competencies.map((c) => [c.code, c]));
  const reqName = (c: { nameSv: string; nameEn: string | null }) =>
    (lang === "en" ? c.nameEn : c.nameSv) ?? c.nameSv;

  const payloadQuestions = Array.isArray(payload?.questions)
    ? (payload.questions as Array<Record<string, unknown>>)
    : [];
  const unresolved = Array.isArray(payload?.unresolved)
    ? (payload.unresolved as Array<Record<string, unknown>>)
    : [];
  const followUp = unresolved.filter((u) => String(u.kind) !== "verification");
  const toVerify = unresolved.filter((u) => String(u.kind) === "verification");
  // The interviewer's own words, from the interview record. Not part of the
  // frozen payload, and not presented as if it were: this is the interview's
  // own note trail, which a human wrote and nothing generated.
  const comments = (d.session?.notes ?? []).filter(
    (n) => n.noteKind === "closing_summary" || n.noteKind === "process",
  );

  /** Every assessed question, grouped under the role requirement it explores.
   *  The assessment is recorded per question; the requirement is what the
   *  question is FOR, and grouping by it is what makes the section an
   *  assessment against requirements rather than a list of questions. */
  const byRequirement = d.competencies
    .map((c) => ({
      requirement: c,
      entries: payloadQuestions.filter(
        (pq) => questionByCode.get(String(pq.code))?.competencyCodes[0] === c.code,
      ),
    }))
    .filter((g) => g.entries.length > 0);
  const ungrouped = payloadQuestions.filter((pq) => {
    const code = questionByCode.get(String(pq.code))?.competencyCodes[0];
    return !code || !requirementByCode.has(code);
  });

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

      <header className="mt-3">
        {/* The person, then the role, then where the case is. */}
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {d.candidateDisplayName}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{d.packName ?? d.title}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <CaseStatusChip status={d.status} />
          {isFinal && (
            <Chip tone="confirmed" srPrefix={t("iiu.rp.srprefix")}>
              {t("iiu.rp.final")}
            </Chip>
          )}
        </div>
      </header>

      <div className="mt-5">
        <WorkflowNav
          status={d.status}
          current="report"
          employerSlug={employerSlug}
          caseId={caseId}
        />
      </div>

      {/* ---- What the report will be built from ----
           Shown BEFORE anything is locked, so the recruiter reads the material
           on the screen where they lock it: the candidate's confirmed
           examples, the assessment against each requirement, what is still
           open, and their own comments. This used to live on a separate
           summary screen between Assess and Report; a report screen that
           showed nothing of the report until it was locked was one of the
           things pilot recruiters could not read their way through. */}
      {!isFinal && (
        <Section
          id="s-preview"
          title={t("iiu.rp.preview.title")}
          description={t("iiu.rp.preview.body")}
          className="mt-8 max-w-4xl"
        >
          <InterviewOutcome d={d} employerSlug={employerSlug} caseId={caseId} />
        </Section>
      )}

      {/* ---- What remains before it can be locked ---- */}
      {!isFinal && (
        <Section
          id="s-block"
          title={t("iiu.rp.remaining")}
          description={t("iiu.rp.notfinal.lead")}
          className="mt-10 max-w-4xl"
        >
          {d.blockers.length === 0 ? (
            <div className="space-y-4">
              {/* CONTENT READINESS. Says only that the interview and
                  assessment work is complete.

                  It used to say "Inget hindrar rapporten" — nothing is
                  blocking the report — directly above an active Finalise
                  button, which merged two different claims into one
                  sentence: that the material is complete, and that the
                  person reading it may conclude the matter. The second was
                  false for every interviewer who is not also an owner or
                  admin, and the only way they could find out was to click.

                  So this panel now makes the first claim only, and who may
                  act on it is stated separately below. */}
              <Panel tone="confirmed" title={t("iiu.rp.ready.title")}>
                <p>{t(d.aiAvailable ? "iiu.rp.noblockers" : "iiu.rp.noblockers.manual")}</p>
              </Panel>
              {/* A refusal is only ever rendered AFTER an attempt.
                  An owner or admin who is shown the button and still gets a
                  permission error is looking at a real failure and must see
                  it as one — the backend is the boundary, and swallowing what
                  it says would hide a genuine disagreement between the two.
                  A member never reaches here, because they are never given
                  the button to fail with. */}
              {finalise.isError && (
                <Panel tone="governance" role="alert" title={t("iiu.rp.failed")}>
                  <p className="whitespace-pre-line">{interviewErrorMessage(finalise.error, t)}</p>
                </Panel>
              )}
              {d.aiAvailable && (
                <Surface>
                  <h3 className="text-sm font-semibold text-foreground">
                    {t("iiu.rp.draft.title")}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">{t("iiu.rp.draft.body")}</p>
                  <button
                    type="button"
                    className={`${BUTTON} mt-3`}
                    onClick={() => draft.mutate()}
                    disabled={draft.isPending}
                  >
                    {draft.isPending ? t("iiu.rp.draft.working") : t("iiu.rp.draft.run")}
                  </button>

                  {draft.isPending && (
                    <div className="mt-3">
                      <State kind="aiRunning" />
                    </div>
                  )}
                  {draft.isError && (
                    <div className="mt-3">
                      <State kind="aiUnavailable" message={interviewErrorMessage(draft.error, t)} />
                    </div>
                  )}
                  {draft.data && draft.data.status !== "succeeded" && (
                    <div className="mt-3">
                      <State
                        kind={draft.data.status === "abstained" ? "aiAbstained" : "aiInvalid"}
                        message={draft.data.message ?? undefined}
                      />
                    </div>
                  )}
                  {draft.data && draft.data.withheld.length > 0 && (
                    <div className="mt-3">
                      <WithheldPanel withheld={draft.data.withheld} />
                    </div>
                  )}
                  {draft.data && draft.data.sections.length > 0 && (
                    <div className="mt-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Eyebrow>{t("iiu.rp.draft.result")}</Eyebrow>
                      </div>
                      {draft.data.sections.map((sec) => (
                        <article key={sec.heading} className="mt-3">
                          <h4 className="text-sm font-medium text-foreground">{sec.heading}</h4>
                          <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                            {sec.body}
                          </p>
                        </article>
                      ))}
                      {draft.data.providerMode && (
                        <div className="mt-3">
                          <ProviderModeNote mode={draft.data.providerMode} />
                        </div>
                      )}
                      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                        {t("iiu.rp.draft.nodecision")}
                      </p>
                    </div>
                  )}
                </Surface>
              )}

              {/* AUTHORITY. A separate question from the one above, and
                  answered from the same membership row the database reads. */}
              <ReportFinalisation
                canFinalise={canFinalise}
                onFinalise={() => finalise.mutate()}
                isPending={finalise.isPending}
                employerSlug={employerSlug}
                caseId={caseId}
                applicationId={d.applicationId}
              />
            </div>
          ) : (
            /* Eight identical rows saying "Q1 has no assessment", "Q2 has no
               assessment" is a wall, not a list of things to do. The
               per-question blockers collapse into one row that names the
               questions; everything else keeps its own line. */
            <ul className="space-y-2">
              {d.blockers
                .filter((b) => b.code !== "QUESTION_NOT_ASSESSED")
                .map((b) => (
                  <li
                    key={`${b.code}-${b.message}`}
                    className="rounded-md border border-amber-600/40 bg-amber-500/5 px-3 py-2.5 text-sm"
                  >
                    <p className="text-foreground">{blockerMessage(b.code, b.message, t)}</p>
                  </li>
                ))}
              {unassessed.length > 0 && (
                <li className="rounded-md border border-amber-600/40 bg-amber-500/5 px-3 py-2.5 text-sm">
                  <p className="text-foreground">
                    {unassessed.length} {t("iiu.rp.blk.question_not_assessed.many")}
                  </p>
                  <p className="mt-1.5 flex flex-wrap gap-1.5">
                    {unassessed.map((code) => (
                      <Chip key={code} tone="attention">
                        {code}
                      </Chip>
                    ))}
                  </p>
                </li>
              )}
            </ul>
          )}
        </Section>
      )}

      {/* ---- The document ---- */}
      {isFinal && payload && (
        <article
          aria-labelledby="s-report"
          className="mt-10 max-w-4xl rounded-xl border border-border bg-card px-5 py-7 sm:px-9 sm:py-10"
        >
          <header className="border-b border-border pb-6">
            <h2
              id="s-report"
              className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl"
            >
              {t("iiu.rp.doc.title")}
            </h2>
            <p className="mt-2 max-w-[70ch] text-sm leading-relaxed text-muted-foreground">
              {t("iiu.rp.doc.lead")}
            </p>
            <div className="mt-6">
              <FactRow>
                <Field label={t("iiu.rp.doc.candidate")}>{d.candidateDisplayName}</Field>
                <Field label={t("iiu.rp.doc.role")}>{d.packName ?? d.title}</Field>
                <Field label={t("iiu.rp.doc.date")}>
                  <ShortDate iso={interviewDate} />
                </Field>
                {interviewers !== "" && (
                  <Field label={t("iiu.rp.doc.interviewer")}>{interviewers}</Field>
                )}
                <Field label={t("iiu.rp.doc.status")}>
                  {t("iiu.rp.final")}
                  {report ? ` · ${t("iiu.rp.doc.version")} ${report.versionNumber}` : ""}
                </Field>
              </FactRow>
            </div>
          </header>

          {/* ---- 1 · Scope ---- */}
          <DocSection
            ordinal={1}
            id="d-scope"
            title={t("iiu.rp.s.scope")}
            body={t("iiu.rp.s.scope.body")}
          >
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              <Field label={t("iiu.rp.rollpaket")}>{d.packName ?? "—"}</Field>
              <Field label={t("iiu.rp.doc.questions")}>{payloadQuestions.length}</Field>
              <Field label={t("iiu.rp.doc.sources")} wide>
                {Array.isArray(payload.sources) && (payload.sources as unknown[]).length > 0 ? (
                  <ul className="space-y-0.5">
                    {(payload.sources as Array<Record<string, unknown>>).map((src, i) => (
                      <li key={i}>{String(src.label)}</li>
                    ))}
                  </ul>
                ) : (
                  "—"
                )}
              </Field>
            </dl>
          </DocSection>

          {/* ---- 2 · The candidate's own examples ---- */}
          <DocSection
            ordinal={2}
            id="d-examples"
            title={t("iiu.rp.s.examples")}
            body={t("iiu.rp.s.examples.body")}
          >
            <ol className="space-y-6">
              {payloadQuestions.map((qq) => {
                const evidence = (qq.evidence ?? []) as Array<Record<string, unknown>>;
                return (
                  <li key={`ex-${String(qq.code)}`}>
                    <p className="text-sm font-medium leading-relaxed text-foreground">
                      <span className="mr-2 font-mono text-xs text-muted-foreground">
                        {String(qq.code)}
                      </span>
                      {String(qq.prompt)}
                    </p>
                    {evidence.length === 0 ? (
                      <p className="mt-2 text-sm italic text-muted-foreground">
                        {t("iiu.rp.doc.noexamples")}
                      </p>
                    ) : (
                      <ul className="mt-2.5 space-y-2">
                        {evidence.map((e, i) => (
                          <li
                            key={i}
                            className="border-l-2 border-teal-700/40 pl-4 text-sm leading-relaxed text-foreground"
                          >
                            {String(e.excerpt)}
                            {e.was_corrected === true && (
                              <span className="ml-2 text-xs text-muted-foreground">
                                {t("iiu.rp.correctedbyreviewer")}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ol>
            <p className="mt-5 max-w-[70ch] text-xs leading-relaxed text-muted-foreground">
              {t("iiu.rp.doc.nomaterial")}
            </p>
          </DocSection>

          {/* ---- 3 · What a person concluded, against what the role asks ---- */}
          <DocSection
            ordinal={3}
            id="d-assessment"
            title={t("iiu.rp.s.assessment")}
            body={t("iiu.rp.s.assessment.body")}
          >
            <div className="space-y-7">
              {byRequirement.map((group) => (
                <section key={group.requirement.id}>
                  <h4 className="flex items-baseline gap-2 text-sm font-semibold text-foreground">
                    <span aria-hidden="true" className="font-mono text-xs text-muted-foreground">
                      {group.requirement.code}
                    </span>
                    {reqName(group.requirement)}
                  </h4>
                  <div className="mt-2.5 space-y-3">
                    {group.entries.map((qq) => (
                      <AssessmentEntry key={`as-${String(qq.code)}`} entry={qq} t={t} />
                    ))}
                  </div>
                </section>
              ))}
              {ungrouped.map((qq) => (
                <AssessmentEntry key={`un-${String(qq.code)}`} entry={qq} t={t} />
              ))}
            </div>
            {/* Said once for the section rather than under every level-0 entry.
                Seven copies of the same amber paragraph is not seven times the
                emphasis; it is a document that looks like it is shouting. */}
            {payloadQuestions.some(
              (qq) => Number((qq.assessment as Record<string, unknown> | null)?.level) === 0,
            ) && (
              <div className="mt-5 max-w-[70ch]">
                <LevelZeroNote />
              </div>
            )}
          </DocSection>

          {/* ---- 4 · Still open ---- */}
          <DocSection ordinal={4} id="d-followup" title={t("iiu.rp.s.followup")}>
            {followUp.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("iiu.rp.s.followup.none")}</p>
            ) : (
              <ul className="space-y-2">
                {followUp.map((f, i) => (
                  <li key={i} className="text-sm leading-relaxed">
                    {/* The payload stores the enum. "contradiction" is a
                        database value, not a word an employer reads in a
                        document about a person. */}
                    <Chip tone="attention">{uiLabel(FINDING_LABEL, String(f.kind), t)}</Chip>{" "}
                    <span className="text-foreground">{String(f.statement)}</span>
                  </li>
                ))}
              </ul>
            )}
          </DocSection>

          {/* ---- 5 · Checked elsewhere, never in a conversation ---- */}
          <DocSection ordinal={5} id="d-verify" title={t("iiu.rp.s.verify")}>
            {toVerify.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("iiu.rp.s.verify.none")}</p>
            ) : (
              <ul className="space-y-2">
                {toVerify.map((f, i) => (
                  <li key={i} className="text-sm leading-relaxed">
                    <MaterialBadge state="verify" />{" "}
                    <span className="text-foreground">{String(f.statement)}</span>
                  </li>
                ))}
              </ul>
            )}
          </DocSection>

          {/* ---- 6 · The interviewer's own words ---- */}
          <DocSection
            ordinal={6}
            id="d-comments"
            title={t("iiu.rp.s.comments")}
            body={t("iiu.rp.s.comments.body")}
          >
            {comments.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("iiu.rp.s.comments.none")}</p>
            ) : (
              <ul className="space-y-3">
                {comments.map((n) => (
                  <li
                    key={n.id}
                    className="whitespace-pre-line text-sm leading-relaxed text-foreground"
                  >
                    {n.body}
                  </li>
                ))}
              </ul>
            )}
          </DocSection>

          {/* ---- The boundary this product exists to hold ----
               No control, disabled or otherwise. There is no employment-decision
               data model in the interview domain, and a greyed-out button would
               claim there is one coming. */}
          <section aria-labelledby="d-decision" className="mt-9 border-t border-border pt-6">
            <h3 id="d-decision" className="text-base font-semibold text-foreground">
              {t("iiu.rp.s.decision")}
            </h3>
            <p className="mt-2 max-w-[70ch] text-sm leading-relaxed text-foreground">
              {t("iiu.rp.decision.boundary")}
            </p>
            {payload.decision_boundary ? (
              <div className="mt-4 border-l-2 border-border pl-4">
                <Eyebrow>{t("iiu.rp.doc.locked.wording")}</Eyebrow>
                <p className="mt-1 max-w-[70ch] text-sm leading-relaxed text-muted-foreground">
                  {String(payload.decision_boundary)}
                </p>
              </div>
            ) : null}
          </section>

          <section aria-labelledby="d-ai" className="mt-7 border-t border-border pt-6">
            <h3 id="d-ai" className="text-base font-semibold text-foreground">
              {t("iiu.pp.airole.short")}
            </h3>
            <p className="mt-2 max-w-[70ch] text-sm leading-relaxed text-muted-foreground">
              {String((payload.ai_disclosure as Record<string, unknown>)?.statement ?? "")}
            </p>
          </section>
        </article>
      )}

      {/* ---- Method support: the interviewer's own conduct ----
           The interviewer reviews their OWN conduct. Nothing here is stored as
           an assessment of the candidate, and nothing here is generated. It
           is method support, so it is a disclosure rather than a task that
           sits between the recruiter and their report. A <summary> cannot be
           a heading, so the section carries one of its own for anyone
           navigating by headings. */}
      <section aria-labelledby="s-selfreview" className="mt-8 max-w-4xl">
        <h2 id="s-selfreview" className="sr-only">
          {t("iiu.cd.trace.selfreview")}
        </h2>
        <Disclosure summary={t("iiu.cd.trace.selfreview")}>
          {!isFinal && (
            <p className="mb-3 max-w-[70ch] text-sm leading-relaxed text-muted-foreground">
              {t("iiu.rp.selfreview.lead")}
            </p>
          )}
          <SelfReview guidance={d.conductGuidance} t={t} />
        </Disclosure>
      </section>

      {/* ---- Audit ----
           Everything above this line is what an employer reads. Nothing is
           deleted here; provenance moved to where an auditor looks for it. */}
      <section aria-labelledby="s-audit" className="mt-10 max-w-4xl">
        <h2 id="s-audit" className="sr-only">
          {t("iiu.rp.audit.title")}
        </h2>
        <Disclosure summary={t("iiu.rp.audit.title")}>
          <p className="max-w-[70ch] text-xs leading-relaxed text-muted-foreground">
            {t("iiu.rp.audit.body")}
          </p>

          {/* Checksums: what proves the published report and the pack text were
              not altered. Enormously important to an auditor, of no use at all
              to a hiring manager. */}
          <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {report?.contentHash && (
              <Field label={t("iiu.rp.hash")}>
                <code className="font-mono text-[11px] break-all">{report.contentHash}</code>
              </Field>
            )}
            {isFinal && payload?.pinned ? (
              <Field label={t("iiu.rp.packhash")}>
                <code className="font-mono text-[11px] break-all">
                  {String((payload.pinned as Record<string, unknown>)?.pack_content_hash ?? "—")}
                </code>
              </Field>
            ) : null}
          </dl>

          {/* Process quality: how the interview was run, never how the
              candidate did. It sat above the report as eight loud tiles. */}
          {qual && (
            <div className="mt-6">
              <Eyebrow>{t("iiu.rp.quality.title")}</Eyebrow>
              <p className="mt-1 max-w-[70ch] text-xs leading-relaxed text-muted-foreground">
                {t("iiu.rp.quality.note")}
              </p>
              <div className="mt-3 grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
                <Tally
                  label={t("iiu.rp.m.answered")}
                  value={`${qual.questions_answered}/${qual.questions_in_pack}`}
                />
                <Tally
                  label={t("iiu.rp.m.dimensions")}
                  value={`${qual.dimensions_with_confirmed_evidence}/${qual.dimensions_in_pack}`}
                />
                <Tally
                  label={t("iiu.rp.m.corrected")}
                  value={`${qual.proposals_corrected}/${qual.proposals_total}`}
                />
                <Tally
                  label={t("iiu.rp.m.awaiting")}
                  value={qual.proposals_awaiting_review}
                  tone={qual.proposals_awaiting_review > 0 ? "attention" : "neutral"}
                />
                <Tally
                  label={t("iiu.rp.m.level0")}
                  value={qual.insufficient_evidence_count}
                  tone="attention"
                />
                <Tally
                  label={t("iiu.rp.m.verifications")}
                  value={qual.verifications_outstanding}
                  tone={qual.verifications_outstanding > 0 ? "attention" : "neutral"}
                />
                <Tally label={t("iiu.rp.m.assessors")} value={qual.assessors_involved} />
                <Tally
                  label={t("iiu.rp.m.reflected")}
                  value={qual.interviewer_reflected ? t("iiu.rp.yes") : t("iiu.rp.no")}
                />
              </div>
            </div>
          )}

          {/* The ledger. Stored reasons are NOT rewritten into the reader's
              language: doing so would change what the audit trail says
              happened, so the note explains it instead. */}
          <div className="mt-6">
            <Eyebrow>{t("iiu.rp.traceability")}</Eyebrow>
            <p className="mt-1 max-w-[70ch] text-xs leading-relaxed text-muted-foreground">
              {t("iiu.rp.trace.note")}
            </p>
            {d.events.length === 0 ? (
              <div className="mt-3">
                <Nothing>{t("iiu.rp.nohistory")}</Nothing>
              </div>
            ) : (
              <div className="mt-3 overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[600px] text-left text-sm">
                  <caption className="sr-only">{t("iiu.rp.historycaption")}</caption>
                  <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th scope="col" className="px-4 py-2">
                        {t("iiu.rp.event")}
                      </th>
                      <th scope="col" className="px-4 py-2">
                        {t("iiu.rp.actor")}
                      </th>
                      <th scope="col" className="px-4 py-2">
                        {t("iiu.rp.reason")}
                      </th>
                      <th scope="col" className="px-4 py-2">
                        {t("iiu.rp.time")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {d.events.map((e) => (
                      <tr key={e.seq}>
                        <th
                          scope="row"
                          className="px-4 py-2 font-mono text-xs font-medium text-foreground"
                        >
                          {e.event}
                        </th>
                        <td className="px-4 py-2">
                          <Chip
                            tone={
                              e.actorKind === "ai"
                                ? "ai"
                                : e.actorKind === "system"
                                  ? "neutral"
                                  : "confirmed"
                            }
                          >
                            {e.actorKind === "ai"
                              ? "AI"
                              : e.actorKind === "system"
                                ? "System"
                                : t("iiu.rp.actor.human")}
                          </Chip>
                        </td>
                        <td className="px-4 py-2 text-muted-foreground">{e.reason ?? "—"}</td>
                        <td className="px-4 py-2 tabular-nums text-muted-foreground">
                          {new Date(e.at).toISOString().slice(0, 16).replace("T", " ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Disclosure>
      </section>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          to="/employer/$employerSlug/interview-intelligence/$caseId/evidence"
          params={{ employerSlug, caseId }}
          className={BUTTON}
        >
          {t("iiu.rp.toreview2")}
        </Link>
        <Link
          to="/employer/$employerSlug/interview-intelligence"
          params={{ employerSlug }}
          className={BUTTON}
        >
          {t("iiu.rp.tolist")}
        </Link>
      </div>
    </>,
  );
}

/** The governed self-review rows, used in two places on this screen. */
function SelfReview({
  guidance,
  t,
}: {
  guidance: readonly {
    readonly id: string;
    readonly surface: string;
    readonly statementSv: string;
    readonly statementEn: string;
  }[];
  t: (key: Parameters<ReturnType<typeof useT>["t"]>[0]) => string;
}) {
  return (
    <>
      <p className="text-sm text-muted-foreground">{t("iiu.cd.governed")}</p>
      <GovernedGuidance
        title={t("iiu.cd.trace.selfreview")}
        rows={guidance.filter((g) => g.surface === "trace_self_review")}
        note={t("iiu.cd.trace.selfreview.note")}
      />
      <GovernedGuidance
        title={t("iiu.cd.trace.closure")}
        rows={guidance.filter((g) => g.surface === "trace_closure")}
      />
    </>
  );
}

/** One numbered section of the document. */
function DocSection({
  ordinal,
  id,
  title,
  body,
  children,
}: {
  ordinal: number;
  id: string;
  title: string;
  body?: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="mt-9 border-t border-border pt-6 first:border-t-0">
      <h3 id={id} className="flex items-baseline gap-2.5 text-base font-semibold text-foreground">
        <span aria-hidden="true" className="text-sm tabular-nums text-muted-foreground">
          {ordinal}.
        </span>
        {title}
      </h3>
      {body && (
        <p className="mt-1.5 max-w-[70ch] text-sm leading-relaxed text-muted-foreground">{body}</p>
      )}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** One recorded human assessment, as the frozen payload holds it. */
function AssessmentEntry({
  entry,
  t,
}: {
  entry: Record<string, unknown>;
  t: (key: Parameters<ReturnType<typeof useT>["t"]>[0]) => string;
}) {
  const assessment = entry.assessment as Record<string, unknown> | null;
  if (!assessment) return null;
  const level = Number(assessment.level);
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <Chip>{String(entry.code)}</Chip>
        <Chip tone={level === 0 ? "attention" : "confirmed"} srPrefix={t("iiu.rp.humanassessment")}>
          {t("iiu.ev.level")} {level} — {String(assessment.level_meaning ?? "")}
        </Chip>
      </div>
      <p className="mt-2.5 text-sm leading-relaxed text-foreground">
        {String(assessment.rationale)}
      </p>
      {assessment.uncertainty ? (
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          <span className="font-medium">{t("iiu.ev.uncertainty")}</span>
          {String(assessment.uncertainty)}
        </p>
      ) : null}
      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
        <span className="font-medium">{t("iiu.ev.ankare")}</span>
        {String(assessment.anchor)}
      </p>
    </div>
  );
}
