// Phase 2 — Saved Career Intelligence Report, read-only replay of a stored
// snapshot. Follows the same route pattern as
// src/routes/_authenticated.journey.$targetId.tsx: params via
// Route.useParams(), an owner-scoped server fetch, and a loading /
// not-found / (here, additionally) legacy-empty / success state chain.
// No separate "unauthorized" branch is needed — RLS means a foreign-owned
// runId simply returns no row, which falls into the same not-found branch.

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AssessmentLayout } from "@/components/assessment/AssessmentLayout";
import { EngineResultView } from "@/components/assessment/result/engine-view";
import { PrimaryButton } from "@/components/site/PrimaryButton";
import { useT } from "@/i18n/context";
import { getMySavedReport } from "@/lib/career-intelligence-engine/report.functions";

export const Route = createFileRoute("/_authenticated/my-career/reports/$runId")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Your Career Report — CQrityjob" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: SavedReportPage,
});

function SavedReportPage() {
  const { runId } = Route.useParams();
  const { t, lang } = useT();
  const navigate = useNavigate();
  const fetchReport = useServerFn(getMySavedReport);

  const query = useQuery({
    queryKey: ["my-career", "report", runId],
    queryFn: () => fetchReport({ data: { runId } }),
  });

  if (query.isLoading) {
    return (
      <AssessmentLayout narrow>
        <p className="text-sm text-muted-foreground">{t("sca.report.loading")}</p>
      </AssessmentLayout>
    );
  }

  if (query.isError || !query.data?.run) {
    return (
      <AssessmentLayout narrow>
        <p className="text-sm text-foreground">{t("sca.report.notFound")}</p>
        <div className="mt-6">
          <Link to="/my-career" className="text-sm font-medium text-accent hover:underline">
            {t("sca.report.backToMyCareer")}
          </Link>
        </div>
      </AssessmentLayout>
    );
  }

  if (!query.data.report) {
    return (
      <AssessmentLayout narrow>
        <p className="text-sm text-foreground">{t("sca.report.legacyEmpty")}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <PrimaryButton onClick={() => navigate({ to: "/security-career-assessment" })}>
            {t("sca.report.retake")}
          </PrimaryButton>
          <Link
            to="/my-career"
            className="inline-flex h-11 items-center justify-center rounded-md border border-border bg-transparent px-5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            {t("sca.report.backToMyCareer")}
          </Link>
        </div>
      </AssessmentLayout>
    );
  }

  const report = query.data.report;
  const savedDate = new Date(report.savedAt).toLocaleDateString(lang === "sv" ? "sv-SE" : "en-GB", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <AssessmentLayout>
      {/* Screen-hidden, print-visible header: title, date, version metadata.
          See src/styles.css @media print for .print-only / .no-print. */}
      <div className="print-only">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          {t("sca.report.printEyebrow")}
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground">
          {t("sca.report.printHeading")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {savedDate} · {report.reportVersion} · {report.engineVersion}
        </p>
      </div>

      <div className="no-print mb-6 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{savedDate}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            {lang === "sv"
              ? "Använd webbläsarens dialogruta för att välja \"Spara som PDF\" som mål."
              : "Use your browser's print dialog and choose \"Save as PDF\" as the destination."}
          </p>
        </div>
        <PrimaryButton variant="ghost" onClick={() => window.print()}>
          {t("sca.report.download")}
        </PrimaryButton>
      </div>

      <EngineResultView
        result={report.engineResult}
        lang={lang}
        onRetake={() => navigate({ to: "/security-career-assessment" })}
        mode="saved"
        compareEnrichment={report.compareEnrichment}
      />
    </AssessmentLayout>
  );
}
