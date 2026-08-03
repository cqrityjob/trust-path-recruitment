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
import {
  maturityLabelKey,
  MaturityRow,
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
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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

      <SafetyFlagNotice count={r.safetyFlags.length} />

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
            <MaturityRow
              key={l.competencyCode}
              name={lang === "en" ? l.competencyNameEn : l.competencyNameSv}
              level={l.maturityLevel}
              observations={l.observations}
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
                  — {t(maturityLabelKey(p.maturityLevel))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ReportLimitations items={limitations} />
    </AssessmentShell>
  );
}
