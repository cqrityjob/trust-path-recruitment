// Prepare — the recruiter's briefing for the conversation they are about to
// have, and the setup work that has to happen before it can start.
//
// The two are deliberately not the same thing and no longer share a shape.
// Setting a case up (attach the material, approve the plan) is a form, it is
// finite, and it disappears once it is done. The briefing is a document: what
// this interview has to establish, what the candidate has claimed, which areas
// to explore, what is unclear and what has to be checked somewhere else.
//
// The approval is the product's first real boundary: a draft brief is a
// suggestion, and only a person turning it into the active plan lets an
// interview start. The database enforces that too — starting a session from an
// unapproved plan is refused there, not just here.

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import type { TranslationKey } from "@/i18n/dictionaries";
import { useT } from "@/i18n/context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { EmployerAppShell } from "@/components/employer/EmployerAppShell";
import { EmployerErrorState } from "@/components/employer/EmployerErrorState";
import { EmployerAccessDenied } from "@/components/employer/EmployerAccessDenied";
import { useEmployerWorkspace } from "@/lib/job-intelligence/use-employer-workspace";
import {
  CaseStatusChip,
  WorkflowNav,
  Chip,
  Panel,
  State,
  TrustStageBanner,
  interviewErrorMessage,
  GovernedGuidance,
  MaterialBadge,
  ProviderModeChip,
  ProviderModeNote,
  SOURCE_KIND_LABEL,
  PURPOSE_LABEL,
  uiLabel,
  WithheldPanel,
  BUTTON,
  FIELD,
  PRIMARY_BUTTON,
} from "@/components/employer/interview/InterviewUi";
import {
  Disclosure,
  Eyebrow,
  Field,
  Nothing,
  RailPanel,
  Rule,
  Section,
  Surface,
  WorkSplit,
} from "@/components/employer/interview/InterviewLayout";
import { InterviewContextPanel } from "@/components/employer/interview/InterviewContextPanel";
import { getInterviewCaseContext } from "@/lib/interview-intelligence/context.functions";
import {
  addCaseSource,
  approvePreparation,
  getInterviewCase,
  getTrustStage,
  markSourcesReady,
  recordManualPreparation,
  runPreparation,
  startInterviewSession,
} from "@/lib/interview-intelligence/runtime.functions";

export const Route = createFileRoute(
  "/_authenticated/employer/$employerSlug/interview-intelligence/$caseId/prepare",
)({ ssr: false, component: Page, errorComponent: EmployerErrorState });

const ITEM_LABEL: Record<string, TranslationKey> = {
  focus_area: "iiu.pp.item.focus_area",
  relevant_experience: "iiu.pp.item.relevant_experience",
  missing_information: "iiu.pp.item.missing_information",
  ambiguity: "iiu.pp.item.ambiguity",
  verification_point: "iiu.pp.item.verification_point",
  probe: "iiu.pp.item.probe",
  clarification: "iiu.pp.item.clarification",
  prohibited_reminder: "iiu.pp.item.prohibited_reminder",
};

const FINDING_LABEL: Record<string, TranslationKey> = {
  gap: "iiu.find.gap",
  unclear: "iiu.find.unclear",
  contradiction: "iiu.find.contradiction",
  verification: "iiu.find.verification",
};

/** Which brief items belong under "needs clarification" rather than in the
 *  briefing proper. Kept as data so the two buckets can never overlap. */
const CLARIFY_ITEMS = ["missing_information", "ambiguity", "clarification"];

