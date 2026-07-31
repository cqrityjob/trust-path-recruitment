// CANONICAL report route — /security-career-assessment/report/$snapshotId
//
// Security Career Discovery — the stored report.
//
// Renders the nine sections from the STRUCTURED snapshot. No prose is
// stored; every candidate-facing string here comes from the versioned
// content embedded in the snapshot, so reopening an old report shows
// exactly what it said when it was generated.
//
// The first screen opens with "Your Security Career DNA" — never with
// "You are best suited for…".

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { AssessmentLayout } from "@/components/assessment/AssessmentLayout";
import { V31ReportView } from "@/components/career-discovery/v31/V31ReportView";
import { useT } from "@/i18n/context";
import { getStoredDiscoveryReport } from "@/lib/career-discovery/stored-report.functions";
import type { DiscoveryReport } from "@/lib/career-discovery/report";

export const Route = createFileRoute(
  "/_authenticated/security-career-assessment/report/$snapshotId",
)({
  // Client-only: the report is owner-scoped and must not be prerendered,
  // and the Supabase session has to be restored before the read runs.
  ssr: false,
  head: () => ({
    meta: [
      { title: "Your Security Career report — CQrityjob" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: DiscoveryReportRoute,
});

function DiscoveryReportRoute() {
  const { snapshotId } = Route.useParams();
  const { t, lang } = useT();
  const load = useServerFn(getStoredDiscoveryReport);

  // useQuery rather than a hand-rolled effect: it retries a transient
  // auth-restoration failure instead of latching a permanent error state,
  // and it re-runs cleanly on refresh and on re-login.
  const query = useQuery({
    queryKey: ["discovery", "report", snapshotId],
    queryFn: () => load({ data: { snapshotId } }),
    retry: 1,
  });

  if (query.isPending) {
    return (
      <AssessmentLayout narrow>
        <p className="text-sm text-muted-foreground">{t("careerDiscovery.report.loading")}</p>
      </AssessmentLayout>
    );
  }

  if (query.isError || !query.data) {
    return (
      <ReportMessage
        title={t("careerDiscovery.report.error")}
        body={t("careerDiscovery.report.unreadable.body")}
        tone="error"
      />
    );
  }

  const data = query.data;

  if (data.status === "not_found") {
    return (
      <ReportMessage
        title={t("careerDiscovery.report.notFound.title")}
        body={t("careerDiscovery.report.notFound.body")}
      />
    );
  }

  if (data.status === "unreadable") {
    return (
      <ReportMessage
        title={t("careerDiscovery.report.unreadable.title")}
        body={t("careerDiscovery.report.unreadable.body")}
        detail={data.definitionVersion}
      />
    );
  }

  if (data.status === "v3.1") {
    return (
      <AssessmentLayout>
        <V31ReportView
          snapshot={data.snapshot}
          generatedAt={data.generatedAt}
          versions={data.versions}
        />
      </AssessmentLayout>
    );
  }

  const r = data.report as DiscoveryReport | null;
  if (!r) {
    return (
      <ReportMessage
        title={t("careerDiscovery.report.unreadable.title")}
        body={t("careerDiscovery.report.unreadable.body")}
      />
    );
  }

  const H = ({ n, children }: { n: number; children: React.ReactNode }) => (
    <h2 className="mt-16 text-xl font-semibold tracking-tight text-foreground md:text-2xl">
      <span className="mr-3 text-sm font-medium text-accent">{String(n).padStart(2, "0")}</span>
      {children}
    </h2>
  );

  return (
    <AssessmentLayout>
      <Link
        to="/security-career-assessment/history"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {t("careerDiscovery.report.backToHistory")}
      </Link>

      {/* 1 · Report header — what this is, when it was produced, and the
          standing caveat while the instrument is in internal test. */}
      <p className="mt-8 text-xs font-medium uppercase tracking-widest text-muted-foreground">
        {t("careerDiscovery.report.header.product")} ·{" "}
        {new Intl.DateTimeFormat(lang === "sv" ? "sv-SE" : "en-GB", {
          year: "numeric",
          month: "long",
          day: "numeric",
        }).format(new Date(data.generatedAt))}
      </p>
      <p
        role="note"
        className="mt-3 rounded-md border border-border bg-muted/40 p-4 text-sm leading-relaxed text-muted-foreground"
      >
        {t("careerDiscovery.report.header.internalTest")}
      </p>

      {/* 2 · DNA */}
      <h1
        className="mt-8 text-4xl font-semibold tracking-tight text-foreground md:text-5xl"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {t("careerDiscovery.report.dna.title")}
      </h1>
      <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
        {t("careerDiscovery.report.dna.lead")}
      </p>

      <ul className="mt-10 space-y-4">
        {r.dna.axes.map((a) => (
          <li key={a.axis} className="rounded-lg border border-border bg-background p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-base font-semibold text-foreground">{a.name[lang]}</h3>
              <span className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground">
                {a.contextDependent
                  ? t("careerDiscovery.report.axis.contextDependent")
                  : a.usable
                    ? t("careerDiscovery.report.axis.established")
                    : t("careerDiscovery.report.axis.emerging")}
              </span>
            </div>
            {a.usable && !a.contextDependent && a.position !== null && (
              <div className="mt-4">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{a.lowEnd[lang]}</span>
                  <span className="text-right">{a.highEnd[lang]}</span>
                </div>
                <div
                  className="mt-2 h-1.5 w-full rounded-full bg-muted"
                  role="img"
                  aria-label={`${a.name[lang]}: ${Math.round(a.position * 100)}%`}
                >
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${a.position * 100}%` }}
                  />
                </div>
              </div>
            )}
            {!a.usable && (
              <p className="mt-3 text-sm text-muted-foreground">
                {t("careerDiscovery.report.axis.emergingNote")}
              </p>
            )}
          </li>
        ))}
      </ul>

      {/* 2 · Summary */}
      <H n={2}>{t("careerDiscovery.report.summary.title")}</H>
      <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
        {r.summary.opening[lang]}
      </p>

      {/* 3 · Strengths */}
      <H n={3}>{t("careerDiscovery.report.strengths.title")}</H>
      <ul className="mt-4 space-y-3">
        {r.strengths.map((s) => (
          <li key={s.axis} className="rounded-md border border-border bg-background p-4">
            <p className="text-sm font-semibold text-foreground">{s.axisName[lang]}</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {s.statement[lang]}
            </p>
          </li>
        ))}
      </ul>

      {/* 4 · Top areas */}
      <H n={4}>{t("careerDiscovery.report.topAreas.title")}</H>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {r.topAreas.map((a, i) => (
          <div key={a.areaId} className="rounded-lg border border-border bg-background p-5">
            <span className="text-xs font-medium uppercase tracking-widest text-accent">
              {String(i + 1).padStart(2, "0")}
            </span>
            <h3 className="mt-3 text-base font-semibold text-foreground">{a.name[lang]}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{a.summary[lang]}</p>
            <p className="mt-3 text-xs text-muted-foreground">
              {t(`careerDiscovery.report.confidence.${a.confidence}` as never)}
            </p>
            {a.authorityDisclaimer && (
              <p className="mt-3 flex gap-2 rounded-md border border-border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
                {a.authorityDisclaimer[lang]}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* 5 · Why */}
      <H n={5}>{t("careerDiscovery.report.why.title")}</H>
      <div className="mt-4 space-y-6">
        {r.why.map((w) => (
          <div key={w.areaId} className="rounded-lg border border-border bg-background p-5">
            <h3 className="text-base font-semibold text-foreground">{w.areaName[lang]}</h3>
            <ul className="mt-3 space-y-2">
              {w.reasons.map((re) => (
                <li key={re.axis} className="text-sm leading-relaxed text-muted-foreground">
                  {re.statement[lang]}
                </li>
              ))}
            </ul>
            {w.unknowns.length > 0 && (
              <div className="mt-4 border-t border-border pt-3">
                <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                  {t("careerDiscovery.report.why.unknowns")}
                </p>
                <ul className="mt-2 space-y-1">
                  {w.unknowns.map((u) => (
                    <li key={u.axis} className="text-sm leading-relaxed text-muted-foreground">
                      {u.statement[lang]}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 6 · Adjacent */}
      <H n={6}>{t("careerDiscovery.report.adjacent.title")}</H>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {r.adjacentAreas.map((a) => (
          <div key={a.areaId} className="rounded-lg border border-border bg-background p-5">
            <h3 className="text-base font-semibold text-foreground">{a.name[lang]}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{a.summary[lang]}</p>
          </div>
        ))}
      </div>

      {/* 7 · Development */}
      <H n={7}>{t("careerDiscovery.report.development.title")}</H>
      <ul className="mt-4 space-y-3">
        {r.development.map((d) => (
          <li key={d.axis} className="rounded-md border border-border bg-background p-4">
            <p className="text-sm font-semibold text-foreground">{d.axisName[lang]}</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {d.statement[lang]}
            </p>
          </li>
        ))}
      </ul>

      {/* 8 · Next steps */}
      <H n={8}>{t("careerDiscovery.report.nextSteps.title")}</H>
      <ul className="mt-4 space-y-3">
        {r.nextSteps.map((s) => (
          <li
            key={s.en}
            className="rounded-md border border-border bg-background p-4 text-sm leading-relaxed text-foreground"
          >
            {s[lang]}
          </li>
        ))}
      </ul>

      {/* 9 · Method */}
      <H n={9}>{t("careerDiscovery.report.method.title")}</H>
      <ul className="mt-4 space-y-3">
        {r.method.statements.map((s) => (
          <li key={s.en} className="text-sm leading-relaxed text-muted-foreground">
            {s[lang]}
          </li>
        ))}
      </ul>
      <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border text-sm sm:grid-cols-4">
        {[
          [t("careerDiscovery.report.method.definition"), data.versions.definition],
          [t("careerDiscovery.report.method.content"), data.versions.content],
          [t("careerDiscovery.report.method.scoring"), data.versions.scoring],
          [t("careerDiscovery.report.method.taxonomy"), data.versions.taxonomy],
        ].map(([k, v]) => (
          <div key={String(k)} className="bg-background p-4">
            <dt className="text-xs uppercase tracking-widest text-muted-foreground">{k}</dt>
            <dd className="mt-1 font-mono text-xs text-foreground">{v}</dd>
          </div>
        ))}
      </dl>
      {/* Actions */}
      <div className="mt-16 flex flex-wrap gap-3 border-t border-border pt-8">
        <Link
          to="/my-career"
          className="inline-flex h-11 items-center justify-center rounded-md border border-border px-5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          {t("careerDiscovery.report.actions.myCareer")}
        </Link>
        <Link
          to="/security-career-assessment/history"
          className="inline-flex h-11 items-center justify-center rounded-md border border-border px-5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          {t("careerDiscovery.report.actions.allReports")}
        </Link>
      </div>
    </AssessmentLayout>
  );
}

/**
 * Every non-rendering outcome, stated plainly.
 *
 * Exists so a missing report, a foreign-owned report or a payload this build
 * cannot read is never surfaced as the router's generic "This page didn't
 * load". The candidate is always told what happened and where their other
 * reports are.
 *
 * "Not found" and "not yours" share this component deliberately: RLS returns
 * no row in both cases, and distinguishing them would confirm the existence
 * of another person's report.
 */
function ReportMessage({
  title,
  body,
  detail,
  tone = "info",
}: {
  title: string;
  body: string;
  detail?: string | null;
  tone?: "info" | "error";
}) {
  const { t } = useT();
  return (
    <AssessmentLayout narrow>
      <Link
        to="/security-career-assessment/history"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {t("careerDiscovery.report.backToHistory")}
      </Link>

      <div
        role={tone === "error" ? "alert" : "status"}
        data-report-state={tone}
        className="mt-8 rounded-lg border border-border bg-background p-6"
      >
        <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground">
          <AlertTriangle className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          {title}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{body}</p>
        {detail && <p className="mt-3 font-mono text-xs text-muted-foreground">{detail}</p>}
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          to="/my-career"
          className="inline-flex h-11 items-center justify-center rounded-md border border-border px-5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          {t("careerDiscovery.report.actions.myCareer")}
        </Link>
        <Link
          to="/security-career-assessment/history"
          className="inline-flex h-11 items-center justify-center rounded-md border border-border px-5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          {t("careerDiscovery.report.actions.allReports")}
        </Link>
      </div>
    </AssessmentLayout>
  );
}
