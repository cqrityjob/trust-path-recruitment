// BESKT inside the interview case — the interviewer's working surface.
//
// ── WHY THIS IS A ROUTE INSIDE THE CASE AND NOT A PRODUCT ────────────────
//
// BESKT is method support for an interview that already exists. It creates no
// case, advances no case and decides nothing. Giving it its own top-level
// destination would have made it a second product a recruiter has to remember
// to visit — and, worse, a second place where a candidate is written about.
// It lives at /interview-intelligence/$caseId/beskt, under the case, beside
// the other stages, reachable from the case overview and from nowhere else.
//
// ── THE FOUR GATES ───────────────────────────────────────────────────────
//
// The module exists here only when the case has a live PR 4 link, the
// preparation behind it has been submitted, the reader may read the case, and
// the bound method version still matches what the candidate answered. All
// four are established by `getBesktCaseModule` on the server; this file reads
// the answer and never re-decides it.
//
// ── THE ONE THING THIS FILE MUST NOT GET WRONG ───────────────────────────
//
// Independence. `workspace.others` is empty until the reader's own position is
// locked, and `othersVisible` says so. This file converts that into `null`
// before it reaches any component, so there is no code path in which a
// withheld position could be rendered, embedded in the DOM, or sent to a
// child as an empty list that might be mistaken for "nobody recorded
// anything". The database is the enforcement; this is the shape that keeps a
// future refactor from quietly undoing it.

import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { useT } from "@/i18n/context";
import { EmployerAppShell } from "@/components/employer/EmployerAppShell";
import { EmployerErrorState } from "@/components/employer/EmployerErrorState";
import { EmployerAccessDenied } from "@/components/employer/EmployerAccessDenied";
import { useEmployerWorkspace } from "@/lib/job-intelligence/use-employer-workspace";
import { BUTTON, Panel, PRIMARY_BUTTON, State } from "@/components/employer/interview/InterviewUi";
import {
  getBesktCaseModule,
  getBesktConductWorkspace,
  joinBesktConductSession,
  lockBesktPosition,
  openBesktPanel,
  recordBesktPanelResolution,
  recordBesktVerification,
  reopenBesktPosition,
  revealBesktPanel,
  saveBesktConductEntry,
  startBesktConductSession,
  getBesktTopicPrompts,
  previewBesktReport,
  getBesktFinalReport,
  listBesktReportVersions,
  finaliseBesktReport,
  type BesktResolutionKind,
  type BesktVerificationState,
} from "@/lib/beskt/interview-conduct.functions";
import {
  besktInvalidateAfterMutation,
  besktModuleKey,
  besktPromptsKey,
  besktReportKey,
  besktWorkspaceKey,
} from "@/lib/beskt/conduct-queries";
import { besktErrorKey } from "@/lib/beskt/errors";
import {
  BesktLimitsPanel,
  BesktMethodHeader,
} from "@/components/employer/interview/beskt/BesktMethodHeader";
import { BesktSnapshot } from "@/components/employer/interview/beskt/BesktSnapshot";
import { BesktInternalTestBanner } from "@/components/beskt/BesktInternalTestBanner";
import { BesktThemes } from "@/components/employer/interview/beskt/BesktThemes";
import { BesktPositionSection } from "@/components/employer/interview/beskt/BesktPosition";
import { BesktPanelSection } from "@/components/employer/interview/beskt/BesktPanel";
import { BesktStagePrompts } from "@/components/employer/interview/beskt/BesktPrompts";
import { BesktReportSection } from "@/components/employer/interview/beskt/BesktReport";
import { TOUCH } from "@/components/employer/interview/beskt/BesktConductUi";
import type { BesktEntryFields } from "@/components/employer/interview/beskt/BesktEntryForm";

const VIEWS = ["interview", "position", "panel", "report"] as const;
type View = (typeof VIEWS)[number];

// `catch` rather than a hard failure: a stale link should open the
// conversation, not a validation error.
const searchSchema = z.object({
  view: z.enum(VIEWS).catch("interview").optional(),
});

