// The candidate's BESKT preparation.
//
// ── THE SHAPE OF THE SCREEN ─────────────────────────────────────────────
//
//   notice  ->  questions  ->  review  ->  submitted
//
// The notice is not a dismissible banner and not a checkbox at the bottom of
// a form. Nothing can be answered until it has been read and acknowledged,
// and that ordering is a DATABASE invariant (bcp_assignments_notice_first_check
// plus BCP_NOTICE_NOT_ACKNOWLEDGED), so a candidate cannot arrive at the
// questions by any route without having been told what this is for.
//
// ── WHAT IS DELIBERATELY ABSENT ─────────────────────────────────────────
//
// No score, no progress bar that reads as performance, no "x of y complete"
// framing, no risk colours, no green/amber/red anything, no suitability
// language, and no waiting screen: every state resolves to content or to a
// named, actionable error. Skipping a question is presented with exactly the
// same visual weight as answering it, because PR 1 section 7 forbids reading
// a voluntary omission as negative evidence and a muted, apologetic "skipped"
// styling is that inference rendered in CSS.
//
// ── SAVE, RESUME, CORRECT ───────────────────────────────────────────────
//
// Every save names the revision it was looking at. If the draft moved (a
// second tab, a retry) the database refuses without writing and the candidate
// is told to reload rather than silently losing an answer. Answers come back
// exactly as stored, and may be changed until the moment of submission.

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Info,
  Loader2,
  Lock,
  MessageSquare,
  SkipForward,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import { draftFrom, isAddressed, type Draft } from "./preparation-draft";
import {
  acknowledgeBesktNotice,
  getMyBesktPreparation,
  markBesktPreparationOpened,
  saveBesktAnswers,
  submitBesktPreparation,
  type BesktAnswerEntry,
  type BesktCandidatePreparation,
  type BesktPreparationItem,
  type BesktResponseState,
} from "@/lib/beskt/candidate-preparation.functions";

/** The nine governed notice sections, in the order the database defines. */
const NOTICE_COPY: Record<string, { title: TranslationKey; body: TranslationKey }> = {
  purpose: { title: "beskt.notice.purpose.title", body: "beskt.notice.purpose.body" },
  use_of_information: {
    title: "beskt.notice.use_of_information.title",
    body: "beskt.notice.use_of_information.body",
  },
  human_decision: {
    title: "beskt.notice.human_decision.title",
    body: "beskt.notice.human_decision.body",
  },
  not_a_test_with_score: {
    title: "beskt.notice.not_a_test_with_score.title",
    body: "beskt.notice.not_a_test_with_score.body",
  },
  may_omit_questions: {
    title: "beskt.notice.may_omit_questions.title",
    body: "beskt.notice.may_omit_questions.body",
  },
  oral_discussion: {
    title: "beskt.notice.oral_discussion.title",
    body: "beskt.notice.oral_discussion.body",
  },
  review_and_correct: {
    title: "beskt.notice.review_and_correct.title",
    body: "beskt.notice.review_and_correct.body",
  },
  who_can_access: {
    title: "beskt.notice.who_can_access.title",
    body: "beskt.notice.who_can_access.body",
  },
  retention: { title: "beskt.notice.retention.title", body: "beskt.notice.retention.body" },
};

/** Only an addressed item is worth sending; an untouched one stays untouched. */
function toEntry(item: BesktPreparationItem, d: Draft): BesktAnswerEntry | null {
  if (!isAddressed(item, d)) return null;
  if (d.state !== "answered") return { itemKey: item.itemKey, responseState: d.state };
  return {
    itemKey: item.itemKey,
    responseState: "answered",
    valueBoolean:
      item.answerType === "boolean" || item.answerType === "acknowledgement" ? d.bool : null,
    valueText:
      item.answerType === "short_text" || item.answerType === "long_text" ? d.text.trim() : null,
    valueDate: item.answerType === "date" ? d.date : null,
    optionKeys:
      item.answerType === "single_choice" || item.answerType === "multi_choice" ? d.options : [],
  };
}

