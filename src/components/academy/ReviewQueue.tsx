// The human-review queue, shared by the two surfaces that show it.
//
// ── WHY THIS IS A COMPONENT AND NOT A ROUTE ───────────────────────────
//
// The same cards are mounted by three surfaces: the standalone /reviews route,
// the employer review workspace, and the employer route that reviews one
// candidate's submission. One implementation, three mount points — a second
// copy would drift, and the copy that drifted would be the one putting a
// judgement on somebody's competence record.
//
// The header on this file used to say reviewers are CQrityjob staff who are
// never members of an employer. That stopped being true in #51: an employer
// authorises its own reviewers, per use case, revocably. #63 then narrowed the
// separation-of-duties rule so that commissioning an assessment discloses a
// conflict instead of refusing one — see the migration for why that is safe.
//
// ── WHAT A CARD HAS TO ANSWER ─────────────────────────────────────────
//
// A reviewer opening this page is being asked to put a judgement on somebody's
// competence record. The card is laid out so that seven questions are answered
// before the decision controls appear: what needs review, why it needs a
// person, who it concerns, which assessment it came from, what the participant
// was actually asked, what they answered, and what happens after the decision.
//
// The earlier version answered two of those. It showed a trigger label and the
// free text, and left the reviewer to judge an answer without its question.
//
// ── THREE VOICES, KEPT APART ──────────────────────────────────────────
//
// Participant evidence, reviewer judgement and employer decision are different
// claims by different parties, and the layout says so: the participant's words
// sit in a quoted block that is never styled as a finding, the reviewer's
// judgement is a form, and the employer's decision is described as something
// that happens elsewhere, later, by somebody else.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ShieldAlert } from "lucide-react";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import { NoEvidenceState } from "@/components/academy/MaturityDisplay";
import {
  completeReview,
  listReviewQueue,
  type RubricDimension,
} from "@/lib/security-competency/academy-employer.functions";

export type ReviewQueueRow = {
  reviewId: string;
  attemptId: string;
  triggerReason: string;
  openedAt: string;
  participantRef: string;
  organisationName: string | null;
  assessmentName: string | null;
  assessmentSlug: string | null;
  governanceMode: string | null;
  validationStatus: string | null;
  purposeCode: string | null;
  itemDisplayOrder: number | null;
  itemScenario: string | null;
  itemPrompt: string | null;
  isSafetyCritical: boolean;
  findingRequired: boolean;
  itemFormat: string | null;
  rubric: RubricDimension[] | null;
  responseText: string | null;
  chosenLabel: string | null;
  chosenBestLabel: string | null;
  chosenWorstLabel: string | null;
  outstandingInAttempt: number;
};

/** The queue itself. Renders nothing but an explanation when the queue returns
 *  no rows — which is exactly what a member without the capability sees.
 *
 *  `attemptId` narrows the same cached queue to one attempt, for the employer
 *  route that reviews a single candidate's submission. It is a VIEW filter over
 *  rows the database already decided this caller may read — never the thing
 *  that decides it. Scoping still happens in scp_review_queue, so passing an
 *  attempt id that is not in the queue shows nothing rather than something. */
export function ReviewQueue({
  attemptId,
  emptyTitle,
  emptyBody,
}: {
  attemptId?: string;
  emptyTitle: string;
  emptyBody: string;
}) {
  const { lang } = useT();
  const queueFn = useServerFn(listReviewQueue);
  const queue = useQuery({
    queryKey: ["academy", "review-queue", lang],
    queryFn: () => queueFn({ data: { locale: lang } }),
  });
  const all = (queue.data ?? []) as ReviewQueueRow[];
  const rows = attemptId ? all.filter((r) => r.attemptId === attemptId) : all;

  if (rows.length === 0) {
    return <NoEvidenceState title={emptyTitle} body={emptyBody} />;
  }
  return (
    <div className="space-y-4">
      {rows.map((r) => (
        <ReviewCard key={r.reviewId} review={r} />
      ))}
    </div>
  );
}

// Explicit maps rather than string concatenation: a key built at runtime is a
// key the dictionary-parity check cannot see, and a missing translation would
// then reach a reviewer as a raw identifier.

const TRIGGER_LABEL: Record<string, TranslationKey> = {
  no_provider_available: "academy.reviews.triggerNoProvider",
  safety_critical_detected: "academy.reviews.triggerSafety",
  participant_requested: "academy.reviews.triggerRequested",
};

const TRIGGER_WHY: Record<string, TranslationKey> = {
  no_provider_available: "academy.reviews.whyNoProvider",
  safety_critical_detected: "academy.reviews.whySafety",
  participant_requested: "academy.reviews.whyRequested",
};

