// The two My Career states that are not a v3.0 summary.
//
// ── WHY THESE EXIST AT ALL ─────────────────────────────────────────────
//
// v3.1 stores a different report contract from v3.0. Before this file existed,
// a v3.1 payload reached the v3.0 summary component, every field it read came
// back `undefined`, and the component's own `?? []` fallbacks absorbed it —
// producing a report page that looked almost empty and raised no error.
//
// A visible, honest state is strictly better than a silently thin one. A
// candidate who is told "your report is saved, the new presentation is coming"
// keeps their trust. A candidate shown three empty sections concludes the
// product is broken, and they are not wrong.
//
// ── TEMPORARY, AND ONLY THE V3.1 ONE ───────────────────────────────────
//
// DiscoveryV31Pending is replaced by the real v3.1 renderer in PR 4.
// DiscoveryReportUnreadable is permanent: an unknown definition version or a
// payload contradicting its own version column will always be possible, for
// instance during a rollback where the app is older than the report.
//
// Neither component reads INTO a payload. That is the point — they cannot
// misread a contract they never touch.

import { Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowRight, Compass, Sparkles } from "lucide-react";
import { useT } from "@/i18n/context";
import type {
  ActiveDiscoveryV31Report,
  ActiveUnreadableReport,
} from "@/lib/career-discovery/active-report.functions";

/**
 * A completed v3.1 report, before the v3.1 renderer exists.
 *
 * Shows that the report exists, when it was completed, and which version
 * produced it. Deliberately renders NO report content: reading v3.1 fields
 * with a half-built renderer is how partial, wrong-looking reports ship.
 */
export function DiscoveryV31Pending({ active }: { active: ActiveDiscoveryV31Report }) {
  const { t, lang } = useT();

  const date = new Intl.DateTimeFormat(lang === "sv" ? "sv-SE" : "en-GB", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(active.generatedAt));

  return (
    <div className="space-y-6">
      <div>
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-xs font-medium uppercase tracking-widest text-muted-foreground">
          <Compass className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
          {t("careerDiscovery.history.type.discovery")}
        </span>
        {/* No version string. See DiscoveryCareerSummary: it is kept as a
            data attribute for developer diagnostics and printed in the
            report's Method section, not beside a completion date. */}
        <p
          className="mt-3 text-xs text-muted-foreground"
          data-definition-version={active.definitionVersion}
        >
          {t("careerDiscovery.dashboard.v31Completed")} {date}
          {active.isInternalTest && ` · ${t("careerDiscovery.history.internalTest")}`}
        </p>
      </div>

      <div className="rounded-lg border border-border bg-background p-6">
        <h3 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground">
          <Sparkles className="h-4 w-4 text-accent" aria-hidden="true" />
          {t("careerDiscovery.dashboard.v31Title")}
        </h3>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {t("careerDiscovery.dashboard.v31Body")}
        </p>

        {/* The v3.1 renderer exists now, so the dashboard links straight to
            the report rather than telling the candidate to wait for it. */}
        <Link
          to="/security-career-assessment/report/$snapshotId"
          params={{ snapshotId: active.snapshotId }}
          className="mt-5 inline-flex h-10 items-center justify-center gap-1.5 rounded-md bg-accent px-4 text-xs font-medium text-accent-foreground transition-opacity hover:opacity-90"
        >
          {t("careerDiscovery.dashboard.v31Open")}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>

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

      <div className="flex flex-wrap gap-3 border-t border-border pt-6">
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

/**
 * A v3 report this build cannot render.
 *
 * Reached when the definition version is unknown to this build, or when the
 * stored payload contradicts its own version column. Says so plainly and
 * reassures the candidate their report is intact — because it is: nothing here
 * or anywhere else rewrites a stored snapshot.
 */
export function DiscoveryReportUnreadable({ active }: { active: ActiveUnreadableReport }) {
  const { t, lang } = useT();

  const date = new Intl.DateTimeFormat(lang === "sv" ? "sv-SE" : "en-GB", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(active.generatedAt));

  return (
    <div
      role="status"
      className="rounded-lg border border-border bg-background p-6"
      data-report-problem={active.problem}
    >
      <h3 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground">
        <AlertTriangle className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        {t("careerDiscovery.dashboard.unreadableTitle")}
      </h3>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        {t("careerDiscovery.dashboard.unreadableBody")}
      </p>
      {/* ── THE VERSION IS A DIAGNOSTIC, NOT AN EXPLANATION ─────────────
          This state means "this build cannot render your report". Printing
          the definition version at a candidate answered that with a string
          they cannot act on. The body above already says the thing that
          matters and is still true: the report itself is intact. The version
          moves to a data attribute, where support and the guard can read it
          and the holder does not have to. */}
      <p
        className="mt-4 text-xs text-muted-foreground"
        data-definition-version={active.definitionVersion ?? ""}
      >
        {date}
      </p>
      <Link
        to="/security-career-assessment/history"
        className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
      >
        {t("careerDiscovery.dashboard.allReports")}
        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </div>
  );
}