export function CandidatePreparation({ assignmentId }: { readonly assignmentId: string }) {
  const { t, lang } = useT();
  const queryClient = useQueryClient();

  const getPreparation = useServerFn(getMyBesktPreparation);
  const markOpened = useServerFn(markBesktPreparationOpened);
  const acknowledge = useServerFn(acknowledgeBesktNotice);
  const save = useServerFn(saveBesktAnswers);
  const submit = useServerFn(submitBesktPreparation);

  const prep = useQuery({
    queryKey: ["beskt", "preparation", assignmentId],
    queryFn: () => getPreparation({ data: { assignmentId } }),
    retry: false,
  });

  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [phase, setPhase] = useState<"answer" | "review">("answer");
  const [actionError, setActionError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const errorSummaryRef = useRef<HTMLDivElement | null>(null);
  const openedRef = useRef(false);

  // Seed the working values from what is actually stored, whenever the
  // server view changes. Resume is therefore exact: nothing is invented and
  // nothing is dropped.
  useEffect(() => {
    if (!prep.data) return;
    setDrafts((prev) => {
      const next: Record<string, Draft> = {};
      for (const item of prep.data.items)
        next[item.itemKey] = prev[item.itemKey] ?? draftFrom(item);
      return next;
    });
  }, [prep.data]);

  // Delivery evidence, once, and never blocking the screen.
  useEffect(() => {
    if (!prep.data || openedRef.current || prep.data.readOnly) return;
    openedRef.current = true;
    void markOpened({ data: { operationId: crypto.randomUUID(), assignmentId } }).catch(() => {
      /* Opening is evidence, not a gate: a failure here must never stop a
         candidate from reading their own preparation. */
    });
  }, [prep.data, assignmentId, markOpened]);

  const data = prep.data;
  const acknowledged = Boolean(data?.notice.acknowledgedAt);

  const outstanding = useMemo(() => {
    if (!data) return [];
    return data.items.filter((i) => !isAddressed(i, drafts[i.itemKey] ?? draftFrom(i)));
  }, [data, drafts]);

  const ackMutation = useMutation({
    mutationFn: async () => {
      if (!data) throw new Error("no data");
      return acknowledge({
        data: {
          operationId: crypto.randomUUID(),
          assignmentId,
          noticeVersion: data.notice.noticeVersion,
          noticeContentHash: data.notice.noticeContentHash,
          locale: lang === "sv" ? "sv-SE" : "en-GB",
        },
      });
    },
    onSuccess: async () => {
      setActionError(null);
      await queryClient.invalidateQueries({ queryKey: ["beskt", "preparation", assignmentId] });
    },
    onError: (e: unknown) => setActionError(e instanceof Error ? e.message : String(e)),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!data?.response) throw new Error("no draft");
      const entries = data.items
        .map((i) => toEntry(i, drafts[i.itemKey] ?? draftFrom(i)))
        .filter((e): e is BesktAnswerEntry => e !== null);
      if (entries.length === 0) return { revision: data.response.revision, saved: 0 };
      return save({
        data: {
          operationId: crypto.randomUUID(),
          assignmentId,
          expectedRevision: data.response.revision,
          answers: entries,
        },
      });
    },
    onSuccess: async () => {
      setActionError(null);
      setSavedAt(new Date().toISOString());
      await queryClient.invalidateQueries({ queryKey: ["beskt", "preparation", assignmentId] });
    },
    onError: (e: unknown) => setActionError(e instanceof Error ? e.message : String(e)),
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!data?.response) throw new Error("no draft");
      const entries = data.items
        .map((i) => toEntry(i, drafts[i.itemKey] ?? draftFrom(i)))
        .filter((e): e is BesktAnswerEntry => e !== null);
      let revision = data.response.revision;
      if (entries.length > 0) {
        const saved = await save({
          data: {
            operationId: crypto.randomUUID(),
            assignmentId,
            expectedRevision: revision,
            answers: entries,
          },
        });
        revision = saved.revision;
      }
      return submit({
        data: { operationId: crypto.randomUUID(), assignmentId, expectedRevision: revision },
      });
    },
    onSuccess: async () => {
      setActionError(null);
      await queryClient.invalidateQueries({ queryKey: ["beskt", "preparation", assignmentId] });
    },
    onError: (e: unknown) => setActionError(e instanceof Error ? e.message : String(e)),
  });

  if (prep.isPending) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
        <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
        {t("beskt.prep.loading")}
      </p>
    );
  }

  if (prep.isError || !data) {
    const denied = /BCP_NOT_AUTHORISED|permission denied/i.test(
      prep.error instanceof Error ? prep.error.message : "",
    );
    return (
      <Alert variant={denied ? "default" : "destructive"} role="alert">
        <AlertTriangle aria-hidden="true" className="h-4 w-4" />
        <AlertTitle>{t(denied ? "beskt.prep.denied" : "beskt.prep.error")}</AlertTitle>
        <AlertDescription>
          <Button asChild size="sm" variant="outline" className="mt-2 min-h-[44px]">
            <Link to="/my-career">
              <ArrowLeft aria-hidden="true" className="mr-1.5 h-4 w-4" />
              {t("nav.my_career")}
            </Link>
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  const methodName =
    (lang === "sv" ? data.method.nameSv : (data.method.nameEn ?? data.method.nameSv)) ?? "BESKT";
  const duties =
    (lang === "sv"
      ? data.exposureProfile.dutiesSv
      : (data.exposureProfile.dutiesEn ?? data.exposureProfile.dutiesSv)) ?? null;
  const rationale =
    (lang === "sv"
      ? data.exposureProfile.rationaleSv
      : (data.exposureProfile.rationaleEn ?? data.exposureProfile.rationaleSv)) ?? null;

  return (
    <div className="mx-auto max-w-3xl" data-testid="beskt-candidate-preparation">
      <header>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          {t("beskt.prep.navTitle")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("beskt.prep.methodLabel")}: {methodName} · v{data.method.versionNumber}
        </p>
        <p className="mt-3 rounded-lg bg-muted/50 p-3 text-sm" data-testid="beskt-not-a-test">
          {t("beskt.prep.notATest")}
        </p>
      </header>

      {/* Why the candidate has this, from the governed role-exposure profile. */}
      {duties || rationale ? (
        <section className="mt-6" aria-labelledby="beskt-purpose">
          <h2 id="beskt-purpose" className="text-sm font-semibold">
            {t("beskt.prep.roleRelevance")}
          </h2>
          {duties ? <p className="mt-1.5 text-sm text-muted-foreground">{duties}</p> : null}
          {rationale ? <p className="mt-1.5 text-sm text-muted-foreground">{rationale}</p> : null}
        </section>
      ) : null}

      {data.lifecycleState === "submitted" ? (
        <section className="mt-8" aria-labelledby="beskt-submitted" data-testid="beskt-submitted">
          <Alert>
            <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
            <AlertTitle id="beskt-submitted">{t("beskt.submitted.title")}</AlertTitle>
            <AlertDescription>{t("beskt.submitted.body")}</AlertDescription>
          </Alert>
          <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="secondary" className="gap-1.5">
              <Lock aria-hidden="true" className="h-3.5 w-3.5" />
              {t("beskt.submitted.readOnly")}
            </Badge>
            {data.submittedAt ? (
              <span>
                {t("beskt.submitted.at")}:{" "}
                {new Date(data.submittedAt).toLocaleString(lang === "sv" ? "sv-SE" : "en-GB")}
              </span>
            ) : null}
          </p>
          <ReviewList items={data.items} drafts={drafts} readOnly />
        </section>
      ) : !acknowledged ? (
        <NoticePanel
          data={data}
          pending={ackMutation.isPending}
          error={actionError}
          onAcknowledge={() => ackMutation.mutate()}
        />
      ) : phase === "answer" ? (
        <section className="mt-8" aria-labelledby="beskt-questions">
          <h2 id="beskt-questions" className="sr-only">
            {t("beskt.prep.navTitle")}
          </h2>

          {showErrors && outstanding.length > 0 ? (
            <div
              ref={errorSummaryRef}
              tabIndex={-1}
              role="alert"
              className="mb-6 rounded-lg border border-destructive/40 bg-destructive/5 p-4"
              data-testid="beskt-error-summary"
            >
              <p className="text-sm font-medium">{t("beskt.answer.errorSummary")}</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                {outstanding.map((i) => (
                  <li key={i.itemKey}>
                    <a className="underline underline-offset-2" href={`#beskt-item-${i.itemKey}`}>
                      {(lang === "sv" ? i.wordingSv : (i.wordingEn ?? i.wordingSv)) ?? i.itemKey}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <ol className="space-y-6">
            {data.items.map((item) => (
              <QuestionCard
                key={item.itemKey}
                item={item}
                draft={drafts[item.itemKey] ?? draftFrom(item)}
                onChange={(d) => setDrafts((prev) => ({ ...prev, [item.itemKey]: d }))}
              />
            ))}
          </ol>

          {actionError ? (
            <Alert variant="destructive" role="alert" className="mt-6">
              <AlertTriangle aria-hidden="true" className="h-4 w-4" />
              <AlertTitle>{t("beskt.answer.saveFailed")}</AlertTitle>
              <AlertDescription className="font-mono text-xs">
                {/BCP_STALE_REVISION/.test(actionError) ? t("beskt.answer.stale") : actionError}
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="mt-8 flex flex-wrap gap-3">
            <Button
              type="button"
              variant="outline"
              className="min-h-[44px]"
              disabled={saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
              data-testid="beskt-save"
            >
              {saveMutation.isPending ? t("beskt.answer.saving") : t("beskt.answer.save")}
            </Button>
            <Button
              type="button"
              className="min-h-[44px]"
              data-testid="beskt-to-review"
              onClick={() => {
                if (outstanding.length > 0) {
                  setShowErrors(true);
                  window.requestAnimationFrame(() => errorSummaryRef.current?.focus());
                  return;
                }
                setShowErrors(false);
                setPhase("review");
              }}
            >
              {t("beskt.prep.review")}
            </Button>
            {savedAt ? (
              <p className="flex items-center gap-1.5 self-center text-sm" aria-live="polite">
                <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
                {t("beskt.answer.saved")}
              </p>
            ) : null}
          </div>
        </section>
      ) : (
        <section className="mt-8" aria-labelledby="beskt-review">
          <h2 id="beskt-review" className="text-lg font-semibold">
            {t("beskt.review.title")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("beskt.review.lede")}</p>

          <ReviewList items={data.items} drafts={drafts} readOnly={false} />

          {actionError ? (
            <Alert variant="destructive" role="alert" className="mt-6">
              <AlertTriangle aria-hidden="true" className="h-4 w-4" />
              <AlertTitle>{t("beskt.review.submitFailed")}</AlertTitle>
              <AlertDescription className="font-mono text-xs">
                {/BCP_INCOMPLETE/.test(actionError)
                  ? t("beskt.review.incomplete")
                  : /BCP_STALE_REVISION/.test(actionError)
                    ? t("beskt.answer.stale")
                    : actionError}
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="mt-8 flex flex-wrap gap-3">
            <Button
              type="button"
              variant="outline"
              className="min-h-[44px]"
              onClick={() => setPhase("answer")}
              data-testid="beskt-back-to-answers"
            >
              <ArrowLeft aria-hidden="true" className="mr-1.5 h-4 w-4" />
              {t("beskt.review.edit")}
            </Button>
            <Button
              type="button"
              className="min-h-[44px]"
              disabled={submitMutation.isPending}
              onClick={() => submitMutation.mutate()}
              data-testid="beskt-submit"
            >
              {submitMutation.isPending ? t("beskt.review.submitting") : t("beskt.review.submit")}
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}

export function NoticePanel({
  data,
  pending,
  error,
  onAcknowledge,
}: {
  readonly data: BesktCandidatePreparation;
  readonly pending: boolean;
  readonly error: string | null;
  readonly onAcknowledge: () => void;
}) {
  const { t } = useT();
  const [confirmed, setConfirmed] = useState(false);

  return (
    <section className="mt-8" aria-labelledby="beskt-notice" data-testid="beskt-notice">
      <h2 id="beskt-notice" className="text-lg font-semibold">
        {t("beskt.notice.title")}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("beskt.notice.lede")}</p>

      <dl className="mt-5 space-y-4">
        {data.notice.sections.map((key) => {
          const copy = NOTICE_COPY[key];
          if (!copy) return null;
          return (
            <div key={key} className="rounded-lg border p-4" data-testid={`beskt-notice-${key}`}>
              <dt className="text-sm font-medium">{t(copy.title)}</dt>
              <dd className="mt-1 text-sm leading-relaxed text-muted-foreground">{t(copy.body)}</dd>
            </div>
          );
        })}
      </dl>

      <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-xs text-muted-foreground">
        <div>
          <dt>{t("beskt.notice.retentionClass")}</dt>
          <dd className="mt-0.5 font-medium text-foreground">
            {data.exposureProfile.retentionClass}
          </dd>
        </div>
        {data.exposureProfile.lawfulBasisReference ? (
          <div>
            <dt>{t("beskt.notice.lawfulBasis")}</dt>
            <dd className="mt-0.5 font-medium text-foreground">
              {data.exposureProfile.lawfulBasisReference}
            </dd>
          </div>
        ) : null}
      </dl>

      {error ? (
        <Alert variant="destructive" role="alert" className="mt-5">
          <AlertTriangle aria-hidden="true" className="h-4 w-4" />
          <AlertDescription className="font-mono text-xs">{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="mt-6 rounded-lg border bg-muted/30 p-4">
        <div className="flex min-h-[44px] items-start gap-3">
          <Checkbox
            id="beskt-notice-ack"
            checked={confirmed}
            onCheckedChange={(v) => setConfirmed(v === true)}
            className="mt-0.5 h-5 w-5"
          />
          <div className="min-w-0">
            <Label
              htmlFor="beskt-notice-ack"
              className="flex min-h-[44px] items-center text-sm font-medium leading-snug"
            >
              {t("beskt.notice.acknowledge")}
            </Label>
            {/* Said plainly, because the record says it plainly: this is an
                information receipt and not consent. */}
            <p className="mt-1 text-xs text-muted-foreground">
              {t("beskt.notice.acknowledgeHint")}
            </p>
          </div>
        </div>
        <Button
          type="button"
          className="mt-4 min-h-[44px]"
          disabled={!confirmed || pending}
          onClick={onAcknowledge}
          data-testid="beskt-acknowledge"
        >
          {pending ? t("beskt.notice.acknowledging") : t("beskt.prep.open")}
        </Button>
      </div>
    </section>
  );
}

export function QuestionCard({
  item,
  draft,
  onChange,
}: {
  readonly item: BesktPreparationItem;
  readonly draft: Draft;
  readonly onChange: (d: Draft) => void;
}) {
  const { t, lang } = useT();
  const wording =
    (lang === "sv" ? item.wordingSv : (item.wordingEn ?? item.wordingSv)) ?? item.itemKey;
  const purpose = lang === "sv" ? item.purposeSv : (item.purposeEn ?? item.purposeSv);
  const groupId = `beskt-item-${item.itemKey}`;
  const neutral = draft.state !== "answered";

  return (
    <li id={groupId} className="rounded-xl border p-4 sm:p-5" data-testid={groupId}>
      <fieldset>
        <legend className="text-sm font-medium leading-snug">
          {item.sequencePosition}. {wording}
        </legend>
        {purpose ? (
          <p className="mt-1.5 text-xs text-muted-foreground">
            <span className="font-medium">{t("beskt.answer.purposeOfQuestion")}:</span> {purpose}
          </p>
        ) : null}
        <p className="mt-1 text-xs text-muted-foreground">
          {t(
            item.requiredness === "voluntary" ? "beskt.answer.voluntary" : "beskt.answer.required",
          )}
        </p>

        {neutral ? (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Badge variant="outline" className="gap-1.5 font-normal">
              {draft.state === "omitted" ? (
                <SkipForward aria-hidden="true" className="h-3.5 w-3.5" />
              ) : (
                <MessageSquare aria-hidden="true" className="h-3.5 w-3.5" />
              )}
              {t(draft.state === "omitted" ? "beskt.answer.skipped" : "beskt.answer.oralChosen")}
            </Badge>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="min-h-[44px]"
              onClick={() => onChange({ ...draft, state: "answered" })}
            >
              {t("beskt.answer.undoSkip")}
            </Button>
          </div>
        ) : (
          <div className="mt-4">
            <AnswerControl item={item} draft={draft} onChange={onChange} />
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={draft.state === "omitted" ? "secondary" : "outline"}
            className="min-h-[44px] gap-1.5"
            aria-pressed={draft.state === "omitted"}
            onClick={() =>
              onChange({ ...draft, state: draft.state === "omitted" ? "answered" : "omitted" })
            }
            data-testid={`${groupId}-skip`}
          >
            <SkipForward aria-hidden="true" className="h-4 w-4" />
            {t("beskt.answer.skip")}
          </Button>
          {item.discussOrallyAllowed ? (
            <Button
              type="button"
              size="sm"
              variant={draft.state === "discuss_orally" ? "secondary" : "outline"}
              className="min-h-[44px] gap-1.5"
              aria-pressed={draft.state === "discuss_orally"}
              onClick={() =>
                onChange({
                  ...draft,
                  state: draft.state === "discuss_orally" ? "answered" : "discuss_orally",
                })
              }
              data-testid={`${groupId}-oral`}
            >
              <MessageSquare aria-hidden="true" className="h-4 w-4" />
              {t("beskt.answer.oral")}
            </Button>
          ) : null}
        </div>
      </fieldset>
    </li>
  );
}

function AnswerControl({
  item,
  draft,
  onChange,
}: {
  readonly item: BesktPreparationItem;
  readonly draft: Draft;
  readonly onChange: (d: Draft) => void;
}) {
  const { t, lang } = useT();
  const id = `beskt-input-${item.itemKey}`;

  if (item.answerType === "boolean") {
    return (
      <RadioGroup
        value={draft.bool === null ? "" : draft.bool ? "yes" : "no"}
        onValueChange={(v) => onChange({ ...draft, bool: v === "yes" })}
        className="gap-3"
      >
        <div className="flex items-center gap-3">
          <RadioGroupItem id={`${id}-yes`} value="yes" className="h-5 w-5" />
          <Label htmlFor={`${id}-yes`} className="min-h-[44px] flex-1 content-center text-sm">
            {t("beskt.answer.yes")}
          </Label>
        </div>
        <div className="flex items-center gap-3">
          <RadioGroupItem id={`${id}-no`} value="no" className="h-5 w-5" />
          <Label htmlFor={`${id}-no`} className="min-h-[44px] flex-1 content-center text-sm">
            {t("beskt.answer.no")}
          </Label>
        </div>
      </RadioGroup>
    );
  }

  if (item.answerType === "acknowledgement") {
    // min-h-[44px] on the ROW, not just the box: a 20px checkbox beside a
    // one-line label is a 22px hit target, which the browser evidence walk
    // measured and refused. The label is the target, so the label is the
    // thing that has to be big enough.
    return (
      <div className="flex min-h-[44px] items-center gap-3">
        <Checkbox
          id={id}
          checked={draft.bool === true}
          onCheckedChange={(v) => onChange({ ...draft, bool: v === true })}
          className="h-5 w-5"
        />
        <Label htmlFor={id} className="flex min-h-[44px] flex-1 items-center text-sm leading-snug">
          {t("beskt.answer.confirm")}
        </Label>
      </div>
    );
  }

  if (item.answerType === "single_choice" || item.answerType === "multi_choice") {
    const multi = item.answerType === "multi_choice";
    return (
      <div className="space-y-3">
        {item.options.map((o) => {
          const label = (lang === "sv" ? o.labelSv : (o.labelEn ?? o.labelSv)) ?? o.optionKey;
          const checked = draft.options.includes(o.optionKey);
          const optionId = `${id}-${o.optionKey}`;
          return (
            <div key={o.optionKey} className="flex items-center gap-3">
              <Checkbox
                id={optionId}
                checked={checked}
                className="h-5 w-5"
                aria-checked={checked}
                onCheckedChange={(v) => {
                  const on = v === true;
                  if (multi) {
                    onChange({
                      ...draft,
                      options: on
                        ? [...draft.options, o.optionKey]
                        : draft.options.filter((k) => k !== o.optionKey),
                    });
                  } else {
                    onChange({ ...draft, options: on ? [o.optionKey] : [] });
                  }
                }}
              />
              <Label htmlFor={optionId} className="min-h-[44px] flex-1 content-center text-sm">
                {label}
              </Label>
            </div>
          );
        })}
      </div>
    );
  }

  if (item.answerType === "date") {
    return (
      <Input
        id={id}
        type="date"
        className="min-h-[44px] max-w-xs"
        value={draft.date}
        onChange={(e) => onChange({ ...draft, date: e.target.value })}
      />
    );
  }

  if (item.answerType === "long_text") {
    return (
      <Textarea
        id={id}
        rows={5}
        maxLength={4000}
        className="min-h-[44px]"
        value={draft.text}
        onChange={(e) => onChange({ ...draft, text: e.target.value })}
      />
    );
  }

  return (
    <Input
      id={id}
      type="text"
      maxLength={500}
      className="min-h-[44px]"
      value={draft.text}
      onChange={(e) => onChange({ ...draft, text: e.target.value })}
    />
  );
}

export function ReviewList({
  items,
  drafts,
  readOnly,
}: {
  readonly items: readonly BesktPreparationItem[];
  readonly drafts: Record<string, Draft>;
  readonly readOnly: boolean;
}) {
  const { t, lang } = useT();
  return (
    <ul className="mt-5 space-y-3" data-testid="beskt-review-list">
      {items.map((item) => {
        const d = drafts[item.itemKey] ?? draftFrom(item);
        const wording =
          (lang === "sv" ? item.wordingSv : (item.wordingEn ?? item.wordingSv)) ?? item.itemKey;
        return (
          <li key={item.itemKey} className="rounded-lg border p-3 sm:p-4">
            <p className="text-sm font-medium">{wording}</p>
            <p className="mt-1.5 text-sm">
              {d.state === "omitted" ? (
                <span className="text-muted-foreground">{t("beskt.answer.skipped")}</span>
              ) : d.state === "discuss_orally" ? (
                <span className="text-muted-foreground">{t("beskt.answer.oralChosen")}</span>
              ) : item.answerType === "boolean" ? (
                <span>
                  {d.bool === null
                    ? t("beskt.answer.unanswered")
                    : d.bool
                      ? t("beskt.answer.yes")
                      : t("beskt.answer.no")}
                </span>
              ) : item.answerType === "acknowledgement" ? (
                <span>{d.bool ? t("beskt.answer.confirm") : t("beskt.answer.unanswered")}</span>
              ) : d.options.length > 0 ? (
                <span>
                  {d.options
                    .map(
                      (k) =>
                        (lang === "sv"
                          ? item.options.find((o) => o.optionKey === k)?.labelSv
                          : (item.options.find((o) => o.optionKey === k)?.labelEn ??
                            item.options.find((o) => o.optionKey === k)?.labelSv)) ?? k,
                    )
                    .join(", ")}
                </span>
              ) : d.date ? (
                <span>{d.date}</span>
              ) : d.text.trim() ? (
                <span className="whitespace-pre-wrap">{d.text}</span>
              ) : (
                <span className="text-muted-foreground">{t("beskt.answer.unanswered")}</span>
              )}
            </p>
            {readOnly ? null : (
              <a
                className="mt-2 inline-flex min-h-[44px] items-center text-sm underline underline-offset-2"
                href={`#beskt-item-${item.itemKey}`}
              >
                {t("beskt.review.edit")}
              </a>
            )}
          </li>
        );
      })}
    </ul>
  );
}
