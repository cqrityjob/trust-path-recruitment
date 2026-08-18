// Part F — the employer's decision, composed beside the report.
//
// ── WHY THIS LOOKS DIFFERENT FROM THE REPORT ──────────────────────────
//
// The whole point is that a reader can tell the two apart. The assessment
// report is evidence, frozen at a moment; this is what a named person concluded
// afterwards and may revise. So the panel states who decided and when on every
// entry, keeps superseded entries visible rather than replacing them, and never
// borrows the report's voice.
//
// ── NO VERDICT IN THE VOCABULARY ──────────────────────────────────────
//
// The action list contains no hire, reject, suitable or unsuitable. The product
// records the follow-up the employer chose; the employment decision itself
// happens outside this system and stays there.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import {
  listEmployerDecisions,
  recordEmployerDecision,
  type EmployerDecision,
  type EmployerDecisionAction,
  type EmployerDecisionReason,
} from "@/lib/security-competency/academy-employer.functions";

const ACTIONS: EmployerDecisionAction[] = [
  "follow_up_conversation",
  "assign_development",
  "gather_more_evidence",
  "safety_follow_up",
  "no_action_needed",
];

const REASONS: EmployerDecisionReason[] = [
  "evidence_thin",
  "safety_observation",
  "competency_gap",
  "meets_expectation",
  "other",
];

const ACTION_LABEL: Record<EmployerDecisionAction, TranslationKey> = {
  follow_up_conversation: "academy.decision.actionConversation",
  assign_development: "academy.decision.actionDevelopment",
  gather_more_evidence: "academy.decision.actionMoreEvidence",
  safety_follow_up: "academy.decision.actionSafety",
  no_action_needed: "academy.decision.actionNone",
};

const REASON_LABEL: Record<EmployerDecisionReason, TranslationKey> = {
  evidence_thin: "academy.decision.reasonThin",
  safety_observation: "academy.decision.reasonSafety",
  competency_gap: "academy.decision.reasonGap",
  meets_expectation: "academy.decision.reasonMeets",
  other: "academy.decision.reasonOther",
};

function fmt(iso: string, lang: string) {
  return new Date(iso).toLocaleDateString(lang === "en" ? "en-GB" : "sv-SE");
}

