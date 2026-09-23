// The three quieter tabs of a recruitment: what the vacancy asks for, what has
// happened, and who is responsible -- including the two acts that end a
// recruitment, which are deliberately separate:
//
//   Closing applications   the advertisement stops taking applications. The
//                          candidates stay, and the work with them continues.
//   Completing             every candidate has an outcome and the recruitment
//                          is recorded as finished. Refused by the database
//                          while anybody is still without one, and the screen
//                          lists exactly who, rather than assigning outcomes on
//                          the employer's behalf.

import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { CheckCircle2, Lock, UserRound } from "lucide-react";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import { ConfirmAction } from "@/components/employer/ConfirmAction";
import { StageBadge } from "@/components/recruitment/RecruitmentStatus";
import { recruitmentErrorKey } from "@/components/recruitment/errors";
import {
  completeRecruitment,
  listRecruitmentActivity,
  reopenRecruitment,
  setRecruitmentResponsible,
  type CandidateRow,
  type QuestionRow,
  type RecruitmentDetail,
  type RequirementRow,
} from "@/lib/recruitment/recruitment.functions";
import { formatInZone, formatStamp } from "@/lib/recruitment/format";
import type { RecruitmentPhase } from "@/lib/recruitment/definitions";
import { APPLICATION_STATUS_LABEL_KEY } from "@/lib/job-intelligence/application-status";
import type { ApplicationStatus } from "@/lib/job-intelligence/applications.functions";

// ── Vacancy and requirements ────────────────────────────────────────────

