// The participant's own development report, plus their progress over time.
//
// Same maturity components as the employer view, and deliberately so: the
// person should see exactly what their employer sees about them, in the same
// words. A participant-facing summary that softened or reworded the employer
// one would be the beginning of two versions of the truth.

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft } from "lucide-react";
import { useT } from "@/i18n/context";
import {
  AssessmentShell,
  AssessmentPanel,
} from "@/components/career-discovery/v31/shell/AssessmentShell";
import { ReportContextPanel } from "@/components/academy/ReportContextPanel";
import {
  EvidenceCoverage,
  evidenceStateLabelKey,
  EvidenceStateRow,
  NoEvidenceState,
  ReportLimitations,
  SafetyFlagNotice,
} from "@/components/academy/MaturityDisplay";
import {
  getAcademyReport,
  getDevelopmentRecommendations,
  getSubjectProgress,
} from "@/lib/security-competency/academy-employer.functions";

export const Route = createFileRoute("/_authenticated/academy/report/$attemptId")({
  ssr: false,
  component: ParticipantReport,
});

function ParticipantReport() {
  const { attemptId } = Route.useParams();
  const { t, lang } = useT();
  const reportFn = useServerFn(getAcademyReport);
  const recsFn = useServerFn(getDevelopmentRecommendations);
  const progressFn = useServerFn(getSubjectProgress);

  const report = useQuery({
    queryKey: ["academy", "report", attemptId, "participant"],
    queryFn: () => reportFn({ data: { attemptId, audience: "participant" as const } }),
  });

  const subjectId = report.data?.subjectId;
  const recs = useQuery({
    queryKey: ["academy", "recs", subjectId],
    queryFn: () => recsFn({ data: { subjectId: subjectId! } }),
    enabled: Boolean(subjectId),
  });
  const progress = useQuery({
    queryKey: ["academy", "progress", subjectId],
    queryFn: () => progressFn({ data: { subjectId: subjectId! } }),
    enabled: Boolean(subjectId),
  });

  if (report.isLoading) {
    return (
      <AssessmentShell>
        <AssessmentPanel>
          <p className="text-sm text-muted-foreground">{t("academy.loading")}</p>
        </AssessmentPanel>
      </AssessmentShell>
    );
  }

  if (!report.data) {
    return (
      <AssessmentShell>
        <AssessmentPanel>
          <NoEvidenceState
            title={t("academy.report.notReadyTitle")}
            body={t("academy.report.notReadyBody")}
          />
        </AssessmentPanel>
      </AssessmentShell>
    );
  }

  const r = report.data;
  const limitations = lang === "en" ? r.limitationsEn : r.limitationsSv;
  const releaseDates = Array.from(new Set((progress.data ?? []).map((p) => p.releasedAt)));

  return (
    <AssessmentShell wide>
      <Link
        to="/academy"
        className="no-print mb-4 inline-flex min-h-[44px] items-center gap-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {t("academy.report.back")}
      </Link>

      <h1
        className="text-[1.75rem] font-semibold leading-tight tracking-tight text-foreground"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {t("academy.report.title")}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {t("academy.report.releasedOn")}{" "}
        {new Date(r.releasedAt).toLocaleDateString(lang === "en" ? "en-GB" : "sv-SE")}
      </p>

      <p className="mt-4 max-w-[62ch] rounded-[12px] bg-[color:var(--surface-subtle)] p-4 text-[13px] leading-relaxed text-muted-foreground">
        {t("academy.report.whatThisIs")}
      </p>

      {/* Why this happened, in the participant's own terms and before anything
          is said about them. The employer report opens with lineage; this one
          opens with a reason, because those are the two audiences' first
          questions and they are not the same question. */}
      <section className="mt-6 rounded-[14px] border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground">{t("academy.report.whyTitle")}</h2>
        <p className="mt-2 max-w-[70ch] text-[13px] leading-relaxed text-muted-foreground">
          {t("academy.report.whyBody")}
        </p>
        <p className="mt-3 max-w-[70ch] text-[13px] leading-relaxed text-foreground">
          {t("academy.report.humanDecides")}
        </p>
        <p className="mt-2 max-w-[70ch] text-[13px] leading-relaxed text-muted-foreground">
          {t("academy.report.notInability")}
        </p>
        {r.context?.humanReviewOccurred && (
          <p className="mt-2 max-w-[70ch] text-[13px] leading-relaxed text-muted-foreground">
            {t("academy.report.humanReviewOccurred")}
          </p>
        )}
      </section>

      {/* Same component as the employer surface, fed the participant's own
          frozen context -- which carries no lifecycle status, no review counts
          and no scoring model version, because the database never put them
          there. */}
      <ReportContextPanel context={r.context} reportId={r.id} releasedAt={r.releasedAt} />

      {/* The participant snapshot carries no severity-bearing flags by design,
          so this renders nothing here. It stays because the component is the
          one place that decides how a safety notice looks, and a future
          participant-safe notice belongs in it rather than beside it. */}
      <SafetyFlagNotice count={r.safetyFlags.length} />

      <EvidenceCoverage
        observations={
          r.context?.evidenceObservations ?? r.lines.reduce((n, l) => n + l.observations, 0)
        }
        contexts={r.context?.evidenceContexts ?? 1}
        bodyKey="academy.coverage.participantBody"
      />

      <section className="mt-6 rounded-[14px] border border-border bg-card p-5">
        <h2 className="mb-2 text-sm font-semibold text-foreground">
          {t("academy.report.competencies")}
        </h2>
        {r.lines.length === 0 ? (
          <NoEvidenceState
            title={t("academy.report.noEvidenceTitle")}
            body={t("academy.report.noEvidenceBody")}
          />
        ) : (
          r.lines.map((l) => (
            <EvidenceStateRow
              key={l.competencyCode}
              name={lang === "en" ? l.competencyNameEn : l.competencyNameSv}
              state={l.evidenceState}
              observations={l.observations}
              prompt={lang === "en" ? l.reflectionEn : l.reflectionSv}
              humanReviewed={l.humanReviewed}
            />
          ))
        )}
      </section>

      {(recs.data?.length ?? 0) > 0 && (
        <section className="mt-6 rounded-[14px] border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground">{t("academy.report.suggested")}</h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
            {t("academy.report.suggestedLede")}
          </p>
          <ul className="mt-4 space-y-3">
            {(recs.data ?? []).map((m) => (
              <li key={m.moduleVersionId} className="rounded-[10px] border border-border p-4">
                <p className="text-sm font-semibold text-foreground">
                  {lang === "en" ? m.nameEn : m.nameSv}
                </p>
                <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                  {lang === "en" ? m.summaryEn : m.summarySv}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-6 rounded-[14px] border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground">{t("academy.report.progress")}</h2>
        {releaseDates.length < 2 ? (
          <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
            {t("academy.report.progressNeedsTwo")}
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {(progress.data ?? []).map((p, i) => (
              <li key={`${p.attemptId}-${p.competencyCode}-${i}`} className="text-[13px]">
                <span className="text-muted-foreground">
                  {new Date(p.releasedAt).toLocaleDateString(lang === "en" ? "en-GB" : "sv-SE")}{" "}
                  ·{" "}
                </span>
                <span className="font-medium text-foreground">
                  {lang === "en" ? p.competencyNameEn : p.competencyNameSv}
                </span>
                <span className="text-muted-foreground">
                  {" "}
                  — {t(evidenceStateLabelKey(p.evidenceState))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6 rounded-[14px] border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground">{t("academy.report.rightsTitle")}</h2>
        <p className="mt-2 max-w-[70ch] text-[13px] leading-relaxed text-muted-foreground">
          {t("academy.report.rightsBody")}
        </p>
        <p className="mt-2 max-w-[70ch] text-[13px] leading-relaxed text-muted-foreground">
          {t("academy.report.rightsContact")}
        </p>
      </section>

      <ReportLimitations items={limitations} />
    </AssessmentShell>
  );
}
