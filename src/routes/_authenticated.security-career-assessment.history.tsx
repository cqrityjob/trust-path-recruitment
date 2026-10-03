// CANONICAL report history — /security-career-assessment/history
//
// Security Career Discovery — report history.
//
// Newest first, owner-scoped. Reads the cd_my_report_history view, which is
// security_invoker, so the caller's own RLS decides what they see. There is
// no employer surface here and no sharing control: employer access to
// Career Discovery results is out of scope, and candidate sharing does not
// exist yet.
//
// A read that fails is shown as a failure with a retry. It used to have no
// catch at all, so a network error or a 5xx left the loading line on screen
// for ever, and a read that returned no rows was indistinguishable from a
// history with nothing in it.

import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, FileText } from "lucide-react";
import { AssessmentLayout } from "@/components/assessment/AssessmentLayout";
import { PrimaryButton } from "@/components/site/PrimaryButton";
import { useCareerAnalysisOpen } from "@/components/career-discovery/use-career-analysis-open";
import { useT } from "@/i18n/context";
import { AREAS_BY_ID } from "@/lib/career-discovery/career-areas";
import type { SecurityCareerAreaId } from "@/lib/career-discovery/career-areas";
import { listMyDiscoveryReports } from "@/lib/career-discovery/discovery.functions";

export const Route = createFileRoute("/_authenticated/security-career-assessment/history")({
  component: DiscoveryHistoryRoute,
});

function DiscoveryHistoryRoute() {
  const { t, lang } = useT();
  // The empty state offers to start the analysis, which is a door into the
  // canonical route: it asks the one availability hook the route asks.
  // Authenticated route, so the reader is signed in.
  const analysisOpen = useCareerAnalysisOpen(true);
  const load = useServerFn(listMyDiscoveryReports);
  const [data, setData] = useState<Awaited<ReturnType<typeof listMyDiscoveryReports>> | null>(null);
  const [failed, setFailed] = useState(false);
  // Bumped by the retry button; the effect re-reads when it changes.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let mounted = true;
    load({})
      .then((d) => {
        if (!mounted) return;
        setData(d);
        setFailed(false);
      })
      .catch(() => mounted && setFailed(true));
    return () => {
      mounted = false;
    };
  }, [load, attempt]);

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

      {!data && !failed && (
        <p className="mt-10 text-sm text-muted-foreground">
          {t("careerDiscovery.history.loading")}
        </p>
      )}

      {!data && failed && (
        <div
          role="alert"
          data-history-read-failed
          className="mt-10 rounded-lg border border-border bg-background p-8 text-center"
        >
          <p className="text-sm text-muted-foreground">{t("careerDiscovery.history.error")}</p>
          <div className="mt-6 flex justify-center">
            <button
              type="button"
              onClick={() => {
                setFailed(false);
                setAttempt((n) => n + 1);
              }}
              className="inline-flex h-11 items-center justify-center rounded-md border border-border px-5 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {t("careerDiscovery.history.retry")}
            </button>
          </div>
        </div>
      )}

      {data && data.reports.length === 0 && (
        <div className="mt-10 rounded-lg border border-border bg-background p-8 text-center">
          <FileText className="mx-auto h-6 w-6 text-muted-foreground" aria-hidden="true" />
          <p className="mt-4 text-sm text-muted-foreground">{t("careerDiscovery.history.empty")}</p>
          {analysisOpen === false ? (
            // The analysis is closed to this account right now: no start
            // button into a page that says no. Say so, and offer what they
            // can do instead.
            <>
              <p
                className="mx-auto mt-3 max-w-[52ch] text-sm text-muted-foreground"
                data-career-analysis-closed
              >
                {t("home.career.closed")}
              </p>
              <div className="mt-6 flex justify-center">
                <Link
                  to="/career-center"
                  className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent underline-offset-4 hover:underline"
                >
                  {t("cd.public.exploreInstead")}
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </div>
            </>
          ) : (
            <div className="mt-6 flex justify-center">
              <Link to="/security-career-assessment">
                <PrimaryButton>
                  {t("careerDiscovery.history.startCta")}
                  <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                </PrimaryButton>
              </Link>
            </div>
          )}
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
                  to="/security-career-assessment/report/$snapshotId"
                  params={{ snapshotId: r.snapshotId }}
                  data-definition-version={r.definitionVersion}
                  data-scoring-version={r.scoringVersion}
                  className="flex items-center justify-between gap-4 rounded-lg border border-border bg-background p-5 transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">
                      {area ? area.name[lang] : t("careerDiscovery.history.report")}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {dateFmt.format(new Date(r.generatedAt))}
                    </p>
                    {/* No "2026-scd-v3.1.0 · v3.1-draft-4" line. This was the
                        one candidate surface that printed the DRAFT scoring
                        version verbatim, under a list of the candidate's own
                        results. Both versions stay on the report itself, in
                        its Method section, where they are labelled. */}
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
