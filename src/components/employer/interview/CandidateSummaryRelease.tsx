// Preview, then share — the second of the two documents this interview
// produces, and the only one that leaves the organisation.
//
// ── THE SEQUENCE, AND WHY EACH STEP IS SEPARATE ─────────────────────────
//
//   REVIEW      the confirmed evidence and the requirement assessments. The
//               report screen already shows both above this, before anything
//               is locked.
//   FINALISE    the employer's own report, immutably.
//   PREVIEW     exactly what the candidate would receive -- the document
//               itself, produced by the same database function the release
//               calls, rendered by the same component the candidate's own page
//               renders. Not a description of it, and not a second copy of the
//               copy that could drift.
//   RELEASE     a separate, explicit act, with the irreversible effect named.
//
// Finalising does NOT release. The database enforces both directions -- a
// release before a final report is refused, and scp_iv_finalise_report does
// not call the release, which 20261106090000 asserts at apply time -- and this
// screen makes the same shape visible, so a recruiter cannot arrive at the
// second act without passing through the first.
//
// ── AND WHAT IS SAID AFTER IT ───────────────────────────────────────────
//
// Success is not "the call returned". It is "the call returned AND the
// released row says so", read back through the verification read, which is the
// same document the candidate reads. The case where those two disagree has its
// own sentence: the work is done, sharing is one-way, and the sentence does
// not invite a second attempt.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Eye, Send } from "lucide-react";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import {
  summaryControlEnabled,
  summaryErrorOutcome,
  summaryGate,
  summaryReadback,
  summarySteps,
  SUMMARY_STEPS,
  type SummaryOutcome,
} from "@/lib/interview-intelligence/summary-release";
import {
  getReleasedCandidateSummary,
  previewCandidateSummary,
  releaseCandidateSummary,
} from "@/lib/interview-intelligence/runtime.functions";
import { CandidateSummaryDocument } from "./CandidateSummaryDocument";
import { Eyebrow, Nothing, Section, Surface } from "./InterviewLayout";
import { PRIMARY_BUTTON } from "./InterviewUi";

const STEP_LABEL: Record<(typeof SUMMARY_STEPS)[number], TranslationKey> = {
  review: "iicr.step.review",
  finalise: "iicr.step.finalise",
  preview: "iicr.step.preview",
  release: "iicr.step.release",
};

const BUTTON =
  "inline-flex min-h-11 items-center gap-1.5 rounded-[10px] border border-border px-4 text-sm font-medium text-foreground hover:bg-muted/60 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

