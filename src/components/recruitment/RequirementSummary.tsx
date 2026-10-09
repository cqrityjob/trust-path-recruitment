// The requirement review, summarised in the application's header.
//
// One card that answers, before anything long: which requirement version this
// application is read against, how many of the mandatory requirements a PERSON
// has confirmed, what is missing or unclear, and whether the review as a whole
// is human-confirmed. Every status opens to its basis: the source, who
// recorded it, when, and under which profile version.
//
// It reads the same server answer the review panel edits, under the same
// query key, so the header and the panel can never disagree; and it derives
// nothing the server did not say: the colour is the server's requirementStatus
// (green only when every mandatory requirement is confirmed), the count is
// over the server's criteria, and a state the server took from the candidate's
// own yes/no answer is shown as PRELIMINARY -- never as a completed review.

import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import { getRequirementReview } from "@/lib/recruitment/requirement-intelligence.functions";
import type { RequirementCriterion } from "@/lib/recruitment/requirement-intelligence";
import type { TeamMember } from "@/lib/recruitment/recruitment.functions";
import { formatStamp } from "@/lib/recruitment/format";
import { sourceLabels } from "@/lib/recruitment/requirement-presentation";
import {
  clarificationRequestBody,
  requirementSummaryOf,
} from "@/lib/recruitment/application-workflow";
import { RequirementStatusBadge, ReviewStatusBadge } from "./RecruiterStatus";

export type RequirementSummaryActions = {
  /** Scroll to the review panel, where confirmation is recorded. */
  confirm: () => void;
  /** Open a message draft carrying the reviewer's neutral questions. */
  requestSupplement: (body: string) => void;
  prepareInterview: () => void;
  /** The next stage, when the application has one, and the decision. */
  proceed: (() => void) | null;
  proceedLabel: string | null;
  reject: (() => void) | null;
};