function Page() {
  const { employerSlug, caseId } = Route.useParams();
  const ws = useEmployerWorkspace(employerSlug);
  const { t, lang } = useT();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const getFn = useServerFn(getInterviewCase);

  const trustFn = useServerFn(getTrustStage);
  const addSourceFn = useServerFn(addCaseSource);
  const readyFn = useServerFn(markSourcesReady);
  const prepFn = useServerFn(runPreparation);
  const manualPrepFn = useServerFn(recordManualPreparation);
  const approveFn = useServerFn(approvePreparation);
  const startFn = useServerFn(startInterviewSession);

  const q = useQuery({
    queryKey: ["ii", "case", caseId],
    queryFn: () => getFn({ data: { caseId } }),
    retry: false,
  });
  // The recruitment context this case inherits from its application.
  //
  // Its OWN query, deliberately, rather than a field on the case read: it
  // reaches four other records and any of them may be slow or unavailable, and
  // the preparation screen must not wait on the assessment brief to draw the
  // interview. A failure here costs the briefing and nothing else.
  const contextFn = useServerFn(getInterviewCaseContext);
  const contextQ = useQuery({
    queryKey: ["ii", "context", caseId],
    queryFn: () => contextFn({ data: { caseId } }),
    retry: false,
  });

  // Which CQrity TRUST stage this case is in. Derived in the database from
  // the case status and the session's PEACE stage, so it cannot disagree
  // with the workflow the rest of the screen shows.
  const trustQ = useQuery({
    queryKey: ["ii", "trust-stage", caseId],
    queryFn: () => trustFn({ data: { caseId } }),
    retry: false,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["ii", "case", caseId] });

  const [kind, setKind] = useState<
    "job_description" | "candidate_cv" | "application_answers" | "employer_requirements"
  >("job_description");
  const [label, setLabel] = useState("");
  const [text, setText] = useState("");
  const [basis, setBasis] = useState(t("iiu.pp.basis.default"));
  const [approvalNote, setApprovalNote] = useState("");

  const addSource = useMutation({
    mutationFn: () =>
      addSourceFn({
        data: {
          caseId,
          sourceKind: kind,
          label,
          contentText: text,
          purposeCode: "recruitment_interview",
          lawfulBasisNote: basis,
          origin:
            kind === "candidate_cv" || kind === "application_answers"
              ? "candidate_application"
              : "employer_supplied",
        },
      }),
    onSuccess: () => {
      setLabel("");
      setText("");
      void refresh();
    },
  });
  const markReady = useMutation({
    mutationFn: () => readyFn({ data: { caseId } }),
    onSuccess: refresh,
  });
  // The manual preparation path. With AI disabled this is how a case reaches
  // an approved plan at all — the questions and probes come from the governed
  // pack either way, so what the interviewer adds is the conduct plan.
  const [timePlan, setTimePlan] = useState("");
  const [opening, setOpening] = useState("");
  const [closing, setClosing] = useState("");
  const manualPrep = useMutation({
    mutationFn: () =>
      manualPrepFn({
        data: {
          caseId,
          timePlan: timePlan || undefined,
          openingGuidance: opening || undefined,
          closingGuidance: closing || undefined,
        },
      }),
    onSuccess: () => void q.refetch(),
  });

  const generate = useMutation({
    mutationFn: () => prepFn({ data: { caseId } }),
    onSuccess: refresh,
  });
  const approve = useMutation({
    mutationFn: (planId: string) =>
      approveFn({ data: { planId, note: approvalNote || undefined } }),
    onSuccess: refresh,
  });
  const startSession = useMutation({
    mutationFn: () => startFn({ data: { caseId } }),
    onSuccess: () =>
      void navigate({
        to: "/employer/$employerSlug/interview-intelligence/$caseId/interview",
        params: { employerSlug, caseId },
      }),
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
    const notFound = (q.error as Error).message.includes("NOT_FOUND");
    return shell(
      <State
        kind={notFound ? "denied" : "error"}
        message={notFound ? undefined : interviewErrorMessage(q.error, t)}
      />,
    );
  }
  const d = q.data;
  if (!d) return shell(<State kind="loading" />);

  const genResult = generate.data;
  const setUp = ["draft", "sources_ready", "prep_generated"].includes(d.status);
  const started = [
    "interview_in_progress",
    "interview_complete",
    "evidence_review",
    "assessed",
    "reported",
  ].includes(d.status);

  const items = d.plan?.items ?? [];
  const openFindings = d.findings.filter((f) => f.resolutionState !== "resolved");
  // Two buckets a recruiter acts on differently: one is asked about in the
  // room, the other is checked afterwards against a document. Conflating them
  // is how a certificate ends up being "verified" by a conversation.
  const clarify = [
    ...openFindings.filter((f) => f.findingKind !== "verification"),
    ...items.filter((i) => CLARIFY_ITEMS.includes(i.itemKind)),
  ];
  const verify = [
    ...openFindings.filter((f) => f.findingKind === "verification"),
    ...items.filter((i) => i.itemKind === "verification_point"),
  ];
  const focusItems = items.filter((i) => i.itemKind === "focus_area");
  const backgroundItems = items.filter((i) => i.itemKind === "relevant_experience");
  const candidateSources = d.sources.filter(
    (s) => s.kind === "candidate_cv" || s.kind === "application_answers",
  );
  const primaryRequirement = (code: string | undefined) =>
    code ? (d.competencies.find((c) => c.code === code) ?? null) : null;
  const reqName = (c: { nameSv: string; nameEn: string | null }) =>
    (lang === "en" ? c.nameEn : c.nameSv) ?? c.nameSv;
  const reqDefinition = (c: { definitionSv: string | null; definitionEn: string | null }) =>
    (lang === "en" ? c.definitionEn : c.definitionSv) ?? c.definitionSv;
  // The pack is authored in one language and locked to its version. When the
  // reader's language is not the pack's, say so once rather than leaving them
  // to wonder which parts failed to translate.
  const packUntranslated =
    lang === "en" && d.competencies.some((c) => !c.nameEn) && d.competencies.length > 0;

  /* ---- the primary action for this screen, given where the case is ---- */
  const headerAction =
    d.status === "prep_approved" ? (
      <button
        type="button"
        className={PRIMARY_BUTTON}
        onClick={() => startSession.mutate()}
        disabled={startSession.isPending}
      >
        {t("iiu.pp.start")}
      </button>
    ) : started ? (
      <Link
        to="/employer/$employerSlug/interview-intelligence/$caseId/interview"
        params={{ employerSlug, caseId }}
        className={PRIMARY_BUTTON}
      >
        {t("iiu.pp.tointerview")}
      </Link>
    ) : null;

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
        {/* The person, then the case. Every one of these screens led with
            the case title -- internal bookkeeping -- and put the candidate
            underneath it in muted grey. */}
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {d.candidateDisplayName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{d.title}</p>
          {/* Status and role. The pack's validation label and its content hash
              used to sit here too: the first is governance metadata and the
              second is a checksum, and neither is something a recruiter about
              to meet a candidate can act on. Both remain available on the
              overview, under the method disclosure, where an auditor looks. */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <CaseStatusChip status={d.status} />
            <Chip>{d.packName ?? "—"}</Chip>
          </div>
        </div>
        {headerAction && <div className="shrink-0">{headerAction}</div>}
      </header>

      <div className="mt-5">
        <WorkflowNav
          status={d.status}
          current="prepare"
          employerSlug={employerSlug}
          caseId={caseId}
        />
      </div>

      {startSession.isError && (
        <div className="mt-5 max-w-3xl">
          <Panel tone="governance" role="alert" title={t("iiu.pp.start.failed")}>
            <p>{interviewErrorMessage(startSession.error, t)}</p>
          </Panel>
        </div>
      )}

      <div className="mt-7">
        <WorkSplit
          main={
            <>
              {/* ---- What CQrityjob already knows ----
                  FIRST, and above the setup work, because it is the answer to
                  the question the recruiter arrived with. Before this, a case
                  created from an application landed here knowing nothing about
                  it, and the first thing the screen did was ask for material
                  the product was already holding two clicks away.

                  Read live and stored nowhere: it briefs the interview, it is
                  not part of its record. */}
              <InterviewContextPanel
                context={contextQ.data ?? null}
                employerSlug={employerSlug}
                applicationId={d.applicationId}
                isLoading={contextQ.isLoading}
                isError={contextQ.isError}
              />
              <Rule />

              {/* ---- Setting the case up ----
                  Finite work with an end. It is on the page only while it is
                  the recruiter's actual job, and once the plan is approved it
                  is gone and the briefing has the column to itself. */}
              {setUp && (
                <>
                  <Section
                    id="s-setup"
                    title={t("iiu.pp.setup.title")}
                    description={t("iiu.pp.setup.body")}
                  >
                    <div className="space-y-4">
                      {d.sources.length === 0 ? (
                        <Nothing>{t("iiu.pp.nosources")}</Nothing>
                      ) : (
                        <ul className="divide-y divide-border rounded-lg border border-border">
                          {d.sources.map((s) => (
                            <li
                              key={s.id}
                              className="flex flex-wrap items-center gap-2 px-3 py-2.5"
                            >
                              <Chip tone="work">{uiLabel(SOURCE_KIND_LABEL, s.kind, t)}</Chip>
                              <span className="text-sm font-medium text-foreground">{s.label}</span>
                              <span className="text-xs text-muted-foreground">
                                {s.passageCount} {t("iiu.pp.passages")} · {t("iiu.pp.purpose")}:{" "}
                                {uiLabel(PURPOSE_LABEL, s.purposeCode, t)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}

                      {["draft", "sources_ready"].includes(d.status) && (
                        <Surface>
                          <form
                            className="space-y-3"
                            onSubmit={(e) => {
                              e.preventDefault();
                              if (label && text) addSource.mutate();
                            }}
                          >
                            <h3 className="text-sm font-semibold text-foreground">
                              {t("iiu.pp.addsource")}
                            </h3>
                            <div className="grid gap-3 sm:grid-cols-2">
                              <div>
                                <label
                                  htmlFor="src-kind"
                                  className="text-xs font-medium text-foreground"
                                >
                                  {t("iiu.pp.type")}
                                </label>
                                <select
                                  id="src-kind"
                                  value={kind}
                                  onChange={(e) => setKind(e.target.value as typeof kind)}
                                  className={FIELD}
                                >
                                  <option value="job_description">
                                    {t("iiu.source.job_description")}
                                  </option>
                                  <option value="employer_requirements">
                                    {t("iiu.source.employer_requirements")}
                                  </option>
                                  <option value="candidate_cv">
                                    {t("iiu.source.candidate_cv")}
                                  </option>
                                  <option value="application_answers">
                                    {t("iiu.source.application_answers")}
                                  </option>
                                </select>
                              </div>
                              <div>
                                <label
                                  htmlFor="src-label"
                                  className="text-xs font-medium text-foreground"
                                >
                                  {t("iiu.pp.label")}
                                </label>
                                <input
                                  id="src-label"
                                  value={label}
                                  onChange={(e) => setLabel(e.target.value)}
                                  className={FIELD}
                                  required
                                />
                              </div>
                            </div>
                            <div>
                              <label
                                htmlFor="src-text"
                                className="text-xs font-medium text-foreground"
                              >
                                {t("iiu.pp.content")}
                              </label>
                              <textarea
                                id="src-text"
                                rows={6}
                                value={text}
                                onChange={(e) => setText(e.target.value)}
                                className={FIELD}
                                required
                                aria-describedby="src-text-hint"
                              />
                              <p id="src-text-hint" className="mt-1 text-xs text-muted-foreground">
                                {t("iiu.pp.contenthint")}
                              </p>
                            </div>
                            <div>
                              <label
                                htmlFor="src-basis"
                                className="text-xs font-medium text-foreground"
                              >
                                {t("iiu.pp.legalbasis")}
                              </label>
                              <input
                                id="src-basis"
                                value={basis}
                                onChange={(e) => setBasis(e.target.value)}
                                className={FIELD}
                                required
                              />
                            </div>
                            {addSource.isError && (
                              <Panel
                                tone="governance"
                                role="alert"
                                title={t("iiu.pp.sourcefailed")}
                              >
                                <p>{interviewErrorMessage(addSource.error, t)}</p>
                              </Panel>
                            )}
                            <button type="submit" className={BUTTON} disabled={addSource.isPending}>
                              {addSource.isPending ? t("iiu.pp.saving") : t("iiu.pp.add")}
                            </button>
                          </form>
                        </Surface>
                      )}

                      {d.status === "draft" && d.sources.length > 0 && (
                        <button
                          type="button"
                          className={BUTTON}
                          onClick={() => markReady.mutate()}
                          disabled={markReady.isPending}
                        >
                          {t("iiu.pp.markready")}
                        </button>
                      )}

                      {/* An AI control that cannot run must not look like one.
                          The flag used to be OR'd with true, so this button
                          rendered as executable however the governed
                          configuration was set. */}
                      {!d.aiAvailable && d.status === "sources_ready" && (
                        <Surface>
                          <form
                            className="space-y-4"
                            onSubmit={(e) => {
                              e.preventDefault();
                              manualPrep.mutate();
                            }}
                          >
                            <div>
                              <h3 className="text-sm font-semibold text-foreground">
                                {t("iiu.pp.manual.title")}
                              </h3>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {t("iiu.pp.manual.body")}
                              </p>
                            </div>
                            <div>
                              <label
                                htmlFor="mp-time"
                                className="text-xs font-medium text-foreground"
                              >
                                {t("iiu.pp.manual.timeplan")}
                              </label>
                              <input
                                id="mp-time"
                                value={timePlan}
                                onChange={(e) => setTimePlan(e.target.value)}
                                className={FIELD}
                              />
                            </div>
                            <div>
                              <label
                                htmlFor="mp-open"
                                className="text-xs font-medium text-foreground"
                              >
                                {t("iiu.pp.manual.opening")}
                              </label>
                              <textarea
                                id="mp-open"
                                rows={2}
                                value={opening}
                                onChange={(e) => setOpening(e.target.value)}
                                className={FIELD}
                              />
                            </div>
                            <div>
                              <label
                                htmlFor="mp-close"
                                className="text-xs font-medium text-foreground"
                              >
                                {t("iiu.pp.manual.closing")}
                              </label>
                              <textarea
                                id="mp-close"
                                rows={2}
                                value={closing}
                                onChange={(e) => setClosing(e.target.value)}
                                className={FIELD}
                              />
                            </div>
                            {manualPrep.isError && (
                              <Panel
                                tone="governance"
                                role="alert"
                                title={t("iiu.pp.approve.failed")}
                              >
                                <p>{interviewErrorMessage(manualPrep.error, t)}</p>
                              </Panel>
                            )}
                            <button
                              type="submit"
                              className={PRIMARY_BUTTON}
                              disabled={manualPrep.isPending}
                            >
                              {manualPrep.isPending ? t("iiu.pp.saving") : t("iiu.pp.manual.save")}
                            </button>
                          </form>
                        </Surface>
                      )}

                      {d.aiAvailable && d.status === "sources_ready" && (
                        <div>
                          <button
                            type="button"
                            className={PRIMARY_BUTTON}
                            onClick={() => generate.mutate()}
                            disabled={generate.isPending}
                          >
                            {generate.isPending
                              ? t("iiu.pp.generate.working")
                              : t("iiu.pp.generate")}
                          </button>
                        </div>
                      )}
                      {generate.isPending && <State kind="aiRunning" />}
                      {genResult && (
                        <div className="space-y-3">
                          <ProviderModeChip mode={genResult.providerMode} />
                          <ProviderModeNote mode={genResult.providerMode} />
                          {genResult.withheld.length > 0 && (
                            <WithheldPanel withheld={genResult.withheld} />
                          )}
                          {genResult.status !== "succeeded" && (
                            <State
                              kind={
                                genResult.status === "abstained"
                                  ? "aiAbstained"
                                  : genResult.status === "provider_error" ||
                                      genResult.status === "timed_out"
                                    ? "aiUnavailable"
                                    : "aiInvalid"
                              }
                              message={genResult.message ?? undefined}
                            />
                          )}
                        </div>
                      )}

                      {d.plan?.status === "draft" && (
                        <div className="rounded-lg border border-amber-600/40 bg-amber-500/5 p-4">
                          <h3 className="text-sm font-semibold text-foreground">
                            {t("iiu.pp.approve.title")}
                          </h3>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {t("iiu.pp.approve.body")}
                          </p>
                          <label
                            htmlFor="approve-note"
                            className="mt-3 block text-xs font-medium text-foreground"
                          >
                            {t("iiu.pp.approve.note")}
                          </label>
                          <textarea
                            id="approve-note"
                            rows={2}
                            value={approvalNote}
                            onChange={(e) => setApprovalNote(e.target.value)}
                            className={FIELD}
                          />
                          {approve.isError && (
                            <Panel
                              tone="governance"
                              role="alert"
                              title={t("iiu.pp.approve.failed")}
                            >
                              <p>{interviewErrorMessage(approve.error, t)}</p>
                            </Panel>
                          )}
                          <button
                            type="button"
                            className={`${PRIMARY_BUTTON} mt-3`}
                            onClick={() => approve.mutate(d.plan!.id)}
                            disabled={approve.isPending}
                          >
                            {t("iiu.pp.approve.title")}
                          </button>
                        </div>
                      )}
                    </div>
                  </Section>
                  <Rule />
                </>
              )}

              {/* ---- What this interview has to establish ---- */}
              <Section
                id="s-focus"
                title={t("iiu.pp.focus.title")}
                description={t("iiu.pp.focus.body")}
              >
                {d.plan?.roleSummary && (
                  <dl className="mb-4">
                    <Field label={t("iiu.pp.focus.role")}>{d.plan.roleSummary}</Field>
                  </dl>
                )}
                <ul className="space-y-2.5">
                  {d.conductGuidance
                    .filter((g) => g.surface === "target_purpose")
                    .map((g) => (
                      <li key={g.id} className="flex gap-2.5 text-sm leading-relaxed">
                        <span aria-hidden="true" className="mt-1.5 text-accent">
                          ▪
                        </span>
                        <span className="text-foreground">
                          {(lang === "en" ? g.statementEn : g.statementSv) || g.statementSv}
                        </span>
                      </li>
                    ))}
                  {focusItems.map((i) => (
                    <li key={i.id} className="flex gap-2.5 text-sm leading-relaxed">
                      <span aria-hidden="true" className="mt-1.5 text-accent">
                        ▪
                      </span>
                      <span className="text-foreground">{i.statement}</span>
                    </li>
                  ))}
                </ul>
              </Section>

              <Rule />

              {/* ---- What the candidate has claimed, labelled as a claim ---- */}
              <Section
                id="s-background"
                title={t("iiu.pp.background.title")}
                description={t("iiu.pp.background.body")}
              >
                {d.plan?.candidateSummary || backgroundItems.length > 0 ? (
                  <div className="space-y-3">
                    {d.plan?.candidateSummary && (
                      <Surface>
                        <p className="text-sm leading-relaxed text-foreground">
                          {d.plan.candidateSummary}
                        </p>
                        <p className="mt-2.5">
                          <MaterialBadge state="candidate" />
                        </p>
                      </Surface>
                    )}
                    {backgroundItems.length > 0 && (
                      <ul className="space-y-2">
                        {backgroundItems.map((i) => (
                          <li key={i.id} className="text-sm leading-relaxed text-foreground">
                            {i.statement}
                            {i.sourceQuote && (
                              <blockquote className="mt-1 border-l-2 border-border pl-2.5 text-xs text-muted-foreground">
                                {i.sourceQuote}
                              </blockquote>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : (
                  <Nothing>{t("iiu.pp.background.none")}</Nothing>
                )}

                {candidateSources.length > 0 && (
                  <ul className="mt-3 flex flex-wrap gap-1.5">
                    {candidateSources.map((s) => (
                      <li key={s.id}>
                        <Chip srPrefix={t("iiu.pp.background.tag")}>
                          {uiLabel(SOURCE_KIND_LABEL, s.kind, t)} · {s.label}
                        </Chip>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              <Rule />

              {/* ---- The areas, and why each one is in the pack ---- */}
              <Section
                id="s-areas"
                title={t("iiu.pp.areas.title")}
                description={t("iiu.pp.areas.body")}
              >
                {packUntranslated && (
                  <p className="mb-3 max-w-[68ch] text-xs leading-relaxed text-muted-foreground">
                    {t("iiu.pp.packlocale.short")}
                  </p>
                )}
                {/* The prompt, then the requirement it exists to explore.
                    The requirement's full definition is deliberately NOT
                    repeated here: three of the eight questions share one
                    requirement, so printing the definition per question filled
                    the column with the same paragraph three times. It is
                    written out once, in the role-requirements panel. */}
                <ol className="divide-y divide-border border-y border-border">
                  {d.questions.map((qq) => {
                    const req = primaryRequirement(qq.competencyCodes[0]);
                    const also = qq.competencyCodes
                      .slice(1)
                      .map((code) => primaryRequirement(code))
                      .filter((c): c is NonNullable<typeof c> => c !== null);
                    return (
                      <li key={qq.id} className="flex gap-3.5 py-3.5">
                        <span
                          aria-hidden="true"
                          className="mt-0.5 inline-flex h-6 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40 font-mono text-[11px] font-semibold text-muted-foreground"
                        >
                          {qq.code}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium leading-relaxed text-foreground">
                            {qq.promptSv}
                          </p>
                          {req && (
                            <p className="mt-1 flex flex-wrap items-baseline gap-x-1.5 text-xs leading-relaxed text-muted-foreground">
                              <span className="font-semibold">{t("iiu.pp.areas.why")}:</span>
                              <span className="text-foreground">{reqName(req)}</span>
                              {also.map((c) => (
                                <span key={c.id} className="text-muted-foreground">
                                  · {reqName(c)}
                                </span>
                              ))}
                            </p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </Section>

              <Rule />

              {/* ---- The two kinds of open question ---- */}
              <div className="grid gap-6 lg:grid-cols-2">
                <Section
                  id="s-clarify"
                  title={t("iiu.pp.clarify.title")}
                  description={t("iiu.pp.clarify.body")}
                  level={3}
                >
                  {clarify.length === 0 ? (
                    <Nothing>{t("iiu.pp.clarify.none")}</Nothing>
                  ) : (
                    <ul className="space-y-2.5">
                      {clarify.map((c) => (
                        <li key={c.id} className="text-sm leading-relaxed">
                          <Chip tone="attention">
                            {"findingKind" in c
                              ? uiLabel(FINDING_LABEL, c.findingKind, t)
                              : uiLabel(ITEM_LABEL, c.itemKind, t)}
                          </Chip>{" "}
                          <span className="text-foreground">{c.statement}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {clarify.some((c) => "findingKind" in c && c.findingKind === "contradiction") && (
                    <p className="mt-3 max-w-[68ch] text-xs leading-relaxed text-muted-foreground">
                      {t("iiu.find.contradiction.note")}
                    </p>
                  )}
                </Section>

                <Section
                  id="s-verify"
                  title={t("iiu.pp.verify2.title")}
                  description={t("iiu.pp.verify2.body")}
                  level={3}
                >
                  {verify.length === 0 ? (
                    <Nothing>{t("iiu.pp.verify2.none")}</Nothing>
                  ) : (
                    <ul className="space-y-2.5">
                      {verify.map((v) => (
                        <li key={v.id} className="text-sm leading-relaxed">
                          <MaterialBadge state="verify" />{" "}
                          <span className="text-foreground">{v.statement}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>
              </div>

              {/* Everything the plan carried that is not already above. Kept
                  because it is the recruiter's own approved brief, moved to
                  the end because it is a record rather than a briefing. */}
              {items.length > 0 && (
                <Disclosure summary={t("iiu.pp.planitems")} className="mt-8">
                  <ul className="space-y-2.5">
                    {items.map((i) => {
                      const q8 = d.questions.find((qq) => qq.id === i.questionId);
                      return (
                        <li key={i.id} className="text-sm">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Chip
                              tone={i.itemKind === "missing_information" ? "attention" : "work"}
                            >
                              {uiLabel(ITEM_LABEL, i.itemKind, t)}
                            </Chip>
                            {q8 && <Chip>{q8.code}</Chip>}
                            <Chip
                              tone={i.claimClass === "source_grounded" ? "confirmed" : "neutral"}
                            >
                              {i.claimClass === "source_grounded"
                                ? t("iiu.pp.origin.sourced")
                                : i.claimClass === "governed_content"
                                  ? t("iiu.pp.origin.governed")
                                  : t("iiu.pp.origin.ai")}
                            </Chip>
                          </div>
                          <p className="mt-1.5 leading-relaxed text-foreground">{i.statement}</p>
                          {i.sourceQuote && (
                            <blockquote className="mt-1.5 border-l-2 border-teal-700/40 pl-2.5 text-xs text-muted-foreground">
                              {i.sourceQuote}
                            </blockquote>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </Disclosure>
              )}

              {started && (
                <div className="mt-8 flex flex-wrap gap-3">
                  <Link
                    to="/employer/$employerSlug/interview-intelligence/$caseId/evidence"
                    params={{ employerSlug, caseId }}
                    className={BUTTON}
                  >
                    {t("iiu.pp.toreview")}
                  </Link>
                  <Link
                    to="/employer/$employerSlug/interview-intelligence/$caseId/report"
                    params={{ employerSlug, caseId }}
                    className={BUTTON}
                  >
                    {t("iiu.rp.heading")}
                  </Link>
                </div>
              )}
            </>
          }
          rail={
            <>
              {/* ---- How the conversation runs ---- */}
              <RailPanel id="s-plan" title={t("iiu.pp.plan.title")}>
                {d.plan ? (
                  <ol className="space-y-3.5">
                    <PlanStep
                      ordinal={1}
                      label={t("iiu.pp.plan.opening")}
                      body={d.plan.openingGuidance}
                    />
                    <PlanStep
                      ordinal={2}
                      label={t("iiu.pp.plan.core")}
                      body={`${d.questions.length} · ${t("iiu.pp.plan.core.body")}${
                        d.plan.timePlan ? ` ${d.plan.timePlan}` : ""
                      }`}
                    />
                    <PlanStep
                      ordinal={3}
                      label={t("iiu.pp.plan.closing")}
                      body={d.plan.closingGuidance}
                    />
                  </ol>
                ) : (
                  <Nothing>{t("iiu.pp.plan.none")}</Nothing>
                )}
              </RailPanel>

              {/* ---- What the role asks for, written before this candidate ---- */}
              <RailPanel id="s-reqs" title={t("iiu.pp.reqs.title")} note={t("iiu.pp.reqs.body")}>
                {d.competencies.length === 0 ? (
                  <Nothing>{t("iiu.empty")}</Nothing>
                ) : (
                  <ul className="space-y-3">
                    {d.competencies.map((c) => (
                      <li key={c.id}>
                        <p className="flex gap-2 text-sm">
                          <span
                            aria-hidden="true"
                            className="mt-px font-mono text-xs font-semibold text-muted-foreground"
                          >
                            {c.code}
                          </span>
                          <span className="font-medium leading-snug text-foreground">
                            {reqName(c)}
                          </span>
                        </p>
                        {reqDefinition(c) && (
                          <p className="mt-0.5 pl-6 text-xs leading-relaxed text-muted-foreground">
                            {reqDefinition(c)}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </RailPanel>

              {/* ---- AI, and what it is not ----
                  With the provider off this is a single sentence rather than
                  an empty column with a dead button in it. */}
              <RailPanel id="s-ai" title={t("iiu.pp.ai.title")}>
                {!d.aiAvailable && (
                  <>
                    <p className="text-sm font-medium text-foreground">
                      {t("iiu.pp.aidisabled.title")}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {t("iiu.pp.aidisabled.body")}
                    </p>
                  </>
                )}
                {d.aiAvailable && d.plan && (
                  <>
                    <Eyebrow>{t("iiu.pp.airole.short")}</Eyebrow>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {(lang === "en" ? d.plan.aiDisclosureEn : d.plan.aiDisclosure) ??
                        d.plan.aiDisclosure}
                    </p>
                  </>
                )}
                {d.aiAvailable && !d.plan && (
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {t("iiu.pp.s2.title")}
                  </p>
                )}
              </RailPanel>

              {/* ---- The method, available and not first ---- */}
              <RailPanel id="s-about" title={t("iiu.pp.about.title")}>
                <TrustStageBanner stage={trustQ.data ?? null} aiAvailable={d.aiAvailable} />
                <Disclosure summary={t("iiu.pp.brief.method")} className="mt-3">
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {t("iiu.cd.governed")}
                  </p>
                  <GovernedGuidance
                    title={t("iiu.cd.ready.prompts")}
                    rows={d.conductGuidance.filter((g) => g.surface === "recall_prompt")}
                    note={t("iiu.cd.ready.prompts.note")}
                  />
                  <GovernedGuidance
                    title={t("iiu.cd.target.classes")}
                    rows={d.conductGuidance.filter((g) => g.surface === "target_evidence_class")}
                    note={t("iiu.cd.target.classes.note")}
                  />
                  <GovernedGuidance
                    title={t("iiu.cd.ready.plan")}
                    rows={d.conductGuidance.filter((g) => g.surface === "ready_plan")}
                  />
                  <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
                    {t("iiu.cd.hypothesis")}
                  </p>
                </Disclosure>
              </RailPanel>
            </>
          }
        />
      </div>
    </>,
  );
}

/** One step of the conduct plan: what it is, and the interviewer's own words
 *  for how to do it. */
function PlanStep({
  ordinal,
  label,
  body,
}: {
  ordinal: number;
  label: string;
  body: string | null;
}) {
  return (
    <li className="flex gap-2.5">
      <span
        aria-hidden="true"
        className="mt-px inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border text-[10px] font-semibold tabular-nums text-muted-foreground"
      >
        {ordinal}
      </span>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          {label}
        </p>
        <p className="mt-0.5 text-sm leading-relaxed text-foreground">{body ?? "—"}</p>
      </div>
    </li>
  );
}