const OUTCOME_LABEL: Record<"upheld" | "adjusted" | "overturned", TranslationKey> = {
  upheld: "academy.reviews.outcomeUpheld",
  adjusted: "academy.reviews.outcomeAdjusted",
  overturned: "academy.reviews.outcomeOverturned",
};

// A safety-critical ITEM does not make a response a safety concern. Twelve of
// the eighteen items are classified safety-critical, so without `no_concern`
// every participant who answered well still generated twelve graded severities
// somebody had to invent -- and a flag that fires for everyone hides the one
// that matters.
const FINDING_LABEL: Record<Finding, TranslationKey> = {
  no_concern: "academy.reviews.findingNoConcern",
  low: "academy.reviews.severityLow",
  medium: "academy.reviews.severityMedium",
  high: "academy.reviews.severityHigh",
  critical: "academy.reviews.severityCritical",
};

const PURPOSE_LABEL: Record<string, TranslationKey> = {
  competence_development: "academy.reviews.purposeDevelopment",
  recruitment: "academy.reviews.purposeRecruitment",
};

type Outcome = "upheld" | "adjusted" | "overturned";
type Finding = "no_concern" | "low" | "medium" | "high" | "critical";

/** One labelled fact in the context strip. */
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 break-words text-[13px] font-medium text-foreground">{value}</dd>
    </div>
  );
}

/** A radio group that starts with nothing chosen.
 *
 *  Neither control below is pre-selected, and that is the point. A default
 *  severity is a judgement the product would be making on the reviewer's
 *  behalf, on a safety-critical observation, and it would be recorded as
 *  theirs. Making them choose costs one click and keeps the record honest. */