export function VacancyStructureSummary({
  requirements,
  questions,
  locked,
  editHref,
}: {
  requirements: RequirementRow[];
  questions: QuestionRow[];
  locked: boolean;
  editHref: { employerSlug: string; jobId: string } | null;
}) {
  const { t, lang } = useT();
  const label = (sv: string | null, en: string | null) =>
    (lang === "en" ? en || sv : sv || en) ?? "";
  const mandatory = requirements.filter((r) => r.kind === "mandatory");
  const desirable = requirements.filter((r) => r.kind === "desirable");
  const reqLabel = new Map(requirements.map((r) => [r.id, label(r.labelSv, r.labelEn)]));
  return (
    <div className="mt-3 space-y-5">
      {requirements.length === 0 && questions.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("rec.vacancy.none")}</p>
      )}
      {mandatory.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold">{t("rec.requirement.mandatoryPlural")}</h3>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
            {mandatory.map((r) => (
              <li key={r.id}>{label(r.labelSv, r.labelEn)}</li>
            ))}
          </ul>
        </div>
      )}
      {desirable.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold">{t("rec.requirement.desirablePlural")}</h3>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
            {desirable.map((r) => (
              <li key={r.id}>{label(r.labelSv, r.labelEn)}</li>
            ))}
          </ul>
        </div>
      )}
      {questions.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold">{t("rec.vacancy.questionsHeading")}</h3>
          <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm">
            {questions.map((q) => (
              <li key={q.id}>
                {label(q.promptSv, q.promptEn)}{" "}
                <span className="text-xs text-muted-foreground">
                  (
                  {t(
                    q.answerKind === "yes_no"
                      ? "rec.question.kind.yes_no"
                      : "rec.question.kind.text",
                  )}
                  {q.isRequired ? `, ${t("rec.question.required")}` : ""}
                  {q.requirementId && reqLabel.get(q.requirementId)
                    ? ` · ${reqLabel.get(q.requirementId)}`
                    : ""}
                  )
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
      {locked ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Lock className="h-3.5 w-3.5" aria-hidden="true" />
          {t("rec.vacancy.locked")}
        </p>
      ) : editHref ? (
        <Link
          to="/employer/$employerSlug/jobs/$jobId/edit"
          params={editHref}
          className="inline-flex min-h-9 items-center rounded-md border border-border px-3 text-sm font-medium hover:bg-muted/40"
        >
          {t("rec.vacancy.edit")}
        </Link>
      ) : null}
    </div>
  );
}

// ── Activities ──────────────────────────────────────────────────────────

export function RecruitmentActivity({
  employerId,
  employerSlug,
  jobId,
}: {
  employerId: string;
  employerSlug: string;
  jobId: string;
}) {
  const { t, lang } = useT();
  const fn = useServerFn(listRecruitmentActivity);
  const q = useQuery({
    queryKey: ["employer", employerId, "recruitment", jobId, "activity"],
    queryFn: () => fn({ data: { employerId, jobId } }),
  });
  if (q.isLoading) return <p className="text-sm text-muted-foreground">{t("employer.loading")}</p>;
  if (q.isError) {
    return (
      <div
        role="alert"
        className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-3 text-sm"
      >
        {t("rec.activity.unavailable")}{" "}
        <button type="button" className="font-medium underline" onClick={() => void q.refetch()}>
          {t("continuity.next.retry")}
        </button>
      </div>
    );
  }
  const items = q.data ?? [];
  if (items.length === 0)
    return <p className="text-sm text-muted-foreground">{t("rec.activity.none")}</p>;
  const statusLabel = (s: string | null) =>
    s ? t(APPLICATION_STATUS_LABEL_KEY[s as ApplicationStatus] ?? "rec.stage.unknown") : "";
  return (
    <ol className="space-y-2">
      {items.map((i) => {
        let text = "";
        if (i.kind === "stage") {
          text =
            i.detail.actorRole === "candidate"
              ? t("rec.activity.candidateStage").replace("{to}", statusLabel(i.detail.to))
              : t("rec.activity.stage")
                  .replace("{from}", statusLabel(i.detail.from))
                  .replace("{to}", statusLabel(i.detail.to));
        } else if (i.kind === "message") {
          text = `${t("rec.activity.message")}: ${i.detail.subject ?? ""}`;
        } else if (i.kind === "booking") {
          text = `${t("rec.activity.booking")}: ${
            i.detail.startsAt && i.detail.timezone
              ? formatInZone(i.detail.startsAt, i.detail.timezone, lang)
              : ""
          } — ${t(`rec.booking.status.${i.detail.status}` as TranslationKey)}`;
        } else {
          text = t("rec.activity.comment");
        }
        return (
          <li
            key={i.id}
            className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 rounded-md border border-border px-3 py-2 text-sm"
          >
            <span className="w-28 shrink-0 text-xs tabular-nums text-muted-foreground">
              {formatStamp(i.at, lang)}
            </span>
            <Link
              to="/employer/$employerSlug/applications/$applicationId"
              params={{ employerSlug, applicationId: i.applicationId }}
              className="font-medium hover:text-accent hover:underline"
            >
              {i.candidateName ?? t("employer.applications.anonymousCandidate")}
            </Link>
            <span className="text-muted-foreground">{text}</span>
            {i.actorName && <span className="text-xs text-muted-foreground">· {i.actorName}</span>}
          </li>
        );
      })}
    </ol>
  );
}

// ── Team and settings ───────────────────────────────────────────────────

export function RecruitmentSettings({
  employerId,
  employerSlug,
  jobId,
  recruitment,
  recruitmentError,
  phase,
  unresolved,
  closeable,
  busy,
  onClose,
  onChanged,
}: {
  employerId: string;
  employerSlug: string;
  jobId: string;
  recruitment: RecruitmentDetail | null;
  recruitmentError: boolean;
  phase: RecruitmentPhase;
  unresolved: CandidateRow[];
  closeable: boolean;
  busy: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { t, lang } = useT();
  const responsibleFn = useServerFn(setRecruitmentResponsible);
  const completeFn = useServerFn(completeRecruitment);
  const reopenFn = useServerFn(reopenRecruitment);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState<null | "completed" | "cancelled">(null);
  const [note, setNote] = useState("");

  if (recruitmentError) {
    return (
      <p
        role="alert"
        className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-3 text-sm"
      >
        {t("rec.hub.recruitmentUnavailable")}
      </p>
    );
  }
  if (!recruitment) return <p className="text-sm text-muted-foreground">{t("employer.loading")}</p>;

  const r = recruitment;
  const isAdmin = r.role === "owner" || r.role === "admin";

  async function run(fn: () => Promise<unknown>) {
    setSaving(true);
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (e) {
      setError(t(recruitmentErrorKey((e as Error).message)));
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  const sectionCls = "rounded-xl border border-border bg-card p-4 sm:p-5";
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {error && (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive lg:col-span-2"
        >
          {error}
        </p>
      )}

      <section className={sectionCls} aria-labelledby="rec-responsible">
        <h2 id="rec-responsible" className="text-base font-semibold">
          {t("rec.settings.responsibleHeading")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("rec.settings.responsibleLede")}</p>
        {r.canManage ? (
          <select
            aria-labelledby="rec-responsible"
            disabled={saving}
            value={r.settings.responsibleUserId ?? ""}
            onChange={(e) =>
              void run(() =>
                responsibleFn({
                  data: {
                    jobId,
                    userId: e.target.value || null,
                    expectedVersion: r.settings.version,
                  },
                }),
              )
            }
            className="mt-3 h-10 w-full rounded-md border border-border bg-background px-2 text-sm"
          >
            <option value="">{t("rec.hub.noResponsible")}</option>
            {r.team.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.name} · {t(`rec.role.${m.role}` as TranslationKey)}
              </option>
            ))}
          </select>
        ) : (
          <p className="mt-3 text-sm font-medium">
            {r.team.find((m) => m.userId === r.settings.responsibleUserId)?.name ??
              t("rec.hub.noResponsible")}
          </p>
        )}
      </section>

      <section className={sectionCls} aria-labelledby="rec-team">
        <h2 id="rec-team" className="text-base font-semibold">
          {t("rec.settings.teamHeading")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("rec.settings.teamLede")}</p>
        <ul className="mt-3 divide-y divide-border">
          {r.team.map((m) => {
            const responsible = m.userId === r.settings.responsibleUserId;
            const key: TranslationKey =
              m.role === "owner" || m.role === "admin"
                ? "rec.settings.can.admin"
                : responsible
                  ? "rec.settings.can.responsible"
                  : "rec.settings.can.member";
            return (
              <li key={m.userId} className="flex items-start gap-3 py-2 text-sm">
                <UserRound
                  className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <div>
                  <p className="font-medium">
                    {m.name}
                    {m.isSelf && (
                      <span className="ml-1 text-xs text-muted-foreground">
                        ({t("rec.team.you")})
                      </span>
                    )}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {t(`rec.role.${m.role}` as TranslationKey)}
                    </span>
                    {responsible && (
                      <span className="ml-2 text-xs font-medium text-accent">
                        {t("rec.hub.responsible")}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">{t(key)}</p>
                </div>
              </li>
            );
          })}
        </ul>
        {isAdmin && (
          <Link
            to="/employer/$employerSlug/settings"
            params={{ employerSlug }}
            className="mt-2 inline-flex text-sm font-medium text-accent hover:underline"
          >
            {t("rec.settings.manageTeam")}
          </Link>
        )}
      </section>

      <section className={sectionCls} aria-labelledby="rec-close">
        <h2 id="rec-close" className="text-base font-semibold">
          {t("rec.settings.closeHeading")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("rec.settings.closeLede")}</p>
        {phase === "published" && closeable ? (
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="mt-3 inline-flex min-h-10 items-center rounded-md border border-border px-3 text-sm font-medium hover:bg-muted/40 disabled:opacity-60"
          >
            {t("rec.hub.closeApplications")}
          </button>
        ) : (
          <p className="mt-3 text-sm">
            {phase === "published"
              ? t("rec.settings.closeNotPermitted")
              : t(`rec.settings.phaseNote.${phase}` as TranslationKey)}
          </p>
        )}
      </section>

      <section className={sectionCls} aria-labelledby="rec-complete">
        <h2 id="rec-complete" className="text-base font-semibold">
          {t("rec.settings.completeHeading")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("rec.settings.completeLede")}</p>

        {phase === "completed" || phase === "cancelled" ? (
          <div className="mt-3 space-y-2 text-sm">
            <p className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-accent" aria-hidden="true" />
              {t(
                phase === "completed" ? "rec.settings.completedOn" : "rec.settings.cancelledOn",
              ).replace(
                "{at}",
                r.settings.completedAt ? formatStamp(r.settings.completedAt, lang) : "",
              )}
            </p>
            {r.settings.completionNote && (
              <p className="text-muted-foreground">{r.settings.completionNote}</p>
            )}
            {isAdmin && (
              <button
                type="button"
                disabled={saving}
                onClick={() => void run(() => reopenFn({ data: { jobId } }))}
                className="inline-flex min-h-10 items-center rounded-md border border-border px-3 text-sm font-medium hover:bg-muted/40"
              >
                {t("rec.settings.reopen")}
              </button>
            )}
          </div>
        ) : phase === "published" || phase === "draft" ? (
          <p className="mt-3 text-sm">{t("rec.settings.closeFirst")}</p>
        ) : !r.canManage ? (
          <p className="mt-3 text-sm text-muted-foreground">
            {t("rec.settings.completeRestricted")}
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            {unresolved.length > 0 ? (
              <div>
                <p className="text-sm font-medium">
                  {t("rec.settings.unresolved").replace("{n}", String(unresolved.length))}
                </p>
                <ul className="mt-2 space-y-1">
                  {unresolved.map((c) => (
                    <li key={c.applicationId} className="flex flex-wrap items-center gap-2 text-sm">
                      <Link
                        to="/employer/$employerSlug/applications/$applicationId"
                        params={{ employerSlug, applicationId: c.applicationId }}
                        className="font-medium hover:text-accent hover:underline"
                      >
                        {c.name ?? t("employer.applications.anonymousCandidate")}
                      </Link>
                      <StageBadge status={c.status} />
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-sm">{t("rec.settings.allResolved")}</p>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={saving || unresolved.length > 0}
                onClick={() => setCompleting("completed")}
                className="inline-flex min-h-10 items-center rounded-md bg-accent px-4 text-sm font-semibold text-accent-foreground disabled:opacity-60"
              >
                {t("rec.settings.complete")}
              </button>
              <button
                type="button"
                disabled={saving || unresolved.length > 0}
                onClick={() => setCompleting("cancelled")}
                className="inline-flex min-h-10 items-center rounded-md border border-border px-3 text-sm font-medium hover:bg-muted/40 disabled:opacity-60"
              >
                {t("rec.settings.cancelRecruitment")}
              </button>
            </div>
          </div>
        )}
      </section>

      {completing && (
        <ConfirmAction
          open
          onOpenChange={(o) => !o && setCompleting(null)}
          busy={saving}
          title={t(
            completing === "completed"
              ? "rec.settings.completeConfirmTitle"
              : "rec.settings.cancelConfirmTitle",
          )}
          consequence={
            <div className="space-y-2">
              <p>{t("rec.settings.completeConfirmBody")}</p>
              <label className="block text-sm">
                {t("rec.settings.completeNote")}
                <textarea
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  value={note}
                  maxLength={2000}
                  onChange={(e) => setNote(e.target.value)}
                />
              </label>
            </div>
          }
          confirmLabel={t(
            completing === "completed" ? "rec.settings.complete" : "rec.settings.cancelRecruitment",
          )}
          cancelLabel={t("rec.common.cancel")}
          onConfirm={() => {
            const state = completing;
            setCompleting(null);
            void run(() =>
              completeFn({
                data: {
                  jobId,
                  state,
                  note: note.trim() || null,
                  expectedVersion: r.settings.version,
                },
              }),
            );
          }}
        />
      )}
    </div>
  );
}
