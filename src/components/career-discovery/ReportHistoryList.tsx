// Unified report history — Security Career Discovery v3 alongside legacy v2.1.
//
// ONE list, two report types, with an explicit discriminator. The candidate
// should not have to know that the product changed instruments; they should
// see their reports, newest first, each labelled with what produced it.
//
// ── IMMUTABILITY ───────────────────────────────────────────────────────
//
// Every row renders ONLY from data stored at completion: the type, the
// version string and the completion date. It deliberately does NOT render a
// career-area name, because area names live in versioned content that can
// change — a history row must not silently re-title itself when a
// translation or an area description is updated. The area names belong to
// the report, which is immutable, and that is where they are shown.
//
// ── SEPARATION ─────────────────────────────────────────────────────────
//
// Legacy rows link to /my-career/reports/$runId and are rendered from the
// runs the dashboard already loaded. v3 rows link to the canonical report
// route. Neither source is mutated, merged or converted — they are two
// independent histories presented in one chronological list.
//
// ── A FAILED READ IS NOT AN EMPTY HISTORY ──────────────────────────────
//
// When this component reads the v3 list itself, a failure used to be
// swallowed so that it would not hide the legacy rows, and the result was
// "Du har inga rapporter ännu" for somebody whose reports exist. The legacy
// rows are still shown, and the failure is now said, with a retry. The empty
// sentence is reserved for a read that answered and found nothing.
//
// ── THE "TEST VERSION" TAG IS DATA, NOT A DEFAULT ──────────────────────
//
// It used to be hard-coded onto every row. It is now the session's own
// is_internal_test flag, so it appears only on a report taken against an
// instrument version that really was an internal test.

import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, ClipboardCheck, Compass } from "lucide-react";
import { useT } from "@/i18n/context";
import { listMyDiscoveryReports } from "@/lib/career-discovery/discovery.functions";

/** A legacy run as the My Career dashboard already has it. */
export interface LegacyRunRow {
  id: string;
  completed_at?: string | null;
  started_at?: string | null;
}

type Row =
  | { kind: "discovery"; id: string; at: string; version: string; internalTest: boolean }
  | { kind: "legacy"; id: string; at: string };

/** A v3 report as the caller already holds it. */
export interface DiscoveryReportRow {
  snapshotId: string;
  generatedAt: string;
  definitionVersion: string;
  /** The session's own marker. Absent is "not marked", never "marked". */
  isInternalTest?: boolean;
}

export function ReportHistoryList({
  legacyRuns,
  /** The v3 rows, when the caller has already read them — the career home
   *  reads the list to decide whether to render this at all, and has
   *  already removed the CURRENT report. Given, the component does not
   *  fetch a second time and cannot re-add what the caller excluded. */
  discoveryReports,
}: {
  legacyRuns: LegacyRunRow[];
  discoveryReports?: readonly DiscoveryReportRow[];
}) {
  const { t, lang } = useT();
  const load = useServerFn(listMyDiscoveryReports);
  const [discovery, setDiscovery] = useState<Row[]>(() =>
    discoveryReports
      ? discoveryReports.map((r) => ({
          kind: "discovery" as const,
          id: r.snapshotId,
          at: r.generatedAt,
          version: r.definitionVersion,
          internalTest: r.isInternalTest === true,
        }))
      : [],
  );
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    discoveryReports ? "ready" : "loading",
  );
  // Bumped by the retry button; the effect re-reads when it changes.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (discoveryReports) return;
    let alive = true;
    load({})
      .then((d) => {
        if (!alive) return;
        setDiscovery(
          d.reports.map((r) => ({
            kind: "discovery" as const,
            id: r.snapshotId,
            at: r.generatedAt,
            version: r.definitionVersion,
            // The session's own flag: true only for a run taken against an
            // internal_test instrument version.
            internalTest: r.isInternalTest,
          })),
        );
        setStatus("ready");
      })
      // The legacy rows below still render. What this must not do is let a
      // failed read look like a history with nothing in it.
      .catch(() => alive && setStatus("error"));
    return () => {
      alive = false;
    };
  }, [load, discoveryReports, attempt]);

  const rows: Row[] = [
    ...discovery,
    ...legacyRuns.map((r) => ({
      kind: "legacy" as const,
      id: r.id,
      at: r.completed_at ?? r.started_at ?? "",
    })),
  ]
    .filter((r) => r.at)
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  const fmt = new Intl.DateTimeFormat(lang === "sv" ? "sv-SE" : "en-GB", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  if (status === "ready" && rows.length === 0) {
    return (
      <p className="py-3 text-sm text-muted-foreground">{t("careerDiscovery.history.empty")}</p>
    );
  }

  return (
    <>
      {status === "error" && (
        <div
          role="alert"
          data-history-read-failed
          className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 text-sm text-muted-foreground"
        >
          <p>{t("careerDiscovery.history.error")}</p>
          <button
            type="button"
            onClick={() => {
              setStatus("loading");
              setAttempt((n) => n + 1);
            }}
            className="inline-flex min-h-11 items-center text-sm font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t("careerDiscovery.history.retry")}
          </button>
        </div>
      )}
      <ul className="divide-y divide-border">
        {rows.map((row) => (
          <li
            key={`${row.kind}-${row.id}`}
            className="flex items-center justify-between gap-3 py-3"
          >
            <div className="flex min-w-0 items-start gap-3">
              {row.kind === "discovery" ? (
                <Compass className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent" aria-hidden="true" />
              ) : (
                <ClipboardCheck
                  className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {row.kind === "discovery"
                    ? t("careerDiscovery.history.type.discovery")
                    : t("careerDiscovery.history.type.legacy")}
                </p>
                {/* Date and internal-test marker only. The definition version
                  used to sit between them in a monospace face, which made a
                  list of the candidate's own reports read like a build log.
                  It is kept as a data attribute for diagnostics. */}
                <p
                  className="mt-0.5 text-xs text-muted-foreground"
                  data-definition-version={row.kind === "discovery" ? row.version : undefined}
                >
                  {fmt.format(new Date(row.at))}
                  {row.kind === "discovery" &&
                    row.internalTest &&
                    ` · ${t("careerDiscovery.history.internalTest")}`}
                </p>
              </div>
            </div>

            {row.kind === "discovery" ? (
              <Link
                to="/security-career-assessment/report/$snapshotId"
                params={{ snapshotId: row.id }}
                className="inline-flex min-h-11 flex-shrink-0 items-center gap-1 text-xs font-medium text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {t("careerDiscovery.history.open")}
                <ArrowRight className="h-3 w-3" aria-hidden="true" />
              </Link>
            ) : (
              <Link
                to="/my-career/reports/$runId"
                params={{ runId: row.id }}
                className="inline-flex min-h-11 flex-shrink-0 items-center gap-1 text-xs font-medium text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {t("careerDiscovery.history.open")}
                <ArrowRight className="h-3 w-3" aria-hidden="true" />
              </Link>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
