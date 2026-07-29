// My Career summary for an active Security Career Discovery v3 report.
//
// ── IMMUTABILITY ───────────────────────────────────────────────────────
//
// EVERY value here comes from the stored snapshot. Nothing is recomputed
// from live questions, scoring, translations or the career-area catalogue,
// and no live module is imported for display text — the snapshot already
// carries its own bilingual strings, captured at completion.
//
// Where an older snapshot lacks a field, a safe generic label is shown
// rather than re-deriving the value. A dashboard must never quietly change
// what a stored report said.
//
// ── COMPACT, NOT A SECOND REPORT ───────────────────────────────────────
//
// This is a summary with links. The full report lives at its own route and
// is not duplicated here.
//
// ── NO LEGACY VOCABULARY ───────────────────────────────────────────────
//
// Toppyrke, Primär drivkraft, Konfidensnivå and profession names such as
// Skyddsvakt belong to v2.1 and never appear in this component.

import { Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowRight, Compass } from "lucide-react";
import { useT } from "@/i18n/context";
import type { ActiveDiscoveryReport } from "@/lib/career-discovery/active-report.functions";

export function DiscoveryCareerSummary({ active }: { active: ActiveDiscoveryReport }) {
  const { t, lang } = useT();
  const r = active.report;

  const date = new Intl.DateTimeFormat(lang === "sv" ? "sv-SE" : "en-GB", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(active.generatedAt));

  // A snapshot that predates a field is shown with a generic label rather
  // than recalculated.
  if (!r) {
    return (
      <div className="rounded-lg border border-border bg-background p-6">
        <p className="text-sm text-muted-foreground">
          {t("careerDiscovery.dashboard.snapshotUnreadable")}
        </p>
        <Link
          to="/security-career-assessment/report/$snapshotId"
          params={{ snapshotId: active.snapshotId }}
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
        >
          {t("careerDiscovery.dashboard.viewFullReport")}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>
    );
  }

  const topAreas = r.topAreas ?? [];
  const why = r.why ?? [];
  const strengths = r.strengths ?? [];
  const development = r.development ?? [];
  const nextSteps = r.nextSteps ?? [];
  // Compact DNA overview: the axes the report already judged strongest.
  const axes = (r.dna?.axes ?? []).filter((a) => a.usable).slice(0, 4);

  return (
    <div className="space-y-8">
      {/* A · Header */}
      <div>
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-xs font-medium uppercase tracking-widest text-muted-foreground">
          <Compass className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
          {t("careerDiscovery.history.type.discovery")}
        </span>
        <p className="mt-3 text-xs text-muted-foreground">
          {date} · <span className="font-mono">{active.definitionVersion}</span>
          {active.isInternalTest && ` · ${t("careerDiscovery.history.internalTest")}`}
        </p>
        {active.isInternalTest && (
          <p
            role="note"
            className="mt-4 flex gap-2 rounded-md border border-border bg-muted/40 p-4 text-xs leading-relaxed text-muted-foreground"
          >
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
            {t("careerDiscovery.dashboard.internalTestNote")}
          </p>
        )}
      </div>

      {/* B · Career direction */}
      {topAreas.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold tracking-tight text-foreground">
            {t("careerDiscovery.dashboard.directionTitle")}
          </h3>
          <ul className="mt-3 space-y-3">
            {topAreas.slice(0, 3).map((a, i) => {
              const reason = why.find((w) => w.areaId === a.areaId)?.reasons?.[0];
              return (
                <li key={a.areaId} className="rounded-md border border-border bg-background p-4">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs font-medium text-accent">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <p className="text-sm font-semibold text-foreground">{a.name?.[lang]}</p>
                  </div>
                  {a.summary?.[lang] && (
                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                      {a.summary[lang]}
                    </p>
                  )}
                  {reason?.statement?.[lang] && (
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                      {reason.statement[lang]}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* C + D · Career DNA / work-environment preferences.
          Both come from the same stored axes: each axis names its own two
          ends, so the preference reads directly off the report. */}
      {axes.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold tracking-tight text-foreground">
            {t("careerDiscovery.dashboard.dnaTitle")}
          </h3>
          <ul className="mt-3 space-y-3">
            {axes.map((a) => (
              <li key={a.axis} className="rounded-md border border-border bg-background p-4">
                <p className="text-sm font-medium text-foreground">{a.name?.[lang]}</p>
                <div className="mt-2 flex justify-between gap-4 text-[11px] leading-snug text-muted-foreground">
                  <span className="max-w-[45%]">{a.lowEnd?.[lang]}</span>
                  <span className="max-w-[45%] text-right">{a.highEnd?.[lang]}</span>
                </div>
                {a.position !== null && a.position !== undefined && !a.contextDependent && (
                  <div
                    className="mt-2 h-1.5 w-full rounded-full bg-muted"
                    role="img"
                    aria-label={`${a.name?.[lang]}: ${Math.round(a.position * 100)}%`}
                  >
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${a.position * 100}%` }}
                    />
                  </div>
                )}
                {a.contextDependent && (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    {t("careerDiscovery.report.axis.contextDependent")}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* E · Development direction */}
      {(strengths.length > 0 || development.length > 0 || nextSteps.length > 0) && (
        <section>
          <h3 className="text-sm font-semibold tracking-tight text-foreground">
            {t("careerDiscovery.dashboard.developmentTitle")}
          </h3>
          <ul className="mt-3 space-y-2">
            {strengths.slice(0, 2).map((s) => (
              <li key={`s-${s.axis}`} className="text-xs leading-relaxed text-muted-foreground">
                <span className="font-medium text-foreground">{s.axisName?.[lang]}</span>
                {" — "}
                {s.statement?.[lang]}
              </li>
            ))}
            {development.slice(0, 2).map((d) => (
              <li key={`d-${d.axis}`} className="text-xs leading-relaxed text-muted-foreground">
                {d.statement?.[lang]}
              </li>
            ))}
            {nextSteps.slice(0, 1).map((n) => (
              <li key="next" className="text-xs leading-relaxed text-foreground">
                {n?.[lang]}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* F · Actions */}
      <div className="flex flex-wrap gap-3 border-t border-border pt-6">
        <Link
          to="/security-career-assessment/report/$snapshotId"
          params={{ snapshotId: active.snapshotId }}
          className="inline-flex h-10 items-center justify-center rounded-md border border-border px-4 text-xs font-medium text-foreground transition-colors hover:bg-muted"
        >
          {t("careerDiscovery.dashboard.viewFullReport")}
        </Link>
        <Link
          to="/career-center"
          className="inline-flex h-10 items-center justify-center rounded-md border border-border px-4 text-xs font-medium text-foreground transition-colors hover:bg-muted"
        >
          {t("careerDiscovery.dashboard.exploreAreas")}
        </Link>
        <Link
          to="/security-career-assessment/history"
          className="inline-flex h-10 items-center justify-center rounded-md border border-border px-4 text-xs font-medium text-foreground transition-colors hover:bg-muted"
        >
          {t("careerDiscovery.dashboard.allReports")}
        </Link>
      </div>
    </div>
  );
}

/** Next-step card, derived from the stored v3 report.
 *
 *  Links to the general Security Career Center rather than inventing a
 *  profession match: the snapshot ranks AREAS, and there is no reviewed
 *  area→profession mapping to lean on yet. Naming a profession here would
 *  be unsupported certainty. */
export function DiscoveryNextStep({ active }: { active: ActiveDiscoveryReport }) {
  const { t, lang } = useT();
  const r = active.report;
  const top = r?.topAreas?.[0];
  const step = r?.nextSteps?.[0];

  return (
    <div>
      {top?.name?.[lang] && (
        <p className="text-sm font-semibold text-foreground">{top.name[lang]}</p>
      )}
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {step?.[lang] ?? t("careerDiscovery.dashboard.nextStepFallback")}
      </p>
      <Link
        to="/career-center"
        className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
      >
        {t("careerDiscovery.dashboard.exploreAreas")}
        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </div>
  );
}
