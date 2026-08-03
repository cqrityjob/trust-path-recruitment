// A released competency profile, employer view.
//
// Maturity levels and the evidence behind them. There is no total, no
// percentage and no overall verdict anywhere on this page — not because they
// are hidden, but because the snapshot contains none and the components that
// render it cannot accept one.
//
// Safety-critical findings render from their own field, above the fold,
// regardless of how strong the rest of the profile is.

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft } from "lucide-react";
import { useT } from "@/i18n/context";
import { EmployerErrorState } from "@/components/employer/EmployerErrorState";
import { AcademyHeading, AcademyPage } from "@/components/academy/AcademyWorkspace";
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

export const Route = createFileRoute(
  "/_authenticated/employer/$employerSlug/assessments/results/$attemptId",
)({
  ssr: false,
  component: ResultsRoute,
  errorComponent: EmployerErrorState,
});

function ResultsRoute() {
  const { employerSlug, attemptId } = Route.useParams();
  return (
    <AcademyPage employerSlug={employerSlug}>
      {() => <Report attemptId={attemptId} employerSlug={employerSlug} />}
    </AcademyPage>
  );
}

function Report({ attemptId, employerSlug }: { attemptId: string; employerSlug: string }) {
  const { t, lang } = useT();
  const reportFn = useServerFn(getAcademyReport);
  const recsFn = useServerFn(getDevelopmentRecommendations);
  const progressFn = useServerFn(getSubjectProgress);

  const report = useQuery({
    queryKey: ["academy", "report", attemptId, "employer"],
    queryFn: () => reportFn({ data: { attemptId, audience: "employer" as const } }),
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
    return <p className="text-sm text-muted-foreground">{t("employer.loading")}</p>;
  }
  if (!report.data) {
    return (
      <NoEvidenceState
        title={t("academy.results.notReleasedTitle")}
        body={t("academy.results.notReleasedBody")}
      />
    );
  }

  const r = report.data;
  const limitations = lang === "en" ? r.limitationsEn : r.limitationsSv;
  const releases = new Set((progress.data ?? []).map((p: { releasedAt: string }) => p.releasedAt));

  return (
    <>
      <Link
        to="/employer/$employerSlug/assessments/participants"
        params={{ employerSlug }}
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {t("academy.results.back")}
      </Link>

      <AcademyHeading
        title={t("academy.results.title")}
        lede={`${t("academy.results.releasedOn")} ${new Date(r.releasedAt).toLocaleDateString(
          lang === "en" ? "en-GB" : "sv-SE",
        )}`}
      />

      <SafetyFlagNotice count={r.safetyFlags.length} />

      <section className="mt-6 rounded-[14px] border border-border bg-card p-5">
        <h2 className="mb-2 text-sm font-semibold text-foreground">
          {t("academy.results.competencies")}
        </h2>
        {r.lines.length === 0 ? (
          <NoEvidenceState
            title={t("academy.results.noEvidenceTitle")}
            body={t("academy.results.noEvidenceBody")}
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
          <h2 className="text-sm font-semibold text-foreground">
            {t("academy.results.recommendations")}
          </h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
            {t("academy.results.recommendationsLede")}
          </p>
          <ul className="mt-4 space-y-3">
            {(recs.data ?? []).map((m: any) => (
              <li key={m.moduleVersionId} className="rounded-[10px] border border-border p-4">
                <p className="text-sm font-semibold text-foreground">
                  {lang === "en" ? m.nameEn : m.nameSv}
                </p>
                <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                  {lang === "en" ? m.summaryEn : m.summarySv}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {t("academy.results.addresses")} {lang === "en" ? m.addressesEn : m.addressesSv}
                  {m.estimatedMinutes ? ` · ${m.estimatedMinutes} min` : ""}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Progress needs at least two releases to mean anything, and says so
          rather than drawing a one-point trend line. */}
      <section className="mt-6 rounded-[14px] border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground">{t("academy.results.progress")}</h2>
        {releases.size < 2 ? (
          <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
            {t("academy.results.progressNeedsTwo")}
          </p>
        ) : (
          <ProgressTable rows={progress.data ?? []} />
        )}
      </section>

      <ReportLimitations items={limitations} />
    </>
  );
}

function ProgressTable({ rows }: { rows: any[] }) {
  const { t, lang } = useT();
  const dates = Array.from(new Set(rows.map((r) => r.releasedAt))).sort();
  const comps = Array.from(new Set(rows.map((r) => r.competencyCode)));
  const at = (c: string, d: string) =>
    rows.find((r) => r.competencyCode === c && r.releasedAt === d);

  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[32rem] text-left text-[13px]">
        <caption className="sr-only">{t("academy.results.progress")}</caption>
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className="pb-2 pr-4 font-medium text-muted-foreground">
              {t("academy.results.competency")}
            </th>
            {dates.map((d) => (
              <th key={d} scope="col" className="pb-2 pr-4 font-medium text-muted-foreground">
                {new Date(d).toLocaleDateString(lang === "en" ? "en-GB" : "sv-SE")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {comps.map((c) => {
            const first = rows.find((r) => r.competencyCode === c);
            return (
              <tr key={c} className="border-b border-border last:border-b-0">
                <th scope="row" className="py-2.5 pr-4 font-medium text-foreground">
                  {lang === "en" ? first?.competencyNameEn : first?.competencyNameSv}
                </th>
                {dates.map((d) => {
                  const cell = at(c, d);
                  return (
                    <td key={d} className="py-2.5 pr-4 text-muted-foreground">
                      {cell ? t(maturityLabelKey(cell.maturityLevel)) : "—"}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
