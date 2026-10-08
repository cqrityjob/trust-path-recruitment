import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useT } from "@/i18n/context";
import {
  createManualFinding,
  getInterviewCase,
  reviewManualFinding,
  type CaseDetail,
} from "@/lib/interview-intelligence/runtime.functions";
import { singleFlight } from "@/lib/interview-intelligence/single-flight";
import { ManualControlPointIntent } from "@/lib/interview-intelligence/manual-control-point-intent";
import { isOutstandingFinding } from "@/lib/interview-intelligence/finding-state";
import { BUTTON, FIELD, PRIMARY_BUTTON, interviewErrorMessage } from "./InterviewUi";

const KINDS = ["gap", "unclear", "contradiction", "verification"] as const;
const STATES = [
  "open",
  "needs_verification",
  "corrected_by_candidate",
  "unresolved_difference",
  "resolved",
  "not_relevant",
] as const;
type Kind = (typeof KINDS)[number];
type Resolution = (typeof STATES)[number];
type Finding = CaseDetail["findings"][number];
type ControlCase = Pick<
  CaseDetail,
  "id" | "sources" | "questions" | "findings" | "manualFindingCapabilities"
>;
type FollowUpDraft = { responsibleLabel: string; nextAction: string; dueOn: string };
type CreateDraft = FollowUpDraft & {
  kind: Kind;
  statement: string;
  neutralQuestion: string;
  questionId: string;
  sourcePassageId: string;
  sourceLabel: string;
};
type ReviewDraft = FollowUpDraft & { resolutionState: Resolution; humanNote: string };
type FollowUpInput = { responsibleLabel: string | null; nextAction: string; dueOn: string | null };
type ReviewInput = FollowUpInput & {
  findingId: string;
  expectedRevision: number;
  resolutionState: Resolution;
  humanNote: string;
};
type CreateInput = FollowUpInput & {
  caseId: string;
  operationId: string;
  kind: Kind;
  statement: string;
  neutralQuestion: string;
  questionId: string | null;
  sourcePassageId: string | null;
  sourceLabel: string | null;
};
const initialCreate = (questionId: string | undefined): CreateDraft => ({
  kind: "unclear",
  statement: "",
  neutralQuestion: "",
  questionId: questionId ?? "",
  sourcePassageId: "",
  sourceLabel: "",
  responsibleLabel: "",
  nextAction: "",
  dueOn: "",
});
const followUpInput = (draft: FollowUpDraft) => ({
  responsibleLabel: draft.responsibleLabel.trim() || null,
  nextAction: draft.nextAction.trim(),
  dueOn: draft.dueOn || null,
});
const reviewDraft = (finding: Finding): ReviewDraft => ({
  resolutionState: STATES.includes(finding.resolutionState as Resolution)
    ? (finding.resolutionState as Resolution)
    : "open",
  humanNote: finding.humanNote ?? "",
  responsibleLabel: finding.responsibleLabel ?? "",
  nextAction: finding.nextAction ?? "",
  dueOn: finding.dueOn ?? "",
});

function FollowUpFields({
  prefix,
  draft,
  disabled,
  onChange,
}: {
  prefix: string;
  draft: FollowUpDraft;
  disabled: boolean;
  onChange: (value: Partial<FollowUpDraft>) => void;
}) {
  const { t } = useT();
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-xs font-medium text-foreground" htmlFor={`${prefix}-responsible`}>
        {t("ri.control.responsible")}
        <input
          id={`${prefix}-responsible`}
          value={draft.responsibleLabel}
          maxLength={300}
          disabled={disabled}
          onChange={(e) => onChange({ responsibleLabel: e.target.value })}
          className={`${FIELD} mt-1`}
        />
      </label>
      <label className="text-xs font-medium text-foreground" htmlFor={`${prefix}-due`}>
        {t("ri.control.due")}
        <input
          id={`${prefix}-due`}
          type="date"
          value={draft.dueOn}
          disabled={disabled}
          onChange={(e) => onChange({ dueOn: e.target.value })}
          className={`${FIELD} mt-1`}
        />
      </label>
      <label
        className="text-xs font-medium text-foreground sm:col-span-2"
        htmlFor={`${prefix}-next-action`}
      >
        {t("ri.control.next")}
        <textarea
          id={`${prefix}-next-action`}
          value={draft.nextAction}
          rows={2}
          maxLength={2000}
          required
          disabled={disabled}
          onChange={(e) => onChange({ nextAction: e.target.value })}
          className={`${FIELD} mt-1`}
        />
      </label>
    </div>
  );
}

