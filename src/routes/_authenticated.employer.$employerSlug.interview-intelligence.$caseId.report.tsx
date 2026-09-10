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
import { useMemo, useState } from "react";
import { EmployerAppShell } from "@/components/employer/EmployerAppShell";
import { EmployerErrorState } from "@/components/employer/EmployerErrorState";
import { EmployerAccessDenied } from "@/components/employer/EmployerAccessDenied";
import { useEmployerWorkspace } from "@/lib/job-intelligence/use-employer-workspace";
import { canFinaliseInterviewReport } from "@/lib/interview-intelligence/capability";
import {
  FinaliseBoundary,
  FinalReportReadbackPanel,
  ReportSequence,
  ReportVersionList,
} from "@/components/employer/interview/FinalReportSequence";
import { FinalReportDocument } from "@/components/employer/interview/FinalReportDocument";
import {
  finaliseEnabledWithPreview,
  finaliseErrorOutcome,
  readbackErrorOutcome,
  readbackOutcome,
  type FinaliseOutcome,
  type ReadbackOutcome,
  type ReportPreview,
  type ReportProgress,
} from "@/lib/interview-intelligence/final-report";
import {
  getFinalReportReadback,
  getReportVersion,
  getReportVersions,
  previewReport,
} from "@/lib/interview-intelligence/runtime.functions";
import { ReportFinalisation } from "@/components/employer/interview/ReportFinalisation";
import {
  CaseStatusChip,
  WorkflowNav,
  Chip,
  Panel,
  State,
  blockerMessage,
  interviewErrorMessage,
  GovernedGuidance,
  ProviderModeNote,
  WithheldPanel,
  BUTTON,
} from "@/components/employer/interview/InterviewUi";
import {
  Disclosure,
  Eyebrow,
  Field,
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
      singleFlight((v: { caseId: string; expectedBasisHash: string; draftRunId: string | null }) =>
        finaliseFn({ data: v }),
      ),
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
  // The GOVERNED readback. Not a table select: the RPC recomputes the digest
  // from the stored basis and returns the verdict, which is the difference
  // between a report that claims integrity and one that has been checked.
  const readback = useQuery({
    queryKey: ["ii", "finalReport", caseId],
    queryFn: () => getFinalReportReadback({ data: { caseId } }),
    retry: false,
  });
  const versions = useQuery({
    queryKey: ["ii", "reportVersions", caseId],
    queryFn: () => getReportVersions({ data: { caseId } }),
    retry: false,
  });
  const draft = useMutation({
    mutationFn: () => draftFn({ data: { caseId } }),
  });
  // The draft run travels with the finalisation as provenance. It contributes
  // no text: what is published is assembled from confirmed evidence and the
  // recorded human assessments, exactly as it is without a draft.
  // ── PREVIEW, AND THE IDENTITY IT HANDS THE OWNER ────────────────────
  // The preview is the document itself, produced by the same server function
  // finalisation uses. Its basis hash is what the finalise call sends back, so
  // the owner finalises exactly what they read -- and the server refuses
  // anything else.
  const previewFn = useServerFn(previewReport);
  const preview = useMutation({
    mutationFn: () => previewFn({ data: { caseId } }),
    onSuccess: () => setOutcome({ kind: "idle" }),
  });
  const previewInHand: ReportPreview | null = preview.data?.preview ?? null;
  const [outcome, setOutcome] = useState<FinaliseOutcome>({ kind: "idle" });

  // An earlier version opened from the history. Null means the current one.
  const [openVersion, setOpenVersion] = useState<string | null>(null);
  const versionFn = useServerFn(getReportVersion);
  const opened = useQuery({
    queryKey: ["ii", "reportVersion", openVersion],
    queryFn: () => versionFn({ data: { reportId: openVersion as string } }),
    enabled: openVersion !== null,
    retry: false,
  });

  const finalise = useMutation({
    mutationFn: () => {
      if (!previewInHand) throw new Error("SCP_IV_PREVIEW_REQUIRED");
      return finaliseOnce({
        caseId,
        expectedBasisHash: previewInHand.basisHash,
        draftRunId: draft.data?.status === "succeeded" ? draft.data.runId : null,
      });
    },
    onMutate: () => setOutcome({ kind: "finalising" }),
    onSuccess: async (r) => {
      void qc.invalidateQueries({ queryKey: ["ii"] });
      // Finalising is not finished when the mutation resolves. It is finished
      // when the governed readback comes back carrying the version and a
      // verified digest. Anything less is `writtenNotConfirmed`, which is not
      // a failure and must not be retried.
      const [rb] = await Promise.all([readback.refetch(), versions.refetch()]);
      const row = rb.data?.report ?? null;
      setOutcome(
        row && row.reportId === r.reportId && row.hashVerified
          ? { kind: "confirmed", reportId: r.reportId }
          : { kind: "writtenNotConfirmed", reportId: r.reportId },
      );
      preview.reset();
    },
    onError: (e: unknown) => {
      // The message names the rule that refused. A stale preview withdraws the
      // control until the owner reads again; nothing was written.
      setOutcome(finaliseErrorOutcome((e as { message?: string } | null)?.message));
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

  // Where the recruitment owner is in the work, from what the server already
  // reported. Requirements come from the pinned pack, so a case with none has
  // nothing to finalise -- and an empty blocker list on such a case must not
  // read as "ready".
  const progress: ReportProgress = {
    requirementCount: d.questions.length,
    assessedCount: new Set(d.assessments.map((a) => a.questionId)).size,
    outstandingCount: d.findings.filter((f) =>
      ["open", "needs_verification", "unresolved_difference"].includes(f.resolutionState),
    ).length,
    blockerCount: d.blockers.length,
    isFinal,
    canFinalise,
  };

  // Six states, five of which are not "here is your report". A refused read
  // and a broken read are told apart, and NEITHER is rendered as "none".
  const readbackState: ReadbackOutcome = readback.isLoading
    ? { kind: "loading" }
    : readback.isError
      ? readbackErrorOutcome((readback.error as { code?: string } | null)?.code ?? null)
      : readbackOutcome(readback.data?.report ?? null);

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

      {/* ---- The employer final report: sequence, boundary, readback ----
           The canonical output of this process. The ladder says where the
           recruitment owner is and what the ONE next act is; the boundary
           says what finalising does and, just as importantly, that it shares
           nothing with the candidate; the readback proves which version was
           finalised rather than asserting it. */}
      <div className="mt-6 max-w-4xl space-y-4">
        <ReportSequence progress={progress} />
        {!isFinal && <FinaliseBoundary />}
        <FinalReportReadbackPanel outcome={readbackState} onRetry={() => void readback.refetch()} />
        <ReportVersionList
          versions={versions.data?.versions ?? []}
          showing={
            openVersion !== null
              ? (opened.data?.report?.versionNumber ?? null)
              : readbackState.kind === "verified"
                ? readbackState.report.versionNumber
                : null
          }
          onOpen={(id) => setOpenVersion(id)}
        />
        {outcome.kind === "writtenNotConfirmed" && (
          <p role="alert" className="text-sm text-foreground">
            {t("iir.fin.writtenNotConfirmed")}
          </p>
        )}
        {(outcome.kind === "blocked" ||
          outcome.kind === "refused" ||
          outcome.kind === "failed" ||
          outcome.kind === "previewRequired") && (
          <p role="alert" className="text-sm text-foreground">
            {t(
              outcome.kind === "blocked"
                ? "iir.fin.blocked"
                : outcome.kind === "refused"
                  ? "iir.fin.refused"
                  : outcome.kind === "previewRequired"
                    ? "iir.fin.previewRequired"
                    : "iir.fin.failed",
            )}
          </p>
        )}
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
          description={t("iir.doc.preview.lede")}
          className="mt-8 max-w-4xl"
        >
          {/* THE PREVIEW IS THE DOCUMENT. Produced by the server's own builder
               -- the one finalisation calls -- and rendered by the same
               component the finalised report is rendered by. Not a live
               rendering of the case, and not a second copy that can drift. */}
          {previewInHand ? (
            <FinalReportDocument
              payload={previewInHand.payload}
              mode={{ kind: "preview", preview: previewInHand }}
            />
          ) : preview.isError ? (
            <p role="alert" className="text-sm text-foreground">
              {t("iir.readback.failed")}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">{t("iir.fin.previewFirst")}</p>
          )}
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
                previewed={previewInHand !== null && outcome.kind !== "stalePreview"}
                onPreview={() => preview.mutate()}
                isPreviewing={preview.isPending}
                stale={outcome.kind === "stalePreview"}
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
      {/* ---- The finalised report, from the readback and nothing else ----
           Rendered ONLY from a verified readback: the server recomputed the
           digest and it matched. A mismatch, a refusal or a failure is stated
           by the readback panel above and renders no document, because a
           document that might not be what was finalised is worse than none. */}
      {openVersion !== null ? (
        <div className="mt-10 max-w-4xl">
          <button
            type="button"
            onClick={() => setOpenVersion(null)}
            className="mb-3 inline-flex min-h-11 items-center text-sm font-medium text-accent hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {t("iir.versions.backToCurrent")}
          </button>
          {opened.isLoading ? (
            <p className="text-sm text-muted-foreground">{t("iir.readback.loading")}</p>
          ) : opened.data?.report &&
            opened.data.report.hashVerified &&
            opened.data.report.payload ? (
            <FinalReportDocument
              payload={opened.data.report.payload}
              mode={{
                kind: opened.data.report.status === "final" ? "final" : "history",
                readback: opened.data.report,
              }}
            />
          ) : (
            <p role="alert" className="text-sm text-foreground">
              {t(opened.isError ? "iir.readback.failed" : "iir.readback.notVerified")}
            </p>
          )}
        </div>
      ) : (
        readbackState.kind === "verified" &&
        readbackState.report.payload && (
          <div className="mt-10 max-w-4xl">
            <FinalReportDocument
              payload={readbackState.report.payload}
              mode={{ kind: "final", readback: readbackState.report }}
            />
          </div>
        )
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