export const Route = createFileRoute(
  "/_authenticated/employer/$employerSlug/interview-intelligence/$caseId/beskt",
)({
  ssr: false,
  component: Page,
  errorComponent: EmployerErrorState,
  validateSearch: (search) => searchSchema.parse(search),
});

/**
 * A fresh operation id per attempt, reused while an attempt is still failing.
 *
 * The database answers a replayed operation id with the first attempt's
 * result BEFORE writing anything, so a retry after a dropped response
 * cannot write twice. That only works if the retry carries the SAME id, which
 * is why it is held rather than regenerated on every click.
 */
function useOperationId(): { take: () => string; clear: () => void } {
  const [id, setId] = useState<string | null>(null);
  return {
    take: () => {
      if (id !== null) return id;
      const next = crypto.randomUUID();
      setId(next);
      return next;
    },
    clear: () => setId(null),
  };
}

function Page() {
  const { employerSlug, caseId } = Route.useParams();
  const view: View = Route.useSearch().view ?? "interview";
  const ws = useEmployerWorkspace(employerSlug);
  const { t } = useT();
  const queryClient = useQueryClient();

  const moduleFn = useServerFn(getBesktCaseModule);
  const moduleQ = useQuery({
    queryKey: besktModuleKey(employerSlug, caseId),
    queryFn: () => moduleFn({ data: { caseId } }),
    retry: false,
  });

  const sessionId = moduleQ.data?.sessionId ?? null;

  const workspaceFn = useServerFn(getBesktConductWorkspace);
  const workspaceQ = useQuery({
    queryKey: besktWorkspaceKey(employerSlug, caseId, sessionId ?? "none"),
    queryFn: () => workspaceFn({ data: { sessionId: sessionId! } }),
    enabled: sessionId !== null,
    retry: false,
  });

  // The governed wordings. A separate query because they have a different
  // lifetime from the record: they move only when the method version does.
  const promptsFn = useServerFn(getBesktTopicPrompts);
  const promptsQ = useQuery({
    queryKey: besktPromptsKey(employerSlug, caseId, sessionId ?? "none"),
    queryFn: () => promptsFn({ data: { sessionId: sessionId! } }),
    enabled: sessionId !== null,
    retry: false,
  });

  // The report. Three reads that always travel together, because a screen
  // that showed a finalised document without knowing whether the record has
  // moved since would be telling a reader the document is current when it
  // may not be.
  const previewFn = useServerFn(previewBesktReport);
  const finalFn = useServerFn(getBesktFinalReport);
  const versionsFn = useServerFn(listBesktReportVersions);

  // ── WHY THE PREVIEW IS WITHHELD UNTIL THE DATABASE SAYS OTHERS ARE
  //    VISIBLE, AND WHY THAT IS A MITIGATION AND NOT A BOUNDARY ─────────
  //
  // `bcp_conduct_preview_report` gates on three things: authentication,
  // the session existing, and `scp_iv_can_read_case`. It does NOT call
  // `bcp_conduct_may_see_others`, and the helper it delegates to,
  // `bcp_conduct_build_report_basis`, is SECURITY DEFINER — so it returns
  // EVERY assessor's entries, bypassing the row policies that carry the
  // independence rule everywhere else in this surface.
  //
  // Nothing called that function before this change, so the gap was
  // latent. A Report tab that called it unconditionally would make it
  // reachable: an assessor whose own position is still open could read a
  // colleague's locked one and anchor on it, which is the single thing
  // the conduct layer is built to prevent.
  //
  // `othersVisible` is the DATABASE's own answer to "may this reader see
  // other positions yet" — `bcp_conduct_may_see_others`, returned by the
  // workspace. Gating on it closes the reachable path with the correct
  // predicate rather than a guess.
  //
  // It is not the boundary. A crafted request that skips this file reaches
  // the same RPC, so the boundary is the `bcp_conduct_may_see_others` check
  // that 20261127090000 (PR #266, schema-first) adds inside
  // `bcp_conduct_preview_report`. This condition stays as defence in depth,
  // and until that migration is live it is what keeps the product from
  // shipping a reachable route to the hole.
  // See docs/architecture/beskt-report-preview-independence.md.
  const othersVisible = workspaceQ.data?.othersVisible === true;

  const reportQ = useQuery({
    queryKey: besktReportKey(employerSlug, caseId, sessionId ?? "none"),
    queryFn: async () => {
      const id = sessionId!;
      const [preview, finalReport, versions] = await Promise.all([
        previewFn({ data: { sessionId: id } }),
        finalFn({ data: { sessionId: id } }),
        versionsFn({ data: { sessionId: id } }),
      ]);
      return { preview, finalReport, versions };
    },
    enabled: sessionId !== null && view === "report" && othersVisible,
    retry: false,
  });

  const invalidate = async () => {
    for (const key of besktInvalidateAfterMutation(employerSlug, caseId, sessionId)) {
      await queryClient.invalidateQueries({ queryKey: key });
    }
  };

  // ---- the governed mutations, each a thin wrapper that refetches on success
  const startOp = useOperationId();
  const joinOp = useOperationId();
  const entryOp = useOperationId();
  const verifyOp = useOperationId();
  const lockOp = useOperationId();
  const reopenOp = useOperationId();
  const panelOp = useOperationId();
  const revealOp = useOperationId();
  const resolutionOp = useOperationId();
  const reportOp = useOperationId();

  const startFn = useServerFn(startBesktConductSession);
  const joinFn = useServerFn(joinBesktConductSession);
  const saveEntryFn = useServerFn(saveBesktConductEntry);
  const verifyFn = useServerFn(recordBesktVerification);
  const lockFn = useServerFn(lockBesktPosition);
  const reopenFn = useServerFn(reopenBesktPosition);
  const openPanelFn = useServerFn(openBesktPanel);
  const revealFn = useServerFn(revealBesktPanel);
  const resolutionFn = useServerFn(recordBesktPanelResolution);
  const finaliseFn = useServerFn(finaliseBesktReport);

  const [pendingItemKey, setPendingItemKey] = useState<string | null>(null);
  const [savedItemKey, setSavedItemKey] = useState<string | null>(null);
  const [pendingEntryId, setPendingEntryId] = useState<string | null>(null);
  const [verifiedEntryId, setVerifiedEntryId] = useState<string | null>(null);

  const start = useMutation({
    mutationFn: (linkId: string) => startFn({ data: { operationId: startOp.take(), linkId } }),
    onSuccess: async () => {
      startOp.clear();
      await invalidate();
    },
  });

  const join = useMutation({
    mutationFn: (input: { sessionId: string; positionRole: "assessor" | "responsible_owner" }) =>
      joinFn({ data: { operationId: joinOp.take(), ...input } }),
    onSuccess: async () => {
      joinOp.clear();
      await invalidate();
    },
  });

  const saveEntry = useMutation({
    mutationFn: (input: {
      positionId: string;
      expectedRevision: number;
      itemKey: string;
      topicId: string | null;
      fields: BesktEntryFields;
      correctsEntryId: string | null;
      correctionReason: string | null;
    }) =>
      saveEntryFn({
        data: {
          operationId: entryOp.take(),
          positionId: input.positionId,
          expectedRevision: input.expectedRevision,
          entry: {
            itemKey: input.itemKey,
            topicId: input.topicId,
            observableFact: input.fields.observableFact,
            candidateExplanation: input.fields.candidateExplanation,
            interviewerInterpretation: input.fields.interviewerInterpretation,
            alternativeExplanation: input.fields.alternativeExplanation,
            protectiveFactor: input.fields.protectiveFactor,
            verificationNeed: input.fields.verificationNeed,
            verificationState: input.fields.verificationState,
            verificationSource: input.fields.verificationSource,
            sensitivityClass: input.fields.sensitivityClass,
          },
          correctsEntryId: input.correctsEntryId,
          correctionReason: input.correctionReason ?? undefined,
        },
      }),
    // The confirmation is set only here, after the server has answered. The
    // screen never reports a save it has not been told happened.
    onSuccess: async (result) => {
      entryOp.clear();
      setSavedItemKey(result.itemKey);
      await invalidate();
    },
    onSettled: () => setPendingItemKey(null),
  });

  const verify = useMutation({
    mutationFn: (input: {
      entryId: string;
      expectedRevision: number;
      newState: BesktVerificationState;
      source: string | null;
      note: string | null;
    }) =>
      verifyFn({
        data: {
          operationId: verifyOp.take(),
          entryId: input.entryId,
          expectedRevision: input.expectedRevision,
          newState: input.newState,
          source: input.source ?? undefined,
          note: input.note ?? undefined,
        },
      }),
    // Again from the server's own answer, not from the request: the entry id
    // that comes back is the one the write actually landed on.
    onSuccess: async (result) => {
      verifyOp.clear();
      setVerifiedEntryId(result.entryId);
      await invalidate();
      if (sessionId !== null && pendingEntryId !== null) {
        await queryClient.invalidateQueries({
          queryKey: ["beskt", "conduct", "entry", sessionId, pendingEntryId],
        });
      }
    },
    onSettled: () => setPendingEntryId(null),
  });

  const lock = useMutation({
    mutationFn: (input: { positionId: string; expectedRevision: number }) =>
      lockFn({ data: { operationId: lockOp.take(), ...input } }),
    onSuccess: async () => {
      lockOp.clear();
      await invalidate();
    },
  });

  const reopen = useMutation({
    mutationFn: (input: { positionId: string; expectedRevision: number; reason: string }) =>
      reopenFn({ data: { operationId: reopenOp.take(), ...input } }),
    onSuccess: async () => {
      reopenOp.clear();
      await invalidate();
    },
  });

  const openPanel = useMutation({
    mutationFn: (input: { sessionId: string }) =>
      openPanelFn({ data: { operationId: panelOp.take(), ...input } }),
    onSuccess: async () => {
      panelOp.clear();
      await invalidate();
    },
  });

  const reveal = useMutation({
    mutationFn: (input: { panelId: string; expectedRevision: number }) =>
      revealFn({ data: { operationId: revealOp.take(), ...input } }),
    onSuccess: async () => {
      revealOp.clear();
      await invalidate();
    },
  });

  const resolution = useMutation({
    mutationFn: (input: {
      panelId: string;
      expectedRevision: number;
      itemKey: string;
      resolutionKind: BesktResolutionKind;
      agreedStatement: string | null;
      divergentStatement: string | null;
      rationale: string;
    }) =>
      resolutionFn({
        data: {
          operationId: resolutionOp.take(),
          panelId: input.panelId,
          expectedRevision: input.expectedRevision,
          itemKey: input.itemKey,
          resolutionKind: input.resolutionKind,
          agreedStatement: input.agreedStatement ?? undefined,
          divergentStatement: input.divergentStatement ?? undefined,
          rationale: input.rationale,
        },
      }),
    onSuccess: async () => {
      resolutionOp.clear();
      await invalidate();
    },
  });

  /**
   * Writing the report.
   *
   * `expectedBasisHash` is the hash the reader was SHOWN. It is passed
   * straight through and never recomputed here: the safeguard is that a
   * human is answerable for the document they read, and a client that
   * recalculated the hash would be signing whatever the record says now.
   */
  const finalise = useMutation({
    mutationFn: (expectedBasisHash: string) =>
      finaliseFn({
        data: { operationId: reportOp.take(), sessionId: sessionId!, expectedBasisHash },
      }),
    onSuccess: async () => {
      reportOp.clear();
      await invalidate();
    },
  });

  // ---- shell states ------------------------------------------------------
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

  if (moduleQ.isLoading) return shell(<State kind="loading" />);
  if (moduleQ.isError) {
    return shell(<State kind="error" message={t(besktErrorKey(moduleQ.error))} />);
  }

  const mod = moduleQ.data!;

  const header = (
    <header className="max-w-4xl">
      <Link
        to="/employer/$employerSlug/interview-intelligence/$caseId"
        params={{ employerSlug, caseId }}
        className="text-sm text-muted-foreground underline underline-offset-2"
      >
        {t("beskt.conduct.back")}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold text-foreground">{t("beskt.conduct.title")}</h1>
      <p className="mt-2 max-w-[72ch] text-sm leading-relaxed text-muted-foreground">
        {t("beskt.conduct.lede")}
      </p>
      <div className="mt-4">
        <BesktLimitsPanel />
      </div>
    </header>
  );

  // ---- the module gate, said in words rather than by a missing page ------
  if (!mod.linked || !mod.submitted || !mod.methodBindingValid) {
    const why = !mod.linked
      ? t("beskt.module.notLinked")
      : !mod.submitted
        ? t("beskt.module.notSubmitted")
        : t("beskt.module.bindingInvalid");
    return shell(
      <>
        {header}
        <div className="mt-6 max-w-4xl">
          <Panel tone="neutral" title={t("beskt.module.title")}>
            <p>{why}</p>
          </Panel>
        </div>
      </>,
    );
  }

  const binding = {
    nameSv: mod.method?.nameSv ?? null,
    nameEn: mod.method?.nameEn ?? null,
    versionNumber: mod.method?.versionNumber ?? null,
    mode: mod.method?.mode ?? null,
    validationLabel: mod.method?.validationLabel ?? null,
    releaseScope: mod.method?.releaseScope ?? null,
    methodVersionId: mod.method?.methodVersionId ?? "",
    contentHash: mod.method?.contentHash ?? "",
    answersContentHash: mod.method?.answersContentHash ?? "",
    responseVersion: null as number | null,
    linkedAt: mod.linkedAt,
  };

  // ---- no session yet: offer to open it ----------------------------------
  if (sessionId === null) {
    return shell(
      <>
        {header}
        <div className="mt-6 max-w-4xl space-y-4">
          <BesktMethodHeader binding={binding} />
          <BesktInternalTestBanner methodVersionId={binding.methodVersionId} />
          <section className="rounded-lg border border-border p-4" aria-labelledby="beskt-start-h">
            <h2 id="beskt-start-h" className="text-sm font-semibold text-foreground">
              {t("beskt.conduct.start.heading")}
            </h2>
            <p className="mt-1 max-w-[72ch] text-sm leading-relaxed text-muted-foreground">
              {t("beskt.conduct.start.body")}
            </p>
            {start.isError && (
              <p role="alert" className="mt-3 text-sm text-destructive">
                {t(besktErrorKey(start.error))}
              </p>
            )}
            <button
              type="button"
              className={`${PRIMARY_BUTTON} ${TOUCH} mt-4`}
              disabled={start.isPending || mod.linkId === null}
              onClick={() => mod.linkId && start.mutate(mod.linkId)}
            >
              {start.isPending ? t("beskt.conduct.start.working") : t("beskt.conduct.start.action")}
            </button>
          </section>
          <BesktSnapshot answers={mod.answers} />
        </div>
      </>,
    );
  }

  if (workspaceQ.isLoading)
    return shell(
      <>
        {header}
        <div className="mt-6">
          <State kind="loading" />
        </div>
      </>,
    );
  if (workspaceQ.isError) {
    return shell(
      <>
        {header}
        <div className="mt-6">
          <State kind="error" message={t(besktErrorKey(workspaceQ.error))} />
        </div>
      </>,
    );
  }

  const w = workspaceQ.data!;
  binding.responseVersion = w.bound.responseVersion;

  // THE INDEPENDENCE RULE, in one expression. `others` becomes null — not an
  // empty array — whenever the database is withholding, so no component below
  // has a branch that could render a hidden position.
  const others = w.othersVisible ? w.others : null;

  const myPosition = w.myPosition;
  const canWrite = myPosition !== null && myPosition.state === "open";

  const nav = (
    <nav aria-label={t("beskt.conduct.nav.aria")} className="mt-6 max-w-4xl">
      <ul className="flex flex-wrap gap-2">
        {VIEWS.map((v) => (
          <li key={v}>
            <Link
              to="/employer/$employerSlug/interview-intelligence/$caseId/beskt"
              params={{ employerSlug, caseId }}
              search={{ view: v }}
              aria-current={view === v ? "page" : undefined}
              className={`${view === v ? PRIMARY_BUTTON : BUTTON} ${TOUCH}`}
            >
              {t(
                v === "interview"
                  ? "beskt.conduct.nav.interview"
                  : v === "position"
                    ? "beskt.conduct.nav.position"
                    : v === "panel"
                      ? "beskt.conduct.nav.panel"
                      : "beskt.conduct.nav.report",
              )}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );

  const joinBlock =
    myPosition === null ? (
      <JoinPanel
        busy={join.isPending}
        error={join.isError ? join.error : null}
        onJoin={(role) => join.mutate({ sessionId, positionRole: role })}
      />
    ) : null;

  return shell(
    <>
      {header}
      {nav}

      <div className="mt-6 max-w-4xl space-y-4">
        <BesktMethodHeader binding={binding} />
        <BesktInternalTestBanner methodVersionId={binding.methodVersionId} />
        {joinBlock}

        {view === "interview" && (
          <>
            <BesktSnapshot answers={mod.answers} />
            {promptsQ.data?.available && <BesktStagePrompts prompts={promptsQ.data.stagePrompts} />}
            <BesktThemes
              sessionId={sessionId}
              methodVersionId={w.bound.methodVersionId}
              topics={w.topics}
              entries={w.myEntries}
              prompts={promptsQ.data ?? null}
              actions={{
                canWrite,
                pendingItemKey,
                savedItemKey,
                saveError: saveEntry.isError ? saveEntry.error : null,
                verifyPendingEntryId: pendingEntryId,
                verifiedEntryId,
                verifyError: verify.isError ? verify.error : null,
                saveEntry: (input) => {
                  if (myPosition === null) return;
                  setPendingItemKey(input.itemKey);
                  setSavedItemKey(null);
                  saveEntry.mutate({
                    positionId: myPosition.positionId,
                    expectedRevision: myPosition.revision,
                    itemKey: input.itemKey,
                    topicId: input.topicId,
                    fields: input.fields,
                    correctsEntryId: input.correctsEntryId,
                    correctionReason: input.correctionReason,
                  });
                },
                recordVerification: (input) => {
                  if (myPosition === null) return;
                  setPendingEntryId(input.entryId);
                  setVerifiedEntryId(null);
                  verify.mutate({
                    entryId: input.entryId,
                    expectedRevision: myPosition.revision,
                    newState: input.newState,
                    source: input.source,
                    note: input.note,
                  });
                },
              }}
            />
          </>
        )}

        {view === "position" &&
          (myPosition === null ? (
            <Panel tone="neutral" title={t("beskt.conduct.join.heading")}>
              <p>{t("beskt.conduct.join.body")}</p>
            </Panel>
          ) : (
            <BesktPositionSection
              position={myPosition}
              entries={w.myEntries}
              topics={w.topics}
              others={others}
              lockBusy={lock.isPending}
              lockError={lock.isError ? lock.error : null}
              reopenBusy={reopen.isPending}
              reopenError={reopen.isError ? reopen.error : null}
              onLock={() =>
                lock.mutate({
                  positionId: myPosition.positionId,
                  expectedRevision: myPosition.revision,
                })
              }
              onReopen={(reason) =>
                reopen.mutate({
                  positionId: myPosition.positionId,
                  expectedRevision: myPosition.revision,
                  reason,
                })
              }
            />
          ))}

        {view === "report" && !othersVisible && (
          <Panel tone="neutral" title={t("beskt.report.withheld.title")}>
            <p>{t("beskt.report.withheld.body")}</p>
            <p className="mt-2">{t("beskt.report.withheld.whatToDo")}</p>
          </Panel>
        )}

        {view === "report" &&
          othersVisible &&
          (reportQ.isLoading ? (
            <State kind="loading" />
          ) : reportQ.isError ? (
            <State kind="error" message={t(besktErrorKey(reportQ.error))} />
          ) : (
            <BesktReportSection
              preview={reportQ.data?.preview ?? null}
              finalReport={reportQ.data?.finalReport ?? null}
              versions={reportQ.data?.versions ?? []}
              actions={{
                // Only a participant who has locked their own position may
                // sign. The database decides the same thing again; this keeps
                // the screen from offering an action it knows will be refused.
                canFinalise: myPosition !== null && myPosition.state === "locked",
                busy: finalise.isPending,
                error: finalise.isError ? finalise.error : null,
                finalise: (expectedBasisHash) => finalise.mutate(expectedBasisHash),
              }}
            />
          ))}

        {view === "panel" && (
          <BesktPanelSection
            panel={w.panel}
            myEntries={w.myEntries}
            others={others}
            openBusy={openPanel.isPending}
            openError={openPanel.isError ? openPanel.error : null}
            revealBusy={reveal.isPending}
            revealError={reveal.isError ? reveal.error : null}
            resolutionBusy={resolution.isPending}
            resolutionError={resolution.isError ? resolution.error : null}
            onOpen={() => openPanel.mutate({ sessionId })}
            onReveal={(panelId, revision) => reveal.mutate({ panelId, expectedRevision: revision })}
            onRecord={(input) =>
              resolution.mutate({
                panelId: input.panelId,
                expectedRevision: input.revision,
                itemKey: input.itemKey,
                resolutionKind: input.resolutionKind,
                agreedStatement: input.agreedStatement,
                divergentStatement: input.divergentStatement,
                rationale: input.rationale,
              })
            }
          />
        )}
      </div>
    </>,
  );
}

/** Taking a position in a session somebody else opened. */
function JoinPanel({
  busy,
  error,
  onJoin,
}: {
  busy: boolean;
  error: unknown;
  onJoin: (role: "assessor" | "responsible_owner") => void;
}) {
  const { t } = useT();
  const [role, setRole] = useState<"assessor" | "responsible_owner">("assessor");
  return (
    <section className="rounded-lg border border-border p-4" aria-labelledby="beskt-join-h">
      <h2 id="beskt-join-h" className="text-sm font-semibold text-foreground">
        {t("beskt.conduct.join.heading")}
      </h2>
      <p className="mt-1 max-w-[72ch] text-sm leading-relaxed text-muted-foreground">
        {t("beskt.conduct.join.body")}
      </p>

      {error != null && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {t(besktErrorKey(error))}
        </p>
      )}

      <div className="mt-3">
        <label htmlFor="beskt-join-role" className="text-sm font-medium text-foreground">
          {t("beskt.conduct.join.roleLabel")}
        </label>
        <select
          id="beskt-join-role"
          className={`mt-1 w-full max-w-sm rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${TOUCH}`}
          aria-describedby="beskt-join-role-help"
          value={role}
          onChange={(e) => setRole(e.target.value as "assessor" | "responsible_owner")}
        >
          <option value="assessor">{t("beskt.conduct.role.assessor")}</option>
          <option value="responsible_owner">{t("beskt.conduct.role.responsible_owner")}</option>
        </select>
        <p
          id="beskt-join-role-help"
          className="mt-1 max-w-[72ch] text-xs leading-relaxed text-muted-foreground"
        >
          {role === "assessor"
            ? t("beskt.conduct.role.assessorHelp")
            : t("beskt.conduct.role.responsible_ownerHelp")}
        </p>
      </div>

      <button
        type="button"
        className={`${PRIMARY_BUTTON} ${TOUCH} mt-4`}
        disabled={busy}
        onClick={() => onJoin(role)}
      >
        {busy ? t("beskt.conduct.join.working") : t("beskt.conduct.join.action")}
      </button>
    </section>
  );
}