function FindingReview({
  finding,
  detail,
  mayReview,
  onChanged,
}: {
  finding: Finding;
  detail: ControlCase;
  mayReview: boolean;
  onChanged: () => unknown | Promise<unknown>;
}) {
  const { t } = useT();
  const reviewFn = useServerFn(reviewManualFinding);
  const getFn = useServerFn(getInterviewCase);
  const [draft, setDraft] = useState(() => reviewDraft(finding));
  const [saved, setSaved] = useState(() => reviewDraft(finding));
  const revision = useRef(finding.revision);
  const [reloading, setReloading] = useState(false);
  const [reloadError, setReloadError] = useState<unknown>(null);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const once = useMemo(
    () => singleFlight((input: ReviewInput) => reviewFn({ data: input })),
    [reviewFn],
  );
  const review = useMutation({
    mutationFn: once,
    onSuccess: async (result, input) => {
      revision.current = result.revision;
      const stored: ReviewDraft = {
        resolutionState: input.resolutionState,
        humanNote: input.humanNote,
        responsibleLabel: input.responsibleLabel ?? "",
        nextAction: input.nextAction,
        dueOn: input.dueOn ?? "",
      };
      setSaved(stored);
      setDraft(stored);
      try {
        await onChanged();
        setRefreshFailed(false);
      } catch {
        setRefreshFailed(true);
      }
    },
  });
  const conflict = /SCP_IV_FINDING_STALE/.test(
    review.error instanceof Error ? review.error.message : String(review.error ?? ""),
  );
  useEffect(() => {
    if (dirty || review.isPending || conflict || finding.revision <= revision.current) return;
    revision.current = finding.revision;
    const stored = reviewDraft(finding);
    setSaved(stored);
    setDraft(stored);
  }, [finding, dirty, review.isPending, conflict]);

  const reload = async () => {
    setReloading(true);
    setReloadError(null);
    try {
      const fresh = await getFn({ data: { caseId: detail.id } });
      const stored = fresh.findings.find((row) => row.id === finding.id);
      if (!stored) throw new Error("SCP_IV_MANUAL_FINDING_NOT_READABLE");
      revision.current = stored.revision;
      const value = reviewDraft(stored);
      setDraft(value);
      setSaved(value);
      review.reset();
      await onChanged();
    } catch (error) {
      setReloadError(error);
    } finally {
      setReloading(false);
    }
  };
  const source = detail.sources.find((s) =>
    s.passages.some((p) => p.id === finding.sourcePassageId),
  );
  const passage = source?.passages.find((p) => p.id === finding.sourcePassageId);
  const question = detail.questions.find((q) => q.id === finding.questionId);
  const status = STATES.includes(finding.resolutionState as Resolution)
    ? (finding.resolutionState as Resolution)
    : "open";

  return (
    <details className="rounded-md border border-border p-3" data-testid="manual-control-item">
      <summary className="cursor-pointer text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
        {question ? `${question.code} · ` : ""}
        {finding.statement}
        <span className="mt-1 block text-xs font-normal text-muted-foreground">
          {t(`ri.control.state.${status}`)}
        </span>
      </summary>
      <dl className="mt-3 space-y-2 text-xs leading-relaxed">
        <div>
          <dt className="font-medium">{t("ri.control.question")}</dt>
          <dd className="mt-0.5 whitespace-pre-wrap">{finding.neutralQuestion}</dd>
        </div>
        <div>
          <dt className="font-medium">{t("ri.control.source")}</dt>
          <dd className="mt-0.5">
            {source?.label ?? finding.sourceLabel ?? t("ri.control.source.unavailable")}
          </dd>
        </div>
        {passage && (
          <div>
            <dt className="font-medium">
              {t("ri.control.source.passage").replace("{n}", String(passage.index))}
            </dt>
            <dd className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap border-l-2 border-border pl-2">
              {passage.content}
            </dd>
          </div>
        )}
        <div>
          <dt className="font-medium">{t("ri.control.responsible")}</dt>
          <dd>{finding.responsibleLabel || t("ri.control.unassigned")}</dd>
        </div>
        <div>
          <dt className="font-medium">{t("ri.control.next")}</dt>
          <dd className="whitespace-pre-wrap">{finding.nextAction}</dd>
        </div>
        {finding.dueOn && (
          <div>
            <dt className="font-medium">{t("ri.control.due")}</dt>
            <dd>{finding.dueOn}</dd>
          </div>
        )}
        {finding.humanNote && (
          <div>
            <dt className="font-medium">{t("ri.control.review.note")}</dt>
            <dd className="whitespace-pre-wrap">{finding.humanNote}</dd>
          </div>
        )}
      </dl>
      {mayReview && (
        <form
          className="mt-4 space-y-3 border-t border-border pt-3"
          data-testid="manual-control-review"
          onSubmit={(event) => {
            event.preventDefault();
            if (conflict) return;
            review.mutate({
              findingId: finding.id,
              expectedRevision: revision.current,
              resolutionState: draft.resolutionState,
              humanNote: draft.humanNote.trim(),
              ...followUpInput(draft),
            });
          }}
        >
          <label className="block text-xs font-medium" htmlFor={`review-${finding.id}-state`}>
            {t("ri.control.review.status")}
            <select
              id={`review-${finding.id}-state`}
              value={draft.resolutionState}
              disabled={review.isPending || conflict}
              onChange={(e) =>
                setDraft((value) => ({ ...value, resolutionState: e.target.value as Resolution }))
              }
              className={`${FIELD} mt-1`}
            >
              {STATES.map((state) => (
                <option key={state} value={state}>
                  {t(`ri.control.state.${state}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-medium" htmlFor={`review-${finding.id}-note`}>
            {t("ri.control.review.note")}
            <textarea
              id={`review-${finding.id}-note`}
              value={draft.humanNote}
              maxLength={3000}
              rows={3}
              required
              disabled={review.isPending}
              onChange={(e) => setDraft((value) => ({ ...value, humanNote: e.target.value }))}
              className={`${FIELD} mt-1`}
            />
          </label>
          <FollowUpFields
            prefix={`review-${finding.id}`}
            draft={draft}
            disabled={review.isPending}
            onChange={(fields) => setDraft((value) => ({ ...value, ...fields }))}
          />
          {review.isError && (
            <div role="alert" className="text-xs leading-relaxed text-destructive">
              <p>{conflict ? t("ri.control.conflict") : interviewErrorMessage(review.error, t)}</p>
              {conflict && (
                <button
                  type="button"
                  className={`${BUTTON} mt-2`}
                  disabled={reloading}
                  onClick={() => void reload()}
                >
                  {t("ri.control.reload")}
                </button>
              )}
            </div>
          )}
          {reloadError != null && (
            <p role="alert" className="text-xs text-destructive">
              {interviewErrorMessage(reloadError, t)}
            </p>
          )}
          {refreshFailed && (
            <p role="alert" className="text-xs text-muted-foreground">
              {t("ri.control.refresh.failed")}
            </p>
          )}
          <button
            className={BUTTON}
            type="submit"
            disabled={review.isPending || conflict || reloading}
          >
            {review.isPending ? t("ri.control.saving") : t("ri.control.review.save")}
          </button>
          {dirty && (
            <p role="status" className="text-xs text-muted-foreground">
              {t("ri.control.draft")}
            </p>
          )}
          {review.isSuccess && !dirty && (
            <p role="status" className="text-xs text-muted-foreground">
              {t("ri.control.review.saved")}
            </p>
          )}
        </form>
      )}
    </details>
  );
}

export function ManualControlPoints({
  detail,
  onChanged,
  initialQuestionId,
}: {
  detail: ControlCase;
  onChanged: () => unknown | Promise<unknown>;
  initialQuestionId?: string;
}) {
  const { t } = useT();
  const createFn = useServerFn(createManualFinding);
  const [draft, setDraft] = useState(() => initialCreate(initialQuestionId));
  const intent = useRef(new ManualControlPointIntent());
  const [refreshFailed, setRefreshFailed] = useState(false);
  const once = useMemo(
    () => singleFlight((input: CreateInput) => createFn({ data: input })),
    [createFn],
  );
  const create = useMutation({
    mutationFn: once,
    onSuccess: async () => {
      intent.current.completed();
      setDraft(initialCreate(initialQuestionId));
      try {
        await onChanged();
        setRefreshFailed(false);
      } catch {
        setRefreshFailed(true);
      }
    },
  });
  const human = detail.findings.filter((finding) => finding.origin === "human");
  const passages = detail.sources.flatMap((source) =>
    source.passages.map((passage) => ({ source, passage })),
  );
  const selected = passages.find((row) => row.passage.id === draft.sourcePassageId);
  const update = (fields: Partial<CreateDraft>) => setDraft((value) => ({ ...value, ...fields }));
  return (
    <section
      className="space-y-3"
      aria-label={t("ri.control.title")}
      data-testid="manual-control-points"
    >
      <h2 className="text-sm font-semibold text-foreground">{t("ri.control.title")}</h2>
      <p className="text-xs leading-relaxed text-muted-foreground">{t("ri.control.body")}</p>
      <p className="text-xs text-muted-foreground">
        {t("ri.control.count")
          .replace(
            "{open}",
            String(human.filter((finding) => isOutstandingFinding(finding.resolutionState)).length),
          )
          .replace("{total}", String(human.length))}
      </p>
      {refreshFailed && (
        <p role="alert" className="text-xs text-muted-foreground">
          {t("ri.control.refresh.failed")}
        </p>
      )}
      {human.length === 0 && (
        <p className="text-xs text-muted-foreground">{t("ri.control.none")}</p>
      )}
      {human.map((finding) => (
        <FindingReview
          key={finding.id}
          finding={finding}
          detail={detail}
          mayReview={detail.manualFindingCapabilities.mayReview}
          onChanged={onChanged}
        />
      ))}
      {detail.manualFindingCapabilities.mayCreate ? (
        <details className="rounded-md border border-border p-3">
          <summary className="cursor-pointer text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
            {t("ri.control.add")}
          </summary>
          <form
            className="mt-3 space-y-3"
            data-testid="manual-control-form"
            onSubmit={(event) => {
              event.preventDefault();
              const input = {
                caseId: detail.id,
                kind: draft.kind,
                statement: draft.statement.trim(),
                neutralQuestion: draft.neutralQuestion.trim(),
                questionId: draft.questionId || null,
                sourcePassageId: draft.sourcePassageId || null,
                sourceLabel: draft.sourceLabel.trim() || null,
                ...followUpInput(draft),
              };
              create.mutate({ ...input, operationId: intent.current.operationIdFor(input) });
            }}
          >
            <label className="block text-xs font-medium" htmlFor="control-kind">
              {t("ri.control.kind")}
              <select
                id="control-kind"
                value={draft.kind}
                disabled={create.isPending}
                onChange={(e) => update({ kind: e.target.value as Kind })}
                className={`${FIELD} mt-1`}
              >
                {KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {t(`ri.control.kind.${kind}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-medium" htmlFor="control-statement">
              {t("ri.control.statement")}
              <textarea
                id="control-statement"
                value={draft.statement}
                rows={2}
                maxLength={3000}
                required
                disabled={create.isPending}
                onChange={(e) => update({ statement: e.target.value })}
                className={`${FIELD} mt-1`}
              />
            </label>
            <label className="block text-xs font-medium" htmlFor="control-neutral-question">
              {t("ri.control.question")}
              <textarea
                id="control-neutral-question"
                value={draft.neutralQuestion}
                rows={2}
                maxLength={3000}
                required
                disabled={create.isPending}
                onChange={(e) => update({ neutralQuestion: e.target.value })}
                className={`${FIELD} mt-1`}
              />
            </label>
            <label className="block text-xs font-medium" htmlFor="control-question">
              {t("ri.control.core-question")}
              <select
                id="control-question"
                value={draft.questionId}
                disabled={create.isPending}
                onChange={(e) => update({ questionId: e.target.value })}
                className={`${FIELD} mt-1`}
              >
                <option value="">{t("ri.control.core-question.none")}</option>
                {detail.questions.map((question) => (
                  <option key={question.id} value={question.id}>
                    {question.code}
                  </option>
                ))}
              </select>
            </label>
            {passages.length > 0 && (
              <label className="block text-xs font-medium" htmlFor="control-source-passage">
                {t("ri.control.source.select")}
                <select
                  id="control-source-passage"
                  value={draft.sourcePassageId}
                  disabled={create.isPending}
                  onChange={(e) => {
                    const chosen = passages.find((row) => row.passage.id === e.target.value);
                    update({
                      sourcePassageId: e.target.value,
                      sourceLabel: chosen?.source.label ?? draft.sourceLabel,
                    });
                  }}
                  className={`${FIELD} mt-1`}
                >
                  <option value="">{t("ri.control.source.reference")}</option>
                  {passages.map(({ source, passage }) => (
                    <option key={passage.id} value={passage.id}>
                      {source.label} ·{" "}
                      {t("ri.control.source.passage").replace("{n}", String(passage.index))}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {selected && (
              <blockquote className="max-h-48 overflow-auto whitespace-pre-wrap border-l-2 border-border pl-2 text-xs leading-relaxed">
                {selected.passage.content}
              </blockquote>
            )}
            <label className="block text-xs font-medium" htmlFor="control-source">
              {t("ri.control.source")}
              <input
                id="control-source"
                value={draft.sourceLabel}
                list="control-source-labels"
                maxLength={1000}
                required={!draft.sourcePassageId}
                disabled={create.isPending}
                onChange={(e) => update({ sourceLabel: e.target.value })}
                className={`${FIELD} mt-1`}
                aria-describedby="control-source-hint"
              />
              <datalist id="control-source-labels">
                {detail.sources.map((source) => (
                  <option key={source.id} value={source.label} />
                ))}
              </datalist>
            </label>
            <p id="control-source-hint" className="text-xs leading-relaxed text-muted-foreground">
              {t("ri.control.source.hint")}
            </p>
            <FollowUpFields
              prefix="control"
              draft={draft}
              disabled={create.isPending}
              onChange={update}
            />
            {create.isError && (
              <p role="alert" className="text-xs text-destructive">
                {interviewErrorMessage(create.error, t)} {t("ri.control.retry")}
              </p>
            )}
            {create.isSuccess && (
              <p role="status" className="text-xs text-muted-foreground">
                {t("ri.control.created")}
              </p>
            )}
            <button type="submit" className={PRIMARY_BUTTON} disabled={create.isPending}>
              {create.isPending ? t("ri.control.saving") : t("ri.control.add")}
            </button>
          </form>
        </details>
      ) : (
        <p className="text-xs leading-relaxed text-muted-foreground">{t("ri.control.readonly")}</p>
      )}
    </section>
  );
}
