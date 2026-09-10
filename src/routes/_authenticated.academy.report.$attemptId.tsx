// The participant's own report, plus their progress over time.
//
// Same maturity components as the employer view, and deliberately so: the
// person should see exactly what their employer sees about them, in the same
// words. A participant-facing summary that softened or reworded the employer
// one would be the beginning of two versions of the truth.
//
// ── WHY THE WORDS "DEVELOPMENT" AND "YOUR EMPLOYER" ARE CONDITIONAL ────
//
// This page was written for the workforce product and said so throughout: the
// heading was "My development report" and the reason given was that "your
// employer asked you to complete an assessment for competence development".
// The same page is what an APPLICANT reaches. Both sentences are false to
// them — nobody is developing them, and the organisation that asked is one
// they do not work for and may never work for.
//
// The fork is `personContext`, which the release function already derived from
// the assignment and froze into the snapshot's own context. It is read here
// rather than re-derived, for the same reason the employer results page reads
// it: the report says what it was released as, and a report that changed its
// purpose after the fact would not be a snapshot.
//
// Only the sentences that are FACTUALLY wrong in recruitment are forked.
// Everything about evidence, limitations and rights is identical for both,
// which is the point — the same person is owed the same account either way.

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft } from "lucide-react";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import { AssessmentPanel } from "@/components/career-discovery/v31/shell/AssessmentShell";
import { AssessmentLayout } from "@/components/assessment/AssessmentLayout";
import {
  CandidateReportDocument,
  CandidateReportRights,
} from "@/components/academy/CandidateReportDocument";
import { logAcademyError } from "@/lib/security-competency/rpc-errors";
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
      <AssessmentLayout>
        <AssessmentPanel>
          <p className="text-sm text-muted-foreground">{t("academy.loading")}</p>
        </AssessmentPanel>
      </AssessmentLayout>
    );
  }

  // A failed read and a report that simply is not released yet are different
  // situations, and the candidate is the person least able to tell them apart.
  // Saying "not available yet" for a broken read leaves someone waiting for
  // something that already exists -- which is exactly what happened while the
  // audience RPC was withholding released reports. getAcademyReport returns
  // null only for a genuine no-row, so isError is the signal that something
  // broke. Same handling as the employer results route.
  if (report.isError) {
    const { kind } = logAcademyError("academy/report", report.error);
    return (
      <AssessmentLayout>
        <AssessmentPanel>
          <div role="alert">
            <p className="text-sm font-semibold text-foreground">
              {t(
                kind === "backend_unavailable"
                  ? "academy.error.unavailableTitle"
                  : "academy.error.failedTitle",
              )}
            </p>
            <p className="mt-2 max-w-[62ch] text-[13px] leading-relaxed text-muted-foreground">
              {t(
                kind === "backend_unavailable"
                  ? "academy.error.unavailableBody"
                  : "academy.error.failedBody",
              )}
            </p>
          </div>
        </AssessmentPanel>
      </AssessmentLayout>
    );
  }

  if (!report.data) {
    return (
      <AssessmentLayout>
        <AssessmentPanel>
          <NoEvidenceState
            title={t("academy.report.notReadyTitle")}
            body={t("academy.report.notReadyBody")}
          />
        </AssessmentPanel>
      </AssessmentLayout>
    );
  }

  const r = report.data;
  // Read from the snapshot's frozen context, never re-derived. Absent on a
  // snapshot released before the context carried it, and the workforce wording
  // is the right default there: that is what those releases actually were.
  const candidate = r.context?.personContext === "candidate";
  const limitations = lang === "en" ? r.limitationsEn : r.limitationsSv;
  const releaseDates = Array.from(new Set((progress.data ?? []).map((p) => p.releasedAt)));

  return (
    <AssessmentLayout>
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
        {t(candidate ? "academy.report.titleRecruitment" : "academy.report.title")}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {t("academy.report.releasedOn")}{" "}
        {new Date(r.releasedAt).toLocaleDateString(lang === "en" ? "en-GB" : "sv-SE")}
      </p>

      {/* The released document itself, rendered by the component the employer's
          "show exactly what the candidate sees" preview also calls. One piece
          of markup, two surfaces: the preview is a guarantee only while it is
          impossible for the two to differ. */}
      <CandidateReportDocument report={r} />

      {(recs.data?.length ?? 0) > 0 && (
        <section className="mt-6 rounded-[14px] border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground">
            {t(candidate ? "academy.report.suggestedRecruitment" : "academy.report.suggested")}
          </h2>
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

      <CandidateReportRights report={r} />
    </AssessmentLayout>
  );
}