export function RequirementSummary({
  employerId,
  employerSlug,
  applicationId,
  jobId,
  team,
  actions,
}: {
  employerId: string;
  employerSlug: string;
  applicationId: string;
  jobId: string;
  team: TeamMember[];
  /** null when the application is closed or the recruitment completed: the
   *  summary is then a record, not a desk. */
  actions: RequirementSummaryActions | null;
}) {
  const { t, lang } = useT();
  const read = useServerFn(getRequirementReview);
  const query = useQuery({
    queryKey: ["employer", employerId, "requirement-review", applicationId],
    queryFn: () => read({ data: { employerId, applicationId } }),
  });

  if (query.isPending)
    return (
      <p className="mt-4 text-sm text-muted-foreground" data-testid="requirement-summary-loading">
        {t("rec.summary.loading")}
      </p>
    );
  if (query.isError)
    return (
      <p role="alert" className="mt-4 text-sm" data-testid="requirement-summary-error">
        {t("rec.summary.unavailable")}{" "}
        <button
          type="button"
          className="font-medium underline"
          onClick={() => void query.refetch()}
        >
          {t("continuity.next.retry")}
        </button>
      </p>
    );

  const review = query.data;
  const summary = requirementSummaryOf(review.criteria);
  const label = (c: RequirementCriterion) =>
    (lang === "sv" ? c.labelSv || c.labelEn : c.labelEn || c.labelSv) ??
    (lang === "sv" ? c.instructionSv : c.instructionEn || c.instructionSv);
  const byId = new Map(review.criteria.map((c) => [c.requirementId, c]));
  const names = (ids: string[]) =>
    ids
      .map((id) => byId.get(id))
      .filter((c): c is RequirementCriterion => Boolean(c))
      .map(label);
  const reviewerName = (id: string | null) =>
    id ? (team.find((m) => m.userId === id)?.name ?? "—") : null;
  const profileMissing = !review.profile.profileId;
  const supplementBody = clarificationRequestBody(review.criteria);

  return (
    <section
      data-testid="requirement-summary"
      data-status={review.requirementStatus}
      data-review={review.reviewState}
      data-confirmed={summary.confirmedMet}
      data-mandatory={summary.mandatoryTotal}
      aria-labelledby="requirement-summary-heading"
      className="mt-4 rounded-lg border border-border bg-card p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="requirement-summary-heading" className="text-base font-semibold text-foreground">
          {t("rec.summary.heading")}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <RequirementStatusBadge status={review.requirementStatus} />
          <ReviewStatusBadge status={review.reviewState} />
        </div>
      </div>

      {profileMissing ? (
        <p className="mt-2 text-sm" data-testid="requirement-summary-profile-missing">
          {t("rec.summary.profileMissing")}{" "}
          <Link
            to="/employer/$employerSlug/jobs/$jobId"
            params={{ employerSlug, jobId }}
            search={{ step: "requirements" as const }}
            className="font-medium text-accent hover:underline"
          >
            {t("rec.summary.openProfile")}
          </Link>
        </p>
      ) : (
        <>
          <p className="mt-2 text-xs text-muted-foreground">
            {t("rec.summary.profileVersion")
              .replace("{v}", String(review.profile.version))
              .replace(
                "{date}",
                review.profile.confirmedAt ? formatStamp(review.profile.confirmedAt, lang) : "—",
              )}
          </p>
          <p
            className="mt-2 text-sm font-medium text-foreground"
            data-testid="requirement-summary-count"
          >
            {t("rec.summary.confirmed")
              .replace("{n}", String(summary.confirmedMet))
              .replace("{m}", String(summary.mandatoryTotal))}
          </p>
          {summary.preliminaryMet > 0 && (
            <p
              className="mt-1 text-xs text-muted-foreground"
              data-testid="requirement-summary-preliminary"
            >
              {t("rec.summary.preliminary").replace("{n}", String(summary.preliminaryMet))}
            </p>
          )}
          <dl className="mt-2 space-y-1 text-sm" data-testid="requirement-summary-gaps">
            {summary.notMet.length > 0 && (
              <div className="flex flex-wrap gap-x-2">
                <dt className="font-medium text-amber-900 dark:text-amber-200">
                  {t("rec.summary.notMet")}:
                </dt>
                <dd>{names(summary.notMet).join(", ")}</dd>
              </div>
            )}
            {summary.unclear.length > 0 && (
              <div className="flex flex-wrap gap-x-2">
                <dt className="font-medium">{t("rec.summary.unclear")}:</dt>
                <dd>{names(summary.unclear).join(", ")}</dd>
              </div>
            )}
            {summary.changedSource.length > 0 && (
              <div className="flex flex-wrap gap-x-2">
                <dt className="font-medium">{t("rec.summary.changed")}:</dt>
                <dd>{names(summary.changedSource).join(", ")}</dd>
              </div>
            )}
            {summary.notMet.length + summary.unclear.length + summary.changedSource.length ===
              0 && (
              <div>
                <dd className="text-muted-foreground">{t("rec.summary.nothingMissing")}</dd>
              </div>
            )}
          </dl>
        </>
      )}

      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        {t("rec.summary.greenRule")} {t("rec.summary.preliminaryNote")}
      </p>

      {review.criteria.length > 0 && (
        <details className="mt-3 text-sm" data-testid="requirement-summary-details">
          <summary className="min-h-10 cursor-pointer list-item py-2 font-medium text-foreground underline-offset-4 hover:underline">
            {t("rec.summary.details")}
          </summary>
          <ul className="mt-1 divide-y divide-border/70">
            {review.criteria.map((c) => {
              const human = c.reviewedAt !== null || c.reviewedBy !== null;
              return (
                <li
                  key={c.requirementId}
                  data-testid="requirement-summary-criterion"
                  data-requirement-id={c.requirementId}
                  data-state={c.state}
                  data-human={human ? "true" : "false"}
                  className="py-2"
                >
                  <p className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-medium">{label(c)}</span>
                    <span className="text-xs text-muted-foreground">
                      {c.kind === "mandatory"
                        ? t(`rec.summary.state.${c.state}` as TranslationKey)
                        : t("rec.summary.detail.merit")}
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t("rec.summary.detail.source")}:{" "}
                    {c.source
                      ? `${sourceLabels[lang][c.source.kind as keyof (typeof sourceLabels)["sv"]]} – ${c.source.label}${
                          c.sourceCurrent ? "" : ` (${t("rec.summary.detail.sourceChanged")})`
                        }`
                      : t("rec.summary.detail.noSource")}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {human
                      ? `${t("rec.summary.detail.reviewer")}: ${reviewerName(c.reviewedBy) ?? "—"}${
                          c.reviewedAt ? ` · ${formatStamp(c.reviewedAt, lang)}` : ""
                        }`
                      : c.state === "clarify" && !c.source
                        ? t("rec.summary.detail.unreviewed")
                        : t("rec.summary.detail.preliminary")}
                    {" · "}
                    {t("rec.summary.detail.version").replace("{v}", String(review.profile.version))}
                  </p>
                </li>
              );
            })}
          </ul>
        </details>
      )}

      {actions && !profileMissing && (
        <div className="mt-3" data-testid="requirement-summary-actions">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("rec.summary.actions")}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            <button
              type="button"
              data-testid="summary-action-confirm"
              onClick={actions.confirm}
              className={btn}
            >
              {t("rec.summary.action.confirm")}
            </button>
            <button
              type="button"
              data-testid="summary-action-supplement"
              onClick={() => actions.requestSupplement(supplementBody)}
              disabled={supplementBody.length === 0}
              title={
                supplementBody.length === 0
                  ? t("rec.summary.action.supplementNone")
                  : t("rec.summary.action.supplementHint")
              }
              className={btn}
            >
              {t("rec.summary.action.supplement")}
            </button>
            <button
              type="button"
              data-testid="summary-action-prepare"
              onClick={actions.prepareInterview}
              className={btn}
            >
              {t("rec.summary.action.prepare")}
            </button>
            {actions.proceed && actions.proceedLabel && (
              <button
                type="button"
                data-testid="summary-action-proceed"
                onClick={actions.proceed}
                className={btn}
              >
                {actions.proceedLabel}
              </button>
            )}
            {actions.reject && (
              <button
                type="button"
                data-testid="summary-action-reject"
                onClick={actions.reject}
                className={`${btn} text-destructive`}
              >
                {t("rec.summary.action.reject")}
              </button>
            )}
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {t("rec.summary.action.supplementHint")}
          </p>
        </div>
      )}
    </section>
  );
}

const btn =
  "inline-flex min-h-10 items-center rounded-md border border-border bg-background px-3 text-sm font-medium hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";