export function EmployerDecisionPanel({
  attemptId,
  canDecide,
}: {
  attemptId: string;
  /** Owner/admin. A member may read the history and may not add to it — the
   *  same bar the RPC enforces, surfaced so the form is not offered to somebody
   *  who would only be refused. */
  canDecide: boolean;
}) {
  const { t, lang } = useT();
  const qc = useQueryClient();
  const listFn = useServerFn(listEmployerDecisions);
  const recordFn = useServerFn(recordEmployerDecision);

  const decisions = useQuery({
    queryKey: ["academy", "decisions", attemptId],
    queryFn: () => listFn({ data: { attemptId } }),
  });

  const [open, setOpen] = useState(false);
  const [supersedes, setSupersedes] = useState<string | null>(null);
  const [action, setAction] = useState<EmployerDecisionAction | null>(null);
  const [reason, setReason] = useState<EmployerDecisionReason | null>(null);
  const [note, setNote] = useState("");
  const [nextStep, setNextStep] = useState("");
  const [owner, setOwner] = useState("");
  const [error, setError] = useState<string | null>(null);

  const rows = (decisions.data ?? []) as EmployerDecision[];
  const current = rows.find((d) => d.isCurrent) ?? null;

  const reset = () => {
    setOpen(false);
    setSupersedes(null);
    setAction(null);
    setReason(null);
    setNote("");
    setNextStep("");
    setOwner("");
  };

  const m = useMutation({
    mutationFn: () =>
      recordFn({
        data: {
          attemptId,
          action: action as EmployerDecisionAction,
          reasonCode: reason as EmployerDecisionReason,
          reasonNote: note.trim() || null,
          nextStep: nextStep.trim() || null,
          nextStepOwner: owner.trim() || null,
          supersedesId: supersedes,
        },
      }),
    onSuccess: () => {
      reset();
      void qc.invalidateQueries({ queryKey: ["academy", "decisions", attemptId] });
    },
    onError: (e: unknown) => {
      const code = (e as { code?: string }).code ?? "";
      setError(
        code === "SCP_NOT_AUTHORISED_TO_DECIDE"
          ? t("academy.decision.notAuthorised")
          : code === "SCP_DECISION_BEFORE_RELEASE"
            ? t("academy.decision.beforeRelease")
            : t("academy.decision.failed"),
      );
    },
  });

  const incomplete = action === null || reason === null;

  return (
    <section className="mt-6 rounded-[14px] border border-border bg-card p-5">
      <h2 className="text-sm font-semibold text-foreground">{t("academy.decision.title")}</h2>
      <p className="mt-1.5 max-w-[72ch] text-[13px] leading-relaxed text-muted-foreground">
        {t("academy.decision.lede")}
      </p>

      {rows.length === 0 && (
        <p className="mt-3 text-[13px] text-muted-foreground">{t("academy.decision.none")}</p>
      )}

      {rows.length > 0 && (
        <ol className="mt-4 space-y-3">
          {rows.map((d) => (
            <li
              key={d.id}
              className={
                d.isCurrent
                  ? "rounded-[10px] border border-accent p-4"
                  : "rounded-[10px] border border-border p-4 opacity-70"
              }
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-[13px] font-semibold text-foreground">
                  {t(ACTION_LABEL[d.action])}
                </p>
                <p className="text-[12px] text-muted-foreground">
                  {d.isCurrent ? t("academy.decision.current") : t("academy.decision.superseded")}
                </p>
              </div>
              <p className="mt-1 text-[12px] text-muted-foreground">
                {t(REASON_LABEL[d.reasonCode])} · {fmt(d.decidedAt, lang)} · {d.decidedByEmail}
              </p>
              {d.reasonNote && (
                <p className="mt-2 text-[13px] leading-relaxed text-foreground">{d.reasonNote}</p>
              )}
              {d.nextStep && (
                <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                  {t("academy.decision.nextStep")}: {d.nextStep}
                  {d.nextStepOwner ? ` — ${d.nextStepOwner}` : ""}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}

      {canDecide && !open && (
        <button
          type="button"
          onClick={() => {
            setError(null);
            setSupersedes(current ? current.id : null);
            setOpen(true);
          }}
          className="no-print mt-4 inline-flex h-10 items-center rounded-[10px] bg-accent px-4 text-[13px] font-semibold text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {current ? t("academy.decision.correct") : t("academy.decision.record")}
        </button>
      )}

      {canDecide && open && (
        <form
          className="no-print mt-4 space-y-4 border-t border-border pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            m.mutate();
          }}
        >
          {supersedes && (
            <p className="text-[12px] leading-relaxed text-muted-foreground">
              {t("academy.decision.correctionNote")}
            </p>
          )}

          <fieldset>
            <legend className="mb-2 text-xs font-medium text-foreground">
              {t("academy.decision.action")}
            </legend>
            <div className="flex flex-wrap gap-2">
              {ACTIONS.map((a) => (
                <label
                  key={a}
                  className="inline-flex cursor-pointer items-center rounded-[10px] border border-border px-3 py-2 text-[13px] text-foreground has-[:checked]:border-accent has-[:checked]:bg-[color:var(--secondary)] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
                >
                  <input
                    type="radio"
                    name={`action-${attemptId}`}
                    className="sr-only"
                    checked={action === a}
                    onChange={() => setAction(a)}
                  />
                  {t(ACTION_LABEL[a])}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-xs font-medium text-foreground">
              {t("academy.decision.reason")}
            </legend>
            <div className="flex flex-wrap gap-2">
              {REASONS.map((rc) => (
                <label
                  key={rc}
                  className="inline-flex cursor-pointer items-center rounded-[10px] border border-border px-3 py-2 text-[13px] text-foreground has-[:checked]:border-accent has-[:checked]:bg-[color:var(--secondary)] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
                >
                  <input
                    type="radio"
                    name={`reason-${attemptId}`}
                    className="sr-only"
                    checked={reason === rc}
                    onChange={() => setReason(rc)}
                  />
                  {t(REASON_LABEL[rc])}
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <label
              htmlFor={`note-${attemptId}`}
              className="mb-1 block text-xs font-medium text-foreground"
            >
              {t("academy.decision.note")}
            </label>
            <p className="mb-1.5 text-[12px] leading-relaxed text-muted-foreground">
              {t("academy.decision.noteHint")}
            </p>
            <textarea
              id={`note-${attemptId}`}
              rows={3}
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-[10px] border border-border bg-card px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor={`next-${attemptId}`}
                className="mb-1 block text-xs font-medium text-foreground"
              >
                {t("academy.decision.nextStep")}
              </label>
              <input
                id={`next-${attemptId}`}
                maxLength={300}
                value={nextStep}
                onChange={(e) => setNextStep(e.target.value)}
                className="h-10 w-full rounded-[10px] border border-border bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>
            <div>
              <label
                htmlFor={`owner-${attemptId}`}
                className="mb-1 block text-xs font-medium text-foreground"
              >
                {t("academy.decision.nextStepOwner")}
              </label>
              <input
                id={`owner-${attemptId}`}
                maxLength={120}
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                className="h-10 w-full rounded-[10px] border border-border bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>
          </div>

          {error && (
            <p role="alert" className="text-[13px] text-foreground">
              {error}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={m.isPending || incomplete}
              className="inline-flex h-10 items-center rounded-[10px] bg-accent px-4 text-[13px] font-semibold text-accent-foreground disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {m.isPending ? t("academy.decision.saving") : t("academy.decision.save")}
            </button>
            <button
              type="button"
              onClick={reset}
              className="inline-flex h-10 items-center rounded-[10px] border border-border px-4 text-[13px] font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {t("academy.decision.cancel")}
            </button>
          </div>
          {incomplete && (
            <p className="text-[12px] text-muted-foreground">{t("academy.decision.blocked")}</p>
          )}
        </form>
      )}
    </section>
  );
}