function ChoiceGroup<T extends string>({
  legend,
  hint,
  name,
  options,
  value,
  onChange,
}: {
  legend: string;
  hint?: string;
  name: string;
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-1 text-xs font-medium text-foreground">{legend}</legend>
      {hint && <p className="mb-2 text-[12px] leading-relaxed text-muted-foreground">{hint}</p>}
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label
            key={o.value}
            className="inline-flex cursor-pointer items-center gap-2 rounded-[10px] border border-border px-3 py-2 text-[13px] text-foreground has-[:checked]:border-accent has-[:checked]:bg-[color:var(--secondary)] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
          >
            <input
              type="radio"
              name={name}
              className="sr-only"
              checked={value === o.value}
              onChange={() => onChange(o.value)}
            />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** What the participant actually did, in their own words or their own choice.
 *
 *  Most safety-critical items on the Väktare form are situational-judgement
 *  items with no free text: the participant picked an option. Showing only
 *  `responseText` rendered those as "no written answer recorded", which asked
 *  the reviewer to judge a safety-critical decision with the decision hidden.
 *
 *  Best/worst is shown as two labelled choices rather than one line, because
 *  "worst" is a judgement about the option and reads as an endorsement when
 *  the two are run together. */
function ParticipantResponse({ review }: { review: ReviewQueueRow }) {
  const { t } = useT();

  // Untrusted participant content throughout: rendered as text, never markup.
  const quote = (body: string) => (
    <blockquote className="mt-2 whitespace-pre-wrap rounded-[10px] bg-[color:var(--surface-subtle)] p-4 text-[13px] leading-relaxed text-foreground">
      {body}
    </blockquote>
  );

  if (review.responseText) return quote(review.responseText);

  if (review.chosenBestLabel || review.chosenWorstLabel) {
    return (
      <div className="mt-3 space-y-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
            {t("academy.reviews.choseBest")}
          </p>
          {quote(review.chosenBestLabel ?? t("academy.reviews.noChoice"))}
        </div>
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
            {t("academy.reviews.choseWorst")}
          </p>
          {quote(review.chosenWorstLabel ?? t("academy.reviews.noChoice"))}
        </div>
      </div>
    );
  }

  if (review.chosenLabel) {
    return (
      <div className="mt-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
          {t("academy.reviews.chose")}
        </p>
        {quote(review.chosenLabel)}
      </div>
    );
  }

  return quote(t("academy.reviews.noText"));
}

export function ReviewCard({ review }: { review: ReviewQueueRow }) {
  const { t } = useT();
  const qc = useQueryClient();
  const complete = useServerFn(completeReview);
  const [rationale, setRationale] = useState("");
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [finding, setFinding] = useState<Finding | null>(null);
  const [levels, setLevels] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);

  const rubric = review.rubric ?? [];
  const needsRubric = review.itemFormat === "constructed_response" && rubric.length > 0;

  // The same rules scp_complete_human_review enforces, stated once here so the
  // button can be honest about them instead of letting the database refuse
  // after the reviewer has already written their reasoning.
  const missingFinding = review.findingRequired && finding === null;
  const missingLevels = needsRubric && rubric.some((d) => levels[d.dimension_key] === undefined);
  const incomplete = outcome === null || rationale.trim() === "" || missingFinding || missingLevels;

  const m = useMutation({
    mutationFn: () =>
      complete({
        data: {
          reviewId: review.reviewId,
          outcome: outcome as Outcome,
          rationale,
          // No contribution. The reviewer states a judgement; the number is
          // derived server-side from the item's own governed scoring, or from
          // the rubric levels below. scp_complete_human_review no longer has a
          // parameter to pass one to.
          safetyFinding: review.findingRequired ? finding : null,
          rubricLevels: needsRubric ? levels : null,
        },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["academy", "review-queue"] });
      void qc.invalidateQueries({ queryKey: ["academy", "participants"] });
      // The counters answer the same question as the cards, so they have to be
      // refetched together. Leaving them stale reproduces "N waiting" above an
      // empty queue -- the defect in mirror image.
      void qc.invalidateQueries({ queryKey: ["academy", "my-review-workload"] });
      void qc.invalidateQueries({ queryKey: ["academy", "review-pressure"] });
    },
    onError: (e: unknown) => {
      const code = (e as { code?: string }).code ?? "";
      setError(
        code === "SCP_NOT_A_REVIEWER"
          ? t("academy.reviews.notAuthorised")
          : code === "SCP_REVIEW_WITHOUT_RATIONALE"
            ? t("academy.reviews.needRationale")
            : code === "SCP_SAFETY_FINDING_REQUIRED"
              ? t("academy.reviews.needFinding")
              : code === "SCP_RUBRIC_LEVELS_REQUIRED" || code === "SCP_RUBRIC_DIMENSION_MISSING"
                ? t("academy.reviews.needRubric")
                : code === "SCP_REVIEW_NOT_PENDING"
                  ? t("academy.reviews.alreadyCompleted")
                  : t("academy.reviews.failed"),
      );
    },
  });

  const closedTest = review.governanceMode === "closed_test";

  return (
    <article className="rounded-[14px] border border-border bg-card p-5 shadow-[var(--shadow-xs)]">
      {/* ── WHAT NEEDS REVIEW, AND WHY ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">
            {t(TRIGGER_LABEL[review.triggerReason] ?? "academy.reviews.triggerOther")}
          </h2>
          <p className="mt-1 max-w-[70ch] text-[13px] leading-relaxed text-muted-foreground">
            {t(TRIGGER_WHY[review.triggerReason] ?? "academy.reviews.whyOther")}
          </p>
        </div>
        {review.isSafetyCritical && (
          <p className="inline-flex shrink-0 items-center gap-2 rounded-[8px] border border-border bg-[color:var(--surface-subtle)] px-3 py-1.5 text-xs font-medium text-foreground">
            <ShieldAlert className="h-4 w-4 text-accent" aria-hidden="true" />
            {t("academy.reviews.safetyCritical")}
          </p>
        )}
      </div>

      {/* ── WHO, WHICH ASSESSMENT, WHAT FOR ── */}
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 rounded-[10px] border border-border bg-[color:var(--surface-subtle)] p-4 sm:grid-cols-4">
        <Fact label={t("academy.reviews.participant")} value={review.participantRef} />
        <Fact
          label={t("academy.reviews.organisation")}
          value={review.organisationName ?? t("academy.reviews.unknown")}
        />
        <Fact
          label={t("academy.reviews.assessment")}
          value={review.assessmentName ?? t("academy.reviews.unknown")}
        />
        <Fact
          label={t("academy.reviews.purpose")}
          value={
            review.purposeCode
              ? t(PURPOSE_LABEL[review.purposeCode] ?? "academy.reviews.unknown")
              : t("academy.reviews.unknown")
          }
        />
      </dl>

      <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
        {t("academy.reviews.participantRefNote")}
      </p>

      {/* The governance basis, said plainly. A reviewer judging a closed-test
          answer should know the content has not been validated — it changes how
          much weight their words can carry. */}
      {closedTest && (
        <p className="mt-3 rounded-[10px] border border-border px-3 py-2 text-[12px] leading-relaxed text-foreground">
          {t("academy.reviews.closedTestBasis")}
        </p>
      )}

      {/* ── PARTICIPANT EVIDENCE ── */}
      <section className="mt-5">
        <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-accent">
          {t("academy.reviews.evidenceHeading")}
        </h3>

        {(review.itemScenario || review.itemPrompt) && (
          <div className="mt-2 space-y-1.5">
            {review.itemDisplayOrder != null && (
              <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
                {t("academy.reviews.itemLabel")} {review.itemDisplayOrder}
              </p>
            )}
            {review.itemScenario && (
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                {review.itemScenario}
              </p>
            )}
            {review.itemPrompt && (
              <p className="text-[13px] font-semibold leading-relaxed text-foreground">
                {review.itemPrompt}
              </p>
            )}
          </div>
        )}

        <ParticipantResponse review={review} />
      </section>

      {/* ── REVIEWER JUDGEMENT ── */}
      <form
        className="mt-5 space-y-4 border-t border-border pt-5"
        onSubmit={(ev) => {
          ev.preventDefault();
          setError(null);
          m.mutate();
        }}
      >
        <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-accent">
          {t("academy.reviews.judgementHeading")}
        </h3>

        {needsRubric && (
          <fieldset className="space-y-3 rounded-[10px] border border-border p-4">
            <legend className="px-1 text-xs font-medium text-foreground">
              {t("academy.reviews.rubricLegend")}
            </legend>
            <p className="text-[12px] leading-relaxed text-muted-foreground">
              {t("academy.reviews.rubricHint")}
            </p>
            {rubric.map((d) => (
              <div key={d.dimension_key} className="border-t border-border pt-3 first:border-t-0">
                <p className="text-[13px] font-medium text-foreground">
                  {d.name ?? d.dimension_key}
                  {d.style_only && (
                    <span className="ml-2 rounded-[6px] bg-[color:var(--surface-subtle)] px-1.5 py-0.5 text-[11px] font-normal text-muted-foreground">
                      {t("academy.reviews.rubricStyleOnly")}
                    </span>
                  )}
                </p>
                {d.criterion && (
                  <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
                    {d.criterion}
                  </p>
                )}
                <ChoiceGroup<string>
                  legend={t("academy.reviews.rubricLevel")}
                  name={`rubric-${review.reviewId}-${d.dimension_key}`}
                  value={
                    levels[d.dimension_key] === undefined ? null : String(levels[d.dimension_key])
                  }
                  onChange={(v) => setLevels((prev) => ({ ...prev, [d.dimension_key]: Number(v) }))}
                  options={(d.levels ?? []).map((l) => ({
                    value: String(l.level),
                    label: `${l.level} — ${l.descriptor ?? ""}`,
                  }))}
                />
              </div>
            ))}
          </fieldset>
        )}

        {review.findingRequired && (
          <ChoiceGroup<Finding>
            legend={t("academy.reviews.finding")}
            hint={t("academy.reviews.findingHint")}
            name={`finding-${review.reviewId}`}
            value={finding}
            onChange={setFinding}
            options={(["no_concern", "low", "medium", "high", "critical"] as const).map((f) => ({
              value: f,
              label: t(FINDING_LABEL[f]),
            }))}
          />
        )}

        <ChoiceGroup<Outcome>
          legend={t("academy.reviews.outcome")}
          name={`outcome-${review.reviewId}`}
          value={outcome}
          onChange={setOutcome}
          options={(["upheld", "adjusted", "overturned"] as const).map((o) => ({
            value: o,
            label: t(OUTCOME_LABEL[o]),
          }))}
        />

        <div>
          <label
            htmlFor={`rationale-${review.reviewId}`}
            className="mb-1 block text-xs font-medium text-foreground"
          >
            {t("academy.reviews.rationale")}
          </label>
          <p className="mb-2 text-[12px] leading-relaxed text-muted-foreground">
            {t("academy.reviews.rationalePrivate")}
          </p>
          <textarea
            id={`rationale-${review.reviewId}`}
            rows={3}
            required
            value={rationale}
            onChange={(ev) => setRationale(ev.target.value)}
            className="w-full rounded-[10px] border border-border bg-card px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </div>

        {/* ── WHAT HAPPENS NEXT ── */}
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          {review.outstandingInAttempt > 1
            ? `${t("academy.reviews.nextRemaining")} ${review.outstandingInAttempt}`
            : t("academy.reviews.nextLast")}
        </p>

        {error && (
          <p role="alert" className="text-[13px] text-foreground">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={m.isPending || incomplete}
          className="inline-flex h-11 items-center rounded-[10px] bg-accent px-5 text-sm font-semibold text-accent-foreground disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {m.isPending ? t("academy.reviews.saving") : t("academy.reviews.complete")}
        </button>
        {incomplete && (
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            {t("academy.reviews.completeBlocked")}
          </p>
        )}
      </form>
    </article>
  );
}
