// Security Career Discovery — report history.
//
// Newest first, owner-scoped. Reads the cd_my_report_history view, which is
// security_invoker, so the caller's own RLS decides what they see. There is
// no employer surface here and no sharing control: employer access to
// Career Discovery results is out of scope, and candidate sharing does not
// exist yet.

import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, FileText } from "lucide-react";
import { AssessmentLayout } from "@/components/assessment/AssessmentLayout";
import { PrimaryButton } from "@/components/site/PrimaryButton";
import { useT } from "@/i18n/context";
import { AREAS_BY_ID } from "@/lib/career-discovery/career-areas";
import type { SecurityCareerAreaId } from "@/lib/career-discovery/career-areas";
import { listMyDiscoveryReports } from "@/lib/career-discovery/discovery.functions";

export const Route = createFileRoute("/_authenticated/discovery/history")({
  component: DiscoveryHistoryRoute,
});

function DiscoveryHistoryRoute() {
  const { t, lang } = useT();
  const load = useServerFn(listMyDiscoveryReports);
  const [data, setData] = useState<Awaited<ReturnType<typeof listMyDiscoveryReports>> | null>(null);

  useEffect(() => {
    let mounted = true;
    load({}).then((d) => mounted && setData(d));
    return () => {
      mounted = false;
    };
  }, [load]);

  const dateFmt = new Intl.DateTimeFormat(lang === "sv" ? "sv-SE" : "en-GB", {
    dateStyle: "long",
    timeStyle: "short",
  });

  return (
    <AssessmentLayout narrow>
      <h1
        className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {t("careerDiscovery.history.title")}
      </h1>
      <p className="mt-4 text-base leading-relaxed text-muted-foreground">
        {t("careerDiscovery.history.lead")}
      </p>

      {!data && (
        <p className="mt-10 text-sm text-muted-foreground">
          {t("careerDiscovery.history.loading")}
        </p>
      )}

      {data && data.reports.length === 0 && (
        <div className="mt-10 rounded-lg border border-border bg-background p-8 text-center">
          <FileText className="mx-auto h-6 w-6 text-muted-foreground" aria-hidden="true" />
          <p className="mt-4 text-sm text-muted-foreground">{t("careerDiscovery.history.empty")}</p>
          <div className="mt-6 flex justify-center">
            <Link to="/discovery">
              <PrimaryButton>
                {t("careerDiscovery.history.startCta")}
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
              </PrimaryButton>
            </Link>
          </div>
        </div>
      )}

      {data && data.reports.length > 0 && (
        <ul className="mt-10 space-y-3">
          {data.reports.map((r) => {
            const area = r.topAreaId
              ? AREAS_BY_ID.get(r.topAreaId as SecurityCareerAreaId)
              : undefined;
            return (
              <li key={r.snapshotId}>
                <Link
                  to="/discovery/report/$snapshotId"
                  params={{ snapshotId: r.snapshotId }}
                  className="flex items-center justify-between gap-4 rounded-lg border border-border bg-background p-5 transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">
                      {area ? area.name[lang] : t("careerDiscovery.history.report")}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {dateFmt.format(new Date(r.generatedAt))}
                    </p>
                    <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                      {r.definitionVersion} · {r.scoringVersion}
                    </p>
                  </div>
                  <ArrowRight
                    className="h-4 w-4 flex-shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </AssessmentLayout>
  );
}
