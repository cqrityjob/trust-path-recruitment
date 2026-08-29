// Sources, AI preparation and the human approval gate.
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
  CaseSteps,
  Chip,
  NextStep,
  Panel,
  State,
  TrustStageBanner,
  interviewErrorMessage,
  ProviderModeChip,
  ProviderModeNote,
  SOURCE_KIND_LABEL,
  PURPOSE_LABEL,
  uiLabel,
  WithheldPanel,
  ValidationChip,
  BUTTON,
  FIELD,
  PRIMARY_BUTTON,
} from "@/components/employer/interview/InterviewUi";
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

  return shell(
    <>
      <nav aria-label={t("iiu.breadcrumbs")} className="text-sm">
        <Link
          to="/employer/$employerSlug/interview-intelligence"
          params={{ employerSlug }}
          className="text-accent underline-offset-2 hover:underline"
        >
          Interview Intelligence
        </Link>
      </nav>

      <header className="mt-3">
        <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">{d.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{d.candidateDisplayName}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <CaseStatusChip status={d.status} />
          <ValidationChip label={d.validationLabel} />
          <Chip>{d.packName ?? "—"}</Chip>
          {d.packContentHash && (
            <Chip srPrefix={t("iiu.pp.contenthash")}>
              <code className="font-mono text-[11px]">{d.packContentHash.slice(0, 10)}</code>
            </Chip>
          )}
        </div>
      </header>

      <div className="mt-6 max-w-4xl">
        <TrustStageBanner stage={trustQ.data ?? null} aiAvailable={d.aiAvailable} />
      </div>

      <div className="mt-6">
        <CaseSteps current={d.status} />
        <NextStep status={d.status} />
      </div>

      {/* ---- 1. Sources ---- */}
      <section className="mt-8" aria-labelledby="s-sources">
        <h2 id="s-sources" className="text-lg font-semibold text-foreground">
          {t("iiu.pp.s1.title")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("iiu.pp.s1.body")}</p>

        <div className="mt-4">
          {d.sources.length === 0 ? (
            <State kind="empty">{t("iiu.pp.nosources")}</State>
          ) : (
            <ul className="space-y-2">
              {d.sources.map((s) => (
                <li
                  key={s.id}
                  className="flex flex-wrap items-center gap-2 rounded-md border border-border p-3 text-sm"
                >
                  <Chip tone="work">{uiLabel(SOURCE_KIND_LABEL, s.kind, t)}</Chip>
                  <span className="font-medium text-foreground">{s.label}</span>
                  <span className="text-xs text-muted-foreground">{s.passageCount} avsnitt</span>
                  <span className="text-xs text-muted-foreground">
                    · {t("iiu.pp.purpose")}: {uiLabel(PURPOSE_LABEL, s.purposeCode, t)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {["draft", "sources_ready"].includes(d.status) && (
          <form
            className="mt-4 max-w-3xl space-y-3 rounded-lg border border-border p-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (label && text) addSource.mutate();
            }}
          >
            <h3 className="text-sm font-semibold text-foreground">{t("iiu.pp.addsource")}</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="src-kind" className="text-xs font-medium text-foreground">
                  Typ
                </label>
                <select
                  id="src-kind"
                  value={kind}
                  onChange={(e) => setKind(e.target.value as typeof kind)}
                  className={FIELD}
                >
                  <option value="job_description">{t("iiu.source.job_description")}</option>
                  <option value="employer_requirements">
                    {t("iiu.source.employer_requirements")}
                  </option>
                  <option value="candidate_cv">{t("iiu.source.candidate_cv")}</option>
                  <option value="application_answers">{t("iiu.source.application_answers")}</option>
                </select>
              </div>
              <div>
                <label htmlFor="src-label" className="text-xs font-medium text-foreground">
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
              <label htmlFor="src-text" className="text-xs font-medium text-foreground">
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
              <label htmlFor="src-basis" className="text-xs font-medium text-foreground">
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
              <Panel tone="governance" role="alert" title={t("iiu.pp.sourcefailed")}>
                <p>{interviewErrorMessage(addSource.error, t)}</p>
              </Panel>
            )}
            <button type="submit" className={BUTTON} disabled={addSource.isPending}>
              {addSource.isPending ? t("iiu.pp.saving") : t("iiu.pp.add")}
            </button>
          </form>
        )}

        {d.status === "draft" && d.sources.length > 0 && (
          <button
            type="button"
            className={`${BUTTON} mt-3`}
            onClick={() => markReady.mutate()}
            disabled={markReady.isPending}
          >
            Markera underlaget som klart
          </button>
        )}
      </section>

      {/* ---- 2. Preparation ---- */}
      <section className="mt-10" aria-labelledby="s-prep">
        <h2 id="s-prep" className="text-lg font-semibold text-foreground">
          {t("iiu.pp.s2.title")}
        </h2>

        {/* An AI control that cannot run must not look like one. The flag used
            to be OR'd with true, so this button rendered as executable however
            the governed configuration was set, and clicking it produced a
            runtime failure. The structured interview does not need it: the
            questions, probes and anchors come from the governed pack. */}
        {!d.aiAvailable && (
          <div className="mt-3 max-w-3xl">
            <Panel tone="neutral" title={t("iiu.pp.aidisabled.title")}>
              <p>{t("iiu.pp.aidisabled.body")}</p>
            </Panel>
          </div>
        )}

        {/* The manual path to an approved plan. Without it, a case cannot
            reach prep_approved while AI is off, and the structured interview
            — the whole pilot — could never be started. */}
        {!d.aiAvailable && d.status === "sources_ready" && (
          <form
            className="mt-4 max-w-3xl space-y-4 rounded-lg border border-border p-4"
            onSubmit={(e) => {
              e.preventDefault();
              manualPrep.mutate();
            }}
          >
            <div>
              <h3 className="text-sm font-semibold text-foreground">{t("iiu.pp.manual.title")}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{t("iiu.pp.manual.body")}</p>
            </div>
            <div>
              <label htmlFor="mp-time" className="text-xs font-medium text-foreground">
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
              <label htmlFor="mp-open" className="text-xs font-medium text-foreground">
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
              <label htmlFor="mp-close" className="text-xs font-medium text-foreground">
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
              <Panel tone="governance" role="alert" title={t("iiu.pp.approve.failed")}>
                <p>{interviewErrorMessage(manualPrep.error, t)}</p>
              </Panel>
            )}
            <button type="submit" className={PRIMARY_BUTTON} disabled={manualPrep.isPending}>
              {manualPrep.isPending ? t("iiu.pp.saving") : t("iiu.pp.manual.save")}
            </button>
          </form>
        )}

        {d.aiAvailable && d.status === "sources_ready" && (
          <div className="mt-3">
            <button
              type="button"
              className={PRIMARY_BUTTON}
              onClick={() => generate.mutate()}
              disabled={generate.isPending}
            >
              {generate.isPending ? t("iiu.pp.generate.working") : t("iiu.pp.generate")}
            </button>
          </div>
        )}
        {generate.isPending && (
          <div className="mt-3 max-w-3xl">
            <State kind="aiRunning" />
          </div>
        )}
        {genResult && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <ProviderModeChip mode={genResult.providerMode} />
          </div>
        )}
        {genResult && (
          <div className="mt-3 max-w-3xl">
            <ProviderModeNote mode={genResult.providerMode} />
          </div>
        )}
        {genResult && genResult.withheld.length > 0 && (
          <div className="mt-3 max-w-3xl">
            <WithheldPanel withheld={genResult.withheld} />
          </div>
        )}
        {genResult && genResult.status !== "succeeded" && (
          <div className="mt-3 max-w-3xl">
            <State
              kind={
                genResult.status === "abstained"
                  ? "aiAbstained"
                  : genResult.status === "provider_error" || genResult.status === "timed_out"
                    ? "aiUnavailable"
                    : "aiInvalid"
              }
              message={genResult.message ?? undefined}
            />
          </div>
        )}

        {d.plan && (
          <div className="mt-4 max-w-4xl space-y-4">
            <Panel tone="ai" title={t("iiu.pp.airole")}>
              <p>
                {(lang === "en" ? d.plan.aiDisclosureEn : d.plan.aiDisclosure) ??
                  d.plan.aiDisclosure}
              </p>
            </Panel>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("iiu.pp.f.role")}>{d.plan.roleSummary ?? "—"}</Field>
              <Field label={t("iiu.pp.f.candidate")}>{d.plan.candidateSummary ?? "—"}</Field>
              <Field label={t("iiu.pp.f.timeplan")}>{d.plan.timePlan ?? "—"}</Field>
              <Field label={t("iiu.pp.f.opening")}>{d.plan.openingGuidance ?? "—"}</Field>
              <Field label={t("iiu.practice.closure")}>{d.plan.closingGuidance ?? "—"}</Field>
            </div>

            <h3 className="text-sm font-semibold text-foreground">Underlagets punkter</h3>
            <ul className="space-y-2">
              {d.plan.items.map((i) => {
                const q8 = d.questions.find((qq) => qq.id === i.questionId);
                return (
                  <li key={i.id} className="rounded-md border border-border p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Chip tone={i.itemKind === "missing_information" ? "attention" : "work"}>
                        {uiLabel(ITEM_LABEL, i.itemKind, t)}
                      </Chip>
                      {q8 && <Chip>{q8.code}</Chip>}
                      <Chip tone={i.claimClass === "source_grounded" ? "confirmed" : "neutral"}>
                        {i.claimClass === "source_grounded"
                          ? t("iiu.pp.origin.sourced")
                          : i.claimClass === "governed_content"
                            ? t("iiu.pp.origin.governed")
                            : t("iiu.pp.origin.ai")}
                      </Chip>
                    </div>
                    <p className="mt-1.5 text-foreground">{i.statement}</p>
                    {i.sourceQuote && (
                      <blockquote className="mt-1.5 border-l-2 border-teal-700/40 pl-2 text-xs text-muted-foreground">
                        {i.sourceQuote}
                      </blockquote>
                    )}
                  </li>
                );
              })}
            </ul>

            {d.plan.status === "draft" && (
              <div className="rounded-lg border border-amber-600/40 bg-amber-500/5 p-4">
                <h3 className="text-sm font-semibold text-foreground">
                  {t("iiu.pp.approve.title")}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">{t("iiu.pp.approve.body")}</p>
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
                  <Panel tone="governance" role="alert" title={t("iiu.pp.approve.failed")}>
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

            {d.plan.status === "approved" && (
              <Panel tone="confirmed" title={t("iiu.pp.approved.title")}>
                <p>{t("iiu.pp.approved.body")}</p>
              </Panel>
            )}
          </div>
        )}
      </section>

      {/* ---- 3. Start ---- */}
      {d.status === "prep_approved" && (
        <section className="mt-10" aria-labelledby="s-start">
          <h2 id="s-start" className="text-lg font-semibold text-foreground">
            {t("iiu.pp.s3.title")}
          </h2>
          {startSession.isError && (
            <div className="mt-3 max-w-3xl">
              <Panel tone="governance" role="alert" title="Intervjun kunde inte startas">
                <p>{interviewErrorMessage(startSession.error, t)}</p>
              </Panel>
            </div>
          )}
          <button
            type="button"
            className={`${PRIMARY_BUTTON} mt-3`}
            onClick={() => startSession.mutate()}
            disabled={startSession.isPending}
          >
            Starta intervju
          </button>
        </section>
      )}

      {[
        "interview_in_progress",
        "interview_complete",
        "evidence_review",
        "assessed",
        "reported",
      ].includes(d.status) && (
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            to="/employer/$employerSlug/interview-intelligence/$caseId/interview"
            params={{ employerSlug, caseId }}
            className={BUTTON}
          >
            Intervjuvyn
          </Link>
          <Link
            to="/employer/$employerSlug/interview-intelligence/$caseId/evidence"
            params={{ employerSlug, caseId }}
            className={BUTTON}
          >
            Evidensgranskning
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
    </>,
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm leading-relaxed text-foreground">{children}</p>
    </div>
  );
}
