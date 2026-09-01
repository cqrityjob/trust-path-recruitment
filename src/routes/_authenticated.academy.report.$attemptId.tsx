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
      <AssessmentLayout>
        <AssessmentPanel>
          <p className="text-sm text-muted-foreground">{t("academy.loading")}</p>
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
          {t(candidate ? "academy.report.whyBodyRecruitment" : "academy.report.whyBody")}
        </p>
        <p className="mt-3 max-w-[70ch] text-[13px] leading-relaxed text-foreground">
          {t("academy.report.humanDecides")}
        </p>
        <p className="mt-2 max-w-[70ch] text-[13px] leading-relaxed text-muted-foreground">
          {t("academy.report.notInability")}
        </p>
        {/* Two different facts, and conflating them was the defect. A review
            happening is routine — twelve of the eighteen items are classified
            safety-critical, so it happens to everybody. A reviewer actually
            FINDING something is not routine, and only that gets said. */}
        {r.context?.humanReviewOccurred && (
          <p className="mt-2 max-w-[70ch] text-[13px] leading-relaxed text-muted-foreground">
            {t("academy.report.humanReviewOccurred")}
          </p>
        )}
        {r.context?.safetyConcernPresent && (
          <p className="mt-2 max-w-[70ch] text-[13px] leading-relaxed text-foreground">
            {t("academy.report.safetyConcernNoted")}
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

      {/* What the assessment was made of, and the distinction that matters most
          to the person who sat it: what we watched them do, and what they told
          us about themselves. Said in the participant's own report, in the same
          words the employer sees. */}
      {r.brief && r.brief.modules.length > 0 && (
        <section className="mt-6 rounded-[14px] border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground">{t("report.modulesDone")}</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {r.brief.modules.map((m) => (
              <li
                key={m.blockKey}
                className="inline-flex items-center gap-1.5 rounded-[8px] border border-border px-2.5 py-1 text-xs text-foreground"
              >
                {lang === "en" ? m.nameEn : m.nameSv}
                <span className="text-muted-foreground">
                  {m.answered}/{m.items}
                </span>
              </li>
            ))}
          </ul>
          <h3 className="mt-5 text-sm font-semibold text-foreground">
            {t("report.observedVsSelf")}
          </h3>
          <p className="mt-2 max-w-[70ch] text-[13px] leading-relaxed text-muted-foreground">
            {t("report.observedVsSelfBody")}
          </p>
        </section>
      )}

      {/* Their own answers, given back to them. No numbers: the participant
          brief carries the pattern and the count and deliberately not the mean
          or the spread, so there is nothing here that could be read as a mark
          out of ten. */}
      {r.brief && r.brief.selfReported.length > 0 && (
        <section className="mt-6 rounded-[14px] border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground">{t("report.selfReported")}</h2>
          <p className="mt-1.5 max-w-[70ch] text-[13px] leading-relaxed text-muted-foreground">
            {t("report.selfReportedLede")}
          </p>
          <ul className="mt-4">
            {r.brief.selfReported.map((sr) => (
              <li
                key={sr.domainKey}
                className="border-b border-border py-3 last:border-b-0 last:pb-0"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <h3 className="text-sm font-medium text-foreground">
                    {lang === "en" ? sr.domainEn : sr.domainSv}
                  </h3>
                  <p className="text-[13px] text-foreground">
                    {t(`brief.pattern.${sr.pattern}` as TranslationKey)}
                  </p>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {sr.items} {t("brief.questionsAnswered")}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

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
    </AssessmentLayout>
  );
}