export function CandidateSummaryRelease({
  caseId,
  reportIsFinal,
  canRelease,
}: {
  caseId: string;
  /** The employer's own report is final. A precondition the database also
   *  enforces; this is the courtesy half. */
  reportIsFinal: boolean;
  /** From the caller's own active membership — the same two roles
   *  scp_iv_release_candidate_summary checks. Never the boundary. */
  canRelease: boolean;
}) {
  const { t, lang } = useT();
  const qc = useQueryClient();
  const releasedFn = useServerFn(getReleasedCandidateSummary);
  const previewFn = useServerFn(previewCandidateSummary);
  const releaseFn = useServerFn(releaseCandidateSummary);

  const [showPreview, setShowPreview] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [outcome, setOutcome] = useState<SummaryOutcome>({ kind: "idle" });

  const releasedKey = ["ii", "candidate-summary", caseId] as const;
  const released = useQuery({
    queryKey: releasedKey,
    queryFn: () => releasedFn({ data: { caseId } }),
    retry: false,
  });

  const preview = useQuery({
    queryKey: ["ii", "candidate-summary-preview", caseId],
    queryFn: () => previewFn({ data: { caseId } }),
    enabled: showPreview,
    retry: false,
  });

  const release = useMutation({
    mutationFn: () => releaseFn({ data: { caseId } }),
    onSuccess: async () => {
      setConfirming(false);
      // Read it back. The mutation resolving is not evidence that the person
      // can now see anything, and a screen that says "shared" on the strength
      // of a promise settling is a screen that will one day be wrong about the
      // one thing it must not be wrong about.
      try {
        const r = await qc.fetchQuery({
          queryKey: releasedKey,
          queryFn: () => releasedFn({ data: { caseId } }),
        });
        // The read-back row, reduced to the two fields the outcome carries.
        // `versionNumber` and `releasedAt` are nullable on the wire because
        // the PREVIEW read shares this shape and has neither; a released row
        // always has both, and a row that somehow does not is not a
        // confirmation.
        setOutcome(
          summaryReadback(
            r && r.versionNumber !== null && r.releasedAt !== null
              ? { versionNumber: r.versionNumber, releasedAt: r.releasedAt }
              : null,
          ),
        );
      } catch {
        setOutcome({ kind: "writtenNotConfirmed" });
      }
      void qc.invalidateQueries({ queryKey: ["ii", "case", caseId] });
    },
    onError: (e: unknown) => {
      setConfirming(false);
      setOutcome(summaryErrorOutcome((e as Error)?.message));
    },
  });

  const gate = summaryGate({
    reportIsFinal,
    canRelease,
    released: released.data
      ? {
          versionNumber: released.data.versionNumber ?? 1,
          releasedAt: released.data.releasedAt ?? "",
        }
      : null,
  });
  const steps = summarySteps(gate);
  const enabled = summaryControlEnabled(gate, outcome) && !release.isPending;
  const date = (iso: string) =>
    iso ? new Date(iso).toLocaleDateString(lang === "en" ? "en-GB" : "sv-SE") : "—";

  return (
    <Section
      id="s-candidate-summary"
      title={t("iicr.heading")}
      description={t("iicr.lede")}
      className="mt-10 max-w-4xl"
    >
      {/* WHERE THE RECRUITER IS, AND WHAT IS LEFT. Rendered as text and not
          only as colour: "preview" and "share" are one careless click apart
          and the difference is irreversible. */}
      <ol className="mb-5 flex flex-wrap gap-x-6 gap-y-2">
        {SUMMARY_STEPS.map((s) => (
          <li
            key={s}
            className={
              steps[s] === "current"
                ? "text-sm font-semibold text-foreground"
                : steps[s] === "done"
                  ? "text-sm text-muted-foreground"
                  : "text-sm text-muted-foreground/70"
            }
          >
            {t(STEP_LABEL[s])}
            <span className="ml-1.5 text-xs">
              {t(
                steps[s] === "done"
                  ? "iicr.state.done"
                  : steps[s] === "current"
                    ? "iicr.state.current"
                    : steps[s] === "blocked"
                      ? "iicr.state.blocked"
                      : "iicr.state.todo",
              )}
            </span>
          </li>
        ))}
      </ol>

      {/* A failed read of what was shared is NOT "nothing has been shared".
          The one place a recruiter would be most inclined to believe it. */}
      {released.isError && (
        <Nothing hint={t("iicr.readFailed.hint")}>{t("iicr.readFailed")}</Nothing>
      )}

      {!released.isError && gate.kind === "reportNotFinal" && (
        <Nothing hint={t("iicr.blocked.hint")}>{t("iicr.blocked")}</Nothing>
      )}

      {!released.isError && gate.kind === "notPermitted" && (
        <Nothing hint={t("iicr.notPermitted.hint")}>{t("iicr.notPermitted")}</Nothing>
      )}

      {!released.isError && gate.kind === "released" && (
        <Surface muted>
          <p role="status" className="text-sm font-semibold text-foreground">
            {t("iicr.released")
              .replace("{n}", String(gate.versionNumber))
              .replace("{date}", date(gate.releasedAt))}
          </p>
          <p className="mt-1.5 max-w-[68ch] text-sm leading-relaxed text-muted-foreground">
            {t("iicr.released.body")}
          </p>
        </Surface>
      )}

      {/* ── PREVIEW ────────────────────────────────────────────────────
       *
       *  Offered whenever a preview is meaningful -- before the release, and
       *  after it, where the same control shows what was ACTUALLY shared
       *  rather than what would be. The two are different reads and the
       *  heading below says which one is on screen. */}
      {!released.isError && gate.kind !== "reportNotFinal" && (
        <div className="mt-4">
          <button type="button" className={BUTTON} onClick={() => setShowPreview((v) => !v)}>
            <Eye className="h-4 w-4" aria-hidden="true" />
            {t(showPreview ? "iicr.preview.close" : "iicr.preview.open")}
          </button>
        </div>
      )}

      {showPreview && (
        <div className="mt-4 rounded-xl border border-border bg-card p-5">
          <Eyebrow>
            {t(gate.kind === "released" ? "iicr.preview.releasedTitle" : "iicr.preview.title")}
          </Eyebrow>
          <p className="mt-1 max-w-[68ch] text-[13px] leading-relaxed text-muted-foreground">
            {t(gate.kind === "released" ? "iicr.preview.releasedLede" : "iicr.preview.lede")}
          </p>
          <div className="mt-4">
            {gate.kind === "released" && released.data ? (
              <CandidateSummaryDocument payload={released.data.payload} lang={lang} />
            ) : preview.isLoading ? (
              <p className="text-sm text-muted-foreground">{t("iicr.preview.loading")}</p>
            ) : preview.isError ? (
              <p role="alert" className="max-w-[68ch] text-sm leading-relaxed text-foreground">
                {t("iicr.preview.failed")}
              </p>
            ) : preview.data ? (
              <CandidateSummaryDocument payload={preview.data.payload} lang={lang} />
            ) : null}
          </div>
        </div>
      )}

      {/* ── RELEASE ────────────────────────────────────────────────────
       *
       *  Two clicks, and the confirmation names the exact irreversible effect
       *  rather than saying "are you sure". */}
      {gate.kind === "ready" && !confirming && (
        <div className="mt-5">
          <button
            type="button"
            className={PRIMARY_BUTTON}
            onClick={() => setConfirming(true)}
            disabled={!enabled}
          >
            <Send className="mr-1.5 h-4 w-4" aria-hidden="true" />
            {t("iicr.release")}
          </button>
          <p className="mt-2 max-w-[68ch] text-xs leading-relaxed text-muted-foreground">
            {t("iicr.release.explain")}
          </p>
        </div>
      )}

      {confirming && (
        <div className="mt-5 rounded-lg border border-amber-600/40 bg-amber-500/5 p-4">
          <p className="text-sm font-semibold text-foreground">{t("iicr.confirm.title")}</p>
          <p className="mt-1 max-w-[68ch] text-sm leading-relaxed text-muted-foreground">
            {t("iicr.confirm.body")}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className={PRIMARY_BUTTON}
              onClick={() => release.mutate()}
              disabled={release.isPending}
            >
              {release.isPending ? t("iicr.confirm.working") : t("iicr.confirm.action")}
            </button>
            <button
              type="button"
              className={BUTTON}
              onClick={() => setConfirming(false)}
              disabled={release.isPending}
            >
              {t("iicr.confirm.cancel")}
            </button>
          </div>
        </div>
      )}

      {/* ── WHAT IT DID, READ BACK ─────────────────────────────────── */}
      {outcome.kind === "confirmed" && (
        <p role="status" className="mt-4 text-sm leading-relaxed text-foreground">
          {t("iicr.outcome.confirmed")
            .replace("{n}", String(outcome.versionNumber))
            .replace("{date}", date(outcome.releasedAt))}
        </p>
      )}
      {outcome.kind === "writtenNotConfirmed" && (
        <div role="status" className="mt-4">
          <p className="max-w-[68ch] text-sm leading-relaxed text-foreground">
            {t("iicr.outcome.writtenNotConfirmed")}
          </p>
          <button
            type="button"
            className={`${BUTTON} mt-2`}
            onClick={() => {
              void released
                .refetch()
                .then((r) =>
                  setOutcome(
                    summaryReadback(
                      r.data && r.data.versionNumber !== null && r.data.releasedAt !== null
                        ? { versionNumber: r.data.versionNumber, releasedAt: r.data.releasedAt }
                        : null,
                    ),
                  ),
                );
            }}
          >
            {t("iicr.outcome.recheck")}
          </button>
        </div>
      )}
      {(outcome.kind === "refused" ||
        outcome.kind === "reportNotFinal" ||
        outcome.kind === "failed") && (
        <p role="alert" className="mt-4 max-w-[68ch] text-sm leading-relaxed text-foreground">
          {t(
            outcome.kind === "refused"
              ? "iicr.outcome.refused"
              : outcome.kind === "reportNotFinal"
                ? "iicr.outcome.reportNotFinal"
                : "iicr.outcome.failed",
          )}
        </p>
      )}
    </Section>
  );
}
